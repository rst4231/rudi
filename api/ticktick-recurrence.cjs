'use strict';
// Expand only the small set of RRULEs RUDI can edit. Never guess advanced TickTick rules.
const MS=86400000,weekdays=['SU','MO','TU','WE','TH','FR','SA'];
function dates({flag,start,monthStart,monthEnd,timezoneDate}){
 const ruleString=String(flag||'').trim().toUpperCase();
 if(!ruleString.startsWith('RRULE:')||!start||!monthStart||!monthEnd)return [];
 const entries=ruleString.slice(6).split(';').map(x=>x.split('='));
 if(entries.some(x=>x.length!==2||!['FREQ','INTERVAL','BYDAY','COUNT','UNTIL','WKST'].includes(x[0])))return [];
 const rule=Object.fromEntries(entries),freq=rule.FREQ;
 if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(freq))return [];
 const interval=Number(rule.INTERVAL||1);
 if(!Number.isInteger(interval)||interval<1||interval>365||rule.BYDAY&&freq!=='WEEKLY')return [];
 const byDay=rule.BYDAY?rule.BYDAY.split(',').map(x=>weekdays.indexOf(x)):[];
 if(byDay.some(x=>x<0)||new Set(byDay).size!==byDay.length)return [];
 const count=rule.COUNT?Number(rule.COUNT):Infinity;
 if(count!==Infinity&&(!Number.isInteger(count)||count<1))return [];
 let until='';
 if(rule.UNTIL){
  const m=String(rule.UNTIL).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/);
  if(!m)return [];
  until=m[4]&&typeof timezoneDate==='function'
   ?timezoneDate(m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+m[6]+'Z')
   :m[1]+'-'+m[2]+'-'+m[3];
 }
 const anchor=Date.parse(start+'T00:00:00Z'),limit=Date.parse(monthEnd+'T00:00:00Z');
 if(!Number.isFinite(anchor)||!Number.isFinite(limit)||limit<anchor)return [];
 const first=new Date(anchor),firstDay=first.getUTCDate(),firstMonth=first.getUTCMonth();
 const firstWeek=anchor-((first.getUTCDay()+6)%7)*MS;
 const found=[];let seen=0;
 for(let ts=anchor,n=0;ts<=limit&&n<30000;ts+=MS,n++){
  const d=new Date(ts),key=d.toISOString().slice(0,10);
  if(until&&key>until)break;
  let match=false;
  if(freq==='DAILY')match=n%interval===0;
  else if(freq==='WEEKLY')match=Math.floor((ts-firstWeek)/(7*MS))%interval===0
    &&(byDay.length?byDay.includes(d.getUTCDay()):d.getUTCDay()===first.getUTCDay());
  else if(freq==='MONTHLY')match=((d.getUTCFullYear()-first.getUTCFullYear())*12+d.getUTCMonth()-firstMonth)%interval===0
    &&d.getUTCDate()===firstDay;
  else match=(d.getUTCFullYear()-first.getUTCFullYear())%interval===0
    &&d.getUTCMonth()===firstMonth&&d.getUTCDate()===firstDay;
  if(!match)continue;
  if(++seen>count)break;
  if(key>=monthStart)found.push(key);
 }
 return found;
}
module.exports={dates};
