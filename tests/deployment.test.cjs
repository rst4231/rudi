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

test('telegram runtime hides CRON_SECRET without mutating the process environment', async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'production-secret';
  try {
    const entry = require('../api/index.js');
    let telegramSeen;
    let healthSeen;
    await Promise.all([
      entry.runRuntime({ query: { route: 'telegram' } }, {}, async () => {
        telegramSeen = process.env.CRON_SECRET;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }),
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await entry.runRuntime({ query: { route: 'health' } }, {}, async () => {
          healthSeen = process.env.CRON_SECRET;
        });
      })(),
    ]);
    assert.equal(telegramSeen, undefined);
    assert.equal(healthSeen, 'production-secret');
    assert.equal(process.env.CRON_SECRET, 'production-secret');
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});

test('serverless entrypoint never deletes CRON_SECRET globally', () => {
  const entry = fs.readFileSync(path.join(root, 'api/index.js'), 'utf8');
  assert.equal(entry.includes('delete process.env.CRON_SECRET'), false);
});

test('Stage Club prices are replaced with the safe ticket-page wording', () => {
  const entry = require('../api/index.js');
  const input = 'Stage StandUp Club\n💳 1 500 ₽ · 18+';
  assert.equal(
    entry.sanitizeStagePriceText(input),
    'Stage StandUp Club\n💳 стоимость уточняйте на странице билетов · 18+',
  );
});
