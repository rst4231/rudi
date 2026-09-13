const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../config/rudi-settings.json');

test('weekend digest is disabled in production settings', () => {
  assert.equal(settings.sections.weekend.enabled, false);
});
