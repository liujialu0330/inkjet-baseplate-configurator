// store.js — 状态与数据访问（无 THREE / 无 DOM）
export const GROUPS = [["shared","基本"],["main_body","主体"],["sub_blank","子板毛坯"]];
export const state = { DATA: null, advanced: false };   // 注: 原 REQUIRED 为死变量, 删除
export function setData(d){ state.DATA = d; }
export function allVals(){
  const v={}; for(const [g] of GROUPS) for(const k in state.DATA[g]) v[k]=state.DATA[g][k].value;
  v.sub_W=v.win_W-v.fit_gap_w; v.sub_H=v.win_H-v.fit_gap_h; return v;   // 源: 原 90-91 行 allVals
}
