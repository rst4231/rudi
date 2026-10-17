'use strict';
const {dateTime}=require('./personal-task-editor.cjs');
function recurrence(input,previous={}){
 const repeat=String(input.repeat??previous.repeat??'none');
 const repeatEvery=Number(input.repeatEvery??previous.repeatEvery??1);
 const repeatDays=input.repeatDays??previous.repeatDays??[];
 if(!['none','daily','weekly'].includes(repeat)||!Number.isInteger(repeatEvery)||repeatEvery<1||repeatEvery>52||
   !Array.isArray(repeatDays)||repeatDays.some(day=>!Number.isInteger(day)||day<0||day>6))throw Error('calendar-repeat-invalid');
 const days=[...new Set(repeatDays)].sort();
 if(repeat==='weekly'&&!days.length)throw Error('calendar-repeat-days-required');
 return {repeat,repeatEvery,repeatDays:repeat==='weekly'?days:[]};
}
const dayNumber=date=>Date.parse(date+'T00:00:00Z')/86400000;
function matches(task,date){
 if(!task.date||date<task.date)return false;
 const delta=dayNumber(date)-dayNumber(task.date),every=task.repeatEvery||1;
 if(task.repeat==='daily')return delta%every===0;
 if(task.repeat==='weekly'){
  const weekday=new Date(date+'T00:00Z').getUTCDay();
  const anchorWeekday=(new Date(task.date+'T00:00Z').getUTCDay()+6)%7;
  return (task.repeatDays||[]).includes(weekday)&&Math.floor((delta+anchorWeekday)/7)%every===0;
 }
 return date===task.date;
}
function dates(task,month){
 if(!month)return [task.date];
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('calendar-month-invalid');
 if(!task.repeat||task.repeat==='none')return task.date.slice(0,7)===month?[task.date]:[];
 const count=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 const result=[];
 for(let n=1;n<=count;n++){const date=month+'-'+String(n).padStart(2,'0');if(matches(task,date))result.push(date)}
 return result;
}
function retained(completedAt,now){
 const completed=new Date(completedAt);
 if(!Number.isFinite(completed.getTime()))return false;
 const targetMonth=completed.getUTCMonth()+2;
 const lastDay=new Date(Date.UTC(completed.getUTCFullYear(),targetMonth+1,0)).getUTCDate();
 const until=new Date(completed);until.setUTCDate(1);until.setUTCMonth(targetMonth);until.setUTCDate(Math.min(completed.getUTCDate(),lastDay));
 return until.getTime()>Number(now);
}
function occurrenceId(task,date){return task.repeat&&task.repeat!=='none'?task.id+'__'+date:task.id}
function parseId(id){
 const match=String(id||'').match(/^([A-Za-z0-9_-]{1,180}?)(?:__(20\d{2}-\d{2}-\d{2}))?$/);
 if(!match)throw Error('calendar-task-invalid');
 if(match[2])dateTime(match[2],'');
 return {seriesId:match[1],occurrenceDate:match[2]||''};
}
module.exports={recurrence,matches,dates,retained,occurrenceId,parseId};
