'use strict';

const crypto=require("crypto");
const {simulateWorkerLifecycle}=require("../simulated-worker-lifecycle");

function clone(value){return JSON.parse(JSON.stringify(value));}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});return value;}
function hash(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase();}
function fail(code,message,details={}){return {ok:false,decision:"NO_GO",code,message,details,runtime_execution:false};}

function integrateControlledRun(plan,plannedModel,runnerResult,options={}){
  if(!plan||!plannedModel||!runnerResult)return fail("INPUT_REQUIRED","Plan, planned model and runner result are required.");
  if(plan.task_id!==runnerResult.task_id)return fail("TASK_ID_MISMATCH","Runner result task does not match plan.",{plan_task_id:plan.task_id,runner_task_id:runnerResult.task_id});
  if(plan.operation_id&&runnerResult.operation_id&&plan.operation_id!==runnerResult.operation_id)return fail("OPERATION_ID_MISMATCH","Runner operation does not match plan.");
  if(!["TERMINAL_SUCCESS","TERMINAL_ERROR","CANCELLED"].includes(runnerResult.terminal_execution_state))return fail("RUNNER_TERMINAL_STATE_INVALID","Runner result is not terminal.");
  if(!runnerResult.integrity_sha256)return fail("RUNNER_INTEGRITY_MISSING","Runner result lacks integrity evidence.");
  const outcome=runnerResult.terminal_execution_state==="TERMINAL_SUCCESS"?"SUCCESS":runnerResult.terminal_execution_state==="TERMINAL_ERROR"?"ERROR":"CANCELLED";
  const simulation=simulateWorkerLifecycle(plan,plannedModel,outcome,{actor:options.actor||"CONTROLLED_LOCAL_SCRIPT_ADAPTER"});
  if(!simulation.ok)return fail("CANONICAL_LIFECYCLE_FAILED",simulation.message||simulation.code||"Canonical lifecycle failed.",{simulation});
  const finalTask=simulation.result.final_model.tasks.find(item=>item.task_id===plan.task_id);
  if(!finalTask)return fail("FINAL_TASK_MISSING","Final canonical task was not found.");
  const expectedTaskStatus=outcome==="SUCCESS"?"REVIEW":"BLOCKED";
  if(finalTask.status!==expectedTaskStatus)return fail("FINAL_TASK_STATUS_MISMATCH","Canonical task status does not match runner outcome.",{expected:expectedTaskStatus,actual:finalTask.status});
  const core={schema_version:"1.0",integration_id:`INTEGRATION-${runnerResult.request_id}-${outcome}`,boundary_id:"LOCAL-SCRIPT-CANONICAL-INTEGRATION-003-001",plan_id:plan.plan_id,request_id:runnerResult.request_id,task_id:plan.task_id,worker_id:plan.worker_id,operation_id:runnerResult.operation_id,runner_terminal_execution_state:runnerResult.terminal_execution_state,canonical_outcome:outcome,canonical_terminal_execution_state:simulation.result.terminal_execution_state,final_task_status:finalTask.status,next_required_action:simulation.result.next_required_action,runner_integrity_sha256:runnerResult.integrity_sha256,simulation_integrity_sha256:simulation.result.integrity_sha256,lifecycle_events:clone(simulation.result.events),final_model:clone(simulation.result.final_model),safety:{runtime_execution:false,real_process_started:false,real_command_executed:false,external_network:false,runner_result_consumed_only:true}};
  return {ok:true,decision:"CONTROLLED_RUN_INTEGRATED_WITH_CANONICAL_LIFECYCLE",result:{...core,integrity_sha256:hash(core)},runtime_execution:false};
}

module.exports={integrateControlledRun,hash};
