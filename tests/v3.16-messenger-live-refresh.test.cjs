const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const client=fs.readFileSync('public/messenger.js','utf8');
const server=fs.readFileSync('api/partner-message.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const css=fs.readFileSync('public/messenger.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('messenger overlay stays outside transformed app shell',()=>{
  assert.match(client,/function mountMessengerOverlay\(\)[\s\S]*?document\.body\.appendChild\(page\)/);
  assert.match(css,/\.messenger-page\{[\s\S]*?position:fixed;[\s\S]*?z-index:4400/);
});

test('messenger refreshes open chat automatically without status noise',()=>{
  assert.doesNotMatch(client,/Обновляю…/);
  assert.match(client,/function syncLiveMessages\(\)/);
  assert.match(client,/setInterval\(syncLiveMessages,2200\)/);
  assert.match(client,/rowsSignature\(nextRows\)!==rowsSignature\(state\.rows\)/);
  assert.match(client,/await decryptMessages\(state\.rows\)/);
  assert.match(client,/renderMessages\(\{preserveScrollTop:/);
});

test('messenger push is an additional immediate live-refresh trigger',()=>{
  assert.match(sw,/client\.postMessage\(\{type:'RUDI_PUSH_RECEIVED',id,tag:notificationTag,url:notificationUrl,foreground:messengerVisible\}\)/);
  assert.match(client,/navigator\.serviceWorker\?\.addEventListener\?\.\('message'/);
  assert.match(client,/dataset\.appTab==='messenger'[\s\S]*?syncLiveMessages\(\)/);
  assert.match(client,/else\{[\s\S]*?syncUnread\(\)/);
});

test('messenger assets and PWA shell are cache-busted to current version',()=>{
  const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.replace(/^v/,'');
  const escaped=version.replace(/\./g,'\\.');
  assert.match(html,new RegExp('messenger\\.js\\?v='+escaped));
  assert.match(html,new RegExp('messenger\\.css\\?v='+escaped));
  assert.match(html,new RegExp('meta name="rudi-version" content="v'+escaped+'"'));
  assert.match(sw,new RegExp('rudi-shell-v'+escaped));
});

test('messenger header uses compact partner status instead of 24-hour security copy',()=>{
  assert.match(client,/function compactPartnerStatus\(\)/);
  assert.match(client,/dianaRhythmStatus/);
  assert.match(client,/rustamRhythmStatus/);
  assert.match(client,/dianaCycleMood/);
  assert.match(client,/partnerWorkStatus/);
  assert.doesNotMatch(html,/Защищённый чат · сообщения живут 24 часа/);
});

test('long press opens unified context actions and server enforces delete ownership',()=>{
  assert.match(client,/function bindLongPressContext\(article,row,payload\)/);
  assert.match(client,/\['Ответить',\(\)=>setReply\(row,payload\)\]/);
  assert.match(client,/\['Редактировать',\(\)=>startMessageEdit\(row,payload\)\]/);
  assert.match(client,/\['Удалить',\(\)=>deleteOwnMessage\(row\),'is-danger'\]/);
  assert.match(client,/api\('messenger-delete',\{id:row\.id\}\)/);
  assert.match(server,/action === 'messenger-delete'/);
  assert.match(server,/deleteMessengerMessage\(actor,body\.id,options\)/);
});

test('right-to-left swipe replies to a message',()=>{
  assert.match(client,/function bindSwipeReply\(article,row,payload\)/);
  assert.match(client,/if\(dx>55&&Math\.abs\(dy\)<38\)/);
  assert.match(client,/setReply\(row,payload\)/);
});

test('double tap is reserved exclusively for heart reactions and uses pointerdown',()=>{
  assert.doesNotMatch(client,/function bindMessageTapGestures\(/);
  assert.match(client,/messages\.addEventListener\('pointerdown'/);
  assert.match(client,/state\.tapMessageId===id&&now-state\.tapAt<=460/);
  assert.match(client,/setMessageReaction\(row,'❤️'\)/);
  assert.match(client,/event\.stopPropagation\(\)/);
  assert.doesNotMatch(client,/count>=3/);
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
  assert.match(server,/url:'\/\?tab=messenger&message='/);
});
