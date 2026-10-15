import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function checkServer(base){
  const url=new URL(base);
  const health=await fetch(new URL('/health',url),{signal:AbortSignal.timeout(5000)});
  assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
  for(const file of ['/','/client.mjs','/shared.mjs','/vendor/three.module.js']){
    const r=await fetch(new URL(file,url));assert.equal(r.status,200,file);
    assert.ok((await r.text()).length>100);
  }
  for(const file of ['/server.mjs','/.env','/package.json'])assert.equal((await fetch(new URL(file,url))).status,404);
  const code='CI'+randomBytes(4).toString('hex').toUpperCase(),clients=[];
  const socketUrl=new URL(url);socketUrl.protocol=url.protocol==='https:'?'wss:':'ws:';
  try{
    for(let i=0;i<2;i++){
      const ws=new WebSocket(socketUrl,{origin:url.origin});
      const c={ws,id:null,state:null};clients.push(c);
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('welcome timeout')),5000);
        ws.on('error',e=>{clearTimeout(timer);reject(e);});
        ws.on('open',()=>ws.send(JSON.stringify({type:'join',code,name:`검증 ${i}`})));
        ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome'){c.id=m.id;clearTimeout(timer);resolve();}if(m.type==='state')c.state=m.state;});
      });
    }
    clients[0].ws.send(JSON.stringify({type:'bots'}));
    clients[0].ws.send(JSON.stringify({type:'start'}));
    const deadline=Date.now()+5000;
    while(Date.now()<deadline&&!clients.every(c=>c.state?.phase==='buy'&&c.state.players.length===10))await new Promise(r=>setTimeout(r,25));
    assert.notEqual(clients[0].id,clients[1].id);
    for(const c of clients){assert.equal(c.state?.phase,'buy');assert.equal(c.state.players.length,10);assert.ok(c.state.players.some(p=>p.id===clients[1].id));}
    console.log('Production smoke passed: HTTP assets, private-file denial, two real clients, shared 10-player match.');
  }finally{for(const c of clients)c.ws.terminate();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkServer(process.argv[2]||'http://127.0.0.1:4175');
