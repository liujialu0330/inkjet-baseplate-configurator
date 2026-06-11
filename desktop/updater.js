// updater.js — 自动更新 (electron-updater) + 手动检查 + 版本号 + 跳过此版本 + 更新后首启提示
//
// 更新源 = GitHub Releases (owner/repo 见 package.json -> build.publish)。
// electron-updater 打包后自动读取生成的 app-update.yml, 无需在此 setFeedURL。
// 每次发版:
//   1) 在 CHANGELOG.json 加入当前版本条目（GitHub Release 说明取自该文件）；
//   2) 调大 package.json 的 version;
//   3) 运行 build-installer.ps1 打包;
//   4) gh release create v<版本> dist/*Setup*.exe dist/*.blockmap dist/latest.yml
//      (或 electron-builder --publish always)。旧用户启动后/点"检查更新"即收到提示一键更新。
const { autoUpdater } = require('electron-updater');
const { dialog, ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { htmlToText, notesBetween } = require('./update-notes');

const CONFIGURED = true;   // 已接 GitHub Releases

let win = null;
let manualCheck = false;   // 当前这次检查是否用户手动触发(手动时忽略"已跳过", 强制提示, 便于反悔)
function send(payload){ if (win && !win.isDestroyed()) win.webContents.send('update:status', payload); }

// —— prefs 读写 (userData/update-prefs.json) ——
// 合并写, 保留所有既有键; 读写失败静默处理
function prefsPath(){ return path.join(app.getPath('userData'), 'update-prefs.json'); }

function readPrefs(){
  try { return JSON.parse(fs.readFileSync(prefsPath(), 'utf-8')); }
  catch (e) { return {}; }
}

function writePrefs(patch){
  try {
    var cur = readPrefs();
    var next = Object.assign({}, cur, patch);
    fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf-8');
  } catch (e) {}
}

function getSkippedVersion(){ return readPrefs().skippedVersion || null; }
function setSkippedVersion(v){ writePrefs({ skippedVersion: v }); }

// —— 更新后首启弹窗 ——
// 门: app.isPackaged 为真才启用; process.env.WHATS_NEW_TEST==='1' 时强制启用(含开发态)
async function maybeShowWhatsNew(){
  var testMode = process.env.WHATS_NEW_TEST === '1';
  if (!app.isPackaged && !testMode) return;

  var changelog;
  try { changelog = require('./CHANGELOG.json'); }
  catch (e) { return; }   // CHANGELOG.json 尚不存在时静默退出

  var curVer = app.getVersion();
  var prefs = readPrefs();
  var lastSeen = prefs.lastSeenVersion || null;

  var entries = [];   // [{version, items}]

  if (testMode) {
    // 测试模式: 强制展示当前版本条目，不写 lastSeenVersion
    var cur = changelog[curVer];
    if (cur && cur.length) entries = [{ version: curVer, items: cur }];
  } else if (lastSeen === curVer) {
    // 已弹过此版本, 不再提示
    return;
  } else if (lastSeen != null) {
    // 有历史记录且版本不同 → 列出 (lastSeen, curVer] 区间所有条目
    entries = notesBetween(changelog, lastSeen, curVer);
  } else {
    // lastSeenVersion 不存在 → 升级启发式
    // 参数文件 inkjet-baseplate-params.json 存在说明应用之前已跑过(老版本升上来)
    var paramsFile = path.join(app.getPath('userData'), 'inkjet-baseplate-params.json');
    var hadPrevious = fs.existsSync(paramsFile);
    if (hadPrevious) {
      // 老版本升上来 → 只展示当前版本条目
      var curItems = changelog[curVer];
      if (curItems && curItems.length) entries = [{ version: curVer, items: curItems }];
    } else {
      // 全新安装 → 不弹
      writePrefs({ lastSeenVersion: curVer });
      return;
    }
  }

  if (!entries.length) {
    // 没有可展示的条目, 非测试模式更新 lastSeenVersion 后退出
    if (!testMode) writePrefs({ lastSeenVersion: curVer });
    return;
  }

  // 组装弹窗内容
  var message = '已更新到 v' + curVer;
  var detailLines = [];
  if (entries.length === 1) {
    // 单版本: 直接列条目, 不加版本小标题
    entries[0].items.forEach(function (item) { detailLines.push('• ' + item); });
  } else {
    // 多版本: 每段加 vX.Y.Z 小标题
    entries.forEach(function (entry) {
      detailLines.push('v' + entry.version);
      entry.items.forEach(function (item) { detailLines.push('  • ' + item); });
      detailLines.push('');
    });
    // 去掉末尾多余空行
    while (detailLines.length && detailLines[detailLines.length - 1] === '') detailLines.pop();
  }
  var detail = detailLines.join('\n');

  if (testMode) {
    // 测试模式: 打印供 E2E 断言, 不写 lastSeenVersion
    console.log('[whatsnew] ' + JSON.stringify({ message: message, detail: detail }));
    return;
  }

  await dialog.showMessageBox(win, {
    type: 'info',
    title: '更新完成',
    message: message,
    detail: detail,
    buttons: ['知道了'],
    defaultId: 0,
    noLink: true
  });

  // 弹窗关闭后记录, 下次不再弹
  writePrefs({ lastSeenVersion: curVer });
}

function wireEvents(){
  autoUpdater.autoDownload = false;          // 先弹窗征求同意, 再下载
  autoUpdater.autoInstallOnAppQuit = true;   // 用户选"稍后"时, 退出应用时自动装
  // 更新源由打包生成的 app-update.yml 提供(github provider), 无需 setFeedURL

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-not-available', (i) => send({ state: 'none', version: i && i.version }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('error', (e) => send({ state: 'error', message: String((e && e.message) || e) }));

  autoUpdater.on('update-available', async (info) => {
    // 自动检查时, 若该版本已被用户"跳过", 则不再提示(手动检查则强制提示, 便于反悔)
    if (!manualCheck && info.version === getSkippedVersion()) {
      send({ state: 'none', version: info.version, skipped: true });
      return;
    }
    send({ state: 'available', version: info.version });

    // 若 releaseNotes 非空, 在 detail 开头插入本次更新说明
    var releaseDetail = '';
    if (info.releaseNotes) {
      var noteText = htmlToText(info.releaseNotes);
      if (noteText) releaseDetail = '本次更新:\n' + noteText + '\n\n';
    }

    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['现在更新', '跳过此版本', '稍后'], defaultId: 0, cancelId: 2, noLink: true,
      title: '发现新版本',
      message: `发现新版本 ${info.version}（当前 ${app.getVersion()}）`,
      detail: releaseDetail + '"现在更新"立即下载；"跳过此版本"将不再提示此版本，直到出现更新的版本；"稍后"下次启动再提醒。'
    });
    if (r.response === 0) {
      send({ state: 'downloading', percent: 0 });
      autoUpdater.downloadUpdate();
    } else if (r.response === 1) {
      setSkippedVersion(info.version);
      send({ state: 'skipped', version: info.version });
    }
    // r.response === 2(稍后): 不处理, 下次启动再检查
  });

  autoUpdater.on('update-downloaded', async (info) => {
    send({ state: 'downloaded', version: info.version });

    // 若 releaseNotes 非空, 在 detail 开头插入本次更新说明
    var releaseDetail = '';
    if (info.releaseNotes) {
      var noteText = htmlToText(info.releaseNotes);
      if (noteText) releaseDetail = '本次更新:\n' + noteText + '\n\n';
    }

    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['立即重启安装', '稍后'], defaultId: 0, cancelId: 1, noLink: true,
      title: '更新已就绪',
      message: `新版本 ${info.version} 已下载完成`,
      detail: releaseDetail + '立即重启完成安装？（选"稍后"会在下次退出应用时自动安装）'
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
}

// silent=true: 启动时静默自动检查(失败不弹错误, 尊重"已跳过"); false: 手动检查(失败上报到界面, 且忽略"已跳过")
async function doCheck(silent){
  if (!app.isPackaged) return { ok: false, reason: 'dev' };           // 开发模式(electron .)不检查
  if (!CONFIGURED)     return { ok: false, reason: 'unconfigured' };  // 占位地址: 不检查
  manualCheck = !silent;
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
  // 启动约 1200ms 后展示"更新后首启弹窗"(窗口先画出来, 早于 3s 的自动检查)
  setTimeout(() => maybeShowWhatsNew(), 1200);
  if (CONFIGURED) setTimeout(() => doCheck(true), 3000);   // 启动 3s 后静默自动检查
}

module.exports = { registerUpdater, CONFIGURED };
