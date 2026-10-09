const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DOMAINS, imageMime, fetchLogo, handleWalletLogo } = require('../api/wallet-logo.cjs');
const icons = require('../public/wallet-brand-icons.js');
const png = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');

function resMock() {
  return {
    headers: {}, code: 200, body: null,
    setHeader(key, value) { this.headers[key] = value; return this; },
    status(code) { this.code = code; return this; },
    end(body) { this.body = body; return this; }
  };
}

test('First-party icon endpoint only accepts registered brands; no arbitrary URLs', async () => {
  assert.equal(DOMAINS.get('cashinout'), 'cashinout.io');
  assert.equal(DOMAINS.get('antarctic'), 'antarcticwallet.com');
  assert.equal(DOMAINS.get('tbank'), 'tbank.ru');
  const fetchImpl = async () => { throw Error('Untrusted request must not be made'); };
  const bad = resMock();
  await handleWalletLogo({ method:'GET', query:{brand:'https://127.0.0.1/'} }, bad, {fetchImpl});
  assert.equal(bad.code, 404);
  const post = resMock();
  await handleWalletLogo({ method:'POST', query:{brand:'tbank'} }, post, {fetchImpl});
  assert.equal(post.code, 405);
});

test('Server fetches valid real image, serves MIME type and 7-day CDN cache', async () => {
  let requested='';
  const response = resMock();
  const fetchImpl = async (url) => {
    requested=url;
    return {ok:true,headers:{get:()=>String(png.length)},arrayBuffer:async()=>png};
  };
  await handleWalletLogo({method:'GET',query:{brand:'tbank'}},response,{fetchImpl});
  assert.match(requested,/google\.com\/s2\/favicons\?domain=tbank\.ru/);
  assert.equal(response.code,200);
  assert.equal(response.headers['Content-Type'],'image/png');
  assert.match(response.headers['Cache-Control'],/s-maxage=604800/);
  assert.deepEqual(response.body,png);
  assert.equal(imageMime(Buffer.from('<html>not a logo</html>')), '');
});

test('Failed first provider tries trusted alternate; total failure keeps wallet currency symbol', async () => {
  let attempts=0;
  const result=await fetchLogo('cashinout.io',{
    fetchImpl:async()=>{
      attempts++;
      if(attempts===1)return {ok:true,headers:{get:()=>null},arrayBuffer:async()=>Buffer.from('<html>404</html>')};
      return {ok:true,headers:{get:()=>null},arrayBuffer:async()=>png};
    }
  });
  assert.equal(attempts,2);
  assert.equal(result.mime,'image/png');
  const response=resMock();
  await handleWalletLogo({method:'GET',query:{brand:'cashinout'}},response,{fetchImpl:async()=>({ok:false})});
  assert.equal(response.code,404);
});

test('Browser attaches eager image and retains currency until verified image loads',()=>{
  const previous=global.document;
  const img={style:{},src:'',loading:'',decoding:'',referrerPolicy:'',setAttribute(){},remove(){this.removed=true;}};
  global.document={createElement:()=>img};
  try{
    let replaced=false;
    const coin={
      children:[],classList:{add(x){coin.loadedClass=x;}},
      appendChild(child){this.children.push(child);},
      replaceChildren(child){this.children=[child];replaced=true;},
      setAttribute(key,val){this[key]=val;}
    };
    icons.decorateCoin(coin,{name:'TNF Инвест',currency:'RUB'});
    assert.equal(img.loading,'eager');
    assert.equal(coin.children[0],img);
    assert.match(img.src,/^\/api\/wallet-logo\?brand=tbank$/);
    assert.equal(replaced,false);
    img.onerror();
    assert.match(img.src,/google\.com\/s2\/favicons/);
    img.onerror();
    assert.match(img.src,/icons\.duckduckgo\.com/);
    img.onerror();
    assert.equal(img.removed,true);
    assert.equal(replaced,false);
    img.onload();
    assert.equal(replaced,true);
    assert.equal(coin.loadedClass,'has-brand-icon');
  } finally {
    if(previous===undefined)delete global.document;
    else global.document=previous;
  }
});

test('wallet logo proxy remains available and PWA assets match current release',()=>{
  const root=path.resolve(__dirname,'..');
  const index=fs.readFileSync(path.join(root,'api/index.js'),'utf8');
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  const sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  assert.match(index,/handleWalletLogo\(req, res\)/);
  assert.deepEqual(vercel.rewrites.find(r=>r.source==='/api/wallet-logo'),{source:'/api/wallet-logo',destination:'/api/index?route=wallet-logo'});
  const version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
  assert.ok(sw.includes("const CACHE_NAME='rudi-shell-"+version+"';"));
  assert.ok(html.includes('wallet-brand-icons.js?v='+version.slice(1)));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'rudi-version.json'),'utf8')).current,version);
});
