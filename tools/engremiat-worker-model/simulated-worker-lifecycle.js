'use strict';

const crypto = require("crypto");
const { validateModel } = require("./validate-canonical-model");
const { transitionTaskStatus,transitionExecutionState } = require("./canonical-state-transition-engine");

const OUTCOMES = new Set(["SUCCESS","ERROR","CANCELLED"]);
function clone(value){return JSON.parse(JSON.stringify(value));}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});return value;}
function hash(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase();}
function fail(code,message,details={}){return {ok:false,decision:"NO_GO",code,message,details,runtime_execution:false,worker_started:false};}
function event(sequence,type,data){return {sequence,type,...clone(data)};}

function simulateWorkerLifecycle(dryRunPlan,plannedModel,outcome,options={}){
  if(!dryRunPlan||typeof dryRunPlan!=="object")return fail("DRY_RUN_PLAN_REQUIRED","A dry-run plan is required.");
  if(!OUTCOMES.has(outcome))return fail("OUTCOME_INVALID",`Unsupported simulated outcome ${outcome}.`);
  if(dryRunPlan.safety?.dry_run!==true||dryRunPlan.safety?.runtime_execution!==false||dryRunPlan.safety?.worker_started!==false)return fail("PLAN_NOT_SAFE_DRY_RUN","Plan is not a non-executing dry-run plan.");
  if(dryRunPlan.assignment?.execution_state!=="QUEUED")return fail("PLAN_NOT_QUEUED","Dry-run assignment must be QUEUED.");
  if(dryRunPlan.next_required_action!=="SEPARATE_EXECUTION_GATE")return fail("EXECUTION_GATE_MISSING","Separate execution gate is missing.");
  const validation=validateModel(plannedModel);
  if(!validation.valid)return fail("PLANNED_MODEL_INVALID","Planned model is invalid.",{errors:validation.errors});
  const taskId=dryRunPlan.task_id;
  const task=plannedModel.tasks.find(item=>item.task_id===taskId);
  if(!task)return fail("TASK_NOT_FOUND",`Task ${taskId} does not exist in planned model.`);
  if(task.execution_state!=="QUEUED")return fail("MODEL_NOT_QUEUED",`Task execution state is ${task.execution_state}; QUEUED required.`);
  if(task.status!=="READY")return fail("TASK_NOT_READY_FOR_SIMULATION",`Task status is ${task.status}; READY required.`);
  const actor=options.actor||"SIMULATED_WORKER";
  const events=[];
  let model=clone(plannedModel);
  events.push(event(1,"SIMULATION_GATE_OPENED",{task_id:taskId,worker_id:dryRunPlan.worker_id,real_execution:false}));
  let result=transitionTaskStatus(model,taskId,"IN_PROGRESS",actor);
  if(!result.ok)return fail("IN_PROGRESS_TRANSITION_FAILED","Could not transition task to IN_PROGRESS.",{result});
  model=result.model;events.push(event(2,"TASK_IN_PROGRESS",result.event));
  result=transitionExecutionState(model,taskId,"RUNNING",actor);
  if(!result.ok)return fail("RUNNING_TRANSITION_FAILED","Could not transition execution to RUNNING.",{result});
  model=result.model;events.push(event(3,"SIMULATED_WORKER_RUNNING",result.event));
  const terminalState=outcome==="SUCCESS"?"TERMINAL_SUCCESS":outcome==="ERROR"?"TERMINAL_ERROR":"CANCELLED";
  result=transitionExecutionState(model,taskId,terminalState,actor);
  if(!result.ok)return fail("TERMINAL_TRANSITION_FAILED",`Could not transition execution to ${terminalState}.`,{result});
  model=result.model;events.push(event(4,"SIMULATED_TERMINAL_RESULT",result.event));
  const finalValidation=validateModel(model);
  if(!finalValidation.valid)return fail("FINAL_MODEL_INVALID","Simulation produced an invalid model.",{errors:finalValidation.errors});
  const finalTask=model.tasks.find(item=>item.task_id===taskId);
  const expectedTaskStatus=outcome==="SUCCESS"?"REVIEW":"BLOCKED";
  if(finalTask.status!==expectedTaskStatus)return fail("FINAL_TASK_STATUS_MISMATCH",`Expected ${expectedTaskStatus}, received ${finalTask.status}.`);
  const core={schema_version:"1.0",simulation_id:`SIM-${dryRunPlan.plan_id}-${outcome}`,simulator_id:"PTW-SIMULATED-WORKER-LIFECYCLE-001",plan_id:dryRunPlan.plan_id,task_id:taskId,project_id:dryRunPlan.project_id,worker_id:dryRunPlan.worker_id,worker_type:dryRunPlan.worker_type,outcome,terminal_execution_state:terminalState,final_task_status:finalTask.status,events,final_model:model,safety:{simulation_only:true,runtime_execution:false,worker_started:false,process_started:false,external_network:false,filesystem_operation:false,command_executed:false},next_required_action:outcome==="SUCCESS"?"HUMAN_OR_AUTOMATED_REVIEW":"REPLAN_OR_HUMAN_REVIEW"};
  return {ok:true,decision:"SIMULATION_COMPLETE",result:{...core,integrity_sha256:hash(core)},runtime_execution:false,worker_started:false};
}

module.exports={simulateWorkerLifecycle,hash,OUTCOMES};
