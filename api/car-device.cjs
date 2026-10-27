'use strict';
// Retired: old APKs must never enter another route or accept location writes.
function handleCarDeviceRequest(req,res){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.status(410).json({ok:false,error:'car-device-removed'});}
module.exports={handleCarDeviceRequest};
