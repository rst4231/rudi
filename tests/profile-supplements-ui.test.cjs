const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('supplement UI opens description from the info button',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');assert.match(source,/supplement-info-button/);assert.match(source,/openSupplementInfo\(item\)/);assert.match(source,/supplementInfoModal/);assert.doesNotMatch(source,/Нажми, чтобы открыть описание/)});
test('supplement add button has visible loading and success states',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');assert.match(source,/add\.textContent='Добавляю…'/);assert.match(source,/add\.textContent='✓ Добавлено'/)});
test('personal profile shows age, sex, daily Groq recommendation and supplement emoji',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');assert.match(source,/ageText\(profile\.age\)\+' · '\+profile\.sexLabel/);assert.match(source,/request\('recommendation'\)/);assert.match(source,/emojiForSupplement/);assert.match(source,/🏋️/);assert.match(source,/🍵/);assert.match(source,/☀️/)});
test('personal profile keeps last supplement above fixed tab bar in PWA and Telegram',()=>{const css=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.css'),'utf8');assert.match(css,/scroll-padding-bottom:calc\(128px \+ max\(env\(safe-area-inset-bottom\),var\(--tg-content-safe-area-inset-bottom,0px\)\)\)/)});
test('advanced supplement UI includes tracking, search, interactions and editor',()=>{const advanced=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');const editor=fs.readFileSync(path.join(__dirname,'..','public','supplement-editor.js'),'utf8');assert.match(advanced,/Проверить сочетания/);assert.match(advanced,/Принято/);assert.match(advanced,/Найдены дубли состава/);assert.match(advanced,/supplementTimeKey/);assert.match(editor,/Дозировка/);assert.match(editor,/Срок годности/);assert.match(editor,/Самочувствие \/ заметки/);assert.match(editor,/Длительность курса/)});

test('supplement UI has no reminder controls',()=>{const advanced=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');const editor=fs.readFileSync(path.join(__dirname,'..','public','supplement-editor.js'),'utf8');assert.doesNotMatch(advanced,/reminderEnabled|🔔/);assert.doesNotMatch(editor,/reminderEnabled|Напоминать/)});

test('supplement actions are compact icon drawers and interactions require selection',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');assert.match(source,/makeActionButton\('add','＋'/);assert.match(source,/makeActionButton\('search','⌕'/);assert.doesNotMatch(source,/makeActionButton\('sort'/);assert.match(source,/makeActionButton\('interactions','🧪'/);assert.match(source,/selectedIds/);assert.match(source,/interactionRun\.disabled=count<2/)});
test('supplement take button supports repeated daily intake progress',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');assert.match(source,/function plannedIntakes/);assert.match(source,/intakesTodayCount/);assert.match(source,/count+'\/'\+target/);assert.match(source,/take\.disabled=completedToday\(item\)/)});

test('personal profile hides bottom tab bar and removes reserved nav space',()=>{const css=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.css'),'utf8');assert.match(css,/\.personal-profile-open #appTabBar\{display:none!important\}/);assert.match(css,/\.personal-profile-open \.personal-profile-page\{padding-bottom:calc\(24px/)});

test('work calendar uses gray work days and blue selection without corner work markers',()=>{const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');const renderStart=js.indexOf('function renderWorkCalendar');const renderEnd=js.indexOf('async function refreshPartnerWorkStatus',renderStart);const block=js.slice(renderStart,renderEnd);assert.doesNotMatch(block,/calendar-work-dot/);assert.doesNotMatch(block,/calendar-check/);assert.match(css,/\.calendar-day-cell\.working\{[\s\S]*var\(--muted\)/);assert.match(css,/\.calendar-day-cell\.selected\{box-shadow:inset 0 0 0 2px #6675ee/)});

test('repeated calendar tab selects today in current month',()=>{const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');assert.match(js,/if\(next==='schedule'\)\{[\s\S]*currentSelectedWorkDate=todayState\(\)\.key;[\s\S]*currentWorkCalendarView='month';[\s\S]*loadWorkCalendar\('month',\{silent:true\}\)/)});

test('supplements are grouped by status and always ordered by intake time',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');assert.match(source,/for\(const status of \['active','paused','finished'\]\)/);assert.match(source,/supplementTimeKey\(a\.item\)\.localeCompare\(supplementTimeKey\(b\.item\)\)/);assert.match(source,/return'Принимаю'/);assert.match(source,/return'На паузе'/);assert.match(source,/return'Архив'/);assert.doesNotMatch(source,/sortSelect/);assert.doesNotMatch(source,/makeActionButton\('sort'/)});
test('supplement action bar has three icons after sorting control removal',()=>{const css=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.css'),'utf8');assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)});
test('Diana finished status is feminine in editor too',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','supplement-editor.js'),'utf8');assert.match(source,/Закончила/);assert.match(source,/На паузе/)});

test('supplement status groups persist collapse state per actor',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');assert.match(source,/GROUP_STATE_PREFIX='rudi-supplement-groups-v1:'/);assert.match(source,/app\(\)\?\.getActor\?\.\(\)/);assert.match(source,/localStorage\.setItem\(groupStateKey\(\)/);assert.match(source,/aria-expanded/);assert.match(source,/const collapsed=!query&&readGroupState\(\)\[status\]===true/)});

test('personal supplements support left-edge swipe back without conflicting with editor',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');assert.match(source,/function setupEdgeSwipeBack\(\)/);assert.match(source,/event\.clientX>32/);assert.match(source,/dx>=70&&dx>=dy\*1\.35/);assert.match(source,/supplement-editor-open/);assert.match(source,/if\(shouldClose\)close\(\)/)});


test('home tracker and supplements use approved pastel card layout',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');const css=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.css'),'utf8');assert.match(source,/personal-home-tile-icon is-habit/);assert.match(source,/personal-home-tile-icon is-supplement/);assert.match(source,/habitTile\.append\(habitHead,habitProgressRow,habitCalendar,habitBody\)/);assert.match(css,/RUDI v2\.56 — pastel home cards/);assert.match(css,/linear-gradient\(120deg,#f6fbf7/);assert.match(css,/linear-gradient\(120deg,#fffaf4/)}); 
test('supplement home card shows distinct supplements taken today',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');assert.match(source,/function todaySupplementCount\(\)/);assert.match(source,/some\(row=>String\(row\?\.date\|\|''\)===today\)/);assert.match(source,/Сегодня принято: /);assert.match(source,/renderSupplementSummary\(\)/)});


test('archived supplements use explicit red delete button and no swipe delete',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.css'),'utf8');
  assert.match(js,/supplement-delete/);
  assert.match(js,/remove\.textContent='Удалить'/);
  assert.doesNotMatch(js,/setupFinishedSwipe/);
  assert.match(css,/\.supplement-delete\{background:#e5484d/);
});

test('collapsed supplements and habits show overdue red counters',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.css'),'utf8');
  assert.match(js,/overdueSupplementCount/);
  assert.match(js,/moscowClockMinutes\(now\)<20\*60/);
  assert.match(js,/personal-home-reminder-badge/);
  assert.match(css,/background:#ff3b30/);
});

test('supplement info uses structured emoji bold and italic markup',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');
  assert.match(js,/💊 Главное/);
  assert.match(js,/⏰ Когда принимать/);
  assert.match(js,/📚 Доказательность/);
  assert.match(js,/document\.createElement\('strong'\)/);
  assert.match(js,/document\.createElement\('em'\)/);
});

test('profile supplement intake cards show compact progress and completed items',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.match(js,/profile-supplement-intakes-progress/);
  assert.match(js,/taken\+'\/'\+total/);
  assert.match(js,/profile-supplement-intake-check/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});


test('supplement theme follows RUDI theme instead of OS light preference',()=>{const css=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.css'),'utf8');assert.doesNotMatch(css,/@media \(prefers-color-scheme:light\)/);assert.match(css,/html\[data-theme="dark"\] \.supplement-card\{/)});
test('archived supplement actions use a dedicated two-column layout',()=>{const js=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.js'),'utf8');const css=fs.readFileSync(path.join(__dirname,'..','public','supplement-advanced.css'),'utf8');assert.match(js,/actions\.classList\.add\('is-archive'\)/);assert.match(css,/\.supplement-card-actions\.is-archive\{grid-template-columns:minmax\(0,1\.6fr\) minmax\(0,1fr\)\}/);assert.match(css,/\.supplement-card-actions\.is-archive \.supplement-delete\{font-size:12px/)});
