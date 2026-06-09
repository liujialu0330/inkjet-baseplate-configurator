import * as THREE from 'three';

/* ---------- 视角立方体 (ViewCube) ---------- */
// 模块内状态
let cubeScene, cubeCam, viewCube, raycaster;
let cubeDrag = null, pendingFace = null;
// init 存入的引用
let camera, controls, renderer, hostGetter;

export function init(cameraRef, controlsRef, rendererRef, hostGetterRef){
  camera = cameraRef; controls = controlsRef; renderer = rendererRef; hostGetter = hostGetterRef;
  buildViewCube();
  renderer.domElement.addEventListener('pointerdown', onCubeDown, true);
}

export function renderOverlay(){
  const host=hostGetter(), W=host.clientWidth, H=host.clientHeight;
  const S=104, M=12, vx=W-S-M, vy=H-S-M;            // 右上角视角立方体
  const d=camera.position.clone().sub(controls.target).normalize();
  cubeCam.position.copy(d).multiplyScalar(5); cubeCam.up.copy(camera.up); cubeCam.lookAt(0,0,0);
  renderer.setViewport(vx,vy,S,S); renderer.setScissor(vx,vy,S,S); renderer.setScissorTest(true);
  renderer.render(cubeScene,cubeCam); renderer.setScissorTest(false);
}

export function isDragging(){ return cubeDrag != null; }

function faceTex(txt){
  const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
  g.fillStyle='#eef1f6'; g.fillRect(0,0,128,128);
  g.strokeStyle='#b9c0ca'; g.lineWidth=6; g.strokeRect(3,3,122,122);
  g.fillStyle='#39404c'; g.font='600 36px "Microsoft YaHei",system-ui,sans-serif'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText(txt,64,70);
  const t=new THREE.CanvasTexture(c); t.anisotropy=4; return t;
}
function buildViewCube(){
  cubeScene=new THREE.Scene();
  cubeCam=new THREE.OrthographicCamera(-1.35,1.35,1.35,-1.35,0.1,20);
  const mats=['右','左','上','下','前','后'].map(t=>new THREE.MeshBasicMaterial({map:faceTex(t)}));  // +X -X +Y -Y +Z -Z
  viewCube=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.5,1.5), mats);
  cubeScene.add(viewCube);
  cubeScene.add(new THREE.LineSegments(new THREE.EdgesGeometry(viewCube.geometry), new THREE.LineBasicMaterial({color:0x9aa3ad})));
  raycaster=new THREE.Raycaster();
}
function applyView(n){
  if(!controls) return;
  const dist=camera.position.distanceTo(controls.target), d=n.clone().normalize();
  camera.up.copy(Math.abs(d.y)>0.9 ? new THREE.Vector3(0,0,d.y>0?-1:1) : new THREE.Vector3(0,1,0));
  camera.position.copy(controls.target).addScaledVector(d,dist);
  camera.lookAt(controls.target); controls.update();
}
function inCubeRegion(e){
  const host=hostGetter(), W=host.clientWidth;
  const r=renderer.domElement.getBoundingClientRect();
  const x=e.clientX-r.left, y=e.clientY-r.top, S=104, M=12;
  if(x>=W-S-M && x<=W-M && y>=M && y<=M+S) return {nx:((x-(W-S-M))/S)*2-1, ny:-(((y-M)/S)*2-1)};
  return null;
}
function pickCubeFace(nx,ny){
  raycaster.setFromCamera(new THREE.Vector2(nx,ny), cubeCam);
  const hit=raycaster.intersectObject(viewCube,false)[0];
  return (hit&&hit.face)?hit.face.normal.clone():null;
}
function onCubeDown(e){
  if(!viewCube) return;
  const reg=inCubeRegion(e); if(!reg) return;
  e.stopPropagation(); e.preventDefault();
  pendingFace=pickCubeFace(reg.nx,reg.ny);
  cubeDrag={x:e.clientX, y:e.clientY, moved:0};
  controls.enabled=false; camera.up.set(0,1,0);
  window.addEventListener('pointermove', onCubeMove, true);
  window.addEventListener('pointerup', onCubeUp, true);
}
function onCubeMove(e){
  if(!cubeDrag) return;
  const dx=e.clientX-cubeDrag.x, dy=e.clientY-cubeDrag.y;
  cubeDrag.x=e.clientX; cubeDrag.y=e.clientY; cubeDrag.moved+=Math.abs(dx)+Math.abs(dy);
  const off=camera.position.clone().sub(controls.target);
  const sph=new THREE.Spherical().setFromVector3(off);
  sph.theta-=dx*0.012; sph.phi-=dy*0.012;
  sph.phi=Math.max(0.02, Math.min(Math.PI-0.02, sph.phi));
  off.setFromSpherical(sph); camera.position.copy(controls.target).add(off); camera.lookAt(controls.target);
}
function onCubeUp(e){
  window.removeEventListener('pointermove', onCubeMove, true);
  window.removeEventListener('pointerup', onCubeUp, true);
  controls.enabled=true;
  if(cubeDrag && cubeDrag.moved<5 && pendingFace) applyView(pendingFace);  // 几乎没动=点击切面
  cubeDrag=null; pendingFace=null;
}
