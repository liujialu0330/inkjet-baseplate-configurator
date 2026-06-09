// api.js — window.api 薄封装 + 错误归一（可靠性改进）
export async function loadParams(){
  try{ const d = await window.api.loadParams();
    if(!d || d.__error){ console.error('载入参数失败', d && d.__error); return null; }
    return d;
  }catch(e){ console.error(e); return null; }
}
export async function saveParams(d){ try{ return await window.api.saveParams(d); }catch(e){ return false; } }

// 版本号 / 自动更新
export async function getVersion(){ try{ return await window.api.getVersion(); }catch(e){ return ''; } }
export async function checkUpdate(){ try{ return await window.api.checkUpdate(); }catch(e){ return { ok:false, reason:String(e) }; } }
export function onUpdateStatus(cb){ if(window.api && window.api.onUpdateStatus) window.api.onUpdateStatus(cb); }
