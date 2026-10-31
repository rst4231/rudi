const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const smart=fs.readFileSync('public/smart-home.js','utf8');
const css=fs.readFileSync('public/smart-home.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('Camera credentials and local RTSP connection are never exposed by RUDI',()=>{
  assert.doesNotMatch(smart,/rtsp:\/\//i);
  assert.doesNotMatch(smart,/192\.168\.31\.69/);
  assert.doesNotMatch(smart,/54:AE:BC:60:A6:C4/i);
  assert.doesNotMatch(smart,/xxxxS_54aebc60a6c4/i);
});
