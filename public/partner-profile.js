/* Reuse the live partner card and its existing data, without duplicating IDs or requests. */
(()=>{'use strict';
 let active=null;
 const bindings=new WeakMap();
 function close(fromHistory=false){
  if(!active)return;
  const saved=active;active=null;
  saved.marker.replaceWith(saved.tile);
  saved.tile.dataset.appTabSection='home';
  saved.details.hidden=true;
  saved.page.remove();
  document.body.classList.remove('partner-profile-open');
  document.body.style.top=saved.top;
  window.scrollTo({top:saved.scroll,left:0,behavior:'instant'});
  if(!fromHistory&&history.state?.rudiPartnerProfile)history.back();
  saved.trigger?.focus?.({preventScroll:true});
 }
 function bind(tile,actor,{openStars,balance,refreshBalance}){
  if(bindings.has(tile))return;
  const details=tile.querySelector('.profile-person-details');
  if(!details)return;
  details.hidden=true;
  const energy=tile.querySelector('.profile-energy-strip');
  tile.classList.add('partner-profile-card');
  function open(trigger){
   if(active)return;
   const marker=document.createComment('partner-card');
   tile.before(marker);
   const page=document.createElement('section');page.className='partner-profile-page';
   page.dataset.noPullRefresh='true';page.dataset.noSwipeBack='true';
   page.setAttribute('aria-label','Профиль: '+actor);
   page.innerHTML='<header class="partner-profile-bar"><button type="button" class="partner-profile-back" aria-label="Назад">←</button><h1></h1><button type="button" class="partner-profile-stars"></button></header><div class="partner-profile-content"></div>';
   page.querySelector('h1').textContent=actor;
   const stars=page.querySelector('.partner-profile-stars');
   const updateBalance=()=>{
    const count=balance();
    stars.textContent='⭐ '+(count==null?'…':Number(count).toLocaleString('ru-RU',{maximumFractionDigits:2}));
    stars.setAttribute('aria-label','Звёзды '+actor+': '+(count==null?'загружаются':stars.textContent.slice(3))+'. Открыть историю');
   };
   active={tile,details,marker,page,trigger,actor,scroll:window.scrollY,top:document.body.style.top,updateBalance};
   delete tile.dataset.appTabSection;
   details.hidden=false;
   if(energy)energy.hidden=false;
   page.querySelector('.partner-profile-content').append(tile);
   document.body.append(page);
   document.body.style.top=-active.scroll+'px';
   document.body.classList.add('partner-profile-open');
   window.RudiViewport?.sync();
   history.pushState({...history.state,rudiPartnerProfile:actor},'','#partner-'+(actor==='Диана'?'diana':'rustam'));
   page.querySelector('.partner-profile-back').onclick=()=>close();
   stars.onclick=()=>{
    page.hidden=true;
    document.body.classList.remove('partner-profile-open');
    document.body.style.top=active.top;
    openStars(actor);
   };
   updateBalance();page.querySelector('.partner-profile-back').focus({preventScroll:true});
   if(balance()==null)refreshBalance?.();
  }
  const triggers=tile.querySelectorAll('#partnerHeaderName,.partner-header-avatar');
  for(const trigger of triggers){
   trigger.setAttribute('role','button');trigger.tabIndex=0;
   trigger.setAttribute('aria-label','Открыть профиль: '+actor);trigger.removeAttribute('title');
   trigger.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();open(trigger)},{capture:true});
   trigger.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopImmediatePropagation();open(trigger)}},{capture:true});
  }
  tile.addEventListener('click',event=>{
   if(active||event.defaultPrevented||document.body.classList.contains('home-layout-editing'))return;
   if(event.target.closest('button,a,input,select,textarea,[role="button"],.profile-energy-strip'))return;
   open(tile.querySelector('#partnerHeaderName'));
  });
  bindings.set(tile,{actor,open});
 }
 window.addEventListener('popstate',()=>{
  if(!active)return;
  if(history.state?.rudiPartnerProfile===active.actor){
   active.page.hidden=false;
   document.body.style.top=-active.scroll+'px';
   document.body.classList.add('partner-profile-open');
  }else close(true);
 });
 window.addEventListener('rudi:app-tab-change',()=>{
  if(!active)return;
  const visible=document.body.dataset.appTab==='home';
  active.page.hidden=!visible;
  document.body.classList.toggle('partner-profile-open',visible);
  document.body.style.top=visible?-active.scroll+'px':active.top;
 });
 document.addEventListener('keydown',event=>{if(active&&!active.page.hidden&&event.key==='Escape')close()});
 new MutationObserver(()=>{if(active)close(true)}).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
 window.RudiPartnerProfile={bind,close,refresh:()=>active?.updateBalance()};
})();
