const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');

test('quick access is normalized directly after Lulu',()=>{
  assert.match(js,/\['dashboard',\.\.\.people,'lulu','quick-access','nearest'/);
  assert.match(js,/function migrateQuickAccessAfterLuluOnce\(order\)/);
  assert.match(js,/source\.splice\(luluIndex\+1,0,'quick-access'\)/);
});

test('foreign smart saves do not render a delete cross',()=>{
  assert.match(js,/const ownSave=String\(item\?\.actor\|\|''\)===String\(currentActor\|\|''\);/);
  assert.match(js,/if\(ownSave\)\{[\s\S]*?smart-save-delete[\s\S]*?card\.append\(body,del\)/);
  assert.doesNotMatch(js,/del\.hidden=!ownSave/);
});

test('partner mood tap shows stored selected or custom reason',()=>{
  assert.match(js,/function partnerMoodReasonText\(entry\)/);
  assert.match(js,/reason==='other'.*reasonText/s);
  assert.match(js,/function showPartnerMoodReason\(holder\)/);
  assert.match(js,/holder\.addEventListener\('click',[\s\S]*?showPartnerMoodReason\(holder\)/);
  assert.match(js,/renderPartnerMood\(partnerMood,String\(payload\?\.partner\|\|''\),payload\?\.partnerMood\)/);
  assert.match(css,/\.partner-mood-reason-popover/);
});
