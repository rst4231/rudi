const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('public/messenger.js','utf8');
const server=fs.readFileSync('api/partner-message.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const css=fs.readFileSync('public/messenger.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('messenger v3.22 overlay stays outside transformed app shell',()=>{
  assert.match(client,/function mountMessengerOverlay\(\)[\s\S]*?document\.body\.appendChild\(page\)/);
  assert.match(css,/\.messenger-page\{[\s\S]*?position:fixed;[\s\S]*?z-index:4400/);
});

test('messenger v3.22 refreshes open chat automatically without status noise',()=>{
  assert.doesNotMatch(client,/Обновляю…/);
  assert.match(client,/function syncLiveMessages\(\)/);
  assert.match(client,/setInterval\(syncLiveMessages,2200\)/);
  assert.match(client,/rowsSignature\(nextRows\)!==rowsSignature\(state\.rows\)/);
  assert.match(client,/await decryptMessages\(state\.rows\)/);
  assert.match(client,/renderMessages\(\)/);
});

test('messenger push is an additional immediate live-refresh trigger',()=>{
  assert.match(sw,/client\.postMessage\(\{type:'RUDI_PUSH_RECEIVED',id,tag:notificationTag,url:notificationUrl,foreground:messengerVisible\}\)/);
  assert.match(client,/navigator\.serviceWorker\?\.addEventListener\?\.\('message'/);
  assert.match(client,/dataset\.appTab==='messenger'[\s\S]*?syncLiveMessages\(\)/);
  assert.match(client,/else\{[\s\S]*?syncUnread\(\)/);
});

test('messenger v3.22 assets and PWA shell are cache-busted',()=>{
  assert.match(html,/messenger\.js\?v=3\.22/);
  assert.match(html,/messenger\.css\?v=3\.22/);
  assert.match(html,/meta name="rudi-version" content="v3\.20"/);
  assert.match(sw,/rudi-shell-v3\.22/);
});

test('messenger header uses compact partner status instead of 24-hour security copy',()=>{
  assert.match(client,/function compactPartnerStatus\(\)/);
  assert.match(client,/dianaRhythmStatus/);
  assert.match(client,/rustamRhythmStatus/);
  assert.match(client,/dianaCycleMood/);
  assert.match(client,/partnerWorkStatus/);
  assert.doesNotMatch(html,/Защищённый чат · сообщения живут 24 часа/);
});

test('long press on own message reveals delete and server enforces sender ownership',()=>{
  assert.match(client,/function bindLongPressDelete\(article,row,button\)/);
  assert.match(client,/row\.sender!==state\.actor/);
  assert.match(client,/remove\.textContent='Удалить'/);
  assert.match(client,/api\('messenger-delete',\{id:row\.id\}\)/);
  assert.match(server,/action === 'messenger-delete'/);
  assert.match(server,/deleteMessengerMessage\(actor,body\.id,options\)/);
});

test('right-to-left swipe replies to a message',()=>{
  assert.match(client,/function bindSwipeReply\(article,row,payload\)/);
  assert.match(client,/if\(dx<-55&&Math\.abs\(dy\)<38\)/);
  assert.match(client,/setReply\(row,payload\)/);
});

test('double tap likes and triple tap edits own message after gesture delay',()=>{
  assert.match(client,/function bindMessageTapGestures\(article,row,payload\)/);
  assert.match(client,/if\(count>=3\)/);
  assert.match(client,/row\.sender===state\.actor\) startMessageEdit\(row,payload\)/);
  assert.match(client,/if\(count===2\) toggleMessageLike\(row\)/);
  assert.match(client,/\},340\)/);
});

test('typing indicator is shared through short-lived server presence',()=>{
  assert.match(client,/function notifyTyping\(active\)/);
  assert.match(client,/api\('messenger-typing',\{active:Boolean\(active\)\}\)/);
  assert.match(client,/function renderTypingIndicator\(\)/);
  assert.match(server,/action === 'messenger-typing'/);
  assert.match(server,/partnerTyping/);
  assert.match(css,/@keyframes messengerTyping/);
});

test('links are displayed as a compact clickable word',()=>{
  assert.match(client,/link\.textContent='ссылка'/);
  assert.match(client,/link\.href=url/);
  assert.match(client,/openSafeLink\(link\.href\)/);
});

test('message bubbles match iMessage-style gray and blue shapes with subtle heart background',()=>{
  assert.match(css,/background:#e9e9eb/);
  assert.match(css,/background:linear-gradient\(180deg,#149bff 0%,#0a84ff 100%\)/);
  assert.match(css,/border-bottom-left-radius:5px/);
  assert.match(css,/border-bottom-right-radius:5px/);
  assert.match(css,/font-size:17px/);
  assert.match(css,/background-image:url\("data:image\/svg\+xml/);
});

test('new and sent messages animate smoothly with reduced-motion fallback',()=>{
  assert.match(css,/\.messenger-message\.is-new\{animation:messengerMessageIn/);
  assert.match(css,/\.messenger-message\.is-sent\{animation:messengerMessageSent/);
  assert.match(css,/@keyframes messengerMessageIn/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('iPhone keyboard uses VisualViewport height and 16px composer text',()=>{
  assert.match(css,/height:var\(--messenger-visual-height,100dvh\)/);
  assert.match(css,/#messengerInput\{[\s\S]*?font-size:16px/);
  assert.match(client,/window\.visualViewport/);
  assert.match(client,/--messenger-visual-height/);
  assert.match(client,/page\?\.classList\.add\('is-keyboard-open'\)/);
  assert.match(client,/input\.addEventListener\('blur',[\s\S]*?restoreMessengerAfterKeyboard\(\)/);
});

test('messenger keeps shared-v2 encryption and natural push sender wording',()=>{
  assert.match(client,/AAD_V2=encoder\.encode\('rudi-messenger-shared-v2'\)/);
  assert.match(client,/scheme:'shared-v2'/);
  assert.match(server,/Диана прислала сообщение/);
  assert.match(server,/Рустам прислал сообщение/);
  assert.match(server,/url:'\/\?tab=messenger&fresh=1'/);
});
