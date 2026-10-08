const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const start=app.indexOf('const MOOD_REASON_META={'),end=app.indexOf('let partnerMoodReasonTimer=0;',start);
assert.ok(start>0&&end>start,'Reason formatter must exist');
const describe=vm.runInNewContext(app.slice(start,end)+';partnerMoodReasonText',{Date,Intl});
const CURRENT_RELEASE = require('node:fs').readFileSync(require('node:path').join(__dirname,'..','VERSION'),'utf8').trim();

test('reason label includes stored mood time in Moscow, not current time',()=>{
 const row={mood:'fatigue',updatedAt:'2026-10-08T07:24:00.000Z',samples:[{mood:'fatigue',reason:'work',updatedAt:'2026-10-08T07:24:00.000Z'}]};
 assert.equal(describe(row),'💼 Работа · 10:24');
});
test('when the current mood matches multiple records, use its latest actual timestamp',()=>{
 const row={mood:'joy',updatedAt:'2026-10-08T16:47:00.000Z',samples:[{mood:'joy',reason:'food',updatedAt:'2026-10-08T05:10:00.000Z'},{mood:'fatigue',reason:'sleep',updatedAt:'2026-10-08T10:04:00.000Z'},{mood:'joy',reason:'relationship',updatedAt:'2026-10-08T16:47:00.000Z'}]};
 assert.equal(describe(row),'❤️ Отношения · 19:47');
});
test('no valid timestamp means no invented time',()=>{
 assert.equal(describe({mood:'joy',samples:[{mood:'joy',reason:'food'}]}),'🍽️ Еда');
 assert.equal(describe({mood:'joy',updatedAt:'invalid',samples:[{mood:'joy',reason:'other',reasonText:'Прогулка',updatedAt:'invalid'}]}),'Прогулка');
});
test('release PWA uses correct version and cache',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const sw=fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8');
 assert.ok(html.includes('name="rudi-version" content="'+CURRENT_RELEASE+'"'));
 assert.ok(sw.includes("rudi-shell-"+CURRENT_RELEASE));
 assert.equal(fs.readFileSync(path.join(__dirname,'../VERSION'),'utf8').trim(),CURRENT_RELEASE);
});
