/* RUDI meditation: one actor per session, server-backed timer and calm full-page UI */
(()=>{'use strict';
const API='/api/meditation',GOALS=[5,10,20,30,60],ACTORS=['Рустам','Диана'];
const $=id=>document.getElementById(id);
let actor='',state=null,partner=null,quote=null,page=null,clock=0,busy=false,goal=10,lastPartnerFetch=0,fetching=false,lastFinishAttempt=0,wakeLock=null,wakeLockPending=false;
let todayProgress={};
const SAD_MOODS=new Set(['sadness','anger','fatigue','boredom']);
const formatDailyTime=minutes=>{const n=Math.max(0,Math.round(Number(minutes)||0));return n>=60?Math.floor(n/60)+' ч'+(n%60?' '+n%60+' мин':''):n+' мин'};
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
   <div class="fasting-page-title"><h1>Медитация</h1></div>
  </header>
  <div class="meditation-scroll">
   <article class="meditation-intro"><span class="meditation-overline">Время для себя</span><h2>Вернись к дыханию</h2></article>
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
   <details id="meditationBenefitsCard" class="meditation-history-card meditation-benefits-card">
    <summary><span><strong>Зачем медитировать?</strong><small>5 фактов из научных исследований</small></span><span aria-hidden="true">⌄</span></summary>
    <ol class="meditation-benefits-list">
     <li><b>Тревожность.</b> Регулярная практика осознанности может уменьшать симптомы тревоги.</li>
     <li><b>Подавленное настроение.</b> В исследованиях отмечено умеренное снижение симптомов депрессии.</li>
     <li><b>Стресс.</b> Медитация может помогать воспринимать стресс спокойнее; сила эффекта зависит от программы.</li>
     <li><b>Сон.</b> Некоторые исследования связывают практику с улучшением качества сна и уменьшением бессонницы.</li>
     <li><b>Хроническая боль.</b> Осознанность иногда помогает справляться с болью, хотя результаты исследований неоднородны.</li>
    </ol>
    <p class="meditation-benefits-source">Источники: <a href="https://www.nccih.nih.gov/health/tips/8-things-to-know-about-meditation-and-mindfulness" target="_blank" rel="noopener noreferrer">NCCIH</a> и <a href="https://pubmed.ncbi.nlm.nih.gov/24395196/" target="_blank" rel="noopener noreferrer">JAMA Internal Medicine</a>. Эффекты индивидуальны, медитация не заменяет лечение.</p>
   </details>
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
 document.addEventListener('visibilitychange',()=>{void syncWakeLock();if(!document.hidden&&page&&!page.hidden){render();void autoFinish()}});
 // Restore screen wake lock when returning to the meditation page on mobile.
 window.addEventListener('pageshow',()=>{if(page&&!page.hidden){void syncWakeLock();renderClock()}});
 window.addEventListener('online',()=>{if(!page?.hidden)void load()});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!page.hidden)close()});
 clock=setInterval(()=>{if(page&&!page.hidden){renderClock();void autoFinish()}},300);
 return page;
}
async function syncWakeLock(){
 const needed=Boolean(state?.active)&&!document.hidden&&!page?.hidden;
 if(!needed){if(wakeLock){const lock=wakeLock;wakeLock=null;try{await lock.release()}catch{}}return;}
 if(wakeLock||wakeLockPending||!navigator.wakeLock?.request)return;
 wakeLockPending=true;
 try{const lock=await navigator.wakeLock.request('screen');
  if(!state?.active||document.hidden){await lock.release();return;}
  wakeLock=lock;lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null});
 }catch{}finally{wakeLockPending=false}
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
 renderClock();void syncWakeLock();
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
  left.append(date,tag);right.textContent=minuteText(Number(row.durationSeconds||0)/60)+(Number(row.rewardPoints)>0?' · +'+String(row.rewardPoints).replace('.',',')+' ⭐':'');
  line.append(left,right);history.appendChild(line);
 }
 if(quote){
  text('meditationQuoteText',quote.text);
  text('meditationQuoteAuthor',quote.author);
 }
}
async function load(){
 if(!actor||fetching)return;fetching=true;
 try{
  const data=await request('state');
  if(actor!==data.actor)return;
  state=data.meditation;partner=data.partner;quote=data.quote||null;
  todayProgress[actor]={todaySessions:state.stats?.todaySessions||0,todayMinutes:state.stats?.todayMinutes||0};
  todayProgress[partner.actor]={todaySessions:partner.todaySessions||0,todayMinutes:partner.todayMinutes||0};
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
  render();status('');
 }catch(error){status(String(error.message).includes('already-active')?'Сеанс уже идёт. Обновите страницу.':'Не удалось начать. Попробуйте ещё раз.')}
 finally{busy=false;render()}
}
async function stop(auto){
 if(busy||!state?.active)return;
 if(auto)lastFinishAttempt=Date.now();
 const active=state.active;
 busy=true;render();status('Сохраняю сеанс…');
 try{
  const data=await request('finish',{activeId:active.id,auto});
  state=data.meditation;render();status('');
  todayProgress[actor]={todaySessions:state.stats?.todaySessions||0,todayMinutes:state.stats?.todayMinutes||0};
  document.dispatchEvent(new Event('rudi:calendar-recap-dirty'));
  updateNudges();
  if(data.session?.completed)notifyComplete();
  updatePartner();
 }catch(error){status('Не удалось сохранить. Таймер сохранён, повторите после восстановления связи.')}
 finally{busy=false;render()}
}
async function autoFinish(){
 if(busy||!state?.active)return;
 const a=state.active,goalMs=a.goalMinutes*60000;
 if(Date.now()-Date.parse(a.startedAt)>=goalMs&&Date.now()-lastFinishAttempt>30000&&navigator.onLine!==false)await stop(true);
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
 if(!page)return;page.hidden=true;document.body.classList.remove('meditation-page-open');void syncWakeLock();updatePartner();
}
function updatePartner(){
 if(!actor||!partner)return;
 const id=partner.actor==='Рустам'?'homeRustamDetails':'homeDianaDetails';
 const detail=$(id);if(!detail)return;
 let card=detail.querySelector('#meditationPartnerSummary');
 if(!card){card=document.createElement('div');card.id='meditationPartnerSummary';card.className='meditation-partner-summary';const supplements=detail.querySelector('.profile-supplement-intakes');if(supplements)supplements.insertAdjacentElement('afterend',card);else detail.appendChild(card)}
 const count=Number(partner.todaySessions||0),minutes=Number(partner.todayMinutes||0);
 const feminine=partner.actor==='Диана';
 card.textContent='🧘 Сегодня '+(count?(feminine?'медитировала ':'медитировал ')+formatDailyTime(minutes):(feminine?'не медитировала':'не медитировал'));
 updateNudges();
}
async function refreshPartner(){
 const current=actorFromPage();if(!ACTORS.includes(current))return;
 if(actor!==current){actor=current;state=null;partner=null;lastPartnerFetch=0}
 if(Date.now()-lastPartnerFetch<90*1000)return;
 lastPartnerFetch=Date.now();
 try{
  const data=await request('overview');
  partner={actor:actor==='Рустам'?'Диана':'Рустам',...(data.summary?.[actor==='Рустам'?'Диана':'Рустам']||{})};
  todayProgress=data.summary||{};
  updatePartner();updateNudges();
 }catch{}
}
function updateNudges(){
 if(document.body.dataset.appTab!=='home')return;
 for(const who of ACTORS){
  const tile=$(who==='Рустам'?'homeRustamTile':'homeDianaTile');if(!tile?.parentElement)continue;
  const moodButton=$(who===actorFromPage()?'moodCurrentButton':'partnerMoodValue');
  const mood=String(moodButton?.dataset.mood||'');const progress=todayProgress[who];
  let notice=$(who==='Рустам'?'meditationMoodNudgeRustam':'meditationMoodNudgeDiana');
  const show=Boolean(progress)&&SAD_MOODS.has(mood)&&Number(progress.todaySessions||0)===0;
  if(!show){if(notice)notice.hidden=true;continue;}
  if(!notice){notice=document.createElement('div');notice.id=who==='Рустам'?'meditationMoodNudgeRustam':'meditationMoodNudgeDiana';notice.className='meditation-mood-nudge';}
  notice.textContent='🧘 Сегодня настроение не самое лучшее. Попробуй уделить 5–10 минут медитации — это может помочь успокоиться.';
  notice.hidden=false;
  if(notice.parentElement!==tile.parentElement||notice.nextElementSibling!==tile)tile.parentElement.insertBefore(notice,tile);
 }
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
 if(document.body.dataset.appTab==='home'){updatePartner();updateNudges();void refreshPartner()}
}
window.RudiMeditation={open,close,reconcile,updateNudges};
window.addEventListener('rudi:mood-updated',updateNudges);
window.addEventListener('rudi:profile-ready',()=>{reconcile();void refreshPartner()});
window.addEventListener('rudi:app-tab-change',event=>{
 if(event.detail?.tab==='home'){reconcile();void refreshPartner()}
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{reconcile();setInterval(reconcile,12000)},{once:true});
else{reconcile();setInterval(reconcile,12000)}
})();