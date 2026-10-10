const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const smart=fs.readFileSync('public/smart-home.js','utf8');
const css=fs.readFileSync('public/smart-home.css','utf8');

test('10-minute Face ID gate targets only Rustam on iPhone',()=>{
  assert.match(app,/const IPHONE_FACEID_WINDOW_MS=10\*60\*1000/);
  assert.match(app,/return currentActor==='Рустам'&&\/iPhone\/i\.test/);
  assert.match(app,/if\(!isRustamIphone\(\)\|\|iphoneFaceIdDeadline\(\)\)return true/);
  assert.match(app,/if\(isRustamIphone\(\)\)await ensureIphoneFaceIdAccess\(\)/);
  assert.match(app,/if\(isRustamIphone\(\)&&!iphoneFaceIdDeadline\(\)\)/);
  assert.match(app,/if\(isRustamIphone\(\)\)scheduleIphoneFaceIdExpiry\(\)/);
  assert.match(app,/const IPHONE_FACEID_SESSION_KEY='rudi:iphone-rustam:faceid-until:v1'/);
});

test('Face ID lock does not allow skip, and must verify registration server-side',()=>{
  assert.match(app,/if\(!configured\)\{\s*await showFaceIdSetup\(\{mandatory:true\}\)/);
  assert.match(app,/if\(mandatory\)form\.append\(button,status\)/);
  assert.match(app,/if\(!mandatory\)skip\.addEventListener/);
  assert.match(app,/await passkeyRequest\('register-verify'/);
  assert.match(app,/await passkeyRequest\('auth-verify'/);
  assert.match(app,/if\(actor!=='Рустам'\)throw new Error\('rudi-actor-mismatch'\)/);
});

test('verified Rustam PIN works as fallback for Face ID failure and missing WebAuthn',()=>{
  assert.match(app,/browserAuthRequest\('login',\{actor:'Рустам',pin:value\}\)/);
  assert.match(app,/if\(String\(response\.actor\|\|''\)!=='Рустам'\)throw new Error/);
  assert.match(app,/backupButton\.textContent='Face ID недоступен\? Войти по PIN'/);
  assert.match(app,/if\(!passkeySupported\(\)\)\{\s*\/\/ No WebAuthn on this iPhone browser:[\s\S]*?await showIphoneFaceIdUnlock\(\)/);
  assert.match(app,/if\(!passkeySupported\(\)\)\{\s*faceButton\.textContent='Face ID недоступен в этом браузере';[\s\S]*?pinForm\.style\.display='grid'/);
});

test('expired unlock is rechecked on timer and when app comes to foreground',()=>{
  assert.match(app,/setTimeout\(\(\)=>\{\s*iphoneFaceIdTimer=null;\s*if\(!iphoneFaceIdDeadline\(\)\)void requireIphoneFaceIdLock/);
  assert.match(app,/document\.addEventListener\('visibilitychange',\(\)=>\{if\(!document\.hidden\)refreshIphoneLock\(\)\}\)/);
  assert.match(app,/window\.addEventListener\('pageshow',refreshIphoneLock\)/);
  assert.match(app,/window\.addEventListener\('focus',refreshIphoneLock\)/);
  assert.match(app,/document\.body\.classList\.remove\('auth-ok'\)/);
});

test('collapsed smart-home badge counts real low-battery devices only',()=>{
  assert.match(smart,/function lowBatteryDevices\(data\)/);
  assert.match(smart,/visibleDevices\(data\)\.filter/);
  assert.match(smart,/property\(device,'battery_level'\)/);
  assert.match(smart,/Number\.isFinite\(value\)&&value>=0&&value<10/);
  assert.match(smart,/badge\.textContent=low\.length\?String\(Math\.min\(low\.length,99\)\):''/);
  assert.match(smart,/badge\.hidden=low\.length===0/);
  assert.match(smart,/syncSmartHomeBatteryBadge\(data\)/);
  assert.match(css,/\.smart-home-tile:not\(\.is-collapsed\) \.smart-home-battery-badge\{display:none!important\}/);
});

test('low-battery cards receive red halo, normal cards are not affected',()=>{
  assert.match(smart,/card\.classList\.add\('is-battery-low'\)/);
  assert.match(css,/\.smart-home-device-card\.is-battery-low/);
  assert.match(css,/box-shadow:0 0 0 1px rgba\(239,68,76/);
  assert.doesNotMatch(css,/\.smart-home-device-card:not\(\.is-battery-low\).*box-shadow:0 0 0 1px rgba\(239,68,76/);
});
