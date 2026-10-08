/* RUDI Finance Decisions: pure calculations, no network/side effects. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.RUDI_FINANCE_DECISIONS=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400000;
  const money=n=>Math.round((Number(n)||0)*100)/100;
  const num=n=>Number.isFinite(Number(n))?Number(n):0;
  const rows=x=>Array.isArray(x)?x:[];
  const dateKey=d=>{const v=new Date(d);return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0')};
  const monthKey=d=>dateKey(d).slice(0,7);
  const monthDate=(m,d)=>{const [y,mo]=m.split('-').map(Number);return new Date(y,mo-1,Math.min(d,new Date(y,mo,0).getDate()))};
  const monthEndDays=m=>new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate();
  const addMonths=(m,n)=>{const [y,mo]=m.split('-').map(Number);return monthKey(new Date(y,mo-1+n,1))};
  const label=v=>String(v||'').replace(/\s+/g,' ').trim();
  const norm=v=>label(v).toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  const amount=v=>money(v?.rubAmount??v?.amount??0);
  const datesMatch=(a,b,maxDays=4)=>Math.abs(new Date(a).getTime()-new Date(b).getTime())<=maxDays*DAY;
  const monthHistory=(state,now)=>{
    const current=monthKey(now),expenses=rows(state.personalExpenses).filter(x=>!x.manualAdjustment&&x.month<current),incomes=rows(state.walletIncomes).filter(x=>x.month<current);
    const months=[addMonths(current,-1),addMonths(current,-2),addMonths(current,-3)].filter(m=>expenses.some(x=>x.month===m)||incomes.some(x=>x.month===m));
    const e=expenses.filter(x=>months.includes(x.month)),i=incomes.filter(x=>months.includes(x.month));
    const incomeMonths=months.filter(m=>i.some(x=>x.month===m)),expenseMonths=months.filter(m=>e.some(x=>x.month===m));
    const avgIncome=incomeMonths.length?money(i.reduce((s,x)=>s+amount(x),0)/incomeMonths.length):null;
    const categories=new Map(rows(state.categories).map(x=>[String(x.id),label(x.name||x.title||'Другое')]));
    return {months,expenses:e,incomes:i,avgIncome,expenseMonths,categories};
  };
  const obligationsFor=(state,start,horizon)=>{
    const end=new Date(start.getTime()+horizon*DAY),r=[];
    for(const o of rows(state.plan?.obligations)){
      if(o.active===false||num(o.amount)<=0)continue;
      for(let i=0;i<=4;i++){
        const m=addMonths(monthKey(start),i),due=monthDate(m,Math.max(1,num(o.day)||1));
        if(rows(o.paidMonths).includes(m))continue;
        // Current-month unpaid obligations with earlier due dates are still pending.
        const effective=due<start?new Date(start):due;
        if(effective<end)r.push({title:label(o.title),amount:money(o.amount),date:dateKey(effective),pastDue:due<start,month:m,id:String(o.id||'')});
      }
    }
    return r;
  };
  const matchedFixedExpenses=(expenses,obligations)=>{
    const used=new Set();
    for(const expense of expenses){
      const d=new Date(expense.occurredAt||expense.createdAt||'');
      if(Number.isNaN(d.getTime()))continue;
      const hits=rows(obligations).filter(o=>o.active!==false&&Math.abs(amount(expense)-num(o.amount))<=Math.max(2,num(o.amount)*0.01)&&Math.abs(d.getDate()-num(o.day||1))<=4);
      if(hits.some(o=>norm(expense.note).includes(norm(o.title))||hits.length===1))used.add(String(expense.id));
    }
    return used;
  };
  function forecast(state,now,h){
    const accounts=rows(state.wallets).filter(w=>!w.archived&&w.type!=='credit');
    const rub=accounts.filter(w=>w.currency==='RUB'),other=accounts.filter(w=>w.currency!=='RUB');
    const opening=rub.length?money(rub.reduce((s,w)=>s+num(w.balance),0)):null;
    const historical=monthHistory(state,now),obligations=rows(state.plan?.obligations);
    const fixed=matchedFixedExpenses(historical.expenses,obligations);
    const variable=historical.expenses.filter(x=>!fixed.has(String(x.id)));
    const expDays=historical.expenseMonths.reduce((s,m)=>s+monthEndDays(m),0);
    const daily=expDays?money(variable.reduce((s,x)=>s+amount(x),0)/expDays):null;
    const income=historical.avgIncome===null?null:money(historical.avgIncome*h/30.44);
    const outgo=daily===null?null:money(daily*h);
    const scheduled=obligationsFor(state,now,h),scheduledTotal=money(scheduled.reduce((s,x)=>s+x.amount,0));
    const enough=opening!==null&&income!==null&&outgo!==null;
    return {days:h,opening,otherCurrencies:other.map(w=>String(w.currency)).filter((v,i,a)=>a.indexOf(v)===i),dailyVariable:daily,
      estimatedIncome:income,estimatedVariableSpend:outgo,scheduled,scheduledTotal,
      predicted:opening===null?null:enough?money(opening+income-outgo-scheduledTotal):money(opening-scheduledTotal),
      estimated:enough,historyMonths:historical.months.length,
      reserve:Math.max(0,num(state.plan?.reserve)),confidence:enough&&historical.months.length>=2?'medium':'low'};
  }
  const monthlyTotals=(expenses,month)=>{const o=new Map();for(const e of expenses.filter(x=>x.month===month))o.set(String(e.categoryId),money((o.get(String(e.categoryId))||0)+amount(e)));return o};
  function detectIssues(state,now){
    const current=monthKey(now),last=addMonths(current,-1),past=addMonths(current,-2),history=monthHistory(state,now),all=rows(state.personalExpenses).filter(x=>!x.manualAdjustment),alerts=[];
    const curr=monthlyTotals(all,current),prev=monthlyTotals(all,last),old=monthlyTotals(all,past);
    const dayOfMonth=now.getDate(),days=monthEndDays(current);
    if(dayOfMonth>=7)for(const [id,spent]of curr){
      const prior=prev.get(id)||0;
      if(prior<1500)continue;
      const expected=prior*dayOfMonth/days;
      if(spent>expected*1.35&&spent-expected>=1000)alerts.push({kind:'overspend',title:'Рост трат: '+(history.categories.get(id)||'Категория'),detail:'За текущую часть месяца '+Math.round(spent)+' ₽ против '+Math.round(expected)+' ₽ по темпу прошлого.',amount:money(spent-expected),priority:2});
    }
    if(prev.size&&old.size)for(const [id,spent]of prev){
      const prior=old.get(id)||0;if(prior>=2000&&spent>prior*1.3&&spent-prior>=1000)alerts.push({kind:'trend',title:'Расходы растут: '+(history.categories.get(id)||'Категория'),detail:'Прошлый месяц выше предыдущего на '+Math.round(spent-prior)+' ₽.',amount:money(spent-prior),priority:2});
    }
    const seen=new Map(),transactions=all.slice().sort((a,b)=>String(a.occurredAt||'').localeCompare(String(b.occurredAt||'')));
    for(const e of transactions){
      const note=norm(e.note);if(note.length<5||['покупка','оплата','расход','магазин','перевод'].includes(note))continue;
      const d=new Date(e.occurredAt||e.createdAt);if(Number.isNaN(d.getTime()))continue;
      const k=[e.walletId||'',note,amount(e)].join('|'),oldE=seen.get(k);
      if(oldE&&oldE.id!==e.id&&Math.abs(d-oldE.date)<=120000){
        alerts.push({kind:'duplicate',title:'Возможный дубль',detail:label(e.note)+': две похожие операции по '+Math.round(amount(e))+' ₽ в пределах 2 минут. Проверь перед удалением.',amount:0,priority:3});seen.delete(k);
      }else seen.set(k,{id:e.id,date:d});
    }
    const groups=new Map();
    for(const e of all){
      const n=norm(e.note);
      if(n.length<5||['покупка','оплата','расход','магазин'].includes(n)||amount(e)<50)continue;
      const key=n+'|'+String(e.walletId||'');
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(e);
    }
    for(const [key,group]of groups){
      if(group.length<2)continue;
      const sorted=group.slice().sort((a,b)=>String(a.occurredAt||'').localeCompare(String(b.occurredAt||'')));
      let found=null;
      for(let j=1;j<sorted.length;j++){
        const d=(new Date(sorted[j].occurredAt)-new Date(sorted[j-1].occurredAt))/DAY;
        if(d>=26&&d<=36&&Math.abs(amount(sorted[j])-amount(sorted[j-1]))<=Math.max(10,amount(sorted[j-1])*.06)){found=sorted[j];break}
      }
      if(found)alerts.push({kind:'recurring',title:'Возможный регулярный платёж',detail:label(found.note)+' · около '+Math.round(amount(found))+' ₽/мес. Проверь, нужен ли он.',amount:money(amount(found)),priority:1});
    }
    return alerts.sort((a,b)=>b.priority-a.priority||b.amount-a.amount).slice(0,9);
  }
  function goal(state,now){
    const p=state.plan||{},target=Math.max(0,num(p.goalTarget)),current=Math.max(0,num(p.goalCurrent)),left=Math.max(0,target-current);
    const monthly=Math.max(0,num(p.goalMonthlyContribution)),deadline=/^\d{4}-\d{2}-\d{2}$/.test(p.goalDeadline||'')?p.goalDeadline:null;
    let monthsUntil=null,needed=null;
    if(deadline){const end=new Date(deadline+'T12:00:00'),valid=!Number.isNaN(end.getTime());if(valid){monthsUntil=Math.max(0,(end.getFullYear()-now.getFullYear())*12+(end.getMonth()-now.getMonth())+(end.getDate()-now.getDate())/30.44);needed=left===0?0:monthsUntil>0?money(left/monthsUntil):null}}
    const timeMonths=left===0?0:monthly>0?Math.ceil(left/monthly):null;
    const resultForecast=forecast(state,now,30);
    const freeNow=resultForecast.opening===null?null:money(resultForecast.opening-Math.max(0,num(p.reserve)));
    const safe=freeNow===null?null:monthly<=Math.max(0,freeNow);
    const historical=monthHistory(state,now),historicSpend=historical.expenses.reduce((s,x)=>s+amount(x),0);
    const expenseAverage=historical.expenseMonths.length?historicSpend/historical.expenseMonths.length:null;
    const historicSavings=historical.avgIncome!==null&&expenseAverage!==null?money(historical.avgIncome-expenseAverage):null;
    const feasible=historicSavings===null?null:monthly<=Math.max(0,historicSavings);
    return {title:label(p.goalTitle),target,current,left,monthly,deadline,monthsUntil,needed,timeMonths,
      reserve:Math.max(0,num(p.reserve)),freeNow,safe,feasible,historicSavings};
  }
  function recommendations(state,now){
    const issues=detectIssues(state,now),f=forecast(state,now,30),g=goal(state,now),out=[];
    const dup=issues.find(i=>i.kind==='duplicate');if(dup)out.push({title:'Проверь возможный дубль',detail:dup.detail,possibleSaving:null});
    const anomaly=issues.find(i=>i.kind==='overspend'||i.kind==='trend');
    if(anomaly)out.push({title:'Пересмотри эту категорию',detail:anomaly.detail+' Потенциал снижения до прежнего уровня: '+Math.round(anomaly.amount)+' ₽ (не гарантирован).',possibleSaving:anomaly.amount});
    const rec=issues.find(i=>i.kind==='recurring');if(rec)out.push({title:'Проверь регулярную оплату',detail:rec.detail+' При отказе от ненужной услуги возможно экономить эту сумму.',possibleSaving:rec.amount});
    if(f.opening!==null&&f.predicted!==null&&f.estimated&&f.predicted<f.reserve)out.push({title:'Риск снижения резерва',detail:'По оценке через 30 дней свободные средства могут оказаться ниже установленного резерва. Пересмотри траты и обязательства.',possibleSaving:null});
    if(g.left>0&&g.deadline&&g.needed!==null)out.push({title:'Цель: '+(g.title||'Накопления'),detail:'Чтобы успеть к дате, откладывай примерно '+Math.ceil(g.needed)+' ₽/мес.'+(g.feasible===false?' Текущий план взносов выше исторического свободного остатка.':''),possibleSaving:null});
    if(out.length===0)out.push({title:'Накопи историю операций',detail:'Сохраняй доходы, расходы и обязательные платежи: рекомендации станут точнее, когда появятся данные за завершённые месяцы.',possibleSaving:null});
    return out.slice(0,5);
  }
  function simulate(mode,p={},state={},now=new Date()){
    const g=goal(state,now),cash=forecast(state,now,30).opening,reserve=Math.max(0,num(state.plan?.reserve));
    if(mode==='purchase'){
      const cost=Math.max(0,num(p.cost));
      return {main:cash===null?null:money(cash-cost),secondary:cash===null?null:money(cash-cost-reserve),
        explanation:cash===null?'Нет рублёвых кошельков: укажи баланс, чтобы оценить остаток.':'Остаток после покупки и после сохранения неприкосновенного резерва.',warning:cash!==null&&cash-cost<reserve?'Покупка затронет резерв.':''};
    }
    if(mode==='saving'){
      const monthly=Math.max(0,num(p.monthly)),sum=Math.max(0,num(p.cost||g.left));
      return {main:monthly>0?Math.ceil(sum/monthly):null,secondary:monthly*12,
        explanation:'Месяцев до накопления выбранной суммы и взносы за 12 месяцев. Без учёта инфляции и доходности.',
        warning:monthly<=0?'Укажи ежемесячный взнос.':g.historicSavings!==null&&monthly>g.historicSavings?'Взнос выше исторического свободного остатка.':''};
    }
    if(mode==='mortgage'){
      const price=Math.max(0,num(p.cost)),down=Math.max(0,num(p.down)),rent=Math.max(0,num(p.rent)),rate=Math.max(0,num(p.rate))/1200,years=Math.max(1,Math.min(40,num(p.years)||20));
      if(!price||down>=price)return {main:null,secondary:null,explanation:'Укажи стоимость жилья и первоначальный взнос меньше стоимости.',warning:''};
      const loan=price-down,n=years*12,payment=rate?loan*rate/(1-Math.pow(1+rate,-n)):loan/n;
      const ownerCost=Math.max(0,num(p.ownership))/12;
      return {main:money(payment+ownerCost),secondary:money(payment+ownerCost-rent),
        explanation:'Месячный платёж по аннуитетной ипотеке + содержание жилья; разница с арендой. Не учитывает рост цены, налоги сделки и доходность альтернативных вложений.',
        warning:cash!==null&&down>cash-reserve?'Взнос превышает доступные средства за вычетом резерва.':''};
    }
    return {main:null,secondary:null,explanation:'Выбери сценарий.',warning:''};
  }
  return {forecast,detectIssues,goal,recommendations,simulate,dateKey,monthKey,monthHistory};
});
