'use strict';
function weekPeriod(date){
 const end=new Date(date+'T12:00:00Z');
 const start=new Date(end);start.setUTCDate(start.getUTCDate()-6);
 return {cadence:'weekly',start:start.toISOString().slice(0,10),end:date};
}
function isSunday(date){return new Date(date+'T12:00:00Z').getUTCDay()===0;}
function weeklyFacts({date,actor,finances,supplements,habits,moods,meditation,profile}){
 const period=weekPeriod(date),within=value=>{let day=String(value||'');if(day.length>10){const clock=new Date(day);if(!Number.isFinite(clock.getTime()))return false;day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(clock)}return day>=period.start&&day<=period.end};
 const expenses=(finances?.personalExpenses||[]).filter(x=>x.actor===actor&&!x.manualAdjustment&&within(x.occurredAt||x.createdAt));
 const mood=(Array.isArray(moods)?moods:[]).filter(x=>within(x.date));
 const sessions=(meditation?.history||[]).filter(x=>within(x.endedAt));
 return {period,
  expenses:{entries:expenses.length,rub:Math.round(expenses.reduce((n,x)=>n+(Number(x.rubAmount??x.amount)||0),0))},
  mood:{recordedDays:mood.length,days:mood},
  habits:(habits?.habits||[]).map(h=>({name:h.name,completed:Object.entries(habits.completions||{}).filter(([day,ids])=>within(day)&&Array.isArray(ids)&&ids.includes(h.id)).length,notCompleted:Object.entries(habits.failures||{}).filter(([day,ids])=>within(day)&&Array.isArray(ids)&&ids.includes(h.id)).length})),
  supplements:(supplements?.items||[]).map(x=>({name:x.name,intakes:(x.intakes||[]).filter(i=>within(i.date||i.at)).length,skips:(x.skips||[]).filter(i=>within(i.date||i.at)).length})),
  meditation:{sessions:sessions.length,minutes:Math.round(sessions.reduce((n,x)=>n+(Number(x.durationSeconds)||0),0)/60)},
  weightMeasurements:(profile?.weights||[]).filter(x=>within(x.at)),
  note:'Итоги только за указанные семь дней. Отсутствие записи не означает невыполнение. Текущие планы не являются завершёнными делами.'};
}
module.exports={weekPeriod,isSunday,weeklyFacts};
