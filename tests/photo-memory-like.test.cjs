const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('photo memory has a shared reaction control under the image',()=>{
  const photo=html.indexOf('id="sharedAlbumMemoryButton"');
  const like=html.indexOf('id="sharedAlbumMemoryLike"');
  assert.ok(photo>=0&&like>photo);
  assert.match(html,/id="sharedAlbumMemoryLikedBy"/);
  assert.match(css,/\.shared-album-memory-reaction/);
});

test('photo memory reaction is keyed to the selected photo and uses shared reactions',()=>{
  assert.match(app,/function sharedAlbumMemoryReactionTarget\(photo\)/);
  assert.match(app,/type:'photo-memory'/);
  assert.match(app,/key:'photo:'\+sharedAlbumHash\(source\)\.toString\(16\)/);
  assert.match(app,/bindReaction\('sharedAlbumMemoryLike','sharedAlbumMemoryLikedBy'/);
  assert.match(app,/refreshReaction\(currentPhotoMemoryReactionTarget,'sharedAlbumMemoryLike','sharedAlbumMemoryLikedBy'\)/);
});
