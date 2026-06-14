'use strict';

const {spawn}=require("child_process");

function executeLocalProcess(request){
  return new Promise(resolve=>{
    const startedAt=Date.now();
    let stdout="";
    let stderr="";
    let settled=false;
    let timedOut=false;
    const child=spawn(request.executable,request.arguments,{cwd:request.cwd,shell:false,windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env}});
    const finish=result=>{if(settled)return;settled=true;resolve({...result,duration_ms:Date.now()-startedAt});};
    const timer=setTimeout(()=>{timedOut=true;try{child.kill();}catch{}},request.timeout_ms);
    child.stdout.on("data",chunk=>{stdout+=chunk.toString("utf8");});
    child.stderr.on("data",chunk=>{stderr+=chunk.toString("utf8");});
    child.on("error",error=>{clearTimeout(timer);finish({started:true,completed:false,timed_out:false,cancelled:false,exit_code:null,stdout,stderr:stderr+error.message,executor_error:true});});
    child.on("close",(code,signal)=>{clearTimeout(timer);finish({started:true,completed:!timedOut,timed_out:timedOut,cancelled:timedOut||Boolean(signal),exit_code:Number.isInteger(code)?code:null,stdout,stderr,executor_error:false,signal:signal||null});});
  });
}

module.exports={executeLocalProcess};
