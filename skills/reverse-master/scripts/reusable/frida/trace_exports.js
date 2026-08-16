/*
Purpose: Frida template for quick export-level tracing before writing a task-specific hook.
Inputs: Edit MODULE_NAME and EXPORT_REGEX below, or define globals before loading if your runner supports it.
Outputs: Console logs for matched export calls.
Dependencies: Frida.
Safe defaults: Logs first four pointer arguments and return value; does not modify behavior.
Known limits: Export-level tracing only; use real call-site hooks for obfuscated/internal functions.
Example:
  frida -n target -l trace_exports.js
*/

'use strict';

const MODULE_NAME = typeof globalThis.MODULE_NAME === 'string' ? globalThis.MODULE_NAME : null;
const EXPORT_REGEX = typeof globalThis.EXPORT_REGEX === 'string' ? new RegExp(globalThis.EXPORT_REGEX) : /.*/;
const MAX_EXPORTS = typeof globalThis.MAX_EXPORTS === 'number' ? globalThis.MAX_EXPORTS : 30;

function selectedModules() {
  if (MODULE_NAME) {
    return [Process.getModuleByName(MODULE_NAME)];
  }
  return Process.enumerateModules().filter((m) => !m.path.includes('/System/') && !m.path.includes('\\Windows\\System32\\'));
}

function fmtPtr(value) {
  try {
    return value + '';
  } catch (_) {
    return '<unprintable>';
  }
}

let installed = 0;
for (const mod of selectedModules()) {
  const exports = mod.enumerateExports()
    .filter((e) => e.type === 'function' && EXPORT_REGEX.test(e.name))
    .slice(0, MAX_EXPORTS);

  for (const exp of exports) {
    try {
      Interceptor.attach(exp.address, {
        onEnter(args) {
          this.name = `${mod.name}!${exp.name}`;
          const shown = [];
          for (let i = 0; i < 4; i++) {
            shown.push(fmtPtr(args[i]));
          }
          console.log(`[enter] ${this.name}(${shown.join(', ')})`);
        },
        onLeave(retval) {
          console.log(`[leave] ${this.name} -> ${fmtPtr(retval)}`);
        },
      });
      installed += 1;
      console.log(`[hooked] ${mod.name}!${exp.name} @ ${exp.address}`);
    } catch (err) {
      console.log(`[skip] ${mod.name}!${exp.name}: ${err}`);
    }
  }
}

console.log(`[trace_exports] installed ${installed} hooks`);
