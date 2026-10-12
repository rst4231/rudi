/* RUDI meditation: one actor per session, server-backed timer and calm full-page UI */
(()=>{'use strict';
const API='/api/meditation',GOALS=[5,10,20,30,60],ACTORS=['Рустам','Диана'];
const $=id=>document.getElementById(id);
let actor='',state=null,partner=null,quote=null,page=null,clock=0,busy=false,goal=10,lastPartnerFetch=0,fetching=false,playing=false;
const initData=()=>String(window.Telegram?.WebApp?.initData||'');
const actorFromPage=()=>String(document.body?.dataset?.rudiActor||'');
const key=s=>'rudi:meditation:'+actor+':'+s;
const pref=()=>{try{return localStorage.getItem(key('sound'))!=='off'}catch{return true}};
const moscowDate=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const minuteText=minutes=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(Number(minutes)||0)+' мин';
const text=(id,v)=>{const e=$(id);if(e)e.textContent=v};
async function request(operation,payload={}){
 const res=await fetch(API,{method:'POST',cache:'no-store',credentials:'same-origin',
  headers:{'content-type':'application/json'},body:JSON.stringify({initData:initData(),operation,...payload})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok||!data.ok)throw Error(data.error||'Ошибка соединения');
 return data;
}
function ensurePage(){
 if(page)return page;
 page=document.createElement('section');page.id='meditationPage';page.className='rudi-meditation-page';
 page.hidden=true;page.setAttribute('role','region');page.setAttribute('aria-label','Медитация');
 page.innerHTML=`
  <header class="rudi-app-page-head personal-tool-page-head fasting-page-head meditation-head">
   <button id="meditationBack" class="fasting-back-button rudi-app-page-back" type="button" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
   <div class="fasting-page-title"><div class="section-eyebrow">Личное</div><h1>Медитация</h1><small id="meditationActor"></small></div>
  </header>
  <div class="meditation-scroll">
   <article class="meditation-intro"><span class="meditation-overline">Время для себя</span><h2>Вернись к дыханию</h2><p>Только этот момент. Без спешки.</p></article>
   <figure class="meditation-quote" id="meditationQuote"><span class="meditation-quote-mark" aria-hidden="true">“</span><blockquote id="meditationQuoteText">Тишина начинается с одного вдоха.</blockquote><figcaption id="meditationQuoteAuthor">Мысль дня</figcaption></figure>
   <section class="meditation-timer-panel" aria-label="Таймер">
    <div class="meditation-orbit" id="meditationOrbit"><div class="meditation-orbit-glow"></div><div class="meditation-orbit-core">
       <span id="meditationBreathHint">Вдох · выдох</span><strong id="meditationTime">10:00</strong><span id="meditationTimerHint">Выберите длительность</span></div></div>
    <div class="meditation-durations" id="meditationDurations" role="group" aria-label="Длительность медитации">
      ${GOALS.map(v=>'<button type="button" data-med-goal="'+v+'" aria-pressed="'+(v===10)+'">'+v+' мин</button>').join('')}
    </div>
    <button id="meditationStart" class="meditation-primary" type="button">Начать медитацию</button>
    <button id="meditationStop" class="meditation-secondary" type="button" hidden>Завершить и сохранить время</button>
    <label class="meditation-sound"><input type="checkbox" id="meditationSound" checked><span>Мягкий колокольчик в конце</span></label>
    <p id="meditationStatus" class="meditation-status" role="status" aria-live="polite"></p>
   </section>
   <section class="meditation-stats" aria-label="Статистика">
    <div><span>Сеансов</span><strong id="meditationCount">0</strong></div><div><span>Минут</span><strong id="meditationTotal">0</strong></div>
    <div><span>Дней подряд</span><strong id="meditationStreak">0</strong></div>
   </section>
   <details id="meditationHistoryCard" class="meditation-history-card">
    <summary><span><strong>История медитаций</strong><small>Фактическое время каждого сеанса</small></span><span aria-hidden="true">⌄</span></summary>
    <div id="meditationHistoryList" class="meditation-history-list"><p>Сеансов пока нет</p></div>
   </details>
  </div>`;
 document.body.appendChild(page);
 $('meditationBack').addEventListener('click',close);
 $('meditationDurations').addEventListener('click',event=>{const b=event.target.closest('[data-med-goal]');if(!b||state?.active)return;goal=Number(b.dataset.medGoal);render()});
 $('meditationStart').addEventListener('click',()=>void start());
 $('meditationStop').addEventListener('click',()=>void stop(false));
 $('meditationSound').addEventListener('change',event=>{try{localStorage.setItem(key('sound'),event.target.checked?'on':'off')}catch{}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&page&&!page.hidden){render();void autoFinish()}});
 window.addEventListener('online',()=>{if(!page?.hidden)void load()});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!page.hidden)close()});
 clock=setInterval(()=>{if(page&&!page.hidden){renderClock();void autoFinish()}},300);
 return page;
}
function status(t){text('meditationStatus',t||'')}
function renderClock(){
 if(!page||page.hidden)return;
 const a=state?.active,started=a?Date.parse(a.startedAt):0;
 const elapsed=a?Math.max(0,(Date.now()-started)/1000):0;
 const duration=(a?a.goalMinutes:goal)*60;
 const remain=a?Math.max(0,Math.ceil(duration-elapsed)):duration;
 const mm=String(Math.floor(remain/60)).padStart(2,'0'),ss=String(remain%60).padStart(2,'0');
 text('meditationTime',mm+':'+ss);
 text('meditationBreathHint',a?'Дыши спокойно':'Вдох · выдох');
 text('meditationTimerHint',a?'Осталось до окончания':'Выбери своё время');
 $('meditationOrbit')?.classList.toggle('is-active',Boolean(a));
}
function render(){
 if(!page)return;
 text('meditationActor',actor);renderClock();
 for(const btn of page.querySelectorAll('[data-med-goal]')){
  btn.setAttribute('aria-pressed',Number(btn.dataset.medGoal)===(state?.active?.goalMinutes||goal)?'true':'false');
  btn.disabled=Boolean(state?.active)||busy;
 }
 $('meditationStart').hidden=Boolean(state?.active);
 $('meditationStop').hidden=!state?.active;
 $('meditationStart').disabled=busy;$('meditationStop').disabled=busy;
 $('meditationSound').checked=pref();
 const stats=state?.stats||{sessions:0,totalMinutes:0,streak:0};
 text('meditationCount',stats.sessions);text('meditationTotal',minuteText(stats.totalMinutes));text('meditationStreak',stats.streak);
 const history=$('meditationHistoryList');history.replaceChildren();
 if(!state?.history?.length){const p=document.createElement('p');p.textContent='Здесь появятся ваши медитации';history.appendChild(p)}
 else for(const row of state.history.slice(0,100)){
  const line=document.createElement('div');line.className='meditation-history-row';
  const left=document.createElement('span'),right=document.createElement('strong');
  const date=document.createElement('b');date.textContent=moscowDate(row.endedAt);
  const tag=document.createElement('small');tag.textContent=row.completed?'Завершена':'Остановлена раньше';
  left.append(date,tag);right.textContent=minuteText(Number(row.durationSeconds||0)/60);
  line.append(left,right);history.appendChild(line);
 }
 if(quote){
  text('meditationQuoteText',quote.text);
  text('meditationQuoteAuthor',quote.author+' · '+quote.source);
 }
}
async function load(){
 if(!actor||fetching)return;fetching=true;
 try{
  const data=await request('state');
  if(actor!==data.actor)return;
  state=data.meditation;partner=data.partner;quote=data.quote||null;
  render();status('');updatePartner();await autoFinish();
 }catch(error){status('Данные не загрузились. Проверьте подключение')}
 finally{fetching=false}
}
function notifyComplete(){
 try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch{}
 try{navigator.vibrate?.([90,90,160])}catch{}
 if(!pref()||document.hidden)return;
 try{
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return;
  const context=new AudioContext();
  const t=context.currentTime;
  for(const [offset,hz] of [[0,660],[.28,880]]){
   const osc=context.createOscillator(),gain=context.createGain();
   osc.type='sine';osc.frequency.value=hz;
   gain.gain.setValueAtTime(0.0001,t+offset);
   gain.gain.exponentialRampToValueAtTime(.11,t+offset+.035);
   gain.gain.exponentialRampToValueAtTime(.0001,t+offset+1.4);
   osc.connect(gain);gain.connect(context.destination);
   osc.start(t+offset);osc.stop(t+offset+1.45);
  }
  setTimeout(()=>context.close().catch(()=>{}),2600);
 }catch{}
}
async function start(){
 if(busy||state?.active)return;
 busy=true;status('Начинаю…');render();
 try{
  const data=await request('start',{goalMinutes:goal});
  state=data.meditation;
  render();status('Медитация началась. Таймер продолжит отсчёт после сворачивания.');
 }catch(error){status(String(error.message).includes('already-active')?'Сеанс уже идёт. Обновите страницу.':'Не удалось начать. Попробуйте ещё раз.')}
 finally{busy=false;render()}
}
async function stop(auto){
 if(busy||!state?.active)return;
 const active=state.active;
 busy=true;render();status('Сохраняю сеанс…');
 try{
  const data=await request('finish',{activeId:active.id,auto});
  state=data.meditation;render();status(data.session?'Сохранено: '+minuteText(data.session.durationSeconds/60):'Сеанс завершён');
  if(data.session?.completed)notifyComplete();
  updatePartner();
 }catch(error){status('Не удалось сохранить. Таймер сохранён, повторите после восстановления связи.')}
 finally{busy=false;render()}
}
async function autoFinish(){
 if(busy||!state?.active)return;
 const a=state.active,goalMs=a.goalMinutes*60000;
 if(Date.now()-Date.parse(a.startedAt)>=goalMs)await stop(true);
}
function open(){
 const current=actorFromPage();if(!ACTORS.includes(current))return;
 actor=current;ensurePage();
 page.hidden=false;document.body.classList.add('meditation-page-open');
 window.scrollTo({top:0,behavior:'instant'});
 state=null;quote=null;partner=null;status('Загружаю…');
 render();void load();
 try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch{}
}
function close(){
 if(!page)return;page.hidden=true;document.body.classList.remove('meditation-page-open');updatePartner();
}
function updatePartner(){
 if(!actor||!partner)return;
 const id=partner.actor==='Рустам'?'homeRustamDetails':'homeDianaDetails';
 const detail=$(id);if(!detail)return;
 let card=detail.querySelector('#meditationPartnerSummary');
 if(!card){card=document.createElement('div');card.id='meditationPartnerSummary';card.className='meditation-partner-summary';const supplements=detail.querySelector('.profile-supplement-intakes');if(supplements)supplements.insertAdjacentElement('afterend',card);else detail.appendChild(card)}
 const count=Number(partner.todaySessions||0),minutes=Number(partner.todayMinutes||0);
 card.textContent=count?'🧘 Медитация сегодня · '+minuteText(minutes)+' · '+count+' сеанс(ов)':'🧘 Медитация сегодня · пока нет';
}
async function refreshPartner(){
 const current=actorFromPage();if(!ACTORS.includes(current))return;
 if(actor!==current){actor=current;state=null;partner=null;lastPartnerFetch=0}
 if(Date.now()-lastPartnerFetch<90*1000)return;
 lastPartnerFetch=Date.now();
 try{
  const data=await request('overview');
  partner={actor:actor==='Рустам'?'Диана':'Рустам',...(data.summary?.[actor==='Рустам'?'Диана':'Рустам']||{})};
  updatePartner();
 }catch{}
}
function reconcile(){
 const current=actorFromPage();
 if(!ACTORS.includes(current))return;
 if(current!==actor){actor=current;lastPartnerFetch=0;state=null;partner=null}
 const fasting=$('fastingProfileButton');
 if(fasting&&fasting.parentElement&&!$('meditationProfileButton')){
  const button=document.createElement('button');
  button.id='meditationProfileButton';button.className='fasting-profile-button partner-mood-value meditation-profile-button';
  button.type='button';button.title='Медитация';button.setAttribute('aria-label','Открыть таймер медитации');
  button.innerHTML='<span class="mood-emoji" aria-hidden="true">🧘</span>';
  fasting.insertAdjacentElement('afterend',button);
  button.addEventListener('click',open);
 }
 if(document.body.dataset.appTab==='home'){updatePartner();void refreshPartner()}
}
window.RudiMeditation={open,close,reconcile};
window.addEventListener('rudi:profile-ready',()=>{reconcile();void refreshPartner()});
window.addEventListener('rudi:app-tab-change',event=>{
 if(event.detail?.tab==='home'){reconcile();void refreshPartner()}
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{reconcile();setInterval(reconcile,12000)},{once:true});
else{reconcile();setInterval(reconcile,12000)}
})();