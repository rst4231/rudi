/* Shared dated positive-emotion chart for personal and partner pages. */
(()=>{'use strict';
function positiveShare(entry){const total=Number(entry?.total),positive=Number(entry?.positive);return Number.isFinite(total)&&total>0&&Number.isFinite(positive)&&positive>=0&&positive<=total?Math.round(100*positive/total):null;}
function render(svg,daily){
 if(!svg)return;svg.replaceChildren();
 const points=(Array.isArray(daily)?daily:[]).map(x=>({day:x.date,value:positiveShare(x)})).filter(x=>Number.isFinite(x.value)&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.day))).sort((a,b)=>a.day.localeCompare(b.day)).slice(-30);
 const ns='http://www.w3.org/2000/svg',add=(tag,attrs,body)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs||{}))el.setAttribute(k,String(v));if(body!==undefined)el.textContent=String(body);svg.append(el);return el;};
 svg.setAttribute('viewBox','0 0 350 168');
 if(points.length<2){add('text',{x:12,y:58,fill:'currentColor','font-size':12},'График появится после двух дней');add('text',{x:12,y:77,fill:'currentColor','font-size':12},'с отметками настроения');return;}
 const x=i=>22+310*i/(points.length-1),y=n=>110-93*n/100;
 for(const n of [0,50,100])add('line',{x1:22,y1:y(n),x2:332,y2:y(n),stroke:'currentColor','stroke-opacity':.09,'stroke-dasharray':'3 5'});
 add('polyline',{points:points.map((p,i)=>x(i).toFixed(1)+','+y(p.value).toFixed(1)).join(' '),fill:'none',stroke:'var(--pc-accent)','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'});
 const ticks=[0,Math.floor((points.length-1)/4),Math.floor((points.length-1)/2),Math.floor((points.length-1)*3/4),points.length-1].filter((v,i,a)=>a.indexOf(v)===i);
 for(const i of ticks){const p=points[i],cx=x(i),day=new Date(p.day+'T12:00:00Z').toLocaleDateString('ru-RU',{weekday:'short',timeZone:'UTC'}).replace('.','');
  add('circle',{cx,cy:y(p.value),r:3.3,fill:'var(--pc-accent)'});
  add('text',{x:cx,y:138,'text-anchor':'middle',fill:'var(--pc-muted)','font-size':11,'font-weight':700},day.slice(0,2));
  add('text',{x:cx,y:154,'text-anchor':'middle',fill:'var(--pc-muted)','font-size':10},p.day.slice(8,10)+'.'+p.day.slice(5,7));}
}
window.RudiPositiveEmotions={render};
})();
