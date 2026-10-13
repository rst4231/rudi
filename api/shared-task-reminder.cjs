/* RUDI scheduled shared TickTick task reminders. Reuses current 15-minute Lulu runner.
 * Sends to assigned actor, or both when a task is truly shared.
 * Uses durable, per-actor/per-occurrence idempotency; no reminder for all-day tasks.
 */
'use strict';
const {readToken}=require('./ticktick-store.cjs');
const {loadTickTickConfig,fetchProjectData,resolveAssigneeName}=require('./ticktick-client.cjs');
const {readSharedTaskMetaState}=require('./shared-task-meta-store.cjs');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');
const {readPushSubscriptions,sendPushNotification}=require('./web-push.cjs');
const {isCronRequestAuthorized}=require('./cron-auth.cjs');
const {isGitHubActionsRequestAuthorized}=require('./github-actions-oidc.cjs');

const ACTORS=['Рустам','Диана'];
const NAMESPACE='rudi-shared-task-reminders-v1';
const ALLOWED_LATENESS_MS=36*60*1000;
const COMPLETED_STATUS=0;
const CACHE_TTL_SECONDS=60*60*24*65;
const LEASE_TTL_SECONDS=80;

function responsibility(task,meta){
 if(meta && typeof meta==='object'){
   const named=String(meta.responsible||'').trim();
   return ACTORS.includes(named)?[named]:[...ACTORS];
 }
 const assigneeUsername=String(task?.assigneeUsername||'').trim();
 if(!assigneeUsername)return [...ACTORS];
 const name=resolveAssigneeName(assigneeUsername);
 if(name==='RST')return ['Рустам'];
 if(name==='Ди')return ['Диана'];
 return []; // Unknown TickTick user: do not accidentally notify everyone.
}
function timeMs(task){
 if(!task||task.isAllDay)return null;
 const date=task.startDate || task.dueDate;
 if(!date)return null;
 const value=Date.parse(date);
 return Number.isFinite(value)?value:null;
}
function dueCandidates(tasks,metaState,now=Date.now()){
 const entries=metaState?.entries||{};
 const result=[];
 for(const task of Array.isArray(tasks)?tasks:[]){
   const id=String(task?.id||'').trim();
   if(!id||Number(task?.status??0)!==COMPLETED_STATUS)continue;
   const when=timeMs(task);
   if(when===null||when>now||now-when>ALLOWED_LATENESS_MS)continue;
   const recipients=responsibility(task,entries[id]);
   if(!recipients.length)continue;
   result.push({
     id, when, title:String(task.title||'Совместное дело').trim().replace(/\s+/g,' ').slice(0,160),
     recipients,
   });
 }
 return result.sort((a,b)=>a.when-b.when).slice(0,60);
}
function markerKey(task,actor){return 'due:'+task.id+':'+task.when+':'+actor}
function formatTime(time){return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(time))}
async function runDueTaskReminders(options={}){
 const now=Number(options.now ?? Date.now());
 const cache=options.cache||createStrictRuntimeCache({namespace:NAMESPACE,...(options.cacheOptions||{})});
 const token=await (options.readTokenImpl||readToken)(options);
 if(!token?.accessToken)return {ok:true,checked:0,sent:0,reason:'ticktick-not-connected'};
 const config=await (options.loadTickTickConfigImpl||loadTickTickConfig)(options);
 if(config?.enabled===false)return {ok:true,checked:0,sent:0,reason:'ticktick-disabled'};
 const projectId=String(config?.projectId||'').trim();
 if(!projectId)return {ok:true,checked:0,sent:0,reason:'ticktick-project-missing'};
 const [data,meta]=await Promise.all([
   (options.fetchProjectDataImpl||fetchProjectData)(token.accessToken,projectId,options),
   (options.readSharedTaskMetaStateImpl||readSharedTaskMetaState)(options),
 ]);
 const due=dueCandidates(data?.tasks,meta,now);
 const result={ok:true,checked:due.length,sent:0,skipped:0,failures:[]};
 for(const task of due){
   for(const actor of task.recipients){
     const subs=await (options.readPushSubscriptionsImpl||readPushSubscriptions)(actor,options).catch(()=>[]);
     if(!subs.length){result.skipped++;continue}
     const key=markerKey(task,actor);
     // Claim atomically: overlapping workflow runs must never send twice.
     const claimed=await cache.setIfAbsent(key,{status:'sending',at:new Date(now).toISOString()},{ttl:LEASE_TTL_SECONDS,tags:['rudi-shared-task-reminders']});
     if(!claimed){result.skipped++;continue}
     try{
       const push=await (options.sendPushNotificationImpl||sendPushNotification)(actor,{
         id:'rudi-task-'+task.id+'-'+task.when+'-'+actor,
         title:'Пора выполнить дело',
         body:task.title+' · '+formatTime(task.when),
         tag:'rudi-task-'+task.id+'-'+task.when,
         url:'/?tab=schedule',
       },options);
       if(push?.sent===true||Number(push?.delivered||0)>0){
         result.sent++;
         await cache.set(key,{status:'sent',at:new Date(now).toISOString()},{ttl:CACHE_TTL_SECONDS,tags:['rudi-shared-task-reminders']});
       }else{
         result.failures.push({taskId:task.id,actor,reason:'push-not-delivered'});
       }
     }catch(error){
       result.failures.push({taskId:task.id,actor,reason:String(error?.message||error).slice(0,90)});
     }
   }
 }
 return result;
}
async function handleSharedTaskReminderCron(req,res){
 const authorized=isCronRequestAuthorized(req)
   ||await isGitHubActionsRequestAuthorized(req,{
      audience:'rudi-lulu-toilet',
      workflowRef:'rst4231/rudi/.github/workflows/lulu-toilet-alert.yml@refs/heads/main'
   });
 if(!authorized)return res.status(401).json({ok:false,error:'unauthorized-cron'});
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method-not-allowed'});
 try{
   const result=await runDueTaskReminders();
   if(result.failures.length)console.warn('RUDI_SHARED_TASK_PUSH_FAILURES',JSON.stringify(result.failures));
   res.setHeader('Cache-Control','no-store');
   return res.status(200).json(result);
 }catch(error){
   console.error('RUDI_SHARED_TASK_PUSH_ERROR',String(error?.message||error));
   return res.status(503).json({ok:false,error:'shared-task-reminder-unavailable'});
 }
}
module.exports={ACTORS,NAMESPACE,ALLOWED_LATENESS_MS,responsibility,timeMs,dueCandidates,markerKey,runDueTaskReminders,handleSharedTaskReminderCron};
