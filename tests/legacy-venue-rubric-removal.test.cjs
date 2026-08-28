const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildRuntime } = require('../build.cjs');

const root = path.join(__dirname, '..');

function contextAround(source, marker, radius = 1200) {
  const index = source.indexOf(marker);
  if (index < 0) return '';
  return source.slice(Math.max(0, index - radius), Math.min(source.length, index + marker.length + radius));
}

test('legacy Sevkabel and Brusnitsyn rubric is absent from built runtime', () => {
  const { outputPath } = buildRuntime();
  const source = fs.readFileSync(outputPath, 'utf8');
  const marker = 'Севкабель Порт + Брусницын';
  assert.equal(
    source.includes(marker),
    false,
    `legacy venue rubric still exists in generated runtime:\n${contextAround(source, marker)}`,
  );
});

test('legacy venue digest guard and config switch are removed from project', () => {
  assert.equal(fs.existsSync(path.join(root, 'api', 'legacy-venue-digest-guard.cjs')), false);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'events.json'), 'utf8'));
  assert.equal(Object.hasOwn(config, 'legacyVenueDigest'), false);
});
