const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeIdentityText, normalizeIdentityUrl, fingerprintContent } = require('../api/content-fingerprint.cjs');

test('identity normalization ignores case, ё, spacing and harmless punctuation', () => {
  assert.equal(normalizeIdentityText('  Ёлка:  Live!  '), normalizeIdentityText('елка live'));
});

test('identity URL strips tracking parameters', () => {
  assert.equal(normalizeIdentityUrl('https://example.com/a?id=12&utm_source=x&fbclid=y'), 'https://example.com/a?id=12');
});

test('event source id dominates title changes', () => {
  assert.equal(
    fingerprintContent('events', { source: 'yandex', id: '42', title: 'A' }),
    fingerprintContent('events', { source: 'yandex', id: '42', title: 'Renamed' }),
  );
});
