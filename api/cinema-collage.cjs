const { validatePosterUrl } = require('./poster-proxy.js');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

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
  let columns;
  if (total <= 1) columns = 1;
  else if (total <= 4) columns = 2;
  else if (total <= 6) columns = 3;
  else if (total <= 8) columns = 4;
  else if (total === 9) columns = 3;
  else columns = 4;
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

function decodeImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) throw new Error('poster-buffer-invalid');
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (isJpeg) {
    const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
    if (!decoded?.width || !decoded?.height || !decoded?.data?.length) throw new Error('poster-jpeg-decode-failed');
    return decoded;
  }
  if (isPng) {
    const decoded = PNG.sync.read(buffer);
    if (!decoded?.width || !decoded?.height || !decoded?.data?.length) throw new Error('poster-png-decode-failed');
    return decoded;
  }
  throw new Error('poster-format-unsupported');
}

function createRgbaCanvas(width, height, value = 17) {
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return data;
}

function resizeContainRgba(image, width, height) {
  const target = createRgbaCanvas(width, height);
  const sourceWidth = Number(image?.width) || 0;
  const sourceHeight = Number(image?.height) || 0;
  const source = image?.data;
  if (!sourceWidth || !sourceHeight || !source?.length) return target;

  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const left = Math.floor((width - drawWidth) / 2);
  const top = Math.floor((height - drawHeight) / 2);

  for (let y = 0; y < drawHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / drawHeight));
    for (let x = 0; x < drawWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / drawWidth));
      const src = (sourceY * sourceWidth + sourceX) * 4;
      const dst = ((top + y) * width + left + x) * 4;
      const alpha = (source[src + 3] ?? 255) / 255;
      target[dst] = Math.round(source[src] * alpha + target[dst] * (1 - alpha));
      target[dst + 1] = Math.round(source[src + 1] * alpha + target[dst + 1] * (1 - alpha));
      target[dst + 2] = Math.round(source[src + 2] * alpha + target[dst + 2] * (1 - alpha));
      target[dst + 3] = 255;
    }
  }
  return target;
}

function compositeRgba(canvas, canvasWidth, tile, tileWidth, tileHeight, left, top) {
  for (let y = 0; y < tileHeight; y += 1) {
    const sourceStart = y * tileWidth * 4;
    const targetStart = ((top + y) * canvasWidth + left) * 4;
    tile.copy(canvas, targetStart, sourceStart, sourceStart + tileWidth * 4);
  }
}

function fallbackPoster(width, height) {
  return createRgbaCanvas(width, height, 29);
}

async function buildCinemaCollage(rows, options = {}) {
  const items = (rows || []).filter((row) => row?.title).slice(0, 12);
  if (!items.length) throw new Error('cinema-collage-empty');

  const tileWidth = Math.max(120, Number(options.tileWidth || 500));
  const tileHeight = Math.max(180, Number(options.tileHeight || 750));
  const gap = Math.max(0, Number(options.gap ?? 8));
  const { columns, rows: rowCount } = collageGrid(items.length);
  const canvasWidth = columns * tileWidth + Math.max(0, columns - 1) * gap;
  const canvasHeight = rowCount * tileHeight + Math.max(0, rowCount - 1) * gap;

  const tiles = await Promise.all(items.map(async (row) => {
    try {
      if (!row.posterUrl) throw new Error('poster-unavailable');
      const poster = await fetchPosterBuffer(row.posterUrl, options);
      return resizeContainRgba(decodeImageBuffer(poster), tileWidth, tileHeight);
    } catch (error) {
      console.warn('RUDI_CINEMA_COLLAGE_POSTER_ERROR', row?.title, String(error?.message || error));
      return fallbackPoster(tileWidth, tileHeight);
    }
  }));

  const canvas = createRgbaCanvas(canvasWidth, canvasHeight);
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const startIndex = rowIndex * columns;
    const countInRow = Math.min(columns, tiles.length - startIndex);
    const rowWidth = countInRow * tileWidth + Math.max(0, countInRow - 1) * gap;
    const rowLeft = Math.round((canvasWidth - rowWidth) / 2);
    for (let columnIndex = 0; columnIndex < countInRow; columnIndex += 1) {
      const index = startIndex + columnIndex;
      compositeRgba(
        canvas,
        canvasWidth,
        tiles[index],
        tileWidth,
        tileHeight,
        rowLeft + columnIndex * (tileWidth + gap),
        rowIndex * (tileHeight + gap),
      );
    }
  }

  const encoded = jpeg.encode({ data: canvas, width: canvasWidth, height: canvasHeight }, 88);
  return Buffer.from(encoded.data);
}

module.exports = {
  kinopoiskSearchUrl,
  buildCinemaDigestCaption,
  collageGrid,
  buildCinemaCollage,
  fetchPosterBuffer,
  decodeImageBuffer,
  resizeContainRgba,
};
