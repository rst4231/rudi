const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
  contextNeeds,
  commandIntent,
  addProductIntent,
  addWishIntent,
  safeTimeZone,
  shiftDateKey,
}=require('../api/voice-assistant-rudi.cjs');

test('voice understands products and wishlist write intents',()=>{
  assert.deepEqual(addProductIntent('Добавь молоко и хлеб в продукты'),{items:['молоко','хлеб']});
  assert.deepEqual(addProductIntent('Добавь в список покупок молоко'),{items:['молоко']});
  assert.deepEqual(addWishIntent('Добавь AirPods в вишлист','Рустам'),{items:['AirPods'],owner:'Рустам'});
  assert.deepEqual(addWishIntent('Добавь духи в вишлист Дианы','Рустам'),{items:['духи'],owner:'Диана'});
});

test('voice routes tomorrow tasks, events, status, period and weather',()=>{
  assert.equal(contextNeeds('Какие дела завтра?').tasks,true);
  assert.equal(contextNeeds('Какие мероприятия у нас в ленте?').feed,true);
  assert.equal(contextNeeds('Какой статус у Дианы?').cycle,true);
  assert.equal(contextNeeds('Какой статус у Дианы?').calendar,true);
  assert.equal(contextNeeds('Когда у Дианы месячные?').cycle,true);
  assert.equal(contextNeeds('Какая погода сегодня?').weather,true);
  assert.equal(contextNeeds('Какая погода завтра?').weather,true);
});

test('russian smart home commands are recognized without latin word boundaries',()=>{
  assert.deepEqual(commandIntent('Включи торшер'),{kind:'switch',value:true,target:'торшер'});
  assert.deepEqual(commandIntent('Выключи торшер'),{kind:'switch',value:false,target:'торшер'});
  assert.deepEqual(commandIntent('Запусти пылесос'),{kind:'switch',value:true,target:'пылесос'});
  assert.deepEqual(commandIntent('Останови пылесос'),{kind:'switch',value:false,target:'пылесос'});
  assert.deepEqual(commandIntent('Поставь пылесос на паузу'),{kind:'pause',value:true,target:'пылесос'});
  assert.deepEqual(commandIntent('Продолжи уборку пылесос'),{kind:'pause',value:false,target:'пылесос'});
});

test('device timezone is accepted with Moscow fallback and tomorrow crosses month',()=>{
  assert.equal(safeTimeZone('Europe/Riga'),'Europe/Riga');
  assert.equal(safeTimeZone('bad/timezone'),'Europe/Moscow');
  assert.equal(shiftDateKey('2026-09-30',1),'2026-10-01');
  assert.equal(shiftDateKey('2026-12-31',1),'2027-01-01');
});

test('client sends device timezone and refreshes mutated RUDI sections',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/resolvedOptions\(\)\.timeZone\|\|TZ/);
  assert.match(app,/actionType\.startsWith\('products-'\)[\s\S]*?loadProducts/);
  assert.match(app,/actionType\.startsWith\('wishlist-'\)[\s\S]*?wishlistRequest\('list'\)/);
  assert.match(app,/actionType\.startsWith\('smart-home'\)[\s\S]*?RUDI_SMART_HOME/);
});

test('assistant uses RUDI weather and tomorrow TickTick data',()=>{
  const context=fs.readFileSync('api/voice-assistant-rudi.cjs','utf8');
  assert.match(context,/getWeather/);
  assert.match(context,/tomorrow:tomorrowEvents/);
  assert.match(context,/nextNewYear/);
  assert.match(context,/daysUntilNewYear/);
  assert.match(context,/weather:.*погод/s);
});

test('general knowledge is allowed when RUDI data is not needed',()=>{
  const voice=fs.readFileSync('api/voice-assistant.cjs','utf8');
  assert.match(voice,/Для обычных общих вопросов используй свои знания/);
  assert.doesNotMatch(voice,/Если нужного факта там нет, прямо скажи, что данных в RUDI недостаточно/);
});

test('weather service exposes daily weather code and shared getter',()=>{
  const weather=fs.readFileSync('api/weather.cjs','utf8');
  assert.match(weather,/daily=weather_code,temperature_2m_min/);
  assert.match(weather,/module\.exports = \{createWeatherService, getWeather, handleWeatherRequest\}/);
});

test('smart home exposes reusable capability action for vacuum',()=>{
  const smart=fs.readFileSync('api/smart-home-client.cjs','utf8');
  assert.match(smart,/async function runSmartHomeCapability/);
  assert.match(smart,/devices\.capabilities\.mode.*work_speed/s);
  assert.match(smart,/devices\.capabilities\.toggle.*pause/s);
  assert.match(smart,/switchSmartHomeDevice, runSmartHomeCapability/);
});
