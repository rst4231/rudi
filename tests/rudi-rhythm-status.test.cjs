const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');

function loadRhythmStatus(){
  const start=app.indexOf('function rustamRhythmStatus(');
  const end=app.indexOf('function syncRustamRhythmStatus(',start);
  assert.ok(start>=0&&end>start,'rhythm helper must exist');
  const source=app.slice(start,end);
  const context={Intl,Date,TZ:'Europe/Moscow'};
  vm.createContext(context);
  vm.runInContext(source,context);
  return context.rustamRhythmStatus;
}

test('Rustam rhythm status follows the configured Moscow schedule',()=>{
  const status=loadRhythmStatus();
  const at=(utc)=>status(new Date(utc));
  assert.equal(at('2026-09-24T03:45:00Z'),'Старт');
  assert.equal(at('2026-09-24T04:30:00Z'),'Разгон');
  assert.equal(at('2026-09-24T06:00:00Z'),'Пик');
  assert.equal(at('2026-09-24T08:45:00Z'),'Пауза');
  assert.equal(at('2026-09-24T10:00:00Z'),'Темп');
  assert.equal(at('2026-09-24T12:30:00Z'),'Спад');
  assert.equal(at('2026-09-24T14:30:00Z'),'Движ');
  assert.equal(at('2026-09-24T16:30:00Z'),'Выдох');
  assert.equal(at('2026-09-24T18:00:00Z'),'Чилл');
  assert.equal(at('2026-09-24T19:45:00Z'),'Тише');
  assert.equal(at('2026-09-24T21:00:00Z'),'Сон');
  assert.equal(at('2026-09-24T03:00:00Z'),'Сон');
});

test('Rustam rhythm renders as a separate line beneath work status',()=>{
  const start=app.indexOf("const partnerStatus=document.createElement('div');");
  const end=app.indexOf("const dianaPerson=currentActor==='Диана'?selfPerson:partnerPerson;",start);
  assert.ok(start>=0&&end>start);
  const setup=app.slice(start,end);
  assert.match(setup,/rustamRhythm\.id='rustamRhythmStatus'/);
  assert.match(setup,/rustamRhythm\.className='profile-rhythm-status'/);
  assert.match(setup,/rustamPerson\.appendChild\(rustamRhythm\)/);
  assert.match(app,/syncRustamRhythmStatus\(\);/);
  assert.match(css,/\.profile-person-card \.profile-rhythm-status\{/);
});


test('Rustam rhythm recommendation tells what to do now',()=>{
  const start=app.indexOf('function rustamRhythmRecommendation(');
  const end=app.indexOf('function syncRustamRhythmStatus(',start);
  assert.ok(start>=0&&end>start,'recommendation helper must exist');
  const context={};
  vm.createContext(context);
  vm.runInContext(app.slice(start,end),context);
  const recommendation=context.rustamRhythmRecommendation;
  assert.equal(recommendation('Пик'),'делать самую сложную работу и принимать решения');
  assert.equal(recommendation('Спад'),'переключиться на простые дела и сделать перерыв');
  assert.equal(recommendation('Сон'),'спать и восстанавливаться');
  for(const status of ['Старт','Разгон','Пик','Пауза','Темп','Спад','Движ','Выдох','Чилл','Тише','Сон']){
    assert.ok(recommendation(status),status+' must have a recommendation');
  }
  assert.match(app,/rustamRhythmAdvice/);
  assert.match(app,/Сейчас лучше:/);
  assert.match(css,/\.profile-rustam-card \.rustam-rhythm-advice\{/);
});
