const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('public/smart-home.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/smart-home.css','utf8');
const appCss=fs.readFileSync('public/app.css','utf8');
function assess(type,value,date='2026-10-08T12:00:00Z'){
  const window={},document={readyState:'loading',addEventListener(){}};
  vm.runInNewContext(script,{window,document,Intl,Date,console,setTimeout,clearTimeout});
  const result=window.RUDI_SMART_HOME.assessClimate(type,value,new Date(date));
  return result===null?null:{...result};
}
test('cold season 24.2C shows warm while 21C is normal',()=>{
  assert.deepEqual(assess('temperature',24.2),{label:'Тепловато',level:'caution'});
  assert.deepEqual(assess('temperature',21),{label:'Норма',level:'normal'});
  assert.deepEqual(assess('temperature',18.5),{label:'Прохладно',level:'caution'});
  assert.deepEqual(assess('temperature',17),{label:'Холодно',level:'alert'});
  assert.deepEqual(assess('temperature',27),{label:'Жарко',level:'alert'});
});
test('warm season 24.2C is normal with seasonal thresholds',()=>{
  assert.deepEqual(assess('temperature',24.2,'2026-07-08T12:00:00Z'),{label:'Норма',level:'normal'});
  assert.deepEqual(assess('temperature',27,'2026-07-08T12:00:00Z'),{label:'Тепловато',level:'caution'});
  assert.deepEqual(assess('temperature',29,'2026-07-08T12:00:00Z'),{label:'Жарко',level:'alert'});
});
test('humidity 46 percent is normal while extremes have alerts',()=>{
  for(const [value,label,level] of [[20,'Сухо','alert'],[30,'Норма','normal'],[46,'Норма','normal'],[50,'Норма','normal'],[55,'Влажновато','caution'],[60,'Влажновато','caution'],[61,'Слишком влажно','alert']])
    assert.deepEqual(assess('humidity',value),{label,level});
});
test('missing or impossible sensor readings do not receive statuses',()=>{
  for(const value of [null,undefined,'','invalid',NaN,Infinity]){
    assert.equal(assess('temperature',value),null);
    assert.equal(assess('humidity',value),null);
  }
  assert.equal(assess('humidity',-1),null);
  assert.equal(assess('humidity',101),null);
});
test('sensor assessments stay under captions and are colored by severity',()=>{
  assert.match(html,/<small>Температура<\/small>\s*<div id="smartHomeTemperatureAssessment"[^>]*hidden/);
  assert.match(html,/<small id="smartHomeHumidityHint">Влажность<\/small>\s*<div id="smartHomeHumidityAssessment"[^>]*hidden/);
  assert.match(css,/"icon assessment"/);
  assert.match(css,/\.smart-home-climate-assessment\.is-normal/);
  assert.match(css,/\.smart-home-climate-assessment\.is-caution/);
  assert.match(css,/\.smart-home-climate-assessment\.is-alert/);
});
test('Copy is as compact as Go and Expand, keeping copy behavior',()=>{
  const styles=appCss.match(/\.smart-save-copy\{([^}]+)\}/)?.[1]||'';
  const open=appCss.match(/\.smart-save-open\{([^}]+)\}/)?.[1]||'';
  const expand=appCss.match(/\.smart-save-expand\{([^}]+)\}/)?.[1]||'';
  for(const rule of ['padding:5px 8px','border-radius:9px','font-size:9.5px','margin-top:3px']){
    assert.ok(styles.includes(rule),rule);
    assert.ok(open.includes(rule),rule);
    assert.ok(expand.includes(rule),rule);
  }
  assert.ok(!styles.includes('min-height:34px'));
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/copy\.className='smart-save-copy'/);
  assert.match(app,/copy\.textContent='Скопировать'/);
});
