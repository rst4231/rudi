'use strict';
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const {readFinanceState}=require('./finance-store.cjs');

const NS='rudi-coinkeeper-history-v1';
const CUTOFF='2026-10-01';
const TTL=10*365*24*60*60;
const LAST_IMPORT_KEY='rustam:last-import';
const OVERVIEW_KEY='rustam:overview:v1';
function keyOf(value){return String(value||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ')}
function dateOnly(value){
 const s=String(value||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T12:00:00Z')))throw Error('coinkeeper-date-invalid');
 if(s<'2016-01-01'||s>=CUTOFF)throw Error('coinkeeper-date-out-of-range');
 return s;
}
function money(value,zero=false){
 if(value===null||value===undefined||value==='')return zero?null:0;
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>1e12)throw Error('coinkeeper-amount-invalid');
 return Math.round(n*1e8)/1e8;
}
function currency(value){
 const s=String(value||'').trim().toUpperCase();
 if(!['RUB','USD','EUR','THB','IDR','MYR','AZN'].includes(s))throw Error('coinkeeper-currency-invalid');
 return s;
}
function text(value,max=120){return String(value??'').trim().slice(0,max)}
function signature(row){return [row.date,row.categoryId,Math.round(Number(row.rubAmount||0)*100)].join('|')}
function dedupeExisting(rows){
 const counts=new Map();
 for(const row of rows||[]){
  if(row.actor!=='Рустам'||row.month!=='2026-09'||row.manualAdjustment)continue;
  const date=String(row.occurredAt||row.createdAt||'').slice(0,10);
  const rub=Math.round(Number(row.rubAmount??row.amount??0)*100);
  if(!(rub>0))continue;
  const id=[date,row.categoryId,rub].join('|');
  counts.set(id,(counts.get(id)||0)+1);
 }
 return counts;
}
function cacheOf(opts={}){return opts.cache||createStrictRuntimeCache({namespace:NS,...opts.cacheOptions})}
function contextFromState(state){
 const categories=(state.categories?.['Рустам']||[]).filter(c=>!c.archived).map(c=>({id:c.id,name:c.name,currency:c.currency}));
 const wallets=(state.wallets?.['Рустам']||[]).filter(w=>!w.archived).map(w=>({id:w.id,name:w.name,currency:w.currency}));
 return {categories,wallets,septemberExisting:[...dedupeExisting(state.personalExpenses)].map(([signature,count])=>({signature,count}))};
}
async function context(opts={}){
 const state=await (opts.state||readFinanceState(opts.stateOptions||{}));
 const last=await cacheOf(opts).get(LAST_IMPORT_KEY);
 return {...contextFromState(state),lastImport:last&&typeof last==='object'?{importId:last.importId,months:last.months?.length||0,updatedAt:last.updatedAt}:null};
}
function normalizeRow(raw,validCategories,validWallets){
 const type=String(raw?.type||'').toLowerCase();
 if(!['expense','transfer'].includes(type))throw Error('coinkeeper-type-invalid');
 const date=dateOnly(raw.date),month=date.slice(0,7);
 const importKey=text(raw.importKey,160);
 if(!/^ckhistory:[a-z0-9-]+:[0-9]{1,7}$/.test(importKey))throw Error('coinkeeper-key-invalid');
 const amount=money(raw.amount),sourceCurrency=currency(raw.currency);
 if(amount<=0)throw Error('coinkeeper-amount-invalid');
 const convertedAmount=raw.convertedAmount==null?null:money(raw.convertedAmount,true);
 const convertedCurrency=raw.convertedCurrency?currency(raw.convertedCurrency):null;
 const rubAmount=sourceCurrency==='RUB'?Math.round(amount*100)/100:
  convertedCurrency==='RUB'&&convertedAmount>0?Math.round(convertedAmount*100)/100:null;
 let categoryId='',walletId='',toWalletId='';
 if(type==='expense'){
  categoryId=text(raw.categoryId,100);
  if(!validCategories.has(categoryId))throw Error('coinkeeper-category-unmapped');
 }
 // A historical reference is not a balance adjustment or account creation.
 const fromName=text(raw.fromName,72),toName=text(raw.toName,72);
 const fromWallet=validWallets.get(text(raw.walletId,100));
 if(fromWallet&&fromWallet.currency===sourceCurrency)walletId=fromWallet.id;
 const toWallet=validWallets.get(text(raw.toWalletId,100));
 if(type==='transfer'&&toWallet&&toWallet.currency===convertedCurrency)toWalletId=toWallet.id;
 const ordinal=Math.max(0,Math.trunc(Number(raw.duplicateOrdinal)||0));
 return {importKey,type,date,month,categoryId,amount,currency:sourceCurrency,rubAmount,
  convertedAmount,convertedCurrency,fromName,toName,walletId,toWalletId,
  label:text(raw.label,60),note:text(raw.note,140),duplicateOrdinal:ordinal};
}
async function importBatch(actor,rows,opts={}){
 if(actor!=='Рустам')throw Error('coinkeeper-owner-only');
 if(!Array.isArray(rows)||rows.length>250)throw Error('coinkeeper-batch-limit');
 const state=await (opts.state||readFinanceState(opts.stateOptions||{}));
 const cats=new Set((state.categories?.['Рустам']||[]).filter(c=>!c.archived).map(c=>c.id));
 const wallets=new Map((state.wallets?.['Рустам']||[]).filter(w=>!w.archived).map(w=>[w.id,w]));
 const existing=dedupeExisting(state.personalExpenses);
 // Some pre-existing RUDI September totals combine several CoinKeeper lines,
 // and historical currency conversion can differ by a few kopecks.
 // Conservatively quarantine the entire day/category overlap instead of
 // inventing a partial-match correction or duplicating an old expense.
 const protectedSeptemberGroups=new Set([...existing.keys()].map(key=>key.slice(0,key.lastIndexOf('|'))));
 const grouped=new Map(),result={imported:0,duplicates:0,matchedSeptember:0,unmapped:0,invalid:0,unknownRub:0,transfers:0,months:[]};
 for(const raw of rows){
  try{
   const row=normalizeRow(raw,cats,wallets);
   if(row.type==='expense'&&row.month==='2026-09'&&
       protectedSeptemberGroups.has(row.date+'|'+row.categoryId)){
    result.matchedSeptember++;continue;
   }
   if(!grouped.has(row.month))grouped.set(row.month,[]);
   grouped.get(row.month).push(row);
  }catch(error){
   if(error.message==='coinkeeper-category-unmapped')result.unmapped++;
   else result.invalid++;
  }
 }
 const cache=cacheOf(opts);
 // Register the upload before writing any monthly data. Even a partially
 // interrupted import can be fully rolled back using its stable file hash.
 if(grouped.size){
  const importIds=new Set([...grouped.values()].flat().map(row=>row.importKey.split(':')[1]));
  if(importIds.size!==1)throw Error('coinkeeper-mixed-imports');
  const importId=[...importIds][0];
  const previous=await cache.get(LAST_IMPORT_KEY);
  const months=previous?.importId===importId?new Set(previous.months||[]):new Set();
  for(const month of grouped.keys())months.add(month);
  const manifest={importId,months:[...months].sort(),updatedAt:new Date().toISOString()};
  await cache.set(LAST_IMPORT_KEY,manifest,{ttl:TTL,tags:['coinkeeper-history'],name:LAST_IMPORT_KEY});
 }
 for(const [month,add] of grouped){
  const key='rustam:'+month,old=(await cache.get(key))||[];
  if(!Array.isArray(old))throw Error('coinkeeper-archive-corrupt');
  const seen=new Set(old.map(r=>r.importKey)),fresh=[];
  for(const row of add){
   if(seen.has(row.importKey)){result.duplicates++;continue;}
   seen.add(row.importKey);fresh.push(row);
   if(row.type==='transfer')result.transfers++;
   if(row.type==='expense'&&row.rubAmount===null)result.unknownRub++;
  }
  if(!fresh.length)continue;
  const next=old.concat(fresh).sort((a,b)=>a.date.localeCompare(b.date)||a.importKey.localeCompare(b.importKey));
  if(Buffer.byteLength(JSON.stringify(next),'utf8')>1700000)throw Error('coinkeeper-month-too-large');
  await cache.set(key,next,{ttl:TTL,tags:['coinkeeper-history'],name:key});
  result.imported+=fresh.length;
  result.months.push(month);
 }
 if(result.imported>0)await cache.delete(OVERVIEW_KEY);
 return result;
}
async function deleteLastImport(actor,importId,offset=0,opts={}){
 if(actor!=='Рустам')throw Error('coinkeeper-owner-only');
 const cache=cacheOf(opts),manifest=await cache.get(LAST_IMPORT_KEY);
 if(!manifest)return {deleted:0,totalMonths:0,nextOffset:0,done:true};
 if(typeof importId!=='string'||manifest.importId!==importId)throw Error('coinkeeper-import-mismatch');
 const months=Array.isArray(manifest.months)?manifest.months:[];
 const start=Number(offset);
 if(!Number.isInteger(start)||start<0||start>months.length)throw Error('coinkeeper-offset-invalid');
 const end=Math.min(months.length,start+8),prefix='ckhistory:'+importId+':';
 let deleted=0;
 for(const month of months.slice(start,end)){
  const key='rustam:'+month,old=await cache.get(key);
  if(!Array.isArray(old)||!old.length)continue;
  const remaining=old.filter(row=>!String(row?.importKey||'').startsWith(prefix));
  if(remaining.length===old.length)continue;
  deleted+=old.length-remaining.length;
  if(remaining.length)await cache.set(key,remaining,{ttl:TTL,tags:['coinkeeper-history'],name:key});
  else await cache.delete(key);
 }
 const done=end>=months.length;
 if(done)await cache.delete(LAST_IMPORT_KEY);
 if(deleted>0)await cache.delete(OVERVIEW_KEY);
 return {deleted,totalMonths:months.length,nextOffset:end,done};
}
function archiveOverviewFromRows(items){
 // Read-only RUB analytics. Missing historical RUB rates stay unknown,
 // never treated as today's FX or as native-currency RUB amounts.
 const months=Object.create(null),days=Object.create(null);
 let expenses=0,transfers=0,unknownRub=0,knownRub=0;
 for(const item of items||[]){
  if(!/^rustam:(201[6-9]|202[0-6])-(0[1-9]|1[0-2])$/.test(item?.key||''))continue;
  if(!Array.isArray(item.value))continue;
  const month=item.key.slice('rustam:'.length);
  if(month>='2026-10')continue;
  for(const row of item.value){
   if(row?.type==='transfer'){transfers++;continue;}
   if(row?.type!=='expense'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date||''))continue;
   if(row.date.slice(0,7)!==month)continue;
   const categoryId=String(row.categoryId||'').slice(0,100);
   if(!categoryId)continue;
   const daily=days[row.date]||(days[row.date]={total:0,count:0,unknownRub:0,categories:{}});
   const monthly=months[month]||(months[month]={total:0,count:0,unknownRub:0,categories:{}});
   expenses++;daily.count++;monthly.count++;
   if(row.rubAmount===null||row.rubAmount===undefined||!Number.isFinite(Number(row.rubAmount))){
    unknownRub++;daily.unknownRub++;monthly.unknownRub++;continue;
   }
   const amount=Math.round(Number(row.rubAmount)*100)/100;
   if(amount<0)continue;
   knownRub=Math.round((knownRub+amount)*100)/100;
   for(const bucket of [daily,monthly]){
    bucket.total=Math.round((bucket.total+amount)*100)/100;
    const cat=bucket.categories[categoryId]||(bucket.categories[categoryId]={total:0,count:0});
    cat.total=Math.round((cat.total+amount)*100)/100;
    cat.count++;
   }
  }
 }
 return {months,days,expenses,transfers,unknownRub,knownRub};
}
async function overview(actor,opts={}){
 if(actor!=='Рустам')throw Error('coinkeeper-owner-only');
 const cache=cacheOf(opts);
 const saved=await cache.get(OVERVIEW_KEY);
 if(saved&&saved.months&&saved.days)return saved;
 // One-time rebuild of the compact index from the isolated monthly archive.
 // Subsequent reads fetch only this small index; no live finance state writes.
 const rows=await cache.list();
 const result=archiveOverviewFromRows(rows);
 await cache.set(OVERVIEW_KEY,result,{ttl:TTL,tags:['coinkeeper-history'],name:OVERVIEW_KEY});
 return result;
}
async function readMonth(actor,month,opts={}){
 if(actor!=='Рустам')throw Error('coinkeeper-owner-only');
 if(!/^(201[6-9]|202[0-6])-(0[1-9]|1[0-2])$/.test(String(month||''))||month>='2026-10')throw Error('coinkeeper-month-invalid');
 const rows=await cacheOf(opts).get('rustam:'+month);
 const list=Array.isArray(rows)?rows:[];
 const expenseTotals={},currencyTotals={};
 let amountUnknown=0,expenses=0,transfers=0,totalRub=0;
 for(const r of list){
  if(r.type==='transfer'){transfers++;continue;}
  expenses++;
  currencyTotals[r.currency]=(currencyTotals[r.currency]||0)+Number(r.amount||0);
  if(r.rubAmount===null){amountUnknown++;continue;}
  const amount=Number(r.rubAmount||0);
  totalRub+=amount;
  expenseTotals[r.categoryId]=(expenseTotals[r.categoryId]||0)+amount;
 }
 return {month,rows:list.slice().sort((a,b)=>b.date.localeCompare(a.date)),summary:{
  expenses,transfers,totalRub:Math.round(totalRub*100)/100,
  unknownRub:amountUnknown,categories:expenseTotals,currencies:currencyTotals
 }};
}
module.exports={NS,CUTOFF,keyOf,dateOnly,normalizeRow,context,contextFromState,dedupeExisting,importBatch,readMonth,deleteLastImport,archiveOverviewFromRows,overview};