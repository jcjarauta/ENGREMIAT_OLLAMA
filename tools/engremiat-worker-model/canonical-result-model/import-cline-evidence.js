'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CANONICAL_SCHEMA_VERSION = '1.0.0';
const IMPORTER_VERSION = '1.0.0';
const TERMINAL_SUCCESS_TERMS = new Set(['success','succeeded','completed','complete','verified','passed','ok']);
const TERMINAL_FAILURE_TERMS = new Set(['failed','failure','error','cancelled','canceled','blocked','rejected']);

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(name + ' must be an object');
}

function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (value && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = stableClone(value[key]);
    return output;
  }
  return value;
}

function stableJson(value) { return JSON.stringify(stableClone(value)); }
function sha256(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function normalizeText(value) { return typeof value === 'string' ? value.trim() : ''; }
function normalizeStatus(value) { return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_'); }
function deterministicId(prefix, value) { return prefix + '-' + sha256(stableJson(value)).slice(0, 24); }

function validateInput(input) {
  assertObject(input, 'input');
  assertObject(input.source, 'input.source');
  const provider = normalizeText(input.source.provider);
  const taskId = normalizeText(input.source.task_id);
  const objectiveId = normalizeText(input.source.objective_id);
  if (!provider) throw new Error('input.source.provider is required');
  if (!taskId) throw new Error('input.source.task_id is required');
  if (!objectiveId) throw new Error('input.source.objective_id is required');
  if (!Object.prototype.hasOwnProperty.call(input, 'evidence')) throw new Error('input.evidence is required');
  assertObject(input.evidence, 'input.evidence');
  if (!normalizeText(input.evidence.status)) throw new Error('input.evidence.status is required');
  return { provider, taskId, objectiveId };
}

function classifyTerminalStatus(status) {
  const normalized = normalizeStatus(status);
  if (TERMINAL_SUCCESS_TERMS.has(normalized)) return { terminal: true, success: true, normalized };
  if (TERMINAL_FAILURE_TERMS.has(normalized)) return { terminal: true, success: false, normalized };
  return { terminal: false, success: false, normalized: normalized || 'unknown' };
}

function buildCanonicalRecords(input) {
  const identity = validateInput(input);
  const sourceStatus = classifyTerminalStatus(input.evidence.status);
  const providerMetadata = input.source.provider_metadata && typeof input.source.provider_metadata === 'object' && !Array.isArray(input.source.provider_metadata) ? stableClone(input.source.provider_metadata) : {};
  const evidencePayload = stableClone(input.evidence);
  const sourceFingerprint = sha256(stableJson({ provider: identity.provider, task_id: identity.taskId, objective_id: identity.objectiveId, evidence: evidencePayload }));
  const importId = deterministicId('IMPORT', { provider: identity.provider, task_id: identity.taskId, objective_id: identity.objectiveId, source_fingerprint: sourceFingerprint });
  const executionId = deterministicId('EXEC', { import_id: importId, task_id: identity.taskId });
  const resultId = deterministicId('RESULT', { import_id: importId, execution_id: executionId });
  const reviewId = deterministicId('REVIEW', { import_id: importId, result_id: resultId, revision: 1 });
  const evidenceId = deterministicId('EVIDENCE', { import_id: importId, source_fingerprint: sourceFingerprint });
  const importedAt = normalizeText(input.imported_at) || '1970-01-01T00:00:00.000Z';
  const execution = { schema_version: CANONICAL_SCHEMA_VERSION, execution_id: executionId, import_id: importId, objective_id: identity.objectiveId, task_id: identity.taskId, provider: identity.provider, provider_execution_ref: normalizeText(input.source.execution_ref) || null, execution_status: sourceStatus.normalized, terminal: sourceStatus.terminal, immutable: true, provider_metadata: providerMetadata, created_at: importedAt };
  const result = { schema_version: CANONICAL_SCHEMA_VERSION, result_id: resultId, import_id: importId, execution_id: executionId, task_id: identity.taskId, result_status: sourceStatus.success ? 'REVIEW' : (sourceStatus.terminal ? 'FAILED' : 'PENDING'), task_completion_status: 'NOT_COMPLETED', terminal_execution_success: sourceStatus.success, immutable: true, summary: normalizeText(input.evidence.summary) || null, created_at: importedAt };
  const review = { schema_version: CANONICAL_SCHEMA_VERSION, review_id: reviewId, import_id: importId, result_id: resultId, task_id: identity.taskId, revision: 1, review_status: 'PENDING_HUMAN_REVIEW', append_only: true, decision: null, created_at: importedAt };
  const evidence = { schema_version: CANONICAL_SCHEMA_VERSION, evidence_id: evidenceId, import_id: importId, execution_id: executionId, result_id: resultId, source_type: 'CLINE_VERIFIED_EVIDENCE', source_fingerprint: sourceFingerprint, content_embedded: false, content_sha256: sha256(stableJson(evidencePayload)), source_reference: normalizeText(input.source.evidence_path) || null, secret_values_present: false, immutable: true, created_at: importedAt };
  return { importer_version: IMPORTER_VERSION, import_id: importId, duplicate: false, records: { execution, result, review, evidence }, relations: [{ from: executionId, type: 'PRODUCES', to: resultId },{ from: resultId, type: 'REQUIRES_REVIEW', to: reviewId },{ from: evidenceId, type: 'SUPPORTS_EXECUTION', to: executionId },{ from: evidenceId, type: 'SUPPORTS_RESULT', to: resultId }] };
}

function importIntoStore(input, store) {
  assertObject(store, 'store');
  if (!store.imports || typeof store.imports !== 'object' || Array.isArray(store.imports)) store.imports = {};
  const candidate = buildCanonicalRecords(input);
  if (store.imports[candidate.import_id]) return { ...stableClone(store.imports[candidate.import_id]), duplicate: true };
  store.imports[candidate.import_id] = stableClone(candidate);
  return stableClone(candidate);
}

function importFile(inputPath, outputPath) {
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const store = { imports: {} };
  const imported = importIntoStore(input, store);
  if (outputPath) {
    const target = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(imported, null, 2) + '\n', 'utf8');
  }
  return imported;
}

module.exports = { CANONICAL_SCHEMA_VERSION, IMPORTER_VERSION, stableJson, sha256, buildCanonicalRecords, importIntoStore, importFile };

if (require.main === module) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) { console.error('Usage: node import-cline-evidence.js <input.json> [output.json]'); process.exit(2); }
  try {
    const imported = importFile(inputPath, outputPath);
    process.stdout.write(JSON.stringify({ valid: true, import_id: imported.import_id, duplicate: imported.duplicate, record_count: Object.keys(imported.records).length }) + '\n');
  } catch (error) {
    console.error(JSON.stringify({ valid: false, error: error.message }));
    process.exit(1);
  }
}
