const test = require('node:test');
const assert = require('node:assert/strict');
const { runPreview } = require('../api/preview.js');

const config=[{title:'Консалтинг для брендов',body:'Решай бизнес-задачу',action:'Собери оффер'}];

test('preview route rewrites clients preview while preserving the rest of runtime payload', async () => {
  let output;
  const res={ json(payload){output=payload;return payload;} };
  const req={query:{}};
  const handler=async (request,response)=>{
    assert.equal(request.query.route,'preview');
    return response.json({ok:true,results:{events:{x:1},clients:{leadCount:2,preview:{message:'Лиды: 2\n\n💡 <b>Совет Диане от маркетолога</b>\n\nYouDo'}}}});
  };
  await runPreview(req,res,{handler,fetchImpl:async()=>new Response(JSON.stringify(config),{status:200}),localConfig:config,now:new Date('2026-08-31T10:00:00Z')});
  assert.equal(output.results.events.x,1);
  assert.equal(output.results.clients.leadCount,2);
  assert.match(output.results.clients.preview.message,/Консалтинг для брендов/);
  assert.doesNotMatch(output.results.clients.preview.message,/YouDo/);
});
