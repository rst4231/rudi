const {authorizeRequest,statusForError}=require('./partner-message.js');
const {readHabits,viewHabits,addHabit,removeHabit,toggleHabit,setHabitsCollapsed}=require('./habit-tracker-store.cjs');

function statusFor(code,error){
  const auth=statusForError(error);if(auth!==500)return auth;
  if(code==='habit-not-found')return 404;
  if(code==='habit-duplicate')return 409;
  if(['habit-name-required','habit-id-required','habit-limit','habit-operation-invalid','habits-actor-invalid'].includes(code))return 400;
  if(code==='rudi-auth-db-unavailable')return 503;
  return 500;
}
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
    const {actor}=authorizeRequest(req,body.initData);
    const operation=String(body.operation||'list').trim();
    let state;
    if(operation==='list')state=await readHabits(actor);
    else if(operation==='add')state=await addHabit(actor,body.name);
    else if(operation==='remove')state=await removeHabit(actor,body.id);
    else if(operation==='toggle')state=await toggleHabit(actor,body.id);
    else if(operation==='collapse')state=await setHabitsCollapsed(actor,body.collapsed);
    else throw new Error('habit-operation-invalid');
    return res.status(200).json({ok:true,actor,...viewHabits(state)});
  }catch(error){
    const code=String(error?.message||error),status=statusFor(code,error);
    if(status===500)console.error('RUDI_HABITS_ERROR',code,error?.stack||'');
    return res.status(status).json({ok:false,error:code});
  }
}
module.exports=handler;
module.exports.handler=handler;
