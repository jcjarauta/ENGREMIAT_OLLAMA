'use strict';

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { buildAssignmentPlan } = require(path.resolve(process.argv[2]));
const fixturePath = path.resolve(process.argv[3]);
const outputPath = path.resolve(process.argv[4]);
const base = JSON.parse(fs.readFileSync(fixturePath,"utf8").replace(/^\uFEFF/,""));
const results = [];
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function check(name,condition,detail){ results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`); }

let model = clone(base);
const snapshot = JSON.stringify(model);
let r = buildAssignmentPlan(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("plan_created",r.ok && r.decision === "PLAN_READY",r.code || r.decision);
check("correct_worker_selected",r.ok && r.selected_worker_id === "WORKER-LOCAL-001",r.selected_worker_id);
check("execution_queued",r.ok && r.execution_state === "QUEUED",r.execution_state);
check("worker_not_started",r.ok && r.worker_started === false && r.runtime_execution === false,String(r.worker_started));
check("input_model_immutable",JSON.stringify(model) === snapshot,"input model changed");
check("two_events_recorded",r.ok && r.events.length === 2,String(r.events && r.events.length));

model = clone(base);
model.tasks[0].authorization_state = "PENDING_HUMAN_AUTHORIZATION";
r = buildAssignmentPlan(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("authorization_blocks_plan",!r.ok && r.code === "AUTHORIZATION_REQUIRED",r.code);

model = clone(base);
model.tasks[0].status = "BACKLOG";
r = buildAssignmentPlan(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("ready_status_required",!r.ok && r.code === "TASK_NOT_READY",r.code);

model = clone(base);
model.tasks[0].execution_state = "QUEUED";
r = buildAssignmentPlan(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("duplicate_queue_blocked",!r.ok && r.code === "EXECUTION_ALREADY_PLANNED",r.code);

model = clone(base);
model.workers[0].status = "OFFLINE";
r = buildAssignmentPlan(model,"TASK-PTW-001",{requested_mode:"READ_ONLY"});
check("offline_worker_no_go",!r.ok && r.code === "NO_ELIGIBLE_WORKER",r.code);

model = clone(base);
r = buildAssignmentPlan(model,"TASK-PTW-001",{requested_mode:"REMOTE_EXECUTION"});
check("unsupported_mode_no_go",!r.ok && r.code === "NO_ELIGIBLE_WORKER",r.code);

model = clone(base);
model.workers.push({worker_id:"WORKER-LOCAL-002",worker_type:"LOCAL_SCRIPT",status:"AVAILABLE",capabilities:["JSON_VALIDATION","LOCAL_READ_ONLY"],execution_modes:["READ_ONLY"]});
model.tasks[0].eligible_worker_ids.push("WORKER-LOCAL-002");
r = buildAssignmentPlan(model,"TASK-PTW-001",{requested_mode:"READ_ONLY",load_by_worker:{"WORKER-LOCAL-001":5,"WORKER-LOCAL-002":0}});
check("lower_load_worker_planned",r.ok && r.selected_worker_id === "WORKER-LOCAL-002",r.selected_worker_id);

model = clone(base);
r = buildAssignmentPlan(model,"TASK-MISSING",{requested_mode:"READ_ONLY"});
check("missing_task_blocked",!r.ok && r.code === "TASK_NOT_FOUND",r.code);

const output={valid:results.every(x=>x.passed),test_count:results.length,passed_count:results.filter(x=>x.passed).length,results,tested_at:new Date().toISOString()};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count}));
