'use strict';

const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {buildPreflight}=require(path.resolve(process.argv[2]));
const {runControlled}=require(path.resolve(process.argv[3]));
const {executeLocalProcess}=require(path.resolve(process.argv[4]));
const {buildDryRunExecutionPlan}=require(path.resolve(process.argv[5]));
const {integrateControlledRun}=require(path.resolve(process.argv[6]));
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});return value;}
function hash(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase();}
function read(file){return JSON.parse(fs.readFileSync(path.resolve(file),"utf8").replace(/^\uFEFF/,""));}
function write(file,value){fs.writeFileSync(path.resolve(file),JSON.stringify(value,null,2)+"\n","utf8");}

(async()=>{
  const registry=read(process.argv[7]);const request=read(process.argv[8]);const base=read(process.argv[9]);const repositoryRoot=path.resolve(process.argv[10]);
  const preflightDecision=buildPreflight(registry,request,repositoryRoot);if(!preflightDecision.ok)throw new Error(`PREFLIGHT_FAILED:${preflightDecision.code}`);
  write(process.argv[11],preflightDecision.preflight);
  const runner=await runControlled(preflightDecision.preflight,"AUTHORIZED",executeLocalProcess,{repository_root:repositoryRoot});if(!runner.result)throw new Error(`RUNNER_FAILED:${runner.code||runner.decision}`);write(process.argv[12],runner.result);
  const spec={operation_id:"RUN_NODE_CHECK",operation:"VALIDATE",risk:"READ_ONLY",inputs:["TARGET_JS_FILE"],outputs:["NODE_CHECK_RESULT"],validation:["EXIT_CODE_ZERO","OUTPUT_CAPTURED"],evidence:["REAL_PROCESS_RESULT","CANONICAL_FINAL_MODEL"],rollback:"NOT_REQUIRED_READ_ONLY",timeout_seconds:30,environment:{scope:"LOCAL_ONLY",network:false}};
  const prepared=buildDryRunExecutionPlan(base,"TASK-PTW-001",spec,{requested_mode:"READ_ONLY"});if(!prepared.ok)throw new Error(`PLAN_FAILED:${prepared.code||prepared.decision}`);
  const integration=integrateControlledRun(prepared.plan,prepared.planned_model,runner.result,{actor:"AUTHORIZED_LOCAL_SCRIPT_SMOKE"});if(!integration.ok)throw new Error(`INTEGRATION_FAILED:${integration.code||integration.decision}`);write(process.argv[13],integration.result);
  const core={schema_version:"1.0",smoke_id:"REAL-LOCAL-SCRIPT-SMOKE-003-001-R1",authorization_reused:true,previous_attempt_process_started:false,operation_id:"RUN_NODE_CHECK",target_file:request.arguments.target_file,process_started:runner.result.process.started,process_completed:runner.result.process.completed,command_executed:runner.result.process.started,exit_code:runner.result.process.exit_code,timed_out:runner.result.process.timed_out,duration_ms:runner.result.process.duration_ms,stdout_sha256:runner.result.output.stdout_sha256,stderr_sha256:runner.result.output.stderr_sha256,runner_terminal_execution_state:runner.result.terminal_execution_state,canonical_terminal_execution_state:integration.result.canonical_terminal_execution_state,final_task_status:integration.result.final_task_status,runner_integrity_sha256:runner.result.integrity_sha256,integration_integrity_sha256:integration.result.integrity_sha256,safety:{shell:false,network:false,destructive:false,external_network:false}};
  const result={...core,integrity_sha256:hash(core)};write(process.argv[14],result);
  if(result.exit_code!==0||result.timed_out||result.runner_terminal_execution_state!=="TERMINAL_SUCCESS"||result.final_task_status!=="REVIEW")throw new Error("SMOKE_NOT_SUCCESSFUL");
  console.log(JSON.stringify({valid:true,process_started:true,exit_code:result.exit_code,terminal:result.runner_terminal_execution_state,task_status:result.final_task_status}));
})().catch(error=>{console.error(error.stack||error.message);process.exit(1);});
