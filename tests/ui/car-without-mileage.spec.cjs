const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
for(const actor of ['Рустам','Диана'])test('Car without mileage and maintenance for '+actor,async({page})=>{
 const errors=[],operations=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/car-fixture',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync('public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')}));
 await page.route('**/api/**',route=>{
  const body=route.request().postDataJSON()||{};operations.push(body.operation);
  return route.fulfill({json:{ok:true,visible:actor==='Рустам',actor,
   state:{mileage:999999,lastServiceAt:'2020-01-01',errors:[],repairArchive:[],notes:[],tyreSeasonInstalled:'winter',uniMileage:{dayKm:42,serviceNumber:5}},
   nextService:{number:5,mileage:55000},ticktick:{tasks:[]},categories:[],personalExpenses:[]}});
 });
 await page.goto('/car-fixture');
 await page.evaluate(actor=>{
  document.body.className='auth-ok';document.body.dataset.rudiActor=actor;document.body.dataset.appTab='car';
  document.getElementById('carPage').hidden=false;
  window.RUDI_WEATHER={get:async()=>{throw Error('fixture-weather-unavailable')}};
 },actor);
 await page.addScriptTag({url:'/car.js'});
 if(actor==='Рустам'){
  await expect(page.locator('#carPage .car-smart-card')).toHaveCount(5);
  await expect(page.locator('#carPage')).not.toContainText(/Пробег|\bТО\b|UNI-V OS/);
  await expect(page.locator('#carTile')).not.toContainText(/Пробег|\bТО\b/);
  await expect(page.locator('#carHomeServiceBadge,[data-car-card="mileage"],#carUniConnect,#carMileageForm,#carLastServiceForm')).toHaveCount(0);
  await expect(page.locator('#carPageAge')).not.toHaveText('—');
  if(await page.locator('[data-car-card="errors"]').evaluate(el=>el.classList.contains('is-collapsed')))await page.locator('[data-car-card="errors"] .car-smart-card-title').click();
  await page.locator('#carErrorAdd').click();await expect(page.locator('#carErrorForm')).toBeVisible();
  await page.locator('[data-car-tyre-season="summer"]').click();
  await expect.poll(()=>operations.includes('set-tyre-season')).toBe(true);
  await page.locator('#carErrorCancel').click();
  expect(await page.locator('#carPage').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#carPage').screenshot({path:'/tmp/rudi-car-without-mileage.png'});
  for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.locator('#carPage').screenshot({path:'/tmp/rudi-car-'+theme+'.png'});}
  await page.evaluate(async()=>{document.body.dataset.appTab='home';await window.RUDI_CAR.refresh();});
  await expect(page.locator('#carTile')).toBeVisible();
  await page.locator('#carTile').screenshot({path:'/tmp/rudi-car-home.png'});
 }else await expect(page.locator('#carTile,#carPage')).toHaveCount(0);
 expect(operations.some(op=>/mileage|service/.test(op||''))).toBe(false);
 expect(errors).toEqual([]);
});
