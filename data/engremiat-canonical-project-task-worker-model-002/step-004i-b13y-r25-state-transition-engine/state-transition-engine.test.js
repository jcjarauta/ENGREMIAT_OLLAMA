'use strict';

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const engine = require(path.resolve(process.argv[2]));
const fixturePath = path.resolve(process.argv[3]);
const outputPath = path.resolve(process.argv[4]);
const base = JSON.parse(fs.readFileSync(fixturePath,"utf8").replace(/^\uFEFF/,""));
const results = [];
function check(name, condition, detail) { results.push({ name, passed: Boolean(condition), detail }); assert.ok(condition,`${name}: ${detail}`); }

let model = JSON.parse(JSON.stringify(base));
let r = engine.setAuthorization(model,"TASK-PTW-001","AUTHORIZED","HUMAN-TEST");
check("authorization_allowed",r.ok,r.code || "OK");model = r.model;
r = engine.transitionExecutionState(model,"TASK-PTW-001","QUEUED","TEST");
check("queue_allowed",r.ok,r.code || "OK");model = r.model;
r = engine.transitionTaskStatus(model,"TASK-PTW-001","IN_PROGRESS","TEST");
check("in_progress_allowed",r.ok,r.code || "OK");model = r.model;
r = engine.transitionExecutionState(model,"TASK-PTW-001","RUNNING","TEST");
check("running_allowed",r.ok,r.code || "OK");model = r.model;
r = engine.transitionExecutionState(model,"TASK-PTW-001","TERMINAL_SUCCESS","TEST");
check("terminal_success_allowed",r.ok,r.code || "OK");model = r.model;
r = engine.transitionTaskStatus(model,"TASK-PTW-001","REVIEW","TEST");
check("review_allowed",r.ok,r.code || "OK");model = r.model;
r = engine.transitionTaskStatus(model,"TASK-PTW-001","COMPLETED","TEST");
check("completed_allowed",r.ok,r.code || "OK");model = r.model;

r = engine.transitionTaskStatus(model,"TASK-PTW-001","IN_PROGRESS","TEST");
check("terminal_task_cannot_restart",!r.ok && r.code === "TASK_TRANSITION_NOT_ALLOWED",r.code);

let unauthorized = JSON.parse(JSON.stringify(base));
unauthorized.tasks[0].authorization_state = "PENDING_HUMAN_AUTHORIZATION";
r = engine.transitionExecutionState(unauthorized,"TASK-PTW-001","QUEUED","TEST");
check("queue_requires_authorization",!r.ok && r.code === "EXECUTION_AUTHORIZATION_REQUIRED",r.code);

let badWorker = JSON.parse(JSON.stringify(base));
badWorker.workers.push({ worker_id:"WORKER-BAD-001",worker_type:"LOCAL_SCRIPT",status:"AVAILABLE",capabilities:["LOCAL_READ_ONLY"],execution_modes:["READ_ONLY"] });
r = engine.assignWorker(badWorker,"TASK-PTW-001","WORKER-BAD-001","TEST");
check("worker_requires_capabilities",!r.ok && r.code === "WORKER_CAPABILITY_MISMATCH",r.code);

let offlineWorker = JSON.parse(JSON.stringify(base));
offlineWorker.workers[0].status = "OFFLINE";
r = engine.assignWorker(offlineWorker,"TASK-PTW-001","WORKER-LOCAL-001","TEST");
check("worker_must_be_available",!r.ok && r.code === "WORKER_NOT_AVAILABLE",r.code);

let prematureReview = JSON.parse(JSON.stringify(base));
prematureReview.tasks[0].status = "IN_PROGRESS";
prematureReview.tasks[0].execution_state = "RUNNING";
r = engine.transitionTaskStatus(prematureReview,"TASK-PTW-001","REVIEW","TEST");
check("review_requires_success",!r.ok && r.code === "REVIEW_REQUIRES_TERMINAL_SUCCESS",r.code);

const output = { valid: results.every(x => x.passed), test_count: results.length, passed_count: results.filter(x => x.passed).length, results, final_model: model, tested_at: new Date().toISOString() };
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({ valid:output.valid,test_count:output.test_count,passed_count:output.passed_count }));
