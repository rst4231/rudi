'use strict';
/* RUDI: authenticated shared sea-battle, never reveal opponent ships mid-game. */
const crypto=require('node:crypto');
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const NS='rudi-sea-battle-v1',ROOM='pair',LOCK='pair-lock',TTL=86400*90;
const PLAYERS=['Рустам','Диана'],SIZE=10,LENGTHS=[4,3,3,2,2,2,1,1,1,1];
const PRESENCE='online:',PRESENCE_TTL=110,PRESENCE_ACTIVE_MS=85000;
const other=actor=>actor===PLAYERS[0]?PLAYERS[1]:PLAYERS[0];
function ships(random=crypto.randomInt){
 const occupied=new Set(),cells=[];
 for(const length of LENGTHS){
  let placed=false;
  for(let trial=0;trial<500&&!placed;trial++){
   const horizontal=random(2)===0;
   const row=random(horizontal?SIZE:SIZE-length+1);
   const col=random(horizontal?SIZE-length+1:SIZE);
   const ship=Array.from({length},(_,i)=>(row+(horizontal?0:i))*SIZE+col+(horizontal?i:0));
   const safe=ship.every(cell=>{
    const r=Math.floor(cell/SIZE),c=cell%SIZE;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)
     if(occupied.has((r+dr)*SIZE+c+dc)&&r+dr>=0&&r+dr<SIZE&&c+dc>=0&&c+dc<SIZE)return false;
    return true;
   });
   if(!safe)continue;
   ship.forEach(i=>{occupied.add(i);cells.push(i)});
   placed=true;
  }
  if(!placed)throw Error('battle-ship-placement-failed');
 }
 return cells;
}
function initial(){
 return {status:'waiting',size:SIZE,ready:{'Рустам':false,'Диана':false},round:0,version:0,turn:'',winner:'',endedBy:'',updatedAt:'',
  reminders:{},
  lastStarter:'',ships:{'Рустам':[],'Диана':[]},shots:{'Рустам':[],'Диана':[]}};
}
function normalize(raw){
 const s=raw&&typeof raw==='object'?raw:{},def=initial();
 const size=raw&&typeof raw==='object'?(s.size===10?10:7):SIZE,shipCount=size===10?20:7;
 const getBoard=actor=>Array.isArray(s.ships?.[actor])?s.ships[actor].filter(i=>Number.isInteger(i)&&i>=0&&i<size*size).slice(0,shipCount):[];
 const getShots=actor=>Array.isArray(s.shots?.[actor])?s.shots[actor].filter(x=>x&&Number.isInteger(x.cell)&&x.cell>=0&&x.cell<size*size&&typeof x.hit==='boolean').slice(0,size*size):[];
 return {...def,size,ready:Object.fromEntries(PLAYERS.map(a=>[a,s.ready?.[a]===true||(size===7&&s.status==='playing')])),
  status:['waiting','placing','playing','won','ended'].includes(s.status)?s.status:'waiting',
  round:Number.isSafeInteger(s.round)&&s.round>=0?s.round:0,
  version:Number.isSafeInteger(s.version)&&s.version>=0?s.version:0,
  turn:PLAYERS.includes(s.turn)?s.turn:'',winner:PLAYERS.includes(s.winner)?s.winner:'',
  endedBy:PLAYERS.includes(s.endedBy)?s.endedBy:'',
  lastStarter:PLAYERS.includes(s.lastStarter)?s.lastStarter:'',
  updatedAt:String(s.updatedAt||''),
  reminders:Object.fromEntries(PLAYERS.map(a=>[a,Number.isFinite(Date.parse(s.reminders?.[a]))?s.reminders[a]:''])),
  ships:Object.fromEntries(PLAYERS.map(a=>[a,getBoard(a)])),
  shots:Object.fromEntries(PLAYERS.map(a=>[a,getShots(a)]))};
}
function vesselGroups(cells,size=SIZE){
 const set=new Set(cells),seen=new Set(),groups=[];
 for(const first of set){
  if(seen.has(first))continue;
  const group=[],stack=[first];seen.add(first);
  while(stack.length){
   const current=stack.pop(),row=Math.floor(current/size);
   group.push(current);
   for(const next of [current-size,current+size,current-1,current+1]){
    if(next<0||next>=size*size||!set.has(next)||seen.has(next))continue;
    if(Math.abs(next-current)===1&&Math.floor(next/size)!==row)continue;
    seen.add(next);stack.push(next);
   }
  }
  groups.push(group.sort((a,b)=>a-b));
 }
 return groups;
}
function validFleet(cells,size=SIZE){
 if(size!==SIZE||!Array.isArray(cells)||cells.length!==20||
  cells.some(i=>!Number.isInteger(i)||i<0||i>=size*size)||new Set(cells).size!==cells.length)return false;
 const groups=vesselGroups(cells,size);
 if(groups.map(g=>g.length).sort((a,b)=>b-a).join(',')!==LENGTHS.join(','))return false;
 for(const group of groups){
  const horizontal=group.every(i=>Math.floor(i/size)===Math.floor(group[0]/size));
  const vertical=group.every(i=>i%size===group[0]%size);
  if(!horizontal&&!vertical)return false;
  if(group.some((i,n)=>n&&i-group[n-1]!== (horizontal?1:size)))return false;
 }
 for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++)
  for(const x of groups[a])for(const y of groups[b])
   if(Math.abs(Math.floor(x/size)-Math.floor(y/size))<=1&&Math.abs(x%size-y%size)<=1)return false;
 return true;
}
function publicRoom(raw,actor){
 const s=normalize(raw),enemy=other(actor),done=s.status==='won'||s.status==='ended';
 return {status:s.status,size:s.size,ready:s.ready,round:s.round,version:s.version,turn:s.turn,winner:s.winner,
  reminderNextAt:s.reminders[actor]||'',
  endedBy:s.endedBy,updatedAt:s.updatedAt,
  ownShips:s.ships[actor],ownShots:s.shots[actor],enemyShots:s.shots[enemy],
  // Reveal only FULLY sunk enemy vessels during active play. Other ship positions remain secret.
  sunkShips:vesselGroups(s.ships[enemy],s.size).filter(group=>group.every(cell=>
   s.shots[actor].some(shot=>shot.cell===cell&&shot.hit))),
  opponentShips:done?s.ships[enemy]:undefined};
}
function nextMove(raw,actor,operation,index,now=new Date().toISOString(),makeShips=ships){
 if(!PLAYERS.includes(actor))throw Error('battle-forbidden');
 const s=normalize(raw);
 if(operation==='start'){
  if(s.status==='playing'||s.status==='placing')return {ok:false,error:'battle-in-progress',room:s};
  const starter=s.lastStarter?other(s.lastStarter):'Рустам';
  return {ok:true,room:{...initial(),round:s.round+1,version:s.version+1,
   reminders:s.reminders,
   status:'placing',turn:'',lastStarter:starter,updatedAt:now}};
 }
 if(operation==='ready'){
  if(s.status!=='placing')return {ok:false,error:'battle-not-placing',room:s};
  if(s.ready[actor])return {ok:false,error:'battle-already-ready',room:s};
  if(!validFleet(index,s.size))return {ok:false,error:'battle-fleet-invalid',room:s};
  const ready={...s.ready,[actor]:true},both=PLAYERS.every(a=>ready[a]);
  return {ok:true,room:{...s,ready,ships:{...s.ships,[actor]:[...index]},
   status:both?'playing':'placing',turn:both?s.lastStarter:'',version:s.version+1,updatedAt:now}};
 }
 if(operation==='end'){
  if(s.status!=='playing'&&s.status!=='placing')return {ok:false,error:'battle-not-playing',room:s};
  return {ok:true,room:{...s,status:'ended',turn:'',endedBy:actor,version:s.version+1,updatedAt:now}};
 }
 if(operation!=='move')throw Error('battle-operation-invalid');
 if(s.status!=='playing')return {ok:false,error:'battle-not-playing',room:s};
 if(s.turn!==actor)return {ok:false,error:'battle-not-your-turn',room:s};
 if(!Number.isInteger(index)||index<0||index>=s.size*s.size||
  s.shots[actor].some(x=>x.cell===index))return {ok:false,error:'battle-cell-invalid',room:s};
 const opponent=other(actor),hit=s.ships[opponent].includes(index);
 const shots={...s.shots,[actor]:[...s.shots[actor],{cell:index,hit}]};
 const won=shots[actor].filter(x=>x.hit).length===s.ships[opponent].length;
 return {ok:true,room:{...s,shots,version:s.version+1,updatedAt:now,
  status:won?'won':'playing',turn:won?'':hit?actor:opponent,winner:won?actor:''}};
}
function validSession(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{8,90}$/.test(value)?value:''}
async function readPresence(cache,at){
 const when=Date.parse(at);
 const rows=await Promise.all(PLAYERS.map(name=>cache.get(PRESENCE+name)));
 return Object.fromEntries(PLAYERS.map((name,i)=>{
  const last=Date.parse(rows[i]?.seenAt||'');
  return [name,Number.isFinite(when)&&Number.isFinite(last)&&last<=when&&when-last<PRESENCE_ACTIVE_MS];
 }));
}
function notifyGameStart(actor,round,deps={}){
 const recipient=other(actor);
 const send=deps.sendPushImpl||((to,payload)=>require('./web-push.cjs').sendPushNotification(to,payload));
 const action=actor==='Диана'?'начала':'начал';
 const task=Promise.resolve().then(()=>send(recipient,{
  title:'⚓ Морской бой',
  body:actor+' '+action+' новую партию. Заходи играть!',
  tag:'rudi-battle-start-'+round,
  id:'rudi-battle-start-'+round+'-'+recipient,
  url:'/?tab=home&game=battleship'
 })).catch(e=>{console.warn('RUDI_BATTLE_PUSH_WARN',String(e?.message||e));return {sent:false}});
 const waitUntil=deps.waitUntilImpl||((job)=>require('@vercel/functions').waitUntil(job));
 try{waitUntil(task)}catch(e){console.warn('RUDI_BATTLE_PUSH_BACKGROUND_WARN',String(e?.message||e))}
 return task;
}
function createHandler(deps={}){
 const cache=deps.cache||createStrictRuntimeCache({namespace:NS,...(deps.cacheOptions||{})});
 const auth=deps.authorizeRequest||authorizeRequest,now=deps.now||(()=>new Date().toISOString());
 return async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  let actor;
  try{actor=auth(req,body.initData).actor}
  catch(e){const code=statusForError(e);return res.status(code).json({ok:false,error:code>=500?'server-error':String(e.message||e)})}
  if(!PLAYERS.includes(actor))return res.status(403).json({ok:false,error:'battle-forbidden'});
  const operation=String(body.operation||'get');
  if(!['get','start','ready','move','end','leave','remind'].includes(operation))return res.status(400).json({ok:false,error:'battle-operation-invalid'});
  const sessionId=validSession(body.sessionId);
  if(operation==='leave'){
   if(!sessionId)return res.status(400).json({ok:false,error:'battle-session-invalid'});
   try{
    const key=PRESENCE+actor,previous=await cache.get(key);
    if(previous?.sessionId===sessionId)await cache.delete(key);
    return res.status(200).json({ok:true,actor});
   }catch(error){
    console.warn('RUDI_BATTLE_PRESENCE_LEAVE_WARN',String(error?.message||error));
    return res.status(503).json({ok:false,error:'battle-store-unavailable'});
   }
  }
  try{
   if(operation==='get'){
    // Heartbeat piggybacks on the room poll; no extra HTTP request.
    // Client limits writes to about every 45 seconds.
    if(sessionId&&body.active===true)
     await cache.set(PRESENCE+actor,{sessionId,seenAt:now()},{ttl:PRESENCE_TTL});
    const [room,presence]=await Promise.all([cache.get(ROOM),
     body.includePresence===false?undefined:readPresence(cache,now())]);
    return res.status(200).json({ok:true,room:publicRoom(room,actor),actor,presence});
   }
   if(operation==='move'&&(!Number.isInteger(body.index)||body.index<0||body.index>=SIZE*SIZE))
    return res.status(400).json({ok:false,error:'battle-cell-invalid'});
   let locked=false;
   try{
    locked=await cache.setIfAbsent(LOCK,{actor,at:now()},{ttl:20});
    if(!locked)return res.status(409).json({ok:false,error:'battle-busy'});
    const current=normalize(await cache.get(ROOM));
    if(operation==='move'&&body.index>=current.size*current.size)
     return res.status(400).json({ok:false,error:'battle-cell-invalid'});
    if(operation==='ready'&&current.round!==body.round)
     return res.status(409).json({ok:false,error:'battle-outdated',room:publicRoom(current,actor)});
    if(['move','end','remind'].includes(operation)&&current.version!==body.version)
     return res.status(409).json({ok:false,error:'battle-outdated',room:publicRoom(current,actor)});
    if(operation==='remind'){
     if(current.status!=='playing'||current.turn!==other(actor))
      return res.status(409).json({ok:false,error:'battle-reminder-not-opponent-turn',room:publicRoom(current,actor)});
     const at=Date.parse(now()),nextAt=Date.parse(current.reminders[actor]);
     if(Number.isFinite(nextAt)&&nextAt>at)
      return res.status(429).json({ok:false,error:'battle-reminder-cooldown',room:publicRoom(current,actor)});
     const updated={...current,reminders:{...current.reminders,[actor]:new Date(at+300000).toISOString()}};
     await cache.set(ROOM,updated,{ttl:TTL});
     // Reserve durably before sending, then release the game lock so moves stay responsive.
     await cache.delete(LOCK);locked=false;
     const send=deps.sendPushImpl||((to,payload)=>require('./web-push.cjs').sendPushNotification(to,payload));
     let reminded=false;
     try{
      const result=await send(current.turn,{title:'⚓ Твой ход',body:actor+' ждёт твой ход в Морском бое.',
       tag:'rudi-battle-reminder-'+current.round,
       id:'rudi-battle-reminder-'+current.round+'-'+actor+'-'+at,url:'/?tab=home&game=battleship'});
      reminded=result?.sent===true;
     }catch(error){console.warn('RUDI_BATTLE_REMINDER_WARN',String(error?.message||error))}
     // A move may have completed while the push service replied: return the latest field.
     const latest=await cache.get(ROOM);
     return res.status(200).json({ok:true,actor,reminded,room:publicRoom(latest,actor)});
    }
    const result=nextMove(current,actor,operation,operation==='ready'?body.ships:body.index,now(),deps.makeShips||ships);
    if(!result.ok)return res.status(409).json({ok:false,error:result.error,room:publicRoom(result.room,actor)});
    await cache.set(ROOM,result.room,{ttl:TTL});
    // The next tap can arrive as soon as JSON is sent, before a finally block completes.
    await cache.delete(LOCK);locked=false;
    // Send one push per successfully persisted new round; moves never spam notifications.
    if(operation==='start')notifyGameStart(actor,result.room.round,deps);
    return res.status(200).json({ok:true,actor,room:publicRoom(result.room,actor)});
   }finally{if(locked)try{await cache.delete(LOCK)}catch(_){}}
  }catch(e){console.error('RUDI_BATTLE_ERROR',String(e?.message||e));return res.status(503).json({ok:false,error:'battle-store-unavailable'})}
 };
}
module.exports=createHandler();
Object.assign(module.exports,{NS,ROOM,ships,vesselGroups,validFleet,initial,normalize,publicRoom,nextMove,createHandler,notifyGameStart,validSession,readPresence});
