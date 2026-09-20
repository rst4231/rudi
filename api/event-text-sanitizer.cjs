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

module.exports = { stripStagePriceLines };
