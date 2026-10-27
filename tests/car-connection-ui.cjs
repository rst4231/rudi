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
  await page.addScriptTag({path:path.join(root,'car-location-view.js')});
  await page.waitForTimeout(150);
  if(actor==='Рустам'){
   assert.equal(await page.locator('#carDeviceCard').count(),1,'existing Car card rebuild must preserve connection card');
   if(!await page.locator('#carDeviceCard').isVisible())console.log(await page.locator('#carDeviceCard').evaluate(n=>{var a=[];for(var x=n;x;x=x.parentElement)a.push([x.id,x.className,x.hidden,getComputedStyle(x).display]);return a}));await page.locator('#carDeviceCard').scrollIntoViewIfNeeded();assert.equal(await page.locator('#carDeviceCard').isVisible(),true);
   await page.click('#carDevicePair');await page.waitForFunction(()=>document.getElementById('carDeviceCode').textContent==='012345');
   assert.ok(operations.includes('get-location'));assert.ok(operations.includes('create-device-pairing'));
   await page.screenshot({path:path.resolve(__dirname,'../../output/rudi-car-connection-mobile.png')});
  }else{assert.equal(await page.locator('#carDeviceCard').isVisible(),false);assert.equal(operations.includes('get-location'),false);assert.equal(operations.includes('create-device-pairing'),false);}
  assert.deepEqual(errors,[]);await page.close();console.log('PASS integrated Car cards and connection',actor);
 }
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
