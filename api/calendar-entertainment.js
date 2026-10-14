const {month}=require('./calendar-entertainment.cjs');
module.exports=async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const selected=req.method==='POST'?req.body?.month:req.query?.month;
    const payload=await month(selected);
    res.setHeader('Cache-Control','private, max-age=300');
    return res.status(200).json(payload);
  }catch(error){
    console.error('RUDI_CALENDAR_ENTERTAINMENT_ERROR',String(error?.message||error));
    return res.status(503).json({ok:false,error:'calendar-entertainment-unavailable'});
  }
};
