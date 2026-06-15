'use strict';
const assert = require('assert');
const fs = require('fs');
const validator = require('./validate-canonical-result-chain');

const importPath = process.argv[2];
const storePath = process.argv[3];
if (!importPath || !storePath) throw new Error('IMPORT_AND_STORE_PATHS_REQUIRED');

const canonical = JSON.parse(fs.readFileSync(importPath, 'utf8'));
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
let passed = 0;
function test(name, fn) { fn(); passed += 1; }

const result = validator.validateChain(canonical, store);
test('chain valid', () => assert.strictEqual(result.valid, true));
test('all chain checks pass', () => assert.strictEqual(result.check_count, result.passed_count));
test('canonical validator exposes exact expected check count', () => assert.strictEqual(result.check_count, 29));
test('identity digest is sha256', () => assert.strictEqual(result.identity_digest.length, 64));
test('task remains uncompleted', () => assert.strictEqual(result.task_completion_status, 'NOT_COMPLETED'));
test('result requires review', () => assert.strictEqual(result.result_status, 'REVIEW'));
test('repeat validation is deterministic', () => assert.deepStrictEqual(validator.validateChain(canonical, store), result));

const brokenRelation = JSON.parse(JSON.stringify(canonical));
brokenRelation.relations = [];
test('broken relations rejected', () => assert.throws(() => validator.validateChain(brokenRelation, store), /RELATION_COUNT_VALID/));

const autoCompleted = JSON.parse(JSON.stringify(canonical));
autoCompleted.records.result.task_completion_status = 'COMPLETED';
test('automatic task completion rejected', () => assert.throws(() => validator.validateChain(autoCompleted, store), /TASK_NOT_AUTO_COMPLETED/));

const mutableExecution = JSON.parse(JSON.stringify(canonical));
mutableExecution.records.execution.immutable = false;
test('mutable execution rejected', () => assert.throws(() => validator.validateChain(mutableExecution, store), /EXECUTION_IMMUTABLE/));

const mutableResult = JSON.parse(JSON.stringify(canonical));
mutableResult.records.result.immutable = false;
test('mutable result rejected', () => assert.throws(() => validator.validateChain(mutableResult, store), /RESULT_IMMUTABLE/));

const mutableEvidence = JSON.parse(JSON.stringify(canonical));
mutableEvidence.records.evidence.immutable = false;
test('mutable evidence rejected', () => assert.throws(() => validator.validateChain(mutableEvidence, store), /EVIDENCE_IMMUTABLE/));

const mutableReview = JSON.parse(JSON.stringify(canonical));
mutableReview.records.review.append_only = false;
test('non append-only review rejected', () => assert.throws(() => validator.validateChain(mutableReview, store), /REVIEW_APPEND_ONLY/));

const embeddedEvidence = JSON.parse(JSON.stringify(canonical));
embeddedEvidence.records.evidence.content_embedded = true;
test('embedded evidence rejected', () => assert.throws(() => validator.validateChain(embeddedEvidence, store), /EVIDENCE_CONTENT_NOT_EMBEDDED/));

const secretEvidence = JSON.parse(JSON.stringify(canonical));
secretEvidence.records.evidence.secret_values_present = true;
test('secret-bearing evidence rejected', () => assert.throws(() => validator.validateChain(secretEvidence, store), /SECRET_VALUES_ABSENT/));

const wrongExecution = JSON.parse(JSON.stringify(canonical));
wrongExecution.records.result.execution_id = 'EXEC-WRONG';
test('wrong execution reference rejected', () => assert.throws(() => validator.validateChain(wrongExecution, store), /RESULT_REFERENCES_EXECUTION/));

const wrongReviewResult = JSON.parse(JSON.stringify(canonical));
wrongReviewResult.records.review.result_id = 'RESULT-WRONG';
test('wrong review result reference rejected', () => assert.throws(() => validator.validateChain(wrongReviewResult, store), /REVIEW_REFERENCES_RESULT/));

const wrongEvidenceResult = JSON.parse(JSON.stringify(canonical));
wrongEvidenceResult.records.evidence.result_id = 'RESULT-WRONG';
test('wrong evidence result reference rejected', () => assert.throws(() => validator.validateChain(wrongEvidenceResult, store), /EVIDENCE_REFERENCES_RESULT/));

const wrongTask = JSON.parse(JSON.stringify(canonical));
wrongTask.records.review.task_id = 'TASK-WRONG';
test('inconsistent task identity rejected', () => assert.throws(() => validator.validateChain(wrongTask, store), /SHARED_TASK_ID/));

const decidedReview = JSON.parse(JSON.stringify(canonical));
decidedReview.records.review.decision = 'APPROVE';
test('invented review decision rejected', () => assert.throws(() => validator.validateChain(decidedReview, store), /REVIEW_DECISION_NOT_INVENTED/));

const wrongStore = JSON.parse(JSON.stringify(store));
wrongStore.imports.EXTRA = {};
test('additional store import rejected', () => assert.throws(() => validator.validateChain(canonical, wrongStore), /STORE_SINGLE_IMPORT/));

const alteredStore = JSON.parse(JSON.stringify(store));
alteredStore.imports[canonical.import_id].records.result.result_status = 'ALTERED';
test('altered stored content rejected', () => assert.throws(() => validator.validateChain(canonical, alteredStore), /STORE_CONTENT_MATCH/));

process.stdout.write(JSON.stringify({ valid:true, test_count:passed, passed_count:passed, chain_check_count:result.check_count, chain_passed_count:result.passed_count, identity_digest:result.identity_digest }) + '\n');
