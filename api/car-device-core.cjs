'use strict';
const crypto = require('node:crypto');
const { createCarPairingGate } = require('./car-device-admin.cjs');

const DEVICE_NAMESPACE = 'rudi-car-device-v1';
const LOCATION_NAMESPACE = 'rudi-car-device-location-v1';
const PAIRING_TTL_SECONDS = 10 * 60;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const failure = message => new Error(message);

function validateLocation(value, now) {
  const {latitude,longitude,accuracy,capturedAt} = value;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100
    || typeof capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(capturedAt)) {
    throw failure('car-device-location-invalid');
  }
  const time = Date.parse(capturedAt);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,19) !== capturedAt.slice(0,19)
    || time > now + 5 * 60000 || time < now - 90 * 86400000) throw failure('car-device-location-invalid');
  return {latitude,longitude,accuracy,capturedAt:new Date(time).toISOString()};
}

function createCarDeviceService(options = {}) {
  const client = options.client;
  if (!client) throw new Error('car-device-storage-required');
  const now = typeof options.now === 'function' ? options.now : () => options.now ?? Date.now();
  const pairingGate = createCarPairingGate({client,now});
  const read = async key => (await client.getRecord(DEVICE_NAMESPACE,key))?.value ?? null;
  async function stored(action) {
    try { return await action(); }
    catch (error) {
      if (String(error?.message || '').startsWith('car-device-')) throw error;
      // Never return or log upstream messages, tokens, pairing codes, or points.
      throw failure('car-device-unavailable');
    }
  }
  async function createPairing() {
    return stored(async () => {
      const epoch = crypto.randomBytes(24).toString('base64url');
      const code = String(crypto.randomInt(1000000)).padStart(6,'0');
      const expiresAt = new Date(Number(now()) + PAIRING_TTL_SECONDS * 1000).toISOString();
      const inserted = await client.setIfAbsent(DEVICE_NAMESPACE,'pairing:'+hash(code),{epoch,expiresAt},{ttl:PAIRING_TTL_SECONDS});
      if (!inserted) throw failure('car-device-unavailable');
      // A fresh owner-issued epoch immediately disconnects the previous device.
      // Late pairing writes from an older epoch can never restore its access.
      await client.set(DEVICE_NAMESPACE,'registry',{epoch});
      return {code,expiresAt};
    });
  }
  async function revoke() {
    return stored(async () => {
      await client.set(DEVICE_NAMESPACE,'registry',{epoch:crypto.randomBytes(24).toString('base64url')});
      return {paired:false};
    });
  }
  async function pair(code,deviceId = '') {
    return stored(async () => {
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw failure('car-device-code-invalid');
      const codeHash = hash(code), pairing = await read('pairing:'+codeHash);
      if (!pairing || Date.parse(pairing.expiresAt) <= Number(now()) || (await read('registry'))?.epoch !== pairing.epoch) throw failure('car-device-code-invalid');
      // Atomic and independent of process memory: parallel requests cannot redeem
      // the same code twice, including across serverless function instances.
      const resumable = /^[A-Za-z0-9_-]{20,128}$/.test(deviceId);
      const inserted = await client.setIfAbsent(DEVICE_NAMESPACE,'claimed:'+codeHash,{used:true,...(resumable?{deviceId,epoch:pairing.epoch}:{})},{ttl:PAIRING_TTL_SECONDS});
      if (!inserted) {
        const claimed = await read('claimed:'+codeHash);
        if (!resumable || claimed?.deviceId !== deviceId || claimed?.epoch !== pairing.epoch) throw failure('car-device-code-invalid');
      }
      // Stable only for this code + owner-issued secret epoch + installation.
      // A lost response can be retried without opening enrollment to another device.
      const deviceToken = resumable ? crypto.createHash('sha256').update('rudi-car-token-v2:'+code+':'+pairing.epoch+':'+deviceId).digest('base64url') : crypto.randomBytes(32).toString('base64url'), tokenHash = hash(deviceToken);
      if (await read('revoked:'+pairing.epoch)) throw failure('car-device-code-invalid');
      await client.set(DEVICE_NAMESPACE,'token:'+tokenHash,{epoch:pairing.epoch,scope:'location'});
      await client.set(DEVICE_NAMESPACE,'paired:'+pairing.epoch,{tokenHash});
      if ((await read('registry'))?.epoch !== pairing.epoch) throw failure('car-device-code-invalid');
      return {ok:true,deviceToken};
    });
  }
  async function authorize(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw failure('car-device-unauthorized');
    const tokenHash = hash(token), record = await read('token:'+tokenHash);
    if (!record || record.scope !== 'location' || (await read('registry'))?.epoch !== record.epoch
      || (await read('paired:'+record.epoch))?.tokenHash !== tokenHash || await read('revoked:'+record.epoch)) throw failure('car-device-unauthorized');
    return record;
  }
  async function locationRows() {
    const rows = await client.list(LOCATION_NAMESPACE);
    return rows.filter(row => row?.value && Number.isFinite(Date.parse(row.value.capturedAt)))
      .sort((a,b) => Date.parse(b.value.capturedAt) - Date.parse(a.value.capturedAt));
  }
  async function location(token,value) {
    return stored(async () => {
      await authorize(token);
      const point = validateLocation(value,Number(now())), time = Date.parse(point.capturedAt);
      // Immutable per-capture rows avoid a read/modify/write race. A delayed old
      // upload cannot replace or delete a newer row, even after a process crash.
      const inserted = await client.setIfAbsent(LOCATION_NAMESPACE,String(time),point);
      const rows = await locationRows(), latest = rows[0];
      if (!latest) throw failure('car-device-unavailable');
      const latestTime = Date.parse(latest.value.capturedAt);
      // Delete only rows older than the newest point this request observed.
      // Concurrent newer inserts are therefore never candidates for deletion.
      await Promise.all(rows.filter(row => Date.parse(row.value.capturedAt) < latestTime)
        .map(row => client.remove(LOCATION_NAMESPACE,row.key)));
      return {ok:true,accepted:Boolean(inserted && time === latestTime)};
    });
  }
  async function readState() {
    return stored(async () => {
      const [registry,rows] = await Promise.all([read('registry'),locationRows()]);
      const paired = registry?.epoch ? Boolean((await read('paired:'+registry.epoch))?.tokenHash) && !await read('revoked:'+registry.epoch) : false;
      return {lastLocation:rows[0]?.value ?? null,carDevice:{paired}};
    });
  }
  async function handleRequest(req,res) {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
    if (req.method !== 'POST') return res.status(405).json({ok:false,error:'method-not-allowed'});
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    try {
      const authorization = req.headers?.authorization || req.headers?.Authorization || '';
      const bearer = typeof authorization === 'string' ? authorization.match(/^Bearer ([A-Za-z0-9_-]+)$/i)?.[1] : '';
      if (body.operation === 'pair') {
        await pairingGate.pairAttempt(body.deviceId);
        return res.status(200).json(await pair(body.code,body.deviceId));
      }
      if (body.operation === 'location') {
        const authorization = req.headers?.authorization || req.headers?.Authorization || '';
        const token = typeof authorization === 'string' ? authorization.match(/^Bearer ([A-Za-z0-9_-]+)$/i)?.[1] : '';
        return res.status(200).json(await location(token,body));
      }
      if (body.operation === 'disconnect') {
        const record=await authorize(bearer);
        await client.set(DEVICE_NAMESPACE,'revoked:'+record.epoch,{revoked:true});
        return res.status(200).json({ok:true});
      }
      return res.status(400).json({ok:false,error:'bad-operation'});
    } catch (error) {
      const message = String(error?.message || '');
      const status = message === 'car-device-rate-limited' ? 429 : message === 'car-device-unauthorized' ? 401 : ['car-device-code-invalid','car-device-location-invalid'].includes(message) ? 400 : 503;
      return res.status(status).json({ok:false,error:status === 503 ? 'car-device-unavailable' : message});
    }
  }
  return {createPairing,revoke,pair,location,readState,handleRequest,pairingGate};
}
module.exports = {createCarDeviceService};
