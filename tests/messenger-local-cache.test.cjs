const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','public','messenger.js'),'utf8');

test('messenger keeps an encrypted IndexedDB conversation cache',()=>{
  assert.match(source,/const CACHE_STORE_NAME='conversation-cache';/);
  assert.match(source,/indexedDB\.open\(DB_NAME,2\)/);
  assert.match(source,/async function readConversationCache\(/);
  assert.match(source,/async function writeConversationCache\(/);
});

test('messenger hydrates local cache before network sync',()=>{
  assert.match(source,/async function hydrateConversationCache\(/);
  assert.match(source,/state\.cacheHydrated=true/);
  assert.match(source,/state\.networkLoaded=false/);
  assert.match(source,/load\(\{markRead:false\}\)\.catch/);
});

test('cached rows render without waiting for messenger-list',()=>{
  const hydrateStart=source.indexOf('async function hydrateConversationCache');
  const hydrateEnd=source.indexOf('\n  async function',hydrateStart+10);
  const hydrate=source.slice(hydrateStart,hydrateEnd>hydrateStart?hydrateEnd:source.length);
  assert.match(hydrate,/state\.rows=mergePendingRows/);
  assert.match(hydrate,/await decryptMessages\(state\.rows\)/);
  assert.match(hydrate,/renderMessages\(/);
  assert.match(hydrate,/state\.messagesLoaded=true/);
  assert.match(hydrate,/state\.renderedIds=new Set\(state\.rows\.map\(row=>row\.id\)\)/);
  assert.doesNotMatch(hydrate,/api\('messenger-list'/);
});


test('local first-paint cache is capped to the latest 30 messages',()=>{
  assert.match(source,/\.slice\(-30\);/);
});
