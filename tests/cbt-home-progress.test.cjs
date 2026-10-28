'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../public/cbt-core.js'),D=require('../public/cbt-content.js');
function fixture({actor='',authenticated=false,stored=new Map(),fetchImpl}={}){
 const events=new EventTarget(),classes=new Set(authenticated?['auth-ok']:[]),observers=[],requests=[];
 const body={dataset:{rudiActor:actor},classList:{contains:n=>classes.has(n)},style:{}};
 const document={body,hidden:false,querySelector(){return null},getElementById(){return null},addEventListener(){}};
 const window={RudiCbtCore:C,RudiCbtContent:D,addEventListener:(...a)=>events.addEventListener(...a),dispatchEvent:e=>events.dispatchEvent(e)};
 class Observer{constructor(fn){observers.push(fn)}observe(){}}
 let seq=0;
 vm.runInNewContext(fs.readFileSync('public/cbt.js','utf8'),{window,document,navigator:{onLine:true},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},MutationObserver:Observer,Event,Intl,Date,AbortController,setTimeout,clearTimeout,setInterval(){},crypto:{randomUUID:()=>String(++seq)},fetch:async(url,opts)=>{requests.push(JSON.parse(opts.body));return fetchImpl?fetchImpl(requests.at(-1)):({ok:true,status:200,json:async()=>({ok:true,actor:body.dataset.rudiActor,state:C.empty()})})}});
 return{api:window.RudiCbt,window,body,stored,requests,auth(next){body.dataset.rudiActor=next;classes.add('auth-ok');for(const fn of observers)fn();events.dispatchEvent(new Event('rudi:auth-ready'))},lock(){classes.delete('auth-ok');for(const fn of observers)fn()},tick:()=>new Promise(resolve=>setImmediate(resolve))};
}
const started=()=>C.apply(null,{id:'start-progress',type:'start',cycleId:'progress-cycle',expectedActive:null,timeZone:'Europe/Moscow'},new Date(Date.now()-3*86400000).toISOString());
test('first authenticated Home load fetches progress without opening CBT',async()=>{
 const state=started(),f=fixture({actor:'Рустам',authenticated:true,fetchImpl:async()=>({ok:true,status:200,json:async()=>({ok:true,actor:'Рустам',state})})});
 await f.tick();assert.equal(f.requests.length,1);assert.equal(f.requests[0].operation,'state');assert.ok(f.api.progress()>0);
});
test('delayed PIN authentication updates the halo and repeated ready events share the in-flight request',async()=>{
 let done;const f=fixture({fetchImpl:()=>new Promise(resolve=>{done=resolve})});
 assert.equal(f.requests.length,0);let notices=0;f.window.addEventListener('rudi-cbt-progress',()=>notices++);
 f.auth('Диана');f.auth('Диана');assert.equal(f.requests.length,1);
 done({ok:true,status:200,json:async()=>({ok:true,actor:'Диана',state:started()})});await f.tick();
 assert.ok(f.api.progress()>0);assert.ok(notices>=1);
});
test('an old actor response cannot overwrite the next actors progress',async()=>{
 const pending=[];const f=fixture({fetchImpl:body=>new Promise(resolve=>pending.push({actor:body.expectedActor,resolve}))});
 f.auth('Рустам');f.lock();f.auth('Диана');assert.deepEqual(pending.map(x=>x.actor),['Рустам','Диана']);
 pending[1].resolve({ok:true,status:200,json:async()=>({ok:true,actor:'Диана',state:C.empty()})});await f.tick();
 pending[0].resolve({ok:true,status:200,json:async()=>({ok:true,actor:'Рустам',state:started()})});await f.tick();
 assert.equal(f.api.progress(),0);assert.equal(JSON.parse(f.stored.get('rudi:cbt:v1:Диана')).server.runs.length,0);
});
test('cached progress stays visible when the first network request fails',async()=>{
 const state=started(),stored=new Map([['rudi:cbt:v1:Рустам',JSON.stringify({server:state,queue:[],backups:[]})]]);
 const f=fixture({actor:'Рустам',authenticated:true,stored,fetchImpl:async()=>{throw Error('offline')}});
 const before=f.api.progress();assert.ok(before>0);await f.tick();assert.equal(f.api.progress(),before);
 assert.deepEqual(JSON.parse(stored.get('rudi:cbt:v1:Рустам')).server,state);
});
test('Home shortcut redraws the halo immediately when the initial server progress arrives',async()=>{
 let done;const f=fixture({fetchImpl:()=>new Promise(resolve=>{done=resolve})}),styles=new Map(),attrs=new Map();
 const button={style:{setProperty:(k,v)=>styles.set(k,v)},setAttribute:(k,v)=>attrs.set(k,v)};
 const source=fs.readFileSync('public/home-reference-layout.js','utf8').match(/function updateCbtProgress\(\)\{[^\n]+\}/)[0];
 const update=new Function('window','$',source+';return updateCbtProgress;')(f.window,()=>button);
 f.window.addEventListener('rudi-cbt-progress',update);f.auth('Рустам');
 assert.equal(styles.get('--rudi-cbt-percent'),'0%');
 done({ok:true,status:200,json:async()=>({ok:true,actor:'Рустам',state:started()})});await f.tick();
 assert.equal(styles.get('--rudi-cbt-percent'),f.api.progress()+'%');assert.notEqual(styles.get('--rudi-cbt-percent'),'0%');
});
