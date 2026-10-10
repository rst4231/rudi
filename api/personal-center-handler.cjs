'use strict';
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const state=require('./personal-center-store.cjs');
const {WHO_SOURCE}=require('./personal-center-ai.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {readMoodHistory}=require('./daily-mood-store.cjs');
const {computeEmotionSignals}=require('./personal-center-emotions.cjs');
const {readCycleState,cycleViewForDate}=require('./cycle-store.cjs');
const MUTATIONS=new Set(['weight','profile','symptom','symptom-status','delete-entry','clear-category']);
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
 try{
  const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  const {actor}=authorizeRequest(req,body.initData);
  const operation=String(body.operation||'overview');
  if(operation==='status')return res.status(200).json({ok:true,actor,...await state.unread(actor)});
  if(operation==='overview'){
    const client=createRudiStateClient();
    const [data,latest,seen,cycle,mood]=await Promise.all([
      state.read(actor,{client}),state.latest(actor,{client}),client.getRecord(state.NS,'seen:'+actor),
      actor==='Диана'?readCycleState().catch(()=>null):Promise.resolve(null),
      readMoodHistory(actor).catch(()=>null),
    ]);
    const indicator={unread:Boolean(latest?.id&&latest.id!==seen?.value?.id)};
    const emotions=Array.isArray(mood)?computeEmotionSignals(mood):null;
    const knownVersion=Number(body.knownVersion),knownReportId=String(body.knownReportId||''),knownEmotionVersion=String(body.knownEmotionVersion||'');
    if(actor!=='Диана'&&knownVersion>=0&&knownVersion===data.version&&knownReportId===(latest?.id||'')&&knownEmotionVersion===(emotions?.version||'')){
      return res.status(200).json({ok:true,actor,unchanged:true});
    }
    return res.status(200).json({ok:true,actor,data:{...data,emotions},report:latest,indicator,cycle:actor==='Диана'&&cycle?{...cycleViewForDate(cycle,state.moscowDate()),cycleLengthDays:cycle.cycleLengthDays}:null,whoSource:WHO_SOURCE});
  }
  if(operation==='read-report'){await state.seen(actor);return res.status(200).json({ok:true});}
  if(operation==='history'){const history=await state.history(actor);return res.status(200).json({ok:true,actor,history});}
  if(operation==='erase'){const scope=String(body.scope||'');if(!['reports','all'].includes(scope))throw Error('invalid-delete');await state.erase(actor,scope);return res.status(200).json({ok:true});}
  if(MUTATIONS.has(operation)){const data=await state.mutate(actor,operation,body);if(operation==='delete-entry'||operation==='clear-category')await state.erase(actor,'reports');return res.status(200).json({ok:true,data});}
  return res.status(400).json({ok:false,error:'invalid-operation'});
 }catch(error){
  const message=String(error?.message||error),status=statusForError(error);const code=status!==500?status:message==='rudi-access-denied'?403:message.startsWith('invalid-')||message==='missing-symptom'?400:500;
  if(code>=500)console.error('RUDI_PERSONAL_CENTER_ERROR',message);
  return res.status(code).json({ok:false,error:code>=500?'server-error':message});
 }
};