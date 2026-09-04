const { syncConfiguredForumTopicNames } = require('./forum-topic-names.cjs');

async function syncForumTopicTitles(options = {}) {
  return syncConfiguredForumTopicNames(options);
}

module.exports = { syncForumTopicTitles };
