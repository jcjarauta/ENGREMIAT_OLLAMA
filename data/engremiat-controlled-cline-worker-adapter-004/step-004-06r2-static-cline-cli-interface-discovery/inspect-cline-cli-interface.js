'use strict';
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
function read(file){return fs.readFileSync(file,"utf8").replace(/^\uFEFF/,"");}
function sha(text){return crypto.createHash("sha256").update(text).digest("hex").toUpperCase();}
function unique(values){return [...new Set(values.filter(Boolean))];}
function walk(root,maxFiles=120){const output=[];function visit(dir){if(output.length>=maxFiles)return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(output.length>=maxFiles)return;if(["node_modules",".git","test","tests","__tests__","coverage"].includes(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory()){visit(full);continue;}if(/\.(?:js|cjs|mjs|ts)$/.test(entry.name))output.push(full);}}visit(root);return output;}
const packageRoot=path.resolve(process.argv[2]);
const wrapperPath=path.resolve(process.argv[3]);
const helpPath=path.resolve(process.argv[4]);
const outputPath=path.resolve(process.argv[5]);
const packagePath=path.join(packageRoot,"package.json");
const pkg=JSON.parse(read(packagePath));
const wrapper=read(wrapperPath);
const help=read(helpPath);
const binEntries=[];
if(typeof pkg.bin==="string")binEntries.push({name:pkg.name||"cline",target:pkg.bin});else if(pkg.bin&&typeof pkg.bin==="object")for(const [name,target] of Object.entries(pkg.bin))binEntries.push({name,target});
const binTargets=binEntries.map(item=>({...item,absolute:path.resolve(packageRoot,item.target),exists:fs.existsSync(path.resolve(packageRoot,item.target))}));
const roots=unique([path.join(packageRoot,"bin"),path.join(packageRoot,"dist"),path.join(packageRoot,"build"),path.join(packageRoot,"src"),...binTargets.map(item=>path.dirname(item.absolute))]).filter(fs.existsSync);
const files=unique(roots.flatMap(root=>walk(root))).slice(0,120);
const patterns={prompt_option:/[\"'`]--(?:prompt|message|input|task)[\"'`]/gi,noninteractive_option:/[\"'`]--(?:yes|yolo|auto-approve|approve-all|non-interactive|headless|unattended)[\"'`]/gi,structured_option:/[\"'`]--(?:json|output-json|format|output-format)[\"'`]/gi,task_command:/\.(?:command|addCommand)\s*\(\s*[\"'`]([^\"'`]*(?:task|run|execute|start|new|prompt)[^\"'`]*)[\"'`]/gi,positional_command:/\.(?:command|arguments?)\s*\(\s*[\"'`]([^\"'`]*[<\[][^>\\]]*(?:prompt|task|message|input)[^>\\]]*[>\\]][^\"'`]*)[\"'`]/gi,stdin_usage:/process\.stdin|readline|stdin/gi,commander:/require\([\"'`]commander[\"'`]\)|from\s+[\"'`]commander[\"'`]/gi,yargs:/require\([\"'`]yargs|from\s+[\"'`]yargs/gi,network_client:/fetch\s*\(|axios|https?\.request|WebSocket/gi};
const evidence=[];
const aggregated={prompt_flags:[],noninteractive_flags:[],structured_flags:[],task_commands:[],positional_contracts:[],stdin_files:[],parser_files:[],network_client_files:[]};
for(const file of files){let text;try{text=read(file);}catch{continue;}const relative=path.relative(packageRoot,file).replace(/\\/g,"/");const item={file:relative,sha256:sha(text),matches:{}};for(const [name,regexTemplate] of Object.entries(patterns)){const regex=new RegExp(regexTemplate.source,regexTemplate.flags);const matches=[];let match;while((match=regex.exec(text))&&matches.length<20)matches.push(match[1]||match[0]);if(matches.length)item.matches[name]=unique(matches);}if(Object.keys(item.matches).length){evidence.push(item);aggregated.prompt_flags.push(...(item.matches.prompt_option||[]));aggregated.noninteractive_flags.push(...(item.matches.noninteractive_option||[]));aggregated.structured_flags.push(...(item.matches.structured_option||[]));aggregated.task_commands.push(...(item.matches.task_command||[]));aggregated.positional_contracts.push(...(item.matches.positional_command||[]));if(item.matches.stdin_usage)aggregated.stdin_files.push(relative);if(item.matches.commander||item.matches.yargs)aggregated.parser_files.push(relative);if(item.matches.network_client)aggregated.network_client_files.push(relative);}}
for(const key of Object.keys(aggregated))aggregated[key]=unique(aggregated[key]);
const candidates=[];
for(const command of aggregated.task_commands)candidates.push({type:"TASK_SUBCOMMAND",syntax:command,source:"STATIC_SOURCE"});
for(const syntax of aggregated.positional_contracts)candidates.push({type:"POSITIONAL_ARGUMENT",syntax,source:"STATIC_SOURCE"});
for(const flag of aggregated.prompt_flags)candidates.push({type:"PROMPT_OPTION",syntax:flag+" {TASK_PROMPT}",source:"STATIC_SOURCE"});
const uniqueCandidates=[];for(const candidate of candidates){if(!uniqueCandidates.some(item=>item.type===candidate.type&&item.syntax===candidate.syntax))uniqueCandidates.push(candidate);}
const exact=uniqueCandidates.length===1;
const confidence=exact&&aggregated.parser_files.length>0?"HIGH":uniqueCandidates.length>0?"MEDIUM":"LOW";
const result={schema_version:"1.0",inspection_id:"CLINE-CLI-STATIC-INTERFACE-004-001",package:{root:packageRoot,name:pkg.name||null,version:pkg.version||null,type:pkg.type||null,bin_entries:binTargets.map(item=>({name:item.name,target:item.target,exists:item.exists})),package_json_sha256:sha(read(packagePath))},wrapper:{path:wrapperPath,sha256:sha(wrapper),content_included:false},captured_help:{path:helpPath,sha256:sha(help),content_included:false},source_scan:{roots:roots.map(item=>path.relative(packageRoot,item).replace(/\\/g,"/")),files_scanned:files.length,files_with_evidence:evidence.length,evidence},aggregated,candidates:uniqueCandidates,candidate_count:uniqueCandidates.length,exact_task_interface_resolved:exact,confidence,noninteractive_control_found:aggregated.noninteractive_flags.length>0,structured_output_control_found:aggregated.structured_flags.length>0,stdin_interface_found:aggregated.stdin_files.length>0,network_client_code_detected:aggregated.network_client_files.length>0,cline_invoked:false,process_started:false,task_dispatched:false,prompt_submitted:false,session_content_read:false,metadata_modified:false};
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+"\n","utf8");
console.log(JSON.stringify({valid:true,package:result.package.name,version:result.package.version,files_scanned:result.source_scan.files_scanned,candidate_count:result.candidate_count,exact:result.exact_task_interface_resolved,confidence:result.confidence}));
