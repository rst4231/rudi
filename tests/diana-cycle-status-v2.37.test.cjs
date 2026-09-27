const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');

function extract(name,nextName){
  const start=app.indexOf('function '+name);
  const end=app.indexOf('\n      function '+nextName,start);
  assert.ok(start>=0&&end>start,name);
  return app.slice(start,end).trim();
}

test('Diana profile uses simplified cycle statuses',()=>{
  const statusSource=extract('dianaCycleStatus(modelOrPhase){','dianaCycleMoodWord');
  const profileSource=extract('dianaCycleProfileStatus(modelOrPhase){','dianaCycleDailyAdvice');
  const status=new Function('return ('+statusSource+')')();
  const cycleDateLabel=(ms)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(ms));
  const profile=new Function('dianaCycleMoodWord','cycleDateLabel','return ('+profileSource+')')(
    value=>status(value).label,
    cycleDateLabel
  );

  assert.equal(profile({phase:'Месячные',periodActive:true,periodEnd:Date.UTC(2026,8,30)}),'Месячные до 30 сентября');
  assert.equal(profile({phase:'Фолликулярная фаза',cycleDay:6,periodLength:5}),'Восстановление');
  assert.equal(profile({phase:'Фолликулярная фаза',cycleDay:10,periodLength:5}),'Энергии больше');
  assert.equal(profile({phase:'Фертильное окно',cycleDay:13,ovulationDay:14}),'Фертильные дни');
  assert.equal(profile({phase:'Фертильное окно',cycleDay:14,ovulationDay:14}),'Овуляция');
  assert.equal(profile({phase:'Лютеиновая фаза',daysToNext:4}),'Скоро месячные');
  assert.equal(profile({phase:'Лютеиновая фаза',daysToNext:9}),'Восстановление');
});

test('old vague Diana status words are absent from dianaCycleStatus',()=>{
  const block=extract('dianaCycleStatus(modelOrPhase){','dianaCycleMoodWord');
  for(const word of ['Уютная','Вдумчивая','Сияющая','Бодрая','Нежная','Спокойная','Чувствительная']){
    assert.equal(block.includes(word),false,word);
  }
});
