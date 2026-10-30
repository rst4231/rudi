const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const code=app.slice(app.indexOf('      function luluTodayWalks('),app.indexOf('      let settingsFaceIdStatusSequence='));
test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date('2026-10-30T12:00:00Z')});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/meditation.css"><link rel="stylesheet" href="/partner-profile.css"></head><body><button id="trigger">Лулу</button><button id="luluWalkButton">Прогулка</button><div id="luluWalkStatus"></div><div id="luluWalkHistory"></div></body></html>'});return route.continue()});
 await page.goto('/fixture');
 await page.addScriptTag({content:`const TZ='Europe/Moscow',currentActor='Рустам',tg=null,homeDashboardState={lulu:null};
 function sharedAlbumDateKey(v){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(v).map(p=>[p.type,p.value]));return p.year+'-'+p.month+'-'+p.day}
 function syncLuluToiletStatus(){} function luluAgeLabel(){return '5 лет'}
 async function financeRequest(){return window.financeFixture||{month:'2026-10',totalRub:0,foodRub:0,vetRub:0,transactions:[]}}
 function backupRequestContext(){return {token:''}} async function storeStateBackupToken(){} async function loadActivityJournal(){} function showUndoSnackbar(){} function loadHomeBootstrap(){}
 ${code}
 document.getElementById('trigger').onclick=openLuluProfile; document.getElementById('luluWalkButton').onclick=openLuluWalkModal;
 window.seed=(state)=>renderLulu(state);`});
});
test('profile shows monthly counts and stool, only today own walks can be canceled, back closes',async({page})=>{
 await page.evaluate(()=>seed({walksMonth:[{actor:'Диана',walkedAt:'2026-10-29T07:00:00Z',peed:true,pooped:true,stool:'formed'},{actor:'Рустам',walkedAt:'2026-10-29T09:00:00Z',peed:true},{actor:'Рустам',walkedAt:'2026-10-30T07:00:00Z',pooped:true,stool:'soft'},{actor:'Диана',walkedAt:'2026-09-30T07:00:00Z',peed:true}]}));
 await page.locator('#trigger').click();const profile=page.locator('.lulu-profile-page');await expect(profile).toBeVisible();
 expect(await profile.locator('.lulu-profile-summary').evaluate(el=>el.nextElementSibling.classList.contains('lulu-profile-journal'))).toBe(true);
 await expect(profile.locator('[data-lulu-count="Диана"]')).toHaveText('1');await expect(profile.locator('[data-lulu-count="Рустам"]')).toHaveText('2');
 await expect(profile).toContainText('Оформленный');await expect(profile).toContainText('Мягкий');
 await expect(profile.locator('.lulu-profile-walk')).toHaveCount(3);await expect(profile.getByRole('button',{name:'Отменить',exact:true})).toHaveCount(1);
 await expect(profile).toContainText('Не писала');await expect(profile).toContainText('Не какала');
 expect(await profile.evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
 await page.goBack();await expect(profile).toHaveCount(0);
});
test('poop reveals optional stool picker, deselect clears stool before save',async({page})=>{
 let body;await page.route('**/api/partner-message?*',route=>{body=route.request().postDataJSON();return route.fulfill({json:{ok:true,lulu:{}}})});
 await page.locator('#luluWalkButton').click();const modal=page.locator('#luluWalkModal');
 await expect(modal.locator('.lulu-stool-picker')).toBeHidden();await modal.locator('[data-lulu-toilet="pooped"]').click();
 await expect(modal.locator('.lulu-stool-picker')).toBeVisible();await modal.getByRole('button',{name:'Мягкий',exact:true}).click();
 await modal.getByRole('button',{name:'Сохранить прогулку',exact:true}).click();expect(body.stool).toBe('soft');
 await page.locator('#luluWalkButton').click();await modal.locator('[data-lulu-toilet="pooped"]').click();await modal.getByRole('button',{name:'Жидкий',exact:true}).click();
 await modal.locator('[data-lulu-toilet="pooped"]').click();await modal.locator('[data-lulu-toilet="peed"]').click();await modal.getByRole('button',{name:'Сохранить прогулку',exact:true}).click();expect(body.stool).toBe('');
});
test('open profile rolls over at Moscow month boundary without reloading',async({page})=>{
 await page.evaluate(()=>seed({walksMonth:[{actor:'Рустам',walkedAt:'2026-10-30T07:00:00Z',peed:true}]}));
 await page.locator('#trigger').click();await expect(page.locator('[data-lulu-count="Рустам"]')).toHaveText('1');
 await page.clock.setSystemTime(new Date('2026-10-31T21:00:01Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('[data-lulu-count="Рустам"]')).toHaveText('0');await expect(page.locator('.lulu-profile-page')).toContainText('В этом месяце прогулок пока нет');
});
test('health edits save shared text and financial block shows food, vet and total',async({page})=>{
 let health={text:'Чешет ухо',actor:'Диана',updatedAt:'2026-10-30T06:00:00Z'},saved;
 await page.route('**/api/partner-message?*',async route=>{const body=route.request().postDataJSON();if(body.operation==='health-save'){saved=body;health={text:body.text,actor:'Рустам',updatedAt:'2026-10-30T12:00:00Z'}}return route.fulfill({json:{ok:true,health}})});
 await page.evaluate(()=>{window.financeFixture={month:'2026-10',foodRub:1500,vetRub:3500,totalRub:5000,transactions:[{kind:'food',note:'Корм',rubAmount:1500,occurredAt:'2026-10-29T07:00:00Z'},{kind:'vet',note:'Прививка',rubAmount:3500,occurredAt:'2026-10-30T07:00:00Z'}]}});
 await page.locator('#trigger').click();const profile=page.locator('.lulu-profile-page');
 await expect(profile.locator('textarea')).toHaveValue('Чешет ухо');await profile.locator('textarea').fill('Ухо\nЛапа');
 await profile.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(profile.locator('.lulu-health-status')).toHaveText('Сохранено');
 expect(saved.text).toBe('Ухо\nЛапа');expect(saved.expectedUpdatedAt).toBe('2026-10-30T06:00:00Z');
 await expect(profile.locator('.lulu-food-total')).toContainText('5 000');await expect(profile.locator('.lulu-finance-breakdown')).toHaveCount(0);await expect(profile.locator('.lulu-food-transaction')).toHaveCount(2);
 for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await profile.locator('.partner-profile-content').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/tmp/lulu-profile-'+theme+'.png',fullPage:true});expect(await profile.evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true)}
});
test('Lulu light header blends into page instead of showing a white stripe',async({page})=>{
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 await page.locator('#trigger').click();
 const header=page.locator('.lulu-profile-page>.partner-profile-bar');
 await expect(header).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(header).toHaveCSS('border-bottom-width','0px');
 await expect(header).toHaveCSS('backdrop-filter','none');
});
test('unclassified Lulu expenses appear in total without being labeled as food',async({page})=>{
 await page.evaluate(()=>{window.financeFixture={month:'2026-10',foodRub:0,vetRub:0,otherRub:311,totalRub:311,transactions:[{kind:'other',rubAmount:103,occurredAt:'2026-10-10T07:00:00Z'},{kind:'other',rubAmount:208,occurredAt:'2026-10-15T07:00:00Z'}]}});
 await page.locator('#trigger').click();const card=page.locator('.lulu-profile-finances');
 await expect(card.locator('h2')).toHaveText('Расходы за месяц');await expect(card.locator('.lulu-food-status')).toHaveCount(0);
 await expect(card.locator('.lulu-food-total')).toContainText('311');await expect(card.locator('.lulu-finance-breakdown')).toHaveCount(0);
 await expect(card.locator('.lulu-food-transaction')).toHaveCount(2);await expect(card.locator('.lulu-food-transaction').first()).toContainText('Расход на Лулу');
});

test('monthly expenses shows only title and total when there are no transactions',async({page})=>{
 await page.locator('#trigger').click();const card=page.locator('.lulu-profile-finances');
 await expect(card.locator('h2')).toHaveText('Расходы за месяц');await expect(card.locator('.lulu-food-total')).toContainText('0,00');
 await expect(card.locator('.lulu-food-transactions')).toBeEmpty();await expect(card.locator('p')).toHaveCount(0);
 await expect(card).not.toContainText('Диана');await expect(card).not.toContainText('Корм:');await expect(card).not.toContainText('Ветеринария:');
});
