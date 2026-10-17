const {test,expect}=require('@playwright/test');
const room={status:'playing',turn:'Рустам',round:2,version:1,ownShips:[0,1,2,14,15,28,29],ownShots:[{cell:7,hit:false},{cell:21,hit:true},{cell:22,hit:true}],enemyShots:[{cell:0,hit:true}],sunkShips:[]};
async function openBattle(page,actor='Рустам'){
 let current=structuredClone(room);current.turn=actor;
 await page.route('**/api/battleship-game',async route=>{
  const input=route.request().postDataJSON();
  if(input.operation==='move'){
   current.ownShots.push({cell:input.index,hit:input.index===23});current.version++;
   if(input.index===23)current.sunkShips=[[21,22,23]];
   else current.turn=actor==='Рустам'?'Диана':'Рустам';
  }
  await route.fulfill({json:{ok:true,room:current,presence:{Рустам:true,Диана:false}}});
 });
 await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/rudi-design-system.css"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="${actor}" style="margin:0;font-family:system-ui"><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>`}));
 await page.goto('/');await page.evaluate(()=>{window.RudiGames.open();window.RudiGameExtras.openGame('battleship')});
 await expect(page.locator('[data-battle-cell="23"]')).toBeEnabled();
}
test('Russian ocean layout keeps enemy ships secret and renders a compact own fleet',async({page},testInfo)=>{
 await openBattle(page);
 await expect(page.locator('.rudi-battle-turn-chip.is-current-turn')).toHaveText('Твой ход');
 await expect(page.locator('.rudi-battle-own h2')).toHaveText('Мои корабли');
 await expect(page.locator('.rudi-battle-enemy .rudi-battle-vessel')).toHaveCount(0);
 const enemy=await page.locator('.rudi-battle-enemy .rudi-battle-grid').boundingBox();
 const own=await page.locator('.rudi-battle-own .rudi-battle-grid').boundingBox();
 expect(own.width).toBeLessThan(enemy.width*.55);
 await page.locator('[data-battle-cell="23"]').click();
 await expect(page.locator('.rudi-battle-feedback')).toHaveText('Корабль потоплен! Стреляй ещё.');
 await expect(page.locator('.rudi-battle-enemy .rudi-battle-vessel')).toHaveCount(1);
 await page.screenshot({path:testInfo.outputPath('battle.png'),fullPage:true});
 await expect(page.locator('[data-battle-action="end"]')).toBeInViewport();
 await expect(page.locator('[data-battle-cell="23"]')).toBeDisabled();
 await expect(page.locator('.rudi-battle-turn-chip.is-current-turn')).toHaveText('Твой ход');
 await page.locator('[data-battle-sound]').click();
 await expect(page.locator('[data-battle-sound]')).toHaveAttribute('aria-label','Включить звуки');
 await page.locator('[data-battle-cell="24"]').click();
 await expect(page.locator('.rudi-battle-feedback')).toHaveText('Мимо. Ход переходит сопернику.');
 await expect(page.locator('[data-battle-cell="25"]')).toBeDisabled();
 await page.locator('#rudiGamesBack').click();
 await expect(page.locator('.rudi-game-hero')).toBeVisible();
 await expect(page.locator('#rudiGamesPage')).not.toHaveClass(/is-battleship/);
});
test('Diana sees her own turn and both grids fit a narrow screen',async({page})=>{
 await page.setViewportSize({width:320,height:690});await openBattle(page,'Диана');
 await expect(page.locator('.rudi-battle-player.is-current-turn b')).toHaveText('Диана');
 expect(await page.locator('#rudiGamesPage').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await expect(page.locator('.rudi-battle-player .rudi-battle-avatar')).toHaveCount(2);
});
