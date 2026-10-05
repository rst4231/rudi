const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'..','public','messenger.js'),'utf8');

test('messenger photo picker supports multiple images',()=>{
  assert.match(html,/id="messengerPhotoInput"[^>]*type="file"[^>]*accept="image\/\*"[^>]*multiple/);
  assert.match(js,/const files=\[\.\.\.\(photoInput\.files\?\?\[\]\)\]/);
  assert.match(js,/sendPhotoFiles\(files\)/);
});

test('attachment tray exposes a camera action that opens the rear camera',()=>{
  assert.match(html,/data-messenger-attach="camera"[^>]*>[\s\S]*?<b>Камера<\/b>/);
  assert.match(html,/id="messengerCameraInput"[^>]*type="file"[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(js,/const cameraInput=document\.getElementById\('messengerCameraInput'\)/);
  assert.match(js,/type==='camera'[\s\S]*?cameraInput\?\.click\?\.\(\)/);
});

test('multi-photo sending is bounded and reports batch progress',()=>{
  assert.match(js,/async function sendPhotoFiles\(files\)/);
  assert.match(js,/\.slice\(0,10\)/);
  assert.match(js,/Отправляю фото $\{index\+1\} из $\{images\.length\}/);
});
