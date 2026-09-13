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

function isYandexAfishaEventUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'afisha.yandex.ru';
  } catch {
    return false;
  }
}

function plainHtmlText(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim();
}

function normalizedImageLabel(value) {
  return plainHtmlText(value).toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function yandexPageTitle(source) {
  const h1 = String(source || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu);
  if (h1) return plainHtmlText(h1[1]);
  for (const tagMatch of String(source || '').matchAll(/<meta\b[^>]*>/giu)) {
    const tag = tagMatch[0];
    const key = (htmlAttribute(tag, 'property') || htmlAttribute(tag, 'name')).toLowerCase();
    if (!['og:title', 'twitter:title'].includes(key)) continue;
    const title = plainHtmlText(htmlAttribute(tag, 'content'));
    if (title) return title;
  }
  const title = String(source || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  return title ? plainHtmlText(title[1]) : '';
}

function srcsetUrls(value, baseUrl) {
  return String(value || '')
    .split(',')
    .map((entry) => safeHttpUrl(entry.trim().split(/\s+/u)[0], baseUrl))
    .filter(Boolean);
}

function jsonLdImageUrls(source, pageUrl) {
  const urls = [];
  const collect = (value) => {
    if (typeof value === 'string') {
      const resolved = safeHttpUrl(value, pageUrl);
      if (resolved) urls.push(resolved);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (typeof value.url === 'string') collect(value.url);
    if (typeof value.contentUrl === 'string') collect(value.contentUrl);
  };

  for (const match of String(source || '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)) {
    const tag = `<script ${match[1]}>`;
    if (htmlAttribute(tag, 'type').toLowerCase() !== 'application/ld+json') continue;
    try {
      const parsed = JSON.parse(decodeHtml(match[2]).trim());
      const visit = (value) => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (['image', 'thumbnailurl', 'contenturl'].includes(key.toLowerCase())) collect(child);
          if (child && typeof child === 'object') visit(child);
        }
      };
      visit(parsed);
    } catch {}
  }
  return urls;
}

function yandexImageScore(url, details = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { return -Infinity; }
  const text = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase();
  if (/(?:logo|favicon|sprite|icon|social[-_]?card|share[-_]?card)/u.test(text)) return -1000;

  let score = 0;
  if (parsed.hostname === 'avatars.mds.yandex.net') score += 80;
  if (/\/get-afishanew\//u.test(parsed.pathname)) score += 80;
  if (details.fromJsonLd) score += 70;
  if (details.fromImageTag) score += 30;
  if (details.fromSourceTag) score += 20;

  const alt = normalizedImageLabel(details.alt);
  const title = normalizedImageLabel(details.pageTitle);
  if (alt.length >= 3) score += 20;
  if (alt && title && (alt.includes(title) || title.includes(alt))) score += 60;
  if (/(?:yastatic\.net|favicon|logo|sprite)/u.test(text)) score -= 120;
  return score;
}

function extractYandexAfishaContentImage(source, pageUrl) {
  const pageTitle = yandexPageTitle(source);
  const candidates = [];
  const seen = new Set();
  const add = (url, details = {}) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, score: yandexImageScore(url, { ...details, pageTitle }) });
  };

  for (const url of jsonLdImageUrls(source, pageUrl)) add(url, { fromJsonLd: true });

  for (const tagMatch of String(source || '').matchAll(/<img\b[^>]*>/giu)) {
    const tag = tagMatch[0];
    const alt = htmlAttribute(tag, 'alt');
    const direct = htmlAttribute(tag, 'data-src') || htmlAttribute(tag, 'data-original') || htmlAttribute(tag, 'src');
    add(safeHttpUrl(direct, pageUrl), { fromImageTag: true, alt });
    for (const url of srcsetUrls(htmlAttribute(tag, 'srcset') || htmlAttribute(tag, 'data-srcset'), pageUrl)) {
      add(url, { fromImageTag: true, alt });
    }
  }

  for (const tagMatch of String(source || '').matchAll(/<source\b[^>]*>/giu)) {
    const tag = tagMatch[0];
    for (const url of srcsetUrls(htmlAttribute(tag, 'srcset') || htmlAttribute(tag, 'data-srcset'), pageUrl)) {
      add(url, { fromSourceTag: true });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score >= 80 ? candidates[0].url : null;
}

function extractPosterUrl(html, pageUrl) {
  const source = String(html || '');
  if (isYandexAfishaEventUrl(pageUrl)) {
    const contentImage = extractYandexAfishaContentImage(source, pageUrl);
    if (contentImage) return contentImage;
  }
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

function isNumberedEventLine(line) {
  return /^(?:<[^>]+>\s*)*\d+\.\s/u.test(String(line || '').trimStart());
}

function compactEventCaption(text) {
  const compactLines = String(text || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  const output = [];
  for (const line of compactLines) {
    if (isNumberedEventLine(line) && output.length && output[output.length - 1] !== '') output.push('');
    output.push(line);
  }
  return output.join('\n').trim();
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
  const fit = options.fit === 'cover' ? 'cover' : 'contain';
  const position = String(options.position || 'centre');
  const background = String(options.background || '#111111');
  const { columns, rows } = collageGrid(items.length);
  const width = columns * tileWidth + Math.max(0, columns - 1) * gap;
  const height = rows * tileHeight + Math.max(0, rows - 1) * gap;

  const tiles = await Promise.all(items.map((image) => sharp(image)
    .rotate()
    .resize(tileWidth, tileHeight, { fit, position, background })
    .jpeg({ quality: 86, chromaSubsampling: '4:4:4' })
    .toBuffer()));

  const composite = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const startIndex = rowIndex * columns;
    const countInRow = Math.min(columns, tiles.length - startIndex);
    const rowWidth = countInRow * tileWidth + Math.max(0, countInRow - 1) * gap;
    const rowLeft = Math.round((width - rowWidth) / 2);
    for (let columnIndex = 0; columnIndex < countInRow; columnIndex += 1) {
      const index = startIndex + columnIndex;
      composite.push({
        input: tiles[index],
        left: rowLeft + columnIndex * (tileWidth + gap),
        top: rowIndex * (tileHeight + gap),
      });
    }
  }

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background,
    },
  })
    .composite(composite)
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

function concertCollageOptions(options = {}) {
  return {
    ...options,
    tileWidth: options.tileWidth || 480,
    tileHeight: options.tileHeight || 360,
    gap: options.gap ?? 4,
    fit: options.fit || 'cover',
    position: options.position || 'attention',
  };
}

async function maybeSendEventCollage(input, init = {}, options = {}) {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
  if (!/api\.telegram\.org\/bot[^/]+\/sendMessage(?:\?|$)/u.test(url)) return null;

  const payload = telegramPayload(init);
  if (!payload || !isEventDigestText(payload.text)) return null;
  const isConcert = isConcertDigestText(payload.text);
  let eventLinks = extractEventLinks(payload.text);
  if (isConcert) eventLinks = eventLinks.filter(isYandexAfishaEventUrl);
  eventLinks = eventLinks.slice(0, MAX_POSTERS);
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
  const image = await buildEventCollage(posters, isConcert ? concertCollageOptions(options) : options);
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
  isYandexAfishaEventUrl,
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
