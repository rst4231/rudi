/* Calendar-only offline snapshots and cautious mutation queue. No auth secrets are persisted. */
(function (root) {
  'use strict';
  const DATABASE = 'rudi-calendar-offline-v1';
  let actor = '';
  let pending = 0;
  let needsReview = 0;
  let syncing = false;
  const offlineNow = () => navigator.onLine === false || root.document?.body?.dataset?.offlineMode === '1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = () => (root.crypto?.randomUUID?.() || String(Date.now()) + '-' + Math.random().toString(36).slice(2));
  const key = (who, scope, month) => [who, scope, month].join('|');

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('offline-db-open'));
      request.onblocked = () => reject(Error('offline-db-blocked'));
    });
  }

  async function store(name, mode, task) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(name, mode);
      const table = tx.objectStore(name);
      try { result = task(table); } catch (e) { tx.abort(); reject(e); return; }
      tx.oncomplete = () => { db.close(); resolve(result && 'result' in result ? result.result : result); };
      tx.onerror = () => { db.close(); reject(tx.error || Error('offline-db-transaction')); };
      tx.onabort = () => { db.close(); reject(tx.error || Error('offline-db-aborted')); };
    });
  }
  const all = name => store(name, 'readonly', table => table.getAll());
  const change = (name, action) => store(name, 'readwrite', action);

  async function summary(who = actor) {
    const rows = (await all('outbox')).filter(row => row.actor === who);
    pending = rows.length;
    needsReview = rows.filter(row => row.state !== 'queued').length;
    root.dispatchEvent(new CustomEvent('rudi-calendar-queue', { detail: { actor: who, pending, needsReview } }));
    return { pending, needsReview };
  }
  async function init(who) {
    actor = String(who || '');
    if (actor) return summary(actor);
    return { pending: 0, needsReview: 0 };
  }
  async function capture(who, scope, month, payload) {
    if (!who || !payload?.days?.length) return;
    // Store server data, never the optimistic overlay.
    await change('snapshots', table => table.put({
      key: key(who, scope, month), savedAt: Date.now(), payload: clone(payload)
    }));
  }
  async function cached(who, scope, month) {
    if (!who) return null;
    const row = await store('snapshots', 'readonly', table => table.get(key(who, scope, month)));
    return row?.payload ? { ...clone(row.payload), stale: true, offlineStale: true } : null;
  }
  async function enqueue(who, kind, details) {
    if (!who || !['create', 'update', 'delete', 'complete', 'personal-complete', 'move', 'personal-move'].includes(kind))
      throw Error('calendar-offline-invalid-action');
    const row = {
      id: id(), actor: who, kind, details: clone(details || {}),
      createdAt: Date.now(), state: 'queued'
    };
    await change('outbox', table => table.add(row));
    await summary(who);
    return { ok: true, queued: true, offlineId: row.id };
  }
  function eventFromCreate(row) {
    const value = row.details.value || {};
    return {
      id: 'offline:' + row.id, title: String(value.title || 'Новое дело'),
      date: String(value.date || ''), startTime: String(value.time || ''),
      endTime: '', allDay: !value.time, description: String(value.description || ''),
      responsible: String(value.responsible || ''), repeat: value.repeat || 'none',
      repeatCount: value.repeatCount || 1, together: !value.responsible,
      assigned: Boolean(value.responsible), personal: false, canEdit: false,
      canComplete: false, canDelete: false, offlinePending: true
    };
  }
  function overlay(source, rows, month) {
    const result = clone(source);
    const days = Array.isArray(result.ticktickDays) ? result.ticktickDays : (result.ticktickDays = []);
    const getDay = date => {
      let day = days.find(x => x.date === date);
      if (!day) { day = { date, events: [] }; days.push(day); }
      if (!Array.isArray(day.events)) day.events = [];
      return day;
    };
    for (const row of rows) {
      const d = row.details || {};
      if (row.kind === 'create') {
        const item = eventFromCreate(row);
        if (item.date.slice(0, 7) === month) getDay(item.date).events.push(item);
        continue;
      }
      const taskId = String(d.taskId || '');
      if (!taskId) continue;
      let old = d.task ? clone(d.task) : null;
      for (const day of days) {
        if (!Array.isArray(day.events)) continue;
        const entry = day.events.find(x => String(x?.id || '') === taskId);
        if (entry) old = clone(entry);
        day.events = day.events.filter(x => String(x?.id || '') !== taskId);
      }
      if (row.kind === 'complete' || row.kind === 'personal-complete' || row.kind === 'delete') continue;
      if (!old) continue;
      const value = d.value || {};
      const next = {
        ...old, title: value.title === undefined ? old.title : value.title,
        description: value.description === undefined ? old.description : value.description,
        responsible: value.responsible === undefined ? old.responsible : value.responsible,
        repeat: value.repeat === undefined ? old.repeat : value.repeat,
        repeatCount: value.repeatCount === undefined ? old.repeatCount : value.repeatCount,
        date: String(value.date || d.date || old.date),
        startTime: value.time === undefined && d.time === undefined ? old.startTime : String(value.time ?? d.time ?? ''),
        offlinePending: true
      };
      next.allDay = !next.startTime;
      if (next.date.slice(0, 7) === month) getDay(next.date).events.push(next);
    }
    days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    result.offlinePending = rows.length;
    result.offlineNeedsReview = rows.filter(x => x.state !== 'queued').length;
    return result;
  }
  async function materialize(who, month, payload) {
    const rows = (await all('outbox')).filter(row => row.actor === who);
    return overlay(payload, rows, month);
  }

  function endpoint(row) {
    const k = row.kind;
    if (k === 'create') return '/api/ticktick/task-create';
    if (k === 'update') return '/api/ticktick/task-update';
    if (k === 'delete') return '/api/ticktick/task-delete';
    if (k === 'complete') return '/api/ticktick/task-complete';
    if (k === 'personal-complete') return '/api/partner-message?ticktickAction=personal-task-complete';
    if (k === 'personal-move') return '/api/partner-message?ticktickAction=personal-task-move';
    if (k === 'move') return '/api/partner-message?ticktickAction=task-move';
    throw Error('calendar-offline-unsupported-action');
  }
  async function flush(who, auth) {
    if (syncing || !who || offlineNow()) return { sent: 0, pending };
    syncing = true;
    let sent = 0;
    try {
      const rows = (await all('outbox')).filter(row => row.actor === who)
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      for (const row of rows) {
        // An interrupted in-flight POST might have succeeded. Never blindly replay it.
        if (row.state !== 'queued' || offlineNow()) break;
        const details = row.details || {};
        const { task, value, ...parameters } = details;
        const body = { ...auth(), ...parameters, ...(value || {}) };
        row.state = 'inflight';
        await change('outbox', table => table.put(row));
        try {
          const response = await fetch(endpoint(row), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), cache: 'no-store'
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.ok !== true) {
            // Explicit rejection is safe to retry only after a user resolves the cause.
            row.state = 'blocked';
            await change('outbox', table => table.put(row));
            break;
          }
          await change('outbox', table => table.delete(row.id));
          sent += 1;
        } catch (_) {
          // Unknown delivery status: preserve the operation for review instead of duplicating it.
          row.state = 'review';
          await change('outbox', table => table.put(row));
          break;
        }
      }
      const state = await summary(who);
      if (sent) root.dispatchEvent(new CustomEvent('rudi-calendar-synced', { detail: { sent, ...state } }));
      return { sent, ...state };
    } finally {
      syncing = false;
      root.dispatchEvent(new CustomEvent('rudi-calendar-flush-idle'));
    }
  }
  root.rudiCalendarOffline = {
    init, cached, capture, materialize, enqueue, flush, summary,
    hasPendingSync: () => pending > 0,
    isSyncing: () => syncing,
    isOffline: offlineNow,
    status: () => ({ pending, needsReview })
  };
})(window);
