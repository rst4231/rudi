const {test,expect}=require('@playwright/test');
const {initial,nextMove,publicRoom}=require('../../api/battleship-game.cjs');
const {createHandler,ROOM}=require('../../api/battleship-game.cjs');
const fleet=()=>[0,1,2,14,21,35,36];
// Explicit in-progress legacy room also verifies compatibility after the upgrade.
const legacyRoom=()=>({...initial(),size:7,status:'playing',round:1,version:1,turn:'Рустам',lastStarter:'Рустам',ships:{Рустам:fleet(),Диана:fleet()}});
for(const outdatedError of [false,true])test('pending reminder keeps sync live and stale action reply cannot roll back the field: '+outdatedError,async({page})=>{
 let room=legacyRoom();room.turn='Диана';
 let releaseReminder,releaseMove;
 await page.route('**/api/battleship-game',async route=>{
  const body=route.request().postDataJSON();
  if(body.operation==='remind'){
   await new Promise(resolve=>{releaseReminder=resolve});
   return route.fulfill({json:{ok:true,reminded:true,room:publicRoom(room,'Рустам')}});
  }
  if(body.operation==='move'){
   room=nextMove(room,'Рустам','move',body.index).room;
   const old=publicRoom(room,'Рустам');
   await new Promise(resolve=>{releaseMove=resolve});
   return route.fulfill({status:outdatedError?409:200,json:{ok:!outdatedError,room:old}});
  }
  await route.fulfill({json:{ok:true,room:publicRoom(room,'Рустам'),presence:{Рустам:true,Диана:true}}});
 });
 await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="Рустам"><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>'}));
 await page.goto('/');await page.evaluate(()=>{RudiGames.open();RudiGameExtras.openGame('battleship')});
 await page.locator('[data-battle-action="remind"]').click();await expect.poll(()=>!!releaseReminder).toBe(true);
 room=nextMove(room,'Диана','move',4).room;
 await expect(page.locator('[data-battle-cell="3"]')).toBeEnabled({timeout:1800});
 await page.locator('[data-battle-cell="3"]').click();await expect.poll(()=>!!releaseMove).toBe(true);
 room=nextMove(room,'Диана','move',5).room;releaseReminder();
 await expect(page.locator('.rudi-battle-own .is-miss')).toHaveCount(2);
 releaseMove();
 await expect(page.locator('[data-battle-cell="0"]')).toBeEnabled();
 await expect(page.locator('.rudi-battle-own .is-miss')).toHaveCount(2);
 await expect(page.locator('.rudi-battle-feedback')).not.toContainText('Поле изменилось');
});
test('two players see shots, full horizontal and vertical fires, and turns promptly',async({browser})=>{
 let room=legacyRoom();
 const contexts=[];
 async function player(actor){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context);
  await context.addInitScript(()=>{window.__battleImpacts=[];window.Telegram={WebApp:{initData:'',HapticFeedback:{impactOccurred:type=>window.__battleImpacts.push(type)}}}});
  const page=await context.newPage();
  await page.route('**/api/battleship-game',async route=>{
   const body=route.request().postDataJSON();
   if(['move','start','end'].includes(body.operation)){
    const result=nextMove(room,actor,body.operation,body.index);
    if(!result.ok)return route.fulfill({status:409,json:result});
    room=result.room;
   }
   await route.fulfill({json:{ok:true,room:publicRoom(room,actor),presence:{Рустам:true,Диана:true}}});
  });
  await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
  await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="${actor}"><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>`}));
  await page.goto('/');await page.evaluate(()=>{window.RudiGames.open();window.RudiGameExtras.openGame('battleship')});
  await expect(page.locator('.rudi-battle-grid')).toHaveCount(2);
  return page;
 }
 try{
  const a=await player('Рустам'),b=await player('Диана');
  await a.locator('[data-battle-cell="0"]').click();
  await expect(b.locator('.rudi-battle-own .is-hit')).toHaveCount(1,{timeout:1800});
  await expect.poll(()=>b.evaluate(()=>window.__battleImpacts.length)).toBe(1);
  expect(await a.evaluate(()=>window.__battleImpacts.length)).toBe(0);
  await expect(b.locator('.rudi-battle-vessel-fire')).toHaveCount(0);
  for(const cell of [1,2,14,21])await a.locator(`[data-battle-cell="${cell}"]`).click();
  await expect(a.locator('.rudi-battle-enemy .is-sunk .rudi-battle-vessel-fire')).toHaveCount(2);
  await expect(b.locator('.rudi-battle-own .is-sunk .rudi-battle-vessel-fire')).toHaveCount(2,{timeout:1800});
  await expect(b.locator('.rudi-battle-own .is-sunk.is-vertical .rudi-battle-vessel-fire')).toHaveCount(1);
  const fire=a.locator('.rudi-battle-enemy .rudi-battle-vessel-fire').first();
  expect(await fire.evaluate(el=>el.getAnimations({subtree:true}).some(a=>a.playState==='running'))).toBe(true);
  await a.screenshot({path:test.info().outputPath('burning-ships.png'),fullPage:true});
  await a.locator('[data-battle-cell="3"]').click();
  await expect(b.locator('[data-battle-cell="0"]')).toBeEnabled({timeout:1800});
  await b.locator('[data-battle-cell="4"]').click();
  await expect(a.locator('[data-battle-cell="5"]')).toBeEnabled({timeout:1800});
  for(const cell of [35,36])await a.locator(`[data-battle-cell="${cell}"]`).click();
  await expect(b.locator('.rudi-battle-own .is-sunk .rudi-battle-vessel-fire')).toHaveCount(3,{timeout:1800});
  await expect(b.locator('.rudi-battle-feedback')).toContainText('Победил');
  await a.locator('#rudiGamesBack').click();
  await expect(a.locator('.rudi-game-hero')).toBeVisible();
 }finally{await Promise.all(contexts.map(c=>c.close()))}
});

test('a slow refresh cannot swallow a shot or replace the confirmed new field',async({page})=>{
 let room=legacyRoom();
 let reads=0,release;
 await page.route('**/api/battleship-game',async route=>{
  const body=route.request().postDataJSON();
  const snapshot=publicRoom(room,'Рустам');
  if(body.operation==='get'&&++reads===2){
   await new Promise(resolve=>{release=resolve});
   await route.fulfill({json:{ok:true,room:snapshot}}).catch(()=>{});return;
  }
  if(body.operation==='move')room=nextMove(room,'Рустам','move',body.index).room;
  await route.fulfill({json:{ok:true,room:publicRoom(room,'Рустам'),presence:{Рустам:true,Диана:true}}});
 });
 await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="Рустам"><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>'}));
 await page.goto('/');await page.evaluate(()=>{window.RudiGames.open();window.RudiGameExtras.openGame('battleship')});
 await expect.poll(()=>!!release).toBe(true);
 await page.locator('[data-battle-cell="0"]').click();
 await expect(page.locator('[data-battle-cell="0"]')).toHaveClass(/is-hit/);
 release();
 await expect(page.locator('[data-battle-cell="0"]')).toBeDisabled();
 await expect(page.locator('.rudi-battle-feedback')).toContainText('Попадание');
 await page.locator('#rudiGamesBack').click();
 const stoppedAt=reads;
 await page.clock.install();await page.clock.fastForward(15000);
 expect(reads).toBe(stoppedAt);
});

test('reminder button sends through the handler, survives reload and unlocks after five minutes',async({page})=>{
 let time=Date.now(),pushes=0;
 const rows=new Map([[ROOM,legacyRoom()]]);
 const cache={get:async k=>structuredClone(rows.get(k)||null),set:async(k,v)=>rows.set(k,structuredClone(v)),
  delete:async k=>rows.delete(k),setIfAbsent:async(k,v)=>{if(rows.has(k))return false;rows.set(k,v);return true}};
 const handler=createHandler({cache,authorizeRequest:()=>({actor:'Диана'}),now:()=>new Date(time).toISOString(),
  sendPushImpl:async()=>{pushes++;return {sent:true}}});
 await page.route('**/api/battleship-game',async route=>{
  const res={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
  await handler({method:'POST',body:route.request().postDataJSON()},res);
  await route.fulfill({status:res.code,json:res.body});
 });
 await page.route('**/api/game-status',route=>route.fulfill({json:{ok:true}}));
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/rudi-games.css"><body data-rudi-actor="Диана"><script src="/rudi-games.js"></script><script src="/rudi-games-extra.js"></script></body></html>'}));
 await page.clock.install({time:new Date(time)});
 const open=async()=>{await page.goto('/');await page.evaluate(()=>{window.RudiGames.open();window.RudiGameExtras.openGame('battleship')})};
 await open();
 const button=page.locator('[data-battle-action="remind"]');
 await expect(button).toBeEnabled();await button.click();
 await expect(page.locator('.rudi-battle-feedback')).toHaveText('Пуш-напоминание отправлено.');
 await expect(button).toBeDisabled();expect(pushes).toBe(1);
 await open();await expect(button).toBeDisabled();await expect(button).toContainText('Напомнить через');
 time+=300000;await page.clock.setFixedTime(new Date(time));
 await expect(button).toBeEnabled();await button.click();
 await expect(button).toBeDisabled();expect(pushes).toBe(2);
 rows.set(ROOM,nextMove(rows.get(ROOM),'Рустам','move',6).room);
 await expect(button).toHaveCount(0,{timeout:1800});
});
