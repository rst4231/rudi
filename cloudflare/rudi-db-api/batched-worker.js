import legacyWorker, { MessengerRoom } from './worker.js';
export { MessengerRoom };

// Additive route: unchanged /get, /set, realtime and Durable Object handling
// are delegated to the original Worker without modification.
const respond = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'},
});
const clean = (value, limit=200) => String(value ?? '').trim().slice(0,limit);
const decode = (value, fallback=null) => {
  try { return JSON.parse(String(value)); } catch { return fallback; }
};

async function readBatch(request, env) {
  const expected=String(env.RUDI_API_SECRET||'');
  if(!expected||request.headers.get('authorization')!==`Bearer ${expected}`)
    return respond({ok:false,error:'unauthorized'},401);
  if(request.method!=='POST')
    return respond({ok:false,error:'method-not-allowed'},405);
  let body;
  try {body=await request.json()} catch {return respond({ok:false,error:'invalid-json'},400);}
  const keys=body?.keys;
  if(!Array.isArray(keys)||keys.length<1||keys.length>40)
    return respond({ok:false,error:'invalid-batch-size'},400);
  const normalized=keys.map(item=>({
    namespace:clean(item?.namespace),
    key:clean(item?.key,500)
  }));
  if(normalized.some(item=>!item.namespace||!item.key))
    return respond({ok:false,error:'missing-key'},400);

  try {
    const select=`SELECT namespace, key, value, tags, expires_at, updated_at
      FROM rudi_state WHERE namespace = ?1 AND key = ?2`;
    const result=await env.DB.batch(normalized.map(({namespace,key})=>
      env.DB.prepare(select).bind(namespace,key)
    ));
    if(!Array.isArray(result)||result.length!==normalized.length)
      throw new Error('batch-results-invalid');
    const expired=[];
    const now=Date.now();
    const items=result.map((entry,index)=>{
      const row=entry?.results?.[0];
      if(!row)return {ok:true,value:null};
      const deadline=Date.parse(row.expires_at||'');
      if(row.expires_at&&Number.isFinite(deadline)&&deadline<=now){
        expired.push(normalized[index]);
        return {ok:true,value:null};
      }
      return {
        ok:true,
        value:decode(row.value),
        tags:decode(row.tags,[]),
        expiresAt:row.expires_at||null,
        updatedAt:row.updated_at||'',
      };
    });
    if(expired.length){
      const stamp=new Date(now).toISOString();
      await env.DB.batch(expired.map(({namespace,key})=>
        env.DB.prepare(`DELETE FROM rudi_state
          WHERE namespace = ?1 AND key = ?2
          AND expires_at IS NOT NULL AND expires_at <= ?3`)
          .bind(namespace,key,stamp)
      ));
    }
    return respond({ok:true,items});
  }catch(error){
    console.error('RUDI_D1_BATCH_ERROR',String(error?.message||error));
    return respond({ok:false,error:'batch-read-failed'},503);
  }
}

export default {
  async fetch(request,env,ctx){
    if(new URL(request.url).pathname==='/batch-get')
      return readBatch(request,env);
    return legacyWorker.fetch(request,env,ctx);
  }
};
