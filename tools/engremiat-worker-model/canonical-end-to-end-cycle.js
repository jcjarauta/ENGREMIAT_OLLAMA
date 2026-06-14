'use strict';

const crypto=require("crypto");
const {validateModel}=require("./validate-canonical-model");
const {buildDryRunExecutionPlan}=require("./dry-run-execution-plan");
const {simulateWorkerLifecycle}=require("./simulated-worker-lifecycle");

function clone(value){return JSON.parse(JSON.stringify(value));}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});return value;}
function hash(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase();}
function fail(stage,code,message,details={}){return {ok:false,decision:"NO_GO",stage,code,message,details,runtime_execution:false,worker_started:false};}

function runCanonicalCycle(model,taskId,spec,options={}){
  const initialValidation=validateModel(model);
  if(!initialValidation.valid)return fail("INITIAL_VALIDATION","MODEL_INVALID","Initial canonical model is invalid.",{errors:initialValidation.errors});
  const initialModel=clone(model);
  const initialHash=hash(initialModel);
  const dryRun=buildDryRunExecutionPlan(initialModel,taskId,spec,options);
  if(!dryRun.ok)return fail("DRY_RUN_PLAN",dryRun.code||"DRY_RUN_FAILED",dryRun.message||"Dry-run plan failed.",{dryRun});
  const planHash=dryRun.plan.integrity_sha256;
  const simulation=simulateWorkerLifecycle(dryRun.plan,dryRun.planned_model,options.outcome||"SUCCESS",{actor:options.actor||"END_TO_END_SIMULATOR"});
  if(!simulation.ok)return fail("SIMULATED_LIFECYCLE",simulation.code||"SIMULATION_FAILED",simulation.message||"Simulation failed.",{simulation});
  const finalValidation=validateModel(simulation.result.final_model);
  if(!finalValidation.valid)return fail("FINAL_VALIDATION","FINAL_MODEL_INVALID","Final canonical model is invalid.",{errors:finalValidation.errors});
  const finalTask=simulation.result.final_model.tasks.find(item=>item.task_id===taskId);
  const evidenceCore={
    schema_version:"1.0",
    cycle_id:`E2E-${dryRun.plan.plan_id}-${simulation.result.outcome}`,
    cycle_engine_id:"PTW-END-TO-END-CYCLE-001",
    project_id:dryRun.plan.project_id,
    task_id:taskId,
    worker_id:dryRun.plan.worker_id,
    worker_type:dryRun.plan.worker_type,
    operation:dryRun.plan.operation,
    risk:dryRun.plan.risk,
    execution_mode:dryRun.plan.execution_mode,
    initial_model_sha256:initialHash,
    dry_run_plan_sha256:planHash,
    simulation_sha256:simulation.result.integrity_sha256,
    stages:[
      {sequence:1,stage:"MODEL_VALIDATED",status:"OK"},
      {sequence:2,stage:"WORKER_SELECTED_AND_ASSIGNED",status:"OK",worker_id:dryRun.plan.worker_id},
      {sequence:3,stage:"TASK_QUEUED",status:"OK",execution_state:dryRun.plan.assignment.execution_state},
      {sequence:4,stage:"DRY_RUN_CONTRACT_CREATED",status:"OK",plan_id:dryRun.plan.plan_id},
      {sequence:5,stage:"WORKER_LIFECYCLE_SIMULATED",status:"OK",outcome:simulation.result.outcome},
      {sequence:6,stage:"FINAL_MODEL_VALIDATED",status:"OK",task_status:finalTask.status,execution_state:finalTask.execution_state}
    ],
    final_task_status:finalTask.status,
    final_execution_state:finalTask.execution_state,
    expected_next_action:simulation.result.next_required_action,
    authorization:{task_authorization_state:dryRun.plan.authorization.task_authorization_state,separate_execution_gate_present:dryRun.plan.next_required_action==="SEPARATE_EXECUTION_GATE",real_execution_authorized:false},
    safety:{simulation_only:true,runtime_execution:false,worker_started:false,process_started:false,command_executed:false,external_network:false,google_api:false,telegram:false,ollama_invoked:false,cline_invoked:false},
    artifacts:{dry_run_plan:dryRun.plan,simulation_result:simulation.result,final_model:simulation.result.final_model}
  };
  return {ok:true,decision:"CANONICAL_CYCLE_COMPLETE",evidence:{...evidenceCore,integrity_sha256:hash(evidenceCore)},runtime_execution:false,worker_started:false};
}

module.exports={runCanonicalCycle,hash};
