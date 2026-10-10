/* RUDI personal AI center — loaded once with shell; AI is never called on page open */
(function(){
'use strict';
const API='/api/personal-center';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const asDate=v=>{let d=new Date(v);return Number.isFinite(d.valueOf())?d.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):String(v||'')};
let root=null,open=false,who='',data=null,report=null,lastStatus=0,loading=false,activeSheet='',cycleInfo=null,overviewAt=0,refreshing=false,overviewPromise=null;
const cachePrefix='rudi-personal-center-session:';
function setStatus(t){if($('pcStatus'))$('pcStatus').textContent=String(t||'')}
async function call(operation,extra={}){
 const res=await fetch(API,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({operation,initData:String(window.Telegram?.WebApp?.initData||''),...extra})});
 const result=await res.json().catch(()=>null);
 if(!res.ok||!result?.ok)throw new Error(res.status===401?'Требуется вход':'Не удалось получить данные');
 return result;
}
function markHalo(unread){const avatar=$('avatar');if(avatar){avatar.classList.toggle('pc-unread',!!unread);avatar.setAttribute('aria-label',unread?'Новая личная AI-сводка':'Открыть личный AI-центр');}}
function formField(label,control){return '<label class="rudi-center__field">'+label+control+'</label>';}
function makeMarkup(){
 const p=[];
 p.push('<div class="rudi-center__pull" id="pcPull" hidden><span class="rudi-center__pull-dot"></span><span id="pcPullLabel">Потяните для обновления</span></div>');
 p.push('<header class="rudi-center__bar"><button id="pcBack" class="rudi-center__back" type="button">← Назад</button><b>Мой AI-центр</b><button id="pcSettings" class="rudi-center__icon" type="button" aria-label="Управление данными">⚙</button></header>');
 p.push('<div class="rudi-center__wrap"><div class="rudi-center__content">');
 p.push('<div class="rudi-center__hero"><small>✦ ЛИЧНЫЙ ОБЗОР</small><div class="rudi-center__hero-identity"><div class="rudi-center__hero-avatar" aria-hidden="true"><span id="pcHeroInitial">Р</span><img id="pcHeroImage" alt="" hidden></div><div class="rudi-center__hero-name"><h1 id="pcPerson">Мой день</h1><p id="pcHeroMeta">Возраст — · Вес — · Рост —</p></div></div></div>');
 p.push('<div class="rudi-center__card rudi-center__report"><div class="rudi-center__head"><h2>✦ AI-сводка дня</h2><span class="rudi-center__meta" id="pcReportDate">По расписанию</span></div><p id="pcReport">Данных пока нет</p><div class="rudi-center__summary-grid" id="pcSummaryGrid" hidden><div><small>ГЛАВНОЕ ИЗМЕНЕНИЕ</small><p id="pcMainChange">—</p></div><div><small>НАБЛЮДЕНИЕ</small><p id="pcMainObservation">—</p></div><div><small>СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</small><p id="pcMainAction">—</p></div><div><small>ПРОГНОЗ</small><p id="pcForecast">—</p></div></div><button id="pcReportMore" class="rudi-center__report-more" data-open="report" type="button" hidden>Подробный анализ →</button><div class="rudi-center__status" id="pcStatus"></div></div>');
 p.push('<div class="rudi-center__tile-grid"><button class="rudi-center__tile" data-open="symptoms"><span class="rudi-center__tile-icon">♡</span><strong>Здоровье</strong><small id="pcSymptomsCount">Дневник здоровья</small></button><button class="rudi-center__tile" data-open="weight"><span class="rudi-center__tile-icon">↟</span><strong>Моё тело</strong><small id="pcWeight">Вес и рост</small></button></div>');
 p.push('<div class="rudi-center__card"><div class="rudi-center__head"><h2>Динамика негативных эмоций</h2><button class="rudi-center__link" data-open="history" type="button">История →</button></div><svg class="rudi-center__chart" id="pcGraph" viewBox="0 0 350 115" role="img" aria-label="График доли негативных эмоций"></svg><small class="rudi-center__meta" id="pcHistoryCaption">История по дням, неделям и месяцам</small></div>');
 p.push('<div id="pcDianaCycleSlot" class="rudi-center__cycle-slot" hidden><section class="rudi-center__card rudi-center__cycle-card"><div class="rudi-center__head"><h2>Цикл Дианы</h2><span class="rudi-center__meta">Прогноз</span></div><div class="rudi-center__cycle-grid"><div><span>Фаза</span><strong id="pcCyclePhase">—</strong></div><div><span>День цикла</span><strong id="pcCycleDay">—</strong></div><div><span>До следующих месячных</span><strong id="pcCycleCountdown">—</strong></div><div><span>Последнее начало</span><strong id="pcCyclePeriod">—</strong></div></div><p id="pcCycleNote" class="rudi-center__meta">Прогноз ориентировочный.</p><button id="pcCycleRecord" class="rudi-center__btn" type="button" hidden>Отметить начало сегодня</button></section></div>');
 p.push('</div></div>');
 p.push('<div class="rudi-center__overlay" id="pcOverlay" hidden><div class="rudi-center__sheet" role="dialog" aria-modal="true" aria-labelledby="pcSheetTitle"><div class="rudi-center__sheet-head"><button id="pcSheetClose" class="rudi-center__back" type="button">← Назад</button><h2 id="pcSheetTitle">Данные</h2><span class="rudi-center__sheet-spacer" aria-hidden="true"></span></div><div id="pcSheetContent" class="rudi-center__sheet-content"></div></div></div>');
 return p.join('');
}
function attach(){
 if(root)return;
 root=document.createElement('section');root.id='personalAICenter';root.className='rudi-center';root.hidden=true;root.dataset.noPullRefresh='true';
 root.innerHTML=makeMarkup();document.body.appendChild(root);
 $('pcBack').onclick=hide;$('pcSettings').onclick=()=>sheet('settings');
 $('pcCycleRecord').onclick=()=>void recordPersonalCycle();
 $('pcSheetClose').onclick=closeSheet;$('pcOverlay').addEventListener('click',e=>{if(e.target===$('pcOverlay'))closeSheet();});
 root.addEventListener('click',e=>{
  const btn=e.target.closest('[data-open],[data-external],[data-tab]');if(!btn)return;
  if(btn.dataset.open)sheet(btn.dataset.open);
  if(btn.dataset.external){hide();$(btn.dataset.external)?.click();}
  if(btn.dataset.tab){hide();document.querySelector('[data-app-tab="'+btn.dataset.tab+'"]')?.click();}
 });
 document.addEventListener('keydown',e=>{if(!open||e.key!=='Escape')return;if(activeSheet)closeSheet();else hide();});
 const av=$('avatar');if(av){
  av.style.cursor='pointer';av.setAttribute('role','button');av.setAttribute('tabindex','0');
  av.addEventListener('click',e=>{if(e.target.closest('button'))return;show();});
  av.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}});
 }
 const tryStatus=()=>{if(!document.body.classList.contains('auth-pending')){void checkStatus();return true;}return false;};
 if(window.visualViewport){window.visualViewport.addEventListener('resize',syncSheetViewport,{passive:true});window.visualViewport.addEventListener('scroll',syncSheetViewport,{passive:true});}
 if(!tryStatus()){const observer=new MutationObserver(()=>{if(tryStatus())observer.disconnect();});observer.observe(document.body,{attributes:true,attributeFilter:['class']});}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkStatus();});
 window.addEventListener('focus',()=>void checkStatus());
 installCenterPullRefresh();
}
async function checkStatus(force=false){
 if(open||document.hidden||document.body.classList.contains('auth-pending'))return;
 if(!force&&Date.now()-lastStatus<8*60*1000)return;
 lastStatus=Date.now();
 try{const res=await call('status');who=res.actor;markHalo(res.unread);}catch(e){lastStatus=0;}
}
function cacheKey(){return cachePrefix+who;}
function showOffline(){
 try{if(!who)return false;const stored=JSON.parse(sessionStorage.getItem(cacheKey())||'null');if(!stored)return false;data=stored.data;report=stored.report;cycleInfo=stored.cycleInfo||null;draw();setStatus('Офлайн · показана последняя сохранённая информация');return true;}
 catch(e){return false;}
}
async function fetchOverview(force=false){
 if(overviewPromise)return overviewPromise;
 if(!force&&who&&data&&Date.now()-overviewAt<90000){draw();return true;}
 overviewPromise=(async()=>{
  const res=await call('overview',{knownVersion:data?.version??-1,knownReportId:report?.id||'',knownEmotionVersion:data?.emotions?.version||''});
  if(res.unchanged){overviewAt=Date.now();setStatus('Данные актуальны');return true;}
  who=res.actor;data=res.data;report=res.report;cycleInfo=res.cycle||null;overviewAt=Date.now();draw();
  try{sessionStorage.setItem(cacheKey(),JSON.stringify({data,report,cycleInfo}));}catch(_){}
  markHalo(false);setStatus('Обновлено');
  if(res.indicator?.unread)void call('read-report').catch(()=>{});
  return true;
 })().finally(()=>{overviewPromise=null;});
 return overviewPromise;
}
async function show(){
 if(open)return;attach();open=true;root.hidden=false;document.body.classList.add('rudi-center-open');
 if(!data)showOffline();
 setStatus('Загружаю данные…');
 try{await fetchOverview(false);}
 catch(_){if(!data&&!showOffline())setStatus('Нет соединения с RUDI · попробуй позже');}
}
function hide(){closeSheet();open=false;if(root)root.hidden=true;document.body.classList.remove('rudi-center-open');}
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
function graph(){
 const graphEl=$('pcGraph');if(!graphEl)return;graphEl.replaceChildren();
 const items=(data?.emotions?.daily||[]).filter(x=>Number.isFinite(x.negativePercent)).slice(-30).map(x=>({d:x.date,v:x.negativePercent}));
 if(items.length<2){
  const txt=document.createElementNS('http://www.w3.org/2000/svg','text');txt.setAttribute('x','12');txt.setAttribute('y','55');txt.setAttribute('fill','currentColor');txt.setAttribute('font-size','12');txt.textContent='График появится после двух записей настроения';graphEl.append(txt);return;
 }
 const pts=items.map((x,i)=>(10+330*i/(items.length-1)).toFixed(1)+','+(105-x.v*.95).toFixed(1)).join(' ');
 const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');
 for(const [k,v] of Object.entries({points:pts,fill:'none',stroke:'var(--pc-accent)','stroke-width':'3.5','stroke-linecap':'round','stroke-linejoin':'round'}))poly.setAttribute(k,v);
 graphEl.append(poly);
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
 showText('pcHeroMeta','Возраст '+age+' · Вес '+(last?last.kg+' кг':'—')+' · Рост '+(data?.profile?.height?data.profile.height+' см':'—'));
}
function installCenterPullRefresh(){
 const viewport=root.querySelector('.rudi-center__wrap'),indicator=$('pcPull'),label=$('pcPullLabel');
 if(!viewport||!indicator||!label)return;
 let start=0,dragging=false,armed=false;
 const reset=()=>{dragging=false;armed=false;if(!refreshing){indicator.hidden=true;indicator.style.removeProperty('--pc-pull-distance');}};
 viewport.addEventListener('touchstart',event=>{
  if(!open||activeSheet||refreshing||viewport.scrollTop>2||event.touches.length!==1||event.target.closest('input,textarea,select,button,[contenteditable]'))return;
  start=event.touches[0].clientY;dragging=true;armed=false;
 },{passive:true});
 viewport.addEventListener('touchmove',event=>{
  if(!dragging||event.touches.length!==1)return;
  const delta=event.touches[0].clientY-start;if(delta<=0||viewport.scrollTop>2){reset();return;}
  armed=delta>=110;indicator.hidden=false;indicator.style.setProperty('--pc-pull-distance',Math.min(78,delta*.4)+'px');
  label.textContent=armed?'Отпустите для обновления':'Потяните для обновления';
  if(delta>14&&event.cancelable)event.preventDefault();
 },{passive:false});
 const finish=async()=>{
  if(!dragging)return;
  const trigger=armed;dragging=false;if(!trigger){reset();return;}
  refreshing=true;label.textContent='Обновляю…';indicator.hidden=false;
  try{await fetchOverview(true);label.textContent='Обновлено';}
  catch(_){label.textContent='Нет соединения';}
  finally{setTimeout(()=>{refreshing=false;reset();},500);}
 };
 viewport.addEventListener('touchend',()=>void finish(),{passive:true});
 viewport.addEventListener('touchcancel',reset,{passive:true});
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
function draw(){
 if(!data)return;
 showText('pcPerson',who||'Мой день');
 const emotions=data.emotions;
 syncHero();
 mountDianaCycle();
 const activeSymptoms=(data.symptoms||[]).filter(x=>x.state!=='resolved');
 showText('pcSymptomsCount',activeSymptoms.some(x=>Date.now()-Date.parse(x.updatedAt)>24*3600*1000)?'Как самочувствие сегодня?':activeSymptoms.length+' активных записей');
 showText('pcWeight',data.weights?.length?data.weights.at(-1).kg+' кг':'Добавить вес');
 showText('pcReportDate',report?asDate(report.createdAt)+' · '+(report.slot==='morning'?'Утро':'Вечер'):'Нет сводки');
 const insight=safeNarrative(report);
 showText('pcReport',insight?.overview||'Данных пока нет');
 const blocks=[['pcMainChange',insight?.mainChange],['pcMainObservation',insight?.mainObservation],['pcMainAction',insight?.mainAction],['pcForecast',insight?.forecast]];
 if($('pcSummaryGrid'))$('pcSummaryGrid').hidden=!insight;
 for(const [id,value] of blocks)showText(id,value||'Недостаточно данных');
 showText('pcHistoryCaption',(emotions?.daysRecorded||0)+' дней в дневнике настроения · По дням, неделям и месяцам');
 if($('pcReportMore'))$('pcReportMore').hidden=!report?.narrative;
 graph();
}
async function mutate(operation,payload={}){
 if(loading)return;loading=true;setStatus('Сохраняю…');
 try{const r=await call(operation,payload);data=r.data;draw();setStatus('Изменения сохранены');if(activeSheet)sheet(activeSheet);try{sessionStorage.setItem(cacheKey(),JSON.stringify({data,report}));}catch(_){}}
 catch(e){setStatus('Не удалось сохранить. Проверь подключение.');}
 finally{loading=false;}
}
function closeSheet(){activeSheet='';if($('pcOverlay'))$('pcOverlay').hidden=true;root?.style.removeProperty('--pc-visual-height');root?.style.removeProperty('--pc-visual-top');}
function itemDelete(type,id,label){return '<button class="rudi-center__link" type="button" data-delete="'+esc(type)+'" data-id="'+esc(id)+'">Удалить '+esc(label||'')+'</button>';}
function sheet(name){
 const same=activeSheet===name,priorScroll=same?$('pcSheetContent')?.scrollTop||0:0;activeSheet=name;const box=$('pcOverlay'),content=$('pcSheetContent');if(!box)return;box.hidden=false;syncSheetViewport();let html='',title='';
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
    const section=(head,value)=>value?'<section class="rudi-center__report-section"><h3>'+esc(head)+'</h3><p>'+esc(value)+'</p></section>':'';
    html='<p class="rudi-center__meta">'+esc(asDate(report.createdAt))+' · '+(report.slot==='morning'?'Утро':'Вечер')+'</p>';
    html+=section(n.headline||'Главное',n.overview);
    if(Array.isArray(n.focus)&&n.focus.length){html+='<section class="rudi-center__report-section"><h3>Важные наблюдения</h3><div class="rudi-center__focus">'+n.focus.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></section>';}
    html+=section('Финансы',n.financeText)+section('Задачи',n.taskText)+section('Привычки',n.habitsText)+section('Динамика',n.trendText);
    if(source?.latest?.length)html+=section('Настроение по дневнику RUDI','Последняя запись: '+source.latest.at(-1).mood+'. Записей всего: '+source.entries+'.');
    const w=ctx.profile?.body?.weightChange;
    if(w?.significant)html+=section('Вес','За '+w.spanDays+' дней изменение составило '+w.deltaKg+' кг ('+w.percent+'%) по '+w.measurements+' измерениям.');
    if(ctx.profile?.biorhythm)html+=section('Биоритм','Фаза дня по расписанию RUDI: '+ctx.profile.biorhythm.phase+'. Это не измерение физической энергии.');
    if(who==='Диана'&&ctx.cycle){
      let cycle='Текущая ориентировочная фаза: '+ctx.cycle.phase+'. День цикла: '+(ctx.cycle.cycleDay||'—')+'.';
      if(ctx.cycle.comparisons?.length)cycle+=' Сопоставление фаз с личными записями: '+ctx.cycle.comparisons.filter(x=>x.eligibleForPattern).map(x=>x.phase+' — '+x.recordedDays+' дней наблюдений').join('; ')+'.';
      html+=section('Цикл',cycle+' По датам нельзя установить причину настроения или симптомов.');
    }
        const p=ctx.profile?.body;if(p?.vision&&(p.vision.left!==null||p.vision.right!==null))html+=section('Зрение','Последние записанные показатели: левый глаз '+(p.vision.left??'—')+' дптр, правый глаз '+(p.vision.right??'—')+' дптр.');
    if(Array.isArray(p?.chronicConditions)&&p.chronicConditions.length)html+=section('Указанные хронические заболевания',p.chronicConditions.join('; ')+'.');
const h=ctx.profile?.health;if(h?.activeSymptoms?.length)html+=section('Дневник здоровья','Активных симптомов: '+h.activeSymptoms.length+'. Записи отражают наблюдения и не являются диагнозом.');
    html+='<p class="rudi-center__meta">AI различает факты, наблюдения и гипотезы. Медицинские утверждения требуют научного подтверждения.</p>';
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
  title='История эмоциональной динамики';
  const days=(data?.emotions?.daily||[]).filter(v=>v.total>0).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const aggregate=prefix=>{const map=new Map();for(const r of days){const k=prefix(r.date);const x=map.get(k)||{n:0,total:0,negative:0};x.n++;x.total+=r.total;x.negative+=r.negative;map.set(k,x);}return [...map].sort(([a],[b])=>b.localeCompare(a)).slice(0,24)};
  const value=v=>v.total?Math.round(v.negative/v.total*100)+'% негативных отметок':'Недостаточно данных';
  const weekly=aggregate(x=>{const d=new Date(x+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)});
  const monthly=aggregate(x=>x.slice(0,7));
  html='<p class="rudi-center__meta">Данные из существующего дневника настроения. Это не измерение медицинского стресса.</p>'+
    '<h3>По неделям</h3>'+weekly.map(([k,v])=>'<div class="rudi-center__item"><p>С '+esc(k)+' · '+value(v)+' · '+v.n+' дней</p></div>').join('')+
    '<h3>По месяцам</h3>'+monthly.map(([k,v])=>'<div class="rudi-center__item"><p>'+esc(k)+' · '+value(v)+' · '+v.n+' дней</p></div>').join('')+
    '<h3>По дням</h3>'+days.slice(0,70).map(v=>'<div class="rudi-center__item"><p>'+esc(v.date)+' · '+v.negative+' из '+v.total+' негативных ('+v.negativePercent+'%)</p></div>').join('');
  html+='<h3>AI-сводки</h3><div id="pcReportsList"><p class="rudi-center__meta">Загружаю историю сводок…</p></div>';
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
 if(name==='history'){call('history').then(r=>{if(activeSheet!=='history')return;const node=$('pcReportsList');node.replaceChildren();const rows=r.history||[];if(!rows.length){node.textContent='Сводок пока нет';return;}for(const x of rows.slice(0,100)){const row=document.createElement('div');row.className='rudi-center__item';const title=document.createElement('strong');title.textContent=(x.slot==='morning'?'Утро':'Вечер')+' · '+asDate(x.createdAt);const p=document.createElement('p');p.textContent=x.narrative?.overview||'Отчёт';row.append(title,p);node.append(row);}}).catch(()=>{if($('pcReportsList'))$('pcReportsList').textContent='История временно недоступна';});}
}
function boot(){
 if(!$('avatar'))return;
 attach();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('pageshow',()=>{if(root&&document.body.classList.contains('auth-pending')===false)void checkStatus();});
})();
