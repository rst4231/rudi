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

test('messenger v3.17 assets and PWA shell are cache-busted',()=>{
  assert.match(html,/messenger\.js\?v=3\.17/);
  assert.match(html,/messenger\.css\?v=3\.17/);
  assert.match(html,/meta name="rudi-version" content="v3\.17"/);
  assert.match(sw,/rudi-shell-v3\.17/);
});

test('messenger v3.17 uses compact separated header and partner avatar',()=>{
  assert.match(html,/id="messengerBack"[\s\S]*?id="messengerPartnerName"[\s\S]*?id="messengerPartnerAvatar"/);
  assert.match(css,/\.messenger-head\{[\s\S]*?grid-template-columns:40px minmax\(0,1fr\) 40px/);
  assert.doesNotMatch(css,/\.messenger-head\{[^}]*border:/);
  assert.match(client,/function syncHeaderAvatar\(\)/);
  assert.match(client,/partnerProfileImage/);
});

test('messenger v3.17 replies by long press without permanent reply button',()=>{
  assert.match(client,/function bindLongPressReply\(article,row,payload\)/);
  assert.match(client,/setTimeout\(\(\)=>\{[\s\S]*?setReply\(row,payload\)[\s\S]*?\},520\);/);
  assert.doesNotMatch(client,/messenger-reply-button/);
  assert.doesNotMatch(html,/messenger-reply-button/);
});

test('messenger v3.17 reduces iPhone safe-area spacing',()=>{
  assert.match(css,/safe-area-inset-top\) - 12px/);
  assert.match(css,/safe-area-inset-bottom\) - 16px/);
});
