'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function assertObject(value,name){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(name+' must be an object');}
function stableClone(value){if(Array.isArray(value))return value.map(stableClone);if(value&&typeof value==='object'){const output={};for(const key of Object.keys(value).sort())output[key]=stableClone(value[key]);return output;}return value;}
function stableJson(value){return JSON.stringify(stableClone(value));}
function sha256(value){return crypto.createHash('sha256').update(String(value),'utf8').digest('hex');}
function check(condition,code,checks){checks.push({code,passed:Boolean(condition)});if(!condition)throw new Error(code);}

function validateChain(imported,store){
  assertObject(imported,'imported'); assertObject(imported.records,'imported.records'); assertObject(store,'store'); assertObject(store.imports,'store.imports');
  const checks=[]; const execution=imported.records.execution; const result=imported.records.result; const review=imported.records.review; const evidence=imported.records.evidence;
  assertObject(execution,'execution'); assertObject(result,'result'); assertObject(review,'review'); assertObject(evidence,'evidence');
  check(typeof imported.import_id==='string'&&imported.import_id.startsWith('IMPORT-'),'IMPORT_ID_VALID',checks);
  check(execution.import_id===imported.import_id&&result.import_id===imported.import_id&&review.import_id===imported.import_id&&evidence.import_id===imported.import_id,'SHARED_IMPORT_ID',checks);
  check(result.execution_id===execution.execution_id,'RESULT_REFERENCES_EXECUTION',checks);
  check(evidence.execution_id===execution.execution_id,'EVIDENCE_REFERENCES_EXECUTION',checks);
  check(review.result_id===result.result_id,'REVIEW_REFERENCES_RESULT',checks);
  check(evidence.result_id===result.result_id,'EVIDENCE_REFERENCES_RESULT',checks);
  check(execution.task_id===result.task_id&&result.task_id===review.task_id,'SHARED_TASK_ID',checks);
  check(execution.immutable===true,'EXECUTION_IMMUTABLE',checks);
  check(result.immutable===true,'RESULT_IMMUTABLE',checks);
  check(evidence.immutable===true,'EVIDENCE_IMMUTABLE',checks);
  check(review.append_only===true,'REVIEW_APPEND_ONLY',checks);
  check(evidence.content_embedded===false,'EVIDENCE_CONTENT_NOT_EMBEDDED',checks);
  check(evidence.secret_values_present===false,'SECRET_VALUES_ABSENT',checks);
  check(typeof evidence.source_fingerprint==='string'&&evidence.source_fingerprint.length===64,'SOURCE_FINGERPRINT_SHA256',checks);
  check(typeof evidence.content_sha256==='string'&&evidence.content_sha256.length===64,'CONTENT_HASH_SHA256',checks);
  check(result.terminal_execution_success===true,'TERMINAL_EXECUTION_SUCCESS',checks);
  check(result.result_status==='REVIEW','SUCCESS_RESULT_REQUIRES_REVIEW',checks);
  check(result.task_completion_status==='NOT_COMPLETED','TASK_NOT_AUTO_COMPLETED',checks);
  check(review.review_status==='PENDING_HUMAN_REVIEW','HUMAN_REVIEW_PENDING',checks);
  check(review.decision===null,'REVIEW_DECISION_NOT_INVENTED',checks);
  check(Array.isArray(imported.relations)&&imported.relations.length===4,'RELATION_COUNT_VALID',checks);
  const relationKeys=new Set(imported.relations.map(item=>item.from+'|'+item.type+'|'+item.to));
  check(relationKeys.has(execution.execution_id+'|PRODUCES|'+result.result_id),'RELATION_EXECUTION_PRODUCES_RESULT',checks);
  check(relationKeys.has(result.result_id+'|REQUIRES_REVIEW|'+review.review_id),'RELATION_RESULT_REQUIRES_REVIEW',checks);
  check(relationKeys.has(evidence.evidence_id+'|SUPPORTS_EXECUTION|'+execution.execution_id),'RELATION_EVIDENCE_SUPPORTS_EXECUTION',checks);
  check(relationKeys.has(evidence.evidence_id+'|SUPPORTS_RESULT|'+result.result_id),'RELATION_EVIDENCE_SUPPORTS_RESULT',checks);
  check(Object.keys(store.imports).length===1,'STORE_SINGLE_IMPORT',checks);
  check(Object.prototype.hasOwnProperty.call(store.imports,imported.import_id),'STORE_CONTAINS_IMPORT_ID',checks);
  const stored=store.imports[imported.import_id];
  check(stored.import_id===imported.import_id,'STORED_IMPORT_ID_MATCH',checks);
  const normalizedImported=stableClone(imported); const normalizedStored=stableClone(stored); normalizedImported.duplicate=false; normalizedStored.duplicate=false;
  check(stableJson(normalizedImported)===stableJson(normalizedStored),'STORE_CONTENT_MATCH',checks);
  const identityDigest=sha256(stableJson({import_id:imported.import_id,execution_id:execution.execution_id,result_id:result.result_id,review_id:review.review_id,evidence_id:evidence.evidence_id}));
  return {valid:true,check_count:checks.length,passed_count:checks.filter(item=>item.passed).length,checks,identity_digest:identityDigest,import_id:imported.import_id,execution_id:execution.execution_id,result_id:result.result_id,review_id:review.review_id,evidence_id:evidence.evidence_id,task_id:execution.task_id,result_status:result.result_status,task_completion_status:result.task_completion_status};
}

function validateFiles(importPath,storePath,outputPath){const imported=JSON.parse(fs.readFileSync(path.resolve(importPath),'utf8'));const store=JSON.parse(fs.readFileSync(path.resolve(storePath),'utf8'));const result=validateChain(imported,store);if(outputPath){const target=path.resolve(outputPath);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n','utf8');}return result;}
module.exports={stableJson,sha256,validateChain,validateFiles};
if(require.main===module){try{const result=validateFiles(process.argv[2],process.argv[3],process.argv[4]);process.stdout.write(JSON.stringify({valid:true,check_count:result.check_count,passed_count:result.passed_count,import_id:result.import_id,identity_digest:result.identity_digest})+'\n');}catch(error){console.error(JSON.stringify({valid:false,error:error.message}));process.exit(1);}}
