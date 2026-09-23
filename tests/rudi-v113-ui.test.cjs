const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');

test('theme selector lives compactly inside settings and is actor-specific',()=>{
  assert.doesNotMatch(html,/class="theme-setting"/);
  assert.match(app,/id="homeSettingsPanel"/);
  assert.match(app,/class="settings-theme-options"/);
  assert.match(app,/data-theme-mode="system"/);
  assert.match(app,/data-theme-mode="light"/);
  assert.match(app,/data-theme-mode="dark"/);
  assert.match(app,/rudi:theme-mode:v1:/);
  assert.match(app,/currentActor==='Диана'\?'diana':'rustam'/);
  assert.match(app,/themeMode:themeModeValue/);
  assert.match(css,/\.settings-theme-option\{/);
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


test('partner message has distinct romantic styling for light and dark themes',()=>{
  assert.match(css,/\.partner-message\{[\s\S]*?--message-rose:/);
  assert.match(css,/html\[data-theme="dark"\] \.partner-message\{/);
  assert.match(css,/\.partner-message \.love-heart:nth-child\(1\)\{color:var\(--message-rose\)/);
  assert.match(css,/\.partner-message \.love-heart:nth-child\(2\)\{color:var\(--message-peach\)/);
  assert.match(css,/\.partner-message \.love-heart:nth-child\(3\)\{color:var\(--message-lilac\)/);
  assert.match(css,/\.partner-message \.love-heart:nth-child\(4\)\{color:var\(--message-gold\)/);
});
