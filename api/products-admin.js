const { createHash, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');

const { runRuntime } = require('./index.js');
const { runWithProductsContext } = require('./products-bought.cjs');
const { getKnownForumChatId } = require('./topic-maintenance.cjs');
const { resolveForumChatId } = require('./forum-chat-id.cjs');
const state = require('./products-state.cjs');

const DEFAULT_ADMIN_KEY_SHA256 = '8128e2e5225927782459503441e568fab32b26c42a644446ecabbbea35404793';

function hashKey(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function isAuthorized(req, expectedHash = process.env.PRODUCTS_ADMIN_KEY_SHA256 || DEFAULT_ADMIN_KEY_SHA256) {
  const supplied = Buffer.from(hashKey(req?.query?.key), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  return expected.length === supplied.length && expected.length > 0 && timingSafeEqual(supplied, expected);
}

function readGeneratedRuntimeSource() {
  try { return fs.readFileSync(require.resolve('../runtime/generated-runtime.cjs'), 'utf8'); }
  catch { return ''; }
}

async function resolveProductsChatId() {
  const cached = await getKnownForumChatId();
  return resolveForumChatId({
    cached,
    env: process.env,
    runtimeSource: cached === null ? readGeneratedRuntimeSource() : '',
  });
}

function createSinkResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    headersSent: false,
    payload: undefined,
    status(code) { this.statusCode = Number(code) || 200; return this; },
    json(payload) { this.payload = payload; this.headersSent = true; return payload; },
    send(payload) { this.payload = payload; this.headersSent = true; return payload; },
    end(payload) { this.payload = payload; this.headersSent = true; return payload; },
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
  };
}

async function refreshVisibleProducts(history) {
  const products = Array.isArray(history) ? history.filter(Boolean) : [];
  if (!products.length) return { refreshed: false, reason: 'empty-history' };

  const chatId = await resolveProductsChatId();
  if (chatId === null || chatId === undefined) throw new Error('Telegram forum chat id could not be resolved');

  const now = Date.now();
  const req = {
    query: { route: 'telegram' },
    body: {
      update_id: now,
      message: {
        message_id: now % 2000000000,
        date: Math.floor(now / 1000),
        message_thread_id: state.PRODUCTS_TOPIC_ID,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: state.SHARED_PRODUCTS_ACTOR_ID, is_bot: false, first_name: 'RUDI' },
        text: products[0],
      },
    },
  };
  const sink = createSinkResponse();

  await state.runProductsAddition(
    req,
    () => runWithProductsContext(() => runRuntime(req, sink)),
  );

  if (sink.statusCode >= 400) {
    throw new Error(`Products refresh runtime failed with status ${sink.statusCode}`);
  }
  return { refreshed: true, statusCode: sink.statusCode };
}

async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(404).json({ ok: false, error: 'not-found' });

  const action = String(req?.query?.action || 'state').trim().toLowerCase();
  let history = await state.readProductsHistory();

  if (action === 'state') {
    return res.status(200).json({ ok: true, history });
  }

  if (action === 'restore') {
    const remove = String(req?.query?.remove || '').trim();
    if (remove) {
      history = state.removeProductsFromHistory(history, remove);
      history = await state.writeProductsHistory(history);
      state.markProductsRuntimeStale();
    }
    const refresh = await refreshVisibleProducts(history);
    return res.status(200).json({ ok: true, history, refresh });
  }

  return res.status(400).json({ ok: false, error: 'unsupported-action' });
}

module.exports = handler;
module.exports.hashKey = hashKey;
module.exports.isAuthorized = isAuthorized;
module.exports.createSinkResponse = createSinkResponse;
module.exports.refreshVisibleProducts = refreshVisibleProducts;
