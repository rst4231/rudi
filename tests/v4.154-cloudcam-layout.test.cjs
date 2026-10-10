const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const smart=fs.readFileSync('public/smart-home.js','utf8');
const css=fs.readFileSync('public/smart-home.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('CloudCam appears in Hallway before Yandex Камера, not in a separate room',()=>{
  assert.match(smart,/function cloudCamCard\(\)/);
  assert.match(smart,/const groups=roomGroups\(data\)/);
  assert.match(smart,/==='прихожая'/);
  assert.match(smart,/const cameraIndex=sorted\.findIndex\(device=>/);
  assert.match(smart,/list\.insertBefore\(cloudCamCard\(\),cameraIndex>=0\?list\.children\[cameraIndex\]:null\)/);
  assert.match(smart,/count\.textContent='\('\+\(devices\.length\+\(canShowCloudCam\?1:0\)\)\+'\)'/);
  assert.doesNotMatch(smart,/headingText\.textContent='Камеры'/);
  assert.match(html,/id="smartHomeRooms"/);
});

test('CloudCam remains private to Rustam',()=>{
  assert.match(smart,/if\(String\(data\?\.actor\|\|''\)==='Рустам'\)/);
  assert.match(smart,/const canShowCloudCam=hallway&&String\(data\?\.actor\|\|''\)==='Рустам'/);
  assert.doesNotMatch(smart,/rtsp:\/\//i);
  assert.doesNotMatch(smart,/192\.168\.31\.69|xxxxS_54aebc60a6c4/i);
});

test('Safari link replaces full-screen iframe and avoids browser CAPTCHA',()=>{
  assert.match(smart,/link\.href=CLOUDCAM_URL/);
  assert.match(smart,/link\.target='_blank'/);
  assert.match(smart,/link\.rel='noopener noreferrer'/);
  assert.doesNotMatch(smart,/openCloudCamViewer|smart-home-camera-overlay|iframe/);
  assert.doesNotMatch(css,/\.smart-home-camera-(overlay|dialog|frame|zoom|fit|embed)/);
  assert.match(css,/\.smart-home-camera-open/);
});
