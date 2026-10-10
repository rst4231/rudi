const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const smart=fs.readFileSync('public/smart-home.js','utf8');
const css=fs.readFileSync('public/smart-home.css','utf8');

test('10-minute Face ID gate targets only Rustam on iPhone',()=>{
  assert.match(app,/const IPHONE_FACEID_DEFAULT_INTERVAL='1h'/);
  assert.match(app,/\['Рустам','Диана'\]\.includes\(actor\)/);
  assert.match(app,/if\(!isProtectedIphoneAccount\(\)\|\|iphoneFaceIdDeadline\(\)\)return true/);
  assert.match(app,/if\(isProtectedIphoneAccount\(\)\)await ensureIphoneFaceIdAccess\(\)/);
  assert.match(app,/if\(isProtectedIphoneAccount\(\)&&!iphoneFaceIdDeadline\(\)\)/);
  assert.match(app,/if\(isProtectedIphoneAccount\(\)\)scheduleIphoneFaceIdExpiry\(\)/);
  assert.match(app,/const IPHONE_FACEID_GRANT_KEY_PREFIX='rudi:iphone:faceid-grant:v2:'/);
});

test('Face ID lock does not allow skip, and must verify registration server-side',()=>{
  assert.match(app,/if\(!configured\)\{\s*await showFaceIdSetup\(\{mandatory:true\}\)/);
  assert.match(app,/if\(mandatory\)form\.append\(button,status\)/);
  assert.match(app,/if\(!mandatory\)skip\.addEventListener/);
  assert.match(app,/await passkeyRequest\('register-verify'/);
  assert.match(app,/await passkeyRequest\('auth-verify'/);
  assert.match(app,/if\(actor!==lockedActor\)throw new Error\('rudi-actor-mismatch'\)/);
});

test('verified Rustam PIN works as fallback for Face ID failure and missing WebAuthn',()=>{
  assert.match(app,/browserAuthRequest\('login',\{actor:lockedActor,pin:value\}\)/);
  assert.match(app,/if\(String\(response\.actor\|\|''\)!==lockedActor\)throw new Error/);
  assert.match(app,/backupButton\.textContent='Face ID недоступен\? Войти по PIN'/);
  assert.match(app,/if\(!passkeySupported\(\)\)\{\s*\/\/ No WebAuthn on this iPhone browser:[\s\S]*?await showIphoneFaceIdUnlock\(\)/);
  assert.match(app,/if\(!passkeySupported\(\)\)\{\s*faceButton\.textContent='Face ID недоступен в этом браузере';[\s\S]*?pinForm\.style\.display='grid'/);
});

test('expired unlock is rechecked on timer and when app comes to foreground',()=>{
  assert.match(app,/setTimeout\(\(\)=>\{\s*iphoneFaceIdTimer=null;\s*if\(!iphoneFaceIdDeadline\(\)\)void requireIphoneFaceIdLock/);
  assert.match(app,/document\.addEventListener\('visibilitychange',\(\)=>\{/);
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
