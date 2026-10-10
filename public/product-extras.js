/* RUDI products editor and smart suggestions. No per-keystroke network requests. */
(() => {
  'use strict';
  const categories = ['Мясо и рыба','Овощи и зелень','Фрукты и ягоды','Молочное и яйца','Хлеб и выпечка','Бакалея','Сладкое и снеки','Напитки','Заморозка','Для дома','Гигиена','Для Лулу','Другое'];
  const catalog = [
    'Молоко','Яйца','Сыр','Творог','Сметана','Кефир','Сливочное масло','Йогурт',
    'Курица','Куриное филе','Куриный фарш','Индейка','Филе индейки','Говядина','Фарш','Рыба','Ветчина','Колбаса',
    'Помидоры','Огурцы','Картофель','Морковь','Лук','Чеснок','Капуста','Брокколи','Шпинат','Руккола','Салат','Шампиньоны','Авокадо',
    'Яблоки','Бананы','Груши','Апельсины','Лимоны','Киви','Мандарины','Виноград',
    'Хлеб','Батон','Лаваш','Тортилья','Багет','Хлебцы',
    'Рис','Гречка','Макароны','Овсянка','Мука','Соль','Сахар','Приправа для курицы','Специи','Подсолнечное масло','Оливковое масло',
    'Вода питьевая','Чай','Кофе','Сок','Газированная вода',
    'Пельмени','Замороженные овощи','Мороженое','Шоколад','Печенье','Торт',
    'Туалетная бумага','Салфетки','Губки','Средство для посуды','Шампунь','Зубная паста',
    'Корм для Лулу','Лакомства для Лулу'
  ];
  const key = value => String(value || '').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
  const state = () => window.RUDI_PRODUCTS_CURRENT || { items: [], history: [] };
  const inCart = text => new Set((state().items || []).map(item => key(item.text))).has(key(text));
  const $ = id => document.getElementById(id);
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const buyTime = product => {
    const t = Date.parse(product?.boughtAt || '');
    return Number.isFinite(t) ? t : 0;
  };
  function aggregateHistory() {
    const byName = new Map();
    for (const row of state().history || []) {
      const name = String(row?.text || '').trim();
      const normalized = key(name);
      if (!normalized) continue;
      let agg = byName.get(normalized);
      if (!agg) { agg = { name, count: 0, last: 0, category: row.category || '' }; byName.set(normalized, agg); }
      agg.count++;
      if (buyTime(row) > agg.last) { agg.last = buyTime(row); agg.name = name; agg.category = row.category || ''; }
    }
    return [...byName.values()].sort((a,b) => b.count-a.count || b.last-a.last);
  }
  const isRecent = (item, now = Date.now()) => {
    if (!item.last) return false;
    const slow = ['Бакалея','Для дома','Гигиена','Для Лулу'].includes(item.category);
    return now-item.last < (slow ? 14 : 3) * 86400000;
  };
  let dropdown, frequent, input, modal, editItem, originalFocus, submitting = false, keepSuggestions = false;
  function allSuggestions(query) {
    const q = key(query);
    if (!q) return [];
    const ranked = [];
    const history = aggregateHistory();
    for (const [idx,item] of history.entries()) {
      if (inCart(item.name)) continue;
      const nameKey = key(item.name);
      if (nameKey.includes(q)) ranked.push({ name:item.name, score:(nameKey.startsWith(q)?100:0)+item.count*10+Math.max(0,20-idx), kind:'Из истории' });
    }
    for (const name of catalog) {
      if (inCart(name)) continue;
      const nameKey = key(name);
      if (nameKey.includes(q)) ranked.push({ name, score:(nameKey.startsWith(q)?70:0)+3, kind:'Продукт' });
    }
    const seen = new Set();
    return ranked.sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name,'ru'))
      .filter(row => { const k=key(row.name); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,6);
  }
  function closeDropdown() {
    if (dropdown) { dropdown.replaceChildren(); dropdown.hidden = true; }
    input?.setAttribute('aria-expanded','false');
  }
  function renderDropdown() {
    if (!dropdown || !input) return;
    const raw = input.value;
    const value = raw.split(/[,;\n]/).pop()?.trim() || '';
    const options = allSuggestions(value);
    dropdown.replaceChildren();
    if (!value || !options.length || document.activeElement !== input) { closeDropdown(); return; }
    for (const option of options) {
      const b = element('button','rudi-product-suggestion');
      b.type='button';
      b.setAttribute('role','option');
      b.setAttribute('aria-label','Подставить '+option.name);
      const name = element('span','rudi-product-suggestion-name',option.name);
      const kind = element('small','rudi-product-suggestion-meta',option.kind);
      b.append(name,kind);
      b.addEventListener('pointerdown',event => event.preventDefault());
      b.addEventListener('click',() => {
        const segments = raw.split(/([,;\n])/);
        let tail=segments.length-1;
        while(tail>=0 && /^[,;\n]$/.test(segments[tail])) tail--;
        if(tail>=0) segments[tail]=option.name;
        input.value=segments.join('');
        closeDropdown();
        input.focus();
      });
      dropdown.appendChild(b);
    }
    dropdown.hidden=false;
    input.setAttribute('aria-expanded','true');
  }
  async function quickAdd(name,button) {
    const api = window.RUDI_PRODUCTS_API;
    if (!api?.request || submitting || inCart(name)) return;
    submitting = true;
    if(button) button.disabled = true;
    try {
      await api.request('add',{items:[name]});
      await api.reload({silent:true});
    } catch (error) {
      console.warn('RUDI_PRODUCTS_QUICK_ADD_WARN',String(error?.message||error));
      window.alert('Не получилось добавить продукт. Проверь подключение.');
    } finally {
      submitting=false;
      if(button) button.disabled=false;
      renderFrequent();
      renderDropdown();
    }
  }
  function renderFrequent() {
    if (!frequent) return;
    frequent.replaceChildren();
    const recommended=aggregateHistory()
      .filter(item => !inCart(item.name) && !isRecent(item))
      .slice(0,8);
    if (!recommended.length) {frequent.hidden=true;return;}
    const header = element('div','rudi-frequent-head');
    header.append(element('strong','', 'Частые покупки'),element('small','', 'Добавить одним нажатием'));
    const chips=element('div','rudi-frequent-chips');
    for (const item of recommended) {
      const b=element('button','rudi-frequent-chip','+ '+item.name);
      b.type='button';
      b.addEventListener('click',()=>quickAdd(item.name,b));
      chips.appendChild(b);
    }
    frequent.append(header,chips);
    frequent.hidden=false;
  }
  function buildModal() {
    if (modal) return;
    modal=element('div','rudi-product-editor-overlay');
    modal.hidden=true;
    modal.innerHTML = '<section class="rudi-product-editor" role="dialog" aria-modal="true" aria-labelledby="rudiProductEditorTitle">' +
      '<div class="rudi-product-editor-head"><strong id="rudiProductEditorTitle">Редактировать продукт</strong><button type="button" id="rudiProductEditClose" aria-label="Закрыть">×</button></div>' +
      '<form id="rudiProductEditForm"><label>Название<input id="rudiProductEditName" maxlength="180" required autocomplete="off"></label>' +
      '<div class="rudi-product-editor-fields"><label>Количество<input id="rudiProductEditQuantity" inputmode="decimal" placeholder="Например, 2"></label>' +
      '<label>Единица<select id="rudiProductEditUnit"><option value="">Не указана</option><option>шт.</option><option>кг</option><option>г</option><option>л</option><option>мл</option><option>уп.</option></select></label></div>' +
      '<label>Категория<select id="rudiProductEditCategory"></select></label>' +
      '<label>Заметка<input id="rudiProductEditNote" maxlength="140" placeholder="Необязательно"></label>' +
      '<div class="rudi-product-editor-error" id="rudiProductEditError" role="status"></div>' +
      '<div class="rudi-product-editor-footer"><button type="button" id="rudiProductEditCancel">Отмена</button><button type="submit" id="rudiProductEditSave">Сохранить</button></div></form></section>';
    document.body.appendChild(modal);
    const select=$('rudiProductEditCategory');
    const automatic=element('option','', 'Автоматически'); automatic.value=''; select.appendChild(automatic);
    for(const category of categories) {
      const option=element('option','',category);option.value=category;select.appendChild(option);
    }
    $('rudiProductEditClose').addEventListener('click',closeModal);
    $('rudiProductEditCancel').addEventListener('click',closeModal);
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)closeModal()});
    $('rudiProductEditForm').addEventListener('submit',saveEdit);
  }
  function closeModal() {
    if(!modal)return;
    modal.hidden=true;editItem=null;
    document.body.classList.remove('rudi-product-modal-open');
    if(originalFocus?.isConnected)originalFocus.focus({preventScroll:true});
  }
  function openModal(item) {
    if (!item) return;
    buildModal();
    editItem = item;
    originalFocus=document.activeElement;
    $('rudiProductEditName').value=String(item.text||'');
    $('rudiProductEditQuantity').value=String(item.quantity||'');
    $('rudiProductEditUnit').value=String(item.unit||'');
    $('rudiProductEditCategory').value=String(item.categoryOverride||'');
    $('rudiProductEditNote').value=String(item.note||'');
    $('rudiProductEditError').textContent='';
    modal.hidden=false;
    document.body.classList.add('rudi-product-modal-open');
    $('rudiProductEditName').focus({preventScroll:true});
  }
  async function saveEdit(event) {
    event.preventDefault();
    const api=window.RUDI_PRODUCTS_API;
    if (!editItem || !api?.request) return;
    const save=$('rudiProductEditSave'), error=$('rudiProductEditError');
    const quantity=$('rudiProductEditQuantity').value.replace(',','.').trim();
    if(quantity && (!/^\d{1,5}(?:\.\d{1,2})?$/.test(quantity)||Number(quantity)<=0)) {
      error.textContent='Проверь количество. Например: 1,5';
      $('rudiProductEditQuantity').focus(); return;
    }
    const payload={
      id:editItem.id,
      text:$('rudiProductEditName').value.trim(),
      quantity,
      unit:$('rudiProductEditUnit').value,
      categoryOverride:$('rudiProductEditCategory').value,
      note:$('rudiProductEditNote').value.trim()
    };
    if(!payload.text){error.textContent='Введи название продукта';return}
    save.disabled=true;
    error.textContent='';
    try {
      await api.request('update',payload);
      closeModal();
      await api.reload({silent:true});
    }catch(err){
      const code=String(err?.message||err);
      error.textContent=code.includes('duplicate')?'Такой продукт уже есть в корзине':'Не удалось сохранить. Проверь данные и подключение.';
    }finally{save.disabled=false}
  }
  function setup() {
    const form=$('productsForm');
    input=$('productsInput');
    if (!form || !input || dropdown) return;
    const parent=element('div','rudi-products-autocomplete');
    form.parentNode.insertBefore(parent,form);
    parent.appendChild(form);
    dropdown=element('div','rudi-products-dropdown');
    dropdown.id='productsSuggestions';
    dropdown.hidden=true;
    dropdown.setAttribute('role','listbox');
    parent.appendChild(dropdown);
    input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-controls','productsSuggestions');
    input.setAttribute('aria-expanded','false');
    input.addEventListener('input',renderDropdown);
    input.addEventListener('focus',renderDropdown);
    input.addEventListener('blur',()=>setTimeout(()=>{if(!keepSuggestions)closeDropdown()},120));
    input.addEventListener('keydown',event=>{if(event.key==='Escape')closeDropdown()});
    form.addEventListener('submit',()=>closeDropdown());
    const history=$('productsHistoryTitle')?.closest('.products-history');
    frequent=element('section','rudi-frequent-products');
    frequent.hidden=true;
    if(history?.parentNode)history.parentNode.insertBefore(frequent,history);
    const list=$('productsGroups');
    list?.addEventListener('click',event=>{
      const content=event.target.closest('.product-main');
      if(!content || !list.contains(content)) return;
      const row=content.closest('.product-item[data-rudi-item-id]');
      const item=(state().items||[]).find(entry=>String(entry.id)===String(row?.dataset.rudiItemId));
      openModal(item);
    });
    list?.addEventListener('keydown',event=>{
      if(event.key!=='Enter' && event.key!==' ')return;
      const content=event.target.closest('.product-main');
      if(!content)return;
      event.preventDefault();content.click();
    });
    renderFrequent();
    renderDropdown();
  }
  // Only Rustam sees purchase confirmation; server enforces access independently.
  function updateBoughtVisibility(){
    const button=$('productsBought');if(!button)return;
    const allowed=button.textContent.trim()==='Купил';
    button.dataset.rudiBuyerAllowed=allowed?'true':'false';
    button.hidden=!allowed;
  }
  function watchBoughtVisibility(){
    const button=$('productsBought');if(!button)return;
    updateBoughtVisibility();
    new MutationObserver(updateBoughtVisibility).observe(button,{childList:true,characterData:true,subtree:true});
  }
  window.addEventListener('rudi-products-update',()=>{updateBoughtVisibility();renderFrequent();renderDropdown();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setup();watchBoughtVisibility()},{once:true});
  else {setup();watchBoughtVisibility();}
})();