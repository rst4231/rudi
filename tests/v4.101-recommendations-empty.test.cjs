const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/recommendations.css','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const script=fs.readFileSync('public/recommendations.js','utf8');

function mount(){
  const tile={dataset:{appTabSection:'home',homeEmpty:'1'},hidden:true};
  const list={
    children:[],
    replaceChildren(){this.children=[]},
    append(node){this.children.push(node)}
  };
  const body={dataset:{rudiActor:'Рустам'},classList:{contains:(name)=>name==='auth-ok'}};
  const document={
    body,
    getElementById:(id)=>id==='rudiRecommendationsTile'?tile:id==='rudiRecommendationsList'?list:null,
    createElement:(tag)=>({
      tag,dataset:{},disabled:false,children:[],
      append(...children){this.children.push(...children)},
      setAttribute(){},addEventListener(){},
    }),
    addEventListener(){},
  };
  const window={Telegram:{WebApp:{initData:'test'}},addEventListener(){},RUDI_NAVIGATE_TO_TAB(){}};
  let rows=[],fail=false;
  const fetch=async()=>{
    if(fail)throw new Error('temporary offline');
    return {ok:true,json:async()=>({ok:true,recommendations:rows})};
  };
  const context={
    window,document,fetch,AbortController,MutationObserver:class{observe(){}},
    setInterval:()=>1,clearInterval:()=>{},setTimeout,clearTimeout,
    console:{warn(){}}
  };
  vm.runInNewContext(script,context,{timeout:2000});
  return {
    tile,list,window,
    respond:(value)=>{rows=value;fail=false},
    offline:()=>{fail=true},
    refresh:()=>window.RUDI_RECOMMENDATIONS.refresh(true),
    // This mirrors the exact home-tab visibility condition in app.js.
    navigateHome(){tile.hidden=tile.dataset.appTabSection!=='home'||tile.dataset.homeEmpty==='1';}
  };
}

test('initial recommendations block is marked empty before scripts run',()=>{
  const start=html.match(/<section id="rudiRecommendationsTile"[^>]*>/)?.[0]||'';
  assert.match(start,/data-home-empty="1"/);
  assert.match(start,/ hidden>/);
  assert.match(css,/\.rudi-recommendations\[data-home-empty="1"\]\{display:none!important\}/);
  assert.match(app,/section\.dataset\.homeEmpty==='1'/);
});

test('empty results stay hidden after home navigation',async()=>{
  const ui=mount();
  await ui.refresh();
  assert.equal(ui.tile.dataset.homeEmpty,'1');
  assert.equal(ui.tile.hidden,true);
  ui.navigateHome();
  assert.equal(ui.tile.hidden,true);
  assert.equal(ui.list.children.length,0);
});

test('recommendations appear and disappear when the last one is hidden',async()=>{
  const ui=mount();
  await ui.refresh();
  ui.respond([{id:'tasks:2026-10-08',title:'Много дел',detail:'Смотри задачи',action:'Открыть',tab:'home'}]);
  await ui.refresh();
  assert.equal(ui.tile.dataset.homeEmpty,'0');
  assert.equal(ui.tile.hidden,false);
  assert.equal(ui.list.children.length,1);
  ui.navigateHome();
  assert.equal(ui.tile.hidden,false);
  ui.respond([]);
  await ui.refresh();
  assert.equal(ui.tile.dataset.homeEmpty,'1');
  assert.equal(ui.tile.hidden,true);
  ui.navigateHome();
  assert.equal(ui.tile.hidden,true);
});

test('failed refresh cannot resurrect a stale empty recommendations card',async()=>{
  const ui=mount();
  await ui.refresh();
  ui.offline();
  await ui.refresh();
  ui.navigateHome();
  assert.equal(ui.tile.hidden,true);
  assert.equal(ui.tile.dataset.homeEmpty,'1');
});
