const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=p=>fs.readFileSync(p,'utf8');

test('v4.26 keeps removed messenger assets out of build precache',()=>{
  const build=read('build.cjs');
  assert.doesNotMatch(build,/messenger\.(?:js|css)/i);
});


test('service worker requires critical assets and tolerates an optional precache fetch failure',()=>{
  const sw=read('public/sw.js');
  assert.match(sw,/Promise\.all\(critical\.map\(url=>cache\.add\(url\)\)\)/);
  assert.match(sw,/Promise\.allSettled\(PRECACHE\.filter\(url=>!critical\.includes\(url\)\)\.map\(url=>cache\.add\(url\)\)\)/);
  assert.doesNotMatch(sw,/cache\.addAll\(PRECACHE\)/);
});

test('v4.26 removes expired runtime routes and recovery bypasses',()=>{
  const api=read('api/index.js');
  const feed=read('api/feed-notify-cron.js');
  const vercel=JSON.parse(read('vercel.json'));
  assert.doesNotMatch(api,/labor-bootstrap|init-products|isLaborBootstrapAllowed/);
  assert.doesNotMatch(feed,/isOneTimeMorningRecovery|isOneTimeForDiRecovery|2026-09-25|2026-09-26/);
  assert.ok(!vercel.rewrites.some(row=>row.source==='/api/init-products'));
});

test('v4.26 keeps confirmed legacy files removed',()=>{
  for(const file of [
    'api/admin-api.cjs',
    'api/admin-auth.cjs',
    'public/home-hero-v2103.css',
  ]) assert.equal(fs.existsSync(file),false,file+' must stay removed');
});
