const {test,expect}=require('@playwright/test');

function monthDays(year,month){
  const count=new Date(Date.UTC(year,month,0)).getUTCDate();
  return Array.from({length:count},(_,index)=>{
    const day=index+1;
    const date=[year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
    return {date,working:day%3===0,events:day%3===0?[{title:'Смена',startTime:'09:00',endTime:'21:00',allDay:false}]:[]};
  });
}

async function mockRudi(page){
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
    reactions:{}
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
      return ok({
        ok:true,actor:'Рустам',
        selfProfile:{name:'Рустам'},partnerProfile:{name:'Диана'},
        holidayHighlights:[]
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
          facts:{parts:['💡 <b>Полезный факт</b>\\n🚶 <b>Движение</b>\\n\\nТестовая польза.\\n\\n<a href="https://example.com/study">Исследование →</a>'],updatedAt:'2026-09-21T06:40:00.000Z'},
          events:{parts:[
            '🎤 <b>Концерт сегодня</b>\\n\\n<a href="https://example.com/concert">Подробнее →</a>',
            '🎙 <b>Stage StandUp Club</b>\\n📅 Понедельник, 21 сентября\\nНайдено событий/сеансов: <b>2</b>\\n1. <b>Первый стендап</b>\\n🕒 19:00\\n<a href="https://example.com/standup-1">Официальная страница →</a>\\n2. <b>Второй стендап</b>\\n🕒 20:00\\n<a href="https://example.com/standup-2">Официальная страница →</a>'
          ],updatedAt:'2026-09-21T06:41:00.000Z'},
          cinema:{parts:['🎬 <b>Кинопремьеры</b>\\n\\n1. Тестовый фильм'],updatedAt:'2026-09-21T06:42:00.000Z'}
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
    if(path==='/api/shared-album') return ok({ok:true,photos:[],url:''});
    if(path==='/api/wishlist') return ok({ok:true,items:[]});
    if(path==='/api/mood') return ok({ok:true,items:[]});
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


test('feed is a first-class tab with fresh badge and no duplicate cinema button on home',async({page})=>{
  await mockRudi(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/auth-ok/);

  await expect(page.locator('#compliment')).toHaveCount(0);
  await expect(page.locator('#cinemaPremieresButton')).toHaveCount(0);
  await expect(page.locator('#feedTabBadge')).toBeVisible();

  await page.getByRole('tab',{name:'Лента'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','feed');
  await expect(page.locator('#feedTitle')).toHaveText('Лента');
  await expect(page.locator('#feedFactsBody')).toContainText('Полезный факт');
  await expect(page.locator('#feedConcertsBody')).toContainText('Концерт сегодня');
  await expect(page.locator('#feedStandupBody')).toContainText('Stand Up сегодня');
  await expect(page.locator('#feedCinemaBody')).toContainText('Тестовый фильм');
  await expect(page.locator('.profile-weather')).toHaveCount(0);

  const factPart=page.locator('#feedFactsBody .feed-part');
  await expect(factPart.locator('br')).toHaveCount(5);
  await expect(factPart.locator('a')).toHaveCSS('display','block');

  const standupPart=page.locator('#feedStandupBody .feed-part');
  await expect(standupPart).toContainText('Первый стендап');
  await expect(standupPart).toContainText('Второй стендап');
  expect(await standupPart.locator('br').count()).toBeGreaterThanOrEqual(8);
  const standupText=await standupPart.innerText();
  expect(standupText).toMatch(/Официальная страница →\s*\n+\s*2\. Второй стендап/);

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

test('feed deep link opens the feed directly',async({page})=>{
  await mockRudi(page);
  await page.goto('/?tab=feed');
  await expect(page.locator('body')).toHaveAttribute('data-app-tab','feed');
  await expect(page.getByRole('tab',{name:'Лента'})).toHaveClass(/active/);
  await expect(page.locator('#feedFactsBody')).toContainText('Полезный факт');
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
