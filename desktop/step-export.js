// 主体 STEP 导出 — 内置 OpenCascade(WASM) 几何内核, 离线生成精确 B-rep, 不依赖 Fusion
// 几何与 generator.py「主体」段同构: 板 -> 切窗 -> 接台肩 -> 打孔; 单位 mm
// CNC 语义不在本模块: 渲染端 allVals() 已把孔径换算成生效值(攻丝底孔)再传进来
const path = require('path');
const { pathToFileURL } = require('url');

let ocPromise = null;   // 内核约 48MB, 首次初始化 ~3s, 缓存复用
function getOC(){
  if(!ocPromise){
    const entry = require.resolve('opencascade.js/dist/node.js');
    ocPromise = import(pathToFileURL(entry).href).then(m => m.default());
  }
  return ocPromise;
}

function fmt(x){ return String(Math.round(x*100)/100); }

// 默认文件名: CNC 开 -> 主体CNC_攻M4x4_攻M3x8_335x180x10.step; 关 -> 主体_335x180x10.step
function defaultName(v, cnc){
  const size = `${fmt(v.plate_W)}x${fmt(v.plate_H)}x${fmt(v.plate_T)}`;
  if(cnc && cnc.enabled){
    const n2 = 2*Math.round(v.win_count);
    return `主体CNC_攻${cnc.cornerThread}x4_攻${cnc.shoulderThread}x${n2}_${size}.step`;
  }
  return `主体_${size}.step`;
}

// 加工说明(仅 CNC): 只写主体, 底孔直径直接取生效值
function buildNote(v, cnc, stepName){
  const n = Math.round(v.win_count);
  return [
    '喷头底板主体 CNC 加工说明',
    '========================',
    '',
    `配套模型：${stepName}`,
    `外形：${fmt(v.plate_W)} x ${fmt(v.plate_H)} x ${fmt(v.plate_T)} mm，几何按模型加工。`,
    '',
    '攻丝（模型中已留攻丝底孔）：',
    `1. 四角 4 个 φ${fmt(v.corner_dia)} 孔：攻 ${cnc.cornerThread} 螺纹，通孔（板厚 ${fmt(v.plate_T)} mm）。`,
    `2. 窗口台肩 ${2*n} 个 φ${fmt(v.m3_dia)} 孔（每窗口上下各 1）：攻 ${cnc.shoulderThread} 螺纹，通孔（攻丝壁厚 ${fmt(v.shelf_back_T)} mm）。`,
    '',
    '其余孔与窗口均按模型尺寸加工，不攻丝。',
    '',
  ].join('\r\n');
}

// 解析几何体积(自检用): 板 - 窗 + 台肩 - 角孔 - 台肩孔
function expectedVolume(v){
  const n = Math.round(v.win_count), r4 = v.corner_dia/2, r3 = v.m3_dia/2;
  return v.plate_W*v.plate_H*v.plate_T
    - n*v.win_W*v.win_H*v.plate_T
    + 2*n*v.win_W*v.shelf_H*v.shelf_back_T
    - 4*Math.PI*r4*r4*v.plate_T
    - 2*n*Math.PI*r3*r3*v.shelf_back_T;
}

async function buildMainBodyStep(v){
  const oc = await getOC();
  const P = (x,y,z)=>new oc.gp_Pnt_3(x,y,z);
  const dirZ = ()=>new oc.gp_Dir_4(0,0,1);
  const PR = ()=>new oc.Message_ProgressRange_1();
  const box = (x,y,z,dx,dy,dz)=>new oc.BRepPrimAPI_MakeBox_3(P(x,y,z),dx,dy,dz).Shape();
  const cyl = (x,y,r)=>new oc.BRepPrimAPI_MakeCylinder_3(new oc.gp_Ax2_3(P(x,y,-1),dirZ()),r,v.plate_T+2).Shape();
  const cut = (a,b)=>new oc.BRepAlgoAPI_Cut_3(a,b,PR()).Shape();
  const fuse = (a,b)=>new oc.BRepAlgoAPI_Fuse_3(a,b,PR()).Shape();
  const comp = (arr)=>{ const c=new oc.TopoDS_Compound(), b=new oc.BRep_Builder();
    b.MakeCompound(c); for(const s of arr) b.Add(c,s); return c; };
  const ang = (v.region_angle||0)*Math.PI/180;
  const rotZ = (s,cx,cy)=>{ if(!ang) return s;
    const t=new oc.gp_Trsf_1(); t.SetRotation_1(new oc.gp_Ax1_2(P(cx,cy,0),dirZ()),ang);
    return new oc.BRepBuilderAPI_Transform_2(s,t,false).Shape(); };
  const off = (cx,cy,dx,dy)=>!ang ? [cx+dx,cy+dy]
    : [cx+dx*Math.cos(ang)-dy*Math.sin(ang), cy+dx*Math.sin(ang)+dy*Math.cos(ang)];

  const W=v.plate_W, H=v.plate_H, T=v.plate_T, ww=v.win_W, wh=v.win_H;
  const n=Math.round(v.win_count), shH=v.shelf_H, shT=v.shelf_back_T;
  const r4=v.corner_dia/2, r3=v.m3_dia/2;
  const centers=[...Array(n)].map((_,i)=>(i-(n-1)/2)*v.win_pitch);
  const ccx=W/2-v.corner_inset_x, ccy=H/2-v.corner_inset_z;

  // 板 -> 切窗(贯通) -> 接台肩(自背面 z0..shT) -> 打孔(全部贯通圆柱)
  let solid = box(-W/2,-H/2,0,W,H,T);
  solid = cut(solid, comp(centers.map(c0=>rotZ(box(c0-ww/2,-wh/2,-1,ww,wh,T+2),c0,0))));
  const shelves=[];
  for(const c0 of centers) for(const s of [1,-1])
    shelves.push(rotZ(box(c0-ww/2, s===1 ? wh/2-shH : -wh/2, 0, ww, shH, shT), c0, 0));
  solid = fuse(solid, comp(shelves));
  const holes=[];
  for(const sx of [ccx,-ccx]) for(const sy of [ccy,-ccy]) holes.push(cyl(sx,sy,r4));
  for(const c0 of centers) for(const s of [1,-1]){
    const [hx,hy]=off(c0,0,0,s*(wh/2-v.m3_inset)); holes.push(cyl(hx,hy,r3));
  }
  solid = cut(solid, comp(holes));
  try{   // 合并布尔并留下的共面拼缝; 失败不阻断
    const u=new oc.ShapeUpgrade_UnifySameDomain_2(solid,true,true,false);
    u.Build(); solid=u.Shape();
  }catch(e){}

  // 自检 1/2: 有效性 + 体积(偏差 >0.5% 拒绝)
  if(!new oc.BRepCheck_Analyzer(solid,true,false).IsValid_2())
    throw new Error('几何有效性检查未通过, 已取消导出');
  const props=new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(solid,props,false,false,false);
  const vol=props.Mass(), exp=expectedVolume(v);
  if(Math.abs(vol-exp)/exp > 0.005)
    throw new Error(`体积自检失败(实测 ${vol.toFixed(1)} / 期望 ${exp.toFixed(1)} mm³), 已取消导出`);

  // 写出 AP214 并读回
  const w=new oc.STEPControl_Writer_1();
  w.Transfer(solid, oc.STEPControl_StepModelType.STEPControl_AsIs, true, PR());
  w.Write('/out.step');
  let text;
  try{ text = oc.FS.readFile('/out.step',{encoding:'utf8'}); oc.FS.unlink('/out.step'); }
  catch(e){ throw new Error('STEP 写出失败: '+(e && e.message || e)); }
  if(!text || !text.startsWith('ISO-10303-21'))
    throw new Error('STEP 内容异常, 已取消导出');

  // 自检 3: 读回断言圆柱面半径与生效孔径一致
  const radii=new Set();
  for(const m of text.matchAll(/CYLINDRICAL_SURFACE\s*\(\s*'[^']*'\s*,\s*#\d+\s*,\s*([0-9.Ee+-]+)\s*\)/g))
    radii.add(Math.round(parseFloat(m[1])*1e4)/1e4);
  const want=new Set([Math.round(r4*1e4)/1e4, Math.round(r3*1e4)/1e4]);
  const same = radii.size===want.size && [...want].every(r=>radii.has(r));
  if(!same)
    throw new Error(`孔径核对失败(STEP 内 ${[...radii].join('/')} vs 应为 ${[...want].join('/')}), 已取消导出`);

  return { text, volume: vol };
}

module.exports = { buildMainBodyStep, defaultName, buildNote };
