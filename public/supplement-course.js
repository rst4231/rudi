/* Shared calendar rules for supplement courses; no network or storage access. */
(function(root){'use strict';
 const day=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 function valid(key){return /^\d{4}-\d{2}-\d{2}$/.test(key||'')&&Number.isFinite(Date.parse(key+'T00:00:00Z'))&&new Date(key+'T00:00:00Z').toISOString().slice(0,10)===key}
 function end(item){const start=item?.course?.startDate,n=Number(item?.course?.durationDays);if(!valid(start)||!Number.isInteger(n)||n<=0||n>3650)return '';return new Date(Date.parse(start+'T00:00:00Z')+(n-1)*86400000).toISOString().slice(0,10)}
 function state(item,date=day()){const start=item?.course?.startDate,finish=end(item);if(valid(start)&&start>date)return 'future';if(finish&&finish<date)return 'ended';return 'current'}
 function canMark(item,date=day()){return state(item,date)==='current'}
 function apply(item,date=day()){if(!item||item.status==='finished'||state(item,date)!=='ended')return item;const at=new Date(Date.parse(end(item)+'T00:00:00Z')+86400000-10800000).toISOString();return {...item,status:'finished',updatedAt:at,statusHistory:[...(item.statusHistory||[]),{status:'finished',at}]}}
 const api={day,end,state,canMark,apply};if(typeof module==='object'&&module.exports)module.exports=api;else root.RudiSupplementCourse=api;
})(typeof window==='object'?window:globalThis);
