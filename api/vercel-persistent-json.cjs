const {
  DEFAULT_PROJECT_ID,
  DEFAULT_TEAM_ID,
  createBlobJsonStore: createRawBlobJsonStore,
  ensureMigrationReady,
  isBlobUnavailableError,
  fullPath,
}=require('./blob-json-store.cjs');

const DEFAULT_PREFIX='rudi-state-v1';

function createBlobJsonStore(options={}){
  return createRawBlobJsonStore({
    ...options,
    prefix:String(options.prefix||DEFAULT_PREFIX),
  });
}

function createMigratingStateStore(options={}){
  const key=String(options.key||'').trim();
  if(!key)throw new Error('rudi-state-key-invalid');
  const blobStore=options.blobStore||createBlobJsonStore(options);
  const legacyRead=typeof options.legacyRead==='function'?options.legacyRead:async()=>null;
  const legacyWrite=typeof options.legacyWrite==='function'?options.legacyWrite:null;
  const onWarn=typeof options.onWarn==='function'?options.onWarn:()=>{};

  async function read(){
    await ensureMigrationReady(options);
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
    await ensureMigrationReady(options);
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
