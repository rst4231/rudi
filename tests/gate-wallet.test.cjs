const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
test('Gate total balance signs the documented SHA512 canonical GET and preserves account breakdown',async()=>{
 const {snapshot}=require('../api/gate-holdings.cjs');
 const data=await snapshot({apiKey:'test-key',apiSecret:'test-secret'},{fetchImpl:async(url,init)=>{
  assert.equal(url,'https://api.gateio.ws/api/v4/wallet/total_balance?currency=USD');
  assert.equal(init.headers.SIGN,crypto.createHmac('sha512','test-secret').update(['GET','/api/v4/wallet/total_balance','currency=USD',crypto.createHash('sha512').update('').digest('hex'),init.headers.Timestamp].join('\n')).digest('hex'));
  return {ok:true,status:200,json:async()=>({total:{currency:'USD',amount:'250'},details:{spot:{currency:'USD',amount:'200'},futures:{currency:'USD',amount:'50'}}})};
 }});
 assert.equal(data.balanceUsd,250);assert.equal(data.sections.length,2);
});
test('Gate rejects missing totals and unsafe units, preserves balance on throttling',async()=>{
 const {snapshot}=require('../api/gate-holdings.cjs');
 for(const total of [{currency:'BTC',amount:'1'},{currency:'USD',amount:null},{currency:'USD',amount:'bad'}])await assert.rejects(()=>snapshot({}, {fetchImpl:async()=>({ok:true,json:async()=>({total})})}),/crypto-gate-response-invalid/);
 await assert.rejects(()=>snapshot({}, {fetchImpl:async()=>({ok:false,status:429})}),/crypto-gate-rate-limited/);
});
