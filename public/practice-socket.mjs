export class PracticeSocket {
  constructor(){
    this.readyState=0;
    this.worker=new Worker(new URL('./practice-worker.mjs',import.meta.url),{type:'module'});
    this.worker.onmessage=e=>this.onmessage?.({data:JSON.stringify(e.data)});
    this.worker.onerror=e=>{this.onerror?.(e);this.close();};
    queueMicrotask(()=>{if(this.readyState!==0)return;this.readyState=1;this.onopen?.();});
  }
  send(text){if(this.readyState===1)this.worker.postMessage(JSON.parse(text));}
  close(){if(this.readyState===3)return;this.readyState=3;this.worker.terminate();this.onclose?.();}
}
