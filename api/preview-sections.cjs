function parts(...values) {
  return values.flat().filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim());
}

function normalizePreviewSections(payload = {}) {
  const results = payload.results || {};
  return {
    events: { section: 'events', parts: parts(results.events?.preview?.concerts, results.events?.preview?.stage), metadata: { available: Boolean(results.events) } },
    holidays: { section: 'holidays', parts: parts(results.holidays?.preview?.message), metadata: { available: Boolean(results.holidays) } },
    facts: { section: 'facts', parts: parts(results.facts?.preview?.message), metadata: { available: Boolean(results.facts) } },
    lulu: { section: 'lulu', parts: parts(results.morning?.preview?.lulu), metadata: { available: Boolean(results.morning?.preview?.lulu) } },
    recipes: { section: 'recipes', parts: parts(results.morning?.preview?.recipes || []), metadata: { available: Array.isArray(results.morning?.preview?.recipes) } },
    clients: { section: 'clients', parts: parts(results.clients?.preview?.message), metadata: { available: Boolean(results.clients) } },
    cinema: { section: 'cinema', parts: parts(results.cinema?.preview?.message || results.cinema?.preview), metadata: { available: Boolean(results.cinema) } },
    labor: { section: 'labor', parts: parts(results.labor?.preview?.message || results.labor?.preview), metadata: { available: Boolean(results.labor) } },
    weekend: { section: 'weekend', parts: parts(results.weekend?.preview?.message || results.weekend?.preview), metadata: { available: Boolean(results.weekend) } },
  };
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

module.exports = { normalizePreviewSections, applyPreviewContentOverride };