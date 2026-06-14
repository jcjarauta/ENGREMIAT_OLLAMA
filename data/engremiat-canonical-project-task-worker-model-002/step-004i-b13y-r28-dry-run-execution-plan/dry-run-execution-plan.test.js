'use strict';

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { buildDryRunExecutionPlan,hash } = require(path.resolve(process.argv[2]));
const fixturePath = path.resolve(process.argv[3]);
const outputPath = path.resolve(process.argv[4]);
const samplePath = path.resolve(process.argv[5]);
const base = JSON.parse(fs.readFileSync(fixturePath,"utf8").replace(/^\uFEFF/,""));
const results = [];
function clone(v){return JSON.parse(JSON.stringify(v));}
function check(name,condition,detail){results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`);}
const validSpec={operation_id:"VALIDATE-PTW-001",operation:"VALIDATE",risk:"READ_ONLY",inputs:["CANONICAL_MODEL"],outputs:["VALIDATION_RESULT"],validation:["EXIT_CODE_ZERO","RESULT_VALID_TRUE"],evidence:["VALIDATION_JSON","SHA256"],rollback:"NOT_REQUIRED",timeout_seconds:60,environment:{scope:"LOCAL_ONLY",network:false}};

let model=clone(base);
let snapshot=JSON.stringify(model);
let r=buildDryRunExecutionPlan(model,"TASK-PTW-001",validSpec,{requested_mode:"READ_ONLY"});
check("dry_run_created",r.ok && r.decision==="DRY_RUN_PLAN_READY",r.code || r.decision);
check("assignment_queued",r.ok && r.plan.assignment.execution_state==="QUEUED",r.plan && r.plan.assignment.execution_state);
check("worker_selected",r.ok && r.plan.worker_id==="WORKER-LOCAL-001",r.plan && r.plan.worker_id);
check("runtime_not_executed",r.ok && r.plan.safety.runtime_execution===false && r.plan.safety.worker_started===false,String(r.plan && r.plan.safety.worker_started));
check("separate_gate_present",r.ok && r.plan.next_required_action==="SEPARATE_EXECUTION_GATE",r.plan && r.plan.next_required_action);
check("read_only_gate_classified",r.ok && r.plan.authorization.execution_authorization_required===false,r.plan && String(r.plan.authorization.execution_authorization_required));
check("input_model_immutable",JSON.stringify(model)===snapshot,"input model changed");
const integrity=r.plan.integrity_sha256;const core=clone(r.plan);delete core.integrity_sha256;
check("integrity_hash_valid",integrity===hash(core),integrity);
fs.writeFileSync(samplePath,JSON.stringify(r.plan,null,2)+"\n","utf8");

const writeSpec={...validSpec,operation_id:"GENERATE-001",operation:"GENERATE_LOCAL_ARTIFACT",risk:"LOCAL_REVERSIBLE_WRITE",rollback:"DELETE_GENERATED_ARTIFACT"};
r=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",writeSpec,{requested_mode:"READ_ONLY"});
check("write_requires_execution_authorization",r.ok && r.plan.authorization.execution_authorization_required===true && r.plan.authorization.execution_authorization_status==="PENDING_EXECUTION_AUTHORIZATION",r.plan && r.plan.authorization.execution_authorization_status);

let bad={...validSpec,inputs:[]};
r=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",bad,{requested_mode:"READ_ONLY"});
check("missing_inputs_blocked",!r.ok && r.code==="EXECUTION_SPEC_INVALID",r.code);

bad={...validSpec,outputs:[]};
r=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",bad,{requested_mode:"READ_ONLY"});
check("missing_outputs_blocked",!r.ok && r.code==="EXECUTION_SPEC_INVALID",r.code);

bad={...validSpec,validation:[]};
r=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",bad,{requested_mode:"READ_ONLY"});
check("missing_validation_blocked",!r.ok && r.code==="EXECUTION_SPEC_INVALID",r.code);

bad={...validSpec,evidence:[]};
r=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",bad,{requested_mode:"READ_ONLY"});
check("missing_evidence_blocked",!r.ok && r.code==="EXECUTION_SPEC_INVALID",r.code);

bad={...validSpec,rollback:""};
r=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",bad,{requested_mode:"READ_ONLY"});
check("missing_rollback_blocked",!r.ok && r.code==="EXECUTION_SPEC_INVALID",r.code);

bad={...validSpec,timeout_seconds:0};
r=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",bad,{requested_mode:"READ_ONLY"});
check("invalid_timeout_blocked",!r.ok && r.code==="EXECUTION_SPEC_INVALID",r.code);

bad={...validSpec,operation:"EXECUTE_LOCAL_COMMAND",risk:"READ_ONLY"};
r=buildDryRunExecutionPlan(clone(base),"TASK-PTW-001",bad,{requested_mode:"READ_ONLY"});
check("risk_mismatch_blocked",!r.ok && r.code==="EXECUTION_SPEC_INVALID",r.code);

model=clone(base);model.tasks[0].authorization_state="PENDING_HUMAN_AUTHORIZATION";
r=buildDryRunExecutionPlan(model,"TASK-PTW-001",validSpec,{requested_mode:"READ_ONLY"});
check("task_authorization_blocks_plan",!r.ok && r.code==="ASSIGNMENT_PLAN_FAILED",r.code);

r=buildDryRunExecutionPlan(clone(base),"TASK-MISSING",validSpec,{requested_mode:"READ_ONLY"});
check("missing_task_blocked",!r.ok && r.code==="ASSIGNMENT_PLAN_FAILED",r.code);

const output={valid:results.every(x=>x.passed),test_count:results.length,passed_count:results.filter(x=>x.passed).length,results,tested_at:new Date().toISOString()};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count}));
