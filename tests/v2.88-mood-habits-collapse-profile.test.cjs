const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const mood=read('api/daily-mood-store.cjs'),partner=read('api/partner-message.js'),habits=read('api/habit-rules.cjs'),profile=read('public/profile-supplements.js'),app=read('public/app.js'),score=read('api/score-store.cjs'),supp=read('api/supplements.js'),html=read('public/index.html');
test('mood Neon and history',()=>{assert.match(mood,/readAppState/);assert.match(mood,/legacyCache\(options\)\.get\(STATE_KEY\)/);assert.match(partner,/operation === 'history'/);assert.match(partner,/operation === 'analyze'/);assert.match(partner,/cycleViewForDate/)});
test('habit reward 0.1',()=>{assert.match(habits,/HABIT_REWARD_UNITS=1/);assert.doesNotMatch(profile,/\+0,05 ⭐/);assert.match(profile,/\+0,1 ⭐/)});
test('personal page disabled',()=>{assert.doesNotMatch(profile,/loadDailyRecommendation\(/);assert.doesNotMatch(supp,/operation==='recommendation'/);assert.doesNotMatch(profile,/name\.addEventListener\('click',open\)/)});
test('safe collapse taps',()=>{assert.match(app,/collapseTapIgnored/);assert.match(profile,/interactiveTap/);assert.match(app,/key!=='partner'/)});
test('gift grammar',()=>{assert.match(app,/Подарите '\+actorDativeName\(partner\)/);assert.match(score,/Подарок от '\+actorGenitive\(from\)/)});
test('history UI',()=>{assert.match(html,/moodHistoryButton/);assert.match(html,/mood-history\.js\?v=2\.89/)});
