const {createBlobJsonStore}=require('./vercel-persistent-json.cjs');

async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const store=createBlobJsonStore();
    const auth=await store.auth();
    await store.read('health/probe');
    return res.status(200).json({
      ok:true,
      storage:'vercel-private-blob',
      auth:auth?.storeId?'oidc':'token',
    });
  }catch(error){
    console.error('RUDI_BLOB_HEALTH_ERROR',String(error?.detail||error?.message||error));
    return res.status(503).json({ok:false,error:'rudi-blob-unavailable'});
  }
}
module.exports=handler;
module.exports.handler=handler;
