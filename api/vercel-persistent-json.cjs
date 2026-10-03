const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');

const DEFAULT_PREFIX='rudi-state-v1';
const DEFAULT_PROJECT_ID='prj_tg663wlSXTaoE2HNfekiymY0IF63';
const DEFAULT_TEAM_ID='team_XGmOyYr1uet38Pk9Ze7ScQCz';
const DEFAULT_STORE_NAME='rudi-state';
const STORE_ID_KEY='store-id';
const STORE_ID_TTL=60*60*24*365;

function safeSegment(value){
  return String(value||'')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g,'-')
    .replace(/-+/g,'-')
    .replace(/^[-/]+|[-/]+$/g,'');
}
function fullPath(prefix,key){
  const safePrefix=safeSegment(prefix)||DEFAULT_PREFIX;
  const safeKey=safeSegment(key);
  if(!safeKey)throw new Error('rudi-blob-key-invalid');
  return safePrefix+'/'+safeKey+'.json';
}
function blobUnavailableError(detail=''){
  const error=new Error('rudi-blob-unavailable');
  error.detail=String(detail||'');
  return error;
}
function isBlobUnavailableError(error){
  if(String(error?.message||error)==='rudi-blob-unavailable')return true;
  const text=String(error?.message||error)+' '+String(error?.detail||'');
  return /(blob.*store.*(missing|not found|required|configured|available)|BLOB_READ_WRITE_TOKEN|BLOB_STORE_ID|oidc.*blob|unauthorized|forbidden)/i.test(text);
}
function defaultCache(options={}){
  return createStrictRuntimeCache({
    namespace:'rudi-blob-bootstrap-v1',
    confirmWrites:false,
    ...(options.cacheOptions||{})
  });
}
function defaultClient(){
  return require('@vercel/blob');
}
async function readStreamText(stream){
  if(!stream)return'';
  return new Response(stream).text();
}
function createBlobJsonStore(options={}){
  const prefix=String(options.prefix||DEFAULT_PREFIX);
  const env=options.env||process.env;
  const client=options.client||defaultClient();
  const cache=options.cache||defaultCache(options);
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const projectId=String(options.projectId||env.VERCEL_PROJECT_ID||DEFAULT_PROJECT_ID);
  const teamId=String(options.teamId||env.VERCEL_TEAM_ID||DEFAULT_TEAM_ID);
  const storeName=String(options.storeName||DEFAULT_STORE_NAME);

  async function cachedStoreId(){
    try{return String(await cache.get(STORE_ID_KEY)||'').trim()}catch(_){return''}
  }
  async function rememberStoreId(storeId){
    if(!storeId)return;
    try{
      await cache.set(STORE_ID_KEY,storeId,{ttl:STORE_ID_TTL,tags:['rudi-blob-store'],name:'rudi-blob-store-id'});
    }catch(_){}
  }
  async function provisionStore(oidcToken){
    if(typeof fetchImpl!=='function'||!oidcToken||!projectId)throw blobUnavailableError('blob-store-provision-unavailable');
    const response=await fetchImpl(
      'https://api.vercel.com/storage/stores/blob'+(teamId?'?teamId='+encodeURIComponent(teamId):''),
      {
        method:'POST',
        headers:{
          authorization:'Bearer '+oidcToken,
          accept:'application/json',
          'content-type':'application/json',
        },
        body:JSON.stringify({
          name:storeName,
          region:'iad1',
          access:'private',
          projectId,
        }),
        cache:'no-store',
      }
    );
    const text=await response.text();
    let data=null;
    try{data=text?JSON.parse(text):null}catch(_){data=null}
    if(!response.ok){
      throw blobUnavailableError('blob-store-provision-http-'+response.status+' '+String(data?.error?.message||data?.message||text||'').slice(0,240));
    }
    const store=data?.store&&typeof data.store==='object'?data.store:data;
    const storeId=String(store?.id||store?.storeId||store?.store_id||'').trim();
    if(!storeId)throw blobUnavailableError('blob-store-provision-missing-id');
    await rememberStoreId(storeId);
    return storeId;
  }
  async function auth(){
    const token=String(env.BLOB_READ_WRITE_TOKEN||'').trim();
    if(token)return{token};
    const oidcToken=String(env.VERCEL_OIDC_TOKEN||'').trim();
    let storeId=String(env.BLOB_STORE_ID||'').trim();
    if(!storeId)storeId=await cachedStoreId();
    if(storeId&&oidcToken)return{oidcToken,storeId};
    if(oidcToken){
      storeId=await provisionStore(oidcToken);
      return{oidcToken,storeId};
    }
    throw blobUnavailableError('blob-auth-missing');
  }
  async function read(key){
    const pathname=fullPath(prefix,key);
    let credentials;
    try{credentials=await auth()}catch(error){throw isBlobUnavailableError(error)?error:blobUnavailableError(error?.message)}
    let result;
    try{
      result=await client.get(pathname,{access:'private',useCache:false,...credentials});
    }catch(error){
      if(isBlobUnavailableError(error))throw blobUnavailableError(error?.message||error);
      throw error;
    }
    if(!result||Number(result.statusCode||200)===404)return null;
    if(result.statusCode&&Number(result.statusCode)!==200)return null;
    const text=await readStreamText(result.stream);
    if(!text)return null;
    try{return JSON.parse(text)}catch(_){throw new Error('rudi-blob-json-invalid')}
  }
  async function write(key,value){
    const pathname=fullPath(prefix,key);
    let credentials;
    try{credentials=await auth()}catch(error){throw isBlobUnavailableError(error)?error:blobUnavailableError(error?.message)}
    const body=JSON.stringify(value);
    try{
      await client.put(pathname,body,{
        access:'private',
        allowOverwrite:true,
        addRandomSuffix:false,
        cacheControlMaxAge:60,
        contentType:'application/json',
        ...credentials,
      });
    }catch(error){
      if(isBlobUnavailableError(error))throw blobUnavailableError(error?.message||error);
      throw error;
    }
    return value;
  }
  return{read,write,auth};
}

function createMigratingStateStore(options={}){
  const key=String(options.key||'').trim();
  if(!key)throw new Error('rudi-state-key-invalid');
  const blobStore=options.blobStore||createBlobJsonStore(options);
  const legacyRead=typeof options.legacyRead==='function'?options.legacyRead:async()=>null;
  const legacyWrite=typeof options.legacyWrite==='function'?options.legacyWrite:null;
  const onWarn=typeof options.onWarn==='function'?options.onWarn:()=>{};

  async function read(){
    try{
      const current=await blobStore.read(key);
      if(current!==null&&current!==undefined)return current;
    }catch(error){
      if(!isBlobUnavailableError(error))throw error;
      onWarn('RUDI_BLOB_READ_UNAVAILABLE',error);
      return legacyRead();
    }
    const legacy=await legacyRead();
    if(legacy===null||legacy===undefined)return legacy;
    try{await blobStore.write(key,legacy)}
    catch(error){
      if(!isBlobUnavailableError(error))throw error;
      onWarn('RUDI_BLOB_MIGRATION_UNAVAILABLE',error);
    }
    return legacy;
  }
  async function write(value){
    try{
      await blobStore.write(key,value);
      return value;
    }catch(error){
      if(!isBlobUnavailableError(error)||!legacyWrite)throw error;
      onWarn('RUDI_BLOB_WRITE_UNAVAILABLE',error);
      return legacyWrite(value);
    }
  }
  return{read,write};
}

module.exports={
  DEFAULT_PREFIX,
  DEFAULT_PROJECT_ID,
  DEFAULT_TEAM_ID,
  createBlobJsonStore,
  createMigratingStateStore,
  isBlobUnavailableError,
  fullPath,
};
