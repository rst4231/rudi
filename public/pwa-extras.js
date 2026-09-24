(() => {
  'use strict';

  const byId=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize=value=>String(value??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();

  function routeTo(tab,item=''){
    try{
      const url=new URL(window.location.href);
      if(tab&&tab!=='home') url.searchParams.set('tab',tab);
      else url.searchParams.delete('tab');
      if(item&&(tab==='wishlist'||tab==='products')) url.searchParams.set('item',String(item));
      else url.searchParams.delete('item');
      const target=url.pathname+(url.search||'')+(url.hash||'');
      const current=window.location.pathname+window.location.search+window.location.hash;
      if(target!==current) history.pushState({rudiTab:tab||'home',rudiItem:item||''},'',target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }catch(_){}
  }

  function showMiniToast(text){
    let toast=byId('rudiMiniToast');
    if(!toast){
      toast=document.createElement('div');
      toast.id='rudiMiniToast';
      toast.className='rudi-mini-toast';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      document.body.appendChild(toast);
    }
    toast.textContent=String(text||'');
    toast.classList.add('is-open');
    clearTimeout(showMiniToast.timer);
    showMiniToast.timer=setTimeout(()=>toast.classList.remove('is-open'),1800);
  }

  async function systemShare({title='RUDI',text='',url=''}={}){
    const payload={title:String(title||'RUDI')};
    if(text) payload.text=String(text);
    if(url) payload.url=String(url);
    try{
      if(typeof navigator.share==='function'){
        await navigator.share(payload);
        return true;
      }
    }catch(error){
      if(String(error?.name||'')==='AbortError') return false;
    }
    const fallback=[payload.text,payload.url].filter(Boolean).join('\n');
    try{
      await navigator.clipboard.writeText(fallback||payload.title);
      showMiniToast('Скопировано');
      return true;
    }catch(_){
      showMiniToast('Не удалось поделиться');
      return false;
    }
  }

  function installServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(error=>{
        console.warn('RUDI_SW_REGISTER_WARN',String(error?.message||error));
      });
    },{once:true});
  }

  function installConnectivityBanner(){
    let banner=byId('rudiOfflineBanner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='rudiOfflineBanner';
      banner.className='rudi-offline-banner';
      banner.setAttribute('role','status');
      banner.setAttribute('aria-live','polite');
      banner.textContent='Нет сети · RUDI работает из сохранённых данных';
      banner.hidden=true;
      document.body.appendChild(banner);
    }
    const sync=()=>{
      const offline=navigator.onLine===false;
      banner.hidden=!offline;
      document.body.classList.toggle('rudi-offline',offline);
      if(!offline) document.body.dataset.offlineMode='0';
    };
    window.addEventListener('online',sync);
    window.addEventListener('offline',sync);
    sync();
  }

  async function syncAppBadge(){
    if(!('setAppBadge' in navigator)||!('clearAppBadge' in navigator)) return;
    const unread=[
      byId('homeActivityNotificationDot'),
      byId('feedTabBadge')
    ].filter(node=>node&&!node.hidden).length;
    try{
      if(unread>0) await navigator.setAppBadge(unread);
      else await navigator.clearAppBadge();
    }catch(_){}
  }

  function installBadgeSync(){
    const observer=new MutationObserver(()=>syncAppBadge());
    const bind=()=>{
      ['homeActivityNotificationDot','feedTabBadge'].forEach(id=>{
        const node=byId(id);
        if(node&&!node.dataset.badgeObserved){
          node.dataset.badgeObserved='1';
          observer.observe(node,{attributes:true,attributeFilter:['hidden','class']});
        }
      });
      syncAppBadge();
    };
    bind();
    const rootObserver=new MutationObserver(bind);
    rootObserver.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') syncAppBadge()});
  }

  function collectSearchEntries(){
    const entries=[];
    const seen=new Set();
    const add=(entry)=>{
      const title=String(entry.title||'').trim();
      const text=String(entry.text||'').replace(/\s+/g,' ').trim();
      if(!title&&!text) return;
      const key=[entry.tab,entry.item,title,text.slice(0,120)].join('|');
      if(seen.has(key)) return;
      seen.add(key);
      entries.push({...entry,title,text,haystack:normalize(title+' '+text)});
    };

    document.querySelectorAll('.product-item').forEach(node=>{
      add({tab:'products',item:node.dataset.rudiItemId||'',kind:'Кухня',title:node.querySelector('.product-text')?.textContent||'',text:node.querySelector('.product-weekly-amount')?.textContent||'',node});
    });
    document.querySelectorAll('.wish-item').forEach(node=>{
      add({tab:'wishlist',item:node.dataset.rudiItemId||'',kind:'Вишлист',title:node.querySelector('.wish-text')?.textContent||'',text:node.getAttribute('aria-label')||'',node});
    });
    document.querySelectorAll('.feed-card').forEach(node=>{
      add({tab:'feed',kind:'Лента',title:node.querySelector('.feed-card-heading > span')?.textContent||'Лента',text:node.querySelector('.feed-card-body')?.textContent||'',node});
    });
    document.querySelectorAll('.shared-album-photo img').forEach(node=>{
      add({tab:'photos',kind:'Фото',title:String(node.alt||'Фото'),text:node.closest('.shared-album-photo')?.getAttribute('aria-label')||'',node:node.closest('.shared-album-photo')});
    });
    document.querySelectorAll('.calendar-day-cell').forEach(node=>{
      add({tab:'schedule',kind:'Календарь',title:node.getAttribute('aria-label')||node.title||'Дата',text:node.title||'',node});
    });
    document.querySelectorAll('[data-home-tile]').forEach(node=>{
      const title=node.querySelector('h1,h2,.section-heading h2,.home-dashboard-label,.partner-title,.home-nearest-title')?.textContent||node.getAttribute('aria-label')||'';
      if(title) add({tab:'home',kind:'Главная',title,text:node.textContent||'',node});
    });
    return entries;
  }

  function ensureSearchOverlay(){
    let overlay=byId('rudiSearchOverlay');
    if(overlay) return overlay;
    overlay=document.createElement('div');
    overlay.id='rudiSearchOverlay';
    overlay.className='rudi-search-overlay';
    overlay.hidden=true;
    overlay.innerHTML=
      '<button class="rudi-overlay-backdrop" type="button" aria-label="Закрыть поиск"></button>'+
      '<section class="rudi-search-dialog" role="dialog" aria-modal="true" aria-label="Поиск по RUDI">'+
        '<div class="rudi-search-head">'+
          '<div class="rudi-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg><input id="rudiSearchInput" type="search" autocomplete="off" placeholder="Поиск по RUDI…" aria-label="Поиск по RUDI"></div>'+
          '<button id="rudiSearchClose" class="rudi-search-close" type="button" aria-label="Закрыть">×</button>'+
        '</div>'+
        '<div id="rudiSearchHint" class="rudi-search-hint">Ищет по продуктам, желаниям, ленте, фото и календарю</div>'+
        '<div id="rudiSearchResults" class="rudi-search-results"></div>'+
      '</section>';
    document.body.appendChild(overlay);

    const close=()=>{
      overlay.classList.remove('is-open');
      setTimeout(()=>{if(!overlay.classList.contains('is-open')) overlay.hidden=true},180);
      document.body.classList.remove('rudi-modal-open');
    };
    const open=()=>{
      overlay.hidden=false;
      document.body.classList.add('rudi-modal-open');
      requestAnimationFrame(()=>overlay.classList.add('is-open'));
      const input=byId('rudiSearchInput');
      input.value='';
      renderSearch('');
      setTimeout(()=>input.focus({preventScroll:true}),60);
    };
    overlay.openSearch=open;
    overlay.closeSearch=close;
    overlay.querySelector('.rudi-overlay-backdrop')?.addEventListener('click',close);
    byId('rudiSearchClose')?.addEventListener('click',close);
    byId('rudiSearchInput')?.addEventListener('input',event=>renderSearch(event.target.value));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!overlay.hidden) close();
      if((event.metaKey||event.ctrlKey)&&String(event.key).toLowerCase()==='k'){
        event.preventDefault();
        open();
      }
    });

    function renderSearch(value){
      const host=byId('rudiSearchResults');
      const hint=byId('rudiSearchHint');
      if(!host) return;
      const query=normalize(value);
      host.replaceChildren();
      if(!query){
        if(hint) hint.hidden=false;
        return;
      }
      if(hint) hint.hidden=true;
      const terms=query.split(' ').filter(Boolean);
      const matches=collectSearchEntries()
        .filter(entry=>terms.every(term=>entry.haystack.includes(term)))
        .slice(0,24);
      if(!matches.length){
        const empty=document.createElement('div');
        empty.className='rudi-search-empty';
        empty.textContent='Ничего не найдено';
        host.appendChild(empty);
        return;
      }
      matches.forEach(entry=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='rudi-search-result';
        button.innerHTML='<span class="rudi-search-kind">'+esc(entry.kind)+'</span><strong>'+esc(entry.title||entry.kind)+'</strong>'+(entry.text&&entry.text!==entry.title?'<small>'+esc(entry.text.slice(0,150))+'</small>':'');
        button.addEventListener('click',()=>{
          const node=entry.node;
          close();
          routeTo(entry.tab,entry.item||'');
          setTimeout(()=>{
            if(node?.isConnected){
              node.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
              node.classList.add('rudi-search-target');
              setTimeout(()=>node.classList.remove('rudi-search-target'),1400);
            }
          },300);
        });
        host.appendChild(button);
      });
    }
    return overlay;
  }

  function installSearchButton(){
    const tools=document.querySelector('.home-dashboard-tools');
    if(!tools||byId('rudiSearchButton')) return false;
    const button=document.createElement('button');
    button.id='rudiSearchButton';
    button.className='rudi-search-button';
    button.type='button';
    button.setAttribute('aria-label','Поиск по RUDI');
    button.title='Поиск';
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
    const settings=byId('homeSettings');
    tools.insertBefore(button,settings||null);
    button.addEventListener('click',()=>ensureSearchOverlay().openSearch());
    return true;
  }

  function ensureQuickAdd(){
    if(byId('rudiQuickAdd')) return;
    const button=document.createElement('button');
    button.id='rudiQuickAdd';
    button.className='rudi-quick-add';
    button.type='button';
    button.setAttribute('aria-label','Быстро добавить');
    button.setAttribute('aria-expanded','false');
    button.innerHTML='<span aria-hidden="true">+</span>';
    document.body.appendChild(button);

    const sheet=document.createElement('div');
    sheet.id='rudiQuickAddSheet';
    sheet.className='rudi-quick-sheet';
    sheet.hidden=true;
    sheet.innerHTML=
      '<button class="rudi-overlay-backdrop" type="button" aria-label="Закрыть быстрые действия"></button>'+
      '<section class="rudi-quick-dialog" role="dialog" aria-modal="true" aria-label="Быстро добавить">'+
        '<div class="rudi-quick-title">Быстро добавить</div>'+
        '<div class="rudi-quick-actions">'+
          '<button type="button" data-rudi-quick="product"><span>🛒</span><strong>Продукт</strong></button>'+
          '<button type="button" data-rudi-quick="wish"><span>♡</span><strong>Желание</strong></button>'+
          '<button type="button" data-rudi-quick="message"><span>💌</span><strong>Послание</strong></button>'+
        '</div>'+
      '</section>';
    document.body.appendChild(sheet);

    const close=()=>{
      sheet.classList.remove('is-open');
      button.setAttribute('aria-expanded','false');
      setTimeout(()=>{if(!sheet.classList.contains('is-open')) sheet.hidden=true},180);
      document.body.classList.remove('rudi-modal-open');
    };
    const open=()=>{
      sheet.hidden=false;
      button.setAttribute('aria-expanded','true');
      document.body.classList.add('rudi-modal-open');
      requestAnimationFrame(()=>sheet.classList.add('is-open'));
    };
    button.addEventListener('click',()=>sheet.hidden?open():close());
    sheet.querySelector('.rudi-overlay-backdrop')?.addEventListener('click',close);
    sheet.querySelectorAll('[data-rudi-quick]').forEach(action=>{
      action.addEventListener('click',()=>{
        const type=action.dataset.rudiQuick;
        close();
        if(type==='product'){
          routeTo('products');
          setTimeout(()=>byId('productsInput')?.focus(),260);
        }else if(type==='wish'){
          routeTo('wishlist');
          setTimeout(()=>byId('wishlistInput')?.focus(),260);
        }else if(type==='message'){
          routeTo('home');
          setTimeout(()=>byId('partnerEditButton')?.click(),260);
        }
      });
    });
  }

  function installPhotoShare(){
    const footer=document.querySelector('.photo-viewer-footer');
    if(!footer||byId('photoViewerShare')) return false;
    const button=document.createElement('button');
    button.id='photoViewerShare';
    button.className='photo-viewer-share';
    button.type='button';
    button.innerHTML='<span>Поделиться</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 11v8h14v-8"/></svg>';
    const original=byId('photoViewerOriginal');
    footer.insertBefore(button,original||null);
    button.addEventListener('click',()=>{
      const image=byId('photoViewerImage');
      const caption=byId('photoViewerCaption');
      systemShare({
        title:'Фото из RUDI',
        text:caption&&!caption.hidden?caption.textContent:'',
        url:String(image?.currentSrc||image?.src||window.location.href)
      });
    });
    return true;
  }

  function installRecipeShare(){
    const details=byId('recipeDetails');
    const head=details?.querySelector('.recipe-detail-head');
    if(!details||!head||head.querySelector('.recipe-share-button')) return false;
    const button=document.createElement('button');
    button.className='recipe-share-button';
    button.type='button';
    button.setAttribute('aria-label','Поделиться рецептом');
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 11v8h14v-8"/></svg>';
    button.addEventListener('click',()=>{
      const title=head.querySelector('h3')?.textContent||'Рецепт RUDI';
      const summary=details.querySelector('.recipe-detail-summary')?.textContent||'';
      const url=new URL(window.location.href); url.searchParams.set('tab','products');
      systemShare({title,text:summary,url:url.toString()});
    });
    head.appendChild(button);
    return true;
  }

  function installWishlistShare(){
    document.querySelectorAll('.wish-item').forEach(row=>{
      if(row.querySelector('.wish-share')) return;
      const button=document.createElement('button');
      button.className='wish-share';
      button.type='button';
      button.setAttribute('aria-label','Поделиться желанием');
      button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 11v8h14v-8"/></svg>';
      button.addEventListener('click',event=>{
        event.stopPropagation();
        const title=row.querySelector('.wish-text')?.textContent||'Желание';
        const url=new URL(window.location.href);
        url.searchParams.set('tab','wishlist');
        const id=String(row.dataset.rudiItemId||'');
        if(id) url.searchParams.set('item',id);
        systemShare({title:'Вишлист RUDI',text:title,url:url.toString()});
      });
      const remove=row.querySelector('.wish-remove');
      row.insertBefore(button,remove||null);
    });
  }

  function installDynamicExtras(){
    installSearchButton();
    ensureQuickAdd();
    installPhotoShare();
    installRecipeShare();
    installWishlistShare();
  }

  installServiceWorker();
  installConnectivityBanner();
  installBadgeSync();
  ensureSearchOverlay();
  installDynamicExtras();

  const observer=new MutationObserver(()=>installDynamicExtras());
  observer.observe(document.body,{childList:true,subtree:true});
})();