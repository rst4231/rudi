const {test,expect}=require('@playwright/test');
for(const committed of [true,false])test(`stalled shot unlocks and reconciles server state, committed=${committed}`,async({page})=>{
 let moves=0,release;
 let room={size:10,status:'playing',round:1,version:1,turn:'Рустам',ownShips:[0],ownShots:[],enemyShots:[],sunkShips:[]};
 await page.route('**/api/battleship-game',async route=>{
  const body=route.request().postDataJSON();
  if(body.operation==='move'){
   moves++;
   if(moves>1||committed)room={...room,version:room.version+1,ownShots:[...room.ownShots,{cell:body.index,hit:true}]};
   if(moves===1){const old=structuredClone(room);await new Promise(resolve=>release=resolve);await route.fulfill({json:{ok:true,room:old}}).catch(()=>{});return;}
  }
  await route.fulfill({json:{ok:true,room,presence:{Рустам:true,Диана:true}}});
 });
 await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="Рустам"><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>'}));
 await page.goto('/');await page.evaluate(()=>{RudiGames.open();RudiGameExtras.openGame('battleship')});
 const cell=page.locator('[data-battle-cell="0"]'),grid=page.locator('.rudi-battle-enemy .rudi-battle-grid');
 await expect(cell).toBeEnabled();await page.clock.install();await cell.click();await expect.poll(()=>moves).toBe(1);
 await expect(grid).toHaveAttribute('aria-busy','true');await page.clock.fastForward(8100);
 await expect(grid).toHaveAttribute('aria-busy','false');
 if(committed){await expect(cell).toHaveClass(/is-hit/);await expect(cell).toBeDisabled();}else await expect(cell).toBeEnabled();
 expect(moves).toBe(1); // Recovery reads state, never repeats an uncertain shot.
 await page.locator(`[data-battle-cell="${committed?1:0}"]`).click();await expect.poll(()=>moves).toBe(2);
 await expect(page.locator('.rudi-battle-enemy .is-hit')).toHaveCount(committed?2:1);
 release();await page.clock.fastForward(100);
 await expect(page.locator('.rudi-battle-enemy .is-hit')).toHaveCount(committed?2:1);
});
