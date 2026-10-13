/* RUDI games: isolated, offline-capable training, no server requests. */
(()=>{'use strict';
const ACTORS=['Рустам','Диана'];
const QUIZ=[
 ['Что в первую очередь защищает от непредвиденных расходов?',['Финансовая подушка','Кредитная карта','Высокорисковый актив'],0,'Резерв на отдельном доступном счёте помогает не продавать инвестиции в неподходящий момент.'],
 ['Что означает диверсификация?',['Покупка одного актива','Распределение денег между разными активами','Постоянная торговля'],1,'Распределение рисков уменьшает зависимость от одного результата.'],
 ['Какой показатель включает риск потерь?',['Историческая доходность','Гарантированная прибыль','Максимальная просадка'],2,'Просадка отражает снижение капитала от предыдущего максимума.'],
 ['Что происходит с покупательной способностью денег при инфляции?',['Снижается','Растёт автоматически','Не меняется'],0,'За ту же сумму при росте цен со временем можно купить меньше.'],
 ['Что обычно выгоднее по потребкредиту?',['Платить только минимум','Сравнить полную стоимость кредита и график выплат','Игнорировать комиссии'],1,'Полная стоимость кредита учитывает больше расходов, чем одна ставка в рекламе.'],
 ['Что из этого НЕ гарантирует доходность?',['Вклад в пределах страхования','Государственно гарантированная выплата','Прошлая доходность фонда'],2,'Результаты прошлого периода не гарантируют будущую прибыль.'],
 ['Что лучше проверить до покупки волатильного актива?',['Риски и размер допустимой потери','Количество подписчиков блогера','Только рост за неделю'],0,'Решение должно учитывать риск, горизонт и способность пережить просадку.'],
 ['Как работает сложный процент?',['Каждый раз на одну начальную сумму','Доход начисляется в том числе на прошлый доход','Не влияет на накопления'],1,'Реинвестированный доход со временем сам начинает приносить доход.'],
 ['В чём риск кредитного плеча?',['Нет комиссий','Цена перестаёт меняться','Убытки тоже увеличиваются'],2,'Плечо усиливает как прибыль, так и убытки, возможна ликвидация.'],
 ['Для короткой финансовой цели обычно важнее всего...',['Сохранность и ликвидность денег','Максимально высокая потенциальная доходность','Неизвестный токен'],0,'Если деньги понадобятся скоро, сильная просадка может сорвать цель.']
];
const $=id=>document.getElementById(id);
let page=null,mode='menu',memory=null,quiz=null,market=null,interval=null;
const actor=()=>ACTORS.includes(document.body?.dataset?.rudiActor)?document.body.dataset.rudiActor:'Рустам';
const key=()=> 'rudi:games:v1:'+actor();
function read(){try{const x=JSON.parse(localStorage.getItem(key())||'{}');return x&&typeof x==='object'?x:{}}catch{return {}}}
function save(patch){const old=read();try{localStorage.setItem(key(),JSON.stringify({...old,...patch}))}catch{}}
function button(label,action,classes=''){return '<button type="button" class="'+classes+'" data-rudi-game-action="'+action+'">'+label+'</button>'}
function mount(){
 if(page)return page;
 page=document.createElement('section');page.id='rudiGamesPage';page.className='rudi-games-page';page.hidden=true;
 page.setAttribute('aria-label','Игры и тренажёры');
 page.innerHTML='<header class="rudi-app-page-head games-head"><button id="rudiGamesBack" class="rudi-app-page-back" type="button" aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><h1>Игры и тренажёры</h1></header><div id="rudiGamesContent" class="games-content" aria-live="polite"></div>';
 document.body.append(page);
 $('rudiGamesBack').addEventListener('click',()=>{if(mode!=='menu')showMenu();else close()});
 page.addEventListener('click',event=>{const el=event.target.closest('[data-rudi-game-action]');if(!el)return;onAction(el.dataset.rudiGameAction)});
 let touch=null;
 page.addEventListener('touchstart',event=>{if(event.touches.length!==1)return;const t=event.touches[0];touch=t.clientX<50?{x:t.clientX,y:t.clientY}:null},{passive:true});
 page.addEventListener('touchend',event=>{if(!touch)return;const t=event.changedTouches[0],s=touch;touch=null;if(t.clientX-s.x>90&&Math.abs(t.clientY-s.y)<60){if(mode==='menu')close();else showMenu()}},{passive:true});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&page&&!page.hidden){if(mode==='menu')close();else showMenu()}});
 return page;
}
function showMenu(){
 mode='menu';if(interval){clearInterval(interval);interval=null}
 const s=read();$('rudiGamesBack').setAttribute('aria-label','На главную');
 $('rudiGamesContent').innerHTML='<p class="games-intro">Тренируй внимание, разбирайся в финансах и пробуй стратегии без риска для настоящих денег.</p>'+
 '<div class="games-overview"><div><small>Лучший результат памяти</small><strong>'+(Number(s.memoryBest)||'—')+'</strong><span>ходов</span></div><div><small>Лучший тест</small><strong>'+(Number.isInteger(s.quizBest)?s.quizBest+'/10':'—')+'</strong><span>правильных</span></div><div><small>Симуляций</small><strong>'+(Number(s.marketRuns)||0)+'</strong><span>завершено</span></div></div>'+
 '<div class="games-select">'+
 '<button data-rudi-game-action="memory" type="button"><span class="games-symbol">▦</span><span><b>Тренировка памяти</b><small>Найди 6 пар. Следи за количеством ходов.</small></span><span class="games-arrow">›</span></button>'+
 '<button data-rudi-game-action="quiz" type="button"><span class="games-symbol">◎</span><span><b>Финансовая викторина</b><small>10 вопросов с объяснениями ответов.</small></span><span class="games-arrow">›</span></button>'+
 '<button data-rudi-game-action="market" type="button"><span class="games-symbol">↗</span><span><b>Симулятор инвестора</b><small>Виртуальные 10 000 $, без реальных сделок.</small></span><span class="games-arrow">›</span></button></div>';
}
function shuffled(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function startMemory(){
 mode='memory';memory={cards:shuffled(['◆','●','▲','★','☀','♥'].flatMap((symbol,id)=>[{symbol,id},{symbol,id}])),open:[],matched:[],moves:0,busy:false,started:Date.now()};
 renderMemory();
}
function renderMemory(){
 if(!memory)return;const done=memory.matched.length===6;
 const cells=memory.cards.map((c,i)=>{const face=memory.open.includes(i)||memory.matched.includes(c.id);return '<button type="button" data-rudi-game-action="flip-'+i+'" class="games-memory-card'+(face?' is-face':'')+(memory.matched.includes(c.id)?' is-matched':'')+'" aria-label="'+(face?c.symbol:'Закрытая карточка')+'" '+(memory.matched.includes(c.id)?'disabled':'')+'>'+ (face?c.symbol:'?') +'</button>'}).join('');
 $('rudiGamesContent').innerHTML='<div class="games-round-head"><span>Память · 6 пар</span><strong>'+memory.moves+' ходов</strong></div><div class="games-memory-board">'+cells+'</div>'+
 (done?'<div class="games-result"><b>Отлично! Все пары найдены</b><span>'+memory.moves+' ходов · '+Math.round((Date.now()-memory.started)/1000)+' сек.</span></div>':'<p class="games-hint">Открывай две карточки и запоминай их положение.</p>')+
 button(done?'Играть ещё':'Перемешать','memory','games-primary');
}
function flip(i){
 if(!memory||memory.busy||memory.matched.length===6||memory.open.includes(i)||memory.matched.includes(memory.cards[i]?.id)||!memory.cards[i])return;
 memory.open.push(i);
 if(memory.open.length===2){
   memory.moves++;
   const [a,b]=memory.open;
   if(memory.cards[a].id===memory.cards[b].id){memory.matched.push(memory.cards[a].id);memory.open=[];if(memory.matched.length===6){const prev=Number(read().memoryBest)||0;if(!prev||memory.moves<prev)save({memoryBest:memory.moves})}}
   else{memory.busy=true;setTimeout(()=>{if(mode!=='memory'||!memory)return;memory.open=[];memory.busy=false;renderMemory()},850)}
 }
 renderMemory();
}
function startQuiz(){mode='quiz';quiz={order:shuffled(QUIZ.map((_,i)=>i)),step:0,correct:0,chosen:null};renderQuiz()}
function renderQuiz(){
 const host=$('rudiGamesContent');if(!quiz)return;
 if(quiz.step>=QUIZ.length){
  const prev=Number.isInteger(read().quizBest)?read().quizBest:-1;if(quiz.correct>prev)save({quizBest:quiz.correct});
  host.innerHTML='<div class="games-result games-quiz-done"><span class="games-big-score">'+quiz.correct+' / 10</span><b>Викторина завершена</b><span>Ответы сопровождаются объяснениями. Попробуй улучшить результат.</span></div>'+button('Пройти заново','quiz','games-primary');return;
 }
 const q=QUIZ[quiz.order[quiz.step]];
 host.innerHTML='<div class="games-round-head"><span>Вопрос '+(quiz.step+1)+' из '+QUIZ.length+'</span><strong>'+quiz.correct+' правильно</strong></div>'+
 '<div class="games-quiz-progress"><i style="width:'+((quiz.step+1)/QUIZ.length*100)+'%"></i></div>'+
 '<h2 class="games-question">'+q[0]+'</h2><div class="games-answers">'+q[1].map((x,i)=>button(x,'answer-'+i,'games-answer'+(quiz.chosen!==null?(i===q[2]?' correct':i===quiz.chosen?' wrong':''):''))).join('')+'</div>'+
 (quiz.chosen!==null?'<p class="games-explanation">'+q[3]+'</p>'+button('Дальше','quiz-next','games-primary'):'');
}
function selectAnswer(i){if(!quiz||quiz.chosen!==null)return;const q=QUIZ[quiz.order[quiz.step]];quiz.chosen=i;if(i===q[2])quiz.correct++;renderQuiz()}
function nextQuiz(){if(!quiz||quiz.chosen===null)return;quiz.step++;quiz.chosen=null;renderQuiz()}
function startMarket(){
 mode='market';
 const scenarios=[{name:'Боковой рынок',drift:0.001,vol:0.046},{name:'Рост с откатами',drift:0.024,vol:0.052},{name:'Падение и восстановление',drift:-0.012,vol:0.061}];
 const scenario=scenarios[Math.floor(Math.random()*scenarios.length)];
 market={price:100,cash:10000,units:0,step:0,peak:10000,drawdown:0,history:[100],scenario,initial:100,actions:[]};
 renderMarket();
}
function renderMarket(){
 if(!market)return;
 const m=market, done=m.step>=12, equity=m.cash+m.units*m.price,pnl=equity-10000;
 const values=m.history, min=Math.min(...values)*.92,max=Math.max(...values)*1.08,points=values.map((v,i)=>(10+i*280/12)+','+(105-(v-min)/(max-min||1)*90)).join(' ');
 $('rudiGamesContent').innerHTML='<div class="games-round-head"><span>Виртуальный рынок · '+Math.min(m.step+1,12)+'/12</span><strong>'+m.scenario.name+'</strong></div>'+
 '<div class="games-market-panel"><small>Стоимость портфеля</small><strong>'+Math.round(equity).toLocaleString('ru-RU')+' $</strong><span class="'+(pnl>=0?'positive':'negative')+'">'+(pnl>=0?'+':'')+Math.round(pnl).toLocaleString('ru-RU')+' $</span><svg viewBox="0 0 300 115" aria-label="Учебный график цены"><polyline points="'+points+'" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="games-market-stats"><span>Цена: '+m.price.toFixed(2)+' $</span><span>Деньги: '+Math.round(m.cash)+' $</span><span>Актив: '+m.units.toFixed(2)+'</span></div></div>'+
 (done?'<div class="games-result"><b>Симуляция завершена</b><span>Результат: '+Math.round(pnl).toLocaleString('ru-RU')+' $ · макс. просадка: '+m.drawdown.toFixed(1)+'%.</span><small>Это учебная модель, а не прогноз рынка.</small></div>'+button('Новая симуляция','market','games-primary')
 :'<p class="games-hint">Выбери действие. Покупка и продажа используют 25% доступных денег или позиции. Затем цена изменится.</p><div class="games-market-actions">'+button('Купить 25%','market-buy')+button('Подождать','market-hold')+button('Продать 25%','market-sell')+'</div>');
}
function marketAct(action){
 const m=market;if(!m||m.step>=12)return;
 if(action==='buy'){const spending=m.cash*.25;m.cash-=spending;m.units+=spending/m.price}
 if(action==='sell'){const amount=m.units*.25;m.units-=amount;m.cash+=amount*m.price}
 const shock=(Math.random()-.5)*2*m.scenario.vol,movement=Math.max(-.16,Math.min(.16,m.scenario.drift+shock));
 m.price=Math.max(1,m.price*(1+movement));m.history.push(m.price);m.step++;
 const equity=m.cash+m.units*m.price;m.peak=Math.max(m.peak,equity);m.drawdown=Math.max(m.drawdown,(m.peak-equity)/m.peak*100);
 if(m.step===12)save({marketRuns:(Number(read().marketRuns)||0)+1,marketLastPnl:Math.round(equity-10000)});
 renderMarket();
}
function onAction(id){
 if(id==='memory')return startMemory();
 if(id==='quiz')return startQuiz();
 if(id==='market')return startMarket();
 if(id.startsWith('flip-'))return flip(Number(id.slice(5)));
 if(id.startsWith('answer-'))return selectAnswer(Number(id.slice(7)));
 if(id==='quiz-next')return nextQuiz();
 if(id.startsWith('market-'))return marketAct(id.slice(7));
}
function open(){
 mount();mode='menu';page.hidden=false;document.body.classList.add('rudi-games-open');showMenu();page.scrollTop=0;
 try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch{}
}
function close(){if(!page)return;page.hidden=true;document.body.classList.remove('rudi-games-open');if(interval){clearInterval(interval);interval=null}memory=null;quiz=null;market=null}
function attach(){
 const controls=document.querySelector('.mood-self-buttons');
 if(!controls||$('rudiGamesOpen'))return;
 const trigger=document.createElement('button');trigger.id='rudiGamesOpen';trigger.className='profile-tool-button partner-mood-value';trigger.type='button';
 trigger.setAttribute('aria-label','Игры и тренажёры');trigger.title='Игры и тренажёры';
 trigger.innerHTML='<span class="mood-emoji" aria-hidden="true">🎮</span>';
 trigger.addEventListener('click',open);controls.appendChild(trigger);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
window.RudiGames={open,close};
})();
