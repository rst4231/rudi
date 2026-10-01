const test=require('node:test');
const assert=require('node:assert/strict');
const {extractHumidity,evaluateHumidityAlert,COOLDOWN_MS}=require('../api/smart-home-humidity-alert.cjs');

function snapshot(humidity){
  return {devices:[{properties:[
    {parameters:{instance:'temperature'},state:{value:22.5}},
    {parameters:{instance:'humidity'},state:{value:humidity}},
  ]}]};
}
function memoryDb(initial=null){
  let value=initial?JSON.parse(JSON.stringify(initial)):null;
  return {
    async read(){return value?JSON.parse(JSON.stringify(value)):null},
    async write(next){value=JSON.parse(JSON.stringify(next));return value},
  };
}

test('extracts climate humidity',()=>assert.equal(extractHumidity(snapshot(37)),37));

test('low humidity sends once to both enabled recipients',async()=>{
  const db=memoryDb(),sent=[];
  const base={
    db,readRecipientsImpl:async()=>({'Рустам':1,'Диана':2}),
    readUiPreferencesImpl:async()=>({humidityAlertEnabled:true}),
    telegramSendMessageImpl:async chatId=>{sent.push(chatId);return{chatId,messageId:1};}
  };
  const first=await evaluateHumidityAlert(snapshot(37),{...base,now:'2026-10-01T08:00:00Z'});
  assert.deepEqual(first.sent,['Рустам','Диана']);
  const second=await evaluateHumidityAlert(snapshot(36),{...base,now:'2026-10-01T09:00:00Z'});
  assert.deepEqual(second.sent,[]);
  assert.deepEqual(sent,[1,2]);
});

test('rearm needs 45 percent and cooldown prevents bounce spam',async()=>{
  const db=memoryDb(),sent=[];
  const base={
    db,readRecipientsImpl:async()=>({'Рустам':1,'Диана':2}),
    readUiPreferencesImpl:async()=>({humidityAlertEnabled:true}),
    telegramSendMessageImpl:async chatId=>{sent.push(chatId);return{chatId,messageId:1};}
  };
  await evaluateHumidityAlert(snapshot(37),{...base,now:'2026-10-01T08:00:00Z'});
  await evaluateHumidityAlert(snapshot(46),{...base,now:'2026-10-01T09:00:00Z'});
  const bounce=await evaluateHumidityAlert(snapshot(38),{...base,now:'2026-10-01T10:00:00Z'});
  assert.deepEqual(bounce.sent,[]);
  const lateAt=new Date(Date.parse('2026-10-01T08:00:00Z')+COOLDOWN_MS+1000);
  await evaluateHumidityAlert(snapshot(46),{...base,now:lateAt});
  const later=await evaluateHumidityAlert(snapshot(38),{...base,now:new Date(lateAt.getTime()+1000)});
  assert.deepEqual(later.sent,['Рустам','Диана']);
});

test('disabled recipient does not get humidity alert',async()=>{
  const db=memoryDb(),sent=[];
  const result=await evaluateHumidityAlert(snapshot(35),{
    db,now:'2026-10-01T08:00:00Z',
    readRecipientsImpl:async()=>({'Рустам':1,'Диана':2}),
    readUiPreferencesImpl:async actor=>({humidityAlertEnabled:actor!=='Диана'}),
    telegramSendMessageImpl:async chatId=>{sent.push(chatId);return{chatId,messageId:1};}
  });
  assert.deepEqual(result.sent,['Рустам']);
  assert.deepEqual(sent,[1]);
});
