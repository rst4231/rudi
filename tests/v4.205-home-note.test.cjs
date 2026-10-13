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
 function call(operation,text,method='POST'){
  const req={method,body:{operation,initData:'valid-test-data',...(text===undefined?{}:{text})}};
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  return handler(req,res).then(()=>res);
 }
 return {map,call};
}
test('a note starts empty, persists as an actor-scoped DB record and clears cleanly',async()=>{
 const ctx=mock();
 let res=await ctx.call('get');
 assert.equal(res.code,200);
 assert.deepEqual(res.body.note,{text:'',updatedAt:''});
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
 assert.match(js,/expanded=Boolean\(text\.trim\(\)\)/);
 assert.match(js,/if\(!text\.trim\(\)\)\{beginEdit\(\)/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/method:'POST'/);
 assert.match(css,/html\[data-theme="dark"\]/);
});
