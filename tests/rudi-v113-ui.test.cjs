const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');

test('theme selector stays above home layout edit action and is actor-specific',()=>{
  const themeIndex=html.indexOf('class="theme-setting"');
  const editIndex=html.indexOf('id="homeLayoutEditButton"');
  assert.ok(themeIndex>=0&&editIndex>themeIndex);
  assert.match(html,/data-theme-mode="system"/);
  assert.match(html,/data-theme-mode="light"/);
  assert.match(html,/data-theme-mode="dark"/);
  assert.match(app,/rudi:theme-mode:v1:/);
  assert.match(app,/currentActor==='Диана'\?'diana':'rustam'/);
  assert.match(app,/themeMode:themeModeValue/);
});

test('settings gear contains ticker PWA install and version',()=>{
  assert.match(app,/id="homeSettingsButton"/);
  assert.match(app,/id="homeSettingsPanel"/);
  assert.match(app,/id="marketTickerToggle"/);
  assert.match(app,/id="settingsPwaInstall"/);
  assert.match(app,/id="settingsAppVersion"/);
  assert.match(app,/appVersionLabel\(\)/);
  assert.match(css,/\.home-settings-button\{/);
});

test('URL navigation supports deep links and browser history',()=>{
  assert.match(app,/url\.searchParams\.set\('tab',next\)/);
  assert.match(app,/url\.searchParams\.set\('item',String\(item\)\)/);
  assert.match(app,/history\[replace\?'replaceState':'pushState'\]/);
  assert.match(app,/addEventListener\('popstate'/);
  assert.match(app,/data-rudi-item-id/);
});

test('destructive wishlist and product actions expose undo snackbar',()=>{
  assert.match(html,/id="undoSnackbar"/);
  assert.match(html,/id="undoSnackbarButton"/);
  assert.match(app,/showUndoSnackbar\('Удалено'/);
  assert.match(app,/wishlistRequest\('restore'/);
  assert.match(app,/productsRequest\('restore'/);
  assert.match(api,/operation === 'restore'/);
  assert.match(css,/\.undo-snackbar\{/);
});
