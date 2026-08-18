const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('RUDI Vercel packaging does not require a static public output', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal('buildCommand' in config, false, 'custom buildCommand makes Vercel expect a public output directory');
});

test('runtime is generated during dependency installation', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts?.postinstall, 'node build.cjs');
});

test('serverless entrypoint statically includes @vercel/functions for bundling', () => {
  const entry = fs.readFileSync(path.join(root, 'api/index.js'), 'utf8');
  assert.match(entry, /require\(['\"]@vercel\/functions['\"]\)/);
});

test('npm test runs the full RUDI test suite', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts?.test, 'node --test tests/*.test.cjs');
});
