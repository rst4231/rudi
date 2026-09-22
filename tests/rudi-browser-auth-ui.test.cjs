const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js','utf8');
const css = fs.readFileSync('public/app.css','utf8');
const smart = fs.readFileSync('public/smart-home.js','utf8');
const car = fs.readFileSync('public/car.js','utf8');
const partner = fs.readFileSync('api/partner-message.js','utf8');
const smartServer = fs.readFileSync('api/smart-home-client.cjs','utf8');
const carServer = fs.readFileSync('api/car-client.cjs','utf8');

test('Safari login uses RUDI browser auth and keeps the two explicit identities', () => {
  assert.match(app, /rudiAction=browser-auth/);
  assert.match(app, /\['Рустам','Диана'\]/);
  assert.match(app, /operation,'create-pin'|browserAuthRequest\('create-pin'/);
  assert.match(app, /browserAuthRequest\('login'/);
  assert.match(app, /rudi-pin-rate-limited/);
  assert.match(app, /PIN ещё не создан/);
});

test('browser login gate hides the application until authentication succeeds', () => {
  assert.match(css, /body\.auth-login \.shell/);
  assert.match(css, /body\.auth-login \.app-tabbar/);
  assert.match(css, /body\.auth-login \.app-gate-loader/);
  assert.match(css, /\.rudi-auth-pin/);
  assert.match(css, /\.rudi-auth-actor\.is-active/);
});

test('authenticated browser sessions unlock app data without Telegram initData guards', () => {
  assert.doesNotMatch(app, /if\(!currentActor\|\|!tg\?\.initData\)/);
  assert.doesNotMatch(app, /if\(!tg\?\.initData\) return;/);
  assert.match(app, /async function loadAppBootstrap\(\)\{\s*if\(!currentActor\) return;/);
  assert.match(app, /const canEdit=Boolean\(currentActor\)/);
});

test('smart home and car start after RUDI auth rather than requiring Telegram WebView', () => {
  assert.doesNotMatch(smart, /if\(!tg\?\.initData\|\|state\.loading\)/);
  assert.doesNotMatch(car, /if\(!tg\?\.initData \|\| state\.loading\)/);
  assert.match(smart, /document\.body\.classList\.contains\('auth-ok'\)/);
  assert.match(car, /document\.body\.classList\.contains\('auth-ok'\)/);
});

test('server routes preserve Telegram auth but accept the signed RUDI session fallback', () => {
  assert.match(partner, /authorizeWithSession/);
  assert.match(partner, /const telegram = authorizeInitData\(body\.initData, options\)/);
  assert.match(partner, /if \(session\.source === 'telegram'\)/);
  assert.match(smartServer, /authorizeWithSession/);
  assert.match(carServer, /authorizeWithSession/);
});

test('Safari bootstrap never rewrites Telegram notification recipients without a Telegram user id', () => {
  const guarded = partner.match(/else if \(user\?\.id\) \{\s*await saveRecipient\(actor, user\?\.id,/g) || [];
  assert.ok(guarded.length >= 2);
});

test('browser-local block state is separated for Rustam and Diana', () => {
  assert.match(app, /currentActor==='Диана'\?'diana':'rustam'/);
  assert.doesNotMatch(app, /initDataUnsafe\?\.user\?\.id\|\|'local'/);
});
