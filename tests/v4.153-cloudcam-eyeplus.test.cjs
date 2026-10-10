const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const smart=fs.readFileSync('public/smart-home.js','utf8');
const css=fs.readFileSync('public/smart-home.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('CloudCam remains available only to Rustam in Hallway',()=>{
  assert.match(smart,/if\(String\(data\?\.actor\|\|''\)==='Рустам'\)/);
  assert.match(smart,/const canShowCloudCam=hallway&&String\(data\?\.actor\|\|''\)==='Рустам'/);
  assert.match(smart,/list\.insertBefore\(cloudCamCard\(\),cameraIndex>=0\?list\.children\[cameraIndex\]:null\)/);
  assert.match(smart,/name==='камера' \|\| name==='переключатель'/);
});

test('CloudCam opens EyePlus directly, without an embedded login or CAPTCHAs in RUDI',()=>{
  assert.match(smart,/const CLOUDCAM_URL='https:\/\/eyeplus\.closeli\.com\/login'/);
  assert.match(smart,/const link=card\.querySelector\('\.smart-home-camera-open'\)/);
  assert.match(smart,/link\.href=CLOUDCAM_URL/);
  assert.match(smart,/link\.target='_blank'/);
  assert.match(smart,/link\.rel='noopener noreferrer'/);
  assert.match(smart,/link\.referrerPolicy='no-referrer'/);
  assert.match(smart,/<a class="smart-home-camera-open" aria-label="Смотреть CloudCam в Safari">Смотреть<\/a>/);
  assert.doesNotMatch(smart,/openCloudCamViewer|smart-home-camera-overlay|<iframe|createElement\('iframe'\)/);
  assert.doesNotMatch(css,/\.smart-home-camera-(overlay|dialog|frame|embed)/);
  assert.match(css,/\.smart-home-camera-open/);
  assert.match(html,/id="smartHomeRooms"/);
});

test('Camera credentials and local RTSP connection are never exposed by RUDI',()=>{
  assert.doesNotMatch(smart,/rtsp:\/\//i);
  assert.doesNotMatch(smart,/192\.168\.31\.69/);
  assert.doesNotMatch(smart,/54:AE:BC:60:A6:C4/i);
  assert.doesNotMatch(smart,/xxxxS_54aebc60a6c4/i);
});
