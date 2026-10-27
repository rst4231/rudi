'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../public');
(async()=>{
 const browser=await chromium.launch({executablePath:path.resolve(__dirname,'../../tools/chrome-headless-shell-linux64/chrome-headless-shell'),args:['--no-sandbox']});
 for(const actor of ['Рустам','Диана']){
  const page=await browser.newPage({viewport:{width:393,height:852}}),errors=[],operations=[];page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='rudi.test')return route.abort();
   if(url.pathname.startsWith('/api/')){
    const body=route.request().postDataJSON()||{};operations.push(body.operation);
    const data={ok:true,visible:actor==='Рустам',actor,state:{mileage:52001,errors:[],repairArchive:[],notes:[],tyreSeasonInstalled:'summer'},nextService:{number:5,mileage:55000},ticktick:{tasks:[]},carDevice:{paired:false},lastLocation:null};
    if(body.operation==='create-device-pairing')data.pairing={code:'012345',expiresAt:new Date(Date.now()+600000).toISOString()};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   const file=path.join(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
   if(!file.startsWith(root)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream';
   const body=file.endsWith('index.html')?fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):fs.readFileSync(file);
   return route.fulfill({contentType:type,body});
  });
  await page.goto('http://rudi.test/');
  await page.evaluate(actor=>{document.body.classList.remove('auth-pending','auth-denied','auth-login');document.body.classList.add('auth-ok');document.body.dataset.rudiActor=actor;document.body.dataset.appTab='car';document.getElementById('carPage').hidden=false;window.RUDI_WEATHER={get:async()=>{throw Error('synthetic unavailable weather')}};},actor);
  await page.addScriptTag({path:path.join(root,'car.js')});
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#carDeviceCard,#carLocationTime,#carDevicePair').count(),0);
  assert.equal(operations.some(op=>['get-location','create-device-pairing','revoke-car-device'].includes(op)),false);
  if(actor==='Рустам'){
   assert.ok(await page.locator('#carPage .car-smart-card').count()>0,'regular Car cards retained');
   await page.evaluate(async()=>{document.body.dataset.appTab='home';await window.RUDI_CAR.refresh();});
   assert.equal(await page.locator('#carTile').isVisible(),true,'main car card visible on Home');
   assert.match((await page.locator('#carHomeMileageValue').textContent()).replace(/\s/g,''),/52001/,'home mileage retained');
   assert.equal(await page.locator('#carHomeServiceValue').isVisible(),true);
   assert.equal(await page.locator('#carHomeWashValue').isVisible(),true);
  }
  assert.deepEqual(errors,[]);await page.close();console.log('PASS integrated Car cards without device connection',actor);
 }
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
