'use strict';
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {spawn}=require("child_process");
function readJson(file){return JSON.parse(fs.readFileSync(path.resolve(file),"utf8").replace(/^\uFEFF/,""));}
function sha(text){return crypto.createHash("sha256").update(text).digest("hex").toUpperCase();}
function write(file,value){fs.writeFileSync(path.resolve(file),JSON.stringify(value,null,2)+"\n","utf8");}
const manifest=readJson(process.argv[2]);
const outputPath=path.resolve(process.argv[3]);
const stdoutPath=path.resolve(process.argv[4]);
const stderrPath=path.resolve(process.argv[5]);
const workspace=path.resolve(manifest.isolated_working_directory);
const clinePath=path.resolve(manifest.cline_wrapper_path);
const expectedName=path.basename(manifest.expected_output_absolute);
const prompt=`Work only inside the current directory. Create exactly one file named ${expectedName}. Its complete JSON content must contain exactly these three fields: schema_version with value 1.0, task_id with value TASK-CLINE-004-SMOKE-001, and result with value CONTROLLED_CLINE_TASK_SMOKE_OK. Do not create, read, modify, rename, or delete any other file. Do not run Git. Do not invoke network tools yourself. Stop immediately after creating and validating that single JSON file.`;
const clineArgs=["--json","--cwd",workspace,"--timeout","120","--auto-approve","true",prompt];
const processArgs=["-NoProfile","-ExecutionPolicy","Bypass","-File",clinePath,...clineArgs];
const startedAt=Date.now();
let stdout="";let stderr="";let settled=false;let timedOut=false;
const child=spawn("powershell.exe",processArgs,{cwd:workspace,shell:false,windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env}});
const finish=result=>{if(settled)return;settled=true;fs.writeFileSync(stdoutPath,stdout,"utf8");fs.writeFileSync(stderrPath,stderr,"utf8");const core={schema_version:"1.0",execution_id:"CONTROLLED-CLINE-PROCESS-004-001",executable:"powershell.exe",wrapper_path:clinePath,arguments:["-NoProfile","-ExecutionPolicy","Bypass","-File","{CLINE_WRAPPER}","--json","--cwd","{ISOLATED_WORKSPACE}","--timeout","120","--auto-approve","true","{TASK_PROMPT_REDACTED}"],shell:false,working_directory:workspace,process_started:true,process_completed:result.completed,timed_out:result.timed_out,cancelled:result.cancelled,exit_code:result.exit_code,signal:result.signal||null,duration_ms:Date.now()-startedAt,stdout_length:stdout.length,stderr_length:stderr.length,stdout_sha256:sha(stdout),stderr_sha256:sha(stderr),executor_error:result.executor_error||false,executor_error_message:result.executor_error_message||null,task_dispatched:true,prompt_submitted:true,automatic_retry:false};write(outputPath,{...core,integrity_sha256:sha(JSON.stringify(core))});};
const timer=setTimeout(()=>{timedOut=true;try{child.kill();}catch{}},150000);
child.stdout.on("data",chunk=>{stdout+=chunk.toString("utf8");});
child.stderr.on("data",chunk=>{stderr+=chunk.toString("utf8");});
child.on("error",error=>{clearTimeout(timer);finish({completed:false,timed_out:false,cancelled:false,exit_code:null,signal:null,executor_error:true,executor_error_message:error.message});process.exitCode=1;});
child.on("close",(code,signal)=>{clearTimeout(timer);finish({completed:!timedOut,timed_out:timedOut,cancelled:timedOut||Boolean(signal),exit_code:Number.isInteger(code)?code:null,signal,executor_error:false});});
