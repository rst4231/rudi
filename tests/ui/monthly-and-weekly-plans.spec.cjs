const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./calendar.spec.cjs'),'utf8'),prefix=source.slice(0,source.indexOf("\ntest('"));
const finance=require('../../api/finance-store.cjs'),products=require('../../api/product-list-store.cjs'),monthly=require('../../public/finance-monthly-plan-core.js');
const now='2026-09-21T09:00:00Z';
async function setup(page,actor,theme){
 const swap=text=>text.replaceAll('Рустам','__FIRST__').replaceAll('Диана','Рустам').replaceAll('__FIRST__','Диана'),fixture={require,URL,Buffer,Response,console,setTimeout,clearTimeout};vm.runInNewContext((actor==='Диана'?swap(prefix):prefix)+';this.mock=mockRudi',fixture);await fixture.mock(page);
 let f=finance.normalizeState({initialized:true,version:1,categories:{[actor]:[{id:'food',name:'Продукты',currency:'RUB',monthlyLimit:1000}]},wallets:{[actor]:[{id:'cash',name:'Карта',currency:'RUB',balance:5000,type:'regular'}]},plans:{[actor]:{expectedMonthlyIncome:20000,expectedIncomeDay:20,plannedMonthlyVariableExpenses:1000,obligations:[{id:'bill',title:'Связь',amount:10000,day:5,paidMonths:['2026-09']}]}},personalExpenses:[{id:'expense',actor,categoryId:'food',month:'2026-08',amount:1000,rubAmount:1000,occurredAt:'2026-08-10T12:00:00Z'}]});
 const fopts={now,financeCache:{get:async()=>structuredClone(f),set:async(k,v)=>{f=structuredClone(v)}}};let applyCalls=0;
 await page.route('**/api/finances',async route=>{const body=route.request().postDataJSON()||{};try{if(body.operation==='apply-monthly-plan'){applyCalls++;await finance.applyMonthlyFinancePlan(actor,body,fopts)}if(body.operation==='save-plan')await finance.saveFinancePlan(actor,body,fopts);const view=finance.viewState(f,actor);await route.fulfill({json:{ok:true,actor,...view,monthlyPlanContext:{rates:{RUB:1}},monthlyPlan:monthly.build({...view,actor},now)}})}catch(e){await route.fulfill({status:409,json:{ok:false,error:e.message}})}});
 const buy=(id,text,date)=>({id,text,boughtAt:date+'T06:00:00Z'});let p={initialized:true,items:[],history:[buy('milk1','Молоко','2026-09-07'),buy('milk2','Молоко','2026-09-14'),buy('bread1','Хлеб','2026-09-17'),buy('bread2','Хлеб','2026-09-20')]};
 const popts={now,productCache:{get:async()=>structuredClone(p),set:async(k,v)=>{p=structuredClone(v)}}};let weeklyCalls=0;
 await page.route('**/api/partner-message?rudiAction=products*',async route=>{const body=route.request().postDataJSON()||{};if(body.operation==='add-weekly'){weeklyCalls++;await products.addWeeklyProducts(body.ids,actor,popts)}if(body.operation==='add')await products.addProducts(body.items,actor,popts);await route.fulfill({json:{ok:true,actor,...p}})});
 await page.goto('/');await expect(page.locator('body')).toHaveClass(/auth-ok/);await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 return {get finance(){return f},get products(){return p},get applyCalls(){return applyCalls},get weeklyCalls(){return weeklyCalls}};
}
for(const actor of ['Рустам','Диана'])for(const theme of ['light','dark']){
 test('monthly plan accepts actor limits and masks money: '+actor+' / '+theme,async({page})=>{
  const state=await setup(page,actor,theme);await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('finances',{scroll:false}));
  const card=page.locator('#financeMonthlyPlan');await expect(card).toBeVisible();await expect(card).toContainText('октябрь');await expect(card).toContainText('может не хватить');if(actor==='Рустам')await card.screenshot({path:'/tmp/rudi-monthly-'+theme+'.png'});
  await page.locator('#financeBalanceEyeButton').click();await expect(card).not.toContainText('10 000');await expect(card).toContainText('••••');await expect(card.locator('#financeMonthlyIncomeDetails')).toBeHidden();await page.locator('#financeBalanceEyeButton').click();
  await page.locator('#financeMonthlyPlanApply').click();await expect(card.locator('#financeMonthlyPlanStatus')).toContainText('Лимиты сохранены');expect(state.applyCalls).toBe(1);expect(state.finance.categories[actor][0].monthlyLimits['2026-10']).toBe(1100);expect(state.finance.categories[actor][0].monthlyLimit).toBe(1000);
  const box=await card.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width+1);
 });
 test('weekly suggestion and Diana additions stay shared and unchecked: '+actor+' / '+theme,async({page})=>{
  const state=await setup(page,actor,theme);await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('products',{scroll:false}));const card=page.locator('#productsWeeklyPlan');await expect(card).toBeVisible();await expect(card.locator('label')).toHaveCount(2);if(actor==='Рустам')await card.screenshot({path:'/tmp/rudi-weekly-'+theme+'.png'});
  await card.locator('input[value="bread2"]').uncheck();await page.evaluate(()=>window.dispatchEvent(new Event('rudi-products-update')));await expect(card.locator('input[value="bread2"]')).not.toBeChecked();await card.locator('#productsWeeklyAdd').click();await expect(card.locator('#productsWeeklyStatus')).toContainText('добавлены');expect(state.weeklyCalls).toBe(1);expect(state.products.items).toHaveLength(1);expect(state.products.items[0].text).toBe('Молоко');expect(state.products.items[0].checked).toBe(false);expect(state.products.history).toHaveLength(4);await expect(card.locator('label')).toHaveCount(1);await expect(card.locator('input')).toBeEnabled();
  await page.locator('#productsInput').fill('Яблоки');await page.locator('#productsAdd').click();await expect(page.locator('#productsGroups')).toContainText('Яблоки');expect(state.products.items.find(x=>x.text==='Яблоки').addedBy).toBe(actor);
  const box=await card.boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width+1);
 });
}
