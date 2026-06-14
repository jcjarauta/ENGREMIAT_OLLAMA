'use strict';
const fs=require("fs");
const path=require("path");
const {buildAssignmentPlan}=require(path.resolve(process.argv[2]));
const model=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),"utf8").replace(/^\uFEFF/,""));
const plan=JSON.parse(fs.readFileSync(path.resolve(process.argv[4]),"utf8").replace(/^\uFEFF/,""));
const result=buildAssignmentPlan(model,plan.task_id,{requested_mode:plan.execution_mode});
if(!result.ok){console.error(JSON.stringify(result));process.exit(1);}
plan.__planned_model=result.planned_model;
fs.writeFileSync(path.resolve(process.argv[5]),JSON.stringify(plan,null,2)+"\n","utf8");
