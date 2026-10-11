(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const safeText=(value,fallback='—')=>value===null||value===undefined||value===''?fallback:String(value);
  const usd=value=>Number.isFinite(Number(value))&&value!==null
    ?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)):'—';
  const amount=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(Number(value)||0);
  const stamp=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Нет данных'};
  let active=false,working=false,ready=false,last=null,timer=null;
  function node(tag,className='',content=''){
    const el=document.createElement(tag);if(className)el.className=className;
    if(content!==undefined)el.textContent=String(content);return el;
  }
  function setStatus(text,error=false){
    const label=$('cryptoStatus');if(!label)return;
    label.textContent=text||'';label.classList.toggle('is-error',Boolean(error));
  }
  async function api(operation,payload={}){
    await Promise.resolve(window.__rudiTelegramSdkReady).catch(()=>{});
    const response=await fetch('/api/crypto',{method:'POST',
      headers:{'Content-Type':'application/json'},cache:'no-store',
      body:JSON.stringify({operation,initData:window.Telegram?.WebApp?.initData||'',...payload})});
    const json=await response.json().catch(()=>({}));
    if(!response.ok||!json.ok){
      const error=new Error(json.error||'crypto-request-error');error.status=response.status;throw error;
    }
    return json;
  }
  function explain(error){
    const code=String(error?.message||'');
    if(code.includes('crypto-owner-only'))return 'Раздел доступен только Рустаму.';
    if(code.includes('readonly-required'))return 'Для Bybit нужен API-ключ только на чтение. Отключи торговлю и вывод средств.';
    if(code.includes('bybit-api-'))return 'Bybit отклонил ключ. Проверь доступ и ограничения по IP.';
    if(code.includes('bybit-key-invalid'))return 'Проверь API Key и API Secret.';
    if(code.includes('address-invalid'))return 'Введи корректный Ethereum-адрес 0x…';
    if(code.includes('address-limit'))return 'Можно подключить до 8 адресов.';
    if(code.includes('encryption-unavailable'))return 'Хранилище ключей пока не настроено.';
    if(error?.status===401)return 'Нужно заново авторизоваться в RUDI.';
    return 'Не получилось выполнить запрос. Повтори чуть позже.';
  }
  function removeChildren(host){if(host)host.replaceChildren()}
  function metric(id,value){const el=$(id);if(el)el.textContent=value}
  function graph(history){
    const svg=$('cryptoHistoryGraph');if(!svg)return;
    svg.replaceChildren();svg.setAttribute('viewBox','0 0 320 116');
    const rows=(Array.isArray(history)?history:[]).filter(p=>Number.isFinite(Number(p.usd))&&p.usd!==null).slice(-30);
    if(rows.length<2){$('cryptoHistoryEmpty').hidden=false;return}
    $('cryptoHistoryEmpty').hidden=true;
    let min=Math.min(...rows.map(p=>Number(p.usd))),max=Math.max(...rows.map(p=>Number(p.usd)));
    if(min===max){min-=Math.max(1,max*.015);max+=Math.max(1,max*.015)}
    const points=rows.map((p,i)=>{
      const x=12+i*(296/(rows.length-1)),y=105-(Number(p.usd)-min)/(max-min)*94;
      return [x,y];
    });
    const ns='http://www.w3.org/2000/svg';
    const grid=document.createElementNS(ns,'path');
    grid.setAttribute('d','M12 58 H308 M12 105 H308');grid.setAttribute('stroke','currentColor');
    grid.setAttribute('class','crypto-chart-grid');grid.setAttribute('fill','none');svg.appendChild(grid);
    const area=document.createElementNS(ns,'path');
    area.setAttribute('d','M'+points[0][0]+' 105 L'+points.map(x=>x.join(' ')).join(' L')+' L'+points[points.length-1][0]+' 105 Z');
    area.setAttribute('class','crypto-chart-area');svg.appendChild(area);
    const path=document.createElementNS(ns,'polyline');
    path.setAttribute('points',points.map(x=>x.join(',')).join(' '));path.setAttribute('class','crypto-chart-line');
    path.setAttribute('fill','none');svg.appendChild(path);
    metric('cryptoGraphStart',rows[0].date);metric('cryptoGraphEnd',rows[rows.length-1].date);
  }
  function assetList(host,assets){
    removeChildren(host);
    if(!assets?.length){host.append(node('span','crypto-muted','Пока нет доступных активов'));return}
    assets.forEach(item=>{
      const row=node('div','crypto-asset-row');
      const left=node('div','crypto-asset-left');
      left.append(node('b','',safeText(item.symbol)),node('small','',amount(item.amount)));
      row.append(left,node('strong','',usd(item.usdValue)));host.append(row);
    });
  }
  function render(data){
    last=data;
    metric('cryptoTotal',usd(data.portfolio?.totalUsd));
    metric('cryptoBybitTotal',data.portfolio?.bybit?usd(data.portfolio.bybit.totalUsd):'—');
    const uni=(data.portfolio?.uniswap||[]);
    const uniComplete=uni.length&&uni.every(w=>w.usdValue!==null&&Number.isFinite(Number(w.usdValue)));
    metric('cryptoUniswapTotal',uniComplete?usd(uni.reduce((sum,w)=>sum+Number(w.usdValue||0),0)):'—');
    metric('cryptoUpdatedAt',data.portfolio?.lastSyncAt?'Обновлено '+stamp(data.portfolio.lastSyncAt):'Нет синхронизаций');
    metric('cryptoEthPrice',data.portfolio?.ethUsd?'ETH '+usd(data.portfolio.ethUsd):'');
    metric('cryptoBybitKeyLabel',data.bybitConnected?'Подключено '+safeText(data.bybitKeyMask):'Не подключено');
    $('cryptoBybitConnectFields').hidden=Boolean(data.bybitConnected);
    $('cryptoBybitDisconnect').hidden=!data.bybitConnected;
    $('cryptoBybitAssetsBlock').hidden=!data.bybitConnected;
    if(data.bybitConnected){
      assetList($('cryptoBybitAssets'),data.portfolio?.bybit?.assets||[]);
      metric('cryptoBybitPnl',data.portfolio?.bybit?'Нереализованный PnL '+usd(data.portfolio.bybit.unrealizedPnl):'Нет данных от биржи');
    }
    const list=$('cryptoWalletList');removeChildren(list);
    if(!data.addresses?.length)list.append(node('p','crypto-muted','Добавь публичный адрес Ethereum. Приватный ключ не нужен.'));
    (data.addresses||[]).forEach(address=>{
      const wallet=uni.find(w=>w.address?.toLowerCase()===address.toLowerCase());
      const card=node('div','crypto-wallet-card'),head=node('div','crypto-wallet-header');
      const title=node('div','crypto-wallet-title'),trimmed=address.slice(0,7)+'…'+address.slice(-5);
      title.append(node('b','',trimmed),node('small','',usd(wallet?.usdValue??null)));
      const remove=node('button','crypto-link-danger','Убрать');remove.type='button';remove.dataset.removeWallet=address;
      head.append(title,remove);card.append(head);
      assetList(card.appendChild(node('div','crypto-assets')),wallet?.assets||[]);
      if(wallet?.positions?.length){
        const lp=node('div','crypto-lp-list');
        lp.append(node('h4','','Позиции Uniswap V3'));
        wallet.positions.forEach(position=>{
          const row=node('div','crypto-lp-row');
          row.append(node('b','',position.pair),node('span',position.inRange?'В диапазоне':'Вне диапазона'));
          row.append(node('small','','Полученные комиссии: '+position.collected0+' / '+position.collected1));
          lp.append(row);
        });card.append(lp);
      }else if(wallet&&!data.uniswapV3Enabled){
        card.append(node('small','crypto-muted','Для отображения LP V3 нужен доступ The Graph'));
      }
      list.append(card);
    });
    graph(data.portfolio?.history||[]);
    const warnings=(data.portfolio?.warnings||[]).filter(Boolean);
    metric('cryptoWarning',warnings.join(' · '));
    $('cryptoConnectHint').textContent='Данные Ethereum Mainnet. Оценка ориентировочная. Сейчас учтены Ethereum Mainnet и Bybit Unified. Не входят стоимость LP-позиций, Funding-кошелёк Bybit, другие сети и неподдерживаемые токены.';
  }
  async function refresh(force=false){
    if(working||!active)return;
    working=true;const button=$('cryptoRefreshButton');if(button)button.disabled=true;
    setStatus('Обновляю данные…');
    try{
      const data=await api(force?'sync':'read');
      if(!active)return;
      render(data);ready=true;setStatus('');
    }catch(error){setStatus(explain(error),true)}
    finally{working=false;if(button)button.disabled=false}
  }
  async function change(op,payload){
    if(working)return;
    working=true;setStatus('Сохраняю…');
    try{
      const data=await api(op,payload);render(data);
      const wallet=$('cryptoWalletInput'),key=$('cryptoBybitKey'),secret=$('cryptoBybitSecret');
      if(wallet)wallet.value='';if(key)key.value='';if(secret)secret.value='';
      setStatus('Подключение сохранено.');
    }catch(error){setStatus(explain(error),true)}
    finally{working=false}
  }
  function bind(){
    if($('cryptoWalletAdd')?.dataset.bound==='1')return;
    $('cryptoWalletAdd').dataset.bound='1';
    $('cryptoWalletAdd').addEventListener('click',async()=>{
      await change('add-wallet',{address:$('cryptoWalletInput').value});
      if(last?.addresses?.length)await refresh(true);
    });
    $('cryptoWalletInput').addEventListener('keydown',event=>{if(event.key==='Enter'){$('cryptoWalletAdd').click()}});
    $('cryptoWalletList').addEventListener('click',async event=>{
      const button=event.target.closest('[data-remove-wallet]');if(!button)return;
      if(!confirm('Убрать адрес из криптопортфеля?'))return;
      await change('remove-wallet',{address:button.dataset.removeWallet});
    });
    $('cryptoBybitConnect').addEventListener('click',async()=>{
      await change('connect-bybit',{apiKey:$('cryptoBybitKey').value,apiSecret:$('cryptoBybitSecret').value});
      if(last?.bybitConnected)await refresh(true);
    });
    $('cryptoBybitDisconnect').addEventListener('click',async()=>{
      if(confirm('Отключить Bybit и удалить сохранённые API-ключи?'))await change('disconnect-bybit',{});
    });
    $('cryptoRefreshButton').addEventListener('click',()=>refresh(true));
    window.addEventListener('pagehide',()=>{active=false;clearInterval(timer);timer=null});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)return;
      if(active&&ready)refresh(false).catch(()=>{});
    });
  }
  window.RudiCrypto={
    open(){
      const tab=$('financeCryptoTab'),panel=$('financeCryptoPanel');
      if(!tab||tab.hidden||!panel)return;
      active=true;bind();refresh(false).catch(()=>{});
      if(!timer)timer=setInterval(()=>{if(active&&!document.hidden)refresh(false).catch(()=>{})},15*60*1000);
    },
    close(){active=false;if(timer){clearInterval(timer);timer=null}},
    refresh,
  };
})();