const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v3.88 keeps storage migration isolated and removes retired messenger realtime',()=>{
  const strict=read('api/strict-runtime-cache.cjs');
  const auth=read('api/rudi-auth-db.cjs');
  const partner=read('api/partner-message.js');
  assert.match(strict,/createRudiStateClient/);
  assert.match(auth,/createRudiStateClient/);
  assert.doesNotMatch(partner,/rudi-db-api\.cpateammail\.workers\.dev/);
  assert.equal(fs.existsSync(path.join(root,'api/realtime.js')),false);
  assert.equal(fs.existsSync(path.join(root,'api/realtime-auth.cjs')),false);
});

test('v3.88 migration only switches after exact verification',()=>{
  const migration=read('api/d1-to-vercel-migration.cjs');
  assert.match(migration,/setPhase\(dest,'dual-write'/);
  assert.match(migration,/sourceHash===destHash/);
  assert.match(migration,/!missing\.length&&!extra\.length/);
  assert.match(migration,/setPhase\(dest,'ready'/);
  assert.match(migration,/critical\.browserAuth===2/);
});

test('v3.88 push and 21:00 Moscow habit reminder stay intact',()=>{
  const push=read('api/web-push.cjs');
  const sw=read('public/sw.js');
  const reminder=read('api/habit-reminder.cjs');
  const config=JSON.parse(read('vercel.json'));
  assert.match(push,/generateRequestDetails/);
  assert.match(push,/rudiPush: 1/);
  assert.match(sw,/direct\?\.rudiPush===1/);
  assert.match(reminder,/\['Рустам','Диана'\]/);
  assert.match(reminder,/tab=habits/);
  assert.ok(config.crons.some(row=>row.path==='/api/habit-reminder-cron'&&row.schedule==='0 18 * * *'));
});

test('v3.88 task form, recipes and task title rules remain correct',()=>{
  const css=read('public/app.css');
  const html=read('public/index.html');
  const app=read('public/app.js');
  const backend=read('api/partner-message.js');
  assert.match(css,/@media\(max-width:430px\)[\s\S]*\.ticktick-task-field-row\{grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)\}/);
  assert.match(html,/🔥 Духовка/);
  assert.match(html,/⏱️ 15 мин/);
  assert.match(app,/⏱️ Таймер/);
  assert.doesNotMatch(html,/ticktickTaskEmojiInput/);
  assert.doesNotMatch(app,/ticktickTaskEmojiInput/);
  assert.doesNotMatch(backend,/body\.emoji/);
});

test('v3.88 keeps deployment gate closed and Hobby function count valid',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.equal(config.git.deploymentEnabled,false);
  const functions=fs.readdirSync(path.join(root,'api')).filter(name=>name.endsWith('.js')).sort();
  assert.ok(functions.length<=12,'Serverless Functions: '+functions.length+'\n'+functions.join('\n'));
  assert.ok(config.rewrites.some(row=>row.source==='/api/stylist-leads-cron'&&row.destination.includes('/api/index')));
});
