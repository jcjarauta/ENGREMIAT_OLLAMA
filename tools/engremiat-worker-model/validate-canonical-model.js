'use strict';

const fs = require("fs");
const path = require("path");

const PROJECT_STATUSES = new Set(["DRAFT","ACTIVE","ON_HOLD","COMPLETED","ARCHIVED"]);
const TASK_STATUSES = new Set(["BACKLOG","READY","IN_PROGRESS","REVIEW","COMPLETED","BLOCKED"]);
const AUTHORIZATION_STATES = new Set(["NOT_REQUIRED","PENDING_HUMAN_AUTHORIZATION","AUTHORIZED","REJECTED","EXPIRED"]);
const EXECUTION_STATES = new Set(["NOT_STARTED","QUEUED","RUNNING","TERMINAL_SUCCESS","TERMINAL_ERROR","CANCELLED"]);
const WORKER_TYPES = new Set(["HUMAN","CLINE","OLLAMA","LOCAL_SCRIPT","REMOTE_NODE"]);
const WORKER_STATUSES = new Set(["AVAILABLE","BUSY","OFFLINE","DISABLED"]);
const EXECUTION_MODES = new Set(["READ_ONLY","LOCAL_WRITE","CONTROLLED_EXECUTION","REMOTE_EXECUTION"]);

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function nonEmptyString(value) { return typeof value === "string" && value.trim().length > 0; }
function uniqueStrings(value) { return Array.isArray(value) && value.every(nonEmptyString) && new Set(value).size === value.length; }
function push(errors, code, message, location) { errors.push({ code, message, location }); }

function validateModel(model) {
  const errors = [];
  if (!isObject(model)) return { valid: false, errors: [{ code: "MODEL_NOT_OBJECT", message: "The root value must be an object.", location: "$" }] };
  if (model.schema_version !== "1.0") push(errors, "INVALID_SCHEMA_VERSION", "schema_version must equal 1.0.", "$.schema_version");
  if (!Array.isArray(model.projects)) push(errors, "PROJECTS_NOT_ARRAY", "projects must be an array.", "$.projects");
  if (!Array.isArray(model.tasks)) push(errors, "TASKS_NOT_ARRAY", "tasks must be an array.", "$.tasks");
  if (!Array.isArray(model.workers)) push(errors, "WORKERS_NOT_ARRAY", "workers must be an array.", "$.workers");
  if (errors.length) return { valid: false, errors };

  const projectIds = new Set();
  const taskIds = new Set();
  const workerIds = new Set();

  model.projects.forEach((project, index) => {
    const at = `$.projects[${index}]`;
    if (!isObject(project)) { push(errors, "PROJECT_NOT_OBJECT", "Project must be an object.", at); return; }
    if (!nonEmptyString(project.project_id)) push(errors, "PROJECT_ID_REQUIRED", "project_id is required.", `${at}.project_id`);
    else if (projectIds.has(project.project_id)) push(errors, "DUPLICATE_PROJECT_ID", "project_id must be unique.", `${at}.project_id`);
    else projectIds.add(project.project_id);
    if (!nonEmptyString(project.title)) push(errors, "PROJECT_TITLE_REQUIRED", "title is required.", `${at}.title`);
    if (!PROJECT_STATUSES.has(project.status)) push(errors, "INVALID_PROJECT_STATUS", "Invalid project status.", `${at}.status`);
    if (!nonEmptyString(project.objective)) push(errors, "PROJECT_OBJECTIVE_REQUIRED", "objective is required.", `${at}.objective`);
    if (!uniqueStrings(project.task_ids)) push(errors, "INVALID_PROJECT_TASK_IDS", "task_ids must contain unique non-empty strings.", `${at}.task_ids`);
  });

  model.workers.forEach((worker, index) => {
    const at = `$.workers[${index}]`;
    if (!isObject(worker)) { push(errors, "WORKER_NOT_OBJECT", "Worker must be an object.", at); return; }
    if (!nonEmptyString(worker.worker_id)) push(errors, "WORKER_ID_REQUIRED", "worker_id is required.", `${at}.worker_id`);
    else if (workerIds.has(worker.worker_id)) push(errors, "DUPLICATE_WORKER_ID", "worker_id must be unique.", `${at}.worker_id`);
    else workerIds.add(worker.worker_id);
    if (!WORKER_TYPES.has(worker.worker_type)) push(errors, "INVALID_WORKER_TYPE", "Invalid worker type.", `${at}.worker_type`);
    if (!WORKER_STATUSES.has(worker.status)) push(errors, "INVALID_WORKER_STATUS", "Invalid worker status.", `${at}.status`);
    if (!uniqueStrings(worker.capabilities)) push(errors, "INVALID_WORKER_CAPABILITIES", "capabilities must contain unique non-empty strings.", `${at}.capabilities`);
    if (!Array.isArray(worker.execution_modes) || !worker.execution_modes.every(mode => EXECUTION_MODES.has(mode)) || new Set(worker.execution_modes).size !== worker.execution_modes.length) push(errors, "INVALID_EXECUTION_MODES", "execution_modes contains invalid or duplicate values.", `${at}.execution_modes`);
  });

  model.tasks.forEach((task, index) => {
    const at = `$.tasks[${index}]`;
    if (!isObject(task)) { push(errors, "TASK_NOT_OBJECT", "Task must be an object.", at); return; }
    if (!nonEmptyString(task.task_id)) push(errors, "TASK_ID_REQUIRED", "task_id is required.", `${at}.task_id`);
    else if (taskIds.has(task.task_id)) push(errors, "DUPLICATE_TASK_ID", "task_id must be unique.", `${at}.task_id`);
    else taskIds.add(task.task_id);
    if (!nonEmptyString(task.project_id)) push(errors, "TASK_PROJECT_ID_REQUIRED", "project_id is required.", `${at}.project_id`);
    if (!nonEmptyString(task.title)) push(errors, "TASK_TITLE_REQUIRED", "title is required.", `${at}.title`);
    if (!TASK_STATUSES.has(task.status)) push(errors, "INVALID_TASK_STATUS", "Invalid task status.", `${at}.status`);
    if (!uniqueStrings(task.required_capabilities)) push(errors, "INVALID_REQUIRED_CAPABILITIES", "required_capabilities must contain unique non-empty strings.", `${at}.required_capabilities`);
    if (!uniqueStrings(task.eligible_worker_ids)) push(errors, "INVALID_ELIGIBLE_WORKERS", "eligible_worker_ids must contain unique non-empty strings.", `${at}.eligible_worker_ids`);
    if (!AUTHORIZATION_STATES.has(task.authorization_state)) push(errors, "INVALID_AUTHORIZATION_STATE", "Invalid authorization state.", `${at}.authorization_state`);
    if (!EXECUTION_STATES.has(task.execution_state)) push(errors, "INVALID_EXECUTION_STATE", "Invalid execution state.", `${at}.execution_state`);
  });

  const workersById = new Map(model.workers.filter(isObject).map(worker => [worker.worker_id, worker]));
  const tasksById = new Map(model.tasks.filter(isObject).map(task => [task.task_id, task]));

  model.tasks.forEach((task, index) => {
    if (!isObject(task)) return;
    const at = `$.tasks[${index}]`;
    if (!projectIds.has(task.project_id)) push(errors, "TASK_PROJECT_NOT_FOUND", `Project ${task.project_id} does not exist.`, `${at}.project_id`);
    for (const workerId of Array.isArray(task.eligible_worker_ids) ? task.eligible_worker_ids : []) {
      const worker = workersById.get(workerId);
      if (!worker) { push(errors, "ELIGIBLE_WORKER_NOT_FOUND", `Worker ${workerId} does not exist.`, `${at}.eligible_worker_ids`); continue; }
      for (const capability of Array.isArray(task.required_capabilities) ? task.required_capabilities : []) {
        if (!Array.isArray(worker.capabilities) || !worker.capabilities.includes(capability)) push(errors, "WORKER_CAPABILITY_MISSING", `Worker ${workerId} lacks capability ${capability}.`, `${at}.eligible_worker_ids`);
      }
    }
    if (task.execution_state !== "NOT_STARTED" && !["AUTHORIZED","NOT_REQUIRED"].includes(task.authorization_state)) push(errors, "EXECUTION_WITHOUT_AUTHORIZATION", "Execution requires AUTHORIZED or NOT_REQUIRED.", `${at}.authorization_state`);
    if (["TERMINAL_SUCCESS","TERMINAL_ERROR","CANCELLED"].includes(task.execution_state) && task.status === "IN_PROGRESS") push(errors, "TERMINAL_TASK_STILL_IN_PROGRESS", "A terminal execution cannot keep task status IN_PROGRESS.", at);
  });

  model.projects.forEach((project, index) => {
    if (!isObject(project)) return;
    const at = `$.projects[${index}].task_ids`;
    for (const taskId of Array.isArray(project.task_ids) ? project.task_ids : []) {
      const task = tasksById.get(taskId);
      if (!task) push(errors, "PROJECT_TASK_NOT_FOUND", `Task ${taskId} does not exist.`, at);
      else if (task.project_id !== project.project_id) push(errors, "PROJECT_TASK_OWNER_MISMATCH", `Task ${taskId} belongs to another project.`, at);
    }
  });

  return { valid: errors.length === 0, errors, counts: { projects: model.projects.length, tasks: model.tasks.length, workers: model.workers.length } };
}

function main(argv) {
  const inputArg = argv[2];
  const outputArg = argv[3];
  if (!inputArg) { console.error("Usage: node validate-canonical-model.js <input.json> [output.json]"); return 2; }
  const inputPath = path.resolve(inputArg);
  let model;
  try { model = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "")); }
  catch (error) {
    const result = { valid: false, input: inputPath, errors: [{ code: "JSON_PARSE_ERROR", message: error.message, location: "$" }] };
    if (outputArg) fs.writeFileSync(path.resolve(outputArg), JSON.stringify(result, null, 2) + "\n", "utf8");
    else console.log(JSON.stringify(result, null, 2));
    return 1;
  }
  const result = { ...validateModel(model), input: inputPath, validator: "PTW-VALIDATOR-001", validated_at: new Date().toISOString() };
  if (outputArg) fs.writeFileSync(path.resolve(outputArg), JSON.stringify(result, null, 2) + "\n", "utf8");
  else console.log(JSON.stringify(result, null, 2));
  return result.valid ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv);
module.exports = { validateModel };
