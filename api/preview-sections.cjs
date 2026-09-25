function parts(...values) {
  return values.flat().filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim());
}

function normalizePreviewSections(payload = {}) {
  const results = payload.results || {};
  return {
    events: { section: 'events', parts: parts(results.events?.preview?.concerts, results.events?.preview?.stage), metadata: { available: Boolean(results.events) } },
    holidays: { section: 'holidays', parts: parts(results.holidays?.preview?.message), metadata: { available: Boolean(results.holidays) } },
    clients: { section: 'clients', parts: parts(results.clients?.preview?.message), metadata: { available: Boolean(results.clients) } },
    cinema: { section: 'cinema', parts: parts(results.cinema?.preview?.message || results.cinema?.preview), metadata: { available: Boolean(results.cinema) } },
    labor: { section: 'labor', parts: parts(results.labor?.preview?.message || results.labor?.preview), metadata: { available: Boolean(results.labor) } },
  };
}

function stripRetiredSections(payload) {
  if (!payload || typeof payload !== 'object' || !payload.results || !Object.prototype.hasOwnProperty.call(payload.results, 'facts')) return payload;
  const results = { ...payload.results };
  delete results.facts;
  return { ...payload, results };
}

function applyPreviewContentOverride(sectionView, override) {
  const view = sectionView && typeof sectionView === 'object'
    ? structuredClone(sectionView)
    : { section: '', parts: [], metadata: { available: false } };
  if (!override || !Array.isArray(override.parts) || !override.parts.length) {
    return { ...view, overridden: false };
  }
  return {
    ...view,
    parts: override.parts.map((part) => String(part).trim()).filter(Boolean),
    overridden: true,
    overrideUpdatedAt: override.updatedAt || null,
    includeFooter: override.includeFooter !== false,
  };
}

module.exports = { normalizePreviewSections, stripRetiredSections, applyPreviewContentOverride };
