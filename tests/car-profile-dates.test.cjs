const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const store=require('../api/car-store.cjs');
test('purchase and insurance dates persist through save/read and older client saves',async()=>{
 let saved={updatedAt:'2026-01-01T00:00:00Z'};const options={now:'2026-11-07T12:00:00Z',db:{read:async()=>saved,write:async v=>(saved=v)},cache:{get:async()=>null,set:async()=>{}}};
 const profile={...store.DEFAULT_CAR_PROFILE,purchaseDate:'2025-03-10',osagoUntil:'2027-02-12'};
 await store.setCarProfile(profile,options);assert.equal(saved.profile.purchaseDate,'2025-03-10');assert.equal(saved.profile.osagoUntil,'2027-02-12');
 delete profile.purchaseDate;await store.setCarProfile(profile,options);assert.equal(saved.profile.purchaseDate,'2025-03-10');
 assert.equal(store.normalizeCarProfile({releaseDate:'2023-09-07'}).releaseDate,'2023-09-08');
 await assert.rejects(store.setCarProfile({...profile,purchaseDate:'2028-01-01'},options),/car-profile-invalid/);
});
test('opening settings synchronizes visible dates, shows ownership and hides redundant year',()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'https://rudi.test',runScripts:'outside-only'}),w=dom.window;
 const profile={...store.DEFAULT_CAR_PROFILE,purchaseDate:'2025-03-10',osagoUntil:'2027-02-12'};
 w.state={car:{state:{profile}}};w.clientMoscowDateKey=()=> '2026-11-07';w.daysFromToday=()=>30;
 w.syncRudiTemporalControl=input=>{if(input.type==='date'){let span=input.parentNode.querySelector('span');if(!span){span=w.document.createElement('span');input.after(span)}span.textContent=input.value}};
 const dialog=w.document.getElementById('carSettingsDialog');dialog.showModal=()=>{};
 const src=fs.readFileSync('public/car.js','utf8');w.eval(src.slice(src.indexOf('  const CAR_PURCHASE_DATE='),src.indexOf('  function tyreForecastAdvice'))+'\nsetupCarSettings();renderCarAge();');
 w.document.getElementById('carSettingsOpen').click();
 for(const name of ['releaseDate','purchaseDate','osagoUntil'])assert.equal(w.document.querySelector(`[name=${name}]`).parentNode.querySelector('span').textContent,profile[name]);
 assert.match(w.document.getElementById('carPageAge').textContent,/🎂/);assert.match(w.document.querySelector('#carPageAge + .car-ownership').textContent,/🔑 Владею/);assert.equal(w.document.querySelector('#carPage .car-status-model').hidden,true);dom.window.close();
});
