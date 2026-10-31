'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const server=require('../api/home-note.cjs');
const vm=require('node:vm');
test('Groq proofreader corrects spelling but rejects changed numbers, links and incomplete output',async()=>{
 const {proofread}=require('../api/home-note-proofread.cjs');
 const original='Я пашол в магазин.\nКупить 2 кг: https://example.com/a';
 const corrected='Я пошёл в магазин.\nКупить 2 кг: https://example.com/a';
 let payload;
 const run=(text,finish='stop')=>proofread(original,{env:{GROQ_API_KEY:'test'},fetchImpl:async(_url,options)=>{
  payload=JSON.parse(options.body);
  return {ok:true,json:async()=>({choices:[{finish_reason:finish,message:{content:JSON.stringify({text})}}]})};
 }});
 assert.equal(await run(corrected),corrected);
 assert.equal(payload.model,'openai/gpt-oss-20b');
 assert.equal(payload.messages[1].content,original);
 await assert.rejects(run(corrected.replace('2 кг','3 кг')),/proofread-content-changed/);
 await assert.rejects(run(corrected.replace('/a','/b')),/proofread-content-changed/);
 await assert.rejects(run(corrected,'length'),/proofread-output-invalid/);
 await assert.rejects(proofread(original,{env:{}}),/proofread-unavailable/);
});
test('proofreading authenticates, coalesces duplicate requests and never writes note text',async()=>{
 let calls=0,writes=0;
 const handler=server.createHandler({authorizeRequest:()=>({actor:'Рустам'}),
  proofread:async text=>{calls++;await new Promise(r=>setImmediate(r));return text.replace('пашол','пошёл')},
  writeAppState:async()=>{writes++}});
 const res=()=>({setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}});
 const req={method:'POST',body:{operation:'proofread',text:'Я пашол',initData:'test'}};
 const a=res(),b=res();await Promise.all([handler(req,a),handler(req,b)]);
 assert.equal(a.code,200);assert.equal(a.body.text,'Я пошёл');assert.equal(b.body.text,a.body.text);
 assert.equal(calls,1);assert.equal(writes,0);
 const invalid=res();await handler({...req,body:{...req.body,text:'x'.repeat(8001)}},invalid);
 assert.equal(invalid.code,400);
 const denied=server.createHandler({authorizeRequest:()=>{throw Error('rudi-access-denied')},proofread:async()=>{calls++;}});
 await denied(req,res());assert.equal(calls,1);
});
async function noteClipboard({clipboard=true,deny=false,fallback=true,value='Первая строка\nВторая строка'}={}){
 const elements=new Map(),writes=[];let temporary=null,focused=null;
 const make=id=>({id,hidden:false,disabled:false,value:'',textContent:'',style:{},handlers:{},
  classList:{toggle(){},contains(){return false}},setAttribute(){},
  addEventListener(k,fn){this.handlers[k]=fn},focus(){focused=this},select(){},setSelectionRange(){},remove(){temporary=null}});
 const get=id=>{if(!elements.has(id))elements.set(id,make(id));return elements.get(id)};
 get('homeNoteTile').querySelector=selector=>get(selector.slice(1));
 const document={getElementById:get,readyState:'complete',visibilityState:'visible',activeElement:null,
  body:{classList:{contains(){return false}},appendChild(el){temporary=el}},
  addEventListener(){},createElement:()=>make('temporary'),
  execCommand:()=>{if(fallback)writes.push(temporary.value);return fallback}};
 const navigator={onLine:true,...(clipboard?{clipboard:{writeText:async text=>{if(deny)throw Error('denied');writes.push(text)}}}:{})};
 const window={addEventListener(){},Telegram:{WebApp:{initData:'test'}}};
 vm.runInNewContext(fs.readFileSync('public/home-note.js','utf8'),{
  window,document,navigator,requestAnimationFrame:fn=>fn(),
  fetch:async()=>({ok:true,json:async()=>({ok:true,note:{text:value,expanded:false,updatedAt:'rev'}})})
 });
 await new Promise(resolve=>setImmediate(resolve));
 return {get,writes,click:async()=>{get('homeNoteCopy').handlers.click();await new Promise(resolve=>setImmediate(resolve))},
  temporary:()=>temporary,focused:()=>focused};
}
test('note uses pencil edit control and copies all multiline text without expanding it',async()=>{
 const h=await noteClipboard();
 const markup=fs.readFileSync('public/index.html','utf8').match(/<svg id="homeNoteEditIcon"[^>]*>/)?.[0];assert.ok(markup);assert.doesNotMatch(markup,/\shidden(?:[=>\s]|$)/);
 assert.equal(h.get('homeNoteEditIcon').hidden,false);
 assert.equal(h.get('homeNoteEditLabel').hidden,true);
 assert.equal(h.get('homeNoteContent').hidden,true);
 await h.click();
 assert.deepEqual(h.writes,['Первая строка\nВторая строка']);
 assert.equal(h.get('homeNoteContent').hidden,true);
 assert.equal(h.get('homeNoteStatus').textContent,'Заметка скопирована');
});
test('note clipboard falls back when the API is absent or permission is denied',async()=>{
 for(const options of [{clipboard:false},{deny:true}]){
  const h=await noteClipboard(options);await h.click();
  assert.deepEqual(h.writes,['Первая строка\nВторая строка']);
  assert.equal(h.temporary(),null);
 }
});
test('note clipboard failure is reported, empty note has no copy control',async()=>{
 const failed=await noteClipboard({clipboard:false,fallback:false});await failed.click();
 assert.match(failed.get('homeNoteStatus').textContent,/Не удалось скопировать/);
 const empty=await noteClipboard({value:''});
 assert.equal(empty.get('homeNoteCopy').hidden,true);
 assert.equal(empty.get('homeNoteEditIcon').hidden,false);
 assert.equal(empty.get('homeNoteEditLabel').hidden,true);
});
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
 assert.deepEqual(res.body.note,{id:'home',text:'',updatedAt:'',expanded:null,title:'',pinned:false,history:[],historyCount:0});
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
 assert.match(html,/<span>Личная заметка<\/span>/);
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
test('note is draggable and defaults directly above Smart Home without moving other blocks',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(html,/id="homeNoteTile"[^>]*data-home-tile="note"/);
 assert.match(app,/HOME_TILE_DEFAULT_ORDER = \['dashboard','rustam','diana','lulu','priority','recommendations','note','smart-home'/);
 assert.match(app,/return \['dashboard',\.\.\.people,'lulu','priority','recommendations','note','smart-home'/);
 assert.match(app,/if\(!requested\.includes\('note'\)\)/);
 assert.match(app,/const smartHomeIndex=valid\.indexOf\('smart-home'\)/);
 const snippet=app.slice(app.indexOf('function normalizedHomeOrder('),app.indexOf('function homeTileRects('));
 assert.match(snippet,/if\(!requested\.includes\('note'\)\)/);
 assert.match(app,/function startHomeTileDrag/);
 assert.match(app,/markUiPreferencesChanged\(\{homeOrder:order\}\)/);
});

test('offline writes reject stale revisions without discarding local edits',async()=>{
 const ctx=mock();
 const existing=await ctx.call('save','Облачная версия');
 assert.equal(existing.code,200);
 const duplicate=await ctx.call('save','Облачная версия','POST',{expectedUpdatedAt:'older-revision'});
 assert.equal(duplicate.code,200);
 assert.equal(duplicate.body.idempotent,true);
 const conflict=await ctx.call('save','Локальная версия','POST',{expectedUpdatedAt:'older-revision'});
 assert.equal(conflict.code,409);
 assert.equal(conflict.body.error,'note-conflict');
 assert.equal((await ctx.call('get')).body.note.text,'Облачная версия');
 const update=await ctx.call('save','Локальная версия','POST',{expectedUpdatedAt:existing.body.note.updatedAt});
 assert.equal(update.code,200);
 assert.equal((await ctx.call('get')).body.note.text,'Локальная версия');
});

test('legacy home note migrates without reset; named notes and versions stay isolated',async()=>{
 const ctx=mock();ctx.map.set('Рустам:home-note-v1',{text:'Старая личная запись',updatedAt:'2026-01-01T00:00:00.000Z'});
 const initial=(await ctx.call('get')).body;
 assert.equal(initial.notes[0].id,'home');assert.equal(initial.notes[0].text,'Старая личная запись');
 const first=await ctx.call('save','- [ ] Молоко','POST',{id:'shopping',title:'Покупки',pinned:true,expectedUpdatedAt:''});
 assert.equal(first.code,200);
 const second=await ctx.call('save','Придумать подарок','POST',{id:'ideas',title:'Идеи',expectedUpdatedAt:''});assert.equal(second.code,200);
 const updated=await ctx.call('save','- [x] Молоко','POST',{id:'shopping',title:'Покупки',pinned:true,expectedUpdatedAt:first.body.note.updatedAt});
 assert.equal(updated.body.note.history.at(-1).text,'- [ ] Молоко');
 assert.equal((await ctx.call('get')).body.note.text,'Старая личная запись');
 assert.deepEqual((await ctx.call('get')).body.notes.map(n=>n.id),['home','shopping','ideas']);
 const conflict=await ctx.call('save','потерянное изменение','POST',{id:'shopping',expectedUpdatedAt:first.body.note.updatedAt});assert.equal(conflict.code,409);
 assert.equal((await ctx.call('get')).body.notes.find(n=>n.id==='ideas').text,'Придумать подарок');
 const restored=await ctx.call('save','- [ ] Молоко','POST',{id:'shopping',title:'Покупки',pinned:true,expectedUpdatedAt:updated.body.note.updatedAt});
 assert.equal(restored.body.note.history.at(-1).text,'- [x] Молоко');
});
test('concurrent saves preserve independent notes and reject a competing stale revision',async()=>{
 const ctx=mock();
 await Promise.all(['a','b','c'].map(id=>ctx.call('save',id,'POST',{id,expectedUpdatedAt:''})));
 assert.deepEqual((await ctx.call('get')).body.notes.map(n=>n.id),['home','a','b','c']);
 const revision=(await ctx.call('get')).body.notes.find(n=>n.id==='a').updatedAt;
 const results=await Promise.all(['one','two'].map(text=>ctx.call('save',text,'POST',{id:'a',expectedUpdatedAt:revision})));
 assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);
});
test('history keeps at most 20 versions, includes coalesced offline edits, and title/pinning changes conflict',async()=>{
 const ctx=mock();let revision='';
 for(let i=0;i<25;i++){
  const result=await ctx.call('save','Версия '+i,'POST',{id:'important',title:'Важное',pinned:true,expectedUpdatedAt:revision});
  assert.equal(result.code,200);revision=result.body.note.updatedAt;
 }
 let summary=(await ctx.call('get')).body.notes.find(n=>n.id==='important');assert.equal(summary.history.length,0);assert.equal(summary.historyCount,20);
 let note=(await ctx.call('get-history',undefined,'POST',{id:'important'})).body.note;assert.equal(note.history.length,20);
 const result=await ctx.call('save','Последняя','POST',{id:'important',title:'Новое название',pinned:false,expectedUpdatedAt:revision,localHistory:[{text:'Промежуточная офлайн версия',title:'Важное',pinned:true,updatedAt:'local'}]});
 assert.equal(result.code,200);assert.ok(result.body.note.history.some(v=>v.text==='Промежуточная офлайн версия'));
 assert.equal((await ctx.call('save','Последняя','POST',{id:'important',title:'Конкурирующее название',expectedUpdatedAt:revision})).code,409);
 assert.equal((await ctx.call('save','x','POST',{id:'../other'})).code,400);
});
function noteUI({notes=[{id:'home',text:'Я пашол',title:'Важное',pinned:false,history:[],updatedAt:'rev'}],offline=null,deferGet=false,confirm=true}={}){
 const elements=new Map(),events={},requests=[];let proofreadResolve,getResolve;
 const make=id=>({id,hidden:false,disabled:false,value:'',textContent:'',children:[],style:{},handlers:{},attributes:{},
  classList:{toggle(){},contains(){return false}},setAttribute(k,v){this.attributes[k]=v},
  addEventListener(k,fn){this.handlers[k]=fn},focus(){},select(){},setSelectionRange(){},remove(){},
  appendChild(child){this.children.push(child)},replaceChildren(){this.children=[]}});
 const get=id=>{if(!elements.has(id))elements.set(id,make(id));return elements.get(id)};
 get('homeNoteTile').querySelector=selector=>get(selector.slice(1));
 get('homeNoteVersions').hidden=true;
 const document={getElementById:get,readyState:'complete',visibilityState:'visible',body:{classList:{contains(){return false}},appendChild(){}},addEventListener(){},createElement:()=>make('new')};
 const window={confirm:()=>confirm,Telegram:{WebApp:{initData:'test'}},addEventListener(k,fn){events[k]=fn},rudiOfflineContent:offline};
 const fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);
  if(body.operation==='proofread')return new Promise(resolve=>{proofreadResolve=text=>resolve({ok:true,json:async()=>({ok:true,text})})});
  if(body.operation==='delete'){const at=notes.findIndex(n=>n.id===body.id);if(at>=0)notes.splice(at,1);return {ok:true,json:async()=>({ok:true,note:{id:body.id,deleted:true,text:'',updatedAt:'deleted'}})}}
  if(body.operation==='save'){
   const note={...body,updatedAt:'saved-'+requests.length,history:body.localHistory};const index=notes.findIndex(n=>n.id===body.id);if(index<0)notes.push(note);else notes[index]=note;
   return {ok:true,json:async()=>({ok:true,note})};
  }
  const response={ok:true,json:async()=>({ok:true,note:{...notes[0],expanded:true},notes:notes.map(n=>({...n}))})};
  if(deferGet)return new Promise(resolve=>{getResolve=()=>resolve(response)});
  return response;
 };
 vm.runInNewContext(fs.readFileSync('public/home-note.js','utf8'),{window,document,navigator:{onLine:true,clipboard:{writeText:async()=>{}}},requestAnimationFrame:fn=>fn(),fetch});
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {get,events,requests,tick,ready:tick(),finishGet:()=>getResolve(),finish:text=>proofreadResolve(text),click:async(id)=>{get(id).handlers.click?.();await tick()},notes};
}
test('Groq saves a corrected note with immediate undo and a restorable source version',async()=>{
 const h=noteUI();await h.ready;
 await h.click('homeNoteProofread');h.finish('Я пошёл');await h.tick();
 assert.equal(h.requests.filter(r=>r.operation==='save').at(-1).text,'Я пошёл');
 assert.equal(h.get('homeNoteUndo').hidden,false);
 await h.click('homeNoteUndo');
 assert.equal(h.requests.filter(r=>r.operation==='save').at(-1).text,'Я пашол');
 await h.click('homeNoteHistory');
 assert.ok(h.get('homeNoteVersions').children.length);
 const restored=h.get('homeNoteVersions').children[0];restored.handlers.click();await h.tick();
 assert.equal(h.requests.filter(r=>r.operation==='save').at(-1).text,'Я пошёл');
});
test('Groq cannot overwrite an edited draft or a different active note',async()=>{
 const h=noteUI({notes:[{id:'home',text:'Я пашол',title:'Первое',updatedAt:'rev',history:[]},{id:'ideas',text:'Идея',title:'Идеи',updatedAt:'rev2',history:[]}]});await h.ready;
 await h.click('homeNoteProofread');await h.click('homeNoteEdit');h.get('homeNoteText').value='Новый текст';h.finish('Я пошёл');await h.tick();
 assert.equal(h.requests.filter(r=>r.operation==='save').length,0);assert.equal(h.get('homeNoteText').value,'Новый текст');
 await h.click('homeNoteCancel');await h.click('homeNoteProofread');
 h.get('homeNoteList').children[1].handlers.click();h.finish('Я пошёл');await h.tick();
 assert.equal(h.requests.filter(r=>r.operation==='save').length,0);assert.equal(h.get('homeNotePreview').textContent,'Идея');
});
test('checklist changes save only the clicked line and preserve copyable text syntax',async()=>{
 const h=noteUI({notes:[{id:'home',text:'Купить\n- [ ] Молоко\n- [x] Хлеб\nhttps://example.com',title:'Покупки',updatedAt:'r',history:[]}]});await h.ready;
 const check=h.get('homeNotePreview').children[1].children[0];assert.equal(check.type,'checkbox');check.checked=true;check.handlers.change();await h.tick();
 assert.equal(h.requests.find(r=>r.operation==='save').text,'Купить\n- [x] Молоко\n- [x] Хлеб\nhttps://example.com');
});

test('independent handler instances use a shared storage lock before checking revisions',async()=>{
 const records=new Map();let locked=false,releaseRead,startRead;
 const started=new Promise(resolve=>{startRead=resolve}),gate=new Promise(resolve=>{releaseRead=resolve});let gated=true;
 const stateClient={async setIfAbsent(){if(locked)return false;locked=true;return true},async remove(){locked=false}};
 const deps={stateClient,authorizeRequest:()=>({actor:'Рустам'}),readAppState:async(_actor,key)=>{if(gated){gated=false;startRead();await gate}return records.get(key)},writeAppState:async(_actor,key,value)=>records.set(key,value),now:()=>new Date().toISOString()};
 const a=server.createHandler(deps),b=server.createHandler(deps);
 const res=()=>({setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}});
 const req={method:'POST',body:{operation:'save',id:'ideas',text:'Первое',title:'Идеи',expectedUpdatedAt:''}};
 const first=res(),second=res();const pending=a(req,first);await started;
 await b({...req,body:{...req.body,text:'Второе'}},second);assert.equal(second.code,503);assert.equal(second.body.ok,false);
 releaseRead();await pending;assert.equal(first.code,200);assert.equal(locked,false);
 const retry=res();await b({...req,body:{...req.body,text:'Второе'}},retry);assert.equal(retry.code,409);assert.equal(records.get('home-note-v2:ideas').text,'Первое');
});
test('initial list omits large histories and caps new notes at 30 without changing existing content',async()=>{
 const ctx=mock();
 for(let i=0;i<29;i++)assert.equal((await ctx.call('save','Текст '+i,'POST',{id:'n'+i,expectedUpdatedAt:''})).code,200);
 assert.equal((await ctx.call('save','Лишняя','POST',{id:'extra',expectedUpdatedAt:''})).code,400);
 const all=(await ctx.call('get')).body.notes;assert.equal(all.length,30);assert.equal(all.find(n=>n.id==='n0').text,'Текст 0');
 assert.ok(all.every(n=>n.history.length===0));
});

test('a delayed cloud load cannot discard a cached draft or a newly created unsaved note',async()=>{
 for(const create of [false,true]){
  const local={id:'home',text:'Кэшированная заметка',title:'Личное',pinned:false,history:[],updatedAt:'r'};
  const offline={actor:()=> 'Рустам',cached:async()=>({text:local.text,notes:[local],expanded:true}),pending:async()=>[],isOffline:()=>false,capture:async()=>{},enqueue:async()=>{},flush:async()=>{}};
  const h=noteUI({notes:[{...local,text:'Облачная заметка'}],offline,deferGet:true});await h.ready;
  await h.click(create?'homeNoteAdd':'homeNoteEdit');h.get('homeNoteText').value='Несохранённый черновик';h.get('homeNoteTitle').value='Мой черновик';
  h.finishGet();await h.tick();
  assert.equal(h.get('homeNoteEditor').hidden,false);assert.equal(h.get('homeNoteText').value,'Несохранённый черновик');assert.equal(h.get('homeNoteTitle').value,'Мой черновик');
  assert.equal(h.requests.filter(r=>r.operation==='save').length,0);
 }
});

test('delayed IndexedDB refresh cannot discard a draft or unsaved new note',async()=>{
 for(const stage of ['cached','pending'])for(const create of [false,true]){
  const local={id:'home',text:'Личная запись',title:'Личное',pinned:false,history:[],updatedAt:'r'};
  let armed=false,release;
  const snapshot=()=>({text:local.text,notes:[{...local}],expanded:true});
  const offline={actor:()=> 'Рустам',
   cached:async()=>{if(armed&&stage==='cached')return new Promise(resolve=>{release=()=>{armed=false;resolve(snapshot())}});return snapshot()},
   pending:async()=>{if(armed&&stage==='pending')return new Promise(resolve=>{release=()=>{armed=false;resolve([])}});return []},
   isOffline:()=>false,capture:async()=>{},enqueue:async()=>{},flush:async()=>{}};
  const h=noteUI({notes:[{...local}],offline});await h.ready;await h.tick();
  armed=true;h.events.online();await h.tick();assert.equal(typeof release,'function');
  await h.click(create?'homeNoteAdd':'homeNoteEdit');h.get('homeNoteText').value='Не терять черновик';h.get('homeNoteTitle').value='Новое название';
  release();await h.tick();await h.tick();
  assert.equal(h.get('homeNoteEditor').hidden,false);assert.equal(h.get('homeNoteText').value,'Не терять черновик');assert.equal(h.get('homeNoteTitle').value,'Новое название');
  assert.equal(h.requests.filter(r=>r.operation==='save').length,0);
 }
});

test('deleting notes is revision-aware, actor-scoped and idempotent without legacy resurrection',async()=>{
 const ctx=mock();const home=await ctx.call('save','Старая запись');
 const named=await ctx.call('save','Личное','POST',{id:'named',title:'Моя заметка',expectedUpdatedAt:''});
 assert.equal((await ctx.call('delete',undefined,'POST',{id:'named',expectedUpdatedAt:'stale'})).code,409);
 const deleted=await ctx.call('delete',undefined,'POST',{id:'named',expectedUpdatedAt:named.body.note.updatedAt});assert.equal(deleted.code,200);assert.equal(deleted.body.note.deleted,true);
 assert.equal(ctx.map.get('Рустам:home-note-v2:named').text,'');assert.deepEqual(ctx.map.get('Рустам:home-note-v2:named').history,[]);
 assert.equal((await ctx.call('delete',undefined,'POST',{id:'named',expectedUpdatedAt:'old'})).body.idempotent,true);
 assert.equal((await ctx.call('save','Старый офлайн текст','POST',{id:'named',expectedUpdatedAt:named.body.note.updatedAt})).code,409);
 assert.equal((await ctx.call('save','Даже после rebase','POST',{id:'named',expectedUpdatedAt:deleted.body.note.updatedAt})).code,409);
 assert.equal((await ctx.call('get')).body.notes.some(n=>n.id==='named'),false);
 await ctx.call('delete',undefined,'POST',{id:'home',expectedUpdatedAt:home.body.note.updatedAt});
 const after=(await ctx.call('get')).body;assert.equal(after.notes.length,0);assert.equal(after.note.deleted,true);assert.equal(after.note.text,'');
 assert.equal((await ctx.call('get-history',undefined,'POST',{id:'home'})).body.note.history.length,0);
});
test('deleting an unsynced note stays deleted, and another actor cannot delete its content',async()=>{
 const ctx=mock();assert.equal((await ctx.call('delete',undefined,'POST',{id:'never-synced',expectedUpdatedAt:''})).code,200);
 assert.equal((await ctx.call('save','Запоздавшая запись','POST',{id:'never-synced',expectedUpdatedAt:''})).code,409);
 const shared=new Map([['Рустам:home-note-v1',{text:'Приватно',updatedAt:'r'}]]);
 const handler=server.createHandler({authorizeRequest:()=>({actor:'Диана'}),readAppState:async(actor,key)=>shared.get(actor+':'+key),writeAppState:async(actor,key,value)=>shared.set(actor+':'+key,value)});
 const res={setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}};
 await handler({method:'POST',body:{operation:'delete',id:'home',expectedUpdatedAt:''}},res);
 assert.equal(res.code,200);assert.equal(shared.get('Рустам:home-note-v1').text,'Приватно');
});
test('trash asks for confirmation then selects next note; cancelling preserves the note',async()=>{
 const records=[{id:'home',text:'Первая',title:'Первая',history:[],updatedAt:'r1'},{id:'other',text:'Вторая',title:'Вторая',history:[],updatedAt:'r2'}];
 const cancelled=noteUI({notes:records.map(n=>({...n})),confirm:false});await cancelled.ready;await cancelled.click('homeNoteDelete');assert.equal(cancelled.requests.some(r=>r.operation==='delete'),false);assert.equal(cancelled.get('homeNotePreview').textContent,'Первая');
 const h=noteUI({notes:records.map(n=>({...n}))});await h.ready;await h.click('homeNoteDelete');
 assert.equal(h.requests.find(r=>r.operation==='delete').id,'home');assert.equal(h.get('homeNotePreview').textContent,'Вторая');assert.equal(h.get('homeNoteList').children.length,1);
 await h.click('homeNoteDelete');assert.equal(h.get('homeNoteList').children.length,0);assert.equal(h.get('homeNoteDelete').hidden,true);
 await h.click('homeNoteEdit');h.get('homeNoteText').value='Новая';await h.click('homeNoteSave');assert.notEqual(h.requests.filter(r=>r.operation==='save').at(-1).id,'home');
});

test('deleting the legacy home note frees its slot in the 30-note collection',async()=>{
 const ctx=mock();await ctx.call('delete',undefined,'POST',{id:'home',expectedUpdatedAt:''});
 for(let i=0;i<30;i++)assert.equal((await ctx.call('save','Текст '+i,'POST',{id:'n'+i,expectedUpdatedAt:''})).code,200);
 assert.equal((await ctx.call('get')).body.notes.length,30);
 assert.equal((await ctx.call('save','Лишняя','POST',{id:'extra',expectedUpdatedAt:''})).code,400);
});
