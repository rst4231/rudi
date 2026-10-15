/* RUDI v4.212: offline personal cognitive and finance trainers. No real money. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const safe=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actor=()=>document.body?.dataset?.rudiActor==='Диана'?'Диана':'Рустам';
const storageKey=()=> 'rudi-games-v1:'+actor();
let duelRoom=null,duelTimer=null,duelBusy=false,duelMessage='',duelPresence=null,duelSession='',duelLastHeartbeat=0;
let page=null,mode='home',memoryTimer=null,level=1,sequence='';
let pageCloseTimer=0;
function stats(){try{const v=JSON.parse(localStorage.getItem(storageKey())||'{}');return {memory:Number(v.memory)||0}}catch{return {memory:0}}}
function save(patch){const data={...stats(),...patch};try{localStorage.setItem(storageKey(),JSON.stringify(data))}catch{}return data}
function haptic(){try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch{}}
function header(title,subtitle=''){
 $('rudiGamesTitle').textContent=title;
 $('rudiGamesSubtitle').textContent=subtitle;
}
function section(html){$('rudiGamesContent').innerHTML=html}
function menu(){
 stopDuel();window.RudiGameExtras?.stop?.();mode='home';
 clearTimeout(memoryTimer);memoryTimer=null;
 header('Игры и тренажёры','Твоя игровая комната');
 const s=stats();
 section('<div class="rudi-game-hero"><span class="rudi-games-overline">АРКАДНАЯ ЗОНА · RUDI</span><h2>Выбирай игру ✨</h2></div>'+
  '<div class="rudi-games-stats"><div><small>Память</small><strong>'+s.memory+' ур.</strong></div><div><small>Игроки</small><strong>Р × Д</strong></div><div><small>Игры</small><strong>5</strong></div></div>'+
  '<div class="rudi-games-list">'+
  '<button data-rudi-game="memory" class="rudi-game-card"><span class="rudi-game-glyph">◎</span><span class="rudi-game-card-copy"><b>Тренировка памяти</b><small>Запомни последовательность чисел.</small></span><span class="rudi-game-arrow">›</span></button>'+
  '<button data-rudi-game="thinking" class="rudi-game-card"><span class="rudi-game-glyph">◈</span><span class="rudi-game-card-copy"><b>Тренировка мышления</b><small>Задачи на логику, закономерности и внимательность.</small></span><span class="rudi-game-arrow">›</span></button>'+
  '<button data-rudi-game="word" class="rudi-game-card"><span class="rudi-game-glyph">АБ</span><span class="rudi-game-card-copy"><b>Угадай слово</b><small>Одно слово каждый день. 6 попыток.</small></span><span class="rudi-game-arrow">›</span></button>'+
  '<button data-rudi-game="duel" class="rudi-game-card is-duel"><span class="rudi-game-glyph">×○</span><span class="rudi-game-card-copy"><b>Крестики-нолики · онлайн</b><small>Общее поле. Рустам против Дианы.</small></span><span class="rudi-game-arrow">›</span></button>'+
  '<button data-rudi-game="battleship" class="rudi-game-card is-duel"><span class="rudi-game-glyph">⚓</span><span class="rudi-game-card-copy"><b>Морской бой · онлайн</b><small>Общее поле 7×7. Рустам против Дианы.</small></span><span class="rudi-game-arrow">›</span></button></div>');
 window.RudiGameExtras?.decorateMenu?.();
}
function memoryShow(){
 mode='memory';
 header('Память','Уровень '+level);
 sequence=Array.from({length:3+level},()=>String(Math.floor(Math.random()*10))).join('');
 section('<div class="rudi-game-work"><small>Уровень '+level+'</small><p>Запомни число. Через несколько секунд оно исчезнет.</p><div id="rudiMemoryNumber" class="rudi-memory-number">'+sequence+'</div>'+
 '<label id="rudiMemoryInputWrap" class="rudi-memory-label" hidden>Какое число было?<input id="rudiMemoryAnswer" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="'+sequence.length+'"></label>'+
 '<button id="rudiMemoryCheck" class="rudi-game-primary" disabled>Проверить</button><div id="rudiGameMessage" role="status" aria-live="polite"></div></div>');
 const input=$('rudiMemoryAnswer'),button=$('rudiMemoryCheck');
 input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,sequence.length);button.disabled=input.value.length!==sequence.length});
 button.addEventListener('click',memoryCheck);
 memoryTimer=setTimeout(()=>{
   if(mode!=='memory'||!page||page.hidden)return;
   $('rudiMemoryNumber').textContent='••••';
   $('rudiMemoryInputWrap').hidden=false;
   input.focus({preventScroll:true});
 },Math.min(3800,1500+level*350));
}
function memoryCheck(){
 const guess=String($('rudiMemoryAnswer')?.value||'');
 if(guess===sequence){
   save({memory:Math.max(stats().memory,level)});
   level++;
   $('rudiGameMessage').textContent='Верно! Следующий уровень сложнее.';
   $('rudiMemoryCheck').textContent='Следующий уровень';$('rudiMemoryCheck').disabled=false;
 }else{
   $('rudiGameMessage').textContent='Ответ: '+sequence+'. Хорошая попытка!';
   $('rudiMemoryCheck').textContent='Попробовать снова';$('rudiMemoryCheck').disabled=false;
 }
 $('rudiMemoryAnswer').disabled=true;
 // Replace the original handler so the next click never resubmits the answer.
 const old=$('rudiMemoryCheck'),fresh=old.cloneNode(true);old.replaceWith(fresh);
 fresh.addEventListener('click',guess===sequence?memoryShow:()=>{level=1;memoryShow()});
}
/* Online duel: active while open, limited polling to protect D1 quotas. */
function stopDuel(){
 if(duelTimer){clearTimeout(duelTimer);duelTimer=null}
 if(duelSession){
  const session=duelSession;duelSession='';duelLastHeartbeat=0;
  void duelRequest('leave',{sessionId:session}).catch(()=>{});
 }
 duelBusy=false;
}
async function duelRequest(operation='get',extra={}){
 const response=await fetch('/api/duel-game',{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({initData:String(window.Telegram?.WebApp?.initData||''),operation,...extra})});
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.ok){
  const e=new Error(response.status===401?'Требуется повторный вход':response.status===409?'Игра обновилась, повтори действие':'Не удалось соединиться с игрой');
  e.server=result;e.status=response.status;throw e;
 }
 return result;
}
function duelRender(){
 if(mode!=='duel'||!page||page.hidden)return;
 const actorName=actor(),room=duelRoom,other=actorName==='Рустам'?'Диана':'Рустам';
 header('Крестики-нолики','Рустам × против Дианы ○');
 if(!room){section('<div class="rudi-game-work"><p class="rudi-duel-message">Загружаем общее поле…</p></div>');return}
 const turn=room.turn===actorName,playing=room.status==='playing';
 const message=room.status==='ended'?(room.endedBy===actorName?'Ты завершил'+(actorName==='Диана'?'а':'')+' игру.':room.endedBy+' завершил'+(room.endedBy==='Диана'?'а':'')+' игру.'):
  room.status==='won'?(room.winner===actorName?'Ты победил'+(actorName==='Диана'?'а':'')+'!':room.winner+' победил'+(room.winner==='Диана'?'а':'')):
  room.status==='draw'?'Ничья. Хорошая игра!':
  playing?(turn?'Твой ход':'Ходит '+room.turn):'Игра ещё не началась';
 const status=name=>duelPresence===null?'Проверяем…':duelPresence[name]?'В игре':'Не в игре';
 const cls=name=>duelPresence===null?'is-checking':duelPresence[name]?'is-online':'is-offline';
 const presenceHtml='<div class="rudi-duel-presence" aria-label="Сейчас в игре">'+
  [actorName,other].map(name=>'<span class="rudi-duel-player '+cls(name)+'"><i aria-hidden="true"></i><b>'+safe(name)+'</b><small>'+status(name)+'</small></span>').join('')+'</div>';
 const cells=room.board.map((v,i)=>'<button type="button" data-duel-index="'+i+'" aria-label="Клетка '+(i+1)+(v?', '+(v==='X'?'крестик':'нолик'):'')+'" '+(!playing||!turn||!!v?'disabled':'')+' class="rudi-duel-cell '+(v==='X'?'is-x':v==='O'?'is-o':'')+'">'+(v==='X'?'×':v==='O'?'○':'')+'</button>').join('');
 section('<div class="rudi-game-work rudi-duel-work">'+presenceHtml+
  '<div class="rudi-duel-score"><span>Рустам <b>×</b></span><span>Раунд '+room.round+'</span><span><b>○</b> Диана</span></div>'+
  '<p class="rudi-duel-turn" role="status">'+safe(message)+'</p><div class="rudi-duel-board" role="group" aria-label="Поле 3 на 3">'+cells+'</div>'+
  (playing?'<button type="button" data-duel-action="end" class="rudi-duel-finish">Завершить игру</button>':
    '<button type="button" data-duel-action="start" class="rudi-game-primary">'+(room.round?'Новая партия':'Начать игру')+'</button>')+
  '<p class="rudi-game-hint">'+(duelMessage?safe(duelMessage):'Поле автоматически синхронизируется.')+'</p></div>');
}
function queueDuelPoll(delay=15000){
 if(duelTimer)clearTimeout(duelTimer);
 if(mode!=='duel'||page?.hidden||document.hidden)return;
 duelTimer=setTimeout(()=>{duelTimer=null;void duelPoll()},delay);
}
async function duelPoll(){
 if(mode!=='duel'||page?.hidden||document.hidden)return;
 if(duelBusy){queueDuelPoll();return}
 duelBusy=true;
 try{
  if(!duelSession)duelSession=window.crypto?.randomUUID?.()||('game'+Date.now()+'_'+Math.random().toString(36).slice(2));
  const session=duelSession,heartbeat=duelLastHeartbeat===0||Date.now()-duelLastHeartbeat>=22000;
  const result=await duelRequest('get',heartbeat?{sessionId:session,active:true}:{});
  if(mode!=='duel'||page?.hidden||document.hidden||duelSession!==session)return;
  if(heartbeat)duelLastHeartbeat=Date.now();
  const changed=duelRoom?.version!==result.room?.version||!!duelMessage||
   JSON.stringify(duelPresence)!==JSON.stringify(result.presence||null);
  duelRoom=result.room;duelPresence=result.presence||null;duelMessage='';window.RudiGameExtras?.onExistingDuel?.(duelRoom);if(changed)duelRender();
 }catch(error){if(mode==='duel'){duelMessage=!navigator.onLine?'Ожидаем интернет':error.message;duelRender()}}
 finally{duelBusy=false;queueDuelPoll()}
}
async function duelAction(action,index){
 if(duelBusy||mode!=='duel')return;
 duelBusy=true;duelMessage='';
 try{
  const extra=(action==='move'||action==='end')?{...(action==='move'?{index}:{}),version:duelRoom?.version}:{};
  const result=await duelRequest(action,extra);
  duelRoom=result.room;window.RudiGameExtras?.onExistingDuel?.(duelRoom);duelRender();haptic();
 }catch(error){
  if(error.server?.room)duelRoom=error.server.room;
  duelMessage=error.message;duelRender();
 }finally{duelBusy=false;queueDuelPoll()}
}
function duelStart(){
 stopDuel();mode='duel';duelRoom=null;duelPresence=null;duelMessage='';
 duelSession=window.crypto?.randomUUID?.()||('game'+Date.now()+'_'+Math.random().toString(36).slice(2));
 duelLastHeartbeat=0;duelRender();void duelPoll();
}
function open(){
 const active=document.body?.dataset?.rudiActor;
 if(!active)return;
 if(!page)ensurePage();
 clearTimeout(pageCloseTimer);page.classList.remove('is-closing');
 page.hidden=false;document.body.classList.add('rudi-games-open');
 window.scrollTo({top:0,behavior:'instant'});menu();haptic();
}
function close(){
 stopDuel();window.RudiGameExtras?.stop?.();if(!page)return;
 clearTimeout(pageCloseTimer);page.classList.add('is-closing');
 const finish=()=>{if(!page?.classList.contains('is-closing'))return;page.hidden=true;page.classList.remove('is-closing');document.body.classList.remove('rudi-games-open')};
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)finish();else pageCloseTimer=setTimeout(finish,210);
 clearTimeout(memoryTimer);memoryTimer=null;mode='home';
}
function ensurePage(){
 page=document.createElement('section');page.id='rudiGamesPage';page.className='rudi-games-page';page.hidden=true;
 page.setAttribute('aria-label','Игры и тренажёры');
 page.innerHTML='<header class="rudi-app-page-head rudi-games-head"><button id="rudiGamesBack" class="rudi-app-page-back" type="button" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><div><h1 id="rudiGamesTitle">Игры и тренажёры</h1><small id="rudiGamesSubtitle"></small></div></header><div id="rudiGamesContent" class="rudi-games-content"></div>';
 document.body.appendChild(page);
 $('rudiGamesBack').addEventListener('click',()=>{if(mode==='home')close();else menu()});
 page.addEventListener('click',e=>{
   const game=e.target.closest('[data-rudi-game]')?.dataset?.rudiGame;
   if(game==='memory'){level=1;memoryShow();return}
    if(game==='duel'){duelStart();return}
   if(['battleship','word','thinking'].includes(game)){window.RudiGameExtras?.openGame?.(game);return}
   const cell=e.target.closest('[data-duel-index]');if(cell){void duelAction('move',Number(cell.dataset.duelIndex));return}
   const duel=e.target.closest('[data-duel-action]');if(duel){void duelAction(duel.dataset.duelAction);return}
   if(window.RudiGameExtras?.onClick?.(e))return;
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&page&&!page.hidden){if(mode==='home')close();else menu()}});
 let edge=null;
 page.addEventListener('touchstart',e=>{const t=e.touches[0];edge=t&&t.clientX<55?{x:t.clientX,y:t.clientY}:null},{passive:true});
 page.addEventListener('touchend',e=>{
  const t=e.changedTouches[0];if(!edge||!t)return;const dx=t.clientX-edge.x,dy=t.clientY-edge.y;edge=null;
  if(dx>90&&Math.abs(dy)<65){if(mode==='home')close();else menu()}
 },{passive:true});
}
function ensureShortcut(){
 // Games remain available in the top shortcut bar; remove the duplicate in Quick Access.
 $('rudiGamesHomeButton')?.remove();
 $('rudiGamesQuickButton')?.remove();
}
document.addEventListener('rudi:home-tiles-ready',()=>{ensureShortcut();openDuelDeepLink()});
function openDuelDeepLink(){
 if(new URLSearchParams(window.location.search).get('game')!=='duel'||!document.body?.dataset?.rudiActor)return;
 const next=new URL(window.location.href);next.searchParams.delete('game');
 window.history.replaceState(window.history.state,'',next.pathname+next.search+next.hash);
 open();duelStart();
}
window.addEventListener('popstate',openDuelDeepLink);
window.addEventListener('rudi:profile-ready',openDuelDeepLink);
document.addEventListener('visibilitychange',()=>{
 if(mode!=='duel')return;
 if(document.hidden){stopDuel();duelPresence=null}
 else{duelPresence=null;duelLastHeartbeat=0;duelSession='';queueDuelPoll(150)}
});
window.addEventListener('pagehide',()=>{if(mode==='duel')stopDuel()});
window.addEventListener('online',()=>{if(mode==='duel')queueDuelPoll(150)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureShortcut();openDuelDeepLink()},{once:true});
else{ensureShortcut();openDuelDeepLink()}
window.RudiGames={open,close,menu,header,section,actor,safe,stats,save,
 getPage:()=>page,getMode:()=>mode,setMode:value=>{mode=value}};
})();
