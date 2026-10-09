const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'../public/app.css'),'utf8');
const scope=(from,to)=>app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)));

test('stars wallet is first and never included in ordinary finance wallets',()=>{
  const wallet=scope('function renderFinanceWallets(){','function syncFinanceTransferInputCurrency(');
  assert.match(wallet,/stars\.id='financeStarsWallet'/);
  assert.match(wallet,/stars\.className='finance-coin-item finance-stars-wallet-item'/);
  assert.ok(wallet.indexOf('list.append(stars)')<wallet.indexOf('wallets.forEach((wallet,index)=>'));
  assert.doesNotMatch(wallet,/stars\.dataset\.walletId/);
  assert.doesNotMatch(wallet,/bindFinanceWalletDrag\(stars/);
  assert.match(wallet,/openScoreModal\(currentActor\)/);
  assert.match(wallet,/renderFinanceStarsWallet\(\)/);
  assert.match(styles,/\.finance-wallet-list \.finance-stars-wallet-item/);
});

test('stars wallet uses score state, per-actor balance and balance privacy',()=>{
  const update=scope('function renderFinanceStarsWallet(){','function renderFinanceWallets(){');
  assert.match(update,/currentScoreState\?\.balances\?\.\[actor\]/);
  assert.match(update,/financeBalanceHidden\?'••••'/);
  assert.match(update,/currentScoreState\?scoreNumber\(balance\)\+' ⭐'/);
  assert.match(update,/wallet\.setAttribute\('aria-label'/);
  const score=scope('function renderScoreStickers(score=currentScoreState){',"document.addEventListener('rudi:score-updated'");
  assert.match(score,/renderFinanceStarsWallet\(\)/);
  const navigation=scope("if(tab==='finances'){","if(tab==='smart-saves')");
  assert.match(navigation,/scoreRequest\('state'\)\.then\(data=>renderScoreStickers\(data\.score\)\)/);
});

test('avatar score stickers restored while keeping the finance wallet',()=>{
  const profile=scope('const makePersonTile=(actor,identity)=>{','const selfActor=currentActor');
  assert.match(profile,/scoreSticker\.className='score-sticker'/);
  assert.match(profile,/avatarWrap\.append\(avatar,scoreSticker\)/);
  assert.match(profile,/openScoreModal\(actor\)/);
  assert.match(profile,/const moodBadge=avatar\.querySelector\('\.avatar-mood-badge'\)/);
  assert.match(profile,/nameElement\.insertAdjacentElement\('afterend',moodBadge\)/);
});

test('score points are not counted as currency and have no financial backend ID',()=>{
  const wallet=scope('function renderFinanceWallets(){','function syncFinanceTransferInputCurrency(');
  const money=scope('function renderFinanceWalletTotal(', 'function renderFinanceStarsWallet(');
  assert.ok(!money.includes('currentScoreState'));
  assert.ok(!wallet.includes('wallets.push(stars)'));
  assert.match(wallet,/const wallets=Array\.isArray\(financeState\.wallets\)/);
  assert.match(styles,/finance-stars-wallet-coin/);
});

test('main app source remains parseable',()=>{
  assert.doesNotThrow(()=>new Function(app));
});
