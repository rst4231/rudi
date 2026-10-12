'use strict';
const {authorizeRequest}=require('./partner-message.js');
const store=require('./meditation-store.cjs');
const {dailyQuote}=require('./meditation-quote.cjs');

async function handler(req,res,options={}){
 res.setHeader?.('Cache-Control','no-store, no-cache, must-revalidate');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
 try{
  const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  const {actor}=authorizeRequest(req,body.initData,options);
  if(!['Рустам','Диана'].includes(actor))return res.status(403).json({ok:false,error:'meditation-actor-forbidden'});
  const operation=String(body.operation||'state');
  if(operation==='state'){
   const own=await store.read(actor,options);
   // A user's partner may see only progress/summary, not private session notes.
   const other=actor==='Рустам'?'Диана':'Рустам';
   const partner=await store.read(other,options);
   const quote=await dailyQuote(options).catch(()=>null);
   return res.status(200).json({ok:true,actor,meditation:{...own,stats:store.stats(own)},
    partner:{actor:other,...store.publicSummary(partner)},quote});
  }
  if(operation==='overview'){
   const [rustam,diana]=await Promise.all([store.read('Рустам',options),store.read('Диана',options)]);
   return res.status(200).json({ok:true,actor,summary:{
    'Рустам':store.publicSummary(rustam),'Диана':store.publicSummary(diana)}});
  }
  if(operation==='start'){
   const saved=await store.start(actor,body.goalMinutes,options);
   return res.status(200).json({ok:true,actor,meditation:{...saved,stats:store.stats(saved)}});
  }
  if(operation==='finish'){
   const result=await store.finish(actor,body.activeId,body.auto===true,options);
   return res.status(200).json({ok:true,actor,session:result.session,alreadyFinished:result.alreadyFinished,
     meditation:{...result.state,stats:store.stats(result.state)}});
  }
  return res.status(400).json({ok:false,error:'meditation-operation-invalid'});
 }catch(error){
  const code=String(error?.message||error);
  if(code.includes('auth')||code.includes('unauthorized')||code.includes('session-'))return res.status(401).json({ok:false,error:code});
  if(code.includes('meditation-')&&(code.includes('invalid')||code.includes('not-active')||code.includes('already-active')))
   return res.status(409).json({ok:false,error:code});
  console.error('RUDI_MEDITATION_ERROR',code);
  return res.status(500).json({ok:false,error:'meditation-temporarily-unavailable'});
 }
}
module.exports=handler;
