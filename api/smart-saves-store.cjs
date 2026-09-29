const crypto=require('node:crypto');
const { createStrictRuntimeCache }=require('./strict-runtime-cache.cjs');
const NAMESPACE='rudi-smart-saves-v1',STATE_KEY='state',TTL_SECONDS=60*60*24*3650;
let mutationTail=Promise.resolve();
function clean(v,max=1200){return String(v??'').replace(/\r\n?/g,'\n').trim().slice(0,max)}
function cleanActor(v){const a=clean(v,40);return a==='Рустам'||a==='Диана'?a:''}
function normalizedUrl(v){const raw=clean(v,2000);if(!raw)return'';try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return'';u.hash='';return u.toString()}catch{return''}}
function normalizeItem(v){
  if(!v||typeof v!=='object')return null;
  const created=new Date(v.createdAt||0),actor=cleanActor(v.actor),title=clean(v.title,180);
  if(!actor||!title||Number.isNaN(created.getTime()))return null;
  return{id:clean(v.id,100)||crypto.randomUUID(),category:clean(v.category,48)||'Другое',title,description:clean(v.description,700),url:normalizedUrl(v.url),imageUrl:normalizedUrl(v.imageUrl),rawText:clean(v.rawText,8000),actor,createdAt:created.toISOString()};
}
function normalizeState(v){
  const s=v&&typeof v==='object'&&!Array.isArray(v)?v:{},seen=new Set(),items=[];
  for(const raw of Array.isArray(s.items)?s.items:[]){const item=normalizeItem(raw);if(!item||seen.has(item.id))continue;seen.add(item.id);items.push(item)}
  items.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  return{initialized:Boolean(s.initialized),version:Math.max(0,Number(s.version||0)),items:items.slice(0,500),updatedAt:clean(s.updatedAt,80)};
}
function cacheOf(o={}){return o.smartSavesCache||createStrictRuntimeCache({namespace:NAMESPACE,...(o.cacheOptions||{})})}
async function readSmartSaves(o={}){return normalizeState(await cacheOf(o).get(STATE_KEY).catch(()=>null))}
async function writeSmartSaves(state,o={}){
  const next=normalizeState({...state,initialized:true,version:Math.max(0,Number(state?.version||0))+1,updatedAt:new Date(o.now||Date.now()).toISOString()});
  await cacheOf(o).set(STATE_KEY,next,{ttl:TTL_SECONDS,tags:['rudi-smart-saves'],name:STATE_KEY});return next;
}
function fingerprint(item){if(item.url)return'url:'+item.url.toLowerCase();return'text:'+crypto.createHash('sha256').update((item.rawText||item.title).toLowerCase()).digest('hex').slice(0,32)}
async function addSmartSave(input,o={}){
  const item=normalizeItem({...input,id:input?.id||crypto.randomUUID(),createdAt:input?.createdAt||new Date(o.now||Date.now()).toISOString()});if(!item)throw new Error('smart-save-invalid');
  const run=mutationTail.then(async()=>{const state=await readSmartSaves(o),key=fingerprint(item),existing=state.items.find(row=>fingerprint(row)===key);if(existing)return{state,item:existing,duplicate:true};const next=await writeSmartSaves({...state,items:[item,...state.items]},o);return{state:next,item,duplicate:false}});
  mutationTail=run.then(()=>undefined,()=>undefined);return run;
}
async function removeSmartSave(id,o={}){
  const key=clean(id,100);if(!key)throw new Error('smart-save-id-required');
  const run=mutationTail.then(async()=>{const state=await readSmartSaves(o),found=state.items.find(row=>row.id===key)||null;if(!found)return{state,item:null,removed:false};const next=await writeSmartSaves({...state,items:state.items.filter(row=>row.id!==key)},o);return{state:next,item:found,removed:true}});
  mutationTail=run.then(()=>undefined,()=>undefined);return run;
}
async function restoreSmartSave(input,o={}){
  const item=normalizeItem(input);if(!item)throw new Error('smart-save-invalid');
  const run=mutationTail.then(async()=>{const state=await readSmartSaves(o),existing=state.items.find(row=>row.id===item.id)||state.items.find(row=>fingerprint(row)===fingerprint(item));if(existing)return{state,item:existing,restored:false};const next=await writeSmartSaves({...state,items:[item,...state.items]},o);return{state:next,item,restored:true}});
  mutationTail=run.then(()=>undefined,()=>undefined);return run;
}
function smartSaveCategories(state){return[...new Set((state?.items||[]).map(row=>clean(row.category,48)).filter(Boolean))]}
module.exports={readSmartSaves,addSmartSave,removeSmartSave,restoreSmartSave,smartSaveCategories};
