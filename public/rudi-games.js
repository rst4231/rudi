/* RUDI v4.212: offline personal cognitive and finance trainers. No real money. */
(()=>{'use strict';
const QUIZ=[
 ['Что лучше снижает риск потери всех инвестиций?',['Одна акция','Диверсификация','Кредитное плечо'],'Диверсификация распределяет риск между активами.',1],
 ['Что означает инфляция?',['Рост покупательной способности','Рост общего уровня цен','Гарантированный рост доходов'],'При инфляции на те же деньги в среднем можно купить меньше.',1],
 ['Зачем нужен финансовый резерв?',['Для спекуляций','Для непредвиденных расходов','Для повышения кредитного лимита'],'Резерв помогает пережить потерю дохода и неожиданные траты.',1],
 ['Что обычно наиболее ликвидно?',['Деньги на доступном счёте','Земельный участок','Редкая картина'],'Ликвидность означает возможность быстро получить деньги без существенной потери стоимости.',0],
 ['Что такое сложный процент?',['Процент только на первоначальную сумму','Процент на сумму с уже начисленными процентами','Скрытая комиссия'],'Сложный процент работает, когда доход тоже начинает приносить доход.',1],
 ['Почему высокая доходность не гарантирована?',['Потому что рынок всегда растёт','Потому что доход зависит от риска и условий','Потому что инфляции нет'],'У потенциально высокой доходности обычно есть неопределённость и риск убытков.',1],
 ['Что сначала стоит проверить у кредита?',['Полную стоимость кредита','Цвет карты','Размер рекламного баннера'],'Полная стоимость включает не только рекламную процентную ставку.',0],
 ['Какие расходы легче всего контролировать?',['Те, которые записываются и анализируются','Только наличные','Только подписки'],'Учёт даёт основу для осмысленных решений.',0],
 ['Почему опасно инвестировать весь резерв?',['Он перестаёт быть доступным в нужный момент','Любая инвестиция незаконна','Резерв обязательно обесценится за день'],'Экстренные деньги должны оставаться доступными.',0],
 ['Что такое реальная доходность?',['Номинальная доходность с учётом инфляции','Любые дивиденды','Размер вклада'],'Сравнивай результат с ростом цен и издержками.',0],
 ['Что такое просадка портфеля?',['Снижение стоимости относительно предыдущего пика','Комиссия банка','Рост номинального капитала'],'Просадка показывает глубину временного или постоянного падения капитала.',0],
 ['Когда стоит сравнивать инвестиции?',['С учётом риска, горизонта и комиссий','Только по доходности прошлого года','Только по рекламе'],'Горизонт, риск и комиссии влияют на итоговый результат.',0]
];
const $=id=>document.getElementById(id);
const safe=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Math.round(n).toLocaleString('ru-RU')+' ₽';
const actor=()=>document.body?.dataset?.rudiActor==='Диана'?'Диана':'Рустам';
const storageKey=()=> 'rudi-games-v1:'+actor();
let page=null,mode='home',memoryTimer=null,level=1,sequence='',quiz=[],index=0,correct=0,answered=false,
 cash=100000,units=0,price=100,previousPrice=100,round=0,history=[],
 duelCells=Array(9).fill(''),duelTurn='Рустам',duelWinner='',duelWins=[],duelDone=false;
function stats(){try{const v=JSON.parse(localStorage.getItem(storageKey())||'{}');return {memory:Number(v.memory)||0,quiz:Number(v.quiz)||0,market:Number.isFinite(Number(v.market))?Number(v.market):-100,sessions:Number(v.sessions)||0}}catch{return {memory:0,quiz:0,market:-100,sessions:0}}}
function save(patch){const data={...stats(),...patch};try{localStorage.setItem(storageKey(),JSON.stringify(data))}catch{}return data}
function haptic(){try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch{}}
function header(title,subtitle=''){
 $('rudiGamesTitle').textContent=title;
 $('rudiGamesSubtitle').textContent=subtitle;
}
function section(html){$('rudiGamesContent').innerHTML=html}
function menu(){
 mode='home';clearTimeout(memoryTimer);memoryTimer=null;
 header('Игры и тренажёры','Короткая тренировка каждый день');
 const s=stats();
 section('<div class="rudi-game-hero"><span class="rudi-games-overline">Прокачай мозг</span><h2>5 минут для себя</h2><p>Без регистрации, без рекламы и без реальных денег. Результаты хранятся на этом устройстве.</p></div>'+
  '<div class="rudi-games-stats"><div><small>Память</small><strong>'+s.memory+' ур.</strong></div><div><small>Викторина</small><strong>'+s.quiz+'/10</strong></div><div><small>Симулятор</small><strong>'+(s.market===-100?'—':(s.market>=0?'+':'')+s.market+'%')+'</strong></div></div>'+
  '<div class="rudi-games-list">'+
  '<button data-rudi-game="memory" class="rudi-game-card"><span class="rudi-game-glyph">◎</span><span><b>Тренировка памяти</b><small>Запомни последовательность цифр. С каждым раундом сложнее.</small></span><span class="rudi-game-arrow">›</span></button>'+
  '<button data-rudi-game="quiz" class="rudi-game-card"><span class="rudi-game-glyph">?</span><span><b>Финансовая викторина</b><small>10 вопросов на риск, бюджет и инвестиции.</small></span><span class="rudi-game-arrow">›</span></button>'+
  '<button data-rudi-game="market" class="rudi-game-card"><span class="rudi-game-glyph">↗</span><span><b>Симулятор рынка</b><small>8 ходов, 100 000 виртуальных рублей и случайные колебания.</small></span><span class="rudi-game-arrow">›</span></button>'+
  '<button data-rudi-game="duel" class="rudi-game-card"><span class="rudi-game-glyph">×○</span><span><b>Крестики-нолики на двоих</b><small>Рустам против Дианы · один телефон · счёт побед</small></span><span class="rudi-game-arrow">›</span></button>'+
  '</div>');
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
function quizStart(){
 mode='quiz';correct=0;index=0;answered=false;
 quiz=[...QUIZ].sort(()=>Math.random()-.5).slice(0,10);
 quizRender();
}
function quizRender(){
 if(index>=quiz.length){
   const s=stats();save({quiz:Math.max(s.quiz,correct),sessions:s.sessions+1});
   header('Викторина','Готово');
   section('<div class="rudi-game-result"><span>Результат</span><strong>'+correct+' / '+quiz.length+'</strong><p>'+(correct>=8?'Отличное понимание основ.':'Есть что потренировать. Попробуй ещё раз.')+'</p><button class="rudi-game-primary" data-rudi-game="quiz">Повторить</button></div>');return;
 }
 answered=false;const [q,answers]=quiz[index];
 header('Финансовая викторина',(index+1)+' из '+quiz.length);
 section('<div class="rudi-game-work"><div class="rudi-games-progress"><i style="width:'+((index+1)/quiz.length*100)+'%"></i></div><h2>'+safe(q)+'</h2><div class="rudi-quiz-options">'+answers.map((a,i)=>'<button type="button" data-quiz-answer="'+i+'">'+safe(a)+'</button>').join('')+'</div><p id="rudiQuizExplanation" class="rudi-game-hint" role="status"></p><button id="rudiQuizNext" class="rudi-game-primary" hidden>Дальше</button></div>');
 $('rudiQuizNext').addEventListener('click',()=>{index++;quizRender()});
}
function quizAnswer(choice){
 if(mode!=='quiz'||answered)return;answered=true;
 const [q,answers,explanation,answer]=quiz[index];if(choice===answer)correct++;
 document.querySelectorAll('#rudiGamesPage [data-quiz-answer]').forEach(btn=>{
   const idx=Number(btn.dataset.quizAnswer);btn.disabled=true;
   if(idx===answer)btn.classList.add('correct');
   else if(idx===choice)btn.classList.add('wrong');
 });
 $('rudiQuizExplanation').textContent=(choice===answer?'Верно. ':'Неверно. ')+explanation;
 $('rudiQuizNext').hidden=false;
 $('rudiQuizNext').textContent=index+1>=quiz.length?'Результат':'Следующий вопрос';
}
function marketStart(){
 mode='market';cash=100000;units=0;price=100;previousPrice=100;round=0;history=[100000];marketRender();
}
function marketValue(){return cash+units*price}
function marketRender(){
 header('Симулятор рынка','Виртуальная тренировка, не прогноз');
 const change=round===0?0:(price/previousPrice-1)*100;
 section('<div class="rudi-game-work"><div class="rudi-market-head"><span>Ход '+(round+1)+' / 8</span><small>Цены меняются случайно</small></div>'+
 '<div class="rudi-market-price"><small>Цена актива</small><strong>'+price.toFixed(2)+' ₽</strong><span class="'+(change>=0?'gain':'loss')+'">'+(change>=0?'+':'')+change.toFixed(1)+'%</span></div>'+
 '<div class="rudi-games-stats"><div><small>Портфель</small><strong>'+money(marketValue())+'</strong></div><div><small>Деньги</small><strong>'+money(cash)+'</strong></div><div><small>Актив</small><strong>'+units.toFixed(1)+'</strong></div></div>'+
 '<div class="rudi-market-actions"><button type="button" data-market-action="buy" '+(cash<price?'disabled':'')+'>Купить 25%</button><button type="button" data-market-action="hold">Держать</button><button type="button" data-market-action="sell" '+(units<=0?'disabled':'')+'>Продать 25%</button></div>'+
 '<p class="rudi-game-hint">Это учебная игра. Реальные деньги и инвестиции не используются.</p></div>');
}
function marketAction(action){
 if(mode!=='market'||round>=8)return;
 if(action==='buy'){const spend=Math.min(cash,Math.max(0,cash*.25));units+=spend/price;cash-=spend}
 if(action==='sell'){const qty=units*.25;cash+=qty*price;units-=qty}
 previousPrice=price;
 price=Math.max(2,price*(1+(Math.random()-.5)*.19));
 round++;history.push(marketValue());
 if(round>=8){
   const roi=Math.round((marketValue()/100000-1)*1000)/10;
   const s=stats();save({market:Math.max(s.market,roi),sessions:s.sessions+1});
   header('Симулятор рынка','Итог 8 ходов');
   section('<div class="rudi-game-result"><span>Виртуальный капитал</span><strong>'+money(marketValue())+'</strong><p>Изменение: '+(roi>0?'+':'')+roi.toFixed(1)+'%. Рынок случайный, а прошлый результат ничего не гарантирует.</p><button class="rudi-game-primary" data-rudi-game="market">Сыграть снова</button></div>');
 }else marketRender();
}

const DUEL_LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function duelScore(){
 try{
   const data=JSON.parse(localStorage.getItem('rudi-games-duel-v1')||'{}');
   return {rustam:Math.max(0,Number(data.rustam)||0),diana:Math.max(0,Number(data.diana)||0),
     draws:Math.max(0,Number(data.draws)||0),next:data.next==='Диана'?'Диана':'Рустам'};
 }catch{return {rustam:0,diana:0,draws:0,next:'Рустам'}}
}
function duelSave(score){
 try{localStorage.setItem('rudi-games-duel-v1',JSON.stringify(score))}catch{}
}
function duelStart(){
 mode='duel';clearTimeout(memoryTimer);memoryTimer=null;
 duelCells=Array(9).fill('');duelWinner='';duelWins=[];duelDone=false;
 duelTurn=duelScore().next;duelRender();
}
function duelMove(i){
 if(mode!=='duel'||duelDone||!Number.isInteger(i)||i<0||i>=9||duelCells[i])return;
 const player=duelTurn;duelCells[i]=player==='Рустам'?'X':'O';
 const line=DUEL_LINES.find(indices=>indices.every(index=>duelCells[index]===duelCells[i]));
 if(line){duelWinner=player;duelWins=line;duelDone=true}
 else if(duelCells.every(Boolean)){duelDone=true}
 else {duelTurn=player==='Рустам'?'Диана':'Рустам'}
 if(duelDone){
   const score=duelScore();
   if(duelWinner==='Рустам')score.rustam++;
   else if(duelWinner==='Диана')score.diana++;
   else score.draws++;
   score.next=score.next==='Рустам'?'Диана':'Рустам';
   duelSave(score);
 }
 duelRender();
}
function duelRender(){
 header('Крестики-нолики','Рустам × Диана · на одном телефоне');
 const s=duelScore();
 const status=duelDone
  ?(duelWinner?('Победа: '+duelWinner+'!'):'Ничья!')
  :'Ход: '+duelTurn+' ('+(duelTurn==='Рустам'?'×':'○')+')';
 section('<div class="rudi-game-work rudi-duel-work">'+
  '<div class="rudi-duel-score" aria-label="Счёт партий"><div><small>Рустам ×</small><strong>'+s.rustam+'</strong></div>'+
  '<div><small>Ничьи</small><strong>'+s.draws+'</strong></div>'+
  '<div><small>Диана ○</small><strong>'+s.diana+'</strong></div></div>'+
  '<p class="rudi-duel-status" role="status" aria-live="polite">'+status+'</p>'+
  '<div class="rudi-duel-board" role="group" aria-label="Поле крестики-нолики">'+duelCells.map((mark,i)=>
    '<button type="button" class="rudi-duel-cell'+(duelWins.includes(i)?' is-winning':'')+(mark==='X'?' is-rustam':mark==='O'?' is-diana':'')+'" data-duel-cell="'+i+'" aria-label="Клетка '+(i+1)+': '+(mark==='X'?'Рустам':mark==='O'?'Диана':'пусто')+'"'+(duelDone||mark?' disabled':'')+'>'+(mark==='X'?'×':mark==='O'?'○':'')+'</button>'
   ).join('')+'</div>'+
  '<button type="button" class="rudi-game-primary" data-rudi-game="duel">'+(duelDone?'Ещё партия':'Начать заново')+'</button>'+
  '<p class="rudi-game-hint">Играйте по очереди на одном экране. Победы и ничьи сохраняются на этом устройстве.</p>'+
 '</div>');
}

function open(){
 const active=document.body?.dataset?.rudiActor;
 if(!active)return;
 if(!page)ensurePage();
 page.hidden=false;document.body.classList.add('rudi-games-open');
 window.scrollTo({top:0,behavior:'instant'});menu();haptic();
}
function close(){
 if(!page)return;page.hidden=true;document.body.classList.remove('rudi-games-open');
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
   if(game==='quiz'){quizStart();return}
   if(game==='market'){marketStart();return}
   if(game==='duel'){duelStart();return}
   const cell=e.target.closest('[data-duel-cell]');if(cell){duelMove(Number(cell.dataset.duelCell));return}
   const answer=e.target.closest('[data-quiz-answer]');if(answer){quizAnswer(Number(answer.dataset.quizAnswer));return}
   const action=e.target.closest('[data-market-action]');if(action)marketAction(action.dataset.marketAction);
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
 // Existing quick-access layout owns the button; no extra profile shortcut.
 const old=$('rudiGamesHomeButton');if(old)old.remove();
 const row=document.querySelector('#quickAccessTile .quick-access-actions');
 if(!row||$('quickGamesButton'))return;
 const button=document.createElement('button');button.id='quickGamesButton';button.type='button';
 button.className='quick-access-button is-games';
 button.title='Игры и тренажёры';button.setAttribute('aria-label','Открыть игры и тренажёры');
 button.innerHTML='<span class="quick-access-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 8h9c3 0 4 2.2 4.9 5.5.7 2.5-.4 4.2-2.2 4.2-.9 0-1.8-.5-3.4-2.1H8.2c-1.6 1.6-2.5 2.1-3.4 2.1-1.8 0-2.9-1.7-2.2-4.2C3.5 10.2 4.5 8 7.5 8Z"/><path d="M6.5 11.7h5M9 9.2v5M15.7 11.4h.01M18.1 13.3h.01"/></svg></span><span class="quick-access-copy"><strong>Игры</strong></span>';
 button.addEventListener('click',open);
 row.appendChild(button);
}
document.addEventListener('rudi:home-tiles-ready',ensureShortcut);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureShortcut,{once:true});else ensureShortcut();
window.RudiGames={open,close};
})();
