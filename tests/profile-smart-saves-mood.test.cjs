const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');

test('smart saves only append delete control for the current actor',()=>{
  assert.match(source,/const ownSave=String\(item\?\.actor\|\|''\)===String\(currentActor\|\|''\);/);
  assert.match(source,/card\.appendChild\(body\);if\(ownSave\)\{/);
  assert.doesNotMatch(source,/del\.hidden=!ownSave/);
});

test('partner mood tap exposes the latest selected or custom reason',()=>{
  assert.match(source,/function partnerMoodReasonText\(entry\)/);
  assert.match(source,/reason==='other'.*reasonText/s);
  assert.match(source,/function showPartnerMoodReason\(holder\)/);
  assert.match(source,/holder\.dataset\.moodReasonText/);
  assert.match(source,/partnerMoodValue.*moodReasonBound/s);
  assert.match(source,/renderPartnerMood\(partnerMood,String\(payload\?\.partner\|\|''\),payload\?\.partnerMood\)/);
});
