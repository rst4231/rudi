(()=>{'use strict';
const $=id=>document.getElementById(id);
const sum=v=>Number(v||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' $';
const percent=v=>Number(v||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const signed=(v,pct=false)=>v===null||v===undefined?'—':(v>0?'+':'')+(pct?percent(v):sum(v));
const statuses={won:'TP · плюс',lost:'SL · минус',open:'Открыта',unpriced:'Открыта, нет цены',
  'not-entered':'Не вошла','insufficient-levels':'Недостаточно уровней',
  conditional:'Условная идея',ambiguous:'Неясный результат',
  'awaiting-market':'Ожидает проверки','market-unavailable':'Нет котировок'};
let current=null,loading=false;
async function request(operation,values={}){
  try{await Promise.resolve(window.__rudiTelegramSdkReady)}catch(_){}
  const initData=window.Telegram?.WebApp?.initData||'';
  const resp=await fetch('/api/finances',{method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,initData,...values})});
  const json=await resp.json().catch(()=>({}));
  if(!resp.ok||!json.ok)throw Error(String(json.error||'Не удалось получить данные'));
  return json;
}
const line=(main,aside,{link,meta,color}={})=>{
  const item=document.createElement('div');item.className='crypto-signals-item';
  const left=document.createElement('main'),right=document.createElement('aside'),top=document.createElement('strong');
  top.textContent=main;left.append(top);
  if(meta){const p=document.createElement('p');p.textContent=meta;left.append(p);}
  const badge=document.createElement('strong');badge.textContent=aside||'—';
  if(color)badge.classList.add(color);right.append(badge);
  if(link&&/^https:\/\/t\.me\/ne_investor\/\d+$/.test(link)){
    const a=document.createElement('a');a.href=link;a.target='_blank';a.rel='noopener noreferrer';
    a.textContent='В Telegram ↗';right.append(a);
  }
  item.append(left,right);return item;
};
const withColor=(node,v)=>{if(!node)return;node.classList.toggle('is-positive',v>0);node.classList.toggle('is-negative',v<0);
  node.style.color=v>0?'#56d69a':v<0?'#f77a88':'';};
function chart(paper){
  const svg=$('cryptoVirtualChart');if(!svg)return;
  svg.replaceChildren();
  const ns='http://www.w3.org/2000/svg';
  const points=[Number(paper?.config?.initialUsd||10000)];
  const exits=(paper?.positions||[]).filter(p=>['won','lost'].includes(p.status)&&p.exitAt&&Number.isFinite(p.pnlUsd))
    .sort((a,b)=>Date.parse(a.exitAt)-Date.parse(b.exitAt));
  for(const pos of exits)points.push(points.at(-1)+pos.pnlUsd);
  const min=Math.min(...points),max=Math.max(...points),spread=Math.max(max-min,1);
  const coords=points.map((y,i)=>[(points.length===1?160:12+296*i/(points.length-1)),105-80*(y-min)/spread]);
  const shape=document.createElementNS(ns,'path');
  shape.setAttribute('d',coords.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join(' '));
  shape.setAttribute('fill','none');shape.setAttribute('stroke',points.at(-1)>=points[0]?'#56d69a':'#f77a88');
  shape.setAttribute('stroke-width','2.7');shape.setAttribute('stroke-linecap','round');svg.append(shape);
  const baseline=document.createElementNS(ns,'text');baseline.setAttribute('x','12');baseline.setAttribute('y','15');
  baseline.setAttribute('font-size','11');baseline.setAttribute('fill','#aeb0bf');
  baseline.textContent='Реализованный капитал · '+signed(points.at(-1)-points[0]);
  svg.append(baseline);
}
function render(data){
  if(!data)return;current=data;const s=data.signals||{},p=data.paper||{},stats=p.stats||{};
  const e=$('cryptoVirtualEquity');if(e)e.textContent=p.equityUsd===null?'—':sum(p.equityUsd);
  const start=$('cryptoVirtualStart');if(start)start.textContent='Старт '+sum(p.config?.initialUsd||10000);
  const pnl=$('cryptoVirtualPnl');if(pnl){pnl.textContent=signed(p.totalPnlUsd);withColor(pnl,p.totalPnlUsd);}
  const pct=$('cryptoVirtualPnlPct');if(pct)pct.textContent=p.totalPnlPct===null?'Нет полной оценки открытых позиций':signed(p.totalPnlPct,true);
  const cash=$('cryptoVirtualCash');if(cash)cash.textContent=sum(p.cashUsd);
  const invested=$('cryptoVirtualInvested');if(invested)invested.textContent='В сделках '+sum(p.investedUsd);
  const closed=$('cryptoVirtualClosed');if(closed)closed.textContent=String(stats.closed??0);
  const winrate=$('cryptoVirtualWinrate');if(winrate)winrate.textContent='Winrate '+(stats.winratePct===null?'—':percent(stats.winratePct));
  const bar=$('cryptoSignalsRatioBar'),txt=$('cryptoSignalsRatioText');if(bar){bar.replaceChildren();
    if((stats.wins||0)+(stats.losses||0)>0){
      const pos=document.createElement('span'),neg=document.createElement('span');
      pos.style.width=(stats.winratePct||0)+'%';neg.style.width=(stats.lossratePct||0)+'%';
      bar.append(pos,neg);
    }}
  if(txt)txt.textContent=stats.wins||stats.losses
    ?'В плюсе '+(stats.wins||0)+' ('+percent(stats.winratePct)+') · В минусе '+(stats.losses||0)+' ('+percent(stats.lossratePct)+') · В ноль '+(stats.breakeven||0)
    :'Нет закрытых плюсовых или минусовых виртуальных сделок';
  chart(p);
  const list=$('cryptoVirtualPositions');if(list){list.replaceChildren();
    for(const x of p.positions||[]){
      const title=x.symbol+' '+(x.direction==='short'?'SHORT':'LONG');
      const info='Вход '+x.entry+' · Позиция '+sum(x.investedUsd)+' · '+(statuses[x.status]||x.status);
      const pnl=x.pnlUsd===null?'PNL недоступен':signed(x.pnlUsd);
      list.append(line(title,pnl,{link:x.url,meta:info,color:x.pnlUsd>0?'is-positive':x.pnlUsd<0?'is-negative':''}));
    }
    if(!list.children.length)list.textContent='Пока нет виртуальных сделок с подтверждённым входом.';
  }
  const signals=$('cryptoSignalsList');if(signals){signals.replaceChildren();
    for(const x of s.signals||[]){
      const title=x.symbol+' '+(x.direction==='short'?'SHORT':'LONG');
      const entry=x.entry?('Вход '+x.entry):'Точная цена входа отсутствует';
      const info=entry+' · '+new Date(x.at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      const status=statuses[x.status]||x.status||'Не подтверждён';
      signals.append(line(title,status,{meta:info,link:x.url,
        color:x.status==='won'?'is-positive':x.status==='lost'?'is-negative':''}));
    }
    if(!signals.children.length)signals.textContent='В доступной истории пока нет подтверждённых сигналов.';
  }
  const sv=$('cryptoSignalSummary');if(sv)sv.textContent=(s.stats?.total||0)+' сигналов · '+(s.stats?.verified||0)+' проверено';
  const count=$('cryptoVirtualPositionsCount');if(count)count.textContent=(stats.total||0)+' виртуальных сделок';
  const updated=$('cryptoSignalsUpdated');if(updated)updated.textContent=s.updatedAt?
    'Синхр. '+new Date(s.updatedAt).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Ещё не синхронизировано';
  const allocation=$('cryptoSignalsAllocation');if(allocation)allocation.value=String(p.config?.allocationPct||10);
  const leverage=$('cryptoSignalsLeverage');if(leverage)leverage.value=String(p.config?.leverage||2);
  const status=$('cryptoSignalsStatus');if(status){
    const parts=[];
    if(!s.updatedAt)parts.push('Данные ещё не загружены. Фоновая проверка стартует по расписанию.');
    if(!s.backfillComplete)parts.push('История за 30 дней загружена не полностью.');
    if(s.sourceError)parts.push('Telegram временно недоступен. Показаны последние сохранённые данные.');
    if(s.priceError)parts.push('Некоторые котировки не удалось проверить.');
    if(!p.dataComplete)parts.push('Баланс пока нельзя точно оценить: нет рыночных цен по всем открытым сделкам.');
    parts.push('Виртуальный баланс не связан с твоими реальными кошельками. История до запуска симуляции не торгуется задним числом.');
    status.textContent=parts.join('\n');
  }
}
async function load(){
  if(loading)return;loading=true;
  const status=$('cryptoSignalsStatus'),button=$('cryptoSignalsRefresh');
  if(button)button.disabled=true;
  if(status&&!current)status.textContent='Получаю сигналы и виртуальный портфель…';
  try{render(await request('crypto-signal-report'))}
  catch(e){if(status)status.textContent='Не удалось обновить отчёт. '+e.message}
  finally{loading=false;if(button)button.disabled=false;}
}
function show(open){
  const panel=$('financeCryptoSignalsPanel'),main=$('financeCryptoMain'),history=$('financeCryptoHistory');
  const overview=$('financeCryptoTotal')?.closest('.finance-crypto-overview');
  if(!panel)return;
  panel.hidden=!open;if(main)main.hidden=open;if(history)history.hidden=true;if(overview)overview.hidden=open;
  if(open)void load();
}
function boot(){
  $('financeCryptoSignalsOpen')?.addEventListener('click',()=>show(true));
  $('financeCryptoSignalsBack')?.addEventListener('click',()=>show(false));
  $('cryptoSignalsRefresh')?.addEventListener('click',()=>void load());
  $('cryptoSignalsSettingsSave')?.addEventListener('click',async()=>{
    if(loading)return;
    const btn=$('cryptoSignalsSettingsSave'),status=$('cryptoSignalsStatus');btn.disabled=true;
    try{
      const d=await request('crypto-signal-settings',{
        allocationPct:Number($('cryptoSignalsAllocation').value),
        leverage:Number($('cryptoSignalsLeverage').value)});
      render({...current,paper:d.paper});
      if(status)status.textContent='Настройки сохранены. История пересчитана без нового деплоя. Настройки симуляции не меняют реальный баланс.';
    }catch(e){if(status)status.textContent='Не удалось сохранить настройки: '+e.message;}
    finally{btn.disabled=false;}
  });
  setInterval(()=>{if(!$('financeCryptoSignalsPanel')?.hidden&&document.visibilityState==='visible'&&navigator.onLine!==false)void load();},5*60000);
  window.addEventListener('online',()=>{if(!$('financeCryptoSignalsPanel')?.hidden)void load()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();