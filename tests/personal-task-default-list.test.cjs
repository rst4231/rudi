const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/personal-task-editor.js'),'utf8');
async function fixture({creating=true,projectId='',lists=[{id:'business',name:'Бизнес'},{id:'tasks',name:'Дела'}]}={}){
 const select={options:[],disabled:false,_value:'',replaceChildren(...items){this.options=items;this._value=items[0]?.value||''},add(o){this.options.push(o);if(this.options.length===1)this._value=o.value},set value(v){this._value=v},get value(){return this._value},set selectedIndex(i){this._value=this.options[i]?.value||''}};
 const task={projectId},ctx={active:{creating,task},listed:false,f:()=>select,request:async()=>({lists,writable:true}),message(){},Option:function(text,value){this.text=text;this.value=value}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function projects()'),source.indexOf('function renderPersonalChecklist(')),ctx);await ctx.projects();return select;
}
test('new personal task defaults to Дела even when Бизнес is first or prefilled',async()=>{assert.equal((await fixture()).value,'tasks');assert.equal((await fixture({projectId:'business'})).value,'tasks')});
test('editing an existing task retains its actual list',async()=>{assert.equal((await fixture({creating:false,projectId:'business'})).value,'business')});
test('default list matches spaces and case and missing Дела keeps valid existing fallback',async()=>{assert.equal((await fixture({lists:[{id:'b',name:'Бизнес'},{id:'d',name:'  дЕлА  '}]})).value,'d');assert.equal((await fixture({projectId:'b',lists:[{id:'b',name:'Бизнес'}]})).value,'b')});
