const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler,validate}=require('../api/shared-notes.cjs');
function fixture(){const rows=new Map();return {getRecord:async(ns,k)=>rows.has(k)?{value:structuredClone(rows.get(k))}:null,set:async(ns,k,v)=>rows.set(k,structuredClone(v)),setIfAbsent:async(ns,k,v)=>{if(rows.has(k))return false;rows.set(k,v);return true},remove:async(ns,k)=>rows.delete(k)}}
function request(h,actor,body){let status=200,data;return h({method:'POST',actor,body},{setHeader(){},status(n){status=n;return this},json(x){data=x;return x}}).then(()=>({status,data}))}
test('both people create, read, edit and delete shared notes',async()=>{
 const h=createHandler({state:fixture(),authorize:r=>({actor:r.actor})});
 let r=await request(h,'Рустам',{operation:'save',id:'a',title:'Планы',text:'Текст',images:[]});assert.equal(r.status,200);
 r=await request(h,'Диана',{operation:'get',id:'a'});assert.equal(r.data.note.title,'Планы');
 const stamp=r.data.note.updatedAt;
 r=await request(h,'Диана',{operation:'save',id:'a',title:'Наши планы',text:'Новый текст',expectedUpdatedAt:stamp,images:['data:image/jpeg;base64,YWJj']});assert.equal(r.status,200);assert.equal(r.data.note.author,'Рустам');assert.equal(r.data.note.updatedBy,'Диана');
 let conflict=await request(h,'Рустам',{operation:'save',id:'a',title:'Устаревшее',text:'x',expectedUpdatedAt:stamp});assert.equal(conflict.status,409);
 const updated=r.data.note.updatedAt;
 assert.equal((await request(h,'Рустам',{operation:'delete',id:'a',expectedUpdatedAt:updated})).status,200);
 assert.deepEqual((await request(h,'Диана',{operation:'list'})).data.notes,[]);
 assert.equal((await request(h,'Диана',{operation:'get',id:'a'})).status,404);
 assert.equal((await request(h,'Рустам',{operation:'save',id:'a',title:'x',text:'x'})).status,409);
});
test('outsiders cannot access household notes',async()=>{const h=createHandler({state:fixture(),authorize:r=>({actor:r.actor})});assert.equal((await request(h,'Друг',{operation:'list'})).status,403)});
test('reject unsafe images, excessive attachments and empty titles',()=>{for(const images of [['data:image/svg+xml;base64,YWJj'],['https://example.com/x.png'],Array(4).fill('data:image/png;base64,YWJj')])assert.throws(()=>validate({id:'a',title:'x',text:'',images}));assert.throws(()=>validate({id:'a',title:' ',text:''}));});
test('home selection is private per authenticated actor',async()=>{const h=createHandler({state:fixture(),authorize:r=>({actor:r.actor})});await request(h,'Рустам',{operation:'home-set',id:'a',scope:'shared'});await request(h,'Диана',{operation:'home-set',id:'b',scope:'personal'});assert.deepEqual((await request(h,'Рустам',{operation:'home-get'})).data.selection,{id:'a',scope:'shared'});assert.deepEqual((await request(h,'Диана',{operation:'home-get'})).data.selection,{id:'b',scope:'personal'});});
test('failed validation does not block subsequent valid saves',async()=>{const h=createHandler({state:fixture(),authorize:r=>({actor:r.actor})});assert.equal((await request(h,'Диана',{operation:'save',id:'bad',title:'',text:''})).status,400);assert.equal((await request(h,'Рустам',{operation:'save',id:'good',title:'Работает',text:''})).status,200)});
test('expanded shared list returns complete text without embedding attachments',async()=>{const h=createHandler({state:fixture(),authorize:r=>({actor:r.actor})});const text='Полный текст '.repeat(60);await request(h,'Рустам',{operation:'save',id:'full',title:'Длинная',text,images:['data:image/jpeg;base64,YWJj']});const r=await request(h,'Диана',{operation:'list',expanded:true});assert.equal(r.data.notes[0].text,text);assert.equal(r.data.notes[0].imageCount,1);assert.deepEqual(r.data.notes[0].images,[]);});
