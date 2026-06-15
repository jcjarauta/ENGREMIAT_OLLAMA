'use strict';
const assert = require('assert');
const importer = require('./import-cline-evidence');

let passed = 0;
function test(name, fn) { fn(); passed += 1; }

const fixture = {
  imported_at: '2026-06-15T00:00:00.000Z',
  source: {
    provider: 'cline',
    task_id: 'CLINE-TASK-004-TEST-001',
    objective_id: 'ENGREMIAT-CANONICAL-PROJECT-TASK-WORKER-MODEL-002',
    execution_ref: 'verified-objective-004',
    evidence_path: 'data/objective-004/verified-evidence.json',
    provider_metadata: { session_id: 'redacted-session', provider_status: 'completed' }
  },
  evidence: { status: 'completed', summary: 'Controlled Cline task evidence verified', checks: { git_head_unchanged: true, task_result_present: true } }
};

test('exports buildCanonicalRecords', () => assert.strictEqual(typeof importer.buildCanonicalRecords, 'function'));
test('exports importIntoStore', () => assert.strictEqual(typeof importer.importIntoStore, 'function'));
const first = importer.buildCanonicalRecords(fixture);
test('creates deterministic import id', () => assert.ok(first.import_id.startsWith('IMPORT-')));
test('creates four records', () => assert.strictEqual(Object.keys(first.records).length, 4));
test('execution immutable', () => assert.strictEqual(first.records.execution.immutable, true));
test('result immutable', () => assert.strictEqual(first.records.result.immutable, true));
test('review append only', () => assert.strictEqual(first.records.review.append_only, true));
test('evidence content not embedded', () => assert.strictEqual(first.records.evidence.content_embedded, false));
test('evidence secrets absent', () => assert.strictEqual(first.records.evidence.secret_values_present, false));
test('terminal success detected', () => assert.strictEqual(first.records.result.terminal_execution_success, true));
test('task is not auto completed', () => assert.strictEqual(first.records.result.task_completion_status, 'NOT_COMPLETED'));
test('successful result enters review', () => assert.strictEqual(first.records.result.result_status, 'REVIEW'));
test('review starts pending', () => assert.strictEqual(first.records.review.review_status, 'PENDING_HUMAN_REVIEW'));
test('provider metadata isolated', () => assert.deepStrictEqual(first.records.execution.provider_metadata, fixture.source.provider_metadata));
test('source evidence unchanged', () => assert.strictEqual(fixture.evidence.status, 'completed'));
const second = importer.buildCanonicalRecords(JSON.parse(JSON.stringify(fixture)));
test('same evidence has same import id', () => assert.strictEqual(first.import_id, second.import_id));
test('same evidence has same execution id', () => assert.strictEqual(first.records.execution.execution_id, second.records.execution.execution_id));
test('same evidence has same result id', () => assert.strictEqual(first.records.result.result_id, second.records.result.result_id));
test('same evidence has same review id', () => assert.strictEqual(first.records.review.review_id, second.records.review.review_id));
test('same evidence has same evidence id', () => assert.strictEqual(first.records.evidence.evidence_id, second.records.evidence.evidence_id));
const store = { imports: {} };
const importedFirst = importer.importIntoStore(fixture, store);
const importedSecond = importer.importIntoStore(fixture, store);
test('first import is not duplicate', () => assert.strictEqual(importedFirst.duplicate, false));
test('second import is duplicate', () => assert.strictEqual(importedSecond.duplicate, true));
test('duplicate import creates one stored import', () => assert.strictEqual(Object.keys(store.imports).length, 1));
const changed = JSON.parse(JSON.stringify(fixture)); changed.evidence.summary = 'Different verified evidence';
const importedChanged = importer.importIntoStore(changed, store);
test('changed evidence receives different import id', () => assert.notStrictEqual(importedFirst.import_id, importedChanged.import_id));
test('changed evidence creates second stored import', () => assert.strictEqual(Object.keys(store.imports).length, 2));
const failed = JSON.parse(JSON.stringify(fixture)); failed.evidence.status = 'failed';
const failedRecords = importer.buildCanonicalRecords(failed);
test('failed terminal execution is not success', () => assert.strictEqual(failedRecords.records.result.terminal_execution_success, false));
test('failed terminal result status is failed', () => assert.strictEqual(failedRecords.records.result.result_status, 'FAILED'));
const active = JSON.parse(JSON.stringify(fixture)); active.evidence.status = 'in_progress';
const activeRecords = importer.buildCanonicalRecords(active);
test('active execution is nonterminal', () => assert.strictEqual(activeRecords.records.execution.terminal, false));
test('active result remains pending', () => assert.strictEqual(activeRecords.records.result.result_status, 'PENDING'));
test('relations are generated', () => assert.strictEqual(first.relations.length, 4));
test('evidence fingerprint has sha256 length', () => assert.strictEqual(first.records.evidence.source_fingerprint.length, 64));
test('evidence content hash has sha256 length', () => assert.strictEqual(first.records.evidence.content_sha256.length, 64));
test('missing source is rejected', () => assert.throws(() => importer.buildCanonicalRecords({ evidence: { status: 'ok' } })));
test('missing task id is rejected', () => assert.throws(() => importer.buildCanonicalRecords({ source: { provider: 'cline', objective_id: 'OBJ' }, evidence: { status: 'ok' } })));
test('missing evidence status is rejected', () => assert.throws(() => importer.buildCanonicalRecords({ source: { provider: 'cline', task_id: 'T', objective_id: 'OBJ' }, evidence: {} })));
process.stdout.write(JSON.stringify({ valid: true, test_count: passed, passed_count: passed }) + '\n');
