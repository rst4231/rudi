'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('public/app.js','utf8');
const ai=fs.readFileSync('public/personal-center.js','utf8');
const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
const aiCss=fs.readFileSync('public/personal-center.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

function navHarness(path='/?tab=products'){
  const rows=[{url:new URL(path,'https://rudi.test/').href,state:null}];
  let index=0;
  const window={location:new URL(rows[0].url)};
  const history={
    get state(){return rows[index].state},
    pushState(state,unused,url){
      rows.splice(index+1);
      rows.push({url:new URL(url,window.location.href).href,state});
      index=rows.length-1;
      window.location=new URL(rows[index].url);
    },
    replaceState(state,unused,url){
      rows[index]={url:new URL(url,window.location.href).href,state};
      window.location=new URL(rows[index].url);
    },
    back(){this.go(-1)},
    go(delta){
      const next=index+delta;
      if(next>=0&&next<rows.length){index=next;window.location=new URL(rows[index].url)}
    }
  };
  const navSource=app.slice(app.indexOf('      function ensureAppHistoryState(){'),app.indexOf('      function focusDeepLinkedItem('));
  const backSource=app.slice(app.indexOf('      function navigateBackInApp('),app.indexOf('      window.RUDI_GO_BACK=navigateBackInApp;'));
  assert.ok(navSource.includes('function updateAppRoute'));
  assert.ok(backSource.includes('function navigateBackInApp'));
  const context={URL,window,history,APP_TABS:['home','products','schedule','finances','car','wishlist','settings'],routeHistoryDepth:0};
  context.navigateToAppTab=(tab,options)=>context.updateAppRoute(tab,options);
  vm.createContext(context);
  vm.runInContext(navSource+'\n'+backSource+'\nthis.ensureAppHistoryState=ensureAppHistoryState;this.updateAppRoute=updateAppRoute;this.navigateBackInApp=navigateBackInApp;',context,{timeout:1500});
  context.ensureAppHistoryState();
  return {rows,history,window,context,get index(){return index}};
}

test('Products -> Home -> AI -> browser Back returns to Home, not stale Products',()=>{
 const nav=navHarness('/?tab=products');
 nav.context.updateAppRoute('home');
 assert.equal(nav.window.location.search,'');
 assert.equal(nav.history.state.rudiNavDepth,1);
 nav.history.pushState({...nav.history.state,rudiOverlay:'personal-ai',rudiAiSheet:null},'',nav.window.location.href);
 nav.history.back();
 assert.equal(nav.window.location.search,'');
 assert.equal(nav.history.state.rudiOverlay,null);
 nav.context.navigateBackInApp();
 assert.equal(nav.window.location.search,'?tab=products');
});

test('AI center subpage adds one nested back level',()=>{
 const nav=navHarness('/?tab=products');
 nav.context.updateAppRoute('home');
 nav.history.pushState({...nav.history.state,rudiOverlay:'personal-ai',rudiAiSheet:null},'',nav.window.location.href);
 nav.history.pushState({...nav.history.state,rudiAiSheet:'report'},'',nav.window.location.href);
 nav.history.back();
 assert.equal(nav.history.state.rudiOverlay,'personal-ai');
 assert.equal(nav.history.state.rudiAiSheet,null);
 nav.history.back();
 assert.equal(nav.history.state.rudiOverlay,null);
 assert.equal(nav.window.location.pathname,'/');
});

test('Repeated back traverses actual section history, including finances and car',()=>{
 const nav=navHarness('/');
 nav.context.updateAppRoute('products');
 nav.context.updateAppRoute('finances');
 nav.context.updateAppRoute('car');
 nav.context.navigateBackInApp();
 assert.equal(nav.window.location.search,'?tab=finances');
 nav.context.navigateBackInApp();
 assert.equal(nav.window.location.search,'?tab=products');
 nav.context.navigateBackInApp();
 assert.equal(nav.window.location.search,'');
});

test('Direct deep link cannot jump outside app on back',()=>{
 const nav=navHarness('/?tab=wishlist');
 assert.equal(nav.history.state.rudiNavDepth,0);
 nav.context.navigateBackInApp();
 assert.equal(nav.window.location.search,'');
 assert.equal(nav.rows.length,1);
});

test('Interrupted fallback transition must not execute stale page update',()=>{
 assert.match(app,/const revision=\+\+appTransitionRevision/);
 assert.match(app,/if\(revision!==appTransitionRevision\)return/);
 assert.match(app,/document\.querySelectorAll\('\.rudi-route-enter,\.rudi-route-leave'\)/);
 assert.match(app,/const direction=nextDepth<routeHistoryDepth\?'back':'forward'/);
});

test('PWA routes and back buttons use one shared app navigation',()=>{
 assert.match(pwa,/window\.RUDI_NAVIGATE_TO_TAB\(next,\{item,scroll:true\}\)/);
 assert.equal((pwa.match(/window\.RUDI_GO_BACK\(\)/g)||[]).length,2);
 assert.match(app,/installAppEdgeSwipeBack\(\);/);
 assert.match(app,/currentAppTab==='schedule'&&calendarDisplayMode==='week'/);
});

test('AI overlay uses browser history and has animated opening and closing',()=>{
 assert.match(ai,/rudiOverlay:'personal-ai',rudiAiSheet:null/);
 assert.match(ai,/history\.go\(history\.state\?\.rudiAiSheet\?-2:-1\)/);
 assert.match(ai,/window\.addEventListener\('popstate'/);
 assert.match(ai,/closeSheet\(\{fromHistory:true\}\)/);
 assert.match(aiCss,/\.rudi-center\.is-closing\{/);
 assert.match(aiCss,/\.rudi-center__overlay\.is-closing\{/);
 assert.match(aiCss,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(aiCss,/\.rudi-center\{height:100dvh;animation:none!important/);
});

test('Versioned shell references new navigation code for iOS PWA cache refresh',()=>{
 const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current;
 const suffix=version.replace(/^v/,'');
 for(const name of ['app.js','pwa-extras.js','personal-center.js','personal-center.css']){
   assert.ok(html.includes('/'+name+'?v='+suffix),name);
 }
});
