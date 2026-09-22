const crypto = require('node:crypto');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { assertAllowedTelegramUser } = require('./rudi-access.cjs');
const { readCarState, writeMileage } = require('./car-store.cjs');

function authenticate(rawInitData, botToken) {
  const raw = String(rawInitData || '').trim();
  const token = String(botToken || '').trim();
  if (!raw || !token) throw new Error('telegram-auth-required');

  const params = new URLSearchParams(raw);
  const receivedHash = String(params.get('hash') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(receivedHash)) throw new Error('telegram-auth-invalid');

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const actual = Buffer.from(receivedHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('telegram-auth-invalid');
  }

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > 86400 || authDate > now + 300) {
    throw new Error('telegram-auth-expired');
  }

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); }
  catch { throw new Error('telegram-user-invalid'); }
  if (!user?.id) throw new Error('telegram-user-invalid');

  return { actor: assertAllowedTelegramUser(user), user };
}

function statusFor(error) {
  const code = String(error?.message || error || '');
  if (code.startsWith('telegram-auth') || code === 'telegram-user-invalid') return 401;
  if (code === 'rudi-access-denied') return 403;
  if (code === 'car-mileage-invalid') return 400;
  return 500;
}

function serviceScheduleForMileage(mileage) {
  if (!Number.isFinite(Number(mileage))) return null;
  const current = Math.max(0, Math.floor(Number(mileage)));
  if (current <= 5000) return { number:0, mileage:5000 };
  const step = Math.ceil((current - 5000) / 10000);
  return {
    number: Math.max(1, step),
    mileage: 5000 + step * 10000,
  };
}

async function handleCarRequest(req, res) {
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method-not-allowed' });

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  let session;
  try {
    session = authenticate(body.initData, resolveTelegramBotToken(process.env));
  } catch (error) {
    return res.status(statusFor(error)).json({ ok:false, error:String(error?.message || error) });
  }

  if (session.actor !== 'Рустам') {
    return res.status(200).json({ ok:true, actor:session.actor, visible:false });
  }

  const operation = String(body.operation || 'get');
  try {
    if (operation === 'get') {
      const state = await readCarState();
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        car:{ make:'Changan', model:'UNI-V', year:2023 },
        state,
        nextService: serviceScheduleForMileage(state.mileage),
      });
    }

    if (operation === 'set-mileage') {
      const state = await writeMileage(body.mileage);
      return res.status(200).json({
        ok:true,
        actor:session.actor,
        visible:true,
        state,
        nextService: serviceScheduleForMileage(state.mileage),
      });
    }

    return res.status(400).json({ ok:false, error:'bad-operation' });
  } catch (error) {
    console.error('RUDI_CAR_ERROR', session.actor, operation, String(error?.message || error));
    return res.status(statusFor(error)).json({ ok:false, error:String(error?.message || error) });
  }
}

module.exports = { handleCarRequest, serviceScheduleForMileage };
