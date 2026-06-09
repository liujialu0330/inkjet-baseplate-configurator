// updater.js — 自动更新 (electron-updater) + 手动检查 + 版本号
//
// 更新源 = GitHub Releases (owner/repo 见 package.json -> build.publish)。
// electron-updater 打包后自动读取生成的 app-update.yml, 无需在此 setFeedURL。
// 每次发版:
//   1) 调大 package.json 的 version;
//   2) 运行 build-installer.ps1 打包;
//   3) gh release create v<版本> dist/*Setup*.exe dist/*.blockmap dist/latest.yml
//      (或 electron-builder --publish always)。旧用户启动后/点"检查更新"即收到提示一键更新。
const { autoUpdater } = require('electron-updater');
const { dialog, ipcMain, app } = require('electron');

const CONFIGURED = true;   // 已接 GitHub Releases

let win = null;
function send(payload){ if (win && !win.isDestroyed()) win.webContents.send('update:status', payload); }

function wireEvents(){
  autoUpdater.autoDownload = false;          // 先弹窗征求同意, 再下载
  autoUpdater.autoInstallOnAppQuit = true;   // 用户选"稍后"时, 退出应用时自动装
  // 更新源由打包生成的 app-update.yml 提供(github provider), 无需 setFeedURL

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-not-available', (i) => send({ state: 'none', version: i && i.version }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('error', (e) => send({ state: 'error', message: String((e && e.message) || e) }));

  autoUpdater.on('update-available', async (info) => {
    send({ state: 'available', version: info.version });
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['下载更新', '稍后'], defaultId: 0, cancelId: 1, noLink: true,
      title: '发现新版本',
      message: `发现新版本 ${info.version}（当前 ${app.getVersion()}）`,
      detail: '是否现在下载？下载完成后可一键重启安装。'
    });
    if (r.response === 0) { send({ state: 'downloading', percent: 0 }); autoUpdater.downloadUpdate(); }
  });

  autoUpdater.on('update-downloaded', async (info) => {
    send({ state: 'downloaded', version: info.version });
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['立即重启安装', '稍后'], defaultId: 0, cancelId: 1, noLink: true,
      title: '更新已就绪',
      message: `新版本 ${info.version} 已下载完成`,
      detail: '立即重启完成安装？（选"稍后"会在下次退出应用时自动安装）'
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
}

// silent=true: 启动时静默自动检查(失败不弹错误); false: 手动检查(失败上报到界面)
async function doCheck(silent){
  if (!app.isPackaged) return { ok: false, reason: 'dev' };           // 开发模式(electron .)不检查
  if (!CONFIGURED)     return { ok: false, reason: 'unconfigured' };  // 占位地址: 不检查
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (e) {
    if (!silent) send({ state: 'error', message: String((e && e.message) || e) });
    return { ok: false, reason: String(e) };
  }
}

function registerUpdater(mainWindow){
  win = mainWindow;
  wireEvents();
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:check', () => doCheck(false));
  if (CONFIGURED) setTimeout(() => doCheck(true), 3000);   // 启动 3s 后静默自动检查
}

module.exports = { registerUpdater, CONFIGURED };
