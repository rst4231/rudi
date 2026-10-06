const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTH_NAMESPACE,
  APP_STATE_NAMESPACE,
  APP_STATE_FIELD,
  readAuthRecord,
  savePinRecord,
  savePasskeys,
  readAppState,
  writeAppState,
  appStateRecordKey,
} = require('../api/rudi-auth-db.cjs');

function memoryStateClient(initial = []) {
  const map = new Map();
  const id = (namespace,key) => String(namespace)+'|'+String(key);
  for (const row of initial) map.set(id(row.namespace,row.key), structuredClone(row));
  return {
    map,
    async getRecord(namespace,key) {
      const row=map.get(id(namespace,key));
      return row ? structuredClone(row) : null;
    },
    async setRecord(row) {
      map.set(id(row.namespace,row.key), structuredClone(row));
      return {ok:true,updatedAt:row.updated_at||''};
    },
  };
}

function authRow(actor,pinRecord=null,passkeys=[]) {
  return {
    namespace:AUTH_NAMESPACE,
    key:actor,
    value:{actor,pin_record:pinRecord,passkeys,updated_at:'2026-09-22T17:00:00.000Z'},
    tags:['rudi-auth'],
    expires_at:null,
    updated_at:'2026-09-22T17:00:00.000Z',
  };
}

test('durable auth store reads actor record from D1 state client', async () => {
  const stateClient=memoryStateClient([
    authRow('Рустам',{version:1,salt:'salt',hash:'hash',updatedAt:'2026-09-22T17:00:00.000Z'})
  ]);
  const row=await readAuthRecord('Рустам',{stateClient});
  assert.equal(row.actor,'Рустам');
  assert.equal(row.pinRecord.hash,'hash');
});

test('PIN update preserves passkeys and never stores plaintext PIN', async () => {
  const stateClient=memoryStateClient([
    authRow('Рустам',null,[{actor:'Рустам',id:'cred',publicKey:'pub',rpID:'example.com'}])
  ]);
  const record={version:1,salt:'s',hash:'h',updatedAt:'2026-09-22T17:01:00.000Z'};
  const saved=await savePinRecord('Рустам',record,{stateClient});
  assert.equal(saved.pinRecord.hash,'h');
  assert.equal(saved.passkeys[0].id,'cred');
  assert.equal(JSON.stringify([...stateClient.map.values()]).includes('123456'),false);
});

test('passkey update preserves existing PIN hash', async () => {
  const stateClient=memoryStateClient([
    authRow('Диана',{version:1,salt:'s',hash:'h',updatedAt:'2026-09-22T17:00:00.000Z'})
  ]);
  const saved=await savePasskeys('Диана',[{actor:'Диана',id:'cred-d',publicKey:'pub',rpID:'example.com'}],{stateClient});
  assert.equal(saved.pinRecord.hash,'h');
  assert.equal(saved.passkeys[0].id,'cred-d');
});

test('app state is stored per key and survives auth updates', async () => {
  const stateClient=memoryStateClient([
    authRow('Рустам',{version:1,salt:'salt',hash:'hash',updatedAt:'2026-09-27T10:00:00.000Z'})
  ]);

  await writeAppState('Рустам','car:changan-univ-2023',{errors:[{id:'err_12345678',title:'Check Engine'}]},{stateClient,now:'2026-09-27T11:00:00.000Z'});
  const dedicated=stateClient.map.get(APP_STATE_NAMESPACE+'|'+appStateRecordKey('Рустам','car:changan-univ-2023'));
  assert.equal(dedicated.value.errors[0].title,'Check Engine');

  await savePinRecord('Рустам',{version:1,salt:'new-salt',hash:'new-hash',updatedAt:'2026-09-27T12:00:00.000Z'},{stateClient});
  assert.equal((await readAuthRecord('Рустам',{stateClient})).pinRecord.hash,'new-hash');
  assert.equal((await readAppState('Рустам','car:changan-univ-2023',{stateClient})).errors[0].title,'Check Engine');
});

test('concurrent app state writes cannot overwrite sibling keys', async () => {
  const stateClient=memoryStateClient([authRow('Рустам')]);
  await Promise.all([
    writeAppState('Рустам','habits',{done:3},{stateClient}),
    writeAppState('Рустам','car',{mileage:47000},{stateClient}),
    writeAppState('Рустам','mood',{value:4},{stateClient}),
  ]);
  assert.deepEqual(await readAppState('Рустам','habits',{stateClient}),{done:3});
  assert.deepEqual(await readAppState('Рустам','car',{stateClient}),{mileage:47000});
  assert.deepEqual(await readAppState('Рустам','mood',{stateClient}),{value:4});
});

test('legacy pin_record app state remains readable during gradual migration', async () => {
  const stateClient=memoryStateClient([
    authRow('Рустам',{version:1,salt:'s',hash:'h',updatedAt:'2026-09-22T17:00:00.000Z',[APP_STATE_FIELD]:{'legacy:key':{ok:true}}})
  ]);
  assert.deepEqual(await readAppState('Рустам','legacy:key',{stateClient}),{ok:true});
});
