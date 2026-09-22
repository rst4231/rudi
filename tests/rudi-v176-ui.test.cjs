const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const carCss=fs.readFileSync('public/car.css','utf8');
const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));

test('browser theme follows device theme outside Telegram',()=>{
  assert.match(html,/const telegramOpen = Boolean\(tg\?\.initData\)/);
  assert.match(html,/telegramOpen && \(tg\?\.colorScheme === 'dark' \|\| tg\?\.colorScheme === 'light'\)/);
  assert.match(app,/const telegramOpen=Boolean\(tg\?\.initData\)/);
  assert.match(app,/media\.matches\?'dark':'light'/);
  assert.match(app,/if\(!tg\?\.initData\) applyTheme\(\)/);
});

test('browser pull-to-refresh is available only outside Telegram',()=>{
  assert.match(app,/function setupBrowserPullToRefresh\(\)/);
  assert.match(app,/if\(tg\?\.initData\|\|!\('ontouchstart' in window\)\) return/);
  assert.match(app,/Отпустите для обновления/);
  assert.match(app,/window\.location\.reload\(\)/);
  assert.match(css,/\.pull-refresh-indicator/);
  assert.match(css,/@keyframes rudiPullRefreshSpin/);
});

test('iPhone home icon uses the supplied RUDI photo',()=>{
  assert.match(html,/rel="icon"[^>]+href="\/favicon-v176\.png\?v=1\.7\.8"/);
  assert.match(html,/rel="apple-touch-icon"[^>]+href="\/apple-touch-icon-v176\.jpg\?v=1\.7\.8"/);
  assert.equal(manifest.icons[0].src,'/icon-192-v176.jpg');
  assert.ok(fs.existsSync('public/favicon-v176.png'));
  assert.ok(fs.existsSync('public/apple-touch-icon-v176.jpg'));
  assert.ok(fs.existsSync('public/icon-192-v176.jpg'));
});

test('car header uses detailed Changan asset and has no header chevron',()=>{
  assert.match(html,/class="car-head-visual"/);
  assert.match(html,/src="\/changan-uni-v-header\.jpg\?v=1\.7\.8"/);
  const start=html.indexOf('<div class="car-head">');
  const end=html.indexOf('<div id="carBody"',start);
  const header=html.slice(start,end);
  assert.doesNotMatch(header,/chevron|<svg|›|&gt;/i);
  assert.match(carCss,/\.car-head-visual/);
  assert.ok(fs.existsSync('public/changan-uni-v-header.jpg'));
});
