function parts(...values){return values.flat().filter((v)=>typeof v==='string'&&v.trim()).map((v)=>v.trim())}
function normalizePreviewSections(payload={}){const r=payload.results||{};return{
 events:{section:'events',parts:parts(r.events?.preview?.concerts,r.events?.preview?.stage),available:Boolean(r.events)},
 holidays:{section:'holidays',parts:parts(r.holidays?.preview?.message),available:Boolean(r.holidays)},
 facts:{section:'facts',parts:parts(r.facts?.preview?.message),available:Boolean(r.facts)},
 lulu:{section:'lulu',parts:parts(r.morning?.preview?.lulu),available:Boolean(r.morning?.preview?.lulu)},
 recipes:{section:'recipes',parts:parts(r.morning?.preview?.recipes||[]),available:Array.isArray(r.morning?.preview?.recipes)},
 clients:{section:'clients',parts:parts(r.clients?.preview?.message),available:Boolean(r.clients)},
 cinema:{section:'cinema',parts:parts(r.cinema?.preview?.message||r.cinema?.preview),available:Boolean(r.cinema)},
 labor:{section:'labor',parts:parts(r.labor?.preview?.message||r.labor?.preview),available:Boolean(r.labor)},
 weekend:{section:'weekend',parts:parts(r.weekend?.preview?.message||r.weekend?.preview),available:Boolean(r.weekend)},
}}
module.exports={normalizePreviewSections};
