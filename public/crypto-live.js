(()=>{'use strict';
const $=id=>document.getElementById(id),money=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
let current=null,dirty=false,busy=false;
const fields={marginUsd:'cryptoLiveMargin',marginCapUsd:'cryptoLiveMarginCap',dailyLossUsd:'cryptoLiveDailyLoss',leverage:'cryptoLiveLeverage',maxOpen:'cryptoLiveMaxOpen',slippagePct:'cryptoLiveSlippage'};
const errors={
 'live-busy':'Сервер завершает проверку этой биржи. Повтори действие через минуту.',
 'live-key-invalid':'Проверь формат API Key, Secret и Passphrase.',
 'live-key-permission':'Ключу нужны чтение и торговля фьючерсами. Проверь также Secret и Passphrase.',
 'live-withdrawal-key':'Создай отдельный API-ключ без права вывода средств.',
 'live-cross-required':'Для этой пары Pionex нужен режим CROSS. Измени его на бирже при закрытых позициях.',
 'live-position-identity-missing':'Не удалось подтвердить принадлежность позиции. Проверь её на бирже.',
 'live-oneway-required':'Включи односторонний режим позиций: OKX net, Pionex BUYSELL.',
 'live-access-blocked':'Биржа ограничила доступ. Проверь IP-ограничения ключа и доступность API.',
 'live-rate-limited':'Биржа ограничила частоту запросов. Попробуй позже.',
 'live-exchange-unavailable':'Биржа временно недоступна. Последние данные сохранены.',
 'live-not-connected':'Сначала подключи API выбранной биржи.',
 'live-risk-invalid':'Укажи положительные суммы, плечо 1–5, максимум 1–5 позиций и отклонение 0,05–2%. Общий лимит должен покрывать сделку.',
 'live-scheduler-stale':'Планировщик не подтверждён. Дождись его проверки; без неё торговля не включается.',
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
const selected=()=>$('cryptoLiveProvider')?.value||'okx';
const account=()=>current?.accounts?.find(a=>a.provider===selected());
function clearKeys(){for(const id of ['cryptoLiveApiKey','cryptoLiveApiSecret','cryptoLivePassphrase'])if($(id))$(id).value='';}
async function request(operation,values={}){
 try{await Promise.resolve(window.__rudiTelegramSdkReady)}catch(_){}
 const r=await fetch('/api/finances',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,initData:window.Telegram?.WebApp?.initData||'',...values})});
 const json=await r.json().catch(()=>({}));if(!r.ok||!json.ok)throw Error(json.error||'live-service-unavailable');return json;
}
function row(title,detail,value){
 const box=document.createElement('div');box.className='crypto-signals-item';
 const left=document.createElement('main'),head=document.createElement('strong'),note=document.createElement('p'),right=document.createElement('aside');
 head.textContent=title;note.textContent=detail;right.textContent=value;left.append(head,note);box.append(left,right);return box;
}
function render(data){
 if(!data)return;current=data;const p=selected(),a=account(),s=a?.status;
 if($('cryptoLivePassphraseField'))$('cryptoLivePassphraseField').hidden=p!=='okx';
 if($('cryptoLiveProgrammaticField'))$('cryptoLiveProgrammaticField').hidden=p!=='pionex';
 $('cryptoLiveConnection').textContent=a?.connected?'API подключён · '+(a.enabled?'торговля включена':'новые входы выключены'):'Биржа не подключена';
 $('cryptoLiveMode').textContent=a?.enabled?'Включена':'Выключена';
 $('cryptoLiveEquity').textContent=money(s?.equity);$('cryptoLiveAvailable').textContent=money(s?.available);
 const positions=s?.positions||[];
 $('cryptoLiveUnrealized').textContent=s?money(positions.reduce((n,r)=>n+Number(r.unrealizedPnl||0),0)):'—';
 $('cryptoLivePositionCount').textContent=s?String(positions.length):'—';
 $('cryptoLiveUpdated').textContent=s?.at?'Данные '+new Date(s.at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Подключи биржу';
 if(!dirty){for(const [key,id] of Object.entries(fields))$(id).value=String(a?.settings?.[key]??({leverage:1,maxOpen:1,slippagePct:0.5}[key]??''));$('cryptoLiveProgrammatic').checked=a?.programmaticStops===true;}
 const status=$('cryptoLiveStatus');status.textContent=s?.error?label(s.error):s?.message?label(s.message):'';
 if(a?.connected&&!data.scheduler?.healthy)status.textContent+=(status.textContent?' ':'')+'Планировщик ещё не подтверждён. Включение новых входов недоступно.';
 const root=$('cryptoLivePositions');root.replaceChildren();
 for(const pos of positions)root.append(row(pos.symbol+' · '+(pos.side==='Buy'?'Лонг':'Шорт'),'Объём '+pos.qty+' · вход '+pos.avgPrice+' · цена '+pos.markPrice,money(pos.unrealizedPnl)+' USDT'));
 if(!positions.length)root.textContent=a?.connected?'Открытых позиций на бирже нет':'Подключи биржу для загрузки позиций';
 const journal=$('cryptoLiveTrades');journal.replaceChildren();
 const names={submitted:'Проверяется исполнение',unknown:'Ответ уточняется',open:'Открыта',attention:'Проверь позицию',closed:'Закрыта','closed-external':'Закрыта на бирже','not-filled':'Не исполнена',failed:'Отклонена'};
 for(const t of (data.trades||[]).filter(t=>t.provider===p)){
  const unknown=t.state==='closed-external'&&t.realizedPnlUsd==null;
  const pnl=unknown?null:t.realizedPnlUsd??t.grossPnlUsd;
  journal.append(row(t.symbol+' · '+(t.side==='Buy'?'Лонг':'Шорт'),(names[t.state]||t.state)+' · сигнал #'+t.signalId+(t.error?' · '+label(t.error):''),pnl==null?(unknown?'Результат уточняется':'—'):money(pnl)+' USDT'+(t.realizedPnlUsd==null?' до комиссий':'')));
 }
 if(!journal.children.length)journal.textContent='Реальных сделок сканера пока нет';
}
async function action(operation,values={},success='Сохранено'){
 if(busy)return;busy=true;
 try{await request(operation,{provider:selected(),...values});dirty=false;
  const data=await request('crypto-live-report');render(data);$('cryptoLiveStatus').textContent=success;
 }catch(e){$('cryptoLiveStatus').textContent=label(e.message);}
 finally{busy=false;}
}
function settings(){return Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,Number($(id).value)]));}
function boot(){
 if(!$('cryptoLiveProvider'))return;
 $('cryptoLiveProvider').addEventListener('change',()=>{clearKeys();dirty=false;$('cryptoLiveConsent').checked=false;render(current||{accounts:[],trades:[]});});
 for(const id of Object.values(fields))$(id)?.addEventListener('input',()=>{dirty=true;});
 $('cryptoLiveConnect').addEventListener('click',async()=>{
  if(busy)return;
  const values={apiKey:$('cryptoLiveApiKey').value,apiSecret:$('cryptoLiveApiSecret').value,passphrase:$('cryptoLivePassphrase').value};
  await action('crypto-live-connect',values,'API подключён. Укажи лимиты и включи торговлю, когда будешь готов.');clearKeys();
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
