const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/rudi-offline-transactions.js','utf8');
const p={id:'checkout-offline',walletId:'card',walletName:'Карта',currency:'RUB',amount:300,rubAmount:300,occurredAt:'2026-09-30T22:00:00Z'};
const row={id:'queued',actor:'Рустам',area:'products',operation:'buy-checked',payload:{checkedIds:['one','two'],purchase:p},createdAt:Date.parse(p.occurredAt)};
function setup(expenses=[]){const snapshot={ok:true,items:[{id:'one',text:'Хлеб'},{id:'two',text:'Молоко'}],history:[],wallets:[{id:'card',currency:'RUB',balance:1000}],categories:[{id:'food',name:'Продукты',currency:'RUB'}],personalExpenses:expenses,walletIncomes:[],personalMonths:[]};const ctx={actor:'Рустам',base:async()=>snapshot,pending:async()=>[row]};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function productProjection('),source.indexOf('function offline(){')),ctx);return ctx}
test('offline purchase projects the same receipt into history and wallet without losing amount',async()=>{const ctx=setup();const products=await ctx.view('products');assert.equal(products.items.length,0);assert.equal(products.history[0].purchase.id,p.id);assert.equal(products.history[0].purchase.rubAmount,300);const finance=await ctx.view('finances');assert.equal(finance.wallets[0].balance,700);assert.equal(finance.personalExpenses.length,1);assert.equal(finance.personalExpenses[0].month,'2026-10')});
test('an expense already acknowledged in finance is not projected a second time',async()=>{const ctx=setup([{requestId:'products-'+p.id,amount:300,rubAmount:300}]);const result=await ctx.view('finances');assert.equal(result.wallets[0].balance,1000);assert.equal(result.personalExpenses.length,1)});
test('successful purchase replay persists finance snapshot before deleting pending operation and notifies finance UI',async()=>{
 const snapshots=new Map(),outbox=new Map([[row.id,row]]),signals=[];
 const response={ok:true,items:[],history:[],purchaseFinances:{ok:true,actor:'Рустам',wallets:[{id:'card',balance:700}],personalExpenses:[{id:'expense',requestId:'products-'+p.id,amount:300,rubAmount:300}]}};
 const ctx={flushing:null,actor:'Рустам',pending:async()=>[...outbox.values()],probe:async()=>true,base:async()=>({items:[]}),project:()=>({items:[]}),send:async()=>response,clean:structuredClone,key:(who,area)=>who+'|'+area,signal:value=>signals.push(value),tx:async(stores,mode,fn)=>fn({objectStore:name=>({get:k=>snapshots.get(k)||null,put:v=>snapshots.set(v.key,v),delete:id=>outbox.delete(id)})})};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function flush(){'),source.indexOf('function init(who,auth){')),ctx);
 await ctx.flush();
 assert.equal(outbox.size,0);assert.equal(snapshots.get('Рустам|finances').state.wallets[0].balance,700);
 assert.ok(signals.some(x=>x.area==='finances'&&x.synced));
});
