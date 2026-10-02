const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const partner=fs.readFileSync('api/partner-message.js','utf8');
const push=fs.readFileSync('api/web-push.cjs','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const mood=fs.readFileSync('public/mood-history.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('messenger push uses a unique tag per message',()=>{
  assert.match(partner,/const pushTag=id\?'rudi-messenger:'\+id:'rudi-messenger'/);
  assert.match(partner,/tag:pushTag/);
});

test('deleting a messenger message sends a dismiss command to the partner',()=>{
  assert.match(partner,/async function dismissMessengerNotificationForPartner/);
  assert.match(partner,/kind:'dismiss'/);
  assert.match(partner,/tag:'rudi-messenger:'\+id/);
  assert.match(partner,/pushDismiss=await dismissMessengerNotificationForPartner\(actor,body\.id,options\)/);
});

test('dismiss notification replaces matching pending push before delivery',()=>{
  assert.match(push,/kind: String\(value\.kind \|\| 'show'\) === 'dismiss' \? 'dismiss' : 'show'/);
  assert.match(push,/if \(row\.kind !== 'dismiss'\) return true/);
  assert.match(push,/return item\.tag !== row\.tag && item\.url !== row\.url/);
});

test('service worker closes matching iPhone notifications for dismiss commands',()=>{
  assert.match(sw,/notificationKind==='dismiss'/);
  assert.match(sw,/self\.registration\.getNotifications\(\)/);
  assert.match(sw,/notification\.close\(\)/);
  assert.match(sw,/RUDI_PUSH_DISMISSED/);
});

test('mood factor stats mark positive influences from positive-vs-negative counts',()=>{
  assert.match(mood,/const positive=\(Number\(moods\.joy\|\|0\)\+Number\(moods\.love\|\|0\)\)/);
  assert.match(mood,/const negative=\(Number\(moods\.fatigue\|\|0\)\+Number\(moods\.sadness\|\|0\)\+Number\(moods\.boredom\|\|0\)\+Number\(moods\.anger\|\|0\)\)/);
  assert.match(mood,/item\.className='mood-factor-item'\+\(isPositive\?' is-positive':''\)/);
});

test('mood factor stats stay compact on iPhone',()=>{
  assert.match(css,/\.mood-factor-item\.is-positive/);
  assert.match(css,/@media\(max-width:430px\)\{[\s\S]*?\.mood-factor-list\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
