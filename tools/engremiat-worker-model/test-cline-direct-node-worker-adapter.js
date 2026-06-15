"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const worker = require("./cline-direct-node-worker-adapter");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "engremiat-direct-node-worker-"));
const promptPath = path.join(tempRoot, "prompt.txt");
const entrypointPath = path.join(tempRoot, "mock-cline-entrypoint.js");
fs.writeFileSync(promptPath, ["MODE=TEXT_RESPONSE_ONLY", "TOKEN_A=alpha", "TOKEN_B=beta|gamma"].join("\n"), "utf8");
fs.writeFileSync(entrypointPath, "process.exit(0);\n", "utf8");

const baseOptions = {
  node_executable: process.execPath,
  cline_entrypoint: entrypointPath,
  cwd: tempRoot,
  provider: "ollama",
  model: "qwen3:14b",
  execute: false,
  gate: {},
  task: {
    task_id: "TASK-DIRECT-NODE-DRY-RUN-001",
    prompt_path: promptPath,
    tools_allowed: false,
    source_write_allowed: false,
    git_write_allowed: false,
    external_network_allowed: false
  }
};

try {
  const result = worker.prepareWorkerInvocation(baseOptions);
  assert.strictEqual(result.worker_mode, "CLINE_DIRECT_NODE_GOVERNED");
  assert.strictEqual(result.status, "PREPARED_DRY_RUN");
  assert.strictEqual(result.transport, "NODE_EXECUTABLE_ARGUMENT_ARRAY");
  assert.strictEqual(result.shell, false);
  assert.strictEqual(result.execution_allowed, false);
  assert.strictEqual(result.process_started, false);
  assert.strictEqual(result.tools_allowed, false);
  assert.strictEqual(result.source_write_allowed, false);
  assert.strictEqual(result.git_write_allowed, false);
  assert.strictEqual(result.tool_capability_validated, false);
  assert.strictEqual(result.source_task_execution_authorized, false);
  assert.strictEqual(result.invocation.positional_prompt_argument_count, 1);
  assert.strictEqual(result.invocation.prompt_roundtrip_equal, true);
  assert.strictEqual(result.invocation.safe_arguments[result.invocation.positional_prompt_argument_index], "<POSITIONAL_PROMPT_REDACTED>");
  const executionAttempt = Object.assign({}, baseOptions, { execute: true, gate: { authorization_required: true, authorization_granted: true, authorization_consumed: false, maximum_authorized_runs: 1, actual_run_count: 0, approval_reference: "TEST-ONLY" } });
  assert.throws(function () { worker.prepareWorkerInvocation(executionAttempt); }, /REAL_EXECUTION_NOT_IMPLEMENTED/);
  const noApproval = Object.assign({}, baseOptions, { execute: true, gate: { authorization_required: true, authorization_granted: false, authorization_consumed: false, maximum_authorized_runs: 1, actual_run_count: 0 } });
  assert.throws(function () { worker.prepareWorkerInvocation(noApproval); }, /EXPLICIT_HUMAN_AUTHORIZATION_REQUIRED/);
  const toolTask = Object.assign({}, baseOptions, { task: Object.assign({}, baseOptions.task, { tools_allowed: true }) });
  assert.throws(function () { worker.prepareWorkerInvocation(toolTask); }, /TOOLS_NOT_VALIDATED/);
  const writeTask = Object.assign({}, baseOptions, { task: Object.assign({}, baseOptions.task, { source_write_allowed: true }) });
  assert.throws(function () { worker.prepareWorkerInvocation(writeTask); }, /SOURCE_WRITE_NOT_AUTHORIZED/);
  console.log("CLINE_DIRECT_NODE_WORKER_ADAPTER_TESTS_OK");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
