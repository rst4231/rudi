// Authenticated RUDI presence. A status is active for 110 seconds after the latest heartbeat.
(function(){
 'use strict';
 const ACTORS=['Рустам','Диана'];
 const INTERVAL_MS=45000;
 const ACTIVE_WINDOW_MS=110000;
 let timer=0,busy=false,lastResponse=0;
 let status={'Рустам':false,'Диана':false};
 let lastSeen={'Рустам':null,'Диана':null};
 const profileLines=new Map();

 function avatar(actor){
   const tile=document.getElementById(actor==='Рустам'?'homeRustamTile':'homeDianaTile');
   return tile?.querySelector('.score-avatar-wrap')||null;
 }
 function isOnline(actor){
   return document.visibilityState==='visible'&&navigator.onLine!==false&&document.body.dataset.offlineMode!=='1'&&
     document.body.classList.contains('auth-ok')&&Date.now()-lastResponse<=ACTIVE_WINDOW_MS&&status[actor]===true;
 }
 function paint(){
   for(const actor of ACTORS){
     const holder=avatar(actor);
     if(!holder)continue;
     let dot=holder.querySelector('.rudi-online-dot');
     if(!dot){
       dot=document.createElement('span');
       dot.setAttribute('role','img');
       dot.className='rudi-online-dot';
       dot.addEventListener('click',event=>{event.preventDefault();event.stopPropagation()});
       holder.appendChild(dot);
     }
     const active=isOnline(actor);
     dot.classList.toggle('is-online',active);
     dot.setAttribute('aria-label',actor+(active?' сейчас онлайн':' сейчас не в сети'));
     const person=holder.closest('.profile-person-head')?.querySelector('.person');
     if(person){
       person.classList.toggle('rudi-presence-offline',!active);
       let line=person.querySelector('.home-presence-status');
       if(!line){line=document.createElement('p');line.className='home-presence-status';person.appendChild(line)}
       const text=visitText(actor);
       line.hidden=active||text==='Не в сети';
       line.textContent=line.hidden?'':text.replace(' в сети ',' ');
     }
   }
   for(const [line,actor] of profileLines)paintProfileLine(line,actor);
 }
 function visitText(actor){
   if(isOnline(actor))return 'Онлайн';
   const value=lastSeen[actor],date=value?new Date(value):null;
   if(!date||!Number.isFinite(date.getTime())||date.getTime()>Date.now())return 'Не в сети';
   const prefix=actor==='Диана'?'Была в сети ':'Был в сети ';
   const options={timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
   const time=new Intl.DateTimeFormat('ru-RU',options).format(date);
   const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
   const days=Math.round((Date.parse(day(Date.now()))-Date.parse(day(date)))/86400000);
   return prefix+(days===0?'в '+time:days===1?'вчера в '+time:days+' дн. назад');
 }
 function paintProfileLine(line,actor){
   line.classList.toggle('is-online',isOnline(actor));
   line.parentNode?.classList.toggle('rudi-presence-offline',!isOnline(actor));
   const text=visitText(actor);
   if(line.textContent!==text)line.textContent=text;
 }
 function mountProfile(person,actor){
   if(!person||!ACTORS.includes(actor))return ()=>{};
   const line=document.createElement('p');line.className='partner-presence-status';
   line.setAttribute('role','status');line.setAttribute('aria-live','polite');line.setAttribute('aria-atomic','true');
   const name=person.querySelector('.profile-name-row');
   if(name)name.after(line);else person.appendChild(line);
   profileLines.set(line,actor);paintProfileLine(line,actor);
   return ()=>{profileLines.delete(line);line.remove();paint()};
 }
 async function ping(){
   if(busy||document.visibilityState!=='visible'||navigator.onLine===false||
       !document.body.classList.contains('auth-ok')||document.body.dataset.offlineMode==='1'){
     paint();return;
   }
   busy=true;
   const ctrl=new AbortController();
   const timeout=setTimeout(()=>ctrl.abort(),7000);
   try{
     const initData=window.Telegram?.WebApp?.initData||'';
     const reply=await fetch('/api/partner-message?rudiAction=presence',{
       method:'POST',headers:{'content-type':'application/json'},
       body:JSON.stringify({initData}),signal:ctrl.signal,cache:'no-store'
     });
     const body=await reply.json().catch(()=>({}));
     if(!reply.ok||body.ok!==true)throw Error('presence-unavailable');
     status={'Рустам':body.online?.['Рустам']===true,'Диана':body.online?.['Диана']===true};
     for(const actor of ACTORS){
       if(body.lastSeen&&Object.prototype.hasOwnProperty.call(body.lastSeen,actor)){
         lastSeen[actor]=body.lastSeen[actor]||null;
       }
     }
     lastResponse=Date.now();
   }catch(_){
     status={'Рустам':false,'Диана':false};lastResponse=0;
   }finally{clearTimeout(timeout);busy=false;paint()}
 }
 function start(){
   if(timer){paint();void ping();return;}
   timer=setInterval(()=>{paint();void ping()},INTERVAL_MS);
   paint();void ping();setTimeout(paint,1200);
 }
 window.RudiPresence={mountProfile};
 window.addEventListener('rudi:auth-ready',start);
 window.addEventListener('rudi:app-tab-change',paint);
 window.addEventListener('rudi:profile-ready',paint);
 document.addEventListener('rudi:home-tiles-ready',paint);
 window.addEventListener('online',()=>{paint();void ping()});
 window.addEventListener('offline',()=>{status={'Рустам':false,'Диана':false};paint()});
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState!=='visible'){paint();return}
   paint();void ping();
 });
 window.addEventListener('pageshow',()=>{if(document.body.classList.contains('auth-ok')){start();void ping()}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{
   if(document.body.classList.contains('auth-ok'))start();
 },{once:true});
 else if(document.body.classList.contains('auth-ok'))start();
})();
