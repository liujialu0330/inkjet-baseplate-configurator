// update-notes.js — 更新日志工具函数
// 纯 CommonJS 工具模块，禁止 require('electron')，便于 node 单测
// 职责: 解析 releaseNotes / 比较版本 / 从 CHANGELOG.json 提取区间条目

/**
 * 把 electron-updater 的 releaseNotes 转为纯文本。
 * 入参可以是:
 *   - null / undefined                     → 返回 ''
 *   - HTML 字符串                           → 去标签、解码实体、整理空行
 *   - [{version, note}, ...]               → 各项 note 分别处理后拼接
 * @param {string|Array|null|undefined} notes
 * @param {number} maxLen  超出则截断加 '…'（默认 600）
 * @returns {string}
 */
function htmlToText(notes, maxLen) {
  if (maxLen === undefined) maxLen = 600;
  if (notes == null) return '';

  // 数组形态: [{version, note}, ...]
  if (Array.isArray(notes)) {
    var parts = notes.map(function (item) {
      return htmlToText(item && item.note, maxLen);
    }).filter(Boolean);
    var joined = parts.join('\n');
    if (joined.length > maxLen) joined = joined.slice(0, maxLen) + '…';
    return joined;
  }

  var s = String(notes);

  // <li> 前加换行 + '- '
  s = s.replace(/<li[^>]*>/gi, '\n- ');
  // 块级结束标签变换行
  s = s.replace(/<\/(li|br|p|div|ul|ol|h[1-6])>/gi, '\n');
  // <br> / <br/> 本身也换行
  s = s.replace(/<br\s*\/?>/gi, '\n');
  // 删除所有剩余标签
  s = s.replace(/<[^>]+>/g, '');

  // 解码 HTML 实体
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/&lt;/g, '<');
  s = s.replace(/&gt;/g, '>');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&nbsp;/g, ' ');

  // 压缩连续换行为一个(弹窗条目列表不需段落空行)
  s = s.replace(/\n{2,}/g, '\n');
  s = s.trim();

  if (s.length > maxLen) s = s.slice(0, maxLen) + '…';
  return s;
}

/**
 * 比较两个语义版本字符串（如 '1.2.3'）。
 * 缺段按 0 处理（如 '1.2' 视为 '1.2.0'）。
 * @returns {-1|0|1}  a < b → -1；a === b → 0；a > b → 1
 */
function cmpVer(a, b) {
  var pa = String(a).split('.').map(Number);
  var pb = String(b).split('.').map(Number);
  var len = Math.max(pa.length, pb.length);
  for (var i = 0; i < len; i++) {
    var na = pa[i] || 0;
    var nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * 从 changelog 对象中提取版本区间 (fromExclusive, toInclusive] 的条目。
 * changelog 格式: { "1.2.0": ["条目1", "条目2"], "1.1.0": [...], ... }
 * 结果按版本号从新到旧排序。
 * @param {Object} changelog
 * @param {string|null} fromExclusive  起始版本（不含），null 表示从最旧开始
 * @param {string} toInclusive         结束版本（含）
 * @returns {Array<{version: string, items: string[]}>}
 */
function notesBetween(changelog, fromExclusive, toInclusive) {
  var keys = Object.keys(changelog);
  var result = [];
  for (var i = 0; i < keys.length; i++) {
    var v = keys[i];
    // 满足: v <= toInclusive
    if (cmpVer(v, toInclusive) > 0) continue;
    // 满足: v > fromExclusive（fromExclusive 为 null 时跳过此判断，取全部 ≤ to）
    if (fromExclusive != null && cmpVer(v, fromExclusive) <= 0) continue;
    var items = changelog[v];
    if (!Array.isArray(items)) continue;   // 跳过 null / 缺失 / 非数组条目
    result.push({ version: v, items: items });
  }
  // 从新到旧排序
  result.sort(function (x, y) { return cmpVer(y.version, x.version); });
  return result;
}

module.exports = { htmlToText, cmpVer, notesBetween };
