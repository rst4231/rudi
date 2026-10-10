const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
  categorizeProduct, readProductList, addProducts, updateProduct, markProductBought, restoreProducts,
}=require('../api/product-list-store.cjs');

function cache() {
  const rows=new Map();
  return {
    get:async key=>rows.get(key),
    set:async(key,value)=>{rows.set(key,structuredClone(value));},
  };
}
test('products are categorized by their own type, not words in their description',()=>{
  const examples={
    'Приправа для курицы':'Бакалея',
    'Руккола':'Овощи и зелень',
    'Тортилья':'Хлеб и выпечка',
    'Шпинат':'Овощи и зелень',
    'Вода питьевая':'Напитки',
    'Авокадо':'Фрукты и ягоды',
    'Шампиньоны':'Овощи и зелень',
    'Специи для мяса':'Бакалея',
    'Филе индейки':'Мясо и рыба',
    'Кола':'Напитки',
    'Торт':'Сладкое и снеки',
  };
  for (const [name,expected] of Object.entries(examples))assert.equal(categorizeProduct(name),expected,name);
});
test('editing persists quantity, unit, category, note and preserves stable identity',async()=>{
  const options={productCache:cache()};
  let state=await addProducts(['Молоко','Хлеб'],'Рустам',options);
  const original=state.items.find(x=>x.text==='Молоко');
  state=await updateProduct(original.id,{
    text:'Молоко 2,5%',quantity:'2',unit:'л',categoryOverride:'Напитки',note:'Без лактозы'
  },options);
  const actual=state.items.find(x=>x.id===original.id);
  assert.equal(actual.addedBy,'Рустам');
  assert.equal(actual.quantity,'2');
  assert.equal(actual.unit,'л');
  assert.equal(actual.note,'Без лактозы');
  assert.equal(actual.category,'Напитки');
  assert.equal(state.items.length,2);
  assert.equal((await readProductList(options)).items.find(x=>x.id===original.id).note,'Без лактозы');
  await assert.rejects(()=>updateProduct(original.id,{text:'Хлеб'},options),/product-duplicate/);
  state=await markProductBought(original.id,'Диана',options);
  assert.equal(state.history[0].quantity,'2');
  assert.equal(state.history[0].note,'Без лактозы');
  assert.equal(state.history[0].boughtBy,'Диана');
});
test('older shopping lists remain valid without editor metadata',async()=>{
  const options={productCache:cache()};
  const original=await addProducts(['Тортилья'],'Диана',options);
  const id=original.items[0].id;
  const after=await restoreProducts([{id:'temporary',text:'Руккола',checked:true}],options);
  assert.equal(after.items.find(x=>x.id===id).category,'Хлеб и выпечка');
  assert.equal(after.items.find(x=>x.id==='temporary').category,'Овощи и зелень');
});
test('products autocomplete and versioned assets are wired without remote lookups',()=>{
  const index=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const extras=fs.readFileSync(path.join(__dirname,'../public/product-extras.js'),'utf8');
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../rudi-version.json'),'utf8'));
  const assetVersion=String(config.current).replace(/^v/,'');
  assert.ok(index.includes('/product-extras.js?v='+assetVersion));
  assert.ok(index.includes('/product-extras.css?v='+assetVersion));
  assert.ok(app.includes('window.RUDI_PRODUCTS_CURRENT='));
  assert.ok(app.includes('window.RUDI_PRODUCTS_API='));
  assert.ok(extras.includes("window.RUDI_PRODUCTS_API"));
  assert.ok(extras.includes('aggregateHistory'));
  assert.ok(extras.includes('allSuggestions'));
  assert.ok(!extras.includes('fetch('));
  assert.ok(!app.includes("На неделю для двоих: ~"));
});
