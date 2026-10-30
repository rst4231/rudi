const {test,expect}=require('@playwright/test');
const {readLuluCare,saveLuluCare}=require('../../api/lulu-care-store.cjs');
test.beforeEach(async({page})=>{
 const map=new Map();const options={careCache:{get:async key=>structuredClone(map.get(key)),set:async(key,value)=>{map.set(key,structuredClone(value))},setIfAbsent:async(key,value)=>{if(map.has(key))return false;map.set(key,structuredClone(value));return true},delete:async key=>{map.delete(key)},list:async()=>[...map].map(([key,value])=>({key,value:structuredClone(value)}))},now:Date.parse('2026-10-30T12:00:00Z')};
 await page.clock.install({time:new Date(options.now)});
 await page.route('**/care-fixture',route=>route.fulfill({contentType:'text/html',body:'<html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/meditation.css"><link rel="stylesheet" href="/partner-profile.css"><link rel="stylesheet" href="/lulu-care.css"></head><body><section class="rudi-meditation-page partner-profile-page lulu-profile-page"><div class="partner-profile-content"><div class="partner-profile-layout"><div id="care" class="lulu-care-root"></div></div></div></section></body></html>'}));
 await page.route('**/api/partner-message?*',async route=>{
  const input=route.request().postDataJSON();try{const data=input.operation==='care-get'?{care:await readLuluCare(options)}:{record:await saveLuluCare('Рустам',input.command,options)};await route.fulfill({json:{ok:true,...data}})}catch(error){await route.fulfill({status:error.message==='lulu-care-conflict'?409:400,json:{ok:false,error:error.message}})}
 });
 await page.goto('/care-fixture');await page.addScriptTag({url:'/lulu-care.js'});
 await page.evaluate(()=>{window.careRequest=async(operation,payload={})=>{const r=await fetch('/api/partner-message?rudiAction=lulu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,...payload})});const data=await r.json();if(!r.ok)throw Error(data.error);return data};window.mountCare=()=>{window.unmountCare?.();window.unmountCare=RudiLuluCare.mount(document.querySelector('#care'),{actor:'Рустам',request:window.careRequest})};window.mountCare()});
 await expect(page.locator('.lulu-care-weight')).toBeVisible();
});
test('weight history graph, editing and target persist after reopening',async({page})=>{
 const block=page.locator('.lulu-care-weight');
 await block.getByRole('button',{name:'Добавить',exact:true}).click();await block.getByLabel('Вес, кг',{exact:true}).fill('12.4');await block.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(block.locator('.lulu-care-value')).toHaveText('12,4 кг');
 await block.getByRole('button',{name:'Добавить',exact:true}).click();await block.getByLabel('Дата',{exact:true}).fill('2026-10-25');await block.getByLabel('Вес, кг',{exact:true}).fill('12.1');await block.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(block.locator('svg')).toHaveCount(1);await block.getByRole('button',{name:'Указать',exact:true}).click();await block.getByLabel('Целевой вес, кг',{exact:true}).fill('12');await block.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(block.locator('.lulu-care-goal')).toContainText('12 кг');await block.getByText('История веса',{exact:true}).click();
 await expect(block.locator('.lulu-care-history>.lulu-care-row')).toHaveCount(2);await block.locator('.lulu-care-history>.lulu-care-row').first().getByRole('button',{name:'Изменить',exact:true}).click();
 await block.getByLabel('Вес, кг',{exact:true}).fill('12.3');await block.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(block.locator('.lulu-care-value')).toHaveText('12,3 кг');
 await page.evaluate(()=>mountCare());await expect(page.locator('.lulu-care-weight .lulu-care-value')).toHaveText('12,3 кг');
});
test('nutrition and prevention allow updates and next-date display without a preset interval',async({page})=>{
 const food=page.locator('.lulu-care-nutrition');await food.getByRole('button',{name:'Добавить',exact:true}).click();
 await food.getByLabel('Корм',{exact:true}).fill('Корм Sensitive');await food.getByLabel('Порция за день, г',{exact:true}).fill('210');await food.getByLabel('Лакомства',{exact:true}).fill('Немного на прогулке');await food.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(food).toContainText('Корм Sensitive');await expect(food).toContainText('210 г');
 const prevent=page.locator('.lulu-care-prevention');await prevent.getByRole('button',{name:'Добавить',exact:true}).click();await prevent.getByLabel('Что отмечаем',{exact:true}).selectOption('parasite');
 await prevent.getByLabel('Препарат',{exact:true}).fill('По паспорту');await expect(prevent.getByLabel('Следующая дата',{exact:true})).toHaveValue('');await prevent.getByLabel('Следующая дата',{exact:true}).fill('2026-11-15');await prevent.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(prevent).toContainText('Обработка · По паспорту');await expect(prevent).toContainText('15 нояб.');
 await prevent.getByRole('button',{name:'Удалить',exact:true}).click();await expect(prevent.locator('.lulu-care-row')).toHaveCount(0);
});
test('prescription records dose as entered and logs individual intakes',async({page})=>{
 const block=page.locator('.lulu-care-prescription');await block.getByRole('button',{name:'Добавить',exact:true}).click();
 await block.getByLabel('Название назначения',{exact:true}).fill('Назначение ветеринара');await block.getByLabel('Дозировка по назначению',{exact:true}).fill('Как в рецепте');await block.getByLabel('Когда принимать',{exact:true}).fill('Утром и вечером');await block.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(block).toContainText('Как в рецепте');await block.getByRole('button',{name:'Отметить приём',exact:true}).click();await expect(block).toContainText('Сегодня отмечено приёмов: 1');
 await block.getByRole('button',{name:'Отметить приём',exact:true}).click();await expect(block).toContainText('Сегодня отмечено приёмов: 2');
 await block.getByRole('button',{name:'Завершить',exact:true}).click();await expect(block.getByRole('button',{name:'Отметить приём',exact:true})).toHaveCount(0);await expect(block.getByText('Завершено',{exact:true})).toBeVisible();
 for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);expect(await block.evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/lulu-care-'+theme+'.png',fullPage:true})}
});
test('offline weight edits survive reopen and synchronize without duplicate records',async({page})=>{
 await page.addScriptTag({url:'/rudi-offline-content.js'});await page.evaluate(()=>{rudiOfflineContent.init('Рустам');document.body.dataset.offlineMode='1';window.mountCare()});
 const block=page.locator('.lulu-care-weight');await block.getByRole('button',{name:'Добавить',exact:true}).click();await block.getByLabel('Вес, кг',{exact:true}).fill('12.2');await block.getByRole('button',{name:'Сохранить',exact:true}).click();
 await expect(block.locator('.lulu-care-value')).toHaveText('12,2 кг');await page.evaluate(()=>window.mountCare());await expect(page.locator('.lulu-care-weight .lulu-care-value')).toHaveText('12,2 кг');
 await page.evaluate(async()=>{document.body.dataset.offlineMode='0';await rudiOfflineContent.flush()});
 await expect.poll(()=>page.evaluate(async()=>(await rudiOfflineContent.pending('lulu')).length)).toBe(0);
 await page.evaluate(()=>window.mountCare());await expect(page.locator('.lulu-care-weight .lulu-care-value')).toHaveText('12,2 кг');
 const records=await page.evaluate(async()=>(await careRequest('care-get')).care.records);expect(records.filter(r=>r.kind==='weight')).toHaveLength(1);
});
test('deleting an offline edit removes the underlying weight after sync',async({page})=>{
 const block=page.locator('.lulu-care-weight');await block.getByRole('button',{name:'Добавить',exact:true}).click();await block.getByLabel('Вес, кг',{exact:true}).fill('12');await block.getByRole('button',{name:'Сохранить',exact:true}).click();
 await page.addScriptTag({url:'/rudi-offline-content.js'});
 await page.evaluate(async()=>{rudiOfflineContent.init('Рустам');document.body.dataset.offlineMode='1';const record=(await careRequest('care-get')).care.records.find(r=>r.kind==='weight');await rudiOfflineContent.enqueue('lulu','care:weight:'+record.id,{operation:'care-command',command:{kind:'weight',id:record.id,data:{...record.data,kg:13},expectedUpdatedAt:record.updatedAt}});mountCare()});
 await expect(block.locator('.lulu-care-value')).toHaveText('13 кг');await block.getByText('История веса',{exact:true}).click();await block.getByRole('button',{name:'Удалить',exact:true}).click();
 await expect(block.locator('.lulu-care-value')).toHaveText('Нет замеров');
 await page.evaluate(async()=>{document.body.dataset.offlineMode='0';await rudiOfflineContent.flush()});
 const records=await page.evaluate(async()=>(await careRequest('care-get')).care.records);expect(records.filter(r=>r.kind==='weight')).toHaveLength(0);
});
test('nutrition can be deleted and entered again after reopening',async({page})=>{
 const block=page.locator('.lulu-care-nutrition');await block.getByRole('button',{name:'Добавить',exact:true}).click();await block.getByLabel('Корм',{exact:true}).fill('Корм A');await block.getByRole('button',{name:'Сохранить',exact:true}).click();
 await block.getByRole('button',{name:'Удалить',exact:true}).click();await expect(block).not.toContainText('Корм A');await page.evaluate(()=>mountCare());
 await block.getByRole('button',{name:'Добавить',exact:true}).click();await block.getByLabel('Корм',{exact:true}).fill('Корм B');await block.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(block).toContainText('Корм B');
});
