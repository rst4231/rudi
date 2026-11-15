'use strict';
const NS='rudi-crypto-sentiment-v1',KEY='alternative-me',TTL=3600000;
const labels={'Extreme Fear':'Сильный страх',Fear:'Страх',Neutral:'Нейтрально',Greed:'Жадность','Extreme Greed':'Сильная жадность'};
async function read(o={}){
 const client=o.client||require('./rudi-state-client.cjs').createRudiStateClient(o),now=o.now??Date.now();
 let saved=null;try{saved=(await client.getRecord(NS,KEY))?.value}catch(_){}
 if(saved?.available&&now-Date.parse(saved.fetchedAt)<TTL&&now>=Date.parse(saved.fetchedAt))return {...saved,stale:now-Date.parse(saved.at)>172800000};
 try{
  const response=await (o.fetchImpl||fetch)('https://api.alternative.me/fng/?limit=1',{signal:AbortSignal.timeout(6500),cache:'no-store'});
  if(!response.ok)throw Error('sentiment-unavailable');
  const row=(await response.json())?.data?.[0],value=Number(row?.value),at=Number(row?.timestamp)*1000;
  if(!row||row.value===''||row.value==null||!Number.isInteger(value)||value<0||value>100||!Number.isFinite(at)||at<946684800000||at>now+300000)throw Error('sentiment-invalid');
  const label=labels[row.value_classification]||(value<25?'Сильный страх':value<45?'Страх':value<=55?'Нейтрально':value<=75?'Жадность':'Сильная жадность');
  const result={available:true,value,label,at:new Date(at).toISOString(),fetchedAt:new Date(now).toISOString(),source:'Alternative.me'};
  try{await client.setRecord({namespace:NS,key:KEY,value:result,tags:['rudi-crypto-sentiment'],expires_at:null,updated_at:result.fetchedAt})}catch(_){}
  return {...result,stale:now-at>172800000};
 }catch(_){return saved?.available?{...saved,stale:true}:{available:false,source:'Alternative.me'}}
}
module.exports={read};
