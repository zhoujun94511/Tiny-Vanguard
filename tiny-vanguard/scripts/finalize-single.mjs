import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  artifactFileName,
  formatBuildStamp,
  isArtifactName,
  readAppConfig,
  readVersion,
} from './dist-artifact.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const { id: appSlug, title: appTitle } = readAppConfig(rootDir);
const version = readVersion(rootDir);
const stamp = formatBuildStamp();
const outFileName = artifactFileName(appSlug, version, stamp.fileStamp);

const distDir = path.join(rootDir, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const targetHtmlPath = path.join(distDir, outFileName);
const pagesDir = path.join(rootDir, '..', 'docs');
const pagesIndexPath = path.join(pagesDir, 'index.html');

if (!fs.existsSync(indexHtmlPath)) {
  throw new Error(`Expected singlefile build output at ${indexHtmlPath}`);
}

function getFaviconDataUri() {
  const faviconPath = path.join(rootDir, 'src/assets/favicon.png');
  if (fs.existsSync(faviconPath)) {
    const b64 = fs.readFileSync(faviconPath).toString('base64');
    return `data:image/png;base64,${b64}`;
  }
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%231b263b'/%3E%3Ccircle cx='32' cy='34' r='16' fill='%23ffd166'/%3E%3C/svg%3E";
}

let html = fs.readFileSync(indexHtmlPath, 'utf8');

// Ensure title & version/build-time metadata match unified APP_CONFIG + package.json
html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${appTitle}</title>`);
if (!/<meta[^>]+name=["']version["']/i.test(html)) {
  html = html.replace(
    '</head>',
    `  <meta name="version" content="${version}" />\n  <meta name="build-time" content="${stamp.iso}" />\n</head>`
  );
}

// Ensure favicon is an inline data:image/* URI from src/assets/favicon.png
const iconTagMatch = html.match(/<link\b[^>]*rel=["']icon["'][^>]*>/i);
if (iconTagMatch) {
  if (!/href=["']data:image\//i.test(iconTagMatch[0])) {
    html = html.replace(
      iconTagMatch[0],
      `<link rel="icon" type="image/png" href="${getFaviconDataUri()}" />`
    );
  }
} else {
  html = html.replace(
    '</head>',
    `  <link rel="icon" type="image/png" href="${getFaviconDataUri()}" />\n</head>`
  );
}

// Ensure classic script compatibility for file:// double-click execution
html = html.replace(/<script\b([^>]*)>/gi, (full, attrs) => {
  if (/\bsrc\s*=/i.test(attrs)) return full;
  const cleaned = attrs
    .replace(/\btype\s*=\s*["']module["']/gi, '')
    .replace(/\bcrossorigin\b/gi, '')
    .trim();
  return cleaned ? `<script ${cleaned} defer>` : '<script defer>';
});

// Move any inline <script defer> before </body> without String.replace $-pattern expansion!
const headScriptMatch = html.match(/<head>[\s\S]*?(<script\b[^>]*>[\s\S]*?<\/script>)[\s\S]*?<\/head>/i);
if (headScriptMatch) {
  const scriptBlock = headScriptMatch[1];
  html = html.replace(scriptBlock, () => '');
  html = html.replace(/<\/body>/i, () => `${scriptBlock}\n</body>`);
}

// Escape any accidental </script inside inline script body
html = html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, open, body, close) => {
  const safeBody = body.replace(/<\/script/gi, '<\\/script');
  return `${open}${safeBody}${close}`;
});

// Stamp metadata comment matching Starweaver convention
html = `<!-- ${appSlug} ${version} | ${stamp.display} -->\n` + html;

// Stage both dist/<artifact>.html and ../docs/index.html atomically
fs.mkdirSync(pagesDir, { recursive: true });
const tempHtmlPath = `${targetHtmlPath}.tmp-${process.pid}`;
const tempDocsPath = path.join(pagesDir, `index.html.tmp-${process.pid}`);
try {
  fs.writeFileSync(tempHtmlPath, html, 'utf8');
  fs.copyFileSync(tempHtmlPath, tempDocsPath);
  fs.renameSync(tempHtmlPath, targetHtmlPath);
  fs.rmSync(pagesIndexPath, { force: true });
  fs.renameSync(tempDocsPath, pagesIndexPath);

  if (path.resolve(indexHtmlPath) !== path.resolve(targetHtmlPath)) {
    fs.rmSync(indexHtmlPath, { force: true });
  }
  // Keep only the newest versioned deliverable (remove un-inlined asset copies like logo-*.png)
  for (const name of fs.readdirSync(distDir)) {
    if (
      name !== outFileName &&
      (name === `${appSlug}.html` ||
        isArtifactName(appSlug, name) ||
        /^(logo|favicon)-.*\.png$/i.test(name))
    ) {
      fs.rmSync(path.join(distDir, name), { force: true });
    }
  }
} finally {
  fs.rmSync(tempHtmlPath, { force: true });
  fs.rmSync(tempDocsPath, { force: true });
}

const stat = fs.statSync(targetHtmlPath);
const mib = (stat.size / (1024 * 1024)).toFixed(3);
console.log(`Built single HTML: ${targetHtmlPath}`);
console.log(`Synced GitHub Pages: ${pagesIndexPath}`);
console.log(`Version: ${version}`);
console.log(`Built at: ${stamp.display}`);
console.log(`Exact size: ${stat.size} bytes (${mib} MiB)`);
