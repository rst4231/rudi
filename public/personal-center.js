/* RUDI personal AI center — loaded once with shell; AI is never called on page open */
(function(){
'use strict';
const API='/api/personal-center';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const asDate=v=>{let d=new Date(v);return Number.isFinite(d.valueOf())?d.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):String(v||'')};
let root=null,open=false,who='',data=null,report=null,lastStatus=0,loading=false,activeSheet='';
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
 const rating=[['mood','Настроение'],['energy','Энергия'],['stress','Стресс']].map(([key,label])=>formField(label,'<select name="'+key+'" required>'+Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'"'+(i===6?' selected':'')+'>'+(i+1)+'</option>').join('')+'</select>')).join('');
 const p=[];
 p.push('<header class="rudi-center__bar"><button id="pcBack" class="rudi-center__back" type="button">← Назад</button><b>Мой AI-центр</b><button id="pcSettings" class="rudi-center__icon" type="button" aria-label="Управление данными">⚙</button></header>');
 p.push('<div class="rudi-center__wrap"><div class="rudi-center__content">');
 p.push('<div class="rudi-center__hero"><small>✦ ЛИЧНЫЙ ОБЗОР</small><h1 id="pcPerson">Мой день</h1><p>Персональные наблюдения и важные изменения</p><div class="rudi-center__pills"><span class="rudi-center__pill">07:00 · 21:00 МСК</span><span class="rudi-center__pill">Вся история</span></div></div>');
 p.push('<div class="rudi-center__card rudi-center__report"><div class="rudi-center__head"><h2>✦ AI-сводка дня</h2><span class="rudi-center__meta" id="pcReportDate">По расписанию</span></div><p id="pcReport">Сохранённая сводка появится здесь после первой генерации.</p><div class="rudi-center__focus" id="pcFocus"></div><small class="rudi-center__meta">AI создаёт отчёт только утром и вечером. Медицинские факты не заменяют консультацию врача.</small><div class="rudi-center__status" id="pcStatus"></div></div>');
 p.push('<div class="rudi-center__section-label">МОЁ СОСТОЯНИЕ</div><div class="rudi-center__card"><div class="rudi-center__head"><h2>Настроение и энергия</h2><button id="pcCheckinToggle" class="rudi-center__link" type="button">Оценить</button></div><div class="rudi-center__fields"><div>Настроение<b id="pcMood">—</b></div><div>Энергия<b id="pcEnergy">—</b></div><div>Стресс<b id="pcStress">—</b></div></div><form id="pcCheckinForm" class="rudi-center__form" hidden>'+rating+formField('Комментарий','<textarea name="comment" maxlength="500" rows="2" placeholder="Как прошёл день?"></textarea>')+'<button class="rudi-center__btn" type="submit">Сохранить запись</button></form></div>');
 p.push('<div class="rudi-center__tile-grid"><button class="rudi-center__tile" data-open="symptoms"><span class="rudi-center__tile-icon">♡</span><strong>Здоровье</strong><small id="pcSymptomsCount">Добавить самочувствие</small></button><button class="rudi-center__tile" data-open="weight"><span class="rudi-center__tile-icon">↟</span><strong>Моё тело</strong><small id="pcWeight">Вес и рост</small></button><button class="rudi-center__tile" data-external="financeProfileButton"><span class="rudi-center__tile-icon">↗</span><strong>Финансы</strong><small>Из раздела финансов</small></button><button class="rudi-center__tile" data-external="habitProfileButton"><span class="rudi-center__tile-icon">◉</span><strong>Привычки</strong><small>Из трекера RUDI</small></button><button class="rudi-center__tile" data-external="supplementProfileButton"><span class="rudi-center__tile-icon">✧</span><strong>БАДы</strong><small>Уже сохранённые данные</small></button><button class="rudi-center__tile" data-tab="schedule"><span class="rudi-center__tile-icon">▦</span><strong>Календарь</strong><small>Задачи и TickTick</small></button></div>');
 p.push('<div class="rudi-center__card"><div class="rudi-center__head"><h2>Динамика самочувствия</h2><button class="rudi-center__link" data-open="history" type="button">История →</button></div><svg class="rudi-center__chart" id="pcGraph" viewBox="0 0 350 115" role="img" aria-label="График оценок настроения"></svg><small class="rudi-center__meta" id="pcHistoryCaption">История по дням, неделям и месяцам</small></div>');
 p.push('</div></div>');
 p.push('<div class="rudi-center__overlay" id="pcOverlay" hidden><div class="rudi-center__sheet" role="dialog" aria-modal="true" aria-labelledby="pcSheetTitle"><div class="rudi-center__head"><h2 id="pcSheetTitle">Данные</h2><button id="pcSheetClose" class="rudi-center__back" type="button">Закрыть</button></div><div id="pcSheetContent"></div></div></div>');
 return p.join('');
}
function attach(){
 if(root)return;
 root=document.createElement('section');root.id='personalAICenter';root.className='rudi-center';root.hidden=true;
 root.innerHTML=makeMarkup();document.body.appendChild(root);
 $('pcBack').onclick=hide;$('pcSettings').onclick=()=>sheet('settings');
 $('pcCheckinToggle').onclick=()=>{$('pcCheckinForm').hidden=!$('pcCheckinForm').hidden;};
 $('pcCheckinForm').onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target).entries());await mutate('checkin',{mood:Number(v.mood),energy:Number(v.energy),stress:Number(v.stress),comment:v.comment});$('pcCheckinForm').hidden=true;};
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
 if(!tryStatus()){const observer=new MutationObserver(()=>{if(tryStatus())observer.disconnect();});observer.observe(document.body,{attributes:true,attributeFilter:['class']});}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkStatus();});
 window.addEventListener('focus',()=>void checkStatus());
}
async function checkStatus(force=false){
 if(open||document.hidden||document.body.classList.contains('auth-pending'))return;
 if(!force&&Date.now()-lastStatus<8*60*1000)return;
 lastStatus=Date.now();
 try{const res=await call('status');who=res.actor;markHalo(res.unread);}catch(e){lastStatus=0;}
}
function cacheKey(){return cachePrefix+who;}
function showOffline(){
 try{if(!who)return false;const stored=JSON.parse(sessionStorage.getItem(cacheKey())||'null');if(!stored)return false;data=stored.data;report=stored.report;draw();setStatus('Офлайн · показана последняя сохранённая информация');return true;}
 catch(e){return false;}
}
async function show(){
 if(open)return;attach();open=true;root.hidden=false;document.body.classList.add('rudi-center-open');
 setStatus('Загружаю данные…');
 try{
  const res=await call('overview');who=res.actor;data=res.data;report=res.report;draw();
  try{sessionStorage.setItem(cacheKey(),JSON.stringify({data,report}));}catch(e){}
  markHalo(false);setStatus('Данные актуальны на момент последней сводки');
  if(res.indicator?.unread)await call('read-report').catch(()=>{});
 }catch(e){if(!showOffline())setStatus('Нет соединения с RUDI · попробуй позже');}
}
function hide(){closeSheet();open=false;if(root)root.hidden=true;document.body.classList.remove('rudi-center-open');}
function showText(id,text){if($(id))$(id).textContent=String(text??'');}
function graph(){
 const graphEl=$('pcGraph');if(!graphEl)return;graphEl.replaceChildren();
 const items=Object.entries(data?.checkins||{}).sort(([a],[b])=>a.localeCompare(b)).map(([d,v])=>({d,v:Number(v.mood)})).filter(x=>x.v>=1&&x.v<=10).slice(-30);
 if(items.length<2){
  const txt=document.createElementNS('http://www.w3.org/2000/svg','text');txt.setAttribute('x','12');txt.setAttribute('y','55');txt.setAttribute('fill','currentColor');txt.setAttribute('font-size','12');txt.textContent='График появится после двух оценок';graphEl.append(txt);return;
 }
 const pts=items.map((x,i)=>(10+330*i/(items.length-1)).toFixed(1)+','+(105-x.v*9.5).toFixed(1)).join(' ');
 const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');
 for(const [k,v] of Object.entries({points:pts,fill:'none',stroke:'var(--pc-accent)','stroke-width':'3.5','stroke-linecap':'round','stroke-linejoin':'round'}))poly.setAttribute(k,v);
 graphEl.append(poly);
}
function draw(){
 if(!data)return;
 showText('pcPerson',who||'Мой день');
 const rec=data.checkins?.[dayKey()]||{};
 for(const [name,id] of [['mood','pcMood'],['energy','pcEnergy'],['stress','pcStress']])showText(id,rec[name]??'—');
 const activeSymptoms=(data.symptoms||[]).filter(x=>x.state!=='resolved');
 showText('pcSymptomsCount',activeSymptoms.some(x=>Date.now()-Date.parse(x.updatedAt)>24*3600*1000)?'Как самочувствие сегодня?':activeSymptoms.length+' активных записей');
 showText('pcWeight',data.weights?.length?data.weights.at(-1).kg+' кг':'Добавить вес');
 showText('pcReportDate',report?asDate(report.createdAt)+' · '+(report.slot==='morning'?'Утро':'Вечер'):'Нет сводки');
 showText('pcReport',report?.narrative?.overview||'Первая AI-сводка появится после ближайшего запуска в 07:00 или 21:00 МСК.');
 const box=$('pcFocus');box.replaceChildren();for(const entry of (report?.narrative?.focus||[]).slice(0,3)){const span=document.createElement('span');span.textContent=entry;box.append(span);}
 showText('pcHistoryCaption',Object.keys(data.checkins||{}).length+' дней настроения · История по дням, неделям и месяцам');
 graph();
}
async function mutate(operation,payload={}){
 if(loading)return;loading=true;setStatus('Сохраняю…');
 try{const r=await call(operation,payload);data=r.data;draw();setStatus('Изменения сохранены');if(activeSheet)sheet(activeSheet);try{sessionStorage.setItem(cacheKey(),JSON.stringify({data,report}));}catch(_){}}
 catch(e){setStatus('Не удалось сохранить. Проверь подключение.');}
 finally{loading=false;}
}
function closeSheet(){activeSheet='';if($('pcOverlay'))$('pcOverlay').hidden=true;}
function itemDelete(type,id,label){return '<button class="rudi-center__link" type="button" data-delete="'+esc(type)+'" data-id="'+esc(id)+'">Удалить '+esc(label||'')+'</button>';}
function sheet(name){
 activeSheet=name;const box=$('pcOverlay'),content=$('pcSheetContent');if(!box)return;box.hidden=false;let html='',title='';
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
 } else if(name==='weight'){
  title='Вес и показатели';
  html='<p>Рост: <strong>'+esc(data?.profile?.height||'—')+' см</strong></p><form class="rudi-center__form" id="pcWeightForm">'+formField('Вес, кг','<input name="kg" type="number" min="25" max="400" step=".1" placeholder="Например, 86.5" required>')+'<button class="rudi-center__btn" type="submit">Добавить измерение</button></form><div class="rudi-center__list">';
  for(const v of [...(data?.weights||[])].reverse().slice(0,60))html+='<div class="rudi-center__item"><p>'+esc(v.kg)+' кг · '+asDate(v.at)+'</p>'+itemDelete('weight',v.id,'')+'</div>';
  html+='</div>';
 } else if(name==='history'){
  title='История и аналитика';
  const days=Object.entries(data?.checkins||{}).sort(([a],[b])=>b.localeCompare(a));
  const aggregate=prefix=>{const map=new Map();for(const [day,r] of days){let key=prefix(day);let row=map.get(key)||{n:0,sum:0};if(r.mood){row.n++;row.sum+=r.mood;}map.set(key,row);}return [...map.entries()].sort(([a],[b])=>b.localeCompare(a)).slice(0,24)};
  const monthly=aggregate(x=>x.slice(0,7));
  const weekly=aggregate(x=>{const d=new Date(x+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);});
  html='<h3>По неделям</h3>'+weekly.map(([k,v])=>'<div class="rudi-center__item"><p>С '+esc(k)+' · '+(v.n?(v.sum/v.n).toFixed(1)+'/10 среднее настроение':'Нет оценок')+'</p></div>').join('')+'<h3>По месяцам</h3>'+monthly.map(([k,v])=>'<div class="rudi-center__item"><p>'+esc(k)+' · '+(v.n?(v.sum/v.n).toFixed(1)+'/10 среднее настроение':'Нет оценок')+'</p></div>').join('')+
  '<h3>По дням</h3>'+days.slice(0,70).map(([d,v])=>'<div class="rudi-center__item"><p>'+esc(d)+' · настроение '+esc(v.mood||'—')+' · энергия '+esc(v.energy||'—')+' · стресс '+esc(v.stress||'—')+'</p>'+itemDelete('checkin',d,'')+'</div>').join('');
  html+='<h3>AI-сводки</h3><div id="pcReportsList"><p class="rudi-center__meta">Загружаю историю сводок…</p></div>';
 }else if(name==='settings'){
  title='Данные и настройки';
  html='<p class="rudi-center__meta">Записи хранятся бессрочно до удаления. Связанные разделы не удаляются.</p><form class="rudi-center__form" id="pcProfileForm">'+formField('Рост, см','<input name="height" type="number" min="100" max="230" value="'+esc(data?.profile?.height||'181')+'" required>')+formField('Дата рождения (необязательно)','<input name="birthDate" type="date" value="'+esc(data?.profile?.birthDate||'')+'">')+'<button class="rudi-center__btn">Сохранить профиль</button></form><div class="rudi-center__settings"><h3>Управление данными</h3><div class="rudi-center__actions"><button class="rudi-center__btn rudi-center__btn--ghost" type="button" data-clear="checkins">Очистить дневник настроения</button><button class="rudi-center__btn rudi-center__btn--ghost" type="button" data-clear="symptoms">Очистить симптомы</button><button class="rudi-center__btn rudi-center__btn--ghost" type="button" data-clear="weights">Очистить вес</button><button class="rudi-center__btn rudi-center__btn--ghost" type="button" data-erase="reports">Удалить AI-отчёты</button><button class="rudi-center__btn rudi-center__btn--danger" type="button" data-erase="all">Удалить все данные AI-центра</button></div></div>';
 }
 content.innerHTML=html;$('pcSheetTitle').textContent=title;
 const sym=content.querySelector('#pcSymptomForm');if(sym)sym.onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(sym).entries());mutate('symptom',{description:f.description,intensity:Number(f.intensity),startedAt:f.startedAt?new Date(f.startedAt).toISOString():new Date().toISOString(),duration:f.duration,comment:f.comment});};
 const wt=content.querySelector('#pcWeightForm');if(wt)wt.onsubmit=e=>{e.preventDefault();mutate('weight',{kg:Number(new FormData(wt).get('kg'))});};
 const pr=content.querySelector('#pcProfileForm');if(pr)pr.onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(pr).entries());mutate('profile',{height:Number(f.height),birthDate:f.birthDate});};
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
