const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'..','public/car.css'),'utf8');
test('v2.82 car wash light theme has strong contrast',()=>{
  assert.match(css,/html\[data-theme="light"\] \.car-wash-guide-open\{[\s\S]*background:linear-gradient\(135deg,#f7fbff 0%,#ffffff 70%\)/);
  assert.match(css,/html\[data-theme="light"\] \.car-wash-guide-open-copy strong,[\s\S]*color:#151b24/);
  assert.match(css,/html\[data-theme="light"\] \.car-wash-guide-step p\{[\s\S]*color:#445160/);
  assert.match(css,/html\[data-theme="light"\] \.car-wash-guide-number\{[\s\S]*color:#2c5f8f/);
  assert.match(css,/html\[data-theme="light"\] \.car-wash-guide-tip\{[\s\S]*color:#34485b/);
});
