'use strict';
const {createCarDeviceService:factory}=require('./car-device-core.cjs');
const {createRudiStateClient}=require('./rudi-state-client.cjs');
function createCarDeviceService(options={}){return factory({...options,client:options.client||createRudiStateClient(options)});}
let defaultService;
module.exports={createCarDeviceService,handleCarDeviceRequest:(req,res)=>(defaultService||(defaultService=createCarDeviceService())).handleRequest(req,res)};
