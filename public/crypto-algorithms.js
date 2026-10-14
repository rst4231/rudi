(()=>{'use strict';
const $=id=>document.getElementById(id);
const usd=n=>Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' $';
const pct=n=>Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const signed=(n,fmt=usd)=>!Number.isFinite(Number(n))?'—':(Number(n)>0?'+':'')+fmt(n);
let selected='pump',exchange='okx',data=null,busy=false;
function tint(el,n){if(!el)return;el.classList.toggle('is-positive',n>0);
  el.classList.toggle('is-negative',n<0);}
function infoRow(title,amount,detail,positive){
  const item=document.createElement('div');item.className='crypto-algo-item';
  const left=document.createElement('div'),right=document.createElement('strong');
  const heading=document.createElement('strong');heading.textContent=title;
  const caption=document.createElement('small');caption.textContent=detail||'';
  left.append(heading,caption);right.textContent=amount;
  if(Number.isFinite(positive))tint(right,positive);
  item.append(left,right);return item;
}
function cmcPairUrl(symbol){
 const raw=String(symbol||'').toUpperCase().replace(/[^A-Z0-9/]/g,'');
 const pair=raw.includes('/')?raw:raw.replace(/(USDT|USDC|USD|BTC|ETH)$/,'/$1');
 return /^[A-Z0-9]{2,20}\/[A-Z0-9]{2,8}$/.test(pair)?'https://coinmarketcap.com/search/?q='+encodeURIComponent(pair):'';
}
function linkDeal(node,symbol){
 const url=cmcPairUrl(symbol);if(!url)return node;
 node.classList.add('crypto-algo-item--cmc');node.setAttribute('role','link');node.setAttribute('tabindex','0');
 node.title='Найти '+symbol+' на CoinMarketCap';node.setAttribute('aria-label',node.title);
 const open=()=>window.open(url,'_blank','noopener,noreferrer');
 node.addEventListener('click',e=>{if(!e.target.closest('details'))open();});
 node.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.closest('details')){e.preventDefault();open();}});
 return node;
}
function curve(points){
  const svg=$('cryptoAlgoCurve');if(!svg)return;svg.replaceChildren();
  const series=(points||[]).map(p=>Number(p.usd)).filter(Number.isFinite);
  if(!series.length)series.push(10000);
  const ns='http://www.w3.org/2000/svg',lo=Math.min(...series)-1,hi=Math.max(...series)+1;
  const spread=Math.max(hi-lo,1);
  const coords=series.map((value,i)=>[series.length<2?160:10+i*300/(series.length-1),
    113-(value-lo)*86/spread]);
  const path=document.createElementNS(ns,'path');
  path.setAttribute('d',coords.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' '));
  path.setAttribute('stroke',series.at(-1)<series[0]?'#f77a88':'#56d69a');
  path.setAttribute('stroke-width','2.8');path.setAttribute('stroke-linecap','round');path.setAttribute('fill','none');
  svg.append(path);
}
function draw(){
  if(!data)return;const names=Object.fromEntries((data.algorithms||[]).map(x=>[x.id,x]));
  const p=data.portfolios?.[selected];if(!p)return;
  for(const tab of document.querySelectorAll('[data-crypto-algo]')){
    const active=tab.dataset.cryptoAlgo===selected;
    tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));
  }
  const provider=data.provider==='bybit'?'bybit':'okx';
  $('cryptoAlgoExchangeHeading').textContent='Шорт-алгоритмы · '+(provider==='bybit'?'Bybit · архив':'OKX');
  for(const button of document.querySelectorAll('[data-crypto-algo-exchange]')){
    const active=button.dataset.cryptoAlgoExchange===provider;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  $('cryptoAlgoHeading').textContent=names[selected]?.name||selected;
  $('cryptoAlgoDescription').textContent=names[selected]?.description||'';
  $('cryptoAlgoBalance').textContent=usd(p.equityUsd);
  $('cryptoAlgoPnl').textContent=signed(p.pnlUsd);
  $('cryptoAlgoPnlPct').textContent=signed(p.pnlPct,pct)+' от старта';
  tint($('cryptoAlgoPnl'),p.pnlUsd);tint($('cryptoAlgoPnlPct'),p.pnlUsd);
  $('cryptoAlgoCash').textContent=usd(p.cashUsd);
  $('cryptoAlgoOpen').textContent=String(p.open);
  $('cryptoAlgoClosed').textContent=String(p.closed);
  $('cryptoAlgoWins').textContent=p.winratePct===null?'—':pct(p.winratePct);
  $('cryptoAlgoDD').textContent=pct(p.maxDrawdownPct);
  $('cryptoAlgoPF').textContent=p.profitFactor===null?'—':String(p.profitFactor);
  $('cryptoAlgoSince').textContent=new Date(p.startedAt).toLocaleDateString('ru-RU');
  curve(p.equityCurve);
  const overview=$('cryptoAlgoCompare');overview.replaceChildren();
  for(const algorithm of data.algorithms||[]){
    const a=data.portfolios[algorithm.id];
    const item=infoRow(algorithm.name,signed(a.pnlUsd),a.closed+' закрыто · '+a.open+' открыто',a.pnlUsd);
    item.setAttribute('role','button');item.tabIndex=0;item.dataset.switchTo=algorithm.id;
    overview.append(item);
  }
  const positions=$('cryptoAlgoPositions');positions.replaceChildren();
  // Open positions are global, even when the selected strategy has none.
  for(const algorithm of data.algorithms||[]){
    for(const t of data.portfolios?.[algorithm.id]?.positions||[]){
      positions.append(linkDeal(infoRow(algorithm.name+' · '+t.symbol+' · SHORT',signed(t.unrealizedPnl),
        'Вход '+Number(t.entry).toPrecision(6)+' · TP '+t.take+' · SL '+t.stop+' · '+t.leverage+'×',
        t.unrealizedPnl),t.symbol));
    }
  }
  if(!positions.children.length)positions.textContent='Открытых виртуальных позиций ни у одного алгоритма нет.';
  const trades=$('cryptoAlgoTrades');trades.replaceChildren();
  for(const t of p.trades||[]){
    const node=infoRow(t.symbol+' · SHORT',signed(t.pnlUsd),
      new Date(t.entryAt).toLocaleString('ru-RU')+' → '+new Date(t.exitAt).toLocaleString('ru-RU')+
      ' · '+t.exitReason+' · '+signed(t.pnlPct,pct),t.pnlUsd);
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent='Цены, комиссии и условия';
    const desc=document.createElement('small');
    desc.textContent='Вход '+Number(t.entry).toPrecision(7)+' · Выход '+Number(t.exitPrice).toPrecision(7)+
      ' · Маржа '+usd(t.margin)+' · Объём '+usd(t.notional)+
      ' · Комиссии '+usd(t.feeUsd)+' · Сила сигнала '+t.score+'/100';
    details.append(summary,desc);node.append(details);trades.append(linkDeal(node,t.symbol));
  }
  if(!trades.children.length)trades.textContent='Закрытых сделок пока нет. История начинается только после запуска сканера.';
  const updated=$('cryptoAlgoUpdated');
  const old=data.updatedAt?Date.now()-Date.parse(data.updatedAt):Infinity;
  updated.textContent=data.updatedAt?(data.archived?'Архивный расчёт ':'Успешный расчёт ')+
    new Date(data.updatedAt).toLocaleString('ru-RU')+
    (!data.archived&&old>20*60000?' · СКАНЕР НЕ ОБНОВЛЯЕТСЯ':''):'Нет успешных расчётов';
  const status=$('cryptoAlgoStatus');status.textContent=
    (data.error?'Ошибка последней попытки: '+data.error+'. ':'')+
    (data.warning?data.warning+'. ':'')+
    (data.lastAttemptAt?'Последняя попытка: '+new Date(data.lastAttemptAt).toLocaleString('ru-RU')+'. ':'')+
    (data.archived?'Архив Bybit, новые сделки здесь не создаются. ':'')+
    'Проверено '+(data.marketCount||0)+' ликвидных фьючерсных пар '+(provider==='bybit'?'Bybit':'OKX')+'. '+
    'Каждый алгоритм имеет отдельные виртуальные 10 000 $. Результаты не суммируются. '+
    'Реальных ордеров нет; funding и точные ликвидации не учтены. '+
    'График и сделки строятся только после запуска, без придуманной истории.';
  if($('cryptoAlgoRefresh'))$('cryptoAlgoRefresh').textContent=data.archived?'Обновить архив':'Проверить алгоритмы';
}
async function load(recalculate=false){
  if(busy)return;busy=true;const button=$('cryptoAlgoRefresh');
  if(button){button.disabled=true;if(recalculate)button.textContent='Проверяем алгоритмы…';}
  try{
    const targetExchange=exchange;
    await Promise.resolve(window.__rudiTelegramSdkReady).catch(()=>{});
    const res=await fetch('/api/finances',{method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({operation:targetExchange==='bybit'?'crypto-algo-history':
        (recalculate?'crypto-algo-sync':'crypto-algo-report'),
        initData:window.Telegram?.WebApp?.initData||''})});
    const json=await res.json().catch(()=>({}));
    if(!res.ok||!json.ok)throw Error(String(json.error||'Не удалось загрузить данные'));
    if(targetExchange===exchange){data=json;draw();}
  }catch(e){$('cryptoAlgoStatus').textContent='Ошибка загрузки: '+e.message;}
  finally{busy=false;if(button){button.disabled=false;button.textContent=exchange==='bybit'?'Обновить архив':'Проверить алгоритмы';}}
}
function show(open){
  const panel=$('financeCryptoAlgoPanel'),main=$('financeCryptoMain'),history=$('financeCryptoHistory');
  const author=$('financeCryptoSignalsPanel'),overview=$('financeCryptoTotal')?.closest('.finance-crypto-overview');
  if(!panel)return;panel.hidden=!open;
  if(main)main.hidden=open;if(history)history.hidden=true;
  if(author)author.hidden=true;if(overview)overview.hidden=open;
  if(open)void load();
}
function boot(){
  $('financeCryptoAlgoOpen')?.addEventListener('click',()=>show(true));
  $('financeCryptoAlgoBack')?.addEventListener('click',()=>show(false));
  $('cryptoAlgoRefresh')?.addEventListener('click',()=>void load(exchange!=='bybit'));
  document.querySelectorAll('[data-crypto-algo-exchange]').forEach(button=>{
    button.addEventListener('click',()=>{
      if(busy||exchange===button.dataset.cryptoAlgoExchange)return;
      exchange=button.dataset.cryptoAlgoExchange;data=null;
      void load();
    });
  });
  $('cryptoAlgoTabs')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-crypto-algo]');
    if(!button)return;selected=button.dataset.cryptoAlgo;draw();
  });
  $('cryptoAlgoCompare')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-switch-to]');
    if(!button)return;selected=button.dataset.switchTo;draw();
  });
  $('cryptoAlgoCompare')?.addEventListener('keydown',e=>{
    if(!['Enter',' '].includes(e.key))return;
    const button=e.target.closest('[data-switch-to]');
    if(!button)return;e.preventDefault();selected=button.dataset.switchTo;draw();
  });
  setInterval(()=>{if(!$('financeCryptoAlgoPanel')?.hidden&&document.visibilityState==='visible'&&navigator.onLine!==false)void load();},5*60000);
  window.addEventListener('online',()=>{if(!$('financeCryptoAlgoPanel')?.hidden)void load();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();