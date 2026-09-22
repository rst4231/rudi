const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DATA_API_URL,
  readAuthRecord,
  savePinRecord,
  savePasskeys,
} = require('../api/rudi-auth-db.cjs');

function response(status, value) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return value == null ? '' : JSON.stringify(value); },
  };
}

test('durable auth store reads one shared actor record', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url,init});
    return response(200,[{
      actor:'Рустам',
      pin_record:{version:1,salt:'salt',hash:'hash',updatedAt:'2026-09-22T17:00:00.000Z'},
      passkeys:[],
      updated_at:'2026-09-22T17:00:00.000Z',
    }]);
  };
  const row = await readAuthRecord('Рустам',{fetchImpl,botToken:'123:test'});
  assert.equal(row.actor,'Рустам');
  assert.equal(row.pinRecord.hash,'hash');
  assert.equal(calls[0].url.startsWith(DATA_API_URL), true);
  assert.match(calls[0].init.headers.authorization,/^Bearer /);
});

test('PIN upsert preserves passkeys and never sends plaintext PIN', async () => {
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(init.method==='GET') return response(200,[{
      actor:'Рустам',
      pin_record:null,
      passkeys:[{actor:'Рустам',id:'cred',publicKey:'pub',rpID:'example.com'}],
      updated_at:'2026-09-22T17:00:00.000Z'
    }]);
    const body=JSON.parse(init.body);
    return response(201,[body[0]]);
  };
  const record={version:1,salt:'s',hash:'h',updatedAt:'2026-09-22T17:01:00.000Z'};
  const saved=await savePinRecord('Рустам',record,{fetchImpl,botToken:'123:test'});
  assert.equal(saved.pinRecord.hash,'h');
  assert.equal(saved.passkeys[0].id,'cred');
  assert.equal(calls[1].init.body.includes('123456'),false);
});

test('passkey upsert preserves existing PIN hash', async () => {
  const fetchImpl=async(url,init)=>{
    if(init.method==='GET') return response(200,[{
      actor:'Диана',
      pin_record:{version:1,salt:'s',hash:'h',updatedAt:'2026-09-22T17:00:00.000Z'},
      passkeys:[],
      updated_at:'2026-09-22T17:00:00.000Z'
    }]);
    const body=JSON.parse(init.body);
    return response(201,[body[0]]);
  };
  const saved=await savePasskeys(
    'Диана',
    [{actor:'Диана',id:'cred-d',publicKey:'pub',rpID:'example.com'}],
    {fetchImpl,botToken:'123:test'}
  );
  assert.equal(saved.pinRecord.hash,'h');
  assert.equal(saved.passkeys[0].id,'cred-d');
});
