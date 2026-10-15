import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
const out='dist';
await mkdir(`${out}/vendor`,{recursive:true});
const publicFiles=['index.html','style.css','client.mjs','art.mjs','notifications.mjs','practice-worker.mjs','practice-socket.mjs'];
for(const name of publicFiles){
  let source=await readFile(`public/${name}`,'utf8');
  if(name==='index.html')source=source.replaceAll('="/','="./').replace('"/vendor/','"./vendor/').replace('LOCAL PLAYTEST · 0.53','WEB PRACTICE · 0.54').replace('친구와 같은 코드를 입력하세요','브라우저에서 봇과 플레이').replace('같은 서버 · 같은 방 코드로 함께 플레이','설치 없이 5대5 봇 연습 · PC 키보드/마우스 필요').replace('<script type="module"','<script>globalThis.RIFT_PRACTICE = true;</script><script type="module"');
  if(name==='client.mjs')source=source.replaceAll('from "/','from "./').replace('import * as THREE','import { PracticeSocket } from "./practice-socket.mjs";\nimport * as THREE').replace('ws = new WebSocket(','ws = globalThis.RIFT_PRACTICE ? new PracticeSocket() : new WebSocket(').replace('`방 코드 ${m.code} · ${m.resumed ? "기존 경기로 복귀했습니다." : "친구에게 이 주소와 코드를 알려 주세요."}`','globalThis.RIFT_PRACTICE ? "봇 연습 · 작전 시작을 누르세요. 온라인 멀티플레이는 별도 서버가 필요합니다." : `방 코드 ${m.code} · ${m.resumed ? "기존 경기로 복귀했습니다." : "친구에게 이 주소와 코드를 알려 주세요."}`');
  await writeFile(`${out}/${name}`,source);
}
for(const name of ['practice','game','shared','netcode','navigation','tactics','ballistics','visibility','hearing'])await copyFile(`${name}.mjs`,`${out}/${name}.mjs`);
for(const name of ['three.module.js','three.core.js'])await copyFile(`node_modules/three/build/${name}`,`${out}/vendor/${name}`);
await copyFile('node_modules/three/LICENSE',`${out}/vendor/THREE-LICENSE.txt`);
await writeFile(`${out}/.nojekyll`,'');
console.log('Built GitHub Pages practice version in dist/');
