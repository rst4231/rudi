const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const source=fs.readFileSync('public/app.js','utf8');
 const code=source.slice(source.indexOf('let financeLiteracyExplanationRevision=0;'),source.indexOf('function renderFinanceLiteracy(article)'));
 const nodes=Object.fromEntries(['financeLiteracyExplainButton','financeLiteracyExplainStatus','financeLiteracyExplanation'].map(id=>[id,{textContent:'',hidden:false,disabled:false,children:[],replaceChildren(){this.children=[];}}]));
 let resolve;let calls=0;
 const context=vm.createContext({currentActor:'Рустам',document:{getElementById:id=>nodes[id]},financeRequest:()=>{calls++;return new Promise(r=>{resolve=r})},appendFinanceLiteracyParagraph:(host,text)=>host.children.push(text)});
 vm.runInContext(code,context);
 return{nodes,context,configure:article=>context.configureFinanceLiteracyExplanation(article),reply:data=>resolve(data),calls:()=>calls};
}
test('simple article explanation coalesces taps, renders text and toggles without new request',async()=>{
 const f=fixture(),button=f.nodes.financeLiteracyExplainButton,host=f.nodes.financeLiteracyExplanation;
 f.configure({id:'a'});const pending=button.onclick();await button.onclick();assert.equal(f.calls(),1);assert.equal(button.disabled,true);
 f.reply({articleId:'a',explanation:{text:'<script>example</script>\n\nПростой пример'}});await pending;
 assert.equal(host.hidden,false);assert.deepEqual(host.children,['Объяснение простыми словами','<script>example</script>','Простой пример']);
 await button.onclick();assert.equal(host.hidden,true);await button.onclick();assert.equal(host.hidden,false);assert.equal(f.calls(),1);
});
test('old article or actor replies never overwrite the current explanation',async()=>{
 for(const change of ['article','actor']){
  const f=fixture();f.configure({id:'a'});const pending=f.nodes.financeLiteracyExplainButton.onclick();
  if(change==='article')f.configure({id:'b'});else f.context.currentActor='Диана';
  f.reply({articleId:'a',explanation:{text:'Старый ответ'}});await pending;
  assert.equal(f.nodes.financeLiteracyExplanation.hidden,true);assert.equal(f.nodes.financeLiteracyExplanation.children.length,0);
 }
});
test('wrong article response shows an error and leaves retry available',async()=>{
 const f=fixture();f.configure({id:'a'});const pending=f.nodes.financeLiteracyExplainButton.onclick();
 f.reply({articleId:'b',explanation:{text:'Чужая статья'}});await pending;
 assert.match(f.nodes.financeLiteracyExplainStatus.textContent,/обновилась/);assert.equal(f.nodes.financeLiteracyExplainButton.disabled,false);
});
