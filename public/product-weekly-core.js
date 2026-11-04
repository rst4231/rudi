(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RudiProductWeeklyCore=api})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const day=86400000,key=value=>String(value||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('ru-RU');
 const date=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 const stamp=value=>Date.parse(value+'T12:00:00Z');
 function build(state={},now=Date.now()){
  const from=date(now),today=stamp(from),to=new Date(today+6*day).toISOString().slice(0,10),active=new Set((state.items||[]).map(x=>key(x.text))),groups=new Map();
  for(const row of state.history||[]){const time=Date.parse(row.boughtAt),name=key(row.text);if(!name||!Number.isFinite(time)||time>Number(new Date(now))||time<today-120*day)continue;const period=date(time),days=groups.get(name)||new Map();if(!days.has(period)||Date.parse(days.get(period).boughtAt)<time)days.set(period,row);groups.set(name,days)}
  const items=[];
  for(const [name,dates] of groups){if(active.has(name)||dates.size<2)continue;const sorted=[...dates.entries()].sort(([a],[b])=>a.localeCompare(b)),last=sorted.at(-1),gaps=sorted.slice(1).map(([date],i)=>(stamp(date)-stamp(sorted[i][0]))/day).sort((a,b)=>a-b),middle=Math.floor(gaps.length/2),interval=gaps.length%2?gaps[middle]:(gaps[middle-1]+gaps[middle])/2;
   if(interval<1||interval>35||today-stamp(last[0])>Math.max(21,interval*2+7)*day)continue;
   const due=stamp(last[0])+Math.round(interval)*day;if(due>today+6*day)continue;
   const row=last[1];items.push({id:row.id,text:row.text,category:row.category||'',categoryOverride:row.categoryOverride||'',quantity:row.quantity||'',unit:row.unit||'',note:row.note||'',purchases:sorted.length,intervalDays:Math.round(interval),lastBought:last[0],due:new Date(Math.max(today,due)).toISOString().slice(0,10)});
  }
  items.sort((a,b)=>a.due.localeCompare(b.due)||b.purchases-a.purchases||a.text.localeCompare(b.text,'ru'));
  return {from,to,items:items.slice(0,40)};
 }
 return {build};
});
