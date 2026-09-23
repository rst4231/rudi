const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFAULT_MODEL,normalizeDateRequest,generateDateIdeas}=require('../api/date-ai.cjs');

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
