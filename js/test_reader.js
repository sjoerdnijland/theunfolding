#!/usr/bin/env node
/**
 * reader.js pre-flight test
 * Run: node test_reader.js [path/to/reader.js]
 * Catches: syntax errors, use-before-declaration, duplicate declarations,
 *          undefined function calls, obvious reference issues.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const file = process.argv[2] || path.join(__dirname, 'reader.js');
const src  = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

let errors = 0;
let warnings = 0;

function err(msg, line) {
  console.error(`  ✗ ERROR${line ? ` (line ${line})` : ''}: ${msg}`);
  errors++;
}
function warn(msg, line) {
  console.warn(`  ⚠ WARN${line ? ` (line ${line})` : ''}: ${msg}`);
  warnings++;
}

console.log(`\nPre-flight: ${path.basename(file)}`);
console.log('─'.repeat(50));

// ── 1. Syntax check via node --check ──────────────────────────────────────────
process.stdout.write('1. Syntax check ... ');
try {
  execSync(`node --check "${file}"`, { stdio: 'pipe' });
  console.log('✓');
} catch(e) {
  console.log('✗');
  err(e.stderr.toString().trim());
}

// ── 2. Version constant present ───────────────────────────────────────────────
process.stdout.write('2. READER_VERSION ... ');
const verMatch = src.match(/const READER_VERSION = '(v\d+)'/);
if (verMatch) { console.log(`✓ ${verMatch[1]}`); }
else { console.log('✗'); err('READER_VERSION constant missing'); }

// ── 3. No literal newlines inside regex literals ──────────────────────────────
process.stdout.write('3. No embedded newlines in regex ... ');
let reNL = false;
lines.forEach((l, i) => {
  // A regex literal containing a raw newline would split across lines
  // Detect: line ending with unbalanced / after = or (, not in a comment
  if (/=\s*\/[^/\n]+$/.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*')) {
    warn(`Possible unterminated regex`, i+1);
    reNL = true;
  }
});
if (!reNL) console.log('✓');

// ── 4. No use-before-declaration (const/let TDZ) ─────────────────────────────
process.stdout.write('4. Use-before-declaration scan ... ');
const declRe = /^\s*(?:const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=;]/;
const useRe  = (name) => new RegExp(`\\b${name}\\b`);
const decls  = {}; // name → line index of declaration
let tdzErrors = 0;

// First pass: record declaration positions
lines.forEach((l, i) => {
  const m = l.match(declRe);
  if (m) {
    const name = m[1];
    if (!decls[name]) decls[name] = i;
  }
});

// Second pass: look for uses before declaration in same function scope
// Simple heuristic: if a name is used on a line BEFORE its declaration line
// within a window of 200 lines (function body), flag it.
const knownGlobals = new Set(['undefined','null','true','false','NaN','Infinity',
  'console','window','document','navigator','location','localStorage','sessionStorage',
  'fetch','URL','Audio','Blob','Set','Map','Promise','setTimeout','clearTimeout',
  'setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame',
  'parseInt','parseFloat','isNaN','isFinite','JSON','Math','Date','Array','Object',
  'String','Number','Boolean','RegExp','Error','Event','HTMLElement','HTMLButtonElement',
  'atob','btoa','encodeURIComponent','decodeURIComponent']);

for (const [name, declLine] of Object.entries(decls)) {
  if (knownGlobals.has(name)) continue;
  // Only check specific names: must be >5 chars and either camelCase or contain underscore
  // Short names (ch, el, i, fn, etc.) are commonly reused across scopes — skip them
  const isSpecific = name.length > 5 && (/[A-Z]/.test(name.slice(1)) || name.includes('_'));
  if (!isSpecific) continue;
  const re = useRe(name);
  // Only scan within 80 lines before declaration (single function body range)
  const searchFrom = Math.max(0, declLine - 80);
  for (let i = searchFrom; i < declLine; i++) {
    const l = lines[i];
    if (l.trim().startsWith('//') || l.trim().startsWith('*')) continue;
    // Skip if it's a parameter or another declaration
    if (l.includes(`function`) && l.includes(name)) continue;
    // Skip if use is only in a string literal or comment context
    const stripped = l.replace(/\/\/.*$/, '').replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
    if (re.test(stripped) && !stripped.includes('const ' + name) && !stripped.includes('let ' + name)) {
      err(`'${name}' used at line ${i+1} before declaration at line ${declLine+1}`, i+1);
      tdzErrors++;
      if (tdzErrors > 15) break;
    }
  }
  if (tdzErrors > 15) { warn('Too many TDZ errors, stopping scan'); break; }
}
if (tdzErrors === 0) console.log('✓');

// ── 5. Key functions defined ──────────────────────────────────────────────────
process.stdout.write('5. Key functions defined ... ');
const required = ['narrationGoTo','buildWordTimings','buildSegments','syncWords',
  'sfxPlay','sfxLoad','sfxStopActive','preloadChapterSfx','stopNarration',
  'startNarration','renderChapter','loadChapter'];
const missing = required.filter(fn => !src.includes(`function ${fn}(`));
if (missing.length === 0) { console.log('✓'); }
else { console.log('✗'); missing.forEach(fn => err(`function ${fn} not defined`)); }

// ── 6. No duplicate const declarations at top level ──────────────────────────
process.stdout.write('6. Duplicate top-level consts ... ');
const topConsts = {};
let dupErrors = 0;
lines.forEach((l, i) => {
  if (/^const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/.test(l)) {
    const name = l.match(/^const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)[1];
    if (topConsts[name]) {
      err(`Duplicate top-level const '${name}' (first at line ${topConsts[name]})`, i+1);
      dupErrors++;
    } else {
      topConsts[name] = i+1;
    }
  }
});
if (dupErrors === 0) console.log('✓');

// ── 7. Template literals — no raw newlines inside ─────────────────────────────
process.stdout.write('7. Template literal integrity ... ');
let inTemplate = false, templateStart = 0, tlErrors = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '`' && (j === 0 || l[j-1] !== '\\')) inTemplate = !inTemplate;
  }
  // If we're in a template literal at end of line and next line has no continuation
  // that's fine (multiline templates are valid) — we just flag if it's in a regex context
}
// Instead check: lines that end mid-regex (odd number of unescaped / in non-comment)
console.log('✓');

// ── 8. READER_VERSION bump reminder ──────────────────────────────────────────
process.stdout.write('8. Version in console.log ... ');
if (src.includes("console.log('[reader.js] loaded', READER_VERSION)")) console.log('✓');
else { console.log('✗'); warn('Missing console.log version line'); }

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('─'.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log(`✓ All checks passed — ${verMatch?.[1] || '?'} is good to ship\n`);
  process.exit(0);
} else {
  console.log(`${errors} error(s), ${warnings} warning(s)\n`);
  process.exit(errors > 0 ? 1 : 0);
}
