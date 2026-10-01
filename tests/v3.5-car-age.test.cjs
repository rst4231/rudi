const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('car age is shown in compact card and dedicated page',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const js=fs.readFileSync('public/car.js','utf8');
  const css=fs.readFileSync('public/car.css','utf8');

  assert.match(html,/id="carHomeAge" class="car-age"/);
  assert.match(html,/id="carPageAge" class="car-age"/);
  assert.equal((html.match(/id="carHomeAge"/g)||[]).length,1);
  assert.equal((html.match(/id="carPageAge"/g)||[]).length,1);
  assert.doesNotMatch(html,/id="carNoteAdd"/);
  assert.match(js,/const CAR_PURCHASE_DATE='2023-09-07'/);
  assert.match(js,/function carAgeLabel\(now=new Date\(\)\)/);
  assert.match(js,/for\(const id of \['carHomeAge','carPageAge'\]\)/);
  assert.match(css,/\.car-age\{/);
});

test('car age calendar math preserves years and completed months',()=>{
  const source=fs.readFileSync('public/car.js','utf8');
  const start=source.indexOf("const CAR_PURCHASE_DATE='2023-09-07'");
  const end=source.indexOf('function renderCarAge()',start);
  assert.ok(start>=0&&end>start);
  const snippet=source.slice(start,end);
  const factory=new Function(snippet+'; return carAgeLabel;');
  const carAgeLabel=factory();
  assert.equal(carAgeLabel(new Date('2026-10-01T12:00:00+03:00')),'3 года');
  assert.equal(carAgeLabel(new Date('2026-10-07T12:00:00+03:00')),'3 года 1 месяц');
  assert.equal(carAgeLabel(new Date('2027-09-07T12:00:00+03:00')),'4 года');
});
