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
    tickCalendarCalls:0
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
    if(path==='/api/partner-message'&&url.searchParams.get('rudiAction')==='reactions') return ok({ok:true,reactions:[]});
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
