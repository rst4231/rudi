
'use strict';
const crypto=require('node:crypto');
const NEGATIVE=new Set(['sadness','boredom','fatigue','anger']);
const POSITIVE=new Set(['joy','love']);
const KNOWN=new Set([...NEGATIVE,...POSITIVE,'neutral']);
function computeEmotionSignals(history,limit=90){
 const rows=(Array.isArray(history)?history:[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x?.date||''))).sort((a,b)=>a.date.localeCompare(b.date));
 const daily=rows.map(entry=>{
  const sampleList=Array.isArray(entry.samples)?entry.samples.filter(x=>KNOWN.has(x?.mood)):[];
  const samples=sampleList.length?sampleList:(KNOWN.has(entry.mood)?[{mood:entry.mood}]:[]);
  const negative=samples.filter(x=>NEGATIVE.has(x.mood)).length;
  const positive=samples.filter(x=>POSITIVE.has(x.mood)).length;
  return {date:entry.date,total:samples.length,negative,positive,negativePercent:samples.length?Math.round(100*negative/samples.length):null,updatedAt:entry.updatedAt||''};
 }).filter(x=>x.total>0);
 const recent=daily.slice(-Math.max(1,Math.min(365,limit)));
 const sum=x=>x.reduce((a,b)=>a+b,0),n=sum(recent.map(x=>x.negative)),total=sum(recent.map(x=>x.total));
 const version=crypto.createHash('sha256').update(JSON.stringify(daily.map(x=>[x.date,x.total,x.negative,x.positive,x.updatedAt]))).digest('hex').slice(0,16);
 return {kind:'negative-emotion-share',version,daysRecorded:daily.length,recentDays:recent.length,recentNegativePercent:total?Math.round(n/total*100):null,latest:daily.at(-1)||null,daily,
  note:'Доля негативных эмоций в дневнике — косвенный маркер эмоционального напряжения, а не медицинское измерение стресса.'};
}
module.exports={computeEmotionSignals,NEGATIVE};
