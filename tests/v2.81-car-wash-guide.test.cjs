const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('v2.81 car wash guide exists and keeps six steps',()=>{
  const html=read('public/index.html');
  assert.match(html,/id="carWashGuideOpen"/);
  assert.match(html,/id="carWashGuidePage"/);
  assert.match(html,/Как мыть машину/);
  for(let n=1;n<=6;n++) assert.match(html,new RegExp('car-wash-guide-number">'+n+'<'));
});
test('v2.81 car wash guide has local car navigation',()=>{
  const js=read('public/car.js');
  assert.match(js,/function setWashGuideOpen\(open\)/);
  assert.match(js,/carWashGuideOpen/);
  assert.match(js,/carWashGuideBack/);
  assert.match(js,/body\.hidden=Boolean\(open\)/);
});
test('v2.81 car wash guide styling is isolated to car module',()=>{
  const css=read('public/car.css');
  assert.match(css,/\.car-wash-guide-open/);
  assert.match(css,/\.car-wash-guide-step/);
  assert.match(css,/html\[data-theme="light"\] \.car-wash-guide-open/);
});
