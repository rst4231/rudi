/* iOS installed apps can report a viewport shorter than their translucent window. */
(()=>{'use strict';
 const root=document.documentElement;
 function sync(){
  const view=window.visualViewport;
  const layout=Math.max(window.innerHeight||0,root.clientHeight||0);
  const typing=!!document.activeElement?.matches?.('input,textarea,[contenteditable="true"]');
  const keyboard=typing&&view&&layout-view.height>130;
  const installed=navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
  const iphone=/iPhone|iPod/.test(navigator.userAgent);
  // black-translucent is declared in index.html, so the installed window includes the status bar.
  const full=installed&&iphone?Math.max(layout,window.screen.height):layout;
  root.style.setProperty('--rudi-viewport-height',Math.round(keyboard?view.height:full)+'px');
 }
 sync();
 for(const event of ['resize','orientationchange','pageshow'])window.addEventListener(event,sync,{passive:true});
 for(const event of ['resize','scroll'])window.visualViewport?.addEventListener(event,sync,{passive:true});
 for(const event of ['focusin','focusout','visibilitychange'])document.addEventListener(event,()=>requestAnimationFrame(sync));
 window.RudiViewport={sync};
})();

/* Mobile portrait policy. Keyboard resizing is not device rotation. */
(()=>{'use strict';
 const screen=window.screen;
 const phone=/iPhone|iPod/.test(navigator.userAgent)||
   (window.matchMedia?.('(pointer:coarse)').matches&&Math.min(screen.width||Infinity,screen.height||Infinity)<=600);
 if(!phone)return;
 let guard=null,locked=false,locking=false,telegramLocked=false;
 function landscape(){
  const type=String(screen.orientation?.type||'');
  if(type)return type.startsWith('landscape');
  return typeof window.orientation==='number'&&Math.abs(window.orientation)===90;
 }
 function nativeLock(){
  if(locked||locking||typeof screen.orientation?.lock!=='function')return;
  locking=true;
  try{Promise.resolve(screen.orientation.lock('portrait')).then(()=>{locked=true;},()=>{}).finally(()=>{locking=false;});}
  catch(_){locking=false;}
 }
 function sync(){
  if(!document.body)return;
  if(!guard){
   guard=document.createElement('div');guard.id='rudiPortraitGuard';
   guard.setAttribute('role','status');guard.setAttribute('aria-live','polite');
   guard.innerHTML='<span aria-hidden="true">↻</span><strong>Поверните телефон вертикально</strong><small>РуДи работает в портретном режиме</small>';
   document.body.appendChild(guard);
  }
  const sideways=landscape();
  document.body.dataset.rudiPortraitBlocked=sideways?'1':'0';
  guard.setAttribute('aria-hidden',sideways?'false':'true');
  const tg=window.Telegram?.WebApp;
  if(!sideways&&!telegramLocked&&tg?.initData&&typeof tg.lockOrientation==='function'&&tg.isVersionAtLeast?.('8.0')){
   try{tg.lockOrientation();telegramLocked=true;}catch(_){}
  }
 }
 const resume=()=>{if(!document.hidden){nativeLock();sync();}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resume,{once:true});else resume();
 window.addEventListener('orientationchange',sync,{passive:true});
 screen.orientation?.addEventListener?.('change',sync);
 window.addEventListener('pageshow',resume,{passive:true});
 document.addEventListener('visibilitychange',resume);
 document.addEventListener('fullscreenchange',resume);
 document.addEventListener('pointerup',resume,{once:true,passive:true});
 Promise.resolve(window.__rudiTelegramSdkReady).then(sync).catch(()=>{});
})();
