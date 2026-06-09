// updates.js — 前端: 显示版本号 + "检查更新"按钮 + 更新状态提示
import { getVersion, checkUpdate, onUpdateStatus } from './api.js';
import { setMsg, C } from './ui.js';

function statusToMsg(s){
  switch(s.state){
    case 'checking':    return ['正在检查更新…', C.muted];
    case 'none':        return ['已是最新版本', C.green];
    case 'available':   return [`发现新版本 ${s.version || ''}`, C.green];
    case 'downloading': return [`下载更新中 ${s.percent != null ? s.percent + '%' : ''}`, C.muted];
    case 'downloaded':  return [`新版本 ${s.version || ''} 已下载，待重启安装`, C.green];
    case 'error':       return ['更新检查失败：' + (s.message || ''), C.red];
    default:            return null;
  }
}

export async function initUpdates(){
  // 版本号 → 标题栏徽标
  try{ const v = await getVersion(); const el = document.getElementById('ver'); if(el) el.textContent = v ? ('v' + v) : ''; }catch(e){}
  // 主进程推送的更新状态 → 消息区
  onUpdateStatus(s => { const t = statusToMsg(s); if(t) setMsg(t[0], t[1]); });
  // 手动检查
  const btn = document.getElementById('checkupd');
  if(btn) btn.onclick = async () => {
    setMsg('正在检查更新…', C.muted);
    const r = await checkUpdate();
    if(!r || !r.ok){
      if(r && r.reason === 'unconfigured') setMsg('更新源未配置（当前为占位地址）', C.muted);
      else if(r && r.reason === 'dev')     setMsg('开发模式不检查更新（打包后生效）', C.muted);
      // 其余错误由 onUpdateStatus 的 error 分支展示
    }
  };
}
