'use strict';
const {habitActiveByDate}=require('./habit-tracker-store.cjs');
function shift(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function range(day,n){return Array.from({length:n},(_,i)=>shift(day,i-n+1));}
function buildHabitDigest(state,day){
 if(!state||!(/^\d{4}-\d{2}-\d{2}$/.test(day)))return null;
 const habits=Array.isArray(state.habits)?state.habits:[],done=state.completions||{},missed=state.failures||{},final=state.finalizedDates||{};
 const dates=range(day,60),recent=dates.slice(-30),week=dates.slice(-7),prevWeek=dates.slice(-14,-7);
 const active=habits.filter(h=>!h.archivedAt||habitActiveByDate(h,day));
 const status=(h,d)=>!habitActiveByDate(h,d)?'not_active':Array.isArray(done[d])&&done[d].includes(h.id)?'completed':Array.isArray(missed[d])&&missed[d].includes(h.id)?'not_completed':'no_mark';
 function counts(h,period){
  const s=period.map(d=>status(h,d)).filter(x=>x!=='not_active'),completed=s.filter(x=>x==='completed').length,failed=s.filter(x=>x==='not_completed').length,n=completed+failed;
  return {eligible:s.length,recorded:n,completed,notCompleted:failed,noMark:s.length-n,percentOfRecorded:n?Math.round(completed/n*100):null};
 }
 const items=active.slice(0,40).map(h=>{
  const last7=counts(h,week),prior7=counts(h,prevWeek),last30=counts(h,recent),prior30=counts(h,dates.slice(0,30));
  const delta=(a,b,min)=>a.recorded>=min&&b.recorded>=min?a.percentOfRecorded-b.percentOfRecorded:null;
  return {id:h.id,name:h.name,purpose:h.purpose||'',createdAt:h.createdAt,archivedAt:h.archivedAt||null,
   last7,previous7:prior7,last30,previous30:changeNone(prior30),change7PercentagePoints:delta(last7,prior7,3),change30PercentagePoints:delta(last30,prior30,8),
   recentMarked:recent.slice(-14).map(d=>({date:d,status:status(h,d)})).filter(x=>['completed','not_completed'].includes(x.status))};
 });
 const daily=recent.map(d=>{const valid=active.filter(h=>habitActiveByDate(h,d)),ok=valid.filter(h=>status(h,d)==='completed'),
 no=valid.filter(h=>status(h,d)==='not_completed');return {day:d,completed:ok.length,notCompleted:no.length,confirmed:Boolean(done[d]||missed[d]||final[d]),completedNames:ok.slice(0,8).map(h=>h.name),notCompletedNames:no.slice(0,8).map(h=>h.name)};}).filter(x=>x.confirmed).slice(-21);
 const months=Object.entries(done).reduce((a,[d,ids])=>{const k=d.slice(0,7);if(/^\d{4}-\d{2}$/.test(k))a[k]=(a[k]||0)+(Array.isArray(ids)?ids.length:0);return a;},{});
 return {asOf:day,items,totalHabits:habits.length,activeHabits:active.length,recent:daily,monthly:Object.entries(months).sort(([a],[b])=>a.localeCompare(b)).map(([month,completed])=>({month,completed})),
 method:'No mark is unknown, not a failed habit. Rates only among explicitly recorded completed/not_completed. Comparison requires >=3 records per week or >=8 per 30-day period.'};
}
function changeNone(x){return x;}
module.exports={buildHabitDigest,shift,range};