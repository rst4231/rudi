const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/messenger.css','utf8');
const client=fs.readFileSync('public/messenger.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const api=fs.readFileSync('api/partner-message.js','utf8');

test('emoji tray is compact and has an expanded palette',()=>{
  const matches=[...html.matchAll(/data-emoji="/g)];
  assert.ok(matches.length>=30);
  assert.match(css,/\.messenger-emoji-tray\{[\s\S]*?height:43px;[\s\S]*?overflow-x:auto;[\s\S]*?overflow-y:hidden/);
  assert.doesNotMatch(css,/\.messenger-emoji-tray\{[\s\S]*?min-height:48vh/);
});

test('iPhone messenger follows visual viewport without sticky layout jumps',()=>{
  assert.match(css,/\.messenger-page\{[\s\S]*?position:fixed;[\s\S]*?height:var\(--messenger-viewport-height,100dvh\)/);
  assert.match(css,/top:var\(--messenger-viewport-top,0px\)/);
  assert.match(css,/\.messenger-messages\{[\s\S]*?grid-row:3;[\s\S]*?min-height:0;[\s\S]*?max-height:none/);
  assert.match(css,/\.messenger-composer-wrap\{[\s\S]*?grid-row:4;[\s\S]*?position:relative/);
  assert.match(client,/visualViewport/);
  assert.match(client,/--messenger-viewport-height/);
  assert.match(client,/--messenger-viewport-top/);
});

test('completed shared task uses partner-only app push',()=>{
  assert.match(api,/title:'✅ Партнёр выполнил совместную задачу'/);
  assert.match(api,/tag:'shared-task-complete'/);
  assert.match(api,/url:'\/\?item=priority'/);
  const fn=api.match(/async function sendTaskCompletedNotificationToPartner[\s\S]*?\n\}/)?.[0]||'';
  assert.match(fn,/sendPushNotification/);
  assert.doesNotMatch(fn,/telegramSendMessage/);
});

test('completed checklist item uses partner-only app push',()=>{
  assert.match(api,/title:'☑️ Выполнен пункт внутри совместной задачи'/);
  assert.match(api,/tag:'shared-task-checklist-complete'/);
  assert.match(api,/sendChecklistCompletedNotificationToPartner/);
  assert.doesNotMatch(api,/sendActivityNotification\(\s*checklistCompletedNotificationText/);
});

test('cycle start uses app push to Rustam',()=>{
  const fn=api.match(/async function sendCycleStartNotificationToRustam[\s\S]*?\n\}/)?.[0]||'';
  assert.match(fn,/sendPush\('Рустам'/);
  assert.match(fn,/title:'🩸 Диана отметила начало месячных'/);
  assert.match(fn,/url:'\/\?tab=schedule&item=cycle'/);
  assert.doesNotMatch(fn,/telegramSendMessage/);
});

test('push deep links land on shared tasks and Diana cycle',()=>{
  assert.match(app,/priority:'\[data-home-tile="priority"\]'/);
  assert.match(app,/cycle:'#dianaCycleCard'/);
  assert.match(app,/focusDeepLinkedItem\('schedule',item\)/);
});
