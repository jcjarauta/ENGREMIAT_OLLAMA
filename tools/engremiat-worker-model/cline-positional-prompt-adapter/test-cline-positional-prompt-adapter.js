"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const adapter = require("./cline-positional-prompt-adapter");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "engremiat-direct-node-adapter-"));
const promptPath = path.join(tempRoot, "prompt.txt");
const entrypointPath = path.join(tempRoot, "mock-entrypoint.js");
const prompt = ["LINE_A=alpha", "LINE_B=beta with spaces", "LINE_C=gamma|delta"].join("\n");
fs.writeFileSync(promptPath, prompt, "utf8");
fs.writeFileSync(entrypointPath, "process.exit(0);\n", "utf8");

try {
  const result = adapter.buildDirectNodeInvocation({
    nodeExecutable: process.execPath,
    clineEntrypoint: entrypointPath,
    promptPath: promptPath,
    cwd: tempRoot,
    provider: "ollama",
    model: "qwen3:14b",
    autoApprove: false,
    execute: false
  });
  assert.strictEqual(result.mode, "DIRECT_NODE_DRY_RUN");
  assert.strictEqual(result.transport, "NODE_EXECUTABLE_ARGUMENT_ARRAY");
  assert.strictEqual(result.shell, false);
  assert.strictEqual(result.execution_allowed, false);
  assert.strictEqual(result.process_started, false);
  assert.strictEqual(result.positional_prompt_argument_count, 1);
  assert.strictEqual(result.positional_prompt_argument_index, result.raw_arguments.length - 1);
  assert.strictEqual(result.raw_arguments[0], entrypointPath);
  assert.strictEqual(result.raw_arguments[result.positional_prompt_argument_index], prompt);
  assert.strictEqual(result.prompt_roundtrip_equal, true);
  assert.strictEqual(result.prompt_sha256, result.positional_prompt_sha256);
  assert.strictEqual(result.safe_arguments[result.positional_prompt_argument_index], "<POSITIONAL_PROMPT_REDACTED>");
  assert.strictEqual(result.raw_arguments.includes("--provider"), true);
  assert.strictEqual(result.raw_arguments.includes("--model"), true);
  assert.strictEqual(result.raw_arguments.includes("--cwd"), true);
  assert.strictEqual(result.raw_arguments.includes("--json"), true);
  assert.strictEqual(result.raw_arguments.includes("--auto-approve"), true);
  assert.throws(function () { adapter.buildDirectNodeInvocation({ nodeExecutable: process.execPath, clineEntrypoint: entrypointPath, promptPath: promptPath, cwd: tempRoot, execute: true }); }, /REAL_EXECUTION_FORBIDDEN/);
  assert.throws(function () { adapter.buildDirectNodeInvocation({ nodeExecutable: process.execPath, clineEntrypoint: entrypointPath, promptPath: promptPath, cwd: tempRoot, provider: "openai" }); }, /ONLY_LOCAL_OLLAMA/);
  console.log("CLINE_DIRECT_NODE_ADAPTER_TESTS_OK");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
