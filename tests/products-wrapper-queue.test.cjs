const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

test('wrapper serializes concurrent product mutations before durable writes', async () => {
  let products = [];
  let activeAdds = 0;
  let maxActiveAdds = 0;
  const base = {
    PRODUCTS_TOPIC_ID: 263, PRODUCTS_HISTORY_KEY:'products:history', PRODUCTS_MIGRATION_KEY:'products:migration',
    restoreCompoundProducts:x=>x, normalizeCompoundProducts:x=>x,
    isTelegramProductAddition:()=>true, cleanProductUtterance:x=>x, getProductRemovalTarget:()=>'',
    markProductsRuntimeStale(){}, writeProductsHistory:async()=>{}, removeProductsFromHistory:x=>x,
    async runProductsAddition(req, task){ return task(); }, async runAuthorizedProductsClear(task){ return task(); },
  };
  const durable = {
    getProductsCache(){ throw new Error('not used'); }, async isInitialized(){return true}, async hasDurableState(){return true},
    async markInitialized(){}, async ensureInitialized(){return products}, async readProducts(){return [...products]},
    async addProducts(values){ activeAdds++; maxActiveAdds=Math.max(maxActiveAdds,activeAdds); const snapshot=[...products]; await new Promise(r=>setTimeout(r,10)); products=[...new Set([...snapshot,...values])]; activeAdds--; return [...products]; },
    async removeProducts(){return [...products]}, async replaceProducts(v){products=[...v];return [...products]}, async clearProducts(){products=[];return []},
  };
  const author={runWithProductsUpdateAuthorName:(_n,task)=>task()};
  const old=Module._load;
  Module._load=function(request,parent,isMain){ if(request==='./products-state-base.cjs')return base;if(request==='./products-durable-state.cjs')return durable;if(request==='./products-update-author.cjs')return author;return old.call(this,request,parent,isMain); };
  const modulePath=path.resolve(__dirname,'../api/products-state.cjs'); delete require.cache[modulePath];
  let state; try { state=require(modulePath); } finally { Module._load=old; }
  const mk=(text,id)=>({body:{message:{message_thread_id:263,text,from:{id}}}});
  await Promise.all([
    state.runProductsAddition(mk('молоко',1), async()=>{}, {cache:{get:async()=>null,set:async()=>{}}}),
    state.runProductsAddition(mk('яйца',2), async()=>{}, {cache:{get:async()=>null,set:async()=>{}}}),
  ]);
  assert.equal(maxActiveAdds,1);
  assert.deepEqual(new Set(products), new Set(['молоко','яйца']));
});
