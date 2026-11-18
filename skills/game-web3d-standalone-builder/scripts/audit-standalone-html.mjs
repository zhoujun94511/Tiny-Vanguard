#!/usr/bin/env node
// Automated Offline Purity & Size Gate for Standalone Web 3D HTML Deliverables.
// Usage: node audit-standalone-html.mjs [path-to-standalone.html] [maxSizeMB=1.5]
// With no path, audits the newest tiny-vanguard/dist/tiny-vanguard-<version>-<YYYYMMDD-HHmmss>.html.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findLatestArtifact(distDir) {
  if (!fs.existsSync(distDir)) return null;
  const files = fs
    .readdirSync(distDir)
    .filter((f) => /^tiny-vanguard-.*\.html$/i.test(f))
    .map((f) => {
      const full = path.join(distDir, f);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full ?? null;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const targetArg = process.argv[2];
const maxMb = Number(process.argv[3] || (targetArg && /^\d+(\.\d+)?$/.test(targetArg) ? targetArg : 1.5));
const explicitPath = targetArg && !/^\d+(\.\d+)?$/.test(targetArg) ? targetArg : null;
const htmlPath = explicitPath
  ? path.resolve(process.cwd(), explicitPath)
  : findLatestArtifact(path.resolve(scriptDir, '../../../tiny-vanguard/dist'));

if (!htmlPath || !fs.existsSync(htmlPath)) {
  console.error(`❌ [FAIL] File not found: ${htmlPath || 'tiny-vanguard/dist/tiny-vanguard-<version>-<YYYYMMDD-HHmmss>.html'}`);
  process.exit(1);
}

const stat = fs.statSync(htmlPath);
const sizeMb = stat.size / (1024 * 1024);
const html = fs.readFileSync(htmlPath, 'utf8');

const violations = [];

if (!/<html\b[^>]*\blang=["'][a-z-]+["']/i.test(html)) {
  violations.push('Root <html lang="..."> tag is missing or malformed');
}

if (sizeMb > maxMb) {
  violations.push(`Size ${sizeMb.toFixed(3)} MB exceeds target budget ${maxMb} MB`);
}
if (/<script\b[^>]*\bsrc\s*=/i.test(html)) {
  violations.push('Contains external <script src="..."> tag');
}
for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
  const hm = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (hm) {
    const val = (hm[1] ?? hm[2] ?? hm[3] ?? '').trim();
    if (!val.startsWith('data:image/')) {
      violations.push(`Contains external <link href="${val.slice(0, 60)}"> tag`);
    }
  }
}
if (/@import\s+(url\(|["'])/i.test(html)) {
  violations.push('Contains CSS @import rule');
}
if (/\b(fetch|XMLHttpRequest|WebSocket|navigator\.sendBeacon)\s*\(/i.test(html)) {
  const remoteUrlMatches = html.match(/https?:\/\/[^\s"'`<>)]+/gi) || [];
  const nonSpecUrls = remoteUrlMatches.filter(
    (u) =>
      !u.includes('www.w3.org/') &&
      !u.includes('threejs.org') &&
      !u.includes('khronos.org')
  );
  if (nonSpecUrls.length > 0) {
    violations.push(`Contains remote runtime URLs: ${nonSpecUrls.slice(0, 5).join(', ')}`);
  }
}

if (violations.length > 0) {
  console.error(`❌ [FAIL] Standalone HTML audit failed for ${htmlPath}:`);
  for (const v of violations) {
    console.error(`   - ${v}`);
  }
  process.exit(1);
}

console.log(`✅ [PASS] Standalone HTML Offline Gate Passed!`);
console.log(`   - Path: ${htmlPath}`);
console.log(`   - Exact Size: ${stat.size} bytes (${sizeMb.toFixed(3)} MB <= ${maxMb} MB budget)`);
console.log(`   - External Tags / Remote Asset Leaks: 0`);
