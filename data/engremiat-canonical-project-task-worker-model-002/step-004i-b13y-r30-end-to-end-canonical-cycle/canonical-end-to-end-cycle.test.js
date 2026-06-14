'use strict';

const fs=require("fs");
const path=require("path");
const assert=require("assert");
const {runCanonicalCycle,hash}=require(path.resolve(process.argv[2]));
const fixturePath=path.resolve(process.argv[3]);
const outputPath=path.resolve(process.argv[4]);
const cyclePath=path.resolve(process.argv[5]);
const base=JSON.parse(fs.readFileSync(fixturePath,"utf8").replace(/^\uFEFF/,""));
const results=[];
function clone(v){return JSON.parse(JSON.stringify(v));}
function check(name,condition,detail){results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`);}
function integrityValid(evidence){const core=clone(evidence);const digest=core.integrity_sha256;delete core.integrity_sha256;return digest===hash(core);}
const spec={operation_id:"E2E-VALIDATE-001",operation:"VALIDATE",risk:"READ_ONLY",inputs:["CANONICAL_MODEL"],outputs:["CANONICAL_CYCLE_RESULT"],validation:["FINAL_MODEL_VALID","FINAL_TASK_REVIEW","FINAL_EXECUTION_TERMINAL_SUCCESS"],evidence:["END_TO_END_EVIDENCE","SHA256_CHAIN"],rollback:"NOT_REQUIRED_SIMULATION_ONLY",timeout_seconds:60,environment:{scope:"LOCAL_ONLY",network:false}};

let input=clone(base);
const snapshot=JSON.stringify(input);
let r=runCanonicalCycle(input,"TASK-PTW-001",spec,{requested_mode:"READ_ONLY",outcome:"SUCCESS"});
check("cycle_completed",r.ok&&r.decision==="CANONICAL_CYCLE_COMPLETE",r.code||r.decision);
check("project_preserved",r.ok&&r.evidence.project_id==="PROJECT-PTW-001",r.evidence&&r.evidence.project_id);
check("task_preserved",r.ok&&r.evidence.task_id==="TASK-PTW-001",r.evidence&&r.evidence.task_id);
check("worker_selected",r.ok&&r.evidence.worker_id==="WORKER-LOCAL-001",r.evidence&&r.evidence.worker_id);
check("six_stages_recorded",r.ok&&r.evidence.stages.length===6,String(r.evidence&&r.evidence.stages.length));
check("final_task_review",r.ok&&r.evidence.final_task_status==="REVIEW",r.evidence&&r.evidence.final_task_status);
check("final_execution_success",r.ok&&r.evidence.final_execution_state==="TERMINAL_SUCCESS",r.evidence&&r.evidence.final_execution_state);
check("separate_gate_preserved",r.ok&&r.evidence.authorization.separate_execution_gate_present===true,String(r.evidence&&r.evidence.authorization.separate_execution_gate_present));
check("no_real_execution",r.ok&&r.evidence.safety.runtime_execution===false&&r.evidence.safety.worker_started===false&&r.evidence.safety.process_started===false,String(r.evidence&&r.evidence.safety.process_started));
check("no_external_integrations",r.ok&&r.evidence.safety.external_network===false&&r.evidence.safety.ollama_invoked===false&&r.evidence.safety.cline_invoked===false,String(r.evidence&&r.evidence.safety.external_network));
check("input_immutable",JSON.stringify(input)===snapshot,"input model changed");
check("integrity_chain_valid",r.ok&&integrityValid(r.evidence),r.evidence&&r.evidence.integrity_sha256);
fs.writeFileSync(cyclePath,JSON.stringify(r.evidence,null,2)+"\n","utf8");

let bad=clone(base);bad.tasks[0].authorization_state="PENDING_HUMAN_AUTHORIZATION";
r=runCanonicalCycle(bad,"TASK-PTW-001",spec,{requested_mode:"READ_ONLY",outcome:"SUCCESS"});
check("authorization_gate_blocks_cycle",!r.ok&&r.stage==="DRY_RUN_PLAN",r.stage);

bad=clone(base);bad.tasks[0].project_id="PROJECT-MISSING";
r=runCanonicalCycle(bad,"TASK-PTW-001",spec,{requested_mode:"READ_ONLY",outcome:"SUCCESS"});
check("invalid_initial_model_blocked",!r.ok&&r.stage==="INITIAL_VALIDATION",r.stage);

r=runCanonicalCycle(clone(base),"TASK-MISSING",spec,{requested_mode:"READ_ONLY",outcome:"SUCCESS"});
check("missing_task_blocked",!r.ok&&r.stage==="DRY_RUN_PLAN",r.stage);

r=runCanonicalCycle(clone(base),"TASK-PTW-001",spec,{requested_mode:"READ_ONLY",outcome:"UNKNOWN"});
check("invalid_outcome_blocked",!r.ok&&r.stage==="SIMULATED_LIFECYCLE",r.stage);

const output={valid:results.every(item=>item.passed),test_count:results.length,passed_count:results.filter(item=>item.passed).length,results,tested_at:new Date().toISOString()};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count}));
