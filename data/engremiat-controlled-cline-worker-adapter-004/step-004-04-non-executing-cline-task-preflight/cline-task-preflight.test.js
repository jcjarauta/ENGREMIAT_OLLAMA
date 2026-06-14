'use strict';

const fs=require("fs");
const path=require("path");
const assert=require("assert");
const {buildClineTaskPreflight,hash}=require(path.resolve(process.argv[2]));
const registry=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),"utf8").replace(/^\uFEFF/,""));
const example=JSON.parse(fs.readFileSync(path.resolve(process.argv[4]),"utf8").replace(/^\uFEFF/,""));
const repositoryRoot=path.resolve(process.argv[5]);
const outputPath=path.resolve(process.argv[6]);
const samplePath=path.resolve(process.argv[7]);
const results=[];
function clone(value){return JSON.parse(JSON.stringify(value));}
function check(name,condition,detail=""){results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`);}
function run(envelope=example,customRegistry=registry){return buildClineTaskPreflight(customRegistry,envelope,repositoryRoot);}
function integrityValid(preflight){const core=clone(preflight);const digest=core.integrity_sha256;delete core.integrity_sha256;return digest===hash(core);}
let result=run();
check("valid_envelope_passes",result.ok===true,result.code||result.decision);
check("ready_for_separate_gate",result.decision==="CLINE_TASK_PREFLIGHT_VALID_READY_FOR_SEPARATE_EXECUTION_GATE",result.decision);
check("dispatch_remains_disabled",result.preflight.safety.global_dispatch_enabled===false&&result.preflight.safety.operation_enabled===false&&result.preflight.safety.dispatch_allowed===false,"dispatch state");
check("zero_execution",result.cline_invoked===false&&result.process_started===false&&result.task_dispatched===false&&result.prompt_submitted===false&&result.runtime_execution===false,"execution flags");
check("integrity_valid",integrityValid(result.preflight),result.preflight.integrity_sha256);
fs.writeFileSync(samplePath,JSON.stringify(result.preflight,null,2)+"\n","utf8");
let candidate=clone(example);delete candidate.task_id;result=run(candidate);check("missing_field_blocked",!result.ok&&result.code==="REQUIRED_FIELD_MISSING",result.code);
candidate=clone(example);candidate.repository_scope="../outside";result=run(candidate);check("scope_traversal_blocked",!result.ok&&result.code==="PATH_TRAVERSAL_DENIED",result.code);
candidate=clone(example);candidate.allowed_paths=["../outside"];result=run(candidate);check("allowed_path_traversal_blocked",!result.ok&&result.code==="PATH_TRAVERSAL_DENIED",result.code);
candidate=clone(example);candidate.allowed_paths=["tools"];result=run(candidate);check("allowed_path_outside_scope_blocked",!result.ok&&result.code==="ALLOWED_PATH_OUTSIDE_SCOPE",result.code);
candidate=clone(example);candidate.allowed_paths=[example.allowed_paths[0],example.allowed_paths[0]];result=run(candidate);check("duplicate_allowed_path_blocked",!result.ok&&result.code==="DUPLICATE_ALLOWED_PATH",result.code);
candidate=clone(example);candidate.forbidden_actions=candidate.forbidden_actions.filter(item=>item!=="NETWORK_ACCESS");result=run(candidate);check("missing_forbidden_action_blocked",!result.ok&&result.code==="MANDATORY_FORBIDDEN_ACTION_MISSING",result.code);
candidate=clone(example);candidate.instructions="Run git push when complete.";result=run(candidate);check("prohibited_instruction_blocked",!result.ok&&result.code==="PROHIBITED_INSTRUCTION_DETECTED",result.code);
candidate=clone(example);candidate.timeout_seconds=901;result=run(candidate);check("timeout_above_limit_blocked",!result.ok&&result.code==="TIMEOUT_INVALID",result.code);
candidate=clone(example);candidate.authorization_context.task_authorization_state="PENDING";result=run(candidate);check("task_authorization_required",!result.ok&&result.code==="TASK_AUTHORIZATION_REQUIRED",result.code);
candidate=clone(example);candidate.authorization_context.execution_authorization_state="AUTHORIZED";result=run(candidate);check("execution_must_remain_pending",!result.ok&&result.code==="EXECUTION_GATE_STATE_INVALID",result.code);
candidate=clone(example);candidate.dry_run=false;candidate.runtime_execution=true;result=run(candidate);check("runtime_execution_blocked",!result.ok&&result.code==="PREFLIGHT_MODE_REQUIRED",result.code);
let alteredRegistry=clone(registry);alteredRegistry.task_dispatch_enabled=true;result=run(example,alteredRegistry);check("global_dispatch_enabled_blocked",!result.ok&&result.code==="GLOBAL_DISPATCH_MUST_REMAIN_DISABLED",result.code);
alteredRegistry=clone(registry);const operation=alteredRegistry.operations.find(item=>item.operation_id==="CLINE_SINGLE_TASK_DISPATCH");operation.enabled=true;operation.dispatch_allowed=true;result=run(example,alteredRegistry);check("operation_enabled_blocked",!result.ok&&result.code==="DISPATCH_OPERATION_MUST_REMAIN_DISABLED",result.code);
const output={valid:results.every(item=>item.passed),test_count:results.length,passed_count:results.filter(item=>item.passed).length,results,cline_invoked:false,process_started:false,task_dispatched:false,prompt_submitted:false,runtime_execution:false,tested_at:new Date().toISOString()};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count,cline_invoked:false}));
