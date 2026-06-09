// 把安全的本地 API 暴露给前端 (替代浏览器版的 fetch('/params'))
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  loadParams: () => ipcRenderer.invoke('params:load'),
  saveParams: (data) => ipcRenderer.invoke('params:save', data),
  // 版本号 / 自动更新
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
});
