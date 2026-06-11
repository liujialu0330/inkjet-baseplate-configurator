// app.js — 入口编排（取代上帝函数 render）
import * as store from './store.js';
import * as form from './form.js';
import * as viewer from './viewer3d.js';
import { mainBodyProblems } from './geometry.js';
import { validate } from './validation.js';
import { exportMainBody3MF } from './exporter.js';
import { loadParams, saveParams, exportStep } from './api.js';
import { setMsg, C } from './ui.js';
import { initUpdates } from './updates.js';

// 导出按钮互斥规则
// exportBlocked=true 时两按钮均禁；false 时按 CNC 开关分配
let exportBlocked = true;

function applyExportRules(){
  const btnMF  = document.getElementById('export');
  const btnSTP = document.getElementById('exportstep');
  // 3MF：校验通过 且 CNC 关闭时可点
  const mfDisabled  = exportBlocked || store.cnc.enabled;
  // STEP：校验通过 且 CNC 开启时可点
  const stpDisabled = exportBlocked || !store.cnc.enabled;
  btnMF.disabled  = mfDisabled;
  btnSTP.disabled = stpDisabled;
  // 按钮被禁且原因是 CNC 互斥时，给出 title 提示；否则清空
  if(mfDisabled && !exportBlocked){
    btnMF.title  = 'CNC 加工开启时导出 STEP（高级参数里可关闭 CNC）';
  } else {
    btnMF.title  = '';
  }
  if(stpDisabled && !exportBlocked){
    btnSTP.title = '开启高级参数里的「CNC 加工」开关后可用';
  } else {
    btnSTP.title = '';
  }
}

function render(){
  const v = store.allVals();
  form.updateDerived(v);
  const { bad, wr } = mainBodyProblems(v);
  viewer.rebuild(v, bad, wr);
  const emptyReqCount = form.markInvalidRequired();
  const res = validate(v, emptyReqCount, bad);
  document.getElementById('save').disabled = res.saveDisabled;
  exportBlocked = res.exportDisabled;
  applyExportRules();
  if(res.problems.length) setMsg('⚠ '+res.problems[0], C.red);
  else setMsg('预览已更新', C.green);
}
async function load(){
  const d = await loadParams();
  if(!d){ setMsg('载入参数失败', C.red); return; }
  store.setData(d); form.buildForm(); viewer.resetFitFlag(); render();
}
document.getElementById('preview').onclick = render;
document.getElementById('reload').onclick = load;
document.getElementById('resetview').onclick = () => viewer.fit();
document.getElementById('export').onclick = () => { const e=document.getElementById('export'); if(!e.disabled) exportMainBody3MF(store.allVals()); };
document.getElementById('exportstep').onclick = async () => {
  const b=document.getElementById('exportstep'); if(b.disabled) return;
  b.disabled = true;
  setMsg(store.cnc.enabled ? '正在生成 STEP（CNC 攻丝底孔）…' : '正在生成 STEP…', C.muted);
  const r = await exportStep({ vals: store.allVals(), cnc: { ...store.cnc } });
  applyExportRules();
  if(r && r.ok) setMsg(r.notePath ? `已导出 STEP + 加工说明：${r.path}` : `已导出 STEP：${r.path}`, C.green);
  else if(r && r.canceled) setMsg('已取消', C.muted);
  else setMsg('STEP 导出失败：'+(r && r.error || '未知错误'), C.red);
};
document.getElementById('save').onclick = async () => { const ok = await saveParams(store.state.DATA); setMsg(ok?'已保存 ✓':'保存失败', ok?C.green:C.red); };
document.getElementById('adv').onchange = e => { store.state.advanced = e.target.checked; form.buildForm(); };  // 与原一致: 仅重建表单

viewer.init3D();
load();
initUpdates();
// 监听 CNC 开关变更，立即刷新导出按钮互斥状态（不需要重新 preview）
document.addEventListener('cnc-changed', applyExportRules);
