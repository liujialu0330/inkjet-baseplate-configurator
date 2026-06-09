// 注册 ipcMain 处理器 (用 params-store), 加错误处理: 损坏 JSON 不再让渲染端崩
const { ipcMain } = require('electron');
const store = require('./params-store');

function registerParamsIpc(){
  ipcMain.handle('params:load', () => { try{ return store.load(); }catch(e){ return { __error: String(e) }; } });
  ipcMain.handle('params:save', (_e, data) => { try{ return store.save(data); }catch(e){ return false; } });
}

module.exports = { registerParamsIpc };
