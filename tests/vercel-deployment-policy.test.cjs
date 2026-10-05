const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('automatic Git deployments are globally disabled without changing cron', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.git.deploymentEnabled, false);
  assert.equal(config.crons[0].path, '/api/daily');
  assert.equal(config.crons[0].schedule, '30 21 * * *');
});


test('version source changes always trigger a Vercel build',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.match(String(config.ignoreCommand||''),/rudi-version\.json/);
});
