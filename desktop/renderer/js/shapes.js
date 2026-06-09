import * as THREE from 'three';
import { rectPts, rot, winCenters, cornerXY } from './geometry.js';

export function outerRect(s,W,H){s.moveTo(-W/2,-H/2);s.lineTo(W/2,-H/2);s.lineTo(W/2,H/2);s.lineTo(-W/2,H/2);s.lineTo(-W/2,-H/2);}
export function circHole(x,y,r){const p=new THREE.Path();p.absarc(x,y,r,0,Math.PI*2,true);return p;}
export function polyHole(pts){const p=new THREE.Path();p.setFromPoints(pts.map(q=>new THREE.Vector2(q[0],q[1])));p.closePath();return p;}
// 主体背层截面(台肩+M3孔, 窗口中段挖空)
export function shapeBack(v){
  const A=new THREE.Shape(); outerRect(A,v.plate_W,v.plate_H);
  cornerXY(v).forEach(([x,y])=>A.holes.push(circHole(x,y,v.corner_dia/2)));
  winCenters(v).forEach(cx=>{ A.holes.push(polyHole(rectPts(cx,0,v.win_W,v.win_H-2*v.shelf_H,v.region_angle)));
    [1,-1].forEach(s=>{const [hx,hy]=rot(cx,0,cx,s*(v.win_H/2-v.m3_inset),v.region_angle);A.holes.push(circHole(hx,hy,v.m3_dia/2));}); });
  return A;
}
// 主体前层截面(全窗口贯穿)
export function shapeFront(v){
  const B=new THREE.Shape(); outerRect(B,v.plate_W,v.plate_H);
  cornerXY(v).forEach(([x,y])=>B.holes.push(circHole(x,y,v.corner_dia/2)));
  winCenters(v).forEach(cx=>B.holes.push(polyHole(rectPts(cx,0,v.win_W,v.win_H,v.region_angle))));
  return B;
}
