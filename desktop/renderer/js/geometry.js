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
/**
 * 基于源 2D 轮廓生成挤出体边线坐标(避免 EdgesGeometry 盖面伪边)
 * @param {number[][]} outline  外轮廓点数组 [[x,y],...]
 * @param {number[][][]} holes  各孔点数组 [[[x,y],...],...]
 * @param {number} depth        挤出厚度(z 从 0 到 depth)
 * @param {number} [thresholdDeg=32]  竖棱角度阈值(两段夹角 > 阈值才画)
 * @returns {number[]}  平铺的 LineSegments position,每 6 个数为一条线段
 */
export function extrudeEdges(outline, holes, depth, thresholdDeg = 32) {
  const thresh = thresholdDeg * Math.PI / 180;
  const segs = [];

  for (const rawLoop of [outline, ...holes]) {
    // 去掉末尾与首点重合的重复点
    const loop = [];
    for (const pt of rawLoop) {
      if (loop.length === 0) { loop.push(pt); continue; }
      if (Math.abs(pt[0] - loop[0][0]) < 1e-6 && Math.abs(pt[1] - loop[0][1]) < 1e-6 && loop.length > 1) continue;
      loop.push(pt);
    }
    // 再次去掉尾点与首点重合
    while (loop.length > 1) {
      const last = loop[loop.length - 1];
      if (Math.abs(last[0] - loop[0][0]) < 1e-6 && Math.abs(last[1] - loop[0][1]) < 1e-6) {
        loop.pop();
      } else break;
    }
    const n = loop.length;
    if (n < 2) continue;

    for (let i = 0; i < n; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % n];

      // 前后两面各画一条轮廓边
      segs.push(a[0], a[1], 0,       b[0], b[1], 0);
      segs.push(a[0], a[1], depth,    b[0], b[1], depth);

      // 竖棱: 当前顶点 a 的入边与出边夹角 > 阈值时才画
      const prev = loop[(i - 1 + n) % n];
      // 入边向量 (prev->a), 出边向量 (a->b)
      const ex = a[0] - prev[0], ey = a[1] - prev[1];
      const fx = b[0] - a[0],   fy = b[1] - a[1];
      const lenE = Math.sqrt(ex * ex + ey * ey);
      const lenF = Math.sqrt(fx * fx + fy * fy);
      if (lenE < 1e-9 || lenF < 1e-9) continue;  // 零长向量跳过
      // 夹角为两向量之间角度(使用点积)
      const dot = (ex * fx + ey * fy) / (lenE * lenF);
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const angle = Math.acos(clampedDot);  // 0..PI, 共线≈0, 直角≈PI/2
      if (angle > thresh) {
        segs.push(a[0], a[1], 0,  a[0], a[1], depth);
      }
    }
  }

  return segs;
}

// 主体几何问题: 窗口互相重叠 或 越出板边界 或 必填缺失
export function mainBodyProblems(v){
  const out=[]; const n=Math.round(v.win_count);
  const wr=winCenters(v).map(cx=>rectPts(cx,0,v.win_W,v.win_H,v.region_angle)); const bad=new Set();
  for(let i=0;i+1<n;i++) if(satOverlap(wr[i],wr[i+1])){bad.add(i);bad.add(i+1);}
  for(let i=0;i<n;i++) for(const [x,y] of wr[i]) if(x<-v.plate_W/2||x>v.plate_W/2||y<-v.plate_H/2||y>v.plate_H/2) bad.add(i);
  return {bad, wr};
}
