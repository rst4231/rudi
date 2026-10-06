const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v4.12 fine tunes vertical profile badge placement',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/\.profile \.avatar-mood-badge\{[\s\S]*bottom:-10px!important;/);
  assert.match(css,/\.profile-person-card \.score-sticker\{[\s\S]*top:-14px!important;/);
  assert.match(css,/@media\(max-width:430px\)\{[\s\S]*\.profile-person-card \.score-sticker\{top:-13px!important;bottom:auto!important\}/);
});
