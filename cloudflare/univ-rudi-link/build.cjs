'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
let core=fs.readFileSync(path.join(root,'api/car-device-core.cjs'),'utf8').replace("const crypto = require('node:crypto');","import crypto from 'node:crypto';").replace("const { createCarPairingGate } = require('./car-device-admin.cjs');","import {createCarPairingGate} from './gate.mjs';").replace('module.exports = {createCarDeviceService};','export {createCarDeviceService};');
let gate=fs.readFileSync(path.join(root,'api/car-device-admin.cjs'),'utf8').replace("const crypto=require('node:crypto');","import crypto from 'node:crypto';").replace('module.exports={createCarPairingGate};','export {createCarPairingGate};');
if(/require\(|module.exports/.test(core+gate))throw Error('Unexpected CommonJS in edge bundle');
fs.writeFileSync(path.join(__dirname,'core.mjs'),core);fs.writeFileSync(path.join(__dirname,'gate.mjs'),gate);
