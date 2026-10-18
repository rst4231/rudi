/* RUDI offline shopping and personal finance: actor-scoped snapshots and replay.
   Does not persist session credentials, auth tokens or backup tokens. */
(function(root){
'use strict';
const DB='rudi-offline-transactions-v1',AREAS=new Set(['products','finances']);
let actor='',flushing=null,requestAuth=()=>({}),lastProbe=0,connected=null;
const id=()=>root.crypto?.randomUUID?.()||('op-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const clean=(value,depth=0)=>{
 if(depth>18)return null;
 if(Array.isArray(value))return value.map(v=>clean(v,depth+1));
 if(value&&typeof value==='object'){
  const result={};
  for(const [key,v] of Object.entries(value))
   if(!/^(initData|backupToken|token|accessToken|refreshToken|authorization|password|secret|credential|cookie)$/i.test(key))
    result[key]=clean(v,depth+1);
  return result;
 }
 return value===null||['string','boolean','number'].includes(typeof value)?value:null;
};
function open(){
 return new Promise((resolve,reject)=>{
  if(!root.indexedDB){reject(Error('offline-storage-unavailable'));return}
  const req=root.indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'key'});
   if(!db.objectStoreNames.contains('outbox'))db.createObjectStore('outbox',{keyPath:'id'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error('offline-db-open-failed'));
  req.onblocked=()=>reject(Error('offline-db-blocked'));
 });
}
async function tx(stores,mode,fn){
 const db=await open();
 return new Promise((resolve,reject)=>{
  try{
   const names=Array.isArray(stores)?stores:[stores],tr=db.transaction(names,mode);
   let request=fn(tr);
   tr.oncomplete=()=>{db.close();resolve(request&&'result'in request?request.result:request)};
   tr.onerror=()=>{db.close();reject(tr.error||Error('offline-db-transaction-failed'))};
   tr.onabort=()=>{db.close();reject(tr.error||Error('offline-db-transaction-aborted'))};
  }catch(error){db.close();reject(error)}
 });
}
const key=(who,area)=>who+'|'+area;
async function base(area,who=actor){
 if(!AREAS.has(area)||!who)return null;
 const row=await tx('snapshots','readonly',tr=>tr.objectStore('snapshots').get(key(who,area)));
 return row?.state||null;
}
async function capture(area,state,who=actor){
 if(!AREAS.has(area)||!who||!state||state.ok!==true)return false;
 await tx('snapshots','readwrite',tr=>tr.objectStore('snapshots').put({key:key(who,area),state:clean(state),savedAt:Date.now()}));
 return true;
}
async function pending(area='',who=actor){
 if(!who)return[];
 const rows=await tx('outbox','readonly',tr=>tr.objectStore('outbox').getAll());
 return (rows||[]).filter(row=>row.actor===who&&(!area||row.area===area))
   .sort((a,b)=>a.createdAt-b.createdAt);
}
function productProjection(state,op,data,row){
 const next={...state,items:(state.items||[]).map(x=>({...x})),history:[...(state.history||[])]},items=next.items;
 const timestamp=new Date(row.createdAt).toISOString(),addedBy=row.actor;
 if(op==='add'){
  for(const [index,text] of (Array.isArray(data.items)?data.items:[data.text]).entries()){
   const title=String(text||'').trim();
   if(!title||items.some(x=>String(x.text).trim().toLowerCase()===title.toLowerCase()))continue;
   items.unshift({id:'offline-'+row.id+'-'+index,text:title,addedBy,category:'Другое',
    weeklyAmount:'',checked:false,createdAt:timestamp,offlinePending:true});
  }
 }else if(op==='toggle'){
  if(Array.isArray(data.checkedIds)){const checked=new Set(data.checkedIds.map(String));items.forEach(x=>x.checked=checked.has(x.id));}
  else {const x=items.find(x=>x.id===data.id);if(x)x.checked=!x.checked}
 }else if(op==='update'){
  const x=items.find(x=>x.id===data.id);
  if(x)Object.assign(x,Object.fromEntries(['text','quantity','unit','categoryOverride','note'].filter(k=>k in data).map(k=>[k,data[k]])));
 }else if(op==='remove'||op==='bought'||op==='buy-checked'||op==='clear'){
  const wanted=op==='clear'?null:new Set(op==='buy-checked'?(data.checkedIds||[]):[data.id]);
  const taken=items.filter(x=>wanted===null||wanted.has(x.id));
  next.items=items.filter(x=>wanted!==null&&!wanted.has(x.id));
  if(op==='bought'||op==='buy-checked')
   next.history=[...taken.map(x=>({...x,boughtBy:addedBy,boughtAt:timestamp,id:'offline-history-'+x.id})),...next.history];
  if(op==='remove')next.removedItem=taken[0]||null;
  if(op==='clear')next.removedItems=taken;
 }else if(op==='restore'){
  const restore=Array.isArray(data.items)?data.items:data.item?[data.item]:[];
  for(const x of restore)if(x?.id&&!items.some(i=>i.id===x.id))items.unshift(x);
 }
 next.version=Date.now();return next;
}
function financeProjection(state,op,data,row){
 const next={...state,wallets:(state.wallets||[]).map(x=>({...x})),
  personalExpenses:(state.personalExpenses||[]).map(x=>({...x})),
  walletIncomes:(state.walletIncomes||[]).map(x=>({...x}))};
 const time=new Date(row.createdAt).toISOString(),sid='offline-'+row.id;
 const adjust=(walletId,amount)=>{const wallet=next.wallets.find(w=>w.id===walletId);if(wallet)wallet.balance=Number(wallet.balance||0)+amount};
 if(op==='save-expense'||op==='delete-expense'){
  const previous=next.personalExpenses.find(x=>x.id===data.id&&x.actor===row.actor);
  if(previous?.walletId)adjust(previous.walletId,Number(previous.sourceAmount||previous.amount||0));
  next.personalExpenses=next.personalExpenses.filter(x=>x!==previous);
  if(op==='save-expense'){
   const wallet=next.wallets.find(w=>w.id===data.walletId);
   const category=next.categories?.find(c=>c.id===data.categoryId);
   const sourceCurrency=String(wallet?.currency||category?.currency||'RUB').toUpperCase();
   const targetCurrency=String(category?.currency||'RUB').toUpperCase();
   const quote=data.offlineConversion||{};
   const input=Number(data.amount||0);
   const inputCurrency=String(data.inputCurrency||sourceCurrency).toUpperCase();
   const sourceAmount=Number(quote.sourceAmount)>0?Number(quote.sourceAmount):
      inputCurrency===sourceCurrency?input:0;
   const amount=Number(quote.amount)>0?Number(quote.amount):
      sourceCurrency===targetCurrency&&inputCurrency===sourceCurrency?input:0;
   const rubAmount=Number(quote.rubAmount)>0?Number(quote.rubAmount):
      sourceCurrency==='RUB'&&targetCurrency==='RUB'?input:0;
   const month=String(data.month||time.slice(0,7));
   const expense={...(previous||{}),...data,id:data.id||sid,actor:row.actor,month,
    amount,sourceAmount,rubAmount,sourceCurrency,targetCurrency,
    exchangeRate:Number(quote.exchangeRate)||0,
    offlineRatePending:rubAmount<=0||sourceAmount<=0,
    occurredAt:data.occurredAt||time,createdAt:previous?.createdAt||time,updatedAt:time,
    requestId:data.requestId||row.id,offlinePending:true};
   next.personalExpenses.push(expense);
   if(expense.walletId)adjust(expense.walletId,-expense.sourceAmount);
  }
 }else if(op==='save-wallet-income'||op==='delete-wallet-income'){
  const previous=next.walletIncomes.find(x=>x.id===data.id&&x.actor===row.actor);
  if(previous?.walletId)adjust(previous.walletId,-Number(previous.amount||0));
  next.walletIncomes=next.walletIncomes.filter(x=>x!==previous);
  if(op==='save-wallet-income'){
   const wallet=next.wallets.find(w=>w.id===data.walletId),amount=Number(data.amount||0);
   const quote=data.offlineConversion||{};
   const currency=wallet?.currency||'RUB';
   const income={...(previous||{}),...data,id:data.id||sid,actor:row.actor,
    amount,rubAmount:Number(quote.rubAmount)||(currency==='RUB'?amount:0),
    exchangeRate:Number(quote.exchangeRate)||(currency==='RUB'?1:0),
    offlineRatePending:currency!=='RUB'&&!Number(quote.rubAmount),
    month:data.month||time.slice(0,7),currency,
    occurredAt:data.occurredAt||time,createdAt:previous?.createdAt||time,
    updatedAt:time,offlinePending:true};
   next.walletIncomes.push(income);
   adjust(income.walletId,amount);
  }
 }
 // Derived month totals are rebuilt from the local ledger, not double-applied.
 const months=(next.personalMonths||[]).map(x=>({...x}));
 for(const month of new Set([...next.personalExpenses.map(x=>x.month),...next.walletIncomes.map(x=>x.month)])){
  if(!month)continue;
  const expenses=next.personalExpenses.filter(x=>x.month===month).reduce((s,x)=>s+Number(x.rubAmount??x.amount??0),0);
  const incomes=next.walletIncomes.filter(x=>x.month===month).reduce((s,x)=>s+Number(x.rubAmount??x.amount??0),0);
  const index=months.findIndex(x=>x.month===month);
  if(index>=0)months[index]={...months[index],expenses,income:incomes,balance:incomes-expenses};
 }
 next.personalMonths=months;return next;
}
function project(area,state,row){
 return area==='products'
  ?productProjection(state,row.operation,row.payload,row)
  :financeProjection(state,row.operation,row.payload,row);
}
async function view(area,who=actor){
 const saved=await base(area,who);
 if(!saved)return null;
 let state={...saved};
 for(const row of await pending(area,who))state=project(area,state,row);
 return state;
}
function offline(){
 if(connected===true||root.__rudiNetworkReachable===true)return false;
 return root.navigator?.onLine===false||root.document?.body?.dataset?.offlineMode==='1'||connected===false;
}
function networkError(err){
 return ['TypeError','AbortError'].includes(String(err?.name||''))||
 /network|fetch|timeout|aborted|load failed|offline/i.test(String(err?.message||''));
}
function endpoint(area){return area==='products'?'/api/partner-message?rudiAction=products':'/api/finances'}
function normalized(area,op,data,row){
 const body={...data,operation:op};
 if(area==='products'&&row?.id)body.offlineOperationId=row.id;
 if(area==='finances'){
  if(op==='save-expense'&&!data.id)body.requestId=data.requestId||row.id;
  if(op==='save-wallet-income'&&!data.id)body.offlineOperationId=row.id;
  if(op==='delete-expense'||op==='delete-wallet-income')body.offlineOperationId=row.id;
 }
 if(area==='products'&&row.offlineProductMap){
  const mapId=id=>row.offlineProductMap[id]||id;
  if(body.id)body.id=mapId(body.id);
  if(Array.isArray(body.checkedIds))body.checkedIds=body.checkedIds.map(mapId);
  if(body.item?.id)body.item={...body.item,id:mapId(body.item.id)};
  if(Array.isArray(body.items)&&op==='restore')body.items=body.items.map(x=>x?.id?{...x,id:mapId(x.id)}:x);
 }
 return body;
}
async function send(area,op,payload,row,request){
 let body={...normalized(area,op,payload,row),initData:String(root.Telegram?.WebApp?.initData||'')};
 if(!root.Telegram?.WebApp?.initData&&typeof requestAuth==='function')body.initData=String(requestAuth()||'');
 // Never use a cached auth token from IndexedDB.
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  const response=await fetch(endpoint(area),{method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json'},credentials:'same-origin',
   body:JSON.stringify(body),signal:ctl.signal});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok){const e=Error(data.error||'offline-sync-failed');e.status=response.status;throw e}
  return data;
 }finally{clearTimeout(timer)}
}
function signal(detail={}){
 root.dispatchEvent(new CustomEvent('rudi-transactions-updated',{detail:{actor,...detail}}));
}
async function request(area,operation,payload={},live=null){
 if(!AREAS.has(area)||!actor)throw Error('offline-transactions-unavailable');
 const who=actor,read=operation==='list';
 if(read){
  // A stale offline UI flag must not prevent refreshing a recovered connection.
  if(offline()&&!(await probe())){const state=await view(area,who);if(state)return state}
  try{
   const state=await live();
   if(state?.ok===true)await capture(area,state,who);
   return (await view(area,who))||state;
  }catch(err){
   const state=await view(area,who);
   if(state&&networkError(err)){connected=false;root.__rudiNetworkReachable=false;return state}
   throw err;
  }
 }
 const supported=area==='products'?
  ['add','update','remove','restore','toggle','bought','buy-checked','clear']:
  ['save-expense','delete-expense','save-wallet-income','delete-wallet-income'];
 if(!supported.includes(operation))return live();
 const opId=id();
 const draft={id:opId,area,actor:who,operation,payload:clean(payload),createdAt:Date.now(),error:''};
 if(area==='finances'&&operation==='save-expense'&&!draft.payload.id)draft.payload.requestId=String(payload.requestId||opId);
 if(!offline()){
  try{
   const livePayload=area==='products'
     ?{...payload,offlineOperationId:opId}
     :area==='finances'&&['delete-expense','delete-wallet-income'].includes(operation)
     ?{...payload,offlineOperationId:opId}
     :area==='finances'&&operation==='save-wallet-income'&&!payload.id
     ?{...payload,offlineOperationId:opId}
     :area==='finances'&&operation==='save-expense'&&!payload.id?{...payload,requestId:payload.requestId||opId}:payload;
   const result=await live(livePayload);
   if(result?.ok===true)await capture(area,result,who).catch(()=>false);
   return (await view(area,who).catch(()=>null))||result;
  }catch(error){
   if(!networkError(error))throw error;
   connected=false;
   root.__rudiNetworkReachable=false;
  }
 }
 const saved=await base(area,who);
 if(!saved)throw Error('offline-snapshot-unavailable');
 if(area==='finances'&&(operation==='save-expense'||operation==='save-wallet-income')){
  const wallet=saved.wallets?.find(x=>x.id===payload.walletId);
  const category=saved.categories?.find(x=>x.id===payload.categoryId);
  if(payload.walletId&&!wallet)throw Error('offline-finance-wallet-not-found');
  if(operation==='save-expense'&&!category)throw Error('offline-finance-category-not-found');
  if(!(Number(payload.amount)>0))throw Error('offline-finance-amount-invalid');
 }
 await tx('outbox','readwrite',tr=>tr.objectStore('outbox').put(draft));
 root.document.body.dataset.offlineMode='1';
 root.dispatchEvent(new CustomEvent('rudi-offline-snapshot-used',{detail:{updatedAt:Date.now()}}));
 signal({area,queued:true});
 const state=await view(area,who);
 if(state)return state;
 throw Error('offline-snapshot-unavailable');
}
async function probe(){
 try{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),3000);
  let response;
  try{response=await fetch('/version.json?txProbe='+Date.now(),{cache:'no-store',signal:ctl.signal})}
  finally{clearTimeout(timer)}
  const recovered=Boolean(response?.ok&&response.headers?.get?.('X-RUDI-Offline')!=='1');
  const previouslyOffline=offline();
  connected=recovered;
  root.__rudiNetworkReachable=recovered;
  if(recovered&&previouslyOffline){
   if(root.document?.body)root.document.body.dataset.offlineMode='0';
   root.dispatchEvent(new CustomEvent('rudi-transactions-network-recovered'));
  }
  return connected;
 }catch(_){connected=false;return false}
}
async function flush(){
 if(flushing)return flushing;
 if(!actor)return {sent:0};
 const who=actor;
 flushing=(async()=>{
  const rows=await pending('',who);
  if(!rows.length)return {sent:0};
  if(!(await probe()))return {sent:0,pending:rows.length};
  let sent=0;
  const savedProductMap=await tx('snapshots','readonly',tr=>tr.objectStore('snapshots').get(key(who,'productMap'))).catch(()=>null);
  const productMap={...(savedProductMap?.value||{})};
  for(const row of rows){
   if(actor!==who)break;
   try{
    // Translate local product IDs after add is acknowledged.
    if(row.area==='products'){
     const state=await base('products',who);
     const local=project('products',state||{ok:true,items:[],history:[]},row);
     const liveItems=Array.isArray(state?.items)?state.items:[];
     for(const x of local.items||[]){
      if(!String(x.id).startsWith('offline-'))continue;
      const match=liveItems.find(s=>String(s.text||'').trim().toLowerCase()===String(x.text||'').trim().toLowerCase());
      if(match)productMap[x.id]=match.id;
     }
    }
    const response=await send(row.area,row.operation,row.payload,{...row,offlineProductMap:productMap});
    if(row.area==='products'&&row.operation==='add'){
     const items=response.items||[];
     for(const [index,name] of (Array.isArray(row.payload.items)&&row.payload.items.length?row.payload.items:[row.payload.text]).entries()){
      const match=items.find(x=>String(x.text||'').trim().toLowerCase()===String(name||'').trim().toLowerCase());
      if(match)productMap['offline-'+row.id+'-'+index]=match.id;
     }
    }
    await tx(['outbox','snapshots'],'readwrite',tr=>{
     tr.objectStore('snapshots').put({key:key(who,row.area),state:clean(response),savedAt:Date.now()});
     if(row.area==='products')tr.objectStore('snapshots').put({key:key(who,'productMap'),value:productMap,savedAt:Date.now()});
     tr.objectStore('outbox').delete(row.id);
    });
    sent++;
    signal({area:row.area,synced:true});
   }catch(error){
    if(!error.status||error.status>=500||[401,403,408,425,429].includes(error.status))break;
    // Keep conflicts and invalid mutations visible, never silently lose them.
    await tx('outbox','readwrite',tr=>tr.objectStore('outbox').put({...row,error:String(error.message||error)}));
    signal({area:row.area,error:String(error.message||error)});
    break;
   }
  }
  return {sent,pending:(await pending('',who)).length};
 })().finally(()=>{flushing=null});
 return flushing;
}
function init(who,auth){
 actor=['Рустам','Диана'].includes(who)?who:'';
 connected=null;
 if(typeof auth==='function')requestAuth=auth;
 if(actor)void flush().catch(()=>{});
 return actor;
}
for(const event of ['online','focus','pageshow','rudi-home-network-recovered','rudi-content-network-recovered','rudi-calendar-network-recovered'])
 root.addEventListener(event,()=>{if(actor)void flush().catch(()=>{})});
root.document?.addEventListener('visibilitychange',()=>{if(root.document.visibilityState==='visible'&&actor)void flush().catch(()=>{})});
setInterval(()=>{if(actor&&root.document?.visibilityState==='visible')void flush().catch(()=>{})},15000);
root.rudiOfflineTransactions={init,request,view,pending,flush,probe,isOffline:offline};
})(window);
