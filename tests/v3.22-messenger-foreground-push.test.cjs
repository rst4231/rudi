const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const sw=fs.readFileSync('public/sw.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const messenger=fs.readFileSync('public/messenger.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('messenger push is suppressed when the visible client reports the messenger is open',()=>{
  assert.match(sw,/function clientHasVisibleMessenger/);
  assert.match(sw,/RUDI_QUERY_MESSENGER_VISIBLE/);
  assert.match(sw,/MessageChannel/);
  assert.match(sw,/const messengerVisible=isMessenger\?await hasVisibleMessenger\(windows\):false/);
  assert.match(sw,/if\(!messengerVisible\)\{[\s\S]*?showNotification/);
  assert.match(messenger,/data\.type==='RUDI_QUERY_MESSENGER_VISIBLE'/);
  assert.match(messenger,/document\.visibilityState==='visible'&&document\.body\.dataset\.appTab==='messenger'/);
  assert.match(messenger,/postMessage\(\{messengerVisible\}\)/);
});

test('v3.22 still notifies the page about a foreground message and messenger haptics once on new partner message',()=>{
  assert.match(sw,/RUDI_PUSH_RECEIVED'[\s\S]*?foreground:messengerVisible/);
  assert.match(messenger,/function triggerForegroundMessageHaptic\(\)/);
  assert.match(messenger,/haptic\.impactOccurred\('medium'\)/);
  assert.match(messenger,/navigator\.vibrate\?\.\(35\)/);
  assert.match(messenger,/const hasNewPartnerMessage=newPartnerRows\.length>0/);
  assert.match(messenger,/if\(hasNewPartnerMessage\) triggerForegroundMessageHaptic\(\)/);
});

test('v3.22 notification click always sends explicit SPA navigation command to an open RUDI window',()=>{
  assert.doesNotMatch(sw,/await client\.navigate\(target\)/);
  assert.match(sw,/await client\.focus\(\)/);
  assert.match(sw,/client\.postMessage\(\{type:'RUDI_PUSH_NAVIGATE',url:rawUrl\}\)/);
  assert.match(app,/const tab=String\(target\.searchParams\.get\('tab'\)\|\|''\)\.trim\(\)/);
  assert.match(app,/window\.RUDI_NAVIGATE_TO_TAB\(tab,\{scroll:true,item,replace:true\}\)/);
});

test('cache busts the app and messenger shell to current RUDI version',()=>{
  const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.replace(/^v/,'');
  const escaped=version.replace(/\./g,'\\.');
  assert.match(html,new RegExp('meta name="rudi-version" content="v'+escaped+'"'));
  assert.match(html,new RegExp('app\\.js\\?v='+escaped));
  assert.match(html,new RegExp('messenger\\.js\\?v='+escaped));
  assert.match(sw,new RegExp('rudi-shell-v'+escaped));
});
