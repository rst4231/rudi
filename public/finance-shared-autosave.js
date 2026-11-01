/* Durable, month-scoped shared finance drafts. */
(function(root){
'use strict';
function valid(p){return p&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.month)&&[p.rent,p.utilities,...(Array.isArray(p.items)?p.items:[]).map(r=>r.amount)].every(n=>Number.isFinite(n)&&n>=0&&n<=10000000)&&Array.isArray(p.items)}
function create({key,storage,save,onSaved=()=>{},onStatus=()=>{},canSave=()=>true,delay=900,setTimer=setTimeout,clearTimer=clearTimeout}){
 const pending=new Map();let timer=null,running=null,disposed=false;
 try{const saved=JSON.parse(storage?.getItem('rudi:shared-drafts:v1:'+key)||'[]');for(const p of saved)if(valid(p))pending.set(p.month,p)}catch(_){}
 function persist(){try{storage?.setItem('rudi:shared-drafts:v1:'+key,JSON.stringify([...pending.values()]))}catch(_){onStatus('Не удалось сохранить копию на устройстве')}}
 function schedule(){if(timer!==null)clearTimer(timer);timer=setTimer(()=>{timer=null;void flush()},delay)}
 function update(payload){if(disposed||!canSave()||!valid(payload))return false;const p=JSON.parse(JSON.stringify(payload));if(JSON.stringify(pending.get(p.month))===JSON.stringify(p))return true;pending.set(p.month,p);persist();schedule();return true}
 async function flush(){
  if(timer!==null){clearTimer(timer);timer=null}if(running)return running;if(disposed||!canSave())return;
  running=(async()=>{
   while(pending.size&&!disposed&&canSave()){
    const [month,p]=pending.entries().next().value;
    try{
     onStatus('Сохраняю…');const result=await save(p);
     if(!result?.ok)throw Error('save-response-missing');
     if(pending.get(month)===p){pending.delete(month);persist()}
     if(!disposed&&canSave())onSaved(p,result);
     onStatus('');
    }catch(error){onStatus(error?.status===403?'Редактировать может только Рустам':'Не удалось отправить · изменения сохранены на устройстве');break}
   }
  })().finally(()=>{running=null});return running;
 }
 return {update,flush,draft:month=>pending.has(month)?JSON.parse(JSON.stringify(pending.get(month))):null,destroy(){disposed=true;if(timer!==null)clearTimer(timer)}};
}
const api={create};if(typeof module==='object'&&module.exports)module.exports=api;else root.RudiSharedFinanceAutosave=api;
})(typeof window==='undefined'?globalThis:window);
