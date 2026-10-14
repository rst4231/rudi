// Online means an authenticated RUDI session active within the last 110 seconds.
(function(){
 'use strict';
 const ACTORS=['Рустам','Диана'];
 const INTERVAL_MS=45000;
 const RETRY_PAINT_MS=1200;
 let timer=0,busy=false,status={'Рустам':false,'Диана':false},lastResponse=0;
 function avatar(actor){
   const tile=document.getElementById(actor==='Рустам'?'homeRustamTile':'homeDianaTile');
   return tile?.querySelector('.score-avatar-wrap')||null;
 }
 function paint(){
   for(const actor of ACTORS){
     const holder=avatar(actor);
     if(!holder)continue;
     let dot=holder.querySelector('.rudi-online-dot');
     if(!dot){dot=document.createElement('span');dot.className='rudi-online-dot';
       dot.setAttribute('role','img');holder.appendChild(dot)}
     const active=document.visibilityState==='visible'&&navigator.onLine!==false&&
       document.body.classList.contains('auth-ok')&&Date.now()-lastResponse<=110000&&status[actor];
     dot.classList.toggle('is-online',Boolean(active));
     dot.setAttribute('aria-label',actor+(active?' сейчас онлайн':' сейчас не в сети'));
     dot.title=actor+(active?' · онлайн':' · не в сети');
   }
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
     status={ 'Рустам':body.online?.['Рустам']===true,'Диана':body.online?.['Диана']===true };
     lastResponse=Date.now();
   }catch(_){status={'Рустам':false,'Диана':false};lastResponse=0}
   finally{clearTimeout(timeout);busy=false;paint()}
 }
 function start(){
   if(timer)return;
   timer=setInterval(()=>{paint();void ping()},INTERVAL_MS);
   paint();void ping();setTimeout(paint,RETRY_PAINT_MS);
 }
 window.addEventListener('rudi:auth-ready',start);
 window.addEventListener('online',()=>{paint();void ping()});
 window.addEventListener('offline',()=>{status={'Рустам':false,'Диана':false};paint()});
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState!=='visible'){paint();return}
   paint();void ping();
 });
 window.addEventListener('pageshow',()=>{if(document.body.classList.contains('auth-ok'))start()});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{
   if(document.body.classList.contains('auth-ok'))start();
 },{once:true});
 else if(document.body.classList.contains('auth-ok'))start();
})();
