const test=require('node:test');
const assert=require('node:assert/strict');
const {
  setProductCheckedSelection,
  addProducts,
  readProductList,
}=require('../api/product-list-store.cjs');

function memoryCache(){
  const map=new Map();
  return{
    async get(key){return map.has(key)?structuredClone(map.get(key)):null},
    async set(key,value){map.set(key,structuredClone(value));return true},
    async delete(key){map.delete(key);return true},
  };
}

test('multiple product checkmarks stay selected together',async()=>{
  const cache=memoryCache();
  let state=await addProducts(['молоко','яйца','хлеб'],'Рустам',{productCache:cache});
  const ids=state.items.map(item=>item.id);
  state=await setProductCheckedSelection([ids[0],ids[1]],{productCache:cache});
  assert.equal(state.items.filter(item=>item.checked).length,2);
  assert.deepEqual(
    new Set(state.items.filter(item=>item.checked).map(item=>item.id)),
    new Set([ids[0],ids[1]])
  );

  const persisted=await readProductList({productCache:cache});
  assert.equal(persisted.items.filter(item=>item.checked).length,2);
});
