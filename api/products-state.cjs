const base = require('./products-state-base.cjs');

function normalizeKey(value) {
  return base.restoreCompoundProducts(String(value || ''))
    .trim()
    .toLocaleLowerCase('ru-RU');
}

function getRawInput(req) {
  const message = req?.body?.message;
  if (message && Number(message.message_thread_id) === base.PRODUCTS_TOPIC_ID && typeof message.text === 'string') {
    return message.text.trim();
  }
  const request = req?.body?.request || {};
  const command = typeof request.command === 'string' ? request.command.trim() : '';
  const utterance = typeof request.original_utterance === 'string' ? request.original_utterance.trim() : '';
  return command || utterance;
}

function getCurrentProduct(req, raw) {
  if (base.isTelegramProductAddition(req)) return base.cleanProductUtterance(raw);
  const request = req?.body?.request || {};
  if (request.type === 'SimpleUtterance') return base.cleanProductUtterance(raw);
  return '';
}

async function converge(mutator, satisfied, cache, maxAttempts = 4) {
  let last = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const latest = await base.readProductsHistory(cache);
    if (satisfied(latest)) return { history: latest, changed: false };
    const desired = mutator(latest);
    await base.writeProductsHistory(desired, cache);
    last = await base.readProductsHistory(cache);
    if (satisfied(last)) return { history: last, changed: true };
  }
  throw new Error(`Products history did not converge after ${maxAttempts} attempts`);
}

async function runProductsAddition(req, task, options = {}) {
  const raw = getRawInput(req);
  const removalTarget = base.getProductRemovalTarget(raw);
  const current = getCurrentProduct(req, raw);

  // The generated runtime is not a durable source of truth. Always force it
  // to rebuild from the shared persisted history before a product mutation.
  base.markProductsRuntimeStale();
  const result = await base.runProductsAddition(req, task, options);
  const cache = options.cache;

  if (removalTarget) {
    const convergence = await converge(
      (latest) => base.removeProductsFromHistory(latest, removalTarget),
      (latest) => base.removeProductsFromHistory(latest, removalTarget).length === latest.length,
      cache,
    );
    if (convergence.changed) base.markProductsRuntimeStale();
    return result;
  }

  if (current) {
    const currentKey = normalizeKey(current);
    const convergence = await converge(
      (latest) => [...latest, current],
      (latest) => latest.some((product) => normalizeKey(product) === currentKey),
      cache,
    );
    if (convergence.changed) base.markProductsRuntimeStale();
  }
  return result;
}

async function runAuthorizedProductsClear(task, options = {}) {
  const result = await base.runAuthorizedProductsClear(task, options);
  const convergence = await converge(() => [], (latest) => latest.length === 0, options.cache);
  if (convergence.changed) base.markProductsRuntimeStale();
  return result;
}

module.exports = {
  ...base,
  runProductsAddition,
  runAuthorizedProductsClear,
};