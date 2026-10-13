/* RUDI finance dock: no extra API reads. The unread marker is local to each actor and Moscow date. */
(()=>{'use strict';
const ACTORS=['Рустам','Диана'];
const $=id=>document.getElementById(id);
const actor=()=>ACTORS.includes(document.body?.dataset?.rudiActor)?document.body.dataset.rudiActor:'';
const date=()=>{
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(row=>[row.type,row.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
};
const key=()=> 'rudi:finance:literacy-read:v1:'+actor();
let readTimer=0;
function isLoaded(){
 const body=$('financeLiteracyBody'),status=$('financeLiteracyStatus');
 if(!body||!body.querySelector('p,li,h3'))return false;
 if(String(status?.textContent||'').includes('Готовлю')||String(status?.textContent||'').includes('не удалось'))return false;
 const text=String(body.textContent||'').trim();
 return text.length>700&&!text.includes('Готовлю сегодняшнюю статью')&&!text.includes('временно недоступна');
}
function refresh(){
 const nav=$('financeTabs'),dot=nav?.querySelector('.finance-literacy-unread');if(!nav||!dot)return;
 nav.dataset.actor=actor();
 const person=actor();
 if(!person){dot.hidden=true;return}
 let seen='';try{seen=localStorage.getItem(key())||''}catch{}
 dot.hidden=seen===date();
}
function markRead(){
 if(document.body?.dataset?.appTab!=='finances'||$('financeLiteracyPanel')?.hidden!==false||!isLoaded()||!actor())return;
 try{localStorage.setItem(key(),date())}catch{}
 refresh();
}
function schedule(){
 clearTimeout(readTimer);
 const active=document.body?.dataset?.appTab==='finances'&&$('financeLiteracyPanel')?.hidden===false;
 if(active&&isLoaded())readTimer=setTimeout(markRead,2200);
 refresh();
}
function init(){
 const nav=$('financeTabs'),body=$('financeLiteracyBody');
 if(!nav||!body)return;
 refresh();
 document.addEventListener('click',event=>{
   if(event.target.closest?.('[data-finance-tab="literacy"]'))setTimeout(schedule,50);
   else if(event.target.closest?.('[data-finance-tab]'))clearTimeout(readTimer);
 },true);
 new MutationObserver(schedule).observe(body,{childList:true,subtree:true,characterData:true});
 const status=$('financeLiteracyStatus');if(status)new MutationObserver(schedule).observe(status,{childList:true,characterData:true,subtree:true});
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor','data-app-tab']});
 new MutationObserver(schedule).observe($('financeLiteracyPanel'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('pageshow',refresh);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(readTimer);else schedule()});
 setInterval(refresh,60000);
 schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
