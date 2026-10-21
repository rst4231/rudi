'use strict';
// The public /api/crypto-live-cron path rewrites here, avoiding the finance bundle.
const protectedHandler=require('./crypto-live-cron.cjs');
module.exports=protectedHandler;
