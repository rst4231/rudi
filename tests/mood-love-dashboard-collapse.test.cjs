const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setDailyMood}=require('../api/daily-mood-store.cjs');
const {moodNotificationText}=require('../api/partner-message.js');

test('love mood is accepted and persisted by daily mood store',async()=>{
  const data=new Map();
  const cache={
    async get(key){return data.get(key)??null},
    async set(key,value){data.set(key,value);return true},
  };
  const row=await setDailyMood('2026-09-22','Рустам','love',{
    moodCache:cache,
    now:Date.parse('2026-09-22T20:00:00.000Z'),
  });
  assert.equal(row.moods['Рустам'].mood,'love');
  assert.match(moodNotificationText('Диана','Рустам','love'),/^🥰 /);
});

test('love mood is present in UI and dashboard supports safe tap collapse',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(html,/data-mood="love"[^>]*>[\s\S]*?🥰/);
  assert.match(html,/data-partner-mood="love"[^>]*>[\s\S]*?🥰/);
  assert.match(app,/love:'🥰'/);
  assert.match(app,/selector:'#homeDashboard',key:'dashboard'/);
  assert.match(app,/tapToToggle:true/);
  assert.match(app,/target\.closest\('button,a,input,textarea,select,label,\[role="button"\],\[contenteditable="true"\],\.home-order-controls'\)/);
});
