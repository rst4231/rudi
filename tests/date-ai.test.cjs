const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFAULT_MODEL,normalizeDateRequest,buildDateWeatherContext,datePrompt,generateDateIdeas}=require('../api/date-ai.cjs');

function responsePayload(){
  return {
    choices:[{message:{content:JSON.stringify({
      ideas:[
        {title:'Идея 1',description:'1. Необычный сценарий номер один.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'1 час'},
        {title:'Идея 2',description:'1. Необычный сценарий номер два.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
        {title:'Идея 3',description:'1. Необычный сценарий номер три.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'1,5 часа'}
      ]
    })}}]
  };
}

test('date generator validates morning day and evening',()=>{
  assert.equal(normalizeDateRequest({period:'morning'}).period,'morning');
  assert.equal(normalizeDateRequest({period:'day'}).period,'day');
  assert.equal(normalizeDateRequest({period:'evening'}).period,'evening');
  assert.throws(()=>normalizeDateRequest({period:'night'}),/date-period-invalid/);
});

test('date generator asks Groq for exactly three structured ideas and excludes previous titles',async()=>{
  let calls=0;
  const result=await generateDateIdeas({period:'evening',exclude:['Старое свидание']},{
    apiKey:'secret-key',
    fetch:async(url,options)=>{
      calls++;
      assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
      const body=JSON.parse(options.body);
      assert.equal(body.model,DEFAULT_MODEL);
      assert.equal(body.response_format.type,'json_schema');
      assert.equal(body.response_format.json_schema.strict,true);
      assert.equal(body.response_format.json_schema.schema.properties.ideas.minItems,3);
      assert.equal(body.response_format.json_schema.schema.properties.ideas.maxItems,3);
      assert.match(body.messages[0].content,/вечер/);
      assert.match(body.messages[0].content,/Старое свидание/);
      assert.match(body.messages[0].content,/только для Рустама и Дианы/);
      assert.match(body.messages[0].content,/Не добавляй ведущих/);
      assert.match(body.messages[0].content,/Никто не должен вручать им карты, письма, задания, кристаллы/);
      assert.match(body.messages[0].content,/Не придумывай квесты, тайники, загадки/);
      assert.match(body.messages[0].content,/выполнима парой самостоятельно/);
      assert.match(body.messages[0].content,/практичный совет для реальной пары/);
      assert.match(body.messages[0].content,/обращайся к паре только во втором лице множественного числа/);
      assert.match(body.messages[0].content,/ровно 3 коротких шага/);
      assert.match(body.messages[0].content,/«вы идёте»/);
      return {ok:true,status:200,async json(){return responsePayload()}};
    }
  });
  assert.equal(calls,1);
  assert.equal(result.provider,'groq');
  assert.equal(result.ideas.length,3);
});

test('date generator requires Groq key',async()=>{
  await assert.rejects(
    generateDateIdeas({period:'day'},{env:{GEMINI_API_KEY:'old'},fetch:async()=>{throw new Error('no')}}),
    /groq-api-key-missing/
  );
});


test('date generator uses Rustam and Diana interests as personalization priorities',()=>{
  const prompt=datePrompt({period:'evening'});
  assert.match(prompt,/Диана любит: экстрим, вкусную еду, выставки, театры/);
  assert.match(prompt,/Рустам любит: всё новое, поездки и катание на машине/);
  assert.match(prompt,/Старайся в первую очередь находить пересечение их интересов/);
  assert.match(prompt,/не должно быть обязательным условием сценария/);
  assert.match(prompt,/В одной выдаче используй разные типы впечатлений/);
});

test('date generator turns rainy Saint Petersburg weather into indoor-only guidance',()=>{
  const weather=buildDateWeatherContext({
    current:{temperature_2m:8,weather_code:61,precipitation:1.2,rain:1.2},
    daily:{temperature_2m_min:[6],temperature_2m_max:[10],precipitation_sum:[7.4]},
  });
  assert.equal(weather.mode,'indoor');
  const prompt=datePrompt({period:'day',weather});
  assert.match(prompt,/Погода в Санкт-Петербурге/);
  assert.match(prompt,/Не предлагай пикник, парк, набережную/);
});

test('date generator retries an outdoor-only result when it is raining',async()=>{
  let calls=0;
  const rainy=buildDateWeatherContext({
    current:{temperature_2m:9,weather_code:63,precipitation:0.8},
    daily:{temperature_2m_min:[7],temperature_2m_max:[11],precipitation_sum:[5]},
  });
  const indoorIdeas=[
    {title:'Керамика в мастерской',description:'1. Выберите крытую керамическую мастерскую в Петербурге и сделайте по небольшой вещи друг для друга.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
    {title:'Музей плюс кофе',description:'1. Сходите в музей, а после обсудите любимую работу за кофе в ближайшей кофейне.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2–3 часа'},
    {title:'Домашняя дегустация',description:'1. Купите три необычных десерта и устройте дома слепую дегустацию с оценками.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'1,5 часа'},
  ];
  const result=await generateDateIdeas({period:'day',weather:rainy},{
    apiKey:'secret-key',
    fetch:async()=>{
      calls++;
      const ideas=calls===1?[
        {title:'Пикник в парке',description:'1. Возьмите плед и устройте пикник в парке на траве.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
        {title:'Прогулка по набережной',description:'1. Долго гуляйте вдоль Невы и смотрите на воду.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
        {title:'Пляжный вечер',description:'1. Проведите время на пляже у воды.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
      ]:indoorIdeas;
      return {ok:true,status:200,async json(){return {choices:[{message:{content:JSON.stringify({ideas})}}]}}};
    },
  });
  assert.equal(calls,2);
  assert.equal(result.ideas[0].title,'Керамика в мастерской');
});


test('date generator hard-blocks activities Diana cannot do and retries', async()=>{
  const prompt=datePrompt({period:'day'});
  assert.match(prompt,/Диана не умеет кататься на велосипеде, самокате, роликах и коньках/);
  assert.match(prompt,/не умеет плавать/);

  let calls=0;
  const safeIdeas=[
    {title:'Необычная выставка и кофейня',description:'1. Сходите на новую выставку, а после найдите рядом нишевую кофейню и обсудите увиденное.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2–3 часа'},
    {title:'Автомаршрут к гастроточке',description:'1. Выберите новое место за городом, доедьте туда на машине и попробуйте локальное блюдо.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'3–4 часа'},
    {title:'Баня и спокойный ужин',description:'1. Забронируйте баню для отдыха вдвоём, а после поужинайте в новом ресторане.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'3 часа'},
  ];

  const result=await generateDateIdeas({period:'day'},{
    apiKey:'secret-key',
    fetch:async()=>{
      calls++;
      const ideas=calls===1?[
        {title:'Велопрогулка по островам',description:'1. Возьмите велосипеды и прокатитесь по островам.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
        {title:'Каток и какао',description:'1. Покатайтесь на коньках, затем выпейте какао.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
        {title:'SUP на заливе',description:'1. Возьмите SUP-доски и отправляйтесь на воду.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
      ]:safeIdeas;
      return {ok:true,status:200,async json(){return {choices:[{message:{content:JSON.stringify({ideas})}}]}}};
    },
  });

  assert.equal(calls,2);
  assert.deepEqual(result.ideas.map((row)=>row.title),safeIdeas.map((row)=>row.title));
});


test('date generator rejects third-person descriptions about the couple and retries with вы', async()=>{
  let calls=0;
  const goodIdeas=[
    {title:'Гастро-маршрут',description:'1. Сначала вы выбираете необычное кафе, затем вы переходите в соседнюю дегустационную точку.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
    {title:'Выставка и кофе',description:'1. Вы идёте на выставку, после чего вы выбираете кофейню рядом и обсуждаете увиденное.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2–3 часа'},
    {title:'Автопрогулка',description:'1. Вы едете на машине в новое место, гуляете недолго и пробуете локальное блюдо.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'3 часа'},
  ];
  const result=await generateDateIdeas({period:'evening'},{
    apiKey:'secret-key',
    fetch:async()=>{
      calls++;
      const ideas=calls===1?[
        {title:'Дегустация',description:'1. Сначала они пробуют десерты. Затем вместе с дегустацией они переходят в кофейню.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
        {title:'Музей',description:'1. Они идут в музей и потом обсуждают выставку.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'2 часа'},
        {title:'Ужин',description:'1. Для них подготовлен маршрут по двум ресторанам.\\n2. Продолжите выбранный план вдвоём.\\n3. Завершите свидание спокойным общением.',duration:'3 часа'},
      ]:goodIdeas;
      return {ok:true,status:200,async json(){return {choices:[{message:{content:JSON.stringify({ideas})}}]}}};
    }
  });
  assert.equal(calls,2);
  assert.equal(result.ideas[0].description.includes('вы'),true);
});
