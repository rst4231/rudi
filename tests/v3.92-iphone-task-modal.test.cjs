const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v3.92 keeps iPhone task modal inside viewport',()=>{
  const css=read('public/app.css');
  const html=read('public/index.html');
  const js=read('public/app.js');
  assert.match(css,/max-width:100%;box-sizing:border-box;max-height/);
  assert.match(css,/max-inline-size:100%!important;box-sizing:border-box!important/);
  assert.match(css,/ticktick-task-date-time-row/);
  assert.match(html,/id="ticktickTaskTimeInput" type="time" value="08:00"/);
  assert.match(js,/if\(timeInput\) timeInput\.value='08:00'/);
  assert.match(html,/rudi-version" content="v3\.93"/);
  assert.equal(read('VERSION').trim(),'v3.93');
});
