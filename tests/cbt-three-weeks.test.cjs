'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../public/cbt-content.js'),C=require('../public/cbt-core.js');
test('first week follows fact, emotion with intensity, thought with belief',()=>{
 for(const d of D.days.slice(0,7))assert.deepEqual(d.fields.map(f=>f.key),['situation','emotions','emotionIntensity','thought','beliefBefore']);
 assert.equal(D.days[0].fields[2].max,10);assert.equal(D.days[0].fields[4].max,100);
});
test('second week checks interpretations in writing; third practices orally in the moment',()=>{
 for(const d of D.days.slice(7,14)){for(const key of ['situation','thought','reaction','evidenceFor','evidenceAgainst','alternative','beliefBefore','beliefAfter'])assert.ok(d.fields.some(f=>f.key===key));assert.equal(d.practice,'written')}
 for(const d of D.days.slice(14)){assert.equal(d.practice,'oral');assert.match(d.prompt,/устно/i);assert.ok(d.fields.some(f=>f.key==='verbalReview'));assert.ok(!d.fields.some(f=>['action','prediction','actionDone','actual'].includes(f.key)))}
});
test('every legacy field still accepts queued edits without losing the cycle or other answers',()=>{
 for(const old of D.legacyDays){for(const f of old.fields){const initial={schema:1,runs:[{id:'existing',status:'active',startedAt:'2026-11-04T10:00:00Z',contentVersion:1,days:{[old.day]:{answers:{thought:'Старая мысль',action:'Старое действие'},entries:[{id:'another',answers:{thought:'Ещё запись'},savedAt:'2026-11-04T11:00:00Z'}],versions:[{answers:{thought:'Ранний вариант'}}]}},applied:[]}]};const value=f.type==='range'?0:f.type==='emotions'?['Тревога']:f.type==='check'?true:'Обновлено';const s=C.apply(initial,{id:'queued',type:'edit',cycleId:'existing',day:old.day,patch:{[f.key]:value},base:{[f.key]:initial.runs[0].days[old.day].answers[f.key]??''}},'2026-11-04T12:00:00Z');const r=s.runs[0];assert.equal(r.id,'existing');assert.equal(r.contentVersion,1);assert.equal(r.startedAt,initial.runs[0].startedAt);assert.equal(r.days[old.day].entries[0].answers.thought,'Ещё запись');assert.deepEqual(r.days[old.day].versions,initial.runs[0].days[old.day].versions);if(f.key!=='action')assert.equal(r.days[old.day].answers.action,'Старое действие');assert.deepEqual(initial.runs[0].applied,[])}}
});

test('mixed old/new third-week answers can be archived and carried through conflict resolution atomically',()=>{
 const answers=Object.fromEntries(D.fieldsForDay(15).map(f=>[f.key,f.type==='range'?0:f.type==='emotions'?['Тревога']:f.type==='check'?true:'Сохранённый ответ']));assert.ok(Object.keys(answers).length>15);
 let s=C.apply(null,{id:'s',type:'start',cycleId:'same-cycle'},'2026-11-04T10:00:00Z');
 s=C.apply(s,{id:'edit-all',type:'edit',cycleId:'same-cycle',day:15,patch:answers,base:{}},'2026-11-04T12:00:00Z');
 s=C.apply(s,{id:'archive-all',type:'archive',cycleId:'same-cycle',day:15,patch:answers,base:{}},'2026-11-04T12:00:01Z');
 assert.deepEqual(s.runs[0].days[15].answers,answers);assert.deepEqual(s.runs[0].days[15].versions[0].answers,answers);assert.equal(s.runs[0].id,'same-cycle');
 assert.throws(()=>C.validate({id:'bad',type:'edit',cycleId:'same-cycle',day:15,patch:{...answers,admin:'no'}}),/cbt-invalid/);
});
test('AI reflection receives the actual weekly method instead of prescribing behavior experiments',async()=>{
 const {analyze}=require('../api/cbt-coach.cjs');
 for(const day of [1,8,15]){let sent;await analyze({day,answers:{thought:'Мысль'}},{env:{GROQ_API_KEY:'fixture-key'},fetchImpl:async(_url,opts)=>{sent=JSON.parse(opts.body);return{ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({pattern:'Наблюдение',trap:'',reason:'',check:'',alternative:'',step:'',question:''})}}]})}}});const input=JSON.parse(sent.messages[1].content);assert.equal(input.week,Math.ceil(day/7));assert.equal(input.answers.thought,'Мысль');assert.match(input.method,day===1?/0–100/:day===8?/Письменная/:/устно/)}
});
