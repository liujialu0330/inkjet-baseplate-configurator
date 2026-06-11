import { GROUPS, state, allVals, cnc, saveCnc, PILOT, THREADS } from './store.js';
import { setMsg, C } from './ui.js';

// CNC 开关行: 高级模式下显示在「角孔径」前, 切换后整表单重建
function cncSwitchRow(){
  const row=document.createElement('div'); row.className='row';
  row.innerHTML=`<label>CNC 加工 <span class="nm">孔径按攻丝底孔</span></label>`;
  const sw=document.createElement('label'); sw.className='switch';
  const inp=document.createElement('input'); inp.type='checkbox'; inp.checked=cnc.enabled;
  const sl=document.createElement('span'); sl.className='slider';
  sw.appendChild(inp); sw.appendChild(sl);
  inp.onchange=()=>{ cnc.enabled=inp.checked; saveCnc(); buildForm(); markStale(); document.dispatchEvent(new CustomEvent('cnc-changed')); };
  row.appendChild(sw); return row;
}
// 螺纹下拉行: CNC 开启时替代 corner_dia / m3_dia 的数值输入
function threadRow(k){
  const which = k==='corner_dia' ? 'cornerThread' : 'shoulderThread';
  const row=document.createElement('div'); row.className='row';
  const lab=document.createElement('label');
  const setLab=()=>{ lab.innerHTML=`${k==='corner_dia'?'角孔螺纹':'台肩孔螺纹'} <span class="nm">底孔 φ${PILOT[cnc[which]]} mm</span>`; };
  setLab();
  const sel=document.createElement('select');
  for(const t of THREADS){ const o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o); }
  sel.value=cnc[which];
  sel.onchange=()=>{ cnc[which]=sel.value; saveCnc(); setLab(); markStale(); };
  row.appendChild(lab); row.appendChild(sel); return row;
}

// buildForm: 源 93-113。改动: 删除 REQUIRED 收集; 读 state.DATA / state.advanced;
//   input.oninput 内更新 state.DATA[g][k].value 后调用本模块 markStale()。末尾 updateDerived(allVals())。
export function buildForm(){
  const root=document.getElementById('form'); root.innerHTML='';
  for(const [g,title] of GROUPS){
    const box=document.createElement('div'); box.className='grp'; box.innerHTML=`<h3>${title}</h3>`;
    let n=0;
    for(const k in state.DATA[g]){
      const p=state.DATA[g][k], isInt=(p.step===1&&p.unit==="");
      if(!state.advanced && !p.required) continue;   // 非高级: 只显示必填(红标)
      if(g==='main_body' && k==='corner_dia'){ box.appendChild(cncSwitchRow()); n++; }
      if(cnc.enabled && g==='main_body' && (k==='corner_dia'||k==='m3_dia')){ box.appendChild(threadRow(k)); n++; continue; }
      const row=document.createElement('div'); row.className='row';
      row.innerHTML=`<label>${p.label||k}${p.required?' <span class="req-star">*</span>':''}${p.unit?` <span class="nm">${p.unit}</span>`:''}</label>`;
      const inp=document.createElement('input');
      inp.type='number'; inp.min=p.min; inp.max=p.max; inp.step=p.step; inp.value=p.value;
      inp.dataset.key=k; inp.dataset.req=p.required?'1':'0';
      inp.oninput=()=>{ let x=parseFloat(inp.value); if(isInt)x=Math.round(x); if(!isNaN(x)) state.DATA[g][k].value=x; markStale(); };
      row.appendChild(inp); box.appendChild(row); n++;
    }
    if(n>0) root.appendChild(box);
  }
  const d=document.createElement('div'); d.className='derived'; d.id='derived'; root.appendChild(d); updateDerived(allVals());
}

// updateDerived: 源 114-117, 形参 v
export function updateDerived(v){ const d=document.getElementById('derived'); if(!d)return;
  d.innerHTML=`派生 · 子板外形 <b>${v.sub_W.toFixed(1)} × ${v.sub_H.toFixed(1)}</b> mm`
    +`<br>齐平 · 子板正面 = 主体正面 = 喷嘴面 · 板厚 ${v.plate_T} mm`
    +`<br>固定孔 · 主体台肩孔 与 子板耳孔 同位同径(必须重合)`; }

// markStale: 源 118。改为 updateDerived(allVals()) + setMsg('已修改，点「预览」更新', C.muted)
export function markStale(){ updateDerived(allVals()); setMsg('已修改，点「预览」更新', C.muted); }

// 返回空必填数量, 并给空必填输入加/去 invalid 类 (源 303-305)
export function markInvalidRequired(){
  const els=[...document.querySelectorAll('#form input[data-req="1"]')];
  els.forEach(el=>el.classList.toggle('invalid', el.value===''));
  return els.filter(el=>el.value==='').length;
}
