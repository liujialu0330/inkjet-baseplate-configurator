import * as THREE from 'three';
import { shapeBack, shapeFront } from './shapes.js';
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
// 源: 原 335-347 行 exportMainBody3MF (改为形参 v, JSZip 用 window.JSZip, 报告用 setMsg)
export async function exportMainBody3MF(v){
  const gA=new THREE.ExtrudeGeometry(shapeBack(v),{depth:v.shelf_back_T,bevelEnabled:false,curveSegments:48});
  const gB=new THREE.ExtrudeGeometry(shapeFront(v),{depth:v.plate_T-v.shelf_back_T,bevelEnabled:false,curveSegments:48}); gB.translate(0,0,v.shelf_back_T);
  const {verts,tris}=geomTris([gA,gB]); gA.dispose(); gB.dispose();
  const model=build3MF(verts,tris);
  const CT=`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const RELS=`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  const zip=new window.JSZip(); zip.file("[Content_Types].xml",CT); zip.folder("_rels").file(".rels",RELS); zip.folder("3D").file("3dmodel.model",model);
  const blob=await zip.generateAsync({type:"blob"});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download="主体_main_body.3mf"; a.click(); URL.revokeObjectURL(a.href);
  setMsg(`已导出主体 3MF（${tris.length} 面）`, C.green);
}
