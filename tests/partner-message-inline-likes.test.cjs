const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeStoredMessage,
  togglePartnerMessageLike,
} = require('../api/partner-message-store.cjs');

function memoryCache(){
  let value=null;
  return {
    async get(){ return value; },
    async set(_key,next){ value=JSON.parse(JSON.stringify(next)); return true; },
  };
}

test('partner message stores likes inside the message like feed items do', async()=>{
  const cache=memoryCache();
  await cache.set('partner-message',{
    id:'msg-test',
    text:'Привет',
    authorName:'Рустам',
    updatedAt:'2026-09-25T07:00:00.000Z',
    likes:[],
    likesInitialized:true,
  });
  const liked=await togglePartnerMessageLike('Рустам',{cache});
  assert.deepEqual(liked.likes,['Рустам']);
  const reloaded=normalizeStoredMessage(await cache.get('partner-message'));
  assert.deepEqual(reloaded.likes,['Рустам']);
  const unliked=await togglePartnerMessageLike('Рустам',{cache});
  assert.deepEqual(unliked.likes,[]);
});

test('partner message UI reads likes from message object, not generic reaction key',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(app,/renderReaction\(\{likedBy:Array\.isArray\(message\.likes\)\?message\.likes:\[\]\},'partnerMessageLike'/);
  assert.match(app,/rudiAction=partner-message-like/);
  assert.doesNotMatch(app,/bindReaction\('partnerMessageLike'/);
  assert.doesNotMatch(app,/currentPartnerReactionKey/);
});


test('empty initialized likes stay empty after reload and are not eligible for legacy migration', async()=>{
  const cache=memoryCache();
  await cache.set('partner-message',{
    id:'msg-unliked',
    text:'Послание',
    authorName:'Рустам',
    updatedAt:'2026-09-25T07:10:00.000Z',
    likes:[],
    likesInitialized:true,
  });
  const reloaded=normalizeStoredMessage(await cache.get('partner-message'));
  assert.deepEqual(reloaded.likes,[]);
  assert.equal(reloaded.likesInitialized,true);
});

test('legacy message without likes remains eligible for one-time migration only',()=>{
  const legacy=normalizeStoredMessage({
    id:'msg-legacy',
    text:'Старое послание',
    authorName:'Диана',
    updatedAt:'2026-09-25T06:00:00.000Z',
  });
  assert.deepEqual(legacy.likes,[]);
  assert.equal(legacy.likesInitialized,false);

  const migrated=normalizeStoredMessage({
    ...legacy,
    likes:[],
    likesInitialized:true,
  });
  assert.equal(migrated.likesInitialized,true);
});

test('partner-message read migrates only when likesInitialized is false',()=>{
  const api=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  assert.match(api,/if\(message && !message\.likesInitialized\)/);
  assert.doesNotMatch(api,/if\(message && !\(message\.likes\|\|\[\]\)\.length\)/);
  assert.match(api,/likesInitialized:true/);
});
