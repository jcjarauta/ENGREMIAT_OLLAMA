'use strict';
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
function readText(file){try{return fs.readFileSync(file,"utf8").replace(/^\uFEFF/,"");}catch{return null;}}
function shaBuffer(buffer){return crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();}
function unique(values){return [...new Set(values.filter(Boolean))];}
function isLikelyText(buffer){const sample=buffer.subarray(0,Math.min(buffer.length,8192));let binary=0;for(const byte of sample){if(byte===0)binary++;}return binary===0;}
function collectFiles(root,maxFiles=250){const files=[];function visit(current,depth){if(files.length>=maxFiles||depth>5)return;let entries=[];try{entries=fs.readdirSync(current,{withFileTypes:true});}catch{return;}for(const entry of entries){if(files.length>=maxFiles)return;if(["node_modules",".git","coverage"].includes(entry.name))continue;const full=path.join(current,entry.name);if(entry.isDirectory()){visit(full,depth+1);continue;}files.push(full);}}visit(root,0);return files;}
const packageRoot=path.resolve(process.argv[2]);
const wrapperPath=path.resolve(process.argv[3]);
const helpPath=path.resolve(process.argv[4]);
const outputPath=path.resolve(process.argv[5]);
const packagePath=path.join(packageRoot,"package.json");
const pkg=JSON.parse(readText(packagePath));
const wrapper=readText(wrapperPath)||"";
const help=readText(helpPath)||"";
const binEntries=[];
if(typeof pkg.bin==="string")binEntries.push({name:pkg.name||"cline",target:pkg.bin});
else if(pkg.bin&&typeof pkg.bin==="object")for(const [name,target] of Object.entries(pkg.bin))binEntries.push({name,target});
const directTargets=[];
for(const entry of binEntries){const absolute=path.resolve(packageRoot,entry.target);directTargets.push({source:"PACKAGE_BIN",name:entry.name,declared_target:entry.target,absolute});}
const wrapperPaths=[...wrapper.matchAll(/["'`]([^"'`]*(?:node_modules|cline)[^"'`]*(?:\.js|\.cjs|\.mjs|\.exe|\.cmd|\.ps1)?)["'`]/gi)].map(match=>match[1]);
for(const candidate of wrapperPaths){const absolute=path.isAbsolute(candidate)?candidate:path.resolve(path.dirname(wrapperPath),candidate);directTargets.push({source:"WRAPPER_REFERENCE",name:null,declared_target:candidate,absolute});}
const packageFiles=collectFiles(packageRoot,250);
const prioritized=unique([...directTargets.map(item=>item.absolute),...packageFiles.filter(file=>{const base=path.basename(file).toLowerCase();return /cline|cli|index|main|bin|command|entry/.test(base);}),...packageFiles]);
const evidence=[];
const candidates=[];
const allFlags=[];
let inspected=0;
for(const file of prioritized){if(inspected>=250||!fs.existsSync(file))continue;let stat;try{stat=fs.statSync(file);}catch{continue;}if(!stat.isFile()||stat.size>25*1024*1024)continue;let buffer;try{buffer=fs.readFileSync(file);}catch{continue;}const textLike=isLikelyText(buffer);const relative=path.relative(packageRoot,file).replace(/\\/g,"/");const item={file:relative||path.basename(file),absolute:file,size_bytes:stat.size,sha256:shaBuffer(buffer),text_like:textLike,matches:{}};inspected++;if(textLike){const text=buffer.toString("utf8");const flagMatches=unique([...text.matchAll(/(?<![\w-])--[a-zA-Z0-9][a-zA-Z0-9-]*/g)].map(match=>match[0].toLowerCase()));const commandMatches=unique([...text.matchAll(/\.(?:command|addCommand)\s*\(\s*["'`]([^"'`]+)["'`]/g)].map(match=>match[1]));const positionalMatches=unique([...text.matchAll(/["'`]([^"'`]*(?:<|\[)(?:prompt|task|message|input)[^"'`]*(?:>|\]))[^"'`]*["'`]/gi)].map(match=>match[1]));const promptFlags=flagMatches.filter(flag=>/^--(?:prompt|message|input|task)$/.test(flag));const nonInteractiveFlags=flagMatches.filter(flag=>/^--(?:yes|yolo|auto-approve|approve-all|non-interactive|headless|unattended)$/.test(flag));const structuredFlags=flagMatches.filter(flag=>/^--(?:json|output-json|format|output-format)$/.test(flag));const taskCommands=commandMatches.filter(value=>/(task|run|execute|start|new|prompt)/i.test(value));if(flagMatches.length)item.matches.flags=flagMatches;if(commandMatches.length)item.matches.commands=commandMatches;if(positionalMatches.length)item.matches.positional=positionalMatches;if(promptFlags.length)item.matches.prompt_flags=promptFlags;if(nonInteractiveFlags.length)item.matches.noninteractive_flags=nonInteractiveFlags;if(structuredFlags.length)item.matches.structured_flags=structuredFlags;if(taskCommands.length)item.matches.task_commands=taskCommands;allFlags.push(...flagMatches);for(const value of taskCommands)candidates.push({type:"TASK_COMMAND",syntax:value,file:relative});for(const value of positionalMatches)candidates.push({type:"POSITIONAL_ARGUMENT",syntax:value,file:relative});for(const value of promptFlags)candidates.push({type:"PROMPT_OPTION",syntax:value+" {TASK_PROMPT}",file:relative});}
if(Object.keys(item.matches).length||directTargets.some(target=>path.resolve(target.absolute)===path.resolve(file)))evidence.push(item);
}

const normalizedCandidates=[];for(const candidate of candidates){if(!normalizedCandidates.some(item=>item.type===candidate.type&&item.syntax===candidate.syntax))normalizedCandidates.push(candidate);}
const helpPromptEvidence=unique([...help.matchAll(/(?<![\w-])--(?:prompt|message|input|task)\b/gi)].map(match=>match[0].toLowerCase()));
for(const value of helpPromptEvidence){if(!normalizedCandidates.some(item=>item.type==="PROMPT_OPTION"&&item.syntax===value+" {TASK_PROMPT}"))normalizedCandidates.push({type:"PROMPT_OPTION",syntax:value+" {TASK_PROMPT}",file:"CAPTURED_HELP"});}
const exact=normalizedCandidates.length===1;
const result={schema_version:"1.0",inspection_id:"CLINE-DIRECT-BIN-INTERFACE-004-001",package:{root:packageRoot,name:pkg.name||null,version:pkg.version||null,package_json_sha256:shaBuffer(fs.readFileSync(packagePath)),bin_entries:binEntries.map(entry=>({name:entry.name,target:entry.target,absolute:path.resolve(packageRoot,entry.target),exists:fs.existsSync(path.resolve(packageRoot,entry.target))}))},wrapper:{path:wrapperPath,sha256:shaBuffer(fs.readFileSync(wrapperPath)),references:wrapperPaths,content_included:false},scan:{package_files_found:packageFiles.length,files_inspected:inspected,evidence_files:evidence.length,direct_target_count:directTargets.length,evidence},flags:unique(allFlags),candidates:normalizedCandidates,candidate_count:normalizedCandidates.length,exact_task_interface_resolved:exact,confidence:exact?"HIGH":normalizedCandidates.length>0?"MEDIUM":"LOW",cline_invoked:false,process_started:false,task_dispatched:false,prompt_submitted:false,session_content_read:false,metadata_modified:false};
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:true,package:result.package.name,version:result.package.version,package_files_found:result.scan.package_files_found,files_inspected:result.scan.files_inspected,direct_target_count:result.scan.direct_target_count,evidence_files:result.scan.evidence_files,candidate_count:result.candidate_count,exact:result.exact_task_interface_resolved,confidence:result.confidence}));
