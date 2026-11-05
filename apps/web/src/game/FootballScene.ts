import * as THREE from "three";
import type { MatchState } from "../types";

export class FootballScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private playerMeshes = new Map<string, THREE.Mesh>();
  private ball!: THREE.Mesh;
  private frame = 0;
  constructor(private host: HTMLDivElement) {
    this.scene.background = new THREE.Color("#10251d");
    this.camera = new THREE.PerspectiveCamera(43, host.clientWidth / host.clientHeight, 0.1, 500);
    this.camera.position.set(0, 53, 64);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.shadowMap.enabled = true;
    host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x274333, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-20, 50, 25); sun.castShadow = true; this.scene.add(sun);
    this.buildPitch();
    const ballGeo = new THREE.SphereGeometry(0.75, 20, 20);
    this.ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }));
    this.ball.position.y = 0.8; this.ball.castShadow = true; this.scene.add(this.ball);
    this.animate();
    window.addEventListener("resize", this.resize);
  }
  private buildPitch() {
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(105, 68), new THREE.MeshStandardMaterial({ color: "#287447", roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; this.scene.add(grass);
    const lineMat = new THREE.LineBasicMaterial({ color: "#e9f5e9" });
    const line = (points: [number,number][]) => {
      const g = new THREE.BufferGeometry().setFromPoints(points.map(([x,z]) => new THREE.Vector3(x, 0.08, z)));
      this.scene.add(new THREE.Line(g, lineMat));
    };
    line([[-52,-34],[52,-34],[52,34],[-52,34],[-52,-34]]);
    line([[0,-34],[0,34]]);
    const circle = new THREE.Mesh(new THREE.RingGeometry(9.05, 9.25, 64), new THREE.MeshBasicMaterial({ color: "#e9f5e9", side: THREE.DoubleSide }));
    circle.rotation.x = -Math.PI/2; circle.position.y = 0.09; this.scene.add(circle);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), new THREE.MeshBasicMaterial({ color: "#fff" }));
    spot.rotation.x = -Math.PI/2; spot.position.set(0,0.1,0); this.scene.add(spot);
    for (const side of [-1,1]) {
      const x = side*39;
      line([[x,-20],[x+side*13,-20],[x+side*13,20],[x,20]]);
      line([[x,-9],[x+side*5,-9],[x+side*5,9],[x,9]]);
      const goal = new THREE.Mesh(new THREE.BoxGeometry(1,3,7.32), new THREE.MeshStandardMaterial({color:"#eeeeee", transparent:true, opacity:0.22}));
      goal.position.set(side*53,1.5,0); this.scene.add(goal);
    }
    // Subtle alternating mowing bands.
    for(let i=0;i<10;i++){
      const band = new THREE.Mesh(new THREE.PlaneGeometry(10.5,68),new THREE.MeshBasicMaterial({color:"#ffffff",transparent:true,opacity:i%2?0.025:0.055}));
      band.rotation.x=-Math.PI/2;band.position.set(-47.25+i*10.5,0.035,0);this.scene.add(band);
    }
  }
  update(state: MatchState) {
    const alive = new Set(state.players.map(p=>p.id));
    for (const [id,mesh] of this.playerMeshes) if(!alive.has(id)){this.scene.remove(mesh);this.playerMeshes.delete(id);}
    for (const p of state.players) {
      let mesh = this.playerMeshes.get(p.id);
      if(!mesh){
        mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.85,0.9,4,8),new THREE.MeshStandardMaterial({color:p.team==="red"?"#ed554f":"#4c9cff"}));
        mesh.castShadow=true;this.scene.add(mesh);this.playerMeshes.set(p.id,mesh);
      }
      mesh.position.set(p.x,1.25,p.z);
      mesh.scale.setScalar(p.active?1.08:1);
      (mesh.material as THREE.MeshStandardMaterial).emissive.set(p.active?"#f8d45b":"#000000");
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity=p.active?0.45:0;
    }
    this.ball.position.set(state.ball.x,0.8,state.ball.z);
  }
  private animate = () => { this.frame=requestAnimationFrame(this.animate); this.renderer.render(this.scene,this.camera); };
  private resize = () => {const w=this.host.clientWidth,h=this.host.clientHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);};
  dispose(){cancelAnimationFrame(this.frame);window.removeEventListener("resize",this.resize);this.renderer.dispose();this.host.innerHTML="";}
}
