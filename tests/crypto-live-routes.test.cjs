const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('live cron rejects unauthenticated requests before running any trading code',async()=>{
 const {createHandler}=require('../api/crypto-live-cron.cjs');let runs=0;
 const handler=createHandler({authorized:()=>false,run:async()=>runs++});
 const res={status(c){this.code=c;return this;},json(v){this.data=v;return this;},setHeader(){}};
 await handler({method:'GET',headers:{}},res);assert.equal(res.code,401);assert.equal(runs,0);
 const trusted=createHandler({authorized:()=>true,run:async options=>{assert.equal(options.scheduled,true);runs++;return {ok:true};}});
 await trusted({method:'GET'},res);assert.equal(res.code,200);assert.equal(runs,1);
 await trusted({method:'POST'},res);assert.equal(res.code,405);assert.equal(runs,1);
});
test('live cron is Frankfurt based and checks each minute; finance auth gates all live operations',()=>{
 const v=JSON.parse(fs.readFileSync('vercel.json'));
 assert.deepEqual(v.functions['api/finances.js'].regions,['fra1']);
 assert.deepEqual(v.rewrites.find(c=>c.source==='/api/crypto-live-cron'),{source:'/api/crypto-live-cron',destination:'/api/crypto-live-runner'});
 assert.ok(!v.crons.some(c=>c.path==='/api/crypto-live-cron'));
 assert.ok(fs.readFileSync('cloudflare/rudi-crypto-market-worker.mjs','utf8').includes('/api/crypto-live-runner'));
 const finance=fs.readFileSync('api/finances.js','utf8');assert.ok(finance.indexOf("if (actor !== 'Рустам')")<finance.indexOf("operation === 'crypto-live-connect'"));
 assert.match(finance,/crypto-live-report/);assert.match(finance,/crypto-live-configure/);
});
