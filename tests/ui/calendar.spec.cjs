const {test,expect}=require('@playwright/test');

function monthDays(year,month){
  const count=new Date(Date.UTC(year,month,0)).getUTCDate();
  return Array.from({length:count},(_,index)=>{
    const day=index+1;
    const date=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
    return {date,working:day%3===0,events:day%3===0?[{title:'Смена',startTime:'09:00',endTime:'21:00',allDay:false}]:[]};
  });
}

async function mockRudi(page,options={}){
  await page.addInitScript(({fixedNow})=>{
    const RealDate=Date;
    class FixedDate extends RealDate{
      constructor(...args){super(...(args.length?args:[fixedNow]))}
      static now(){return fixedNow}
    }
    window.Date=FixedDate;
  },{fixedNow:Date.parse('2026-09-21T12:00:00+03:00')});

  const state={
    taskCompleted:false,
    completionCalls:0,
    workCalendarCalls:0,
    tickCalendarCalls:0,
    buyCalls:0,
    products:[{
      id:'milk',text:'Молоко',addedBy:'Рустам',category:'Молочное и яйца',
      weeklyAmount:'2 л',checked:false,createdAt:'2026-09-21T06:00:00.000Z'
    }],
    productHistory:[],
    reactions:{},
    bootstrapStarted:false,
    bootstrapResolved:false
  };

  await page.route('https://telegram.org/js/telegram-web-app.js?63',route=>route.fulfill({
    contentType:'application/javascript',
    body:`window.Telegram={WebApp:{
      initData:'test-init-data',
      initDataUnsafe:{user:{id:1,first_name:'Рустам',last_name:'Тест',photo_url:''}},
      platform:'ios',colorScheme:'dark',
      contentSafeAreaInset:{top:0,bottom:0,left:0,right:0},
      safeAreaInset:{top:0,bottom:0,left:0,right:0},
      ready(){},expand(){},onEvent(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},
      HapticFeedback:{selectionChanged(){},notificationOccurred(){}},
      CloudStorage:{
        getItem(key,cb){cb(null,'')},
        setItem(key,value,cb){cb(null,true)},
        removeItem(key,cb){cb(null,true)},
        removeItems(keys,cb){cb(null)}
      }
    }};`
  }));

  await page.route('https://raw.githubusercontent.com/rst4231/rudi/main/rudi-config.json**',route=>route.fulfill({
    contentType:'application/json',
    body:JSON.stringify({
      weather:{enabled:false},
      dailyIdeas:['Прогулка'],
      watchList:[],
      importantDates:[{id:'new-year',title:'Новый год',month:1,day:1,recurring:true}],
      birthdays:[],
      cycle:{enabled:true,cycleLengthDays:30,periodLengthDays:5,historyStarts:['2026-08-20']}
    })
  }));

  await page.route('**/api/**',async route=>{
    const request=route.request();
    const url=new URL(request.url());
    const path=url.pathname;
    let body={};
    try{body=request.postDataJSON()||{}}catch(_){}

    const ok=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});

    if(path==='/api/partner-message'&&url.searchParams.get('rudiAction')==='app-auth'){
      return ok({ok:true,actor:'Рустам'});
    }
    if(path==='/api/partner-message'&&url.searchParams.get('rudiAction')==='app-bootstrap'){
      state.bootstrapStarted=true;
      if(options.bootstrapDelayMs) await new Promise(resolve=>setTimeout(resolve,options.bootstrapDelayMs));
      state.bootstrapResolved=true;
      return ok({
        ok:true,actor:'Рустам',
        selfProfile:{name:'Рустам'},partnerProfile:{name:'Диана'},
        holidayHighlights:[],
        uiPreferences:options.uiPreferences||null,
        backupToken:''
      });
    }
    if(path==='/api/feed'){
      return ok({
        ok:true,
        version:'feed-v1',
        updatedAt:'2026-09-21T06:45:00.000Z',
        date:'2026-09-21',
        changedSections:['facts','events','cinema'],
        sections:{
          facts:{parts:['💡 <b>Полезные факты</b>\\n🚶 <b>Движение</b>\\n\\nТестовая польза.\\n\\n<a href="https://example.com/study">Исследование →</a>'],updatedAt:'2026-09-21T06:40:00.000Z'},
          events:{parts:[
            '🎤 <b>Поп и хип-хоп концерты</b>\\n📅 Понедельник, 21 сентября\\n1. <b>Концерт сегодня</b>\\n🕒 18:30\\n📍 Тестовый клуб\\n<a href="https://example.com/concert">Подробнее →</a>',
            '🎙 <b>Stage StandUp Club</b>\\n📅 Понедельник, 21 сентября\\nНайдено событий/сеансов: <b>2</b>\\n1. <b>Первый стендап</b>\\n🕒 19:00\\n<a href="https://example.com/standup-1">Официальная страница →</a>\\n2. <b>Второй стендап</b>\\n🕒 20:00\\n<a href="https://example.com/standup-2">Официальная страница →</a>'
          ],updatedAt:'2026-09-21T06:41:00.000Z'},
          cinema:options.legacyCinema?{
            parts:['🎬 <b>Кинопремьеры — 18 сентября</b>\\n\\n1. <a href="https://example.com/kinopoisk-old">Старый фильм</a>\\nКинополис Мурино'],
            updatedAt:'2026-09-18T06:42:00.000Z'
          }:{
            parts:['🎬 <b>Кинопремьеры</b>\\n\\n1. Тестовый фильм'],
            items:[{
              title:'Тестовый фильм',
              posterUrl:'https://cdn.mirage.ru/images/film/7000/small/p7426.jpg',
              releaseDate:'2026-09-21',
              sources:['Мираж Синема'],
              sourceUrls:[{name:'Мираж Синема',url:'https://example.com/movie'}],
              kinopoiskUrl:'https://example.com/kinopoisk'
            }],
            updatedAt:'2026-09-21T06:42:00.000Z'
          }
        }
      });
    }
    if(path==='/api/work-calendar'){
      state.workCalendarCalls++;
      const next=body.view==='next-month';
      return ok({
        ok:true,configured:true,view:next?'next-month':'month',
        days:next?monthDays(2026,10):monthDays(2026,9)
      });
    }
    if(path==='/api/ticktick/calendar'){
      state.tickCalendarCalls++;
      const next=body.view==='next-month';
      const task=state.taskCompleted?[]:[{
        id:'groceries',title:'🛒 Купить продукты',allDay:true,completed:false,
        assigned:true,assignee:'Рустам'
      }];
      return ok({
        ok:true,connected:true,enabled:true,writable:true,view:next?'next-month':'month',
        days:next?monthDays(2026,10).map(day=>({date:day.date,events:[]})):
          monthDays(2026,9).map(day=>({date:day.date,events:day.date==='2026-09-23'?task:[]}))
      });
    }
    if(path==='/api/ticktick/today'){
      return ok({ok:true,connected:true,enabled:true,writable:true,date:'2026-09-21',tasks:[]});
    }
    if(path==='/api/ticktick/task-complete'){
      state.completionCalls++;
      state.taskCompleted=true;
      return ok({ok:true,connected:true,writable:true,taskId:body.taskId,completed:true});
    }
    if(path==='/api/partner-message'&&url.searchParams.get('rudiAction')==='holiday-calendar'){
      const next=body.view==='next-month';
      const days=(next?monthDays(2026,10):monthDays(2026,9))
        .map(day=>({date:day.date,items:day.date==='2026-09-23'?['День тестового праздника']:[]}));
      return ok({ok:true,view:next?'next-month':'month',days});
    }
    if(path==='/api/cycle') return ok({ok:true,configured:true,enabled:true,historyStarts:['2026-08-20']});
    if(path==='/api/shared-album'){
      if(options.photoAlbum){
        return ok({
          ok:true,
          configured:true,
          albumUrl:'https://www.icloud.com/sharedalbum/#A5q2example',
          totalCount:128,
          photos:[
            {id:'today',url:'https://images.example.test/today.jpg',fullUrl:'https://images.example.test/today-full.jpg',date:'2026-09-21T09:00:00.000Z',caption:'Сегодня'},
            {id:'yesterday',url:'https://images.example.test/yesterday.jpg',fullUrl:'https://images.example.test/yesterday-full.jpg',date:'2026-09-20T09:00:00.000Z',caption:'Вчера'},
            {id:'august',url:'https://images.example.test/august.jpg',fullUrl:'https://images.example.test/august-full.jpg',date:'2026-08-21T09:00:00.000Z',caption:'Август'},
            {id:'july',url:'https://images.example.test/july.jpg',fullUrl:'https://images.example.test/july-full.jpg',date:'2026-07-10T09:00:00.000Z',caption:'Июль'}
          ]
        });
      }
      return ok({ok:true,configured:true,totalCount:0,photos:[],albumUrl:''});
    }
    if(path==='/api/wishlist') return ok({ok:true,items:[]});
    if(path==='/api/mood') return ok({
      ok:true,
      date:'2026-09-21',
      actor:'Рустам',
      partner:'Диана',
      mine:{mood:'ok'},
      partnerMood:{mood:options.partnerMood||'ok'}
    });
    if(path==='/api/partner-message'&&url.searchParams.get('rudiAction')==='products'){
      const operation=String(body.operation||'list');
      if(operation==='toggle'){
        const item=state.products.find(row=>row.id===body.id);
        if(item) item.checked=!item.checked;
      }
      if(operation==='buy-checked'){
        const checked=state.products.filter(item=>item.checked);
        if(checked.length){
          state.buyCalls++;
          state.productHistory.unshift(...checked.map(item=>({
            id:'history-'+item.id,
            text:item.text,
            addedBy:item.addedBy,
            boughtBy:'Рустам',
            category:item.category,
            weeklyAmount:item.weeklyAmount,
            boughtAt:'2026-09-21T08:00:00.000Z'
          })));
          const ids=new Set(checked.map(item=>item.id));
          state.products=state.products.filter(item=>!ids.has(item.id));
        }
      }
      return ok({ok:true,actor:'Рустам',initialized:true,items:state.products,history:state.productHistory});
    }
    if(path==='/api/partner-message'&&url.searchParams.get('rudiAction')==='reactions'){
      const operation=String(body.operation||'list');
      if(operation==='set'){
        const target=body.target||{};
        const key=String(target.type||'')+':'+String(target.key||'');
        state.reactions[key]=body.liked?['Рустам']:[];
        return ok({ok:true,reaction:{...target,likedBy:state.reactions[key],count:state.reactions[key].length}});
      }
      const reactions=(Array.isArray(body.targets)?body.targets:[]).map(target=>{
        const key=String(target.type||'')+':'+String(target.key||'');
        const likedBy=state.reactions[key]||[];
        return {...target,likedBy,count:likedBy.length};
      });
      return ok({ok:true,reactions});
    }
    if(path==='/api/partner-message') return ok({ok:true,message:null});
    return ok({ok:true,items:[],tasks:[],photos:[]});
  });

  return state;
}

test('authenticated shell opens while bootstrap finishes in the background',async({page})=>{
  const state=await mockRudi(page,{bootstrapDelayMs:1500});
  await page.goto('/');
  await expect.poll(()=>state.bootstrapStarted,{timeout:1000}).toBe(true);
  await expect(page.locator('body')).toHaveClass(/auth-ok/,{timeout:1000});
  expect(state.bootstrapResolved).toBe(false);
  await expect.poll(()=>state.bootstrapResolved,{timeout:3000}).toBe(true);
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
});

test('remote saved home layout is applied before the shell becomes visible',async({page})=>{
  await mockRudi(page,{
    uiPreferences:{
      homeOrder:['smart-home','dashboard','priority','partner','new','car','activity'],
      blockStates:{'smart-home':true},
      updatedAt:'2026-09-21T09:00:00.000Z'
    }
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  const order=await page.locator('#homeTileHost > [data-home-tile]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeTile));
  expect(order[0]).toBe('smart-home');
  await expect(page.locator('#smartHomeTile')).toHaveClass(/is-collapsed/);
});

test('home dashboard is compact and reorder controls use aligned icons',async({page})=>{
  await mockRudi(page,{partnerMood:'ok'});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await expect(page.locator('#homeDashboard')).toBeVisible();
  await expect(page.locator('#homeDashboard')).not.toContainText('Мы сегодня');
  await expect(page.locator('#homeRustamTile')).toBeVisible();
  await expect(page.locator('#homeDianaTile')).toBeVisible();
  await expect(page.locator('#homeLuluTile')).toBeVisible();
  await expect(page.locator('#homeNearestBlock')).toBeVisible();
  await expect(page.locator('#dianaCycleCard')).toBeHidden();
  await expect(page.locator('#appVersion')).toHaveText('v1.9.5');
  const homeOrder=await page.locator('#homeTileHost > [data-home-tile]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeTile));
  expect(homeOrder[0]).toBe('dashboard');
  expect(homeOrder.slice(-3)).toEqual(['smart-home','car','activity']);

  const dianaStatus=page.locator('#partnerWorkStatus');
  await expect(dianaStatus).toHaveText('Работаю');
  await expect(page.locator('#selfWorkStatus')).toHaveText(/^(Работаю|Отдыхаю)$/);
  await expect(page.locator('#selfWorkStatus')).not.toContainText(/10:00|18:00|Пн|Пт/);

  const partnerMoodIcons=page.locator('#partnerMoodValue [data-partner-mood]');
  await expect(partnerMoodIcons).toHaveCount(3);
  await expect(page.locator('#partnerMoodValue [data-partner-mood="ok"]')).toBeVisible();
  await expect(page.locator('#partnerMoodValue [data-partner-mood="low"]')).toBeHidden();
  await expect(page.locator('#partnerMoodValue [data-partner-mood="great"]')).toBeHidden();
  const partnerMoodBox=await page.locator('#partnerMoodValue').boundingBox();
  expect(partnerMoodBox.height).toBeLessThanOrEqual(32);

  await page.locator('#homeLayoutEditButton').click();
  const controls=page.locator('.home-order-controls');
  await expect(controls.first()).toBeVisible();
  await expect(controls.first().locator('svg')).toHaveCount(2);
  const buttons=controls.first().locator('.home-order-button');
  const firstBox=await buttons.nth(0).boundingBox();
  const secondBox=await buttons.nth(1).boundingBox();
  expect(Math.abs(firstBox.width-secondBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstBox.height-secondBox.height)).toBeLessThanOrEqual(1);
});

test('iPhone calendar taps, spacing and silent refresh stay stable',async({page})=>{
  const state=await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);

  await page.getByRole('tab',{name:'Календарь'}).click();
  await expect(page.locator('#workCalendarDays .calendar-day-cell')).toHaveCount(30);

  const day23=page.locator('.calendar-day-cell[aria-label*="23 сентября"]');
  await day23.click();
  await expect(day23).toHaveClass(/selected/);
  await expect(page.locator('#workCalendarSelected')).toContainText('23 сентября');

  const calendarBox=await page.locator('#workCalendarCard').boundingBox();
  const nearestBox=await page.locator('.schedule-nearest').boundingBox();
  const yearBox=await page.locator('.schedule-year-progress').boundingBox();
  expect(nearestBox.y-(calendarBox.y+calendarBox.height)).toBeGreaterThanOrEqual(18);
  expect(yearBox.y-(nearestBox.y+nearestBox.height)).toBeGreaterThanOrEqual(18);

  const workBefore=state.workCalendarCalls;
  const tickBefore=state.tickCalendarCalls;
  await page.getByRole('tab',{name:'Календарь'}).click();
  await page.getByRole('tab',{name:'Календарь'}).click();
  await page.waitForTimeout(250);
  expect(state.workCalendarCalls-workBefore).toBeLessThanOrEqual(1);
  expect(state.tickCalendarCalls-tickBefore).toBeLessThanOrEqual(1);
  await expect(day23).toHaveClass(/selected/);
  await expect(page.locator('#workCalendarSelected')).toContainText('23 сентября');
});

test('calendar task completes in TickTick and refreshes in place with confetti',async({page})=>{
  const state=await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.getByRole('tab',{name:'Календарь'}).click();

  const day23=page.locator('.calendar-day-cell[aria-label*="23 сентября"]');
  await day23.click();
  await expect(page.locator('#workCalendarSelected')).toContainText('Купить продукты');

  const complete=page.getByRole('checkbox',{name:/Купить продукты/});
  await complete.click();
  await expect(page.locator('#calendarConfetti')).toHaveClass(/is-active/);
  await expect.poll(()=>state.completionCalls).toBe(1);
  await expect(page.locator('#workCalendarSelected')).not.toContainText('Купить продукты');
  await expect(day23).toHaveClass(/selected/);
});


test('feed is structured, today-first and keeps six-tab layout',async({page})=>{
  await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);

  await expect(page.locator('#compliment')).toHaveCount(0);
  await expect(page.locator('#cinemaPremieresButton')).toHaveCount(0);
  await expect(page.locator('#feedTabBadge')).toBeVisible();

  await page.getByRole('tab',{name:'Лента'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','feed');
  await expect(page.locator('.feed-daily-top')).toBeVisible();
  await expect(page.locator('#feedTitle')).toHaveCount(0);
  await expect(page.locator('#feedToday')).toBeVisible();
  await expect(page.locator('#feedTodayLinks')).toContainText('1 концерт');
  await expect(page.locator('#feedTodayLinks')).toContainText('2 Stand Up');
  await expect(page.locator('#feedTodayLinks')).toContainText('Факт дня');

  await expect(page.locator('#feedFactsBody')).toContainText('Движение');
  await expect(page.locator('#feedFactsBody')).not.toContainText('Полезные факты');
  await expect(page.locator('#feedConcertsBody .feed-event-item')).toHaveCount(1);
  await expect(page.locator('#feedConcertsBody .feed-event-title')).toHaveText('Концерт сегодня');
  await expect(page.locator('#feedStandupBody .feed-event-item')).toHaveCount(2);
  await expect(page.locator('#feedStandupBody .feed-event-title').nth(0)).toHaveText('Первый стендап');
  await expect(page.locator('#feedStandupBody .feed-event-title').nth(1)).toHaveText('Второй стендап');
  await expect(page.locator('#feedStandupBody')).not.toContainText('Найдено событий/сеансов');
  await expect(page.locator('#feedCinemaBody .feed-movie-card')).toHaveCount(1);
  await expect(page.locator('#feedCinemaBody .feed-movie-title')).toHaveText('Тестовый фильм');
  await expect(page.locator('#feedCinemaBody .feed-movie-meta')).toContainText('Мираж Синема');
  await expect(page.locator('.profile-weather')).toHaveCount(0);

  const cardOrder=await page.locator('.feed-grid .feed-card').evaluateAll(nodes=>nodes.map(node=>node.id));
  expect(cardOrder.slice(0,4)).toEqual(['feedConcertsCard','feedStandupCard','feedFactsCard','feedCinemaCard']);

  await expect(page.locator('#feedFactsNew')).toBeVisible();
  await page.locator('#feedFactsCard').scrollIntoViewIfNeeded();
  await page.waitForTimeout(850);
  await expect(page.locator('#feedFactsNew')).toBeHidden();

  const shellPadding=await page.locator('.shell').evaluate(node=>parseFloat(getComputedStyle(node).paddingBottom));
  const tabHeight=(await page.locator('#appTabBar').boundingBox()).height;
  expect(shellPadding-tabHeight).toBeGreaterThanOrEqual(40);

  await page.locator('#feedFactsLike').click();
  await expect(page.locator('#feedFactsLikedBy')).toHaveText('Нравится: Рустам');
  await expect(page.locator('#feedTabBadge')).toBeHidden();

  const tabs=page.locator('#appTabBar [role="tab"]');
  await expect(tabs).toHaveCount(6);
  const labels=(await tabs.allTextContents()).map(value=>value.trim());
  expect(labels).toEqual(['Домой','Лента','Календарь','Продукты','Фото','Вишлист']);
  const boxes=await tabs.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect()));
  const top=Math.round(boxes[0].top);
  expect(boxes.every(box=>Math.abs(Math.round(box.top)-top)<=1)).toBe(true);
});

test('legacy cinema feed is upgraded to visual cards immediately',async({page})=>{
  await mockRudi(page,{legacyCinema:true});
  await page.goto('/?tab=feed');
  await expect(page.locator('#feedCinemaBody .feed-movie-card')).toHaveCount(1);
  await expect(page.locator('#feedCinemaBody .feed-movie-title')).toHaveText('Старый фильм');
  await expect(page.locator('#feedCinemaBody .feed-movie-meta')).toContainText('Кинополис Мурино');
  await expect(page.locator('#feedCinemaBody .feed-movie-poster')).toHaveClass(/is-fallback/);
  await expect(page.locator('#feedCinemaBody .feed-movie-link')).toHaveAttribute('href','https://example.com/kinopoisk-old');
});

test('feed deep link opens the feed directly',async({page})=>{
  await mockRudi(page);
  await page.goto('/?tab=feed');
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','feed');
  await expect(page.getByRole('tab',{name:'Лента'})).toHaveClass(/active/);
  await expect(page.locator('#feedFactsBody')).toContainText('Движение');
  await expect(page.locator('#feedFactsBody')).not.toContainText('Полезные факты');
});


test('photos show total count, daily memory and date groups',async({page})=>{
  await page.route('https://images.example.test/**',route=>route.fulfill({
    status:200,
    contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ddd"/></svg>'
  }));
  await mockRudi(page,{photoAlbum:true});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.getByRole('tab',{name:'Фото'}).click();

  await expect(page.locator('#sharedAlbumTitle')).toHaveText('Наши фото');
  await expect(page.locator('#sharedAlbumCount')).toHaveText('128 фото');
  await expect(page.locator('#sharedAlbumMemory')).toBeVisible();
  await expect(page.locator('#sharedAlbumMemoryAge')).toContainText('Это было');

  const groupTitles=await page.locator('.shared-album-group-head strong').allTextContents();
  expect(groupTitles).toContain('Сегодня');
  expect(groupTitles).toContain('Вчера');
  expect(groupTitles).toContain('Август');
  expect(groupTitles).toContain('Июль');

  await expect(page.locator('.shared-album-group .shared-album-photo')).toHaveCount(4);
  await page.locator('#sharedAlbumMemoryButton').click();
  await expect(page.locator('#photoViewer')).toHaveClass(/open/);
  await expect(page.locator('#photoViewerImage')).toHaveAttribute('src',/-full\.jpg$/);
});

test('products bought button stays interactive and completes checked products',async({page})=>{
  const state=await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.getByRole('tab',{name:'Продукты'}).click();

  const bought=page.getByRole('button',{name:'Купил'});
  await expect(bought).toBeEnabled();
  await bought.click();
  await expect(page.locator('#productsStatus')).toContainText('Сначала отметьте купленные продукты');

  await page.getByRole('button',{name:'Отметить'}).click();
  await expect(bought).toBeEnabled();
  await bought.click();

  await expect.poll(()=>state.buyCalls).toBe(1);
  await expect(page.locator('#productsHistory')).toContainText('Молоко');
  await expect(page.locator('#productsGroups')).not.toContainText('Молоко');
});
