'use strict';

const crypto=require("crypto");
const fs=require("fs");
const path=require("path");

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});
  return value;
}

function hash(value){
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase();
}

function clone(value){
  return value===undefined?undefined:JSON.parse(JSON.stringify(value));
}

function fail(code,message,details={}){
  return {ok:false,decision:"NO_GO",code,message,details,cline_invoked:false,process_started:false,task_dispatched:false,prompt_submitted:false,runtime_execution:false};
}

function normalizeRelativePath(value){
  return String(value||"").replace(/\\/g,"/").replace(/^\.\/+/,"");
}

function validateRepositoryPath(repositoryRoot,value,{mustExist=false,allowDirectory=true}={}){
  if(typeof value!=="string"||value.trim()==="")return {ok:false,code:"PATH_REQUIRED"};
  if(path.isAbsolute(value))return {ok:false,code:"ABSOLUTE_PATH_DENIED"};
  const normalized=normalizeRelativePath(value);
  if(normalized.split("/").includes(".."))return {ok:false,code:"PATH_TRAVERSAL_DENIED"};
  const resolved=path.resolve(repositoryRoot,normalized);
  const relative=path.relative(repositoryRoot,resolved);
  if(relative.startsWith("..")||path.isAbsolute(relative))return {ok:false,code:"PATH_OUTSIDE_REPOSITORY"};
  if(mustExist&&!fs.existsSync(resolved))return {ok:false,code:"PATH_NOT_FOUND"};
  if(mustExist&&!allowDirectory&&fs.statSync(resolved).isDirectory())return {ok:false,code:"FILE_REQUIRED"};
  return {ok:true,relative:normalizeRelativePath(relative),resolved};
}

function buildClineTaskPreflight(registry,envelope,repositoryRoot){
  if(!registry||registry.deny_by_default!==true)return fail("REGISTRY_INVALID","Registry must deny by default.");
  if(registry.task_dispatch_enabled!==false)return fail("GLOBAL_DISPATCH_MUST_REMAIN_DISABLED","Global dispatch must remain disabled during preflight.");
  const operation=(registry.operations||[]).find(item=>item.operation_id==="CLINE_SINGLE_TASK_DISPATCH");
  if(!operation)return fail("DISPATCH_OPERATION_MISSING","CLINE_SINGLE_TASK_DISPATCH is not defined.");
  if(operation.enabled!==false||operation.dispatch_allowed!==false)return fail("DISPATCH_OPERATION_MUST_REMAIN_DISABLED","Preflight cannot enable dispatch.");
  if(!envelope||typeof envelope!=="object"||Array.isArray(envelope))return fail("ENVELOPE_INVALID","Task envelope must be an object.");
  const required=["schema_version","envelope_id","task_id","project_id","objective","instructions","repository_scope","allowed_paths","forbidden_actions","validation_contract","timeout_seconds","authorization_context","execution_policy","dry_run","runtime_execution"];
  for(const field of required){if(!(field in envelope))return fail("REQUIRED_FIELD_MISSING",`Missing required field ${field}.`,{field});}
  if(envelope.schema_version!=="1.0")return fail("SCHEMA_VERSION_INVALID","Unsupported envelope schema version.");
  for(const field of ["envelope_id","task_id","project_id","objective","instructions"]){if(typeof envelope[field]!=="string"||envelope[field].trim()==="")return fail("TEXT_FIELD_INVALID",`${field} must be non-empty.`,{field});}
  if(envelope.instructions.length>12000)return fail("INSTRUCTIONS_TOO_LARGE","Instructions exceed the maximum size.");
  if(envelope.dry_run!==true||envelope.runtime_execution!==false)return fail("PREFLIGHT_MODE_REQUIRED","Preflight requires dry_run=true and runtime_execution=false.");
  if(envelope.execution_policy!=="SINGLE_TASK_CONTROLLED")return fail("EXECUTION_POLICY_INVALID","Only SINGLE_TASK_CONTROLLED is accepted.");
  if(!Number.isInteger(envelope.timeout_seconds)||envelope.timeout_seconds<30||envelope.timeout_seconds>900)return fail("TIMEOUT_INVALID","Timeout must be an integer from 30 to 900 seconds.");
  const auth=envelope.authorization_context||{};
  if(auth.task_authorization_state!=="AUTHORIZED")return fail("TASK_AUTHORIZATION_REQUIRED","Canonical task authorization is required.");
  if(auth.execution_authorization_state!=="PENDING_EXECUTION_AUTHORIZATION")return fail("EXECUTION_GATE_STATE_INVALID","Execution authorization must remain pending during preflight.");
  const scopeCheck=validateRepositoryPath(repositoryRoot,envelope.repository_scope,{mustExist:true,allowDirectory:true});
  if(!scopeCheck.ok)return fail(scopeCheck.code,"Repository scope is invalid.",{repository_scope:envelope.repository_scope});
  if(!Array.isArray(envelope.allowed_paths)||envelope.allowed_paths.length===0)return fail("ALLOWED_PATHS_REQUIRED","At least one allowed path is required.");
  const normalizedAllowed=[];
  for(const candidate of envelope.allowed_paths){
    const checked=validateRepositoryPath(repositoryRoot,candidate,{mustExist:false,allowDirectory:true});
    if(!checked.ok)return fail(checked.code,"An allowed path is invalid.",{path:candidate});
    const scopePrefix=scopeCheck.relative===""?"":scopeCheck.relative+"/";
    if(scopeCheck.relative!==""&&checked.relative!==scopeCheck.relative&&!checked.relative.startsWith(scopePrefix))return fail("ALLOWED_PATH_OUTSIDE_SCOPE","An allowed path is outside repository_scope.",{path:checked.relative,scope:scopeCheck.relative});
    normalizedAllowed.push(checked.relative);
  }
  if(new Set(normalizedAllowed).size!==normalizedAllowed.length)return fail("DUPLICATE_ALLOWED_PATH","allowed_paths contains duplicates.");
  if(!Array.isArray(envelope.forbidden_actions)||envelope.forbidden_actions.length===0)return fail("FORBIDDEN_ACTIONS_REQUIRED","Forbidden actions must be declared.");
  const mandatoryForbidden=["NETWORK_ACCESS","GIT_PUSH","GIT_FORCE","DELETE_OUTSIDE_ALLOWED_PATHS","FREE_FORM_SHELL","AUTOMATIC_CONTINUATION","MODIFY_CLINE_SESSION_METADATA"];
  const missingForbidden=mandatoryForbidden.filter(item=>!envelope.forbidden_actions.includes(item));
  if(missingForbidden.length)return fail("MANDATORY_FORBIDDEN_ACTION_MISSING","Mandatory forbidden actions are missing.",{missing:missingForbidden});
  if(!Array.isArray(envelope.validation_contract)||envelope.validation_contract.length===0)return fail("VALIDATION_CONTRACT_REQUIRED","At least one validation is required.");
  const prohibitedPatterns=[/\bgit\s+push\b/i,/\bgit\s+reset\s+--hard\b/i,/\brm\s+-rf\b/i,/\bremove-item\b.*-recurse.*-force/i,/\bcurl\b/i,/\binvoke-webrequest\b/i];
  const prohibitedInstruction=prohibitedPatterns.find(pattern=>pattern.test(envelope.instructions));
  if(prohibitedInstruction)return fail("PROHIBITED_INSTRUCTION_DETECTED","Instructions contain a prohibited command pattern.");
  const core={schema_version:"1.0",preflight_id:`PREFLIGHT-${envelope.envelope_id}`,adapter_id:"ENGREMIAT-CONTROLLED-CLINE-WORKER-ADAPTER-004",operation_id:"CLINE_SINGLE_TASK_DISPATCH",envelope_id:envelope.envelope_id,task_id:envelope.task_id,project_id:envelope.project_id,objective:envelope.objective,instructions_sha256:hash(envelope.instructions),repository_scope:scopeCheck.relative,allowed_paths:clone(normalizedAllowed),forbidden_actions:clone(envelope.forbidden_actions),validation_contract:clone(envelope.validation_contract),timeout_seconds:envelope.timeout_seconds,authorization:{task_authorization_state:auth.task_authorization_state,execution_authorization_state:auth.execution_authorization_state,separate_execution_gate_required:true},execution_policy:"SINGLE_TASK_CONTROLLED",safety:{deny_by_default:true,free_form_arguments:false,raw_prompt_execution:false,automatic_continuation:false,network_access:false,global_dispatch_enabled:false,operation_enabled:false,dispatch_allowed:false,cline_invoked:false,process_started:false,task_dispatched:false,prompt_submitted:false,runtime_execution:false},next_required_action:"SEPARATE_HUMAN_EXECUTION_AUTHORIZATION_GATE"};
  return {ok:true,decision:"CLINE_TASK_PREFLIGHT_VALID_READY_FOR_SEPARATE_EXECUTION_GATE",preflight:{...core,integrity_sha256:hash(core)},cline_invoked:false,process_started:false,task_dispatched:false,prompt_submitted:false,runtime_execution:false};
}

module.exports={buildClineTaskPreflight,validateRepositoryPath,hash};
