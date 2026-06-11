// 注册 ipcMain 处理器 (用 params-store), 加错误处理: 损坏 JSON 不再让渲染端崩
const { ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./params-store');
const stepExport = require('./step-export');

function registerParamsIpc(){
  ipcMain.handle('params:load', () => { try{ return store.load(); }catch(e){ return { __error: String(e) }; } });
  ipcMain.handle('params:save', (_e, data) => { try{ return store.save(data); }catch(e){ return false; } });

  // 导出主体 STEP: 选路径 -> 建模+自检 -> 写 .step; CNC 开时同目录加写 _加工说明.txt
  ipcMain.handle('step:export', async (e, payload) => {
    try{
      const { vals, cnc } = payload || {};
      if(!vals) return { ok:false, error:'参数缺失' };
      const win = BrowserWindow.fromWebContents(e.sender);
      const testPath = process.env.STEP_EXPORT_TEST_PATH;   // 测试旁路: 免对话框直接落盘
      const r = testPath ? { filePath: testPath } : await dialog.showSaveDialog(win, {
        title: '导出主体 STEP',
        defaultPath: stepExport.defaultName(vals, cnc),
        filters: [{ name: 'STEP', extensions: ['step','stp'] }],
      });
      if(r.canceled || !r.filePath) return { ok:false, canceled:true };
      const { text } = await stepExport.buildMainBodyStep(vals);
      fs.writeFileSync(r.filePath, text, 'utf-8');
      let notePath = null;
      if(cnc && cnc.enabled){
        notePath = r.filePath.replace(/\.(step|stp)$/i, '') + '_加工说明.txt';
        fs.writeFileSync(notePath, stepExport.buildNote(vals, cnc, path.basename(r.filePath)), 'utf-8');
      }
      return { ok:true, path: r.filePath, notePath };
    }catch(err){ return { ok:false, error: String(err && err.message || err) }; }
  });
}

module.exports = { registerParamsIpc };
