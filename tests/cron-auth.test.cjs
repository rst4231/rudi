const test=require('node:test');const assert=require('node:assert/strict');
const {bearerToken,isCronRequestAuthorized}=require('../api/cron-auth.cjs');
test('cron auth accepts only exact Bearer secret when CRON_SECRET is configured',()=>{
 assert.equal(isCronRequestAuthorized({headers:{authorization:'Bearer abc'}},'abc'),true);
 assert.equal(isCronRequestAuthorized({headers:{authorization:'Bearer abcd'}},'abc'),false);
 assert.equal(isCronRequestAuthorized({headers:{}},'abc'),false);
 assert.equal(isCronRequestAuthorized({headers:{Authorization:'bearer abc'}},'abc'),true);
});
test('cron auth fails closed when no secret is configured',()=>{
 assert.equal(isCronRequestAuthorized({headers:{}},''),false);
 assert.equal(isCronRequestAuthorized({headers:{authorization:'Bearer anything'}},''),false);
});
test('bearer token parser rejects non-Bearer authorization',()=>{
 assert.equal(bearerToken({headers:{authorization:'Basic abc'}}),'');
});
