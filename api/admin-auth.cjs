const { timingSafeEqual } = require('node:crypto');
function resolveAdminSecret(env=process.env){return String(env.RUDI_ADMIN_SECRET||env.CRON_SECRET||'');}
function extractBearerToken(req){const raw=String(req?.headers?.authorization||req?.headers?.Authorization||'');return raw.match(/^Bearer\s+(.+)$/i)?.[1]||'';}
function safeEqual(a,b){const left=Buffer.from(String(a||''));const right=Buffer.from(String(b||''));return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);}
function isAdminAuthorized(req,env=process.env){return safeEqual(extractBearerToken(req),resolveAdminSecret(env));}
function requireAdmin(req,res,env=process.env){const secret=resolveAdminSecret(env);if(!secret){res.status(503).json({ok:false,error:'admin-secret-not-configured'});return false;}if(!isAdminAuthorized(req,env)){res.status(401).json({ok:false,error:'unauthorized-admin'});return false;}return true;}
module.exports={resolveAdminSecret,extractBearerToken,safeEqual,isAdminAuthorized,requireAdmin};
