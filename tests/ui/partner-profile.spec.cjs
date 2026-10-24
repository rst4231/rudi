const {test,expect}=require('@playwright/test');
for(const actor of ['Диана','Рустам'])test('partner profile, avatar, balance, stars history and back: '+actor,async({page})=>{
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/rudi-design-system.css"><link rel="stylesheet" href="/meditation.css"><link rel="stylesheet" href="/home-reference-layout.css"><link rel="stylesheet" href="/partner-profile.css"><body data-app-tab="home" data-rudi-actor="${actor==='Диана'?'Рустам':'Диана'}"><section id="tile" class="profile-person-card" aria-label="${actor}" data-app-tab-section="home"><div class="profile-energy-strip"><span class="profile-energy-now">Точка</span></div><div class="profile-person-head"><div class="identity"><div class="score-avatar-wrap rudi-partner-fasting-active"><span class="avatar partner-header-avatar">Фото</span><svg class="rudi-partner-fasting-outline" viewBox="0 0 100 100" aria-hidden="true"><path class="rudi-partner-fasting-track" d="M50 3 H71 C85.36 3 97 14.64 97 29 V71 C97 85.36 85.36 97 71 97 H29 C14.64 97 3 85.36 3 71 V29 C3 14.64 14.64 3 29 3 H50"/><path class="rudi-partner-fasting-value" style="stroke-dasharray:310 331.36" d="M50 3 H71 C85.36 3 97 14.64 97 29 V71 C97 85.36 85.36 97 71 97 H29 C14.64 97 3 85.36 3 71 V29 C3 14.64 14.64 3 29 3 H50"/></svg><button class="rudi-partner-fasting-hours">15 ч</button></div><div class="person"><div class="profile-name-row"><span id="partnerHeaderName">${actor}</span><button id="partnerMoodValue" class="avatar-mood-badge">😊</button></div><div class="profile-work-status">Отдыхаю</div><div class="profile-cycle-mood">Месячные до 26 октября</div></div></div></div><div class="profile-person-details"><div id="meditationPartnerSummary" class="meditation-partner-summary" data-meditated-today="false">🧘 Не медитировала</div><div id="homePartnerLastExpense" class="home-partner-last-expense meditation-partner-summary">💸 1 606 ₽ · Лулу · 20:54</div><div id="homePartnerHabitsSummary" class="profile-partner-habits-summary">🌱 Привычки: 0 из 4</div><div class="home-cycle-summary"><div class="home-cycle-status">Цикл</div><div class="home-cycle-advice">Как поддержать</div><div class="home-cycle-insight">Подробности</div></div></div></section><div id="history" hidden><button id="back" onclick="history.back()">Назад к профилю</button></div><script src="/viewport.js"></script><script src="/partner-profile.js"></script><script>let balance=125;RudiPartnerProfile.bind(document.querySelector('#tile'),'${actor}',{balance:()=>balance,loadCbtStatus:async()=>({partner:'${actor}',active:${actor==='Диана'}}),loadWishes:async()=>[{id:'gift',owner:'${actor}',text:'Поездка к морю',url:'https://example.com/gift',done:false},{id:'done',owner:'${actor}',text:'Книга',done:true},{id:'other',owner:'${actor==='Диана'?'Рустам':'Диана'}',text:'Чужое желание',done:false}],openStars:actor=>{document.body.dataset.appTab='score';window.dispatchEvent(new Event('rudi:app-tab-change'));history.pushState({...history.state,rudiTab:'score'},'','?tab=score');document.querySelector('#history').hidden=false;}});window.addEventListener('popstate',()=>{if(!location.search){document.body.dataset.appTab='home';document.querySelector('#history').hidden=true;window.dispatchEvent(new Event('rudi:app-tab-change'))}});</script></body></html>`}));
 await page.goto('/');
 await expect(page.locator('.profile-person-details')).toBeHidden();
 await expect(page.locator('#tile .home-cycle-summary>.home-cycle-insight')).toHaveCount(1);
 await expect(page.locator('#tile .partner-today,#tile .partner-cycle-more,#tile .partner-hero,#tile .partner-cbt-status,#tile .partner-mood-cbt')).toHaveCount(0);
 await expect(page.locator('.profile-energy-strip')).toBeVisible();
 await page.locator('.profile-energy-now').dispatchEvent('click');
 await expect(page.locator('.partner-profile-page')).toHaveCount(0);
 await page.evaluate(()=>{const stale=document.createElement('section');stale.className='partner-plans';stale.textContent='Старый дубль';document.querySelector('#tile .profile-person-details').append(stale)});
 await page.locator('.partner-header-avatar').click();
 const profile=page.locator('.partner-profile-page');
 await expect(profile).toBeVisible();await expect(profile.locator('h1')).toHaveText(actor);
 await expect(profile.locator('.profile-person-details')).toBeVisible();
 await expect(profile.locator('.partner-today>h2')).toHaveText('БАДы');
 await expect(profile.locator('.partner-gifts>h2')).toHaveText('Подарки');
 await expect(profile.locator('.partner-cycle-more .home-cycle-insight')).toBeHidden();
 await profile.locator('.partner-cycle-more>summary').click();
 await expect(profile.locator('.partner-cycle-more .home-cycle-insight')).toBeVisible();
 await expect(profile.locator('.partner-profile-stars')).toHaveText('⭐ 125');
 await expect(profile.locator('.partner-profile-wishes h2')).toHaveText('Желания');
 await expect(profile.locator('.partner-birthday-copy>span')).toHaveText(actor==='Диана'?'30 июня':'3 марта');
 expect(await profile.locator('.partner-profile-wishes').evaluate(el=>el.previousElementSibling.classList.contains('partner-birthday'))).toBe(true);
 await expect(profile.locator('.partner-mood-habits>.partner-habits-plain')).toHaveCount(1);
 await expect(profile.locator('#homePartnerHabitsSummary')).toHaveCSS('border-top-width','0px');
 await expect(profile.locator('#homePartnerHabitsSummary')).toHaveCSS('font-weight','400');
 await expect(profile.locator('#homePartnerHabitsSummary')).toHaveText('🌱 0/4');
 await expect(profile.locator('.partner-mood-habits')).toBeHidden();
 await expect(profile.locator('.rudi-partner-fasting-outline')).toBeVisible();
 await expect(profile.locator('.partner-mood-cbt')).toHaveCount(1);
 if(actor==='Диана')await expect(profile.locator('.partner-mood-cbt')).toBeVisible();else await expect(profile.locator('.partner-mood-cbt')).toBeHidden();
 expect(await profile.locator('.partner-mood-cbt').evaluate(el=>el.previousElementSibling.id)).toBe('partnerMoodValue');
 await expect(profile.locator('.partner-mood-cbt')).toHaveAttribute('data-status',actor==='Диана'?'active':'inactive');
 await page.evaluate(()=>{document.querySelector('#partnerMoodValue').hidden=true});
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  if(actor==='Диана')await expect(profile.locator('.partner-mood-cbt')).toBeVisible();else await expect(profile.locator('.partner-mood-cbt')).toBeHidden();
  await page.evaluate(()=>{document.querySelector('#homePartnerHabitsSummary').textContent='🌱 Привычки: 1 из 4'});
  await expect(profile.locator('.partner-mood-habits')).toBeVisible();
  await expect(profile.locator('.partner-mood-habits')).toHaveText('🌱 1/4');
  await page.evaluate(()=>{document.querySelector('#homePartnerHabitsSummary').textContent='🌱 Привычки: 0 из 4'});
  await expect(profile.locator('.partner-mood-habits')).toBeHidden();
 }

 await page.evaluate(()=>{document.querySelector('#partnerMoodValue').hidden=false});


 await expect(profile.locator('.score-avatar-wrap>.avatar')).toHaveCSS('border-radius','50%');
 await expect(profile.locator('.rudi-partner-fasting-value')).toHaveAttribute('d','M50 3 A47 47 0 1 1 50 97 A47 47 0 1 1 50 3');
 await expect(profile.locator('.rudi-partner-fasting-value')).toHaveAttribute('pathLength',String(168+52*Math.PI));
 await expect(profile.locator('.rudi-partner-fasting-value')).toHaveAttribute('style','stroke-dasharray:310 331.36');

 await expect(profile.locator('.rudi-partner-fasting-value')).toHaveCSS('stroke','rgb(165, 154, 249)');
 await expect(profile.locator('.partner-hero-bubble.is-expense')).toHaveCSS('animation-name','partner-pill-arrive');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(profile.locator('.partner-hero-bubble.is-expense')).toHaveCSS('animation-name','none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{document.querySelector('#homePartnerHabitsSummary').textContent='🌱 Привычки: 1 из 4'});
 await expect(profile.locator('#homePartnerHabitsSummary')).toHaveText('🌱 1/4');
 await expect(profile.locator('.partner-mood-habits')).toBeVisible();
 await page.evaluate(()=>{document.querySelector('#homePartnerHabitsSummary').textContent='🌱 Привычки: 0 из 4'});
 await expect(profile.locator('.partner-mood-habits')).toBeHidden();
 await page.evaluate(()=>{document.querySelector('#homePartnerHabitsSummary').textContent='🌱 Привычки: 1 из 4'});
 await expect(profile.locator('.partner-mood-habits')).toBeVisible();
 expect(await profile.locator('.partner-hero-bubble.is-expense').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(40);
 await expect(profile.locator('.partner-hero-bubble')).toHaveCount(2);
 await expect(profile.locator('.partner-hero-bubble.is-meditation')).toBeHidden();
 await page.evaluate(()=>{const row=document.querySelector('.partner-profile-page .profile-person-details').querySelector('#meditationPartnerSummary');row.textContent='🧘 Медитировала 10 мин';row.dataset.meditatedToday='true'});
 await expect(profile.locator('.partner-hero-bubble.is-meditation')).toHaveText('🧘 Медитировала 10 мин');
 await expect(profile.locator('.partner-hero-bubble.is-meditation')).toBeVisible();
 await expect(profile.locator('.partner-hero-bubble.is-cbt,.partner-cbt-status')).toHaveCount(0);
 await expect(page.locator('#tile .partner-hero')).toHaveCount(0);
 await expect(profile.locator('.partner-wish-text')).toHaveText(['Поездка к морю','Книга']);
 await expect(profile.locator('.partner-wish-link')).toHaveAttribute('href','https://example.com/gift');
 await expect(profile.locator('.partner-wish-row.is-done')).toHaveCount(1);
 expect(await profile.locator('.partner-profile-layout').evaluate(el=>el.lastElementChild.classList.contains('partner-gifts'))).toBe(true);
 await page.evaluate(()=>{balance=150;RudiPartnerProfile.refresh()});
 await expect(profile.locator('.partner-profile-stars')).toHaveText('⭐ 150');
 await profile.locator('.partner-profile-stars').click();
 await expect(profile).toBeHidden();await expect(page.locator('#history')).toBeVisible();
 await page.locator('#back').click();await expect(profile).toBeVisible();
 await profile.locator('.partner-profile-back').click();await expect(profile).toHaveCount(0);
 await expect(page.locator('.profile-person-details')).toBeHidden();
 await expect(page.locator('#tile .profile-person-details>#meditationPartnerSummary')).toHaveCount(1);
 await expect(page.locator('#tile .profile-person-details>#homePartnerLastExpense')).toHaveCount(1);
 await expect(page.locator('#tile #homePartnerHabitsSummary')).toHaveText('🌱 Привычки: 1 из 4');
 await expect(page.locator('#tile .home-cycle-summary>.home-cycle-insight')).toHaveCount(1);
 await expect(page.locator('#tile .rudi-partner-fasting-value')).toHaveAttribute('d',/^M50 3 H71/);
 expect(await page.locator('#tile .rudi-partner-fasting-value').getAttribute('pathLength')).toBeNull();

 await expect(page.locator('#tile .partner-today,#tile .partner-cycle-more,#tile .partner-hero,#tile .partner-cbt-status,#tile .partner-mood-cbt')).toHaveCount(0);
 await expect(page.locator('.profile-energy-strip')).toBeVisible();
 await page.locator('#partnerHeaderName').click();await expect(profile).toBeVisible();
 await expect(profile.locator('.partner-plans')).toHaveCount(1);
 await expect(profile.locator('.partner-mood-cbt')).toHaveCount(1);
 await expect(page.locator('#partnerHeaderName')).toHaveCount(1);
 await page.screenshot({path:test.info().outputPath('partner-profile.png')});
 for(let visit=0;visit<5;visit++){
  await profile.locator('.partner-profile-back').click();await expect(profile).toHaveCount(0);
  await expect(page).not.toHaveURL(/#partner-/);
  await expect(page.locator('#tile .partner-plans,#tile .partner-hero,#tile .partner-cbt-status')).toHaveCount(0);
  await page.locator('#partnerHeaderName').click();
  await expect(profile.locator('.partner-plans')).toHaveCount(1);
  await expect(profile.locator('.partner-hero')).toHaveCount(1);
  await expect(profile.locator('.partner-mood-cbt')).toHaveCount(1);
  await expect(profile.locator('#meditationPartnerSummary')).toHaveCount(1);
 }
});
