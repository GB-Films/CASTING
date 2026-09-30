// Local preview, deliberately serving only the game files.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const files={'/':'index.html','/index.html':'index.html','/rankings.css':'rankings.css','/rankings.js':'rankings.js','/rankings-core.js':'rankings-core.js','/firebase-config.js':'firebase-config.js'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
http.createServer((req,res)=>{
 const file=files[new URL(req.url,'http://127.0.0.1').pathname];
 if(!file){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});
 fs.createReadStream(path.join(__dirname,'..',file)).pipe(res);
}).listen(8765,'127.0.0.1',()=>console.log('Casting preview: http://127.0.0.1:8765'));
