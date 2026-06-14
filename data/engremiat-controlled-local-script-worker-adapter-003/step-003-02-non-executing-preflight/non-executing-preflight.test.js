'use strict';

const fs=require("fs");
const path=require("path");
const assert=require("assert");
const {buildPreflight,hash}=require(path.resolve(process.argv[2]));
const registry=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),"utf8").replace(/^\uFEFF/,""));
const example=JSON.parse(fs.readFileSync(path.resolve(process.argv[4]),"utf8").replace(/^\uFEFF/,""));
const repositoryRoot=path.resolve(process.argv[5]);
const outputPath=path.resolve(process.argv[6]);
const samplePath=path.resolve(process.argv[7]);
const results=[];
function clone(v){return JSON.parse(JSON.stringify(v));}
function check(name,condition,detail){results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`);}
function verifyIntegrity(preflight){const core=clone(preflight);const digest=core.integrity_sha256;delete core.integrity_sha256;return digest===hash(core);}
let request=clone(example);
let r=buildPreflight(registry,request,repositoryRoot);
check("valid_request_passes",r.ok&&r.decision==="GO_FOR_SEPARATE_EXECUTION_GATE",r.code||r.decision);
check("operation_resolved",r.ok&&r.preflight.operation_id==="RUN_NODE_CHECK",r.preflight&&r.preflight.operation_id);
check("target_path_scoped",r.ok&&r.preflight.resolved_arguments.target_file==="tools/engremiat-worker-model/validate-canonical-model.js",r.preflight&&r.preflight.resolved_arguments.target_file);
check("authorization_gate_preserved",r.ok&&r.preflight.next_required_action==="SEPARATE_EXECUTION_GATE",r.preflight&&r.preflight.next_required_action);
check("no_execution",r.ok&&r.preflight.safety.runtime_execution===false&&r.preflight.safety.process_started===false&&r.preflight.safety.command_executed===false,String(r.preflight&&r.preflight.safety.process_started));
check("integrity_valid",r.ok&&verifyIntegrity(r.preflight),r.preflight&&r.preflight.integrity_sha256);
fs.writeFileSync(samplePath,JSON.stringify(r.preflight,null,2)+"\n","utf8");

request=clone(example);request.operation_id="UNKNOWN";r=buildPreflight(registry,request,repositoryRoot);check("unknown_operation_blocked",!r.ok&&r.code==="OPERATION_NOT_ALLOWLISTED",r.code);
request=clone(example);request.arguments.target_file="../outside.js";r=buildPreflight(registry,request,repositoryRoot);check("path_traversal_blocked",!r.ok&&r.code==="PATH_TRAVERSAL_DENIED",r.code);
request=clone(example);request.arguments.target_file="package.json";r=buildPreflight(registry,request,repositoryRoot);check("wrong_extension_blocked",!r.ok&&r.code==="JS_EXTENSION_REQUIRED",r.code);
request=clone(example);request.arguments.target_file="tools/missing-file.js";r=buildPreflight(registry,request,repositoryRoot);check("missing_input_blocked",!r.ok&&r.code==="INPUT_FILE_NOT_FOUND",r.code);
request=clone(example);request.arguments.extra="x";r=buildPreflight(registry,request,repositoryRoot);check("unexpected_argument_blocked",!r.ok&&r.code==="UNEXPECTED_ARGUMENT",r.code);
request=clone(example);request.requested_execution_mode="CONTROLLED_EXECUTION";r=buildPreflight(registry,request,repositoryRoot);check("mode_mismatch_blocked",!r.ok&&r.code==="EXECUTION_MODE_MISMATCH",r.code);
request=clone(example);request.authorization_context.task_authorization_state="PENDING_HUMAN_AUTHORIZATION";r=buildPreflight(registry,request,repositoryRoot);check("task_authorization_blocked",!r.ok&&r.code==="TASK_AUTHORIZATION_REQUIRED",r.code);
request=clone(example);request.authorization_context.execution_authorization_state="REJECTED";r=buildPreflight(registry,request,repositoryRoot);check("execution_context_blocked",!r.ok&&r.code==="EXECUTION_AUTHORIZATION_CONTEXT_INVALID",r.code);
request=clone(example);request.dry_run=false;request.runtime_execution=true;r=buildPreflight(registry,request,repositoryRoot);check("non_dry_run_blocked",!r.ok&&r.code==="REQUEST_NOT_DRY_RUN",r.code);
const unsafeRegistry=clone(registry);unsafeRegistry.deny_by_default=false;r=buildPreflight(unsafeRegistry,clone(example),repositoryRoot);check("unsafe_registry_blocked",!r.ok&&r.code==="REGISTRY_INVALID",r.code);
const output={valid:results.every(item=>item.passed),test_count:results.length,passed_count:results.filter(item=>item.passed).length,results,tested_at:new Date().toISOString()};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count}));
