/* RUDI Finance Decisions UI. Renders only in the existing personal finance panel. */
(()=>{
  'use strict';
  const core=window.RUDI_FINANCE_DECISIONS;
  if(!core)return;
  const rub=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(v))+' ₽':'—';
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
  const periodLabel=period=>{
    const to=String(period?.to||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(to))return 'период';
    return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'})
      .format(new Date(to+'T12:00:00Z')).replace(/^\d+/,'1–'+Number(to.slice(8)));
  };
  const renderAlert=issue=>{
    const ctx=currencyContext();
    const dates=[issue.periods.current,issue.periods.previous];
    const buttons=dates.map((period,index)=>{
      const amountRub=index===0?issue.current:issue.previous;
      const name=periodLabel(period);
      return '<button type="button" class="rudi-alert-period" data-alert-category="'+html(issue.categoryId)+
        '" data-alert-from="'+html(period.from)+'" data-alert-to="'+html(period.to)+
        '" aria-label="Открыть расходы за '+html(name)+'"><span>'+html(name)+
        '</span><b>'+html(displayMoney(amountRub,ctx))+'</b></button>';
    }).join('');
    const difference=issue.percent===null
      ?'За прошлый период нет записанных расходов. Процент не рассчитывается.'
      :'Разница: +'+displayMoney(issue.delta,ctx)+' (+'+
        new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(issue.percent)+'%).';
    return '<article class="rudi-decision-item"><div class="rudi-decision-item-title">'+html(issue.title)+
      '</div><div class="rudi-alert-periods">'+buttons+'</div><p>'+html(difference)+
      ' Нажми на период, чтобы открыть операции.</p></article>';
  };
  const list=(items,empty)=>items.length?items.map(x=>x.periods&&x.categoryId?renderAlert(x):
    '<div class="rudi-decision-item"><div class="rudi-decision-item-title">'+html(x.title)+
    '</div><p>'+html(x.detail)+'</p></div>').join(''):
    '<p class="rudi-decision-muted">'+html(empty)+'</p>';
  function mount(){
    const panel=id('financePersonalPanel'),goalCard=id('financeGoalCard');
    if(!panel||!goalCard)return false;
    if(!id('rudiDecisionSuite')){
      const host=document.createElement('div');
      host.id='rudiDecisionSuite';host.className='rudi-decision-suite';
      host.innerHTML=`
        <section class="rudi-decision-card" aria-labelledby="rudiAlertsHeading">
          <details id="rudiAlertsDetails" class="rudi-alert-details">
            <summary class="rudi-decision-head rudi-decision-summary">
              <h2 id="rudiAlertsHeading">Где уходят деньги</h2>
              <span class="finance-collapse-toggle rudi-decision-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
            </summary>
            <div id="rudiAlertList" class="rudi-decision-list" aria-live="polite"></div>
          </details>
        </section>
        <section class="rudi-decision-card" aria-labelledby="rudiScenarioHeading">
          <details id="rudiScenarioDetails" class="rudi-scenario-details">
            <summary class="rudi-scenario-summary">
              <h2 id="rudiScenarioHeading">Симулятор решений</h2>
              <span class="finance-collapse-toggle rudi-decision-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
            </summary>
            <div class="rudi-scenario-body">
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
            </div>
          </details>
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

  const currencyContext=()=>{
    let raw={};
    try{raw=window.RUDI_FINANCE_CURRENCY_CONTEXT?.()||{}}catch(_){}
    const rates=raw.rates&&typeof raw.rates==='object'?raw.rates:{};
    const rate=Number(rates.USD);
    return {displayCurrency:raw.displayCurrency==='USD'?'USD':'RUB',rates,
      usdRate:Number.isFinite(rate)&&rate>0?rate:null};
  };
  const currencyValue=(rubValue,ctx=currencyContext())=>{
    if(rubValue===null||rubValue===undefined||!Number.isFinite(Number(rubValue)))return null;
    return ctx.displayCurrency==='USD'?(ctx.usdRate?Number(rubValue)/ctx.usdRate:null):Number(rubValue);
  };
  const displayMoney=(rubValue,ctx=currencyContext())=>{
    const value=currencyValue(rubValue,ctx);
    if(value===null)return '—';
    return new Intl.NumberFormat('ru-RU',{
      minimumFractionDigits:0,maximumFractionDigits:ctx.displayCurrency==='USD'?2:0
    }).format(value)+(ctx.displayCurrency==='USD'?' $':' ₽');
  };
  const inputCurrency=()=>currencyContext().displayCurrency;
  const monetaryKeys=new Set(['cost','monthly','down','rent','ownership']);
  let scenarioCurrency=null;
  const field=(key,label,value,step='1')=>'<label class="rudi-decision-field">'+html(label)+
    '<input class="finance-text-input" id="rudiScenario_'+key+'" type="number" min="0" step="'+step+
    '" inputmode="decimal" value="'+html(value)+'"></label>';
  const initialDisplay=(rub,ctx)=>currencyValue(rub,ctx)===null?'':Math.round(currencyValue(rub,ctx)*100)/100;
  function renderScenarioFields(existing=null){
    const target=id('rudiScenarioFields');if(!target)return;
    const ctx=currencyContext(),g=core.goal(snapshot||{},nowMoscow(),{rates:ctx.rates});
    scenarioCurrency=ctx.displayCurrency;
    const symbol=ctx.displayCurrency==='USD'?'$':'₽';
    const val=(key,rub)=>existing&&Object.prototype.hasOwnProperty.call(existing,key)?existing[key]:initialDisplay(rub,ctx);
    if(activeMode==='purchase')target.innerHTML=field('cost','Стоимость покупки, '+symbol,val('cost',50000),'0.01');
    else if(activeMode==='saving')target.innerHTML=field('cost','Сколько накопить, '+symbol,val('cost',g.left||100000),'0.01')+
      field('monthly','Откладывать в месяц, '+symbol,val('monthly',g.monthly||10000),'0.01');
    else target.innerHTML=field('cost','Стоимость жилья, '+symbol,val('cost',6000000),'0.01')+
      field('down','Первый взнос, '+symbol,val('down',1500000),'0.01')+
      field('rate','Ставка, % годовых',val('rate',12),'0.01')+
      field('years','Срок ипотеки, лет',val('years',20))+
      field('rent','Аренда в месяц, '+symbol,val('rent',35000),'0.01')+
      field('ownership','Содержание жилья в год, '+symbol,val('ownership',60000),'0.01');
    const result=id('rudiScenarioResult');if(result)result.hidden=true;
  }
  function readScenarioInputs(){
    const values={};
    id('rudiScenarioFields')?.querySelectorAll('input').forEach(el=>{
      values[el.id.replace('rudiScenario_','')]=money(el.value);
    });
    return values;
  }
  function runScenario(){
    const host=id('rudiScenarioResult');if(!host)return;
    const ctx=currencyContext();
    if(ctx.displayCurrency==='USD'&&!ctx.usdRate){
      host.textContent='Не удалось получить курс USD/RUB. Попробуй обновить страницу.';
      host.hidden=false;return;
    }
    const displayed=readScenarioInputs(),values={};
    for(const [key,value]of Object.entries(displayed)){
      values[key]=monetaryKeys.has(key)&&ctx.displayCurrency==='USD'?value*ctx.usdRate:value;
    }
    const r=core.simulate(activeMode,values,snapshot||{},nowMoscow(),{rates:ctx.rates});
    const line=(title,value)=>'<div class="rudi-decision-payment"><span>'+html(title)+
      '</span><b>'+html(value)+'</b></div>';
    let parts='';
    if(activeMode==='purchase'){
      if(r.cash===null){
        parts='<strong>Не удалось рассчитать доступные деньги</strong><p>Проверь наличие курсов для валютных кошельков.</p>';
      }else{
        parts='<strong>'+(r.shortfall>0?'На покупку не хватает '+html(displayMoney(r.shortfall,ctx)):'Покупка доступна')+'</strong>'+
          '<div class="rudi-decision-list">'+
          line('Всего на обычных кошельках',displayMoney(r.cash,ctx))+
          line('Стоимость покупки',displayMoney(r.cost,ctx))+
          (r.shortfall>0?line('Не хватает на покупку',displayMoney(r.shortfall,ctx)):
           line('Останется после покупки',displayMoney(r.remains,ctx)))+
          line('Неприкосновенный резерв по настройкам',displayMoney(r.reserve,ctx))+'</div>';
        if(r.cash-r.cost<r.reserve){
          parts+='<p class="rudi-decision-warning">После покупки остаток будет ниже установленного резерва. Это не задолженность.</p>';
        }else parts+='<p>Резерв сохраняется.</p>';
      }
    }else if(activeMode==='saving'){
      const total=core.forecast(snapshot||{},nowMoscow(),30,{rates:ctx.rates}).opening;
      const goalAmount=values.cost;
      parts='<strong>'+(r.main===null?'Укажи ежемесячный взнос':'Накопишь за '+Math.round(r.main)+' мес.')+'</strong>'+
        '<p>За 12 месяцев отложишь '+html(displayMoney(r.secondary,ctx))+'.</p>';
      if(total===null){
        parts+='<p>Не могу проверить общий баланс: нет курса для одного из кошельков.</p>';
      }else{
        const missing=Math.max(0,goalAmount-total);
        parts+='<div class="rudi-decision-list">'+
          line('На всех обычных кошельках',displayMoney(total,ctx))+
          line('Нужно накопить',displayMoney(goalAmount,ctx))+
          line(missing>0?'Не хватает сейчас':'Денег уже хватает',missing>0?displayMoney(missing,ctx):'Да')+
          '</div>';
      }
      parts+='<p>Без учёта доходности и инфляции. Кредитные счета не включены.</p>';
    }else{
      const delta=Math.abs(r.secondary||0);
      parts='<strong>Ипотека и содержание: '+html(displayMoney(r.main,ctx))+' в месяц</strong>';
      if(r.main!==null){
        parts+='<p>'+(r.secondary>=0?'Дороже аренды на ':'Дешевле аренды на ')+
          html(displayMoney(delta,ctx))+' в месяц.</p>';
      }
      parts+='<p>'+html(r.explanation)+'</p>';
    }
    if(r.warning&&activeMode!=='purchase')parts+='<p class="rudi-decision-warning">'+html(r.warning)+'</p>';
    host.innerHTML=parts;host.hidden=false;
  }
  function syncScenarioCurrency(){
    const next=currencyContext(),from=scenarioCurrency||'RUB';
    if(from===next.displayCurrency)return;
    const current=readScenarioInputs(),updated={};
    for(const [key,value]of Object.entries(current)){
      if(!monetaryKeys.has(key)){updated[key]=value;continue}
      const rub=from==='USD'?value*(next.usdRate||0):value;
      updated[key]=next.displayCurrency==='USD'?
        (next.usdRate?Math.round(rub/next.usdRate*100)/100:''):
        Math.round(rub*100)/100;
    }
    renderScenarioFields(updated);
  }

  function renderGoal(useForm=false){
    if(!snapshot)return;
    const plan={...snapshot.plan};
    if(useForm){plan.goalTitle=id('financeGoalTitleInput')?.value||plan.goalTitle;plan.goalCurrent=money(id('financeGoalCurrentInput')?.value??plan.goalCurrent);plan.goalTarget=money(id('financeGoalTargetInput')?.value??plan.goalTarget)}
    const ctx=currencyContext();
    const g=core.goal({...snapshot,plan},nowMoscow(),{rates:ctx.rates}),host=id('rudiGoalSummary');if(!host)return;
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
    if(g.target>0){
      const total=core.forecast(snapshot,nowMoscow(),30,{rates:ctx.rates}).opening;
      if(total===null)facts.push('Недостаточно курса валют для проверки всех кошельков.');
      else if(total>=g.target)facts.push('С учётом всех обычных кошельков денег на цель уже хватает.');
      else facts.push('С учётом всех обычных кошельков на цель не хватает '+displayMoney(g.target-total,ctx)+'.');
    }
    host.replaceChildren(...facts.map(t=>{const p=document.createElement('p');p.textContent=t;return p}));
  }
  function render(){
    if(!snapshot||!mount())return;
    id('rudiAlertList').innerHTML=list(core.detectIssues(snapshot,nowMoscow()),'Сигналов по текущей истории не найдено. Это не означает, что лишних трат нет.');
    const g=core.goal(snapshot,nowMoscow(),{rates:currencyContext().rates});
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
    catch(_){const host=id('rudiAlertList');if(host)host.textContent='Не удалось загрузить финансовые данные. Открой РуДи в Telegram или попробуй позже.'}
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
    id('rudiAlertList')?.addEventListener('click',event=>{
      const button=event.target.closest?.('button[data-alert-category]');
      if(!button)return;
      document.dispatchEvent(new CustomEvent('rudi-finance-open-category-history',{detail:{
        categoryId:button.dataset.alertCategory,from:button.dataset.alertFrom,to:button.dataset.alertTo
      }}));
    });
    document.addEventListener('rudi-finance-currency-changed',()=>{syncScenarioCurrency();if(snapshot)render()});
    document.addEventListener('rudi-finance-rates-changed',()=>{
      if(snapshot)render();
      const result=id('rudiScenarioResult');
      if(result&&!result.hidden)runScenario();
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
