let runtimeHandler;

function getRuntimeHandler() {
  if (!runtimeHandler) {
    runtimeHandler = require('../runtime/generated-runtime.cjs');
    if (typeof runtimeHandler !== 'function') {
      throw new Error('RUDI runtime did not export a handler function');
    }
  }
  return runtimeHandler;
}

module.exports = async function handler(req, res) {
  try {
    return await getRuntimeHandler()(req, res);
  } catch (error) {
    console.error('RUDI_RUNTIME_ERROR', error);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
  }
};
