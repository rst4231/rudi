const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const helpers=app.slice(app.indexOf('      function parseCycleDate('),app.indexOf('      function renderDianaCycle('));
for(const mode of ['month','week'])for(const theme of ['light','dark']){
 test(`period and other dots share a centered row in ${mode}, ${theme}`,async({page})=>{
  await page.setContent(`<html data-theme="${theme}"><body data-calendar-scope="shared"><main class="work-page"><div id="workCalendarDays" data-calendar-mode="${mode}"><button class="calendar-day-cell has-tasks today" data-date="2026-10-22"><span class="calendar-date-number">22</span><span class="calendar-day-indicators"><span class="calendar-task-count"></span><span class="rudi-entertainment-marker"></span></span></button><button class="calendar-day-cell" data-date="2026-10-23"><span class="calendar-date-number">23</span></button></div></main></body></html>`);
  for(const file of ['app.css','calendar.css','calendar-entertainment.css'])await page.addStyleTag({path:'public/'+file});
  await page.evaluate(helpers+`;window.calendarScope='shared';window.currentActor='Рустам';window.DAY=86400000;window.todayState=()=>({utc:Date.UTC(2026,9,22)});window.currentDianaCycleConfig={historyStarts:['2026-10-21'],periodLengthDays:6};applyDianaPeriodDots();applyDianaPeriodDots();`);
  const first=page.locator('[data-date="2026-10-22"]');
  await expect(first.locator('.calendar-day-indicators .calendar-period-dot')).toHaveCount(1);
  await expect(page.locator('[data-date="2026-10-23"] .calendar-day-indicators .calendar-period-dot')).toHaveCount(1);
  const boxes=await first.locator('.calendar-day-indicators > span').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));
  expect(boxes).toHaveLength(3);
  expect(Math.max(...boxes.map(r=>r.y))-Math.min(...boxes.map(r=>r.y))).toBeLessThan(.5);
  for(const box of boxes){expect(box.width).toBe(6);expect(box.height).toBe(6)}
  const cell=await first.boundingBox();
  expect(Math.abs((boxes[0].x+boxes.at(-1).x+6)/2-(cell.x+cell.width/2))).toBeLessThan(.5);
  for(let i=1;i<boxes.length;i++)expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i-1].x+6);
  // Moving into Rustam's private calendar removes period data.
  await page.evaluate(()=>{calendarScope='personal';applyDianaPeriodDots()});
  await expect(page.locator('.calendar-period-dot')).toHaveCount(0);
 });
}
