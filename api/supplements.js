const {authorizeRequest,statusForError}=require('./partner-message.js');
const {readSupplements,addSupplement,removeSupplement,restoreSupplement,saveSupplementDescription}=require('./supplements-store.cjs');
const {generateSupplementDescription}=require('./supplement-ai.cjs');

function statusFor(code,error){
  const auth=statusForError(error);
  if(auth!==500)return auth;
  if(code==='supplement-not-found')return 404;
  if(code==='supplement-duplicate')return 409;
  if(code==='supplement-limit'||code==='supplement-name-required'||code==='supplement-id-required'||code==='supplement-restore-invalid'||code==='supplement-operation-invalid')return 400;
  if(code==='supplement-ai-quota')return 429;
  if(code.startsWith('supplement-ai-')||code==='groq-api-key-missing')return 502;
  return 500;
}
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    const {actor}=authorizeRequest(req,body.initData);
    const operation=String(body.operation||'list').trim();
    if(operation==='list'){const state=await readSupplements(actor);return res.status(200).json({ok:true,actor,items:state.items})}
    if(operation==='add'){const result=await addSupplement(actor,body.name);return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items})}
    if(operation==='remove'){const result=await removeSupplement(actor,body.id);return res.status(200).json({ok:true,actor,removed:result.removed,items:result.state.items})}
    if(operation==='restore'){const result=await restoreSupplement(actor,body.item);return res.status(200).json({ok:true,actor,item:result.item,items:result.state.items})}
    if(operation==='describe'){
      const state=await readSupplements(actor);
      const item=state.items.find(row=>row.id===String(body.id||'').trim());
      if(!item)throw new Error('supplement-not-found');
      if(item.description)return res.status(200).json({ok:true,actor,item,cached:true});
      const generated=await generateSupplementDescription(item.name);
      const saved=await saveSupplementDescription(actor,item.id,generated.description);
      return res.status(200).json({ok:true,actor,item:saved.item,cached:false,provider:generated.provider,model:generated.model});
    }
    throw new Error('supplement-operation-invalid');
  }catch(error){
    const code=String(error?.message||error),status=statusFor(code,error);
    if(status===500)console.error('RUDI_SUPPLEMENTS_ERROR',code);
    return res.status(status).json({ok:false,error:code});
  }
}
module.exports=handler;
module.exports.handler=handler;