// Electron 主进程: 仅 app 生命周期 + 建窗口 (IPC/路径逻辑已移至 ipc.js / params-store.js)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerParamsIpc } = require('./ipc');
const { registerUpdater } = require('./updater');

function createWindow(){
  const win = new BrowserWindow({
    width:1320, height:840, minWidth:1000, minHeight:640,
    title:'喷头底板配置器', backgroundColor:'#f5f6f8',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, webSecurity:false }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname,'renderer','index.html'));
  return win;
}

app.whenReady().then(()=>{ registerParamsIpc(); const win = createWindow(); registerUpdater(win); });
app.on('activate', ()=>{ if(BrowserWindow.getAllWindows().length===0) createWindow(); });
app.on('window-all-closed', ()=>app.quit());
