const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFAULT_MODEL,normalizeDateRequest,buildDateWeatherContext,datePrompt,generateDateIdeas}=require('../api/date-ai.cjs');

function responsePayload(){
  return {
    choices:[{message:{content:JSON.stringify({
      ideas:[
        {title:'Идея 1',description:'Необычный сценарий номер один.',duration:'1 час'},
        {title:'Идея 2',description:'Необычный сценарий номер два.',duration:'2 часа'},
        {title:'Идея 3',description:'Необычный сценарий номер три.',duration:'1,5 часа'}
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
    {title:'Керамика в мастерской',description:'Выберите крытую керамическую мастерскую в Петербурге и сделайте по небольшой вещи друг для друга.',duration:'2 часа'},
    {title:'Музей плюс кофе',description:'Сходите в музей, а после обсудите любимую работу за кофе в ближайшей кофейне.',duration:'2–3 часа'},
    {title:'Домашняя дегустация',description:'Купите три необычных десерта и устройте дома слепую дегустацию с оценками.',duration:'1,5 часа'},
  ];
  const result=await generateDateIdeas({period:'day',weather:rainy},{
    apiKey:'secret-key',
    fetch:async()=>{
      calls++;
      const ideas=calls===1?[
        {title:'Пикник в парке',description:'Возьмите плед и устройте пикник в парке на траве.',duration:'2 часа'},
        {title:'Прогулка по набережной',description:'Долго гуляйте вдоль Невы и смотрите на воду.',duration:'2 часа'},
        {title:'Пляжный вечер',description:'Проведите время на пляже у воды.',duration:'2 часа'},
      ]:indoorIdeas;
      return {ok:true,status:200,async json(){return {choices:[{message:{content:JSON.stringify({ideas})}}]}}};
    },
  });
  assert.equal(calls,2);
  assert.equal(result.ideas[0].title,'Керамика в мастерской');
});
