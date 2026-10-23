(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./cbt-content.js'));else root.RudiCbtCore=factory(root.RudiCbtContent)})(typeof window==='object'?window:globalThis,(content)=>{
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>JSON.stringify(a??'')===JSON.stringify(b??'');
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(v);
function active(s){return s?.runs?.find(r=>r.status==='active')||null}
function empty(){return {schema:1,runs:[]}}
function error(code,fields){const e=Error(code);e.fields=fields||[];throw e}
function filled(f,v){return f.type==='range'?Number.isFinite(v)&&v>=0&&v<=f.max:f.type==='check'?v===true:f.type==='emotions'?Array.isArray(v)&&v.length>0:typeof v==='string'&&!!v.trim()}
function missing(day,answers){return content.days[day-1].fields.filter(f=>f.required&&!filled(f,answers?.[f.key])).map(f=>f.key)}
function validate(op){
 if(!op||!validId(op.id)||!validId(op.cycleId)||!['start','edit','complete','archive'].includes(op.type))error('cbt-invalid-operation');
 if(op.type==='start')return;
 if(!Number.isInteger(op.day)||op.day<1||op.day>21)error('cbt-invalid-day');
 if(op.type==='complete')return;
 if(!op.patch||Array.isArray(op.patch)||typeof op.patch!=='object'||!Object.keys(op.patch).length||Object.keys(op.patch).length>15)error('cbt-invalid-fields');
 const fields=[...content.days[op.day-1].fields,{key:'moodBefore',type:'range',max:10},{key:'moodAfter',type:'range',max:10},{key:'emotionIntensity',type:'range',max:10},{key:'emotions',type:'emotions'}];
 for(const [k,v]of Object.entries(op.patch)){
  const f=fields.find(x=>x.key===k);if(!f)error('cbt-invalid-field');
  if(f.type==='range'){if(v!==null&&(!Number.isFinite(v)||v<0||v>f.max||!Number.isInteger(v)))error('cbt-invalid-rating')}
  else if(f.type==='check'){if(typeof v!=='boolean')error('cbt-invalid-check')}
  else if(f.type==='emotions'){if(!Array.isArray(v)||v.length>12||v.some(x=>typeof x!=='string'||x.length>60))error('cbt-invalid-emotions')}
  else if(typeof v!=='string'||v.length>6000)error('cbt-invalid-text');
 }
}
function apply(state,op,now=new Date().toISOString(),local=false){
 validate(op);const s=clone(state||empty());
 let run=s.runs.find(r=>r.id===op.cycleId);
 if(op.type==='start'){
  if(run)return s;
  const current=active(s);if(!local&&(current?.id||null)!==(op.expectedActive||null))error('cbt-conflict-start');
  if(current){current.status='interrupted';current.interruptedAt=now}
  s.runs.push({id:op.cycleId,startedAt:now,status:'active',contentVersion:content.version,days:{},applied:[]});return s;
 }
 if(!run)error('cbt-run-missing');
 if(run.applied.includes(op.id))return s;
 if(run.status!=='active'&&op.type!=='archive'&&!local)error('cbt-read-only');
 const row=run.days[op.day]||{answers:{},startedAt:now,completedAt:null,updatedAt:now};
 if(op.type==='archive'){
  row.versions=[...(row.versions||[]),{id:op.id,at:now,answers:{...row.answers,...op.patch}}];
 }else if(op.type==='edit'){
  const conflicts=Object.keys(op.patch).filter(k=>!same(row.answers[k],op.base?.[k])&&!same(row.answers[k],op.patch[k]));
  if(conflicts.length&&!local)error('cbt-conflict-fields',conflicts);
  row.answers={...row.answers,...op.patch};
  if(row.completedAt&&missing(op.day,row.answers).length)row.completedAt=null;
 }else if(!local&&missing(op.day,row.answers).length)error('cbt-incomplete',missing(op.day,row.answers));
 else row.completedAt=row.completedAt||now;
 row.updatedAt=now;run.days[op.day]=row;run.updatedAt=now;run.applied.push(op.id);
 // Old retries are still safe: equal values are idempotent, divergent stale bases conflict.
 run.applied=run.applied.slice(-1200);
 if(Object.values(run.days).filter(x=>x.completedAt).length===21){run.status='completed';run.completedAt=run.completedAt||now}
 return s;
}
function nextDay(run){const draft=Object.entries(run?.days||{}).filter(([,r])=>!r.completedAt).sort((a,b)=>String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)))[0];if(draft)return Number(draft[0]);for(let n=1;n<=21;n++)if(!run?.days[n]?.completedAt)return n;return 21}
function stats(run,week){
 const rows=Object.entries(run?.days||{}).map(([day,r])=>({day:Number(day),...r})).filter(r=>r.completedAt&&(!week||Math.ceil(r.day/7)===week)).sort((a,b)=>a.day-b.day);
 const points=k=>rows.filter(r=>typeof r.answers?.[k]==='number').map(r=>({day:r.day,value:r.answers[k]}));
 const paired=(a,b)=>rows.filter(r=>typeof r.answers?.[a]==='number'&&typeof r.answers?.[b]==='number');
 const mood=paired('moodBefore','moodAfter'),belief=paired('beliefBefore','beliefAfter');
 const avg=(a,fn)=>a.length?Math.round(a.reduce((s,r)=>s+fn(r),0)/a.length*10)/10:null;
 const counts={};for(const r of rows)for(const e of r.answers.emotions||[])counts[e]=(counts[e]||0)+1;
 return {completed:rows.length,percent:Math.round(rows.length/(week?7:21)*100),moodBefore:points('moodBefore'),moodAfter:points('moodAfter'),intensity:points('emotionIntensity'),beliefBefore:points('beliefBefore'),beliefAfter:points('beliefAfter'),moodPairs:mood.length,beliefPairs:belief.length,moodChange:avg(mood,r=>r.answers.moodAfter-r.answers.moodBefore),beliefChange:avg(belief,r=>r.answers.beliefAfter-r.answers.beliefBefore),emotions:Object.entries(counts).sort((a,b)=>b[1]-a[1]),actions:rows.filter(r=>r.answers.actionDone===true).length};
}
function report(run,week){const s=stats(run,week);const result=[`Завершено занятий: ${s.completed} из ${week?7:21}.`];if(s.moodPairs)result.push(`Среднее изменение настроения в ${s.moodPairs} занятиях с двумя оценками: ${s.moodChange>0?'+':''}${s.moodChange} из 10.`);if(s.beliefPairs)result.push(`Среднее изменение убеждённости в ${s.beliefPairs} разборах: ${s.beliefChange>0?'+':''}${s.beliefChange} п. п.`);if(s.emotions.length)result.push(`Чаще отмечалась эмоция: ${s.emotions[0][0]} (${s.emotions[0][1]}).`);if(s.actions)result.push(`Выполнено практических действий: ${s.actions}.`);if(s.completed<2)result.push('Данных пока недостаточно для оценки динамики.');result.push('Эти записи описывают отдельные занятия и не позволяют оценить эффект терапии или поставить диагноз.');return result}
return {active,empty,apply,stats,report,nextDay,missing,validate,same};
});
