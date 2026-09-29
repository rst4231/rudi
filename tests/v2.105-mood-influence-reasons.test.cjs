const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v2.105 mood influence reasons are stored and used by analyzer',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const store=fs.readFileSync('api/daily-mood-store.cjs','utf8');
  const history=fs.readFileSync('public/mood-history.js','utf8');
  const ai=fs.readFileSync('api/mood-analysis-ai.cjs','utf8');
  const backend=fs.readFileSync('api/partner-message.js','utf8');
  const html=fs.readFileSync('public/index.html','utf8');

  assert.match(app,/Что повлияло\?/);
  for(const key of ['work','food','relationship','money','health','sport','sleep']) assert.match(app,new RegExp("'"+key+"'"));
  assert.match(store,/ALLOWED_REASONS=new Set\(\[[^\]]*'food'/);
  assert.match(history,/food:'Еда'/);
  assert.match(history,/sport:'Спорт'/);
  assert.match(ai,/food:'еда'/);
  assert.match(ai,/sport:'спорт'/);
  assert.match(backend,/food:'еда'/);
  assert.match(backend,/sport:'спорт'/);
  assert.match(backend,/for\(const sample of Array\.isArray\(row\?\.samples\)\?row\.samples:\[\]\)/);
  assert.match(html,/app\.js\?v=2\.105/);
  assert.match(html,/mood-reason-v2105\.css\?v=2\.105/);
});
