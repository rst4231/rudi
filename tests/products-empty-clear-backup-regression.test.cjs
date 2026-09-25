const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'partner-message.js'), 'utf8');

test('cleared products stay empty when an older backup token still contains items', () => {
  const actionStart = source.indexOf("if (action === 'products')");
  const listStart = source.indexOf("if (operation === 'list')", actionStart);
  assert.ok(actionStart >= 0 && listStart > actionStart);
  const hydration = source.slice(actionStart, listStart);

  assert.match(hydration, /if\s*\(!liveBefore\?\.initialized\)\s*\{/u);
  assert.doesNotMatch(hydration, /!\(liveBefore\.items\|\|\[\]\)\.length/u);
  assert.match(hydration, /restoreProductListSnapshot\(previousSnapshot\.products,options\)/u);
});
