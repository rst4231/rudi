const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('Diana has a visible rhythm recommendation row like Rustam',()=>{
  assert.match(app,/dianaRhythmAdvice\.id='dianaRhythmAdvice'/);
  assert.match(app,/dianaRhythmAdvice\.className='rhythm-advice diana-rhythm-advice'/);
  assert.match(app,/dianaRhythmAdvice\.textContent=dianaRecommendation\?'Лучше сейчас: '\+dianaRecommendation:''/);
  assert.match(app,/dianaCard\.details\.appendChild\(dianaRhythmAdvice\)/);
});

test('Diana recommendation refreshes together with her rhythm and cycle',()=>{
  assert.match(app,/function syncDianaRhythmStatus\([\s\S]*?document\.getElementById\('dianaRhythmAdvice'\)[\s\S]*?advice\.textContent=recommendation\?'Лучше сейчас: '\+recommendation:''/);
});

test('Rustam and Diana rhythm advice share the same visual style',()=>{
  assert.match(app,/rhythmAdvice\.className='rhythm-advice rustam-rhythm-advice'/);
  assert.match(app,/dianaRhythmAdvice\.className='rhythm-advice diana-rhythm-advice'/);
  assert.match(css,/\.profile-person-card \.rhythm-advice\{[\s\S]*?padding:8px 10px;[\s\S]*?border-radius:12px;[\s\S]*?font-size:9\.5px;/);
});

test('Diana rhythm advice is inserted before supplement block creation',()=>{
  const adviceIndex=app.indexOf("dianaCard.details.appendChild(dianaRhythmAdvice)");
  const supplementsIndex=app.indexOf("const makeSupplementIntakeBlock=(actor)=>");
  assert.ok(adviceIndex>=0);
  assert.ok(supplementsIndex>adviceIndex);
});
