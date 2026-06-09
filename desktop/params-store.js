// 路径解析 + 读写 params.json (主进程数据访问层)
// - 开发模式(从项目 npm start 跑): 直接读写技能根目录的 params.json, 即 generator.py 读取的
//   同一文件 -> 在 GUI 里配置完, generator.py 立刻能读到, 二者天然同步、无需写死绝对路径。
// - 已打包(独立安装的 exe): 用各自的 userData 配置(首次从内置默认复制), 独立运行、不依赖项目位置。
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function paramsPath(){
  if (!app.isPackaged) {
    // desktop/ 的上一级 = 技能根; 那里的 params.json 与 generator.py 同源
    return path.join(__dirname, '..', 'params.json');
  }
  const up = path.join(app.getPath('userData'), 'params.json');
  try { if (!fs.existsSync(up)) fs.copyFileSync(path.join(__dirname, 'params.json'), up); } catch (e) {}
  return up;
}

function load(){ return JSON.parse(fs.readFileSync(paramsPath(),'utf-8')); }

function save(data){ fs.writeFileSync(paramsPath(), JSON.stringify(data,null,2),'utf-8'); return true; }

module.exports = { paramsPath, load, save };
