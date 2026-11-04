(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RudiMonthlyPlanCore=api})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const rows=x=>Array.isArray(x)?x:[],money=x=>Math.round((Number(x)||0)*100)/100;
 const norm=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 const known=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
 const monthShift=(m,n)=>new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7)-1+n,1)).toISOString().slice(0,7);
 const days=m=>new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),0)).getUTCDate();
 const dateKey=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const dueDate=(month,day)=>month+'-'+String(Math.max(1,Math.min(days(month),Number(day)||1))).padStart(2,'0');
 function obligationAmount(row,month){
  if(!row.amountByMonth)return {amount:Math.max(0,Number(row.amount)||0),estimated:false};
  const keys=Object.keys(row.amountByMonth).filter(k=>k<=month).sort(),key=keys.pop();
  return {amount:Math.max(0,Number(key?row.amountByMonth[key]:row.amount)||0),estimated:!!key&&key!==month};
 }
 function cashflow(state,today,month,income,obligations,baselineVariable,nextVariable,rates){
  const wallets=rows(state.wallets).filter(w=>!w.archived&&w.type!=='credit'),missing=[];
  let opening=wallets.length?0:null;
  for(const wallet of wallets){const code=String(wallet.currency||'RUB').toUpperCase(),amount=Number(wallet.balance)||0;
   if(amount&&!rates[code]){missing.push('курс '+code);opening=null;break}opening+=amount*(rates[code]||1);
  }
  if(opening===null)missing.push('балансы кошельков');
  if(income.amount===null)missing.push('ожидаемый доход');
  const day=Number(state.plan?.expectedIncomeDay),daySet=Number.isInteger(day)&&day>=1&&day<=31;
  if(income.amount>0&&!daySet)missing.push('день дохода');
  if(!known(baselineVariable)||!known(nextVariable))missing.push('повседневные расходы');
  const result={available:opening===null?null:money(opening),firstShortfall:null,minimum:opening===null?null:money(opening),missing};
  if(opening===null||income.amount===null||(income.amount>0&&!daySet)||!known(baselineVariable)||!known(nextVariable))return result;
  const current=today.slice(0,7),last=dueDate(month,31),bills=new Map();
  for(const period of [current,month])for(const row of obligations){
   if(rows(row.paidMonths).includes(period))continue;
   const amount=obligationAmount(row,period).amount;if(!amount)continue;
   const due=dueDate(period,row.day),date=due<today?today:due;
   bills.set(date,money((bills.get(date)||0)+amount));
  }
  let balance=opening;
  for(let date=today;date<=last;date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10)){
   const period=date.slice(0,7);
   // Today's income is already represented by the current wallet balances.
   if(date>today&&income.amount>0&&date===dueDate(period,day))balance+=income.amount;
   const fixed=bills.get(date)||0;balance-=fixed;
   if(fixed&&balance<0&&!result.firstShortfall)result.firstShortfall={date,amount:money(-balance)};
   if(date>today)balance-=(period===current?Number(baselineVariable)||0:Number(nextVariable)||0)/days(period);
   result.minimum=money(Math.min(result.minimum,balance));
  }
  return result;
 }
 function build(state={},now=Date.now(),context={}){
  const today=dateKey(now),current=today.slice(0,7),month=monthShift(current,1),plan=state.plan||{};
  const rates={RUB:1};for(const [code,value] of Object.entries(context.rates||{}))if(known(value)&&Number(value)>0)rates[code]=Number(value);
  const candidates=[1,2,3].map(n=>monthShift(current,-n)),totals={},historyMonths=[];
  const expenseRows=rows(state.personalExpenses),categories=rows(state.categories).filter(c=>!c.archived);
  for(const period of candidates){
   const archived=context.archive?.[period],native=expenseRows.filter(e=>e.month===period);
   if(archived?.count>0||native.length){
    // CoinKeeper import already excludes native day/category overlaps.
    // Its archive contains the remaining purchases, not replacement month totals.
    totals[period]=Object.fromEntries(Object.entries(archived?.categories||{}).map(([id,v])=>[id,Math.max(0,Number(v.total)||0)]));
    for(const row of native)totals[period][row.categoryId]=money((totals[period][row.categoryId]||0)+Number(row.rubAmount??row.amount??0));
    historyMonths.push(period);
   }
  }
  const incomeRows=rows(state.walletIncomes).filter(row=>candidates.includes(row.month)),incomeMonths=[...new Set(incomeRows.map(row=>row.month))];
  const manualIncome=known(plan.expectedMonthlyIncome),income={amount:manualIncome?Math.max(0,Number(plan.expectedMonthlyIncome)):incomeMonths.length?money(incomeRows.reduce((sum,row)=>sum+Number(row.rubAmount||0),0)/incomeMonths.length):null,source:manualIncome?'planned':incomeMonths.length?'history':'unknown',months:incomeMonths};
  const activeBills=rows(plan.obligations).filter(row=>row.active!==false),fixedByCategory={},allocation=new Map();
  const obligations=activeBills.map(row=>({...row,...obligationAmount(row,month),date:dueDate(month,row.day)})).filter(row=>row.amount>0);
  for(const bill of obligations){
   const category=categories.find(c=>norm(c.name)===norm(bill.title))||categories.find(c=>expenseRows.some(e=>e.categoryId===c.id&&candidates.includes(e.month)&&norm(e.note).includes(norm(bill.title))&&Math.abs(Number(e.rubAmount??e.amount)-obligationAmount(bill,e.month).amount)<=1));
   if(category){allocation.set(bill.id,category.id);fixedByCategory[category.id]=money((fixedByCategory[category.id]||0)+bill.amount)}
  }
  const fixedTotal=money(obligations.reduce((sum,row)=>sum+row.amount,0)),missing=[];
  if(Object.values(context.archive||{}).some(row=>Number(row?.unknownRub)>0))missing.push('часть исторических сумм без курса');
  if(context.archiveUnavailable)missing.push('исторический архив временно недоступен');
  let baselineTotal=0;
  const proposals=categories.map(category=>{
   const code=String(category.currency||'RUB').toUpperCase(),rate=rates[code],schedule=category.monthlyLimits||{},keys=Object.keys(schedule).filter(m=>m<=month).sort();
   const prior=Number(keys.length?schedule[keys.pop()]:category.monthlyLimit)||0,locked=Object.hasOwn(schedule,month),fixed=fixedByCategory[category.id]||0;
   let variable=0;
   for(const period of historyMonths){
    const fixedPast=obligations.filter(o=>allocation.get(o.id)===category.id).reduce((sum,o)=>sum+obligationAmount(o,period).amount,0);
    variable+=Math.max(0,(totals[period]?.[category.id]||0)-fixedPast);
   }
   variable=historyMonths.length?variable/historyMonths.length:0;
   const source=variable>0?'history':'limits';
   if(variable<=0)variable=Math.max(0,(rate?prior*rate:0)-fixed);
   baselineTotal+=variable;
   const proposed=source==='history'?Math.ceil(money(variable*1.1)/100)*100:money(variable);
   return {id:category.id,name:category.name,icon:category.icon||'',currency:code,previous:prior,locked,fixed,variable:locked?rate?Math.max(0,prior*rate-fixed):null:proposed,limit:locked?prior:null,source,rate:rate||null};
  });
  const savings=Math.max(0,Number(plan.goalMonthlyContribution)||0),lockedVariable=proposals.filter(c=>c.locked).reduce((sum,c)=>sum+(c.variable||0),0);
  const variableWanted=proposals.reduce((sum,c)=>sum+(c.variable||0),0),unlockedWanted=proposals.filter(c=>!c.locked).reduce((sum,c)=>sum+(c.variable||0),0);
  const capacity=income.amount===null?unlockedWanted:Math.max(0,income.amount-fixedTotal-savings-lockedVariable),scale=unlockedWanted>capacity&&unlockedWanted>0?capacity/unlockedWanted:1;
  for(const category of proposals){
   if(!category.locked){
    const variable=scale<1?Math.floor(category.variable*scale/100)*100:category.variable;
    const rub=category.fixed+variable;
    category.limit=rub===0?0:category.rate?Math.floor(rub/category.rate*100+1e-7)/100:null;
    if(category.limit===0&&rub>0)category.limit=null;
   }
   category.rub=category.limit===0?0:category.limit!==null&&category.rate?money(category.limit*category.rate):null;
   if(category.rub===null)missing.push('курс или шаг лимита '+category.currency);
   delete category.variable;delete category.rate;
  }
  const variableTotal=proposals.some(c=>c.rub===null)?null:money(proposals.reduce((sum,c)=>sum+Math.max(0,c.rub-c.fixed),0));
  const total=variableTotal===null?null:money(fixedTotal+variableTotal+savings),remaining=income.amount===null||total===null?null:money(income.amount-total);
  if(income.amount===null)missing.push('ожидаемый доход');if(!historyMonths.length)missing.push('история полных месяцев');
  const baseline=known(plan.plannedMonthlyVariableExpenses)?Number(plan.plannedMonthlyVariableExpenses):(historyMonths.length||categories.some(c=>Number(c.monthlyLimit)>0))?baselineTotal:null;
  const projection=cashflow(state,today,month,income,activeBills,baseline,variableTotal,rates);
  const id=JSON.stringify([state.actor||'',month,income.amount,Number(plan.expectedIncomeDay)||0,savings,proposals.map(c=>[c.id,c.limit,c.locked,c.previous]),obligations.map(o=>[o.id,o.amount,o.day,o.paidMonths]),projection.available,projection.firstShortfall,projection.minimum]);
  return {id,date:today,month,historyMonths,income,obligations,fixedTotal,categories:proposals,variableTotal,savings,total,remaining,habitualDeficit:income.amount===null?null:money(Math.max(0,fixedTotal+variableWanted+savings-income.amount)),cashflow:projection,missing:[...new Set(missing)],canApply:proposals.some(c=>!c.locked&&(c.limit>0||c.previous>0||historyMonths.some(m=>(totals[m]?.[c.id]||0)>0)))&&proposals.every(c=>c.limit!==null)};
 }
 return {build,dateKey,monthShift};
});
