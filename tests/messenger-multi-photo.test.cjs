const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'..','public','messenger.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','messenger.css'),'utf8');

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

test('multiple selected photos are encrypted and sent as one album message',()=>{
  assert.match(js,/async function sendPhotoFiles\(files\)/);
  assert.match(js,/\.slice\(0,10\)/);
  assert.match(js,/kind:'photo-album'/);
  assert.match(js,/photos,/);
  assert.match(js,/await sendAttachmentMessage\(album,/);
  assert.match(js,/📷 Альбом/);
});

test('album uses bounded adaptive compression to stay inside one encrypted message',()=>{
  assert.match(js,/Math\.floor\(620000\/images\.length\)/);
  assert.match(js,/compressMessengerPhoto\([^,]+,\{maxBytes,maxSide\}\)/);
});

test('photo album renders as a Telegram-like collage',()=>{
  assert.match(js,/function appendPhotoAlbumAttachment\(bubble,attachment\)/);
  assert.match(js,/messenger-photo-album/);
  assert.match(js,/if\(attachment\?\.kind==='photo-album'\) appendPhotoAlbumAttachment/);
  assert.match(css,/\.messenger-photo-album/);
});

test('context menu can save the whole album in one action',()=>{
  assert.match(js,/async function savePhotosToDevice\(attachments\)/);
  assert.match(js,/Сохранить все фото/);
  assert.match(js,/savePhotosToDevice\(albumPhotos\)/);
});
