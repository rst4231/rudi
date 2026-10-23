(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./cbt-content.js'));else root.RudiCbtCore=factory(root.RudiCbtContent)})(typeof window==='object'?window:globalThis,(content)=>{
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>JSON.stringify(a??'')===JSON.stringify(b??'');
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(v);
// Calendar dates use the cycle's timezone so other devices see the same boundary.
function zone(value){try{new Intl.DateTimeFormat('en',{timeZone:value}).format();return typeof value==='string'&&value.length<100}catch{return false}}
function dayKey(at,tz){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));const get=k=>parts.find(x=>x.type===k).value;return get('year')+'-'+get('month')+'-'+get('day')}
const addDate=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const distance=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
const boundaryCache=new Map();
function midnight(date,tz){const key=date+'|'+tz;if(boundaryCache.has(key))return boundaryCache.get(key);let low=Date.parse(date+'T00:00:00Z')-86400000,high=low+3*86400000;while(high-low>1){const m=Math.floor((low+high)/2);if(dayKey(m,tz)<date)low=m;else high=m}const result=new Date(high).toISOString();boundaryCache.set(key,result);return result}
function entries(row,includeDeleted=false){if(!row)return [];return [{...row,id:'initial',savedAt:Object.hasOwn(row,'savedAt')?row.savedAt:row.closedAt?null:row.completedAt||null},...(row.entries||[])].filter(e=>includeDeleted||!e.deletedAt)}
function canonicalEntryId(row,id='initial'){return row?.entryAliases&&Object.hasOwn(row.entryAliases,id)?row.entryAliases[id]:id||'initial'}
function entry(run,day,id='initial',includeDeleted=false){return entries(run?.days?.[day],includeDeleted).find(e=>e.id===canonicalEntryId(run?.days?.[day],id))||null}
function hasAnswers(answers){return Object.values(answers||{}).some(v=>typeof v==='number'&&Number.isFinite(v)||v===true||typeof v==='string'&&!!v.trim()||Array.isArray(v)&&v.some(x=>typeof x==='string'&&!!x.trim()))}
function reusableEntry(row,preferred){const drafts=entries(row).filter(e=>!e.savedAt);return drafts.find(e=>preferred&&e.id===canonicalEntryId(row,preferred))?.id||drafts.find(e=>hasAnswers(e.answers))?.id||drafts.at(-1)?.id||null}

function nextEntry(row){const list=entries(row);return list.filter(e=>!e.savedAt).at(-1)?.id||list.at(-1)?.id||'initial'}
function calendar(run,now=new Date().toISOString()){
 if(!run?.calendar)return null;
 const end=run.status==='interrupted'?run.interruptedAt||now:now,c=run.calendar;
 const elapsed=Math.max(0,Math.min(21,distance(c.startDate,dayKey(end,c.timeZone))));
 return {elapsed,current:Math.min(21,elapsed+1),timeZone:c.timeZone};
}
function refresh(state,now=new Date().toISOString()){
 const s=clone(state||empty());for(const r of s.runs){const c=calendar(r,now);if(!c)continue;
 for(let n=1;n<=c.elapsed;n++){const row=r.days[n]||{answers:{},savedAt:null,entries:[]};if(!Object.hasOwn(row,'savedAt'))row.savedAt=row.completedAt||null;row.closedAt=midnight(addDate(r.calendar.startDate,n),r.calendar.timeZone);row.completedAt=row.closedAt;r.days[n]=row}
 if(c.elapsed===21&&r.status==='active'){r.status='completed';r.completedAt=r.days[21].closedAt}
 }return s;
}
function active(s){return s?.runs?.find(r=>r.status==='active')||null}
function empty(){return {schema:1,runs:[]}}
function error(code,fields){const e=Error(code);e.fields=fields||[];throw e}
function filled(f,v){return f.type==='range'?Number.isFinite(v)&&v>=0&&v<=f.max:f.type==='check'?v===true:f.type==='emotions'?Array.isArray(v)&&v.length>0:typeof v==='string'&&!!v.trim()}
function missing(day,answers,format='full'){if(format==='quick')return [answers?.situation,answers?.thought].some(v=>typeof v==='string'&&v.trim())||Array.isArray(answers?.emotions)&&answers.emotions.length?[]:['thought'];return content.days[day-1].fields.filter(f=>f.required&&!filled(f,answers?.[f.key])).map(f=>f.key)}
function validate(op){
 if(!op||!validId(op.id)||!validId(op.cycleId)||!['start','schedule','new-entry','delete-entry','format','edit','complete','archive','coach','coach-check'].includes(op.type))error('cbt-invalid-operation');
 if(op.timeZone!==undefined&&!zone(op.timeZone))error('cbt-invalid-timezone');
 if(['start','schedule'].includes(op.type))return;
 if(op.entryId!==undefined&&!validId(op.entryId))error('cbt-invalid-entry');
 if(!Number.isInteger(op.day)||op.day<1||op.day>21)error('cbt-invalid-day');
 if(op.reuseDraft!==undefined&&typeof op.reuseDraft!=='boolean')error('cbt-invalid-entry');
 if(op.type==='new-entry'){if(!op.entryId||op.entryId==='initial')error('cbt-invalid-entry');return}
 if(op.type==='format'){if(!['quick','full'].includes(op.format))error('cbt-invalid-format');return}
 if(op.type==='coach'){
 const fields=['pattern','trap','reason','check','alternative','step','question'];
 if(!op.coach||typeof op.coach!=='object'||Array.isArray(op.coach)||!op.base||typeof op.base!=='object'||Array.isArray(op.base)||JSON.stringify(op.base).length>55000)error('cbt-invalid-coach');
 for(const key of fields)if(typeof op.coach[key]!=='string'||!op.coach[key].trim()||op.coach[key].length>900)error('cbt-invalid-coach');
 return;
}
if(op.type==='coach-check'){if(!['done','partial','not-done'].includes(op.outcome))error('cbt-invalid-coach-check');return}
if(op.type==='complete'||op.type==='delete-entry')return;
 if(!op.patch||Array.isArray(op.patch)||typeof op.patch!=='object'||!Object.keys(op.patch).length||Object.keys(op.patch).length>15)error('cbt-invalid-fields');
 const fields=[...content.days[op.day-1].fields,{key:'situation',type:'text'},{key:'thought',type:'text'},{key:'moodBefore',type:'range',max:10},{key:'moodAfter',type:'range',max:10},{key:'emotionIntensity',type:'range',max:10},{key:'emotions',type:'emotions'}];
 for(const [k,v]of Object.entries(op.patch)){
  const f=fields.find(x=>x.key===k);if(!f)error('cbt-invalid-field');
  if(f.type==='range'){if(v!==null&&(!Number.isFinite(v)||v<0||v>f.max||!Number.isInteger(v)))error('cbt-invalid-rating')}
  else if(f.type==='check'){if(typeof v!=='boolean')error('cbt-invalid-check')}
  else if(f.type==='emotions'){if(!Array.isArray(v)||v.length>12||v.some(x=>typeof x!=='string'||x.length>60))error('cbt-invalid-emotions')}
  else if(typeof v!=='string'||v.length>6000)error('cbt-invalid-text');
 }
}
function apply(state,op,now=new Date().toISOString(),local=false){
 validate(op);const s=refresh(state,now);
 let run=s.runs.find(r=>r.id===op.cycleId);
 if(op.type==='start'){
  if(run)return s;
  const current=active(s);if(!local&&(current?.id||null)!==(op.expectedActive||null))error('cbt-conflict-start');
  if(current){current.status='interrupted';current.interruptedAt=now}
  s.runs.push({id:op.cycleId,startedAt:now,status:'active',contentVersion:content.version,days:{},applied:[],...(op.timeZone?{calendar:{timeZone:op.timeZone,startDate:dayKey(now,op.timeZone)}}:{})});return s;
 }
 if(!run)error('cbt-run-missing');
 if(run.applied.includes(op.id))return s;
 if(run.status!=='active'&&!['archive','coach','coach-check'].includes(op.type)&&!local&&!(run.calendar&&run.status==='completed'&&now<run.completedAt))error('cbt-read-only');
 if(op.type==='schedule'){
  if(!run.calendar){for(const row of Object.values(run.days)){row.savedAt=row.completedAt||null;row.completedAt=null}run.calendar={timeZone:op.timeZone||'UTC',startDate:dayKey(run.startedAt||now,op.timeZone||'UTC')}}
  run.applied.push(op.id);return refresh(s,now);
 }
 const row=run.days[op.day]||{answers:{},startedAt:now,completedAt:null,updatedAt:now};
 if(!Object.hasOwn(row,'savedAt'))row.savedAt=row.closedAt?null:row.completedAt||null;
 const entryId=canonicalEntryId(row,op.entryId);
 if(op.type==='new-entry'){
  row.entries=row.entries||[];
  const reusable=op.reuseDraft?reusableEntry(row):null;
  const exists=entries(row,true).some(e=>e.id===entryId);
  if(reusable&&!exists){row.entryAliases={...(row.entryAliases||{}),[op.entryId]:reusable}}
  else if(!exists&&entryId!=='initial')row.entries.push({id:entryId,answers:{},startedAt:now,updatedAt:now,savedAt:null});
 }else{
  const target=entryId==='initial'?row:(row.entries||[]).find(e=>e.id===entryId);
  if(!target)error('cbt-entry-missing');
  if(['edit','format','complete'].includes(op.type)&&!target.startedAt&&!target.deletedAt)target.startedAt=now;
  if(op.type==='delete-entry'){
   if(!target.deletedAt){if(!local&&!same(target.answers,op.base||{}))error('cbt-conflict-delete',Object.keys(target.answers));target.deletedAt=now}
  }else if(target.deletedAt&&op.type!=='archive'&&!local)error('cbt-conflict-deleted',Object.keys(op.patch||{}));
  else if(op.type==='coach'){
     if(!local&&(!target.savedAt||!same(target.answers,op.base)))error('cbt-conflict-coach');
     target.coach={source:clone(op.base),result:clone(op.coach),createdAt:now};
     target.coachCheck=null;
    }
    else if(op.type==='coach-check'){
     if(!local&&(!target.coach||!same(target.coach.source,target.answers)||nextDay(run,now)<=op.day))error('cbt-conflict-coach-check');
     if(target.coach&&same(target.coach.source,target.answers))target.coachCheck={outcome:op.outcome,at:now};
    }
    else if(op.type==='format'){target.format=op.format;if(target.savedAt&&missing(op.day,target.answers,target.format).length)target.savedAt=null}
  else if(op.type==='archive')target.versions=[...(target.versions||[]),{id:op.id,at:now,answers:{...target.answers,...op.patch}}];
  else if(op.type==='edit'){
   const conflicts=Object.keys(op.patch).filter(k=>!same(target.answers[k],op.base?.[k])&&!same(target.answers[k],op.patch[k]));
   if(conflicts.length&&!local)error('cbt-conflict-fields',conflicts);
   target.answers={...target.answers,...op.patch};target.answerUpdatedAt=Date.parse(target.answerUpdatedAt)>Date.parse(now)?target.answerUpdatedAt:now;
   if(target.savedAt&&missing(op.day,target.answers,target.format).length)target.savedAt=null;
  }else if(!local&&missing(op.day,target.answers,target.format).length)error('cbt-incomplete',missing(op.day,target.answers,target.format));
  else target.savedAt=target.savedAt||now;
  target.updatedAt=now;
 }
 if(!run.calendar)row.completedAt=entries(row).some(e=>e.savedAt)?row.completedAt||now:null;
 row.updatedAt=now;run.days[op.day]=row;run.updatedAt=now;run.applied.push(op.id);
 run.applied=run.applied.slice(-1200);
 if(!run.calendar&&Object.values(run.days).filter(x=>x.completedAt).length===21){run.status='completed';run.completedAt=run.completedAt||now}
 return s;
}
function nextDay(run,now=new Date().toISOString()){if(run?.calendar)return calendar(run,now).current;const draft=Object.entries(run?.days||{}).filter(([,r])=>!r.completedAt).sort((a,b)=>String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)))[0];if(draft)return Number(draft[0]);for(let n=1;n<=21;n++)if(!run?.days[n]?.completedAt)return n;return 21}
function stats(run,week,now=new Date().toISOString()){
 const allDays=Object.entries(run?.days||{}).filter(([day])=>!week||Math.ceil(Number(day)/7)===week);
 const rows=allDays.flatMap(([day,r])=>entries(r).filter(e=>e.savedAt).map(e=>({day:Number(day),...e}))).sort((a,b)=>a.day-b.day);
 const cal=calendar(run,now),completed=cal?Array.from({length:cal.elapsed},(_,i)=>i+1).filter(n=>!week||Math.ceil(n/7)===week).length:allDays.filter(([,r])=>r.completedAt).length;
 const points=k=>{const grouped=new Map();for(const r of rows){if(typeof r.answers?.[k]!=='number')continue;const list=grouped.get(r.day)||[];list.push(r.answers[k]);grouped.set(r.day,list)}return [...grouped].map(([day,v])=>({day,value:Math.round(v.reduce((a,b)=>a+b,0)/v.length*10)/10}))};
 const paired=(a,b)=>rows.filter(r=>typeof r.answers?.[a]==='number'&&typeof r.answers?.[b]==='number');
 const mood=paired('moodBefore','moodAfter'),belief=paired('beliefBefore','beliefAfter');
 const avg=(a,fn)=>a.length?Math.round(a.reduce((s,r)=>s+fn(r),0)/a.length*10)/10:null;
 const counts={};for(const r of rows)for(const e of r.answers.emotions||[])counts[e]=(counts[e]||0)+1;
 return {completed,recordedDays:allDays.filter(([,r])=>entries(r).some(e=>hasAnswers(e.answers))).length,records:rows.length,exercises:rows.filter(r=>r.format!=='quick').length,percent:Math.round(completed/(week?7:21)*100),moodBefore:points('moodBefore'),moodAfter:points('moodAfter'),intensity:points('emotionIntensity'),beliefBefore:points('beliefBefore'),beliefAfter:points('beliefAfter'),moodPairs:mood.length,beliefPairs:belief.length,moodChange:avg(mood,r=>r.answers.moodAfter-r.answers.moodBefore),beliefChange:avg(belief,r=>r.answers.beliefAfter-r.answers.beliefBefore),emotions:Object.entries(counts).sort((a,b)=>b[1]-a[1]),actions:rows.filter(r=>r.answers.actionDone===true).length};
}
function report(run,week){const s=stats(run,week);const result=[`Завершено дней: ${s.completed} из ${week?7:21}.`,`Сохранено записей: ${s.records}.`,`Дней с записями: ${s.recordedDays}.`];if(s.moodPairs)result.push(`Среднее изменение настроения в ${s.moodPairs} записях с двумя оценками: ${s.moodChange>0?'+':''}${s.moodChange} из 10.`);if(s.beliefPairs)result.push(`Среднее изменение убеждённости в ${s.beliefPairs} разборах: ${s.beliefChange>0?'+':''}${s.beliefChange} п. п.`);if(s.emotions.length)result.push(`Чаще отмечалась эмоция: ${s.emotions[0][0]} (${s.emotions[0][1]}).`);if(s.actions)result.push(`Выполнено практических действий: ${s.actions}.`);if(s.records<2)result.push('Данных пока недостаточно для оценки динамики.');result.push('Эти записи описывают отдельные занятия и не позволяют оценить эффект терапии или поставить диагноз.');return result}
return {active,empty,apply,stats,report,nextDay,missing,validate,same,entries,entry,nextEntry,hasAnswers,reusableEntry,canonicalEntryId,calendar,refresh,dayKey,midnight};
});
