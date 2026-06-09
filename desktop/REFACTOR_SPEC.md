# 喷头底板配置器 — 架构重构规格 (SPEC)

> 本文件是「唯一真相」。所有执行智能体严格按本规格落地，**不得自行更改接口名/路径/职责边界**。
> 行为必须与原始 `_ref/index.original.html` **完全一致**（除明确标注的「可靠性改进」外）。逻辑代码**逐字搬运**，只加 `import`/`export` 与极少量胶水，**不要重写算法**。

## 0. 诊断（重构动机）
- 巨石：`renderer/index.html` 把 CSS + HTML + 6 类职责塞进一个 `<script>`，全局可变状态串联。
- 上帝函数：`render()` 同时做 建几何 / 校验 / 改 DOM / 切按钮 / 写消息。
- 纯逻辑（几何数学、校验）与 THREE/DOM 耦合，无法单测。
- 主进程 IPC 无错误处理：`params.json` 损坏会让渲染端白屏。

## 1. 原则
- **高内聚低耦合**：一个文件一类职责。
- **纯逻辑下沉**：几何数学、校验做成无 THREE / 无 DOM 的纯函数（可单测）。
- **表现/逻辑/数据分离**：CSS 独立文件；数据与派生在 store；DOM 操作集中在 form/ui；3D 在 viewer/viewcube。
- **行为保持**：先把巨石拆干净，不顺手改功能。`webSecurity:false` 维持现状（已知取舍，留待后续以自定义协议加固，本次不动）。

## 2. 目标文件树
```
desktop/
  main.js            (重写: 仅 app 生命周期 + 建窗口, require ./ipc)
  preload.js         (不变)
  params-store.js    (新: 路径解析 + 读写 + 错误处理)
  ipc.js             (新: 注册 ipcMain 处理器, 用 params-store)
  package.json       (改: build.files 增列新文件)
  params.json        (不变)
  renderer/
    index.html       (重写: 仅 markup, link css, script app.js, 保留 importmap + jszip)
    css/styles.css   (新: 抽离原 <style>)
    js/
      store.js       (状态 + 数据访问)
      geometry.js    (纯几何数学, 无 THREE/DOM)
      shapes.js      (THREE 2D 轮廓, 依赖 geometry)
      viewer3d.js    (3D 场景/相机/材质/渲染循环/建模)
      viewcube.js    (右上角视角立方体)
      validation.js  (纯校验, 无 THREE/DOM)
      form.js        (左侧参数表单 DOM)
      exporter.js    (主体 3MF 导出)
      ui.js          (DOM 小工具: setMsg)
      api.js         (window.api 薄封装 + 错误归一)
      app.js         (入口: 编排 + 绑定按钮, 取代上帝函数 render)
    vendor/          (不变: three.module.js / addons / jszip.min.js)
```
> 原始源码逐段对应见 `_ref/index.original.html`（带行号参照）。执行时按下方各文件「源出处」搬运对应函数体。

## 3. 渲染层模块契约（逐字搬运函数体 + 指定 import/export）

### js/store.js  — 状态与数据访问（无 THREE/无 DOM）
```js
export const GROUPS = [["shared","基本"],["main_body","主体"],["sub_blank","子板毛坯"]];
export const state = { DATA: null, advanced: false };   // 注: 原 REQUIRED 为死变量, 删除
export function setData(d){ state.DATA = d; }
export function allVals(){
  const v={}; for(const [g] of GROUPS) for(const k in state.DATA[g]) v[k]=state.DATA[g][k].value;
  v.sub_W=v.win_W-v.fit_gap_w; v.sub_H=v.win_H-v.fit_gap_h; return v;   // 源: 原 90-91 行 allVals
}
```

### js/geometry.js  — 纯几何数学（无 THREE / 无 DOM，可单测）
逐字搬运原 `rectPts`(121-122)、`rot`(123)、`winCenters`(127)、`cornerXY`(128-129)、`satOverlap`(151-156)、`mainBodyProblems`(158-164)。全部 `export function`。`mainBodyProblems` 内部调用 `winCenters/rectPts/satOverlap`（同模块，直接调用）。返回 `{bad:Set, wr:Array}`。
```js
export function rectPts(cx,cy,w,h,deg){ /* 原样 */ }
export function rot(cx,cy,x,y,deg){ /* 原样 */ }
export function winCenters(v){ /* 原样 */ }
export function cornerXY(v){ /* 原样 */ }
export function satOverlap(A,B){ /* 原样 */ }
export function mainBodyProblems(v){ /* 原样, 调用本模块 winCenters/rectPts/satOverlap */ }
```

### js/shapes.js  — THREE 2D 轮廓（依赖 geometry）
```js
import * as THREE from 'three';
import { rectPts, rot, winCenters, cornerXY } from './geometry.js';
export function outerRect(s,W,H){ /* 原 124 */ }
export function circHole(x,y,r){ /* 原 125, 用 THREE.Path */ }
export function polyHole(pts){ /* 原 126, 用 THREE.Path/Vector2 */ }
export function shapeBack(v){ /* 原 131-137, 用 THREE.Shape + outerRect/cornerXY/circHole/winCenters/rectPts→polyHole/rot */ }
export function shapeFront(v){ /* 原 139-144 */ }
```
> 注意：`part()` 不在这里（它依赖材质，归 viewer3d）。本模块只产出 `THREE.Shape/Path`。

### js/validation.js  — 纯校验（无 THREE / 无 DOM）
```js
// 源: 原 render() 内 306-318 校验段, 抽成纯函数
export function validate(v, emptyReqCount, badSet){
  const r=v.m3_dia/2, holeZ=v.win_H/2-v.m3_inset, subTop=v.sub_H/2;
  const shelfOK=(v.m3_inset>=r)&&(v.m3_inset<=v.shelf_H-r);
  const tabOK=(holeZ+r<=subTop)&&(holeZ-r>=subTop-v.tab_H);
  const probs=[];
  if(emptyReqCount>0) probs.push('必填项未填');
  if(badSet.size>0) probs.push('区域重叠或越界（红框）');
  if(!(shelfOK&&tabOK)) probs.push('固定孔超出台肩/耳，主体与子板孔无法重合贯通');
  const mainBad = emptyReqCount>0 || badSet.size>0;
  return { problems:probs, saveDisabled: probs.length>0, exportDisabled: mainBad };
}
```

### js/ui.js  — DOM 小工具
```js
export const C = { muted:'var(--muted)', red:'var(--red)', green:'var(--green)' };
export function setMsg(text, color){ const m=document.getElementById('msg'); if(m){ m.textContent=text; m.style.color=color; } }
```

### js/form.js  — 左侧参数表单（DOM）
```js
import { GROUPS, state, allVals } from './store.js';
import { setMsg, C } from './ui.js';
// buildForm: 源 93-113。改动: 删除 REQUIRED 收集; 读 state.DATA / state.advanced;
//   input.oninput 内更新 state.DATA[g][k].value 后调用本模块 markStale()。末尾 updateDerived(allVals())。
export function buildForm(){ /* ... 用 state.DATA, state.advanced ... */ }
// updateDerived: 源 114-117, 形参 v
export function updateDerived(v){ /* ... */ }
// markStale: 源 118。改为 updateDerived(allVals()) + setMsg('已修改，点「预览」更新', C.muted)
export function markStale(){ updateDerived(allVals()); setMsg('已修改，点「预览」更新', C.muted); }
// 返回空必填数量, 并给空必填输入加/去 invalid 类 (源 303-305)
export function markInvalidRequired(){
  const els=[...document.querySelectorAll('#form input[data-req="1"]')];
  els.forEach(el=>el.classList.toggle('invalid', el.value===''));
  return els.filter(el=>el.value==='').length;
}
```

### js/viewcube.js  — 视角立方体（依赖 THREE）
```js
import * as THREE from 'three';
// 模块内状态: cubeScene,cubeCam,viewCube,raycaster,cubeDrag=null,pendingFace=null, 及 init 存入的 camera/controls/renderer/hostGetter
// init: 存引用 + 建 cube(原 buildViewCube 218-226) + renderer.domElement.addEventListener('pointerdown', onCubeDown, true)(原 195)
export function init(camera, controls, renderer, hostGetter){ /* ... */ }
// renderOverlay: 源 201-205 那段右上角 scissor 绘制(用存的 renderer/camera/controls/host)
export function renderOverlay(){ /* ... */ }
export function isDragging(){ return cubeDrag != null; }
// 内部(非导出): faceTex(210-217), applyView(227-233), inCubeRegion(234-240),
//   pickCubeFace(241-245), onCubeDown(246-255), onCubeMove(256-265), onCubeUp(266-272)
//   —— 这些函数用存入的 camera/controls/renderer/hostGetter 替代原全局。
```
> 关键: 原 `onCubeDown/Move/Up`、`applyView` 直接改 `camera`/`controls`，改为操作 init 存入的引用。`inCubeRegion`/`renderOverlay` 用 `hostGetter()` 取 `#c3d`。

### js/viewer3d.js  — 3D 场景/材质/循环/建模（依赖 THREE, OrbitControls, shapes, viewcube）
```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { outerRect, circHole, shapeBack, shapeFront } from './shapes.js';
import * as viewcube from './viewcube.js';
// 模块状态: scene,camera,renderer,controls,modelGroup,fitted=false, MAT_BACK,MAT_FRONT,MAT_SUBF,EDGE
// init3D: 源 167-207, 但: 删除原 buildViewCube()调用与 domElement pointerdown 绑定 →改成 viewcube.init(camera,controls,renderer,()=>document.getElementById('c3d'));
//   渲染循环改为: if(!viewcube.isDragging()) controls.update(); 主场景渲染后调用 viewcube.renderOverlay();
export function init3D(){ /* ... */ }
// part: 源 145-150 (用 MAT_*/EDGE)。内部函数。
// rebuild: 取代原 render() 的「建模」部分 (281-300)。签名 rebuild(v, bad, wr):
//   clearGroup; 加 back/front part; 红框(289-290); 子板毛坯(292-298); modelGroup.position.y=v.plate_H/2; if(!fitted){fitCamera();fitted=true;}
export function rebuild(v, bad, wr){ /* ... */ }
// fitCamera 源 274-278; clearGroup 源 279; onResize 源 273 (内部)
export function fit(){ fitted=false; fitCamera(); fitted=true; }   // 复位视角按钮用 (源 352)
export function resetFitFlag(){ fitted=false; }                    // load 用 (源 349)
```
> 注意：原 `render()` 同时干「建模+校验+DOM」。本模块**只负责建模**（rebuild）。校验/DOM 移交 app.js 编排。`gap` 计算(284)、子板/红框逻辑随 rebuild 搬运。

### js/exporter.js  — 主体 3MF 导出
```js
import * as THREE from 'three';
import { shapeBack, shapeFront } from './shapes.js';
import { setMsg, C } from './ui.js';
// geomTris 源 322-329, build3MF 源 330-334 (内部, 非导出)
// exportMainBody3MF 源 335-347, 改成形参 v (不再内部 allVals); JSZip 用全局 window.JSZip
export async function exportMainBody3MF(v){ /* ...用 setMsg(...,C.green) 报告... */ }
```

### js/api.js  — window.api 薄封装 + 错误归一（可靠性改进）
```js
export async function loadParams(){
  try{ const d = await window.api.loadParams();
    if(!d || d.__error){ console.error('载入参数失败', d && d.__error); return null; }
    return d;
  }catch(e){ console.error(e); return null; }
}
export async function saveParams(d){ try{ return await window.api.saveParams(d); }catch(e){ return false; } }
```

### js/app.js  — 入口编排（取代上帝函数 render）
```js
import * as store from './store.js';
import * as form from './form.js';
import * as viewer from './viewer3d.js';
import { mainBodyProblems } from './geometry.js';
import { validate } from './validation.js';
import { exportMainBody3MF } from './exporter.js';
import { loadParams, saveParams } from './api.js';
import { setMsg, C } from './ui.js';

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
```
> 行为对照：原 adv 切换只 `buildForm()`（不重渲 3D），保持。原 load 设 `fitted=false` 后 render → rebuild 内首次 fit。

## 4. index.html（仅 markup）
- 保留 `<!DOCTYPE html>`、`<html lang="zh-CN">`、`<meta charset>`、`<title>`。
- `<head>` 内：`<link rel="stylesheet" href="./css/styles.css">`；保留原 importmap `<script type="importmap">`（路径不变 `./vendor/...`）；保留 `<script src="./vendor/jszip.min.js"></script>`。
- `<body>`：保留原 `header` / `#wrap` / `#form` / `#view` / `#c3d` / `#bar` 全部 markup（原 60-79 行，逐字）。
- 末尾：`<script type="module" src="./js/app.js"></script>`（取代原内联脚本）。
- **不得**在 index.html 残留任何内联 `<style>` 或业务 `<script>`。

## 5. css/styles.css
- 把原 `<style>`(6-50 行) 内容**逐字**抽出，去掉 `<style>` 标签。其余不变。

## 6. 主进程（后端）
### params-store.js
```js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
function paramsPath(){
  if (!app.isPackaged) return path.join(__dirname, '..', 'params.json');  // 开发: 技能根 params.json(与 generator.py 同源)
  const up = path.join(app.getPath('userData'), 'params.json');           // 已打包: 各自 userData(首次从内置默认复制)
  try{ if(!fs.existsSync(up)) fs.copyFileSync(path.join(__dirname,'params.json'), up); }catch(e){}
  return up;
}
function load(){ return JSON.parse(fs.readFileSync(paramsPath(),'utf-8')); }
function save(data){ fs.writeFileSync(paramsPath(), JSON.stringify(data,null,2),'utf-8'); return true; }
module.exports = { paramsPath, load, save };
```
### ipc.js（错误处理改进：损坏 JSON 不再让渲染端崩）
```js
const { ipcMain } = require('electron');
const store = require('./params-store');
function registerParamsIpc(){
  ipcMain.handle('params:load', () => { try{ return store.load(); }catch(e){ return { __error: String(e) }; } });
  ipcMain.handle('params:save', (_e, data) => { try{ return store.save(data); }catch(e){ return false; } });
}
module.exports = { registerParamsIpc };
```
### main.js（仅生命周期 + 窗口）
```js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerParamsIpc } = require('./ipc');
function createWindow(){
  const win = new BrowserWindow({
    width:1320, height:840, minWidth:1000, minHeight:640,
    title:'喷头底板配置器', backgroundColor:'#f5f6f8',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, webSecurity:false }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname,'renderer','index.html'));
}
app.whenReady().then(()=>{ registerParamsIpc(); createWindow(); });
app.on('activate', ()=>{ if(BrowserWindow.getAllWindows().length===0) createWindow(); });
app.on('window-all-closed', ()=>app.quit());
```
### preload.js — 不变。
### package.json — `build.files` 改为：
```json
"files": ["main.js","preload.js","params-store.js","ipc.js","params.json","renderer/**/*"]
```
其余字段不变。

## 7. 验收清单（核对智能体逐条检查）
1. index.html 无内联 `<style>` / 业务 `<script>`；引用 `./css/styles.css` 与 `./js/app.js`；importmap + jszip 保留。
2. 每个 `import { X } from './Y.js'` 的 X 都在 Y.js 里 `export`，无缺失/拼写漂移。
3. geometry.js / validation.js 不含 `THREE`、`document`、`window`（纯函数）。
4. shapes.js 不含材质（MAT_*/EDGE）与 mesh；只产出 Shape/Path。
5. viewer3d.js 只建模（rebuild），不含校验/按钮/消息 DOM 逻辑。
6. app.js 的 render 流程 = allVals→updateDerived→mainBodyProblems→viewer.rebuild→markInvalidRequired→validate→切按钮→setMsg。
7. 主进程 main.js 不含 IPC/路径逻辑（已移至 ipc.js/params-store.js）；package.json files 已含 4 个 js。
8. 行为对照原始：adv 仅重建表单；load 首帧 fit；resetview 重 fit；save 用 state.DATA；export 用 allVals()。
