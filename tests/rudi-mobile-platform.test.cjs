const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('public/app.js','utf8');
const html = fs.readFileSync('public/index.html','utf8');
const css = fs.readFileSync('public/app.css','utf8');
const carCss = fs.readFileSync('public/car.css','utf8');
const car = fs.readFileSync('public/car.js','utf8');
const passkeys = fs.readFileSync('api/rudi-passkeys.cjs','utf8');
const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));

test('system theme follows device or Telegram while manual theme can override it', () => {
  assert.match(app,/function resolvedSystemTheme\(\)/);
  assert.match(app,/if\(telegramOpen&&\(tg\?\.colorScheme==='dark'\|\|tg\?\.colorScheme==='light'\)\) return tg\.colorScheme/);
  assert.match(app,/return media\.matches\?'dark':'light'/);
  assert.match(app,/const theme=mode==='system'\?resolvedSystemTheme\(\):mode/);
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
  assert.match(pull,/const threshold=standalone\?120:180/);
  assert.match(pull,/const topTolerance=standalone\?8:2/);
  assert.match(pull,/!appAccessReady\|\|!currentActor/);
  assert.match(pull,/touchstart/);
  assert.match(pull,/touchmove/);
  assert.match(pull,/Отпустите для обновления/);
  assert.match(pull,/refreshAfterResume\(\)/);
  assert.doesNotMatch(pull,/window\.location\.reload\(\)/);
  assert.match(css,/\.pull-refresh-indicator/);
  assert.match(css,/@media \(display-mode:standalone\)\{[\s\S]*overscroll-behavior-y:none/);
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
  assert.match(app,/restartRudiMotion\(image,'rudi-photo-swap',280\)/);
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
  assert.doesNotMatch(app,/rudiAction=male-psychology-fact/);
  assert.match(app,/renderMalePsychologyFact\(malePsychologyFactFromConfig\(config\)\)/);
  assert.match(css,/\.male-psychology-fact\{/);
  assert.match(css,/\.male-psychology-fact-disclaimer\{/);
});

test('daily psychology fact comes from public config and startup shell waits for dynamic layout', () => {
  assert.match(app,/function malePsychologyFactFromConfig\(config,dateKey=todayState\(\)\.key\)/);
  assert.match(app,/renderMalePsychologyFact\(malePsychologyFactFromConfig\(config\)\)/);
  assert.doesNotMatch(app,/rudiAction=male-psychology-fact/);
  assert.match(app,/appAccessReady=true;\s*showAuthenticatedApp\(\);\s*loadAppBootstrap\(\)\.catch\([\s\S]*?\);\s*return true;/);
  assert.doesNotMatch(app,/appAccessReady=true;\s*ensureAppSurface\(\);\s*await loadAppBootstrap/);
});

test('collapsed car card separates mileage and service into colored premium metrics', () => {
  assert.match(html,/id="carCollapsedMileageValue"/);
  assert.match(html,/id="carCollapsedServiceValue"/);
  assert.match(car,/collapsedMileageNode\.textContent=mileage==null\?'Не указан':formatKm\(mileage\)/);
  assert.match(car,/collapsedServiceNode\.textContent=next[\s\S]*?'ТО-'\+next\.number\+' на '\+formatKm\(next\.mileage\)/);
  assert.match(carCss,/\.car-collapsed-metric\.is-mileage strong\{color:#67b9ff\}/);
  assert.match(carCss,/\.car-collapsed-metric\.is-service strong\{color:#ff934e\}/);
  assert.match(carCss,/\.car-collapsed-metrics-divider/);
});

test('mood support message is outside collapsible profile details', () => {
  assert.match(app,/ownCard\.tile\.insertBefore\(moodMessage,ownCard\.details\)/);
  assert.doesNotMatch(app,/\(selfActor==='Диана'\?dianaCard\.details:rustamCard\.details\)\.appendChild\(moodMessage\)/);
});

test('mood support message keeps high contrast on dark profile cards', () => {
  assert.match(css,/RUDI v1\.10\.3: readable mood support message/);
  assert.match(css,/\.profile-person-card > \.mood-message\.show\{[\s\S]*?color:#f7f8fc!important/);
  assert.match(css,/\.profile-person-card > \.mood-message\.show\[data-mood="great"\]/);
});



test('market ticker is movable, theme-safe and persisted', () => {
  assert.match(html,/data-home-tile="markets"/);
  assert.match(app,/id="marketTickerToggle"/);
  assert.match(app,/HOME_TILE_DEFAULT_ORDER = \[[^\]]*'markets'\]/);
  assert.match(app,/marketTickerEnabledStorageKey/);
  assert.match(app,/marketTickerEnabled:marketTickerEnabledValue/);
  assert.match(app,/rudiAction=market-ticker/);
  assert.match(css,/--market-text:#23262e/);
  assert.match(css,/--market-text:#f5f7fb/);
  assert.match(css,/--market-up:#147a45/);
  assert.match(css,/--market-down:#b83b4b/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.market-ticker-track\.is-ready/);
});

test('market ticker palette keeps WCAG text contrast in both themes', () => {
  const luminance=hex=>{
    const rgb=hex.replace('#','').match(/.{2}/g).map(value=>parseInt(value,16)/255);
    const linear=rgb.map(value=>value<=0.04045?value/12.92:Math.pow((value+0.055)/1.055,2.4));
    return 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2];
  };
  const ratio=(foreground,background)=>{
    const high=Math.max(luminance(foreground),luminance(background));
    const low=Math.min(luminance(foreground),luminance(background));
    return (high+0.05)/(low+0.05);
  };
  for(const [foreground,background] of [
    ['#23262e','#ffffff'],
    ['#6c727d','#ffffff'],
    ['#147a45','#ffffff'],
    ['#b83b4b','#ffffff'],
    ['#f5f7fb','#12151d'],
    ['#9aa2b1','#12151d'],
    ['#65e59d','#12151d'],
    ['#ff7d8a','#12151d'],
  ]){
    assert.ok(ratio(foreground,background)>=4.5,foreground+' on '+background+' must stay readable');
  }
});



test('fast snapshot fallback does not raise the unstable-connection banner', () => {
  const source = fs.readFileSync('public/pwa-extras.js','utf8');
  assert.match(source, /function offlineSnapshotResponse\(row,\{markUnstable=true\}=\{\}\)/);
  assert.match(source, /offlineSnapshotResponse\(winner\.row,\{markUnstable:false\}\)/);
  assert.match(source, /X-RUDI-Snapshot-Mode.*markUnstable\?'offline':'fast'/s);
});
