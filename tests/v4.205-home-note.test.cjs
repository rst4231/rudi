'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const server=require('../api/home-note.cjs');
function mock(actor='Рустам'){
 const map=new Map();
 const handler=server.createHandler({
  authorizeRequest:()=>{if(!actor)throw Error('rudi-access-denied');return{actor}},
  readAppState:async(who,key)=>map.get(who+':'+key)||null,
  writeAppState:async(who,key,note)=>{map.set(who+':'+key,note);return note},
  now:()=> '2026-10-13T10:00:00.000Z'
 });
 function call(operation,text,method='POST',extra={}){
  const req={method,body:{operation,initData:'valid-test-data',...(text===undefined?{}:{text}),...extra}};
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  return handler(req,res).then(()=>res);
 }
 return {map,call};
}
test('a note starts empty, persists as an actor-scoped DB record and clears cleanly',async()=>{
 const ctx=mock();
 let res=await ctx.call('get');
 assert.equal(res.code,200);
 assert.deepEqual(res.body.note,{text:'',updatedAt:'',expanded:null});
 res=await ctx.call('save','  Купить корм\r\nЗаписать дела  ');
 assert.equal(res.code,200);
 assert.equal(res.body.note.text,'Купить корм\nЗаписать дела');
 assert.equal(ctx.map.get('Рустам:home-note-v1').text,res.body.note.text);
 assert.equal((await ctx.call('get')).body.note.text,'Купить корм\nЗаписать дела');
 assert.equal((await ctx.call('save','  ')).body.note.text,'');
 assert.equal((await ctx.call('get')).body.note.text,'');
});
test('reject oversized and non-string text without changing storage',async()=>{
 const ctx=mock();await ctx.call('save','Сохранено');
 assert.equal((await ctx.call('save','x'.repeat(8001))).code,400);
 assert.equal((await ctx.call('save',123)).code,400);
 assert.equal((await ctx.call('get')).body.note.text,'Сохранено');
 assert.equal((await ctx.call('get',undefined,'GET')).code,405);
});
test('does not serve notes across actors',async()=>{
 const map=new Map([['Рустам:home-note-v1',{text:'Личное',updatedAt:'today'}]]);
 const handler=server.createHandler({
  authorizeRequest:()=>({actor:'Диана'}),
  readAppState:async(actor,key)=>map.get(actor+':'+key)||null,
  writeAppState:async()=>{}
 });
 const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 await handler({method:'POST',body:{operation:'get'}},res);
 assert.equal(res.body.note.text,'');
});
test('homepage note is above self profile; styles and client behaviors are present',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 const js=fs.readFileSync('public/home-note.js','utf8');
 const css=fs.readFileSync('public/home-note.css','utf8');
 const pos=html.indexOf('id="homeNoteTile"');
 assert.ok(pos>0&&pos<html.indexOf('class="profile"'));
 for(const id of ['homeNoteToggle','homeNoteEdit','homeNoteText','homeNoteSave','homeNoteCancel'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/expanded=Boolean\(text\.trim\(\)\)\&\&preferredExpanded/);
 assert.match(js,/if\(!text\.trim\(\)\)\{beginEdit\(\)/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/method:'POST'/);
 assert.match(css,/html\[data-theme="dark"\]/);
});

test('collapse state survives reopening without changing note text',async()=>{
 const ctx=mock('Рустам');
 await ctx.call('save','Важная запись');
 assert.equal((await ctx.call('get')).body.note.expanded,null);
 let res=await ctx.call('set-expanded',undefined,'POST',{expanded:false});
 assert.equal(res.code,200);
 assert.equal((await ctx.call('get')).body.note.expanded,false);
 assert.equal((await ctx.call('get')).body.note.text,'Важная запись');
 await ctx.call('set-expanded',undefined,'POST',{expanded:true});
 assert.equal((await ctx.call('get')).body.note.expanded,true);
 assert.equal(ctx.map.get('Рустам:home-note-expanded-v1').expanded,true);
 assert.equal((await ctx.call('set-expanded',undefined,'POST',{expanded:'true'})).code,400);
});
test('note expansion and text are isolated by actor',async()=>{
 const records=new Map([['Рустам:home-note-v1',{text:'Моя запись',updatedAt:'now'}],['Рустам:home-note-expanded-v1',{expanded:false}]]);
 const handler=server.createHandler({
  authorizeRequest:r=>({actor:r.body.initData}),
  readAppState:async(actor,key)=>records.get(actor+':'+key)||null,
  writeAppState:async(actor,key,data)=>{records.set(actor+':'+key,data);}
 });
 const call=async(actor,operation,expanded)=>{
  const res={setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};
  await handler({method:'POST',body:{operation,initData:actor,expanded}},res);
  return res.body;
 };
 assert.equal((await call('Диана','get')).note.text,'');
 assert.equal((await call('Диана','get')).note.expanded,null);
 await call('Диана','set-expanded',true);
 assert.equal((await call('Диана','get')).note.expanded,true);
 assert.equal((await call('Рустам','get')).note.expanded,false);
 assert.equal((await call('Рустам','get')).note.text,'Моя запись');
});
test('note is a draggable tile; runtime inserts after dashboard for each actor',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 const build=fs.readFileSync('build.cjs','utf8');
 assert.match(html,/id="homeNoteTile"[^>]*data-home-tile="note"/);
 assert.match(build,/function patchHomeNoteLayout/);
 assert.match(build,/HOME_TILE_DEFAULT_ORDER = \['dashboard','note','rustam'/);
 assert.match(build,/return \['dashboard','note',\.\.\.people/);
 assert.match(build,/if\(!valid\.includes\('note'\)\)/);
 assert.match(build,/const dashboardIndex=valid\.indexOf\('dashboard'\)/);
 assert.match(build,/patchHomeNoteLayout\(patchRetiredRuntime/);
});
