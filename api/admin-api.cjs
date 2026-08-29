const {
  SECTION_NAMES,
  loadRudiSettings,
  setRudiSettingsOverride,
  resetRudiSettingsOverride,
} = require('./rudi-settings.cjs');
const { buildHealthPayload } = require('./control-plane-health.cjs');
const { resolvePreviewDate, validateDateKey } = require('./preview-date.cjs');
const {
  getSectionSkip,
  setSectionSkip,
  setContentOverride,
  clearContentOverride,
} = require('./section-controls.cjs');
const { listSectionAnalytics } = require('./feedback-analytics.cjs');
const { acknowledgeAlert } = require('./alert-service.cjs');
const { publishSelectedSection, defaultPreviewProvider } = require('./manual-section-publisher.cjs');

const SECTION_SET = new Set(SECTION_NAMES);
const ACTIONS = new Set([
  'set-section-enabled',
  'reset-setting-override',
  'skip-section',
  'clear-section-skip',
  'set-content-override',
  'clear-content-override',
  'publish-section',
  'retry-failed-section',
  'acknowledge-alert',
  'refresh-preview',
]);

function failure(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function validSection(value) {
  const section = String(value || '').trim();
  if (!SECTION_SET.has(section)) throw new Error('unknown-section');
  return section;
}

function validDate(value) {
  try { return validateDateKey(value); }
  catch { throw new Error('invalid-date'); }
}

function validBoolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`${name}-must-be-boolean`);
  return value;
}

function safeResetPath(value) {
  const path = String(value || '').trim();
  const match = path.match(/^sections\.([a-z]+)\.enabled$/);
  if (!match || !SECTION_SET.has(match[1])) throw new Error('invalid-reset-path');
  return path;
}

function validFingerprint(value) {
  const fingerprint = String(value || '').trim();
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error('invalid-alert-fingerprint');
  return fingerprint;
}

async function buildSkips(dates, options = {}) {
  const getSkip = options.getSkip || getSectionSkip;
  const result = {};
  await Promise.all(Object.entries(dates).map(async ([label, date]) => {
    const rows = await Promise.all(SECTION_NAMES.map(async (section) => [
      section,
      await getSkip(date, section, { cache: options.controlCache }),
    ]));
    result[label] = Object.fromEntries(rows);
  }));
  return result;
}

async function buildAdminDashboard(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const today = resolvePreviewDate('today', now);
  const tomorrow = resolvePreviewDate('tomorrow', now);
  const settingsLoader = options.settingsLoader || loadRudiSettings;
  const loaded = await settingsLoader(options.settingsOptions || {});
  const settings = loaded.settings;
  const healthBuilder = options.healthBuilder || buildHealthPayload;
  const previewProvider = options.previewProvider || ((date) => defaultPreviewProvider(date, options));
  const analyticsProvider = options.analyticsProvider || listSectionAnalytics;

  const [health, todayPreview, tomorrowPreview, skips, analytics] = await Promise.all([
    healthBuilder({
      ...options.healthOptions,
      now,
      settingsLoader: async () => loaded,
    }),
    previewProvider(today),
    previewProvider(tomorrow),
    buildSkips({ today, tomorrow }, options),
    analyticsProvider(SECTION_NAMES, { cache: options.analyticsCache }),
  ]);

  return {
    ok: true,
    generatedAt: now.toISOString(),
    dates: { today, tomorrow },
    health,
    previews: { today: todayPreview, tomorrow: tomorrowPreview },
    settings,
    overrides: loaded.overrides || {},
    skips,
    journal: health?.latestPublications || {},
    sourceHealth: health?.sourceHealth || [],
    alerts: health?.alerts || null,
    analytics: analytics || {},
  };
}

async function handleAdminAction(actionInput, body = {}, options = {}) {
  const action = String(actionInput || '').trim();
  if (!ACTIONS.has(action)) return failure('unknown-admin-action');

  try {
    if (action === 'set-section-enabled') {
      const section = validSection(body.section);
      const enabled = validBoolean(body.enabled, 'enabled');
      const setSettingsOverride = options.setSettingsOverride || setRudiSettingsOverride;
      const overrides = await setSettingsOverride({ sections: { [section]: { enabled } } }, { cache: options.controlCache });
      return { ok: true, action, section, enabled, overrides };
    }

    if (action === 'reset-setting-override') {
      const path = safeResetPath(body.path);
      const resetSettingsOverride = options.resetSettingsOverride || resetRudiSettingsOverride;
      const overrides = await resetSettingsOverride(path, { cache: options.controlCache });
      return { ok: true, action, path, overrides };
    }

    if (action === 'skip-section' || action === 'clear-section-skip') {
      const section = validSection(body.section);
      const date = validDate(body.date);
      const setSkip = options.setSkip || setSectionSkip;
      const skipped = action === 'skip-section';
      await setSkip(date, section, skipped, { cache: options.controlCache });
      return { ok: true, action, section, date, skipped };
    }

    if (action === 'set-content-override') {
      const section = validSection(body.section);
      const date = validDate(body.date);
      const setOverride = options.setOverride || setContentOverride;
      const override = await setOverride(date, section, body.parts, {
        cache: options.controlCache,
        includeFooter: body.includeFooter !== false,
      });
      return { ok: true, action, section, date, override };
    }

    if (action === 'clear-content-override') {
      const section = validSection(body.section);
      const date = validDate(body.date);
      const clearOverride = options.clearOverride || clearContentOverride;
      await clearOverride(date, section, { cache: options.controlCache });
      return { ok: true, action, section, date, override: null };
    }

    if (action === 'publish-section') {
      const section = validSection(body.section);
      const date = validDate(body.date);
      const force = body.force === undefined ? false : validBoolean(body.force, 'force');
      const publishSection = options.publishSection || publishSelectedSection;
      return await publishSection({ section, date, force }, options);
    }

    if (action === 'retry-failed-section') {
      const section = validSection(body.section);
      const date = validDate(body.date);
      const publishSection = options.publishSection || publishSelectedSection;
      return await publishSection({ section, date, retryFailedOnly: true }, options);
    }

    if (action === 'acknowledge-alert') {
      const fingerprint = validFingerprint(body.fingerprint);
      const ackAlert = options.ackAlert || acknowledgeAlert;
      const alert = await ackAlert(fingerprint, { cache: options.alertCache });
      return alert ? { ok: true, action, alert } : failure('alert-not-found', { fingerprint });
    }

    if (action === 'refresh-preview') {
      const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
      const date = body.date ? validDate(body.date) : resolvePreviewDate('today', now);
      const previewProvider = options.previewProvider || ((requestedDate) => defaultPreviewProvider(requestedDate, options));
      const preview = await previewProvider(date);
      return { ok: true, action, date, preview };
    }
  } catch (error) {
    return failure(String(error?.message || error || 'admin-action-failed'));
  }

  return failure('unknown-admin-action');
}

module.exports = {
  ACTIONS,
  buildAdminDashboard,
  handleAdminAction,
  validSection,
  validDate,
  safeResetPath,
};