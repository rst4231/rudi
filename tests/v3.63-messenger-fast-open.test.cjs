const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('public/messenger.js','utf8');
const server=fs.readFileSync('api/partner-message.js','utf8');

test('messenger-list bootstraps encryption key and messages in one request',()=>{
  const start=server.indexOf("if (action === 'messenger-list')");
  const end=server.indexOf("if (action === 'messenger-presence')",start);
  const block=server.slice(start,end);
  assert.match(block,/conversationKey:messengerConversationKey\(options\)/);
  assert.match(block,/scheme:'shared-v2'/);
  assert.match(block,/keys,/);
  assert.match(block,/messages,/);
});

test('first messenger load fetches list before hydrating keys',()=>{
  const start=client.indexOf('async function load({markRead=true}={})');
  const end=client.indexOf('function syncHeaderAvatar',start);
  const block=client.slice(start,end);
  const listIndex=block.indexOf("await api('messenger-list')");
  const keysIndex=block.indexOf('await ensureKeys(data)');
  assert.ok(listIndex>=0&&keysIndex>listIndex);
  assert.doesNotMatch(block,/await ensureKeys\(\);[\s\S]*?messenger-list/);
});

test('message decryption runs in parallel',()=>{
  const start=client.indexOf('async function decryptMessages');
  const end=client.indexOf('async function repairLegacyMessages',start);
  const block=client.slice(start,end);
  assert.match(block,/Promise\.all/);
  assert.match(block,/await decryptRow\(row\)/);
});

test('read and legacy repair do not block first render',()=>{
  const start=client.indexOf('async function load({markRead=true}={})');
  const end=client.indexOf('function syncHeaderAvatar',start);
  const block=client.slice(start,end);
  const renderIndex=block.indexOf('renderMessages({forceBottom:!state.messagesLoaded})');
  const readIndex=block.indexOf('scheduleVisibleRead()');
  const repairIndex=block.indexOf('setTimeout(async()=>');
  assert.ok(renderIndex>=0&&readIndex>renderIndex&&repairIndex>renderIndex);
});

test('reopening messenger reuses rendered state and keeps 12 second live polling',()=>{
  assert.match(client,/if\(state\.messagesLoaded\)[\s\S]*?syncLiveMessages\(\)/);
  assert.match(client,/state\.messagesLoaded=true/);
  assert.match(client,/setInterval\([\s\S]*?syncLiveMessages\(\)[\s\S]*?,12000\)/);
});
