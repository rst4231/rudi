'use strict';
const {createRudiStateClient}=require('./rudi-state-client.cjs');
const NS='rudi-calendar-workplace-v1:rustam';
async function workplace(input={},options={}){
 if(input.actor!=='Рустам')throw Error('calendar-workplace-forbidden');
 const client=options.client||createRudiStateClient(options);
 if(input.operation==='list'){
  const month=String(input.month||'');if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))throw Error('calendar-workplace-invalid');
  const rows=await client.list(NS),days={};for(const row of rows){if(String(row.key).startsWith(month+'-')&&['home','coworking'].includes(row.value?.place))days[row.key]=row.value.place}return {ok:true,days};
 }
 if(input.operation!=='set')throw Error('calendar-workplace-invalid');
 const date=String(input.date||''),place=String(input.place||'');
 if(!/^20\d\d-(0[1-9]|1[0-2])-\d\d$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!['home','coworking',''].includes(place))throw Error('calendar-workplace-invalid');
 await client.set(NS,date,{place});return {ok:true,date,place};
}
async function readWorkplaceForSummary(date,options={}){
 const client=options.client||createRudiStateClient(options);
 const place=(await client.getRecord(NS,date))?.value?.place;
 return ['home','coworking'].includes(place)?place:'';
}
module.exports={workplace,readWorkplaceForSummary};
