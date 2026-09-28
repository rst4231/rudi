const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

test('v2.98 uses actor-aware gender for personal UI copy',()=>{
  const app=read('public/app.js');
  const profile=read('public/profile-supplements.js');
  const advanced=read('public/supplement-advanced.js');
  const editor=read('public/supplement-editor.js');
  const pwa=read('public/pwa-extras.js');
  const partner=read('api/partner-message.js');
  const html=read('public/index.html');

  assert.match(app,/currentActor==='Диана'\?'Купила':'Купил'/);
  assert.match(app,/actor==='Диана'\?'💊 Сегодня приняла':'💊 Сегодня принял'/);
  assert.match(app,/Сегодня ты уже ответил'\+\(currentActor==='Диана'\?'а':''\)/);
  assert.doesNotMatch(html,/id="productsBought"[^>]*>Купил<\/button>/);

  assert.match(profile,/const habitFemale=app\(\)\.getActor\(\)==='Диана'/);
  assert.match(profile,/habitFemale\?'Сделала':'Сделал'/);
  assert.match(profile,/habitFemale\?'Не сделала':'Не сделал'/);
  assert.match(profile,/habitFemale\?'не отметила':'не отметил'/);
  assert.match(profile,/habitFemale\?'нажала':'нажал'/);

  assert.match(advanced,/isDiana\(\)\?'✓ Приняла':'✓ Принял'/);
  assert.match(advanced,/isDiana\(\)\?'✓ Приняла сегодня':'✓ Принял сегодня'/);
  assert.match(advanced,/isDiana\(\)\?'Закончила':'Закончил'/);
  assert.match(editor,/getActor\(\)==='Диана'\?'Закончила':'Закончил'/);

  assert.match(pwa,/Сохранил'\+\(item\.savedBy==='Диана'\?'а ':' '\)/);
  assert.match(partner,/activityVerb\(actor,'Погулял с Лулу','Погуляла с Лулу'\)/);
});

test('v2.98 removes stale formal and machine-like UI copy',()=>{
  const app=read('public/app.js');
  const extras=read('public/pwa-extras.js');
  const profile=read('public/profile-supplements.js');
  const supplements=read('public/supplement-advanced.js');
  const index=read('public/index.html');
  const car=read('public/car.js');
  const mood=read('public/mood-history.js');

  assert.doesNotMatch(app,/Попробуйте ещё раз|Введите ровно 6 цифр|Потяните для обновления|Отпустите для обновления|Регламентный рубеж достигнут|Температура пограничная/);
  assert.doesNotMatch(extras,/Ищет по всей базе RUDI|Введите ещё один символ/);
  assert.doesNotMatch(profile,/AI создал краткое описание|Groq проверяет/);
  assert.doesNotMatch(supplements,/Дубли состава|Принято сегодня|Groq проверяет/);
  assert.doesNotMatch(index,/Оставьте здесь|Напишите что-нибудь тёплое|Напишите сообщение|placeholder="Напишите RUDI/);
  assert.doesNotMatch(car,/Регламентный рубеж достигнут|Температура пограничная|Скорее нет · влажная неделя/);
  assert.match(mood,/настроение по дням/);
});

test('v2.98 fixes declension and natural notification copy',()=>{
  const home=read('public/smart-home.js');
  const habit=read('api/habit-reminder-cron.js');
  const products=read('api/products-update-author.cjs');
  const cinema=read('api/cinema-premieres.cjs');
  const score=read('api/score-store.cjs');

  assert.match(home,/mod10===1&&mod100!==11\?'устройство'/);
  assert.match(habit,/pendingWord/);
  assert.match(habit,/бонусных привычек/);
  assert.match(products,/Обновлено через Telegram/);
  assert.match(cinema,/На этой неделе новых кинопремьер .* нет/);
  assert.match(score,/Бонус за серию отменён/);
  assert.match(score,/Партнёр берёт домашние дела на себя на один день/);
});

test('v2.100 version marker is exact',()=>{
  assert.equal(read('VERSION').trim(),'v2.100');
});
