#!/usr/bin/env bun
// Build a file://-readable copy of out/ at out-offline/.
// Next.js static export emits absolute paths (/_next/..., /article/foo/) which
// don't resolve when the bundle is opened locally. This rewrites HTML to use
// relative paths and appends index.html to internal directory links so iPad
// Safari can render the bundle straight off Files.app.
// Run after `next build` (which produces out/).

import { readFileSync, writeFileSync, readdirSync, statSync, rmSync, existsSync, cpSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");
const BUNDLE = path.join(ROOT, "out-offline");

if (!existsSync(OUT)) {
  console.error("No out/ directory. Run `bun run build` first.");
  process.exit(1);
}

if (existsSync(BUNDLE)) rmSync(BUNDLE, { recursive: true, force: true });
cpSync(OUT, BUNDLE, { recursive: true });

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

function relPrefixFor(file: string): string {
  const fromDir = path.dirname(file);
  const rel = path.relative(fromDir, BUNDLE);
  return rel === "" ? "." : rel;
}

let htmlCount = 0;
let rewriteCount = 0;

for (const file of walk(BUNDLE)) {
  if (!file.endsWith(".html")) continue;
  htmlCount++;
  const prefix = relPrefixFor(file);
  let html = readFileSync(file, "utf8");

  // 1) href="/" / src="/" → prefix/index.html (header home link).
  html = html.replace(/(href|src)="\/"/g, (_m, attr) => {
    rewriteCount++;
    return `${attr}="${prefix}/index.html"`;
  });

  // 2) Root-relative "/foo..." → "<prefix>/foo...". Skip "//..." (protocol-relative).
  html = html.replace(/(href|src)="\/([^/"][^"]*)"/g, (_m, attr, rest) => {
    rewriteCount++;
    return `${attr}="${prefix}/${rest}"`;
  });

  // 3) Internal directory links ("./path/" or "../path/") need index.html for file://.
  html = html.replace(/(href)="((?:\.{1,2}\/)+[^"]*\/)"/g, (_m, attr, p) => {
    rewriteCount++;
    return `${attr}="${p}index.html"`;
  });

  writeFileSync(file, html);
}

console.log(`Offline bundle: rewrote ${rewriteCount} paths across ${htmlCount} HTML files`);
console.log(`-> ${path.relative(ROOT, BUNDLE)}/index.html`);
console.log(`\nAirDrop the entire ${path.basename(BUNDLE)}/ folder to iPad.`);
console.log(`On iPad, open it from Files.app → tap index.html → "Open in Safari".`);
