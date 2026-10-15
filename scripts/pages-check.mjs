import {readFile,access} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist');
const visited=new Set();
async function check(file){
  if(visited.has(file))return;visited.add(file);
  const source=await readFile(file,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
    const spec=match[1];
    assert.ok(!spec.startsWith('/'),`root-relative import: ${spec}`);
    const target=spec==='three'?path.join(root,'vendor/three.module.js'):path.resolve(path.dirname(file),spec);
    assert.ok(target.startsWith(root+path.sep));
    await access(target);await check(target);
  }
}
await check(path.join(root,'client.mjs'));await check(path.join(root,'practice-worker.mjs'));await check(path.join(root,'practice-socket.mjs'));
const html=await readFile(path.join(root,'index.html'),'utf8');
assert.ok(html.includes('globalThis.RIFT_PRACTICE = true'));
assert.ok(!/(?:src|href)="\//.test(html));
const url=pathToFileURL(path.join(root,'practice-worker.mjs')).href;
const wrapper=`import {parentPort} from 'node:worker_threads';globalThis.postMessage=m=>parentPort.postMessage(m);globalThis.onmessage=null;await import(${JSON.stringify(url)});parentPort.on('message',m=>onmessage({data:m}));parentPort.postMessage({type:'ready'});`;
const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(wrapper)));
let count=0;
try{
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('worker start/state timeout')),5000);
    worker.on('error',reject);
    worker.on('message',m=>{
      try{
        if(m.type==='ready')worker.postMessage({type:'join',name:'웹 검증',agent:'haven'});
        if(m.type==='welcome'){worker.postMessage({type:'start'});worker.postMessage({type:'buy',item:'lightArmor'});}
        if(m.type==='state'&&m.state.phase==='buy'){
          assert.equal(m.state.players.length,10);
          assert.equal(m.state.players.find(p=>p.id==='practice-player').armor,25);
          if(++count>=3){clearTimeout(timeout);resolve();}
        }
      }catch(e){clearTimeout(timeout);reject(e);}
    });
  });
}finally{await worker.terminate();}
console.log(`Pages: ${visited.size} modules resolved; built worker emitted ${count} valid live snapshots. Browser not launched.`);
