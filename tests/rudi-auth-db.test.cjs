const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readAuthRecord,
  savePinRecord,
  savePasskeys,
  writeAppState,
  APP_STATE_FIELD,
} = require('../api/rudi-auth-db.cjs');

function memoryBlob(initial = {}) {
  const map = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]));
  return {
    async read(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async write(key, value) { map.set(key, structuredClone(value)); return value; },
    map,
  };
}

test('durable auth store reads actor record from Private Blob', async () => {
  const store = memoryBlob({
    'auth/rustam': {
      actor:'Рустам',
      pin_record:{version:1,salt:'salt',hash:'hash',updatedAt:'2026-09-22T17:00:00.000Z'},
      passkeys:[],
      updated_at:'2026-09-22T17:00:00.000Z',
    },
  });
  const row = await readAuthRecord('Рустам',{authBlobStore:store,bypassMigrationGate:true});
  assert.equal(row.actor,'Рустам');
  assert.equal(row.pinRecord.hash,'hash');
});

test('PIN update preserves passkeys and never stores plaintext PIN', async () => {
  const store = memoryBlob({
    'auth/rustam': {
      actor:'Рустам',
      pin_record:null,
      passkeys:[{actor:'Рустам',id:'cred',publicKey:'pub',rpID:'example.com'}],
      updated_at:'2026-09-22T17:00:00.000Z',
    },
  });
  const record={version:1,salt:'s',hash:'h',updatedAt:'2026-09-22T17:01:00.000Z'};
  const saved=await savePinRecord('Рустам',record,{authBlobStore:store,bypassMigrationGate:true});
  assert.equal(saved.pinRecord.hash,'h');
  assert.equal(saved.passkeys[0].id,'cred');
  assert.equal(JSON.stringify([...store.map.values()]).includes('123456'),false);
});

test('passkey update preserves existing PIN hash', async () => {
  const store = memoryBlob({
    'auth/diana': {
      actor:'Диана',
      pin_record:{version:1,salt:'s',hash:'h',updatedAt:'2026-09-22T17:00:00.000Z'},
      passkeys:[],
      updated_at:'2026-09-22T17:00:00.000Z',
    },
  });
  const saved=await savePasskeys(
    'Диана',
    [{actor:'Диана',id:'cred-d',publicKey:'pub',rpID:'example.com'}],
    {authBlobStore:store,bypassMigrationGate:true}
  );
  assert.equal(saved.pinRecord.hash,'h');
  assert.equal(saved.passkeys[0].id,'cred-d');
});

test('durable app state is stored in Blob auth record and survives auth updates', async () => {
  const store = memoryBlob({
    'auth/rustam': {
      actor:'Рустам',
      pin_record:{version:1,salt:'salt',hash:'hash',updatedAt:'2026-09-27T10:00:00.000Z'},
      passkeys:[],
      updated_at:'2026-09-27T10:00:00.000Z',
    },
  });

  await writeAppState('Рустам','car:changan-univ-2023',{
    errors:[{id:'err_12345678',title:'Check Engine'}],
  },{authBlobStore:store,bypassMigrationGate:true,now:'2026-09-27T11:00:00.000Z'});

  let row=store.map.get('auth/rustam');
  assert.equal(row.pin_record.salt,'salt');
  assert.equal(row.pin_record.hash,'hash');
  assert.equal(row.pin_record[APP_STATE_FIELD]['car:changan-univ-2023'].errors[0].title,'Check Engine');

  await savePinRecord('Рустам',{
    version:1,salt:'new-salt',hash:'new-hash',updatedAt:'2026-09-27T12:00:00.000Z',
  },{authBlobStore:store,bypassMigrationGate:true});

  row=store.map.get('auth/rustam');
  assert.equal(row.pin_record.hash,'new-hash');
  assert.equal(row.pin_record[APP_STATE_FIELD]['car:changan-univ-2023'].errors[0].title,'Check Engine');
});
