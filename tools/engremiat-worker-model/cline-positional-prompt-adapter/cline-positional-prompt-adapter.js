"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function sha256Text(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function requireFile(value, code) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(code + "_PATH_REQUIRED");
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(code + "_NOT_FOUND");
  return resolved;
}

function resolveDirectNodeRuntime(options) {
  const settings = options || {};
  const nodeExecutable = requireFile(settings.nodeExecutable || process.execPath, "NODE_EXECUTABLE");
  const clineEntrypoint = requireFile(settings.clineEntrypoint, "CLINE_ENTRYPOINT");
  return { nodeExecutable, clineEntrypoint };
}

function buildDirectNodeInvocation(options) {
  const settings = options || {};
  if (settings.execute === true) throw new Error("REAL_EXECUTION_FORBIDDEN_IN_DRY_RUN");
  if (typeof settings.cwd !== "string" || settings.cwd.trim() === "") throw new TypeError("CWD_REQUIRED");
  const provider = settings.provider || "ollama";
  const model = settings.model || "qwen3:14b";
  if (provider !== "ollama") throw new Error("ONLY_LOCAL_OLLAMA_PROVIDER_ALLOWED");
  const runtime = resolveDirectNodeRuntime(settings);
  const promptPath = requireFile(settings.promptPath, "PROMPT_FILE");
  const prompt = fs.readFileSync(promptPath, "utf8");
  if (prompt.length === 0) throw new Error("PROMPT_EMPTY");
  const args = [
    runtime.clineEntrypoint,
    "--provider", provider,
    "--model", model,
    "--cwd", path.resolve(settings.cwd),
    "--json",
    "--auto-approve", String(settings.autoApprove === true),
    prompt
  ];
  const lines = prompt.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return {
    schema_version: "2.0.0",
    mode: "DIRECT_NODE_DRY_RUN",
    transport: "NODE_EXECUTABLE_ARGUMENT_ARRAY",
    executable: runtime.nodeExecutable,
    entrypoint: runtime.clineEntrypoint,
    shell: false,
    execution_allowed: false,
    process_started: false,
    provider,
    model,
    cwd: path.resolve(settings.cwd),
    prompt_path: promptPath,
    prompt_sha256: sha256Text(prompt),
    prompt_character_count: prompt.length,
    prompt_byte_count_utf8: Buffer.byteLength(prompt, "utf8"),
    prompt_line_count: lines.length,
    argument_count: args.length,
    entrypoint_argument_index: 0,
    positional_prompt_argument_index: args.length - 1,
    positional_prompt_argument_count: 1,
    positional_prompt_sha256: sha256Text(args[args.length - 1]),
    prompt_roundtrip_equal: args[args.length - 1] === prompt,
    safe_arguments: args.map(function (value, index) { return index === args.length - 1 ? "<POSITIONAL_PROMPT_REDACTED>" : value; }),
    raw_arguments: args
  };
}

function buildDryRunInvocation(options) {
  return buildDirectNodeInvocation(options);
}

module.exports = { buildDirectNodeInvocation, buildDryRunInvocation, resolveDirectNodeRuntime, sha256Text };
