const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
test('account recovery merges snapshots into shared storage without replacing answers',async()=>{
 const orig=Module._load;let stored={schema:1,runs:[{id:'cycle',status:'active',startedAt:'2026-10-01T00:00:00Z',days:{1:{answers:{thought:'Актуальный'},entries:[]}},applied:[]}]};
 Module._load=function(id,...args){if(id==='./rudi-request-auth.cjs')return {authorizeRequest:()=>({actor:'Рустам'}),statusForError:()=>500};if(id==='./rudi-auth-db.cjs')return {readAppState:async()=>stored,writeAppState:async(_a,_k,s)=>{stored=s}};if(id==='./rudi-state-client.cjs')return {createRudiStateClient:()=>({setIfAbsent:async()=>true,remove:async()=>{}})};if(id==='./cbt-coach.cjs')return {};return orig.call(this,id,...args)};
 let handler;try{handler=require('../api/cbt-handler.cjs')}finally{Module._load=orig}
 let payload;const res={setHeader(){},status(n){this.code=n;return this},json(x){payload=x;return x}};
 await handler({method:'POST',body:{operation:'recover-backups',backups:[{id:'x',state:{runs:[{...structuredClone(stored.runs[0]),days:{1:{answers:{thought:'Предыдущий'},entries:[]}}}]}}]}},res);
 assert.equal(res.code,200);assert.equal(stored.runs[0].days[1].answers.thought,'Актуальный');assert.equal(stored.runs[0].days[1].versions[0].answers.thought,'Предыдущий');assert.equal(payload.actor,'Рустам');
});
