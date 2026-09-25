const TZ = 'Europe/Moscow';
const BIRTH_YEAR = 2020;
const MEAL_WINDOWS = [
  { start: 8 * 60, end: 10 * 60 },
  { start: 20 * 60, end: 22 * 60 },
];

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function mealWindowBoost(walkedAt, now = new Date()) {
  const walked = new Date(String(walkedAt || ''));
  const current = new Date(now);
  if (Number.isNaN(walked.getTime()) || Number.isNaN(current.getTime())) return 0;
  const nowMinutes = localMinutes(current);
  const walkedMinutes = localMinutes(walked);
  const sameDay = dateKey(walked) === dateKey(current);
  let boost = 0;
  for (const window of MEAL_WINDOWS) {
    if (!(nowMinutes >= window.start && nowMinutes <= window.end + 120)) continue;
    if (!sameDay || walkedMinutes < window.start) boost = Math.max(boost, 10);
    else if (walkedMinutes <= window.end) boost = Math.max(boost, 4);
  }
  return boost;
}

function luluToiletProbability(walkedAt, now = new Date()) {
  const walked = new Date(String(walkedAt || ''));
  const current = new Date(now);
  if (Number.isNaN(walked.getTime()) || Number.isNaN(current.getTime())) return null;
  const elapsedHours = Math.max(0, (current.getTime() - walked.getTime()) / 3600000);
  const currentYear = Number(new Intl.DateTimeFormat('en', {
    timeZone: TZ, year: 'numeric',
  }).format(current));
  const age = Math.max(0, currentYear - BIRTH_YEAR);
  const comfortableHours = age >= 10 ? 4.5 : age >= 8 ? 5.25 : 6;
  const ratio = elapsedHours / comfortableHours;
  const points = [
    [0, 6], [.2, 10], [.4, 20], [.6, 34], [.8, 52],
    [1, 70], [1.2, 84], [1.4, 93], [1.7, 98],
  ];
  let base = 98;
  if (ratio <= points[0][0]) base = points[0][1];
  else {
    for (let i = 1; i < points.length; i += 1) {
      const [x2, y2] = points[i];
      const [x1, y1] = points[i - 1];
      if (ratio <= x2) {
        const t = (ratio - x1) / (x2 - x1);
        base = Math.round(y1 + (y2 - y1) * t);
        break;
      }
    }
  }
  const mealBoost = mealWindowBoost(walkedAt, current);
  const waterBoost = elapsedHours >= 2 ? 3 : 1;
  return Math.max(5, Math.min(100, Math.round(base + mealBoost + waterBoost)));
}

module.exports = { TZ, BIRTH_YEAR, MEAL_WINDOWS, localMinutes, mealWindowBoost, luluToiletProbability };
