const {
  DEFAULT_PROJECT_ID,
  DEFAULT_TEAM_ID,
  createBlobJsonStore: createRawBlobJsonStore,
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

  async function read(){
    return blobStore.read(key);
  }

  async function write(value){
    await blobStore.write(key,value);
    return value;
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
