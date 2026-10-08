(() => {
  'use strict';
  const API='/api/index?route=recommendations';
  const tile=document.getElementById('rudiRecommendationsTile');
  const list=document.getElementById('rudiRecommendationsList');
  if(!tile||!list)return;
  let actor='',lastLoad=0,inFlight=null,activeItems=[];
  const tg=window.Telegram?.WebApp;
  const timeout=10000;
  async function request(operation='list',extra={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(API,{
        method:'POST',headers:{'Content-Type':'application/json'},
        credentials:'same-origin',cache:'no-store',signal:controller.signal,
        body:JSON.stringify({operation,initData:tg?.initData||'',...extra})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(String(data?.error||'recommendations-request-failed'));
      return data;
    }finally{clearTimeout(timer)}
  }
  function node(tag,className,text){
    const element=document.createElement(tag);
    if(className)element.className=className;
    if(text!==undefined)element.textContent=text;
    return element;
  }
  function destination(item){
    if(item.tab==='car'&&actor!=='Рустам')return;
    if(item.tab!=='home'&&typeof window.RUDI_NAVIGATE_TO_TAB==='function'){
      window.RUDI_NAVIGATE_TO_TAB(item.tab,{scroll:true});
      return;
    }
    if(typeof window.RUDI_NAVIGATE_TO_TAB==='function')window.RUDI_NAVIGATE_TO_TAB('home',{scroll:true});
    const target=document.querySelector('[data-home-tile="'+(item.target==='smart-home'?'smart-home':'priority')+'"]');
    if(target)setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'center'}),90);
  }
  function render(items){
    activeItems=items;
    list.replaceChildren();
    // Main navigation restores home tiles by [data-home-empty], not by hidden alone.
    // Keep both signals in sync so empty recommendations never reappear as a blank card.
    const empty=items.length===0;
    tile.dataset.homeEmpty=empty?'1':'0';
    tile.hidden=empty;
    for(const item of items){
      const row=node('article','rudi-recommendation-row');
      row.dataset.recommendationId=item.id;
      const symbol=node('span','rudi-recommendation-icon',item.icon||'•');
      symbol.setAttribute('aria-hidden','true');
      const copy=node('div','rudi-recommendation-copy');
      const heading=node('strong','rudi-recommendation-title',item.title);
      const detail=node('p','rudi-recommendation-detail',item.detail);
      const controls=node('div','rudi-recommendation-actions');
      const action=node('button','rudi-recommendation-open',item.action||'Открыть');
      action.type='button';action.addEventListener('click',()=>destination(item));
      const later=node('button','rudi-recommendation-secondary','Позже');
      later.type='button';later.setAttribute('aria-label','Напомнить позже: '+item.title);
      later.addEventListener('click',()=>feedback('snooze',item.id,later));
      const hide=node('button','rudi-recommendation-secondary','Скрыть');
      hide.type='button';hide.setAttribute('aria-label','Скрыть рекомендацию: '+item.title);
      hide.addEventListener('click',()=>feedback('hide',item.id,hide));
      controls.append(action,later,hide);copy.append(heading,detail,controls);row.append(symbol,copy);list.append(row);
    }
  }
  async function feedback(operation,id,button){
    if(button.disabled)return;
    button.disabled=true;
    try{
      await request(operation,{id});
      render(activeItems.filter(item=>item.id!==id));
    }catch(error){
      button.disabled=false;
      button.textContent='Ошибка, повтори';
      console.warn('RUDI_RECOMMENDATIONS_FEEDBACK',String(error?.message||error));
    }
  }
  async function refresh(force=false){
    const current=String(document.body?.dataset?.rudiActor||'');
    if(!document.body.classList.contains('auth-ok')||!['Рустам','Диана'].includes(current))return;
    if(actor!==current){actor=current;lastLoad=0;render([]);}
    if(inFlight)return inFlight;
    if(!force&&Date.now()-lastLoad<10*60*1000)return;
    inFlight=(async()=>{
      try{
        const data=await request();
        if(document.body.dataset.rudiActor!==actor)return;
        render(Array.isArray(data.recommendations)?data.recommendations:[]);
        lastLoad=Date.now();
      }catch(error){
        console.warn('RUDI_RECOMMENDATIONS_LOAD',String(error?.message||error));
        // Fail closed: never display stale or invented alerts when the source is unavailable.
        render([]);
      }finally{inFlight=null;}
    })();
    return inFlight;
  }
  const observer=new MutationObserver(()=>{if(document.body.classList.contains('auth-ok'))refresh()});
  observer.observe(document.body,{attributes:true,attributeFilter:['class','data-rudi-actor']});
  if(document.body.classList.contains('auth-ok'))refresh();
  window.addEventListener('focus',()=>refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  document.addEventListener('rudi-finance-plan-saved',()=>refresh(true));
  const interval=setInterval(()=>{if(!document.hidden)refresh()},10*60*1000);
  window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
  window.RUDI_RECOMMENDATIONS={refresh};
})();
