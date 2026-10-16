'use strict';
const {authorizeRequest,statusForError}=require('./rudi-request-auth.cjs');
const {readAppState,writeAppState}=require('./rudi-auth-db.cjs');
const NOTE_KEY='home-note-v1';
const NOTE_EXPANDED_KEY='home-note-expanded-v1';
const MAX_LENGTH=8000;
function normalizeStored(value){
 const row=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 return {text:typeof row.text==='string'?row.text.slice(0,MAX_LENGTH):'',updatedAt:typeof row.updatedAt==='string'?row.updatedAt:''};
}
function createHandler(deps={}){
 const authorize=deps.authorizeRequest||authorizeRequest;
 const read=deps.readAppState||readAppState;
 const write=deps.writeAppState||writeAppState;
 const now=deps.now||(()=>new Date().toISOString());
 return async function homeNoteHandler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
   const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
   const {actor}=authorize(req,body.initData);
   const operation=String(body.operation||'get');
   if(operation==='get'){
    const [note,view]=await Promise.all([read(actor,NOTE_KEY),read(actor,NOTE_EXPANDED_KEY)]);
    const expanded=typeof view?.expanded==='boolean'?view.expanded:null;
    return res.status(200).json({ok:true,note:{...normalizeStored(note),expanded}});
   }
   if(operation==='set-expanded'){
    if(typeof body.expanded!=='boolean')return res.status(400).json({ok:false,error:'invalid-note-expanded'});
    await write(actor,NOTE_EXPANDED_KEY,{expanded:body.expanded,updatedAt:now()});
    return res.status(200).json({ok:true,expanded:body.expanded});
   }
   if(operation==='save'){
    if(typeof body.text!=='string'||body.text.length>MAX_LENGTH)
     return res.status(400).json({ok:false,error:'invalid-note-text'});
    const text=body.text.replace(/\r\n?/g,'\n').trim();
    // An uncertain retry with the same text is already successful.
    // For offline edits reject stale baselines rather than overwrite newer device data.
    if(Object.prototype.hasOwnProperty.call(body,'expectedUpdatedAt')){
      const previous=normalizeStored(await read(actor,NOTE_KEY));
      if(previous.text===text)return res.status(200).json({ok:true,note:previous,idempotent:true});
      if(previous.updatedAt!==String(body.expectedUpdatedAt||''))
        return res.status(409).json({ok:false,error:'note-conflict',note:previous});
    }
    const note={text,updatedAt:now()};
    await write(actor,NOTE_KEY,note);
    return res.status(200).json({ok:true,note});
   }
   return res.status(400).json({ok:false,error:'invalid-operation'});
  }catch(error){
   const code=statusForError(error);
   if(code>=500)console.error('RUDI_HOME_NOTE_ERROR',String(error?.message||error));
   return res.status(code).json({ok:false,error:code>=500?'server-error':String(error?.message||error)});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.NOTE_KEY=NOTE_KEY;
module.exports.NOTE_EXPANDED_KEY=NOTE_EXPANDED_KEY;
module.exports.MAX_LENGTH=MAX_LENGTH;
