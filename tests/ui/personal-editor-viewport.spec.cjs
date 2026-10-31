const {test,expect}=require('@playwright/test');
for(const height of [640,844])test('recurring task editor keeps its header visible at height '+height,async({page})=>{
 await page.setViewportSize({width:390,height});
 await page.route('http://127.0.0.1:4173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/personal-task-editor.css"><body data-rudi-actor="Рустам"><script src="/personal-task-editor.js"></script>'}));
 await page.route('**/api/partner-message?ticktickAction=personal-task-projects',route=>route.fulfill({json:{ok:true,writable:true,lists:[{id:'joy',name:'Личностный рост'}]}}));
 await page.goto('/');await page.evaluate(()=>RUDIPersonalTaskEditor.open({id:'1',personal:true,title:'Практика с ДПС',projectId:'joy',date:'2026-10-24',startTime:'16:30',repeatFlag:'RRULE:FREQ=WEEKLY;BYDAY=SA,SU',description:'Длинное описание '.repeat(25)},{actor:'Рустам'}));
 await expect(page.locator('#rudiPersonalTaskHeading')).toBeInViewport();
 const sheet=await page.locator('.ticktick-task-modal-sheet').boundingBox();expect(sheet.y).toBeGreaterThanOrEqual(14);expect(sheet.height).toBeLessThanOrEqual(680);expect(sheet.y+sheet.height).toBeLessThanOrEqual(height-13);
 await page.locator('#rudiPersonalTaskDescription').scrollIntoViewIfNeeded();await expect(page.locator('#rudiPersonalTaskHeading')).toBeInViewport();await expect(page.locator('.rudi-personal-save')).toBeInViewport();
 expect(await page.locator('.ticktick-task-modal-sheet').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
