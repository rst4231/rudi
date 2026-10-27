// Same private records as Rudi; direct D1 binding, never an HTTP database hop.
const namespaces=new Set(['rudi-car-device-v1','rudi-car-device-location-v1','rudi-car-pair-rate-v1']);
export function createDirectCarStore(DB,{now=Date.now}={}){
 const check=ns=>{if(!namespaces.has(ns))throw Error('car-device-namespace-denied');};
 const decode=row=>row&&(!row.expires_at||Date.parse(row.expires_at)>now())?{key:row.key,value:JSON.parse(row.value)}:null;
 const expiry=o=>o?.expiresAt||((o?.ttl>0)?new Date(now()+o.ttl*1000).toISOString():null);
 return {
  async getRecord(ns,key){check(ns);return decode(await DB.prepare('SELECT key,value,expires_at FROM rudi_state WHERE namespace=? AND key=?').bind(ns,key).first());},
  async getRecords(ns,keys){check(ns);const result=await DB.prepare('SELECT key,value,expires_at FROM rudi_state WHERE namespace=? AND key IN ('+keys.map(()=>'?').join(',')+')').bind(ns,...keys).all();const rows=new Map(result.results.map(row=>[row.key,decode(row)]));return keys.map(key=>rows.get(key)||null);},
  async set(ns,key,value,o={}){check(ns);await DB.prepare("INSERT INTO rudi_state(namespace,key,value,tags,expires_at,updated_at) VALUES(?,?,?,'[]',?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,tags=excluded.tags,expires_at=excluded.expires_at,updated_at=excluded.updated_at").bind(ns,key,JSON.stringify(value),expiry(o),new Date(now()).toISOString()).run();},
  async setIfAbsent(ns,key,value,o={}){check(ns);const stamp=new Date(now()).toISOString();const result=await DB.prepare("INSERT INTO rudi_state(namespace,key,value,tags,expires_at,updated_at) VALUES(?,?,?,'[]',?,?) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,tags=excluded.tags,expires_at=excluded.expires_at,updated_at=excluded.updated_at WHERE rudi_state.expires_at IS NOT NULL AND rudi_state.expires_at<=?").bind(ns,key,JSON.stringify(value),expiry(o),stamp,stamp).run();return Number(result.meta?.changes)>0;},
  async remove(ns,key){check(ns);await DB.prepare('DELETE FROM rudi_state WHERE namespace=? AND key=?').bind(ns,key).run();},
  async list(ns){check(ns);const rows=await DB.prepare('SELECT key,value,expires_at FROM rudi_state WHERE namespace=? ORDER BY key LIMIT 1000').bind(ns).all();return rows.results.map(decode).filter(Boolean);}
 };
}
