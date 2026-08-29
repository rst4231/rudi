const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function walk(dir, rows = []) {
  if (!fs.existsSync(dir)) return rows;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, rows);
    else if (/\.(?:c?js|mjs)$/u.test(entry.name)) rows.push(full);
  }
  return rows;
}

function legacyUrlParseFiles() {
  const roots = [
    path.join(root, 'api'),
    path.join(root, 'runtime'),
    path.join(root, 'build.cjs'),
    path.join(root, 'node_modules', '@vercel', 'functions'),
    path.join(root, 'node_modules', '@vercel', 'oidc'),
  ];
  const files = [];
  for (const target of roots) {
    if (!fs.existsSync(target)) continue;
    const stat = fs.statSync(target);
    if (stat.isDirectory()) walk(target, files);
    else files.push(target);
  }
  return files.filter((file) => /\burl\.parse\s*\(/u.test(fs.readFileSync(file, 'utf8')));
}

test('RUDI runtime and installed Vercel helpers do not call deprecated url.parse', () => {
  assert.deepEqual(legacyUrlParseFiles().map((file) => path.relative(root, file)), []);
});