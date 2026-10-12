'use strict';
/* CoinKeeper 2016–Sep 2026, isolated historical ledger.
   Never touches existing category/wallet records or live balances. */
(()=>{
  const CUT='2026-10-01';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=value=>String(value??'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
  // Raw CSV destination 'В' is a person/recipient label, likely 'Вика',
  // not a trusted expense category. Keep the original key for manual mapping.
  const categoryLabel=value=>norm(value)==='в'?'В (вероятно, Вика)':String(value??'');
  const num=value=>{
    const raw=String(value??'').replace(/\s/g,'').replace(',','.');
    const n=Number(raw);return Number.isFinite(n)&&n>=0?n:NaN;
  };
  function day(value){
    const m=String(value||'').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if(!m)return null;
    const d=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    const date=new Date(d+'T12:00:00Z');
    return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==d?null:d;
  }
  // RFC 4180, including quoted newlines and Excel sep=, declaration.
  function parseCsv(text){
    const rows=[];let row=[],cell='',quote=false;
    text=String(text||'').replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quote){
        if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}
        else if(ch==='"')quote=false;
        else cell+=ch;
      }else if(ch==='"'&&cell==='')quote=true;
      else if(ch===','){row.push(cell);cell=''}
      else if(ch==='\r'||ch==='\n'){
        if(ch==='\r'&&text[i+1]==='\n')i++;
        row.push(cell);rows.push(row);row=[];cell='';
      }else cell+=ch;
    }
    if(cell||row.length){row.push(cell);rows.push(row)}
    return rows;
  }
  const fingerprint=s=>{
    let n=2166136261;
    for(let i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619)}
    return (n>>>0).toString(36);
  };
  const CUR=new Set(['RUB','USD','EUR','THB','IDR','MYR','AZN']);
  function readExport(text){
    const lines=parseCsv(text),head=lines.findIndex(r=>r[0]?.trim()==='Данные'&&r.includes('Тип')&&r.includes('Из'));
    if(head<0)throw Error('Не нашёл заголовки CSV CoinKeeper');
    const ix=Object.fromEntries(lines[head].map((h,i)=>[h.trim(),i]));
    const get=(row,h)=>String(row[ix[h]]??'').trim();
    const hash=fingerprint(text),rows=[],categories=new Map(),walletNames=new Set();
    let omitted=0,invalid=0,expenses=0,transfers=0,unknownRub=0;
    for(let i=head+1;i<lines.length;i++){
      const row=lines[i];
      if(!row.some(v=>String(v).trim()))break;
      const date=day(get(row,'Данные'));
      if(!date){invalid++;continue;}
      if(date>=CUT){omitted++;continue;}
      const type=get(row,'Тип')==='Расход'?'expense':get(row,'Тип')==='Перевод'?'transfer':'';
      if(!type){invalid++;continue;}
      const amount=num(get(row,'Сумма')),currency=get(row,'Валюта').toUpperCase();
      const convertedRaw=get(row,'Сумма в др.валюте'),convertedAmount=convertedRaw?num(convertedRaw):null;
      const convertedCurrency=get(row,'Др.валюта').toUpperCase()||null;
      if(!(amount>0)||!CUR.has(currency)||(convertedCurrency&&!CUR.has(convertedCurrency))||
        (convertedAmount!==null&&!Number.isFinite(convertedAmount))){invalid++;continue;}
      const rubAmount=currency==='RUB'?amount:
        convertedCurrency==='RUB'&&convertedAmount>0?convertedAmount:null;
      const name=get(row,'В'),fromName=get(row,'Из');
      if(type==='expense'){categories.set(name,(categories.get(name)||0)+1);expenses++;if(rubAmount===null)unknownRub++;}
      else transfers++;
      if(fromName)walletNames.add(fromName);
      if(type==='transfer'&&name)walletNames.add(name);
      rows.push({
        type,date,amount,currency,convertedAmount,convertedCurrency,fromName,toName:name,
        label:get(row,'Метки'),note:get(row,'Заметка'),
        importKey:'ckhistory:'+hash+':'+i, rubAmount
      });
    }
    return {rows,categories,walletNames,omitted,invalid,expenses,transfers,unknownRub,hash};
  }
  function autoCategory(name,categories){
    const direct=categories.find(c=>norm(c.name)===norm(name));
    if(direct)return direct.id;
    const aliases={
      'еда вне дома':'еда','бизнес. зп и расходники':'бизнес',
      'жилье':'жилье'
    };
    const match=aliases[norm(name)];
    return categories.find(c=>norm(c.name)===match)?.id||'';
  }
  function knownWallet(name,wallets,currency){
    const clean=norm(name),aliases={'озон карта':'ozon','cashinout':'cashinout',
      'тнф инвест':'тнф инвест'};
    const normalized=aliases[clean]||clean;
    const possible=wallets.filter(w=>norm(w.name)===normalized&&w.currency===currency);
    return possible.length===1?possible[0].id:'';
  }
  const money=(v,c='RUB')=>{
    const n=Number(v);
    if(!Number.isFinite(n))return 'Нет исторического курса';
    const s=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:8}).format(n);
    return s+' '+c;
  };
  async function request(operation,data={}){
    const response=await fetch('/api/finances',{method:'POST',headers:{'Content-Type':'application/json'},
      cache:'no-store',body:JSON.stringify({initData:window.Telegram?.WebApp?.initData||'',operation,...data})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw Error(result.error||'Не удалось получить ответ RUDI');
    return result;
  }
  function style(){
    if(document.getElementById('ckHistoryStyle'))return;
    const s=document.createElement('style');s.id='ckHistoryStyle';s.textContent=
      '.ckh-box{margin:14px 0;padding:16px;border:1px solid #a9afb9;border-radius:16px;color:#1b1e25;background:#f1f2f5;font-size:14px}'+
      '.ckh-box button,.ckh-dialog button{cursor:pointer;padding:10px 14px;border-radius:10px;border:1px solid #adb7c8;background:#e1e6ef;color:#191f29;font:inherit}'+
      '.ckh-box button:disabled,.ckh-dialog button:disabled{opacity:.55;cursor:not-allowed}'+
      '.ckh-box input{color:#181d25!important;background:#fff!important;font:inherit;border:1px solid #adb7c8;padding:9px;border-radius:10px;max-width:100%;color-scheme:light}'+
      '.ckh-row{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin:10px 0}'+
      '.ckh-status{font-size:13px;line-height:1.55;white-space:pre-wrap;opacity:1}'+
      '.ckh-list{max-height:400px;overflow:auto;font-size:13px}'+
      '.ckh-item{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #9993;padding:10px 2px}'+
      '.ckh-item span{display:block;opacity:.7;font-size:12px}'+
      'body .ckh-dialog{position:fixed!important;inset:0!important;z-index:999999!important;margin:auto!important;width:min(94vw,660px)!important;max-width:660px!important;max-height:88dvh!important;overflow:auto!important;box-sizing:border-box!important;padding:20px!important;background:#1b2230!important;color:#f6f8fc!important;opacity:1!important;filter:none!important;backdrop-filter:none!important;border:1px solid #626c80!important;border-radius:17px!important;box-shadow:0 20px 85px #000a!important;color-scheme:dark!important}'+
      'body .ckh-dialog::backdrop{background:rgba(0,0,0,.78)!important;backdrop-filter:blur(3px)!important}'+
      'body .ckh-dialog h3{font-size:20px;line-height:1.25;color:#fff!important;margin:0 0 13px!important}'+
      'body .ckh-dialog p,body .ckh-dialog .ckh-status,body .ckh-dialog .ckh-map{color:#e4eaf5!important;opacity:1!important}'+
      'body .ckh-dialog .ckh-list{max-height:min(43dvh,420px);overflow:auto;padding-right:3px}'+
      'body .ckh-dialog button{color:#111827!important;background:#edf1f8!important;border:1px solid #c0ccdc!important}'+
      'body .ckh-dialog select{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box;background:#303a4d!important;color:#fff!important;opacity:1!important;appearance:auto!important;padding:10px;border:1px solid #8794aa;border-radius:10px;font:inherit;color-scheme:dark}'+
      'body .ckh-dialog select option{background:#303a4d;color:#fff}'+
      'body .ckh-dialog .ckh-map span{color:#f2f5fc!important;overflow-wrap:anywhere}'+
      '.ckh-map{display:grid;grid-template-columns:minmax(100px,1fr) minmax(135px,1fr);gap:12px;align-items:center;margin:7px 0;padding:4px 0}'+
      '.ckh-box strong,.ckh-dialog strong{font-weight:650}'+
      '.ckh-box #ckhDelete{border-color:#cb7b7b;color:#a02a35;background:#fff1f1}'+
      '@media(max-width:400px){.ckh-map{grid-template-columns:1fr;gap:5px}body .ckh-dialog{padding:15px!important}}';
    document.head.appendChild(s);
  }
  function setup(){
    const anchor=document.getElementById('financeExportButton');
    const panel=document.getElementById('financePersonalPanel');
    if(!panel||document.getElementById('ckhHistory'))return;
    style();
    const block=document.createElement('section');
    block.className='ckh-box';block.id='ckhHistory';
    block.innerHTML='<strong>История CoinKeeper · 2016–2026</strong>'+
      '<p class="ckh-status">Архив операций до 1 октября 2026 года. Текущие кошельки, их балансы и категории не меняются.</p>'+
      '<div class="ckh-row"><button type="button" id="ckhChoose">Импортировать историю CSV</button>'+
      '<button type="button" id="ckhDelete">Удалить последний импорт</button>'+
      '<input type="file" id="ckhFile" accept=".csv,text/csv" hidden></div>'+
      '<div class="ckh-row"><input id="ckhMonth" type="month" min="2016-09" max="2026-09" value="2026-09">'+
      '<button type="button" id="ckhShow">Показать месяц</button></div>'+
      '<div id="ckhReport" class="ckh-status" role="status"></div>'+
      '<div id="ckhLedger" class="ckh-list"></div>';
    panel.appendChild(block);
    const modal=document.createElement('dialog');modal.id='ckhDialog';modal.className='ckh-dialog';
    modal.innerHTML='<h3>Проверка импорта CoinKeeper</h3><p class="ckh-status" id="ckhInfo"></p>'+
      '<p>Сопоставьте категории с существующими категориями RUDI. Новые не создаются.</p>'+
      '<p class="ckh-status">В файле «В» предположительно означает Вику. Это название получателя, а не подтверждённая категория расходов: выбери категорию вручную.</p>'+
      '<div class="ckh-list" id="ckhMappings"></div>'+
      '<p class="ckh-status" id="ckhPreview"></p>'+
      '<div class="ckh-row"><button type="button" id="ckhConfirm">Импортировать</button>'+
      '<button type="button" id="ckhCancel">Отмена</button></div>'+
      '<div class="ckh-status" id="ckhProgress" role="status"></div>';
    document.body.appendChild(modal);
    const report=document.getElementById('ckhReport'),ledger=document.getElementById('ckhLedger');
    const info=document.getElementById('ckhInfo'),pre=document.getElementById('ckhPreview');
    const progress=document.getElementById('ckhProgress'),confirm=document.getElementById('ckhConfirm');
    let currentFile=null,context=null,mappings=new Map(),busy=false;
    const setStatus=s=>{report.textContent=s};
    function preview(){
      if(!currentFile||!context)return;
      const mapped=[...currentFile.categories].reduce((n,[name,count])=>n+(mappings.get(name)?count:0),0);
      const uncovered=currentFile.expenses-mapped;
      const unknownWallets=[...currentFile.walletNames].filter(n=>!context.wallets.some(w=>norm(w.name)===norm(n)));
      pre.textContent='К импорту: '+(mapped+currentFile.transfers)+' операций, в том числе '+currentFile.transfers+
        ' переводов. Не сопоставлено расходов: '+uncovered+'. Без рублёвого эквивалента: '+currentFile.unknownRub+
        '. Исторических названий кошельков без прямого совпадения: '+unknownWallets.length+
        '. Операции с отсутствующим кошельком останутся в архиве без привязки.';
      confirm.disabled=busy||uncovered>0||mapped+currentFile.transfers===0;
    }
    document.getElementById('ckhChoose').addEventListener('click',()=>document.getElementById('ckhFile').click());
    document.getElementById('ckhFile').addEventListener('change',async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file||busy)return;
      try{
        setStatus('Читаю CoinKeeper CSV…');
        currentFile=readExport(await file.text());
        context=await request('ck-context');
        mappings=new Map();
        for(const name of currentFile.categories.keys())mappings.set(name,autoCategory(name,context.categories));
        const options=['<option value="">Не сопоставлено</option>']
          .concat(context.categories.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>')).join('');
        const displayedCategories=[...currentFile.categories].sort((a,b)=>b[1]-a[1]);
        document.getElementById('ckhMappings').innerHTML=displayedCategories.map(([name,count],i)=>
          '<label class="ckh-map"><span>'+esc(categoryLabel(name))+' ('+count+')</span>'+
          '<select data-ckh-cat="'+i+'" aria-label="Категория '+esc(name)+'">'+options+'</select></label>').join('');
        [...document.querySelectorAll('[data-ckh-cat]')].forEach(select=>{
          const name=displayedCategories[Number(select.dataset.ckhCat)]?.[0];
          select.value=mappings.get(name)||'';
          select.addEventListener('change',()=>{mappings.set(name,select.value);preview()});
        });
        info.textContent='Найдено '+currentFile.expenses+' расходов и '+currentFile.transfers+
          ' переводов до 01.10.2026. Поздних операций исключено: '+currentFile.omitted+
          '. Некорректных строк: '+currentFile.invalid+
          '. Сентябрь проверяется на совпадения с уже имеющимися расходами RUDI.';
        preview();
        modal.showModal();
        setStatus('CSV проверен. Подтверди сопоставление категорий.');
      }catch(error){setStatus('Ошибка чтения: '+String(error.message||error));currentFile=null;}
    });
    document.getElementById('ckhDelete').addEventListener('click',async()=>{
      if(busy)return;
      let latest;
      try{
        const result=await request('ck-context');
        latest=result.lastImport;
      }catch(error){setStatus('Не удалось проверить последний импорт: '+String(error.message||error));return;}
      if(!latest?.importId){setStatus('Загрузок CoinKeeper для удаления пока нет.');return;}
      if(!window.confirm('Удалить только последнюю загрузку CoinKeeper? Остальные операции RUDI, категории и балансы кошельков останутся без изменений.'))return;
      busy=true;
      const button=document.getElementById('ckhDelete');
      button.disabled=true;let offset=0,removed=0;
      try{
        while(true){
          const data=(await request('ck-delete-last',{importId:latest.importId,offset})).result;
          removed+=Number(data.deleted||0);
          setStatus('Удаляю последний импорт CoinKeeper: проверено '+data.nextOffset+' из '+data.totalMonths+' месяцев…');
          if(data.done)break;
          if(data.nextOffset<=offset)throw Error('Не удалось продолжить удаление');
          offset=data.nextOffset;
        }
        await showMonth();
        setStatus('Удалено '+removed+' операций последней загрузки CoinKeeper. Текущие финансы RUDI не изменены.');
      }catch(error){
        setStatus('Удаление прервалось: '+String(error.message||error)+'. Нажми «Удалить последний импорт» ещё раз, чтобы продолжить.');
      }finally{busy=false;button.disabled=false;}
    });
    document.getElementById('ckhCancel').addEventListener('click',()=>{if(!busy)modal.close()});
    modal.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
    function convertedRow(row,counts){
      const categoryId=row.type==='expense'?mappings.get(row.toName)||'':'';
      const src=knownWallet(row.fromName,context.wallets,row.currency);
      const target=row.type==='transfer'?knownWallet(row.toName,context.wallets,row.convertedCurrency):'';
      const copy={...row,categoryId,walletId:src,toWalletId:target};
      if(row.type==='expense'&&row.date.startsWith('2026-09')&&row.rubAmount!==null){
        const sig=[row.date,categoryId,Math.round(row.rubAmount*100)].join('|');
        counts.set(sig,(counts.get(sig)||0)+1);
        copy.duplicateOrdinal=counts.get(sig);
      }
      return copy;
    }
    confirm.addEventListener('click',async()=>{
      if(busy||!currentFile)return;
      busy=true;preview();confirm.disabled=true;
      document.getElementById('ckhCancel').disabled=true;
      const rows=[],counts=new Map();
      for(const row of currentFile.rows)rows.push(convertedRow(row,counts));
      const total=Math.ceil(rows.length/180);let imported=0,duplicates=0,matchedSeptember=0,unmapped=0,unknownRub=0;
      try{
        progress.textContent='Импорт: 0 из '+rows.length+'…';
        for(let i=0;i<total;i++){
          const part=rows.slice(i*180,(i+1)*180);
          const r=(await request('ck-import',{rows:part})).result;
          imported+=r.imported;duplicates+=r.duplicates;matchedSeptember+=r.matchedSeptember;
          unmapped+=r.unmapped;unknownRub+=r.unknownRub;
          progress.textContent='Обработано '+Math.min((i+1)*180,rows.length)+' из '+rows.length+
            '. Сохранено '+imported+', пропущено совпадений '+(duplicates+matchedSeptember)+'.';
        }
        const result='Готово: '+imported+' исторических операций. Не дублировано сентябрьских: '+
          matchedSeptember+'. Повторный импорт: '+duplicates+'. Без точного RUB курса: '+unknownRub+
          '. Балансы и справочники RUDI не изменялись.';
        progress.textContent=result;setStatus(result);
        await showMonth();
      }catch(error){
        const message='Импорт остановлен: '+String(error.message||error)+
          '. Уже сохранённые операции не дублируются при повторной загрузке CSV.';
        progress.textContent=message;setStatus(message);
      }finally{busy=false;document.getElementById('ckhCancel').disabled=false;preview()}
    });
    async function showMonth(){
      const month=document.getElementById('ckhMonth').value;
      ledger.textContent='Загружаю историю…';
      try{
        const r=await request('ck-month',{month}),cats=new Map((context?.categories||[]).map(c=>[c.id,c.name]));
        const catEntries=Object.entries(r.summary.categories).sort((a,b)=>b[1]-a[1]);
        const catSummary=catEntries.map(([id,value])=>(cats.get(id)||'Категория')+': '+money(value)).join(' · ');
        report.textContent='За '+month+': расходов '+r.summary.expenses+', переводов '+r.summary.transfers+
          ', рублёвый итог по известным курсам '+money(r.summary.totalRub)+
          (r.summary.unknownRub?'; без RUB пересчёта '+r.summary.unknownRub:'')+
          (catSummary?'\n'+catSummary:'');
        ledger.innerHTML=r.rows.slice(0,800).map(row=>
          '<div class="ckh-item"><div><strong>'+esc(row.type==='expense'?(cats.get(row.categoryId)||'Расход'):'Перевод')+
          '</strong><span>'+esc(row.date)+' · '+esc(row.fromName)+' → '+esc(row.toName)+
          (row.label?' · '+esc(row.label):'')+(row.note?' · '+esc(row.note):'')+
          '</span></div><div><strong>'+esc(money(row.amount,row.currency))+'</strong>'+
          (row.rubAmount!==null?'<span>'+esc(money(row.rubAmount))+'</span>':
          row.convertedAmount?'<span>'+esc(money(row.convertedAmount,row.convertedCurrency))+'</span>':'')+
          '</div></div>').join('')||'<div class="ckh-status">За этот месяц импортированных операций нет.</div>';
      }catch(error){ledger.textContent='Не удалось загрузить месяц: '+String(error.message||error)}
    }
    document.getElementById('ckhShow').addEventListener('click',showMonth);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();