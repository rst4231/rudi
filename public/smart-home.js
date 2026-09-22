(() => {
  const tg = window.Telegram?.WebApp;
  const state = {
    data: null,
    loading: false,
    expanded: false,
    actionBusy: new Set(),
    rangeTimers: new Map(),
  };

  const typeLabels = [
    [/vacuum_cleaner/i, 'Пылесос'],
    [/sensor\.climate/i, 'Датчик климата'],
    [/light\.strip/i, 'Лента'],
    [/smart_speaker/i, 'Колонка'],
    [/headphones/i, 'Наушники'],
    [/socket/i, 'Розетка'],
    [/switch/i, 'Переключатель'],
  ];

  function typeLabel(type) {
    const value = String(type || '');
    const match = typeLabels.find(([pattern]) => pattern.test(value));
    return match ? match[1] : 'Устройство';
  }

  function instanceLabel(instance) {
    const labels = {
      temperature: 'Температура',
      humidity: 'Влажность',
      battery_level: 'Батарея',
      signal_level: 'Сигнал',
      brightness: 'Яркость',
      volume: 'Громкость',
      work_speed: 'Скорость',
      noise_canceling: 'Шумоподавление',
      pause: 'Пауза',
      controls_locked: 'Блокировка',
      button: 'Кнопка',
    };
    return labels[String(instance || '')] || String(instance || '').replaceAll('_', ' ');
  }

  function valueLabel(instance, value, unit = '') {
    if (value === null || value === undefined || value === '') return '—';
    if (instance === 'temperature') return Number(value).toFixed(1) + '°';
    if (instance === 'humidity' || instance === 'battery_level' || instance === 'signal_level' || unit === 'unit.percent') {
      return Math.round(Number(value)) + '%';
    }
    if (typeof value === 'boolean') return value ? 'Вкл' : 'Выкл';
    if (typeof value === 'object') {
      if (value && Number.isFinite(Number(value.h)) && Number.isFinite(Number(value.s)) && Number.isFinite(Number(value.v))) {
        return 'HSV ' + [value.h, value.s, value.v].map(Number).join(' / ');
      }
      return '';
    }
    return String(value);
  }

  async function request(operation, payload = {}) {
    const response = await fetch('/api/smart-home', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg?.initData || '',
        operation,
        ...payload,
      }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const error = new Error(data.error || 'smart-home-request-failed');
      error.payload = data;
      throw error;
    }
    return data;
  }

  function ensureTile() {
    let tile = document.getElementById('smartHomeTile');
    if (tile) return tile;

    tile = document.createElement('section');
    tile.id = 'smartHomeTile';
    tile.className = 'panel smart-home-tile';
    tile.dataset.appTabSection = 'home';
    tile.dataset.homeTile = 'smart-home';
    tile.innerHTML = [
      '<div class="smart-home-head">',
        '<div class="smart-home-head-copy">',
          '<div class="home-dashboard-label">Дом</div>',
          '<h2>Умный дом</h2>',
          '<div id="smartHomeSummary" class="smart-home-summary">Подключаю устройства…</div>',
        '</div>',
        '<div class="smart-home-head-actions">',
          '<button id="smartHomeRefresh" class="smart-home-icon-button" type="button" aria-label="Обновить умный дом" title="Обновить">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
          '</button>',
          '<button id="smartHomeToggle" class="smart-home-toggle" type="button" aria-expanded="false">',
            '<span>Открыть</span>',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m8 10 4 4 4-4"/></svg>',
          '</button>',
        '</div>',
      '</div>',
      '<div id="smartHomeClimate" class="smart-home-climate" hidden></div>',
      '<div id="smartHomeStatus" class="smart-home-status" aria-live="polite"></div>',
      '<div id="smartHomeBody" class="smart-home-body" hidden>',
        '<section id="smartHomeScenarios" class="smart-home-section" hidden>',
          '<div class="smart-home-section-title">Сценарии</div>',
          '<div id="smartHomeScenarioList" class="smart-home-scenarios"></div>',
        '</section>',
        '<div id="smartHomeRooms" class="smart-home-rooms"></div>',
      '</div>',
    ].join('');

    const cycle = document.getElementById('dianaCycleCard');
    if (cycle) cycle.after(tile);
    else document.querySelector('.shell')?.appendChild(tile);

    tile.querySelector('#smartHomeToggle')?.addEventListener('click', () => {
      state.expanded = !state.expanded;
      applyExpanded();
      if (state.expanded) loadHome({ silent: Boolean(state.data) });
    });
    tile.querySelector('#smartHomeRefresh')?.addEventListener('click', () => loadHome({ silent: false, force: true }));
    return tile;
  }

  function applyExpanded() {
    const body = document.getElementById('smartHomeBody');
    const toggle = document.getElementById('smartHomeToggle');
    if (body) body.hidden = !state.expanded;
    if (toggle) {
      toggle.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
      const label = toggle.querySelector('span');
      if (label) label.textContent = state.expanded ? 'Свернуть' : 'Открыть';
      toggle.classList.toggle('is-open', state.expanded);
    }
  }

  function setStatus(text, mode = '') {
    const node = document.getElementById('smartHomeStatus');
    if (!node) return;
    node.textContent = String(text || '');
    node.className = 'smart-home-status' + (mode ? ' is-' + mode : '');
    node.hidden = !String(text || '').trim();
  }

  function climateDevice(data) {
    return (data?.devices || []).find(device =>
      (device.properties || []).some(property => property?.parameters?.instance === 'temperature')
    ) || null;
  }

  function propertyValue(device, instance) {
    const property = (device?.properties || []).find(item => item?.parameters?.instance === instance);
    return property?.state?.value;
  }

  function renderSummary(data) {
    const summary = document.getElementById('smartHomeSummary');
    const climate = document.getElementById('smartHomeClimate');
    const device = climateDevice(data);
    const temperature = propertyValue(device, 'temperature');
    const humidity = propertyValue(device, 'humidity');
    const battery = propertyValue(device, 'battery_level');

    if (summary) {
      const bits = [];
      if (Number.isFinite(Number(temperature))) bits.push(Number(temperature).toFixed(1) + '°');
      if (Number.isFinite(Number(humidity))) bits.push(Math.round(Number(humidity)) + '% влажность');
      bits.push((data?.devices || []).length + ' устройств');
      summary.textContent = bits.join(' · ');
    }

    if (climate) {
      climate.replaceChildren();
      const items = [
        ['Температура', Number.isFinite(Number(temperature)) ? Number(temperature).toFixed(1) + '°C' : '—'],
        ['Влажность', Number.isFinite(Number(humidity)) ? Math.round(Number(humidity)) + '%' : '—'],
        ['Датчик', Number.isFinite(Number(battery)) ? Math.round(Number(battery)) + '%' : '—'],
      ];
      for (const [label, value] of items) {
        const item = document.createElement('div');
        item.className = 'smart-home-climate-item';
        item.innerHTML = '<span></span><strong></strong>';
        item.querySelector('span').textContent = label;
        item.querySelector('strong').textContent = value;
        climate.appendChild(item);
      }
      climate.hidden = !device;
    }
  }

  function roomNameMaps(data) {
    const rooms = new Map((data?.rooms || []).map(room => [room.id, room]));
    const households = new Map((data?.households || []).map(home => [home.id, home]));
    return { rooms, households };
  }

  function groupDevices(data) {
    const { rooms, households } = roomNameMaps(data);
    const groups = new Map();

    for (const device of data?.devices || []) {
      const room = rooms.get(device.room);
      const household = households.get(device.householdId);
      const householdName = household?.name || 'Дом';
      const roomName = room?.name || (household?.type === 'households.types.portable' ? 'Портативные' : 'Без комнаты');
      const key = householdName + '|' + roomName;
      if (!groups.has(key)) groups.set(key, { householdName, roomName, devices: [] });
      groups.get(key).devices.push(device);
    }

    return [...groups.values()].sort((a, b) => {
      const portableA = a.roomName === 'Портативные' ? 1 : 0;
      const portableB = b.roomName === 'Портативные' ? 1 : 0;
      if (portableA !== portableB) return portableA - portableB;
      return a.roomName.localeCompare(b.roomName, 'ru');
    });
  }

  function propertyChips(device) {
    const supported = ['temperature', 'humidity', 'battery_level', 'signal_level', 'button'];
    const items = [];
    for (const property of device?.properties || []) {
      const instance = String(property?.parameters?.instance || '');
      if (!supported.includes(instance)) continue;
      const value = property?.state?.value;
      if (value === null || value === undefined) continue;
      items.push({
        label: instanceLabel(instance),
        value: valueLabel(instance, value, property?.parameters?.unit),
      });
    }
    return items;
  }

  function mainOnOff(device) {
    return (device?.capabilities || []).find(capability =>
      capability.type === 'devices.capabilities.on_off' &&
      typeof capability?.state?.value === 'boolean'
    ) || null;
  }

  async function runAction(deviceId, capability, stateValue, control) {
    const key = deviceId + ':' + capability.type + ':' + capability?.state?.instance;
    if (state.actionBusy.has(key)) return;
    state.actionBusy.add(key);
    if (control) control.disabled = true;
    try {
      await request('action', {
        deviceId,
        type: capability.type,
        state: {
          instance: capability.state.instance,
          value: stateValue,
        },
      });
      try { tg?.HapticFeedback?.notificationOccurred?.('success'); } catch (_) {}
      setStatus('Команда выполнена', 'success');
      setTimeout(() => loadHome({ silent: true, force: true }), 450);
    } catch (error) {
      setStatus('Не удалось выполнить команду', 'error');
      try { tg?.HapticFeedback?.notificationOccurred?.('error'); } catch (_) {}
    } finally {
      state.actionBusy.delete(key);
      if (control) control.disabled = false;
    }
  }

  function onOffControl(device, capability) {
    const label = document.createElement('label');
    label.className = 'smart-home-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(capability.state.value);
    const track = document.createElement('span');
    track.className = 'smart-home-switch-track';
    const text = document.createElement('span');
    text.className = 'smart-home-switch-label';
    text.textContent = input.checked ? 'Включено' : 'Выключено';
    input.addEventListener('change', async () => {
      const wanted = input.checked;
      text.textContent = wanted ? 'Включено' : 'Выключено';
      await runAction(device.id, capability, wanted, input);
    });
    label.append(input, track, text);
    return label;
  }

  function rangeControl(device, capability) {
    const instance = String(capability?.state?.instance || capability?.parameters?.instance || '');
    const value = Number(capability?.state?.value);
    const range = capability?.parameters?.range || {};
    if (!Number.isFinite(value)) return null;
    if (!Number.isFinite(Number(range.min)) || !Number.isFinite(Number(range.max))) return null;

    const wrap = document.createElement('div');
    wrap.className = 'smart-home-range';
    const head = document.createElement('div');
    head.className = 'smart-home-range-head';
    const label = document.createElement('span');
    label.textContent = instanceLabel(instance);
    const number = document.createElement('strong');
    number.textContent = Math.round(value) + (capability?.parameters?.unit === 'unit.percent' ? '%' : '');
    head.append(label, number);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.precision || 1);
    input.value = String(value);
    input.addEventListener('input', () => {
      number.textContent = Math.round(Number(input.value)) + (capability?.parameters?.unit === 'unit.percent' ? '%' : '');
      const old = state.rangeTimers.get(device.id + ':' + instance);
      if (old) clearTimeout(old);
      const timer = setTimeout(() => {
        runAction(device.id, capability, Number(input.value), input);
        state.rangeTimers.delete(device.id + ':' + instance);
      }, 380);
      state.rangeTimers.set(device.id + ':' + instance, timer);
    });
    wrap.append(head, input);
    return wrap;
  }

  function modeControl(device, capability) {
    const instance = String(capability?.state?.instance || capability?.parameters?.instance || '');
    const value = String(capability?.state?.value || '');
    const modes = Array.isArray(capability?.parameters?.modes) ? capability.parameters.modes : [];
    if (!value || !modes.length) return null;

    const wrap = document.createElement('label');
    wrap.className = 'smart-home-select';
    const label = document.createElement('span');
    label.textContent = instanceLabel(instance);
    const select = document.createElement('select');
    for (const mode of modes) {
      const option = document.createElement('option');
      option.value = String(mode?.value || '');
      option.textContent = String(mode?.name || mode?.value || '').replaceAll('_', ' ');
      option.selected = option.value === value;
      select.appendChild(option);
    }
    select.addEventListener('change', () => runAction(device.id, capability, select.value, select));
    wrap.append(label, select);
    return wrap;
  }

  function toggleControl(device, capability) {
    if (typeof capability?.state?.value !== 'boolean') return null;
    const instance = String(capability?.state?.instance || capability?.parameters?.instance || '');
    const label = document.createElement('label');
    label.className = 'smart-home-mini-toggle';
    const text = document.createElement('span');
    text.textContent = instanceLabel(instance);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(capability.state.value);
    input.addEventListener('change', () => runAction(device.id, capability, input.checked, input));
    label.append(text, input);
    return label;
  }

  function deviceCard(device) {
    const card = document.createElement('article');
    card.className = 'smart-home-device';

    const head = document.createElement('div');
    head.className = 'smart-home-device-head';
    const title = document.createElement('div');
    title.className = 'smart-home-device-title';
    const name = document.createElement('strong');
    name.textContent = device.name || 'Устройство';
    const type = document.createElement('span');
    type.textContent = typeLabel(device.type);
    title.append(name, type);
    head.appendChild(title);

    const onOff = mainOnOff(device);
    if (onOff) {
      const badge = document.createElement('span');
      badge.className = 'smart-home-state ' + (onOff.state.value ? 'is-on' : 'is-off');
      badge.textContent = onOff.state.value ? 'Вкл' : 'Выкл';
      head.appendChild(badge);
    }
    card.appendChild(head);

    const chips = propertyChips(device);
    if (chips.length) {
      const row = document.createElement('div');
      row.className = 'smart-home-properties';
      for (const chip of chips) {
        const item = document.createElement('span');
        item.className = 'smart-home-property';
        item.innerHTML = '<small></small><strong></strong>';
        item.querySelector('small').textContent = chip.label;
        item.querySelector('strong').textContent = chip.value;
        row.appendChild(item);
      }
      card.appendChild(row);
    }

    const controls = document.createElement('div');
    controls.className = 'smart-home-controls';
    for (const capability of device?.capabilities || []) {
      let control = null;
      if (capability.type === 'devices.capabilities.on_off' && typeof capability?.state?.value === 'boolean') {
        control = onOffControl(device, capability);
      } else if (capability.type === 'devices.capabilities.range') {
        control = rangeControl(device, capability);
      } else if (capability.type === 'devices.capabilities.mode') {
        control = modeControl(device, capability);
      } else if (capability.type === 'devices.capabilities.toggle') {
        control = toggleControl(device, capability);
      }
      if (control) controls.appendChild(control);
    }
    if (controls.childElementCount) card.appendChild(controls);

    if (device?.info?.manufacturer || device?.info?.model) {
      const meta = document.createElement('div');
      meta.className = 'smart-home-device-meta';
      meta.textContent = [device.info.manufacturer, device.info.model].filter(Boolean).join(' · ');
      card.appendChild(meta);
    }

    return card;
  }

  function renderRooms(data) {
    const root = document.getElementById('smartHomeRooms');
    if (!root) return;
    root.replaceChildren();

    for (const group of groupDevices(data)) {
      const section = document.createElement('section');
      section.className = 'smart-home-room';
      const head = document.createElement('div');
      head.className = 'smart-home-room-head';
      const title = document.createElement('strong');
      title.textContent = group.roomName;
      const count = document.createElement('span');
      count.textContent = group.devices.length + ' ' + (group.devices.length === 1 ? 'устройство' : group.devices.length < 5 ? 'устройства' : 'устройств');
      head.append(title, count);
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'smart-home-device-grid';
      group.devices
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
        .forEach(device => grid.appendChild(deviceCard(device)));
      section.appendChild(grid);
      root.appendChild(section);
    }
  }

  async function runScenario(scenario, button) {
    if (!scenario?.id || button.disabled) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Запускаю…';
    try {
      await request('scenario', { scenarioId: scenario.id });
      button.textContent = 'Запущено';
      setStatus('Сценарий «' + scenario.name + '» запущен', 'success');
      try { tg?.HapticFeedback?.notificationOccurred?.('success'); } catch (_) {}
      setTimeout(() => { button.textContent = original; button.disabled = !scenario.active; }, 1200);
    } catch (_) {
      button.textContent = 'Ошибка';
      setStatus('Не удалось запустить сценарий', 'error');
      setTimeout(() => { button.textContent = original; button.disabled = !scenario.active; }, 1200);
    }
  }

  function renderScenarios(data) {
    const section = document.getElementById('smartHomeScenarios');
    const list = document.getElementById('smartHomeScenarioList');
    if (!section || !list) return;
    list.replaceChildren();
    const scenarios = Array.isArray(data?.scenarios) ? data.scenarios : [];
    section.hidden = !scenarios.length;

    for (const scenario of scenarios) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'smart-home-scenario';
      button.disabled = !scenario.active;
      const name = document.createElement('strong');
      name.textContent = scenario.name;
      const stateLabel = document.createElement('span');
      stateLabel.textContent = scenario.active ? 'Запустить' : 'Выключен';
      button.append(name, stateLabel);
      button.addEventListener('click', () => runScenario(scenario, button));
      list.appendChild(button);
    }
  }

  function render(data) {
    renderSummary(data);
    renderScenarios(data);
    renderRooms(data);
    setStatus('');
  }

  async function loadHome({ silent = false } = {}) {
    if (!tg?.initData || state.loading) return;
    state.loading = true;
    const refresh = document.getElementById('smartHomeRefresh');
    if (refresh) refresh.classList.add('is-loading');
    if (!silent) setStatus('Обновляю устройства…');
    try {
      const data = await request('list');
      state.data = data;
      render(data);
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('yandex-iot-not-configured')) {
        setStatus('Умный дом ещё не подключён к production', 'muted');
      } else {
        setStatus('Не удалось обновить умный дом', 'error');
      }
    } finally {
      state.loading = false;
      if (refresh) refresh.classList.remove('is-loading');
    }
  }

  function start() {
    ensureTile();
    applyExpanded();

    let attempts = 0;
    const waitForAuth = () => {
      attempts += 1;
      if (document.body.classList.contains('auth-ok') && tg?.initData) {
        loadHome({ silent: false });
        return;
      }
      if (attempts < 40) setTimeout(waitForAuth, 250);
    };
    waitForAuth();

    setInterval(() => {
      if (document.visibilityState === 'visible' && tg?.initData && !state.loading) {
        loadHome({ silent: true });
      }
    }, 60 * 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && tg?.initData) loadHome({ silent: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
