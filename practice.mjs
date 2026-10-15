import { Game } from './game.mjs';

// The Pages build runs the same authoritative rules in a dedicated worker.
export class PracticeSession {
  constructor(emit) { this.emit = emit; this.id = 'practice-player'; this.lastEvent = 0; }
  receive(m) {
    if (m.type === 'join') {
      if (this.game) return;
      this.game = new Game('PRACTICE');
      this.game.add(this.id, m.name, m.agent);
      this.fillBots();
      this.emit({type:'welcome', id:this.id, code:'PRACTICE', seq:0, resumed:false});
      this.snapshot();
      return;
    }
    const g = this.game;
    if (!g) return;
    const id = this.id;
    switch(m.type) {
      case 'input': g.input(id,m); break;
      case 'buy': g.buy(id,m.item); break;
      case 'refundWeapon': g.refundWeapon(id); break;
      case 'refundEquipment': g.refundEquipment(id,m.item); break;
      case 'mark': g.mark(id); break;
      case 'requestWeapon': g.requestWeapon(id,m.item); break;
      case 'sponsorWeapon': g.sponsorWeapon(id,m.target,m.item); break;
      case 'reload': g.reload(id); break;
      case 'select': g.select(id,m.slot); break;
      case 'drop': g.dropCore(id); break;
      case 'dropWeapon': g.dropPrimary(id); break;
      case 'pickup': g.pickup(id); break;
      case 'ability': g.ability(id,m.slot); break;
      case 'start': g.start(id); break;
      case 'team': g.chooseTeam(id,m.team); break;
      case 'configure': g.configure(id,m.overtime); break;
      case 'lobby': g.returnToLobby(id); break;
      case 'removeBots': g.removeBots(id); break;
      case 'bots': this.fillBots(); break;
      case 'ping': this.emit({type:'pong',stamp:m.stamp}); break;
      case 'chat': this.emit({type:'chatAck',requestId:m.requestId,accepted:g.chat(id,m.text)}); break;
    }
  }
  fillBots() {
    const g=this.game;
    if(g.phase!=='lobby')return;
    let n=0;
    while(g.players.size<10){
      while(g.players.has(`practice-bot-${n}`))n++;
      g.add(`practice-bot-${n}`,`훈련봇 ${n+1}`,['veil','pulse','dash','haven'][n%4],true);
    }
  }
  tick(dt){ this.game?.tick(dt); }
  snapshot(){
    if(!this.game)return;
    const state=this.game.snapshot(this.id);
    state.events=state.events.filter(e=>e.id>this.lastEvent);
    this.lastEvent=this.game.eventId;
    this.emit({type:'state',state});
  }
}
