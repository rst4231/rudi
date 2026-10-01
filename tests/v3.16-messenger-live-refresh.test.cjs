const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('public/messenger.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const css=fs.readFileSync('public/messenger.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('messenger overlay is moved outside transformed shell',()=>{
  assert.match(client,/function mountMessengerOverlay\(\)[\s\S]*?document\.body\.appendChild\(page\)/);
  assert.match(client,/async function open\([\s\S]*?mountMessengerOverlay\(\)/);
  assert.match(client,/async function initialize\(\)[\s\S]*?mountMessengerOverlay\(\)/);
  assert.match(css,/\.messenger-page\{[\s\S]*?position:fixed;[\s\S]*?z-index:4400/);
});

test('normal messenger sync never shows the word updating',()=>{
  assert.doesNotMatch(client,/Обновляю…/);
});

test('messenger does not poll every 12 seconds',()=>{
  assert.doesNotMatch(client,/setInterval\([\s\S]*?12000/);
  assert.doesNotMatch(client,/function scheduleRefresh/);
});

test('service worker broadcasts incoming push to open app windows',()=>{
  assert.match(sw,/client\.postMessage\(\{type:'RUDI_PUSH_RECEIVED',id,tag:notificationTag,url:notificationUrl\}\)/);
});

test('messenger refreshes immediately for messenger push',()=>{
  assert.match(client,/navigator\.serviceWorker\?\.addEventListener\?\.\('message'/);
  assert.match(client,/data\.type!=='RUDI_PUSH_RECEIVED'/);
  assert.match(client,/tag!=='rudi-messenger'&&!url\.includes\('tab=messenger'\)/);
  assert.match(client,/dataset\.appTab==='messenger'[\s\S]*?load\(\{markRead:true\}\)/);
  assert.match(client,/else\{[\s\S]*?syncUnread\(\)/);
});

test('messenger v3.16 assets and PWA shell are cache-busted',()=>{
  assert.match(html,/messenger\.js\?v=3\.16/);
  assert.match(html,/messenger\.css\?v=3\.16/);
  assert.match(html,/meta name="rudi-version" content="v3\.16"/);
  assert.match(sw,/rudi-shell-v3\.16/);
});
