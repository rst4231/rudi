function stripStagePriceLines(text) {
  if (typeof text !== 'string' || !text.includes('Stage StandUp Club')) return text;
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('💳'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

module.exports = { stripStagePriceLines };
