const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const extras=fs.readFileSync(path.join(root,'public','pwa-extras.js'),'utf8');

test('redundant UI labels are removed or shortened',()=>{
  assert.doesNotMatch(html,/>Для нас</);
  assert.doesNotMatch(html,/>Для Дианы</);
  assert.doesNotMatch(html,/>Домашнее</);
  assert.doesNotMatch(html,/>Общий список</);
  assert.doesNotMatch(html,/>Рецепты с ИИ</);
  assert.doesNotMatch(html,/>Наши желания</);
  assert.doesNotMatch(html,/>Личный раздел</);
  assert.doesNotMatch(html,/>AI-генератор</);
  assert.match(html,/>3 идеи для свидания</);
  assert.match(html,/<strong>Свидания<\/strong>/);
});

test('For Di labor cards remove duplicate title and use named link',()=>{
  assert.match(extras,/function forDiDisplayText\(item\)/);
  assert.match(extras,/Трудовой кодекс/);
  assert.match(extras,/Актуальная редакция ТК РФ/);
  assert.match(extras,/linkLabel:laborItem\?'Подробнее':''/);
  assert.match(extras,/link\.textContent=linkLabel\|\|url/);
});

test('For Di persistent explanatory status is hidden after render',()=>{
  assert.match(html,/id="forDiStatus"[^>]+hidden/);
  assert.match(extras,/status\.hidden=true/);
});
