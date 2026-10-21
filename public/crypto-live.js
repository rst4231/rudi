(()=>{'use strict';
const $=id=>document.getElementById(id),money=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
let current=null,dirty=false,busy=false;
const fields={marginUsd:'cryptoLiveMargin',marginCapUsd:'cryptoLiveMarginCap',dailyLossUsd:'cryptoLiveDailyLoss',leverage:'cryptoLiveLeverage',maxOpen:'cryptoLiveMaxOpen',slippagePct:'cryptoLiveSlippage'};
const errors={
 'live-busy':'Сервер завершает проверку этой биржи. Повтори действие через минуту.',
 'live-key-invalid':'Проверь формат API Key и API Secret. Для OKX также нужен Passphrase.',
 'live-exchange-rejected':'Биржа отклонила проверку. Проверь права ключа, фьючерсный счёт и режим позиций.',
 'live-response-invalid':'Биржа вернула неожиданный формат ответа. Торговля не включена.',
 'live-balance-response-invalid':'Pionex не подтвердил данные фьючерсного баланса. Торговля заблокирована.',
 'live-positions-response-invalid':'Pionex не подтвердил список открытых позиций. Торговля заблокирована.',
 'live-account-unverified':'API-ключ сохранён, но Pionex не подтвердил баланс или позиции. Торговля заблокирована. Попробуй «Обновить» позже.',
 'live-request-timeout':'Биржа не ответила за 30 секунд. Попробуй ещё раз.',
 'live-deadline':'Сервер превысил время ожидания биржи. Повтори подключение.',
 'live-network-unavailable':'Нет соединения с сервером. Проверь интернет и попробуй ещё раз.',
 'live-service-unavailable':'Сервер временно недоступен. Попробуй ещё раз.',
 'live-runtime-degraded':'Фоновый сканер видит сбой Telegram или Pionex. Не все торговые действия могут исполняться.',
 'live-author-feed-unavailable':'Канал Артемьева временно недоступен. Новые входы приостановлены.',
 'live-author-exit-unfilled':'Выход по цене автора не исполнен. Проверь оставшуюся позицию на Pionex.',
 'not-authorized':'Сессия истекла. Войди в приложение заново.',
 'live-key-permission':'Ключу нужны чтение и торговля фьючерсами. Проверь API Key, API Secret и права доступа.',
 'live-withdrawal-key':'Создай отдельный API-ключ без права вывода средств.',
 'live-cross-required':'Для этой пары Pionex нужен режим CROSS. Измени его на бирже при закрытых позициях.',
 'live-position-identity-missing':'Не удалось подтвердить принадлежность позиции. Проверь её на бирже.',
 'live-oneway-required':'Включи односторонний режим позиций: OKX net, Pionex BUYSELL.',
 'live-access-blocked':'Биржа ограничила доступ. Проверь IP-ограничения ключа и доступность API.',
 'live-rate-limited':'Биржа ограничила частоту запросов. Попробуй позже.',
 'live-exchange-unavailable':'Биржа временно недоступна. Последние данные сохранены.',
 'live-not-connected':'Сначала подключи API выбранной биржи.',
 'live-risk-invalid':'Укажи положительные суммы, плечо 1–5, максимум 1–5 позиций и отклонение 0,05–2%. Общий лимит должен покрывать сделку.',
 'live-scheduler-stale':'Серверный планировщик не подтверждает работу. Торговля заблокирована для безопасности. Это проблема RUDI, не твоих настроек.',
 'live-consent-required':'Отметь включение реальных сделок после проверки лимитов.',
 'live-programmatic-consent':'Подтверди программный контроль стопа и тейка на Pionex.',
 'live-review-required':'Нужна проверка незавершённого ордера или изменённой позиции. Новые входы приостановлены.',
 'live-open-positions':'Сначала останови новые входы и закрой позиции сканера. Ключи пока сохраняются для сопровождения.',
 'live-daily-loss':'Достигнут лимит потерь за день. Новые входы заблокированы.',
 'live-existing-position':'Уже есть позиция по этой монете. Сканер не добавляет объём к чужой сделке.',
 'live-position-limit':'Достигнут лимит позиций или общей маржи.',
 'live-margin-limit':'Фактическая маржа превысила заданную сумму. Запрошено закрытие позиции сканера.',
 'live-source-stale':'Нет свежих сигналов автора. Новые входы пропускаются.',
 'live-order-unknown':'Ответ на ордер не получен. Сканер проверяет биржу и не отправляет вход повторно.',
 'live-protection-required':'Сигнал без точного входа, стопа или тейка пропущен.',
 'live-signal-ambiguous':'Неоднозначный сигнал или неподдерживаемый рынок пропущен.',
 'live-signal-old':'Старые сигналы не исполняются.',
 'live-author-closed':'Автор уже сообщил о выходе. Новый вход пропущен.',
 'live-price-moved':'Цена ушла дальше допустимого отклонения. Вход пропущен.',
 'live-levels-passed':'Цена уже прошла стоп или тейк. Вход пропущен.',
 'live-position-changed':'Позиция изменилась вне сканера. Проверь её на бирже.',
 'live-insufficient-balance':'Доступного торгового баланса недостаточно для заданной маржи.',
 'live-minimum-order':'Сумма меньше минимального ордера этой монеты на бирже.',
 'live-symbol-unavailable':'Эта монета недоступна на выбранной бирже.',
 'live-leverage-invalid':'Выбранное плечо недоступно для этой монеты.',
 'live-order-sent':'Ордер отправлен. Исполнение подтверждается данными биржи.',
 'live-connected':'API подключён, торговля выключена.'
};
const label=code=>errors[code]||'Не удалось выполнить действие. Проверь подключение и настройки API.';
const selected=()=>'pionex';
const account=()=>current?.accounts?.find(a=>a.provider===selected());
function clearKeys(){for(const id of ['cryptoLiveApiKey','cryptoLiveApiSecret','cryptoLivePassphrase'])if($(id))$(id).value='';}
async function request(operation,values={}){
 const sdk=window.__rudiTelegramSdkReady;
 if(sdk)await Promise.race([Promise.resolve(sdk).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1800))]);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const r=await fetch('/api/finances',{method:'POST',cache:'no-store',signal:controller.signal,
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({operation,initData:window.Telegram?.WebApp?.initData||'',...values})});
  const json=await r.json().catch(()=>({}));
  if(!r.ok||!json.ok)throw Error(json.error||'live-service-unavailable');
  return json;
 }catch(e){
  if(e?.name==='AbortError')throw Error('live-request-timeout');
  if(e?.name==='TypeError')throw Error('live-network-unavailable');
  throw e;
 }finally{clearTimeout(timer);}
}
function row(title,detail,value){
 const box=document.createElement('div');box.className='crypto-signals-item';
 const left=document.createElement('main'),head=document.createElement('strong'),note=document.createElement('p'),right=document.createElement('aside');
 head.textContent=title;note.textContent=detail;right.textContent=value;left.append(head,note);box.append(left,right);return box;
}
function render(data){
 if(!data)return;current=data;const p=selected(),a=account(),s=a?.status;
 if($('cryptoLivePassphraseField'))$('cryptoLivePassphraseField').hidden=true;
 if($('cryptoLiveProgrammaticField'))$('cryptoLiveProgrammaticField').hidden=false;
 $('cryptoLiveConnection').textContent=a?.connected?(s?.verified===false?'API подключён · данные счёта не подтверждены':('API подключён · '+(a.enabled?'торговля включена':'новые входы выключены'))):'Биржа не подключена';
 const enabled=a?.enabled===true,mode=$('cryptoLiveMode'),started=$('cryptoLiveActivatedAt');
 mode.textContent=enabled?'Включена':'Выключена';
 mode.classList.toggle('is-enabled',enabled);
 if(started){
  const ms=Date.parse(a?.activatedAt||'');
  started.hidden=!enabled;
  if(enabled){
   if(Number.isFinite(ms)){
    const date=new Date(ms);
    started.textContent='С '+date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})+
      ' в '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
   }else started.textContent='Время включения не сохранено';
  }else started.textContent='';
 }
 $('cryptoLiveEquity').textContent=money(s?.equity);$('cryptoLiveAvailable').textContent=money(s?.available);
 const positions=s?.positions||[];
 $('cryptoLiveUnrealized').textContent=s?money(positions.reduce((n,r)=>n+Number(r.unrealizedPnl||0),0)):'—';
 $('cryptoLivePositionCount').textContent=s?.verified===false?'—':s?String(positions.length):'—';
 $('cryptoLiveUpdated').textContent=s?.at?'Данные '+new Date(s.at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Подключи биржу';
 if(!dirty){for(const [key,id] of Object.entries(fields))$(id).value=String(a?.settings?.[key]??({leverage:1,maxOpen:1,slippagePct:0.5}[key]??''));$('cryptoLiveProgrammatic').checked=a?.programmaticStops===true;}
 const status=$('cryptoLiveStatus');status.textContent=s?.error?label(s.error):s?.message?label(s.message):'';
 const preflight=$('cryptoLivePreflight');
 if(preflight){
  const blockers=[];
  if(!a?.connected)blockers.push('биржа не подключена');
  else if(s?.verified!==true)blockers.push('баланс и позиции не подтверждены биржей');
  if(a?.connected&&!data.scheduler?.healthy){
   const last=data.scheduler?.lastAt;
   blockers.push(last&&Number.isFinite(Date.parse(last))?'нет свежего запуска планировщика, последний: '+new Date(last).toLocaleString('ru-RU'):'планировщик ни разу не подтвердил запуск');
  }
  if((data.trades||[]).some(t=>t.provider===p&&['unknown','submitted','attention'].includes(t.state)))blockers.push('есть сделки, требующие проверки');
  preflight.textContent=blockers.length?'Включение заблокировано: '+blockers.join('; ')+'.':'API и планировщик подтверждены. Проверь лимиты перед включением.';
 }
 if(a?.connected&&!data.scheduler?.healthy)status.textContent+=(status.textContent?' ':'')+label('live-scheduler-stale');
 const root=$('cryptoLivePositions');root.replaceChildren();
 for(const pos of positions)root.append(row(pos.symbol+' · '+(pos.side==='Buy'?'Лонг':'Шорт'),'Объём '+pos.qty+' · вход '+pos.avgPrice+' · цена '+pos.markPrice,money(pos.unrealizedPnl)+' USDT'));
 if(s?.verified===false)root.textContent='Позиции не подтверждены биржей. Новые сделки заблокированы.';
 else if(!positions.length)root.textContent=a?.connected?'Открытых позиций на бирже нет':'Подключи биржу для загрузки позиций';
 const journal=$('cryptoLiveTrades');journal.replaceChildren();
 const names={submitted:'Проверяется исполнение',unknown:'Ответ уточняется',open:'Открыта',attention:'Проверь позицию',closed:'Закрыта','closed-external':'Закрыта на бирже','not-filled':'Не исполнена',failed:'Отклонена'};
 for(const t of (data.trades||[]).filter(t=>t.provider===p)){
  const unknown=t.state==='closed-external'&&t.realizedPnlUsd==null;
  const pnl=unknown?null:t.realizedPnlUsd??t.grossPnlUsd;
  journal.append(row(t.symbol+' · '+(t.side==='Buy'?'Лонг':'Шорт'),(names[t.state]||t.state)+' · сигнал #'+t.signalId+(t.error?' · '+label(t.error):''),pnl==null?(unknown?'Результат уточняется':'—'):money(pnl)+' USDT'+(t.realizedPnlUsd==null?' до комиссий':'')));
 }
 if(!journal.children.length)journal.textContent='Реальных сделок сканера пока нет';
}
function showStatus(message,connect=false){
 const main=$('cryptoLiveStatus');if(main)main.textContent=message;
 if(connect){const inline=$('cryptoLiveConnectStatus');if(inline)inline.textContent=message;}
}
async function action(operation,values={},success='Сохранено'){
 const connect=operation==='crypto-live-connect';
 if(busy)return false;
 busy=true;
 const button=connect?$('cryptoLiveConnect'):operation==='crypto-live-configure'&&values.enabled?$('cryptoLiveStart'):null;
 const originalLabel=button?.textContent;
 if(button){button.disabled=true;button.textContent=connect?'Проверяю API…':'Проверяю условия…';}
 if(connect)showStatus('Проверяю ключи на бирже. Это может занять до 30 секунд…',true);
 else if(operation==='crypto-live-configure'&&values.enabled)showStatus('Проверяю биржу и серверный планировщик. Торговля пока не включена.');
 let accepted=false;
 try{
  await request(operation,{provider:selected(),...values});accepted=true;dirty=false;
  if(connect){clearKeys();showStatus('API подключён. Загружаю баланс…',true);}
  const data=await request('crypto-live-report');render(data);
  const connected=data.accounts?.find(a=>a.provider===selected());
  if(operation==='crypto-live-configure'&&values.enabled&&connected?.enabled!==true){showStatus('Сервер не подтвердил запуск реальных сделок. Проверь статус планировщика.');return false;}
  showStatus(connect&&connected?.status?.verified===false?label('live-account-unverified'):success,connect);
  return true;
 }catch(e){
  showStatus(accepted&&connect?'API подключён, но обновить баланс не удалось. Нажми «Обновить».':label(e?.message),connect);
  return accepted&&connect;
 }finally{
  busy=false;
  if(button){button.disabled=false;button.textContent=originalLabel;}
 }
}
function settings(){return Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,Number($(id).value)]));}
function boot(){
 if(!$('cryptoLiveProvider'))return;
 $('cryptoLiveProvider').addEventListener('change',()=>{clearKeys();dirty=false;$('cryptoLiveConsent').checked=false;const notice=$('cryptoLiveConnectStatus');if(notice)notice.textContent='';render(current||{accounts:[],trades:[]});});
 for(const id of Object.values(fields))$(id)?.addEventListener('input',()=>{dirty=true;});
 $('cryptoLiveConnect').addEventListener('click',async()=>{
  if(busy)return;
  const values={apiKey:$('cryptoLiveApiKey').value,apiSecret:$('cryptoLiveApiSecret').value,passphrase:$('cryptoLivePassphrase').value};
  await action('crypto-live-connect',values,'API подключён. Новые сделки выключены. Настрой лимиты перед запуском.');
 });
 const configure=enabled=>action('crypto-live-configure',{...settings(),enabled,tradeConsent:$('cryptoLiveConsent').checked,programmaticStops:$('cryptoLiveProgrammatic').checked},enabled?'Торговля включена. Будут исполняться только новые сигналы.':'Настройки сохранены. Новые входы выключены.');
 $('cryptoLiveSave').addEventListener('click',()=>configure(false));$('cryptoLiveStart').addEventListener('click',()=>configure(true));
 $('cryptoLivePause').addEventListener('click',()=>action('crypto-live-pause',{},'Новые входы остановлены. Открытые позиции продолжают сопровождаться.'));
 $('cryptoLiveClose').addEventListener('click',()=>action('crypto-live-close',{},'Запрошено закрытие позиций сканера. Проверь подтверждение после очередного серверного запуска.'));
 $('cryptoLiveDisconnect').addEventListener('click',()=>action('crypto-live-disconnect',{},'API отключён. История сделок сохранена.'));
 $('cryptoLiveRefresh').addEventListener('click',()=>{$('cryptoLiveStatus').textContent='Обновляю данные…';document.dispatchEvent(new Event('rudi-crypto-live-refresh'));});
}
window.RudiCryptoLive={render};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
