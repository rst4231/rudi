const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../../public');
const mime={
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg'
};

http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  let relative=url.pathname==='/'?'index.html':url.pathname.replace(/^\/+/, '');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html')){
    res.writeHead(403);res.end('forbidden');return;
  }
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404);res.end('not found');return}
    res.writeHead(200,{
      'content-type':mime[path.extname(file)]||'application/octet-stream',
      'cache-control':'no-store'
    });
    res.end(data);
  });
}).listen(4173,'127.0.0.1');
