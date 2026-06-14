'use strict';

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { selectWorker } = require(path.resolve(process.argv[2]));
const fixturePath = path.resolve(process.argv[3]);
const outputPath = path.resolve(process.argv[4]);
const base = JSON.parse(fs.readFileSync(fixturePath,"utf8").replace(/^\uFEFF/,""));
const results = [];
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function check(name,condition,detail){ results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`); }

let model = clone(base);
let r = selectWorker(model,"TASK-PTW-001",{ requested_mode:"READ_ONLY" });
check("single_worker_selected",r.ok && r.worker_id === "WORKER-LOCAL-001",r.code || r.worker_id);
check("read_only_mode_selected",r.ok && r.execution_mode === "READ_ONLY",r.execution_mode);

model = clone(base);
model.workers.push({worker_id:"WORKER-LOCAL-002",worker_type:"LOCAL_SCRIPT",status:"AVAILABLE",capabilities:["JSON_VALIDATION","LOCAL_READ_ONLY"],execution_modes:["READ_ONLY"]});
model.tasks[0].eligible_worker_ids.push("WORKER-LOCAL-002");
r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY",load_by_worker:{"WORKER-LOCAL-001":4,"WORKER-LOCAL-002":0}});
check("lower_load_selected",r.ok && r.worker_id === "WORKER-LOCAL-002",r.worker_id);

r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY",load_by_worker:{"WORKER-LOCAL-001":0,"WORKER-LOCAL-002":0},preferred_worker_ids:["WORKER-LOCAL-001"]});
check("preferred_worker_selected",r.ok && r.worker_id === "WORKER-LOCAL-001",r.worker_id);

model = clone(base);
model.tasks[0].authorization_state = "PENDING_HUMAN_AUTHORIZATION";
r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("authorization_gate_blocks",!r.ok && r.code === "AUTHORIZATION_REQUIRED",r.code);

model = clone(base);
model.workers[0].status = "OFFLINE";
r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("offline_worker_blocked",!r.ok && r.code === "NO_ELIGIBLE_WORKER",r.code);

model = clone(base);
model.workers[0].capabilities = ["LOCAL_READ_ONLY"];
r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("capability_mismatch_blocked",!r.ok && r.code === "MODEL_INVALID",r.code);

model = clone(base);
r = selectWorker(model,"TASK-PTW-001",{requested_mode:"REMOTE_EXECUTION"});
check("unsupported_mode_blocked",!r.ok && r.code === "NO_ELIGIBLE_WORKER",r.code);

model = clone(base);
model.tasks[0].eligible_worker_ids = [];
r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("undeclared_worker_blocked",!r.ok && r.code === "NO_ELIGIBLE_WORKER",r.code);

r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY",require_declared_eligibility:false});
check("dynamic_eligibility_allowed",r.ok && r.worker_id === "WORKER-LOCAL-001",r.code || r.worker_id);

model = clone(base);
model.tasks[0].status = "COMPLETED";
model.tasks[0].execution_state = "TERMINAL_SUCCESS";
r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("completed_task_blocked",!r.ok && r.code === "TASK_TERMINAL",r.code);

model = clone(base);
model.workers.push({worker_id:"WORKER-LOCAL-000",worker_type:"LOCAL_SCRIPT",status:"AVAILABLE",capabilities:["JSON_VALIDATION","LOCAL_READ_ONLY"],execution_modes:["READ_ONLY"]});
model.tasks[0].eligible_worker_ids.push("WORKER-LOCAL-000");
r = selectWorker(model,"TASK-PTW-001",{requested_mode:"READ_ONLY",load_by_worker:{"WORKER-LOCAL-000":0,"WORKER-LOCAL-001":0}});
check("stable_id_tiebreaker",r.ok && r.worker_id === "WORKER-LOCAL-000",r.worker_id);

const output={valid:results.every(x=>x.passed),test_count:results.length,passed_count:results.filter(x=>x.passed).length,results,tested_at:new Date().toISOString()};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count}));
