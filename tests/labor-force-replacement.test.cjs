const test = require('node:test');
const assert = require('node:assert/strict');
const labor = require('../api/labor-code.cjs');

test('labor module exposes explicit replacement operation for one-time repair', () => {
  assert.equal(typeof labor.replaceLaborArticle, 'function');
});
