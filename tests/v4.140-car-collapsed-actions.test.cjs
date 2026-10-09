const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const car=fs.readFileSync('public/car.js','utf8');
const css=fs.readFileSync('public/car.css','utf8');
test('car add actions live in expanded card bodies',()=>{
  assert.match(car,/tasks\.prepend\(add,form\)/);
  assert.match(car,/errors\.prepend\(add\)/);
  assert.match(car,/add\.classList\.add\('car-body-add'\)/);
  assert.doesNotMatch(car,/taskCard\.querySelector\('\.car-smart-card-actions'\)\?\.prepend\(add\)/);
  assert.doesNotMatch(car,/errorCard\.querySelector\('\.car-smart-card-actions'\)\?\.prepend\(errorActions\)/);
  assert.match(car,/carSmartBody-'\+id/);
  assert.match(css,/\.car-smart-card\.is-collapsed \.car-smart-card-body\{grid-template-rows:0fr\}/);
  assert.match(css,/\.car-smart-card\[data-car-card="errors"\] \.car-body-add/);
  assert.match(css,/\.car-smart-card\[data-car-card="tasks"\] \.car-body-add/);
});
