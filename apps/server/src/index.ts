import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server, Socket } from "socket.io";
import { randomBytes } from "node:crypto";

type Mode="1v1"|"2v2"|"ai";
type Team="red"|"blue";
type Input={x:number;z:number};
type Player={id:string;team:Team;number:number;x:number;z:number;vx:number;vz:number;controlledBy:string|null;active:boolean};
type Room={id:string;mode:Mode;status:"lobby"|"playing"|"finished";players:Player[];ball:{x:number;z:number;vx:number;vz:number};score:{red:number;blue:number};timeLeft:number;possession:Team|null;controllers:Map<string,{socketId:string;team:Team;slot:number}>;inputs:Map<string,Input>;actions:Map<string,string>;lastTick:number;host:string|null};
const app=express();app.use(cors());app.use(express.json());
const http=createServer(app);const io=new Server(http,{cors:{origin:"*"}});
const rooms=new Map<string,Room>();
const randCode=()=>randomBytes(3).toString("hex").toUpperCase();
function makePlayers():Player[]{
 const players:Player[]=[];
 const red=[[-43,0],[-35,-19],[-35,-6],[-35,6],[-35,19],[-22,-24],[-22,-8],[-22,8],[-22,24],[-8,-10],[-8,10]];
 const blue=red.map(([x,z])=>[-x,-z]);
 for(let i=0;i<11;i++){players.push({id:`r${i}`,team:"red",number:i+1,x:red[i][0],z:red[i][1],vx:0,vz:0,controlledBy:null,active:i===9});players.push({id:`b${i}`,team:"blue",number:i+1,x:blue[i][0],z:blue[i][1],vx:0,vz:0,controlledBy:null,active:i===9});}
 return players;
}
function createRoom(mode:Mode):Room{
 const id=randCode();const room:Room={id,mode,status:"lobby",players:makePlayers(),ball:{x:0,z:0,vx:0,vz:0},score:{red:0,blue:0},timeLeft:300,possession:null,controllers:new Map(),inputs:new Map(),actions:new Map(),lastTick:Date.now(),host:null};rooms.set(id,room);return room;
}
function publicState(r:Room){return {roomId:r.id,mode:r.mode,status:r.status,players:r.players,ball:r.ball,score:r.score,timeLeft:r.timeLeft,possession:r.possession,controllerCount:r.controllers.size};}
function broadcast(r:Room){io.to(r.id).emit("match-state",publicState(r));}
function nearestPlayer(r:Room,team:Team,x=r.ball.x,z=r.ball.z){return r.players.filter(p=>p.team===team).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];}
function activePlayer(r:Room,team:Team,controllerId?:string){return r.players.find(p=>p.team===team&&(controllerId?p.controlledBy===controllerId:p.active))||nearestPlayer(r,team);}
function assignControllers(r:Room){
 const slots=r.mode==="2v2"?4:r.mode==="1v1"?2:1;
 const teamOrder:Team[]=r.mode==="2v2"?["red","blue","red","blue"]:r.mode==="1v1"?["red","blue"]:["red"];
 const teamCounts:Record<Team,number>={red:0,blue:0};
 [...r.controllers.entries()].forEach(([id,c],i)=>{if(i>=slots)return;c.team=teamOrder[i];c.slot=i+1;const number=teamCounts[c.team]++===0?10:11;const player=r.players.find(p=>p.team===c.team&&p.number===number);if(player){player.controlledBy=id;player.active=true;}});
}
function action(r:Room,team:Team,kind:string,controllerId?:string){
 const p=activePlayer(r,team,controllerId);if(!p)return;
 const dx=r.ball.x-p.x,dz=r.ball.z-p.z,dist=Math.hypot(dx,dz);
 if(kind==="switch"){
  const candidates=r.players.filter(q=>q.team===team).sort((a,b)=>Math.hypot(a.x-r.ball.x,a.z-r.ball.z)-Math.hypot(b.x-r.ball.x,b.z-r.ball.z));
  const next=candidates.find(q=>q.id!==p.id);if(next){p.active=false;next.active=true;if(controllerId){p.controlledBy=null;next.controlledBy=controllerId;}}
 }
 if(dist<4.5){
  if(kind==="pass"||kind==="through"){const target=r.players.filter(q=>q.team===team&&q.id!==p.id).sort((a,b)=>Math.hypot(b.x-p.x,b.z-p.z)-Math.hypot(a.x-p.x,a.z-p.z))[0];const tx=target?target.x-p.x:team==="red"?1:-1,tz=target?target.z-p.z:0,len=Math.hypot(tx,tz)||1;r.ball.vx=tx/len*(kind==="through"?19:14);r.ball.vz=tz/len*(kind==="through"?19:14);r.possession=team;}
  if(kind==="shoot"){r.ball.vx=(team==="red"?1:-1)*27;r.ball.vz=(Math.random()-.5)*8;r.possession=team;}
 }
 if(kind==="tackle"&&dist<5){r.ball.vx=(team==="red"?1:-1)*10;r.ball.vz=(Math.random()-.5)*6;r.possession=team;}
}
function tick(r:Room,dt:number){
 if(r.status!=="playing")return;
 r.timeLeft=Math.max(0,r.timeLeft-dt);
 const maxSpeed=13;
 for(const p of r.players){
  let input:Input={x:0,z:0};
  if(p.controlledBy){input=r.inputs.get(p.controlledBy)||input;}
  else {
   const target=p.number===1?{x:p.team==="red"?-48:48,z:0}:nearestPlayer(r,p.team);
   const attacking=(p.team==="red"?1:-1);
   const ballDist=Math.hypot(r.ball.x-p.x,r.ball.z-p.z);
   if(p.number===1){input={x:(target.x-p.x)*.15,z:(target.z-p.z)*.15};}
   else if(p.active||ballDist<16){input={x:(r.ball.x-p.x)*.55+attacking*2,z:(r.ball.z-p.z)*.55};}
   else {const homeX=(p.team==="red"?-1:1)*(p.number<=5?34:p.number<=9?19:8);const homeZ=((p.number%5)-2)*7;input={x:(homeX-p.x)*.08,z:(homeZ-p.z)*.08};}
  }
  const len=Math.hypot(input.x,input.z)||1;const scale=Math.min(1,len);p.vx=(input.x/len)*maxSpeed*scale;p.vz=(input.z/len)*maxSpeed*scale;p.x=Math.max(-50,Math.min(50,p.x+p.vx*dt));p.z=Math.max(-32,Math.min(32,p.z+p.vz*dt));
  if(Math.hypot(r.ball.x-p.x,r.ball.z-p.z)<1.8&&Math.hypot(r.ball.vx,r.ball.vz)<8){r.ball.vx=p.vx*.75+(p.team==="red"?2:-2);r.ball.vz=p.vz*.75;r.possession=p.team;}
 }
 r.ball.x+=r.ball.vx*dt;r.ball.z+=r.ball.vz*dt;r.ball.vx*=Math.pow(.985,dt*60);r.ball.vz*=Math.pow(.985,dt*60);
 if(Math.abs(r.ball.z)>33){r.ball.z=Math.sign(r.ball.z)*33;r.ball.vz*=-.6;}
 if(r.ball.x>53||r.ball.x< -53){const scorer=r.ball.x>0?"red":"blue";if(Math.abs(r.ball.z)<4.2){r.score[scorer]++;r.ball={x:0,z:0,vx:0,vz:0};r.players=makePlayers();for(const [id,c] of r.controllers){const p=r.players.find(p=>p.team===c.team&&p.number===10);if(p){p.controlledBy=id;p.active=true;}}r.possession=null;}else{r.ball.x=Math.sign(r.ball.x)*52;r.ball.vx*=-.5;}}
 if(r.timeLeft<=0)r.status="finished";
}
app.post("/api/rooms",(req,res)=>{const mode=req.body?.mode as Mode;if(!["1v1","2v2","ai"].includes(mode))return res.status(400).json({error:"Invalid mode"});const r=createRoom(mode);res.json({roomId:r.id});});
app.get("/api/health",(_req,res)=>res.json({ok:true,rooms:rooms.size}));
io.on("connection",(socket:Socket)=>{
 socket.on("join-room",({roomId,role}:{roomId:string;role:"host"|"controller"})=>{
  const r=rooms.get(String(roomId||"").toUpperCase());if(!r){socket.emit("room-error","Room not found. Check the room code.");return;}
  socket.join(r.id);
  if(role==="host"){r.host=socket.id;socket.emit("joined",{role:"host"});}
  else {
   const capacity=r.mode==="2v2"?4:r.mode==="1v1"?2:1;
   if(r.controllers.size>=capacity){socket.emit("room-error","This room already has all controller slots filled.");return;}
   const id=`c-${socket.id}`;const team:Team=r.mode==="ai"?"red":r.mode==="2v2"?(r.controllers.size%2===0?"red":"blue"):(r.controllers.size===0?"red":"blue");
   r.controllers.set(id,{socketId:socket.id,team,slot:r.controllers.size+1});r.inputs.set(id,{x:0,z:0});assignControllers(r);
   socket.data.controllerId=id;socket.data.roomId=r.id;
   socket.emit("joined",{role:"controller",controllerId:id,slot:`${team.toUpperCase()} TEAM`});
   io.to(r.id).emit("controller-count",r.controllers.size);
  }
  broadcast(r);
 });
 socket.on("start-match",({roomId}:{roomId:string})=>{const r=rooms.get(roomId);if(!r||r.host!==socket.id)return;r.status="playing";r.lastTick=Date.now();io.to(r.id).emit("match-started");broadcast(r);});
 socket.on("controller-input",({roomId,controllerId,input}:{roomId:string;controllerId:string;input:Input})=>{const r=rooms.get(roomId);if(!r||!r.controllers.has(controllerId))return;r.inputs.set(controllerId,{x:Math.max(-1,Math.min(1,input.x)),z:Math.max(-1,Math.min(1,input.z))});});
 socket.on("host-input",({roomId,input}:{roomId:string;input:Input})=>{const r=rooms.get(roomId);if(!r||r.host!==socket.id)return;const id=[...r.controllers.keys()][0];if(id)r.inputs.set(id,input);else{const p=activePlayer(r,"red");if(p){p.x+=input.x*1.5;p.z+=input.z*1.5;}}});
 socket.on("controller-action",({roomId,controllerId,action:kind}:{roomId:string;controllerId:string;action:string})=>{const r=rooms.get(roomId);const c=r?.controllers.get(controllerId);if(r&&c)action(r,c.team,kind,controllerId);});
 socket.on("host-action",({roomId,action:kind}:{roomId:string;action:string})=>{const r=rooms.get(roomId);if(r?.host===socket.id)action(r,"red",kind);});
 socket.on("disconnect",()=>{const roomId=socket.data.roomId as string;const id=socket.data.controllerId as string;const r=rooms.get(roomId);if(r&&id){r.controllers.delete(id);r.inputs.delete(id);for(const p of r.players)if(p.controlledBy===id)p.controlledBy=null;io.to(r.id).emit("controller-count",r.controllers.size);broadcast(r);}});
});
setInterval(()=>{const now=Date.now();for(const r of rooms.values()){const dt=Math.min(.05,(now-r.lastTick)/1000);r.lastTick=now;if(r.status==="playing"){tick(r,dt);broadcast(r);}}},50);
const PORT=Number(process.env.PORT||3001);http.listen(PORT,"0.0.0.0",()=>console.log(`Football Console server listening on ${PORT}`));
