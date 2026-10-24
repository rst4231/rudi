/* RUDI v4.248 production build marker: sea battle visuals and synthesized shot effects. */
/* RUDI v4.245: own-turn-only Home/PWA badge, personalized sea-battle and offline thinking games. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const g=()=>window.RudiGames;
const actor=()=>document.body?.dataset?.rudiActor==='Диана'?'Диана':'Рустам';
const opponentName=()=>actor()==='Рустам'?'Диана':'Рустам';
const battleGenitive=name=>name==='Диана'?'Дианы':name==='Рустам'?'Рустама':name;
const safe=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const key=name=>'rudi-game-v4242:'+actor()+':'+name;
const read=(name,fallback)=>{try{return JSON.parse(localStorage.getItem(key(name)))??fallback}catch{return fallback}};
const write=(name,data)=>{try{localStorage.setItem(key(name),JSON.stringify(data))}catch{}};
const isVisible=()=>!document.hidden&&!!document.body?.dataset?.rudiActor;
const status={duel:{active:false,turn:null},battleship:{active:false,turn:null}};
let statusLast=0,statusBusy=false,battleRoom=null,battleMessage='',battleBusy=false,battleTimer=null,activeGame='',think=null,word=null,wordDate='';
let battlePresence=null,battleSession='',battleLastHeartbeat=0,battleFeedback='';
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
 $('rudiGamesPage')?.classList?.remove('is-battleship');
 if(activeGame==='battleship')leaveBattle();
 activeGame='';if(battleTimer){clearTimeout(battleTimer);battleTimer=null}
 battleBusy=false;
}
function scheduleBattle(){
 if(battleTimer)clearTimeout(battleTimer);
 if(activeGame!=='battleship'||document.hidden||!navigator.onLine)return;
 battleTimer=setTimeout(()=>{battleTimer=null;void pollBattle()},5000);
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
  if(battleRoom?.version!==r.version)battleFeedback='';
  battleRoom=r;battleMessage='';updateOne('battleship',r);
  if(changed)renderBattle();
 }catch(e){if(activeGame==='battleship'){battleMessage=navigator.onLine?e.message:'Нет интернета';renderBattle()}}
 finally{battleBusy=false;scheduleBattle()}
}

/* RUDI v4.248: continuous ship silhouettes, complete wrecks, and local Web Audio effects. */
const BATTLE_SIZE=7;
let battleSoundEnabled=read('battle-sound-enabled',true)!==false,battleAudio=null;
function vesselGroups(cells){
 const tiles=new Set((cells||[]).filter(i=>Number.isInteger(i)&&i>=0&&i<49));
 const visited=new Set(),groups=[];
 for(const first of tiles){
  if(visited.has(first))continue;
  const stack=[first],group=[];visited.add(first);
  while(stack.length){
   const i=stack.pop(),row=Math.floor(i/BATTLE_SIZE);
   group.push(i);
   for(const next of [i-BATTLE_SIZE,i+BATTLE_SIZE,i-1,i+1]){
    if(!tiles.has(next)||visited.has(next))continue;
    if(Math.abs(next-i)===1&&Math.floor(next/BATTLE_SIZE)!==row)continue;
    visited.add(next);stack.push(next);
   }
  }
  groups.push(group.sort((a,b)=>a-b));
 }
 return groups;
}
function battleShips(kind,room,hitMap){
 const own=kind==='own',finished=room.status!=='playing';
 const groups=own?vesselGroups(room.ownShips):finished?
  vesselGroups(room.opponentShips):(room.sunkShips||[]);
 return groups.map(group=>{
  if(!group.length)return '';
  const first=group[0],vertical=group.length>1&&group[1]-first===BATTLE_SIZE;
  const sunk=group.every(i=>hitMap.get(i)===true);
  return '<span aria-hidden="true" class="rudi-battle-vessel'+(vertical?' is-vertical':'')+
   (sunk?' is-sunk':'')+'" style="grid-row:'+(Math.floor(first/BATTLE_SIZE)+1)+' / span '+(vertical?group.length:1)+
   ';grid-column:'+(first%BATTLE_SIZE+1)+' / span '+(vertical?1:group.length)+'">'+
   '<i class="rudi-battle-vessel-deck"></i><i class="rudi-battle-vessel-bridge"></i>'+
   '<i class="rudi-battle-vessel-turrets"></i><i class="rudi-battle-vessel-wreck"></i></span>';
 }).join('');
}
function battleTone(ctx,at,startFreq,endFreq,length,volume,type='sine'){
 const osc=ctx.createOscillator(),gain=ctx.createGain();
 osc.type=type;osc.frequency.setValueAtTime(startFreq,at);
 osc.frequency.exponentialRampToValueAtTime(endFreq,at+length);
 gain.gain.setValueAtTime(.0001,at);
 gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+.014);
 gain.gain.exponentialRampToValueAtTime(.0001,at+length);
 osc.connect(gain);gain.connect(ctx.destination);
 osc.start(at);osc.stop(at+length+.015);
}
function battleNoise(ctx,at,duration,peak,filterType,freq){
 const count=Math.floor(ctx.sampleRate*duration),buffer=ctx.createBuffer(1,count,ctx.sampleRate);
 const samples=buffer.getChannelData(0);
 for(let i=0;i<count;i++)samples[i]=(Math.random()*2-1)*(1-i/count);
 const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
 source.buffer=buffer;filter.type=filterType;filter.frequency.value=freq;
 gain.gain.setValueAtTime(.0001,at);
 gain.gain.exponentialRampToValueAtTime(peak,at+.014);
 gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
 source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
 source.start(at);source.stop(at+duration+.005);
}
function playBattleSound(kind){
 if(!battleSoundEnabled||document.hidden)return;
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return;
  if(!battleAudio)battleAudio=new Audio();
  const ctx=battleAudio;if(ctx.state==='closed')return;
  if(ctx.state==='suspended')void ctx.resume().catch(()=>{});
  const at=ctx.currentTime+.01;
  if(kind==='fire'){
   battleTone(ctx,at,160,48,.33,.19,'triangle');
   battleNoise(ctx,at,.23,.20,'lowpass',950);
  }else if(kind==='miss'){
   battleNoise(ctx,at,.33,.16,'highpass',750);
   battleTone(ctx,at,270,105,.23,.04);
  }else if(kind==='hit'||kind==='sunk'){
   battleTone(ctx,at,110,39,.42,.24,'sawtooth');
   battleNoise(ctx,at,.37,.24,'lowpass',1300);
   if(kind==='sunk'){
    battleTone(ctx,at+.18,220,47,.80,.13,'triangle');
    battleNoise(ctx,at+.28,.65,.13,'lowpass',440);
   }
  }
 }catch(_){/* Sound is optional on browsers without Web Audio. */}
}

function cells(kind,room){
 const own=kind==='own',shots=own?room.enemyShots:room.ownShots;
 const hitmap=new Map((shots||[]).map(x=>[x.cell,x.hit]));
 const ships=own?room.ownShips:room.status==='playing'?(room.sunkShips||[]).flat():room.opponentShips;
 const shipset=new Set(ships||[]);
 const sunk=new Set((own?vesselGroups(room.ownShips):room.status==='playing'?
  (room.sunkShips||[]):vesselGroups(room.opponentShips)).filter(group=>
  group.length&&group.every(i=>hitmap.get(i)===true)).flat());
 const turn=room.status==='playing'&&room.turn===actor();
 return '<div class="rudi-battle-grid" role="group" aria-label="'+('Поле '+battleGenitive(own?actor():opponentName()))+'">'+
 Array.from({length:49},(_,i)=>{
  const has=hitmap.has(i),hit=hitmap.get(i),ship=shipset.has(i);
  const label='Клетка '+'АБВГДЕЖ'[Math.floor(i/7)]+(i%7+1);
  const glyph=has?(hit?'<span class="rudi-battle-fire" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/><circle cx="20" cy="20" r="12"/><path d="M20 1v11m0 16v11M1 20h11m16 0h11"/><circle class="rudi-battle-target-dot" cx="20" cy="20" r="3"/></svg></span>':'<span class="rudi-battle-splash" aria-hidden="true">×</span>'):'';
  return '<button type="button" style="grid-row:'+(Math.floor(i/BATTLE_SIZE)+1)+';grid-column:'+(i%BATTLE_SIZE+1)+'" '+(own?'':'data-battle-cell="'+i+'" ')+'aria-label="'+label+
   (has?(hit?sunk.has(i)?', корабль потоплен':', попадание':', мимо'):own&&ship?', корабль':'')+
   '" class="rudi-battle-cell'+(ship?' is-ship':'')+
   (has?(hit?' is-hit':' is-miss'):'')+'" '+(own||has||!turn?'disabled':'')+'>'+glyph+'</button>';
 }).join('')+battleShips(kind,room,hitmap)+'</div>';
}
function battleAvatar(name){
 const tile=$(name==='Рустам'?'homeRustamTile':'homeDianaTile');
 const image=tile?.querySelector('.score-avatar-wrap img')||$(name===actor()?'avatarImage':'partnerProfileImage');
 const src=image?.getAttribute('src')||'';
 const allowed=/^(https?:\/\/|data:image\/|\/(?!\/))/i.test(src);
 return '<span class="rudi-battle-avatar">'+(allowed?'<img src="'+safe(src)+'" alt="" width="60" height="60">':'<span>'+safe(name[0])+'</span>')+'</span>';
}
function renderBattle(){
 if(activeGame!=='battleship'||g()?.getMode?.()!=='battleship')return;
 if(battleRoom?.status==='won'&&battleRoom.winner===actor()){
  const stamp=String(battleRoom.round)+':'+battleRoom.winner;
  if(read('battle-victory','')!==stamp&&window.RUDI_EFFECTS?.celebrateVictory){write('battle-victory',stamp);window.RUDI_EFFECTS.celebrateVictory(battleRoom.winner)}
 }
 $('rudiGamesPage')?.classList?.add('is-battleship');
 const r=battleRoom;
 g().header('Морской бой','Рустам против Дианы · 7 × 7');
 if(!r){g().section('<div class="rudi-game-work rudi-battle-work"><p class="rudi-battle-feedback" role="status">Подключаю общее поле…</p></div>');return}
 const playing=r.status==='playing',turn=r.turn===actor(),ended=r.status==='ended';
 const other=opponentName();
 const presenceStatus=name=>battlePresence===null?'Проверяем…':battlePresence[name]?'В игре':'Не в игре';
 const presenceClass=name=>battlePresence===null?'is-checking':battlePresence[name]?'is-online':'is-offline';
 const presenceHtml='<div class="rudi-duel-presence rudi-battle-players" aria-label="Сейчас в Морском бое">'+
  [other,actor()].map((name,i)=>(i?'<span class="rudi-battle-versus" aria-hidden="true">против</span>':'')+
   '<span class="rudi-duel-player rudi-battle-player '+presenceClass(name)+(playing&&r.turn===name?' is-current-turn':'')+'">'+battleAvatar(name)+
   '<b><i aria-hidden="true"></i>'+safe(name)+'</b><small>'+presenceStatus(name)+'</small>'+
   '<span class="rudi-battle-turn-chip'+(playing&&r.turn===name?' is-current-turn':'')+'">'+
   (playing&&r.turn===name?(name===actor()?'Твой ход':'Ход соперника'):'')+'</span></span>').join('')+'</div>';
 const message=playing?(turn?'Твой ход. Выбирай клетку.':'Ходит '+r.turn+'. Ждём выстрел.'):
  r.status==='won'?(r.winner===actor()?'Победа! Все корабли соперника потоплены.':'Победил'+(r.winner==='Диана'?'а':'')+' '+r.winner):
  ended?'Партия завершена.':r.round?'Можно начать новую партию.':'Игра ещё не началась.';
 g().section('<div class="rudi-game-work rudi-battle-work">'+presenceHtml+
  '<button type="button" class="rudi-battle-sound" data-battle-sound aria-pressed="'+battleSoundEnabled+'" aria-label="'+(battleSoundEnabled?'Выключить звуки':'Включить звуки')+'" title="'+(battleSoundEnabled?'Выключить звуки':'Включить звуки')+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>'+(battleSoundEnabled?'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>':'<path d="m16 9 5 6m0-6-5 6"/>')+'</svg></button>'+
  '<section class="rudi-battle-field rudi-battle-enemy"><h2>Поле '+safe(battleGenitive(other))+'</h2>'+
  cells('enemy',r)+'</section><p class="rudi-battle-feedback" role="status" aria-live="polite">'+safe(battleMessage||(playing&&battleFeedback)||message)+'</p>'+
  '<section class="rudi-battle-field rudi-battle-own">'+cells('own',r)+'<h2>Мои корабли</h2></section>'+
  '<div class="rudi-battle-footer"><span>Раунд '+r.round+'</span>'+
  (playing?'<button class="rudi-duel-finish" type="button" data-battle-action="end">Завершить партию</button>':
   '<button class="rudi-game-primary" type="button" data-battle-action="start">'+(r.round?'Новая партия':'Начать игру')+'</button>')+'</div></div>');
}
async function battleAction(action,index){
 if(activeGame!=='battleship'||battleBusy)return;
 battleBusy=true;battleMessage='';
 try{
  if(action==='move')playBattleSound('fire');
  const params=(action==='move'||action==='end')?{version:battleRoom?.version,...(action==='move'?{index}:{})}:{};
  battleRoom=await battleRequest(action,params);
  if(action==='move'){
   const shot=(battleRoom.ownShots||[]).find(x=>x.cell===index);
   const sunk=(battleRoom.sunkShips||[]).some(group=>group.includes(index));
   playBattleSound(sunk?'sunk':shot?.hit?'hit':'miss');
   battleFeedback=sunk?'Корабль потоплен! Стреляй ещё.':shot?.hit?'Попадание! Стреляй ещё.':'Мимо. Ход переходит сопернику.';
  }
  updateOne('battleship',battleRoom);renderBattle();
 }catch(e){
  if(e.room){battleRoom=e.room;updateOne('battleship',battleRoom)}
  battleMessage=e.message;renderBattle();
 }finally{battleBusy=false;scheduleBattle()}
}
function startBattle(){
 activeGame='battleship';battleFeedback='';battleRoom=null;battlePresence=null;battleSession='';battleLastHeartbeat=0;battleMessage='';g().setMode('battleship');
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
// Stable IDs let new questions join the offline bank without forgetting prior progress.
const PUZZLES=(()=>{
 const bank=[];
 const add=(id,family,q,answer,wrong,explanation)=>{
  const options=[String(answer),...wrong.map(String)].filter((v,i,a)=>a.indexOf(v)===i).slice(0,4);
  if(options.length!==4)throw new Error('Invalid thinking choices: '+id);
  bank.push([q,options,0,explanation,{id,family}]);
 };
 const numeric=(id,family,q,answer,explanation,wrong=[])=>{
  const distractors=[...wrong,answer+1,answer-1,answer+2,answer+3].filter(v=>v!==answer);
  add(id,family,q,answer,distractors,explanation);
 };
 const authored=[
  ['logic','Три кота ловят три мыши за три минуты. За сколько минут шесть таких котов поймают шесть мышей, работая одновременно?','3 минуты',['6 минут','9 минут','18 минут'],'Каждому коту нужны три минуты на одну мышь. Шесть котов одновременно поймают шесть мышей за те же три минуты.'],
  ['logic','Все розы — цветы. Некоторые цветы красные. Что можно достоверно сказать о цвете роз?','Данных недостаточно',['Все розы красные','Некоторые розы красные','Ни одна роза не красная'],'Красные цветы могут оказаться как розами, так и другими цветами. Условия не определяют цвет роз.'],
  ['logic','Если A > B и B > C, что обязательно верно?','A > C',['C > A','A = C','A < C'],'Из двух строгих неравенств следует: A больше и B, и C.'],
  ['logic','Все участники клуба умеют плавать. Олег не умеет плавать. Какой вывод верен?','Олег не участник клуба',['Олег участник клуба','Никто в клубе не умеет плавать','Олег учит клуб плавать'],'Умение плавать обязательно для каждого участника. Олег этому условию не соответствует.'],
  ['logic','Если идёт дождь, дорожка мокрая. Дорожка мокрая. Обязательно ли шёл дождь?','Нет, возможна другая причина',['Да, обязательно','Дождь невозможен','Мокрой дорожки быть не может'],'Дорожку могли полить. Следствие само по себе не доказывает единственную причину.'],
  ['logic','Если лампа включена, индикатор горит. Индикатор не горит. Что следует из условия?','Лампа не включена',['Лампа включена','Индикатор обязательно сломан','На улице день'],'Включённая лампа обязательно зажигает индикатор. Отсутствие этого признака исключает включённую лампу.'],
  ['logic','Хотя бы один из двух ключей подходит к замку. Первый ключ не подходит. Что известно о втором?','Второй подходит',['Второй не подходит','Подходят оба','Нельзя ничего узнать'],'Хотя бы один должен подходить; первый исключён, значит подходит второй.'],
  ['logic','Ровно одно из двух утверждений истинно: «В коробке мяч» и «В коробке кубик». Мяча в коробке нет. Что верно?','В коробке кубик',['Коробка пуста','В коробке оба предмета','В коробке только мяч'],'Первое утверждение ложно, поэтому второе должно быть истинным. Другие предметы условием не исключены.'],
  ['logic','Все воробьи — птицы. Ни одна птица не является рыбой. Какой вывод верен?','Ни один воробей не рыба',['Все рыбы — воробьи','Некоторые воробьи — рыбы','Все птицы — воробьи'],'Воробьи входят в множество птиц, которое не пересекается с множеством рыб.'],
  ['logic','Некоторые художники — музыканты. Все музыканты читают ноты. Какой вывод обязателен?','Некоторые художники читают ноты',['Все художники читают ноты','Ни один художник не читает ноты','Все читатели нот — художники'],'Те художники, которые являются музыкантами, обязательно умеют читать ноты.'],
  ['logic','Ни один красный жетон не круглый. Этот жетон круглый. Что следует?','Жетон не красный',['Жетон красный','Жетон квадратный','Все жетоны круглые'],'Красные и круглые жетоны по условию не пересекаются. Круглый жетон не может быть красным.'],
  ['logic','Чтобы войти, нужны одновременно билет и документ. У Пети есть билет, но нет документа. Может ли он войти по этому правилу?','Нет, не хватает документа',['Да, билета достаточно','Да, документ не нужен','Только если билет бумажный'],'Правило требует два условия одновременно. Выполнение только одного не даёт права войти.'],
  ['logic','Света выше Иры, а Ира выше Нины. Кто из троих ниже всех?','Нина',['Света','Ира','Все одного роста'],'Порядок по убыванию роста: Света, Ира, Нина.'],
  ['logic','Красная книга левее синей, синяя левее зелёной. Какая книга между двумя другими?','Синяя',['Красная','Зелёная','Нельзя определить'],'Порядок слева направо: красная, синяя, зелёная.'],
  ['logic','Аня пришла раньше Бориса, но позже Веры. Кто пришёл первым из троих?','Вера',['Аня','Борис','Все одновременно'],'Вера раньше Ани, а Аня раньше Бориса: Вера пришла первой.'],
  ['logic','В забеге ты обогнал участника на втором месте. Какое место ты теперь занимаешь?','Второе',['Первое','Третье','Последнее'],'Ты занял место обогнанного участника, то есть второе. Лидер всё ещё впереди.'],
  ['logic','В ящике только красные и синие носки. Сколько носков нужно достать вслепую, чтобы гарантированно получить два одного цвета?','3',['2','4','5'],'Два первых могут быть разных цветов. Третий обязательно совпадёт по цвету с одним из них.'],
  ['logic','У Ани две сестры. Сколько всего девочек в этой семье, если других детей нет?','3',['2','4','5'],'Кроме двух сестёр есть сама Аня: 2 + 1 = 3 девочки.'],
  ['logic','У двух отцов и двух сыновей три яблока. Каждый получил по одному. Как это возможно?','Это дед, отец и сын',['Одно яблоко поделили','У каждого по два яблока','Людей было четверо'],'Отец одновременно является сыном деда. Три человека выполняют четыре семейные роли.'],
  ['logic','На столе пять свечей. Две погасили, остальные полностью сгорели. Сколько свечей осталось после этого?','2',['0','3','5'],'Погашенные свечи не сгорели, поэтому осталось две свечи.'],
  ['logic','Что тяжелее: килограмм железа или килограмм ваты?','Одинаково',['Железо','Вата','Зависит от размера'],'В обоих случаях масса указана явно: ровно один килограмм.'],
  ['logic','У палки два конца. Сколько концов у трёх отдельных палок?','6',['3','4','8'],'Каждая из трёх отдельных палок имеет два конца: 3 × 2 = 6.'],
  ['logic','На ветке сидели четыре птицы. Две улетели, одна прилетела. Сколько птиц теперь на ветке?','3',['1','2','5'],'Сначала вычитаем двух улетевших, затем добавляем одну прилетевшую: 4 − 2 + 1 = 3.'],
  ['logic','В комнате четыре угла. В каждом углу сидит кошка. Сколько всего кошек, если других кошек нет?','4',['8','12','16'],'Одна кошка в каждом из четырёх углов даёт четыре кошки.'],
  ['spatial','Квадратный лист сложили пополам один раз. Сколько слоёв бумаги получилось?','2',['1','3','4'],'Одна половина легла поверх другой, поэтому получилось два слоя.'],
  ['spatial','Куб стоит на столе. Сколько его граней не касается стола?','5',['3','4','6'],'У куба шесть граней. Одна касается стола, остальные пять — нет.'],
  ['spatial','У прямоугольника отрезали один угол прямой линией, пересекающей две соседние стороны. Сколько углов у оставшейся большой части?','5',['3','4','6'],'Один старый угол исчезает, а на двух соседних сторонах появляются два новых: 4 − 1 + 2 = 5.'],
  ['spatial','Два одинаковых квадрата соединили целыми сторонами. Какая фигура получилась?','Прямоугольник',['Треугольник','Круг','Пятиугольник'],'Внешняя граница двух квадратов образует прямоугольник с вдвое большей длиной.'],
  ['spatial','Стрелка направлена вверх. Её повернули на четверть оборота по часовой стрелке. Куда она смотрит?','Вправо',['Влево','Вниз','Вверх'],'Четверть полного оборота — 90°. Поворот от направления вверх по часовой стрелке ведёт вправо.'],
  ['spatial','Ты смотришь на север. Поворачиваешь направо, затем ещё раз направо. Куда ты смотришь?','На юг',['На север','На восток','На запад'],'Два правых поворота по 90° дают разворот на 180°: с севера на юг.'],
  ['spatial','У какой объёмной фигуры нет вершин и рёбер?','У шара',['У куба','У пирамиды','У призмы'],'Поверхность шара гладкая: у него нет плоских граней, рёбер и вершин.'],
  ['spatial','Какой вид сверху имеет цилиндр, стоящий на круглом основании?','Круг',['Квадрат','Треугольник','Пятиугольник'],'Сверху видна форма круглого основания цилиндра.'],
  ['spatial','В квадратной сетке 3 × 3 центральную клетку закрасили. Сколько клеток соприкасаются с ней стороной?','4',['3','5','8'],'Стороной соприкасаются клетки сверху, снизу, слева и справа. Диагональные клетки соприкасаются только углом.'],
  ['spatial','Сколько осей симметрии у квадрата?','4',['1','2','3'],'Две оси проходят через середины противоположных сторон, ещё две — по диагоналям.'],
  ['spatial','У какого многоугольника число диагоналей равно двум?','У четырёхугольника',['У треугольника','У пятиугольника','У шестиугольника'],'У четырёхугольника две пары несоседних вершин, значит две диагонали.'],
  ['spatial','Ты прошёл 3 шага на восток, 2 на север и 3 на запад. Где ты относительно старта?','На 2 шага севернее',['На 2 шага южнее','На 6 шагов восточнее','В точке старта'],'Движения на восток и запад взаимно сокращаются. Остаётся смещение на два шага к северу.'],
  ['analogy','Книга относится к чтению как вилка к чему?','Еде',['Письму','Огню','Бегу'],'Книга служит для чтения, вилка — для еды: связь предмета с назначением.'],
  ['analogy','«Ночь — день». Подбери такую же связь для слова «холод».','Тепло',['Снег','Зима','Лёд'],'В обеих парах слова обозначают противоположности.'],
  ['analogy','«Птица — гнездо». Какая пара построена так же?','Пчела — улей',['Рыба — плавник','Кошка — хвост','Дерево — лист'],'Это пары животного и его жилища. Улей является жилищем пчёл.'],
  ['analogy','«Часы — время». Продолжи: «Термометр — …»','Температура',['Скорость','Расстояние','Масса'],'Связь прибора и измеряемой величины: часы измеряют время, термометр — температуру.'],
  ['analogy','«Семя — растение». Какая пара передаёт развитие так же?','Яйцо — птица',['Лист — дерево','Крыло — самолёт','Вода — стакан'],'Из семени развивается растение, из яйца — птица. Это связь начальной стадии и организма.'],
  ['analogy','«Перчатка — рука». Подбери аналогию.','Носок — нога',['Шапка — шкаф','Кольцо — коробка','Ремень — пряжка'],'Перчатку надевают на руку, носок — на ногу.'],
  ['analogy','«Страница — книга». Какая пара устроена так же?','Кадр — фильм',['Автор — роман','Карандаш — бумага','Читатель — библиотека'],'Страница составляет часть книги, кадр — часть фильма.'],
  ['analogy','«Писатель — роман». Продолжи: «Композитор — …»','Симфония',['Кисть','Здание','Телескоп'],'Связь создателя и произведения: писатель пишет роман, композитор сочиняет симфонию.'],
  ['analogy','«Корень — дерево». Подбери пару с такой же связью части и целого.','Фундамент — дом',['Окно — стекло','Река — вода','Птица — крыло'],'Корень является основанием дерева, фундамент — основанием дома.'],
  ['analogy','«Шёпот — крик». Какая пара так же противопоставлена по силе?','Ветерок — ураган',['Утро — рассвет','Дождь — зонт','Море — берег'],'Шёпот и крик различаются силой звука, ветерок и ураган — силой ветра.'],
  ['analogy','«Минуты — час». Какую пару можно построить так же?','Сантиметры — метр',['Весы — килограмм','Часы — стрелка','Литр — вода'],'Это меньшие единицы измерения, из которых состоит большая единица той же величины.'],
  ['analogy','«Ножницы — резать». Продолжи: «Клей — …»','Соединять',['Измерять','Освещать','Нагревать'],'Это связь инструмента или материала с его основным действием. Клей соединяет поверхности.'],
  ['verbal','Что лишнее по признаку «плоская фигура»?','Куб',['Треугольник','Квадрат','Круг'],'Куб — объёмная фигура, остальные три — плоские.'],
  ['verbal','Какое слово не обозначает единицу времени?','Метр',['Секунда','Час','Сутки'],'Метр измеряет длину. Секунда, час и сутки измеряют время.'],
  ['verbal','Что лишнее среди музыкальных инструментов?','Мольберт',['Скрипка','Флейта','Барабан'],'Мольберт используют для рисования, остальные предметы — музыкальные инструменты.'],
  ['verbal','Какое слово противоположно слову «щедрый»?','Скупой',['Добрый','Открытый','Весёлый'],'Щедрый охотно делится, скупой неохотно расстаётся со своим. Это антонимы.'],
  ['verbal','Какое слово ближе всего по смыслу к слову «лаконичный»?','Краткий',['Шумный','Сложный','Медленный'],'Лаконичная речь выражает мысль кратко, без лишних слов.'],
  ['verbal','В какой паре слова близки по смыслу?','Смелый — храбрый',['Тихий — громкий','Высокий — низкий','Узкий — широкий'],'Смелый и храбрый — синонимы. Остальные пары состоят из противоположностей.'],
  ['verbal','Какое явление не является видом атмосферных осадков?','Радуга',['Дождь','Снег','Град'],'Дождь, снег и град выпадают из облаков. Радуга — оптическое явление, а не осадки.'],
  ['verbal','Какая последовательность расположена от общего понятия к частному?','Животное → птица → воробей',['Воробей → животное → птица','Птица → воробей → животное','Животное → воробей → птица'],'Птицы — группа животных, воробей — один из видов птиц.'],
  ['verbal','Какое из слов читается одинаково слева направо и справа налево?','Топот',['Топор','Поток','Рокот'],'ТОПОТ при обратном чтении остаётся тем же словом. Такой порядок букв называется палиндромом.'],
  ['verbal','Какое слово можно составить из всех букв слова «ЛИПА», используя каждую один раз?','Пила',['Лапа','Лиса','Пыль'],'В словах ЛИПА и ПИЛА по одной букве Л, И, П и А.'],
  ['attention','Сколько букв «о» в слове «молоко»?','3',['1','2','4'],'М-О-Л-О-К-О: буква «о» встречается три раза.'],
  ['attention','Сколько месяцев в обычном году содержат хотя бы 28 дней?','12',['1','2','11'],'В каждом месяце есть как минимум 28 дней, не только в феврале.'],
  ['attention','Сколько раз цифра 1 встречается в записи числа 11121?','4',['2','3','5'],'Цифра 1 стоит на первом, втором, третьем и пятом местах: всего четыре раза.'],
  ['attention','В корзине три яблока. Ты взял два. Сколько яблок теперь у тебя?','2',['1','3','5'],'Спрашивается количество яблок у тебя, а не в корзине. Ты взял два.'],
  ['attention','Какое число находится ровно посередине между 18 и 30?','24',['22','23','26'],'Середина равна среднему арифметическому: (18 + 30) / 2 = 24.'],
  ['attention','В слове «КОМПАС» поменяли местами первую и последнюю буквы. Какое сочетание получилось?','СОМПАК',['КОМПАС','САМПОК','СОКПАМ'],'Меняются только К и С. Остальные буквы сохраняют свои места: СОМПАК.']
 ];
 authored.forEach(([family,q,a,w,e],i)=>add('authored-'+(i+1),family,q,a,w,e));
 const days=['понедельник','вторник','среда','четверг','пятница','суббота','воскресенье'];
 for(let n=2;n<=21;n++){
  const d=n%5+2;
  numeric('linear-'+n,'sequence-linear',`Продолжи ряд: ${n}, ${n+d}, ${n+2*d}, ${n+3*d}, …`,n+4*d,`Каждый следующий член больше предыдущего на ${d}: ${n+3*d} + ${d} = ${n+4*d}.`,[n+3*d+1,n+5*d,n+3*d]);
  numeric('gaps-'+n,'sequence-gaps',`Продолжи ряд: ${n}, ${n+2}, ${n+6}, ${n+12}, …`,n+20,`Прибавления растут на два: +2, +4, +6, затем +8. Поэтому ${n+12} + 8 = ${n+20}.`,[n+18,n+22,n+24]);
  numeric('alternate-'+n,'sequence-alternating',`Продолжи ряд: ${n}, ${n+3}, ${2*n+6}, ${2*n+9}, ${4*n+18}, …`,4*n+21,`Чередуются операции +3 и ×2. Последней была ×2, поэтому теперь ${4*n+18} + 3 = ${4*n+21}.`,[8*n+36,4*n+24,4*n+19]);
  numeric('sum-'+n,'sequence-sum',`Продолжи ряд: ${n}, ${n+1}, ${2*n+1}, ${3*n+2}, ${5*n+3}, …`,8*n+5,`Начиная с третьего, каждый член равен сумме двух предыдущих: ${3*n+2} + ${5*n+3} = ${8*n+5}.`,[5*n+4,8*n+3,10*n+6]);
  const x=n+2,total=x*3+6;
  numeric('reverse-'+n,'reverse-arithmetic',`Число умножили на 3, затем прибавили 6 и получили ${total}. Какое число задумали?`,x,`Выполняем обратные действия в обратном порядке: (${total} − 6) / 3 = ${x}.`,[total/3,x+3,total-6]);
  numeric('balance-'+n,'equations',`Два одинаковых блокнота и ручка за 7 ₽ стоят ${2*n+7} ₽. Сколько стоит один блокнот?`,n,`Вычитаем стоимость ручки и делим оставшуюся сумму на два: (${2*n+7} − 7) / 2 = ${n} ₽.`,[2*n,n+7,2*n+7]);
  numeric('proportion-'+n,'proportions',`Для ${n} порций нужно ${n*3} ложек крупы. Сколько ложек нужно для ${n+2} порций при том же рецепте?`,3*(n+2),`На порцию приходится ${n*3} / ${n} = 3 ложки. Для ${n+2} порций нужно 3 × ${n+2} = ${3*(n+2)}.`,[3*n+2,3*n+3,3*n+9]);
  numeric('percent-'+n,'percentages',`Товар стоил ${n*100} ₽. Цену снизили на 10%. Сколько он стоит теперь?`,n*90,`Десять процентов от ${n*100} ₽ — это ${n*10} ₽. Новая цена: ${n*100} − ${n*10} = ${n*90} ₽.`,[n*10,n*110,n*99]);
  numeric('average-'+n,'averages',`Среднее арифметическое трёх чисел равно ${n+5}. Два из них — ${n} и ${n+4}. Чему равно третье?`,n+11,`Сумма трёх чисел равна 3 × ${n+5} = ${3*n+15}. Вычитаем известные: ${3*n+15} − ${n} − ${n+4} = ${n+11}.`,[n+5,n+9,n+15]);
  numeric('overlap-'+n,'sets',`В группе ${n+5} человек любят чай, ${n+2} — кофе, а ${n} — оба напитка. Сколько человек любят хотя бы один из этих напитков?`,n+7,`Складываем две группы и один раз вычитаем тех, кого посчитали дважды: ${n+5} + ${n+2} − ${n} = ${n+7}.`,[2*n+7,n+5,3*n+7]);
  numeric('pigeonhole-'+n,'guarantees',`В мешке жетоны ${n} разных цветов, каждого цвета очень много. Сколько жетонов нужно взять вслепую, чтобы гарантированно получить два одного цвета?`,n+1,`Первые ${n} жетонов могут быть разных цветов. Следующий обязательно совпадёт по цвету с одним из них: ${n} + 1 = ${n+1}.`,[n,2*n,n+2]);
  const people=n+1,pairs=people*(people-1)/2;
  numeric('pairs-'+n,'combinations',`На встрече ${people} человек. Каждый пожал руку каждому другому ровно один раз. Сколько было рукопожатий?`,pairs,`Каждый из ${people} человек имеет ${people-1} партнёров, но каждая пара посчитана дважды: ${people} × ${people-1} / 2 = ${pairs}.`,[people*(people-1),people,pairs+people]);
  const day=n%7,shift=n+5,target=(day+shift)%7;
  add('weekday-'+n,'calendar',`Сегодня ${days[day]}. Какой день недели будет через ${shift} суток?`,days[target],[days[(target+1)%7],days[(target+6)%7],days[(target+3)%7]],`Полные недели не меняют день недели. Остаток от деления ${shift} на 7 равен ${shift%7}; отсчитываем столько дней от дня «${days[day]}».`);
  const startHour=8+n%8,startMinute=n*2,duration=35+n,endMinutes=startHour*60+startMinute+duration;
  const clock=m=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0');
  add('time-'+n,'time',`Занятие началось в ${clock(startHour*60+startMinute)} и длилось ${duration} минут. В какое время оно закончилось?`,clock(endMinutes),[clock(endMinutes+10),clock(endMinutes-10),clock(endMinutes+60)],`К началу прибавляем ${duration} минут. Если минут набралось 60 или больше, переносим целый час. Получаем ${clock(endMinutes)}.`);
  numeric('rectangle-'+n,'perimeters',`Прямоугольник имеет стороны ${n} см и ${n+3} см. Чему равен его периметр в сантиметрах?`,4*n+6,`У прямоугольника две стороны каждой длины: 2 × (${n} + ${n+3}) = ${4*n+6} см.`,[2*n+3,n*(n+3),4*n+3]);
  numeric('tiles-'+n,'areas',`Прямоугольный пол ${n} м на ${n+1} м покрывают квадратными плитками 1 м × 1 м без зазоров. Сколько плиток нужно?`,n*(n+1),`В каждом из ${n} рядов помещается ${n+1} плиток. Всего ${n} × ${n+1} = ${n*(n+1)} плиток.`,[2*n+1,2*(2*n+1),n*n]);
  numeric('grid-'+n,'counting-shapes',`На листе сетка из 2 строк и ${n} столбцов одинаковых квадратных клеток. Сколько всего квадратов видно, включая составленные из клеток?`,3*n-1,`Маленьких квадратов 2 × ${n} = ${2*n}. Квадратов 2 × 2 — ${n-1}. Более крупные не помещаются: всего ${2*n} + ${n-1} = ${3*n-1}.`,[2*n,3*n,2*n+1]);
  const cube=n+1,inner=(cube-2)**3;
  numeric('cube-'+n,'painted-cubes',`Куб ${cube} × ${cube} × ${cube} из единичных кубиков покрасили снаружи со всех сторон и разобрали. Сколько маленьких кубиков не окрашено?`,inner,`Неокрашенные кубики образуют внутренний куб: убираем по одному слою с каждой стороны. (${cube} − 2)³ = ${inner}.`,[cube**3,(cube-1)**3,(cube-2)**2]);
  const speed=n+3,hours=n%3+2;
  numeric('speed-'+n,'motion',`Путешественник шёл ${hours} ч со скоростью ${speed} км/ч без остановок. Сколько километров он прошёл?`,speed*hours,`Расстояние равно скорости, умноженной на время: ${speed} × ${hours} = ${speed*hours} км.`,[speed+hours,speed*(hours+1),speed*(hours-1)]);
  const digit=n%9+1,number=1000*digit+100*(n%10)+10*digit+(n+3)%10;
  numeric('digits-'+n,'digit-attention',`Чему равна сумма цифр числа ${number}?`,String(number).split('').reduce((a,b)=>a+Number(b),0),`Складываем именно цифры: ${String(number).split('').join(' + ')} = ${String(number).split('').reduce((a,b)=>a+Number(b),0)}.`);
 }
 return bank;
})();
const thinkingMemory=new Map();
function shuffleThinking(items){
 const result=items.slice();
 for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}
 return result;
}
function nextThinkingQuestion(){
 const stored=read('thinking-history',thinkingMemory.get(actor())||{});
 const validIds=new Set(PUZZLES.map(p=>p[4].id));
 const seen=new Set((Array.isArray(stored?.seen)?stored.seen:[]).filter(id=>validIds.has(id)));
 let candidates=PUZZLES.map((_,i)=>i).filter(i=>!seen.has(PUZZLES[i][4].id));
 if(!candidates.length){seen.clear();candidates=PUZZLES.map((_,i)=>i)}
 // A cycle can end halfway through a session; keep this session unique too.
 const inSession=new Set(think.order);
 const fresh=candidates.filter(i=>!inSession.has(i)&&PUZZLES[i][4].id!==stored?.last);
 if(fresh.length)candidates=fresh;
 const sessionFamilies=new Set(think.order.map(i=>PUZZLES[i][4].family));
 const recent=Array.isArray(stored?.recent)?stored.recent.slice(-2):[];
 const diverse=candidates.filter(i=>!sessionFamilies.has(PUZZLES[i][4].family)&&!recent.includes(PUZZLES[i][4].family));
 const spaced=candidates.filter(i=>!recent.includes(PUZZLES[i][4].family));
 if(diverse.length)candidates=diverse;else if(spaced.length)candidates=spaced;
 const families=[...new Set(candidates.map(i=>PUZZLES[i][4].family))];
 const family=families[Math.floor(Math.random()*families.length)];
 const group=candidates.filter(i=>PUZZLES[i][4].family===family);
 const index=group[Math.floor(Math.random()*group.length)],puzzle=PUZZLES[index];
 seen.add(puzzle[4].id);
 const history={seen:[...seen],last:puzzle[4].id,recent:[...recent,puzzle[4].family].slice(-2)};
 thinkingMemory.set(actor(),history);write('thinking-history',history);
 think.order.push(index);
 const positions=shuffleThinking([0,1,2,3]);
 think.questions.push([puzzle[0],positions.map(i=>puzzle[1][i]),positions.indexOf(puzzle[2]),puzzle[3]]);
}
function renderThinking(){
 g().header('Тренировка мышления','Логика · закономерности · внимательность');
 const t=think;
 if(t.index>=10){
  const previous=read('thinking-record',{best:0,plays:0});
  if(!t.saved){write('thinking-record',{best:Math.max(previous.best,t.score),plays:previous.plays+1});t.saved=true}
  g().section('<div class="rudi-game-result"><span>Результат</span><strong>'+t.score+' / 10</strong><p>Тренировка завершена. В следующей — новые задачи.</p>'+
   '<button type="button" class="rudi-game-primary" data-extra-action="think-restart">Ещё 10 задач</button></div>');
  return;
 }
 if(!t.questions[t.index])nextThinkingQuestion();
 const [q,options,correct,explanation]=t.questions[t.index];
 g().section('<div class="rudi-game-work rudi-thinking-work"><small>Задание '+(t.index+1)+' из 10 · Верно: '+t.score+'</small><h2>'+safe(q)+'</h2>'+
  '<div class="rudi-quiz-options">'+options.map((o,i)=>
   '<button type="button" data-think-answer="'+i+'" '+(t.answered?'disabled':'')+' class="'+
   (t.answered?(i===correct?'correct':i===t.choice?'wrong':''):'')+'">'+safe(o)+'</button>').join('')+'</div>'+
  (t.answered?'<p class="rudi-thinking-explanation">'+safe(explanation)+'</p><button type="button" class="rudi-game-primary" data-extra-action="think-next">Дальше</button>':'')+
  '</div>');
}
function startThinking(){
 activeGame='thinking';g().setMode('thinking');
 think={order:[],questions:[],index:0,score:0,answered:false,choice:-1,saved:false};renderThinking();
}
function thinkAnswer(i){
 if(activeGame!=='thinking'||think?.answered||think?.index>=10)return;
 if(!Number.isInteger(i)||i<0||i>=4)return;
 think.answered=true;think.choice=i;
 if(i===think.questions[think.index][2])think.score++;
 renderThinking();
}
function openGame(game){
 stop();
 if(game==='battleship')startBattle();
 if(game==='word')startWord();
 if(game==='thinking')startThinking();
}
function onClick(e){
 const sound=e.target.closest('[data-battle-sound]');
 if(sound){battleSoundEnabled=!battleSoundEnabled;write('battle-sound-enabled',battleSoundEnabled);renderBattle();return true}
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
