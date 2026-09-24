const TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';
const CHAT_MODEL = 'openai/gpt-oss-20b';
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_HISTORY_MESSAGES = 8;

function cleanText(value, max = 1200) {
  return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function normalizeHistory(input) {
  return (Array.isArray(input) ? input : [])
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '',
      content: cleanText(item?.content, 1200),
    }))
    .filter((item) => item.role && item.content)
    .slice(-MAX_HISTORY_MESSAGES);
}

function normalizeMimeType(value) {
  const mime = String(value || '').toLowerCase().split(';')[0].trim();
  if (['audio/webm', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp3'].includes(mime)) return mime;
  throw new Error('voice-audio-type');
}

function fileExtension(mime) {
  if (mime === 'audio/mp4' || mime === 'audio/m4a') return 'm4a';
  if (mime === 'audio/ogg') return 'ogg';
  if (mime === 'audio/wav') return 'wav';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3';
  return 'webm';
}

function decodeAudio(value) {
  const raw = String(value || '').trim().replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
  if (!raw || raw.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 16) throw new Error('voice-audio-too-large');
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length) throw new Error('voice-audio-empty');
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error('voice-audio-too-large');
  return bytes;
}

async function fetchWithTimeout(url, init, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(4000, Number(timeoutMs) || 18000));
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('voice-ai-timeout');
    throw new Error('voice-ai-unavailable');
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeAudio(bytes, mimeType, options = {}) {
  const apiKey = cleanText(options.apiKey || options.env?.GROQ_API_KEY || process.env.GROQ_API_KEY, 500);
  if (!apiKey) throw new Error('groq-api-key-missing');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('voice-ai-unavailable');

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), 'rudi-voice.' + fileExtension(mimeType));
  form.append('model', TRANSCRIPTION_MODEL);
  form.append('language', 'ru');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey },
    body: form,
  }, options.transcriptionTimeoutMs || 18000, fetchImpl);

  if (response.status === 429) throw new Error('voice-ai-quota');
  if (!response.ok) throw new Error('voice-transcription-provider');
  const payload = await response.json().catch(() => null);
  const transcript = cleanText(payload?.text, 1800);
  if (!transcript) throw new Error('voice-no-speech');
  return transcript;
}

async function answerTranscript(transcript, history, options = {}) {
  const apiKey = cleanText(options.apiKey || options.env?.GROQ_API_KEY || process.env.GROQ_API_KEY, 500);
  if (!apiKey) throw new Error('groq-api-key-missing');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('voice-ai-unavailable');

  const actor = cleanText(options.actor, 40) || 'пользователь';
  const messages = [
    {
      role: 'system',
      content: [
        'Ты голосовой ассистент приложения RUDI.',
        'Разговаривай с пользователем по-русски естественно, спокойно и по делу.',
        'Пользователя зовут ' + actor + '.',
        'Ответ предназначен одновременно для текста на экране и озвучивания, поэтому не используй Markdown, таблицы, ссылки и длинные списки.',
        'Обычно отвечай 1–4 короткими предложениями. Если вопрос требует деталей, можно немного подробнее.',
        'Не утверждай, что изменил данные RUDI или выполнил действие в приложении, если такой функции тебе явно не дали.',
      ].join('\n'),
    },
    ...normalizeHistory(history),
    { role: 'user', content: transcript },
  ];

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      reasoning_effort: 'low',
      include_reasoning: false,
      temperature: 0.55,
      max_completion_tokens: 450,
      stream: false,
    }),
  }, options.chatTimeoutMs || 18000, fetchImpl);

  if (response.status === 429) throw new Error('voice-ai-quota');
  if (!response.ok) throw new Error('voice-chat-provider');
  const payload = await response.json().catch(() => null);
  const answer = cleanText(payload?.choices?.[0]?.message?.content, 2200);
  if (!answer) throw new Error('voice-ai-empty');
  return answer;
}

async function runVoiceAssistant(input = {}, options = {}) {
  const mimeType = normalizeMimeType(input.mimeType);
  const bytes = decodeAudio(input.audioBase64);
  const transcript = await transcribeAudio(bytes, mimeType, options);
  const answer = await answerTranscript(transcript, input.history, options);
  return {
    transcript,
    answer,
    transcriptionModel: TRANSCRIPTION_MODEL,
    chatModel: CHAT_MODEL,
  };
}

module.exports = {
  TRANSCRIPTION_MODEL,
  CHAT_MODEL,
  MAX_AUDIO_BYTES,
  normalizeHistory,
  normalizeMimeType,
  decodeAudio,
  transcribeAudio,
  answerTranscript,
  runVoiceAssistant,
};