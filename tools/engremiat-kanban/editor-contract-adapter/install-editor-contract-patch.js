'use strict';
const fs=require("fs");
const crypto=require("crypto");
const path=require("path");
const targets=process.argv.slice(2);
if(targets.length===0)throw new Error("TARGET_REQUIRED");
const functionAnchor="async function doParseToolCall({";
const validationAnchor='  const parseResult = toolCall.input.trim() === "" ? await safeValidateTypes({ value: {}, schema }) : await safeParseJSON({ text: toolCall.input, schema });';
const helper=[
"function engremiatNormalizeEditorToolInput(toolName, input) {",
"  if (toolName !== \"editor\" && toolName !== \"anthropic.text_editor_20250728\") return input;",
"  if (typeof input !== \"string\" || input.trim() === \"\") return input;",
"  let value;",
"  try { value = JSON.parse(input); } catch { return input; }",
"  if (!value || typeof value !== \"object\" || Array.isArray(value)) return input;",
"  if (Array.isArray(value.files)) {",
"    if (value.files.length !== 1) return input;",
"    const file = value.files[0] || {};",
"    value = { path: file.path, new_text: file.new_text !== undefined ? file.new_text : file.content, old_text: file.old_text, insert_line: file.insert_line };",
"  }",
"  if (typeof value.path !== \"string\" || value.path.length === 0) return input;",
"  if (value.command) return JSON.stringify(value);",
"  if (value.old_text !== undefined) value = { command: \"str_replace\", path: value.path, old_str: value.old_text, new_str: value.new_text };",
"  else if (Number.isInteger(value.insert_line)) value = { command: \"insert\", path: value.path, insert_line: value.insert_line, insert_text: value.new_text };",
"  else value = { command: \"create\", path: value.path, file_text: value.new_text };",
"  return JSON.stringify(value);",
"}",
""
].join("\n");
const replacement=[
"  const engremiatToolInput = engremiatNormalizeEditorToolInput(toolName, toolCall.input);",
"  const parseResult = engremiatToolInput.trim() === \"\" ? await safeValidateTypes({ value: {}, schema }) : await safeParseJSON({ text: engremiatToolInput, schema });"
].join("\n");
function sha(text){return crypto.createHash("sha256").update(text).digest("hex");}
function patch(target){const absolute=path.resolve(target);if(!fs.existsSync(absolute))throw new Error("TARGET_NOT_FOUND: "+absolute);const original=fs.readFileSync(absolute,"utf8");const helperCount=(original.match(/function engremiatNormalizeEditorToolInput\(/g)||[]).length;const hookCount=(original.match(/engremiatNormalizeEditorToolInput\(toolName, toolCall\.input\)/g)||[]).length;if(helperCount===1&&hookCount===1)return{target:absolute,status:"ALREADY_PATCHED",changed:false,sha256:sha(original)};if(helperCount!==0||hookCount!==0)throw new Error("PARTIAL_PATCH_DETECTED: "+absolute);const functionCount=original.split(functionAnchor).length-1;const validationCount=original.split(validationAnchor).length-1;if(functionCount!==1||validationCount!==1)throw new Error("ANCHOR_COUNT_INVALID target="+absolute+" function="+functionCount+" validation="+validationCount);let patched=original.replace(functionAnchor,helper+functionAnchor).replace(validationAnchor,replacement);fs.writeFileSync(absolute,patched,"utf8");return{target:absolute,status:"PATCH_APPLIED",changed:true,original_sha256:sha(original),sha256:sha(patched)};}
const results=targets.map(patch);
process.stdout.write(JSON.stringify({schema_version:"1.0",results,changed:results.filter(x=>x.changed).length,already_patched:results.filter(x=>!x.changed).length}));
