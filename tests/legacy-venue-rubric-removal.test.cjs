const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRuntime } = require('../build.cjs');

const root = path.join(__dirname, '..');

function legacyReferenceLines(source) {
  return source
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /(src\/venues\.js|runVenueDigest|fetchVenueEvents|venueDigest|\bvenues\b)/iu.test(line))
    .map(({ line, number }) => `${number}: ${line}`)
    .join('\n');
}

test('legacy Sevkabel and Brusnitsyn rubric is absent from built runtime', () => {
  const { outputPath } = buildRuntime();
  const source = fs.readFileSync(outputPath, 'utf8');
  const marker = 'Севкабель Порт + Брусницын';
  assert.equal(
    source.includes(marker),
    false,
    `legacy venue rubric still exists in generated runtime. References:\n${legacyReferenceLines(source)}`,
  );
});

test('legacy venue digest guard and config switch are removed from project', () => {
  assert.equal(fs.existsSync(path.join(root, 'api', 'legacy-venue-digest-guard.cjs')), false);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'events.json'), 'utf8'));
  assert.equal(Object.hasOwn(config, 'legacyVenueDigest'), false);
});
