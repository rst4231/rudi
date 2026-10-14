'use strict';
/* A single authenticated status read for both multiplayer games. No polling on server. */
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const {NS:DUEL_NS}=require('./duel-game.cjs');
const {NS:BATTLE_NS}=require('./battleship-game.cjs');
function summarize(room){
 return room?.status==='playing'?
  {active:true,turn:room.turn==='Диана'?'Диана':'Рустам',version:room.version||0}:
  {active:false,turn:null,version:room?.version||0};
}
function createHandler(deps={}){
 const auth=deps.authorizeRequest||authorizeRequest;
 const duel=deps.duelCache||createStrictRuntimeCache({namespace:DUEL_NS});
 const battle=deps.battleCache||createStrictRuntimeCache({namespace:BATTLE_NS});
 return async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  const input=req.body&&typeof req.body==='object'?req.body:{};
  let actor;
  try{actor=auth(req,input.initData).actor}
  catch(e){const code=statusForError(e);return res.status(code).json({ok:false,error:code>=500?'server-error':String(e.message||e)})}
  if(!['Рустам','Диана'].includes(actor))return res.status(403).json({ok:false,error:'games-forbidden'});
  try{
   const [a,b]=await Promise.all([duel.get('pair'),battle.get('pair')]);
   return res.status(200).json({ok:true,actor,duel:summarize(a),battleship:summarize(b)});
  }catch(e){console.warn('RUDI_GAME_STATUS_ERROR',String(e?.message||e));
   return res.status(503).json({ok:false,error:'game-status-unavailable'})}
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.summarize=summarize;