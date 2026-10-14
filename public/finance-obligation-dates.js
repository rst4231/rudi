/* RUDI recurring bills: read-only relative-date labels in Moscow time. */
(()=>{
 'use strict';
 const root=document.getElementById('financeObligationList');
 if(!root)return;
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const calendar=(y,m,day)=>new Date(Date.UTC(y,m-1,Math.min(day,new Date(Date.UTC(y,m,0)).getUTCDate())));
 const rel=n=>{
  if(n===0)return 'сегодня';
  if(n===1)return 'завтра';
  if(n===2)return 'послезавтра';
  const last=n%10,last100=n%100;
  return 'через '+n+' '+(last===1&&last100!==11?'день':last>=2&&last<=4&&(last100<12||last100>14)?'дня':'дней');
 };
 function sync(){
  const [y,m,d]=today().split('-').map(Number),now=Date.UTC(y,m-1,d);
  for(const row of root.querySelectorAll('.finance-obligation-row')){
   const text=row.querySelector('.finance-obligation-copy small');if(!text)continue;
   const match=text.textContent.match(/(?:^|[·\s])(\d{1,2})\s*(?:-го\s*)?числа\b/i);if(!match)continue;
   const day=Number(match[1]);if(day<1||day>31)continue;
   const paid=row.classList.contains('is-paid');
   let next=calendar(y,m,day),difference=Math.round((next.getTime()-now)/86400000);
   if(difference<0||(paid&&difference>=0)){next=calendar(m===12?y+1:y,m===12?1:m+1,day);difference=Math.round((next.getTime()-now)/86400000);}
   const label=' ('+rel(difference)+')';
   let span=text.querySelector('.finance-obligation-relative');
   if(!span){span=document.createElement('span');span.className='finance-obligation-relative';text.append(span);}
   if(span.textContent!==label)span.textContent=label;
  }
 }
 let queued=false;
 function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;sync();});}
 new MutationObserver(schedule).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 window.addEventListener('focus',schedule);
 window.setInterval(schedule,300000);
 schedule();
})();