const crypto=require('node:crypto');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');

const NAMESPACE='rudi-supplements-v1';
const TTL_SECONDS=315360000;
const MAX_ITEMS=80;
const ACTORS=new Set(['Рустам','Диана']);
const STATUSES=new Set(['active','paused','finished']);
const FOODS=new Set(['any','before','with','after']);
const EVIDENCE_LEVELS=new Set(['strong','moderate','limited','insufficient']);
const tails=new Map();

function cleanActor(v){const a=String(v||'').trim();if(!ACTORS.has(a))throw new Error('supplements-actor-invalid');return a}
function cleanText(v,m=700){return String(v||'').replace(/\s+/g,' ').trim().slice(0,m)}
function cleanDate(v){const s=cleanText(v,16);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''}
function cleanTime(v){const s=cleanText(v,8);return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)?s:''}
function cleanStatus(v){const s=cleanText(v,16);return STATUSES.has(s)?s:'active'}
function cleanFood(v){const s=cleanText(v,16);return FOODS.has(s)?s:'any'}
function cleanEvidence(v){const s=cleanText(v,24);return EVIDENCE_LEVELS.has(s)?s:''}
function cleanIngredients(v){
  const rows=Array.isArray(v)?v:String(v||'').split(/[,;\n]+/);
  const out=[];const seen=new Set();
  for(const row of rows){const s=cleanText(row,80);const key=s.toLowerCase();if(!s||seen.has(key))continue;seen.add(key);out.push(s);if(out.length>=24)break}
  return out;
}
function keyFor(a){return 'supplements:'+cleanActor(a)}
function cacheOf(o={}){return o.supplementsCache||o.cache||createStrictRuntimeCache({namespace:NAMESPACE,confirmWrites:false,...(o.cacheOptions||{})})}
function moscowDateKey(now=Date.now()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
function isoOrEmpty(v){if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString()}

function normalizeSchedule(v){
  const s=v&&typeof v==='object'?v:{};
  return{dosage:cleanText(s.dosage,80),time:cleanTime(s.time),food:cleanFood(s.food)};
}
function normalizeCourse(v){
  const s=v&&typeof v==='object'?v:{};
  return{startDate:cleanDate(s.startDate),durationDays:Math.max(0,Math.min(3650,Math.round(Number(s.durationDays)||0)))};
}
function normalizeIntakes(v){
  return(Array.isArray(v)?v:[]).map(row=>({date:cleanDate(row?.date),at:isoOrEmpty(row?.at)})).filter(row=>row.date&&row.at).slice(-500);
}
function normalizeNotes(v){
  return(Array.isArray(v)?v:[]).map(row=>({id:cleanText(row?.id,96)||('note-'+crypto.randomUUID()),date:cleanDate(row?.date),at:isoOrEmpty(row?.at),text:cleanText(row?.text,500)})).filter(row=>row.date&&row.at&&row.text).slice(-120);
}
function normalizeStatusHistory(v){
  return(Array.isArray(v)?v:[]).map(row=>({status:cleanStatus(row?.status),at:isoOrEmpty(row?.at)})).filter(row=>row.at).slice(-80);
}
function normalizeItem(input){
  if(!input||typeof input!=='object')return null;
  const id=cleanText(input.id,96),name=cleanText(input.name,120);
  if(!id||!name)return null;
  const created=isoOrEmpty(input.createdAt),updated=isoOrEmpty(input.updatedAt||input.createdAt);
  if(!created||!updated)return null;
  return{
    id,name,
    description:cleanText(input.description,900),
    evidenceLevel:cleanEvidence(input.evidenceLevel),
    ingredients:cleanIngredients(input.ingredients),
    goal:cleanText(input.goal,240),
    schedule:normalizeSchedule(input.schedule),
    course:normalizeCourse(input.course),
    status:cleanStatus(input.status),
    expirationDate:cleanDate(input.expirationDate),
    intakes:normalizeIntakes(input.intakes),
    notes:normalizeNotes(input.notes),
    statusHistory:normalizeStatusHistory(input.statusHistory),
    createdAt:created,updatedAt:updated,describedAt:isoOrEmpty(input.describedAt),
  };
}
function normalizeRecommendation(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const date=cleanDate(source.date),text=cleanText(source.text,900),generatedAt=isoOrEmpty(source.generatedAt),age=Math.max(0,Math.round(Number(source.age)||0)),sex=cleanText(source.sex,16);
  if(!date||!text)return null;
  return{date,text,generatedAt,age,sex};
}
function normalizeInteractionCheck(value){
  const s=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const fingerprint=cleanText(s.fingerprint,128),summary=cleanText(s.summary,1800),generatedAt=isoOrEmpty(s.generatedAt);
  if(!fingerprint||!summary)return null;
  const warnings=(Array.isArray(s.warnings)?s.warnings:[]).map(row=>({title:cleanText(row?.title,160),detail:cleanText(row?.detail,700),evidenceLevel:cleanEvidence(row?.evidenceLevel)})).filter(row=>row.title&&row.detail).slice(0,20);
  const duplicates=(Array.isArray(s.duplicates)?s.duplicates:[]).map(row=>({ingredient:cleanText(row?.ingredient,100),items:(Array.isArray(row?.items)?row.items:[]).map(x=>cleanText(x,120)).filter(Boolean).slice(0,12)})).filter(row=>row.ingredient&&row.items.length>=2).slice(0,20);
  return{fingerprint,summary,warnings,duplicates,generatedAt};
}
function normalizeState(value,actor){
  const who=cleanActor(actor),source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return{
    initialized:Boolean(source.initialized),
    version:Math.max(0,Number(source.version||0)),
    actor:who,
    items:(Array.isArray(source.items)?source.items:[]).map(normalizeItem).filter(Boolean).slice(0,MAX_ITEMS),
    recommendation:normalizeRecommendation(source.recommendation),
    interactionCheck:normalizeInteractionCheck(source.interactionCheck),
    updatedAt:cleanText(source.updatedAt,40)
  };
}
function enqueue(actor,task){const key=cleanActor(actor),tail=tails.get(key)||Promise.resolve(),run=tail.then(task,task);tails.set(key,run.catch(()=>{}));return run}
async function readSupplements(actor,o={}){const who=cleanActor(actor);return normalizeState(await cacheOf(o).get(keyFor(who)),who)}
async function writeSupplements(actor,state,o={}){
  const who=cleanActor(actor),now=new Date(o.now||Date.now()).toISOString(),next=normalizeState({...state,initialized:true,actor:who,updatedAt:now},who);
  await cacheOf(o).set(keyFor(who),next,{ttl:TTL_SECONDS,tags:['rudi-supplements'],name:keyFor(who)});
  return next;
}
async function addSupplement(actor,name,o={}){
  const who=cleanActor(actor),safe=cleanText(name,120);if(!safe)throw new Error('supplement-name-required');
  return enqueue(who,async()=>{const state=await readSupplements(who,o);if(state.items.some(i=>i.name.localeCompare(safe,'ru',{sensitivity:'accent'})===0))throw new Error('supplement-duplicate');if(state.items.length>=MAX_ITEMS)throw new Error('supplement-limit');
    const now=new Date(o.now||Date.now()).toISOString(),item=normalizeItem({id:'supp-'+crypto.randomUUID(),name:safe,createdAt:now,updatedAt:now,status:'active'});
    const saved=await writeSupplements(who,{...state,version:state.version+1,items:[item,...state.items],interactionCheck:null},o);
    return{state:saved,item:saved.items.find(r=>r.id===item.id)||item};
  });
}
async function removeSupplement(actor,id,o={}){
  const who=cleanActor(actor),safe=cleanText(id,96);if(!safe)throw new Error('supplement-id-required');
  return enqueue(who,async()=>{const state=await readSupplements(who,o),index=state.items.findIndex(i=>i.id===safe);if(index<0)throw new Error('supplement-not-found');const removed=state.items[index],saved=await writeSupplements(who,{...state,version:state.version+1,items:state.items.filter(i=>i.id!==safe),interactionCheck:null},o);return{state:saved,removed}});
}
async function restoreSupplement(actor,input,o={}){
  const who=cleanActor(actor),item=normalizeItem(input);if(!item)throw new Error('supplement-restore-invalid');
  return enqueue(who,async()=>{const state=await readSupplements(who,o),existing=state.items.find(i=>i.id===item.id);if(existing)return{state,item:existing,restored:false};const saved=await writeSupplements(who,{...state,version:state.version+1,items:[item,...state.items].slice(0,MAX_ITEMS),interactionCheck:null},o);return{state:saved,item:saved.items.find(i=>i.id===item.id)||item,restored:true}});
}
async function updateSupplement(actor,id,patch,o={}){
  const who=cleanActor(actor),safeId=cleanText(id,96),source=patch&&typeof patch==='object'?patch:{};if(!safeId)throw new Error('supplement-id-required');
  return enqueue(who,async()=>{const state=await readSupplements(who,o),index=state.items.findIndex(i=>i.id===safeId);if(index<0)throw new Error('supplement-not-found');
    const current=state.items[index],now=new Date(o.now||Date.now()).toISOString(),status=source.status===undefined?current.status:cleanStatus(source.status);
    const next=normalizeItem({...current,
      goal:source.goal===undefined?current.goal:source.goal,
      ingredients:source.ingredients===undefined?current.ingredients:source.ingredients,
      schedule:source.schedule===undefined?current.schedule:{...current.schedule,...source.schedule},
      course:source.course===undefined?current.course:{...current.course,...source.course},
      status,
      expirationDate:source.expirationDate===undefined?current.expirationDate:source.expirationDate,
      updatedAt:now,
      statusHistory:status!==current.status?[...current.statusHistory,{status,at:now}]:current.statusHistory
    });
    const items=[...state.items];items[index]=next;const saved=await writeSupplements(who,{...state,version:state.version+1,items,interactionCheck:null},o);return{state:saved,item:saved.items[index]};
  });
}
async function markSupplementTaken(actor,id,o={}){
  const who=cleanActor(actor),safeId=cleanText(id,96);if(!safeId)throw new Error('supplement-id-required');
  return enqueue(who,async()=>{const state=await readSupplements(who,o),index=state.items.findIndex(i=>i.id===safeId);if(index<0)throw new Error('supplement-not-found');const date=moscowDateKey(o.now||Date.now()),current=state.items[index];
    if(current.intakes.some(row=>row.date===date))return{state,item:current,duplicate:true,date};
    const now=new Date(o.now||Date.now()).toISOString(),items=[...state.items];items[index]=normalizeItem({...current,intakes:[...current.intakes,{date,at:now}],updatedAt:now});
    const saved=await writeSupplements(who,{...state,version:state.version+1,items},o);return{state:saved,item:saved.items[index],duplicate:false,date};
  });
}
async function addSupplementNote(actor,id,text,o={}){
  const who=cleanActor(actor),safeId=cleanText(id,96),safeText=cleanText(text,500);if(!safeId)throw new Error('supplement-id-required');if(!safeText)throw new Error('supplement-note-required');
  return enqueue(who,async()=>{const state=await readSupplements(who,o),index=state.items.findIndex(i=>i.id===safeId);if(index<0)throw new Error('supplement-not-found');const now=new Date(o.now||Date.now()).toISOString(),date=moscowDateKey(o.now||Date.now()),current=state.items[index],note={id:'note-'+crypto.randomUUID(),date,at:now,text:safeText},items=[...state.items];items[index]=normalizeItem({...current,notes:[...current.notes,note],updatedAt:now});const saved=await writeSupplements(who,{...state,version:state.version+1,items},o);return{state:saved,item:saved.items[index],note};
  });
}
async function saveSupplementDescription(actor,id,payload,o={}){
  const who=cleanActor(actor),safeId=cleanText(id,96),source=typeof payload==='string'?{description:payload}:(payload||{}),description=cleanText(source.description,900);if(!safeId)throw new Error('supplement-id-required');if(!description)throw new Error('supplement-description-empty');
  return enqueue(who,async()=>{const state=await readSupplements(who,o),index=state.items.findIndex(i=>i.id===safeId);if(index<0)throw new Error('supplement-not-found');const current=state.items[index],now=new Date(o.now||Date.now()).toISOString(),items=[...state.items];
    items[index]=normalizeItem({...current,description,evidenceLevel:source.evidenceLevel||current.evidenceLevel,ingredients:(source.ingredients&&source.ingredients.length)?source.ingredients:current.ingredients,describedAt:now,updatedAt:now});
    const saved=await writeSupplements(who,{...state,version:state.version+1,items,interactionCheck:null},o);return{state:saved,item:saved.items[index],saved:true};
  });
}
async function saveDailyRecommendation(actor,input,o={}){
  const who=cleanActor(actor),source=input&&typeof input==='object'?input:{},date=cleanDate(source.date),text=cleanText(source.text,900),age=Math.max(0,Math.round(Number(source.age)||0)),sex=cleanText(source.sex,16);if(!date||!text||!age||!sex)throw new Error('supplement-recommendation-invalid');
  return enqueue(who,async()=>{const state=await readSupplements(who,o);if(state.recommendation?.date===date&&state.recommendation?.text)return{state,recommendation:state.recommendation,saved:false};const recommendation={date,text,age,sex,generatedAt:new Date(o.now||Date.now()).toISOString()},saved=await writeSupplements(who,{...state,version:state.version+1,recommendation},o);return{state:saved,recommendation:saved.recommendation,saved:true}});
}
async function saveInteractionCheck(actor,input,o={}){
  const who=cleanActor(actor),check=normalizeInteractionCheck({...input,generatedAt:input?.generatedAt||new Date(o.now||Date.now()).toISOString()});if(!check)throw new Error('supplement-interaction-invalid');
  return enqueue(who,async()=>{const state=await readSupplements(who,o),saved=await writeSupplements(who,{...state,version:state.version+1,interactionCheck:check},o);return{state:saved,interactionCheck:saved.interactionCheck}});
}
function resetMutationQueuesForTests(){tails.clear()}

module.exports={NAMESPACE,TTL_SECONDS,MAX_ITEMS,STATUSES,FOODS,EVIDENCE_LEVELS,moscowDateKey,normalizeItem,normalizeRecommendation,normalizeInteractionCheck,normalizeState,readSupplements,writeSupplements,addSupplement,removeSupplement,restoreSupplement,updateSupplement,markSupplementTaken,addSupplementNote,saveSupplementDescription,saveDailyRecommendation,saveInteractionCheck,resetMutationQueuesForTests};