const crypto=require('node:crypto');
const {authorizeRequest,statusForError}=require('./partner-message.js');
const {
  readSupplements,addSupplement,removeSupplement,restoreSupplement,updateSupplement,
  markSupplementTaken,addSupplementNote,saveSupplementDescription,saveDailyRecommendation,saveInteractionCheck
}=require('./supplements-store.cjs');
const {generateSupplementDescription,generateDailyProfileRecommendation,analyzeSupplementSet}=require('./supplement-ai.cjs');
const {profileContext}=require('./personal-profile-context.cjs');

function statusFor(code,error){
  const auth=statusForError(error);if(auth!==500)return auth;
  if(code==='supplement-not-found')return 404;
  if(code==='supplement-duplicate')return 409;
  if(code==='supplement-ai-quota')return 429;
  if([
    'supplement-limit','supplement-name-required','supplement-id-required','supplement-restore-invalid',
    'supplement-operation-invalid','supplement-note-required','supplement-interaction-invalid'
  ].includes(code))return 400;
  if(code.startsWith('supplement-ai-')||code==='groq-api-key-missing')return 502;
  return 500;
}
function moscowDateKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
function interactionFingerprint(items){
  const active=(Array.isArray(items)?items:[]).filter(x=>x.status==='active').map(x=>({id:x.id,name:x.name,goal:x.goal,schedule:x.schedule,ingredients:x.ingredients})).sort((a,b)=>a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify(active)).digest('hex');
}
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    const {actor}=authorizeRequest(req,body.initData);
    const operation=String(body.operation||'list').trim();

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
    if(operation==='note'){
      const result=await addSupplementNote(actor,body.id,body.text);
      return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items,note:result.note});
    }
    if(operation==='describe'){
      const state=await readSupplements(actor),item=state.items.find(row=>row.id===String(body.id||'').trim());
      if(!item)throw new Error('supplement-not-found');
      if(item.description&&item.evidenceLevel)return res.status(200).json({ok:true,actor,item,cached:true});
      const generated=await generateSupplementDescription(item.name);
      const saved=await saveSupplementDescription(actor,item.id,generated);
      return res.status(200).json({ok:true,actor,item:saved.item,cached:false,provider:generated.provider,model:generated.model});
    }
    if(operation==='interactions'){
      const state=await readSupplements(actor),active=state.items.filter(item=>item.status==='active'),fingerprint=interactionFingerprint(active);
      if(state.interactionCheck?.fingerprint===fingerprint)return res.status(200).json({ok:true,actor,interactionCheck:state.interactionCheck,cached:true});
      if(active.length<2){
        const simple={fingerprint,summary:'Для проверки сочетаний нужно минимум две активные позиции.',warnings:[],duplicates:[]};
        const saved=await saveInteractionCheck(actor,simple);
        return res.status(200).json({ok:true,actor,interactionCheck:saved.interactionCheck,cached:false});
      }
      const generated=await analyzeSupplementSet(active);
      const saved=await saveInteractionCheck(actor,{fingerprint,...generated});
      return res.status(200).json({ok:true,actor,interactionCheck:saved.interactionCheck,cached:false,provider:generated.provider,model:generated.model});
    }
    if(operation==='recommendation'){
      const profile=profileContext(actor),date=moscowDateKey(),state=await readSupplements(actor);
      if(state.recommendation?.date===date&&state.recommendation?.age===profile.age&&state.recommendation?.sex===profile.sex){
        return res.status(200).json({ok:true,actor,profile,recommendation:state.recommendation,cached:true});
      }
      const generated=await generateDailyProfileRecommendation(profile);
      const saved=await saveDailyRecommendation(actor,{date,text:generated.recommendation,age:profile.age,sex:profile.sex});
      return res.status(200).json({ok:true,actor,profile,recommendation:saved.recommendation,cached:false,provider:generated.provider,model:generated.model});
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