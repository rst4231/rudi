const { readAppState, writeAppState } = require('./rudi-auth-db.cjs');
const { readUiPreferences } = require('./ui-preferences-store.cjs');
const { sendPushNotification } = require('./web-push.cjs');

const DB_ACTOR='Рустам';
const DB_KEY='smart-home:humidity-alert';
const LOW_THRESHOLD=40;
const REARM_THRESHOLD=45;
const COOLDOWN_MS=12*60*60*1000;
const ACTORS=['Рустам','Диана'];

function normalizeIso(value){
  const time=Date.parse(String(value||''));
  return Number.isFinite(time)?new Date(time).toISOString():'';
}
function normalizeActorState(value){
  return {armed:value?.armed!==false,lastNotifiedAt:normalizeIso(value?.lastNotifiedAt)};
}
function normalizeHumidityAlertState(value){
  return {
    actors:{
      'Рустам':normalizeActorState(value?.actors?.['Рустам']),
      'Диана':normalizeActorState(value?.actors?.['Диана']),
    },
    lastHumidity:Number.isFinite(Number(value?.lastHumidity))?Number(value.lastHumidity):null,
    updatedAt:normalizeIso(value?.updatedAt),
  };
}
function propertyValue(device,instance){
  const row=(Array.isArray(device?.properties)?device.properties:[])
    .find(item=>String(item?.parameters?.instance||'')===instance);
  const value=Number(row?.state?.value);
  return Number.isFinite(value)?value:null;
}
function extractHumidity(snapshot){
  const devices=Array.isArray(snapshot?.devices)?snapshot.devices:[];
  const climate=devices.find(device=>propertyValue(device,'temperature')!==null&&propertyValue(device,'humidity')!==null)
    ||devices.find(device=>propertyValue(device,'humidity')!==null);
  return climate?propertyValue(climate,'humidity'):null;
}
function alertText(humidity){
  return '💧 Влажность дома '+Math.round(Number(humidity))+'%. Воздух сухой — стоит поставить или включить увлажнитель.';
}
function dbOf(options={}){
  if(options.db&&typeof options.db.read==='function'&&typeof options.db.write==='function')return options.db;
  return {
    read:()=>readAppState(DB_ACTOR,DB_KEY,options.dbOptions||{}),
    write:value=>writeAppState(DB_ACTOR,DB_KEY,value,options.dbOptions||{}),
  };
}
async function evaluateHumidityAlert(snapshot,options={}){
  const humidity=extractHumidity(snapshot);
  if(humidity===null)return{humidity:null,sent:[],skipped:['humidity-unavailable']};

  const now=new Date(options.now||Date.now());
  const nowIso=now.toISOString();
  const db=dbOf(options);
  const state=normalizeHumidityAlertState(await db.read());
  const sent=[];
  const skipped=[];
  let changed=false;

  if(humidity>=REARM_THRESHOLD){
    for(const actor of ACTORS){
      if(!state.actors[actor].armed){state.actors[actor].armed=true;changed=true;}
    }
  }else if(humidity<LOW_THRESHOLD){
    const readPrefs=options.readUiPreferencesImpl||readUiPreferences;
    const send=options.sendPushNotificationImpl||sendPushNotification;

    for(const actor of ACTORS){
      const actorState=state.actors[actor];
      const prefs=await readPrefs(actor,options).catch(()=>({humidityAlertEnabled:true}));
      if(prefs?.humidityAlertEnabled===false){skipped.push(actor+':disabled');continue;}
      if(!actorState.armed){skipped.push(actor+':already-notified');continue;}

      const lastAt=Date.parse(actorState.lastNotifiedAt)||0;
      if(lastAt&&now.getTime()-lastAt<COOLDOWN_MS){
        actorState.armed=false;
        changed=true;
        skipped.push(actor+':cooldown');
        continue;
      }

      try{
        const push=await send(actor,{
          title:'💧 Низкая влажность дома',
          body:alertText(humidity).replace(/^💧\s*/, ''),
          tag:'home-humidity',
          url:'/?item=smart-home',
        },options);
        if(!push?.sent){skipped.push(actor+':push-not-configured');continue;}
        actorState.armed=false;
        actorState.lastNotifiedAt=nowIso;
        changed=true;
        sent.push(actor);
      }catch{
        skipped.push(actor+':send-failed');
      }
    }
  }

  if(state.lastHumidity!==humidity){state.lastHumidity=humidity;changed=true;}
  if(changed){
    state.updatedAt=nowIso;
    await db.write(state);
  }
  return{humidity,sent,skipped,state:normalizeHumidityAlertState(state)};
}

module.exports={
  DB_ACTOR,DB_KEY,LOW_THRESHOLD,REARM_THRESHOLD,COOLDOWN_MS,
  normalizeHumidityAlertState,extractHumidity,alertText,evaluateHumidityAlert,
};
