const {test,expect}=require('@playwright/test');
async function fixture(page){
 let room={size:7,status:'playing',round:2,version:1,turn:'Рустам',ownShips:[0,1,2],ownShots:[{cell:14,hit:true},{cell:15,hit:true}],enemyShots:[{cell:0,hit:true},{cell:1,hit:true},{cell:2,hit:true}],sunkShips:[[14,15]]};
 let releaseMove;
 await page.route('**/api/battleship-game',async route=>{
  const body=route.request().postDataJSON();
  if(body.operation==='move'){
   await new Promise(resolve=>{releaseMove=resolve});
   room={...room,version:2,turn:'Диана',ownShots:[...room.ownShots,{cell:body.index,hit:false}]};
  }
  await route.fulfill({json:{ok:true,room,presence:{Рустам:true,Диана:true}}}).catch(()=>{});
 });
 await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="Рустам"><main id="home">Главная</main><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>'}));
 await page.goto('/');await page.evaluate(()=>{RudiGames.open();RudiGameExtras.openGame('battleship')});
 await expect(page.locator('.rudi-battle-vessel-fire')).toHaveCount(2);
 return {release:()=>releaseMove?.(),pending:()=>!!releaseMove};
}
async function visibility(page,hidden){
 await page.evaluate(hidden=>{Object.defineProperty(document,'hidden',{configurable:true,value:hidden});document.dispatchEvent(new Event('visibilitychange'))},hidden);
}
test('closing a burning battle removes animated DOM before showing home and reopening restores the same round',async({page})=>{
 await fixture(page);
 await page.evaluate(()=>RudiGames.close());
 await expect(page.locator('#rudiGamesPage')).toBeHidden();
 await expect(page.locator('.rudi-battle-vessel')).toHaveCount(0);
 await expect(page.locator('.rudi-battle-vessel-fire')).toHaveCount(0);
 await expect(page.locator('#home')).toBeVisible();
 await page.evaluate(()=>{RudiGames.open();RudiGameExtras.openGame('battleship')});
 await expect(page.locator('.rudi-battle-vessel-fire')).toHaveCount(2);
 await expect(page.locator('.rudi-battle-footer')).toContainText('Раунд 2');
 await page.locator('#rudiGamesBack').click();
 await expect(page.locator('.rudi-game-hero')).toBeVisible();await expect(page.locator('.rudi-battle-vessel')).toHaveCount(0);
});
test('backgrounding removes layers and a late move cannot remount them; returning restores even unchanged state',async({page})=>{
 const f=await fixture(page);
 await visibility(page,true);await expect(page.locator('.rudi-battle-vessel')).toHaveCount(0);
 await visibility(page,false);await expect(page.locator('.rudi-battle-vessel-fire')).toHaveCount(2);
 await page.locator('[data-battle-cell="20"]').click();await expect.poll(f.pending).toBe(true);
 await visibility(page,true);f.release();
 await expect(page.locator('.rudi-battle-work')).toHaveCount(0);
 await visibility(page,false);
 await expect(page.locator('.rudi-battle-vessel-fire')).toHaveCount(2);
 await expect(page.locator('[data-battle-cell="20"]')).toBeDisabled();
});

test('burning uses one animation per enemy vessel and none on the miniature field',async({page})=>{
 await fixture(page);
 const enemy=page.locator('.rudi-battle-enemy .rudi-battle-vessel-fire');
 const own=page.locator('.rudi-battle-own .rudi-battle-vessel-fire');
 expect(await enemy.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(1);
 expect(await own.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 await expect(enemy.locator('.rudi-battle-blaze')).toHaveCount(4);
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await enemy.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
});
