'use strict';

const { validateModel } = require("./validate-canonical-model");

const TASK_TRANSITIONS = Object.freeze({
  BACKLOG: ["READY","BLOCKED"],
  READY: ["IN_PROGRESS","BLOCKED"],
  IN_PROGRESS: ["REVIEW","BLOCKED"],
  REVIEW: ["IN_PROGRESS","COMPLETED","BLOCKED"],
  BLOCKED: ["BACKLOG","READY"],
  COMPLETED: []
});

const EXECUTION_TRANSITIONS = Object.freeze({
  NOT_STARTED: ["QUEUED","CANCELLED"],
  QUEUED: ["RUNNING","CANCELLED","TERMINAL_ERROR"],
  RUNNING: ["TERMINAL_SUCCESS","TERMINAL_ERROR","CANCELLED"],
  TERMINAL_SUCCESS: [],
  TERMINAL_ERROR: [],
  CANCELLED: []
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fail(code, message, details = {}) { return { ok:false, code, message, details }; }
function pass(model, event, details = {}) { return { ok:true, model, event, details }; }
function findTask(model, taskId) { return model.tasks.find(task => task.task_id === taskId); }
function findWorker(model, workerId) { return model.workers.find(worker => worker.worker_id === workerId); }
function covers(worker, task) { return task.required_capabilities.every(capability => worker.capabilities.includes(capability)); }

function validateBefore(model) {
  const result = validateModel(model);
  return result.valid ? null : fail("MODEL_INVALID_BEFORE_TRANSITION","Model is invalid before transition.",{ errors:result.errors });
}

function validateAfter(model) {
  const result = validateModel(model);
  return result.valid ? null : fail("MODEL_INVALID_AFTER_TRANSITION","Transition produced an invalid model.",{ errors:result.errors });
}

function transitionTaskStatus(model, taskId, targetStatus, actor = "SYSTEM") {
  const beforeError = validateBefore(model);
  if (beforeError) return beforeError;
  const next = clone(model);
  const task = findTask(next,taskId);
  if (!task) return fail("TASK_NOT_FOUND",`Task ${taskId} does not exist.`);
  const allowed = TASK_TRANSITIONS[task.status] || [];
  if (!allowed.includes(targetStatus)) return fail("TASK_TRANSITION_NOT_ALLOWED",`${task.status} -> ${targetStatus} is not allowed.`,{ from:task.status,to:targetStatus });
  if (targetStatus === "IN_PROGRESS") {
    if (!["AUTHORIZED","NOT_REQUIRED"].includes(task.authorization_state)) return fail("TASK_AUTHORIZATION_REQUIRED","Task requires authorization before entering IN_PROGRESS.");
    if (!["QUEUED","RUNNING"].includes(task.execution_state)) return fail("TASK_EXECUTION_NOT_ACTIVE","Task may enter IN_PROGRESS only when execution is QUEUED or RUNNING.");
  }
  if (targetStatus === "REVIEW" && task.execution_state !== "TERMINAL_SUCCESS") return fail("REVIEW_REQUIRES_TERMINAL_SUCCESS","Task may enter REVIEW only after TERMINAL_SUCCESS.");
  if (targetStatus === "COMPLETED" && task.execution_state !== "TERMINAL_SUCCESS") return fail("COMPLETION_REQUIRES_TERMINAL_SUCCESS","Task may complete only after TERMINAL_SUCCESS.");
  const from = task.status;
  task.status = targetStatus;
  const afterError = validateAfter(next);
  if (afterError) return afterError;
  return pass(next,{ type:"TASK_STATUS_TRANSITION",task_id:taskId,from,to:targetStatus,actor });
}

function transitionExecutionState(model, taskId, targetState, actor = "SYSTEM") {
  const beforeError = validateBefore(model);
  if (beforeError) return beforeError;
  const next = clone(model);
  const task = findTask(next,taskId);
  if (!task) return fail("TASK_NOT_FOUND",`Task ${taskId} does not exist.`);
  const allowed = EXECUTION_TRANSITIONS[task.execution_state] || [];
  if (!allowed.includes(targetState)) return fail("EXECUTION_TRANSITION_NOT_ALLOWED",`${task.execution_state} -> ${targetState} is not allowed.`,{ from:task.execution_state,to:targetState });
  if (["QUEUED","RUNNING"].includes(targetState) && !["AUTHORIZED","NOT_REQUIRED"].includes(task.authorization_state)) return fail("EXECUTION_AUTHORIZATION_REQUIRED","Execution requires AUTHORIZED or NOT_REQUIRED.");
  if (targetState === "QUEUED" && task.eligible_worker_ids.length === 0) return fail("NO_ELIGIBLE_WORKER","Task has no eligible workers.");
  if (targetState === "RUNNING" && task.status !== "IN_PROGRESS") return fail("RUNNING_REQUIRES_IN_PROGRESS","Execution may run only while task status is IN_PROGRESS.");
  const executionFrom = task.execution_state;
  const taskStatusFrom = task.status;
  task.execution_state = targetState;
  let automaticTaskTransition = null;
  if (targetState === "TERMINAL_SUCCESS") {
    if (task.status !== "IN_PROGRESS") return fail("TERMINAL_SUCCESS_REQUIRES_IN_PROGRESS","Successful execution may terminate only from an IN_PROGRESS task.");
    task.status = "REVIEW";
    automaticTaskTransition = { from:taskStatusFrom,to:"REVIEW" };
  } else if (["TERMINAL_ERROR","CANCELLED"].includes(targetState)) {
    if (task.status !== "COMPLETED") {
      task.status = "BLOCKED";
      automaticTaskTransition = { from:taskStatusFrom,to:"BLOCKED" };
    }
  }
  const afterError = validateAfter(next);
  if (afterError) return afterError;
  return pass(next,{ type:"EXECUTION_STATE_TRANSITION",task_id:taskId,from:executionFrom,to:targetState,actor,automatic_task_transition:automaticTaskTransition });
}

function setAuthorization(model, taskId, targetAuthorization, actor = "HUMAN") {
  const beforeError = validateBefore(model);
  if (beforeError) return beforeError;
  const next = clone(model);
  const task = findTask(next,taskId);
  if (!task) return fail("TASK_NOT_FOUND",`Task ${taskId} does not exist.`);
  const allowed = ["PENDING_HUMAN_AUTHORIZATION","AUTHORIZED","REJECTED","EXPIRED","NOT_REQUIRED"];
  if (!allowed.includes(targetAuthorization)) return fail("AUTHORIZATION_STATE_INVALID",`Invalid authorization state ${targetAuthorization}.`);
  if (["QUEUED","RUNNING"].includes(task.execution_state) && !["AUTHORIZED","NOT_REQUIRED"].includes(targetAuthorization)) return fail("CANNOT_REVOKE_ACTIVE_EXECUTION","Authorization cannot be revoked while execution is active.");
  const from = task.authorization_state;
  task.authorization_state = targetAuthorization;
  const afterError = validateAfter(next);
  if (afterError) return afterError;
  return pass(next,{ type:"AUTHORIZATION_TRANSITION",task_id:taskId,from,to:targetAuthorization,actor });
}

function assignWorker(model, taskId, workerId, actor = "SYSTEM") {
  const beforeError = validateBefore(model);
  if (beforeError) return beforeError;
  const next = clone(model);
  const task = findTask(next,taskId);
  const worker = findWorker(next,workerId);
  if (!task) return fail("TASK_NOT_FOUND",`Task ${taskId} does not exist.`);
  if (!worker) return fail("WORKER_NOT_FOUND",`Worker ${workerId} does not exist.`);
  if (worker.status !== "AVAILABLE") return fail("WORKER_NOT_AVAILABLE",`Worker ${workerId} is not available.`);
  if (!covers(worker,task)) return fail("WORKER_CAPABILITY_MISMATCH",`Worker ${workerId} does not cover all required capabilities.`);
  if (!task.eligible_worker_ids.includes(workerId)) task.eligible_worker_ids.push(workerId);
  const afterError = validateAfter(next);
  if (afterError) return afterError;
  return pass(next,{ type:"WORKER_ASSIGNED",task_id:taskId,worker_id:workerId,actor });
}

module.exports = { TASK_TRANSITIONS,EXECUTION_TRANSITIONS,transitionTaskStatus,transitionExecutionState,setAuthorization,assignWorker };
