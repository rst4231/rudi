const {test,expect}=require('@playwright/test');
for(const actor of ['Рустам','Диана'])test('own AI profile reuses partner components and own stars: '+actor,async({page})=>{
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/rudi-design-system.css"><link rel="stylesheet" href="/home-reference-layout.css"><link rel="stylesheet" href="/partner-profile.css"><link rel="stylesheet" href="/personal-center.css"><body data-rudi-actor="${actor}" data-app-tab="home" class="auth-ok"><section id="home${actor==='Диана'?'Diana':'Rustam'}Tile"><div class="profile-person-head"><div class="identity"><div class="score-avatar-wrap"><span id="avatar" class="avatar">Р</span></div><div class="person"><span id="displayName" class="name">${actor}</span><div class="profile-work-status">Отдыхаю</div></div></div></div><div class="profile-energy-strip" data-energy-actor="${actor}"><div class="profile-energy-label">Энергия</div><div class="profile-energy-plot"><svg class="profile-energy-svg" viewBox="0 0 640 40"><path d="M0 20Q320 0 640 20"/></svg></div><div class="profile-energy-times">00:00 · 12:00 · 24:00</div></div><div class="rhythm-advice">Текущий темп: восстановление</div><article class="profile-supplement-intakes"><div class="profile-supplement-intakes-head">Сегодня принято</div><div class="profile-supplement-intakes-list"><div class="profile-supplement-intake-row"><span>💊</span><span class="profile-supplement-intake-copy"><span class="profile-supplement-intake-name">Магний</span><time>12:35</time></span><span>✓</span></div></div></article></section><script>window.RudiStars={balance:()=>125.25,openHistory:()=>{window.historyActor=document.body.dataset.rudiActor;document.body.dataset.appTab='score';window.dispatchEvent(new Event('rudi:app-tab-change'));history.pushState({rudiTab:'score'},'','?tab=score')}};</script><script src="/personal-center.js"></script></body></html>`}));
 await page.route('**/api/personal-center',route=>route.fulfill({json:{ok:true,actor,data:{profile:{height:181,birthDate:'1992-03-03'},weights:[{kg:86}],symptoms:[],checkins:{},version:1},report:null}}));
 await page.goto('/');await page.locator('#displayName').click();
 const center=page.locator('#personalAICenter');await expect(center).toBeVisible();
 await expect(center.locator('#pcStars')).toHaveText('⭐ 125,25');await expect(center.locator('.rudi-center__bar h1')).toHaveText('Моя страница');await expect(center.locator('#pcSettings,#pcPull')).toHaveCount(0);
 await expect(center.locator('#pcSelfProfile .partner-hero')).toContainText(actor);
 await expect(center.locator('#pcSelfProfile .partner-energy-card')).toContainText('Текущий темп: восстановление');
 await expect(center.locator('#pcSelfProfile .partner-today')).toContainText('Магний');
 await expect(center.locator('#pcSelfProfile .partner-today time')).toHaveText('12:35');
 await page.locator('body>section:first-of-type .profile-supplement-intake-row time').evaluate(el=>el.textContent='13:10');
 await expect(center.locator('#pcSelfProfile .partner-today time')).toHaveText('13:10');
 expect(await page.locator('[id]').evaluateAll(nodes=>new Set(nodes.map(n=>n.id)).size===nodes.length)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);const back=await center.locator('#pcBack').boundingBox();
 for(const section of ['symptoms','weight']){
  await center.locator('[data-open="'+section+'"]').click();
  await expect.poll(async()=>Math.round((await center.locator('#pcSheetClose').boundingBox()).x)).toBe(Math.round(back.x));const nested=await center.locator('#pcSheetClose').boundingBox();expect(nested.x).toBeCloseTo(back.x,0);expect(nested.y).toBeCloseTo(back.y,0);expect(nested.width).toBe(back.width);
  await expect(center.locator('#pcSheetClose svg')).toBeVisible();
  await center.locator('#pcSheetClose').click();await expect(center.locator('#pcOverlay')).toBeHidden();
 }
 await expect(center.locator('.rudi-center__tile-icon').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await center.locator('.rudi-center__wrap').evaluate(el=>el.scrollTop=0);await expect(center.locator('#pcBack')).toBeInViewport();await center.screenshot({path:test.info().outputPath('my-page.png')});await center.locator('#pcStars').click();expect(await page.evaluate(()=>window.historyActor)).toBe(actor);await expect(center).toBeHidden();
 await page.evaluate(()=>{history.back()});await expect(center).toBeVisible();
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('rudi:stars-changed')));await expect(center.locator('#pcStars')).toHaveText('⭐ 125,25');
});
