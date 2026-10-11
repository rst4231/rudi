(()=>{'use strict';
  let actor='',wallets=[],connections=[],editingWalletId='',pending=false,loaded=false,lastAttempt=0;
  const $=id=>document.getElementById(id);
  const request=async(operation,payload={})=>{
    try{await Promise.resolve(window.__rudiTelegramSdkReady)}catch(_){}
    const initData=window.Telegram?.WebApp?.initData||'';
    const res=await fetch('/api/finances',{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,initData,...payload})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok){const err=new Error(String(data.error||'crypto-sync-unavailable'));err.status=res.status;throw err;}
    return data;
  };
  const providerName=name=>name==='bybit'?'Bybit':'Uniswap';
  const errorLabel=err=>{
    const code=String(err?.message||err||'');
    const messages={
      'crypto-bybit-readonly-required':'Ключ Bybit должен быть только для чтения. Создай Read-only API Key.',
      'crypto-bybit-api-rejected':'Bybit отклонил API-запрос. Проверь ключ, разрешения и IP-ограничения.',
      'crypto-bybit-access-blocked':'Bybit отклонил запрос (HTTP 403). Возможны ограничения страны, IP или доступа к Bybit.com. RUDI использует сервер в Европе.',
      'crypto-bybit-region-blocked':'Bybit ограничивает доступ для региона аккаунта или сервера. Проверь правила Bybit для своей страны.',
      'crypto-bybit-ip-mismatch':'Bybit: IP сервера RUDI не совпадает со списком разрешённых IP у ключа. Серверное подключение требует подходящего IP-доступа.',
      'crypto-bybit-key-invalid':'Bybit не распознал API Key. Проверь, для какого сайта он создан (Bybit.com, Bybit EU и т. д.), и не истёк ли срок.',
      'crypto-bybit-sign-invalid':'Bybit отклонил подпись API-запроса. Проверь пару API Key и API Secret.',
      'crypto-bybit-permission-denied':'Bybit запретил доступ к балансу. Проверь разрешения Read-only для чтения Unified Account.',
      'crypto-bybit-time-invalid':'Bybit отклонил временную метку запроса. Попробуй обновить позже.',
      'crypto-bybit-rate-limited':'Bybit временно ограничил частоту запросов. Повтори через минуту.',
      'crypto-bybit-network-unavailable':'Не удалось связаться с Bybit. Проверь доступность сервиса и попробуй позже.',
      'crypto-bybit-response-invalid':'Bybit вернул некорректный ответ. Баланс не изменён.',
      'crypto-credentials-invalid':'Проверь формат API Key и API Secret.',
      'crypto-address-invalid':'Нужен публичный EVM-адрес 0x и 40 символов.',
      'crypto-network-unsupported':'Выбери Ethereum Mainnet или Arbitrum One.',
      'crypto-network-rpc-mismatch':'RPC ответил из другой сети. Баланс не изменён.',
      'crypto-uniswap-scope-confirm-required':'Подтверди выбранную сеть и активы для автоматического учёта.',
      'crypto-lp-discovery-unavailable':'Индексатор Uniswap v4 недоступен. Данные найденных пулов v3 показаны отдельно, общий баланс сохранён.',
      'crypto-lp-discovery-incomplete':'Не удалось найти все позиции Uniswap v4. Старый баланс сохранён.',
      'crypto-lp-unsupported-token':'В одном из пулов есть неподдерживаемый токен. Общий баланс не обновлялся.',
      'crypto-lp-too-many':'Слишком много LP-позиций для одного обновления. Баланс сохранён.',
      'crypto-lp-fee-incomplete':'Не получилось прочитать всю сумму к получению из пула. Баланс сохранён.',
      'crypto-lp-ownership-changed':'Владелец одной из позиций изменился. Баланс не обновлён.',
      'crypto-lp-price-incomplete':'Недостаточно цен для оценки LP. Баланс сохранён.',
      'crypto-lp-pool-invalid':'Не удалось проверить состояние пула. Баланс сохранён.',
      'crypto-lp-position-inconsistent':'Данные пула изменились во время запроса. Повтори обновление.',
      'crypto-uniswap-lp-not-covered':'LP-позиция не оценена. Старый баланс сохранён.',
      'crypto-price-incomplete':'Некоторые монеты нельзя надёжно оценить. Баланс не менялся.',
      'crypto-price-unavailable':'Сейчас недоступны котировки ETH. Баланс сохранён, попробуй обновить позже.',
      'crypto-rpc-unavailable':'Не удалось связаться с Ethereum. Оба RPC-сервера недоступны. Баланс сохранён.',
      'crypto-provider-unavailable':'Внешний сервис API отклонил запрос. Баланс сохранён, попробуй обновить позже.',

      'crypto-wallet-usd-required':'Для автосинхронизации выбери валюту кошелька USD или USDT и сохрани изменения.',
      'crypto-wallet-credit-unsupported':'Кредитный счёт нельзя подключить как криптокошелёк.',
      'crypto-wallet-not-found':'Этот кошелёк удалён. Обнови страницу.',
      'crypto-bybit-balance-unavailable':'Bybit не вернул баланс Unified, старое значение сохранено.',
      'crypto-encryption-unavailable':'На сервере не настроено шифрование ключей.',
    };
    return messages[code]||'Не удалось получить баланс. Проверь соединение и доступ к API. Ручной баланс не изменён.';
  };
  const cash=n=>Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' $';
  const dateLabel=iso=>iso?new Date(iso).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Пока не обновлялся';
  const setStatus=(id,message)=>{const e=$(id);if(e)e.textContent=message||'';};
  function clearKeys(){for(const id of ['financeCryptoApiKey','financeCryptoApiSecret'])if($(id))$(id).value='';}
  function render(){
    const cards=$('financeCryptoCards');if(!cards)return;
    cards.replaceChildren();
    let total=0,complete=connections.length>0,knownTotal=0,hasKnown=false;
    for(const link of connections){
      const wallet=wallets.find(w=>w.id===link.walletId);
      if(!wallet){complete=false;continue;}
      if(link.lastError)complete=false;
      const card=document.createElement('article');card.className='finance-crypto-source-card';
      const head=document.createElement('div');head.className='finance-crypto-source-head';
      const title=document.createElement('strong');title.textContent=providerName(link.provider);
      const note=document.createElement('span');note.textContent=wallet.name+(link.provider==='uniswap'?' · '+(link.chain==='arbitrum'?'Arbitrum One':'Ethereum'):'');
      head.append(title,note);
      const amount=document.createElement('div');amount.className='finance-crypto-source-amount';
      if(typeof link.balanceUsd==='number'&&Number.isFinite(link.balanceUsd)){amount.textContent=cash(link.balanceUsd);total+=link.balanceUsd;knownTotal+=link.balanceUsd;hasKnown=true;}
      else if(link.incomplete&&typeof link.partialUsd==='number'&&Number.isFinite(link.partialUsd)){knownTotal+=link.partialUsd;hasKnown=true;
        amount.textContent='Проверено в v3: '+cash(link.partialUsd);complete=false;
      }
      else{
        amount.textContent=link.incomplete&&typeof link.partialUsd==='number'
          ?'Найдено в v3: '+cash(link.partialUsd)
          :'Баланс не получен';
        complete=false;
      }
      const detail=document.createElement('small');detail.textContent=link.incomplete
  ?'Проверка позиций v3: '+dateLabel(link.partialSyncAt)
  :'Последняя синхронизация: '+dateLabel(link.lastSyncAt);
      card.append(head,amount,detail);
      if(link.incomplete){
        const warning=document.createElement('p');
        warning.className='finance-crypto-warning';
        warning.textContent='Показаны только активные пулы v3. Сумма частичная: v4 не проверен. В кошельке «Личные» отображается оценка подтверждённой части.';
        card.append(warning);
      }
      if(link.provider==='uniswap'&&typeof link.walletUsd==='number'){
        const summary=document.createElement('div');summary.className='finance-crypto-breakdown';
        for(const [label,value] of [['На адресе',link.walletUsd],['В пулах',link.liquidityUsd],['К получению',link.feesUsd]]){
          const row=document.createElement('div');row.className='finance-crypto-breakdown-row';
          const name=document.createElement('span');name.textContent=label;
          const sum=document.createElement('strong');sum.textContent=typeof value==='number'?cash(value):'—';
          row.append(name,sum);summary.append(row);
        }
        card.append(summary);
        for(const pos of (Array.isArray(link.positions)?link.positions:[]).filter(pos=>Number(pos.liquidityUsd||0)+Number(pos.feesUsd||0)>0.005)){
          const box=document.createElement('div');box.className='finance-crypto-lp';
          const title=document.createElement('div');title.className='finance-crypto-lp-head';
          const name=document.createElement('strong');name.textContent='Uniswap '+pos.version+' · '+pos.pair+' · #'+pos.tokenId;
          const state=document.createElement('small');state.textContent=pos.inRange?'В диапазоне':'Вне диапазона';
          title.append(name,state);box.append(title);
          for(const [label,value] of [['Ликвидность',pos.liquidityUsd],['К получению',pos.feesUsd]]){
            const row=document.createElement('div');row.className='finance-crypto-lp-row';
            const name=document.createElement('span');name.textContent=label;
            const sum=document.createElement('b');sum.textContent=cash(value);
            row.append(name,sum);box.append(row);
          }
          if(pos.claimableIncludesPrincipal){
            const caveat=document.createElement('small');caveat.textContent='К получению может включать снятую ранее ликвидность — это не только комиссии.';box.append(caveat);
          }
          card.append(box);
        }
      }
      if(link.scope){const scope=document.createElement('small');scope.textContent=link.scope;card.append(scope);}
      if(link.provider==='uniswap'){
        const chain=link.chain==='arbitrum'?'arbitrum':'ethereum';
        const target=chain==='ethereum'?'arbitrum':'ethereum';
        const switchButton=document.createElement('button');
        switchButton.type='button';switchButton.className='finance-crypto-switch-chain';
        switchButton.textContent=chain==='ethereum'?'Пулы в Arbitrum? Переключить сеть':'Переключить на Ethereum Mainnet';
        switchButton.addEventListener('click',async()=>{
          switchButton.disabled=true;
          setStatus('financeCryptoStatus','Переключаю сеть и проверяю пулы…');
          try{
            await request('crypto-set-chain',{walletId:link.walletId,chain:target});
            await load();await refresh(true);
          }catch(err){setStatus('financeCryptoStatus',errorLabel(err));}
          finally{switchButton.disabled=false;}
        });
        card.append(switchButton);
      }

      if(link.lastError){const err=document.createElement('p');err.className='finance-crypto-error';err.textContent=errorLabel({message:link.lastError});card.append(err);}
      else if(link.warning){const warning=document.createElement('p');warning.className='finance-crypto-warning';warning.textContent=link.warning;card.append(warning);}
      if(link.address){const address=document.createElement('code');address.textContent=link.address.slice(0,8)+'…'+link.address.slice(-6);card.append(address);}
      cards.append(card);
    }
    if(!connections.length){const empty=document.createElement('p');empty.className='finance-crypto-empty';empty.textContent='Кошельки пока не подключены. Добавь API через редактор существующего кошелька.';cards.append(empty);}
    const amount=$('financeCryptoTotal'),label=$('financeCryptoUpdated');
    if(amount)amount.textContent=complete?cash(total):hasKnown?cash(knownTotal):'—';
    if(label)label.textContent=connections.length
      ?(complete?'Все подключённые источники · USD':hasKnown?'Подтверждённая часть портфеля · USD. Полный итог пока неизвестен':'Баланс пока не получен')
      :'Без выдуманных цифр: данные появятся после подключения';
    renderEditor();
  }
  function renderEditor(){
    const wrap=$('financeCryptoConnectWrap');if(!wrap)return;
    const wallet=wallets.find(w=>w.id===editingWalletId);
    wrap.hidden=actor!=='Рустам'||!wallet;
    if(wrap.hidden)return;
    const link=connections.find(row=>row.walletId===editingWalletId);
    const state=$('financeCryptoWalletState'),button=$('financeCryptoToggleConnect'),disconnect=$('financeCryptoDisconnectButton');
    if(state)state.textContent=link
      ? providerName(link.provider)+(link.provider==='uniswap'?' · '+(link.chain==='arbitrum'?'Arbitrum':'Ethereum'):'')+' · '+(
          link.incomplete&&typeof link.partialUsd==='number'
            ?'Найдено '+cash(link.partialUsd)+' (частично, v3) · '+dateLabel(link.partialSyncAt)
            :link.lastSyncAt?'Обновлён '+dateLabel(link.lastSyncAt)
            :link.lastError?errorLabel({message:link.lastError}):'Ожидает обновления'
        )
      :'Не подключён';
    if(button)button.textContent=link?'Изменить подключение':'Подключить API';
    if(disconnect)disconnect.hidden=!link;
  }
  async function load(){
    if(actor!=='Рустам'||pending)return;
    const data=await request('crypto-list');
    connections=Array.isArray(data.connections)?data.connections:[];loaded=true;render();
    return data;
  }
  async function refresh(force=false){
    if(actor!=='Рустам'||pending||!connections.length)return;
    const now=Date.now();
    if(!force&&now-lastAttempt<10*60*1000)return;
    pending=true;lastAttempt=now;const button=$('financeCryptoRefresh');
    if(button)button.disabled=true;
    setStatus('financeCryptoStatus','Обновляю баланс…');
    try{
      const result=await request('crypto-refresh',{force});
      connections=Array.isArray(result.connections)?result.connections:connections;
      if(Array.isArray(result.wallets))wallets=result.wallets;
      render();
      setStatus('financeCryptoStatus',connections.some(c=>c.lastError)?'Часть источников не обновилась. Сохранён предыдущий баланс.':'Баланс обновлён.');
      // The established finance refresh event invokes loadFinances() in app.js.
      // This updates the existing wallet tiles without touching history or ledger rows.
      document.dispatchEvent(new Event('rudi-finance-plan-saved'));
    }catch(err){setStatus('financeCryptoStatus',errorLabel(err));}
    finally{pending=false;if(button)button.disabled=false;}
  }
  function switchChain(){
    const arbitrum=$('financeCryptoChain')?.value==='arbitrum';
    const help=$('financeCryptoNetworkHelp'),label=$('financeCryptoScopeLabel');
    if(help)help.textContent=arbitrum?'Arbitrum One · поддерживаются WETH, USDT, нативный USDC и USDC.e, Uniswap v3/v4.':'Ethereum Mainnet · поддерживаются ETH, WETH, USDT, USDC, Uniswap v3/v4.';
    if(label)label.textContent='Подтверждаю учёт токенов и пулов Uniswap v3/v4 в '+(arbitrum?'Arbitrum One':'Ethereum Mainnet')+', включая суммы к получению. Другие сети не включать.';
    if($('financeCryptoSpotConsent'))$('financeCryptoSpotConsent').checked=false;
  }
  function switchProvider(){
    const uniswap=$('financeCryptoProvider')?.value==='uniswap';
    if($('financeCryptoBybitFields'))$('financeCryptoBybitFields').hidden=uniswap;
    if($('financeCryptoUniswapFields'))$('financeCryptoUniswapFields').hidden=!uniswap;
    if(uniswap)switchChain();
  }
  function onOpenWallet(ev){
    editingWalletId=String(ev.detail?.walletId||'');
    if($('financeCryptoConnectFields'))$('financeCryptoConnectFields').hidden=true;
    clearKeys();if($('financeCryptoSpotConsent'))$('financeCryptoSpotConsent').checked=false;setStatus('financeCryptoWalletStatus','');
    const wallet=wallets.find(w=>w.id===editingWalletId);
    const provider=/uniswap/i.test(wallet?.name||'')?'uniswap':'bybit';
    const existing=connections.find(c=>c.walletId===editingWalletId);
    if($('financeCryptoProvider'))$('financeCryptoProvider').value=existing?.provider||provider;
    if($('financeCryptoChain'))$('financeCryptoChain').value=existing?.chain||'ethereum';
    if($('financeCryptoAddress'))$('financeCryptoAddress').value=existing?.address||'';
    switchProvider();renderEditor();
  }
  function boot(){
    if(!$('financeCryptoPanel'))return;
    $('financeCryptoProvider')?.addEventListener('change',switchProvider);
    $('financeCryptoChain')?.addEventListener('change',switchChain);
    $('financeCryptoToggleConnect')?.addEventListener('click',()=>{
      const form=$('financeCryptoConnectFields');if(!form)return;form.hidden=!form.hidden;
      if(!form.hidden)$('financeCryptoProvider')?.focus();
    });
    $('financeCryptoRefresh')?.addEventListener('click',()=>void refresh(true));
    $('financeCryptoConnectButton')?.addEventListener('click',async()=>{
      const walletId=editingWalletId,provider=$('financeCryptoProvider')?.value||'bybit';
      if(!walletId||actor!=='Рустам')return;
      const button=$('financeCryptoConnectButton');if(button)button.disabled=true;
      setStatus('financeCryptoWalletStatus','Проверяю подключение…');
      try{
        const payload=provider==='bybit'
          ?{apiKey:$('financeCryptoApiKey')?.value,apiSecret:$('financeCryptoApiSecret')?.value}
          :{address:$('financeCryptoAddress')?.value,
             chain:$('financeCryptoChain')?.value||'ethereum',
             scopeConfirm:$('financeCryptoSpotConsent')?.checked
              ?($('financeCryptoChain')?.value==='arbitrum'?'arbitrum-one-including-lp':'ethereum-mainnet-including-lp'):''};
        await request('crypto-connect',{walletId,provider,...payload});
        clearKeys();if($('financeCryptoConnectFields'))$('financeCryptoConnectFields').hidden=true;
        await load();
        setStatus('financeCryptoWalletStatus','Подключено. Проверяю баланс…');
        await refresh(true);
        if(!connections.find(c=>c.walletId===walletId)?.lastError)setStatus('financeCryptoWalletStatus','Готово. Автоматическое обновление включено.');
      }catch(err){setStatus('financeCryptoWalletStatus',errorLabel(err));}
      finally{if(button)button.disabled=false;}
    });
    $('financeCryptoDisconnectButton')?.addEventListener('click',async()=>{
      if(!editingWalletId||actor!=='Рустам')return;
      const button=$('financeCryptoDisconnectButton');if(button)button.disabled=true;
      setStatus('financeCryptoWalletStatus','Отключаю…');
      try{await request('crypto-disconnect',{walletId:editingWalletId});await load();setStatus('financeCryptoWalletStatus','Отключено. Последний баланс оставлен без изменений.');}
      catch(err){setStatus('financeCryptoWalletStatus',errorLabel(err));}
      finally{if(button)button.disabled=false;}
    });
    // Keep this integration isolated from the large core app.js bundle.
    // Capture crypto-tab clicks before the legacy four-tab controller.
    document.addEventListener('click',event=>{
      const btn=event.target.closest?.('[data-finance-tab="crypto"]');
      if(!btn||actor!=='Рустам')return;
      event.preventDefault();event.stopPropagation();
      document.querySelectorAll('[data-finance-tab]').forEach(tab=>{
        const selected=tab===btn;tab.classList.toggle('is-active',selected);tab.setAttribute('aria-selected',selected?'true':'false');
      });
      document.querySelectorAll('[data-finance-panel]').forEach(panel=>{panel.hidden=panel.dataset.financePanel!=='crypto';});
      const page=$('financePage');if(page)page.dataset.financeTone='crypto';
      document.body.dataset.financeTone='crypto';
      void load().then(()=>refresh(false)).catch(err=>setStatus('financeCryptoStatus',errorLabel(err)));
      try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
    },true);
    // The wallet editor is opened by the existing finance code. Track only the
    // selected wallet ID on the already-present tile, without changing its handlers.
    const walletList=$('financeWalletList'),modal=$('financeWalletComposer');
    const markWallet=event=>{
      const tile=event.target.closest?.('.finance-wallet-item');
      if(tile?.dataset.walletId)editingWalletId=tile.dataset.walletId;
      else if(event.target.closest?.('#financeWalletCreateButton'))editingWalletId='';
    };
    walletList?.addEventListener('pointerdown',markWallet,true);
    walletList?.addEventListener('click',markWallet,true);
    walletList?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')markWallet(event);},true);
    if(modal)new MutationObserver(()=>{
      if(!modal.hidden&&modal.getAttribute('aria-hidden')!=='true')onOpenWallet({detail:{walletId:editingWalletId}});
    }).observe(modal,{attributes:true,attributeFilter:['hidden','aria-hidden']});
    document.addEventListener('rudi-finances-updated',async(ev)=>{
      actor=String(ev.detail?.actor||'');
      wallets=Array.isArray(ev.detail?.wallets)?ev.detail.wallets:[];
      const tab=document.querySelector('[data-finance-tab="crypto"]');
      if(tab)tab.hidden=actor!=='Рустам';
      if(actor!=='Рустам'){connections=[];loaded=false;render();return;}
      try{if(!loaded)await load();render();if(connections.length&&document.visibilityState==='visible'&&!$('financePage')?.hidden)await refresh(false);}
      catch(err){setStatus('financeCryptoStatus',errorLabel(err));}
    });
    const auto=()=>{if(actor==='Рустам'&&connections.length&&!$('financePage')?.hidden&&document.visibilityState==='visible')void refresh(false);};
    document.addEventListener('visibilitychange',auto);
    window.addEventListener('online',auto);
    setInterval(auto,60*1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();