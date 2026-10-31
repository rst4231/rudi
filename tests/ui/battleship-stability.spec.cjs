const {test,expect}=require('@playwright/test');
test('poll during a press preserves cells, ship nodes and tap; remaining fleet decreases only on sinking',async({page})=>{
 let reads=0,moves=0,presence=true;
 let room={size:10,status:'playing',round:1,version:1,turn:'Рустам',ownShips:[0,1,2,3,20,21,22,40,41,42,6,7,26,27,46,47,60,63,66,69],ownShots:[{cell:20,hit:true},{cell:21,hit:true}],enemyShots:[],sunkShips:[]};
 await page.route('**/api/battleship-game',async route=>{
  const body=route.request().postDataJSON();
  if(body.operation==='get')reads++;
  if(body.operation==='move'){moves++;room={...room,version:room.version+1,ownShots:[...room.ownShots,{cell:body.index,hit:true}],sunkShips:[[20,21,22]]}}
  await route.fulfill({json:{ok:true,room,presence:{Рустам:true,Диана:presence}}});
 });
 await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="Рустам"><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>'}));
 await page.goto('/');await page.evaluate(()=>{RudiGames.open();RudiGameExtras.openGame('battleship')});
 await expect(page.locator('[data-battle-cell="22"]')).toBeEnabled();
 await expect(page.locator('.rudi-battle-fleet-remaining')).toContainText('10');
 await expect(page.locator('[data-fleet-length="3"]')).toContainText('2');
 await page.evaluate(()=>{window.__cell=document.querySelector('[data-battle-cell="22"]');window.__ship=document.querySelector('.rudi-battle-own .rudi-battle-vessel')});
 await page.clock.install();presence=false;
 const box=await page.locator('[data-battle-cell="22"]').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 await page.clock.fastForward(16000);await expect.poll(()=>reads).toBeGreaterThan(1);
 expect(await page.evaluate(()=>window.__cell===document.querySelector('[data-battle-cell="22"]'))).toBe(true);
 await page.mouse.up();await expect.poll(()=>moves).toBe(1);
 await expect(page.locator('.rudi-battle-fleet-remaining')).toContainText('9');
 await expect(page.locator('[data-fleet-length="3"]')).toContainText('1');
 expect(await page.evaluate(()=>window.__ship===document.querySelector('.rudi-battle-own .rudi-battle-vessel'))).toBe(true);
 await page.evaluate(()=>window.__flame=document.querySelector('.rudi-battle-vessel-fire'));
 await page.locator('[data-battle-sound]').click();
 expect(await page.evaluate(()=>window.__flame===document.querySelector('.rudi-battle-vessel-fire'))).toBe(true);
 const before=await page.locator('.rudi-battle-own .rudi-battle-grid').boundingBox();
 room={...room,version:room.version+1,enemyShots:Array.from({length:10},(_,i)=>({cell:80+i,hit:false}))};
 await page.clock.fastForward(3000);await expect(page.locator('.rudi-battle-own .is-miss')).toHaveCount(10);
 const after=await page.locator('.rudi-battle-own .rudi-battle-grid').boundingBox();
 expect(Math.abs(after.width-after.height)).toBeLessThan(1);expect(Math.abs(before.y-after.y)).toBeLessThan(1);
 const markers=await page.locator('.rudi-battle-own .rudi-battle-splash').evaluateAll(elements=>elements.map(e=>({marker:e.getBoundingClientRect().height,cell:e.parentElement.getBoundingClientRect().height})));
 expect(markers.every(x=>x.marker<=x.cell+1)).toBe(true);
 await page.screenshot({path:test.info().outputPath('stable-fleet-counter.png'),fullPage:true});
});
