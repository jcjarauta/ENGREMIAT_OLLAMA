'use strict';

const fs=require("fs");
const path=require("path");
const assert=require("assert");
const {simulateWorkerLifecycle,hash}=require(path.resolve(process.argv[2]));
const planPath=path.resolve(process.argv[3]);
const outputPath=path.resolve(process.argv[4]);
const successPath=path.resolve(process.argv[5]);
const errorPath=path.resolve(process.argv[6]);
const cancelPath=path.resolve(process.argv[7]);
const plan=JSON.parse(fs.readFileSync(planPath,"utf8").replace(/^\uFEFF/,""));
const plannedModel=plan.__planned_model;
delete plan.__planned_model;
const results=[];
function clone(v){return JSON.parse(JSON.stringify(v));}
function check(name,condition,detail){results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`);}
function verifyIntegrity(result){const core=clone(result);const integrity=core.integrity_sha256;delete core.integrity_sha256;return integrity===hash(core);}
let r=simulateWorkerLifecycle(clone(plan),clone(plannedModel),"SUCCESS");
check("success_simulation_completed",r.ok&&r.decision==="SIMULATION_COMPLETE",r.code||r.decision);
check("success_terminal_state",r.ok&&r.result.terminal_execution_state==="TERMINAL_SUCCESS",r.result&&r.result.terminal_execution_state);
check("success_moves_to_review",r.ok&&r.result.final_task_status==="REVIEW",r.result&&r.result.final_task_status);
check("success_has_four_events",r.ok&&r.result.events.length===4,String(r.result&&r.result.events.length));
check("success_integrity_valid",r.ok&&verifyIntegrity(r.result),r.result&&r.result.integrity_sha256);
check("success_no_real_execution",r.ok&&r.result.safety.runtime_execution===false&&r.result.safety.process_started===false,String(r.result&&r.result.safety.process_started));
fs.writeFileSync(successPath,JSON.stringify(r.result,null,2)+"\n","utf8");

r=simulateWorkerLifecycle(clone(plan),clone(plannedModel),"ERROR");
check("error_simulation_completed",r.ok,r.code||"OK");
check("error_terminal_state",r.ok&&r.result.terminal_execution_state==="TERMINAL_ERROR",r.result&&r.result.terminal_execution_state);
check("error_moves_to_blocked",r.ok&&r.result.final_task_status==="BLOCKED",r.result&&r.result.final_task_status);
check("error_integrity_valid",r.ok&&verifyIntegrity(r.result),r.result&&r.result.integrity_sha256);
fs.writeFileSync(errorPath,JSON.stringify(r.result,null,2)+"\n","utf8");

r=simulateWorkerLifecycle(clone(plan),clone(plannedModel),"CANCELLED");
check("cancel_simulation_completed",r.ok,r.code||"OK");
check("cancel_terminal_state",r.ok&&r.result.terminal_execution_state==="CANCELLED",r.result&&r.result.terminal_execution_state);
check("cancel_moves_to_blocked",r.ok&&r.result.final_task_status==="BLOCKED",r.result&&r.result.final_task_status);
check("cancel_integrity_valid",r.ok&&verifyIntegrity(r.result),r.result&&r.result.integrity_sha256);
fs.writeFileSync(cancelPath,JSON.stringify(r.result,null,2)+"\n","utf8");

r=simulateWorkerLifecycle(clone(plan),clone(plannedModel),"UNKNOWN");
check("invalid_outcome_blocked",!r.ok&&r.code==="OUTCOME_INVALID",r.code);

const unsafePlan=clone(plan);unsafePlan.safety.runtime_execution=true;
r=simulateWorkerLifecycle(unsafePlan,clone(plannedModel),"SUCCESS");
check("unsafe_plan_blocked",!r.ok&&r.code==="PLAN_NOT_SAFE_DRY_RUN",r.code);

const notQueuedPlan=clone(plan);notQueuedPlan.assignment.execution_state="NOT_STARTED";
r=simulateWorkerLifecycle(notQueuedPlan,clone(plannedModel),"SUCCESS");
check("non_queued_plan_blocked",!r.ok&&r.code==="PLAN_NOT_QUEUED",r.code);

const missingGate=clone(plan);missingGate.next_required_action="EXECUTE_NOW";
r=simulateWorkerLifecycle(missingGate,clone(plannedModel),"SUCCESS");
check("missing_gate_blocked",!r.ok&&r.code==="EXECUTION_GATE_MISSING",r.code);

const output={valid:results.every(item=>item.passed),test_count:results.length,passed_count:results.filter(item=>item.passed).length,results,tested_at:new Date().toISOString()};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count}));
