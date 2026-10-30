const finance=require('./finance-store.cjs');

async function recordProductPurchase(actor,items,purchase,options={}){
  if(!purchase)return null;
  if(actor!=='Рустам')throw Error('product-purchase-forbidden');
  const id=String(purchase.id||'');
  const amount=Number(purchase.amount);
  if(!/^[a-z0-9_-]{8,80}$/i.test(id))throw Error('product-purchase-id-invalid');
  if(!Number.isFinite(amount)||amount<=0||amount>100000000)throw Error('product-purchase-amount-invalid');
  const date=new Date(purchase.occurredAt||options.now||Date.now());
  if(!Number.isFinite(date.getTime()))throw Error('product-purchase-date-invalid');
  const requestId='products-'+id;
  let state=await finance.readFinanceState(options);
  let view=finance.viewState(state,actor);
  const wallet=view.wallets.find(row=>row.id===String(purchase.walletId||''));
  if(!wallet)throw Error('product-purchase-wallet-invalid');
  let expense=view.personalExpenses.find(row=>row.requestId===requestId);
  if(expense&&(expense.walletId!==wallet.id||Math.abs(expense.sourceAmount-amount)>0.00000001))throw Error('product-purchase-conflict');
  if(!expense){
    let category=view.categories.find(row=>String(row.name).trim().toLocaleLowerCase('ru-RU')==='продукты');
    if(!category){
      state=await finance.saveExpenseCategory(actor,{name:'Продукты',icon:'🛒',currency:'RUB'},options);
      view=finance.viewState(state,actor);category=view.categories.find(row=>row.name==='Продукты');
    }
    const {resolveExpenseConversion,financeRubRates}=require('./finances.js');
    const rates=wallet.currency==='RUB'&&category.currency==='RUB'?{RUB:1}:options.purchaseRates||await financeRubRates();
    const conversion=resolveExpenseConversion({inputAmount:amount,inputCurrency:wallet.currency,sourceCurrency:wallet.currency,targetCurrency:category.currency,rates});
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).formatToParts(date);
    const part=type=>parts.find(row=>row.type===type).value;
    state=await finance.savePersonalExpense(actor,{requestId,categoryId:category.id,walletId:wallet.id,month:part('year')+'-'+part('month'),occurredAt:date.toISOString(),note:'Продукты: '+items.map(row=>row.text).join(', ').slice(0,105),...conversion},options);
    expense=finance.viewState(state,actor).personalExpenses.find(row=>row.requestId===requestId);
  }
  return {purchase:{id,amount:expense.sourceAmount,currency:expense.sourceCurrency,rubAmount:expense.rubAmount,walletId:wallet.id,walletName:wallet.name,expenseId:expense.id,occurredAt:expense.occurredAt},finances:{ok:true,actor,...finance.viewState(state,actor)}};
}
function normalizeProductPurchase(value){
  if(!value||!value.id)return null;
  const amount=Number(value.amount),rubAmount=Number(value.rubAmount);
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(rubAmount)||rubAmount<=0)return null;
  return {id:String(value.id).slice(0,80),amount,currency:String(value.currency||'RUB').slice(0,6),rubAmount,walletId:String(value.walletId||'').slice(0,100),walletName:String(value.walletName||'').slice(0,80),expenseId:String(value.expenseId||'').slice(0,100),occurredAt:String(value.occurredAt||'')};
}
async function readProductPurchaseFinances(actor,options={}){return {ok:true,actor,...finance.viewState(await finance.readFinanceState(options),actor)}}
module.exports={recordProductPurchase,normalizeProductPurchase,readProductPurchaseFinances};
