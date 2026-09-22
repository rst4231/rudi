const { publicJwks } = require('./rudi-data-api-auth.cjs');

module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const payload = publicJwks();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=300');
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
