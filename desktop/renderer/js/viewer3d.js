import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { outerRect, circHole, shapeBack, shapeFront } from './shapes.js';
import { extrudeEdges } from './geometry.js';
import * as viewcube from './viewcube.js';

/* ---------- 模块状态 ---------- */
let scene, camera, renderer, controls, modelGroup, fitted = false;
let MAT_BACK, MAT_FRONT, MAT_SUBF, EDGE;

/* ---------- 3D ---------- */
export function init3D(){
  const host=document.getElementById('c3d');
  scene=new THREE.Scene(); scene.background=null;
  camera=new THREE.PerspectiveCamera(45,host.clientWidth/host.clientHeight,1,100000); camera.position.set(260,240,320);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(host.clientWidth,host.clientHeight);
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true;
  // 光照
  scene.add(new THREE.HemisphereLight(0xffffff,0xccd3db,1.1));
  const key=new THREE.DirectionalLight(0xffffff,0.62); key.position.set(160,430,230); key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  const sc=key.shadow.camera; sc.near=1; sc.far=3000; sc.left=-700; sc.right=700; sc.top=700; sc.bottom=-700; sc.bias=-0.0005;
  scene.add(key);
  const fill=new THREE.DirectionalLight(0xffffff,0.42); fill.position.set(-240,150,-170); scene.add(fill);
  const fill2=new THREE.DirectionalLight(0xffffff,0.3); fill2.position.set(120,80,-260); scene.add(fill2);
  // 地面落地阴影 + 基准网格 + 原点坐标系(datum)
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000), new THREE.ShadowMaterial({opacity:0.11}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-0.2; ground.receiveShadow=true; scene.add(ground);
  const grid=new THREE.GridHelper(1200,60,0xa9b2bd,0xdce0e6); grid.position.y=-0.2; scene.add(grid);
  const axes=new THREE.AxesHelper(55); axes.material.depthTest=false; axes.renderOrder=999; scene.add(axes);
  MAT_BACK=new THREE.MeshStandardMaterial({color:0xc0c6ce,metalness:0.0,roughness:0.72,side:THREE.DoubleSide});
  MAT_FRONT=new THREE.MeshStandardMaterial({color:0xd0d5db,metalness:0.0,roughness:0.7,side:THREE.DoubleSide});
  MAT_SUBF=new THREE.MeshStandardMaterial({color:0xd6dbe1,metalness:0.0,roughness:0.7,side:THREE.DoubleSide});
  EDGE=new THREE.LineBasicMaterial({color:0x586474,transparent:true,opacity:0.5});
  modelGroup=new THREE.Group(); scene.add(modelGroup);  // 竖立(底板高度沿 Y 向上, 立在网格上)
  viewcube.init(camera,controls,renderer,()=>document.getElementById('c3d'));
  addEventListener('resize',onResize);
  (function loop(){
    requestAnimationFrame(loop); if(!viewcube.isDragging()) controls.update();
    const host=document.getElementById('c3d'), W=host.clientWidth, H=host.clientHeight;
    renderer.setViewport(0,0,W,H); renderer.setScissorTest(false); renderer.render(scene,camera);
    viewcube.renderOverlay();
  })();
}

function part(shape,depth,mat,z,segs){
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:segs||12});
  const m=new THREE.Mesh(g,mat); if(z)m.position.z=z;
  m.castShadow=true; m.receiveShadow=true;
  // 基于源 2D 轮廓自绘边线, 避免 EdgesGeometry 对挤出体盖面三角剖分产生内部伪边
  const ep=shape.extractPoints(segs||12);  // {shape:[Vector2], holes:[[Vector2]]}
  const outline=ep.shape.map(p=>[p.x,p.y]);
  const holes=ep.holes.map(h=>h.map(p=>[p.x,p.y]));
  const pos=extrudeEdges(outline,holes,depth,32);
  const lg=new THREE.BufferGeometry();
  lg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  m.add(new THREE.LineSegments(lg,EDGE)); return m;
}

function onResize(){const h=document.getElementById('c3d');camera.aspect=h.clientWidth/h.clientHeight;camera.updateProjectionMatrix();renderer.setSize(h.clientWidth,h.clientHeight);}
function fitCamera(){const b=new THREE.Box3().setFromObject(modelGroup);if(b.isEmpty())return;
  const c=b.getCenter(new THREE.Vector3()),s=b.getSize(new THREE.Vector3());
  const r=Math.max(s.x,s.y,s.z)*0.62,dist=r/Math.tan(camera.fov*Math.PI/360)*1.5;
  camera.position.copy(c).add(new THREE.Vector3(0.5,0.45,0.8).normalize().multiplyScalar(dist));
  controls.target.copy(c); controls.update();}
function clearGroup(){modelGroup.traverse(o=>{if(o.geometry)o.geometry.dispose();});while(modelGroup.children.length)modelGroup.remove(modelGroup.children[0]);}

export function rebuild(v, bad, wr){
  const gap=Math.max(60,v.sub_W*0.5);  // 子板不旋转, 固定留间距
  clearGroup();
  modelGroup.add(part(shapeBack(v),v.shelf_back_T,MAT_BACK,0,12));
  modelGroup.add(part(shapeFront(v),v.plate_T-v.shelf_back_T,MAT_FRONT,v.shelf_back_T,12));
  bad.forEach(i=>{const ps=wr[i].map(p=>new THREE.Vector3(p[0],p[1],v.plate_T+0.8));ps.push(ps[0]);
    modelGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ps),new THREE.LineBasicMaterial({color:0xe5484d})));});
  // 子板毛坯
  const sub=new THREE.Group();
  const SA=new THREE.Shape(); outerRect(SA,v.sub_W,v.sub_H);
  [1,-1].forEach(s=>SA.holes.push(circHole(0,s*(v.win_H/2-v.m3_inset),v.m3_dia/2)));
  sub.add(part(SA,v.tab_T,MAT_BACK,0,12));
  const SB=new THREE.Shape(); outerRect(SB,v.sub_W,v.sub_H-2*v.tab_H);
  sub.add(part(SB,v.plate_T-v.tab_T,MAT_SUBF,v.tab_T,12));
  sub.position.set(v.plate_W/2+gap+v.sub_W/2, -(v.plate_H-v.sub_H)/2, 0); modelGroup.add(sub);  // 子板不旋转, 底边与主体齐
  modelGroup.position.y = v.plate_H/2;  // 整体立在网格上(底边落 Y=0)
  if(!fitted){fitCamera();fitted=true;}
}

export function fit(){ fitted=false; fitCamera(); fitted=true; }   // 复位视角按钮用
export function resetFitFlag(){ fitted=false; }                    // load 用
