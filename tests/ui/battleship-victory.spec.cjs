const {test,expect}=require('@playwright/test');
for(const actor of ['Рустам','Диана'])for(const winner of ['Рустам','Диана'])test('battle victory is only celebrated for winner: '+actor+'/'+winner,async({page})=>{
 let won=false;
 await page.route('**/api/battleship-game',async route=>{if(route.request().postDataJSON().operation==='move')won=true;await route.fulfill({json:{ok:true,room:{status:won?'won':'playing',winner:won?winner:'',turn:actor,round:3,version:won?2:1,ownShips:[0],ownShots:[],enemyShots:[],sunkShips:[]}}})});
 await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/rudi-games.css"><link rel="stylesheet" href="/rudi-effects.css"><body data-rudi-actor="${actor}"><script src="/rudi-effects.js"></script><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script>`}));
 await page.goto('/');await page.evaluate(()=>{RudiGames.open();RudiGameExtras.openGame('battleship')});await page.locator('[data-battle-cell="0"]').click();
 const victory=page.locator('#rudiBattleVictory');
 if(actor===winner){await expect(victory).toBeVisible();await expect(victory).toContainText(winner+(winner==='Диана'?' победила!':' победил!'));await expect(victory.locator('.rudi-particle')).toHaveCount(9);await expect(victory).toBeHidden({timeout:6500});await page.evaluate(()=>{RudiGameExtras.openGame('battleship')});await page.waitForTimeout(150);await expect(victory).toHaveCount(0)}
 else await expect(victory).toHaveCount(0);
});
