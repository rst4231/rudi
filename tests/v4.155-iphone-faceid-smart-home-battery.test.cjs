const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const smart=fs.readFileSync('public/smart-home.js','utf8');
const smartCss=fs.readFileSync('public/smart-home.css','utf8');

test('Face ID lock only applies to Rustam on iPhone',()=>{
  assert.match(app,/function iphoneFaceIdActor\(\)\{[\s\S]*?\['Рустам','Диана'\]\.includes\(actor\)/);
  assert.match(app,/if\(isProtectedIphoneAccount\(\)\&\&!iphoneFaceIdDeadline\(\)\)\{[\s\S]*?requireIphoneFaceIdLock\(\)/);
  assert.match(app,/if\(isProtectedIphoneAccount\(\)\)await ensureIphoneFaceIdAccess\(\)/);
  assert.match(app,/if\(!\['Рустам','Диана'\]\.includes\(actor\)\|\|!\/iPhone\/i\.test/);
});

test('iPhone biometric verification expires in ten minutes and locks on foreground',()=>{
  assert.match(app,/const IPHONE_FACEID_DEFAULT_INTERVAL='1h'/);
  assert.match(app,/localStorage\.setItem\(IPHONE_FACEID_GRANT_KEY_PREFIX\+actor,JSON\.stringify\(iphoneFaceIdGrant\)\)/);
  assert.match(app,/function scheduleIphoneFaceIdExpiry\(\)/);
  assert.match(app,/if\(!iphoneFaceIdDeadline\(\)\)void requireIphoneFaceIdLock\(\)/);
  assert.match(app,/document\.addEventListener\('visibilitychange'/);
  assert.match(app,/window\.addEventListener\('pageshow',refreshIphoneLock\)/);
  assert.match(app,/window\.addEventListener\('focus',refreshIphoneLock\)/);
  assert.match(app,/document\.body\.classList\.remove\('auth-ok'\)/);
});

test('Face ID onboarding cannot be skipped for Rustam iPhone and allows retry on error',()=>{
  assert.match(app,/await showFaceIdSetup\(\{mandatory:true\}\)/);
  assert.match(app,/if\(mandatory\)form\.append\(button,status\)/);
  assert.match(app,/if\(!mandatory\)skip\.addEventListener\('click'/);
  assert.match(app,/const prepare=\(\)=>\{[\s\S]*?button\.textContent='Повторить'/);
  assert.match(app,/if\(!prepared\)\{prepare\(\);return;\}/);
  assert.match(app,/if\(isProtectedIphoneAccount\(\)\)clearIphoneFaceIdWindow\(\)/);
});

test('backup PIN is verified on RUDI backend before unlocking',()=>{
  assert.match(app,/Face ID недоступен\? Войти по PIN/);
  assert.match(app,/browserAuthRequest\('login',\{actor:lockedActor,pin:value\}\)/);
  assert.match(app,/if\(String\(response\.actor\|\|''\)!==lockedActor\)throw/);
  assert.match(app,/if\(actor!==lockedActor\)throw new Error\('rudi-actor-mismatch'\)/);
  assert.match(app,/function grantIphoneFaceIdWindow\(actor\)/);
});

function batteryLevel(device){
  const item=(device.properties||[]).find(p=>p?.parameters?.instance==='battery_level');
  return item?.state?.value;
}
const lowBatterySource=smart.slice(smart.indexOf('  function lowBatteryDevices(data){'),smart.indexOf('  function syncSmartHomeBatteryBadge(data){'));
if(!lowBatterySource.includes('function lowBatteryDevices'))throw new Error('lowBatteryDevices not found');
const lowBatteryDevices=new Function('visibleDevices','property',lowBatterySource+';return lowBatteryDevices;')(
  data=>data.devices||[],batteryLevel
);
function dev(name,value){
  return {name,properties:value===undefined?[]:[{parameters:{instance:'battery_level'},state:{value}}]};
}

test('battery warnings count 0% and 9%, exclude 10%, unknown and invalid levels',()=>{
  const rows=[dev('Empty',0),dev('Low',9),dev('Threshold',10),dev('Healthy',86),dev('Unknown'),dev('Invalid','NaN'),dev('Negative',-1)];
  assert.deepEqual(lowBatteryDevices({devices:rows}).map(x=>x.name),['Empty','Low']);
  assert.equal(lowBatteryDevices({devices:[dev('At threshold',10)]}).length,0);
});

test('collapsed smart home badge has red car-style appearance and counts devices',()=>{
  assert.match(smart,/syncSmartHomeBatteryBadge\(data\)/);
  assert.match(smart,/badge\.textContent=low\.length\?String\(Math\.min\(low\.length,99\)\):''/);
  assert.match(smart,/badge\.hidden=low\.length===0/);
  assert.match(smartCss,/\.smart-home-battery-badge\{[\s\S]*?background:#ff3b30/);
  assert.match(smartCss,/\.smart-home-tile:not\(\.is-collapsed\) \.smart-home-battery-badge\{display:none!important\}/);
});

test('low battery cards glow red and normal cards do not',()=>{
  assert.match(smart,/function deviceCard\(device\)\{[\s\S]*?if\(lowBatteryDevices\(\{devices:\[device\]\}\)\.length\)/);
  assert.match(smart,/card\.classList\.add\('is-battery-low'\)/);
  assert.match(smartCss,/\.smart-home-device-card\.is-battery-low/);
  assert.match(smartCss,/0 0 18px rgba\(239,68,76,\.27\)/);
  assert.equal(lowBatteryDevices({devices:[dev('OK',10)]}).length,0);
});

test('delayed iPhone Face ID enrollment wakes Smart Home and Car without polling',()=>{
  const car=fs.readFileSync('public/car.js','utf8');
  assert.match(app,/if\(!wasAuthenticated\)try\{window\.dispatchEvent\(new Event\('rudi:auth-ready'\)\)/);
  assert.match(smart,/window\.addEventListener\('rudi:auth-ready',\(\)=>loadHome\(\{silent:true\}\)\)/);
  assert.match(car,/window\.addEventListener\('rudi:auth-ready',wait\)/);
  assert.doesNotMatch(smart,/setInterval\(/);
});
