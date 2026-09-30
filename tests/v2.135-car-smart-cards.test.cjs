const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const js=fs.readFileSync('public/car.js','utf8');
const css=fs.readFileSync('public/car.css','utf8');
const config=JSON.parse(fs.readFileSync('rudi-config.json','utf8'));

test('car page builds movable collapsible smart cards in stable default order',()=>{
  assert.match(js,/CAR_SMART_DEFAULT_ORDER=\['weather','service','mileage','errors','tasks','wash'\]/);
  assert.match(js,/function setupCarSmartCards\(\)/);
  assert.match(js,/function applyCarSmartOrder\(/);
  assert.match(js,/startCarCardDrag/);
  assert.match(js,/setCarCardCollapsed/);
  assert.match(css,/\.car-smart-card\.panel/);
  assert.match(css,/\.car-card-drag-handle/);
  assert.match(css,/\.car-card-collapse/);
});

test('car card priority responds to tasks, service, errors and weather',()=>{
  assert.match(js,/id==='tasks'/);
  assert.match(js,/timing\|\|''\)===\'today\'/);
  assert.match(js,/id==='service'/);
  assert.match(js,/id==='errors'/);
  assert.match(js,/id==='weather'/);
  assert.equal(config.car.priority.tasks.today,900);
  assert.equal(config.car.priority.service.due,980);
  assert.equal(config.car.priority.errors.active,950);
});

test('task card shows an iOS-like red count only for today tasks',()=>{
  assert.match(js,/id='carTasksTodayBadge'/);
  assert.match(js,/car-card-notification-badge/);
  assert.match(js,/filter\(task=>String\(task\?\.timing\|\|''\)===\'today\'\)/);
  assert.match(css,/\.car-card-notification-badge\{[\s\S]*background:#ff3b30/);
});

test('registration is rendered on its own line on home and car page',()=>{
  assert.match(html,/Changan UNI‑V · 2023 <span class="car-registration">А 034 ЕА105<\/span>/);
  assert.match(css,/\.car-home-title-row \.car-model \.car-registration,[\s\S]*\.car-page \.car-model \.car-registration\{[\s\S]*display:block!important/);
});

test('wash guide uses a compact popup instead of replacing the car page',()=>{
  assert.match(html,/id="carWashGuidePage"[^>]*role="dialog"/);
  assert.match(js,/function setupCarWashModal\(\)/);
  assert.match(css,/\.car-wash-guide-page\{[\s\S]*position:fixed!important/);
  assert.match(css,/\.car-wash-guide-dialog\{[\s\S]*max-height:min\(92dvh,720px\)/);
});
