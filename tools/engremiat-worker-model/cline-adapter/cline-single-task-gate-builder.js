'use strict';

const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const {buildClineTaskPreflight,hash}=require(path.resolve(process.argv[2]));
function readJson(file){return JSON.parse(fs.readFileSync(path.resolve(file),"utf8").replace(/^\uFEFF/,""));}
function writeJson(file,value){fs.writeFileSync(path.resolve(file),JSON.stringify(value,null,2)+"\n","utf8");}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>{out[key]=stable(value[key]);return out;},{});return value;}
function digest(value){return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").toUpperCase();}

const registry=readJson(process.argv[3]);
const envelope=readJson(process.argv[4]);
const repositoryRoot=path.resolve(process.argv[5]);
const helpText=fs.readFileSync(path.resolve(process.argv[6]),"utf8").replace(/^\uFEFF/,"");
const preflightOutput=path.resolve(process.argv[7]);
const candidateOutput=path.resolve(process.argv[8]);
const gateOutput=path.resolve(process.argv[9]);
const preflightDecision=buildClineTaskPreflight(registry,envelope,repositoryRoot);
if(!preflightDecision.ok)throw new Error(`PREFLIGHT_FAILED:${preflightDecision.code}`);
const lines=helpText.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const candidateLines=lines.filter(line=>/(task|prompt|run|execute|headless|json|output|yes|auto|approve)/i.test(line)).slice(0,80);
const commandLike=candidateLines.filter(line=>/^(?:[a-z0-9_-]+\s+){0,2}[a-z0-9_-]+(?:\s+\[[^\]]+\]|\s+<[^>]+>|\s+--[a-z0-9-]+|\s+-[a-z])/i.test(line));
const promptMarkers=candidateLines.filter(line=>/(--prompt|\bprompt\b|<prompt>|\[prompt\])/i.test(line));
const nonInteractiveMarkers=candidateLines.filter(line=>/(headless|--yes|--json|--output|non-interactive|auto-approve)/i.test(line));
const taskMarkers=candidateLines.filter(line=>/(new-task|task|run|execute)/i.test(line));
const stableCandidateDetected=promptMarkers.length>0&&taskMarkers.length>0;
const candidates={schema_version:"1.0",source:"CLINE_HELP_CAPTURE_004_03",candidate_line_count:candidateLines.length,command_like_line_count:commandLike.length,prompt_marker_count:promptMarkers.length,task_marker_count:taskMarkers.length,non_interactive_marker_count:nonInteractiveMarkers.length,stable_task_interface_candidate_detected:stableCandidateDetected,candidate_lines:candidateLines,command_like_lines:commandLike,prompt_marker_lines:promptMarkers,task_marker_lines:taskMarkers,non_interactive_marker_lines:nonInteractiveMarkers,raw_help_included:false,raw_help_sha256:crypto.createHash("sha256").update(helpText).digest("hex").toUpperCase()};
const gateCore={schema_version:"1.0",gate_id:"CLINE-SINGLE-TASK-DISPATCH-GATE-004-001",adapter_id:"ENGREMIAT-CONTROLLED-CLINE-WORKER-ADAPTER-004",operation_id:"CLINE_SINGLE_TASK_DISPATCH",envelope_id:envelope.envelope_id,task_id:envelope.task_id,project_id:envelope.project_id,task_envelope_sha256:digest(envelope),preflight_integrity_sha256:preflightDecision.preflight.integrity_sha256,cli_interface_analysis:{stable_task_interface_candidate_detected:stableCandidateDetected,candidate_line_count:candidateLines.length,prompt_marker_count:promptMarkers.length,task_marker_count:taskMarkers.length,non_interactive_marker_count:nonInteractiveMarkers.length},authorization:{task_authorization_state:"AUTHORIZED",execution_authorization_state:"PENDING_EXECUTION_AUTHORIZATION",explicit_human_decision_required:true,authorization_phrase:"AUTORIZO_STEP_004_06_SINGLE_CONTROLLED_CLINE_TASK_SMOKE"},dispatch:{global_dispatch_enabled:false,operation_enabled:false,dispatch_allowed:false,cline_invoked:false,process_started:false,task_dispatched:false,prompt_submitted:false,runtime_execution:false},safety:{single_task_only:true,repository_scope_enforced:true,allowed_paths_enforced:true,forbidden_actions_enforced:true,network_denied:true,git_write_denied:true,automatic_continuation:false,free_form_shell:false,timeout_seconds:envelope.timeout_seconds},decision:stableCandidateDetected?"READY_FOR_HUMAN_REVIEW_OF_EXACT_CLI_INVOCATION":"NO_GO_PENDING_EXACT_NONINTERACTIVE_CLINE_TASK_INTERFACE",next_required_action:stableCandidateDetected?"REVIEW_EXACT_ARGUMENT_CONTRACT_BEFORE_EXECUTION":"RESOLVE_CLINE_TASK_ARGUMENT_CONTRACT_WITHOUT_DISPATCH"};
const gate={...gateCore,integrity_sha256:digest(gateCore)};
writeJson(preflightOutput,preflightDecision.preflight);
writeJson(candidateOutput,candidates);
writeJson(gateOutput,gate);
console.log(JSON.stringify({valid:true,stable_task_interface_candidate_detected:stableCandidateDetected,candidate_line_count:candidateLines.length,decision:gate.decision,cline_invoked:false,task_dispatched:false}));
