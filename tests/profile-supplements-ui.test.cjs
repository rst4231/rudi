const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('supplement UI updates generated description immediately',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');
  assert.match(source,/for\(let item of items\)/);
  assert.doesNotMatch(source,/for\(const item of items\)/);
  assert.match(source,/desc\.hidden=false;card\.classList\.add\('is-open'\);hint\.textContent='Скрыть описание'/);
});

test('supplement add button has visible loading and success states',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');
  assert.match(source,/add\.textContent='Добавляю…'/);
  assert.match(source,/add\.textContent='✓ Добавлено'/);
});

test('personal profile shows age, sex, daily Groq recommendation and supplement emoji',()=>{const source=fs.readFileSync(path.join(__dirname,'..','public','profile-supplements.js'),'utf8');assert.match(source,/ageText\(profile\.age\)\+' · '\+profile\.sexLabel/);assert.match(source,/request\('recommendation'\)/);assert.match(source,/emojiForSupplement/);assert.match(source,/🏋️/);assert.match(source,/🍵/);assert.match(source,/☀️/)});
