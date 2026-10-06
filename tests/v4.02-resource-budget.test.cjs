const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const supplements=fs.readFileSync(path.join(root,'public','profile-supplements.js'),'utf8');
const version=JSON.parse(fs.readFileSync(path.join(root,'rudi-version.json'),'utf8'));

test('v4.02 keeps background refresh inside a lower Vercel resource budget',()=>{
  assert.match(app,/const HOME_BOOTSTRAP_CACHE_MS = 5\*60\*1000;/);
  assert.match(app,/const UI_PREFERENCES_SYNC_DEDUPE_MS=15\*60\*1000;/);
  assert.match(app,/key:'ticktick',everyMs:10\*60\*1000/);
  assert.match(app,/key:'market-ticker',everyMs:15\*60\*1000/);
  assert.match(app,/key:'activity',everyMs:30\*60\*1000/);
  assert.match(app,/key:'work-calendar',everyMs:30\*60\*1000/);
  assert.match(app,/key:'shared-album',everyMs:30\*60\*1000/);
  assert.match(app,/key:'feed',everyMs:30\*60\*1000/);
  assert.match(app,/key:'home-bootstrap',everyMs:60\*60\*1000/);
  assert.match(app,/const AUTO_RESUME_MIN_BACKGROUND_MS=60\*1000;/);
  assert.match(app,/const AUTO_RESUME_DEEP_REFRESH_MS=5\*60\*1000;/);
  assert.match(app,/const AUTO_RESUME_HEAVY_REFRESH_MS=15\*60\*1000;/);
  assert.match(app,/ensureHomeBootstrap\(\{force:awayMs>=AUTO_RESUME_HEAVY_REFRESH_MS\}\)/);
  assert.match(supplements,/const HOME_TOOLS_STALE_MS=10\*60\*1000;/);
  assert.match(supplements,/const READ_CACHE_TTL_MS=5\*60\*1000;/);
  assert.equal(version.current,'v4.02');
});
