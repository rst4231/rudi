'use strict';
const {getWorkWeek}=require('./work-calendar.cjs');
const {occurrences}=require('./shared-native-tasks.cjs');
const {personalTasks}=require('./diana-personal-tasks.cjs');
const {readPersonalToken}=require('./ticktick-store.cjs');
const {readWorkplaceForSummary}=require('./calendar-workplace.cjs');
const {fetchPersonalProjectTasks,buildTickTickCalendar,loadTickTickConfig,calendarDateKey}=require('./ticktick-client.cjs');
async function rustamTasks(options){
 const token=await readPersonalToken('Рустам',options);
 if(!token?.accessToken)throw Error('partner-calendar-disconnected');
 const config=await loadTickTickConfig(options);
 return fetchPersonalProjectTasks(token.accessToken,config.projectId,options);
}
async function personalEvents(partner,month,now,options,source){
 if(partner==='Диана'){
  const data=await personalTasks({actor:partner,operation:'list',month},options);
  if(!data.ok||data.subscription?.unavailable)throw Error('partner-calendar-unavailable');
  return data.tasks;
 }
 const tasks=await source;
 return buildTickTickCalendar(tasks,now,'month','Europe/Moscow',month,{expandRecurrence:true}).days.flatMap(day=>(day.events||[]).map(event=>({...event,date:day.date})));
}
function timedRange(event,date){
 if(event.allDay)return null;
 const parse=value=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(value||''));return m&&+m[1]<24&&+m[2]<60?+m[1]*60+ +m[2]:null};
 const start=parse(event.startTime),end=parse(event.endTime);
 if(start===null||end===null||start===end)return null;
 const finish=end>start?end:end+1440;
 return {start,end:finish,endAt:Date.parse(date+'T00:00:00+03:00')+finish*60000};
}
function countDay(date,partner,results,now=Date.now()){

 if(results.some(result=>result.status==='rejected'))return {date,available:false,counts:null,total:null};
 const counts={morning:0,day:0,evening:0},expirations=[];let total=0;
 for(const [index,result] of results.entries()){
  const seen=new Set();
  for(const event of result.value||[]){
   if(event.date!==date||event.completed||event.deleted||Number(event.status||0)!==0)continue;
   if(index===1&&event.responsible!==partner)continue;
   if(index===0&&event.responsible&&event.responsible!==partner)continue;
   const key=String(event.id||event.seriesId||'')+'@'+date;
   if(seen.has(key))continue;seen.add(key);
   const match=!event.allDay&&/^(\d{1,2}):(\d{2})$/.exec(String(event.startTime||''));
   const minutes=match&&Number(match[1])<24&&Number(match[2])<60?Number(match[1])*60+Number(match[2]):null;
   const range=(event.externalCalendar||event.workShift)?timedRange(event,date):null;
   if(range&&now>=range.endAt)continue;
   const contribution={morning:0,day:0,evening:0};
   if(event.workShift&&range){
    for(const [key,start,end] of [['morning',0,720],['day',720,1080],['evening',1080,1440]])
     if(range.start<end&&range.end>start)contribution[key]=1;
   }else if(minutes!==null)contribution[minutes<720?'morning':minutes<1080?'day':'evening']=1;
   for(const key of Object.keys(counts))counts[key]+=contribution[key];
   total++;
   if(range)expirations.push({endAt:range.endAt,counts:contribution,total:1});
  }
 }
 return {date,available:true,counts,total,...(expirations.length?{expirations}:{})};
}
async function partnerTaskCounts(actor,options={}){
 if(!['Рустам','Диана'].includes(actor))throw Error('rudi-access-denied');
 const partner=actor==='Рустам'?'Диана':'Рустам',now=new Date(options.now||Date.now()),date=calendarDateKey(now);
 const tomorrow=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const workRead=partner==='Диана'?getWorkWeek({...options,now,view:'week'}).catch(()=>null):Promise.resolve(null);
 const workplaceReads=actor==='Диана'?Promise.allSettled([readWorkplaceForSummary(date,options),readWorkplaceForSummary(tomorrow,options)]):null;
 const months=[...new Set([date.slice(0,7),tomorrow.slice(0,7)])];
 // Reuse one personal TickTick fetch for both days, including month boundaries.
 const source=partner==='Рустам'?rustamTasks(options):null;
 const loaded=await Promise.all(months.map(async month=>[month,await Promise.allSettled([
  personalEvents(partner,month,now,options,source),occurrences(month,partner,options)
 ])]));
 const work=await workRead;
 if(work?.configured)for(const [month,results] of loaded){
  if(results[0].status!=='fulfilled')continue;
  let personal=results[0].value;
  for(const day of work.days||[])if(day.working&&day.date.startsWith(month))for(const [index,event] of (day.events||[]).entries()){
   if(!timedRange(event,day.date))continue;
   personal=personal.filter(item=>!(item.externalCalendar&&item.date===day.date&&item.title===event.title&&item.startTime===event.startTime&&item.endTime===event.endTime));
   personal.push({...event,id:'work:'+day.date+':'+index,date:day.date,workShift:true});
  }
  results[0].value=personal;
 }
 const byMonth=new Map(loaded);
 const result={ok:true,partner,...countDay(date,partner,byMonth.get(date.slice(0,7)),now.getTime()),tomorrow:countDay(tomorrow,partner,byMonth.get(tomorrow.slice(0,7)),now.getTime())};
 if(workplaceReads){
  const places=await workplaceReads;
  for(const [index,day] of [result,result.tomorrow].entries()){
   const read=places[index];
   if(read.status==='fulfilled'&&['home','coworking'].includes(read.value))day.workplace=read.value;
  }
 }
 return result;
}
module.exports={partnerTaskCounts};
