'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
function authFixture(){
 const classes=new Set(['auth-login']),events=[];
 const ctx={currentActor:'Рустам',appAccessReady:true,document:{body:{dataset:{},classList:{contains:v=>classes.has(v),add:v=>classes.add(v),remove:(...values)=>values.forEach(v=>classes.delete(v))}}},
 window:{dispatchEvent:e=>events.push(e.type)},Event,isProtectedIphoneAccount:()=>false};
 const source=app.slice(app.indexOf('function showAuthenticatedApp(){'),app.indexOf('function setLoadingGate(){'));
 const show=new Function('ctx','with(ctx){'+source+';return showAuthenticatedApp;}')(ctx);
 return {ctx,events,show,classes};
}
test('PIN/Face ID unlock does not publish auth-ready before actor and profile nodes exist',()=>{
 const f=authFixture();assert.equal(f.show(),true);assert.deepEqual(f.events,[]);
 f.classes.delete('auth-ok');f.ctx.document.body.dataset.rudiActor='Рустам';f.ctx.document.body.dataset.profileSplitReady='1';
 f.show();assert.deepEqual(f.events,['rudi:auth-ready']);f.show();assert.equal(f.events.length,1);
});
test('a protected lock never publishes readiness before Face ID completes',()=>{
 const f=authFixture();f.ctx.isProtectedIphoneAccount=()=>true;f.ctx.iphoneFaceIdDeadline=()=>0;
 let locks=0;f.ctx.requireIphoneFaceIdLock=()=>{locks++;return Promise.resolve()};
 assert.equal(f.show(),false);assert.equal(locks,1);assert.deepEqual(f.events,[]);
});
function homeFixture(){
 const calls=[],signatures=new Map(),ctx={currentActor:'Рустам',homeBootstrapPayload:null,homeBootstrapLoadedAt:0,homeBootstrapLoadedDay:'',homeBootstrapActor:'',homeSectionRenderSignatures:signatures,
 document:{body:{dataset:{profileSplitReady:'0'}}},homeDashboardState:{},Date,todayState:()=>({key:'2026-10-27'}),
 homeBootstrapSectionChanged:(key,value)=>{const next=JSON.stringify(value);if(signatures.get(key)===next)return false;signatures.set(key,next);return true},
 renderPartnerWorkStatus:data=>calls.push(data),renderHomeNew:()=>{},renderHomeDashboard:()=>{},loadHomePartnerLastExpense:()=>Promise.resolve()};
 const source=app.slice(app.indexOf('function applyHomeBootstrap('),app.indexOf('async function restoreHomeFromDisk()'));
 const apply=new Function('ctx','with(ctx){'+source+';return applyHomeBootstrap;}')(ctx);
 return {ctx,calls,apply,signatures};
}
test('a fast cached bootstrap waits for mounted profile cards before recording render signatures',()=>{
 const f=homeFixture(),home={workDay:{date:'2026-10-27',working:true},counts:{products:2}};
 f.apply(home,{fromCache:true});assert.equal(f.calls.length,0);assert.equal(f.signatures.size,0);assert.equal(f.ctx.homeBootstrapPayload,home);
 f.ctx.document.body.dataset.profileSplitReady='1';f.apply(f.ctx.homeBootstrapPayload,{fromCache:true});
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],[home.workDay]);f.apply(home);assert.equal(f.calls.length,1);
});
test('the completed startup explicitly publishes readiness after feature setup',()=>{
 const init=app.slice(app.indexOf('async function init(){'),app.indexOf('init().catch(error=>'));
 assert.ok(init.indexOf("window.dispatchEvent(new Event('rudi:auth-ready'))")>init.indexOf('setupWorkCalendarDisclosure();'));
});
test('unlock refresh reuses bootstrap and cached home tools, coalescing duplicate events',async()=>{
 const start=app.indexOf('let unlockHomeRefreshPromise=null;');assert.ok(start>0,'unlock recovery is installed');
 const src=app.slice(start,app.indexOf('async function ensureHomeBootstrap(',start));
 let finish;const pending=new Promise(r=>{finish=r}),calls=[];
 const ctx={window:{addEventListener:()=>{},RudiSupplementApp:{loadHomeTools:async o=>calls.push(['tools',o.force])}},document:{body:{classList:{contains:()=>true},dataset:{profileSplitReady:'1',rudiActor:'Рустам'}}},
 currentActor:'Рустам',appAccessReady:true,homeSectionRenderSignatures:new Map([['stale',1]]),syncStaticProfileWorkStatus:()=>{},ensureHomeBootstrap:()=>{calls.push(['home']);return pending},Promise,console};
 const run=new Function('ctx','with(ctx){'+src+';return refreshHomeAfterUnlock;}')(ctx);
 const first=run();const second=run();await Promise.resolve();await Promise.resolve();assert.equal(first,second);assert.equal(calls.filter(c=>c[0]==='home').length,1);
 finish();await first;assert.deepEqual(calls.find(c=>c[0]==='tools'),['tools',false]);assert.equal(ctx.homeSectionRenderSignatures.size,0);
});
test('notes wait through the PIN form until authenticated actor is available',()=>{
 const note=fs.readFileSync('public/home-note.js','utf8'),src=note.slice(note.indexOf('function onReady(){'),note.indexOf("document.addEventListener('visibilitychange'"));
 const classes=new Set(['auth-login']),dataset={};let loads=0,changed;
 const ctx={document:{body:{dataset,classList:{contains:v=>classes.has(v)}}},load:()=>{loads++},MutationObserver:class{constructor(fn){changed=fn}observe(){}disconnect(){}}};
 const ready=new Function('ctx','with(ctx){'+src+';return onReady;}')(ctx);ready();assert.equal(loads,0);
 classes.add('auth-ok');changed();assert.equal(loads,0);dataset.rudiActor='Рустам';changed();assert.equal(loads,1);
});
