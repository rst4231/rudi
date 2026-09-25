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
