const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('./calendar.spec.cjs'),'utf8');
const prefix=source.slice(0,source.indexOf("\ntest('"));
for(const width of [375,393,430])for(const actor of ['Рустам','Диана'])for(const theme of ['light','dark'])test('text spacing matches Lulu: '+actor+' / '+theme+' / '+width,async({page})=>{
 await page.setViewportSize({width,height:852});
 const swap=text=>text.replaceAll('Рустам','__RUDI_FIRST__').replaceAll('Диана','Рустам').replaceAll('__RUDI_FIRST__','Диана');
 const fixture={require,URL,Buffer,Response,console,setTimeout,clearTimeout};
 vm.runInNewContext((actor==='Диана'?swap(prefix):prefix)+';this.mock=mockRudi',fixture);
 await fixture.mock(page);await page.goto('/');
 await expect(page.locator('body')).toHaveClass(/auth-ok/);
 await expect(page.locator('#homeLuluTile .lulu-walk-status')).toBeVisible();
 await page.evaluate(theme=>{
  document.documentElement.dataset.theme=theme;
  const cycle=document.querySelector('#homeDianaTile .profile-cycle-mood');cycle.textContent='Фертильные дни';cycle.hidden=false;
 },theme);
 const geometry=await page.evaluate(()=>{
  const rect=el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect()};
  const cards=['#homeRustamTile','#homeDianaTile','#homeLuluTile'].map(selector=>{
   const card=document.querySelector(selector),name=card.querySelector('.name,.lulu-name'),status=card.querySelector('.profile-work-status,.lulu-walk-status');
   const a=rect(name),b=rect(status),cycle=card.querySelector('.profile-cycle-mood');
   const mood=card.querySelector('.profile-name-row .avatar-mood-badge');
   return {selector,gap:b.top-a.bottom,cycleGap:cycle&&!cycle.hidden?rect(cycle).top-b.bottom:null,moodHeight:mood&&!mood.hidden?mood.getBoundingClientRect().height:null};
  });return cards;
 });
 const reference=geometry[2].gap;
 for(const row of geometry.slice(0,2)){
  expect(Math.abs(row.gap-reference),JSON.stringify(geometry)).toBeLessThanOrEqual(1.5);
  if(row.cycleGap!==null)expect(Math.abs(row.cycleGap-reference),JSON.stringify(geometry)).toBeLessThanOrEqual(1.5);
  if(row.moodHeight!==null)expect(row.moodHeight).toBeGreaterThanOrEqual(26);
 }
});
