const { readAppState, writeAppState } = require('./rudi-auth-db.cjs');
const { readUiPreferences } = require('./ui-preferences-store.cjs');
const { sendPushNotification } = require('./web-push.cjs');

const DB_ACTOR='Рустам';
const DB_KEY='smart-home:temperature-alert';
const ACTORS=['Рустам','Диана'];
const COOLDOWN_MS=12*60*60*1000;

function normalizeIso(value){
  const time=Date.parse(String(value||''));
  return Number.isFinite(time)?new Date(time).toISOString():'';
}
function normalizeTemperatureAlertState(value){
  const actors={};
  for(const actor of ACTORS){
    const source=value?.actors?.[actor];
    actors[actor]={coldArmed:source?.coldArmed!==false,hotArmed:source?.hotArmed!==false,lastNotifiedAt:normalizeIso(source?.lastNotifiedAt)};
  }
  return {actors,lastTemperature:temperatureNumber(value?.lastTemperature),updatedAt:normalizeIso(value?.updatedAt)};
}
function temperatureNumber(value){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!value.trim())return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=-30&&n<=60?Number(n.toFixed(1)):null;
}
function unavailable(value){
  return value?.online===false||value?.reachable===false
    ||String(value?.state||'').toLowerCase()==='offline'
    ||String(value?.status||'').toLowerCase()==='offline'
    ||Boolean(value?.error_code||value?.errorCode)
    ||value?.state?.online===false||Boolean(value?.state?.error_code||value?.state?.errorCode);
}
function extractTemperature(snapshot){
  if(unavailable(snapshot))return null;
  for(const device of Array.isArray(snapshot?.devices)?snapshot.devices:[]){
    if(unavailable(device))continue;
    const row=(Array.isArray(device?.properties)?device.properties:[]).find(item=>item?.parameters?.instance==='temperature');
    if(!row||unavailable(row))continue;
    const value=temperatureNumber(row.state?.value);
    if(value!==null)return value;
  }
  return null;
}
// Keep the season and thresholds aligned with public/smart-home.js assessIndoorClimate.
function temperatureThresholds(at){
  const month=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',month:'numeric'}).format(at));
  const warm=month>=5&&month<=9;
  return {minimum:warm?20:18,low:warm?22:20,high:warm?25:22,maximum:warm?28:25};
}
function dbOf(options){
  if(options.db&&typeof options.db.read==='function'&&typeof options.db.write==='function')return options.db;
  return {read:()=>readAppState(DB_ACTOR,DB_KEY,options.dbOptions||{}),write:value=>writeAppState(DB_ACTOR,DB_KEY,value,options.dbOptions||{})};
}
async function evaluateTemperatureAlert(snapshot,options={}){
  const temperature=extractTemperature(snapshot);
  if(temperature===null)return {temperature:null,condition:null,sent:[],skipped:['temperature-unavailable']};
  const now=new Date(options.now||Date.now()),nowIso=now.toISOString();
  const thresholds=temperatureThresholds(now);
  const condition=temperature<thresholds.minimum?'cold':temperature>thresholds.maximum?'hot':null;
  const db=dbOf(options),state=normalizeTemperatureAlertState(await db.read());
  const sent=[],skipped=[];
  let changed=false;
  for(const actor of ACTORS){
    const actorState=state.actors[actor];
    if(temperature>=thresholds.low&&!actorState.coldArmed){actorState.coldArmed=true;changed=true;}
    if(temperature<=thresholds.high&&!actorState.hotArmed){actorState.hotArmed=true;changed=true;}
    if(!condition)continue;
    let preferences;
    try{preferences=await (options.readUiPreferencesImpl||readUiPreferences)(actor,options)}
    catch{skipped.push(actor+':preferences-unavailable');continue;}
    if(preferences?.temperatureAlertEnabled===false){skipped.push(actor+':disabled');continue;}
    const armedKey=condition+'Armed';
    if(!actorState[armedKey]){skipped.push(actor+':already-notified');continue;}
    const lastAt=Date.parse(actorState.lastNotifiedAt);
    if(Number.isFinite(lastAt)&&now.getTime()-lastAt<COOLDOWN_MS){skipped.push(actor+':cooldown');continue;}
    try{
      const push=await (options.sendPushNotificationImpl||sendPushNotification)(actor,{
        title:condition==='cold'?'🥶 Дома холодно':'🥵 Дома жарко',
        body:'Температура дома '+temperature.toFixed(1)+'°C. '+(condition==='cold'?'Стоит согреться или включить отопление.':'Стоит проветрить или включить кондиционер.'),
        tag:'home-temperature',
        url:'/?tab=home&item=smart-home',
      },options);
      if(!push?.sent){skipped.push(actor+':push-not-configured');continue;}
      actorState[armedKey]=false;actorState.lastNotifiedAt=nowIso;changed=true;sent.push(actor);
    }catch{skipped.push(actor+':send-failed');}
  }
  if(state.lastTemperature!==temperature){state.lastTemperature=temperature;changed=true;}
  if(changed){state.updatedAt=nowIso;await db.write(state);}
  return {temperature,condition,sent,skipped,state:normalizeTemperatureAlertState(state)};
}
module.exports={DB_ACTOR,DB_KEY,COOLDOWN_MS,normalizeTemperatureAlertState,extractTemperature,temperatureThresholds,evaluateTemperatureAlert};
