const { collageGrid } = require('./cinema-collage.cjs');

const MAX_POSTERS = 12;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CAPTION_VISIBLE = 1000;

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)));
}

function safeHttpUrl(value, baseUrl) {
  try {
    const url = baseUrl ? new URL(decodeHtml(value), baseUrl) : new URL(decodeHtml(value));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function htmlAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'iu'));
  return match ? decodeHtml(match[1]).trim() : '';
}

function extractPosterUrl(html, pageUrl) {
  const source = String(html || '');
  for (const tagMatch of source.matchAll(/<meta\b[^>]*>/giu)) {
    const tag = tagMatch[0];
    const key = (htmlAttribute(tag, 'property') || htmlAttribute(tag, 'name')).toLowerCase();
    if (!['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(key)) continue;
    const resolved = safeHttpUrl(htmlAttribute(tag, 'content'), pageUrl);
    if (resolved) return resolved;
  }
  for (const tagMatch of source.matchAll(/<img\b[^>]*>/giu)) {
    const resolved = safeHttpUrl(
      htmlAttribute(tagMatch[0], 'src') || htmlAttribute(tagMatch[0], 'data-src'),
      pageUrl,
    );
    if (resolved) return resolved;
  }
  return null;
}

function extractEventLinks(text) {
  const links = [];
  const seen = new Set();
  for (const match of String(text || '').matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)) {
    const url = safeHttpUrl(match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push(url);
  }
  return links;
}

function isConcertDigestText(text) {
  return String(text || '').includes('Поп и хип-хоп концерты');
}

function isStageDigestText(text) {
  const value = String(text || '');
  return value.includes('Stage StandUp Club') && (value.includes('Найдено событий/сеансов') || value.includes('📅'));
}

function isEventDigestText(text) {
  return isConcertDigestText(text) || isStageDigestText(text);
}

function compactEventCaption(text) {
  return String(text || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .trim();
}

function compactEventTelegramRequest(init = {}) {
  if (typeof init.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      if (!isEventDigestText(payload?.text)) return init;
      const text = compactEventCaption(payload.text);
      if (text === payload.text) return init;
      return { ...init, body: JSON.stringify({ ...payload, text }) };
    } catch {
      return init;
    }
  }
  if (init.body instanceof URLSearchParams) {
    const text = init.body.get('text');
    if (!isEventDigestText(text)) return init;
    const compact = compactEventCaption(text);
    if (compact === text) return init;
    const body = new URLSearchParams(init.body);
    body.set('text', compact);
    return { ...init, body };
  }
  return init;
}

function visibleCaptionLength(text) {
  return decodeHtml(String(text || '').replace(/<[^>]*>/gu, '')).length;
}

function fitEventCaption(text, maxVisible = MAX_CAPTION_VISIBLE) {
  const compact = compactEventCaption(text);
  if (visibleCaptionLength(compact) <= maxVisible) return compact;
  const selected = [];
  let used = 0;
  for (const line of compact.split('\n')) {
    const lineVisible = visibleCaptionLength(line);
    const extra = lineVisible + (selected.length ? 1 : 0);
    if (selected.length && used + extra + 2 > maxVisible) break;
    if (!selected.length && extra + 2 > maxVisible) return line.slice(0, Math.max(1, maxVisible - 2));
    selected.push(line);
    used += extra;
  }
  const base = selected.join('\n').trimEnd();
  return visibleCaptionLength(`${base}\n…`) <= maxVisible ? `${base}\n…` : base;
}

async function readBodyBuffer(response, maxBytes, label) {
  if (!response?.ok) throw new Error(`${label}-http-${response?.status || 0}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > maxBytes) throw new Error(`${label}-size-invalid`);
  return buffer;
}

async function fetchEventPoster(pageUrl, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const pageResponse = await fetchImpl(pageUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; RUDI-Event-Collage/1.0)',
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(Number(options.timeoutMs || 10000)) : undefined,
  });
  const pageBuffer = await readBodyBuffer(pageResponse, MAX_PAGE_BYTES, 'event-page');
  const posterUrl = extractPosterUrl(pageBuffer.toString('utf8'), pageUrl);
  if (!posterUrl) throw new Error('event-poster-missing');

  const imageResponse = await fetchImpl(posterUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; RUDI-Event-Collage/1.0)',
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      referer: pageUrl,
    },
    cache: 'no-store',
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(Number(options.timeoutMs || 10000)) : undefined,
  });
  const contentType = String(imageResponse?.headers?.get?.('content-type') || '').toLowerCase();
  if (contentType && !contentType.startsWith('image/')) throw new Error('event-poster-not-image');
  return readBodyBuffer(imageResponse, MAX_IMAGE_BYTES, 'event-poster');
}

async function buildEventCollage(images, options = {}) {
  const sharp = require('sharp');
  const items = (images || []).filter((item) => Buffer.isBuffer(item) && item.length).slice(0, MAX_POSTERS);
  if (!items.length) throw new Error('event-collage-empty');

  const tileWidth = Math.max(120, Number(options.tileWidth || 480));
  const tileHeight = Math.max(180, Number(options.tileHeight || 680));
  const gap = Math.max(0, Number(options.gap ?? 8));
  const { columns, rows } = collageGrid(items.length);
  const width = columns * tileWidth + Math.max(0, columns - 1) * gap;
  const height = rows * tileHeight + Math.max(0, rows - 1) * gap;

  const tiles = await Promise.all(items.map((image) => sharp(image)
    .rotate()
    .resize(tileWidth, tileHeight, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 86, chromaSubsampling: '4:4:4' })
    .toBuffer()));

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#111111',
    },
  })
    .composite(tiles.map((input, index) => ({
      input,
      left: (index % columns) * (tileWidth + gap),
      top: Math.floor(index / columns) * (tileHeight + gap),
    })))
    .jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
}

function telegramPayload(init = {}) {
  if (typeof init.body === 'string') {
    try { return JSON.parse(init.body); } catch { return null; }
  }
  if (init.body instanceof URLSearchParams) return Object.fromEntries(init.body.entries());
  return null;
}

async function maybeSendEventCollage(input, init = {}, options = {}) {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
  if (!/api\.telegram\.org\/bot[^/]+\/sendMessage(?:\?|$)/u.test(url)) return null;

  const payload = telegramPayload(init);
  if (!payload || !isEventDigestText(payload.text)) return null;
  if (isConcertDigestText(payload.text)) return null;
  const eventLinks = extractEventLinks(payload.text).slice(0, MAX_POSTERS);
  if (!eventLinks.length) return null;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const posterResults = await Promise.allSettled(eventLinks.map((eventUrl) => fetchEventPoster(eventUrl, {
    fetchImpl,
    timeoutMs: options.timeoutMs,
  })));
  const posters = posterResults
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value);
  for (const [index, result] of posterResults.entries()) {
    if (result.status === 'rejected') {
      console.warn('RUDI_EVENT_COLLAGE_POSTER_ERROR', eventLinks[index], String(result.reason?.message || result.reason));
    }
  }
  if (!posters.length) return null;

  const caption = fitEventCaption(payload.text);
  const image = await buildEventCollage(posters, options);
  const body = new FormData();
  body.set('chat_id', String(payload.chat_id));
  if (payload.message_thread_id !== undefined && payload.message_thread_id !== null) {
    body.set('message_thread_id', String(payload.message_thread_id));
  }
  body.set('caption', caption);
  body.set('parse_mode', String(payload.parse_mode || 'HTML'));
  if (payload.disable_notification !== undefined) body.set('disable_notification', String(payload.disable_notification));
  if (payload.protect_content !== undefined) body.set('protect_content', String(payload.protect_content));
  body.set('photo', new Blob([image], { type: 'image/jpeg' }), 'events-collage.jpg');

  const telegramFetchImpl = options.telegramFetchImpl || fetchImpl;
  const sendPhotoUrl = url.replace(/\/sendMessage(?:\?.*)?$/u, '/sendPhoto');
  const response = await telegramFetchImpl(sendPhotoUrl, { method: 'POST', body });
  if (!response?.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`Telegram event collage failed: HTTP ${response?.status || 0}${detail ? ` ${detail}` : ''}`);
  }
  return response;
}

module.exports = {
  extractPosterUrl,
  extractEventLinks,
  compactEventCaption,
  compactEventTelegramRequest,
  fitEventCaption,
  fetchEventPoster,
  buildEventCollage,
  maybeSendEventCollage,
  isEventDigestText,
  isConcertDigestText,
  isStageDigestText,
};
