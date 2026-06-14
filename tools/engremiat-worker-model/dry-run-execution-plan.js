'use strict';

const crypto = require("crypto");
const { validateModel } = require("./validate-canonical-model");
const { buildAssignmentPlan } = require("./pure-local-assignment-planner");

const ALLOWED_RISKS = new Set(["READ_ONLY","LOCAL_REVERSIBLE_WRITE","CONTROLLED_EXECUTION"]);
const ALLOWED_OPERATIONS = new Set(["VALIDATE","READ","ANALYZE","GENERATE_LOCAL_ARTIFACT","EXECUTE_LOCAL_COMMAND"]);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out,key) => { out[key] = stable(value[key]); return out; },{});
  return value;
}
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase(); }
function fail(code,message,details={}) { return { ok:false,decision:"NO_GO",code,message,details,runtime_execution:false,worker_started:false }; }
function nonEmptyString(value) { return typeof value === "string" && value.trim().length > 0; }
function uniqueStrings(value) { return Array.isArray(value) && value.every(nonEmptyString) && new Set(value).size === value.length; }

function validateExecutionSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return [{code:"SPEC_NOT_OBJECT",field:"$"}];
  if (!nonEmptyString(spec.operation_id)) errors.push({code:"OPERATION_ID_REQUIRED",field:"operation_id"});
  if (!ALLOWED_OPERATIONS.has(spec.operation)) errors.push({code:"OPERATION_NOT_ALLOWED",field:"operation"});
  if (!ALLOWED_RISKS.has(spec.risk)) errors.push({code:"RISK_NOT_ALLOWED",field:"risk"});
  if (!uniqueStrings(spec.inputs) || spec.inputs.length === 0) errors.push({code:"INPUTS_REQUIRED",field:"inputs"});
  if (!uniqueStrings(spec.outputs) || spec.outputs.length === 0) errors.push({code:"OUTPUTS_REQUIRED",field:"outputs"});
  if (!uniqueStrings(spec.validation) || spec.validation.length === 0) errors.push({code:"VALIDATION_REQUIRED",field:"validation"});
  if (!uniqueStrings(spec.evidence) || spec.evidence.length === 0) errors.push({code:"EVIDENCE_REQUIRED",field:"evidence"});
  if (!nonEmptyString(spec.rollback)) errors.push({code:"ROLLBACK_REQUIRED",field:"rollback"});
  if (!Number.isInteger(spec.timeout_seconds) || spec.timeout_seconds < 1 || spec.timeout_seconds > 3600) errors.push({code:"INVALID_TIMEOUT",field:"timeout_seconds"});
  if (spec.operation === "EXECUTE_LOCAL_COMMAND" && spec.risk === "READ_ONLY") errors.push({code:"EXECUTION_RISK_MISMATCH",field:"risk"});
  return errors;
}

function buildDryRunExecutionPlan(model,taskId,spec,options={}) {
  const modelValidation = validateModel(model);
  if (!modelValidation.valid) return fail("MODEL_INVALID","Model must be valid before dry-run planning.",{errors:modelValidation.errors});
  const specErrors = validateExecutionSpec(spec);
  if (specErrors.length) return fail("EXECUTION_SPEC_INVALID","Execution specification is invalid.",{errors:specErrors});
  const assignment = buildAssignmentPlan(model,taskId,options);
  if (!assignment.ok) return fail("ASSIGNMENT_PLAN_FAILED","Assignment plan could not be created.",{assignment});
  const requiresHumanAuthorization = spec.risk !== "READ_ONLY" || spec.operation === "EXECUTE_LOCAL_COMMAND";
  const gateStatus = requiresHumanAuthorization ? "PENDING_EXECUTION_AUTHORIZATION" : "READY_FOR_SEPARATE_EXECUTION_GATE";
  const core = {
    schema_version:"1.0",
    plan_id:`DRYRUN-${spec.operation_id}-${taskId}`,
    planner_id:"PTW-DRY-RUN-EXECUTION-PLAN-001",
    project_id:assignment.project_id,
    task_id:taskId,
    worker_id:assignment.selected_worker_id,
    worker_type:assignment.selected_worker_type,
    execution_mode:assignment.selected_execution_mode,
    operation_id:spec.operation_id,
    operation:spec.operation,
    risk:spec.risk,
    inputs:clone(spec.inputs),
    outputs:clone(spec.outputs),
    validation:clone(spec.validation),
    evidence:clone(spec.evidence),
    rollback:spec.rollback,
    timeout_seconds:spec.timeout_seconds,
    environment:clone(spec.environment || {scope:"LOCAL_ONLY",network:false}),
    authorization:{
      task_authorization_state:assignment.authorization_state,
      execution_authorization_required:requiresHumanAuthorization,
      execution_authorization_status:gateStatus,
      execution_authorized:false
    },
    safety:{
      dry_run:true,
      runtime_execution:false,
      worker_started:false,
      external_network:false,
      destructive_operation:false,
      automatic_commit:false,
      automatic_push:false
    },
    assignment:{
      decision:assignment.decision,
      selection_score:assignment.selection_score,
      candidate_count:assignment.candidate_count,
      task_status:assignment.task_status,
      execution_state:assignment.execution_state,
      events:clone(assignment.events)
    },
    expected_terminal_states:["TERMINAL_SUCCESS","TERMINAL_ERROR","CANCELLED"],
    next_required_action:"SEPARATE_EXECUTION_GATE"
  };
  return { ok:true,decision:"DRY_RUN_PLAN_READY",plan:{...core,integrity_sha256:hash(core)},planned_model:assignment.planned_model,runtime_execution:false,worker_started:false };
}

module.exports = { buildDryRunExecutionPlan,validateExecutionSpec,hash,ALLOWED_RISKS,ALLOWED_OPERATIONS };
