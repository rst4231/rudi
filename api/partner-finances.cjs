// Compact, read-only partner view. Reuses the existing expense request and state read.
function partnerFinanceSummary(state,viewer,now=new Date()){
 const partner=viewer==='Рустам'?'Диана':'Рустам';
 const month=typeof now==='string'?now:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(now).slice(0,7);
 const categories=Array.isArray(state.categories?.[partner])?state.categories[partner]:[];
 const expenses=(Array.isArray(state.personalExpenses)?state.personalExpenses:[]).filter(row=>row?.actor===partner);
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
 return {partner,month,expense:compact(latest),largestPurchase:compact(largest),budget:{plannedLimit,actualSpent,spentPercent}};
}
module.exports={partnerFinanceSummary};
