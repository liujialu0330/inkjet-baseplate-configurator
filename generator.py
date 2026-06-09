# -*- coding: utf-8 -*-
# 喷头底板生成器 (Skill 1: 主体 + 子板毛坯)
# 读 inkjet-baseplate-params.json -> 在 Fusion 新建混合设计文档, 建两个组件: 主体 / 子板
# 由 MCP execute 以 exec() 方式加载并调用 generate()
import adsk.core, adsk.fusion, json, os, math

# inkjet-baseplate-params.json 与本脚本同目录(技能根); 经 MCP exec 运行时, 外层封装需把 __file__ 指到本脚本(见 SKILL.md §4)
PARAMS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inkjet-baseplate-params.json")

def generate():
    app = adsk.core.Application.get()
    with open(PARAMS_PATH, "r", encoding="utf-8") as f:
        P = json.load(f)
    leaves = {}
    for grp in ("shared", "main_body", "sub_blank"):
        for k, v in P[grp].items():
            leaves[k] = (v["value"], v.get("unit", "mm"), v.get("label", ""))

    # ---- 新文档 ----
    app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
    des = adsk.fusion.Design.cast(app.activeProduct)
    des.designType = adsk.fusion.DesignTypes.ParametricDesignType
    try:  # 混合设计(零件+装配同文件)
        des.designIntent = adsk.fusion.DesignIntentTypes.HybridDesignIntentType
    except Exception:
        pass
    des.fusionUnitsManager.distanceDisplayUnits = adsk.fusion.DistanceUnits.MillimeterDistanceUnits
    root = des.rootComponent
    up = des.userParameters
    VI = adsk.core.ValueInput.createByString
    P3 = adsk.core.Point3D.create
    Ori = adsk.fusion.DimensionOrientations
    FO = adsk.fusion.FeatureOperations
    EXT = adsk.fusion.ExtentDirections.PositiveExtentDirection

    # ---- 用户参数(尺寸类=活参数) ----
    def setp(name, expr, unit, comment=""):
        x = up.itemByName(name)
        if x:
            x.expression = expr; return x
        return up.add(name, VI(expr), unit, comment)
    for name, (val, unit, label) in leaves.items():
        u = unit if unit else ""
        expr = ("%g deg" % val) if u == "deg" else (("%g" % val) if u == "" else ("%g mm" % val))
        setp(name, expr, u, label)
    setp("sub_W", "win_W - fit_gap_w", "mm", "子板宽=区域宽-间隙")
    setp("sub_H", "win_H - fit_gap_h", "mm", "子板高=区域高-间隙")
    setp("flange_to_nozzle_ref", "plate_T", "mm", "齐平参考:子板厚(喷头段细化)")

    def val(n):  # cm (Fusion 内部)
        return up.itemByName(n).value

    # ---- 草图 helper (轴对齐, 活参数) ----
    def crect(sk, cx, cz, hw, hh, wexpr, hexpr):
        L = sk.sketchCurves.sketchLines
        r = L.addCenterPointRectangle(P3(cx, cz, 0), P3(cx + hw, cz + hh, 0))
        rl = [r.item(i) for i in range(r.count)]
        ho = ve = None
        for ln in rl:
            a = ln.startSketchPoint.geometry; b = ln.endSketchPoint.geometry
            if abs(a.y - b.y) < 1e-6 and abs(a.x - b.x) > 1e-6 and ho is None: ho = ln
            if abs(a.x - b.x) < 1e-6 and abs(a.y - b.y) > 1e-6 and ve is None: ve = ln
        D = sk.sketchDimensions
        D.addDistanceDimension(ho.startSketchPoint, ho.endSketchPoint, Ori.HorizontalDimensionOrientation, P3(cx, cz - hh - 0.5, 0)).parameter.expression = wexpr
        D.addDistanceDimension(ve.startSketchPoint, ve.endSketchPoint, Ori.VerticalDimensionOrientation, P3(cx + hw + 0.5, cz, 0)).parameter.expression = hexpr

    def circ(sk, cx, cz, rval, dexpr):
        c = sk.sketchCurves.sketchCircles.addByCenterRadius(P3(cx, cz, 0), rval)
        sk.sketchDimensions.addDiameterDimension(c, P3(cx + rval + 0.3, cz + rval + 0.3, 0)).parameter.expression = dexpr
        return c

    def allprofs(sk):
        oc = adsk.core.ObjectCollection.create()
        for i in range(sk.profiles.count): oc.add(sk.profiles.item(i))
        return oc

    def profsByArea(sk, lo, hi):
        oc = adsk.core.ObjectCollection.create()
        for i in range(sk.profiles.count):
            a = sk.profiles.item(i).areaProperties().area
            if lo <= a <= hi: oc.add(sk.profiles.item(i))
        return oc

    # ---- 旋转支持: region_angle (.value 返回弧度) ----
    ang = up.itemByName("region_angle").value
    rotated = abs(ang) > 1e-9
    def rotRect(sk, cx, cz, w, h):  # 烘焙旋转矩形(4线闭合, 无活标注)
        co = math.cos(ang); si = math.sin(ang)
        cs = [(-w/2, -h/2), (w/2, -h/2), (w/2, h/2), (-w/2, h/2)]
        pts = [P3(cx + dx*co - dz*si, cz + dx*si + dz*co, 0) for (dx, dz) in cs]
        L = sk.sketchCurves.sketchLines
        l0 = L.addByTwoPoints(pts[0], pts[1])
        l1 = L.addByTwoPoints(l0.endSketchPoint, pts[2])
        l2 = L.addByTwoPoints(l1.endSketchPoint, pts[3])
        L.addByTwoPoints(l2.endSketchPoint, l0.startSketchPoint)
    def offpt(cx, cz, dx, dz):  # (dx,dz) 相对(cx,cz)的偏移, 旋转时绕(cx,cz)转 ang
        if rotated:
            co = math.cos(ang); si = math.sin(ang)
            return (cx + dx*co - dz*si, cz + dx*si + dz*co)
        return (cx + dx, cz + dz)
    def addRect(sk, cx, cz, w, h, wexpr, hexpr):
        if rotated: rotRect(sk, cx, cz, w, h)
        else: crect(sk, cx, cz, w/2, h/2, wexpr, hexpr)
    def addCirc(sk, cx, cz, dx, dz, rval, dexpr):
        px, pz = offpt(cx, cz, dx, dz)
        circ(sk, px, pz, rval, dexpr)

    # ============ 组件 主体 ============
    occ1 = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    A = occ1.component; A.name = "主体"
    extA = A.features.extrudeFeatures; XZA = A.xZConstructionPlane
    pw = val("plate_W"); ph = val("plate_H"); ww = val("win_W"); wh = val("win_H")
    shH = val("shelf_H"); m3i = val("m3_inset"); cd = val("corner_dia")
    cix = val("corner_inset_x"); ciz = val("corner_inset_z"); m3d = val("m3_dia")
    cnt = int(round(up.itemByName("win_count").value)); pitch = val("win_pitch")
    # 板 + 4 角孔 (板不旋转; 角孔对称, 只标直径活)
    sp = A.sketches.add(XZA); sp.name = "plate"
    crect(sp, 0, 0, pw/2, ph/2, "plate_W", "plate_H")
    cx = pw/2 - cix; cz = ph/2 - ciz
    for (sx, sz) in [(cx, cz), (-cx, cz), (cx, -cz), (-cx, -cz)]:
        circ(sp, sx, sz, cd/2, "corner_dia")
    big = max([sp.profiles.item(i) for i in range(sp.profiles.count)], key=lambda p: p.areaProperties().area)
    ei = extA.createInput(big, FO.NewBodyFeatureOperation); ei.setDistanceExtent(False, VI("plate_T"))
    extA.add(ei).name = "ex_plate"; A.bRepBodies.item(0).name = "主体板"
    # 窗口 (循环居中, 各自绕中心旋转)
    centers = [(i - (cnt - 1)/2.0) * pitch for i in range(cnt)]
    sw = A.sketches.add(XZA); sw.name = "win_cuts"
    for c0 in centers: addRect(sw, c0, 0, ww, wh, "win_W", "win_H")
    wp = profsByArea(sw, ww*wh*0.7, ww*wh*1.25)
    ei = extA.createInput(wp, FO.CutFeatureOperation); ei.setAllExtent(EXT)
    extA.add(ei).name = "ex_win_cut"
    # 台肩 + M3 孔 (随窗口旋转)
    ss = A.sketches.add(XZA); ss.name = "shelves"
    for c0 in centers:
        for sgn in (1, -1):
            px, pz = offpt(c0, 0, 0, sgn*(wh/2 - shH/2))
            addRect(ss, px, pz, ww, shH, "win_W", "shelf_H")
            addCirc(ss, c0, 0, 0, sgn*(wh/2 - m3i), m3d/2, "m3_dia")
    sprof = profsByArea(ss, ww*shH*0.5, ww*shH*1.2)
    ei = extA.createInput(sprof, FO.JoinFeatureOperation); ei.setDistanceExtent(False, VI("shelf_back_T"))
    extA.add(ei).name = "ex_shelf"

    # ============ 组件 子板 (毛坯, 偏置+X, 整体绕自身中心旋转) ============
    OX = 28.0  # cm
    occ2 = root.occurrences.addNewComponent(adsk.core.Matrix3D.create())
    B = occ2.component; B.name = "子板"
    extB = B.features.extrudeFeatures; XZB = B.xZConstructionPlane
    subW = val("sub_W"); subH = val("sub_H"); tabH = val("tab_H"); tabT = val("tab_T")
    mountZ = wh/2 - m3i
    # 基板 —— 子板不随 region_angle 旋转(独立零件, 安装时才转); 始终轴对齐 + 活参数
    s = B.sketches.add(XZB); s.name = "sub_base"; crect(s, OX, 0, subW/2, subH/2, "sub_W", "sub_H")
    big = max([s.profiles.item(i) for i in range(s.profiles.count)], key=lambda p: p.areaProperties().area)
    ei = extB.createInput(big, FO.NewBodyFeatureOperation); ei.setDistanceExtent(False, VI("plate_T"))
    extB.add(ei).name = "ex_sub_base"; B.bRepBodies.item(0).name = "子板"
    # 上下耳固定孔 (穿透, 与主体台肩孔同位同径)
    s = B.sketches.add(XZB); s.name = "sub_mount"
    circ(s, OX, mountZ, m3d/2, "m3_dia"); circ(s, OX, -mountZ, m3d/2, "m3_dia")
    ei = extB.createInput(allprofs(s), FO.CutFeatureOperation); ei.setAllExtent(EXT)
    extB.add(ei).name = "ex_sub_mount"
    # 上下耳正面凹槽 (切 Y[tab_T..plate_T])
    s = B.sketches.add(XZB); s.name = "sub_tab_recess"
    for sgn in (1, -1): crect(s, OX, sgn*(subH/2 - tabH/2), subW/2, tabH/2, "sub_W", "tab_H")
    ei = extB.createInput(allprofs(s), FO.CutFeatureOperation)
    ei.startExtent = adsk.fusion.OffsetStartDefinition.create(VI("tab_T"))
    ei.setDistanceExtent(False, VI("plate_T - tab_T"))
    extB.add(ei).name = "ex_tab_recess"

    app.activeViewport.fit()
    intent = {0: "Part零件", 1: "Assembly部件", 2: "Hybrid混合设计"}.get(des.designIntent, "?")
    rot = ("  旋转 %.0f°(烘焙)" % math.degrees(ang)) if rotated else ""
    print("OK 生成完成. 设计意图=%s. 组件: %s + %s (2零件). 参数=%d. win_count=%d%s" % (intent, A.name, B.name, up.count, cnt, rot))
