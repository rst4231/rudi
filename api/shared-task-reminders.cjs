'use strict';
// Reminder window and recipient decisions are independent of the browser and Telegram.
const crypto=require('node:crypto');
const {readToken}=require('./ticktick-store.cjs');
const {loadTickTickConfig,fetchProjectData,resolveAssigneeName}=require('./ticktick-client.cjs');
const {readSharedTaskMetaState}=require('./shared-task-meta-store.cjs');
const {sendPushNotification}=require('./web-push.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');

const ACTORS=Object.freeze(['Рустам','Диана']);
const STORAGE_NAMESPACE='rudi-shared-task-push-v1';
const LOOKBACK_MS=25*60*1000;
const CLAIM_TTL_SECONDS=120;
const SENT_TTL_SECONDS=60*60*24*45;

function recipientActors(task,meta){
  const selected=meta&&typeof meta==='object'
    ?String(meta.responsible||'').trim()
    :resolveAssigneeName(task?.assigneeUsername);
  if(selected==='Рустам'||selected==='RST')return ['Рустам'];
  if(selected==='Диана'||selected==='Ди')return ['Диана'];
  if(meta&&typeof meta==='object')return [...ACTORS]; // RUDI empty responsible = together
  if(!String(task?.assigneeUsername||'').trim())return [...ACTORS];
  return []; // Unknown TickTick assignee: never broadcast to both.
}

function selectDueTaskReminders(tasks,metaState,now=Date.now(),lookbackMs=LOOKBACK_MS){
  const timestamp=now instanceof Date?now.getTime():Number(now);
  const maxAge=Math.max(60000,Number(lookbackMs)||LOOKBACK_MS);
  const entries=metaState?.entries&&typeof metaState.entries==='object'?metaState.entries:{};
  const seen=new Set(),out=[];
  for(const task of Array.isArray(tasks)?tasks:[]){
    const id=String(task?.id||'').trim();
    if(!id||task?.isAllDay||Number(task?.status??0)!==0)continue;
    const raw=String(task?.startDate||task?.dueDate||'').trim();
    const scheduledAt=Date.parse(raw);
    if(!Number.isFinite(scheduledAt)||scheduledAt>timestamp||timestamp-scheduledAt>maxAge)continue;
    const taskKey=id+':'+scheduledAt;
    if(seen.has(taskKey))continue;
    seen.add(taskKey);
    const recipients=recipientActors(task,entries[id]||null);
    if(!recipients.length)continue;
    out.push({taskId:id,title:String(task.title||'Совместное дело').trim().slice(0,140)||'Совместное дело',
      scheduledAt,recipients,shared:recipients.length===2});
  }
  return out.sort((a,b)=>a.scheduledAt-b.scheduledAt);
}

function deliveryKey(task,actor){
  return crypto.createHash('sha256').update([task.taskId,task.scheduledAt,actor].join('|')).digest('hex');
}

async function fetchSharedTasks(options={}){
  if(typeof options.loadSharedTasksImpl==='function')return options.loadSharedTasksImpl(options);
  const [token,config,meta]=await Promise.all([
    (options.readTokenImpl||readToken)(options),
    (options.loadTickTickConfigImpl||loadTickTickConfig)(options),
    (options.readSharedTaskMetaStateImpl||readSharedTaskMetaState)(options)
  ]);
  if(!config?.enabled||!token?.accessToken||!config.projectId)return {available:false,tasks:[],meta};
  const result=await (options.fetchProjectDataImpl||fetchProjectData)(token.accessToken,config.projectId,options);
  return {available:true,tasks:Array.isArray(result?.tasks)?result.tasks:[],meta};
}

async function runSharedTaskReminders(options={}){
  const now=options.now instanceof Date?options.now.getTime():Number(options.now||Date.now());
  const fetched=await fetchSharedTasks(options);
  if(!fetched?.available)return {ok:true,scanned:0,sent:0,skipped:'ticktick-unavailable'};
  const candidates=selectDueTaskReminders(fetched.tasks,fetched.meta,now,options.lookbackMs);
  if(!candidates.length)return {ok:true,scanned:0,sent:0};
  const cache=options.reminderCache||createStrictRuntimeCache({namespace:STORAGE_NAMESPACE,...options});
  const deliver=options.sendPushImpl||sendPushNotification;
  let sent=0,duplicates=0,failed=0,unsubscribed=0;
  for(const task of candidates){
    for(const actor of task.recipients){
      const key=deliveryKey(task,actor);
      let claimed=false;
      try{
        claimed=Boolean(await cache.setIfAbsent(key,{status:'claimed',at:new Date(now).toISOString()},
          {ttl:CLAIM_TTL_SECONDS,tags:['rudi-shared-task-push']}));
        if(!claimed){duplicates++;continue;}
        const result=await deliver(actor,{
          id:'shared-task-'+key.slice(0,32),
          title:task.shared?'Совместное дело сейчас':'Дело на сейчас',
          body:task.title,url:'/?tab=schedule',
          tag:'rudi-shared-task-'+task.taskId,
        },options);
        if(!result?.sent){
          unsubscribed++;
          await cache.delete(key);
          continue;
        }
        await cache.set(key,{status:'sent',at:new Date(now).toISOString()},
          {ttl:SENT_TTL_SECONDS,tags:['rudi-shared-task-push']});
        sent++;
      }catch(error){
        failed++;
        if(claimed)await cache.delete(key).catch(()=>{});
        console.warn('RUDI_SHARED_TASK_PUSH_WARN',actor,String(error?.message||error));
      }
    }
  }
  return {ok:failed===0,scanned:candidates.length,sent,duplicates,failed,unsubscribed};
}
module.exports={ACTORS,STORAGE_NAMESPACE,LOOKBACK_MS,recipientActors,selectDueTaskReminders,deliveryKey,fetchSharedTasks,runSharedTaskReminders};
