const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);

for(const width of [390,1280,2048])for(const theme of ['dark','light']){
 test(`profile headers and cards stay centered and compact at ${width}px, ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:1100});
  await page.route('**/api/**',route=>route.fulfill({json:{ok:true}}));
  await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(s=>`<link rel="stylesheet" href="${s}">`).join('')}<body data-app-tab="home" class="auth-ok partner-profile-open"><section class="rudi-meditation-page partner-profile-page"><header class="rudi-app-page-head personal-tool-page-head fasting-page-head meditation-head partner-profile-bar">Диана</header><div class="partner-profile-content"><div class="profile-person-card partner-profile-layout"><section class="partner-hero">Диана</section><section class="partner-plans">Ближайшее</section></div></div></section><section class="rudi-center" id="personalAICenter" hidden><header class="rudi-center__bar">Моя страница</header><div class="rudi-center__wrap"><div class="rudi-center__content"><section class="rudi-center__hero">Рустам</section></div></div></section></body></html>`}));
  await page.goto('/');
  for(const selectors of [['.partner-profile-bar','.partner-profile-layout'],['.rudi-center__bar','.rudi-center__content']]){
   if(selectors[0].includes('center'))await page.evaluate(()=>{document.querySelector('.partner-profile-page').hidden=true;document.querySelector('.rudi-center').hidden=false});
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished)));
   const boxes=await Promise.all(selectors.map(s=>page.locator(s).boundingBox()));
   for(const box of boxes){expect(box).not.toBeNull();expect(box.width).toBeLessThanOrEqual(760);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(Math.abs(box.x+box.width/2-width/2)).toBeLessThanOrEqual(2)}
   if(width>=800)expect(Math.abs(boxes[0].width-boxes[1].width)).toBeLessThanOrEqual(2);
  }
 });
}

for(const width of [390,1280,2048])for(const theme of ['dark','light']){
 test(`meditation, game menu and balance widths at ${width}px, ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:1100});
  const balance=html.slice(html.indexOf('<div class="finance-balance-card">'),html.indexOf('<div class="finance-wallet-section">'));
  await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(s=>`<link rel="stylesheet" href="${s}">`).join('')}<body class="auth-ok" data-app-tab="finances"><section id="meditationPage" class="rudi-meditation-page"><header class="rudi-app-page-head personal-tool-page-head fasting-page-head meditation-head">Медитация</header><div class="meditation-scroll"><section class="meditation-guide-panel">Вернись к дыханию</section></div></section><section class="rudi-games-page" hidden><header class="rudi-app-page-head rudi-games-head">Игры и тренажёры</header><div class="rudi-games-content"><section class="rudi-game-hero">Выбирай игру</section></div></section><section class="finance-page" data-finance-tone="personal" style="width:min(900px,100%);margin:0 auto">${balance}</section></body></html>`}));
  await page.goto('/');
  for(const pair of [['#meditationPage>.meditation-head','#meditationPage>.meditation-scroll'],['.rudi-games-head','.rudi-games-content']]){
   if(pair[0].includes('games'))await page.evaluate(()=>{document.querySelector('#meditationPage').hidden=true;document.querySelector('.rudi-games-page').hidden=false});
   const boxes=await Promise.all(pair.map(s=>page.locator(s).boundingBox()));
   for(const b of boxes){expect(b).not.toBeNull();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);if(width>=800){expect(b.width).toBeLessThanOrEqual(620);expect(Math.abs(b.x+b.width/2-width/2)).toBeLessThanOrEqual(2)}}
   if(width>=800)expect(Math.abs(boxes[0].width-boxes[1].width)).toBeLessThanOrEqual(2);
  }
  await page.evaluate(()=>{document.querySelector('.rudi-games-page').hidden=true;document.querySelector('#financeCoinBalanceValue').textContent='21 992,18 $';document.querySelector('#financeExpenseMonthTotal').textContent='1 355,54 $';document.querySelector('#financePlannedMonthTotal').textContent='194,60 $';document.querySelector('#financeCoinIncomeValue').textContent='20,91 $'});
  const card=await page.locator('.finance-balance-card').boundingBox(),panel=await page.locator('.finance-page').boundingBox();
  if(width>=800)expect(card.width).toBeGreaterThanOrEqual(panel.width*.85);
  expect(card.x).toBeGreaterThanOrEqual(0);expect(card.x+card.width).toBeLessThanOrEqual(width);
  if(width===1280&&theme==='dark')await page.screenshot({path:test.info().outputPath('finance-desktop.png')});
 });
}
