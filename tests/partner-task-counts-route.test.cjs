'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function route(actor){
 const filename=path.resolve('api/partner-message.js'),real=createRequire(filename),module={exports:{}};
 const deps={
  './rudi-session.cjs':{authorizeWithSession:()=>{if(!actor)throw Error('rudi-access-denied');return {actor}}},
  './partner-task-counts.cjs':{partnerTaskCounts:async who=>({ok:true,partner:who==='Рустам'?'Диана':'Рустам',available:true,counts:{morning:1,day:0,evening:2},total:4})}
 };
 vm.runInThisContext('(function(require,module,exports,__filename,__dirname){'+fs.readFileSync(filename,'utf8')+'\n})',{filename})(name=>deps[name]||real(name),module,module.exports,filename,path.dirname(filename));
 return async(method='POST')=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await module.exports.handleRudiAction({method,body:{actor:'Диана',partner:'Рустам'},headers:{}},res,'partner-task-counts',{botToken:'test'});return res;
 };
}
test('summary uses authenticated viewer rather than supplied actor',async()=>{
 for(const actor of ['Рустам','Диана']){
  const response=await route(actor)();assert.equal(response.code,200);assert.equal(response.body.partner,actor==='Рустам'?'Диана':'Рустам');assert.match(response.headers['Cache-Control'],/no-store/);
 }
});
test('summary requires authorization and POST',async()=>{
 assert.equal((await route(null)()).code,403);assert.equal((await route('Рустам')('GET')).code,405);
});
