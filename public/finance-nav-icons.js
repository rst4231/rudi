/* RUDI v4.212: five icon-only finance tabs and private unread-literacy status. */
(()=>{'use strict';
const ICONS={
 personal:'<circle cx="12" cy="8" r="3.4"/><path d="M5.4 20v-1.5a6.6 6.6 0 0 1 13.2 0V20"/>',
 crypto:'<circle cx="12" cy="12" r="9"/><path d="M9 6.5v11M14 6.5v11M9 8h5a2 2 0 0 1 0 4H9m0 0h5.5a2 2 0 0 1 0 4H9"/>',
 debts:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h5m-5 4h8"/>',
 shared:'<circle cx="8.5" cy="8" r="2.7"/><circle cx="16.5" cy="8.8" r="2.2"/><path d="M2.9 19v-1.3a5.6 5.6 0 0 1 11.2 0V19m1-5.2a4.8 4.8 0 0 1 6 4.7V19"/>',
 literacy:'<path d="M12 5.7a7.3 7.3 0 0 0-8-1V19a7.3 7.3 0 0 1 8 1m0-14.3a7.3 7.3 0 0 1 8-1V19a7.3 7.3 0 0 0-8 1V5.7Z"/>'
};
const LABELS={personal:'Личные',crypto:'Крипта',debts:'Долги',shared:'Совместные',literacy:'Грамотность'};
const $=id=>document.getElementById(id);
function actor(){return String(document.body?.dataset?.rudiActor||'Рустам')==='Диана'?'Диана':'Рустам'}
function moscowToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function key(){return 'rudi-literacy-read-v1:'+actor()}
function isRead(){try{return localStorage.getItem(key())===moscowToday()}catch{return false}}
function updateBadge(){
 const btn=document.querySelector('#financeTabs [data-finance-tab="literacy"]');
 const badge=btn?.querySelector('.rudi-literacy-unread');
 if(badge){badge.hidden=isRead();btn.setAttribute('aria-label',LABELS.literacy+(isRead()?'':' · новая статья'))}
 const readButton=$('rudiLiteracyReadButton');
 if(readButton){readButton.textContent=isRead()?'Прочитано':'Отметить прочитанным';readButton.disabled=isRead()}
}
function articleLoaded(){
 const title=$('financeLiteracyTitle')?.textContent?.trim()||'';
 const content=$('financeLiteracyBody')?.textContent?.trim()||'';
 return content.length>=500&&!/недоступн|Готовлю|загружа/i.test(title+' '+content.slice(0,90));
}
function renderReadButton(){
 const card=document.querySelector('#financeLiteracyPanel .finance-literacy-card');
 if(!card||!articleLoaded())return;
 let button=$('rudiLiteracyReadButton');
 if(!button){
   button=document.createElement('button');button.id='rudiLiteracyReadButton';
   button.type='button';button.className='rudi-literacy-read-button';
   button.addEventListener('click',()=>{
     if(!articleLoaded())return;
     try{localStorage.setItem(key(),moscowToday())}catch{}
     updateBadge();
     try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch{}
   });
   card.appendChild(button);
 }
 updateBadge();
}
function init(){
 const nav=$('financeTabs');
 if(!nav||nav.dataset.rudiIconsReady)return;
 // Render the finance bar alongside the main app tabbar, not inside the animated
 // finance page: CSS transforms on its ancestor otherwise break position:fixed.
 if(nav.parentElement!==document.body)document.body.appendChild(nav);
 nav.dataset.rudiIconsReady='1';nav.classList.add('rudi-finance-icon-nav');
 nav.querySelectorAll('[data-finance-tab]').forEach(btn=>{
   const name=btn.dataset.financeTab;
   if(!ICONS[name])return;
   btn.setAttribute('aria-label',LABELS[name]);btn.title=LABELS[name];
   btn.replaceChildren();
   const wrap=document.createElement('span');wrap.className='rudi-finance-icon';wrap.setAttribute('aria-hidden','true');
   wrap.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+ICONS[name]+'</svg>';
   btn.append(wrap);
   if(name==='literacy'){
     const badge=document.createElement('span');badge.className='rudi-literacy-unread';badge.setAttribute('aria-hidden','true');btn.append(badge);
   }
 });
 nav.addEventListener('click',event=>{
   if(event.target.closest('[data-finance-tab="literacy"]'))setTimeout(renderReadButton,350);
 });
 const body=$('financeLiteracyBody');
 if(body)new MutationObserver(()=>renderReadButton()).observe(body,{childList:true,subtree:true,characterData:true});
 const financePage=$('financePage');
 if(financePage){
   const updateVisible=()=>{
     const hidden=['is-personal-history','is-category-history','is-expense-history','is-income-history','is-capital-history']
       .some(name=>financePage.classList.contains(name));
     nav.classList.toggle('rudi-finance-nav-suppressed',hidden);
   };
   new MutationObserver(updateVisible).observe(financePage,{attributes:true,attributeFilter:['class']});
   updateVisible();
 }
 new MutationObserver(()=>updateBadge()).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor','data-app-tab']});
 window.addEventListener('pageshow',()=>{updateBadge();renderReadButton()});
 window.addEventListener('focus',()=>updateBadge());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateBadge()});
 updateBadge();renderReadButton();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
