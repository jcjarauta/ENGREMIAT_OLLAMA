'use strict';

const { validateModel } = require("./validate-canonical-model");
const { selectWorker } = require("./deterministic-task-worker-selector");
const { assignWorker, transitionExecutionState } = require("./canonical-state-transition-engine");

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fail(code,message,details={}) { return { ok:false,decision:"NO_GO",code,message,details,runtime_execution:false }; }

function buildAssignmentPlan(model,taskId,options={}) {
  const validation = validateModel(model);
  if (!validation.valid) return fail("MODEL_INVALID","Model must be valid before planning.",{ errors:validation.errors });
  const task = model.tasks.find(item => item.task_id === taskId);
  if (!task) return fail("TASK_NOT_FOUND",`Task ${taskId} does not exist.`);
  if (task.status !== "READY") return fail("TASK_NOT_READY",`Task status ${task.status} cannot be planned; READY is required.`);
  if (task.execution_state !== "NOT_STARTED") return fail("EXECUTION_ALREADY_PLANNED",`Execution state ${task.execution_state} is not plannable.`);
  if (!["AUTHORIZED","NOT_REQUIRED"].includes(task.authorization_state)) return fail("AUTHORIZATION_REQUIRED","Assignment planning requires AUTHORIZED or NOT_REQUIRED.");

  const selection = selectWorker(model,taskId,options);
  if (!selection.ok) return fail(selection.code,selection.message,{ selection });

  const before = clone(model);
  const assignment = assignWorker(model,taskId,selection.worker_id,options.actor || "ASSIGNMENT_PLANNER");
  if (!assignment.ok) return fail("WORKER_ASSIGNMENT_FAILED","Selected worker could not be assigned.",{ assignment,selection });

  const queued = transitionExecutionState(assignment.model,taskId,"QUEUED",options.actor || "ASSIGNMENT_PLANNER");
  if (!queued.ok) return fail("QUEUE_TRANSITION_FAILED","Assigned task could not transition to QUEUED.",{ queued,selection });

  const plannedTask = queued.model.tasks.find(item => item.task_id === taskId);
  return {
    ok:true,
    decision:"PLAN_READY",
    planner_id:"PTW-ASSIGNMENT-PLANNER-001",
    task_id:taskId,
    project_id:plannedTask.project_id,
    selected_worker_id:selection.worker_id,
    selected_worker_type:selection.worker_type,
    selected_execution_mode:selection.execution_mode,
    selection_score:selection.score,
    candidate_count:selection.candidate_count,
    authorization_state:plannedTask.authorization_state,
    task_status:plannedTask.status,
    execution_state:plannedTask.execution_state,
    runtime_execution:false,
    worker_started:false,
    external_network:false,
    before_model:before,
    planned_model:queued.model,
    events:[assignment.event,queued.event],
    next_required_action:"SEPARATE_EXECUTION_GATE"
  };
}

module.exports = { buildAssignmentPlan };
