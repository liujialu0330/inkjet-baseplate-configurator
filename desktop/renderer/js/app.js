// app.js — 入口编排（取代上帝函数 render）
import * as store from './store.js';
import * as form from './form.js';
import * as viewer from './viewer3d.js';
import { mainBodyProblems } from './geometry.js';
import { validate } from './validation.js';
import { exportMainBody3MF } from './exporter.js';
import { loadParams, saveParams } from './api.js';
import { setMsg, C } from './ui.js';
import { initUpdates } from './updates.js';

function render(){
  const v = store.allVals();
  form.updateDerived(v);
  const { bad, wr } = mainBodyProblems(v);
  viewer.rebuild(v, bad, wr);
  const emptyReqCount = form.markInvalidRequired();
  const res = validate(v, emptyReqCount, bad);
  document.getElementById('save').disabled = res.saveDisabled;
  document.getElementById('export').disabled = res.exportDisabled;
  if(res.problems.length) setMsg('⚠ '+res.problems[0], C.red);
  else setMsg('预览已更新', C.green);
}
async function load(){
  const d = await loadParams();
  if(!d){ setMsg('载入 params.json 失败', C.red); return; }
  store.setData(d); form.buildForm(); viewer.resetFitFlag(); render();
}
document.getElementById('preview').onclick = render;
document.getElementById('reload').onclick = load;
document.getElementById('resetview').onclick = () => viewer.fit();
document.getElementById('export').onclick = () => { const e=document.getElementById('export'); if(!e.disabled) exportMainBody3MF(store.allVals()); };
document.getElementById('save').onclick = async () => { const ok = await saveParams(store.state.DATA); setMsg(ok?'已保存 ✓':'保存失败', ok?C.green:C.red); };
document.getElementById('adv').onchange = e => { store.state.advanced = e.target.checked; form.buildForm(); };  // 与原一致: 仅重建表单

viewer.init3D();
load();
initUpdates();
