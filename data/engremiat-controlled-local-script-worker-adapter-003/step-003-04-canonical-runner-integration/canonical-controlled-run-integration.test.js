'use strict';

const fs=require("fs");
const path=require("path");
const assert=require("assert");
const {buildDryRunExecutionPlan}=require(path.resolve(process.argv[2]));
const {integrateControlledRun,hash}=require(path.resolve(process.argv[3]));
const base=JSON.parse(fs.readFileSync(path.resolve(process.argv[4]),"utf8").replace(/^\uFEFF/,""));
const successRunner=JSON.parse(fs.readFileSync(path.resolve(process.argv[5]),"utf8").replace(/^\uFEFF/,""));
const errorRunner=JSON.parse(fs.readFileSync(path.resolve(process.argv[6]),"utf8").replace(/^\uFEFF/,""));
const cancelledRunner=JSON.parse(fs.readFileSync(path.resolve(process.argv[7]),"utf8").replace(/^\uFEFF/,""));
const testOutput=path.resolve(process.argv[8]);
const successOutput=path.resolve(process.argv[9]);
const errorOutput=path.resolve(process.argv[10]);
const cancelledOutput=path.resolve(process.argv[11]);
const results=[];
function clone(v){return JSON.parse(JSON.stringify(v));}
function check(name,condition,detail){results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`);}
function validIntegrity(result){const core=clone(result);const digest=core.integrity_sha256;delete core.integrity_sha256;return digest===hash(core);}
const spec={operation_id:"RUN_NODE_CHECK",operation:"VALIDATE",risk:"READ_ONLY",inputs:["TARGET_JS_FILE"],outputs:["NODE_CHECK_RESULT"],validation:["EXIT_CODE_CAPTURED","STDOUT_STDERR_HASHED"],evidence:["CONTROLLED_RUN_RESULT","CANONICAL_FINAL_MODEL"],rollback:"NOT_REQUIRED_READ_ONLY",timeout_seconds:30,environment:{scope:"LOCAL_ONLY",network:false}};
const prepared=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",spec,{requested_mode:"READ_ONLY"});
check("dry_run_prepared",prepared.ok===true,prepared.code||prepared.decision);
function normalizedRunner(source){const r=clone(source);r.task_id=prepared.plan.task_id;r.operation_id="RUN_NODE_CHECK";return r;}

let r=integrateControlledRun(prepared.plan,prepared.planned_model,normalizedRunner(successRunner));
check("success_integrated",r.ok&&r.decision==="CONTROLLED_RUN_INTEGRATED_WITH_CANONICAL_LIFECYCLE",r.code||r.decision);
check("success_terminal_preserved",r.result.runner_terminal_execution_state==="TERMINAL_SUCCESS"&&r.result.canonical_terminal_execution_state==="TERMINAL_SUCCESS",r.result.canonical_terminal_execution_state);
check("success_task_review",r.result.final_task_status==="REVIEW",r.result.final_task_status);
check("success_integrity_valid",validIntegrity(r.result),r.result.integrity_sha256);
check("success_no_real_execution",r.result.safety.runtime_execution===false&&r.result.safety.real_process_started===false&&r.result.safety.real_command_executed===false,String(r.result.safety.real_process_started));
fs.writeFileSync(successOutput,JSON.stringify(r.result,null,2)+"\n","utf8");

r=integrateControlledRun(prepared.plan,prepared.planned_model,normalizedRunner(errorRunner));
check("error_integrated",r.ok&&r.result.runner_terminal_execution_state==="TERMINAL_ERROR",r.code||r.result.runner_terminal_execution_state);
check("error_task_blocked",r.result.final_task_status==="BLOCKED",r.result.final_task_status);
check("error_integrity_valid",validIntegrity(r.result),r.result.integrity_sha256);
fs.writeFileSync(errorOutput,JSON.stringify(r.result,null,2)+"\n","utf8");

r=integrateControlledRun(prepared.plan,prepared.planned_model,normalizedRunner(cancelledRunner));
check("cancelled_integrated",r.ok&&r.result.runner_terminal_execution_state==="CANCELLED",r.code||r.result.runner_terminal_execution_state);
check("cancelled_task_blocked",r.result.final_task_status==="BLOCKED",r.result.final_task_status);
check("cancelled_integrity_valid",validIntegrity(r.result),r.result.integrity_sha256);
fs.writeFileSync(cancelledOutput,JSON.stringify(r.result,null,2)+"\n","utf8");

let bad=normalizedRunner(successRunner);bad.task_id="TASK-MISMATCH";r=integrateControlledRun(prepared.plan,prepared.planned_model,bad);check("task_mismatch_blocked",!r.ok&&r.code==="TASK_ID_MISMATCH",r.code);
bad=normalizedRunner(successRunner);bad.operation_id="UNKNOWN";r=integrateControlledRun(prepared.plan,prepared.planned_model,bad);check("operation_mismatch_blocked",!r.ok&&r.code==="OPERATION_ID_MISMATCH",r.code);
bad=normalizedRunner(successRunner);bad.terminal_execution_state="RUNNING";r=integrateControlledRun(prepared.plan,prepared.planned_model,bad);check("nonterminal_runner_blocked",!r.ok&&r.code==="RUNNER_TERMINAL_STATE_INVALID",r.code);
bad=normalizedRunner(successRunner);delete bad.integrity_sha256;r=integrateControlledRun(prepared.plan,prepared.planned_model,bad);check("missing_integrity_blocked",!r.ok&&r.code==="RUNNER_INTEGRITY_MISSING",r.code);

const output={valid:results.every(item=>item.passed),test_count:results.length,passed_count:results.filter(item=>item.passed).length,results,real_process_started:false,real_command_executed:false,tested_at:new Date().toISOString()};
fs.writeFileSync(testOutput,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count,real_process_started:false}));
