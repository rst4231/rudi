const { validatePosterUrl } = require('./poster-proxy.js');

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function escapeHtml(value) {
  return String(value || '').replace(/[&<>]/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function escapeXml(value) {
  return String(value || '').replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[char]));
}

function kinopoiskSearchUrl(title) {
  return `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(String(title || '').trim())}`;
}

function dateLabel(dateKey) {
  const [, month, day] = String(dateKey || '').split('-').map(Number);
  return day && month && RU_MONTHS[month - 1] ? `${day} ${RU_MONTHS[month - 1]}` : String(dateKey || '');
}

function buildCinemaDigestCaption(rows, dateKey) {
  const items = (rows || []).map((row, index) => {
    const title = escapeHtml(row?.title || 'Фильм');
    const link = escapeHtml(row?.kinopoiskUrl || kinopoiskSearchUrl(row?.title));
    const cinemas = Array.isArray(row?.sources) && row.sources.length
      ? row.sources.map(escapeHtml).join(', ')
      : 'Кинотеатр';
    return `${index + 1}. <a href="${link}">${title}</a>\n${cinemas}`;
  });
  return [
    `🎬 <b>Кинопремьеры — ${escapeHtml(dateLabel(dateKey))}</b>`,
    '',
    ...items.flatMap((item, index) => (index ? ['', item] : [item])),
  ].join('\n');
}

function collageGrid(count) {
  const total = Math.max(1, Math.min(12, Number(count) || 1));
  const columns = total <= 1 ? 1 : total <= 4 ? 2 : total <= 9 ? 3 : 4;
  return { columns, rows: Math.ceil(total / columns) };
}

function posterReferer(sourceUrl) {
  try {
    const host = new URL(sourceUrl).hostname;
    return host.endsWith('mirage.ru') ? 'https://www.mirage.ru/' : 'https://sky.kinopolis-film.ru/';
  } catch {
    return 'https://sky.kinopolis-film.ru/';
  }
}

async function fetchPosterBuffer(url, options = {}) {
  const sourceUrl = validatePosterUrl(url);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(sourceUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; RUDI-Cinema-Collage/1.0)',
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      referer: posterReferer(sourceUrl),
    },
    cache: 'no-store',
  });
  if (!response?.ok) throw new Error(`poster-http-${response?.status || 0}`);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('poster-not-image');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('poster-size-invalid');
  return buffer;
}

function numberBadge(index, width) {
  const size = Math.max(50, Math.round(width * 0.12));
  const fontSize = Math.round(size * 0.5);
  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.25)}" fill="rgba(0,0,0,0.78)"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="white">${index + 1}</text>
    </svg>`);
}

function fallbackPoster(title, width, height, index) {
  const safeTitle = escapeXml(String(title || 'Афиша недоступна').slice(0, 42));
  const fontSize = Math.max(24, Math.round(width * 0.07));
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1d1d1f"/>
      <text x="50%" y="46%" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="white">${safeTitle}</text>
      <text x="50%" y="54%" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="${Math.round(fontSize * 0.7)}" fill="#b7b7b7">Афиша недоступна</text>
      <rect x="18" y="18" width="${Math.max(50, Math.round(width * 0.12))}" height="${Math.max(50, Math.round(width * 0.12))}"
        rx="14" fill="rgba(0,0,0,0.78)"/>
      <text x="${18 + Math.max(50, Math.round(width * 0.12)) / 2}" y="${18 + Math.max(50, Math.round(width * 0.12)) / 2 + 4}"
        text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif"
        font-size="${Math.round(Math.max(50, Math.round(width * 0.12)) * 0.5)}" font-weight="700" fill="white">${index + 1}</text>
    </svg>`);
}

async function buildCinemaCollage(rows, options = {}) {
  const sharp = require('sharp');
  const items = (rows || []).filter((row) => row?.title).slice(0, 12);
  if (!items.length) throw new Error('cinema-collage-empty');

  const tileWidth = Math.max(120, Number(options.tileWidth || 500));
  const tileHeight = Math.max(180, Number(options.tileHeight || 750));
  const gap = Math.max(0, Number(options.gap ?? 8));
  const { columns, rows: rowCount } = collageGrid(items.length);
  const canvasWidth = columns * tileWidth + Math.max(0, columns - 1) * gap;
  const canvasHeight = rowCount * tileHeight + Math.max(0, rowCount - 1) * gap;

  const tiles = await Promise.all(items.map(async (row, index) => {
    try {
      if (!row.posterUrl) throw new Error('poster-unavailable');
      const poster = await fetchPosterBuffer(row.posterUrl, options);
      return await sharp(poster)
        .rotate()
        .resize(tileWidth, tileHeight, { fit: 'contain', position: 'centre', background: '#111111' })
        .composite([{ input: numberBadge(index, tileWidth), left: 18, top: 18 }])
        .jpeg({ quality: 86, chromaSubsampling: '4:4:4' })
        .toBuffer();
    } catch (error) {
      console.warn('RUDI_CINEMA_COLLAGE_POSTER_ERROR', row?.title, String(error?.message || error));
      return sharp(fallbackPoster(row?.title, tileWidth, tileHeight, index)).jpeg({ quality: 86 }).toBuffer();
    }
  }));

  const composite = tiles.map((input, index) => ({
    input,
    left: (index % columns) * (tileWidth + gap),
    top: Math.floor(index / columns) * (tileHeight + gap),
  }));

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: '#111111',
    },
  })
    .composite(composite)
    .jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
}

module.exports = {
  kinopoiskSearchUrl,
  buildCinemaDigestCaption,
  collageGrid,
  buildCinemaCollage,
  fetchPosterBuffer,
};
