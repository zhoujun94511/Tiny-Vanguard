import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const indexPath = path.join(rootDir, 'index.html');

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx|vue|js|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out.sort();
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

function gate1CircularImports(files) {
  const fileSet = new Set(files);
  const graph = new Map();
  const importRegex = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const code = stripComments(raw);
    const deps = [];
    let match;
    importRegex.lastIndex = 0;
    while ((match = importRegex.exec(code)) !== null) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const base = path.resolve(path.dirname(file), spec);
      for (const cand of [base, `${base}.ts`, `${base}.vue`, `${base}.js`]) {
        if (fileSet.has(cand)) {
          deps.push(cand);
          break;
        }
      }
    }
    graph.set(file, deps);
  }

  const state = new Map(); // 0=unvisited, 1=visiting, 2=visited
  const stack = [];
  const cycles = [];

  function dfs(node) {
    state.set(node, 1);
    stack.push(node);
    for (const dep of graph.get(node) || []) {
      const s = state.get(dep) || 0;
      if (s === 1) {
        const idx = stack.indexOf(dep);
        cycles.push(stack.slice(idx).concat(dep).map((p) => path.relative(rootDir, p)).join(' -> '));
      } else if (s === 0) {
        dfs(dep);
      }
    }
    stack.pop();
    state.set(node, 2);
  }

  for (const file of files) {
    if ((state.get(file) || 0) === 0) dfs(file);
  }

  assert.equal(cycles.length, 0, `Circular imports detected:\n  ${cycles.join('\n  ')}`);
  console.log(`[Gate 1/5] Circular import check passed (${files.length} files, 0 cycles)`);
}

function gate2SecurityAndOfflineRedlines(files) {
  const forbiddenPatterns = [
    { name: 'innerHTML', re: /\.innerHTML\b/ },
    { name: 'outerHTML', re: /\.outerHTML\b/ },
    { name: 'insertAdjacentHTML', re: /\.insertAdjacentHTML\b/ },
    { name: 'document.write', re: /\bdocument\.write\b/ },
    { name: 'eval(', re: /\beval\s*\(/ },
    { name: 'new Function', re: /\bnew\s+Function\b/ },
  ];

  const violations = [];
  for (const file of files) {
    const clean = stripComments(fs.readFileSync(file, 'utf8'));
    const lines = clean.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const pat of forbiddenPatterns) {
        if (pat.re.test(line)) {
          violations.push(`${path.relative(rootDir, file)}:${i + 1} uses forbidden ${pat.name}`);
        }
      }
      if (/https?:\/\//i.test(line)) {
        violations.push(`${path.relative(rootDir, file)}:${i + 1} contains remote URL`);
      }
    }
  }

  const html = fs.readFileSync(indexPath, 'utf8');
  assert.ok(/<html[^>]*\blang=/i.test(html), 'index.html must declare <html lang="...">');
  assert.ok(/id=["']boot-splash["']/i.test(html), 'index.html missing #boot-splash');
  assert.ok(!/<script[^>]+src=["']https?:\/\//i.test(html), 'index.html has external <script src>');
  assert.ok(!/<link[^>]+href=["']https?:\/\//i.test(html), 'index.html has external <link href>');

  assert.equal(violations.length, 0, `Security/offline violations:\n  ${violations.join('\n  ')}`);
  console.log('[Gate 2/5] Security & offline redline check passed');
}

function gate3BuildConfigIntegrity() {
  const logoPath = path.join(rootDir, 'src/assets/logo.png');
  const faviconPath = path.join(rootDir, 'src/assets/favicon.png');
  assert.ok(fs.existsSync(logoPath), 'Missing src/assets/logo.png');
  assert.ok(fs.existsSync(faviconPath), 'Missing src/assets/favicon.png');

  const finalizeSrc = fs.readFileSync(path.join(rootDir, 'scripts/finalize-single.mjs'), 'utf8');
  assert.ok(/favicon\.png/.test(finalizeSrc), 'finalize-single.mjs must embed src/assets/favicon.png');
  assert.ok(/docs/.test(finalizeSrc), 'finalize-single.mjs must sync ../docs/index.html');
  console.log('[Gate 3/5] Asset & standalone build integrity check passed');
}

function extractHotFunctionBlocks(cleanCode) {
  const blocks = [];
  const fnRegex = /(?:^|\n)\s*(?:export\s+)?(?:public\s+|private\s+)?(?:function\s+)?((?:update|step|sync|render)[A-Za-z0-9_]*)\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{/g;
  let match;
  while ((match = fnRegex.exec(cleanCode)) !== null) {
    const fnName = match[1];
    let idx = fnRegex.lastIndex;
    let depth = 1;
    while (idx < cleanCode.length && depth > 0) {
      const ch = cleanCode[idx];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      idx += 1;
    }
    blocks.push({ fnName, body: cleanCode.slice(match.index, idx) });
  }
  return blocks;
}

function gate4HotLoopZeroGc(files) {
  const gcPatterns = [
    { name: 'new THREE.<Math>', re: /\bnew\s+THREE\.(Vector3|Vector2|Color|Matrix4|Quaternion|Euler|Box3|Raycaster)\b/ },
    { name: '.clone()', re: /\.clone\s*\(/ },
    { name: 'Object.keys/values/entries()', re: /\bObject\.(keys|values|entries)\s*\(/ },
  ];

  const violations = [];
  for (const file of files) {
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    if (!rel.startsWith('src/game/') || rel.includes('__tests__')) continue;
    const clean = stripComments(fs.readFileSync(file, 'utf8'));
    const blocks = extractHotFunctionBlocks(clean);
    for (const { fnName, body } of blocks) {
      for (const pat of gcPatterns) {
        if (pat.re.test(body)) {
          violations.push(`${rel} -> ${fnName}() contains ${pat.name}`);
        }
      }
    }
  }

  assert.equal(violations.length, 0, `Hot-loop zero-GC violations:\n  ${violations.join('\n  ')}`);
  console.log('[Gate 4/5] Hot-loop zero-GC check passed');
}

function countIdsInFile(relPath) {
  const clean = stripComments(fs.readFileSync(path.join(rootDir, relPath), 'utf8'));
  const matches = clean.match(/\bid:\s*['"][a-z0-9-]+['"]/g) || [];
  return new Set(matches.map((m) => m.replace(/\s+/g, ''))).size;
}

function gate5ContentDiversityAndDecoupling(files) {
  const quotas = [
    { path: 'src/game/content/effects/debuffs.ts', min: 20, label: 'Debuffs' },
    { path: 'src/game/content/buffs/buffs.ts', min: 20, label: 'Buffs' },
    { path: 'src/game/content/equipment/equipment.ts', min: 20, label: 'Equipment' },
    { path: 'src/game/content/upgrades/upgrades.ts', min: 20, label: 'Upgrades' },
  ];

  const counts = [];
  for (const q of quotas) {
    const cnt = countIdsInFile(q.path);
    assert.ok(cnt >= q.min, `${q.label} in ${q.path} has ${cnt} items (required >= ${q.min})`);
    counts.push(`${q.label}=${cnt}`);
  }

  const levelsClean = stripComments(
    fs.readFileSync(path.join(rootDir, 'src/game/content/levels/levels.ts'), 'utf8')
  );
  const visibleCount = (levelsClean.match(/\bvisibleInMenu:\s*true\b/g) || []).length;
  assert.ok(visibleCount >= 4, `levels.ts must have >= 4 visibleInMenu levels, got ${visibleCount}`);

  const levelIdRe = /['"](?:meadow-arena|bridge-defense|ember-canyon|frost-bridge)['"]/;
  const couplingViolations = [];
  for (const file of files) {
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    if (
      rel.startsWith('src/game/content/') ||
      rel.startsWith('src/game/i18n/') ||
      rel.includes('__tests__')
    ) {
      continue;
    }
    const clean = stripComments(fs.readFileSync(file, 'utf8'));
    if (levelIdRe.test(clean)) {
      couplingViolations.push(rel);
    }
  }
  assert.equal(
    couplingViolations.length,
    0,
    `Hardcoded level IDs found outside content/i18n:\n  ${couplingViolations.join('\n  ')}`
  );
  console.log(`[Gate 5/5] Content quota (${counts.join(', ')}, Levels=${visibleCount}) & decoupling passed`);
}

const files = collectSourceFiles(srcDir);
gate1CircularImports(files);
gate2SecurityAndOfflineRedlines(files);
gate3BuildConfigIntegrity();
gate4HotLoopZeroGc(files);
gate5ContentDiversityAndDecoupling(files);
console.log('[PASS] Prebuild checks passed!');
