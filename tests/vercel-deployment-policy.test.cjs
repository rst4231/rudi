const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('only main can auto-deploy while preview Git deployments stay disabled', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(config.git.deploymentEnabled, {'*': false, main: true});
  assert.equal(config.crons[0].path, '/api/daily');
  assert.equal(config.crons[0].schedule, '30 21 * * *');
});
