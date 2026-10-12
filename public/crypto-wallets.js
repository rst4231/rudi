(()=>{'use strict';
  let actor='',wallets=[],connections=[],editingWalletId='',pending=false,loaded=false,lastAttempt=0;
  let pnl24h=null,pnlFlight=null,sourceSyncId='';
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
  const providerName=name=>name==='bybit'?'Bybit':name==='trust'?'Trust Wallet':'Uniswap';
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
      'crypto-auto-amount-unsupported':'Автоматический расчёт доступен для переводов USDT в USD/USDT-кошелёк. Выбери подходящий кошелёк.',
      'crypto-bybit-balance-unavailable':'Bybit не вернул баланс Unified, старое значение сохранено.',
      'crypto-encryption-unavailable':'На сервере не настроено шифрование ключей.',
    };
    return messages[code]||'Не удалось получить баланс. Проверь соединение и доступ к API. Ручной баланс не изменён.';
  };
  const cash=n=>Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' $';
  const dateLabel=iso=>iso?new Date(iso).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Пока не обновлялся';
  const setStatus=(id,message)=>{const e=$(id);if(e)e.textContent=message||'';};
  function clearKeys(){for(const id of ['financeCryptoApiKey','financeCryptoApiSecret'])if($(id))$(id).value='';}
  const pnlUnavailable=(p,period)=>{
    if(!p)return 'проверяю историю';
    const issue={
      'crypto-bybit-coverage-incomplete':'не все счета Bybit учтены',
      'crypto-trust-coverage-incomplete':'не все активы Trust Wallet учтены',
      'crypto-lp-discovery-unavailable':'не все LP-позиции Uniswap учтены',
      'crypto-refresh-deferred':'обновление отложено'
    }[p.issue];
    const missingMonth=p.reason==='month-baseline-missing'||
      p.underlyingReason==='month-baseline-missing';
    if(period==='month'&&missingMonth)return 'нет полного снимка за 1-е число';
    if(p.reason==='incomplete-balance'){
      if(issue)return issue;
      if(p.missingSources)return 'неполный баланс '+p.missingSources+' из '+p.totalSources+' источников';
      return 'баланс неполный';
    }
    if(p.reason==='partial-history')return 'только неполные снимки';
    if(p.reason==='history-too-short')return 'история '+(p.historyHours||0)+' из 24 ч';
    if(p.reason==='baseline-missing')return 'нет полного снимка 24 ч назад';
    if(p.reason==='last-sync-stale')return 'нет свежего баланса';
    if(p.reason==='first-day-insufficient-history')return 'месяц только начался';
    if(p.reason==='month-baseline-missing')return 'нет полного снимка за 1-е число';
    if(p.reason==='history-unavailable')return 'история временно недоступна';
    if(p.reason==='no-history')return 'история ещё не накоплена';
    return 'недостаточно полных снимков';
  };
  const pnlText=(p,period='day')=>{
    const label=period==='month'?'За месяц':'За 24 ч';
    if(!p?.available)return label+': '+pnlUnavailable(p,period);
    return label+': '+(p.deltaUsd>0?'+':'')+cash(p.deltaUsd)+
      ' ('+(p.percent>0?'+':'')+p.percent.toFixed(2)+'%)';
  };
  const pnlBadge=(p,period='day')=>{
    const el=document.createElement('small');el.className='finance-crypto-pnl';
    el.textContent=pnlText(p,period);
    if(p?.available){
      el.classList.add(p.deltaUsd>0?'is-positive':p.deltaUsd<0?'is-negative':'is-neutral');
      el.title=p.note||'Изменение стоимости без корректировки на вводы/выводы. Это не чистый PNL.';
    }else{
      const time=p?.firstAt&&Number.isFinite(p.historyHours)
        ?' История снимков: '+p.historyHours+' из 24 ч.':'';
      const extra=p?.reason==='incomplete-balance'
        ?' Для расчёта требуются полные балансы всех активов.':'';
      el.title=pnlUnavailable(p,period)+'.'+time+extra+
        ' Оценка исключает пополнения и выводы только при отдельной корректировке.';
    }
    return el;
  };
  const periodBadges=(day,month)=>{
    const host=document.createElement('div');host.className='finance-crypto-period-pnl';
    host.append(pnlBadge(day,'day'),pnlBadge(month,'month'));
    host.title='Оценка изменения стоимости активов, не проверенный торговый PNL.';
    return host;
  };
  async function loadPnl24h(){
    if(actor!=='Рустам'||!connections.length||pnlFlight)return pnlFlight;
    pnlFlight=request('crypto-pnl-24h').then(data=>{
      pnl24h=data;render();
    }).catch(()=>{pnl24h=null;render();}).finally(()=>{pnlFlight=null;});
    return pnlFlight;
  }
  function render(){
    const cards=$('financeCryptoCards');if(!cards)return;
    cards.replaceChildren();
    let total=0,complete=connections.length>0,knownTotal=0,hasKnown=false;
    for(const link of connections){
      const wallet=wallets.find(w=>w.id===link.walletId);
      if(!wallet){complete=false;continue;}
      if(link.lastError)complete=false;
      const card=document.createElement('article');card.className='finance-crypto-source-card';card.dataset.walletId=link.walletId;
      const head=document.createElement('div');head.className='finance-crypto-source-head';
      const title=document.createElement('strong');title.textContent=providerName(link.provider);
      const note=document.createElement('span');note.textContent=link.provider==='bybit'&&wallet.name.trim().toLowerCase()==='bybit'?'':wallet.name+(link.provider==='bybit'?'':' · '+(link.chain||'ethereum'));
      const actions=document.createElement('div');actions.className='finance-crypto-source-actions';
      const sourceRefresh=document.createElement('button');
      sourceRefresh.type='button';sourceRefresh.className='finance-crypto-source-refresh';
      sourceRefresh.textContent=sourceSyncId===link.walletId?'Обновляю…':'Обновить';
      sourceRefresh.disabled=Boolean(pending);
      sourceRefresh.setAttribute('aria-label','Обновить только '+providerName(link.provider));
      sourceRefresh.addEventListener('click',()=>void refreshSource(link.walletId));
      if(note.textContent.trim())actions.append(note);
      actions.append(sourceRefresh);head.append(title,actions);
      const amount=document.createElement('div');amount.className='finance-crypto-source-amount';
      if(typeof link.balanceUsd==='number'&&Number.isFinite(link.balanceUsd)){amount.textContent=cash(link.balanceUsd);total+=link.balanceUsd;knownTotal+=link.balanceUsd;hasKnown=true;}
      else if(link.incomplete&&typeof link.partialUsd==='number'&&Number.isFinite(link.partialUsd)){knownTotal+=link.partialUsd;hasKnown=true;
        amount.textContent=cash(link.partialUsd);complete=false;
      }
      else{
        amount.textContent=link.incomplete&&typeof link.partialUsd==='number'
          ?'Найдено в v3: '+cash(link.partialUsd)
          :'Баланс не получен';
        complete=false;
      }
      const detail=document.createElement('small');detail.textContent='Обновлено: '+dateLabel(link.incomplete?link.partialSyncAt:link.lastSyncAt);
      const dailyChange=pnl24h?.items?.find(p=>p.id===link.walletId);
      const monthlyChange=pnl24h?.month?.items?.find(p=>p.id===link.walletId);
      card.append(head,amount,periodBadges(dailyChange,monthlyChange),detail);
      // Keep partial state in calculations and error reporting without the
      // repetitive "Частичный баланс" badge on every connected source card.
      if(link.provider==='uniswap'&&typeof link.walletUsd==='number'){
        const summary=document.createElement('div');summary.className='finance-crypto-breakdown';
        const unsureFees=(link.positions||[]).some(pos=>pos.claimableIncludesPrincipal===true);
        // LP snapshots expose uncollected fees, not a full history of accruals,
        // collected payouts and removed principal since the first of the month.
        // Never confuse an uncollected balance with monthly or lifetime income.
        const rows=[
          ['На адресе',link.walletUsd],
          ['В пулах',link.liquidityUsd],
          ['Комиссии в этом месяце',null],
          ['Всего комиссии',unsureFees?null:link.feesUsd],
        ];
        if(unsureFees)rows.push(['К получению (включая возможную ликвидность)',link.feesUsd]);
        for(const [label,value] of rows){
          const row=document.createElement('div');row.className='finance-crypto-breakdown-row';
          const name=document.createElement('span');name.textContent=label;
          const sum=document.createElement('strong');sum.textContent=typeof value==='number'&&Number.isFinite(value)?cash(value):'—';
          row.append(name,sum);summary.append(row);
        }
        card.append(summary);
        for(const pos of (Array.isArray(link.positions)?link.positions:[]).filter(pos=>Number(pos.liquidityUsd||0)+Number(pos.feesUsd||0)>0.005)){
          const box=document.createElement('div');
          const rangeState=pos.inRange===true?'in-range':pos.inRange===false?'out-of-range':'unknown';
          box.className='finance-crypto-lp finance-crypto-lp--'+rangeState;
          const title=document.createElement('div');title.className='finance-crypto-lp-head';
          const name=document.createElement('strong');name.textContent='Uniswap '+pos.version+' · '+pos.pair+' · #'+pos.tokenId;
          const state=document.createElement('small');state.textContent=rangeState==='in-range'?'В диапазоне':rangeState==='out-of-range'?'Вне диапазона':'Диапазон не определён';
          title.append(name,state);box.append(title);
          for(const [label,value] of [['Ликвидность',pos.liquidityUsd],[pos.claimableIncludesPrincipal?'К получению (возможна ликвидность)':'Всего комиссии',pos.feesUsd]]){
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
      // Scope detail available from server only.
      if(link.lastError&&!link.incomplete){const err=document.createElement('p');err.className='finance-crypto-error';err.textContent=errorLabel({message:link.lastError});card.append(err);}
      if(link.provider==='bybit'&&Array.isArray(link.sections)){
        const groups=document.createElement('div');groups.className='finance-crypto-sections';
        const hideEmptyBybitSections=new Set([
          'earn-advanced-smart','earn-advanced-discount','earn-advanced-double',
          'earn-liquidity','earn-rwa','earn-token','subaccounts'
        ]);
        for(const section of link.sections){
          if(hideEmptyBybitSections.has(section.id)&&
            !(Number.isFinite(section.usd)&&section.usd>0.005)&&
            !(section.assets||[]).some(asset=>Number(asset.usd)>0.005||Number(asset.amount)>0))continue;
          const entry=document.createElement('details');entry.className='finance-crypto-section';
          const label=document.createElement('summary');label.textContent=section.name+(typeof section.usd==='number'?' · '+cash(section.usd):' · недоступно');entry.append(label);
          for(const asset of section.assets||[]){
            const row=document.createElement('div');row.className='finance-crypto-asset';
            const name=document.createElement('span');name.textContent=asset.symbol+' · '+Number(asset.amount).toLocaleString('ru-RU',{maximumFractionDigits:8});
            const value=document.createElement('strong');value.textContent=typeof asset.usd==='number'?cash(asset.usd):'—';
            row.append(name,value);entry.append(row);
          }
          groups.append(entry);
        }card.append(groups);
      }else if(link.provider==='trust'&&Array.isArray(link.assets)&&link.assets.length){
        const items=document.createElement('div');items.className='finance-crypto-sections';
        for(const asset of link.assets){
          const row=document.createElement('div');row.className='finance-crypto-asset';
          const name=document.createElement('span');name.textContent=asset.symbol+' · '+Number(asset.amount).toLocaleString('ru-RU',{maximumFractionDigits:8})+' · '+(asset.network||link.chain).toUpperCase();
          const value=document.createElement('strong');value.textContent=typeof asset.usd==='number'?cash(asset.usd):'—';
          row.append(name,value);items.append(row);
        }card.append(items);
      }
      const operationButton=document.createElement('button');operationButton.type='button';operationButton.className='finance-crypto-operations-button';operationButton.textContent='История операций';
      operationButton.addEventListener('click',()=>void showOperations(link.walletId,card));
      card.append(operationButton);
      if(link.provider==='bybit'){
        const checkButton=document.createElement('button');
        checkButton.type='button';checkButton.className='finance-crypto-operations-button finance-crypto-history-check';
        checkButton.textContent='Проверить доступ к сделкам';
        const checkStatus=document.createElement('small');
        checkStatus.className='finance-crypto-history-check-status';
        checkStatus.setAttribute('role','status');checkStatus.setAttribute('aria-live','polite');
        checkButton.addEventListener('click',async()=>{
          checkButton.disabled=true;checkButton.textContent='Проверяю…';
          checkStatus.textContent='Проверяю права текущего Read-only API-ключа…';
          try{
            const result=await request('crypto-bybit-history-check',{walletId:link.walletId});
            checkStatus.textContent=result.accessible
              ?'Доступ к сделкам Spot есть. '+(result.hasRecentExecutions
                ?'Есть записи за последние 7 дней.'
                :'За последние 7 дней записей нет.')+' Полнота старой истории не подтверждена.'
              :'История Spot недоступна.';
          }catch(error){
            checkStatus.textContent='Историю проверить не удалось: '+errorLabel(error);
          }finally{checkButton.disabled=false;checkButton.textContent='Проверить доступ к сделкам';}
        });
        card.append(checkButton,checkStatus);
      }
      if(link.address){const address=document.createElement('code');address.textContent=link.address.slice(0,8)+'…'+link.address.slice(-6);card.append(address);}
      cards.append(card);
    }
    if(!connections.length){const empty=document.createElement('p');empty.className='finance-crypto-empty';empty.textContent='Кошельки пока не подключены. Добавь API через редактор существующего кошелька.';cards.append(empty);}
    const amount=$('financeCryptoTotal'),label=$('financeCryptoUpdated');
    if(amount)amount.textContent=complete?cash(total):hasKnown?cash(knownTotal):'—';
    const pnlHost=$('financeCryptoPnl24h');
    if(pnlHost){
      pnlHost.replaceChildren();
      pnlHost.append(periodBadges(pnl24h?.total,pnl24h?.month?.total));
    }
    if(label){
      const partial=connections.length>0&&!complete&&hasKnown;
      label.hidden=partial;
      label.textContent=partial?'':connections.length?(complete?'Синхронизировано':'Пока нет данных'):'Нет подключений';
    }
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
    connections=Array.isArray(data.connections)?data.connections:[];loaded=true;render();void loadPnl24h();
    if(connections.some(c=>c.walletId===editingWalletId)&&$('financeWalletComposer')&&!$('financeWalletComposer').hidden)
      void loadApiWalletHistory(editingWalletId);
    return data;
  }
  async function refreshSource(walletId){
    if(actor!=='Рустам'||pending||!connections.some(c=>c.walletId===walletId))return;
    pending=true;sourceSyncId=walletId;render();
    const name=providerName(connections.find(c=>c.walletId===walletId)?.provider);
    setStatus('financeCryptoStatus','Обновляю только '+name+'…');
    try{
      const result=await request('crypto-refresh',{force:true,walletId});
      connections=Array.isArray(result.connections)?result.connections:connections;
      if(Array.isArray(result.wallets))wallets=result.wallets;
      const refreshed=connections.find(c=>c.walletId===walletId);
      setStatus('financeCryptoStatus',refreshed?.lastError
        ?'Не удалось обновить '+name+'. Последний баланс сохранён.'
        :name+' обновлён.');
      void loadPnl24h();
      document.dispatchEvent(new Event('rudi-finance-plan-saved'));
    }catch(err){setStatus('financeCryptoStatus',errorLabel(err));}
    finally{pending=false;sourceSyncId='';render();}
  }
  async function refresh(force=false){
    if(actor!=='Рустам'||pending||!connections.length)return;
    const now=Date.now();
    if(!force&&now-lastAttempt<3*60*1000)return;
    pending=true;lastAttempt=now;const button=$('financeCryptoRefresh');
    const quick=$('financeApiBalancesRefresh');
    if(button)button.disabled=true;
    if(quick){quick.disabled=true;quick.classList.add('is-syncing');quick.setAttribute('aria-busy','true');}
    setStatus('financeCryptoStatus','Обновляю баланс…');
    try{
      const result=await request('crypto-refresh',{force});
      connections=Array.isArray(result.connections)?result.connections:connections;
      if(Array.isArray(result.wallets))wallets=result.wallets;
      render();void loadPnl24h();
      setStatus('financeCryptoStatus',connections.some(c=>c.lastError)?'Часть источников не обновилась. Сохранён предыдущий баланс.':'Баланс обновлён.');
      // The established finance refresh event invokes loadFinances() in app.js.
      // This updates the existing wallet tiles without touching history or ledger rows.
      document.dispatchEvent(new Event('rudi-finance-plan-saved'));
    }catch(err){setStatus('financeCryptoStatus',errorLabel(err));}
    finally{
      pending=false;
      if(button)button.disabled=false;
      if(quick){quick.disabled=false;quick.classList.remove('is-syncing');quick.removeAttribute('aria-busy');}
    }
  }
  function switchChain(){
    const arbitrum=$('financeCryptoChain')?.value==='arbitrum';
    const help=$('financeCryptoNetworkHelp'),label=$('financeCryptoScopeLabel');
    if($('financeCryptoProvider')?.value==='trust'){
      if(help)help.textContent='Нужен публичный адрес выбранной сети. Seed-фраза и приватный ключ не нужны.';
      if(label)label.textContent='Подтверждаю чтение публичных балансов этой сети. Другие активы могут быть не учтены.';
      if($('financeCryptoSpotConsent'))$('financeCryptoSpotConsent').checked=false;
      return;
    }
    if(help)help.textContent=arbitrum?'Arbitrum One · поддерживаются WETH, USDT, нативный USDC и USDC.e, Uniswap v3/v4.':'Ethereum Mainnet · поддерживаются ETH, WETH, USDT, USDC, Uniswap v3/v4.';
    if(label)label.textContent='Подтверждаю учёт токенов и пулов Uniswap v3/v4 в '+(arbitrum?'Arbitrum One':'Ethereum Mainnet')+', включая суммы к получению. Другие сети не включать.';
    if($('financeCryptoSpotConsent'))$('financeCryptoSpotConsent').checked=false;
  }
  function switchProvider(){
    const provider=$('financeCryptoProvider')?.value;
    if($('financeCryptoBybitFields'))$('financeCryptoBybitFields').hidden=provider!=='bybit';
    if($('financeCryptoUniswapFields'))$('financeCryptoUniswapFields').hidden=provider==='bybit';
    for(const chain of $('financeCryptoChain')?.options||[])chain.hidden=provider==='uniswap'&&!['ethereum','arbitrum'].includes(chain.value);
    if(provider==='uniswap'&&!['ethereum','arbitrum'].includes($('financeCryptoChain').value))$('financeCryptoChain').value='ethereum';
    if(provider!=='bybit')switchChain();
  }
  function onOpenWallet(ev){
    editingWalletId=String(ev.detail?.walletId||'');
    if($('financeCryptoConnectFields'))$('financeCryptoConnectFields').hidden=true;
    clearKeys();if($('financeCryptoSpotConsent'))$('financeCryptoSpotConsent').checked=false;setStatus('financeCryptoWalletStatus','');
    const wallet=wallets.find(w=>w.id===editingWalletId);
    const provider=/trust/i.test(wallet?.name||'')?'trust':/uniswap/i.test(wallet?.name||'')?'uniswap':'bybit';
    const existing=connections.find(c=>c.walletId===editingWalletId);
    if($('financeCryptoProvider'))$('financeCryptoProvider').value=existing?.provider||provider;
    if($('financeCryptoChain'))$('financeCryptoChain').value=existing?.chain||'ethereum';
    if($('financeCryptoAddress'))$('financeCryptoAddress').value=existing?.address||'';
    switchProvider();renderEditor();
  }

  function toggleHistory(open){
    const main=$('financeCryptoMain'),history=$('financeCryptoHistory'),overview=$('financeCryptoTotal')?.closest('.finance-crypto-overview');
    if(main)main.hidden=open;
    if(history)history.hidden=!open;
    if(overview)overview.hidden=open;
    if(open)void loadHistory();
  }
  let historyPeriod=30,historyHours=0,historyRequestId=0;
  async function loadHistory(){
    setStatus('financeCryptoHistoryStatus','');
    const requestId=++historyRequestId;
    try{
      const result=await request('crypto-history',{walletId:'__portfolio__',days:historyPeriod,
        ...(historyHours?{hours:historyHours}:{})});
      if(requestId!==historyRequestId)return;
      const rows=Array.isArray(result.points)?result.points:[];
      const chart=$('financeCryptoChart'),summary=$('financeCryptoHistoryStats'),points=$('financeCryptoHistoryPoints');
      if(!chart||!summary||!points)return;
      chart.replaceChildren();summary.replaceChildren();points.replaceChildren();
      const tip=$('financeCryptoChartTooltip');
      if(tip)tip.textContent='';
      const svg=(tag,attrs)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs||{}))e.setAttribute(key,String(value));return e;};
      if(!rows.length){
        const badge=$('financeCryptoHistoryBadge');
        if(badge)badge.textContent='Нет снимков за выбранный период';
        setStatus('financeCryptoHistoryStatus',historyHours
          ?'Для этого периода пока нет точных снимков. Обнови криптобаланс, чтобы начать запись.'
          :'История появится после первой синхронизации.');
        return;
      }
      const vals=rows.map(r=>r.usd),lo=Math.min(...vals),hi=Math.max(...vals),spread=Math.max(hi-lo,1);
      const t0=historyHours?Date.parse(rows[0].at):0,t1=historyHours?Date.parse(rows[rows.length-1].at):0;
      const x=i=>20+(rows.length===1?150:historyHours&&t1>t0?
        300*(Date.parse(rows[i].at)-t0)/(t1-t0):300*i/(rows.length-1)),y=n=>150-105*(n-lo)/spread;
      const d=rows.map((r,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(r.usd).toFixed(2)).join(' ');
      chart.append(svg('path',{d,fill:'none',stroke:'#bba7ff','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));
      const label=r=>historyHours?new Date(r.at).toLocaleString('ru-RU',
        {timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):r.date;
      rows.forEach((r,i)=>{
        const dot=svg('circle',{cx:x(i),cy:y(r.usd),r:rows.length===1?5:3,fill:r.partial?'#ffbd7c':'#e0daff',tabindex:0,role:'button','aria-label':label(r)+' '+cash(r.usd)});
        const show=()=>{if(tip)tip.textContent=label(r)+' · '+cash(r.usd)+(r.partial?' · частично':'');};
        dot.addEventListener('click',show);dot.addEventListener('focus',show);
        dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')show();});chart.append(dot);
      });
      const first=rows[0],last=rows[rows.length-1],delta=last.usd-first.usd;
      const pct=first.usd>0?(delta/first.usd*100).toFixed(2)+'%':'—';
      summary.textContent='Начало '+cash(first.usd)+' · Сейчас '+cash(last.usd)+' · '+(delta>=0?'+':'')+cash(delta)+' · '+pct;
      const badge=$('financeCryptoHistoryBadge');
      if(badge)badge.textContent=rows.some(row=>row.partial)?'● Частичные снимки':'● Подтверждённые снимки';
      for(const row of rows.slice(-15).reverse()){
        const line=document.createElement('div');line.className='finance-crypto-asset';
        const time=document.createElement('span');time.textContent=label(row)+(row.partial?' · частично':'');
        const value=document.createElement('strong');value.textContent=cash(row.usd);line.append(time,value);points.append(line);
      }
    }catch(error){if(requestId===historyRequestId)setStatus('financeCryptoHistoryStatus',errorLabel(error));}
  }

  // Operation attribution never sends funds. It links an already observed API
  // transaction to a finance ledger row while API balances remain authoritative.
  let apiHistoryRequest=0,allocationBusy=false;
  const opDirection=row=>row.kind==='transfer'?row.direction:row.kind;
  const opTitle=row=>(row.kind==='transfer'?'↔ Перевод':row.kind==='receive'?'↓ Получено':
    row.kind==='send'?'↑ Отправлено':'Операция')+' · '+String(row.symbol||'')+' · '+
    Number(row.amount||0).toLocaleString('ru-RU',{maximumFractionDigits:8});
  function walletOrCategory(result,row){
    if(!row.assignment)return 'Нажми, чтобы отнести операцию';
    if(row.assignment.mode==='expense'){
      const c=(result.categories||[]).find(x=>x.id===row.assignment.categoryId);
      return 'Расход · '+(c?.name||'Категория');
    }
    const w=(result.wallets||[]).find(x=>x.id===row.assignment.targetWalletId);
    return 'Перевод · '+(w?.name||'Кошелёк');
  }
  function operationElement(result,row,walletId){
    const item=document.createElement('button');
    item.className='finance-crypto-operation-item';item.type='button';
    const top=document.createElement('div');top.className='finance-crypto-operation-main';
    const title=document.createElement('strong');title.textContent=opTitle(row);
    const when=document.createElement('small');
    const d=new Date(row.timestamp);when.textContent=Number.isFinite(d.getTime())?
      d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Дата не указана';
    top.append(title,when);
    const subtitle=document.createElement('small');subtitle.className='finance-crypto-operation-link';
    subtitle.textContent=walletOrCategory(result,row);
    item.append(top,subtitle);
    item.addEventListener('click',()=>openOperationClassifier(result,row,walletId));
    return item;
  }
  function openOperationClassifier(result,row,walletId){
    if(actor!=='Рустам'||allocationBusy)return;
    const direction=opDirection(row);
    if(!['send','receive'].includes(direction))return;
    document.querySelector('.finance-crypto-allocation-backdrop')?.remove();
    const backdrop=document.createElement('div');backdrop.className='finance-crypto-allocation-backdrop';
    const sheet=document.createElement('section');sheet.className='finance-crypto-allocation-sheet';
    sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
    sheet.setAttribute('aria-label','Привязать транзакцию');
    const top=document.createElement('div');top.className='finance-crypto-allocation-heading';
    const head=document.createElement('strong');head.textContent='Привязать транзакцию';
    const close=document.createElement('button');close.type='button';close.textContent='×';
    close.className='finance-crypto-allocation-close';close.setAttribute('aria-label','Закрыть');
    top.append(head,close);
    const detail=document.createElement('p');detail.textContent=opTitle(row)+' · '+
      (row.network||'Сеть не указана')+' · '+String(row.timestamp||'').slice(0,10);
    const type=document.createElement('select');type.setAttribute('aria-label','Что это за операция');
    const opt=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
    type.append(opt('transfer','Перевод между моими кошельками'));
    if(direction==='send')type.append(opt('expense','Расход по категории'));
    type.value=row.assignment?.mode||'transfer';
    if(![...type.options].some(o=>o.value===type.value))type.value='transfer';
    const target=document.createElement('select');target.setAttribute('aria-label','Кошелёк или категория');
    const amount=document.createElement('input');amount.type='number';amount.step='0.01';
    amount.min='0.01';amount.inputMode='decimal';amount.required=true;
    amount.placeholder='Сумма в ₽';amount.value=row.assignment?.rubAmount||'';
    const note=document.createElement('input');note.type='text';note.maxLength=120;
    note.placeholder='Комментарий (необязательно)';
    note.value=row.assignment?.note||String(row.symbol||'')+' '+String(row.amount||'');
    const label=(text,input)=>{const box=document.createElement('label');box.className='finance-crypto-allocation-field';
      const caption=document.createElement('span');caption.textContent=text;box.append(caption,input);return box;};
    const targetLabel=label('Куда отнести',target);
    const amountField=label('Сумма операции в рублях',amount);
    const help=document.createElement('p');help.className='finance-crypto-allocation-help';
    const manualHelp='Укажи стоимость этой операции в рублях. Балансы API-кошельков повторно не списываются.';
    let manualRub=amount.value;
    let automaticallyPriced=false;
    amount.addEventListener('input',()=>{if(!amount.readOnly)manualRub=amount.value;});
    const updateAmountMode=()=>{
      const selectedWallet=(result.wallets||[]).find(w=>w.id===target.value);
      const auto=type.value==='transfer'&&String(row.symbol||'').toUpperCase()==='USDT'&&
        ['USD','USDT'].includes(String(selectedWallet?.currency||'').toUpperCase())&&
        Number(row.amount)>0&&Number.isFinite(Number(row.amount));
      if(auto!==automaticallyPriced){
        amount.value=auto?String(Number(row.amount)):manualRub;
        automaticallyPriced=auto;
      }
      amount.readOnly=auto;
      amount.required=!auto;
      amountField.querySelector('span').textContent=auto?
        'Сумма перевода · '+selectedWallet.currency:'Сумма операции в рублях';
      amount.placeholder=auto?'Рассчитано из USDT':'Сумма в ₽';
      help.textContent=auto?
        'Подставлено автоматически: '+Number(row.amount).toLocaleString('ru-RU',{maximumFractionDigits:8})+
        ' USDT ≈ '+Number(row.amount).toLocaleString('ru-RU',{maximumFractionDigits:8})+' '+
        selectedWallet.currency+'. Фактический USD/RUB-эквивалент для истории рассчитывается по курсу при сохранении.':
        manualHelp;
    };
    const refreshTarget=()=>{
      target.replaceChildren();
      const candidates=type.value==='expense'?result.categories:result.wallets;
      for(const c of candidates||[]){
        if(type.value==='transfer'&&c.id===walletId)continue;
        target.append(opt(c.id,c.name+(c.currency?' · '+c.currency:'')));
      }
      const selected=type.value==='expense'?row.assignment?.categoryId:row.assignment?.targetWalletId;
      if(selected&&[...target.options].some(o=>o.value===selected))target.value=selected;
      updateAmountMode();
    };
    type.addEventListener('change',refreshTarget);
    target.addEventListener('change',updateAmountMode);
    refreshTarget();
    const status=document.createElement('div');status.className='finance-crypto-allocation-status';
    status.setAttribute('role','status');
    const save=document.createElement('button');save.className='finance-crypto-allocation-save';
    save.type='button';save.textContent='Сохранить';
    sheet.append(top,detail,label('Тип операции',type),targetLabel,
      amountField,label('Комментарий',note),help,status,save);
    backdrop.append(sheet);document.body.append(backdrop);
    const finish=()=>backdrop.remove();
    close.addEventListener('click',finish);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)finish();});
    backdrop.addEventListener('keydown',e=>{if(e.key==='Escape')finish();});
    save.addEventListener('click',async()=>{
      const autoAmount=automaticallyPriced&&type.value==='transfer';
      const rubAmount=autoAmount?undefined:Number(amount.value);
      if(!target.value||(!autoAmount&&!(rubAmount>0))){
        status.textContent=autoAmount?'Выбери кошелёк для перевода.':'Выбери кошелёк или категорию и введи сумму в рублях.';
        return;
      }
      if(allocationBusy)return;allocationBusy=true;save.disabled=true;save.textContent='Сохраняю…';status.textContent='';
      try{
        await request('crypto-classify',{walletId,operationId:row.id,mode:type.value,
          categoryId:type.value==='expense'?target.value:undefined,
          targetWalletId:type.value==='transfer'?target.value:undefined,
          autoAmount,rubAmount,note:note.value});
        finish();
        document.dispatchEvent(new Event('rudi-finance-plan-saved'));
        setStatus('financeCryptoStatus','Операция сохранена в истории выбранного кошелька или категории.');
        const card=document.querySelector('#financeCryptoCards .finance-crypto-source-card[data-wallet-id="'+CSS.escape(walletId)+'"]');
        const opWrap=card?.querySelector('.finance-crypto-operations');
        if(opWrap){opWrap.remove();void showOperations(walletId,card);}
        const modal=$('financeWalletComposer');
        if(modal&&!modal.hidden&&editingWalletId===walletId)void loadApiWalletHistory(walletId);
        void refresh(false);
      }catch(error){status.textContent=errorLabel(error).startsWith('Не удалось получить баланс')?
        'Не удалось сохранить привязку. Проверь сумму, валюты и доступность API.':errorLabel(error);}
      finally{allocationBusy=false;save.disabled=false;save.textContent='Сохранить';}
    });
    amount.focus();
  }
  async function showOperations(walletId,card){
    let wrap=card.querySelector('.finance-crypto-operations');
    if(wrap){wrap.remove();return;}
    wrap=document.createElement('div');wrap.className='finance-crypto-operations';
    wrap.textContent='Получаю операции…';card.append(wrap);
    try{
      const result=await request('crypto-operations',{walletId});
      if(!wrap.isConnected)return;
      wrap.replaceChildren();
      const rows=Array.isArray(result.items)?result.items:[];
      if(!rows.length){wrap.textContent='Операций пока нет';return;}
      for(const row of rows.slice(0,40))wrap.append(operationElement(result,row,walletId));
      if(result.incomplete){const warning=document.createElement('small');
        warning.textContent='Доступна только часть истории внешнего API.';wrap.append(warning);}
    }catch(error){if(wrap.isConnected)wrap.textContent=errorLabel(error);}
  }
  async function loadApiWalletHistory(walletId){
    const root=$('financeWalletHistory'),modal=$('financeWalletComposer');
    if(!root||!modal||modal.hidden||editingWalletId!==walletId)return;
    const id=++apiHistoryRequest;
    let host=$('financeApiWalletHistory');
    if(!host){host=document.createElement('div');host.id='financeApiWalletHistory';
      host.className='finance-crypto-embedded-history';root.append(host);}
    host.textContent='Загружаю операции подключённого кошелька…';
    try{
      const result=await request('crypto-operations',{walletId});
      if(id!==apiHistoryRequest||!host.isConnected||editingWalletId!==walletId)return;
      host.replaceChildren();
      const title=document.createElement('h4');title.textContent='Операции API';host.append(title);
      const rows=Array.isArray(result.items)?result.items:[];
      if(rows.length){
        root.querySelectorAll('.finance-history-empty').forEach(empty=>empty.remove());
        for(const row of rows.slice(0,35))host.append(operationElement(result,row,walletId));
      }else{
        const empty=document.createElement('p');empty.textContent='У подключённого API пока нет доступных операций.';
        host.append(empty);
      }
      if(result.incomplete){const note=document.createElement('small');
        note.textContent='История внешнего API может быть частичной.';host.append(note);}
    }catch(error){if(id===apiHistoryRequest&&host.isConnected)host.textContent=
      'История API недоступна. Повтори позже.';}
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
    $('financeApiBalancesRefresh')?.addEventListener('click',async()=>{
      if(actor!=='Рустам'||pending)return;
      try{
        if(!loaded)await load();
        if(!connections.length){setStatus('financeCryptoStatus','Нет подключённых кошельков для обновления.');return;}
        await refresh(true);
      }catch(err){setStatus('financeCryptoStatus',errorLabel(err));}
    });
    const summary=$('financeCryptoTotal');
    summary?.addEventListener('click',()=>toggleHistory(true));
    summary?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleHistory(true);}});
    $('financeCryptoHistoryBack')?.addEventListener('click',()=>toggleHistory(false));
    document.querySelectorAll('[data-crypto-period],[data-crypto-hours]').forEach(button=>button.addEventListener('click',()=>{
      historyHours=Number(button.dataset.cryptoHours||0);
      if(!historyHours)historyPeriod=Number(button.dataset.cryptoPeriod);
      document.querySelectorAll('[data-crypto-period],[data-crypto-hours]').forEach(b=>b.classList.toggle('active',b===button));
      void loadHistory();
    }));
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
              ?(provider==='trust'?'public-address-readonly':$('financeCryptoChain')?.value==='arbitrum'?'arbitrum-one-including-lp':'ethereum-mainnet-including-lp'):''};
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
      if(!modal.hidden&&modal.getAttribute('aria-hidden')!=='true'){
        onOpenWallet({detail:{walletId:editingWalletId}});
        if(connections.some(row=>row.walletId===editingWalletId))
          void loadApiWalletHistory(editingWalletId);
      }else apiHistoryRequest++;
    }).observe(modal,{attributes:true,attributeFilter:['hidden','aria-hidden']});
    document.addEventListener('rudi-finances-updated',async(ev)=>{
      actor=String(ev.detail?.actor||'');
      wallets=Array.isArray(ev.detail?.wallets)?ev.detail.wallets:[];
      const tab=document.querySelector('[data-finance-tab="crypto"]');
      if(tab)tab.hidden=actor!=='Рустам';
      const quick=$('financeApiBalancesRefresh');
      if(quick)quick.hidden=actor!=='Рустам';
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