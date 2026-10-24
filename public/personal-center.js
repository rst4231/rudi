/* RUDI personal AI center — loaded once with shell; AI is never called on page open */
(function(){
'use strict';
const API='/api/personal-center';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const asDate=v=>{let d=new Date(v);return Number.isFinite(d.valueOf())?d.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):String(v||'')};
function positiveShare(entry){
 const total=Number(entry?.total),positive=Number(entry?.positive);
 return Number.isFinite(total)&&total>0&&Number.isFinite(positive)?Math.round(100*positive/total):null;
}
let root=null,open=false,who='',data=null,report=null,lastStatus=0,loading=false,manualLoading=false,activeSheet='',cycleInfo=null,overviewAt=0,overviewPromise=null,rhythmMode='habits',translatingReportId='';
let centerCloseTimer=0,sheetCloseTimer=0;
let selfProfileObserver=null,selfProfileSource=null,selfProfileFrame=0;
const cachePrefix='rudi-personal-center-session:';
const HALO_CHECK_INTERVAL_MS=90*1000;
function setStatus(t){if($('pcStatus'))$('pcStatus').textContent=String(t||'')}
async function call(operation,extra={}){
 const res=await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({operation,initData:String(window.Telegram?.WebApp?.initData||''),...extra})});
 const result=await res.json().catch(()=>null);
 if(!res.ok||!result?.ok)throw new Error(res.status===401?'Требуется вход':'Не удалось получить данные');
 return result;
}
function markHalo(unread){const avatar=$('avatar');if(avatar){avatar.classList.toggle('pc-unread',!!unread);avatar.setAttribute('aria-label',unread?'Новый недельный обзор':'Открыть мою страницу');}}
function formField(label,control){return '<label class="rudi-center__field">'+label+control+'</label>';}
function renderStars(){
 const button=$('pcStars');if(!button)return;
 const balance=window.RudiStars?.balance?.();
 button.textContent='⭐ '+(balance==null?'…':Number(balance).toLocaleString('ru-RU',{maximumFractionDigits:2}));
 button.setAttribute('aria-label','Мои звёзды: '+(balance==null?'загружаются':button.textContent.slice(3))+'. Открыть историю');
}
function renderSelfProfile(){
 const actor=document.body.dataset.rudiActor||who;
 const source=$(actor==='Диана'?'homeDianaTile':'homeRustamTile'),slot=$('pcSelfProfile');
 if(!slot)return;
 const head=source?.querySelector('.profile-person-head');
 slot.hidden=!head;root.querySelector('.rudi-center__hero').hidden=!!head;
 if(!head)return;
 // Mirror the existing live Home data; never create a second request or move its nodes.
 const clone=node=>{
  if(!node)return null;const copy=node.cloneNode(true),original=[node,...node.querySelectorAll('*')],nodes=[copy,...copy.querySelectorAll('*')];
  nodes.forEach((el,i)=>{
   if(el.id){el.dataset.sourceId=el.id;el.removeAttribute('id')}
   el.removeAttribute('aria-controls');el.removeAttribute('aria-labelledby');
   if(el.matches('.name,.profile-work-status,.rhythm-advice')){el.style.removeProperty('color');el.style.removeProperty('-webkit-text-fill-color')}
   if(el.matches('button,[role="button"]')&&!el.matches('.avatar,.name'))el.onclick=e=>{e.preventDefault();e.stopPropagation();closeAndNavigate(()=>original[i]?.click())};
  });
  copy.hidden=false;copy.removeAttribute('style');return copy;
 };
 const layout=document.createElement('div');layout.className='partner-profile-layout profile-person-card';
 const details=document.createElement('div');details.className='profile-person-details';
 const hero=document.createElement('section');hero.className='partner-hero';hero.setAttribute('aria-label','Мой профиль');
 const identity=clone(head);
 for(const control of identity.querySelectorAll('.block-collapse-button,.profile-person-actions,.mood-person'))control.remove();
 hero.append(identity);
 const person=identity.querySelector('.person'),meta=$('pcHeroMeta');
 if(person&&meta){const metrics=document.createElement('div');metrics.className='partner-body-metrics';metrics.append(...[...meta.children].map(el=>el.cloneNode(true)));person.append(metrics)}
 const mood=identity.querySelector('.avatar-mood-badge'),name=identity.querySelector('.name');
 if(mood&&name){let row=name.closest('.profile-name-row');if(!row){row=document.createElement('div');row.className='profile-name-row';name.before(row);row.append(name)}row.append(mood)}
 for(const el of identity.querySelectorAll('.avatar,.name')){el.removeAttribute('role');el.removeAttribute('tabindex');el.removeAttribute('aria-label')}
 const energy=clone(source.querySelector('.profile-energy-strip')),advice=clone(source.querySelector('.rhythm-advice'));
 const energyCard=document.createElement('section');energyCard.className='partner-energy-card';
 if(energy)energyCard.append(energy);if(advice)energyCard.append(advice);
 const today=document.createElement('section');today.className='partner-today';today.innerHTML='<h2>БАДы</h2>';
 const intakes=clone(source.querySelector('.profile-supplement-intakes'));
 if(intakes)today.append(intakes);else today.insertAdjacentHTML('beforeend','<p class="profile-supplement-intakes-empty">Сегодня ещё ничего не отмечено</p>');
 details.append(hero);if(energy)details.append(energyCard);details.append(today);layout.append(details);slot.replaceChildren(layout);
 if(selfProfileSource!==source){
  selfProfileObserver?.disconnect();selfProfileSource=source;
  selfProfileObserver=new MutationObserver(()=>{if(!open)return;cancelAnimationFrame(selfProfileFrame);selfProfileFrame=requestAnimationFrame(renderSelfProfile)});
  selfProfileObserver.observe(source,{subtree:true,childList:true,characterData:true,attributes:true});
 }
}
function makeMarkup(){
 const p=[];
 p.push('<header class="rudi-center__bar rudi-app-page-head"><button id="pcBack" class="fasting-back-button rudi-center__back rudi-app-page-back" type="button" aria-label="Назад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6"/></svg></button><h1>Моя страница</h1><button id="pcStars" class="partner-profile-stars" type="button" aria-label="Мои звёзды. Открыть историю">⭐ …</button></header>');
 p.push('<div class="rudi-center__wrap"><div class="rudi-center__content">');
 p.push('<div id="pcSelfProfile" class="pc-self-profile partner-profile-page" hidden></div>');
 p.push('<div class="rudi-center__hero"><small>✦ ЛИЧНЫЙ ОБЗОР</small><div class="rudi-center__hero-identity"><div class="rudi-center__hero-avatar" aria-hidden="true"><span id="pcHeroInitial">Р</span><img id="pcHeroImage" alt="" hidden></div><div class="rudi-center__hero-name"><h1 id="pcPerson">Мой день</h1><p id="pcHeroMeta">Возраст — · Вес — · Рост —</p><div id="pcHeroAttention" class="rudi-center__hero-attention" hidden></div></div></div></div>');
 p.push('<div class="rudi-center__card rudi-center__report"><div class="rudi-center__head"><div><small class="rudi-center__eyebrow">ТВОЯ НЕДЕЛЯ</small></div><span class="rudi-center__meta" id="pcReportDate">Сегодня</span></div><p class="rudi-center__report-lead" id="pcReport">Обзор недели формируется по воскресеньям.</p><div class="rudi-center__summary-grid" id="pcSummaryGrid" hidden><div class="rudi-center__summary-main" id="pcMainBlock"><small>ГЛАВНОЕ</small><p id="pcMainChange">—</p></div><div class="rudi-center__summary-action" id="pcActionBlock"><small>ЧТО СДЕЛАТЬ</small><p id="pcMainAction">—</p></div><div class="rudi-center__summary-note" id="pcObservationBlock"><small>НАБЛЮДЕНИЕ</small><p id="pcMainObservation">—</p></div><div class="rudi-center__summary-note" id="pcForecastBlock"><small>ЧТО ДАЛЬШЕ</small><p id="pcForecast">—</p></div></div><button id="pcReportMore" class="rudi-center__report-more" data-open="report" type="button" hidden>Открыть подробности →</button><button id="pcGenerateReport" class="rudi-center__btn rudi-center__generate-report" type="button" hidden>Получить обзор</button><div class="rudi-center__status" id="pcStatus" role="status" aria-live="polite"></div></div>');
 p.push('<section class="rudi-center__card rudi-center__rhythm" aria-labelledby="pcRhythmTitle"><div class="rudi-center__head"><div><small class="rudi-center__eyebrow">7 ДНЕЙ</small><h2 id="pcRhythmTitle">Ритм недели</h2></div><span class="rudi-center__rhythm-period" id="pcRhythmPeriod">За неделю</span></div><div class="rudi-center__rhythm-tabs" role="group" aria-label="Показатель графика"><button type="button" data-rhythm="habits" class="active" aria-pressed="true">Привычки</button><button type="button" data-rhythm="expenses" aria-pressed="false">Расходы</button><button type="button" data-rhythm="mood" aria-pressed="false">Настроение</button></div><div class="rudi-center__rhythm-head"><strong id="pcRhythmMetric">—</strong><span id="pcRhythmSub">Отмеченные дни</span></div><svg id="pcRhythmGraph" class="rudi-center__rhythm-chart" viewBox="0 0 350 188" role="img" aria-label="График записей за семь дней"></svg><p class="rudi-center__rhythm-empty" id="pcRhythmEmpty" hidden>Пока нет записей за эту неделю.</p><small class="rudi-center__rhythm-foot" id="pcRhythmFoot">Отображаются только сохранённые записи.</small></section>');
 p.push('<div class="rudi-center__tile-grid"><button class="rudi-center__tile" data-open="symptoms"><span class="rudi-center__tile-icon">♡</span><strong>Здоровье</strong><small id="pcSymptomsCount">Дневник здоровья</small></button><button class="rudi-center__tile" data-open="weight"><span class="rudi-center__tile-icon">↟</span><strong>Моё тело</strong><small id="pcWeight">Вес и рост</small></button></div>');
 p.push('<div class="rudi-center__card"><div class="rudi-center__head"><h2>Динамика позитивных эмоций</h2></div><svg class="rudi-center__chart" id="pcGraph" viewBox="0 0 350 168" role="img" aria-label="График доли позитивных эмоций с датами"></svg></div>');
 p.push('<div id="pcDianaCycleSlot" class="rudi-center__cycle-slot" hidden><section class="rudi-center__card rudi-center__cycle-card"><div class="rudi-center__head"><h2>Цикл Дианы</h2><span class="rudi-center__meta">Прогноз</span></div><div class="rudi-center__cycle-grid"><div><span>Фаза</span><strong id="pcCyclePhase">—</strong></div><div><span>День цикла</span><strong id="pcCycleDay">—</strong></div><div><span>До следующих месячных</span><strong id="pcCycleCountdown">—</strong></div><div><span>Последнее начало</span><strong id="pcCyclePeriod">—</strong></div></div><p id="pcCycleNote" class="rudi-center__meta">Прогноз ориентировочный.</p><button id="pcCycleRecord" class="rudi-center__btn" type="button" hidden>Отметить начало сегодня</button></section></div>');
 p.push('<section class="pc-gifts"><h2>🎁 Подарки</h2><div class="pc-birthday"><span aria-hidden="true">🎂</span><div><strong>До дня рождения</strong><small id="pcBirthdayDate"></small></div><b id="pcBirthdayDays"></b></div><div class="pc-wishes"><div class="pc-wishes-head"><h3>♡ Желания</h3><span id="pcWishCount"></span></div><form id="pcWishForm"><input id="pcWishText" maxlength="180" placeholder="Добавить желание…" aria-label="Желание" required><button type="submit" aria-label="Добавить желание">+</button><button id="pcWishLinkToggle" type="button" aria-expanded="false">+ Добавить ссылку</button><input id="pcWishUrl" type="url" maxlength="1200" placeholder="https://…" aria-label="Ссылка на подарок" hidden></form><p id="pcWishStatus" role="status"></p><div id="pcWishList"></div></div></section>');
 p.push('</div></div>');
 p.push('<div class="rudi-center__overlay" id="pcOverlay" hidden><div class="rudi-center__sheet" role="dialog" aria-modal="true" aria-labelledby="pcSheetTitle"><div class="rudi-center__sheet-head rudi-app-page-head"><button id="pcSheetClose" class="fasting-back-button rudi-center__back rudi-app-page-back" type="button" aria-label="Назад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6"/></svg></button><h1 id="pcSheetTitle">Данные</h1></div><div id="pcSheetContent" class="rudi-center__sheet-content"></div></div></div>');
 return p.join('');
}
function attach(){
 if(root)return;
 root=document.createElement('section');root.id='personalAICenter';root.className='rudi-center';root.hidden=true;root.dataset.noPullRefresh='true';
 root.innerHTML=makeMarkup();document.body.appendChild(root);
 $('pcBack').onclick=hide;
 $('pcStars').onclick=()=>{if(!window.RudiStars?.openHistory)return;root.hidden=true;document.body.classList.remove('rudi-center-open');window.RudiStars.openHistory()};
 document.addEventListener('rudi:stars-changed',renderStars);
 $('pcGenerateReport').onclick=()=>void requestDailyReport();
 $('pcWishLinkToggle').onclick=()=>{const input=$('pcWishUrl');input.hidden=!input.hidden;$('pcWishLinkToggle').setAttribute('aria-expanded',String(!input.hidden));if(!input.hidden)input.focus()};
 $('pcWishForm').onsubmit=async event=>{
  event.preventDefault();const text=$('pcWishText').value.trim(),url=$('pcWishUrl').value.trim(),actor=who;
  if(!text||!window.RudiWishlist)return;
  const button=$('pcWishForm').querySelector('[type=submit]');button.disabled=true;
  try{const items=await window.RudiWishlist.add(text,url);if(actor!==who)return;$('pcWishText').value='';$('pcWishUrl').value='';$('pcWishUrl').hidden=true;$('pcWishLinkToggle').setAttribute('aria-expanded','false');renderGiftWishes(items);$('pcWishStatus').textContent='Желание добавлено';}
  catch(_){$('pcWishStatus').textContent='Не удалось добавить желание. Попробуй ещё раз.'}finally{button.disabled=false}
 };

 root.querySelectorAll('[data-rhythm]').forEach(btn=>btn.onclick=()=>{rhythmMode=btn.dataset.rhythm;renderRhythm();});
 $('pcCycleRecord').onclick=()=>void recordPersonalCycle();
 $('pcSheetClose').onclick=closeSheet;$('pcOverlay').addEventListener('click',e=>{if(e.target===$('pcOverlay'))closeSheet();});
 root.addEventListener('click',e=>{
  const btn=e.target.closest('[data-open],[data-external],[data-tab]');if(!btn)return;
  if(btn.dataset.open)sheet(btn.dataset.open);
  if(btn.dataset.external)closeAndNavigate(()=>$(btn.dataset.external)?.click());
  if(btn.dataset.tab)closeAndNavigate(()=>{if(typeof window.RUDI_NAVIGATE_TO_TAB==='function')window.RUDI_NAVIGATE_TO_TAB(btn.dataset.tab,{scroll:true});else document.querySelector('[data-app-tab="'+btn.dataset.tab+'"]')?.click();});
 });
 document.addEventListener('keydown',e=>{if(!open||e.key!=='Escape')return;if(activeSheet)closeSheet();else hide();});
 const name=$('displayName');if(name){
  name.setAttribute('role','button');name.tabIndex=0;name.setAttribute('aria-label','Открыть мою страницу');name.removeAttribute('aria-controls');name.removeAttribute('aria-expanded');
  name.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();void show()},{capture:true});
  name.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopImmediatePropagation();void show()}},{capture:true});
 }
 const av=$('avatar');if(av){
  av.style.cursor='pointer';av.setAttribute('role','button');av.setAttribute('tabindex','0');
  av.addEventListener('click',e=>{if(e.target.closest('button'))return;show();});
  av.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}});
 }
 const tryStatus=()=>{if(!document.body.classList.contains('auth-pending')){void checkStatus();return true;}return false;};
 if(window.visualViewport){window.visualViewport.addEventListener('resize',syncSheetViewport,{passive:true});window.visualViewport.addEventListener('scroll',syncSheetViewport,{passive:true});}
 if(!tryStatus()){const observer=new MutationObserver(()=>{if(tryStatus())observer.disconnect();});observer.observe(document.body,{attributes:true,attributeFilter:['class']});}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkStatus(true);});
 window.addEventListener('focus',()=>void checkStatus(true));
 window.addEventListener('online',()=>void checkStatus(true));
 // A morning report can be published while the PWA remains in the foreground.
 // Poll status only: no full overview, language translation or new AI generation.
 window.setInterval(()=>{if(!open&&!document.hidden)void checkStatus();},HALO_CHECK_INTERVAL_MS);
 // Immediately clear a previous account's halo after switching actors
 // within the PWA, before loading the next account's unread state.
 new MutationObserver(()=>{lastStatus=0;markHalo(false);void checkStatus(true);})
   .observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
 installCenterSwipeBack();
 new MutationObserver(()=>{if(open)renderSelfProfile()}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 window.addEventListener('popstate',()=>{
  const state=history.state;
  if(open&&state?.rudiOverlay==='personal-ai'){root.hidden=false;document.body.classList.add('rudi-center-open');renderStars();renderSelfProfile()}
  if(open&&state?.rudiOverlay!=='personal-ai'){hide({fromHistory:true});return;}
  if(!open&&state?.rudiOverlay==='personal-ai'){void show({fromHistory:true});return;}
  if(!open)return;
  const targetSheet=String(state?.rudiAiSheet||'');
  if(!targetSheet&&activeSheet)closeSheet({fromHistory:true});
  else if(targetSheet&&targetSheet!==activeSheet)sheet(targetSheet,{fromHistory:true});
 });
}
async function checkStatus(force=false){
 if(open||document.hidden||document.body.classList.contains('auth-pending'))return;
 if(!force&&Date.now()-lastStatus<HALO_CHECK_INTERVAL_MS)return;
 lastStatus=Date.now();
 try{const res=await call('status');if(who&&res.actor!==who){data=null;report=null;cycleInfo=null;overviewAt=0;}who=res.actor;markHalo(res.unread);}catch(e){lastStatus=0;}
}
function cacheKey(){return cachePrefix+who;}
function showOffline(){
 try{if(!who)return false;const stored=JSON.parse(sessionStorage.getItem(cacheKey())||'null');if(!stored)return false;data=stored.data;report=stored.report;cycleInfo=stored.cycleInfo||null;draw();setStatus('Нет сети · показаны сохранённые данные');return true;}
 catch(e){return false;}
}
function repairEnglishReportInBackground(){
 const reportId=report?.id;
 if(!reportId||!report.translationPending||translatingReportId===reportId)return;
 translatingReportId=reportId;
 void call('translate-report').then(result=>{
  if(!result?.report||report?.id!==reportId||result.actor!==who)return;
  report=result.report;
  draw();
  try{sessionStorage.setItem(cacheKey(),JSON.stringify({data,report,cycleInfo}));}catch(_){}
 }).catch(()=>{}).finally(()=>{if(translatingReportId===reportId)translatingReportId='';});
}
async function fetchOverview(force=false){
 if(overviewPromise)return overviewPromise;
 if(!force&&who&&data&&Date.now()-overviewAt<90000){draw();repairEnglishReportInBackground();return true;}
 overviewPromise=(async()=>{
  const res=await call('overview',{knownVersion:data?.version??-1,knownReportId:report?.id||'',knownReportUpdatedAt:report?.updatedAt||report?.createdAt||'',knownEmotionVersion:data?.emotions?.version||''});
  if(res.unchanged){overviewAt=Date.now();markHalo(false);if(report?.id)void call('read-report').catch(()=>{});setStatus('');repairEnglishReportInBackground();return true;}
  who=res.actor;data=res.data;report=res.report;cycleInfo=res.cycle||null;overviewAt=Date.now();draw();repairEnglishReportInBackground();
  try{sessionStorage.setItem(cacheKey(),JSON.stringify({data,report,cycleInfo}));}catch(_){}
  markHalo(false);setStatus('');
  if(res.indicator?.unread)void call('read-report').catch(()=>{});
  return true;
 })().finally(()=>{overviewPromise=null;});
 return overviewPromise;
}
async function show({fromHistory=false}={}){
 if(open)return;
 attach();
 clearTimeout(centerCloseTimer);
 root.classList.remove('is-closing');
 open=true;root.hidden=false;document.body.classList.add('rudi-center-open');
 renderStars();renderSelfProfile();
 if(!fromHistory){
  try{
   const state=history.state&&typeof history.state==='object'?history.state:{};
   history.pushState({...state,rudiOverlay:'personal-ai',rudiAiSheet:null},'',window.location.href);
  }catch(_){}
 }else if(history.state?.rudiAiSheet){
  sheet(String(history.state.rudiAiSheet),{fromHistory:true});
 }
 if(!data)showOffline();
 updateReportButton();
 setStatus('');
 try{await fetchOverview(false);void refreshGifts();}
 catch(_){if(!data&&!showOffline())setStatus('Нет соединения с RUDI · попробуй позже');}
}
function motionReduced(){
 try{return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)}catch(_){return false}
}
function hide({fromHistory=false}={}){
 if(!open)return;
 if(!fromHistory&&history.state?.rudiOverlay==='personal-ai'){
  try{history.go(history.state?.rudiAiSheet?-2:-1);return}catch(_){}
 }
 closeSheet({fromHistory:true,immediate:true});
 open=false;
 if(!root)return;
 clearTimeout(centerCloseTimer);
 root.classList.add('is-closing');
 const finish=()=>{if(open)return;root.hidden=true;root.classList.remove('is-closing');document.body.classList.remove('rudi-center-open')};
 if(motionReduced()){finish();return}
 centerCloseTimer=setTimeout(finish,225);
}
function closeAndNavigate(action){
 if(typeof action!=='function')return;
 if(history.state?.rudiOverlay==='personal-ai'){
  const steps=history.state?.rudiAiSheet?-2:-1;
  window.addEventListener('popstate',()=>requestAnimationFrame(action),{once:true});
  history.go(steps);
 }else{hide({fromHistory:true});requestAnimationFrame(action)}
}
function showText(id,text){if($(id))$(id).textContent=String(text??'');}
function safeNarrative(row){
 const original=row?.narrative;if(!original)return null;
 const n={...original,focus:Array.isArray(original.focus)?[...original.focus]:[]};
 const f=row?.observations?.finances;
 // Some old AI reports mistakenly called sums in personalExpenses "income".
 // Only redact when no verified incomes were supplied in those observations.
 const financePresent=Boolean(f&&(Array.isArray(f.months)||Array.isArray(f.expenseMonths)));
 const noIncomeProof=financePresent&&!(Number(f?.incomeEntries)>0);
 if(noIncomeProof){
  const financialClaim=/доход|заработ|выручк|прибыл/i;
  for(const key of ['headline','overview','mainChange','mainObservation','financeText','trendText']){
   if(financialClaim.test(String(n[key]||'')))n[key]='В сводке нет подтверждённых данных о доходах: суммы из личных операций относятся к расходам.';
  }
  n.focus=n.focus.filter(v=>!financialClaim.test(String(v||'')));
 }
 if(/головн|симптом|боль|лечен|диагноз|заболев/i.test(String(n.forecast||'')))
  n.forecast='Недостаточно данных для медицинского прогноза.';
 return n;
}
// A seven-day chart of recorded facts only. Missing days are gaps, never fabricated zeros.
function reportHasText(v){
 const text=String(v||'').trim();
 return !!text&&!/^(Недостаточно данных|AI-анализ временно недоступен|Данных пока нет|Нет данных)[.!]?$|^Недостаточно подтверждённых/i.test(text);
}
function renderRhythm(){
 const svg=$('pcRhythmGraph');if(!svg)return;
 const start=dayKey(),base=Date.parse(start+'T12:00:00Z');
 const dates=Array.from({length:7},(_,i)=>new Date(base-(6-i)*86400000).toISOString().slice(0,10));
 const label=day=>new Date(day+'T12:00:00Z').toLocaleDateString('ru-RU',{weekday:'short',timeZone:'UTC'}).replace('.','').slice(0,2);
 const dateLabel=day=>day.slice(8,10)+'.'+day.slice(5,7);
 const observations=report?.observations||{};
 const habits=new Map((observations.habits?.recent||[]).map(x=>[x.day,Number(x.completed)||0]));
 const expenses=new Map((observations.finances?.recentExpenseDays||[]).map(x=>[x.day,Number(x.rub)||0]));
 const moods=new Map((data?.emotions?.daily||[]).map(x=>[x.date,positiveShare(x)]).filter(([,value])=>Number.isFinite(value)));
 const maps={habits,expenses,mood:moods},units={habits:'отметок',expenses:'₽',mood:'%'};
 const mode=maps[rhythmMode]?rhythmMode:'habits',series=maps[mode],values=dates.map(d=>series.has(d)?series.get(d):null);
 const valid=values.filter(Number.isFinite),max=Math.max(mode==='mood'?100:1,...valid);
 const title={habits:'Привычки',expenses:'Расходы',mood:'Позитивные отметки'}[mode];
 const renderValue=n=>mode==='expenses'?Math.round(n).toLocaleString('ru-RU')+' ₽':mode==='mood'?Math.round(n)+'%':Math.round(n)+'';
 root.querySelectorAll('[data-rhythm]').forEach(btn=>{const active=btn.dataset.rhythm===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active?'true':'false');});
 showText('pcRhythmMetric',valid.length?valid.length+' из 7 дней':'Нет отметок');
 showText('pcRhythmSub',title+' · '+(valid.length?units[mode]:'нет записей'));
 showText('pcRhythmPeriod','7 дней');
 showText('pcRhythmFoot',mode==='expenses'?'Показаны только дни с записанными расходами.':mode==='mood'?'Доля позитивных отметок из дневника настроения.':'Показаны дни с отмеченными результатами привычек.');
 const empty=$('pcRhythmEmpty');if(empty)empty.hidden=valid.length>0;
 svg.hidden=!valid.length;
 svg.replaceChildren();if(!valid.length)return;
 const ns='http://www.w3.org/2000/svg',create=(tag,attrs,text)=>{
   const item=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs||{}))item.setAttribute(k,String(v));
   if(text!==undefined)item.textContent=String(text);svg.appendChild(item);return item;
 };
 const px=44,step=43.5,bottom=132,usable=97;
 for(const t of [0,.5,1]){
  const y=bottom-t*usable;
  create('line',{x1:8,y1:y,x2:342,y2:y,stroke:'currentColor','stroke-opacity':.09,'stroke-width':1,'stroke-dasharray':t===0?'':'3 6'});
 }
 for(let i=0;i<7;i++){
  const x=px+i*step,d=dates[i],v=values[i],present=Number.isFinite(v),height=present?Math.max(v===0?3:6,usable*v/max):0;
  if(present){
   create('rect',{x:x-13,y:bottom-height,width:26,height,rx:7,fill:'var(--pc-rhythm-color)'});
   create('text',{x,y:Math.max(15,bottom-height-8),'text-anchor':'middle',fill:'var(--pc-text)','font-size':10,'font-weight':750},renderValue(v));
  }else create('circle',{cx:x,cy:bottom-5,r:2.5,fill:'var(--pc-muted)','fill-opacity':.34});
  create('text',{x,y:154,'text-anchor':'middle',fill:'var(--pc-muted)','font-size':11,'font-weight':700},label(d));
   create('text',{x,y:173,'text-anchor':'middle',fill:'var(--pc-muted)','font-size':10},dateLabel(d));
 }
 svg.setAttribute('aria-label',title+': '+valid.length+' дней с данными из семи');
}
function graph(){
 const svg=$('pcGraph');if(!svg)return;svg.replaceChildren();
 const points=(data?.emotions?.daily||[]).map(x=>({day:x.date,value:positiveShare(x)})).filter(x=>Number.isFinite(x.value)&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.day))).slice(-30);
 const ns='http://www.w3.org/2000/svg',add=(tag,attrs,body)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs||{}))el.setAttribute(k,String(v));if(body!==undefined)el.textContent=String(body);svg.append(el);return el;};
 svg.setAttribute('viewBox','0 0 350 168');
 if(points.length<2){add('text',{x:12,y:65,fill:'currentColor','font-size':12},'График появится после двух записей настроения');return;}
 const x=i=>22+310*i/(points.length-1),y=n=>110-93*n/100;
 for(const n of [0,50,100])add('line',{x1:22,y1:y(n),x2:332,y2:y(n),stroke:'currentColor','stroke-opacity':.09,'stroke-dasharray':'3 5'});
 add('polyline',{points:points.map((p,i)=>x(i).toFixed(1)+','+y(p.value).toFixed(1)).join(' '),fill:'none',stroke:'var(--pc-accent)','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
 const ticks=[0,Math.floor((points.length-1)/4),Math.floor((points.length-1)/2),Math.floor((points.length-1)*3/4),points.length-1].filter((v,i,a)=>a.indexOf(v)===i);
 for(const i of ticks){const p=points[i],cx=x(i),day=new Date(p.day+'T12:00:00Z').toLocaleDateString('ru-RU',{weekday:'short',timeZone:'UTC'}).replace('.','');
  add('circle',{cx,cy:y(p.value),r:3.3,fill:'var(--pc-accent)'});
  add('text',{x:cx,y:138,'text-anchor':'middle',fill:'var(--pc-muted)','font-size':11,'font-weight':700},day.slice(0,2));
  add('text',{x:cx,y:154,'text-anchor':'middle',fill:'var(--pc-muted)','font-size':10},p.day.slice(8,10)+'.'+p.day.slice(5,7));}
}
function syncHero(){
 const image=$('pcHeroImage'),initial=$('pcHeroInitial'),source=$('avatarImage');
 if(image&&initial){
  const path=source?.currentSrc||source?.getAttribute('src')||'';
  const hasPhoto=Boolean(path&&source?.complete&&source.naturalWidth>0);
  image.hidden=!hasPhoto;initial.hidden=hasPhoto;
  if(hasPhoto&&image.getAttribute('src')!==path)image.setAttribute('src',path);
  initial.textContent=($('initials')?.textContent||who?.slice(0,1)||'Р').trim().slice(0,1).toUpperCase();
 }
 const b=String(data?.profile?.birthDate||''),birth=b?new Date(b+'T12:00:00Z'):null;
 let age='—';
 if(birth&&Number.isFinite(birth.getTime())){
  const clock=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [y,m,d]=clock.split('-').map(Number),[by,bm,bd]=b.split('-').map(Number);
  const n=y-by-(m<bm||(m===bm&&d<bd)?1:0);
  if(n>0&&n<125)age=String(n);
 }
 const last=data?.weights?.at(-1);
 const height=Number(data?.profile?.height),kg=Number(last?.kg),bmi=height>=100&&height<=230&&last&&kg>=25&&kg<=400?kg/Math.pow(height/100,2):null;
 const alert=bmi!==null&&(bmi<18.5||bmi>=25),activeSymptoms=(data?.symptoms||[]).filter(s=>s.state!=='resolved').length;
 const meta=$('pcHeroMeta');if(meta){
  meta.replaceChildren();const metric=(label,warning)=>{const el=document.createElement('span');el.className='rudi-center__hero-metric';el.textContent=label;
  if(warning){const dot=document.createElement('span');dot.textContent='●';dot.className='rudi-center__hero-warning';dot.title='Показатель требует внимания';el.append(dot);}meta.append(el);};
  metric('Возраст '+age,false);metric('Вес '+(last?last.kg+' кг':'—'),alert);metric('Рост '+(height>=100&&height<=230?height+' см':'—'),false);
 }
 const attention=$('pcHeroAttention');if(attention){attention.replaceChildren();
  const notes=[];if(alert)notes.push('Вес: ИМТ '+bmi.toFixed(1).replace('.',',')+' вне стандартного ориентира. Это не диагноз.');
  if(activeSymptoms)notes.push('Активных записей о самочувствии: '+activeSymptoms+'.');
  for(const note of notes){const el=document.createElement('span');el.textContent='● '+note;attention.append(el);}attention.hidden=!notes.length;
 }
 renderSelfProfile();
}
// iOS/PWA: an edge swipe goes back one level without disrupting vertical scroll.
function installCenterSwipeBack(){
 let start=null;
 root.addEventListener('touchstart',event=>{
  start=null;
  if(!open||event.touches.length!==1)return;
  const point=event.touches[0];
  if(point.clientX>64||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  start={x:point.clientX,y:point.clientY,at:Date.now(),sheet:activeSheet};
 },{passive:true});
 root.addEventListener('touchmove',event=>{
  if(!start||event.touches.length!==1)return;
  const dx=event.touches[0].clientX-start.x,dy=Math.abs(event.touches[0].clientY-start.y);
  if(dx>25&&dy<dx*.55&&event.cancelable)event.preventDefault();
 },{passive:false});
 root.addEventListener('touchend',event=>{
  if(!start||!open||!event.changedTouches.length)return;
  const swipe=start;start=null;
  const dx=event.changedTouches[0].clientX-swipe.x;
  const dy=Math.abs(event.changedTouches[0].clientY-swipe.y);
  if(dx<75||dy>Math.max(40,dx*.55)||Date.now()-swipe.at>950)return;
  if(swipe.sheet&&activeSheet===swipe.sheet)closeSheet();
  else if(!activeSheet)hide();
 },{passive:true});
 root.addEventListener('touchcancel',()=>{start=null;},{passive:true});
}
function syncSheetViewport(){
 if(!$('pcOverlay')||$('pcOverlay').hidden)return;
 const vv=window.visualViewport;
 const height=Math.round(vv?.height||window.innerHeight);
 root.style.setProperty('--pc-visual-height',Math.max(height,240)+'px');
 root.style.setProperty('--pc-visual-top',Math.max(0,Math.round(vv?.offsetTop||0))+'px');
}
function mountDianaCycle(){
 const slot=$('pcDianaCycleSlot');if(!slot)return;
 // Independent card: the calendar's router no longer controls visibility.
 const allowed=who==='Диана'&&open;
 slot.hidden=!allowed;
 if(!allowed)return;
 const c=cycleInfo;
 const label=(id,text)=>showText(id,text||'—');
 if(!c){
  label('pcCyclePhase','Данных пока нет');
  label('pcCycleDay','—');label('pcCycleCountdown','—');label('pcCyclePeriod','—');
  label('pcCycleNote','Нет сохранённых данных о цикле.');
  const btn=$('pcCycleRecord');if(btn)btn.hidden=true;
  return;
 }
 label('pcCyclePhase',c.phase);
 label('pcCycleDay',c.cycleDay?c.cycleDay+'-й день':'—');
 label('pcCycleCountdown',Number.isFinite(c.daysToNext)?(c.daysToNext>0?c.daysToNext+' дн.':c.daysToNext===0?'Сегодня':'Дата прогноза прошла'):'—');
 label('pcCyclePeriod',c.periodStart||'—');
 label('pcCycleNote','Ориентировочный расчёт по сохранённой истории. Возможны отклонения.');
 const btn=$('pcCycleRecord');
 if(btn){
  btn.hidden=false;
  btn.dataset.operation=c.periodActive?'record-end':'record-start';
  btn.textContent=c.periodActive?'Отметить конец месячных сегодня':'Отметить начало месячных сегодня';
 }
}
async function recordPersonalCycle(){
 const btn=$('pcCycleRecord');if(!btn||who!=='Диана'||!open||!cycleInfo)return;
 const op=btn.dataset.operation==='record-end'?'record-end':'record-start';
 const message=op==='record-end'?'Отметить сегодня как последний день месячных?':'Отметить сегодня как первый день нового цикла?';
 const confirm=()=>new Promise(resolve=>{
  const tg=window.Telegram?.WebApp;
  if(tg?.showConfirm){try{tg.showConfirm(message,result=>resolve(Boolean(result)));return;}catch(_){}}
  resolve(window.confirm(message));
 });
 if(!await confirm())return;
 btn.disabled=true;btn.textContent='Сохраняю…';
 try{
  const response=await fetch('/api/cycle',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({initData:String(window.Telegram?.WebApp?.initData||''),operation:op})});
  const value=await response.json().catch(()=>null);
  if(!response.ok||!value?.ok)throw Error('cycle-save-failed');
  await fetchOverview(true);
  setStatus('Данные цикла обновлены');
 }catch(_){setStatus('Не удалось сохранить запись цикла');}
 finally{btn.disabled=false;mountDianaCycle();}
}
function isReportSunday(){return new Date(dayKey()+'T12:00:00Z').getUTCDay()===0;}
function updateReportButton(){
 const button=$('pcGenerateReport');if(!button)return;
 button.hidden=!['Рустам','Диана'].includes(who);
 if(button.hidden)return;
 const current=report?.date===dayKey()&&report?.slot==='weekly'&&report?.model!=='deterministic'&&Boolean(report?.narrative);
 button.disabled=manualLoading||Boolean(current)||!isReportSunday();
 button.textContent=manualLoading?'Анализирую…':current?'Обзор недели готов':isReportSunday()?'Получить обзор недели':'Новый обзор в воскресенье';
 button.setAttribute('aria-busy',manualLoading?'true':'false');
}
async function requestDailyReport(){
 if(!['Рустам','Диана'].includes(who)||manualLoading||$('pcGenerateReport')?.disabled)return;
 manualLoading=true;updateReportButton();
 try{
  // The initial read may still be running. Wait before deciding whether AI is needed.
  if(overviewPromise)await overviewPromise.catch(()=>{});
  setStatus('Готовлю обзор недели…');
  const result=await call('generate-report');
  if(result.status==='scheduled'){setStatus('Новый обзор формируется только по воскресеньям');return;}
  if(result.status==='already-running'){
   setStatus('Сводка уже формируется. Попробуй ещё раз через минуту.');return;
  }
  if(result.report&&result.report.model!=='deterministic'&&result.report.narrative){
   report=result.report;who=result.actor;
   if(data){
    draw();
    try{sessionStorage.setItem(cacheKey(),JSON.stringify({data,report,cycleInfo}));}catch(_){}
   }else await fetchOverview(true);
  }
  if(result.status==='unavailable'){
   const reason=String(result.failureReason||'');
   setStatus((reason==='rate-limited'?'Лимит AI, повтори чуть позже.':reason==='timeout'?'AI не успел ответить, повтори попытку.':reason.startsWith('provider-')?'AI вернул ошибку '+reason.slice(9)+'.':'AI пока не ответил.')+' Предыдущая успешная сводка сохранена.');return;
  }
  setStatus(report?.model==='deterministic'?'AI пока недоступен. Нажми «Обновить анализ» немного позже.':
   result.status==='upgraded'?'Полноценный AI-анализ готов!':
   result.status==='regenerated'?'AI-сводка обновлена!':
   result.status==='created'?'Обзор недели готов':'Обзор этой недели уже сохранён');
 }catch(error){
  setStatus(error?.message==='Требуется вход'?'Нужно войти в RUDI':'Не удалось получить сводку. Попробуй позже.');
 }finally{manualLoading=false;updateReportButton();}
}
function renderGiftWishes(items){
 const list=$('pcWishList');list.replaceChildren();const own=(items||[]).filter(item=>item.owner===who);
 $('pcWishCount').textContent=String(own.filter(item=>!item.done).length);
 for(const item of own){const row=document.createElement('div');row.className='pc-wish'+(item.done?' is-done':'');
  const icon=document.createElement('span');icon.textContent='🎁';icon.setAttribute('aria-hidden','true');row.append(icon);
  const copy=document.createElement('span');copy.textContent=String(item.text||'');row.append(copy);
  if(item.url&&/^https?:\/\//i.test(item.url)){const link=document.createElement('a');link.href=item.url;link.textContent='↗';link.setAttribute('aria-label','Открыть: '+item.text);link.onclick=e=>{e.preventDefault();window.RudiWishlist?.open(item.url)};row.append(link)}
  if(item.done){const done=document.createElement('small');done.textContent='Исполнено';row.append(done)}list.append(row);
  const remove=document.createElement('button');remove.type='button';remove.className='wish-remove';remove.textContent='×';remove.setAttribute('aria-label','Удалить желание: '+item.text);
  remove.onclick=async()=>{if(remove.disabled)return;remove.disabled=true;const actor=who;try{const items=await window.RudiWishlist.remove(item.id);if(actor===who)renderGiftWishes(items)}catch(_){remove.disabled=false;$('pcWishStatus').textContent='Не удалось удалить желание. Попробуй ещё раз.'}};row.append(remove);
 }
 if(!own.length)list.textContent='Пока нет желаний';
}
async function refreshGifts(){
 const actor=who;if(!actor||!window.RudiWishlist)return;
 try{const items=await window.RudiWishlist.list();if(actor===who&&open){renderGiftWishes(items);$('pcWishStatus').textContent=''}}catch(_){if(actor===who)$('pcWishStatus').textContent='Не удалось загрузить желания'}
}
function renderGiftBirthday(){
 if(!who)return;const today=dayKey(),year=Number(today.slice(0,4)),date=String(data?.profile?.birthDate||''),fallback=who==='Диана'?'06-30':'03-03',md=/^\d{4}-\d{2}-\d{2}$/.test(date)?date.slice(5):fallback;
 let target=year+'-'+md;if(target<today)target=(year+1)+'-'+md;
 const days=Math.round((Date.parse(target+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
 $('pcBirthdayDate').textContent=new Date(target+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
 $('pcBirthdayDays').textContent=days===0?'Сегодня':days+' '+(days%100>=11&&days%100<=14?'дней':days%10===1?'день':days%10>=2&&days%10<=4?'дня':'дней');
}
function draw(){
 if(!data)return;
 showText('pcPerson',who||'Мой день');
 renderGiftBirthday();
 const emotions=data.emotions;
 syncHero();
 mountDianaCycle();
 const activeSymptoms=(data.symptoms||[]).filter(x=>x.state!=='resolved');
 showText('pcSymptomsCount',activeSymptoms.some(x=>Date.now()-Date.parse(x.updatedAt)>24*3600*1000)?'Как самочувствие сегодня?':activeSymptoms.length+' активных записей');
 showText('pcWeight',data.weights?.length?data.weights.at(-1).kg+' кг':'Добавить вес');
 showText('pcReportDate',report?.period?asDate(report.period.start)+' – '+asDate(report.period.end):report?asDate(report.createdAt):'По воскресеньям');
 const translating=Boolean(report?.translationPending),ready=Boolean(report?.narrative&&report.model!=='deterministic'&&!translating),insight=ready?safeNarrative(report):null;
 showText('pcReport',translating?report.narrative.overview:ready?(reportHasText(insight?.overview)?insight.overview:'Вот самое важное из твоих записей.'):(report?'Обзор пока не готов. Попробуй ещё раз.':'Недельный обзор появится здесь в воскресенье.'));
 const blocks=[['pcMainChange','pcMainBlock',insight?.mainChange],['pcMainObservation','pcObservationBlock',insight?.mainObservation],['pcMainAction','pcActionBlock',insight?.mainAction],['pcForecast','pcForecastBlock',insight?.forecast]];
 let visible=0;
 for(const [id,block,value] of blocks){const show=Boolean(ready&&reportHasText(value));const el=$(block);if(el)el.hidden=!show;if(show){showText(id,value);visible++;}}
 if($('pcSummaryGrid'))$('pcSummaryGrid').hidden=!visible;
 if($('pcReportMore'))$('pcReportMore').hidden=!ready;
 updateReportButton();
 renderRhythm();
 graph();
}
async function mutate(operation,payload={}){
 if(loading)return;loading=true;setStatus('Сохраняю…');
 try{const r=await call(operation,payload);data=r.data;draw();setStatus('Изменения сохранены');if(activeSheet)sheet(activeSheet);try{sessionStorage.setItem(cacheKey(),JSON.stringify({data,report}));}catch(_){}}
 catch(e){setStatus('Не удалось сохранить. Проверь подключение.');}
 finally{loading=false;}
}
function closeSheet({fromHistory=false,immediate=false}={}){
 if(!fromHistory&&history.state?.rudiOverlay==='personal-ai'&&history.state?.rudiAiSheet){
  try{history.back();return}catch(_){}
 }
 activeSheet='';
 const overlay=$('pcOverlay');
 clearTimeout(sheetCloseTimer);
 if(overlay&&!overlay.hidden){
  overlay.classList.add('is-closing');
  const finish=()=>{if(activeSheet)return;overlay.hidden=true;overlay.classList.remove('is-closing');root?.style.removeProperty('--pc-visual-height');root?.style.removeProperty('--pc-visual-top')};
  if(immediate||motionReduced())finish();
  else sheetCloseTimer=setTimeout(finish,195);
 }
}
function itemDelete(type,id,label){return '<button class="rudi-center__link" type="button" data-delete="'+esc(type)+'" data-id="'+esc(id)+'">Удалить '+esc(label||'')+'</button>';}
function sheet(name,{fromHistory=false}={}){
 const same=activeSheet===name,priorScroll=same?$('pcSheetContent')?.scrollTop||0:0;activeSheet=name;const box=$('pcOverlay'),content=$('pcSheetContent');if(!box)return;
 clearTimeout(sheetCloseTimer);box.classList.remove('is-closing');box.hidden=false;syncSheetViewport();
 if(!fromHistory&&history.state?.rudiOverlay==='personal-ai'){
  try{
   const state=history.state;
   history[state.rudiAiSheet?'replaceState':'pushState']({...state,rudiAiSheet:name},'',window.location.href);
  }catch(_){}
 }
 let html='',title='';
 if(name==='symptoms'){
  title='Дневник здоровья';
  html='<p class="rudi-center__meta">Свободный текст, интенсивность и длительность. Для продолжающихся состояний можно отмечать изменения.</p><form class="rudi-center__form" id="pcSymptomForm">'+
   formField('Что беспокоит?','<textarea name="description" minlength="2" maxlength="600" required rows="2" placeholder="Описание состояния"></textarea>')+
   formField('Интенсивность от 1 до 10','<input name="intensity" type="number" min="1" max="10" value="3" required>')+
   formField('Дата начала','<input name="startedAt" type="datetime-local">')+
   formField('Длительность','<input name="duration" maxlength="120" placeholder="Например, второй день">')+
   formField('Комментарий','<textarea name="comment" maxlength="500" rows="2"></textarea>')+'<button class="rudi-center__btn" type="submit">Добавить запись</button></form><div class="rudi-center__list">';
  for(const v of [...(data?.symptoms||[])].reverse().slice(0,50)){
   html+='<div class="rudi-center__item"><strong>'+esc(v.description)+'</strong><p>'+asDate(v.startedAt)+' · Интенсивность '+v.intensity+'/10 · '+esc(v.duration)+'</p><select class="rudi-center__select" data-symptom="'+esc(v.id)+'">'+
   [['active','Продолжается'],['better','Лучше'],['same','Без изменений'],['worse','Хуже'],['resolved','Прошло']].map(([s,t])=>'<option value="'+s+'"'+(v.state===s?' selected':'')+'>'+t+'</option>').join('')+'</select>'+itemDelete('symptom',v.id,'')+'</div>';
  }
  html+='</div><small class="rudi-center__meta">Наблюдения не являются медицинским диагнозом. При серьёзном или ухудшающемся состоянии обратитесь за медицинской помощью.</small>';
  } else if(name==='report'){
  title='Подробная AI-сводка';
  if(!report?.narrative){html='<p class="rudi-center__meta">Данных пока нет</p>';}
  else {
    const n=safeNarrative(report),ctx=report.observations||{},source=ctx.moodHistory;
    const section=(head,value,kind='')=>reportHasText(value)?'<section class="rudi-center__report-section'+(kind?' rudi-center__report-section--'+kind:'')+'"><h3>'+esc(head)+'</h3><p>'+esc(value)+'</p></section>':'';
    html='<div class="rudi-center__report-cover"><small>✦ РАСШИРЕННЫЙ АНАЛИЗ</small><strong>Что стоит за выводами</strong><span>'+esc(asDate(report.createdAt))+' · '+(report.slot==='weekly'?'Обзор недели':report.slot==='morning'?'Утро':'Вечер')+'</span></div>';
    if(report.model==='deterministic'){
      html+=section('Анализ пока недоступен','AI-модель не ответила. Факты сохранены, но персональные выводы и рекомендации пока не сформированы.');
    }else{
      // The page shows a compact preview; preserve every summary in the full report.
      html+=section('Обзор недели',n.overview)+section('Главное',n.mainChange)+section('Что сделать',n.mainAction)+section('Наблюдение',n.mainObservation)+section('Что дальше',n.forecast);
      const domains={mood:'Настроение',habits:'Привычки',tasks:'Дела и планы',health:'Самочувствие',supplements:'Добавки',cycle:'Цикл',finances:'Финансы'};
      const deep=(Array.isArray(n.deepAnalysis)?n.deepAnalysis:[]).filter(x=>domains[x?.domain]&&reportHasText(x.analysis)&&reportHasText(x.evidence)).slice(0,4);
      if(deep.length){
        html+='<div class="rudi-center__deep-intro"><strong>Глубокий анализ</strong><p>Подтверждённые наблюдения, интерпретации и способы проверить выводы.</p></div>';
        html+='<div class="rudi-center__deep-list">'+deep.map((item,i)=>
          '<article class="rudi-center__deep-card"><div class="rudi-center__deep-card-head"><span class="rudi-center__deep-number">'+(i+1)+'</span><h3>'+esc(domains[item.domain])+'</h3></div>'+
          '<div class="rudi-center__deep-evidence"><small>НА ЧЁМ ОСНОВАН ВЫВОД</small><p>'+esc(item.evidence)+'</p></div>'+
          '<div class="rudi-center__deep-interpret"><small>ЧТО ЭТО ЗНАЧИТ</small><p>'+esc(item.analysis)+'</p></div>'+
          (reportHasText(item.nextStep)?'<div class="rudi-center__deep-next"><small>ЧТО ПОПРОБОВАТЬ</small><p>'+esc(item.nextStep)+'</p></div>':'')+
          (reportHasText(item.verify)?'<div class="rudi-center__deep-verify"><small>КАК ПРОВЕРИТЬ РЕЗУЛЬТАТ</small><p>'+esc(item.verify)+'</p></div>':'')+
          (reportHasText(item.caveat)?'<p class="rudi-center__deep-caveat">'+esc(item.caveat)+'</p>':'')+
          '</article>').join('')+'</div>';
        const moodSpending=(ctx.connections?.findings||[]).filter(x=>String(x.kind||'').startsWith('mood-spending'));
        if(moodSpending.length&&!deep.some(x=>x.domain==='finances')){
          html+=section('Настроение и траты: подтверждённые сравнения',moodSpending.slice(0,3).map(x=>x.text).join('\\n\\n'));
        }
      }else{
        html+=section('Эта сводка создана в прежнем формате',who==='Рустам'
          ?'Новый глубокий анализ пока не сохранён. Вернись на личную страницу и нажми «Обновить анализ».'
          :'Новый глубокий анализ появится после следующего автоматического формирования сводки.');
      }
    }
    const evidence=[];
    if(Array.isArray(n.focus)&&n.focus.length){
      evidence.push('<section class="rudi-center__report-section"><h3>Подтверждающие наблюдения</h3><div class="rudi-center__focus">'+n.focus.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></section>');
    }
    evidence.push(section('Финансы',n.financeText),section('Задачи',n.taskText),section('Привычки',n.habitsText),section('Динамика',n.trendText));
    if(source?.latest?.length)evidence.push(section('Настроение по дневнику RUDI','Последняя запись: '+source.latest.at(-1).mood+'. Записей всего: '+source.entries+'.'));
    const w=ctx.profile?.body?.weightChange;
    if(w?.significant)evidence.push(section('Вес','За '+w.spanDays+' дней изменение составило '+w.deltaKg+' кг ('+w.percent+'%) по '+w.measurements+' измерениям.'));
    if(ctx.profile?.biorhythm)evidence.push(section('Биоритм','Фаза дня по расписанию RUDI: '+ctx.profile.biorhythm.phase+'. Это не измерение физической энергии.'));
    if(who==='Диана'&&ctx.cycle){
      let cycle='Текущая ориентировочная фаза: '+ctx.cycle.phase+'. День цикла: '+(ctx.cycle.cycleDay||'—')+'.';
      if(ctx.cycle.comparisons?.length)cycle+=' Сопоставление фаз с личными записями: '+ctx.cycle.comparisons.filter(x=>x.eligibleForPattern).map(x=>x.phase+' — '+x.recordedDays+' дней наблюдений').join('; ')+'.';
      evidence.push(section('Цикл',cycle+' По датам нельзя установить причину настроения или симптомов.'));
    }
    const p=ctx.profile?.body;
    if(p?.vision&&(p.vision.left!==null||p.vision.right!==null))evidence.push(section('Зрение','Последние записанные показатели: левый глаз '+(p.vision.left??'—')+' дптр, правый глаз '+(p.vision.right??'—')+' дптр.'));
    if(Array.isArray(p?.chronicConditions)&&p.chronicConditions.length)evidence.push(section('Указанные хронические заболевания',p.chronicConditions.join('; ')+'.'));
    const h=ctx.profile?.health;
    if(h?.activeSymptoms?.length)evidence.push(section('Дневник здоровья','Активных симптомов: '+h.activeSymptoms.length+'. Записи отражают наблюдения и не являются диагнозом.'));
    const supported=evidence.filter(Boolean).join('');
    if(supported)html+='<details class="rudi-center__report-evidence"><summary>Данные, на которых основан разбор</summary>'+supported+'</details>';
    if(report.model!=='deterministic')html+='<p class="rudi-center__meta">Закономерности не доказывают причинность. Выводы основаны только на сохранённых записях.</p>';
  }
} else if(name==='weight'){
  title='Вес и показатели';
  html='<form class="rudi-center__form" id="pcBodyProfileForm">'+
     formField('Рост, см','<input name="height" type="number" min="100" max="230" value="'+esc(data?.profile?.height||'')+'" placeholder="Укажи рост" required>')+
     formField('Дата рождения','<input name="birthDate" type="date" value="'+esc(data?.profile?.birthDate||'')+'">')+
     '<div class="rudi-center__body-section"><h3>Зрение (диоптрии)</h3><p class="rudi-center__meta">Укажи значения из рецепта, включая знак − или +.</p><div class="rudi-center__body-eyes">'+
       formField('Левый глаз','<input name="eyeLeft" type="number" min="-20" max="20" step="0.25" value="'+esc(data?.profile?.vision?.left??'')+'" placeholder="Например, −1.50">')+
       formField('Правый глаз','<input name="eyeRight" type="number" min="-20" max="20" step="0.25" value="'+esc(data?.profile?.vision?.right??'')+'" placeholder="Например, +0.75">')+
     '</div></div>'+
     formField('Хронические заболевания','<textarea name="chronicConditions" maxlength="3000" rows="3" placeholder="Если диагнозы установлены, перечисли по одному в строке">'+esc((data?.profile?.chronicConditions||[]).join('\n'))+'</textarea>')+
     '<button class="rudi-center__btn rudi-center__btn--ghost" type="submit">Сохранить параметры</button></form>'+
     '<form class="rudi-center__form rudi-center__body-weight-form" id="pcWeightForm">'+formField('Вес, кг','<input name="kg" type="number" min="25" max="400" step=".1" placeholder="Например, 86.5" required>')+'<button class="rudi-center__btn" type="submit">Добавить измерение</button></form><div class="rudi-center__list">';
  for(const v of [...(data?.weights||[])].reverse().slice(0,60))html+='<div class="rudi-center__item"><p>'+esc(v.kg)+' кг · '+asDate(v.at)+'</p>'+itemDelete('weight',v.id,'')+'</div>';
  html+='</div>';
 } else if(name==='history'){
  title='История позитивного настроения';
  const days=(data?.emotions?.daily||[]).filter(v=>Number.isFinite(positiveShare(v))).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const aggregate=prefix=>{const map=new Map();for(const r of days){const k=prefix(r.date);const x=map.get(k)||{n:0,total:0,positive:0};x.n++;x.total+=r.total;x.positive+=r.positive;map.set(k,x);}return [...map].sort(([a],[b])=>b.localeCompare(a)).slice(0,24)};
  const value=v=>v.total?Math.round(v.positive/v.total*100)+'% позитивных отметок':'Недостаточно данных';
  const weekly=aggregate(x=>{const d=new Date(x+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)});
  const monthly=aggregate(x=>x.slice(0,7));
  html='<p class="rudi-center__meta">Данные из существующего дневника настроения. Это не измерение медицинского стресса.</p>'+
    '<h3>По неделям</h3>'+weekly.map(([k,v])=>'<div class="rudi-center__item"><p>С '+esc(k)+' · '+value(v)+' · '+v.n+' дней</p></div>').join('')+
    '<h3>По месяцам</h3>'+monthly.map(([k,v])=>'<div class="rudi-center__item"><p>'+esc(k)+' · '+value(v)+' · '+v.n+' дней</p></div>').join('')+
    '<h3>По дням</h3>'+days.slice(0,70).map(v=>'<div class="rudi-center__item"><p>'+esc(v.date)+' · '+v.positive+' из '+v.total+' позитивных ('+positiveShare(v)+'%)</p></div>').join('');
 }else if(name==='settings'){
  title='Управление данными';
  html='<div class="rudi-center__actions"><button class="rudi-center__btn rudi-center__btn--danger" type="button" data-erase="all">Удалить все данные AI-центра</button></div>';
 }
 content.innerHTML=html;$('pcSheetTitle').textContent=title;content.scrollTop=priorScroll;
 const sym=content.querySelector('#pcSymptomForm');if(sym)sym.onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(sym).entries());mutate('symptom',{description:f.description,intensity:Number(f.intensity),startedAt:f.startedAt?new Date(f.startedAt).toISOString():new Date().toISOString(),duration:f.duration,comment:f.comment});};
 const wt=content.querySelector('#pcWeightForm');if(wt)wt.onsubmit=e=>{e.preventDefault();mutate('weight',{kg:Number(new FormData(wt).get('kg'))});};
 const pr=content.querySelector('#pcBodyProfileForm');if(pr)pr.onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(pr).entries());mutate('profile',{height:Number(f.height),birthDate:f.birthDate,vision:{left:f.eyeLeft,right:f.eyeRight},chronicConditions:f.chronicConditions});};
 content.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(confirm('Удалить эту запись?'))mutate('delete-entry',{type:b.dataset.delete,id:b.dataset.id});});
 content.querySelectorAll('[data-symptom]').forEach(s=>s.onchange=()=>mutate('symptom-status',{id:s.dataset.symptom,state:s.value}));
 content.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{if(confirm('Удалить все записи этой категории и старые AI-выводы?'))mutate('clear-category',{type:b.dataset.clear});});
 content.querySelectorAll('[data-erase]').forEach(b=>b.onclick=async()=>{if(!confirm('Удаление необратимо. Подтвердить?'))return;try{await call('erase',{scope:b.dataset.erase});sessionStorage.removeItem(cacheKey());if(b.dataset.erase==='all'){data={profile:{height:who==='Рустам'?181:null},checkins:{},symptoms:[],weights:[]};}report=null;markHalo(false);draw();closeSheet();setStatus('Данные удалены');}catch(e){setStatus('Ошибка удаления');}});
}
function boot(){
 if(!$('avatar'))return;
 attach();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('pageshow',()=>{if(root&&document.body.classList.contains('auth-pending')===false)void checkStatus();});
})();
