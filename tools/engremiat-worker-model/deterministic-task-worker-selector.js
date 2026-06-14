'use strict';

const { validateModel } = require("./validate-canonical-model");

const STATUS_SCORE = Object.freeze({ AVAILABLE: 100, BUSY: 40, OFFLINE: 0, DISABLED: 0 });
const TYPE_PRIORITY = Object.freeze({ HUMAN: 10, LOCAL_SCRIPT: 20, OLLAMA: 30, CLINE: 40, REMOTE_NODE: 50 });
const MODE_RISK = Object.freeze({ READ_ONLY: 10, LOCAL_WRITE: 20, CONTROLLED_EXECUTION: 30, REMOTE_EXECUTION: 40 });

function fail(code,message,details={}) { return { ok:false,decision:"NO_GO",code,message,details }; }
function capabilityCoverage(worker,task) { return task.required_capabilities.every(capability => worker.capabilities.includes(capability)); }
function preferredMode(worker,requestedMode) {
  if (requestedMode && worker.execution_modes.includes(requestedMode)) return requestedMode;
  return [...worker.execution_modes].sort((a,b) => MODE_RISK[a]-MODE_RISK[b] || a.localeCompare(b))[0] || null;
}

function scoreWorker(worker,task,options={}) {
  const requestedMode = options.requested_mode || null;
  const loadByWorker = options.load_by_worker || {};
  const preferredWorkerIds = Array.isArray(options.preferred_worker_ids) ? options.preferred_worker_ids : [];
  const mode = preferredMode(worker,requestedMode);
  const load = Number.isFinite(loadByWorker[worker.worker_id]) ? loadByWorker[worker.worker_id] : 0;
  const eligibleDeclared = task.eligible_worker_ids.includes(worker.worker_id);
  const preferred = preferredWorkerIds.includes(worker.worker_id);
  const modeExact = requestedMode ? worker.execution_modes.includes(requestedMode) : true;
  const score = STATUS_SCORE[worker.status] + (eligibleDeclared ? 50 : 0) + (preferred ? 25 : 0) + (modeExact ? 20 : 0) - load * 5 - (mode ? MODE_RISK[mode] : 100);
  return { worker_id:worker.worker_id,worker_type:worker.worker_type,status:worker.status,selected_mode:mode,load,eligible_declared:eligibleDeclared,preferred,mode_exact:modeExact,score };
}

function selectWorker(model,taskId,options={}) {
  const validation = validateModel(model);
  if (!validation.valid) return fail("MODEL_INVALID","Model must be valid before worker selection.",{ errors:validation.errors });
  const task = model.tasks.find(item => item.task_id === taskId);
  if (!task) return fail("TASK_NOT_FOUND",`Task ${taskId} does not exist.`);
  if (["COMPLETED"].includes(task.status)) return fail("TASK_TERMINAL","Completed tasks cannot receive a worker.");
  if (["RUNNING","TERMINAL_SUCCESS","TERMINAL_ERROR","CANCELLED"].includes(task.execution_state)) return fail("EXECUTION_STATE_NOT_SELECTABLE",`Execution state ${task.execution_state} does not allow worker selection.`);
  if (!["AUTHORIZED","NOT_REQUIRED"].includes(task.authorization_state)) return fail("AUTHORIZATION_REQUIRED","Worker selection requires AUTHORIZED or NOT_REQUIRED.");
  const requestedMode = options.requested_mode || null;
  const candidates = model.workers.filter(worker => {
    if (worker.status !== "AVAILABLE") return false;
    if (!capabilityCoverage(worker,task)) return false;
    if (requestedMode && !worker.execution_modes.includes(requestedMode)) return false;
    if (options.require_declared_eligibility !== false && !task.eligible_worker_ids.includes(worker.worker_id)) return false;
    return true;
  }).map(worker => scoreWorker(worker,task,options)).sort((a,b) => b.score-a.score || a.load-b.load || TYPE_PRIORITY[a.worker_type]-TYPE_PRIORITY[b.worker_type] || a.worker_id.localeCompare(b.worker_id));
  if (candidates.length === 0) return fail("NO_ELIGIBLE_WORKER","No available worker satisfies capability, mode, authorization, and eligibility constraints.",{ task_id:taskId,requested_mode:requestedMode });
  const selected = candidates[0];
  return { ok:true,decision:"SELECT",task_id:taskId,worker_id:selected.worker_id,worker_type:selected.worker_type,execution_mode:selected.selected_mode,score:selected.score,reason:"HIGHEST_DETERMINISTIC_SCORE",candidate_count:candidates.length,candidates };
}

module.exports = { selectWorker,scoreWorker,capabilityCoverage,STATUS_SCORE,TYPE_PRIORITY,MODE_RISK };
