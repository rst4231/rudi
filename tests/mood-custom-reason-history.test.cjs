const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('custom mood reason text survives history merge and is rendered',()=>{
  const backend=fs.readFileSync('api/partner-message.js','utf8');
  const history=fs.readFileSync('public/mood-history.js','utf8');

  assert.match(
    backend,
    /reason:String\(row\?\.reason\|\|''\),reasonText:String\(row\?\.reasonText\|\|''\)/
  );
  assert.match(
    history,
    /sample\?\.reason==='other'&&custom\?custom:/
  );
});
