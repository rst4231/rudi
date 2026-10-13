'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
 containsEnglishReport,mergeTranslation,translateNarrative,ensureRussianReport,pendingRussianReport
}=require('../api/personal-center-language.cjs');
const actor='Диана',date='2026-10-13',id='report:'+actor+':'+date+':morning',ns='rudi-personal-ai-v1';
const english={
 headline:'Daily report',overview:'Habit completion increased from 6 in September to 35 in October.',
 mainChange:'Habits grew from 6 to 35.',mainObservation:'Negative mood share climbed from 42% to 54%.',
 mainAction:'Write a 5-minute gratitude note tonight.',forecast:'Mood may improve over the next month.',
 focus:['Habit completion increased sharply.'],financeText:'',habitsText:'Habit progress improved.',
 taskText:'',trendText:'',connectionsText:'',
 lifeAreas:[{domain:'habits',observation:'Habit completion increased this month.',nextStep:'Record daily progress.'}],
 deepAnalysis:[{domain:'mood',evidence:'Negative mood rose from 42% to 54%.',
 analysis:'This pattern does not prove the cause.',nextStep:'Record how you feel.',
 verify:'Compare seven days.',caveat:'Limited observations.'}],confidence:'limited'
};
const russian={
 ...english,headline:'Личный обзор',overview:'Выполнение привычек выросло с 6 в сентябре до 35 в октябре.',
 mainChange:'Число отметок привычек выросло с 6 до 35.',
 mainObservation:'Доля негативных эмоций выросла с 42% до 54%.',
 mainAction:'Сегодня вечером потрать 5 минут на запись благодарностей.',
 forecast:'В течение месяца показатель может измениться.',
 focus:['Количество отмеченных привычек увеличилось.'],habitsText:'Прогресс по привычкам улучшился.',
 lifeAreas:[{domain:'habits',observation:'В этом месяце стало больше отметок привычек.',nextStep:'Отмечай результаты каждый день.'}],
 deepAnalysis:[{domain:'mood',evidence:'Доля негативных эмоций выросла с 42% до 54%.',
 analysis:'Эта связь не доказывает причину.',nextStep:'Записывай самочувствие.',
 verify:'Сравни данные за семь дней.',caveat:'Наблюдений пока немного.'}]
};
function memory(){
 const entries=new Map(),key=(n,k)=>n+':'+k;
 entries.set(key(ns,id),{id,createdAt:'2026-10-13T05:00:00Z',date,slot:'morning',model:'openai/gpt-oss-20b',narrative:english,observations:{habits:{count:35}}});
 entries.set(key(ns,'latest:'+actor),entries.get(key(ns,id)));
 return{
 entries,key,
 async getRecord(n,k){return entries.has(key(n,k))?{value:entries.get(key(n,k))}:null},
 async set(n,k,value){entries.set(key(n,k),value);return true},
 async setIfAbsent(n,k,value){if(entries.has(key(n,k)))return false;entries.set(key(n,k),value);return true},
 async remove(n,k){entries.delete(key(n,k));return true}
 };
}
test('detects English in human-facing narrative, ignores structural JSON domains',()=>{
 assert.equal(containsEnglishReport(english),true);
 assert.equal(containsEnglishReport(russian),false);
 assert.equal(containsEnglishReport({...russian,mainAction:'Short guided habit feedback for this morning.'}),true);
 assert.equal(containsEnglishReport({...russian,headline:'AI',overview:'Сегодня важны твои привычки.'}),false);
});
test('translation preserves structural keys and rejects an English or malformed result',()=>{
 const result=mergeTranslation(english,russian);
 assert.equal(result.lifeAreas[0].domain,'habits');
 assert.equal(result.deepAnalysis[0].domain,'mood');
 assert.equal(result.confidence,'limited');
 assert.equal(result.mainObservation,'Доля негативных эмоций выросла с 42% до 54%.');
 assert.throws(()=>mergeTranslation(english,english),/english-translation-output/);
 assert.throws(()=>mergeTranslation(english,{...russian,deepAnalysis:[]}),/invalid-russian-translation/);
});
test('stored English report is translated once for Diana in place, keeping facts and history',async()=>{
 const client=memory();let providerCalls=0;
 const fetchImpl=async(url,options)=>{
  providerCalls++;
  assert.match(url,/groq/);
  const body=JSON.parse(options.body);
  assert.match(body.messages[0].content,/на русский язык/);
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(russian)}}]})};
 };
 const original=(await client.getRecord(ns,id)).value;
 const updated=await ensureRussianReport(actor,original,{client,env:{GROQ_API_KEY:'mock-key'},fetchImpl});
 assert.equal(containsEnglishReport(updated.narrative),false);
 assert.equal(updated.id,id);
 assert.equal(updated.createdAt,original.createdAt);
 assert.deepEqual(updated.observations,original.observations);
 assert.equal((await client.getRecord(ns,'latest:'+actor)).value.narrative.overview,russian.overview);
 assert.equal((await client.getRecord(ns,id)).value.language,'ru');
 assert.equal(providerCalls,1);
 await ensureRussianReport(actor,updated,{client,env:{GROQ_API_KEY:'mock-key'},fetchImpl});
 assert.equal(providerCalls,1);
});
test('failed translation shows Russian temporary message without corrupting stored English report',async()=>{
 const client=memory(),original=(await client.getRecord(ns,id)).value;
 const result=await ensureRussianReport(actor,original,{client,env:{}});
 assert.equal(result.translationPending,true);
 assert.equal(containsEnglishReport(result.narrative),false);
 assert.equal((await client.getRecord(ns,id)).value.narrative.overview,english.overview);
 const retry=await ensureRussianReport(actor,original,{client,env:{}});
 assert.equal(retry.translationPending,true);
});
test('translation endpoint loads in background only for a legacy report',()=>{
 const handler=fs.readFileSync('api/personal-center-handler.cjs','utf8');
 const client=fs.readFileSync('public/personal-center.js','utf8');
 const generator=fs.readFileSync('api/personal-center-ai.cjs','utf8');
 assert.match(handler,/operation==='translate-report'/);
 assert.match(handler,/pendingRussianReport\(latest\)/);
 assert.match(client,/repairEnglishReportInBackground/);
 assert.match(client,/call\('translate-report'\)/);
 assert.match(generator,/отвечай исключительно по-русски/i);
 assert.match(generator,/containsEnglishReport\(narrative\)/);
});
