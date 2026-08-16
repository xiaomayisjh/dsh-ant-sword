#!/usr/bin/env node
/*
Purpose: Produce a fast JavaScript obfuscation fingerprint before choosing a deobfuscation route.
Inputs: JavaScript file.
Outputs: Markdown summary to stdout and optional JSON.
Dependencies: Node.js standard library only.
Safe defaults: Read-only.
Known limits: Regex-based triage; use AST tools for proof.
Example:
  node obfuscation-fingerprint.js target.js --json fp.json
*/

const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node obfuscation-fingerprint.js <file.js> [--json out.json]');
}

function count(re, text) {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function topPrefixes(text) {
  const ids = text.match(/\b[$A-Za-z_][$0-9A-Za-z_]*\b/g) || [];
  const counts = new Map();
  for (const id of ids) {
    let prefix = null;
    const m1 = id.match(/^(_0x[0-9a-fA-F]*)/);
    const m2 = id.match(/^([_$]{1,3}[A-Za-z0-9_$]*)/);
    const m3 = id.match(/^([a-zA-Z]{1,2}\d{1,3}_?)/);
    if (m1) prefix = '_0x';
    else if (m2) prefix = m2[1].slice(0, 4);
    else if (m3) prefix = m3[1].replace(/\d+.*/, '#');
    if (prefix) counts.set(prefix, (counts.get(prefix) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([prefix, occurrences]) => ({ prefix, occurrences }));
}

function fingerprint(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const result = {
    file: path.resolve(file),
    bytes: Buffer.byteLength(text),
    lines: lines.length,
    indicators: {
      underscore_0x_identifiers: count(/\b_0x[0-9a-fA-F]+\b/g, text),
      hex_escapes: count(/\\x[0-9a-fA-F]{2}/g, text),
      unicode_escapes: count(/\\u[0-9a-fA-F]{4}/g, text),
      debugger_statements: count(/\bdebugger\b/g, text),
      eval_calls: count(/\beval\s*\(/g, text),
      function_constructor_calls: count(/\bFunction\s*\(/g, text),
      atob_calls: count(/\batob\s*\(/g, text),
      while_switch_blocks: count(/while\s*\(\s*(?:!!\[\]|true|!0)\s*\)\s*\{\s*switch\s*\(/g, text),
      split_pipe_sequences: count(/\.split\s*\(\s*['"]\|['"]\s*\)/g, text),
      webpack_require: count(/\b__webpack_require__\b/g, text),
      browserify_require: count(/\bfunction\s+require\s*\(/g, text),
      self_defending_hints: count(/constructor\s*\(\s*['"]debugger|toString\s*\(\)\s*\[\s*['"]constructor/g, text),
    },
    top_identifier_prefixes: topPrefixes(text),
  };

  result.route_hints = [];
  if (result.indicators.webpack_require || result.indicators.browserify_require) {
    result.route_hints.push('bundle-unpack-before-module-level-deobfuscation');
  }
  if (result.indicators.underscore_0x_identifiers || result.indicators.hex_escapes || result.indicators.while_switch_blocks) {
    result.route_hints.push('try-rev-js-deobfuscator-cli-then-rev-js-ast');
  }
  if (result.indicators.eval_calls || result.indicators.function_constructor_calls) {
    result.route_hints.push('capture-runtime-generated-code-before-static-transform');
  }
  if (result.indicators.debugger_statements || result.indicators.self_defending_hints) {
    result.route_hints.push('remove-or-neutralize-anti-debug-in-local-copy');
  }
  return result;
}

function printMarkdown(result) {
  console.log(`# JS Obfuscation Fingerprint`);
  console.log(`File: ${result.file}`);
  console.log(`Bytes: ${result.bytes}`);
  console.log(`Lines: ${result.lines}`);
  console.log('\n## Indicators');
  for (const [key, value] of Object.entries(result.indicators)) {
    console.log(`- ${key}: ${value}`);
  }
  console.log('\n## Top Identifier Prefixes');
  for (const item of result.top_identifier_prefixes) {
    console.log(`- ${item.prefix}: ${item.occurrences}`);
  }
  console.log('\n## Route Hints');
  for (const hint of result.route_hints) {
    console.log(`- ${hint}`);
  }
}

const args = process.argv.slice(2);
if (!args[0]) {
  usage();
  process.exit(2);
}

const input = args[0];
let jsonOut = null;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--json') {
    jsonOut = args[++i];
  }
}

const result = fingerprint(input);
printMarkdown(result);
if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2), 'utf8');
}
