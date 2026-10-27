// Authenticated RUDI presence. A status is active for 110 seconds after the latest heartbeat.
(function(){
 'use strict';
 const ACTORS=['Рустам','Диана'];
 const INTERVAL_MS=45000;
 const ACTIVE_WINDOW_MS=110000;
 let timer=0,busy=false,lastResponse=0;
 let status={'Рустам':false,'Диана':false};
 let lastSeen={'Рустам':null,'Диана':null};
 let detail=null;
 const profileLines=new Map();

 function avatar(actor){
   const tile=document.getElementById(actor==='Рустам'?'homeRustamTile':'homeDianaTile');
   return tile?.querySelector('.score-avatar-wrap')||null;
 }
 function isOnline(actor){
   return document.visibilityState==='visible'&&navigator.onLine!==false&&document.body.dataset.offlineMode!=='1'&&
     document.body.classList.contains('auth-ok')&&Date.now()-lastResponse<=ACTIVE_WINDOW_MS&&status[actor]===true;
 }
 function formatDate(value){
   if(!value)return '';
   const date=new Date(value);
   if(!Number.isFinite(date.getTime()))return '';
   const parts=new Intl.DateTimeFormat('ru-RU',{
     timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
   }).formatToParts(date);
   const part=type=>parts.find(item=>item.type===type)?.value||'';
   return part('day')+'.'+part('month')+' в '+part('hour')+':'+part('minute');
 }
 function dismiss(){
   if(!detail)return;
   const tile=detail.parentNode,dot=avatar(detail.dataset.actor)?.querySelector('.rudi-online-dot');
   dot?.setAttribute('aria-expanded','false');dot?.removeAttribute('aria-controls');
   tile?.classList.remove('has-presence-detail');
   detail.remove();detail=null;
   document.removeEventListener('keydown',onKeyDown);
   document.removeEventListener('pointerdown',onOutsidePointer,true);
 }
 function onKeyDown(event){
   if(event.key==='Escape'&&detail){event.preventDefault();dismiss()}
 }
 function onOutsidePointer(event){
   if(!detail)return;
   const dot=avatar(detail.dataset.actor)?.querySelector('.rudi-online-dot');
   if(!detail.contains(event.target)&&!dot?.contains(event.target))dismiss();
 }
 function refreshDetail(){
   if(!detail)return;
   if(!document.body.contains(detail)){dismiss();return}
   const actor=detail.dataset.actor,stamp=formatDate(lastSeen[actor]);
   detail.textContent=isOnline(actor)?'Сейчас в сети':stamp
     ?(actor==='Диана'?'Была в сети ':'Был в сети ')+stamp
     :'Нет данных о посещении';
 }
 function open(actor){
   if(!ACTORS.includes(actor))return;
   const same=detail?.dataset.actor===actor;
   dismiss();if(same)return;
   const holder=avatar(actor),tile=holder?.closest('.profile-person-card');
   if(!tile)return;
   const line=document.createElement('p');
   line.className='rudi-presence-detail';line.dataset.actor=actor;
   line.id=actor==='Диана'?'rudiPresenceDiana':'rudiPresenceRustam';
   line.setAttribute('role','status');line.setAttribute('aria-live','polite');
   // Reserve an ordinary row below the header, ahead of the card's expandable content.
   tile.insertBefore(line,tile.querySelector(':scope > .rudi-collapse-body'));
   tile.classList.add('has-presence-detail');detail=line;
   const dot=holder.querySelector('.rudi-online-dot');
   dot?.setAttribute('aria-expanded','true');dot?.setAttribute('aria-controls',line.id);
   document.addEventListener('keydown',onKeyDown);
   document.addEventListener('pointerdown',onOutsidePointer,true);
   refreshDetail();
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
     dot.setAttribute('aria-label',actor+(active?' сейчас онлайн':' сейчас не в сети')+'. Показать время посещения');
     dot.setAttribute('aria-expanded',detail?.dataset.actor===actor?'true':'false');
     dot.title=actor+(active?' · онлайн':' · не в сети');
   }
   refreshDetail();
   for(const [line,actor] of profileLines)paintProfileLine(line,actor);
 }
 function paintProfileLine(line,actor){
   const active=isOnline(actor),stamp=formatDate(lastSeen[actor]);
   const text=active?'В сети':stamp?(actor==='Диана'?'Была в сети ':'Был в сети ')+stamp:'Нет данных о посещении';
   line.classList.toggle('is-online',active);
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
   if(timer)return;
   timer=setInterval(()=>{paint();void ping()},INTERVAL_MS);
   paint();void ping();setTimeout(paint,1200);
 }
 window.RudiPresence={mountProfile};
 window.addEventListener('rudi:auth-ready',start);
 window.addEventListener('rudi:app-tab-change',dismiss);
 window.addEventListener('pagehide',dismiss);
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
