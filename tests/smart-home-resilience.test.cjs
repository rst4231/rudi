const test=require('node:test');
const assert=require('node:assert/strict');
const {yandex,switchSmartHomeDevice,isTransientYandexError}=require('../api/smart-home-client.cjs');

function response(status,data={}){
  return {ok:status>=200&&status<300,status,json:async()=>data};
}

test('temporary Yandex GET failures are retried once',async()=>{
  let calls=0;
  const fetchImpl=async()=>{
    calls+=1;
    if(calls===1)return response(504,{message:'504'});
    return response(200,{households:[],rooms:[],devices:[],scenarios:[]});
  };
  const data=await yandex('/user/info',{fetchImpl,tokenValue:'test-token',timeoutMs:100,retries:1});
  assert.equal(calls,2);
  assert.deepEqual(data.devices,[]);
});

test('switch does not resend when first 504 actually changed device state',async()=>{
  let actionCalls=0,verifyCalls=0,activityCalls=0;
  const fetchImpl=async(url)=>{
    if(String(url).endsWith('/devices/actions')){
      actionCalls+=1;
      return response(504,{message:'504'});
    }
    if(String(url).includes('/devices/device_123')){
      verifyCalls+=1;
      return response(200,{capabilities:[{
        type:'devices.capabilities.on_off',
        state:{instance:'on',value:false}
      }]});
    }
    throw new Error('unexpected-url:'+url);
  };
  const result=await switchSmartHomeDevice('device_123','Торшер',false,'Рустам',{
    fetchImpl,
    tokenValue:'test-token',
    appendActivityImpl:async()=>{activityCalls+=1;},
  });
  assert.equal(result.status,'DONE');
  assert.equal(result.recovered,true);
  assert.equal(actionCalls,1);
  assert.equal(verifyCalls,1);
  assert.equal(activityCalls,1);
});

test('switch retries once when state is still wrong after first 504',async()=>{
  let actionCalls=0,verifyCalls=0;
  const fetchImpl=async(url)=>{
    if(String(url).endsWith('/devices/actions')){
      actionCalls+=1;
      if(actionCalls===1)return response(504,{message:'504'});
      return response(200,{
        request_id:'retry-ok',
        devices:[{capabilities:[{state:{action_result:{status:'DONE'}}}]}]
      });
    }
    if(String(url).includes('/devices/device_123')){
      verifyCalls+=1;
      return response(200,{capabilities:[{
        type:'devices.capabilities.on_off',
        state:{instance:'on',value:true}
      }]});
    }
    throw new Error('unexpected-url:'+url);
  };
  const result=await switchSmartHomeDevice('device_123','Торшер',false,'Рустам',{
    fetchImpl,
    tokenValue:'test-token',
    appendActivityImpl:async()=>{},
  });
  assert.equal(result.status,'DONE');
  assert.equal(result.recovered,false);
  assert.equal(actionCalls,2);
  assert.equal(verifyCalls,1);
});

test('only temporary upstream errors qualify for retry',()=>{
  assert.equal(isTransientYandexError(Object.assign(new Error('x'),{status:504})),true);
  assert.equal(isTransientYandexError(Object.assign(new Error('x'),{status:503})),true);
  assert.equal(isTransientYandexError(Object.assign(new Error('x'),{status:401})),false);
});
