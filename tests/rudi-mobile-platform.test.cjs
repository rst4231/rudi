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

test('browser has guarded in-place pull-to-refresh and Telegram does not', () => {
  const start=app.indexOf('function setupBrowserPullToRefresh()');
  const end=app.indexOf('function updateTelegramSafeArea()',start);
  const pull=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.match(pull,/if\(tg\?\.initData\|\|!\('ontouchstart' in window\)\) return/);
  assert.match(pull,/const threshold=224/);
  assert.match(pull,/!appAccessReady\|\|!currentActor/);
  assert.match(pull,/touchstart/);
  assert.match(pull,/touchmove/);
  assert.match(pull,/Отпустите для обновления/);
  assert.match(pull,/refreshAfterResume\(\)/);
  assert.doesNotMatch(pull,/window\.location\.reload\(\)/);
  assert.match(css,/\.pull-refresh-indicator/);
  assert.match(css,/\.pull-refresh-indicator\.is-refreshing/);
});

test('activity notification popover is lifted above movable home cards while open', () => {
  assert.match(app,/dashboard\?\.classList\.toggle\('activity-notifications-open',next\)/);
  assert.match(css,/\.home-dashboard-summary\.activity-notifications-open\{[\s\S]*?z-index:500/);
  assert.match(css,/\.home-dashboard-summary\.activity-notifications-open \.home-activity-notifications-panel\{[\s\S]*?z-index:502/);
});

test('installed RUDI icon uses the supplied photo instead of a generated letter icon', () => {
  assert.match(html,/rel="icon"[^>]+href="\/favicon-v176\.png\?v=\d+\.\d+\.\d+"/);
  assert.match(html,/rel="apple-touch-icon"[^>]+href="\/apple-touch-icon-v176\.jpg\?v=\d+\.\d+\.\d+"/);
  assert.equal(fs.existsSync('public/favicon-v176.png'),true);
  assert.equal(fs.existsSync('public/apple-touch-icon-v176.jpg'),true);
  assert.equal(fs.existsSync('public/icon-192-v176.jpg'),true);
  assert.equal(manifest.icons[0].src,'/icon-192-v176.jpg');
});

test('car header uses the detailed supplied UNI-V asset and has no header arrow', () => {
  const start=html.indexOf('<div class="car-head">');
  const end=html.indexOf('<div id="carBody"',start);
  const header=html.slice(start,end);
  assert.ok(start>=0 && end>start);
  assert.match(header,/class="car-head-visual"/);
  assert.match(header,/src="\/changan-uni-v-header\.webp\?v=\d+\.\d+\.\d+"/);
  assert.doesNotMatch(header,/chevron|arrow|›|→/i);
  assert.match(carCss,/\.car-head-visual/);
  assert.match(carCss,/\.car-head-visual img\{[\s\S]*?height:88px;[\s\S]*?object-fit:contain/);
});

test('Face ID challenge is stateless and does not depend on Runtime Cache', () => {
  assert.match(passkeys,/function createChallengeToken/);
  assert.match(passkeys,/function consumeChallenge/);
  assert.match(passkeys,/timingSafeEqual/);
  assert.doesNotMatch(passkeys,/function challengeKey/);
  assert.doesNotMatch(passkeys,/async function saveChallenge/);
});

test('RUDI has a restrained app-wide motion system with reduced-motion support', () => {
  assert.match(app,/function rudiMotionReduced\(\)/);
  assert.match(app,/function animateRudiView\(section\)/);
  assert.match(app,/function animateRudiCollection\(root,selector=/);
  assert.match(app,/restartRudiMotion\(image,'rudi-photo-swap',360\)/);
  assert.match(app,/panel\.classList\.add\('is-open'\)/);
  assert.match(css,/--rudi-motion-base:240ms/);
  assert.match(css,/@keyframes rudiViewEnter/);
  assert.match(css,/\.rudi-collapse-body-inner\{[\s\S]*?transition:/);
  assert.match(css,/\.home-activity-notifications-panel\.is-open/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
});

test('Rustam expandable card has a sourced non-repeating male psychology daily fact UI', () => {
  assert.match(app,/id='malePsychologyFact'/);
  assert.match(app,/Научный факт дня/);
  assert.match(app,/function renderMalePsychologyFact\(fact\)/);
  assert.match(app,/rudiAction=male-psychology-fact/);
  assert.match(app,/renderMalePsychologyFact\(payload\.malePsychologyFact\)/);
  assert.match(css,/\.male-psychology-fact\{/);
  assert.match(css,/\.male-psychology-fact-disclaimer\{/);
});

