const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');

test('v2.140 app icon badge includes habit and supplement reminder badges',()=>{
  const source=fs.readFileSync(path.join(root,'public','app-badge-extras.js'),'utf8');
  assert.match(source,/#habitHomeTile \.personal-home-reminder-badge/);
  assert.match(source,/#supplementsHomeTile \.personal-home-reminder-badge/);
  assert.match(source,/setAppBadge/);
  assert.match(source,/clearAppBadge/);
});

test('legacy pwa badge sync cannot overwrite the unified count',()=>{
  const source=fs.readFileSync(path.join(root,'public','pwa-extras.js'),'utf8');
  const start=source.indexOf('function installBadgeSync()');
  assert.ok(start>=0);
  const next=source.indexOf('\n  function ',start+10);
  const body=source.slice(start,next>start?next:undefined);
  assert.doesNotMatch(body,/navigator\.setAppBadge|navigator\.clearAppBadge/);
});

test('habit Telegram reminder cron is fully removed',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.equal(fs.existsSync(path.join(root,'api','habit-reminder-cron.js')),false);
  assert.equal(Boolean(config.functions?.['api/habit-reminder-cron.js']),false);
  assert.equal((config.crons||[]).some(item=>item.path==='/api/habit-reminder-cron'),false);
  const store=fs.readFileSync(path.join(root,'api','habit-tracker-store.cjs'),'utf8');
  assert.doesNotMatch(store,/markHabitReminderSent|remindedDates/);
});