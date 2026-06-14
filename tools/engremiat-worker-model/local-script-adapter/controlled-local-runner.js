'use strict';

const crypto=require("crypto");

function clone(value){return JSON.parse(JSON.stringify(value));}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});return value;}
function hashText(value){return crypto.createHash("sha256").update(String(value),"utf8").digest("hex").toUpperCase();}
function hashObject(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase();}
function fail(code,message,details={}){return {ok:false,decision:"NO_GO",code,message,details,process_started:false,command_executed:false};}
function validPreflight(preflight){return preflight&&preflight.adapter_id==="ENGREMIAT-LOCAL-SCRIPT-WORKER-ADAPTER-003"&&preflight.safety&&preflight.safety.deny_by_default===true&&preflight.safety.free_form_command===false&&preflight.safety.shell_interpolation===false&&preflight.safety.network===false&&preflight.safety.runtime_execution===false&&preflight.safety.process_started===false&&preflight.safety.command_executed===false;}

async function runControlled(preflight,authorization,executor,options={}){
  if(!validPreflight(preflight))return fail("PREFLIGHT_INVALID","A valid non-executing preflight is required.");
  if(typeof executor!=="function")return fail("EXECUTOR_REQUIRED","A controlled executor implementation is required.");
  if(preflight.authorization.execution_authorization_required===true&&authorization!=="AUTHORIZED")return fail("EXECUTION_AUTHORIZATION_REQUIRED","Real process execution requires AUTHORIZED.");
  if(!Number.isInteger(preflight.timeout_seconds)||preflight.timeout_seconds<1||preflight.timeout_seconds>300)return fail("TIMEOUT_INVALID","Timeout is outside the controlled range.");
  if(!["node","git","INTERNAL_NODE_ADAPTER"].includes(preflight.executable))return fail("EXECUTABLE_NOT_ALLOWED","Executable is not allowed.");
  if(!Array.isArray(preflight.arguments)||preflight.arguments.some(argument=>typeof argument!=="string"))return fail("ARGUMENTS_INVALID","Arguments must be an array of strings.");
  const allowedExitCodes=Array.isArray(preflight.allowed_exit_codes)?preflight.allowed_exit_codes:Array.isArray(preflight.expected_exit_codes)?preflight.expected_exit_codes:[0];
  const successExitCodes=Array.isArray(preflight.success_exit_codes)?preflight.success_exit_codes:[0];
  if(!allowedExitCodes.every(Number.isInteger)||!successExitCodes.every(Number.isInteger))return fail("EXIT_CODE_POLICY_INVALID","Exit code policies must contain integers.");
  if(successExitCodes.some(code=>!allowedExitCodes.includes(code)))return fail("SUCCESS_EXIT_CODE_NOT_ALLOWED","Every success exit code must also be allowed.");
  const startedAt=new Date().toISOString();
  const request={executable:preflight.executable,arguments:clone(preflight.arguments),cwd:options.repository_root||process.cwd(),timeout_ms:preflight.timeout_seconds*1000,shell:false,use_shell_execute:false,network:false};
  let raw;
  try{raw=await executor(request);}catch(error){raw={started:true,completed:false,timed_out:false,cancelled:false,exit_code:null,stdout:"",stderr:error&&error.message?error.message:String(error),duration_ms:0,executor_error:true};}
  const normalized={started:raw.started===true,completed:raw.completed===true,timed_out:raw.timed_out===true,cancelled:raw.cancelled===true,exit_code:Number.isInteger(raw.exit_code)?raw.exit_code:null,stdout:typeof raw.stdout==="string"?raw.stdout:"",stderr:typeof raw.stderr==="string"?raw.stderr:"",duration_ms:Number.isFinite(raw.duration_ms)?raw.duration_ms:0,executor_error:raw.executor_error===true};
  const exitCodeAllowed=normalized.exit_code===null?false:allowedExitCodes.includes(normalized.exit_code);
  const exitCodeSuccessful=normalized.exit_code===null?false:successExitCodes.includes(normalized.exit_code);
  let terminal;
  if(normalized.timed_out||normalized.cancelled)terminal="CANCELLED";
  else if(normalized.completed&&exitCodeSuccessful)terminal="TERMINAL_SUCCESS";
  else terminal="TERMINAL_ERROR";
  const core={schema_version:"1.0",runner_id:"ENGREMIAT-CONTROLLED-LOCAL-RUNNER-003",preflight_id:preflight.preflight_id,request_id:preflight.request_id,task_id:preflight.task_id,operation_id:preflight.operation_id,executable:preflight.executable,arguments:clone(preflight.arguments),authorization_status:authorization,started_at:startedAt,finished_at:new Date().toISOString(),exit_code_policy:{allowed_exit_codes:clone(allowedExitCodes),success_exit_codes:clone(successExitCodes),exit_code_allowed:exitCodeAllowed,exit_code_successful:exitCodeSuccessful},process:{started:normalized.started,completed:normalized.completed,timed_out:normalized.timed_out,cancelled:normalized.cancelled,exit_code:normalized.exit_code,duration_ms:normalized.duration_ms,executor_error:normalized.executor_error},output:{stdout:normalized.stdout,stderr:normalized.stderr,stdout_sha256:hashText(normalized.stdout),stderr_sha256:hashText(normalized.stderr)},terminal_execution_state:terminal,safety:{shell:false,use_shell_execute:false,network:false,free_form_command:false,operation_allowlisted:true,timeout_enforced:true},evidence_required:clone(preflight.evidence_required)};
  return {ok:terminal==="TERMINAL_SUCCESS",decision:"CONTROLLED_RUN_COMPLETE",result:{...core,integrity_sha256:hashObject(core)},process_started:normalized.started,command_executed:normalized.started};
}

module.exports={runControlled,hashText,hashObject,validPreflight};
