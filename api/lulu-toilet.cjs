const TZ = 'Europe/Moscow';
const BIRTH_YEAR = 2020;
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

function walkLikelyIncludedMeal(walkedAt) {
  const walked = new Date(String(walkedAt || ''));
  if (Number.isNaN(walked.getTime())) return false;
  const minutes = localMinutes(walked);
  // Personal Lulu routine: any morning walk before 12:00 usually includes feeding;
  // evening walks from 20:00 onward usually include the evening meal.
  return minutes < 12 * 60 || minutes >= 20 * 60;
}

function mealWindowBoost(walkedAt, now = new Date()) {
  const walked = new Date(String(walkedAt || ''));
  const current = new Date(now);
  if (Number.isNaN(walked.getTime()) || Number.isNaN(current.getTime())) return 0;
  if (!walkLikelyIncludedMeal(walkedAt)) return 0;
  const elapsedHours = Math.max(0, (current.getTime() - walked.getTime()) / 3600000);
  if (elapsedHours < 0.5) return 2;
  if (elapsedHours < 1.5) return 7;
  if (elapsedHours < 3) return 10;
  if (elapsedHours < 4.5) return 7;
  if (elapsedHours < 6) return 4;
  return 0;
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
  const comfortableHours = age >= 10 ? 3.5 : age >= 8 ? 3.75 : 4;
  const ratio = elapsedHours / comfortableHours;
  const points = [
    [0, 5], [.25, 12], [.5, 28], [.75, 48], [1, 68],
    [1.25, 82], [1.5, 92], [1.75, 98], [2, 100],
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

module.exports = { TZ, BIRTH_YEAR, dateKey, localMinutes, walkLikelyIncludedMeal, mealWindowBoost, luluToiletProbability };
