const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { buildRuntime } = require('../build.cjs');

const root = path.join(__dirname, '..');
const forbidden = [
  'Севкабель Порт + Брусницын',
  'src/venues.js',
  'src/venue-digest.js',
  'runVenueDigest',
  'fetchVenueEvents',
  'loadVenueDigestMessageIds',
  'rememberVenueDigestMessageIds',
  'run("venues"',
];

function rawRuntimeSource() {
  const encoded = Array.from({ length: 7 }, (_, index) =>
    fs.readFileSync(path.join(root, 'runtime', `chunk${index}.txt`), 'utf8').trim(),
  ).join('');
  return zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
}

function assertNoLegacyVenueRubric(source, label) {
  for (const marker of forbidden) {
    assert.equal(source.includes(marker), false, `${label} still contains legacy venue marker: ${marker}`);
  }
}

test('legacy Sevkabel and Brusnitsyn rubric is physically absent from runtime source and build output', () => {
  assertNoLegacyVenueRubric(rawRuntimeSource(), 'raw runtime');
  const { outputPath } = buildRuntime();
  assertNoLegacyVenueRubric(fs.readFileSync(outputPath, 'utf8'), 'generated runtime');
});

test('legacy venue guard and config switch are removed while ordinary venue blocklist remains', () => {
  assert.equal(fs.existsSync(path.join(root, 'api', 'legacy-venue-digest-guard.cjs')), false);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'events.json'), 'utf8'));
  assert.equal(Object.hasOwn(config, 'legacyVenueDigest'), false);
  assert.ok(config.blockedVenueTokens.includes('севкабель'));
  assert.ok(config.blockedVenueTokens.includes('брусницын'));
});
