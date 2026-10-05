const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const appCss=fs.readFileSync('public/app.css','utf8');
const mood=fs.readFileSync('public/mood-history.js','utf8');
const moodCss=fs.readFileSync('public/mood-history-v2101.css','utf8');
const partner=fs.readFileSync('api/partner-message.js','utf8');

test('joy and love are always positive when dominant for a mood factor',()=>{
  assert.match(mood,/const isPositive=topMood==='joy'\|\|topMood==='love'\|\|\(positive>negative&&positive>0\)/);
});

test('mood percentage cards fit one row on iPhone',()=>{
  assert.match(moodCss,/@media\(max-width:430px\)\{[\s\S]*?\.mood-stats\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(moodCss,/\.mood-factor-stats,\.mood-stat-summary\{grid-column:1\/-1\}/);
});

test('cycle brain and appetite guidance changes inside phases',()=>{
  assert.match(app,/первые 1–2 дня у части женщин/);
  assert.match(app,/середине фолликулярной фазы/);
  assert.match(app,/ориентировочный день овуляции/);
  assert.match(app,/за 1–2 дня до месячных/);
  assert.match(app,/ранней лютеиновой фазе/);
});

test('cycle brain and appetite cards use white text',()=>{
  assert.match(appCss,/\.cycle-insight-card span\{color:#fff/);
  assert.match(appCss,/\.cycle-insight-card strong\{color:#fff/);
});

test('star gift Telegram message uses correct names, dative case and declension',()=>{
  assert.match(partner,/const toDative=to==='Диана'\?'Диане':to==='Рустам'\?'Рустаму':to/);
  assert.match(partner,/escapeTelegramHtml\(from\+' '\+verb\+' '\+toDative\+' '\+points\+' '\+starGiftWord\(points\)\)/);
  assert.match(partner,/if\(mod10===1\) return 'звезду'/);
  assert.match(partner,/if\(mod10>=2&&mod10<=4\) return 'звезды'/);
  assert.match(partner,/return 'звёзд'/);
});

test('star gift event goes to Telegram and does not create a chat event',()=>{
  const start=partner.indexOf('async function sendStarGiftNotification');
  const end=partner.indexOf('async function sendCycleStartNotificationToRustam',start);
  const block=partner.slice(start,end);
  assert.match(block,/sendToAllRecipients\(text,options\)/);
  assert.doesNotMatch(block,/sendPush\(|addMessengerMessage|systemRecipients|tab=messenger/);
});
