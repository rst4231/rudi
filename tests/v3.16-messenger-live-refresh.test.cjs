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

test('messenger v3.18 assets and PWA shell are cache-busted',()=>{
  assert.match(html,/messenger\.js\?v=3\.17/);
  assert.match(html,/messenger\.css\?v=3\.17/);
  assert.match(html,/meta name="rudi-version" content="v3\.17"/);
  assert.match(sw,/rudi-shell-v3\.17/);
});

test('messenger v3.18 uses compact separated header and partner avatar',()=>{
  assert.match(html,/id="messengerBack"[\s\S]*?id="messengerPartnerName"[\s\S]*?id="messengerPartnerAvatar"/);
  assert.match(css,/\.messenger-head\{[\s\S]*?grid-template-columns:40px minmax\(0,1fr\) 40px/);
  assert.doesNotMatch(css,/\.messenger-head\{[^}]*border:/);
  assert.match(client,/function syncHeaderAvatar\(\)/);
  assert.match(client,/partnerProfileImage/);
});

test('messenger v3.18 replies by long press without permanent reply button',()=>{
  assert.match(client,/function bindLongPressReply\(article,row,payload\)/);
  assert.match(client,/setTimeout\(\(\)=>\{[\s\S]*?setReply\(row,payload\)[\s\S]*?\},520\);/);
  assert.doesNotMatch(client,/messenger-reply-button/);
  assert.doesNotMatch(html,/messenger-reply-button/);
});

test('messenger v3.18 reduces iPhone safe-area spacing',()=>{
  assert.match(css,/safe-area-inset-top\) - 12px/);
  assert.match(css,/safe-area-inset-bottom\) - 16px/);
});

test('messenger v3.18 keeps latest message visible while iPhone keyboard resizes viewport',()=>{
  assert.match(client,/function keepKeyboardAtLatest\(\)/);
  assert.match(client,/input\.addEventListener\('focus',keepKeyboardAtLatest\)/);
  assert.match(client,/input\.addEventListener\('input',[\s\S]*?keepKeyboardAtLatest\(\)/);
  assert.match(client,/function syncMessengerViewport\(\)[\s\S]*?keepKeyboardAtLatest\(\)/);
  assert.match(client,/function scrollMessagesToBottom\(\)/);
});

test('messenger v3.18 shares encrypted chat across web PWA and Telegram clients',()=>{
  assert.match(client,/AAD_V2=encoder\.encode\('rudi-messenger-shared-v2'\)/);
  assert.match(client,/conversationKey/);
  assert.match(client,/scheme:'shared-v2'/);
  assert.match(client,/repairLegacyMessages/);
  assert.match(html,/🔒 Защищённый чат · сообщения живут 24 часа/);
});

test('messenger v3.18 restores full layout after iPhone keyboard closes',()=>{
  assert.match(client,/function restoreMessengerAfterKeyboard\(\)/);
  assert.match(client,/input\.addEventListener\('blur',restoreMessengerAfterKeyboard\)/);
  assert.match(client,/setTimeout\(settle,520\)/);
  assert.match(client,/const keyboardLikelyOpen=typing&&viewportHeight>0&&windowHeight>0&&\(windowHeight-viewportHeight\)>80/);
  assert.match(client,/keyboardLikelyOpen[\s\S]*?Math\.max\(viewportHeight,windowHeight\)/);
});

test('messenger v3.18 supports like on double tap and edit on triple tap',()=>{
  assert.match(client,/function bindMessageTapGestures\(article,row,payload\)/);
  assert.match(client,/if\(taps===2\)[\s\S]*?toggleMessageLike\(row\)/);
  assert.match(client,/if\(taps>=3\)[\s\S]*?startMessageEdit\(row,payload\)/);
  assert.match(client,/messenger-edit/);
  assert.match(client,/messenger-like/);
  assert.match(client,/row\.editedAt\?'Изменено'/);
  assert.match(css,/\.messenger-reaction\{/);
});

test('messenger v3.18 keeps header below iPhone safe area',()=>{
  assert.match(css,/padding:max\(10px,env\(safe-area-inset-top\)\)/);
  assert.match(css,/padding:max\(8px,env\(safe-area-inset-top\)\)/);
});

test('messenger v3.18 assets and shell are cache-busted',()=>{
  assert.match(html,/messenger\.js\?v=3\.18/);
  assert.match(html,/messenger\.css\?v=3\.18/);
  assert.match(html,/meta name="rudi-version" content="v3\.18"/);
  assert.match(sw,/rudi-shell-v3\.18/);
});
