import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import { FootballScene } from "./game/FootballScene";
import type { MatchState, Mode } from "./types";

const socket: Socket = io({ autoConnect: false });
const modeNames: Record<Mode,string> = {"1v1":"1 vs 1","2v2":"2 vs 2","ai":"1 Player vs AI"};
const emptyInput = {x:0,z:0};
export default function App(){
  const [mode,setMode]=useState<Mode>("1v1");
  const [room,setRoom]=useState("");
  const [state,setState]=useState<MatchState|null>(null);
  const [role,setRole]=useState<"host"|"controller"|null>(null);
  const [message,setMessage]=useState("Create a room to begin.");
  const [joinCode,setJoinCode]=useState("");
  const [controllerId,setControllerId]=useState("");
  const [assigned,setAssigned]=useState("");
  const [joystick,setJoystick]=useState(emptyInput);
  const [isConnecting,setIsConnecting]=useState(false);
  const sceneHost=useRef<HTMLDivElement>(null);
  const scene=useRef<FootballScene|null>(null);
  const joystickOrigin=useRef<{x:number;y:number}|null>(null);
  const query=new URLSearchParams(window.location.search);
  const isControllerRoute=window.location.pathname==="/controller" || query.has("room");

  useEffect(()=>{
    if(!socket.connected) socket.connect();
    socket.on("match-state",(s:MatchState)=>setState(s));
    socket.on("joined",(data:{role:string;controllerId?:string;slot?:string})=>{
      if(data.role==="controller"){setRole("controller");setControllerId(data.controllerId||"");setAssigned(data.slot||"");setMessage("Controller connected. Waiting for host.");}
      else {setRole("host");setMessage("Room ready. Scan the QR code with your phones.");}
    });
    socket.on("room-error",(m:string)=>{setMessage(m);setIsConnecting(false);});
    socket.on("room-created",(data:{roomId:string})=>{setRoom(data.roomId);socket.emit("join-room",{roomId:data.roomId,role:"host"});});
    socket.on("controller-count",(count:number)=>setMessage(`${count} mobile controller(s) connected.`));
    socket.on("match-started",()=>setMessage("Match started!"));
    const initialRoom = new URLSearchParams(window.location.search).get("room");
    if ((window.location.pathname === "/controller" || initialRoom) && initialRoom) {
      setRoom(initialRoom.toUpperCase());
      setIsConnecting(true);
      socket.emit("join-room", { roomId: initialRoom.toUpperCase(), role: "controller" });
    }
    return ()=>{socket.off("match-state");socket.off("joined");socket.off("room-error");socket.off("room-created");socket.off("controller-count");socket.off("match-started");};
  },[]);

  useEffect(()=>{
    if(role==="controller" && !controllerId) return;
    if(role==="controller"){
      const send=()=>socket.emit("controller-input",{roomId:room||query.get("room"),controllerId,input:joystick});
      const timer=window.setInterval(send,50);return ()=>window.clearInterval(timer);
    }
  },[role,controllerId,joystick,room]);

  useEffect(()=>{
    if(role!=="host"||!sceneHost.current)return;
    if(!scene.current)scene.current=new FootballScene(sceneHost.current);
    if(state)scene.current.update(state);
  },[role,state]);

  useEffect(()=>()=>scene.current?.dispose(),[]);
  useEffect(()=>{
    if(role!=="host"||!room)return;
    const onKey=(e:KeyboardEvent)=>{
      const keys=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "];if(keys.includes(e.key))e.preventDefault();
      let x=0,z=0;
      if(e.key==="w"||e.key==="ArrowUp")z=-1;if(e.key==="s"||e.key==="ArrowDown")z=1;
      if(e.key==="a"||e.key==="ArrowLeft")x=-1;if(e.key==="d"||e.key==="ArrowRight")x=1;
      if(x||z)socket.emit("host-input",{roomId:room,input:{x,z}});
      if(e.key==="e")socket.emit("host-action",{roomId:room,action:"pass"});
      if(e.key===" ")socket.emit("host-action",{roomId:room,action:"shoot"});
      if(e.key==="q")socket.emit("host-action",{roomId:room,action:"switch"});
      if(e.key==="f")socket.emit("host-action",{roomId:room,action:"tackle"});
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[role,room]);

  async function createRoom(){
    setIsConnecting(true);
    try{
      const res=await fetch("/api/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode})});
      if(!res.ok)throw new Error("Could not create room");
      const data=await res.json();setRoom(data.roomId);socket.emit("join-room",{roomId:data.roomId,role:"host"});
    }catch(e){setMessage(e instanceof Error?e.message:"Connection error");}
    setIsConnecting(false);
  }
  function joinRoom(code:string){
    const clean=code.trim().toUpperCase();if(!clean)return;
    setRoom(clean);setIsConnecting(true);socket.emit("join-room",{roomId:clean,role:"controller"});
  }
  function startMatch(){if(room)socket.emit("start-match",{roomId:room});}
  function action(action:string){socket.emit("controller-action",{roomId:room||query.get("room"),controllerId,action});}
  function moveJoystick(e:React.PointerEvent<HTMLDivElement>){
    if(!joystickOrigin.current)return;
    const dx=e.clientX-joystickOrigin.current.x,dy=e.clientY-joystickOrigin.current.y;
    const max=42,len=Math.max(1,Math.hypot(dx,dy)),scale=Math.min(1,max/len);
    setJoystick({x:Math.round(dx*scale/max*100)/100,z:Math.round(dy*scale/max*100)/100});
  }
  function joystickDown(e:React.PointerEvent<HTMLDivElement>){e.currentTarget.setPointerCapture(e.pointerId);joystickOrigin.current={x:e.clientX,y:e.clientY};moveJoystick(e);}
  function joystickUp(){joystickOrigin.current=null;setJoystick(emptyInput);}

  if(isControllerRoute){
    const code=query.get("room")||joinCode;
    return <main className="controller-page">
      <div className="controller-head"><span className="brand-dot"/> FOOTBALL CONSOLE <span className="live-dot"/></div>
      {role!=="controller" ? <section className="join-card"><p className="eyebrow">MOBILE CONTROLLER</p><h1>Join the match</h1><p>Enter the room code shown on the laptop.</p><input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={6}/><button className="primary" disabled={isConnecting} onClick={()=>joinRoom(code||joinCode)}>Connect phone</button><small>{message}</small></section>:
      <section className="remote">
        <div className="remote-info"><span>{assigned||"PLAYER"}</span><span className="connected">● CONNECTED</span></div>
        <div className="remote-middle">
          <div className="joystick" onPointerDown={joystickDown} onPointerMove={moveJoystick} onPointerUp={joystickUp} onPointerCancel={joystickUp}><div className="stick" style={{transform:`translate(${joystick.x*42}px,${joystick.z*42}px)`}}/></div>
          <div className="action-grid"><button onPointerDown={()=>action("shoot")}>SHOOT</button><button onPointerDown={()=>action("pass")}>PASS</button><button onPointerDown={()=>action("through")}>THROUGH</button><button onPointerDown={()=>action("switch")}>SWITCH</button><button onPointerDown={()=>action("sprint")}>SPRINT</button><button onPointerDown={()=>action("tackle")}>TACKLE</button></div>
        </div><p className="remote-hint">Move with the joystick · Tap actions to play</p>
      </section>}
    </main>;
  }

  if(role==="host"&&room){
    const base=`${window.location.protocol}//${window.location.host}/controller?room=${room}`;
    return <main className="host-shell">
      <header className="topbar"><div className="brand"><span className="brand-dot"/> FOOTBALL <b>CONSOLE</b></div><div className="top-right"><span className="pill">{modeNames[state?.mode||mode]}</span><span className="pill">11 vs 11</span></div></header>
      <section className="match-layout">
        <div className="game-panel">
          <div className="scorebar"><div className="team-label red">RED <b>{state?.score.red??0}</b></div><div className="clock">{formatTime(state?.timeLeft??300)}</div><div className="team-label blue"><b>{state?.score.blue??0}</b> BLUE</div></div>
          <div className="pitch-wrap"><div ref={sceneHost} className="scene-host"/>{state?.status!=="playing"&&<div className="game-overlay"><span className="eyebrow">{state?.status==="finished"?"FULL TIME":"MATCH LOBBY"}</span><h2>{state?.status==="finished"?"Match finished":"Ready for kick-off?"}</h2><p>{state?.status==="finished"?"Start another match from the room menu.":"Connect your phones, then start the match."}</p>{state?.status!=="playing"&&<button className="primary" onClick={startMatch}>START MATCH</button>}</div>}</div>
          <div className="keyboard-help">KEYBOARD: WASD / ARROWS MOVE · E PASS · SPACE SHOOT · Q SWITCH · F TACKLE</div>
        </div>
        <aside className="side-panel"><div><p className="eyebrow">ROOM CONNECTION</p><h2>Join with phone</h2><p className="muted">Scan this code with your mobile camera.</p><div className="qr-box"><QRCodeSVG value={base} size={176} /></div><div className="room-code"><small>ROOM CODE</small><strong>{room}</strong></div><p className="muted tiny">Or open <b>{window.location.host}/controller</b> and enter the code.</p></div><div className="lobby-status"><div className="status-line"><span>Mobile controllers</span><b>{state?.controllerCount??0}</b></div><div className="status-line"><span>Game mode</span><b>{modeNames[state?.mode||mode]}</b></div><div className="status-line"><span>AI difficulty</span><b>Medium</b></div><div className="status-line"><span>Match format</span><b>11-a-side</b></div><button className="secondary" onClick={()=>{socket.disconnect();window.location.href="/";}}>Leave room</button></div></aside>
      </section>
      <div className="toast">{message}</div>
    </main>;
  }

  return <main className="landing">
    <header className="topbar"><div className="brand"><span className="brand-dot"/> FOOTBALL <b>CONSOLE</b></div><span className="pill">BROWSER FOOTBALL</span></header>
    <section className="hero"><p className="eyebrow">YOUR LAPTOP IS THE STADIUM</p><h1>Bring your friends.<br/><em>Take the pitch.</em></h1><p className="hero-copy">A football match on your laptop. Your phones become the controllers. No app installation required.</p></section>
    <section className="setup-card"><div className="setup-title"><div><p className="eyebrow">CREATE A MATCH</p><h2>Choose your game mode</h2></div><span className="pill">11 vs 11</span></div>
      <div className="mode-grid">{(["1v1","2v2","ai"] as Mode[]).map(m=><button key={m} className={`mode-card ${mode===m?"selected":""}`} onClick={()=>setMode(m)}><span className="mode-icon">{m==="1v1"?"⚔":m==="2v2"?"👥":"🤖"}</span><b>{modeNames[m]}</b><small>{m==="1v1"?"One controller per team":m==="2v2"?"Two controllers per team":"You versus computer"}</small></button>)}</div>
      <div className="setup-foot"><div><b>Broadcast camera</b><small>Medium AI · 11-a-side · 5-minute match</small></div><button className="primary create-btn" onClick={createRoom} disabled={isConnecting}>{isConnecting?"CREATING…":"CREATE GAME ROOM →"}</button></div>
      <div className="join-existing"><span>Already have a room?</span><input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={6}/><button className="secondary" onClick={()=>joinRoom(joinCode)}>Join as controller</button></div>
    </section>
    <footer>FOOTBALL CONSOLE <span>·</span> PLAY TOGETHER, ANYWHERE</footer>
  </main>;
}
function formatTime(seconds:number){const s=Math.max(0,seconds);return `${Math.floor(s/60).toString().padStart(2,"0")}:${Math.floor(s%60).toString().padStart(2,"0")}`;}
