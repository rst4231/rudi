const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
const start=source.indexOf('      function dianaCycleStatus('),end=source.indexOf('      let dianaRhythmCycleModel',start);
const rhythmStart=source.indexOf('      function profileRhythmAdvice('),rhythmEnd=source.indexOf('      function dianaRhythmRecommendation(',rhythmStart);
const ctx={currentActor:'Рустам'};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+source.slice(rhythmStart,rhythmEnd),ctx);
test('partner rhythm uses the person’s name while own rhythm keeps its familiar copy',()=>{
 assert.equal(ctx.profileRhythmAdvice('Диана','отдыхать и не ставить сложные задачи'),'Диане сейчас лучше отдыхать и не ставить сложные задачи');
 assert.equal(ctx.profileRhythmAdvice('Рустам','поужинать и отдохнуть'),'Лучше сейчас: поужинать и отдохнуть');
 ctx.currentActor='Диана';assert.equal(ctx.profileRhythmAdvice('Рустам','поужинать и отдохнуть'),'Рустаму сейчас лучше поужинать и отдохнуть');ctx.currentActor='Рустам';
 assert.match(ctx.profileRhythmAdvice('Диана','подходящее окно для прогулки или физической активности'),/^Диане сейчас лучше выбрать прогулку/);
});
test('every cycle phase has copy addressed to the partner, and own cycle copy is preserved',()=>{
 const cases=[{phase:'Месячные',periodDay:1},{phase:'Месячные',periodDay:4},{phase:'Фолликулярная фаза',cycleDay:6,periodLength:5},{phase:'Фолликулярная фаза',cycleDay:10,ovulationDay:16},{phase:'Фолликулярная фаза',cycleDay:14,ovulationDay:16},{phase:'Фертильное окно',cycleDay:16,ovulationDay:16},{phase:'Фертильное окно',cycleDay:15,ovulationDay:16},...[1,4,8,12].map(daysToNext=>({phase:'Лютеиновая фаза',daysToNext}))];
 for(const model of cases)for(const fn of ['dianaCycleDailyAdvice','dianaCycleBrainNote','dianaCycleAppetiteNote']){
  const text=ctx[fn](model,true);assert.match(text,/Диан/);assert.doesNotMatch(text,/(?:^|\s)(?:вам|вас|вы|ваше|своё|свой)(?:\s|[.,:;!?])/iu);
 }
 assert.match(ctx.dianaCycleDailyAdvice({phase:'Месячные'},false),/Если чувствуете усталость/);
 assert.match(ctx.dianaCycleDailyAdvice({phase:'Месячные'},true),/Если Диана чувствует усталость/);
 for(const daysToNext of [0,-2])assert.match(ctx.dianaCycleDailyAdvice({daysToNext},true),/Диан/);
});
