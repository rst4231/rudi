(()=>{'use strict';

  if(window.__RUDI_APP_BADGE_EXTRAS__)return;
  window.__RUDI_APP_BADGE_EXTRAS__=true;

  const nativeSet=typeof navigator.setAppBadge==='function'?navigator.setAppBadge.bind(navigator):null;
  const nativeClear=typeof navigator.clearAppBadge==='function'?navigator.clearAppBadge.bind(navigator):null;
  if(!nativeSet&&!nativeClear)return;

  let baseCount=0;
  let syncQueued=false;
  const observed=new WeakSet();
  const badgeObserver=new MutationObserver(()=>queueSync());
  const rootObserver=new MutationObserver(()=>bindBadges());

  function visible(node){
    return Boolean(node&&!node.hidden&&node.getAttribute('aria-hidden')!=='true');
  }

  function badgeCount(node){
    if(!visible(node))return 0;
    const parsed=Number.parseInt(String(node.textContent||'').trim(),10);
    return Number.isFinite(parsed)&&parsed>0?parsed:1;
  }

  function extraCount(){
    const habit=document.querySelector('#habitHomeTile .personal-home-reminder-badge');
    const supplements=document.querySelector('#supplementsHomeTile .personal-home-reminder-badge');
    return Math.min(99,badgeCount(habit)+badgeCount(supplements));
  }

  async function applyBadge(){
    syncQueued=false;
    const total=Math.min(99,Math.max(0,baseCount)+extraCount());
    try{
      if(total>0&&nativeSet)await nativeSet(total);
      else if(nativeClear)await nativeClear();
      else if(nativeSet)await nativeSet(0);
    }catch(_){}
  }

  function queueSync(){
    if(syncQueued)return;
    syncQueued=true;
    Promise.resolve().then(applyBadge);
  }

  function bindBadges(){
    document.querySelectorAll(
      '#habitHomeTile .personal-home-reminder-badge, #supplementsHomeTile .personal-home-reminder-badge'
    ).forEach(node=>{
      if(observed.has(node))return;
      observed.add(node);
      badgeObserver.observe(node,{attributes:true,attributeFilter:['hidden','class','aria-hidden'],childList:true,characterData:true,subtree:true});
    });
    queueSync();
  }

  function installNavigatorWrapper(name,fn){
    try{navigator[name]=fn;if(navigator[name]===fn)return true}catch(_){}
    try{Object.defineProperty(navigator,name,{configurable:true,value:fn});return navigator[name]===fn}catch(_){}
    return false;
  }

  if(nativeSet){
    installNavigatorWrapper('setAppBadge',async value=>{
      const parsed=Math.floor(Number(value)||0);
      baseCount=Math.min(99,Math.max(0,parsed));
      await applyBadge();
    });
  }

  if(nativeClear){
    installNavigatorWrapper('clearAppBadge',async()=>{
      baseCount=0;
      await applyBadge();
    });
  }

  const start=()=>{
    bindBadges();
    if(document.documentElement)rootObserver.observe(document.documentElement,{childList:true,subtree:true});
    try{window.dispatchEvent(new CustomEvent('rudi:attention-change',{detail:{source:'app-badge-extras-init'}}))}catch(_){}
    setTimeout(queueSync,250);
  };

  window.addEventListener('rudi:attention-change',()=>setTimeout(queueSync,0));
  window.addEventListener('focus',queueSync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueSync()});

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();