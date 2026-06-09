// 路径解析 + 读写 params.json (主进程数据访问层)
// 与 generator.py 同源的 params.json (本机存在则用它, 保持与 Fusion 生成同步);
// 否则退回 userData 下一份(首次从内置默认复制) —— 保证脱机/异机也能用
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SKILL_PARAMS = 'D:\\02_Agent\\27_Exploration\\fusion\\.claude\\skills\\baseplate-platform\\params.json';

function paramsPath(){
  try{ if(fs.existsSync(SKILL_PARAMS)) return SKILL_PARAMS; }catch(e){}
  const up = path.join(app.getPath('userData'), 'params.json');
  try{ if(!fs.existsSync(up)) fs.copyFileSync(path.join(__dirname,'params.json'), up); }catch(e){}
  return up;
}

function load(){ return JSON.parse(fs.readFileSync(paramsPath(),'utf-8')); }

function save(data){ fs.writeFileSync(paramsPath(), JSON.stringify(data,null,2),'utf-8'); return true; }

module.exports = { paramsPath, load, save };
