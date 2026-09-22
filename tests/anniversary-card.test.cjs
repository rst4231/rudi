const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const config=JSON.parse(fs.readFileSync('rudi-config.json','utf8'));

test('relationship anniversary is configured from 13 August 2024',()=>{
  assert.equal(config.relationship?.startedAt,'2024-08-13');
  assert.equal(config.relationship?.title,'Наша годовщина');
});

test('anniversary card sits directly after the nearest calendar block',()=>{
  const nearest=html.indexOf('class="panel nearest-panel schedule-nearest"');
  const anniversary=html.indexOf('id="anniversaryCard"');
  const yearProgress=html.indexOf('class="year-progress schedule-year-progress"');
  assert.ok(nearest>=0&&anniversary>nearest&&yearProgress>anniversary);
  assert.match(html,/id="anniversaryTogether"/);
  assert.match(html,/id="anniversaryDays"/);
  assert.match(html,/id="anniversaryNext"/);
  assert.match(css,/\.anniversary-card/);
  assert.match(css,/\.anniversary-heart/);
});

test('anniversary duration is calculated dynamically in Moscow calendar state',()=>{
  assert.match(app,/function relationshipDuration\(start,parts,utc\)/);
  assert.match(app,/function renderAnniversary\(config\)/);
  assert.match(app,/renderAnniversary\(config\)/);
  assert.match(app,/До годовщины · /);

  const start=Date.UTC(2024,7,13);
  const now=Date.UTC(2026,8,22);
  assert.equal(Math.floor((now-start)/86400000),770);

  let years=2;
  const cursorAfterYears=Date.UTC(2026,7,13);
  let months=1;
  const cursor=Date.UTC(2026,8,13);
  const days=Math.floor((now-cursor)/86400000);
  assert.equal(years,2);
  assert.equal(months,1);
  assert.equal(days,9);
  assert.equal(Math.floor((Date.UTC(2027,7,13)-now)/86400000),325);
});
