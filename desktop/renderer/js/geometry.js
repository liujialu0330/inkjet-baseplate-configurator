/* ---------- 几何工具 ---------- */
/* 纯几何数学, 无 THREE / 无 DOM, 可单测 */

export function rectPts(cx,cy,w,h,deg){const a=deg*Math.PI/180,hw=w/2,hh=h/2;
  return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y])=>[cx+x*Math.cos(a)-y*Math.sin(a),cy+x*Math.sin(a)+y*Math.cos(a)]);}
export function rot(cx,cy,x,y,deg){const a=deg*Math.PI/180;return [cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)];}
export function winCenters(v){const n=Math.round(v.win_count),a=[];for(let i=0;i<n;i++)a.push((i-(n-1)/2)*v.win_pitch);return a;}
export function cornerXY(v){const out=[];for(const x of [-(v.plate_W/2-v.corner_inset_x),v.plate_W/2-v.corner_inset_x])
  for(const y of [-(v.plate_H/2-v.corner_inset_z),v.plate_H/2-v.corner_inset_z]) out.push([x,y]); return out;}
export function satOverlap(A,B){for(const poly of [A,B])for(let i=0;i<poly.length;i++){
  const j=(i+1)%poly.length,nx=-(poly[j][1]-poly[i][1]),ny=(poly[j][0]-poly[i][0]);
  let mnA=1e9,mxA=-1e9,mnB=1e9,mxB=-1e9;
  for(const p of A){const d=p[0]*nx+p[1]*ny;mnA=Math.min(mnA,d);mxA=Math.max(mxA,d);}
  for(const p of B){const d=p[0]*nx+p[1]*ny;mnB=Math.min(mnB,d);mxB=Math.max(mxB,d);}
  if(mxA<mnB||mxB<mnA)return false;} return true;}
// 主体几何问题: 窗口互相重叠 或 越出板边界 或 必填缺失
export function mainBodyProblems(v){
  const out=[]; const n=Math.round(v.win_count);
  const wr=winCenters(v).map(cx=>rectPts(cx,0,v.win_W,v.win_H,v.region_angle)); const bad=new Set();
  for(let i=0;i+1<n;i++) if(satOverlap(wr[i],wr[i+1])){bad.add(i);bad.add(i+1);}
  for(let i=0;i<n;i++) for(const [x,y] of wr[i]) if(x<-v.plate_W/2||x>v.plate_W/2||y<-v.plate_H/2||y>v.plate_H/2) bad.add(i);
  return {bad, wr};
}
