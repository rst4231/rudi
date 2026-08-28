const base = require('./event-collage-base.cjs');
const { wrapStageEventFetch } = require('./stage-poster.cjs');

function withStageEventFetch(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return { ...options, fetchImpl: wrapStageEventFetch(fetchImpl) };
}

async function fetchEventPoster(pageUrl, options = {}) {
  return base.fetchEventPoster(pageUrl, withStageEventFetch(options));
}

async function maybeSendEventCollage(input, init = {}, options = {}) {
  return base.maybeSendEventCollage(input, init, withStageEventFetch(options));
}

module.exports = {
  ...base,
  fetchEventPoster,
  maybeSendEventCollage,
};
