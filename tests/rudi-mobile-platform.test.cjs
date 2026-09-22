const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js','utf8');
const html = fs.readFileSync('public/index.html','utf8');
const css = fs.readFileSync('public/app.css','utf8');
const carCss = fs.readFileSync('public/car.css','utf8');
const passkeys = fs.readFileSync('api/rudi-passkeys.cjs','utf8');
const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));

test('browser theme follows the device while Telegram follows Telegram theme', () => {
  assert.match(app,/const telegramOpen=Boolean\(tg\?\.initData\)/);
  assert.match(app,/telegramOpen&&tg\?\.colorScheme/);
  assert.match(app,/media\.matches\?'dark':'light'/);
  assert.match(app,/handleSystemThemeChange=.*if\(!tg\?\.initData\) applyTheme\(\)/);
  assert.match(html,/const telegramOpen = Boolean\(tg\?\.initData\)/);
  assert.match(html,/prefers-color-scheme: dark/);
});

test('browser has guarded pull-to-refresh and Telegram does not', () => {
  assert.match(app,/function setupBrowserPullToRefresh\(\)/);
  assert.match(app,/if\(tg\?\.initData\|\|!\('ontouchstart' in window\)\) return/);
  assert.match(app,/const threshold=112/);
  assert.match(app,/touchstart/);
  assert.match(app,/touchmove/);
  assert.match(app,/Отпустите для обновления/);
  assert.match(app,/window\.location\.reload\(\)/);
  assert.match(css,/\.pull-refresh-indicator/);
  assert.match(css,/\.pull-refresh-indicator\.is-refreshing/);
});

test('installed RUDI icon uses the same real favicon instead of a generated letter icon', () => {
  assert.match(html,/rel="icon"[^>]+href="\/favicon\.png\?v=1\.7\.6"/);
  assert.match(html,/rel="apple-touch-icon" href="\/favicon\.png\?v=1\.7\.6"/);
  assert.equal(fs.existsSync('public/favicon.png'),true);
  assert.equal(manifest.icons[0].src,'/favicon.png?v=1.7.6');
});

test('car header uses the detailed supplied UNI-V asset and has no header arrow', () => {
  const start=html.indexOf('<div class="car-head">');
  const end=html.indexOf('<div id="carBody"',start);
  const header=html.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.match(header,/class="car-head-visual"/);
  assert.match(header,/src="data:image\/jpeg;base64,/);
  assert.doesNotMatch(header,/chevron|arrow|›|→/i);
  assert.match(carCss,/\.car-head-visual/);
  assert.match(carCss,/aspect-ratio:350\/165/);
});

test('Face ID challenge is stateless and does not depend on Runtime Cache', () => {
  assert.match(passkeys,/function createChallengeToken/);
  assert.match(passkeys,/function consumeChallenge/);
  assert.match(passkeys,/timingSafeEqual/);
  assert.doesNotMatch(passkeys,/function challengeKey/);
  assert.doesNotMatch(passkeys,/async function saveChallenge/);
});
