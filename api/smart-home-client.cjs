const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { assertAllowedTelegramUser } = require('./rudi-access.cjs');
const { authorizeWithSession } = require('./rudi-session.cjs');
const { appendActivity } = require('./activity-journal-store.cjs');
const { createStrictRuntimeCache } = require('./strict-runtime-cache.cjs');
const { readRecipients } = require('./partner-notification-store.cjs');
const { telegramSendMessage } = require('./telegram-notifications.cjs');

const BASE = 'https://api.iot.yandex.net/v1.0';
const CACHE_MS = 30000;
let cache = null;
let cacheAt = 0;
const CAMERA_STATUS_NAMESPACE = 'rudi-camera-status-v1';
const CAMERA_STATUS_TTL_SECONDS = 60 * 60 * 24 * 3650;

function cameraStatusCache(options = {}) {
  return options.cameraStatusCache || createStrictRuntimeCache({
    namespace: CAMERA_STATUS_NAMESPACE,
    ...(options.cacheOptions || {}),
  });
}

function isCameraDevice(device) {
  const type=String(device?.type||'').toLocaleLowerCase('ru-RU');
  const name=String(device?.name||'').toLocaleLowerCase('ru-RU');
  return /camera/.test(type)||/камера/.test(name);
}

async function observeCameraStatus(snapshot, options = {}) {
  const camera=(snapshot?.devices||[]).find(isCameraDevice);
  if(!camera?.id) return {found:false};

  let detail;
  try{
    detail=await yandex('/devices/'+encodeURIComponent(camera.id));
  }catch(error){
    console.warn('RUDI_CAMERA_STATUS_QUERY_WARN',String(error?.message||error));
    return {found:true,error:String(error?.message||error)};
  }

  const state=String(detail?.state||'').toLowerCase();
  if(!['online','offline'].includes(state)) return {found:true,state:''};

  const store=cameraStatusCache(options);
  const key='camera:'+String(camera.id);
  const previous=await store.get(key).catch(()=>null);
  await store.set(key,{state,updatedAt:new Date().toISOString()},{
    ttl:CAMERA_STATUS_TTL_SECONDS,
    tags:['rudi-camera-status'],
    name:key,
  }).catch(error=>console.warn('RUDI_CAMERA_STATUS_STORE_WARN',String(error?.message||error)));

  if(!previous?.state||previous.state===state){
    return {found:true,state,changed:false};
  }

  try{
    const recipients=await readRecipients(options);
    const chatId=Number(recipients?.['Рустам']);
    if(Number.isInteger(chatId)&&chatId>0){
      const text=state==='online'
        ?'📷 <b>Камера снова онлайн</b>'
        :'📷 <b>Камера офлайн</b>';
      await telegramSendMessage(chatId,text,{
        ...options,
        tab:'home',
        buttonText:'Открыть RUDI',
      });
    }
  }catch(error){
    console.warn('RUDI_CAMERA_STATUS_NOTIFY_WARN',String(error?.message||error));
  }

  return {found:true,state,changed:true,previousState:previous.state};
}

function auth(raw, botToken) {
  const params = new URLSearchParams(String(raw || ''));
  const hash = String(params.get('hash') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('telegram-auth-invalid');
  params.delete('hash');

  const check = [...params.entries()]
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => k + '=' + v)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(String(botToken || '')).digest();
  const expected = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('telegram-auth-invalid');
  }

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > 86400 || authDate > now + 300) {
    throw new Error('telegram-auth-expired');
  }

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); }
  catch { throw new Error('telegram-user-invalid'); }
  if (!user?.id) throw new Error('telegram-user-invalid');

  return { actor: assertAllowedTelegramUser(user), user };
}

function status(error) {
  const code = String(error?.message || error || '');
  if (code.startsWith('telegram-auth') || code === 'telegram-user-invalid' || code.startsWith('rudi-session')) return 401;
  if (code === 'rudi-access-denied') return 403;
  if (code === 'yandex-iot-not-configured') return 503;
  if (code.startsWith('bad-')) return 400;
  return Number(error?.status) || 500;
}

function token() {
  const value = String(process.env.YANDEX_IOT_TOKEN || '').trim();
  if (!value) throw new Error('yandex-iot-not-configured');
  return value;
}

async function yandex(path, { method='GET', body=null }={}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token(),
      ...(body == null ? {} : { 'Content-Type':'application/json' }),
    },
    body: body == null ? undefined : JSON.stringify(body),
    cache:'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status === 'error') {
    const error = new Error('yandex-iot-error:' + String(data?.message || data?.error || response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}

function cap(c) {
  return {
    type:String(c?.type || ''),
    parameters:c?.parameters && typeof c.parameters === 'object' ? c.parameters : {},
    state:c?.state && typeof c.state === 'object' ? c.state : null,
  };
}

function prop(p) {
  return {
    type:String(p?.type || ''),
    parameters:p?.parameters && typeof p.parameters === 'object' ? p.parameters : {},
    state:p?.state && typeof p.state === 'object' ? p.state : null,
  };
}

function normalize(data) {
  return {
    requestId:String(data?.request_id || ''),
    households:(Array.isArray(data?.households)?data.households:[]).map(x => ({
      id:String(x?.id||''), name:String(x?.name||''), type:String(x?.type||'')
    })),
    rooms:(Array.isArray(data?.rooms)?data.rooms:[]).map(x => ({
      id:String(x?.id||''), name:String(x?.name||''), householdId:String(x?.household_id||'')
    })),
    devices:(Array.isArray(data?.devices)?data.devices:[]).map(x => ({
      id:String(x?.id||''), name:String(x?.name||''), type:String(x?.type||''),
      room:String(x?.room||''), householdId:String(x?.household_id||''),
      capabilities:(Array.isArray(x?.capabilities)?x.capabilities:[]).map(cap),
      properties:(Array.isArray(x?.properties)?x.properties:[]).map(prop),
    })),
    scenarios:(Array.isArray(data?.scenarios)?data.scenarios:[]).map(x => ({
      id:String(x?.id||''), name:String(x?.name||''), active:Boolean(x?.is_active)
    })),
  };
}

async function home(force=false, options={}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  cache = normalize(await yandex('/user/info'));
  cacheAt = Date.now();
  observeCameraStatus(cache,options).catch(error=>{
    console.warn('RUDI_CAMERA_STATUS_WARN',String(error?.message||error));
  });
  return cache;
}

function cleanId(value, name) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new Error('bad-' + name);
  return id;
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g,' ').trim().slice(0,80);
}

async function switchSmartHomeDevice(deviceId, deviceName, value, actor='Рустам') {
  const id = cleanId(deviceId,'device-id');
  const name = cleanName(deviceName) || 'Устройство';
  if (typeof value !== 'boolean') throw new Error('bad-value');

  const result = await yandex('/devices/actions', {
    method:'POST',
    body:{devices:[{id,actions:[{
      type:'devices.capabilities.on_off',
      state:{instance:'on',value}
    }]}]},
  });

  const requestId = String(result?.request_id || '');
  const actionStatus = String(result?.devices?.[0]?.capabilities?.[0]?.state?.action_result?.status || '');
  let activity = null;

  if (actionStatus === 'DONE') {
    cache = null;
    cacheAt = 0;
    const female = actor === 'Диана';
    const verb = value ? (female ? 'включила' : 'включил') : (female ? 'выключила' : 'выключил');
    if(!/камера|camera/iu.test(name)){
      activity = { text:actor + ' ' + verb + ' ' + name, icon:'🏠', createdAt:new Date().toISOString() };
      await appendActivity({
        type:'smart-home',
        actor,
        text:activity.text,
        icon:activity.icon,
        targetTab:'home',
        dedupeKey:requestId ? 'smart-home:' + requestId : '',
      }).catch(error => console.warn('RUDI_SMART_HOME_ACTIVITY_WARN', String(error?.message || error)));
    }
  }

  return { requestId, status:actionStatus, activity };
}

async function runSmartHomeCapability(deviceId, deviceName, capabilityType, instance, value, actor='Рустам') {
  const id = cleanId(deviceId,'device-id');
  const name = cleanName(deviceName) || 'Устройство';
  capabilityType = String(capabilityType || '');
  instance = String(instance || '');

  const allowed =
    (capabilityType === 'devices.capabilities.mode' && instance === 'work_speed') ||
    (capabilityType === 'devices.capabilities.toggle' && instance === 'pause');
  if (!allowed) throw new Error('bad-capability');

  let nextValue = value;
  if (instance === 'pause') {
    if (typeof nextValue !== 'boolean') throw new Error('bad-value');
  } else {
    nextValue = String(nextValue || '');
    if (!new Set(['fast','medium','slow','min']).has(nextValue)) throw new Error('bad-value');
  }

  const result = await yandex('/devices/actions', {
    method:'POST',
    body:{devices:[{id,actions:[{
      type:capabilityType,
      state:{instance,value:nextValue}
    }]}]},
  });

  const requestId = String(result?.request_id || '');
  const actionStatus = String(result?.devices?.[0]?.capabilities?.[0]?.state?.action_result?.status || '');
  let activity = null;

  if (actionStatus === 'DONE') {
    cache = null;
    cacheAt = 0;
    const female = actor === 'Диана';
    let text = '';
    if (instance === 'pause') {
      const verb = nextValue
        ? (female ? 'поставила' : 'поставил')
        : (female ? 'продолжила' : 'продолжил');
      text = actor + ' ' + verb + ' уборку · ' + name;
    } else {
      const labels = {fast:'быстрый',medium:'средний',slow:'медленный',min:'минимальный'};
      const verb = female ? 'выбрала' : 'выбрал';
      text = actor + ' ' + verb + ' ' + labels[nextValue] + ' режим для ' + name;
    }
    activity = {text,icon:'🏠',createdAt:new Date().toISOString()};
    await appendActivity({
      type:'smart-home',
      actor,
      text:activity.text,
      icon:activity.icon,
      targetTab:'home',
      dedupeKey:requestId ? 'smart-home:' + requestId : '',
    }).catch(error => console.warn('RUDI_SMART_HOME_ACTIVITY_WARN', String(error?.message || error)));
  }

  return { requestId, status:actionStatus, activity };
}

async function handleSmartHomeRequest(req, res) {
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ok:false,error:'method-not-allowed'});

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  let session;
  try {
    const botToken = resolveTelegramBotToken(process.env);
    session = authorizeWithSession(
      req,
      body.initData,
      (value) => auth(value, botToken),
      { botToken }
    );
  } catch (error) {
    return res.status(status(error)).json({ok:false,error:String(error?.message || error)});
  }

  const operation = String(body.operation || 'list');
  try {
    if (operation === 'list') {
      return res.status(200).json({ok:true,actor:session.actor,...await home(Boolean(body.force),{
        env:process.env,
        fetchImpl:globalThis.fetch,
      })});
    }

    if (operation === 'switch') {
      const result = await switchSmartHomeDevice(body.deviceId, body.deviceName, body.value, session.actor);
      return res.status(200).json({ok:true,...result});
    }

    if (operation === 'capability') {
      const result = await runSmartHomeCapability(
        body.deviceId,
        body.deviceName,
        body.capabilityType,
        body.instance,
        body.value,
        session.actor
      );
      return res.status(200).json({ok:true,...result});
    }

    if (operation === 'scenario') {
      if (session.actor !== 'Рустам') {
        return res.status(403).json({ok:false,error:'smart-home-scenarios-forbidden'});
      }
      const scenarioId = cleanId(body.scenarioId,'scenario-id');
      const result = await yandex('/scenarios/' + encodeURIComponent(scenarioId) + '/actions',{method:'POST'});
      cache = null;
      cacheAt = 0;
      return res.status(200).json({ok:true,requestId:String(result?.request_id || '')});
    }

    return res.status(400).json({ok:false,error:'bad-operation'});
  } catch (error) {
    console.error('RUDI_SMART_HOME_ERROR', session.actor, operation, String(error?.message || error));
    return res.status(status(error)).json({ok:false,error:String(error?.message || error)});
  }
}

module.exports = {
  handleSmartHomeRequest,
  readSmartHomeSnapshot: home,
  switchSmartHomeDevice,
  runSmartHomeCapability,
  isCameraDevice,
  observeCameraStatus,
};
