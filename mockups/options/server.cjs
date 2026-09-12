const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const roots = {before:path.resolve(__dirname,'../../../aegis-custom-grades/dist'),after:path.resolve(__dirname,'../../dist')};
const shim = `
const store={aegisLanguage:new URLSearchParams(location.search).get('lang')||'en',lastSeenChangelogVersion:'1.9.0',aegisWelcomeDismissed:true,aegisMode:'both',aegisBadgeStyle:'footer',aegisTwoTier:true,aegisBadgeColor:'gradient',parsedCount:842};
const listeners=[];
window.chrome={storage:{local:{get(keys,cb){const r=Object.fromEntries(keys.map(k=>[k,structuredClone(store[k])]));if(cb)setTimeout(()=>cb(r),0);return Promise.resolve(r)},set(values,cb){const changes={};for(const [key,value] of Object.entries(values)){changes[key]={oldValue:store[key],newValue:value};store[key]=value}setTimeout(()=>{listeners.forEach(fn=>fn(changes,'local'));cb?.()},0);return Promise.resolve()}},onChanged:{addListener(fn){listeners.push(fn)}}},runtime:{getManifest:()=>({version:'1.9.0'}),getURL:name=>name,sendMessage(message,cb){cb?.({success:false});return Promise.resolve({success:false})},onMessage:{addListener(){}}},tabs:{query:async()=>[],create:async()=>{}},alarms:{create(){}}};
window.fetch=async()=>new Response('{}',{headers:{'Content-Type':'application/json'}});
`;
const index=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Aegis · Compact options preview</title><style>
*{box-sizing:border-box}body{margin:0;background:#101116;color:#e5e5eb;font:14px/1.5 system-ui;padding:32px}main{max-width:740px;margin:auto}h1{font-size:24px;margin:0 0 4px}p{color:#aaaab8;margin:0 0 24px}.compare{display:flex;gap:32px;flex-wrap:wrap}.column{width:320px}h2{font-size:13px;font-weight:600;color:#b8b8c5;display:flex;justify-content:space-between}h2 span{color:#737381;font-weight:400}iframe{width:320px;height:690px;border:0;outline:1px solid #33343f;border-radius:10px;background:#0c0c10}select{background:#20212b;color:white;border:1px solid #42434f;padding:5px;border-radius:4px;margin-bottom:12px}small{display:block;margin-top:16px;color:#9595a4}
</style><main><h1>Less scrolling. Clearer choices.</h1><p>Same 320 px width. Four focused sections, with the familiar Aegis controls.</p><label>Preview language <select id="language"><option value="en">English</option><option value="es">Español</option><option value="ko">한국어</option><option value="ja">日本語</option><option value="zh-CHS">简体中文</option><option value="zh-CHT">繁體中文</option></select></label><div class="compare"><div class="column"><h2>Current menu <span>320 px</span></h2><iframe title="Current Aegis options" src="/before/popup.html"></iframe></div><div class="column"><h2>Compact proposal <span>320 px</span></h2><iframe title="Compact Aegis options" src="/after/popup.html"></iframe></div></div><small>Interactive mockup · Changes stay in this preview. Sync and external actions are inactive.</small></main><script>document.querySelector('select').onchange=e=>document.querySelectorAll('iframe').forEach(f=>f.src=f.src.split('?')[0]+'?lang='+e.target.value)</script></html>`;
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(index)}
 if(url.pathname.endsWith('/preview-shim.js')){res.setHeader('Content-Type','text/javascript');return res.end(shim)}
 if(url.pathname.endsWith('/preview-scrollbar.js')){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(__dirname,'scrollbar.js')))}
 const [variant,...parts]=url.pathname.slice(1).split('/');
 const root=roots[variant];
 if(!root){res.writeHead(404);return res.end()}
 const file=path.resolve(root,...parts);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end()}
 const ext=path.extname(file);
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[ext]||'application/octet-stream');
 let body=fs.readFileSync(file);
 if(ext==='.html')body=body.toString().replace('<head>','<head><script src="preview-shim.js"></script><script src="preview-scrollbar.js"></script>');
 res.end(body);
}).listen(4319,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4319'));
