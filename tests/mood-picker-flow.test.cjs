const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const vm=require('node:vm');
function modules(){
  assert.ok(fs.existsSync(path.join(root,'public/mood-catalog.js')),'shared mood catalog exists');
  assert.ok(fs.existsSync(path.join(root,'public/mood-picker.js')),'mood dialog exists');
  return {catalog:require('../public/mood-catalog.js'),picker:require('../public/mood-picker.js')};
}
test('chart categories and subtypes are validated per parent',()=>{
  const {catalog}=modules();
  assert.equal(catalog.normalizeSubmood('joy','предвкушение'),'Предвкушение');
  assert.equal(catalog.normalizeSubmood('anger','Предвкушение'),'');
  assert.equal(catalog.meta.anxiety.label,'Страх');
  assert.equal(catalog.meta.boredom.label,'Скука');
  assert.equal(catalog.groups.find(g=>g.key==='love').submoods.length,22);
});
test('draft advances without saving; back and cancel do not write',async()=>{
  const {picker}=modules();let saves=0;
  const flow=picker.createFlow({onSave:async()=>saves++});
  flow.chooseMood('joy');assert.equal(flow.state.step,1);assert.equal(saves,0);
  flow.chooseSubmood('Предвкушение');assert.equal(flow.state.step,2);
  flow.back();assert.equal(flow.state.step,1);
  flow.cancel();assert.equal(flow.state.closed,true);assert.equal(saves,0);
});
test('only final action writes complete draft and prevents duplicate save',async()=>{
  const {picker}=modules();const saved=[];let release;
  const flow=picker.createFlow({onSave:draft=>new Promise(resolve=>{saved.push(draft);release=resolve})});
  flow.chooseMood('joy');flow.chooseSubmood('Предвкушение');flow.chooseReason('work');
  const saving=flow.save();await flow.save();assert.equal(saved.length,1);
  assert.deepEqual(saved[0],{mood:'joy',submood:'Предвкушение',reason:'work',reasonText:''});
  release();await saving;assert.equal(flow.state.closed,true);
});
test('error preserves draft for retry; analyzer cancels without save',async()=>{
  const {picker}=modules();let saves=0,analysis=0;
  const flow=picker.createFlow({onSave:async()=>{saves++;throw Error('network')},onAnalyze:()=>analysis++});
  flow.chooseMood('sadness');flow.chooseSubmood('Тоска');flow.chooseReason('other','Прогулка');
  assert.equal(await flow.save(),false);assert.equal(flow.state.closed,false);
  assert.equal(flow.state.submood,'Тоска');assert.equal(flow.state.reasonText,'Прогулка');
  flow.analyze();assert.equal(analysis,1);assert.equal(saves,1);assert.equal(flow.state.closed,true);
});
test('dialog reuses weather dimensions and contains no emoji rendering',()=>{
  modules();const source=fs.readFileSync(path.join(root,'public/mood-picker.js'),'utf8');
  assert.match(source,/weather-forecast-backdrop/);assert.match(source,/weather-forecast-dialog/);
  assert.match(source,/Анализ настроения/);assert.doesNotMatch(source,/\.emoji|\p{Extended_Pictographic}/u);
});
test('offline queue retains atomic subtype and cause, but never queues analyzer reads',()=>{
  const source=fs.readFileSync(path.join(root,'public/pwa-extras.js'),'utf8');
  const fragment=source.slice(source.indexOf('  function readRequestBody('),source.indexOf('  async function enqueueOfflineMutation('));
  const context={URL,Headers,window:{location:{href:'https://rudi.test/',origin:'https://rudi.test'}},offlineSnapshotScope:()=> 'actor:Рустам'};
  vm.runInNewContext(fragment+';globalThis.queueable=queueableMutation;',context);
  const draft={operation:'set',mood:'joy',submood:'Предвкушение',reason:'other',reasonText:'Отпуск',initData:'not-stored'};
  const row=context.queueable('/api/mood',{method:'POST',body:JSON.stringify(draft)});
  const body=JSON.parse(row.body);assert.equal(body.submood,'Предвкушение');assert.equal(body.reasonText,'Отпуск');assert.equal(body.initData,undefined);
  for(const operation of ['history','analysis','get'])assert.equal(context.queueable('/api/mood',{method:'POST',body:JSON.stringify({operation})}),null);
});
function dialogFixture(){
  let root;const listeners={};
  const document={activeElement:null,createElement:make,addEventListener(type,fn){listeners[type]=fn},removeEventListener(type){delete listeners[type]},body:{style:{overflow:'auto'},append(el){root=el}}};
  function make(tag){
    const el={tag,children:[],handlers:{},className:'',hidden:false,disabled:false,attrs:{},value:'',style:{},
      append(...items){items.forEach(item=>{item.parent=this;this.children.push(item)})},replaceChildren(){this.children=[]},
      addEventListener(type,fn){this.handlers[type]=fn},setAttribute(key,value){this.attrs[key]=value},
      focus(){document.activeElement=this},remove(){root=null},
      closest(selector){for(let node=this;node;node=node.parent)if(selector==='[hidden]'&&node.hidden)return node;return null},
      querySelectorAll(selector){const matches=[];function visit(node){for(const child of node.children){if(selector.split(',').some(s=>s[0]==='.'?child.className.split(' ').includes(s.slice(1)):child.tag===s))matches.push(child);visit(child)}}visit(this);return matches},
      querySelector(selector){return this.querySelectorAll(selector)[0]}
    };
    Object.defineProperty(el,'innerHTML',{set(html){const stack=[el];for(const m of html.matchAll(/<(\/)?([a-z][\w-]*)([^>]*)>/gi)){if(m[1]){stack.pop();continue}const child=make(m[2]);for(const a of m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){if(a[1]==='class')child.className=a[2];else if(a[1]==='hidden')child.hidden=true;else child.attrs[a[1]]=a[2]||''}stack.at(-1).append(child);if(!['input','br'].includes(m[2]))stack.push(child)}}});
    return el;
  }
  const context={document};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(rootPath(),'public/mood-catalog.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(rootPath(),'public/mood-picker.js'),'utf8'),context);
  function rootPath(){return path.join(__dirname,'..')}
  return {api:context.RudiMoodPicker,document,listeners,root:()=>root,
    click(label){const control=root.querySelectorAll('button').find(el=>el.textContent===label);assert.ok(control,'button '+label);control.handlers.click()},
    query(selector){return root.querySelector(selector)}};
}
test('actual dialog clicks show text, retain analyzer, save final draft and restore scroll',async()=>{
  const fixture=dialogFixture(),saved=[];
  fixture.api.open({onSave:async data=>saved.push(data)});
  assert.equal(fixture.document.body.style.overflow,'hidden');
  fixture.click('Радость');fixture.click('Предвкушение');
  assert.equal(saved.length,0);assert.equal(fixture.query('.mood-picker-analyze').hidden,false);
  fixture.click('Работа');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved.length,1);assert.equal(saved[0].submood,'Предвкушение');assert.equal(saved[0].reason,'work');
  assert.equal(fixture.root(),null);assert.equal(fixture.document.body.style.overflow,'auto');
});
test('actual custom answer form saves text; analyzer and Escape never save drafts',async()=>{
  const fixture=dialogFixture();let saves=0,analyses=0,last;
  const options={onSave:async data=>{saves++;last=data},onAnalyze:()=>analyses++};
  fixture.api.open(options);fixture.click('Любовь');fixture.click('Нежность');fixture.click('Свой ответ');
  fixture.query('input').value='Разговор';fixture.query('form').handlers.submit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(last.reasonText,'Разговор');
  fixture.api.open(options);fixture.query('.mood-picker-analyze').handlers.click();assert.equal(analyses,1);assert.equal(saves,1);
  fixture.api.open(options);fixture.click('Гнев');fixture.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(saves,1);assert.equal(fixture.root(),null);
});
test('home badge integration opens draft and sends exactly one atomic set on final save',async()=>{
  const source=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  const fragment=source.slice(source.indexOf('      function setMoodChoicesOpen('),source.indexOf('      let moodReasonTimer='));
  let config,rendered;const requests=[];
  const trigger={dataset:{mood:'joy'},setAttribute(){},classList:{toggle(){},remove(){}}};
  const choices={classList:{remove(){}}},prompt={};
  const context={document:{getElementById:id=>({moodCurrentButton:trigger,moodChoices:choices,moodPrompt:prompt}[id])},
    window:{RudiMoodPicker:{open(value){config=value},close(){}},RUDI_MOOD_HISTORY:{open(){}}},
    moodRequest:async(...args)=>{requests.push(args);return {mine:{mood:'joy'}}},renderDailyMood:data=>rendered=data,
    showMoodMessage(){},setTimeout(){},tg:null};
  vm.runInNewContext(fragment+';globalThis.openPicker=setMoodChoicesOpen;',context);
  context.openPicker(true);assert.equal(requests.length,0);assert.equal(choices.hidden,true);
  await config.onSave({mood:'joy',submood:'Предвкушение',reason:'work',reasonText:''});
  assert.equal(requests.length,1);assert.equal(requests[0][0],'set');assert.equal(requests[0][2].submood,'Предвкушение');
  assert.equal(requests[0][2].reason,'work');assert.equal(rendered.mine.mood,'joy');
});
test('keyboard focus stays inside dialog; busy save ignores cancel and duplicate clicks',async()=>{
  const fixture=dialogFixture();let release,saves=0;
  fixture.api.open({onSave:()=>new Promise(resolve=>{saves++;release=resolve})});
  const analyzer=fixture.query('.mood-picker-analyze');analyzer.focus();
  let prevented=false;fixture.listeners.keydown({key:'Tab',shiftKey:false,preventDefault(){prevented=true}});
  assert.equal(prevented,true);assert.equal(fixture.document.activeElement,fixture.query('.weather-forecast-close'));
  fixture.click('Радость');fixture.click('Восторг');fixture.click('Работа');
  assert.equal(analyzer.disabled,true);
  fixture.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});
  assert.ok(fixture.root());assert.equal(saves,1);
  release();await new Promise(resolve=>setImmediate(resolve));assert.equal(fixture.root(),null);
});
test('neutral proceeds directly to cause; stale subtype cannot cross to another mood',async()=>{
  const {picker}=modules();let saved;
  const flow=picker.createFlow({onSave:async data=>saved=data});
  flow.chooseMood('joy');flow.chooseSubmood('Предвкушение');flow.back();flow.back();
  flow.chooseMood('anger');flow.chooseSubmood('Предвкушение');assert.equal(flow.state.step,1);
  flow.back();flow.chooseMood('neutral');assert.equal(flow.state.step,2);assert.equal(flow.state.submood,'');
  await flow.save();assert.equal(saved.mood,'neutral');assert.equal(saved.reason,'');
});
test('fear chart segments and legend have a visible matching color',()=>{
  const css=fs.readFileSync(path.join(root,'public/mood-history-v2101.css'),'utf8');
  assert.match(css,/\.mood-analysis-mood-segment\[data-mood="anxiety"\],\.mood-analysis-mood-legend span\[data-mood="anxiety"\] i\{background:#[a-f0-9]{6}\}/);
});
