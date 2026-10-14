/* RUDI v4.243: personalized sea-battle player labels and low-request online presence; offline word and thinking games. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const g=()=>window.RudiGames;
const actor=()=>document.body?.dataset?.rudiActor==='Диана'?'Диана':'Рустам';
const opponentName=()=>actor()==='Рустам'?'Диана':'Рустам';
const safe=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const key=name=>'rudi-game-v4242:'+actor()+':'+name;
const read=(name,fallback)=>{try{return JSON.parse(localStorage.getItem(key(name)))??fallback}catch{return fallback}};
const write=(name,data)=>{try{localStorage.setItem(key(name),JSON.stringify(data))}catch{}};
const isVisible=()=>!document.hidden&&!!document.body?.dataset?.rudiActor;
const status={duel:{active:false,turn:null},battleship:{active:false,turn:null}};
let statusLast=0,statusBusy=false,battleRoom=null,battleMessage='',battleBusy=false,battleTimer=null,activeGame='',think=null,word=null,wordDate='';
let battlePresence=null,battleSession='',battleLastHeartbeat=0;
let previousLauncherBadge=null;
function sum(){return Object.values(status).filter(x=>x.active).length}
function myTurns(){return Object.values(status).filter(x=>x.active&&x.turn===actor()).length}
function statusText(name){
 const x=status[name];return !x?.active?'':x.turn===actor()?'Твой ход':'Игра начата';
}
function renderBadges(){
 const btn=$('rudiHomeGamesButton');
 if(btn){
  const total=sum(),mine=myTurns();
  btn.classList.toggle('rudi-games-has-badge',mine>0);
  let badge=btn.querySelector('.rudi-games-alert');
  if(!badge){badge=document.createElement('i');badge.className='rudi-games-alert';badge.setAttribute('aria-hidden','true');btn.append(badge)}
  badge.hidden=mine===0;badge.textContent='';
  btn.title=mine?'Игры · твой ход':total?'Игры · партия начата':'Игры';
  btn.setAttribute('aria-label',btn.title);
 }
 if(g()?.getMode?.()==='home'){
  for(const name of ['duel','battleship']){
   const card=document.querySelector('#rudiGamesPage [data-rudi-game="'+name+'"]');
   if(!card)continue;
   const text=statusText(name);card.classList.toggle('has-live-game',!!text);
   let chip=card.querySelector('.rudi-game-live-chip');
   if(!chip){chip=document.createElement('em');chip.className='rudi-game-live-chip';card.querySelector('.rudi-game-card-copy')?.append(chip)}
   chip.textContent=text;chip.hidden=!text;
  }
 }
 const badgeActive=myTurns()>0;
 if(previousLauncherBadge!==badgeActive){
  previousLauncherBadge=badgeActive;
  if(badgeActive&&typeof navigator.setAppBadge==='function')
   void Promise.resolve(navigator.setAppBadge()).catch(()=>{previousLauncherBadge=null});
  else if(!badgeActive&&typeof navigator.clearAppBadge==='function')
   void Promise.resolve(navigator.clearAppBadge()).catch(()=>{previousLauncherBadge=null});
 }
}
function updateOne(name,room){
 if(!room)return;
 status[name]={active:room.status==='playing',turn:room.status==='playing'?room.turn:null};
 renderBadges();
}
function statusAllowed(){return isVisible()&&(document.body.dataset.appTab==='home'||document.body.classList.contains('rudi-games-open'))&&activeGame!=='battleship'&&g()?.getMode?.()!=='duel'}
async function refreshStatus(force=false){
 if(!statusAllowed()||statusBusy||!navigator.onLine)return;
 if(!force&&Date.now()-statusLast<85000)return;
 statusBusy=true;statusLast=Date.now();
 try{
  const r=await fetch('/api/game-status',{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'content-type':'application/json'},body:JSON.stringify({initData:String(window.Telegram?.WebApp?.initData||'')})});
  if(!r.ok)return;
  const data=await r.json();if(!data.ok)return;
  status.duel=data.duel||status.duel;status.battleship=data.battleship||status.battleship;
  renderBadges();
 }catch(_){}finally{statusBusy=false}
}
function decorateMenu(){renderBadges();void refreshStatus()}
function onExistingDuel(room){updateOne('duel',room)}
async function battleRequest(operation='get',payload={}){
 const response=await fetch('/api/battleship-game',{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({operation,initData:String(window.Telegram?.WebApp?.initData||''),...payload})});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.ok){
  const e=new Error(response.status===409?'Поле изменилось. Обновляю…':response.status===401?'Нужен повторный вход':'Нет связи с игрой');
  e.room=data?.room;throw e;
 }
 if(operation==='get')battlePresence=data.presence||null;
 return data.room;
}
function leaveBattle(){
 const session=battleSession;
 battleSession='';battleLastHeartbeat=0;
 if(session)void battleRequest('leave',{sessionId:session}).catch(()=>{});
}
function stop(){
 if(activeGame==='battleship')leaveBattle();
 activeGame='';if(battleTimer){clearTimeout(battleTimer);battleTimer=null}
 battleBusy=false;
}
function scheduleBattle(){
 if(battleTimer)clearTimeout(battleTimer);
 if(activeGame!=='battleship'||document.hidden||!navigator.onLine)return;
 battleTimer=setTimeout(()=>{battleTimer=null;void pollBattle()},20000);
}
async function pollBattle(){
 if(activeGame!=='battleship'||document.hidden||battleBusy)return;
 battleBusy=true;
 try{
  if(!battleSession)battleSession=window.crypto?.randomUUID?.()||('battle'+Date.now()+'_'+Math.random().toString(36).slice(2));
  const session=battleSession,heartbeat=!battleLastHeartbeat||Date.now()-battleLastHeartbeat>=45000;
  const previousPresence=JSON.stringify(battlePresence);
  const r=await battleRequest('get',heartbeat?{sessionId:session,active:true}:{});
  if(activeGame!=='battleship'||battleSession!==session)return;
  if(heartbeat)battleLastHeartbeat=Date.now();
  const changed=battleRoom?.version!==r.version||!!battleMessage||previousPresence!==JSON.stringify(battlePresence);
  battleRoom=r;battleMessage='';updateOne('battleship',r);
  if(changed)renderBattle();
 }catch(e){if(activeGame==='battleship'){battleMessage=navigator.onLine?e.message:'Нет интернета';renderBattle()}}
 finally{battleBusy=false;scheduleBattle()}
}
function cells(kind,room){
 const own=kind==='own',shots=own?room.enemyShots:room.ownShots;
 const hitmap=new Map((shots||[]).map(x=>[x.cell,x.hit]));
 const shipset=new Set(own?room.ownShips||[]:room.opponentShips||[]);
 const turn=room.status==='playing'&&room.turn===actor();
 return '<div class="rudi-battle-grid" role="group" aria-label="'+(own?'Мой флот':'Поле '+opponentName())+'">'+
 Array.from({length:49},(_,i)=>{
  const has=hitmap.has(i),hit=hitmap.get(i),ship=shipset.has(i);
  const label='Клетка '+String.fromCharCode(65+Math.floor(i/7))+(i%7+1);
  const glyph=has?(hit?'×':'•'):own&&ship?'■':room.status!=='playing'&&ship?'■':'';
  return '<button type="button" '+(own?'':'data-battle-cell="'+i+'" ')+'aria-label="'+label+
   (has?hit?', попадание':', мимо':'')+'" class="rudi-battle-cell'+(ship&&own?' is-ship':'')+
   (has?(hit?' is-hit':' is-miss'):'')+'" '+(own||has||!turn?'disabled':'')+'>'+glyph+'</button>';
 }).join('')+'</div>';
}
function renderBattle(){
 if(activeGame!=='battleship'||g()?.getMode?.()!=='battleship')return;
 const r=battleRoom;
 g().header('Морской бой','Рустам против Дианы · 7 × 7');
 if(!r){g().section('<div class="rudi-game-work">Подключаю общее поле…</div>');return}
 const playing=r.status==='playing',turn=r.turn===actor(),ended=r.status==='ended';
 const other=opponentName();
 const presenceStatus=name=>battlePresence===null?'Проверяем…':battlePresence[name]?'В игре':'Не в игре';
 const presenceClass=name=>battlePresence===null?'is-checking':battlePresence[name]?'is-online':'is-offline';
 const presenceHtml='<div class="rudi-duel-presence" aria-label="Сейчас в Морском бое">'+
  [actor(),other].map(name=>'<span class="rudi-duel-player '+presenceClass(name)+'"><i aria-hidden="true"></i><b>'+safe(name)+'</b><small>'+presenceStatus(name)+'</small></span>').join('')+'</div>';
 const message=playing?(turn?'Твой ход — выбирай клетку':'Ходит '+r.turn):
  r.status==='won'?(r.winner===actor()?'Победа! Все корабли соперника потоплены.':'Победил'+(r.winner==='Диана'?'а':'')+' '+r.winner):
  ended?'Партия завершена.':r.round?'Можно начать новую партию.':'Игра ещё не началась.';
 g().section('<div class="rudi-game-work rudi-battle-work">'+presenceHtml+'<div class="rudi-battle-info"><span>Раунд '+r.round+'</span><strong>'+safe(message)+'</strong></div>'+
  '<section><h2>Поле '+safe(other)+'</h2><p>Нажми на клетку, чтобы выстрелить. Красный крест — попадание.</p>'+
  cells('enemy',r)+'</section><section><h2>Мои корабли</h2><p>Корабли размещаются автоматически. Синий квадрат — часть корабля.</p>'+
  cells('own',r)+'</section>'+
  (playing?'<button class="rudi-duel-finish" type="button" data-battle-action="end">Завершить партию</button>':
   '<button class="rudi-game-primary" type="button" data-battle-action="start">'+(r.round?'Новая партия':'Начать игру')+'</button>')+
  '<p class="rudi-game-hint" role="status">'+safe(battleMessage||'Ходы сохраняются. Поле обновляется раз в 20 секунд, пока игра открыта.')+'</p></div>');
}
async function battleAction(action,index){
 if(activeGame!=='battleship'||battleBusy)return;
 battleBusy=true;battleMessage='';
 try{
  const params=(action==='move'||action==='end')?{version:battleRoom?.version,...(action==='move'?{index}:{})}:{};
  battleRoom=await battleRequest(action,params);updateOne('battleship',battleRoom);renderBattle();
 }catch(e){
  if(e.room){battleRoom=e.room;updateOne('battleship',battleRoom)}
  battleMessage=e.message;renderBattle();
 }finally{battleBusy=false;scheduleBattle()}
}
function startBattle(){
 activeGame='battleship';battleRoom=null;battlePresence=null;battleSession='';battleLastHeartbeat=0;battleMessage='';g().setMode('battleship');
 renderBattle();void pollBattle();
}
const WORDS=['АРБУЗ','ГОРОД','КНИГА','ПАРУС','ЛАМПА','СОСНА','ГЕРОЙ','ОКЕАН','СТЕНА','ШКОЛА','ГРУША','ЛИМОН','ДОСКА','САПОГ','МОТОР','РОМАН','ПИЛОТ','ПЕСНЯ','МАСКА','РЫБАК','ТРАВА','МЕЧТА','ВЕТЕР','РОБОТ','СЛОВО','ДОЖДЬ','КРЫША','ЛИСТЫ','МЫШКА','ЧАШКА','НОЖКА','ЗАМОК','ДЕНЕК','ПОЛКА','СЦЕНА','ТУМАН','ВОЛНА','ОГОНЬ','ШТУКА','ЯГОДА'];
function moscowDay(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day}
function targetForDay(day){
 let n=2166136261;
 for(const c of day){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}
 return WORDS[(n>>>0)%WORDS.length];
}
function grade(guess,target){
 const flags=Array(5).fill('miss'),counts={};
 for(let i=0;i<5;i++)if(guess[i]===target[i])flags[i]='hit';else counts[target[i]]=(counts[target[i]]||0)+1;
 for(let i=0;i<5;i++)if(flags[i]!=='hit'&&counts[guess[i]]>0){flags[i]='near';counts[guess[i]]--}
 return flags;
}
function readWord(){
 const day=moscowDay(),stored=read('word:'+day,{guesses:[],complete:false});
 return {day,guesses:Array.isArray(stored.guesses)?stored.guesses.slice(0,6):[],complete:!!stored.complete};
}
function renderWord(){
 g().header('Угадай слово','Новое слово каждый день · 6 попыток');
 const answer=targetForDay(wordDate),guesses=word?.guesses||[],complete=guesses.includes(answer)||guesses.length===6;
 const rows=Array.from({length:6},(_,i)=>{
  const guess=guesses[i]||'',colors=guess?grade(guess,answer):[];
  return '<div class="rudi-word-row">'+Array.from({length:5},(_,j)=>
   '<span class="rudi-word-letter '+(colors[j]?'is-'+colors[j]:'')+'">'+safe(guess[j]||'')+'</span>').join('')+'</div>';
 }).join('');
 const won=guesses.includes(answer),remaining=6-guesses.length;
 g().section('<div class="rudi-game-work rudi-word-work"><p>Угадай русское слово из пяти букв. Зелёный — буква на месте, жёлтый — есть в слове.</p>'+
  '<div class="rudi-word-board">'+rows+'</div>'+
  (complete?'<strong class="rudi-word-result">'+(won?'Отлично! Слово найдено.':'Попытки закончились. Слово: '+answer)+'</strong><p>Следующее слово появится завтра.</p>':
   '<form id="rudiWordForm" class="rudi-word-form"><input id="rudiWordInput" type="text" maxlength="5" autocomplete="off" spellcheck="false" enterkeyhint="done" inputmode="text" placeholder="Пять букв" aria-label="Твоё слово">'+
   '<button class="rudi-game-primary" type="submit">Проверить ('+remaining+')</button></form>')+
  '<p id="rudiWordMessage" role="status"></p></div>');
}
function startWord(){activeGame='word';g().setMode('word');word=readWord();wordDate=word.day;renderWord()}
function submitWord(){
 if(activeGame!=='word')return;
 const input=$('rudiWordInput'),guess=String(input?.value||'').toLocaleUpperCase('ru-RU').replace(/Ё/g,'Е').trim();
 if(!/^[А-Я]{5}$/.test(guess)){$('rudiWordMessage').textContent='Введите слово из пяти русских букв.';return}
 if(word.guesses.length>=6||word.guesses.includes(targetForDay(wordDate)))return;
 word.guesses.push(guess);write('word:'+wordDate,word);renderWord();
}
const PUZZLES=[
 ['Продолжи ряд: 2, 4, 8, 16, …',['20','24','32','36'],2,'Каждое число удваивается.'],
 ['Что лишнее?',['Треугольник','Квадрат','Круг','Куб'],3,'Куб — объёмная фигура.'],
 ['Если 3 кота ловят 3 мышей за 3 минуты, сколько времени 6 котов ловят 6 мышей?',['3 минуты','6 минут','9 минут','18 минут'],0,'Каждый кот ловит одну мышь за 3 минуты.'],
 ['Продолжи ряд: 1, 1, 2, 3, 5, …',['6','7','8','9'],2,'Число равно сумме двух предыдущих.'],
 ['Все розы — цветы. Некоторые цветы красные. Обязательно ли некоторые розы красные?',['Да','Нет','Все розы красные','Нельзя утверждать'],3,'Про цвет конкретных роз ничего не сказано.'],
 ['Книга относится к чтению как вилка к …',['Еде','Письму','Огню','Бегу'],0,'Вилку используют для еды, книгу — для чтения.'],
 ['Больше: 1/2 или 2/5?',['1/2','2/5','Они равны','Зависит от числителя'],0,'0,5 больше 0,4.'],
 ['Продолжи: 5, 10, 20, 40, …',['45','50','60','80'],3,'Каждое число вдвое больше предыдущего.'],
 ['У Ани 2 сестры. Сколько всего сестёр в семье?',['2','3','4','5'],1,'Аня тоже сестра: всего три девочки.'],
 ['Если сегодня среда, какой день будет через 10 дней?',['Пятница','Суббота','Воскресенье','Понедельник'],1,'Через 7 дней снова среда, ещё через 3 — суббота.'],
 ['Какое число следующее: 3, 6, 11, 18, …',['24','25','27','29'],2,'Разности 3, 5, 7, дальше 9: 18 + 9 = 27.'],
 ['Сколько квадратов на сетке 2 × 2?',['4','5','6','8'],1,'Четыре маленьких квадрата и один большой.'],
 ['Слово «ночь» относится к «дню» как «холод» к …',['Снегу','Лету','Теплу','Зиме'],2,'Это пары противоположностей.'],
 ['Продолжи: 100, 90, 81, 73, …',['66','65','64','63'],0,'Каждый раз вычитаем на единицу меньше: -10, -9, -8, -7.'],
 ['Если A > B, а B > C, какое утверждение верно?',['C > A','A > C','A = C','Неизвестно'],1,'Транзитивность сравнения.']
];
function renderThinking(){
 g().header('Тренировка мышления','Логика · закономерности · внимательность');
 const t=think;
 if(t.index>=10){
  const previous=read('thinking-record',{best:0,plays:0});
  if(!t.saved){write('thinking-record',{best:Math.max(previous.best,t.score),plays:previous.plays+1});t.saved=true}
  g().section('<div class="rudi-game-result"><span>Результат</span><strong>'+t.score+' / 10</strong><p>Тренировка завершена. Можно попробовать ещё раз.</p>'+
   '<button type="button" class="rudi-game-primary" data-extra-action="think-restart">Ещё 10 задач</button></div>');
  return;
 }
 const [q,options,correct,explanation]=PUZZLES[t.order[t.index]];
 g().section('<div class="rudi-game-work rudi-thinking-work"><small>Задание '+(t.index+1)+' из 10 · Верно: '+t.score+'</small><h2>'+safe(q)+'</h2>'+
  '<div class="rudi-quiz-options">'+options.map((o,i)=>
   '<button type="button" data-think-answer="'+i+'" '+(t.answered?'disabled':'')+' class="'+
   (t.answered?(i===correct?'correct':i===t.choice?'wrong':''):'')+'">'+safe(o)+'</button>').join('')+'</div>'+
  (t.answered?'<p class="rudi-thinking-explanation">'+safe(explanation)+'</p><button type="button" class="rudi-game-primary" data-extra-action="think-next">Дальше</button>':'')+
  '</div>');
}
function startThinking(){
 activeGame='thinking';g().setMode('thinking');
 const order=PUZZLES.map((_,i)=>i);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
 think={order,index:0,score:0,answered:false,choice:-1,saved:false};renderThinking();
}
function thinkAnswer(i){
 if(activeGame!=='thinking'||think?.answered)return;
 if(!Number.isInteger(i)||i<0||i>=4)return;
 think.answered=true;think.choice=i;
 if(i===PUZZLES[think.order[think.index]][2])think.score++;
 renderThinking();
}
function openGame(game){
 stop();
 if(game==='battleship')startBattle();
 if(game==='word')startWord();
 if(game==='thinking')startThinking();
}
function onClick(e){
 const cell=e.target.closest('[data-battle-cell]');
 if(cell){void battleAction('move',Number(cell.dataset.battleCell));return true}
 const cmd=e.target.closest('[data-battle-action]');
 if(cmd){void battleAction(cmd.dataset.battleAction);return true}
 if(e.target.closest('[data-think-answer]')){thinkAnswer(Number(e.target.closest('[data-think-answer]').dataset.thinkAnswer));return true}
 const act=e.target.closest('[data-extra-action]')?.dataset.extraAction;
 if(act==='think-restart'){startThinking();return true}
 if(act==='think-next'){think.index++;think.answered=false;renderThinking();return true}
 return false;
}
document.addEventListener('submit',e=>{if(e.target?.id==='rudiWordForm'){e.preventDefault();submitWord()}});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){if(battleTimer){clearTimeout(battleTimer);battleTimer=null}if(activeGame==='battleship')leaveBattle()}
 else{if(activeGame==='battleship'){battlePresence=null;void pollBattle()}else void refreshStatus(true)}
});
window.addEventListener('online',()=>{if(activeGame==='battleship')void pollBattle();else void refreshStatus(true)});
window.addEventListener('focus',()=>{if(activeGame!=='battleship')void refreshStatus()});
document.addEventListener('rudi:home-tiles-ready',()=>{renderBadges();void refreshStatus()});
window.addEventListener('rudi:profile-ready',()=>{renderBadges();void refreshStatus()});
function openBattleDeepLink(){
 if(new URLSearchParams(window.location.search).get('game')!=='battleship'||!isVisible())return;
 const url=new URL(window.location.href);url.searchParams.delete('game');
 window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
 g()?.open?.();startBattle();
}
window.addEventListener('popstate',openBattleDeepLink);
document.addEventListener('rudi:home-tiles-ready',openBattleDeepLink);
window.addEventListener('rudi:profile-ready',openBattleDeepLink);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',openBattleDeepLink,{once:true});
else queueMicrotask(openBattleDeepLink);
navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='RUDI_PUSH_RECEIVED')void refreshStatus(true)});
const ticker=setInterval(()=>{if(statusAllowed())void refreshStatus()},90000);
window.addEventListener('pagehide',stop);
window.addEventListener('pageshow',event=>{
 if(!event.persisted)return;
 if(g()?.getMode?.()==='battleship'){startBattle();return}
 void refreshStatus(true);
});
window.RudiGameExtras={openGame,onClick,stop,renderBadges,decorateMenu,refreshStatus,onExistingDuel,updateOne};
})();