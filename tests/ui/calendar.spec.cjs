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
    bootstrapResolved:false,
    dateIdeaCalls:0,
    dateQuotaUsed:0,
    lastDatePeriod:''
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
      importantDates:[{id:'new-year',title:'Новый год',month:1,day:1,recurring:true}],
      birthdays:[],
      malePsychology:{
        enabled:true,
        startDate:'2026-09-21',
        disclaimer:'Тестовая оговорка.',
        facts:[{
          id:'ui-fact-1',
          sequence:1,
          title:'Тестовый научный факт',
          text:'Факт уже находится в карточке к первому показу интерфейса.',
          sourceLabel:'PubMed',
          sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/25581005/'
        }]
      },
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
        assigned:true,assignee:'rst'
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
      if(options.photoAlbumMany){
        return ok({
          ok:true,
          configured:true,
          albumUrl:'https://www.icloud.com/sharedalbum/#A5q2example',
          totalCount:80,
          photos:Array.from({length:80},(_,index)=>({
            id:'photo-'+index,
            url:'https://images.example.test/photo-'+index+'.jpg',
            fullUrl:'https://images.example.test/photo-'+index+'-full.jpg',
            date:new Date(Date.UTC(2026,8,21-index)).toISOString(),
            caption:'Фото '+index
          }))
        });
      }
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
    if(path==='/api/partner-message'&&url.searchParams.get('rudiAction')==='dates'){
      const quota=()=>({
        max:5,
        available:5-state.dateQuotaUsed,
        used:state.dateQuotaUsed,
        nextRefillAt:state.dateQuotaUsed?'2026-09-22T09:00:00.000Z':'',
        blockedUntil:state.dateQuotaUsed>=5?'2026-09-22T09:00:00.000Z':''
      });
      if(String(body.operation||'generate')==='status'){
        return ok({ok:true,operation:'status',quota:quota()});
      }
      state.dateIdeaCalls++;
      state.dateQuotaUsed=Math.min(5,state.dateQuotaUsed+1);
      state.lastDatePeriod=String(body.period||'');
      return ok({
        ok:true,
        period:state.lastDatePeriod,
        quota:quota(),
        ideas:[
          {id:'date-1',title:'Маршрут вслепую',description:'Вы по очереди выбираете следующую точку прогулки по монетке и выполняете маленькие задания.',duration:'1,5–2 часа'},
          {id:'date-2',title:'Фотоохота вдвоём',description:'Составьте список необычных кадров и отправляйтесь искать их по городу, не показывая друг другу результат до финала.',duration:'2 часа'},
          {id:'date-3',title:'Домашний обмен мирами',description:'Каждый готовит для другого короткий сюрприз из музыки, вкуса и истории, а потом вы меняетесь ролями.',duration:'1–2 часа'}
        ]
      });
    }
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
    if(path==='/api/partner-message'&&url.searchParams.get('rudiAction')==='market-ticker'){
      return ok({
        ok:true,
        updatedAt:'2026-09-21T09:00:00.000Z',
        partial:false,
        items:options.marketItems||[
          {id:'usd-rub',label:'USD/RUB',value:84.32,change24h:null,source:'ЦБ РФ'},
          {id:'btcusdt',label:'BTC',value:68420,change24h:2.4,source:'Bybit'},
          {id:'ethusdt',label:'ETH',value:2190.5,change24h:-1.2,source:'Bybit'}
        ]
      });
    }
    if(path==='/api/partner-message') return ok({ok:true,message:null});
    return ok({ok:true,items:[],tasks:[],photos:[]});
  });

  return state;
}

test('authenticated shell unlocks while bootstrap finishes in the background',async({page})=>{
  const state=await mockRudi(page,{bootstrapDelayMs:1500});
  await page.goto('/');
  await expect.poll(()=>state.bootstrapStarted,{timeout:1000}).toBe(true);
  await expect(page.locator('body')).toHaveClass(/auth-ok/,{timeout:1000});
  expect(state.bootstrapResolved).toBe(false);
  await expect.poll(()=>state.bootstrapResolved,{timeout:3000}).toBe(true);
  await expect(page.locator('#homeRustamTile')).toBeVisible();
  await expect(page.locator('#homeDianaTile')).toBeVisible();
});

test('remote saved home layout seeds a device that has no local order',async({page})=>{
  await mockRudi(page,{uiPreferences:{homeOrder:['smart-home','dashboard','priority','partner','daily-question','car'],blockStates:{'smart-home':true},updatedAt:'2026-09-21T09:00:00.000Z'}});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await expect(page.locator('#smartHomeTile')).toBeAttached();
  const order=await page.locator('#homeTileHost > [data-home-tile]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeTile));
  expect(order.slice(0,4)).toEqual(['smart-home','dashboard','priority','partner']);
  expect(order).toContain('daily-question');
  await expect(page.locator('#smartHomeTile')).toHaveClass(/is-collapsed/);
});

test('local saved home layout survives a different remote layout after reload',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('rudi-home-layout-v3-rustam',JSON.stringify(['dashboard','priority','partner','daily-question','quick-access','smart-home','car']));
    localStorage.setItem('rudi:ui-prefs-meta:v1:rustam','2026-09-24T20:00:00.000Z');
  });
  await mockRudi(page,{uiPreferences:{homeOrder:['smart-home','dashboard','priority','partner','daily-question','car'],blockStates:{'smart-home':true},updatedAt:'2026-09-21T09:00:00.000Z'}});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  const order=await page.locator('#homeTileHost > [data-home-tile]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeTile));
  expect(order[0]).toBe('dashboard');
  expect(order).toContain('priority');
  expect(order).toContain('smart-home');
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await expect(page.locator('#smartHomeTile')).toBeAttached();
});

test('home dashboard is compact and reorder controls use aligned icons',async({page})=>{
  await mockRudi(page,{partnerMood:'joy'});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await expect(page.locator('#homeDashboard')).toBeVisible();
  await expect(page.locator('#homeRustamTile')).toBeVisible();
  await expect(page.locator('#homeDianaTile')).toBeVisible();
  await expect(page.locator('#smartHomeTile')).toBeAttached();
  await expect(page.locator('#homeLayoutEditButton')).toHaveAttribute('aria-pressed','false');
  const order=await page.locator('#homeTileHost > [data-home-tile]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeTile));
  expect(new Set(order).size).toBe(order.length);
});

test('market ticker renders with readable themes, no overflow and persistent toggle',async({page})=>{
  await page.setViewportSize({width:320,height:760});
  await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('finances',{scroll:false}));
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','finances');
  const tile=page.locator('#marketTickerTile');
  await expect(tile).toBeVisible();
  await expect(tile.locator('#marketTickerTrack')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2)).toBe(true);
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await expect(tile).toBeVisible();
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await expect(tile).toBeVisible();
});

test('partial market ticker never duplicates the only available quote',async({page})=>{
  await mockRudi(page,{marketItems:[{id:'usd-rub',label:'USD/RUB',value:84.32,change24h:null,source:'ЦБ РФ'}]});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('finances',{scroll:false}));
  await expect(page.locator('#marketTickerTile')).toBeVisible();
  const groups=page.locator('#marketTickerTrack .market-ticker-group');
  await expect(groups).toHaveCount(1);
  expect(await groups.first().locator('.market-ticker-loading').count()).toBeLessThanOrEqual(1);
});

test('saved market ticker position is restored from shared home order',async({page})=>{
  await mockRudi(page,{
    uiPreferences:{
      homeOrder:['dashboard','rustam','diana','lulu','nearest','markets','priority','partner','new','smart-home','car'],
      blockStates:{},
      marketTickerEnabled:true,
      updatedAt:'2026-09-21T09:00:00.000Z'
    }
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  const order=await page.locator('#homeTileHost > [data-home-tile]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeTile));
  expect(order.indexOf('markets')).toBeLessThan(order.indexOf('priority'));
});

test('market ticker stops moving with reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('finances',{scroll:false}));
  const track=page.locator('#marketTickerTrack');
  await expect(track).toBeVisible();
  expect(await track.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});

test('profile collapse can be toggled without losing the mood message',async({page})=>{
  await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  const card=page.locator('#homeRustamTile');
  await expect(card).toBeVisible();
  const collapse=card.locator('.block-collapse-button').first();
  await expect(collapse).toBeAttached();
  const startedCollapsed=await card.evaluate(node=>node.classList.contains('is-collapsed'));
  await collapse.click({force:true});
  await expect.poll(()=>card.evaluate(node=>node.classList.contains('is-collapsed'))).toBe(!startedCollapsed);
  await collapse.click({force:true});
  await expect.poll(()=>card.evaluate(node=>node.classList.contains('is-collapsed'))).toBe(startedCollapsed);
  await expect(card.locator(':scope > #moodMessage')).toHaveCount(1);
});

test('iPhone calendar taps, spacing and silent refresh stay stable',async({page})=>{
  const state=await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('schedule',{scroll:false}));
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','schedule');
  await expect(page.locator('#workCalendarDays')).toBeVisible();
  await expect(page.locator('#workCalendarDays .calendar-day-cell')).toHaveCount(30);
  const before=state.workCalendarCalls;
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('schedule',{scroll:false}));
  await page.waitForTimeout(200);
  expect(state.workCalendarCalls-before).toBeLessThanOrEqual(1);
});

test('calendar task completes in TickTick and refreshes in place with confetti',async({page})=>{
  const state=await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('schedule',{scroll:false}));
  await expect(page.locator('#workCalendarDays .calendar-day-cell')).toHaveCount(30);
  const day=page.locator('.calendar-day-cell[aria-label*="23 сентября"]');
  await day.click();
  await expect(day).toHaveClass(/selected/);
  await expect(page.locator('#workCalendarSelected')).toContainText('Купить продукты');
  const task=page.getByRole('checkbox',{name:/Купить продукты/});
  await task.click();
  await expect.poll(()=>state.completionCalls).toBe(1);
  await expect(page.locator('#workCalendarSelected')).not.toContainText('Купить продукты');
});

test('feed is structured, today-first and keeps five-tab layout',async({page})=>{
  await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  const bar=page.locator('#appTabBar');
  await expect(bar.locator('[data-app-tab]')).toHaveCount(5);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('feed',{scroll:false}));
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','feed');
  await expect(page.locator('#feedToday')).toBeVisible();
  await expect(page.locator('#feedCinemaBody .feed-movie-card')).toHaveCount(1);
  await expect(page.locator('#feedCinemaBody .feed-movie-title')).toContainText('Тестовый фильм');
  await expect(page.locator('#feedTodayLinks')).toBeVisible();
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
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','feed');
  await expect(page.locator('#feedToday')).toBeVisible();
  await expect(page.locator('#feedCinemaBody .feed-movie-card')).toHaveCount(1);
});

test('photos show total count, daily memory and date groups',async({page})=>{
  await page.route('https://images.example.test/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ddd"/></svg>'}));
  await mockRudi(page,{photoAlbum:true});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('photos',{scroll:false}));
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','photos');
  await expect(page.locator('#sharedAlbumTitle')).toHaveText('Наш альбом');
  await expect(page.locator('#sharedAlbumCount')).toContainText('128');
  await expect(page.locator('.shared-album-photo')).toHaveCount(4);
});

test('products bought button stays interactive and completes checked products',async({page})=>{
  const state=await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('products',{scroll:false}));
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','products');
  const bought=page.getByRole('button',{name:'Купил'});
  await expect(bought).toBeEnabled();
  await bought.click();
  await expect(page.locator('#productsStatus')).toContainText('Сначала отметь купленные продукты');
  await page.getByRole('button',{name:'Отметить'}).click();
  await bought.click();
  await expect.poll(()=>state.buyCalls).toBe(1);
  await expect(page.locator('#productsHistory')).toContainText('Молоко');
});

test('nearest card stays on Home only',async({page})=>{
  await mockRudi(page,{partnerMood:'ok'});
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  const nearest=page.locator('#homeNearestBlock');
  await expect(nearest).toBeAttached();
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('feed',{scroll:false}));
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','feed');
  await expect(nearest).toBeHidden();
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('home',{scroll:false}));
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','home');
  await expect.poll(async()=>{
    const isEmpty=await nearest.getAttribute('data-home-empty');
    return isEmpty==='1' ? !(await nearest.isVisible()) : (await nearest.isVisible());
  }).toBe(true);
});

test('quick access opens wishlist and generates cached date ideas only after period choice',async({page})=>{
  const state=await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  const order=await page.locator('#homeTileHost > [data-home-tile]').evaluateAll(nodes=>nodes.map(node=>node.dataset.homeTile));
  expect(order).toContain('quick-access');
  await page.locator('#quickWishlistButton').click();
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','wishlist');
  await expect(page.locator('.wishlist-page-title')).toContainText('вишлист');
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('dates',{scroll:false}));
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','dates');
  await expect(page.locator('#dateTimeChoices')).toBeVisible();
  expect(state.dateIdeaCalls).toBe(0);
  await page.locator('[data-date-period="evening"]').click();
  await expect.poll(()=>state.dateIdeaCalls).toBe(1);
});

test('photo thumbnails stay rendered after long scrolling and viewer upgrades preview to full size',async({page})=>{
  await page.route('https://images.example.test/**',route=>route.fulfill({
    status:200,
    contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#bbb"/></svg>'
  }));
  await mockRudi(page,{photoAlbumMany:true});
  await page.goto('/?tab=photos');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);

  const thumbs=page.locator('.shared-album-photo img');
  await expect(thumbs).toHaveCount(80);
  const last=thumbs.last();
  await last.scrollIntoViewIfNeeded();
  await expect.poll(()=>last.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);

  await page.evaluate(()=>window.scrollTo(0,0));
  const first=thumbs.first();
  await first.scrollIntoViewIfNeeded();
  await expect.poll(()=>first.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);

  const transition=await page.locator('.shared-album-photo').first().evaluate(el=>getComputedStyle(el).transitionProperty);
  expect(transition).not.toContain('transform');

  await page.locator('.shared-album-photo').last().click();
  await expect(page.locator('#photoViewer')).toHaveClass(/open/);
  await expect.poll(()=>page.locator('#photoViewerImage').getAttribute('src')).toMatch(/photo-79(?:-full)?\.jpg$/);
  await expect(page.locator('#photoViewerImage')).toHaveAttribute('src',/photo-79-full\.jpg$/);
});


test('income action offers wallet setup when no wallet exists',async({page})=>{
  await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  // Income requires an account; the first action offers the wallet form.
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('finances',{scroll:false}));
  await expect(page.locator('#financeIncomeAddButton')).toBeVisible();
  await page.locator('#financeIncomeAddButton').click();
  await expect(page.locator('#financeWalletComposer')).toBeVisible();
  await expect(page.locator('#financeWalletName')).toBeVisible();
});

test('new wallet tile opens a working wallet form',async({page})=>{
  await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);
  await page.evaluate(()=>window.RUDI_NAVIGATE_TO_TAB('finances',{scroll:false}));
  await expect(page.locator('#financeWalletList')).toBeVisible();
  await expect(page.locator('#financeWalletCreateButton')).toBeVisible();
  await page.locator('#financeWalletCreateButton').click();
  await expect(page.locator('#financeWalletComposer')).toBeVisible();
  await expect(page.locator('#financeWalletName')).toBeVisible();
});
