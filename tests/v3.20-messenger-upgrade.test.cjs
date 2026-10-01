const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('public/messenger.js','utf8');
const css=fs.readFileSync('public/messenger.css','utf8');
const server=fs.readFileSync('api/partner-message.js','utf8');
const store=fs.readFileSync('api/messenger-store.cjs','utf8');
const build=fs.readFileSync('build.cjs','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('v3.20 messenger live refresh, typing and message animations are wired',()=>{
  assert.match(client,/setInterval\(syncLiveMessages,2200\)/);
  assert.match(client,/api\('messenger-typing',\{active:Boolean\(active\)\}\)/);
  assert.match(server,/action === 'messenger-typing'/);
  assert.match(store,/async function readMessengerTyping/);
  assert.match(css,/@keyframes messengerTyping/);
  assert.match(css,/@keyframes messengerMessageIn/);
  assert.match(css,/@keyframes messengerMessageSent/);
});

test('v3.20 own-message delete and swipe-to-reply are wired end to end',()=>{
  assert.match(client,/api\('messenger-delete',\{id:row\.id\}\)/);
  assert.match(server,/action === 'messenger-delete'/);
  assert.match(store,/async function deleteMessengerMessage/);
  assert.match(client,/function bindSwipeReply\(article,row,payload\)/);
  assert.match(css,/\.messenger-delete-action\.is-visible/);
});

test('v3.20 messenger uses iMessage-like bubbles and subtle heart background',()=>{
  assert.match(css,/background:#e9e9eb/);
  assert.match(css,/background:linear-gradient\(180deg,#149bff 0%,#0a84ff 100%\)/);
  assert.match(css,/font-family:-apple-system/);
  assert.match(css,/background-image:url\("data:image\/svg\+xml/);
});

test('v3.20 displays URLs as the clickable word ссылка',()=>{
  assert.match(client,/link\.textContent='ссылка'/);
  assert.match(client,/link\.href=url/);
});

test('v3.20 cache-busts messenger assets through the central version source',()=>{
  assert.match(build,/messenger\.css/);
  assert.match(build,/messenger\.js/);
  assert.match(build,/\/messenger\\\.css\\\?v=/);
  assert.match(build,/\/messenger\\\.js\\\?v=/);
  assert.match(html,/messenger\.css\?v=3\.20/);
  assert.match(html,/messenger\.js\?v=3\.20/);
});
