const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const icons=require('../public/wallet-brand-icons.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('RUDI wallet brand identification and fallback',()=>{
  const examples={'Сбер основной':'sber','Альфа-Банк':'alfa','Т-Банк':'tbank','TNF Инвест':'tbank','ТНФ Инвест':'tbank','Райффайзен':'raiff','Ozon':'ozon','Bybit USDT':'bybit','UniSwap ETH':'uniswap','Binance spot':'binance','MetaMask':'metamask','ANW':'antarctic','Antarctic Wallet':'antarctic','CashInOut':'cashinout','Cash in Out':'cashinout','Wise':'wise'};
  for(const [name,brand] of Object.entries(examples))assert.equal(icons.matchName(name)?.id,brand,name);
  assert.equal(icons.brands.find(x=>x.id==='antarctic').domain,'antarcticwallet.com');
  assert.equal(icons.brands.find(x=>x.id==='cashinout').domain,'cashinout.io');
  assert.equal(icons.matchName('ВТБизнес'),null);
  assert.ok(icons.brands.length>=70);
  for(const brand of icons.brands)assert.ok(('b:'+brand.id).length<=12);
});

test('Manual icon selection uses existing wallet icon field',()=>{
  assert.equal(icons.resolveBrand({name:'Сбер',icon:'b:none'}),null);
  assert.equal(icons.resolveBrand({name:'Сбер',icon:'b:bybit'})?.id,'bybit');
  assert.equal(icons.selectedIcon({value:'bybit'},'₽'),'b:bybit');
  assert.equal(icons.selectedIcon({value:'auto'},'₽'),'₽');
  assert.equal(icons.selectedIcon({value:'none'},'$'),'b:none');
});

test('Wallet UI loads optional icon script before application and retains stars tile',()=>{
  const html=read('public/index.html');
  const js=read('public/app.js');
  const css=read('public/app.css');
  assert.match(html,/id="financeWalletBrand"/);
  assert.ok(html.indexOf('wallet-brand-icons.js')<html.indexOf('/app.js?v=4.115'));
  assert.match(js,/RudiWalletBrandIcons\?\.decorateCoin\(coin,wallet\)/);
  assert.match(js,/RudiWalletBrandIcons\?\.selectedIcon/);
  assert.match(js,/list\.append\(stars\)/);
  assert.match(css,/\.finance-wallet-coin\.has-brand-icon/);
});
