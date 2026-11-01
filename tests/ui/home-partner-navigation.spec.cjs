const {test,expect}=require('@playwright/test'),fs=require('node:fs');
const source=fs.readFileSync('public/app.js','utf8');
const extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const binding=extract('      function bindHomePartnerProfile(', '      function ensureSmartSavesAlwaysExpanded(')+extract('      function setupPersistentCollapsibles(', '      const fallback =');
for(const actor of ['Диана','Рустам'])for(const target of ['#partnerHeaderName','.partner-header-avatar'])test('Home opens '+actor+' profile from '+target,async({page})=>{
 const viewer=actor==='Диана'?'Рустам':'Диана',id=actor==='Диана'?'homeDianaTile':'homeRustamTile';
 await page.route('**/navigation-fixture',route=>route.fulfill({contentType:'text/html',body:`<html><head><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/partner-profile.css"><link rel="stylesheet" href="/home-reference-layout.css"></head><body data-app-tab="home" data-rudi-actor="${viewer}"><section id="${id}" class="profile-person-card" data-app-tab-section="home"><div class="profile-person-head"><div class="identity"><div class="score-avatar-wrap"><span class="avatar partner-header-avatar">Фото</span></div><div class="person"><h2 id="partnerHeaderName">${actor}</h2><div class="profile-work-status">Отдыхаю</div></div></div></div><div class="profile-energy-strip">Энергия</div><div class="profile-person-details"><div class="rhythm-advice">Подсказка</div><div class="partner-today"><h2>БАДы</h2></div></div></section></body></html>`}));
 await page.route('**/api/**',route=>route.fulfill({json:{ok:true,actor:viewer,partner:actor,metrics:{},emotions:{daily:[]}}}));
 await page.goto('/navigation-fixture');await page.addScriptTag({url:'/partner-profile.js'});
 await page.evaluate(({binding,viewer})=>{
  window.starClicks=0;document.querySelector('.partner-header-avatar').addEventListener('click',()=>window.starClicks++);
  new Function(`const currentActor=${JSON.stringify(viewer)},tg=null,currentScoreState=null,homeDashboardState={};const ensureSmartSavesAlwaysExpanded=()=>{},wrapCollapseBody=()=>null,loadHomePartnerLastExpense=async()=>{},openScoreModal=()=>{},openWishlistUrl=()=>{},loadPartnerProfilePlans=async()=>({}),wishlistRequest=async()=>({items:[]}),scoreRequest=async()=>({}),renderScoreStickers=()=>{};`+binding+';setupPersistentCollapsibles();setupPersistentCollapsibles();')();
 },{binding,viewer});
 await expect(page.locator('#'+id+' .block-collapse-button')).toHaveCount(0);
 await page.locator(target).click();const profile=page.locator('.partner-profile-page');await expect(profile).toBeVisible();await expect(profile.locator('h1')).toHaveText(actor);expect(await page.evaluate(()=>starClicks)).toBe(0);
 await page.evaluate(()=>RudiPartnerProfile.close(true));await expect(profile).toHaveCount(0);
 await page.locator(target).press('Enter');await expect(page.locator('.partner-profile-page h1')).toHaveText(actor);
});
