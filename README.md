# inkjet-baseplate-configurator · 喷头底板 主体+子板毛坯 配置器

喷墨打印机**喷头底板**的参数化建模技能 + 自包含 **Electron 配置器**。
以 Ricoh GEN5/G5 喷头为例，参数化生成「**主体（通用平台）+ 子板毛坯**」，子板的喷头安装区留待后续按喷头型号加工。

唯一真相是 `params.json`，改参数、重跑生成器即可换打印机/改布局。

## 目录结构

```
.
├── SKILL.md            技能说明(给 AI/协作者: 适用场景·装配规则·参数表·建模配方·坑)
├── params.json         全部参数(值/单位/范围/标签/必填) —— UI 与生成器共用的唯一数据源
├── generator.py        读 params.json, 用 Fusion 360 API 建"主体+子板毛坯"(混合设计/2 组件)
├── config-ui.html      浏览器版配置界面(serve.py 起本地服务)
├── serve.py            本地静态服务(python serve.py → http://127.0.0.1:8080/)
└── desktop/            自包含 Electron 桌面配置器(免浏览器/免联网)
    ├── main.js / preload.js / ipc.js / params-store.js / updater.js   主进程
    ├── renderer/       前端(模块化: 几何/校验/3D/视角立方体/导出/表单/更新…)
    ├── build-installer.ps1 + _7za_wrap.cs   打 NSIS 安装包的脚本(见下)
    └── REFACTOR_SPEC.md  渲染层重构的架构规格
```

## 桌面配置器(desktop)

参数配置 + **真 3D 预览**(three.js, 不依赖 Fusion) + 重叠/必填/孔位校验 + 保存 `params.json` + 导出主体 3MF；带**版本号**与**自动更新**。

### 开发运行
```powershell
cd desktop
npm install
npm start
```

### 打 NSIS 安装包(免管理员/免开发者模式)
```powershell
cd desktop
pwsh ./build-installer.ps1
```
> electron-builder 解压 winCodeSign 时, 内含 2 个 macOS 符号链接(`*.dylib`)在无权限的 Windows 上会创建失败而中止。
> `build-installer.ps1` 用 `_7za_wrap.cs` 临时把 builder 调用的 `7za.exe` 换成"自动排除 `*.dylib`"的包装器, 打完自动还原。
> 产物在 `desktop/dist/`: 安装包 `*.exe` + `*.exe.blockmap` + `latest.yml`。

### 自动更新(GitHub Releases)
应用启动后静默检查 / 点「检查更新」→ 发现新版弹「下载更新」→ 下载完弹「立即重启安装」。

发版流程:
1. 调大 `desktop/package.json` 的 `version`；
2. `pwsh ./build-installer.ps1` 打包；
3. 发布 Release 并上传 3 个产物:
   ```powershell
   gh release create v1.0.1 dist/*Setup*.exe dist/*.blockmap dist/latest.yml --title v1.0.1 --notes "..."
   ```
   旧用户启动后/点「检查更新」即收到提示一键更新。

## 桌面应用模块边界(高内聚低耦合)

- 纯逻辑(无 THREE/无 DOM, 可单测): `geometry.js`(几何数学) / `validation.js`(校验)
- 数据: `store.js`(状态+派生) / `api.js`(IPC 封装)
- 表现: `form.js` / `ui.js` / `css/styles.css`
- 3D: `shapes.js`(2D 轮廓) / `viewer3d.js`(场景/建模) / `viewcube.js`(视角立方体)
- 导出: `exporter.js`(主体 3MF)
- 更新: `updates.js`(前端) / `updater.js`(主进程)
- 编排: `app.js`(装配各模块, 取代旧单文件巨石)

详见 `desktop/REFACTOR_SPEC.md`。
