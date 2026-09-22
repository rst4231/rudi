function stripStagePriceLines(text) {
  if (typeof text !== 'string' || !text.includes('Stage StandUp Club')) return text;
  return text
    .split('\n')
    .map((line) => {
      if (!line.trimStart().startsWith('💳')) return line;
      const age = line.match(/(?:^|\s)(\d+\+)\s*$/u)?.[1];
      return age ? `🔞 ${age}` : '';
    })
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
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

function normalizeStageLocationLine(line) {
  const value = String(line || '').trim();
  const match = value.match(/^(📍\s*Stage StandUp Club)\s*\|\s*[^,|]+(?:\s*\|\s*)?,?\s*(.+)$/iu);
  if (!match) return value;
  const address = String(match[2] || '').replace(/^[,|\s]+/u, '').trim();
  return address ? `${match[1]}, ${address}` : match[1];
}

function sanitizeStageDigestText(text) {
  const source = String(text || '');
  if (!isStageDigestText(source)) return source;

  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  const locationLine = lines.find((line) => /^📍\s*Stage StandUp Club/iu.test(line.trim()));
  const location = locationLine ? normalizeStageLocationLine(locationLine) : '';
  const output = [];
  let locationInserted = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^💳/u.test(trimmed)) continue;
    if (/^📍\s*Stage StandUp Club/iu.test(trimmed)) continue;
    if (!locationInserted && location && isNumberedEventLine(trimmed)) {
      output.push(location);
      locationInserted = true;
    }
    output.push(line);
  }

  if (location && !locationInserted) output.push(location);
  return output.join('\n');
}

function compactEventCaption(text) {
  const compactLines = sanitizeStageDigestText(text)
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

module.exports = {
  stripStagePriceLines,
  compactEventCaption,
  compactEventTelegramRequest,
  sanitizeStageDigestText,
  isConcertDigestText,
  isStageDigestText,
};
