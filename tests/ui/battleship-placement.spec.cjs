const {test,expect}=require('@playwright/test');
const {createHandler}=require('../../api/battleship-game.cjs');
test('both players place a 10-ship fleet privately, reload drafts, ready and start a 10x10 game',async({browser})=>{
 const rows=new Map(),contexts=[];
 const cache={get:async k=>structuredClone(rows.get(k)||null),set:async(k,v)=>rows.set(k,structuredClone(v)),
  delete:async k=>rows.delete(k),setIfAbsent:async(k,v)=>{if(rows.has(k))return false;rows.set(k,v);return true}};
 const handler=createHandler({cache,authorizeRequest:req=>({actor:req.actor}),sendPushImpl:async()=>({sent:true}),waitUntilImpl:()=>{}});
 async function player(actor){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);
  const page=await context.newPage();
  await page.route('**/api/battleship-game',async route=>{
   const res={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
   await handler({method:'POST',actor,body:route.request().postDataJSON()},res);
   await route.fulfill({status:res.code,json:res.body});
  });
  await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
  await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="${actor}"><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>`}));
  const open=async()=>{await page.goto('/');await page.evaluate(()=>{RudiGames.open();RudiGameExtras.openGame('battleship')})};
  await open();return {page,open};
 }
 try{
  const {page:a,open:reloadA}=await player('Рустам');
  await a.locator('[data-battle-action="start"]').click();
  await expect(a.locator('[data-battle-place]')).toHaveCount(100);
  await expect(a.locator('[data-battle-action="ready"]')).toBeDisabled();
  await a.locator('[data-battle-place="0"]').click();
  await expect(a.locator('.rudi-battle-placement .rudi-battle-vessel')).toHaveCount(1);
  await a.locator('[data-battle-place="10"]').click();
  await expect(a.locator('.rudi-battle-placement .rudi-battle-vessel')).toHaveCount(1);
  await expect(a.locator('.rudi-battle-placement-message')).toContainText('соприкасаться');
  await a.locator('[data-battle-setup="rotate"]').click();
  await a.locator('[data-battle-place="6"]').click();
  await expect(a.locator('.rudi-battle-placement .is-vertical')).toHaveCount(1);
  await reloadA();
  await expect(a.locator('.rudi-battle-placement .rudi-battle-vessel')).toHaveCount(2);
  await a.locator('[data-battle-place="0"]').click();
  await expect(a.locator('.rudi-battle-placement .rudi-battle-vessel')).toHaveCount(1);
  await a.locator('[data-battle-setup="random"]').click();
  await expect(a.locator('.rudi-battle-placement .rudi-battle-vessel')).toHaveCount(10);
  await expect(a.locator('[data-battle-action="ready"]')).toBeEnabled();
  await a.screenshot({path:test.info().outputPath('manual-fleet.png'),fullPage:true});
  await a.locator('[data-battle-action="ready"]').click();
  await expect(a.locator('.rudi-battle-placement-message')).toContainText('Ждём');
  const {page:b}=await player('Диана');
  await expect(b.locator('.rudi-battle-placement .rudi-battle-vessel')).toHaveCount(0);
  await b.locator('[data-battle-setup="random"]').click();
  await b.locator('[data-battle-action="ready"]').click();
  await expect(b.locator('.rudi-battle-enemy [data-battle-cell]')).toHaveCount(100);
  await expect(a.locator('.rudi-battle-enemy [data-battle-cell]')).toHaveCount(100,{timeout:2000});
  await expect(a.locator('[data-battle-cell="99"]')).toBeEnabled();
  await expect(a.locator('.rudi-battle-enemy .rudi-battle-vessel')).toHaveCount(0);
  await expect(a.locator('.rudi-battle-own .rudi-battle-vessel')).toHaveCount(10);
  expect(await b.locator('#rudiGamesPage').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  const targets=[...rows.get('pair').ships['Диана']];
  for(const cell of targets){await a.locator(`[data-battle-cell="${cell}"]`).click();await expect(a.locator(`[data-battle-cell="${cell}"]`)).toBeDisabled()}
  await expect(b.locator('.rudi-battle-own .rudi-battle-vessel-fire')).toHaveCount(10,{timeout:2000});
  await expect(a.locator('.rudi-battle-feedback')).toContainText('Победа');
  await expect(b.locator('[data-battle-action="remind"]')).toHaveCount(0);
 }finally{await Promise.all(contexts.map(c=>c.close()))}
});
