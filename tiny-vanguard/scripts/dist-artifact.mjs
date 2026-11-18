import fs from 'node:fs';
import path from 'node:path';

export function readAppConfig(rootDir) {
  const src = fs.readFileSync(path.join(rootDir, 'src/config/appConfig.ts'), 'utf8');
  const idMatch = src.match(/id:\s*['"]([^'"]+)['"]/);
  const titleMatch = src.match(/title:\s*['"]([^'"]+)['"]/);
  return {
    id: idMatch ? idMatch[1] : 'tiny-vanguard',
    title: titleMatch ? titleMatch[1] : 'Tiny Vanguard',
  };
}

export function readVersion(rootDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version || '')) {
    throw new Error(`package.json version must be x.y.z, got ${pkg.version}`);
  }
  return pkg.version;
}

export function formatBuildStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const zone = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return {
    fileStamp: `${year}${month}${day}-${hour}${minute}${second}`,
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`,
    display: `${year}-${month}-${day} ${hour}:${minute}:${second} ${zone}`,
  };
}

export function artifactFileName(slug, version, fileStamp) {
  return `${slug}-${version}-${fileStamp}.html`;
}

export function isArtifactName(slug, name) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}-(\\d+\\.\\d+\\.\\d+)-(\\d{8})-(\\d{6})\\.html$`).test(name);
}

export function listArtifacts(distDir, slug) {
  if (!fs.existsSync(distDir)) return [];
  return fs
    .readdirSync(distDir)
    .filter((name) => isArtifactName(slug, name))
    .sort();
}

export function findLatestArtifact(distDir, slug) {
  const names = listArtifacts(distDir, slug);
  if (names.length === 0) return null;
  return path.join(distDir, names[names.length - 1]);
}
