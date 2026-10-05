const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('v3.85 changed JavaScript parses',()=>{
  for(const file of [
    'public/app.js',
    'api/partner-message.js',
    'api/ticktick-client.cjs',
    'api/habit-reminder.cjs',
    'cloudflare/rudi-db-api/worker.js',
  ]){
    const source=read(file);
    if(file==='cloudflare/rudi-db-api/worker.js'){
      assert.match(source,/payload:body\?\.payload/);
      continue;
    }
    assert.doesNotThrow(()=>new Function(source),file);
  }
});

test('v3.85 task responsibility and stars are protected',()=>{
  const app=read('public/app.js');
  const api=read('api/partner-message.js');
  const tick=read('api/ticktick-client.cjs');
  assert.match(app,/Ответственные Рустам и Диана/);
  assert.match(app,/incomingVersion>=currentVersion/);
  assert.match(app,/acceptScoreState\(payload\.score\)/);
  assert.match(api,/responsible==='Рустам'\?'RST':'Ди'/);
  assert.match(tick,/assigneeUsername/);
});

test('v3.85 habit reminder runs at 21:00 Moscow and opens habits',()=>{
  const cron=read('api/habit-reminder.cjs');
  const vercel=JSON.parse(read('vercel.json'));
  assert.match(cron,/viewHabits/);
  assert.match(cron,/pending/);
  assert.match(cron,/\?tab=habits&fresh=1/);
  assert.ok(vercel.crons.some(row=>row.path==='/api/habit-reminder-cron'&&row.schedule==='0 18 * * *'));
});

test('v3.85 add button uses geometric centered plus',()=>{
  const css=read('public/app.css');
  assert.match(css,/\.ticktick-add-button::before,.ticktick-add-button::after/);
  assert.match(css,/transform:translate\(-50%,-50%\)/);
});
