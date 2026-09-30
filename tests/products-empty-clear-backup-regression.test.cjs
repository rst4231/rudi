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

  assert.match(hydration, /savedVersion>liveVersion/u);
  assert.doesNotMatch(hydration, /!\(liveBefore\.items\|\|\[\]\)\.length/u);
  assert.match(hydration, /restoreProductListSnapshot\(savedProducts,options\)/u);
});


test('a newer client products snapshot can repair stale shared storage, but older snapshots cannot win', () => {
  const actionStart = source.indexOf("if (action === 'products')");
  const listStart = source.indexOf("if (operation === 'list')", actionStart);
  const hydration = source.slice(actionStart, listStart);
  assert.match(hydration, /const liveVersion=Math\.max\(0,Number\(liveBefore\?\.version\|\|0\)\)/u);
  assert.match(hydration, /const savedVersion=Math\.max\(0,Number\(savedProducts\.version\|\|0\)\)/u);
  assert.match(hydration, /!liveBefore\?\.initialized \|\| savedVersion>liveVersion/u);
});
