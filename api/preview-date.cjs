function moscowDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid preview clock');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function shiftDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function validateDateKey(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Invalid preview date; use today, tomorrow, or YYYY-MM-DD');
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error('Invalid preview date; use today, tomorrow, or YYYY-MM-DD');
  }
  return text;
}

function resolvePreviewDate(input = 'today', now = new Date()) {
  const value = String(input || 'today').trim().toLowerCase();
  const today = moscowDateKey(now);
  if (value === 'today') return today;
  if (value === 'tomorrow') return shiftDateKey(today, 1);
  return validateDateKey(value);
}

module.exports = { moscowDateKey, shiftDateKey, validateDateKey, resolvePreviewDate };
