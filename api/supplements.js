const crypto=require('node:crypto');
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {
  readSupplements,addSupplement,removeSupplement,restoreSupplement,updateSupplement,
  markSupplementTaken,unmarkSupplementTaken,markSupplementSkipped,addSupplementNote,saveSupplementDescription,saveDailyRecommendation,saveInteractionCheck
}=require('./supplements-store.cjs');
const {generateSupplementDescription,analyzeSupplementSet}=require('./supplement-ai.cjs');
const {profileContext}=require('./personal-profile-context.cjs');

function statusFor(code,error){
  const auth=statusForError(error);if(auth!==500)return auth;
  if(code==='supplement-not-found')return 404;
  if(code==='supplement-duplicate'||code==='supplement-already-taken')return 409;
  if(code==='supplement-ai-quota')return 429;
  if([
    'supplement-limit','supplement-name-required','supplement-id-required','supplement-restore-invalid',
    'supplement-operation-invalid','supplement-note-required','supplement-interaction-invalid','supplement-interaction-selection-required'
  ].includes(code))return 400;
  if(code.startsWith('supplement-ai-')||code==='groq-api-key-missing')return 502;
  return 500;
}
function moscowDateKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
function interactionFingerprint(items){
  const selected=(Array.isArray(items)?items:[]).map(x=>({id:x.id,name:x.name,goal:x.goal,schedule:x.schedule,ingredients:x.ingredients,status:x.status})).sort((a,b)=>a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify(selected)).digest('hex');
}
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    const {actor}=authorizeRequest(req,body.initData);
    const operation=String(body.operation||'list').trim();

    if(operation==='overview'){
      const today=moscowDateKey();
      const [rustamState,dianaState]=await Promise.all([readSupplements('Рустам'),readSupplements('Диана')]);
      const buildRows=(state)=>state.items.flatMap(item=>(item.intakes||[])
        .filter(intake=>intake.date===today)
        .map(intake=>({id:item.id,name:item.name,at:intake.at,status:item.status}))
      ).filter(row=>row.at).sort((a,b)=>String(a.at).localeCompare(String(b.at)));
      const buildProgress=(state)=>{
        const active=state.items.filter(item=>item.status==='active');let taken=0,total=0;
        for(const item of active){const target=Math.max(1,Math.min(12,Math.round(Number(item.schedule?.timesPerDay)||1))),count=(item.intakes||[]).filter(intake=>intake.date===today).length;total+=target;taken+=Math.min(target,count)}
        return {taken,total};
      };
      return res.status(200).json({
        ok:true,
        actor,
        today,
        actors:{'Рустам':buildRows(rustamState),'Диана':buildRows(dianaState)},
        progress:{'Рустам':buildProgress(rustamState),'Диана':buildProgress(dianaState)}
      });
    }
    if(operation==='list'){
      const state=await readSupplements(actor);
      return res.status(200).json({ok:true,actor,profile:profileContext(actor),items:state.items,recommendation:state.recommendation,interactionCheck:state.interactionCheck});
    }
    if(operation==='add'){
      const result=await addSupplement(actor,body.name);
      return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items});
    }
    if(operation==='remove'){
      const result=await removeSupplement(actor,body.id);
      return res.status(200).json({ok:true,actor,removed:result.removed,items:result.state.items});
    }
    if(operation==='restore'){
      const result=await restoreSupplement(actor,body.item);
      return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items});
    }
    if(operation==='update'){
      const result=await updateSupplement(actor,body.id,body.patch);
      return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items});
    }
    if(operation==='take'){
      const result=await markSupplementTaken(actor,body.id);
      return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items,duplicate:result.duplicate,date:result.date});
    }
    if(operation==='untake'){
      const result=await unmarkSupplementTaken(actor,body.id);
      return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items,duplicate:result.duplicate,date:result.date});
    }
    if(operation==='skip'){
      const result=await markSupplementSkipped(actor,body.id);
      return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items,duplicate:result.duplicate,date:result.date});
    }
    if(operation==='note'){
      const result=await addSupplementNote(actor,body.id,body.text);
      return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items,note:result.note});
    }
    if(operation==='describe'){
      const state=await readSupplements(actor),item=state.items.find(row=>row.id===String(body.id||'').trim());
      if(!item)throw new Error('supplement-not-found');
      if(item.description&&item.evidenceLevel&&item.intakeGuidance)return res.status(200).json({ok:true,actor,item,cached:true});
      const generated=await generateSupplementDescription(item.name);
      const saved=await saveSupplementDescription(actor,item.id,{
        description:item.description||generated.description,
        intakeGuidance:item.intakeGuidance||generated.intakeGuidance,
        evidenceLevel:item.evidenceLevel||generated.evidenceLevel,
        ingredients:(Array.isArray(item.ingredients)&&item.ingredients.length)?item.ingredients:generated.ingredients
      });
      return res.status(200).json({ok:true,actor,item:saved.item,cached:false,provider:generated.provider,model:generated.model});
    }
    if(operation==='interactions'){
      const state=await readSupplements(actor);
      const selectedIds=[...new Set((Array.isArray(body.selectedIds)?body.selectedIds:[]).map(value=>String(value||'').trim()).filter(Boolean))].slice(0,20);
      const selected=state.items.filter(item=>selectedIds.includes(item.id));
      if(selected.length<2)throw new Error('supplement-interaction-selection-required');
      const fingerprint=interactionFingerprint(selected);
      if(state.interactionCheck?.fingerprint===fingerprint)return res.status(200).json({ok:true,actor,interactionCheck:state.interactionCheck,selectedIds:selected.map(item=>item.id),cached:true});
      const generated=await analyzeSupplementSet(selected);
      const saved=await saveInteractionCheck(actor,{fingerprint,...generated});
      return res.status(200).json({ok:true,actor,interactionCheck:saved.interactionCheck,selectedIds:selected.map(item=>item.id),cached:false,provider:generated.provider,model:generated.model});
    }
    throw new Error('supplement-operation-invalid');
  }catch(error){
    const code=String(error?.message||error),status=statusFor(code,error);
    if(status===500)console.error('RUDI_SUPPLEMENTS_ERROR',code,error?.stack||'');
    return res.status(status).json({ok:false,error:code});
  }
}
module.exports=handler;
module.exports.handler=handler;
module.exports.interactionFingerprint=interactionFingerprint;