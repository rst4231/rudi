'use strict';
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {readAppState,writeAppState}=require('./rudi-auth-db.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const {proofread}=require('./home-note-proofread.cjs');
const NOTE_KEY='home-note-v1';
const NOTES_INDEX_KEY='home-notes-index-v1';
const NOTE_EXPANDED_KEY='home-note-expanded-v1';
const MAX_LENGTH=8000;
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
const noteKey=id=>id==='home'?NOTE_KEY:'home-note-v2:'+id;
function normalizeStored(value){
 const row=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 return {text:typeof row.text==='string'?row.text.slice(0,MAX_LENGTH):'',updatedAt:typeof row.updatedAt==='string'?row.updatedAt:'',title:typeof row.title==='string'?row.title.slice(0,100):'',pinned:row.pinned===true,history:Array.isArray(row.history)?row.history.slice(-20).filter(v=>v&&typeof v.text==='string').map(v=>({text:v.text.slice(0,MAX_LENGTH),title:String(v.title||'').slice(0,100),pinned:v.pinned===true,updatedAt:String(v.updatedAt||'')})):[]};
}
function createHandler(deps={}){
 const authorize=deps.authorizeRequest||authorizeRequest;
 const read=deps.readAppState||readAppState;
 const write=deps.writeAppState||writeAppState;
 const now=deps.now||(()=>new Date().toISOString());
 const correct=deps.proofread||proofread;
 const pending=new Map(),cache=new Map(),locks=new Map();
 const state=deps.stateClient||(!deps.readAppState?createRudiStateClient():null);
 async function acquire(actor){
  const previous=locks.get(actor);
  let release;
  const local=new Promise(resolve=>{release=resolve});locks.set(actor,local);
  if(previous)await previous;
  try{
   if(state&&!(await state.setIfAbsent('home-note-write-lock-v1',actor,{locked:true},{ttl:90})))throw Error('note-busy');
   return async()=>{try{if(state)await state.remove('home-note-write-lock-v1',actor)}finally{if(locks.get(actor)===local)locks.delete(actor);release()}};
  }catch(error){if(locks.get(actor)===local)locks.delete(actor);release();throw error}
 }

 return async function homeNoteHandler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
   const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
   const {actor}=authorize(req,body.initData);
   const operation=String(body.operation||'get');
   if(operation==='proofread'){
    if(typeof body.text!=='string'||!body.text.trim()||body.text.length>MAX_LENGTH)
      return res.status(400).json({ok:false,error:'invalid-note-text'});
    const key=actor+':'+require('node:crypto').createHash('sha256').update(body.text).digest('hex');
    const cached=cache.get(key);
    if(cached&&cached.until>Date.now())return res.status(200).json({ok:true,text:cached.text});
    if(!pending.has(key)){
     if(pending.size>=4)return res.status(429).json({ok:false,error:'proofread-busy'});
     const task=Promise.resolve().then(()=>correct(body.text)).then(text=>{
      if(cache.size>=8)cache.delete(cache.keys().next().value);
      cache.set(key,{text,until:Date.now()+60000});return text;
     }).finally(()=>pending.delete(key));
     pending.set(key,task);
    }
    try{return res.status(200).json({ok:true,text:await pending.get(key)})}
    catch(_){return res.status(503).json({ok:false,error:'proofread-unavailable'})}
   }
   if(operation==='get-history'){
    const id=body.id===undefined?'home':body.id;
    if(!validId(id))return res.status(400).json({ok:false,error:'invalid-note'});
    return res.status(200).json({ok:true,note:{id,...normalizeStored(await read(actor,noteKey(id)))}});
   }
   if(operation==='get'){
    const [note,view,index]=await Promise.all([read(actor,NOTE_KEY),read(actor,NOTE_EXPANDED_KEY),read(actor,NOTES_INDEX_KEY)]);
    const ids=['home',...new Set((Array.isArray(index?.ids)?index.ids:[]).filter(id=>validId(id)&&id!=='home'))];
    const notes=await Promise.all(ids.map(async id=>{const row=normalizeStored(id==='home'?note:await read(actor,noteKey(id)));return {id,...row,history:[],historyCount:row.history.length}}));
    const expanded=typeof view?.expanded==='boolean'?view.expanded:null;
    return res.status(200).json({ok:true,note:{...notes[0],expanded},notes});
   }
   if(operation==='set-expanded'){
    if(typeof body.expanded!=='boolean')return res.status(400).json({ok:false,error:'invalid-note-expanded'});
    await write(actor,NOTE_EXPANDED_KEY,{expanded:body.expanded,updatedAt:now()});
    return res.status(200).json({ok:true,expanded:body.expanded});
   }
   if(operation==='save'){
    const release=await acquire(actor);
    try{
    if(typeof body.text!=='string'||body.text.length>MAX_LENGTH)
     return res.status(400).json({ok:false,error:'invalid-note-text'});
    const text=body.text.replace(/\r\n?/g,'\n').trim();
    const id=body.id===undefined?'home':body.id;
    if(!validId(id)||typeof body.title!=='undefined'&&(typeof body.title!=='string'||body.title.length>100)||typeof body.pinned!=='undefined'&&typeof body.pinned!=='boolean')return res.status(400).json({ok:false,error:'invalid-note'});
    const previous=normalizeStored(await read(actor,noteKey(id)));
    const title=body.title===undefined?previous.title:body.title.trim();
    const pinned=body.pinned===undefined?previous.pinned:body.pinned;
    // Register first: a failed text write can be retried, and a lost reply must
    // never leave a successfully written note undiscoverable.
    if(id!=='home'){
      const index=await read(actor,NOTES_INDEX_KEY);
      const ids=Array.isArray(index?.ids)?index.ids:[];
      if(!ids.includes(id)&&ids.filter(value=>value!=='home').length>=29)return res.status(400).json({ok:false,error:'note-limit'});
      if(!ids.includes(id))await write(actor,NOTES_INDEX_KEY,{ids:[...ids,id]});
    }
    const same=previous.text===text&&previous.title===title&&previous.pinned===pinned;
    if(same&&previous.updatedAt)return res.status(200).json({ok:true,note:{id,...previous},idempotent:true});
    if(Object.prototype.hasOwnProperty.call(body,'expectedUpdatedAt')&&previous.updatedAt!==String(body.expectedUpdatedAt||''))
      return res.status(409).json({ok:false,error:'note-conflict',note:{id,...previous}});
    const localHistory=normalizeStored({history:body.localHistory}).history;
    const history=[...previous.history];
    for(const version of [...(previous.updatedAt?[previous]:[]),...localHistory]){
      const item={text:version.text,title:version.title,pinned:version.pinned,updatedAt:version.updatedAt};
      if(!history.some(v=>v.text===item.text&&v.title===item.title&&v.pinned===item.pinned))history.push(item);
    }
    let updatedAt=now();
    if(Date.parse(updatedAt)<=Date.parse(previous.updatedAt))updatedAt=new Date(Date.parse(previous.updatedAt)+1).toISOString();
    const note={id,text,title,pinned,updatedAt,history:history.slice(-20)};
    await write(actor,noteKey(id),note);
    return res.status(200).json({ok:true,note});
    }finally{await release().catch(error=>console.error('RUDI_HOME_NOTE_LOCK_RELEASE',String(error?.message||error)))}
   }
   return res.status(400).json({ok:false,error:'invalid-operation'});
  }catch(error){
   const code=error?.message==='note-busy'?503:statusForError(error);
   if(code>=500)console.error('RUDI_HOME_NOTE_ERROR',String(error?.message||error));
   return res.status(code).json({ok:false,error:code>=500?'server-error':String(error?.message||error)});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.NOTES_INDEX_KEY=NOTES_INDEX_KEY;
module.exports.NOTE_KEY=NOTE_KEY;
module.exports.NOTE_EXPANDED_KEY=NOTE_EXPANDED_KEY;
module.exports.MAX_LENGTH=MAX_LENGTH;
