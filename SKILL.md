---
name: baseplate-platform
description: 生成/修改喷墨打印机喷头底板的「主体(通用平台) + 子板毛坯」。涉及主体板、4 个安装角孔、N 个子板区域(窗口)、窗口台肩与 M3 固定孔、子板毛坯外形与上下耳固定接口、整板厚度、区域数量/尺寸/间距/旋转，或更换打印机小车尺寸时使用。不含喷头专属安装区(法兰沉台/喷嘴窗/接口孔)，那属于 baseplate-head 技能。需 Fusion 360 + MCP 连通。
---

# 喷头底板 — 主体(通用平台) + 子板毛坯生成器

本技能用 Fusion 360 MCP **参数化生成**喷墨打印机喷头底板的「主体 + 子板毛坯」。
唯一真相是 `params.json`，生成器 `generator.py` 读它建模。换打印机/改布局只改参数、重跑生成器。

附带文件：
- `params.json` —— 全部参数（值/单位/范围/标签/必填），UI 与生成器共用的数据源（唯一真相）。
- `generator.py` —— 读 `params.json`，用 Fusion API 建「主体 + 子板毛坯」。
- `config-ui.html` + `serve.py` —— 本地配置界面：参数表单 + three.js **真 3D 预览**（不依赖 Fusion）+ 重叠/必填/固定孔校验 + **导出主体 3MF**（前端直接出，不经 Fusion）。`python serve.py` 后浏览器开 `http://127.0.0.1:8080/`。

**产出**：一个 **混合设计**（`designIntent = HybridDesignIntentType`，零件+装配同文件）、**参数化**、含 **2 个独立组件** `主体` 与 `子板`（子板为毛坯，喷头区留待 Skill 2 手动）。

---

## 1. 适用场景 / 边界

- **该用**：从零生成底板平台；调整主体尺寸 / 角孔 / 子板区域的数量·尺寸·间距·旋转 / 整板厚度；生成与主体窗口通用的「子板毛坯」。
- **不该用**：喷头专属的内部（中间挖空 + 喷头安装孔）——交给 Skill 2 `baseplate-head`，它在本毛坯上继续加工。
- **前提**：Fusion 360 打开、MCP 已连通、有活动文档；所有参数改在 `params.json`，改完重新运行生成器。

---

## 2. 装配关系与设计规则

- **三层（自上而下固定）**：打印机小车 → **主体**（通用平台）→ **子板**（随喷头型号变）→ **喷头**。
- **模块化**：子板的「外部接口」（外形 + 上下耳固定孔）与主体窗口**通用**；「内部」随喷头。**换喷头只重画子板内部，外接口不动**。
- ★ **齐平 Z 基准（硬约束）**：子板正面 = 主体正面 = 喷嘴面，三者齐平。板厚 `plate_T` 两件共用；正面 = 贴床 / 观察出墨面。
- **孔径标准**：角孔 **⌀5.8**（M4 热熔，固定到小车）；窗口台肩孔 + 子板固定孔 **⌀4.3**（M3 热熔）。
- **主体↔子板 配合**：主体窗口上下**台肩**（自背面 `shelf_back_T` 厚、正面留 `plate_T−shelf_back_T` 凹槽、含 ⌀4.3 孔）↔ 子板上下**耳**（`tab_T` 厚、嵌入凹槽、正面齐平）；两者固定孔**同间距** `win_H − 2·m3_inset`。
- **子板毛坯 = 外形（窗口尺寸 − 装配间隙）+ 上下耳 + 固定孔 + 中段实心**（中段留白给喷头段）。

---

## 3. 参数表

唯一真相在 `params.json`，下表是速查；改值后重跑生成器。

| 组 | 参数 | 含义 | 活/重生成 |
|---|---|---|---|
| shared | `plate_T` | 板厚（主体&子板共用） | ✅ 活 |
| shared | `region_angle` | 区域旋转角（任意角） | 重生成（烘焙旋转） |
| main_body | `plate_W` `plate_H` | 主体板 宽/高 | ✅ 活 |
| main_body | `corner_dia` | 角孔径 M4 | ✅ 活 |
| main_body | `corner_inset_x` `_z` | 角孔距边（定 1 镜像 4） | 重生成 |
| main_body | `win_count` | 区域数量 | 重生成 |
| main_body | `win_W` `win_H` | 区域 宽/高 | ✅ 活 |
| main_body | `win_pitch` | 区域间距 | ✅ 活* |
| main_body | `shelf_H` `shelf_back_T` | 台肩 高/厚 | ✅ 活 |
| main_body | `m3_dia` `m3_inset` | M3 孔 径/距边 | ✅ 活 |
| sub_blank | `fit_gap_w` `fit_gap_h` | 子板与窗口 宽/高间隙 | 重生成 |
| sub_blank | `tab_H` `tab_T` | 上下耳 高/厚 | ✅ 活 |
| _derived | `sub_W=win_W−fit_gap_w` `sub_H=win_H−fit_gap_h` | 子板外形（派生） | 跟随 |

\* 间距是活参数，但窗口位置数值摆放，改间距后建议重生成以保持居中。

**活参数**：直接在 Fusion 参数表里改即可实时更新几何。微调后可把用户参数读回写入 `params.json` 保持同步。
**重生成参数**：改 `params.json` 后重跑生成器。

---

## 4. 建模配方（生成器怎么干，便于将来读懂/修改）

**运行方式**：用 MCP `execute` 跑一段小封装——`exec` 读取 `generator.py` 再调 `generate()`：
```python
def run(_context):
    src = open(r'...\baseplate-platform\generator.py', 'r', encoding='utf-8').read()
    g = dict(globals()); exec(src, g); g['generate']()
```

**方向约定**：草图建在 **XZ 平面**，**+Y = 板厚**，**正面 (Y=plate_T) = 齐平基准**。

**旋转 `region_angle`**：**只转主体的窗口/台肩/M3 孔**（绕各自中心，画烘焙旋转矩形）；**板、4 角孔、子板都不转**——子板是独立零件（安装到斜窗时才转），几何全程轴对齐 + 活参数。`=0` 时主体窗口也走轴对齐活参数。`.value` 对角度参数返回**弧度**。

**主体组件**：
1. 板草图（矩形 + 4 角圆）拉伸 `plate_T` → 新建体。
2. 窗口草图（按 `win_count` 居中循环放矩形）穿透切除。
3. 台肩+M3 草图（每窗口上下 2 矩形 + 2 圆）Join `shelf_back_T`。

**子板组件**（偏置 +X、单位变换、几何在草图里平移）：
1. 基板 `sub_W×sub_H` 拉伸 `plate_T`。
2. 上下耳固定孔穿透（与主体台肩孔同间距同径）。
3. 上下耳正面凹槽（起点 `tab_T`、深 `plate_T−tab_T`）。
4. **中段不挖**（留给 Skill 2）。

**自检**：每步 `read screenshot`（front / iso），必要时读 body `boundingBox` / 面 `area` 定量核对。

---

## 5. 关键坑（MCP 驱动 Fusion 的实战经验）

1. **单位**：API 内部是 **cm**；参数 `.value` 返回 cm，×10 得 mm。显示单位设 `MillimeterDistanceUnits`。
2. **中文名编码**：`print` 回传中文会乱码，但写进模型的名字是对的；**读模型别靠中文名匹配**，按几何（bbox/面积）筛选。
   - **参数名只能 ASCII**（字母/数字/下划线）——中文参数名报 `param name is not valid`。组件/实体/草图名可中文。中文说明放参数**注释(comment)** 字段（生成器已把 `label` 写为注释）。
3. **草图点是局部坐标**（面内 x,y，法线 z=0）：判线方向用**局部 y=水平线、局部 x=竖直线**。
4. **矩形**：`addCenterPointRectangle` 自动加全约束 → 只标 W/H；`addTwoPointRectangle` 不自动 → 别再叠定位标注（**过约束**）。
5. **圆位置**：一个圆同时标「直径+X+Z」易**过约束**；位置改走数值/重生成。
6. **组件平移翻法线**：带平移变换的新组件会让穿透切除找不到实体 → 组件用**单位变换**，几何在草图里平移。
7. **穿透切除顺序**：起点方向得有实体 → **先穿透切除、再挖局部沉台**；或用对称穿透。
8. **设计「类型」≠ 设计「意图」**：`designType` 只有 直接/参数化 两种；新版「您想设计什么」对话框的 零件/部件/**混合设计** 是 `designIntent`（`DesignIntentTypes`: Part=0 / Assembly=1 / **Hybrid=2**）。`documents.add()` + 加组件带实体会自动成 Hybrid(混合设计)，也可显式 `des.designIntent = HybridDesignIntentType`。

---

## 6. 对外接口（交给 Skill 2 `baseplate-head` 的约定）

- **可加工区**：组件 `子板` 的 body `子板`，中段实心块（高 ≈ `sub_H − 2·tab_H`，宽 `sub_W`，厚 `plate_T`）。Skill 2 在此挖：背面**法兰沉台** + 穿透到正面的**喷嘴窗** + **喷头接口孔**。
- **齐平铁律**：Skill 2 必须让 `法兰沉台深 = plate_T − flange_to_nozzle`，使喷嘴面与正面（Y=`plate_T`）齐平。背面（Y=0）= 喷头法兰塞入侧。
- **不可改**：外形、上下耳、固定孔——这是与主体窗口通用的外接口，动了就装不进主体。
