'use strict';
// Direct Vercel function: avoid cold-loading the full finance route for minute ticks.
module.exports=require('./crypto-live-cron.cjs');
