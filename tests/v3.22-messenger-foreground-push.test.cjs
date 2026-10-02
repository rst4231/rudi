const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const sw=fs.readFileSync('public/sw.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const messenger=fs.readFileSync('public/messenger.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('v3.22 suppresses messenger notification when a visible messenger client exists',()=>{
  assert.match(sw,/const isMessenger=notificationTag==='rudi-messenger'\|\|notificationUrl\.includes\('tab=messenger'\)/);
  assert.match(sw,/client\.visibilityState==='visible'/);
  assert.match(sw,/url\.searchParams\.get\('tab'\)==='messenger'/);
  assert.match(sw,/if\(!messengerVisible\)\{[\s\S]*?showNotification/);
});

test('v3.22 still notifies the page about a foreground message and messenger haptics once on new partner message',()=>{
  assert.match(sw,/RUDI_PUSH_RECEIVED'[\s\S]*?foreground:messengerVisible/);
  assert.match(messenger,/function triggerForegroundMessageHaptic\(\)/);
  assert.match(messenger,/haptic\.impactOccurred\('medium'\)/);
  assert.match(messenger,/navigator\.vibrate\?\.\(35\)/);
  assert.match(messenger,/const hasNewPartnerMessage=newPartnerRows\.length>0/);
  assert.match(messenger,/if\(hasNewPartnerMessage\)\{[\s\S]*?triggerForegroundMessageHaptic\(\)/);
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
