const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function viewport({standalone=false,ios=true,height=793,screenHeight=852,focused=false,visualHeight=height}={}){
 const values={};const root={clientHeight:height,style:{setProperty(k,v){values[k]=v}}};
 const window={innerHeight:height,screen:{height:screenHeight,width:393},matchMedia:()=>({matches:standalone}),addEventListener(){},visualViewport:{height:visualHeight,offsetTop:0,addEventListener(){}}};
 const document={documentElement:root,activeElement:{matches:()=>focused},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('public/viewport.js','utf8'),{window,document,navigator:{userAgent:ios?'iPhone':'Android',standalone},requestAnimationFrame:fn=>fn()});
 return values['--rudi-viewport-height'];
}
test('installed translucent iPhone app covers the full screen when WebKit reports a shorter viewport',()=>assert.equal(viewport({standalone:true}),'852px'));
test('Safari uses its visible viewport rather than the physical screen',()=>assert.equal(viewport(),'793px'));
test('keyboard contracts the viewport without adding the home safe area twice',()=>assert.equal(viewport({standalone:true,focused:true,visualHeight:420}),'420px'));
test('non-iPhone standalone uses the viewport',()=>assert.equal(viewport({standalone:true,ios:false}),'793px'));
