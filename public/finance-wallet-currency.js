/* RUDI v4.180: read-only USD equivalent for RUB wallet tiles.
 * This only changes visible text; finance store balances remain in native currency.
 */
(()=>{
  'use strict';
  const list=document.getElementById('financeWalletList');
  const currency=document.getElementById('financeBalanceCurrencySymbol');
  const switchButton=document.getElementById('financeBalanceCurrencyButton');
  const ticker=document.getElementById('marketTickerTrack');
  const tickerA11y=document.getElementById('marketTickerA11y');
  if(!list||!currency||!switchButton)return;
  const formatter=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
  const exchangeRate=()=>{
    const tickerText=(ticker?.textContent||'')+' '+(tickerA11y?.textContent||'');
    const match=tickerText.match(/USD\s*\/\s*RUB\s*[^\d]{0,18}(\d[\d\s\u00a0\u202f]*(?:[,.]\d+)?)/i);
    if(!match)return null;
    const n=Number(match[1].replace(/[\s\u00a0\u202f]/g,'').replace(',','.'));
    return Number.isFinite(n)&&n>=20&&n<=300?n:null;
  };
  const rubles=value=>{
    const match=String(value||'').trim().match(/^(-?[\d\s\u00a0\u202f]+(?:[,.]\d{1,2})?)\s*₽$/);
    if(!match)return null;
    const n=Number(match[1].replace(/[\s\u00a0\u202f]/g,'').replace(',','.'));
    return Number.isFinite(n)?n:null;
  };
  let pending=false;
  const update=()=>{
    pending=false;
    const showUsd=currency.textContent.trim()==='$';
    const rate=showUsd?exchangeRate():null;
    for(const amount of list.querySelectorAll('.finance-wallet-item .finance-coin-amount')){
      const current=amount.textContent.trim();
      const last=amount.dataset.rudiWalletDisplayed||'';
      let original=amount.dataset.rudiWalletRubOriginal||'';
      // An application re-render may replace the tile's underlying amount.
      if(current!==last){
        if(rubles(current)!==null)original=current;
        else if(current!==original)original='';
        amount.dataset.rudiWalletRubOriginal=original;
      }
      if(!original)continue;
      const rub=rubles(original);
      if(rub===null)continue;
      const next=showUsd&&rate
        ?original+' ('+formatter.format(rub/rate)+' $)'
        :original;
      if(amount.textContent.trim()!==next)amount.textContent=next;
      amount.dataset.rudiWalletDisplayed=next;
      amount.classList.toggle('rudi-wallet-usd-equivalent',Boolean(showUsd&&rate));
      amount.title=showUsd&&rate
        ?'Рубли (в долларах) по курсу USD/RUB '+formatter.format(rate)
        :'';
    }
  };
  const schedule=()=>{
    if(pending)return;
    pending=true;
    requestAnimationFrame(update);
  };
  new MutationObserver(schedule).observe(list,{childList:true,subtree:true,characterData:true});
  new MutationObserver(schedule).observe(currency,{childList:true,subtree:true,characterData:true});
  if(ticker)new MutationObserver(schedule).observe(ticker,{childList:true,subtree:true,characterData:true});
  if(tickerA11y)new MutationObserver(schedule).observe(tickerA11y,{childList:true,subtree:true,characterData:true});
  switchButton.addEventListener('click',schedule);
  schedule();
})();
