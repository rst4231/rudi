const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('photo viewer shows an explicit HD loading state',()=>{
  assert.match(html,/id="photoViewerLoading"/);
  assert.match(html,/id="photoViewerLoadingText"/);
  assert.match(app,/Загружаем фото в высоком качестве/);
  assert.match(app,/Не удалось загрузить HD\. Показано превью\./);
  assert.match(css,/\.photo-viewer-loading-spinner/);
});

test('photo viewer retries HD and preloads the next two full-resolution photos in parallel',()=>{
  assert.match(app,/function preloadSharedAlbumHd\(url\)/);
  assert.match(app,/if\(attempt<1\)/);
  assert.match(app,/function preloadNextSharedAlbumHd\(photoIndex\)/);
  assert.match(app,/\[1,2\]\.forEach\(offset=>/);
  assert.match(app,/preloadSharedAlbumHd\(adjacentFull\)/);
  assert.match(app,/preloadNextSharedAlbumHd\(photoIndex\)/);
});
