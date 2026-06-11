// store.js — 状态与数据访问（无 THREE / 无 DOM）
export const GROUPS = [["shared","基本"],["main_body","主体"],["sub_blank","子板毛坯"]];
export const state = { DATA: null, advanced: false };   // 注: 原 REQUIRED 为死变量, 删除

// ---- CNC 加工模式: 螺纹 -> 攻丝底孔直径(普通粗牙) ----
// 仅桌面本地记忆(localStorage), 不写参数文件, Fusion 端 generator.py 无感
export const PILOT = { "M2.5": 2.05, "M3": 2.5, "M4": 3.3, "M5": 4.2, "M6": 5.0 };
export const THREADS = Object.keys(PILOT);
const CNC_KEY = "cncMode";
function loadCnc(){
  try{
    const c = JSON.parse(localStorage.getItem(CNC_KEY));
    if(c && typeof c.enabled === "boolean" && PILOT[c.cornerThread] && PILOT[c.shoulderThread]) return c;
  }catch(e){}
  return { enabled: false, cornerThread: "M4", shoulderThread: "M3" };
}
export const cnc = loadCnc();
export function saveCnc(){ try{ localStorage.setItem(CNC_KEY, JSON.stringify(cnc)); }catch(e){} }

export function setData(d){ state.DATA = d; }
export function allVals(){
  const v={}; for(const [g] of GROUPS) for(const k in state.DATA[g]) v[k]=state.DATA[g][k].value;
  if(cnc.enabled){ v.corner_dia = PILOT[cnc.cornerThread]; v.m3_dia = PILOT[cnc.shoulderThread]; }   // CNC 开: 底孔直径生效
  v.sub_W=v.win_W-v.fit_gap_w; v.sub_H=v.win_H-v.fit_gap_h; return v;   // 源: 原 90-91 行 allVals
}
