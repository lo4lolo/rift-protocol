import { PracticeSession } from './practice.mjs';
const session = new PracticeSession(message => postMessage(message));
onmessage = event => session.receive(event.data);
let last=performance.now(), accumulator=0, snapshots=0;
setInterval(()=>{
  const now=performance.now(), elapsed=Math.min((now-last)/1000,.25);
  last=now; accumulator+=elapsed; snapshots+=elapsed;
  while(accumulator>=1/60){session.tick(1/60);accumulator-=1/60;}
  if(snapshots>=.05){snapshots%=.05;session.snapshot();}
},1000/60);
