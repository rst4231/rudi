const crypto=require('node:crypto');
const {Pool}=require('pg');
const {resolveTelegramBotToken}=require('./products-bought.cjs');
const TABLE='rudi_state_v2';
const ECIES_CONTEXT=Buffer.from('rudi-neon-migration-v1');
const ENCRYPTED_NEON_URI=Object.freeze({
  x:'xgKL-MH3wddRhHqIb63OZ5X_gP-QlRGY6fAHX-W1TmY',
  y:'qrEMrozjL3MfI_EjN9saFfJwPNoN86lhEgLMsrBTLhY',
  iv:'Af8KHRa4HhRVwjC4',
  ct:'rrjGKwnveNGKOaIEnTjH73OPQFfhJozU5mLKeo_N3TmmBn7qKCvDmCqceB5Mmg-2MvoWN_e2LKpXVoytp3ifWHbU2gL3ZGjDNZugZ5hm-pVxg0GsYiyUuP1zEvS6yECHatceYaullEmS6TmVV0ql-b_uJumYcKryenoAB8LnNWY61GOMAeWJGaAEFlZK0WcJN5NKwSEqsvYyQsw',
  tag:'228NtBcteYXIcZ50BcM4fQ',
});
const clean=v=>String(v??'').trim();
const tags=v=>[...new Set((Array.isArray(v)?v:[]).map(clean).filter(Boolean))].slice(0,32);
function expiry(o={},now=Date.now()){if(o.expiresAt)return String(o.expiresAt);const ttl=Number(o.ttl||0);return Number.isFinite(ttl)&&ttl>0?new Date(now+ttl*1000).toISOString():null}
function derivePrivateScalar(secret){
  const token=clean(secret);if(!token)throw new Error('vercel-postgres-secret-missing');
  let c=crypto.createHmac('sha256',token).update('rudi-data-api-es256-v1').digest();
  for(let i=0;i<16;i++){const e=crypto.createECDH('prime256v1');try{e.setPrivateKey(c);return c}catch(_){c=crypto.createHash('sha256').update(c).update(Buffer.from([i+1])).digest()}}
  throw new Error('vercel-postgres-key-invalid');
}
function decryptVercelPostgresUri(env=process.env){
  const ecdh=crypto.createECDH('prime256v1');ecdh.setPrivateKey(derivePrivateScalar(resolveTelegramBotToken(env)));
  const pub=Buffer.concat([Buffer.from([4]),Buffer.from(ENCRYPTED_NEON_URI.x,'base64url'),Buffer.from(ENCRYPTED_NEON_URI.y,'base64url')]);
  const key=crypto.createHash('sha256').update(ecdh.computeSecret(pub)).update(ECIES_CONTEXT).digest();
  const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(ENCRYPTED_NEON_URI.iv,'base64url'));d.setAuthTag(Buffer.from(ENCRYPTED_NEON_URI.tag,'base64url'));
  const uri=Buffer.concat([d.update(Buffer.from(ENCRYPTED_NEON_URI.ct,'base64url')),d.final()]).toString('utf8');
  if(!uri.startsWith('postgresql://'))throw new Error('vercel-postgres-uri-invalid');return uri;
}
let sharedPool=null,poolKey='',schemaPromise=null;
function poolFor(o={}){
  if(o.pool)return o.pool;
  const uri=clean(o.connectionString||(o.env||process.env).RUDI_POSTGRES_URL||decryptVercelPostgresUri(o.env||process.env));
  const key=crypto.createHash('sha256').update(uri).digest('hex');
  if(!sharedPool||key!==poolKey){
    sharedPool=new Pool({connectionString:uri,max:4,idleTimeoutMillis:30000,connectionTimeoutMillis:6000,keepAlive:true,ssl:{rejectUnauthorized:true},application_name:'rudi-vercel'});
    poolKey=key;schemaPromise=null;
    try{require('@vercel/functions').attachDatabasePool?.(sharedPool)}catch(_){}
  }
  return sharedPool;
}
async function ensureSchema(o={}){
  if(o.skipSchema)return true;
  if(!schemaPromise){const p=poolFor(o);schemaPromise=p.query(`CREATE TABLE IF NOT EXISTS public.${TABLE}(
    namespace TEXT NOT NULL,key TEXT NOT NULL,value JSONB NOT NULL,tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(namespace,key))`).then(()=>true).catch(e=>{schemaPromise=null;throw e})}
  return schemaPromise;
}
const iso=v=>{if(!v)return'';const d=v instanceof Date?v:new Date(v);return Number.isFinite(d.getTime())?d.toISOString():String(v)};
const row=r=>r?{namespace:String(r.namespace||''),key:String(r.key||''),value:r.value,tags:tags(r.tags),expires_at:r.expires_at?iso(r.expires_at):null,updated_at:iso(r.updated_at)}:null;
function createVercelStateClient(o={}){
  const p=poolFor(o);const ready=()=>ensureSchema({...o,pool:p});
  return{
    async health(){await ready();const r=await p.query('SELECT NOW() now');return{ok:true,storage:'vercel-postgres',now:iso(r.rows[0].now)}},
    async getRecord(ns,key){await ready();const r=await p.query(`SELECT namespace,key,value,tags,expires_at,updated_at FROM public.${TABLE} WHERE namespace=$1 AND key=$2 LIMIT 1`,[String(ns||''),String(key||'')]);return row(r.rows[0])},
    async setRecord(v){await ready();const ns=String(v?.namespace||''),key=String(v?.key||'');if(!ns||!key)throw new Error('rudi-vercel-key-invalid');const updated=String(v?.updated_at||v?.updatedAt||new Date().toISOString());await p.query(`INSERT INTO public.${TABLE}(namespace,key,value,tags,expires_at,updated_at) VALUES($1,$2,$3::jsonb,$4::jsonb,$5::timestamptz,$6::timestamptz) ON CONFLICT(namespace,key) DO UPDATE SET value=EXCLUDED.value,tags=EXCLUDED.tags,expires_at=EXCLUDED.expires_at,updated_at=EXCLUDED.updated_at`,[ns,key,JSON.stringify(v?.value??null),JSON.stringify(tags(v?.tags)),v?.expires_at||v?.expiresAt||null,updated]);return{ok:true,updatedAt:updated}},
    async set(ns,key,value,co={}){return this.setRecord({namespace:ns,key,value,tags:tags(co.tags),expires_at:expiry(co,Number(co.now||Date.now()))})},
    async setIfAbsent(ns,key,value,co={}){await ready();const r=await p.query(`INSERT INTO public.${TABLE}(namespace,key,value,tags,expires_at,updated_at) VALUES($1,$2,$3::jsonb,$4::jsonb,$5::timestamptz,NOW()) ON CONFLICT(namespace,key) DO UPDATE SET value=EXCLUDED.value,tags=EXCLUDED.tags,expires_at=EXCLUDED.expires_at,updated_at=NOW() WHERE public.${TABLE}.expires_at IS NOT NULL AND public.${TABLE}.expires_at<=NOW() RETURNING key`,[String(ns||''),String(key||''),JSON.stringify(value??null),JSON.stringify(tags(co.tags)),expiry(co,Number(co.now||Date.now()))]);return r.rowCount>0},
    async remove(ns,key){await ready();await p.query(`DELETE FROM public.${TABLE} WHERE namespace=$1 AND key=$2`,[String(ns||''),String(key||'')]);return true},
    async list(ns){await ready();const r=await p.query(`SELECT namespace,key,value,tags,expires_at,updated_at FROM public.${TABLE} WHERE namespace=$1 ORDER BY key`,[String(ns||'')]);return r.rows.map(row)},
    async expireTag(ns,tag){await ready();const r=await p.query(`DELETE FROM public.${TABLE} WHERE namespace=$1 AND tags ? $2`,[String(ns||''),String(tag||'')]);return Number(r.rowCount||0)},
    async clearExcept(ns,key){await ready();await p.query(`DELETE FROM public.${TABLE} WHERE NOT(namespace=$1 AND key=$2)`,[String(ns||''),String(key||'')]);return true},
    async allRows(){await ready();const r=await p.query(`SELECT namespace,key,value,tags,expires_at,updated_at FROM public.${TABLE} ORDER BY namespace,key`);return r.rows.map(row)}
  };
}
module.exports={TABLE,derivePrivateScalar,decryptVercelPostgresUri,createVercelStateClient};
