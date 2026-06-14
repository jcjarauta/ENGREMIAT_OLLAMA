'use strict';

const fs=require("fs");
const path=require("path");
const assert=require("assert");
const {runControlled,hashObject}=require(path.resolve(process.argv[2]));
const preflight=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]),"utf8").replace(/^\uFEFF/,""));
const outputPath=path.resolve(process.argv[4]);
const successPath=path.resolve(process.argv[5]);
const errorPath=path.resolve(process.argv[6]);
const timeoutPath=path.resolve(process.argv[7]);
const results=[];
function clone(v){return JSON.parse(JSON.stringify(v));}
function check(name,condition,detail){results.push({name,passed:Boolean(condition),detail});assert.ok(condition,`${name}: ${detail}`);}
function integrityValid(result){const core=clone(result);const digest=core.integrity_sha256;delete core.integrity_sha256;return digest===hashObject(core);}
const successExecutor=async()=>({started:true,completed:true,timed_out:false,cancelled:false,exit_code:0,stdout:"syntax ok\n",stderr:"",duration_ms:12});
const errorExecutor=async()=>({started:true,completed:true,timed_out:false,cancelled:false,exit_code:1,stdout:"",stderr:"syntax error\n",duration_ms:9});
const timeoutExecutor=async()=>({started:true,completed:false,timed_out:true,cancelled:true,exit_code:null,stdout:"partial\n",stderr:"timeout\n",duration_ms:30000});
const throwingExecutor=async()=>{throw new Error("executor failure");};

(async()=>{
let r=await runControlled(clone(preflight),"AUTHORIZED",successExecutor,{repository_root:process.cwd()});
check("authorized_success_completed",r.ok&&r.result.terminal_execution_state==="TERMINAL_SUCCESS",r.code||r.result.terminal_execution_state);
check("zero_exit_successful",r.result.exit_code_policy.exit_code_allowed===true&&r.result.exit_code_policy.exit_code_successful===true,String(r.result.exit_code_policy.exit_code_successful));
check("success_process_started",r.process_started===true&&r.command_executed===true,String(r.process_started));
check("success_exit_code_captured",r.result.process.exit_code===0,String(r.result.process.exit_code));
check("stdout_hash_created",r.result.output.stdout_sha256.length===64,r.result.output.stdout_sha256);
check("stderr_hash_created",r.result.output.stderr_sha256.length===64,r.result.output.stderr_sha256);
check("success_integrity_valid",integrityValid(r.result),r.result.integrity_sha256);
check("shell_and_network_disabled",r.result.safety.shell===false&&r.result.safety.use_shell_execute===false&&r.result.safety.network===false,String(r.result.safety.shell));
fs.writeFileSync(successPath,JSON.stringify(r.result,null,2)+"\n","utf8");

r=await runControlled(clone(preflight),"PENDING_EXECUTION_AUTHORIZATION",successExecutor,{repository_root:process.cwd()});
check("authorization_gate_blocks",!r.ok&&r.code==="EXECUTION_AUTHORIZATION_REQUIRED"&&r.process_started===false,r.code);

r=await runControlled(clone(preflight),"AUTHORIZED",errorExecutor,{repository_root:process.cwd()});
check("nonzero_exit_maps_error",!r.ok&&r.result.terminal_execution_state==="TERMINAL_ERROR",r.result&&r.result.terminal_execution_state);
check("exit_one_allowed_but_not_success",r.result.exit_code_policy.exit_code_allowed===true&&r.result.exit_code_policy.exit_code_successful===false,String(r.result.exit_code_policy.exit_code_successful));
check("stderr_captured",r.result.output.stderr.includes("syntax error"),r.result.output.stderr);
check("error_integrity_valid",integrityValid(r.result),r.result.integrity_sha256);
fs.writeFileSync(errorPath,JSON.stringify(r.result,null,2)+"\n","utf8");

r=await runControlled(clone(preflight),"AUTHORIZED",timeoutExecutor,{repository_root:process.cwd()});
check("timeout_maps_cancelled",!r.ok&&r.result.terminal_execution_state==="CANCELLED"&&r.result.process.timed_out===true,r.result&&r.result.terminal_execution_state);
check("timeout_integrity_valid",integrityValid(r.result),r.result.integrity_sha256);
fs.writeFileSync(timeoutPath,JSON.stringify(r.result,null,2)+"\n","utf8");

r=await runControlled(clone(preflight),"AUTHORIZED",throwingExecutor,{repository_root:process.cwd()});
check("executor_exception_maps_error",!r.ok&&r.result.terminal_execution_state==="TERMINAL_ERROR"&&r.result.process.executor_error===true,r.result&&r.result.terminal_execution_state);

const bad=clone(preflight);bad.safety.shell_interpolation=true;r=await runControlled(bad,"AUTHORIZED",successExecutor,{repository_root:process.cwd()});
check("unsafe_preflight_blocked",!r.ok&&r.code==="PREFLIGHT_INVALID",r.code);

const badExecutable=clone(preflight);badExecutable.executable="powershell";r=await runControlled(badExecutable,"AUTHORIZED",successExecutor,{repository_root:process.cwd()});
check("unregistered_executable_blocked",!r.ok&&r.code==="EXECUTABLE_NOT_ALLOWED",r.code);

const badPolicy=clone(preflight);badPolicy.allowed_exit_codes=[0];badPolicy.success_exit_codes=[1];r=await runControlled(badPolicy,"AUTHORIZED",successExecutor,{repository_root:process.cwd()});
check("invalid_exit_policy_blocked",!r.ok&&r.code==="SUCCESS_EXIT_CODE_NOT_ALLOWED",r.code);

const output={valid:results.every(item=>item.passed),test_count:results.length,passed_count:results.filter(item=>item.passed).length,results,real_process_started:false,real_command_executed:false,tested_at:new Date().toISOString()};
fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:output.valid,test_count:output.test_count,passed_count:output.passed_count,real_process_started:false}));
})().catch(error=>{console.error(error.stack||error.message);process.exit(1);});
