/* RUDI Finance Decisions UI. Renders only in the existing personal finance panel. */
(()=>{
  'use strict';
  const core=window.RUDI_FINANCE_DECISIONS;
  if(!core)return;
  const rub=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(v))+' ₽':'—';
  const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id=s=>document.getElementById(s);
  const money=v=>Math.max(0,Number(v)||0);
  const nowMoscow=()=>{
    const values=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    return new Date(values.year,values.month-1,values.day,12,0,0);
  };
  let snapshot=null,loadedAt=0,working=false,activeMode='purchase';
  const request=async(operation,payload={})=>{
    try{await window.__rudiTelegramSdkReady}catch(_){}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch('/api/finances',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',signal:controller.signal,body:JSON.stringify({operation,initData:window.Telegram?.WebApp?.initData||'',...payload})});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'finance-unavailable');
      return data;
    }finally{clearTimeout(timer)}
  };
  const list=(items,empty)=>items.length?items.map(x=>'<div class="rudi-decision-item"><div class="rudi-decision-item-title">'+html(x.title)+'</div><p>'+html(x.detail)+'</p></div>').join(''):'<p class="rudi-decision-muted">'+html(empty)+'</p>';
  function mount(){
    const panel=id('financePersonalPanel'),goalCard=id('financeGoalCard');
    if(!panel||!goalCard)return false;
    if(!id('rudiDecisionSuite')){
      const host=document.createElement('div');
      host.id='rudiDecisionSuite';host.className='rudi-decision-suite';
      host.innerHTML=`
        <section class="rudi-decision-card" aria-labelledby="rudiForecastHeading">
          <div class="rudi-decision-head"><h2 id="rudiForecastHeading">Прогноз денег</h2><span>7 / 30 / 90 дней</span></div>
          <div id="rudiForecastTiles" class="rudi-forecast-grid" aria-live="polite"></div>
          <p id="rudiForecastNote" class="rudi-decision-muted"></p>
          <div id="rudiForecastPayments" class="rudi-decision-list"></div>
        </section>
        <section class="rudi-decision-card" aria-labelledby="rudiAlertsHeading">
          <div class="rudi-decision-head"><h2 id="rudiAlertsHeading">Где уходят деньги</h2><span>Автопроверка</span></div>
          <div id="rudiAlertList" class="rudi-decision-list" aria-live="polite"></div>
        </section>
        <section class="rudi-decision-card" aria-labelledby="rudiAdviceHeading">
          <div class="rudi-decision-head"><h2 id="rudiAdviceHeading">Финансовый аналитик 2.0</h2><span>Что сделать</span></div>
          <p class="rudi-decision-muted">Рекомендации обновляются по операциям. AI-анализ ниже по-прежнему доступен раз в сутки.</p>
          <div id="rudiAdviceList" class="rudi-decision-list" aria-live="polite"></div>
        </section>
        <section class="rudi-decision-card" aria-labelledby="rudiScenarioHeading">
          <div class="rudi-decision-head"><h2 id="rudiScenarioHeading">Симулятор решений</h2><span>Сравнение сценариев</span></div>
          <label class="rudi-decision-field">Сценарий
            <select id="rudiScenarioMode" class="finance-select">
              <option value="purchase">Покупка сейчас</option>
              <option value="saving">Копить каждый месяц</option>
              <option value="mortgage">Ипотека или аренда</option>
            </select>
          </label>
          <div id="rudiScenarioFields" class="rudi-scenario-fields"></div>
          <button id="rudiScenarioRun" class="rudi-decision-primary" type="button">Рассчитать</button>
          <div id="rudiScenarioResult" class="rudi-scenario-result" role="status" aria-live="polite" hidden></div>
        </section>`;
      panel.insertBefore(host,goalCard);
      id('rudiScenarioMode')?.addEventListener('change',e=>{activeMode=e.target.value;renderScenarioFields()});
      id('rudiScenarioRun')?.addEventListener('click',runScenario);
      renderScenarioFields();
    }
    if(!id('rudiGoalAdvisor')){
      const adviser=document.createElement('div');adviser.id='rudiGoalAdvisor';adviser.className='rudi-goal-advisor';
      adviser.innerHTML=`
        <div class="rudi-decision-head"><h3>План достижения цели</h3><span>Взносы и резерв</span></div>
        <div class="rudi-scenario-fields">
          <label class="rudi-decision-field">Срок достижения <input type="date" id="rudiGoalDeadline" class="finance-text-input"></label>
          <label class="rudi-decision-field">Откладывать в месяц, ₽ <input type="number" id="rudiGoalMonthly" min="0" max="100000000" inputmode="decimal" class="finance-text-input"></label>
          <label class="rudi-decision-field">Неприкосновенный резерв, ₽ <input type="number" id="rudiGoalReserve" min="0" max="100000000" inputmode="decimal" class="finance-text-input"></label>
        </div>
        <button type="button" id="rudiGoalSave" class="rudi-decision-primary">Сохранить план</button>
        <p id="rudiGoalStatus" class="rudi-decision-muted" role="status" aria-live="polite"></p>
        <div id="rudiGoalSummary" class="rudi-goal-summary"></div>`;
      goalCard.appendChild(adviser);
      id('rudiGoalSave').addEventListener('click',saveGoal);
      ['financeGoalCurrentInput','financeGoalTargetInput','financeGoalTitleInput'].forEach(key=>id(key)?.addEventListener('input',()=>{if(snapshot)renderGoal(true)}));
    }
    return true;
  }
  const field=(key,label,value,step='1')=>'<label class="rudi-decision-field">'+html(label)+'<input class="finance-text-input" id="rudiScenario_'+key+'" type="number" min="0" step="'+step+'" inputmode="decimal" value="'+html(value)+'"></label>';
  function renderScenarioFields(){
    const target=id('rudiScenarioFields');if(!target)return;
    const g=core.goal(snapshot||{},nowMoscow());
    if(activeMode==='purchase')target.innerHTML=field('cost','Стоимость покупки, ₽',50000);
    else if(activeMode==='saving')target.innerHTML=field('cost','Сколько накопить, ₽',g.left||100000)+field('monthly','Откладывать в месяц, ₽',g.monthly||10000);
    else target.innerHTML=field('cost','Стоимость жилья, ₽',6000000)+field('down','Первый взнос, ₽',1500000)+field('rate','Ставка, % годовых',12,'0.01')+field('years','Срок ипотеки, лет',20)+field('rent','Аренда в месяц, ₽',35000)+field('ownership','Содержание жилья в год, ₽',60000);
    const result=id('rudiScenarioResult');if(result)result.hidden=true;
  }
  function runScenario(){
    const values={};id('rudiScenarioFields')?.querySelectorAll('input').forEach(el=>{values[el.id.replace('rudiScenario_','')]=money(el.value)});
    const result=core.simulate(activeMode,values,snapshot||{},nowMoscow()),host=id('rudiScenarioResult');if(!host)return;
    const title=activeMode==='saving'?'Срок накопления':activeMode==='mortgage'?'Платёж и содержание за месяц':'Остаток после покупки';
    const extra=activeMode==='saving'?'Взносы за год: '+rub(result.secondary):activeMode==='mortgage'?'Разница с арендой: '+rub(result.secondary):'Сверх резерва: '+rub(result.secondary);
    host.innerHTML='<strong>'+html(title)+': '+(activeMode==='saving'?(result.main===null?'—':Math.round(result.main)+' мес.'):rub(result.main))+'</strong><p>'+html(extra)+'</p><p>'+html(result.explanation)+'</p>'+(result.warning?'<p class="rudi-decision-warning">'+html(result.warning)+'</p>':'');
    host.hidden=false;
  }
  function renderForecast(){
    const date=nowMoscow(),fs=[7,30,90].map(days=>core.forecast(snapshot,date,days)),tiles=id('rudiForecastTiles'),note=id('rudiForecastNote'),payments=id('rudiForecastPayments');
    if(!tiles)return;
    tiles.innerHTML=fs.map(f=>'<div class="rudi-forecast-tile"><small>Через '+f.days+' дн.</small><strong>'+rub(f.predicted)+'</strong><span>'+(f.estimated?'Оценка по истории':'После известных платежей*')+'</span></div>').join('');
    const f30=fs[1],history=f30.historyMonths;
    const missing=f30.otherCurrencies.length?' Балансы в '+html(f30.otherCurrencies.join(', '))+' не включены: нет надёжного курса.':'';
    note.textContent=(f30.opening===null?'Нет рублёвого кошелька: сначала добавь баланс. ':f30.estimated?'История: '+history+' завершённых мес. Прогноз приблизительный, учитывает историю расходов и доходов, плюс известные обязательства. ':'* Недостаточно истории доходов и расходов для прогноза: учтены только текущий баланс и известные обязательные платежи. ')+' Исторические платежи, не распознанные как обязательные, могут учитываться дважды.'+missing;
    const scheduled=f30.scheduled;
    payments.innerHTML=scheduled.length?'<div class="rudi-decision-item-title">Обязательные платежи в ближайшие 30 дней · '+rub(f30.scheduledTotal)+'</div>'+scheduled.slice(0,5).map(p=>'<div class="rudi-decision-payment"><span>'+html(p.title)+(p.pastDue?' · срок прошёл':'')+'</span><b>'+rub(p.amount)+'</b></div>').join(''):'<p class="rudi-decision-muted">Неоплаченных обязательных платежей на 30 дней не найдено.</p>';
  }
  function renderGoal(useForm=false){
    if(!snapshot)return;
    const plan={...snapshot.plan};
    if(useForm){plan.goalTitle=id('financeGoalTitleInput')?.value||plan.goalTitle;plan.goalCurrent=money(id('financeGoalCurrentInput')?.value??plan.goalCurrent);plan.goalTarget=money(id('financeGoalTargetInput')?.value??plan.goalTarget)}
    const g=core.goal({...snapshot,plan},nowMoscow()),host=id('rudiGoalSummary');if(!host)return;
    const facts=[];
    if(g.left===0&&g.target>0)facts.push('Цель достигнута.');
    else if(g.target>0){
      facts.push('Осталось накопить: '+rub(g.left)+'.');
      if(g.needed!==null)facts.push('Для выбранной даты нужно примерно '+rub(Math.ceil(g.needed))+' в месяц.');
      else if(g.deadline)facts.push('Указанный срок уже прошёл.');
      if(g.timeMonths!==null)facts.push('При текущем взносе: '+g.timeMonths+' мес.');
      else facts.push('Укажи взнос, чтобы рассчитать срок.');
      if(g.feasible===false)facts.push('Взнос превышает историческую разницу доходов и расходов.');
      if(g.safe===false)facts.push('Взнос может затронуть резерв из текущих рублёвых средств.');
    }else facts.push('Задай сумму цели выше, чтобы появился расчёт.');
    host.replaceChildren(...facts.map(t=>{const p=document.createElement('p');p.textContent=t;return p}));
  }
  function render(){
    if(!snapshot||!mount())return;
    renderForecast();
    id('rudiAlertList').innerHTML=list(core.detectIssues(snapshot,nowMoscow()),'Сигналов по текущей истории не найдено. Это не означает, что лишних трат нет.');
    id('rudiAdviceList').innerHTML=list(core.recommendations(snapshot,nowMoscow()),'');
    const g=core.goal(snapshot,nowMoscow());
    if(document.activeElement!==id('rudiGoalDeadline'))id('rudiGoalDeadline').value=g.deadline||'';
    if(document.activeElement!==id('rudiGoalMonthly'))id('rudiGoalMonthly').value=g.monthly||'';
    if(document.activeElement!==id('rudiGoalReserve'))id('rudiGoalReserve').value=g.reserve||'';
    renderGoal(true);
  }
  async function saveGoal(){
    const button=id('rudiGoalSave'),status=id('rudiGoalStatus'),deadline=id('rudiGoalDeadline').value;
    const monthly=Number(id('rudiGoalMonthly').value||0),reserve=Number(id('rudiGoalReserve').value||0);
    if((deadline&&!/^\d{4}-\d{2}-\d{2}$/.test(deadline))||![monthly,reserve].every(v=>Number.isFinite(v)&&v>=0&&v<=100000000)){status.textContent='Проверь дату и суммы.';return}
    button.disabled=true;status.textContent='Сохраняю…';
    try{
      snapshot=await request('save-plan',{goalDeadline:deadline,goalMonthlyContribution:monthly,reserve});
      loadedAt=Date.now();render();document.dispatchEvent(new CustomEvent('rudi-finance-plan-saved'));status.textContent='План сохранён.';
    }catch(_){status.textContent='Не удалось сохранить план. Проверь подключение.'}
    finally{button.disabled=false}
  }
  async function refresh(force=false){
    if(working)return;
    if(!mount())return;
    if(snapshot&&!force&&Date.now()-loadedAt<30000)return;
    working=true;
    try{snapshot=await request('list');loadedAt=Date.now();render()}
    catch(_){id('rudiForecastNote').textContent='Не удалось загрузить финансовые данные. Открой RUDI в Telegram или попробуй позже.'}
    finally{working=false}
  }
  const init=()=>{
    if(!mount())return;
    refresh().catch(()=>{});
    document.addEventListener('click',e=>{
      if(e.target.closest?.('#financeProfileButton,[data-app-tab="finances"],[data-finance-tab="personal"],#financeWalletSaveButton,#financeExpenseComposerSave,#financeIncomeSaveButton,#financeObligationSaveButton'))setTimeout(()=>refresh(true),900);
    },true);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
    document.addEventListener('rudi-finances-updated',event=>{if(event.detail?.plan){snapshot=event.detail;loadedAt=Date.now();render()}});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
