import {createCarDeviceService} from './core.mjs';
import {createDirectCarStore} from './direct-store.mjs';
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
async function readBody(request){const reader=request.body?.getReader();if(!reader)throw Error('json');const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw Error('large');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export default {
 async fetch(request,env){
  const url=new URL(request.url),start=Date.now();
  if(url.pathname==='/health'&&request.method==='GET'){try{await env.DB.prepare('SELECT 1 AS ok').first();return json({ok:true,channel:'direct-d1',version:'1.2.8'});}catch{return json({ok:false},503);}}
  if(url.pathname!=='/v1/car-device')return json({ok:false,error:'not-found'},404);
  if(request.method!=='POST')return json({ok:false,error:'method-not-allowed'},405);
  let body;try{body=await readBody(request);}catch(error){return json({ok:false,error:error.message==='large'?'body-too-large':'invalid-json'},error.message==='large'?413:400);}
  if(!body||!['pair','location','disconnect'].includes(body.operation))return json({ok:false,error:'bad-operation'},400);
  const service=createCarDeviceService({client:createDirectCarStore(env.DB)}),headers={};let status=200,result;
  const res={setHeader(k,v){headers[k]=v;},status(code){status=code;return this;},json(value){result=value;return this;}};
  await service.handleRequest({method:'POST',headers:{authorization:request.headers.get('authorization')||''},body},res);
  // No request bodies, codes, tokens, IDs or coordinates in diagnostics.
  console.log('CAR_LINK',body.operation,status,Date.now()-start);
  return json(result,status,{'server-timing':'car;dur='+(Date.now()-start)});
 }
};
