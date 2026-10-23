'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('changing mood saves the emotion and activity without awarding stars',()=>{
 const api=source('api/partner-message.js');
 const start=api.indexOf("if (action === 'mood') {");
 const end=api.indexOf("} else if (operation === 'reason')",start);
 assert.ok(start>=0&&end>start);
 const set=api.slice(start,end);
 assert.match(set,/setDailyMood\(date, actor, body\.mood/);
 assert.match(set,/sendMoodNotificationToPartner/);
 assert.match(set,/recordActivity/);
 assert.doesNotMatch(set,/awardScoreSafe|score:mood:|moodScoreWindow/);
 assert.match(api,/awardScoreSafe\(actor,1,\{\s*label:'Послание'/);
});
test('stars rules no longer promise a reward for selecting mood',()=>{
 const app=source('public/app.js');
 assert.doesNotMatch(app,/Отметил настроение<small>Утром, днём или вечером/);
 assert.match(app,/Выполнил привычку/);
});
