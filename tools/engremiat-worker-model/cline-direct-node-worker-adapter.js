"use strict";

const fs = require("fs");
const path = require("path");
const adapter = require("./cline-positional-prompt-adapter/cline-positional-prompt-adapter");

const WORKER_MODE = "CLINE_DIRECT_NODE_GOVERNED";
const TRANSPORT = "NODE_EXECUTABLE_ARGUMENT_ARRAY";

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function normalizeGate(gate) {
  const value = requireObject(gate, "GATE_OBJECT_REQUIRED");
  return {
    authorization_required: value.authorization_required !== false,
    authorization_granted: value.authorization_granted === true,
    authorization_consumed: value.authorization_consumed === true,
    maximum_authorized_runs: Number.isInteger(value.maximum_authorized_runs) ? value.maximum_authorized_runs : 0,
    actual_run_count: Number.isInteger(value.actual_run_count) ? value.actual_run_count : 0,
    approval_reference: typeof value.approval_reference === "string" ? value.approval_reference : null
  };
}

function assertSafeTask(task) {
  const value = requireObject(task, "TASK_OBJECT_REQUIRED");
  if (typeof value.task_id !== "string" || value.task_id.trim() === "") throw new TypeError("TASK_ID_REQUIRED");
  if (typeof value.prompt_path !== "string" || value.prompt_path.trim() === "") throw new TypeError("PROMPT_PATH_REQUIRED");
  if (!fs.existsSync(path.resolve(value.prompt_path))) throw new Error("PROMPT_FILE_NOT_FOUND");
  if (value.tools_allowed === true) throw new Error("TOOLS_NOT_VALIDATED");
  if (value.source_write_allowed === true) throw new Error("SOURCE_WRITE_NOT_AUTHORIZED");
  if (value.git_write_allowed === true) throw new Error("GIT_WRITE_NOT_AUTHORIZED");
  if (value.external_network_allowed === true) throw new Error("EXTERNAL_NETWORK_NOT_AUTHORIZED");
  return value;
}

function prepareWorkerInvocation(options) {
  const settings = requireObject(options, "OPTIONS_OBJECT_REQUIRED");
  const task = assertSafeTask(settings.task);
  const requestedExecution = settings.execute === true;
  const gate = normalizeGate(settings.gate || {});
  if (requestedExecution) {
    if (!gate.authorization_required) throw new Error("HUMAN_GATE_REQUIRED");
    if (!gate.authorization_granted) throw new Error("EXPLICIT_HUMAN_AUTHORIZATION_REQUIRED");
    if (gate.authorization_consumed) throw new Error("AUTHORIZATION_ALREADY_CONSUMED");
    if (gate.maximum_authorized_runs !== 1) throw new Error("EXACTLY_ONE_AUTHORIZED_RUN_REQUIRED");
    if (gate.actual_run_count !== 0) throw new Error("RUN_ALREADY_RECORDED");
    throw new Error("REAL_EXECUTION_NOT_IMPLEMENTED_IN_INTEGRATION_LAYER");
  }
  const invocation = adapter.buildDirectNodeInvocation({
    nodeExecutable: settings.node_executable,
    clineEntrypoint: settings.cline_entrypoint,
    promptPath: task.prompt_path,
    cwd: settings.cwd,
    provider: settings.provider || "ollama",
    model: settings.model || "qwen3:14b",
    autoApprove: false,
    execute: false
  });
  return {
    schema_version: "1.0.0",
    worker_mode: WORKER_MODE,
    task_id: task.task_id,
    status: "PREPARED_DRY_RUN",
    decision: "DIRECT_NODE_WORKER_INVOCATION_PREPARED_EXECUTION_DISABLED",
    transport: TRANSPORT,
    shell: false,
    execution_requested: false,
    execution_allowed: false,
    process_started: false,
    authorization_required_for_execution: true,
    authorization_granted: false,
    authorization_consumed: false,
    tools_allowed: false,
    source_write_allowed: false,
    git_write_allowed: false,
    external_network_allowed: false,
    tool_capability_validated: false,
    source_task_execution_authorized: false,
    invocation: {
      executable: invocation.executable,
      entrypoint: invocation.entrypoint,
      safe_arguments: invocation.safe_arguments,
      argument_count: invocation.argument_count,
      positional_prompt_argument_index: invocation.positional_prompt_argument_index,
      positional_prompt_argument_count: invocation.positional_prompt_argument_count,
      prompt_sha256: invocation.prompt_sha256,
      prompt_character_count: invocation.prompt_character_count,
      prompt_byte_count_utf8: invocation.prompt_byte_count_utf8,
      prompt_line_count: invocation.prompt_line_count,
      prompt_roundtrip_equal: invocation.prompt_roundtrip_equal
    }
  };
}

module.exports = { WORKER_MODE, TRANSPORT, assertSafeTask, normalizeGate, prepareWorkerInvocation };
