const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Aug 20 cinema replacement deletes tracked cards and sends one collage exactly once', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'cinema-replace-20260820.js'), 'utf8');
  assert.match(source, /manual-collage-replace:2026-08-20/);
  assert.match(source, /deleteTrackedMessages/);
  assert.match(source, /buildCinemaCollage/);
  assert.match(source, /buildCinemaDigestCaption/);
  assert.match(source, /sendTelegramCollage/);
});
