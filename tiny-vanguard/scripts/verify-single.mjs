import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { findLatestArtifact, readAppConfig } from './dist-artifact.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const { id: appSlug } = readAppConfig(rootDir);
const distDir = path.join(rootDir, 'dist');

const htmlPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : findLatestArtifact(distDir, appSlug);

if (!htmlPath || !fs.existsSync(htmlPath)) {
  console.error(
    `[FAIL] Single HTML not found in ${distDir} (expected ${appSlug}-<version>-<YYYYMMDD-HHmmss>.html)`
  );
  process.exit(1);
}

const MAX_SINGLE_BYTES = 1.5 * 1024 * 1024;
const stat = fs.statSync(htmlPath);
if (stat.size < 1024) {
  console.error(`[FAIL] Single HTML is unexpectedly small (${stat.size} bytes)`);
  process.exit(1);
}
if (stat.size > MAX_SINGLE_BYTES) {
  console.error(
    `[FAIL] Single HTML exceeds 1.5 MiB limit (${(stat.size / (1024 * 1024)).toFixed(3)} MiB)`
  );
  process.exit(1);
}

const docsIndexPath = path.resolve(rootDir, '..', 'docs', 'index.html');
if (!fs.existsSync(docsIndexPath) || fs.readFileSync(docsIndexPath, 'utf8') !== fs.readFileSync(htmlPath, 'utf8')) {
  console.error(`[FAIL] Synced docs/index.html is missing or out of sync with ${htmlPath}`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const violations = [];

if (!/<html[^>]*\blang=/i.test(html)) {
  violations.push('Missing <html lang="..."> attribute');
}
if (/<script\b[^>]*\bsrc\s*=/i.test(html)) {
  violations.push('Contains external <script src="..."> tag');
}
if (/<script\b[^>]*\btype\s*=\s*["']module["']/i.test(html)) {
  violations.push('Contains <script type="module"> which fails under file:// CORS');
}
for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
  const hm = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (hm) {
    const val = (hm[1] ?? hm[2] ?? hm[3] ?? '').trim();
    if (!val.startsWith('data:image/')) {
      violations.push(`Contains external <link href="${val.slice(0, 80)}">`);
    }
  }
}
if (/@import\s+(url\(|["'])/i.test(html)) {
  violations.push('Contains CSS @import rule');
}
if (/\bimport\s*\(/i.test(html)) {
  const dynMatches = html.match(/\bimport\s*\(\s*['"][^'"]+['"]\s*\)/gi) || [];
  if (dynMatches.length > 0) {
    violations.push(`Contains dynamic import(): ${dynMatches.slice(0, 3).join(', ')}`);
  }
}

// Parse every inline <script> block with vm.Script to catch any HTML/JS escaping or syntax corruption
const scriptBlocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (scriptBlocks.length === 0) {
  violations.push('No inline <script> block found');
} else {
  for (let i = 0; i < scriptBlocks.length; i += 1) {
    try {
      new vm.Script(scriptBlocks[i][1]);
    } catch (err) {
      violations.push(`Inline <script> #${i + 1} syntax error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// Verify copying to an isolated empty temp directory preserves self-contained HTML
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-single-verify-'));
try {
  const copiedPath = path.join(tmpDir, path.basename(htmlPath));
  fs.copyFileSync(htmlPath, copiedPath);
  const copiedStat = fs.statSync(copiedPath);
  if (copiedStat.size !== stat.size) {
    violations.push('Copied single HTML size mismatch');
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (violations.length > 0) {
  console.error(`[FAIL] Single HTML verification failed for ${htmlPath}:`);
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
}

const mib = (stat.size / (1024 * 1024)).toFixed(3);
console.log(`[PASS] Single HTML verification passed!`);
console.log(`  - File: ${htmlPath}`);
console.log(`  - Size: ${stat.size} bytes (${mib} MiB)`);
console.log(`  - External scripts/links/module tags: 0`);
console.log(`  - Isolated temp copy check: OK`);
