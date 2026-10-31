const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
test('mobile category editor displays next-month limit and prior spending without overflow',async({page})=>{
 const html=fs.readFileSync('public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const source=fs.readFileSync('public/app.js','utf8');
 const code=source.slice(source.indexOf('function mountFinanceCoinModal('),source.indexOf('function closeFinanceCoinModal('))+
  source.slice(source.indexOf('function openFinanceCategoryComposer('),source.indexOf('function financeMonthFromOccurredAt('));
 await page.route('**/limits-fixture',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('/limits-fixture');await page.addScriptTag({url:'/finance-category-limits.js'});
 await page.evaluate(code=>{
  const bootstrap=`
   let financeCategoryEditingId='';const currentActor='Диана';
   const category={id:'food',name:'Еда',icon:'🍽️',currency:'RUB',monthlyLimit:1000,monthlyLimits:{'2026-11':1500}};
   const financeCategoryById=()=>category,financeCurrentMonthKey=()=> '2026-10';
   const financeMonthTitle=m=>m==='2026-11'?'Ноябрь 2026':m==='2026-10'?'Октябрь 2026':'Сентябрь 2026';
   const financePreviousMonthKey=m=>m==='2026-11'?'2026-10':'2026-09';
   const financeCategoryLimitForMonth=window.RudiFinanceCategoryLimits.limitForMonth;
   const financeCategorySpent=(_id,m)=>m==='2026-10'?120:80,financeOverviewMoney=n=>n+' ₽';
   document.getElementById('financePersonalMonthInput').value='2026-10';
  `;
  new Function(bootstrap+code+";openFinanceCategoryComposer('food');")();
 },code);
 const modal=page.locator('#financeCategoryComposer');await expect(modal).toBeVisible();
 await expect(page.locator('#financeCategoryPreviousSpent')).toHaveText('Сентябрь 2026 · потрачено 80 ₽');
 await page.locator('#financeCategoryLimitMonth').selectOption('2026-11');
 await expect(page.locator('#financeCategoryLimit')).toHaveValue('1500');
 await expect(page.locator('#financeCategoryPreviousSpent')).toHaveText('Октябрь 2026 · потрачено 120 ₽');
 for(const selector of ['#financeCategoryLimitMonth','#financeCategoryLimit','#financeCategoryPreviousSpent']){
  const box=await page.locator(selector).boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width+1);
 }
 await page.screenshot({path:'/tmp/rudi-finance-limits.png'});
});
