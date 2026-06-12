import * as THREE from 'three';
import { shapeBack, shapeFront } from './shapes.js';
import { fixOpenEdges, extractOpenLoops, signedArea2Pts, centroidPts, winCenters } from './geometry.js';
import { setMsg, C } from './ui.js';

/* ---------- 导出主体 3MF (前端直接生成, 不经 Fusion) ---------- */
// 源: 原 322-329 行 geomTris
function geomTris(geoms){
  const map=new Map(), verts=[], tris=[];
  const key=(x,y,z)=>x.toFixed(4)+','+y.toFixed(4)+','+z.toFixed(4);
  const vid=(x,y,z)=>{const k=key(x,y,z);let i=map.get(k);if(i===undefined){i=verts.length;map.set(k,i);verts.push([x,y,z]);}return i;};
  for(const g of geoms){const p=g.attributes.position.array;
    for(let i=0;i<p.length;i+=9) tris.push([vid(p[i],p[i+1],p[i+2]),vid(p[i+3],p[i+4],p[i+5]),vid(p[i+6],p[i+7],p[i+8])]);}
  return {verts,tris};
}
// 源: 原 330-334 行 build3MF
function build3MF(verts,tris){
  const vx=verts.map(p=>`<vertex x="${p[0].toFixed(4)}" y="${p[1].toFixed(4)}" z="${p[2].toFixed(4)}"/>`).join('');
  const tx=tris.map(t=>`<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${vx}</vertices><triangles>${tx}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
}

/**
 * 台肩三角化: 大窗环(4点,CW)与小窗环(4点,CCW)之间填4个梯形。
 * 梯形公式 [bi1,bi,si1]+[bi,si,si1] 保证每条外部边方向与 gA/gB 开放边配对。
 */
function fillShoulder(outerLoop, smallLoop, tris, verts){
  const B=outerLoop, S=smallLoop, n=B.length;
  const dist2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
  const Sord=[], used=new Set();
  for(let i=0;i<n;i++){
    let best=-1, bestD=Infinity;
    for(let j=0;j<S.length;j++){
      if(used.has(j)) continue;
      const d=dist2(B[i],S[j]);
      if(d<bestD){bestD=d; best=j;}
    }
    Sord.push(best); used.add(best);
  }
  // 三角形有符号面积 × 2(XY 平面)
  const triArea2=(ia,ib,ic)=>{
    const [ax,ay]=verts[ia],[bx,by]=verts[ib],[cx,cy]=verts[ic];
    return Math.abs((bx-ax)*(cy-ay)-(cx-ax)*(by-ay));
  };
  const AREA_EPS=1e-6;
  for(let i=0;i<n;i++){
    const bi=B[i].vi, bi1=B[(i+1)%n].vi;
    const si=S[Sord[i]].vi, si1=S[Sord[(i+1)%n]].vi;
    // 跳过退化三角形(三点共线, 如 region_angle=0 时竖边两侧梯形塌缩为线)
    if(triArea2(bi1,bi,si1)>AREA_EPS) tris.push([bi1,bi,si1]);
    if(triArea2(bi,si,si1)>AREA_EPS) tris.push([bi,si,si1]);
  }
}

/**
 * M3 圆孔盖补面: 对 z=IFZ 处的 M3 圆环用 ShapeUtils.triangulateShape 补盖,
 * 并翻转三角形顺序使法向朝 +z。
 */
function fillM3Cap(m3Loop, tris, _THREE){
  const m3Pts=m3Loop.map(p=>new _THREE.Vector2(p.x,p.y));
  const allVis=m3Loop.map(p=>p.vi);
  try{
    const result=_THREE.ShapeUtils.triangulateShape(m3Pts,[]);
    for(const [a,b,c] of result){
      const va=allVis[a],vb=allVis[b],vc=allVis[c];
      if(va===vb||vb===vc||vc===va) continue;
      tris.push([vc,vb,va]); // 翻转以配对 gA M3 孔开放边方向
    }
  } catch(e){ /* 退化时忽略 */ }
}

/**
 * 构建主体网格: 删 z=shelf_back_T 双盖, 用边界环提取+梯形台肩+M3补盖替代 shoulderGeoms,
 * 再修 T 形开放边。此函数纯几何, 无副作用, 供测试直接调用。
 */
export function buildMainBodyMesh(v, THREE_ref, shapeBack_ref, shapeFront_ref, _unused, fixOpenEdges_ref){
  const _THREE=THREE_ref||THREE;
  const _shapeBack=shapeBack_ref||shapeBack;
  const _shapeFront=shapeFront_ref||shapeFront;
  const _fixOpenEdges=fixOpenEdges_ref||fixOpenEdges;

  const IFZ=v.shelf_back_T;
  const EPS=1e-6;

  const gA=new _THREE.ExtrudeGeometry(_shapeBack(v),{depth:IFZ,bevelEnabled:false,curveSegments:48});
  const gB=new _THREE.ExtrudeGeometry(_shapeFront(v),{depth:v.plate_T-IFZ,bevelEnabled:false,curveSegments:48});
  gB.translate(0,0,IFZ);

  const map=new Map(), verts=[], tris=[];
  const key=(x,y,z)=>x.toFixed(4)+','+y.toFixed(4)+','+z.toFixed(4);
  const vid=(x,y,z)=>{const k=key(x,y,z);let i=map.get(k);if(i===undefined){i=verts.length;map.set(k,i);verts.push([x,y,z]);}return i;};

  // 删 z=IFZ 双盖，其余三角形全部纳入
  const addGeomFiltered=(g,filterZ)=>{
    const flat=g.index ? g.toNonIndexed() : g;
    const p=flat.attributes.position.array;
    for(let i=0;i<p.length;i+=9){
      const z0=p[i+2],z1=p[i+5],z2=p[i+8];
      if(filterZ!==null && Math.abs(z0-filterZ)<EPS && Math.abs(z1-filterZ)<EPS && Math.abs(z2-filterZ)<EPS) continue;
      tris.push([vid(p[i],p[i+1],p[i+2]),vid(p[i+3],p[i+4],p[i+5]),vid(p[i+6],p[i+7],p[i+8])]);
    }
    if(flat!==g) flat.dispose();
  };
  addGeomFiltered(gA, IFZ);
  addGeomFiltered(gB, IFZ);
  gA.dispose(); gB.dispose();

  // 提取 z=IFZ 开放边环，按窗口分组补台肩+M3盖
  const M3_AREA_THRESH=50;
  const loops=extractOpenLoops(verts, tris, IFZ);
  for(const cx of winCenters(v)){
    const nearby=loops.filter(loop=>{
      const c=centroidPts(loop);
      return Math.abs(c.x-cx)<v.win_W/2+v.shelf_H+5 && Math.abs(c.y)<v.win_H/2+v.shelf_H+5;
    });
    const outerLoop=nearby.find(l=>signedArea2Pts(l)>0); // 大窗(CW)
    const smallLoop=nearby.find(l=>signedArea2Pts(l)<0&&Math.abs(signedArea2Pts(l))>M3_AREA_THRESH); // 小窗(CCW)
    const m3Loops=nearby.filter(l=>signedArea2Pts(l)<0&&Math.abs(signedArea2Pts(l))<=M3_AREA_THRESH);
    if(outerLoop&&smallLoop&&outerLoop.length===4&&smallLoop.length===4){
      fillShoulder(outerLoop, smallLoop, tris, verts);
    }
    for(const m3 of m3Loops) fillM3Cap(m3, tris, _THREE);
  }

  // 修复 T 形开放边
  _fixOpenEdges({verts,tris});

  return {verts,tris};
}

/**
 * 自检: 统计无向边直方图, 返回 {ok, hist}
 * ok=true 表示全部边恰好被 2 个面引用
 */
function checkManifold(verts,tris){
  const cnt=new Map();
  const key=(a,b)=>a<b?`${a}_${b}`:`${b}_${a}`;
  for(const [a,b,c] of tris){
    for(const [p,q] of [[a,b],[b,c],[c,a]]){
      const k=key(p,q); cnt.set(k,(cnt.get(k)||0)+1);
    }
  }
  const hist={};
  for(const v of cnt.values()) hist[v]=(hist[v]||0)+1;
  const ok=Object.keys(hist).length===1 && hist[2]>0;
  return {ok,hist};
}

// 源: 原 335-347 行 exportMainBody3MF
export async function exportMainBody3MF(v){
  const {verts,tris}=buildMainBodyMesh(v);

  // 自检
  const {ok,hist}=checkManifold(verts,tris);
  if(!ok){
    const bad=Object.entries(hist).filter(([k])=>+k!==2).map(([k,n])=>`${n}条${k}面边`).join(', ');
    setMsg(`导出主体 3MF（${tris.length} 面）⚠ 流形警告: ${bad}`, C.orange||'#e67e00');
  }

  const model=build3MF(verts,tris);
  const CT=`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const RELS=`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  const zip=new window.JSZip(); zip.file("[Content_Types].xml",CT); zip.folder("_rels").file(".rels",RELS); zip.folder("3D").file("3dmodel.model",model);
  const blob=await zip.generateAsync({type:"blob"});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="主体_main_body.3mf"; a.click(); URL.revokeObjectURL(a.href);
  if(ok) setMsg(`已导出主体 3MF（${tris.length} 面）✓ 流形自检通过`, C.green);
}
