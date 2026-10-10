const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const smart=fs.readFileSync('public/smart-home.js','utf8');
const css=fs.readFileSync('public/smart-home.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('CloudCam appears inside Hallway before Yandex Камера, not in a separate Cameras room',()=>{
  assert.match(smart,/function cloudCamCard\(\)/);
  assert.match(smart,/const groups=roomGroups\(data\)/);
  assert.match(smart,/==='прихожая'/);
  assert.match(smart,/const cameraIndex=sorted\.findIndex\(device=>/);
  assert.match(smart,/list\.insertBefore\(cloudCamCard\(\),cameraIndex>=0\?list\.children\[cameraIndex\]:null\)/);
  assert.match(smart,/count\.textContent='\('\+\(devices\.length\+\(canShowCloudCam\?1:0\)\)\+'\)'/);
  assert.doesNotMatch(smart,/headingText\.textContent='Камеры'/);
  assert.doesNotMatch(smart,/className='smart-home-room smart-home-cloudcam-section'/);
  assert.match(html,/id="smartHomeRooms"/);
});

test('CloudCam UI is restricted to Rustam and cannot expose local camera credentials',()=>{
  assert.match(smart,/if\(String\(data\?\.actor\|\|''\)==='Рустам'\)/);
  assert.match(smart,/const canShowCloudCam=hallway&&String\(data\?\.actor\|\|''\)==='Рустам'/);
  assert.match(smart,/if\(!document\.body\.classList\.contains\('auth-ok'\)\|\|String\(state\.data\?\.actor\|\|''\)!=='Рустам'\)return/);
  assert.doesNotMatch(smart,/rtsp:\/\//i);
  assert.doesNotMatch(smart,/192\.168\.31\.69|xxxxS_54aebc60a6c4/i);
});

test('CloudCam viewport is full-screen and iframe can fit desktop content on iPhone',()=>{
  assert.match(css,/\.smart-home-camera-dialog\{[^}]*height:100dvh;max-height:100dvh/s);
  assert.match(css,/\.smart-home-camera-frame\{[^}]*flex:1 1 auto/s);
  assert.match(css,/\.smart-home-camera-frame iframe\{/);
  assert.match(smart,/const referenceWidth=980/);
  assert.match(smart,/Math\.min\(1,hostWidth\/referenceWidth\)/);
  assert.match(smart,/frame\.src=CLOUDCAM_URL/);
  assert.match(smart,/fitMode=!fitMode/);
  assert.match(smart,/window\.removeEventListener\('resize',adjustFrame\)/);
});

test('Captcha problem is acknowledged and external EyePlus is primary fallback',()=>{
  assert.match(smart,/EyePlus может не пропускать капчу внутри iframe/);
  assert.match(smart,/https:\/\/eyeplus\.closeli\.com\/login/);
  assert.match(smart,/target="_blank" rel="noopener noreferrer"/);
  assert.match(smart,/referrerPolicy='no-referrer'/);
  assert.match(smart,/overlay\.querySelector\('iframe'\)\?\.remove\(\)/);
});
