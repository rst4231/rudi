const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.94 mood picker shows one current emoji and expands choices below',()=>{
  const html=read('public/index.html');
  const app=read('public/app.js');
  assert.match(html,/id="moodCurrentButton"/);
  assert.match(html,/id="moodCurrentEmoji"/);
  assert.match(html,/id="moodChoices" class="mood-choices" hidden/);
  assert.equal((html.match(/class="mood-button"/g)||[]).length,5);
  assert.match(app,/setMoodChoicesOpen\(Boolean\(choices\?\.hidden\)\)/);
  assert.match(app,/button\.hidden=Boolean\(meta&&selected\)/);
});

test('v2.94 mood message stays under picker for 7 seconds',()=>{
  const html=read('public/index.html');
  const app=read('public/app.js');
  assert.ok(html.indexOf('id="moodChoices"')<html.indexOf('id="moodMessage"'));
  assert.match(app,/\},7000\);/);
});

test('v2.94 mood analyzer has no per-user daily limit and caches for 24 hours',()=>{
  const ui=read('public/mood-history.js');
  const api=read('api/partner-message.js');
  const store=read('api/mood-analysis-store.cjs');
  assert.match(ui,/Анализатор настроения/);
  assert.doesNotMatch(ui,/Готово сегодня|Следующий новый анализ будет доступен завтра/);
  assert.match(store,/const TTL_SECONDS=60\*60\*24;/);
  assert.match(store,/function keyFor\(actor,windowDays=30\)/);
  assert.doesNotMatch(store,/keyFor\(actor,date\)/);
  assert.match(api,/reused=Boolean\(analysis\)/);
  assert.match(api,/if\(!analysis\)/);
  assert.doesNotMatch(api,/actor==='Рустам'\|\|!analysis/);
});

test('v2.94 ordinary collapsibles and supplement cards do not collapse on body taps',()=>{
  const app=read('public/app.js');
  const supplements=read('public/profile-supplements.js');
  assert.doesNotMatch(app,/collapseTapIgnored\(/);
  assert.match(app,/button\.addEventListener\('click',toggleCollapsed\)/);
  assert.doesNotMatch(supplements,/habitTile\.addEventListener\('click'/);
  assert.doesNotMatch(supplements,/tile\.addEventListener\('click'/);
  assert.match(supplements,/habitCollapseButton\.addEventListener\('click',toggleHabitCollapse\)/);
  assert.match(supplements,/collapseButton\.addEventListener\('click',toggleSupplementsCollapse\)/);
});

