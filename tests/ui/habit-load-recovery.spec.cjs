const {test,expect}=require('@playwright/test');

async function setup(page,mode){
  page.on('console',msg=>{if(msg.type()==='error')console.log('RUDI_TEST_BROWSER_CONSOLE:',msg.text())});
  page.on('pageerror',error=>console.log('RUDI_TEST_BROWSER_PAGEERROR:',error.message));
  await page.setContent('<main id="homeTileHost"></main><span id="displayName"></span>');
  await page.evaluate(mode=>{
    document.body.dataset.rudiActor='Рустам';
    window.Telegram={WebApp:{initData:'test'}};
    window.__habitMode=mode;
    window.fetch=async url=>{
      if(String(url).includes('/api/supplements'))return new Promise(()=>{});
      if(String(url).includes('/api/habits')){
        if(window.__habitMode==='broken')throw Error('offline');
        return {ok:true,status:200,json:async()=>({
          ok:true,actor:'Рустам',today:'2026-10-15',date:'2026-10-15',
          habits:[{id:'habit-abc12345',name:'Читать 20 минут',purpose:'Обучение',createdAt:'2026-10-01T10:00:00Z'}],
          statuses:{'habit-abc12345':'pending'},streaks:{},stats:{},bonusIds:['habit-abc12345'],
          completedIds:[],notDoneIds:[],history:{},total:1,done:0,canCompleteToday:false
        })};
      }
      throw Error('Unexpected fetch: '+url);
    };
  },mode);
  await page.addScriptTag({path:'public/profile-supplements.js'});
  await page.locator('#habitHomeTile').evaluate(node=>node.hidden=false);
}

test('habits render even when supplements fetch hangs forever',async({page})=>{
  await setup(page,'success');
  await expect(page.locator('.personal-habits-progress-text')).toContainText('0 из 1 выполнено');
  await expect(page.locator('.personal-habit-name')).toHaveText('Читать 20 минут');
  await expect(page.locator('.personal-habit-date')).toHaveCount(7);
});

test('habit failure leaves a visible retry action and can recover',async({page})=>{
  await setup(page,'broken');
  await expect(page.locator('.personal-habits-progress-text')).toHaveText('Не удалось загрузить');
  await expect(page.locator('.personal-habits-retry')).toBeVisible();
  await page.evaluate(()=>{window.__habitMode='success'});
  await page.locator('.personal-habits-retry').click();
  await expect(page.locator('.personal-habits-progress-text')).toContainText('0 из 1 выполнено');
});
