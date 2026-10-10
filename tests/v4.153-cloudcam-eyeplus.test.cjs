const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const smart=fs.readFileSync('public/smart-home.js','utf8');
const css=fs.readFileSync('public/smart-home.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('CloudCam is rendered only for the authenticated Rustam actor',()=>{
  assert.match(smart,/if\(String\(data\?\.actor\|\|''\)==='Рустам'\)\{/);
  assert.match(smart,/if\(!document\.body\.classList\.contains\('auth-ok'\)\|\|String\(state\.data\?\.actor\|\|''\)!=='Рустам'\)return/);
  assert.match(smart,/function openCloudCamViewer\(\)/);
  assert.match(smart,/card\.querySelector\('\.smart-home-camera-open'\)\.addEventListener\('click',openCloudCamViewer\)/);
  assert.match(smart,/name==='камера' \|\| name==='переключатель'/);
});

test('CloudCam does not expose local streams, credentials or device identifiers',()=>{
  assert.match(smart,/const CLOUDCAM_URL='https:\/\/eyeplus\.closeli\.com\/login'/);
  assert.doesNotMatch(smart,/rtsp:\/\//i);
  assert.doesNotMatch(smart,/192\.168\.31\.69/);
  assert.doesNotMatch(smart,/54:AE:BC:60:A6:C4/i);
  assert.doesNotMatch(smart,/xxxxS_54aebc60a6c4/i);
  assert.doesNotMatch(smart,/deviceId=.*cloudcam/i);
});

test('EyePlus embed is optional, external Safari link remains available',()=>{
  assert.match(smart,/iframe/);
  assert.match(smart,/querySelector\('\.smart-home-camera-embed'\)\.addEventListener\('click'/);
  assert.match(smart,/frame\.src=CLOUDCAM_URL/);
  assert.match(smart,/rel="noopener noreferrer"/);
  assert.match(smart,/target="_blank"/);
  assert.match(smart,/referrerPolicy='no-referrer'/);
  assert.match(smart,/overlay\.querySelector\('iframe'\)\?\.remove\(\)/);
  assert.match(css,/\.smart-home-camera-overlay/);
  assert.match(css,/\.smart-home-camera-frame iframe/);
  assert.match(html,/id="smartHomeRooms"/);
});
