// Authenticated RUDI presence. A status is active for 110 seconds after the latest heartbeat.
(function(){
 'use strict';
 const ACTORS=['Рустам','Диана'];
 const INTERVAL_MS=45000;
 const ACTIVE_WINDOW_MS=110000;
 let timer=0,busy=false,lastResponse=0;
 let status={'Рустам':false,'Диана':false};
 let lastSeen={'Рустам':null,'Диана':null};
 let modal=null,previousFocus=null;

 function avatar(actor){
   const tile=document.getElementById(actor==='Рустам'?'homeRustamTile':'homeDianaTile');
   return tile?.querySelector('.score-avatar-wrap')||null;
 }
 function isOnline(actor){
   return document.visibilityState==='visible'&&navigator.onLine!==false&&
     document.body.classList.contains('auth-ok')&&Date.now()-lastResponse<=ACTIVE_WINDOW_MS&&status[actor]===true;
 }
 function formatDate(value){
   if(!value)return '';
   const date=new Date(value);
   if(!Number.isFinite(date.getTime()))return '';
   return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
 }
 function dismiss(){
   if(!modal)return;
   modal.remove();modal=null;
   document.removeEventListener('keydown',onKeyDown);
   if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
   previousFocus=null;
 }
 function onKeyDown(event){
   if(event.key==='Escape'){event.preventDefault();dismiss()}
   if(event.key==='Tab'&&modal){
     const close=modal.querySelector('.rudi-presence-close');
     if(close){event.preventDefault();close.focus()}
   }
 }
 function refreshModal(){
   if(!modal)return;
   const actor=modal.dataset.actor,active=isOnline(actor);
   const state=modal.querySelector('.rudi-presence-state');
   const stamp=modal.querySelector('.rudi-presence-stamp');
   if(state)state.textContent=active?'Сейчас онлайн':'Сейчас не в сети';
   if(state)state.classList.toggle('is-online',active);
   if(stamp)stamp.textContent=lastSeen[actor]&&formatDate(lastSeen[actor])
      ?'Последний заход: '+formatDate(lastSeen[actor])
      :'Последний заход пока неизвестен';
 }
 function open(actor){
   if(!ACTORS.includes(actor))return;
   dismiss();
   previousFocus=document.activeElement;
   const wrapper=document.createElement('div');
   wrapper.className='rudi-presence-overlay';
   wrapper.dataset.actor=actor;
   wrapper.innerHTML='<div class="rudi-presence-backdrop"></div>'+
     '<section class="rudi-presence-dialog" role="dialog" aria-modal="true" aria-labelledby="rudiPresenceTitle">'+
     '<button type="button" class="rudi-presence-close" aria-label="Закрыть">×</button>'+
     '<div class="rudi-presence-symbol" aria-hidden="true">●</div>'+
     '<h2 id="rudiPresenceTitle"></h2>'+
     '<p class="rudi-presence-state"></p>'+
     '<p class="rudi-presence-stamp"></p>'+
     '</section>';
   wrapper.querySelector('h2').textContent=actor;
   wrapper.querySelector('.rudi-presence-close').addEventListener('click',dismiss);
   wrapper.querySelector('.rudi-presence-backdrop').addEventListener('click',dismiss);
   document.body.appendChild(wrapper);
   modal=wrapper;
   document.addEventListener('keydown',onKeyDown);
   refreshModal();
   wrapper.querySelector('.rudi-presence-close').focus({preventScroll:true});
 }
 function paint(){
   for(const actor of ACTORS){
     const holder=avatar(actor);
     if(!holder)continue;
     let dot=holder.querySelector('.rudi-online-dot');
     if(!dot){
       dot=document.createElement('button');
       dot.type='button';
       dot.className='rudi-online-dot';
       dot.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();open(actor)});
       holder.appendChild(dot);
     }
     const active=isOnline(actor);
     dot.classList.toggle('is-online',active);
     dot.setAttribute('aria-label',actor+(active?' сейчас онлайн':' сейчас не в сети')+'. Узнать последний заход');
     dot.title=actor+(active?' · онлайн':' · не в сети');
   }
   refreshModal();
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
   if(timer)return;
   timer=setInterval(()=>{paint();void ping()},INTERVAL_MS);
   paint();void ping();setTimeout(paint,1200);
 }
 window.addEventListener('rudi:auth-ready',start);
 window.addEventListener('online',()=>{paint();void ping()});
 window.addEventListener('offline',()=>{status={'Рустам':false,'Диана':false};paint()});
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState!=='visible'){dismiss();paint();return}
   paint();void ping();
 });
 window.addEventListener('pageshow',()=>{if(document.body.classList.contains('auth-ok')){start();void ping()}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{
   if(document.body.classList.contains('auth-ok'))start();
 },{once:true});
 else if(document.body.classList.contains('auth-ok'))start();
})();
