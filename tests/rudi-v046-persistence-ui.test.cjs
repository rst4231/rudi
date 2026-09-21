const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createStrictRuntimeCache}=require('../api/strict-runtime-cache.cjs');
const app=fs.readFileSync('public/app.js','utf8');

test('CloudStorage backup uses verified double-buffered slots',()=>{
  assert.match(app,/STATE_BACKUP_CLOUD_SLOT_PREFIX/);
  assert.match(app,/function backupTokenChecksum/);
  assert.match(app,/version:3/);
});

test('v1 dashboard reuses identities without redundant role kickers',()=>{
  assert.doesNotMatch(app,/selfLabel\.textContent='Моё'/);
  assert.doesNotMatch(app,/partnerLabel\.textContent='Партнёр'/);
  assert.match(app,/selfIdentity\.appendChild\(selfMood\)/);
  assert.match(app,/togetherGrid\.append\(selfIdentity,partnerIdentity\)/);
});

test('official Runtime Cache waits for eventual write visibility before retrying the write',async()=>{
  let setCalls=0,getCalls=0;
  const cache=createStrictRuntimeCache({env:{},attempts:2,confirmAttempts:6,retryDelayMs:0,getCacheImpl(){return {
    async set(){setCalls+=1},
    async get(){getCalls+=1;return getCalls<5?null:{ok:true}},
    async delete(){}
  }}});
  await cache.set('eventual',{ok:true});
  assert.equal(setCalls,1);
  assert.equal(getCalls,5);
});
