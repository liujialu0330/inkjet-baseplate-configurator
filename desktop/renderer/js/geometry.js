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

/**
 * 修复 T 形开放边: 若开放边 (a,b) 内部恰好有另一顶点 v 在线段上,
 * 把含 (a,b) 的三角形一分为二, 迭代直至无开放边或无进展(上限 20 轮)。
 * @param {{verts:number[][], tris:number[][]}} mesh  焊接后的网格(原地修改)
 * @returns {{verts:number[][], tris:number[][]}}  同对象(已修改)
 */
export function fixOpenEdges(mesh){
  const EPS=5e-4; // 距离容差(与 toFixed(4) 量化精度匹配)
  const TEPS=1e-6; // 投影端点容差
  for(let round=0;round<20;round++){
    // 统计无向边 → 面数; 记录有向边 → 三角形索引
    const edgeCount=new Map();
    const edgeKey=(a,b)=>a<b?`${a}_${b}`:`${b}_${a}`;
    const edgeFace=new Map(); // 有向边 "a_b" → tri_idx(首个)
    for(let ti=0;ti<mesh.tris.length;ti++){
      const [a,b,c]=mesh.tris[ti];
      for(const [p,q] of [[a,b],[b,c],[c,a]]){
        const k=edgeKey(p,q);
        edgeCount.set(k,(edgeCount.get(k)||0)+1);
        const dk=`${p}_${q}`;
        if(!edgeFace.has(dk)) edgeFace.set(dk,ti);
      }
    }
    // 找所有开放边(被 1 个面引用的无向边)
    const openEdges=[];
    for(const [k,cnt] of edgeCount){
      if(cnt===1){const [sa,sb]=k.split('_');openEdges.push([+sa,+sb]);}
    }
    if(openEdges.length===0)break;
    let progressed=false;
    const modifiedTris=new Set(); // 本轮已被修改的三角形
    for(let [a,b] of openEdges){
      const [ax,ay,az]=mesh.verts[a],[bx,by,bz]=mesh.verts[b];
      const dx=bx-ax,dy=by-ay,dz=bz-az;
      const lenSq=dx*dx+dy*dy+dz*dz;
      if(lenSq<1e-12)continue;
      // 在顶点表中找严格位于线段 (a,b) 内部的顶点
      let found=-1;
      for(let vi=0;vi<mesh.verts.length;vi++){
        if(vi===a||vi===b)continue;
        const [vx,vy,vz]=mesh.verts[vi];
        const t=((vx-ax)*dx+(vy-ay)*dy+(vz-az)*dz)/lenSq;
        if(t<=TEPS||t>=1-TEPS)continue;
        const px=ax+t*dx,py=ay+t*dy,pz=az+t*dz;
        const ex=vx-px,ey=vy-py,ez=vz-pz;
        if(Math.sqrt(ex*ex+ey*ey+ez*ez)<EPS){found=vi;break;}
      }
      if(found<0)continue;
      // 找含有向边 a→b 或 b→a 的三角形(开放边只被1面引用,有向唯一)
      let ti=-1;
      if(edgeFace.has(`${a}_${b}`)) ti=edgeFace.get(`${a}_${b}`);
      else if(edgeFace.has(`${b}_${a}`)) ti=edgeFace.get(`${b}_${a}`);
      if(ti<0||modifiedTris.has(ti))continue;
      const tri=mesh.tris[ti];
      // 找 a→b 方向
      let pa=tri.indexOf(a),pb=-1;
      if(pa>=0&&tri[(pa+1)%3]===b) pb=(pa+1)%3;
      else {pa=tri.indexOf(b); if(pa>=0&&tri[(pa+1)%3]===a){pb=(pa+1)%3;[a,b]=[b,a];pa=tri.indexOf(a);pb=(pa+1)%3;}}
      if(pa<0||pb<0){
        // 重新确认
        let foundDir=false;
        for(let k2=0;k2<3;k2++){
          if(tri[k2]===a&&tri[(k2+1)%3]===b){pa=k2;pb=(k2+1)%3;foundDir=true;break;}
          if(tri[k2]===b&&tri[(k2+1)%3]===a){pa=k2;pb=(k2+1)%3;[a,b]=[b,a];pa=k2;pb=(k2+1)%3;foundDir=true;break;}
        }
        if(!foundDir)continue;
      }
      pa=tri.indexOf(a); if(pa<0||tri[(pa+1)%3]!==b)continue;
      const c=tri[(pa+2)%3];
      if(c===found)continue; // 防止退化
      mesh.tris[ti]=[a,found,c];
      mesh.tris.push([found,b,c]);
      modifiedTris.add(ti);
      progressed=true;
    }
    if(!progressed)break;
  }
  return mesh;
}

/**
 * 提取网格在 z=filterZ 平面的开放边环路。
 * 返回数组，每个元素是该平面上的一个闭合/链状环：
 * [{vi:number, x:number, y:number}, ...]
 */
export function extractOpenLoops(verts, tris, filterZ) {
  const EPS = 1e-6;
  const edgeCount = new Map(), edgeDirMap = new Map();
  const edgeKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;
  for (const [a, b, c] of tris) {
    for (const [p, q] of [[a,b],[b,c],[c,a]]) {
      const k = edgeKey(p, q);
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
      if (!edgeDirMap.has(k)) edgeDirMap.set(k, `${p}_${q}`);
    }
  }
  const fromTo = new Map();
  for (const [k, cnt] of edgeCount) {
    if (cnt !== 1) continue;
    const [sa, sb] = k.split('_');
    const a = +sa, b = +sb;
    if (Math.abs(verts[a][2] - filterZ) > EPS || Math.abs(verts[b][2] - filterZ) > EPS) continue;
    const dk = edgeDirMap.get(k);
    const [da, db] = dk.split('_').map(Number);
    if (!fromTo.has(da)) fromTo.set(da, []);
    fromTo.get(da).push(db);
  }
  const visited = new Set(), loops = [];
  for (const [start] of fromTo) {
    if (visited.has(start)) continue;
    const loop = [start]; visited.add(start); let cur = start;
    for (let i = 0; i < 10000; i++) {
      const nexts = fromTo.get(cur) || [];
      const next = nexts.find(n => !visited.has(n));
      if (next === undefined) break;
      visited.add(next); loop.push(next); cur = next;
    }
    loops.push(loop.map(i => ({ vi: i, x: verts[i][0], y: verts[i][1] })));
  }
  return loops;
}

/** 有符号面积: sa2>0 表示 CW（从上看顺时针）*/
export function signedArea2Pts(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
  }
  return a / 2;
}

/** 重心 */
export function centroidPts(pts) {
  return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
           y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
}

// 主体几何问题: 窗口互相重叠 或 越出板边界 或 必填缺失
export function mainBodyProblems(v){
  const out=[]; const n=Math.round(v.win_count);
  const wr=winCenters(v).map(cx=>rectPts(cx,0,v.win_W,v.win_H,v.region_angle)); const bad=new Set();
  for(let i=0;i+1<n;i++) if(satOverlap(wr[i],wr[i+1])){bad.add(i);bad.add(i+1);}
  for(let i=0;i<n;i++) for(const [x,y] of wr[i]) if(x<-v.plate_W/2||x>v.plate_W/2||y<-v.plate_H/2||y>v.plate_H/2) bad.add(i);
  return {bad, wr};
}
