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

test('Vercel static output directory exists alongside API functions', () => {
  assert.equal(fs.existsSync(path.join(root, 'public', 'index.html')), true);
});

test('one-time manual daily trigger is routed and safely token-hashed', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const route = config.rewrites.find((item) => item.source === '/api/manual-daily');
  assert.deepEqual(route, { source: '/api/manual-daily', destination: '/api/index?route=manual-daily' });
  const entry = fs.readFileSync(path.join(root, 'api/index.js'), 'utf8');
  assert.match(entry, /9cd4e9bd85ad74e42f2419e0b7a254392a84212327aaac99dbd3b968c976ba35/);
  assert.equal(entry.includes('6G2LB8sbqLvH_lHmdHHNa8mAkTUKdGKauvlqoCNKQe4'), false, 'raw manual token must never be committed');
  assert.match(entry, /process\.env\.CRON_SECRET/);
  assert.match(entry, /req\.query\.route = 'daily'/);
  assert.match(entry, /req\.query\.date = '2026-08-18'/);
});

test('telegram runtime is called without CRON_SECRET and restores it afterward', async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'production-secret';
  try {
    const entry = require('../api/index.js');
    let seenSecret = 'not-called';
    const fakeRuntime = async () => {
      seenSecret = process.env.CRON_SECRET;
      return 'ok';
    };
    const result = await entry.runRuntime({ query: { route: 'telegram' } }, {}, fakeRuntime);
    assert.equal(result, 'ok');
    assert.equal(seenSecret, undefined);
    assert.equal(process.env.CRON_SECRET, 'production-secret');
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});

test('non-Telegram routes keep CRON_SECRET available', async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'production-secret';
  try {
    const entry = require('../api/index.js');
    let seenSecret;
    const fakeRuntime = async () => {
      seenSecret = process.env.CRON_SECRET;
      return 'ok';
    };
    await entry.runRuntime({ query: { route: 'health' } }, {}, fakeRuntime);
    assert.equal(seenSecret, 'production-secret');
    assert.equal(process.env.CRON_SECRET, 'production-secret');
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});
