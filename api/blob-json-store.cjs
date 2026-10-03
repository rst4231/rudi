const DEFAULT_PREFIX='rudi-state-v2';
const DEFAULT_PROJECT_ID='prj_tg663wlSXTaoE2HNfekiymY0IF63';
const DEFAULT_TEAM_ID='team_XGmOyYr1uet38Pk9Ze7ScQCz';
const DEFAULT_STORE_NAME='rudi-state';
const MIGRATION_MARKER_KEY='migration/neon-to-blob-2026-10-03-v1';

let rememberedStoreId='';
let migrationReady=false;

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

function isAlreadyExistsError(error){
  const status=Number(error?.status||error?.statusCode||error?.response?.status||0);
  const text=String(error?.message||error)+' '+String(error?.detail||'');
  return status===409||/already exists|conflict|overwrite/i.test(text);
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
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  const projectId=String(options.projectId||env.VERCEL_PROJECT_ID||DEFAULT_PROJECT_ID);
  const teamId=String(options.teamId||env.VERCEL_TEAM_ID||DEFAULT_TEAM_ID);
  const storeName=String(options.storeName||DEFAULT_STORE_NAME);

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
    rememberedStoreId=storeId;
    return storeId;
  }

  async function auth(){
    const token=String(env.BLOB_READ_WRITE_TOKEN||'').trim();
    if(token)return{token,mode:'token'};
    const oidcToken=String(env.VERCEL_OIDC_TOKEN||'').trim();
    const storeId=String(env.BLOB_STORE_ID||rememberedStoreId||'').trim();
    if(oidcToken&&storeId)return{oidcToken,storeId,mode:'oidc-env'};
    if(oidcToken)return{oidcToken,mode:'oidc-env'};
    // @vercel/blob 2.8+ resolves the deployment OIDC token from the
    // Vercel request context automatically. Do not block zero-config auth.
    return{mode:'oidc-auto'};
  }

  async function read(key){
    const pathname=fullPath(prefix,key);
    let credentials;
    try{credentials=await auth()}catch(error){throw isBlobUnavailableError(error)?error:blobUnavailableError(error?.message)}
    const {mode:_mode,...sdkCredentials}=credentials||{};
    let result;
    try{
      result=await client.get(pathname,{access:'private',useCache:false,...sdkCredentials});
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

  async function write(key,value,writeOptions={}){
    const pathname=fullPath(prefix,key);
    let credentials;
    try{credentials=await auth()}catch(error){throw isBlobUnavailableError(error)?error:blobUnavailableError(error?.message)}
    const {mode:_mode,...sdkCredentials}=credentials||{};
    const body=JSON.stringify(value);
    try{
      await client.put(pathname,body,{
        access:'private',
        allowOverwrite:writeOptions.allowOverwrite!==false,
        addRandomSuffix:false,
        cacheControlMaxAge:60,
        contentType:'application/json',
        ...sdkCredentials,
      });
    }catch(error){
      if(isBlobUnavailableError(error))throw blobUnavailableError(error?.message||error);
      throw error;
    }
    return value;
  }

  async function writeIfAbsent(key,value){
    try{
      await write(key,value,{allowOverwrite:false});
      return true;
    }catch(error){
      if(isAlreadyExistsError(error))return false;
      throw error;
    }
  }

  async function remove(key){
    const pathname=fullPath(prefix,key);
    const credentials=await auth();
    const {mode:_mode,...sdkCredentials}=credentials||{};
    await client.del(pathname,{...sdkCredentials});
    return true;
  }

  async function listKeys(keyPrefix=''){
    const credentials=await auth();
    const {mode:_mode,...sdkCredentials}=credentials||{};
    const prefixPath=(safeSegment(prefix)||DEFAULT_PREFIX)+'/'+safeSegment(keyPrefix);
    const rows=[];
    let cursor;
    do{
      const result=await client.list({prefix:prefixPath,cursor,limit:1000,...sdkCredentials});
      for(const blob of Array.isArray(result?.blobs)?result.blobs:[]){
        const pathname=String(blob?.pathname||'');
        const root=(safeSegment(prefix)||DEFAULT_PREFIX)+'/';
        if(!pathname.startsWith(root))continue;
        let relative=pathname.slice(root.length);
        if(relative.endsWith('.json'))relative=relative.slice(0,-5);
        rows.push(relative);
      }
      cursor=String(result?.cursor||'').trim()||undefined;
    }while(cursor);
    return rows;
  }

  return{read,write,writeIfAbsent,remove,listKeys,auth};
}


async function ensureMigrationReady(options={}){
  if(options.bypassMigrationGate===true||migrationReady)return true;
  const store=options.migrationBlobStore||createBlobJsonStore({
    prefix:'rudi-state-v2',
    env:options.env||process.env,
    ...(options.blobClient||options.client?{client:options.blobClient||options.client}:{}),
    ...(options.fetchImpl?{fetchImpl:options.fetchImpl}:{}),
  });
  const marker=await store.read(MIGRATION_MARKER_KEY);
  if(marker&&marker.status==='complete'){
    migrationReady=true;
    return true;
  }
  const error=new Error('rudi-storage-migrating');
  error.status=503;
  throw error;
}

function markMigrationReadyForProcess(){
  migrationReady=true;
}

function resetMigrationReadyForTests(){
  migrationReady=false;
}

module.exports={
  DEFAULT_PREFIX,
  DEFAULT_PROJECT_ID,
  DEFAULT_TEAM_ID,
  MIGRATION_MARKER_KEY,
  createBlobJsonStore,
  ensureMigrationReady,
  markMigrationReadyForProcess,
  resetMigrationReadyForTests,
  isBlobUnavailableError,
  isAlreadyExistsError,
  fullPath,
  safeSegment,
};
