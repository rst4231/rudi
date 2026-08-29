const test=require('node:test'); const assert=require('node:assert/strict');
const {resolveAdminSecret,isAdminAuthorized}=require('../api/admin-auth.cjs');
test('admin secret wins over cron fallback',()=>{assert.equal(resolveAdminSecret({RUDI_ADMIN_SECRET:'admin',CRON_SECRET:'cron'}),'admin');assert.equal(isAdminAuthorized({headers:{authorization:'Bearer cron'}},{RUDI_ADMIN_SECRET:'admin',CRON_SECRET:'cron'}),false);});
test('cron secret works when admin secret absent',()=>{assert.equal(isAdminAuthorized({headers:{authorization:'Bearer cron'}},{CRON_SECRET:'cron'}),true);});
