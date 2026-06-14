'use strict';

const fs=require("fs");
const path=require("path");
const crypto=require("crypto");

function clone(value){if(value===undefined)return undefined;return JSON.parse(JSON.stringify(value));}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});return value;}
function hash(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase();}
function fail(code,message,details={}){return {ok:false,decision:"NO_GO",code,message,details,runtime_execution:false,process_started:false,command_executed:false};}
function inside(root,candidate){const rel=path.relative(root,candidate);return rel===""||(!rel.startsWith("..")&&!path.isAbsolute(rel));}
function nonEmpty(value){return typeof value==="string"&&value.trim().length>0;}

function resolveRepositoryPath(repositoryRoot,value,type){
  if(!nonEmpty(value))return {ok:false,code:"PATH_REQUIRED"};
  if(path.isAbsolute(value))return {ok:false,code:"ABSOLUTE_PATH_DENIED"};
  const normalized=value.replace(/\\/g,"/");
  if(normalized.split("/").includes(".."))return {ok:false,code:"PATH_TRAVERSAL_DENIED"};
  const resolved=path.resolve(repositoryRoot,normalized);
  if(!inside(repositoryRoot,resolved))return {ok:false,code:"PATH_OUTSIDE_REPOSITORY"};
  const extension=path.extname(resolved).toLowerCase();
  if(type==="REPOSITORY_RELATIVE_JSON_FILE"&&extension!==".json")return {ok:false,code:"JSON_EXTENSION_REQUIRED"};
  if(type==="REPOSITORY_RELATIVE_JS_FILE"&&extension!==".js")return {ok:false,code:"JS_EXTENSION_REQUIRED"};
  return {ok:true,resolved,relative:path.relative(repositoryRoot,resolved).replace(/\\/g,"/")};
}

function buildPreflight(registry,request,repositoryRoot){
  if(!registry||registry.deny_by_default!==true)return fail("REGISTRY_INVALID","Registry must deny by default.");
  if(!request||typeof request!=="object"||Array.isArray(request))return fail("REQUEST_INVALID","Request must be an object.");
  for(const field of ["request_id","task_id","operation_id","arguments","requested_execution_mode","authorization_context"]){if(!(field in request))return fail("REQUEST_FIELD_MISSING",`Missing field ${field}.`,{field});}
  if(request.dry_run!==true||request.runtime_execution!==false)return fail("REQUEST_NOT_DRY_RUN","Preflight accepts dry-run requests only.");
  const operation=registry.operations.find(item=>item.operation_id===request.operation_id);
  if(!operation||operation.enabled!==true)return fail("OPERATION_NOT_ALLOWLISTED","Operation is not enabled in the allowlist.");
  if(operation.network!==false)return fail("NETWORK_OPERATION_DENIED","Network-enabled operation is denied.");
  if(request.requested_execution_mode!==operation.execution_mode)return fail("EXECUTION_MODE_MISMATCH","Requested execution mode does not match operation policy.");
  if(!Number.isInteger(operation.timeout_seconds)||operation.timeout_seconds<1||operation.timeout_seconds>300)return fail("TIMEOUT_POLICY_INVALID","Operation timeout is outside the allowed range.");
  if(request.authorization_context.task_authorization_state!=="AUTHORIZED"&&request.authorization_context.task_authorization_state!=="NOT_REQUIRED")return fail("TASK_AUTHORIZATION_REQUIRED","Canonical task authorization is missing.");
  if(operation.authorization_required===true&&!["PENDING_EXECUTION_AUTHORIZATION","AUTHORIZED"].includes(request.authorization_context.execution_authorization_state))return fail("EXECUTION_AUTHORIZATION_CONTEXT_INVALID","Execution authorization context is invalid.");
  const dynamicArguments=Array.isArray(operation.dynamic_arguments)?operation.dynamic_arguments:[];
  const fixedArguments=Array.isArray(operation.fixed_arguments)?operation.fixed_arguments:[];
  const allowedExitCodes=Array.isArray(operation.allowed_exit_codes)?operation.allowed_exit_codes:Array.isArray(operation.expected_exit_codes)?operation.expected_exit_codes:[0];
  const successExitCodes=Array.isArray(operation.success_exit_codes)?operation.success_exit_codes:[0];
  if(!allowedExitCodes.every(Number.isInteger)||!successExitCodes.every(Number.isInteger))return fail("EXIT_CODE_POLICY_INVALID","Exit code policies must contain integers.");
  if(successExitCodes.some(code=>!allowedExitCodes.includes(code)))return fail("SUCCESS_EXIT_CODE_NOT_ALLOWED","Success exit codes must be included in allowed exit codes.");
  const allowedArgumentNames=dynamicArguments.map(item=>item.name);
  const receivedArgumentNames=Object.keys(request.arguments||{});
  const unexpected=receivedArgumentNames.filter(name=>!allowedArgumentNames.includes(name));
  if(unexpected.length)return fail("UNEXPECTED_ARGUMENT","Request contains undeclared arguments.",{unexpected});
  const resolvedArguments={};
  for(const rule of dynamicArguments){
    const value=request.arguments[rule.name];
    if(rule.required&&!nonEmpty(value))return fail("REQUIRED_ARGUMENT_MISSING",`Required argument ${rule.name} is missing.`,{argument:rule.name});
    if(value!==undefined){const resolved=resolveRepositoryPath(repositoryRoot,value,rule.type);if(!resolved.ok)return fail(resolved.code,`Argument ${rule.name} failed path validation.`,{argument:rule.name,value});if(rule.name!=="output_file"&&!fs.existsSync(resolved.resolved))return fail("INPUT_FILE_NOT_FOUND",`Input file for ${rule.name} does not exist.`,{argument:rule.name,path:resolved.relative});resolvedArguments[rule.name]=resolved.relative;}
  }
  const commandArguments=[...fixedArguments,...dynamicArguments.map(rule=>resolvedArguments[rule.name]).filter(Boolean)];
  const core={schema_version:"1.0",preflight_id:`PREFLIGHT-${request.request_id}`,adapter_id:"ENGREMIAT-LOCAL-SCRIPT-WORKER-ADAPTER-003",request_id:request.request_id,task_id:request.task_id,operation_id:operation.operation_id,executable:operation.executable,arguments:commandArguments,resolved_arguments:resolvedArguments,working_directory:".",risk:operation.risk,execution_mode:operation.execution_mode,timeout_seconds:operation.timeout_seconds,allowed_exit_codes:clone(allowedExitCodes),success_exit_codes:clone(successExitCodes),evidence_required:clone(operation.evidence||[]),authorization:{task_authorization_state:request.authorization_context.task_authorization_state,execution_authorization_required:operation.authorization_required===true,execution_authorization_state:request.authorization_context.execution_authorization_state},safety:{deny_by_default:true,free_form_command:false,shell_interpolation:false,network:false,destructive:false,runtime_execution:false,process_started:false,command_executed:false},next_required_action:operation.authorization_required===true?"SEPARATE_EXECUTION_GATE":"CONTROLLED_RUNNER"};
  return {ok:true,decision:"GO_FOR_SEPARATE_EXECUTION_GATE",preflight:{...core,integrity_sha256:hash(core)},runtime_execution:false,process_started:false,command_executed:false};
}

module.exports={buildPreflight,resolveRepositoryPath,hash};
