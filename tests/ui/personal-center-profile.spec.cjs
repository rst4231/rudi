const {test,expect}=require('@playwright/test');
for(const theme of ['light','dark'])test('AI center profile, gifts and name navigation: '+theme,async({page})=>{
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/rudi-design-system.css"><link rel="stylesheet" href="/personal-center.css"><body data-rudi-actor="Рустам" data-app-tab="home" class="auth-ok"><div id="avatar">Р</div><div id="displayName">Рустам</div><script>window.collapsed=0;document.querySelector('#displayName').addEventListener('click',()=>window.collapsed++);let wishes=[{id:'1',owner:'Рустам',text:'Поездка',url:'https://example.com/gift',done:false},{owner:'Диана',text:'Чужое'}];window.RudiWishlist={list:async()=>wishes,add:async(text,url)=>{window.added={text,url};return wishes=[...wishes,{owner:'Рустам',text,url}]},open:url=>window.opened=url};</script><script src="/personal-center.js"></script></body></html>`}));
 await page.route('**/api/personal-center',async route=>{
  const body=route.request().postDataJSON();
  await route.fulfill({json:body.operation==='status'?{ok:true,actor:'Рустам',unread:false}:{ok:true,actor:'Рустам',data:{profile:{height:181,birthDate:'1992-03-03'},weights:[{kg:86}],symptoms:[],checkins:{},version:1},report:null}});
 });
 await page.goto('/');await page.locator('#displayName').click();
 const center=page.locator('#personalAICenter');await expect(center).toBeVisible();
 expect(await page.evaluate(()=>window.collapsed)).toBe(0);
 await expect(center.locator('#pcPerson')).toHaveText('Рустам');
 await expect(center.locator('#pcHeroMeta')).toContainText('Вес 86 кг');
 await expect(center.locator('.pc-wish')).toHaveCount(1);
 await expect(center.locator('#pcWishList')).not.toContainText('Чужое');
 await center.locator('#pcWishText').fill('Книга');await center.locator('#pcWishLinkToggle').click();
 await center.locator('#pcWishUrl').fill('https://example.com/book');await center.locator('#pcWishForm [type=submit]').click();
 await expect(center.locator('.pc-wish')).toHaveCount(2);
 expect(await page.evaluate(()=>window.added)).toEqual({text:'Книга',url:'https://example.com/book'});
 await expect(center.locator('#pcWishText')).toHaveValue('');await expect(center.locator('#pcWishUrl')).toBeHidden();
 await center.locator('.pc-wish a').last().click();expect(await page.evaluate(()=>window.opened)).toBe('https://example.com/book');
 expect(await center.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await center.locator('.rudi-center__wrap').evaluate(el=>el.scrollTop=0);
 await center.screenshot({path:test.info().outputPath('ai-center-'+theme+'.png')});
 await center.locator('#pcBack').click();await expect(center).toBeHidden();
 await page.locator('#displayName').focus();await page.keyboard.press('Enter');await expect(center).toBeVisible();
 expect(await page.evaluate(()=>window.collapsed)).toBe(0);
});
