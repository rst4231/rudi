// Compact, read-only financial summaries; never send another user's full ledger.
function financeSummaryForActor(state,owner,now=new Date()){
 const month=typeof now==='string'?now:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(now).slice(0,7);
 const categories=Array.isArray(state.categories?.[owner])?state.categories[owner]:[];
 const expenses=(Array.isArray(state.personalExpenses)?state.personalExpenses:[]).filter(row=>row?.actor===owner);
 const rub=row=>Number(row.rubAmount||row.amount||0);
 const monthly=expenses.filter(row=>row.month===month);
 const purchases=expenses.filter(row=>!row.manualAdjustment&&rub(row)>0);
 const date=row=>String(row.occurredAt||row.createdAt||'');
 const compact=row=>row?{
  amount:Number(row.sourceAmount||row.amount||row.rubAmount||0),
  currency:String(row.sourceCurrency||row.targetCurrency||'RUB'),
  category:String(categories.find(c=>c.id===row.categoryId)?.name||'Расход'),
  occurredAt:date(row),note:String(row.note||'')
 }:null;
 const latest=purchases.reduce((best,row)=>!best||date(row)>date(best)?row:best,null);
 const largest=purchases.filter(row=>row.month===month).reduce((best,row)=>!best||rub(row)>rub(best)||rub(row)===rub(best)&&date(row)>date(best)?row:best,null);
 const plannedLimit=categories.filter(row=>!row.archived).reduce((sum,row)=>sum+Math.max(0,Number(row.monthlyLimit||0)),0);
 const actualSpent=Math.round(monthly.reduce((sum,row)=>sum+rub(row),0)*100)/100;
 const spentPercent=plannedLimit>0?Math.max(0,actualSpent/plannedLimit*100):(actualSpent>0?100:0);
 return {month,expense:compact(latest),largestPurchase:compact(largest),budget:{plannedLimit,actualSpent,spentPercent}};
}
function partnerFinanceSummary(state,viewer,now=new Date()){
 const partner=viewer==='Рустам'?'Диана':'Рустам';
 return {partner,...financeSummaryForActor(state,partner,now)};
}
function selfFinanceSummary(state,actor,now=new Date()){
 const {month,expense,largestPurchase}=financeSummaryForActor(state,actor,now);
 return {actor,month,expense,largestPurchase};
}
module.exports={partnerFinanceSummary,selfFinanceSummary};

// Only Diana's dog-food purchases are shared with Lulu's profile.
function luluFinanceSummary(state,now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 const month=parts.year+'-'+parts.month;
 const categories=new Map((state.categories?.['Диана']||[]).map(row=>[row.id,row.name]));
 const normalized=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
 const food=text=>/(?:^|[^а-яa-z])(?:корм(?:а|ом|у)?|dog\s*food)(?:$|[^а-яa-z])/u.test(text);
 const dog=text=>/лулу|собак|пес(?:\s|$)|питом|животн|dog/u.test(text);
 const classify=row=>{
  const category=normalized(categories.get(row.categoryId)),detail=normalized([row.label,row.note].join(' ')),all=category+' '+detail;
  if(/кош|кот[а-я]*|cat\b/u.test(all))return '';
  if(/ветерин|ветклин|ветврач/u.test(all))return 'vet';
  if(dog(all)&&/привив|вакцин|анализ|лечени|лекарств|осмотр|клиник/u.test(all))return 'vet';
  return food(all)&&(dog(all)||category.trim()==='корм')?'food':'';
 };
 const transactions=(state.personalExpenses||[]).filter(row=>{
  if(row.actor!=='Диана'||row.month!==month||row.manualAdjustment||Number(row.rubAmount??row.amount)<=0)return false;
  return !!classify(row);
 }).map(row=>({id:row.id,actor:'Диана',kind:classify(row),occurredAt:row.occurredAt||row.createdAt,
  note:String(row.note||row.label||(classify(row)==='vet'?'Ветеринария':'Корм для Лулу')),rubAmount:Math.round(Number(row.rubAmount??row.amount)*100)/100
 })).sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt)));
 const sum=kind=>Math.round(transactions.filter(row=>row.kind===kind).reduce((total,row)=>total+row.rubAmount,0)*100)/100;
 return {month,currency:'RUB',foodRub:sum('food'),vetRub:sum('vet'),totalRub:Math.round(transactions.reduce((sum,row)=>sum+row.rubAmount,0)*100)/100,transactions};
}
module.exports.luluFinanceSummary=luluFinanceSummary;
