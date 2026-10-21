'use strict';
const {createHash}=require('node:crypto');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const walletKeys=require('./crypto-wallets.cjs');
const {createExchange,orderSize,stepValue}=require('./crypto-live-exchanges.cjs');
const CONFIG='rudi-crypto-live-config-v1',ORDERS='rudi-crypto-live-orders-v1',META='rudi-crypto-live-meta-v1',CLAIMS='rudi-crypto-live-claims-v1';
const PROVIDERS=['okx','pionex'],ACTIVE=['submitted','unknown','open','attention'];
const owner=actor=>{if(actor!=='Рустам')throw Error('crypto-owner-only');};
const providerOf=value=>{if(!PROVIDERS.includes(value))throw Error('live-provider-invalid');return value;};
const cid=(...parts)=>'rudi'+createHash('sha256').update(parts.join(':')).digest('hex').slice(0,24);
const day=at=>new Date(at).toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'});
const safeError=e=>/^live-[a-z-]+$/.test(String(e?.message||''))?e.message:'live-service-unavailable';
function riskSettings(input){
 const out={};
 for(const [name,min,max] of [['marginUsd',1,100000],['marginCapUsd',1,100000],['dailyLossUsd',1,100000],['leverage',1,5],['maxOpen',1,5],['slippagePct',0.05,2]]){
  const n=Number(input[name]);if(!Number.isFinite(n)||n<min||n>max||(['leverage','maxOpen'].includes(name)&&!Number.isInteger(n)))throw Error('live-risk-invalid');out[name]=n;
 }
 if(out.marginCapUsd<out.marginUsd)throw Error('live-risk-invalid');return out;
}
function eligibleSignal(s,cfg,now){
 const at=Date.parse(s?.at),activation=Date.parse(cfg.activatedAt);
 if(!Number.isInteger(Number(s?.id))||Number(s.id)<=0||!Number.isFinite(at)||at<=activation||at>now||now-at>20*60000)return 'live-signal-old';
 if(!/^[A-Z0-9]{2,24}$/.test(s.symbol)||s.market!=='linear'||s.conditional||!['long','short'].includes(s.direction))return 'live-signal-ambiguous';
 // Preserve the older OKX native-stop requirement, while Pionex may
 // copy a clearly actionable author signal without quoted prices or protection.
 // authorEntry is null when the Telegram post provided no entry price.
 const rawEntry=Object.hasOwn(s,'authorEntry')?s.authorEntry:s.entry;
 const level=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
 if([rawEntry,s.take,s.stop].some(v=>v!=null&&level(v)===null))return 'live-levels-invalid';
 const entry=level(rawEntry),take=level(s.take),stop=level(s.stop);
 if(cfg.provider!=='pionex'&&(!entry||!take||!stop))return 'live-protection-required';
 if(entry&&(s.direction==='long'?
    (stop!==null&&stop>=entry)||(take!==null&&take<=entry):
    (stop!==null&&stop<=entry)||(take!==null&&take>=entry)))return 'live-levels-invalid';
 if((s.events||[]).some(e=>['full-close','partial-close','author-claimed-tp','author-claimed-sl'].includes(e.type)))return 'live-author-closed';
 return '';
}
function dailyLoss(rows,provider,at){
 const today=day(at);return rows.filter(t=>t.provider===provider).reduce((sum,t)=>{
  let loss=0;
  if(t.closedAt&&day(t.closedAt)===today)loss=Math.max(0,-Number(t.realizedPnlUsd??t.grossPnlUsd??0))+(t.realizedPnlUsd==null?Number(t.feesUsd||0):0);
  else{
   if(ACTIVE.includes(t.state))loss+=Math.max(0,-Number(t.unrealizedPnlUsd||0));
   if(t.openedAt&&day(t.openedAt)===today)loss+=Number(t.entryFee||0);
   for(const e of t.exits||[])if(e.filledAt&&day(e.filledAt)===today)loss+=Math.max(0,-Number(e.filledQty||0)*(Number(e.avgPrice||0)-t.entryPrice)*(t.side==='Buy'?1:-1)*t.contractValue)+Number(e.fee||0);
  }
  return sum+loss;
 },0);
}
function createLiveService(deps={}){
 const client=deps.client||createRudiStateClient(),now=deps.now||Date.now,exchangeFactory=deps.exchangeFactory||createExchange;
 const readSignals=deps.readSignals||require('./crypto-signals.cjs').readLiveSignals;
 const encrypt=deps.encrypt||((key,secret,passphrase)=>walletKeys.encryptSecret(key,JSON.stringify({apiSecret:secret,passphrase})));
 const decrypt=deps.decrypt||(value=>{const raw=walletKeys.decryptSecret(value);return {apiKey:raw.apiKey,...JSON.parse(raw.apiSecret)};});
 const get=async(ns,key)=>(await client.getRecord(ns,key))?.value||null;
 const put=async(ns,key,value)=>client.setRecord({namespace:ns,key,value,tags:['rudi-crypto-live'],expires_at:null,updated_at:new Date(now()).toISOString()});
 const trades=async()=> (await client.list(ORDERS)).map(r=>r.value).filter(Boolean);
 const config=async p=>{const c=(await get(CONFIG,p))||{provider:p,enabled:false,connected:false},pause=await get(META,'pause-'+p);return {...c,controlToken:pause?.token||'',enabled:c.enabled===true&&(c.pauseToken||'')===(pause?.token||'')};};
 async function locked(p,fn){
  const started=Date.now(),token=cid(p,Math.random());
  if(!await client.setIfAbsent(META,'lease-'+p,{token},{expiresAt:new Date(now()+80000).toISOString()}))throw Error('live-busy');
  try{return await fn();}finally{if(Date.now()-started<50000)await client.remove(META,'lease-'+p).catch(()=>{});}
 }
 const apiFor=(p,cfg,deadlineAt)=>exchangeFactory(p,decrypt(cfg.secret),{deadlineAt});
 async function archivePaper(signals,settings){
  const old=await get(META,'archive-paper');if(old?.paper)return old.paper;
  await client.setIfAbsent(META,'archive',{at:new Date(now()).toISOString()});
  const cutoff=(await get(META,'archive'))?.at||new Date(now()).toISOString();
  const simulate=deps.simulateVirtual||require('./crypto-virtual.cjs').simulateVirtual;
  const paper=simulate((signals.signals||[]).filter(s=>Date.parse(s.at)<=Date.parse(cutoff)),settings);
  await client.setIfAbsent(META,'archive-paper',{at:cutoff,paper,settings});
  return (await get(META,'archive-paper')).paper;
 }
 async function scheduler(){const row=await get(META,'heartbeat');return {lastAt:row?.at||'',healthy:Boolean(row?.at&&now()-Date.parse(row.at)<3*60000),configured:Boolean(deps.schedulerConfigured??process.env.CRON_SECRET)};}
 function publicConfig(c,status){return {provider:c.provider,connected:Boolean(c.secret),enabled:c.enabled===true,activatedAt:c.activatedAt||'',settings:c.settings||{},programmaticStops:c.programmaticStops===true,status:status||null};}
 async function report(actor,options={}){
  owner(actor);
  await client.setIfAbsent(META,'archive',{at:new Date(now()).toISOString()});
  const [rows,schedule,archive]=await Promise.all([trades(),scheduler(),get(META,'archive')]);
  const accounts=await Promise.all(PROVIDERS.map(async p=>{
   const c=await config(p);let status=await get(META,'status-'+p);
   if(options.refreshBalances&&c.secret&&(!status?.at||now()-Date.parse(status.at)>30000)&&await client.setIfAbsent(META,'balance-lease-'+p,{at:now()},{expiresAt:new Date(now()+15000).toISOString()})){
    try{const api=apiFor(p,c,Date.now()+14000),[balance,positions]=await Promise.all([api.balance(),api.positions()]);status={...status,...balance,positions,verified:true,at:new Date(now()).toISOString(),error:''};}
    catch(e){status={...status,verified:false,error:safeError(e),at:new Date(now()).toISOString()};}
    await put(META,'status-'+p,status);
   }
   return publicConfig(c,status);
  }));
  const safeRows=rows.map(t=>{const copy={...t};delete copy.secret;return copy;}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return {accounts,trades:safeRows.slice(0,200),scheduler:schedule,archiveAt:archive?.at||new Date(now()).toISOString()};
 }
 async function connect(actor,input){
  owner(actor);const p=providerOf(input.provider);return locked(p,async()=>{const old=await config(p),rows=await trades();
  if(old.enabled||rows.some(t=>t.provider===p&&ACTIVE.includes(t.state)))throw Error('live-open-positions');
  const apiKey=String(input.apiKey||'').trim(),apiSecret=String(input.apiSecret||'').trim(),passphrase=String(input.passphrase||'');
  if(!/^[\w-]{8,150}$/.test(apiKey)||!/^\S{8,200}$/.test(apiSecret)||(p==='okx'&&(!passphrase||passphrase.length>100||/[\r\n\x00]/.test(passphrase))))throw Error('live-key-invalid');
  const account=await exchangeFactory(p,{apiKey,apiSecret,passphrase},{deadlineAt:Date.now()+20000}).inspect();
  const c={...old,provider:p,secret:encrypt(apiKey,apiSecret,passphrase),enabled:false,connectedAt:new Date(now()).toISOString()};
  await put(CONFIG,p,c);await put(META,'status-'+p,{...account,at:new Date(now()).toISOString(),error:account.verified===false?'live-account-unverified':'',message:account.verified===false?'':'live-connected'});
  return publicConfig(c);});
 }
 async function configure(actor,input){
  owner(actor);const p=providerOf(input.provider);return locked(p,async()=>{const c=await config(p);if(!c.secret)throw Error('live-not-connected');
  const settings=riskSettings(input);if(input.enabled===true){
   if(input.tradeConsent!==true)throw Error('live-consent-required');
   // Never enable real entries if account balances or open exposure could not be verified.
   const checked=await apiFor(p,c,Date.now()+18000).inspect();
   if(checked.verified!==true)throw Error('live-account-unverified');
   await put(META,'status-'+p,{...checked,at:new Date(now()).toISOString(),error:''});
   if(!(await scheduler()).healthy)throw Error('live-scheduler-stale');
   if(p==='pionex'&&input.programmaticStops!==true)throw Error('live-programmatic-consent');
   if((await trades()).some(t=>t.provider===p&&['unknown','submitted','attention'].includes(t.state)))throw Error('live-review-required');
  }
  const enabled=input.enabled===true;
  const next={...c,settings,enabled,pauseToken:c.controlToken,closeRequestedAt:enabled?'':c.closeRequestedAt||'',programmaticStops:input.programmaticStops===true,activatedAt:enabled&&!c.enabled?new Date(now()).toISOString():c.activatedAt||'',revision:cid(now(),Math.random())};
  await put(CONFIG,p,next);return publicConfig(await config(p));});
 }
 async function pause(actor,p){owner(actor);providerOf(p);await put(META,'pause-'+p,{token:cid(now(),Math.random()),at:new Date(now()).toISOString()});return true;}
 async function disconnect(actor,p){
  owner(actor);providerOf(p);await pause(actor,p);
  return locked(p,async()=>{if((await trades()).some(t=>t.provider===p&&ACTIVE.includes(t.state)))throw Error('live-open-positions');
  await client.remove(CONFIG,p);await client.remove(META,'status-'+p);return true;});
 }
 async function saveTrade(t){t.updatedAt=new Date(now()).toISOString();await put(ORDERS,t.key,t);}
 async function reconcile(t,api){
  if(['submitted','unknown'].includes(t.state)){
   const o=await api.findOrder(t.symbol,t.clientId,t.orderId);if(!o){t.state='unknown';await saveTrade(t);return;}
   if(!o.closed){t.state='submitted';await saveTrade(t);return;}
   t.orderId=o.orderId;t.entryFee=o.fee;t.feesKnown=o.feesKnown!==false;t.entryQty=o.filledQty;t.remainingQty=o.filledQty;t.entryPrice=o.avgPrice;
   if(o.filledQty>0)t.marginUsd=o.filledQty*o.avgPrice*t.contractValue/t.leverage;
   t.state=o.filledQty>0?'open':'not-filled';t.openedAt=t.openedAt||new Date(now()).toISOString();await saveTrade(t);
  }
  for(const e of t.exits||[]){
   if(e.closed)continue;const o=await api.findOrder(t.symbol,e.clientId,e.orderId);if(!o)continue;
   if(o.filledQty>0&&!e.filledAt)e.filledAt=new Date(now()).toISOString();
   if(o.feesKnown===false)t.feesKnown=false;
   e.filledQty=o.filledQty;e.avgPrice=o.avgPrice;e.fee=o.fee;e.closed=o.closed;
  }
  if(t.entryQty){
   const exited=(t.exits||[]).reduce((a,e)=>a+Number(e.filledQty||0),0);
   t.remainingQty=Math.max(0,t.entryQty-exited);
   const sign=t.side==='Buy'?1:-1;
   t.grossPnlUsd=(t.exits||[]).reduce((a,e)=>a+Number(e.filledQty||0)*(Number(e.avgPrice||0)-t.entryPrice)*sign*t.contractValue,0);
   t.feesUsd=Number(t.entryFee||0)+(t.exits||[]).reduce((a,e)=>a+Number(e.fee||0),0);
   if(t.remainingQty<Number(t.qtyStep)/2){t.state='closed';t.unrealizedPnlUsd=0;t.closedAt=t.closedAt||new Date(now()).toISOString();}
   await saveTrade(t);
  }
 }
 async function close(t,api,position,trigger,fraction=1,authorExitPrice=null){
  if((t.exits||[]).some(e=>!e.closed))return;
  const existing=(t.exits||[]).filter(e=>e.trigger===trigger);
  if(fraction<1&&existing.length)return;
  if(authorExitPrice&&existing.length>=3){t.state='attention';t.error='live-author-exit-unfilled';await saveTrade(t);return;}
  const desired=Math.min(position.qty,t.remainingQty)*fraction;
  // Market exits honour the separate Pionex market-order cap. Large exits are
  // completed across successive confirmed minute ticks, never over-sized.
  const marketCap=!authorExitPrice&&Number(t.marketMaxQty)>0?Number(t.marketMaxQty):Infinity;
  const qty=stepValue(Math.min(desired,marketCap),t.qtyStep);
  if(!(Number(qty)>0))return;
  const priceStep=authorExitPrice?(t.priceStep||(await api.instrument(t.symbol)).priceStep):null;
  const price=authorExitPrice?stepValue(Number(authorExitPrice),priceStep,t.side==='Sell'):null;
  const clientId=cid(t.clientId,trigger,existing.length),exit={clientId,trigger,qty,filledQty:0,closed:false,...(price?{limitPrice:price}:{})};
  const inserted=await client.setIfAbsent(CLAIMS,clientId,{tradeKey:t.key,at:new Date(now()).toISOString()});
  t.exits=t.exits||[];t.exits.push(exit);await saveTrade(t);
  if(!inserted){await reconcile(t,api);return;}
  try{const r=await api.place({symbol:t.symbol,side:t.side==='Buy'?'Sell':'Buy',qty,clientId,reduceOnly:true,...(price?{price}:{})});exit.orderId=r.orderId;}
  catch(e){exit.error=safeError(e);if(['live-deadline','live-order-invalid','live-protection-required','live-exchange-rejected','live-key-permission','live-rate-limited','live-access-blocked'].includes(exit.error)){exit.closed=true;exit.filledQty=0;}await saveTrade(t);throw e;}
  await saveTrade(t);await reconcile(t,api);
 }
 async function run(options={}){
  const at=new Date(now()).toISOString();
  const failures=[];
  const configs=await Promise.all(PROVIDERS.map(config)),rows=await trades();
  // Idle ticks must still report a genuine scheduler heartbeat without
  // spending request time loading signals for disabled accounts.
  const hasWork=configs.some(c=>c.secret&&(c.enabled||rows.some(t=>t.provider===c.provider&&ACTIVE.includes(t.state))));
  if(!hasWork){if(options.scheduled)await put(META,'heartbeat',{at});return {ok:true,checkedAt:at,idle:true};}
  const activeIds=[...new Set(rows.filter(t=>ACTIVE.includes(t.state)).map(t=>String(t.signalId)))];
  let feed;try{feed=await readSignals({activeSignalIds:activeIds});}catch(_){feed={sourceError:true,signals:[]};}
  if(feed.sourceError)failures.push('live-author-feed-unavailable');
  for(const initial of configs){
   let cfg=initial;
   const p=cfg.provider,owned=rows.filter(t=>t.provider===p&&ACTIVE.includes(t.state));
   if(!cfg.secret||(!cfg.enabled&&!owned.length))continue;
   if(!await client.setIfAbsent(META,'lease-'+p,{at},{expiresAt:new Date(now()+80000).toISOString()}))continue;
   cfg=await config(p);
   if(!cfg.secret||(!cfg.enabled&&!owned.length)){await client.remove(META,'lease-'+p).catch(()=>{});continue;}
   const leaseStarted=Date.now(),deadlineAt=Date.now()+24000,api=apiFor(p,cfg,deadlineAt);
   let status={at,error:'',message:''};
   try{
    const [account,positions]=await Promise.all([api.balance(),api.positions()]);
    status={...status,...account,positions,verified:true};
    let blocked=false;
    for(const t of owned){
     if(Date.now()>=deadlineAt-1000)throw Error('live-deadline');
     await reconcile(t,api);
     if(['submitted','unknown'].includes(t.state)){blocked=true;continue;}
     if(t.state!=='open'&&t.state!=='attention')continue;
     const pos=positions.find(r=>r.symbol===t.symbol);
     if(!pos){
      const result=api.closedResult?await api.closedResult(t):null;
      t.state='closed-external';t.unrealizedPnlUsd=0;t.closedAt=new Date(now()).toISOString();t.realizedPnlUsd=result?.pnl??null;
      await saveTrade(t);if(t.realizedPnlUsd===null)blocked=true;continue;
     }
     if(!t.positionId&&pos.positionId&&pos.positionOpenedAt&&Math.abs(Date.parse(pos.positionOpenedAt)-Date.parse(t.createdAt))<5000&&pos.side===t.side&&Math.abs(pos.qty-t.remainingQty)<Number(t.qtyStep)/2){t.positionId=pos.positionId;t.positionOpenedAt=pos.positionOpenedAt;}
     if(!t.positionId||!pos.positionId||pos.positionId!==t.positionId||(t.positionOpenedAt&&pos.positionOpenedAt!==t.positionOpenedAt)||pos.side!==t.side||Math.abs(pos.qty-t.remainingQty)>Number(t.qtyStep)/2){t.state='attention';t.error='live-position-changed';await saveTrade(t);blocked=true;continue;}
     t.state='open';t.unrealizedPnlUsd=pos.unrealizedPnl;t.markPrice=pos.markPrice;
     if((t.exits||[]).some(e=>!e.closed)){blocked=true;await saveTrade(t);continue;}
     if(t.marginLimitUsd&&t.marginUsd>t.marginLimitUsd+1e-8){await close(t,api,pos,'margin-limit');blocked=true;continue;}
     const signal=(feed.signals||[]).find(s=>String(s.id)===String(t.signalId));
     const events=(signal?.events||[]).filter(e=>Date.parse(e.at)>=Date.parse(t.openedAt||t.createdAt)&&Date.parse(e.at)<=now());
     const applied=new Set(t.appliedLevelEvents||[]);
     for(const e of events){
      if(applied.has(String(e.id)))continue;
      let next=null,kind=null;
      if(e.type==='stop-to-breakeven'&&Number(t.entryPrice)>0){next=Number(t.entryPrice);kind='stop';}
      else if(e.type==='stop-level-update'&&Number(e.levelPrice)>0){next=Number(e.levelPrice);kind='stop';}
      else if(e.type==='take-level-update'&&Number(e.levelPrice)>0){next=Number(e.levelPrice);kind='take';}
      if(!kind)continue;
      if(!Number.isFinite(next)||next<=0){blocked=true;continue;}
      t[kind]=next;applied.add(String(e.id));
     }
     if(applied.size!==(t.appliedLevelEvents||[]).length){
      t.appliedLevelEvents=[...applied].slice(-80);await saveTrade(t);
     }
     const full=events.find(e=>['full-close','author-claimed-tp','author-claimed-sl'].includes(e.type));
     const stop=Number(t.stop)>0&&(t.side==='Buy'?pos.markPrice<=Number(t.stop):pos.markPrice>=Number(t.stop));
     const take=Number(t.take)>0&&(t.side==='Buy'?pos.markPrice>=Number(t.take):pos.markPrice<=Number(t.take));
     if(cfg.closeRequestedAt||full||stop||take){
      await close(t,api,pos,cfg.closeRequestedAt?'manual-close-'+cfg.closeRequestedAt:full?'author-'+full.id:stop?'stop':'take',1,
        full?Number(full.exitPrice)||null:null);continue;
     }
     const partial=events.find(e=>e.type==='partial-close'&&Number(e.closeFraction)>0&&Number(e.closeFraction)<1&&!(t.exits||[]).some(x=>x.trigger==='author-'+e.id));
     if(partial){await close(t,api,pos,'author-'+partial.id,Number(partial.closeFraction));continue;}
     if(p==='okx'&&!t.protected){
      try{await api.protect(t);t.protected=true;}catch(e){await close(t,api,pos,'protection-failed');throw e;}
     }
     await saveTrade(t);
    }
    const today=day(now()),todayClosed=rows.filter(t=>t.provider===p&&t.closedAt&&day(t.closedAt)===today);
    const unknownLoss=todayClosed.some(t=>t.state==='closed-external'&&t.realizedPnlUsd===null);
    const lossToday=dailyLoss(rows,p,now());
    status.dailyLossUsd=lossToday;
    const open=rows.filter(t=>t.provider===p&&ACTIVE.includes(t.state));
    if(cfg.settings&&lossToday>=cfg.settings.dailyLossUsd){
     status.message='live-daily-loss';
     for(const t of open.filter(t=>t.state==='open')){const pos=positions.find(r=>r.symbol===t.symbol);if(pos)await close(t,api,pos,'daily-loss');}
     blocked=true;
    }
    const current=await config(p);
    if(!current.enabled||!current.settings)continue;
    if(blocked||unknownLoss||rows.some(t=>t.provider===p&&t.feesKnown===false&&day(t.createdAt)===today)){status.message=status.message||'live-review-required';continue;}
    if(feed.sourceError||!feed.updatedAt||now()-Date.parse(feed.updatedAt)>20*60000){status.message='live-source-stale';failures.push('live-source-stale');continue;}
    const limits=current.settings;
    if(open.length>=limits.maxOpen||open.reduce((a,t)=>a+t.marginUsd,0)+limits.marginUsd>limits.marginCapUsd){status.message='live-position-limit';continue;}
    const candidates=(feed.signals||[]).slice().sort((a,b)=>a.at.localeCompare(b.at));
    let candidate=null;
    for(const s of candidates){
     const reason=eligibleSignal(s,current,now());
     if(reason){if(Date.parse(s.at)>Date.parse(current.activatedAt))status.message=reason;continue;}
     const key=p+'-'+s.id;
     if(rows.some(t=>t.key===key)||await get(ORDERS,key))continue;
     if(positions.some(t=>t.symbol===s.symbol+'USDT')){status.message='live-existing-position';continue;}
     candidate=s;break;
    }
    if(!candidate)continue;
    const s=candidate,symbol=s.symbol+'USDT';
    const [rule,price]=await Promise.all([api.instrument(symbol),api.price(symbol)]);
    if(limits.leverage>Number(rule.maxLeverage))throw Error('live-leverage-invalid');
    // Explicit author price: bounded IOC. Missing author price: market order.
    const sourceEntry=Object.hasOwn(s,'authorEntry')?s.authorEntry:s.entry;
    const authorEntry=Number(sourceEntry)>0?Number(sourceEntry):null;
    if(authorEntry&&Math.abs(price/authorEntry-1)*100>limits.slippagePct){status.message='live-price-moved';continue;}
    const takeLevel=Number(s.take)>0?Number(s.take):null;
    const stopLevel=Number(s.stop)>0?Number(s.stop):null;
    if(s.direction==='long'?
       (stopLevel!==null&&price<=stopLevel)||(takeLevel!==null&&price>=takeLevel):
       (stopLevel!==null&&price>=stopLevel)||(takeLevel!==null&&price<=takeLevel)){
      status.message='live-levels-passed';continue;
    }
    // Marketable IOC executes immediately near the quote, but cannot
    // slip beyond the configured deviation as an unbounded MARKET_QTY can.
    const reference=authorEntry===null?price:authorEntry;
    const limit=Number(stepValue(reference*(1+(s.direction==='long'?1:-1)*limits.slippagePct/100),
      rule.priceStep,s.direction==='long'));
    // Sizing is computed against a conservative quote; the fill can vary.
    const sizingPrice=Math.max(price*(1+limits.slippagePct/100),limit||0,
      authorEntry?authorEntry*(1+limits.slippagePct/100):0);
    const qty=orderSize(limits.marginUsd*limits.leverage,sizingPrice,rule);
    const margin=Number(qty)*sizingPrice*Number(rule.contractValue)/limits.leverage;
    if(account.available<margin*1.01){status.message='live-insufficient-balance';continue;}
    const take=takeLevel===null?null:stepValue(takeLevel,rule.priceStep,s.direction==='short');
    const stop=stopLevel===null?null:stepValue(stopLevel,rule.priceStep,s.direction==='long');
    const target=limit||price;
    if(s.direction==='long'?
       (stop!==null&&!(Number(stop)<target))||(take!==null&&!(target<Number(take))):
       (take!==null&&!(Number(take)<target))||(stop!==null&&!(target<Number(stop)))){
      status.message='live-levels-passed';continue;
    }
    await api.leverage(symbol,limits.leverage);
    // Re-read both activation and credentials revision immediately before claim.
    const fresh=await config(p);if(!fresh.enabled||fresh.revision!==cfg.revision||fresh.secret!==cfg.secret)continue;
    const key=p+'-'+s.id,clientId=cid(p,s.id),t={key,provider:p,signalId:s.id,symbol,side:s.direction==='long'?'Buy':'Sell',clientId,
     state:'submitted',createdAt:new Date(now()).toISOString(),entryQty:0,remainingQty:0,marginUsd:margin,marginLimitUsd:limits.marginUsd,leverage:limits.leverage,qtyStep:rule.qtyStep,priceStep:rule.priceStep,marketMaxQty:rule.marketMaxQty,contractValue:Number(rule.contractValue),take,stop,exits:[]};
    if(!await client.setIfAbsent(ORDERS,key,t))continue;
    let accepted=false;
    try{const result=await api.place({symbol,side:t.side,qty,...(limit===null?{}:{price:String(limit)}),clientId,take,stop});accepted=true;t.orderId=result.orderId;await saveTrade(t);await reconcile(t,api);}
    catch(e){t.state=!accepted&&['live-exchange-rejected','live-key-permission','live-rate-limited','live-access-blocked'].includes(safeError(e))?'failed':'unknown';t.error=safeError(e);await saveTrade(t);throw e;}
    let newPosition=null;
    if(t.state==='open'){
     const actual=(await api.positions()).find(pos=>pos.symbol===t.symbol&&pos.side===t.side&&Math.abs(pos.qty-t.remainingQty)<Number(t.qtyStep)/2);
     if(actual?.positionId){newPosition=actual;t.positionId=actual.positionId;t.positionOpenedAt=actual.positionOpenedAt||'';}else{t.state='attention';t.error='live-position-identity-missing';}
     await saveTrade(t);
    }
    if(t.state==='open'&&newPosition&&t.marginUsd>limits.marginUsd+1e-8){await close(t,api,newPosition,'margin-limit');status.message='live-margin-limit';continue;}
    if(t.state==='open'&&p==='okx'){
     try{await api.protect(t);t.protected=true;await saveTrade(t);}catch(e){status.error=safeError(e);if(newPosition)await close(t,api,newPosition,'protection-failed');}
    }
    status.message='live-order-sent';
   }catch(e){status.error=safeError(e);status.verified=false;failures.push(p+':'+status.error);}
   finally{await put(META,'status-'+p,status);if(Date.now()-leaseStarted<50000)await client.remove(META,'lease-'+p).catch(()=>{});}
  }
  const ok=failures.length===0;
  if(ok&&options.scheduled)await put(META,'heartbeat',{at});
  return {ok,checkedAt:at,...(ok?{}:{error:'live-runtime-degraded',failures})};
 }
 async function requestClose(actor,p){owner(actor);providerOf(p);await pause(actor,p);return locked(p,async()=>{const c=await config(p);if(!c.secret)throw Error('live-not-connected');await put(CONFIG,p,{...c,enabled:false,closeRequestedAt:new Date(now()).toISOString()});return true;});}
 return {report,archivePaper,connect,configure,pause,disconnect,requestClose,run};
}
module.exports={createLiveService,eligibleSignal,riskSettings,dailyLoss,CONFIG,ORDERS,META,CLAIMS,...createLiveService()};
