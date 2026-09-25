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
  if (elapsedHours < 0.5) return 0;
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
  const points = [
    [0, 0], [0.5, 2], [1, 5], [1.5, 10], [2, 18],
    [3, 28], [4, 43], [5, 65], [6, 85], [7, 96], [8, 100],
  ];

  if (elapsedHours >= points[points.length - 1][0]) return 100;
  for (let i = 1; i < points.length; i += 1) {
    const [x2, y2] = points[i];
    const [x1, y1] = points[i - 1];
    if (elapsedHours <= x2) {
      const t = (elapsedHours - x1) / (x2 - x1);
      return Math.max(0, Math.min(100, Math.round(y1 + (y2 - y1) * t)));
    }
  }
  return 100;
}

module.exports = { TZ, BIRTH_YEAR, dateKey, localMinutes, walkLikelyIncludedMeal, mealWindowBoost, luluToiletProbability };
