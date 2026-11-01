const {test,expect}=require('@playwright/test'),fs=require('node:fs');
const store=require('../../api/finance-store.cjs');
const source=fs.readFileSync('public/app.js','utf8');
const part=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const code=part('      function financeNormalizeSharedItems(', '      function financeDebounce(')+
 part('      function renderFinanceObligations(', '      function financeMonthGenitive(')+
 part('      function financeMonthGenitive(', '      function renderFinanceHistory(')+
 part('      function applyFinancePermissions(', '      function renderFinanceState(')+
 source.slice(source.indexOf("        document.getElementById('financeObligationSaveButton')?.addEventListener"),source.indexOf("        ['financeTransferFrom'"));
async function fixture(page,actor='Рустам'){
 let state=null;const options={financeCache:{get:async()=>state,set:async(_k,v)=>{state=structuredClone(v)}}};
 await store.saveFinanceMonth('Рустам','2026-11',35000,5090,[{id:'net',title:'Интернет',amount:750}],options);
 await store.saveFinanceMonth('Рустам','2026-10',35000,3780,[{id:'net',title:'Интернет',amount:750}],options);
 const calls=[];let offline=false;
 await page.route('**/api/finances',async route=>{
  const p=route.request().postDataJSON();calls.push(p);
  if(offline)return route.abort('internetdisconnected');
  state=p.operation==='save'?await store.saveFinanceMonth(actor,p.month,p.rent,p.utilities,p.items,options):await store.saveFinancePlan(actor,p,options);
  await route.fulfill({json:{ok:true,actor,...store.viewState(state,actor,'2026-11')}});
 });
 const html=fs.readFileSync('public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 await page.route('**/shared-fixture',r=>r.fulfill({contentType:'text/html',body:html}));await page.goto('/shared-fixture');
 await page.addScriptTag({url:'/finance-shared-autosave.js'});
 await page.evaluate(({code,actor,state})=>{
  document.body.className='auth-ok';document.body.dataset.appTab='finance';
  document.getElementById('financePage').hidden=false;document.getElementById('financeSharedPanel').hidden=false;
  const boot=`let currentActor=${JSON.stringify(actor)},financeState=${JSON.stringify(state)},financeSharedAutosave=null,financeSharedAutosaveActor='',financeObligationEditingId='';
 const financeCurrentMonthKey=()=> '2026-11',financeMoney=n=>Number(n).toLocaleString('ru-RU')+' ₽',financeOverviewMoney=financeMoney,financePercent=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%',financeMonthTitle=m=>m;
 const financePreviousMonthKey=()=> '2026-10',financeRowForMonth=m=>financeState.months.find(r=>r.month===m),renderFinanceHistory=()=>{},renderFinanceObligationCoverage=()=>{},syncFinanceObligationAttention=()=>{},financeUnpaidTodayObligations=()=>[],animateRudiCollection=()=>{},invalidateManagedRequests=()=>{};
 const mountFinanceCoinModal=(m,input)=>{document.body.append(m);m.hidden=false;input?.focus()},closeFinanceCoinModal=id=>document.getElementById(id).hidden=true;
 const financeRequest=async(operation,payload)=>{const r=await fetch('/api/finances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,...payload})});const d=await r.json();if(!r.ok)throw Error(d.error);return d};
 const renderFinanceState=data=>{financeState=data;renderFinanceSelectedMonth(document.getElementById('financeMonthInput').value);renderFinanceObligations()};`;
  new Function(boot+code+`;document.getElementById('financeMonthInput').value='2026-11';document.getElementById('financePersonalMonthInput').value='2026-11';applyFinancePermissions();renderFinanceSelectedMonth('2026-11');bindFinanceSharedAutosave();renderFinanceObligations();window.remountShared=()=>{financeSharedAutosave?.destroy();financeSharedAutosave=null;renderFinanceSelectedMonth(document.getElementById('financeMonthInput').value)};`)();
 },{code,actor,state:store.viewState(state,actor,'2026-11')});
 return {calls,offline:value=>{offline=value},get state(){return state}};
}
test('shared finance autosaves after input, removes save button and keeps previous-month wording',async({page})=>{
 const h=await fixture(page);await expect(page.locator('#financeSaveButton')).toHaveCount(0);await expect(page.locator('#financeSharedPanel')).toContainText('Коммунальные за прошлый месяц');
 const input=page.locator('#financeUtilitiesInput');await input.fill('6000');await page.locator('#financeRentInput').click();
 await expect.poll(()=>h.state.months['2026-11'].utilities).toBe(6000);expect(h.calls.filter(c=>c.operation==='save')).toHaveLength(1);
 await expect(page.locator('#financeTotalHint')).toContainText('ЖКУ за прошлый месяц');await expect(page.locator('#financeMonthComparison')).toContainText('больше прошлого месяца');
 await input.fill('3000');await expect.poll(()=>h.state.months['2026-11'].utilities).toBe(3000);await expect(page.locator('#financeMonthComparison')).toContainText('меньше прошлого месяца');
 await page.screenshot({path:'/tmp/shared-finance-autosave.png',fullPage:true});
});
test('changing month during debounce saves to the original month',async({page})=>{
 const h=await fixture(page);await page.locator('#financeRentInput').fill('36000');
 await page.locator('#financeMonthInput').evaluate(input=>{input.value='2026-10';input.dispatchEvent(new Event('change',{bubbles:true}))});
 await expect(page.locator('#financeRentInput')).toHaveValue('35000');await expect.poll(()=>h.state.months['2026-11'].rent).toBe(36000);expect(h.state.months['2026-10'].rent).toBe(35000);
 await expect(page.locator('#financeRentInput')).toHaveValue('35000');
});
test('offline draft survives remount and retries when connection returns',async({page})=>{
 const h=await fixture(page);h.offline(true);await page.locator('#financeRentInput').fill('37000');await page.locator('#financeUtilitiesInput').click();
 await expect(page.locator('#financeStatus')).toContainText('на устройстве');await page.evaluate(()=>remountShared());await expect(page.locator('#financeRentInput')).toHaveValue('37000');
 h.offline(false);await page.evaluate(()=>dispatchEvent(new Event('online')));await expect.poll(()=>h.state.months['2026-11'].rent).toBe(37000);
});
for(const [actor,amount] of [['Диана','16 336 ₽'],['Рустам','24 504 ₽']])test('housing is locked but payment day can be edited for '+actor,async({page})=>{
 const h=await fixture(page,actor);const row=page.locator('#financeObligationList .finance-obligation-row').filter({hasText:'Жилье'});await expect(row).toHaveCount(1);await expect(row).toContainText(amount);await expect(row.locator('.finance-obligation-delete')).toHaveCount(0);
 await row.evaluate(el=>{const details=el.closest('details');if(details)details.open=true;const panel=el.closest('[data-finance-panel]');if(panel)panel.hidden=false});await row.locator('.finance-obligation-copy').click();await expect(page.locator('#financeObligationTitle')).toHaveJSProperty('readOnly',true);await expect(page.locator('#financeObligationAmount')).toHaveJSProperty('readOnly',true);
 await page.locator('#financeObligationDay').fill('7');await page.locator('#financeObligationSaveButton').click();await expect(row).toContainText('7 числа');
 expect(store.viewState(h.state,actor,'2026-11').plan.obligations.find(r=>r.id==='system-housing').day).toBe(7);
});
