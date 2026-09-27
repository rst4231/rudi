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


test('album viewer supports resilient iPhone video playback',()=>{
  assert.match(html,/id="photoViewerVideo" controls playsinline webkit-playsinline preload="metadata"/);
  assert.match(app,/Array\.isArray\(photo\?\.videoSources\)/);
  assert.match(app,/video\.src=source\.url;\s*video\.load\(\)/);
  assert.match(app,/sourceIndex\+=1/);
  assert.match(app,/video\.onloadeddata=revealVideo/);
  assert.match(app,/video\.oncanplay=revealVideo/);
  assert.match(app,/closest\?\.\('#photoViewerVideo'\)/);
  assert.match(app,/if\(adjacent\?\.type==='video'\) return/);
  assert.match(css,/\.photo-viewer-stage #photoViewerVideo\.is-loading/);
  assert.match(css,/\.shared-album-video-badge/);
});

test('bottom media tab is named Album',()=>{
  assert.match(html,/data-app-tab="photos"[\s\S]*?<span>Альбом<\/span>/);
});
