const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/car.js','utf8');
const css=fs.readFileSync('public/car.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const config=JSON.parse(fs.readFileSync('rudi-config.json','utf8'));

test('car page uses smart collapsible cards without manual dragging',()=>{
  assert.match(js,/CAR_SMART_DEFAULT_ORDER=\['mileage','errors','tasks'\]/);
  assert.match(js,/function setupCarSmartCards\(\)/);
  assert.match(js,/function applyCarSmartOrder\(/);
  assert.match(js,/setCarCardCollapsed/);
  assert.doesNotMatch(js,/startCarCardDrag/);
  assert.doesNotMatch(js,/setupCarCardDragEvents/);
  assert.match(css,/\.car-card-drag-handle\{display:none!important\}/);
});

test('mileage and service are combined as Probeg i TO',()=>{
  assert.match(js,/buildCarSmartCard\('mileage','Пробег и ТО',mileageService\)/);
  assert.match(js,/car-mileage-service-content/);
  assert.match(js,/id==='mileage'/);
  assert.equal(config.car.priority.service.due,980);
});

test('tyre season is shown as a sticker by the front wheel and wash block is dedicated',()=>{
  assert.match(html,/id="carHomeTyreSticker"/);
  assert.match(html,/id="carPageTyreSticker"/);
  assert.match(js,/function tyreSeason\(weather\)/);
  assert.match(js,/return \[carWashAdvice\(weather\)\]/);
  assert.doesNotMatch(js,/weatherTyresRecommendation/);
  assert.match(html,/Стоит ли мыть сейчас машину/);
  assert.match(css,/\.car-tyre-sticker\{/);
  assert.match(css,/data-season="winter"/);
  assert.match(css,/car-wash-decision/);
  assert.doesNotMatch(js,/title:'Погода и шины'/);
});

test('wash guide button exists only inside a positive wash recommendation',()=>{
  assert.match(js,/canWash:true/);
  assert.match(js,/car-recommendation-wash-button/);
  assert.doesNotMatch(html,/id="carWashGuideOpen"/);
  assert.match(html,/id="carWashGuidePage"[^>]*role="dialog"/);
  assert.match(css,/\.car-wash-guide-dialog \.car-wash-guide-steps\{\s*grid-template-columns:1fr!important/);
});

test('today car tasks show badges on task card and collapsed home car',()=>{
  assert.match(js,/id='carTasksTodayBadge'/);
  assert.match(js,/id='carTodayTaskBadge'/);
  assert.match(js,/carHomeTitle/);
  assert.match(js,/dataset\.carTodayTaskCount/);
  assert.match(css,/\.car-card-notification-badge\{[\s\S]*background:#ff3b30/);
});

test('light car theme has explicit readable contrast',()=>{
  assert.match(css,/html\[data-theme="light"\] \.car-smart-card\.panel/);
  assert.match(css,/html\[data-theme="light"\] \.car-mileage-input-row input/);
  assert.match(css,/color:#171c24!important/);
});

test('app icon badge aggregates unread state and uses Badging API',()=>{
  assert.match(app,/function appAttentionCount\(\)/);
  assert.match(app,/navigator\.setAppBadge\(count\)/);
  assert.match(app,/navigator\.clearAppBadge\(\)/);
  assert.match(app,/Notification\.requestPermission\(\)/);
  assert.match(app,/settingsAppBadgeEnable/);
  assert.match(app,/rudi:attention-change/);
});
