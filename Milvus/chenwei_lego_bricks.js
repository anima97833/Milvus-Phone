/**
 * Milvus/chenwei_lego_bricks.js
 * 「谶纬小摊 2.0」乐高式 3D 积木零件库、体素网格堆叠引擎、格局量化分析器与 Three.js 参数化建模器
 * - 5 大类 17 种乐高风格零件（带真实顶部凸点 Studs）+ 8 色汉风五行色板
 * - 12×12 底板严格整数网格吸附、90° 四向旋转、多格防穿模碰撞与重力自动落位
 * - 确定性结构特征量化分析（层高/稳度/对称度/五行占比/灵物/原型），为 AI 解签提供真实物证
 * - 6 种名士建筑原型骨架 + 3 套玩家范例 + sanitizeAndGroundBlueprint 防幻觉蓝图清洗器
 */
(function (global) {
  "use strict";

  const GRID_MIN = -6;
  const GRID_MAX = 5; // 12x12 底板：-6..5
  const MAX_HEIGHT = 14;
  const CELL_SIZE = 1.0;
  const LAYER_HEIGHT = 0.72;

  // 8 色汉风五行色板
  const COLOR_PALETTE = [
    { id: "cinnabar", name: "朱砂红", hex: "#C84B31", element: "火", meaning: "离火明照，热情决断" },
    { id: "celadon", name: "青瓷绿", hex: "#5F8D76", element: "木", meaning: "震木生发，生机贵人" },
    { id: "ink", name: "玄墨黑", hex: "#2C3338", element: "水", meaning: "坎水深沉，权谋静守" },
    { id: "gold", name: "鎏金黄", hex: "#D4A03C", element: "金", meaning: "兑金锐进，名利权柄" },
    { id: "ochre", name: "赭石土", hex: "#A8744F", element: "土", meaning: "坤土载物，稳重厚德" },
    { id: "jade", name: "月白玉", hex: "#E7E2D4", element: "金", meaning: "乾玉清朗，澄明破局" },
    { id: "purple", name: "紫微檀", hex: "#6F4E7C", element: "火", meaning: "紫微星垣，天机莫测" },
    { id: "azure", name: "苍蓝釉", hex: "#3D6A8A", element: "水", meaning: "沧海行舟，远谋通达" }
  ];
  const COLOR_MAP = Object.fromEntries(COLOR_PALETTE.map((c) => [c.id, c]));

  // 5 大类 17 种乐高积木零件
  const BRICK_CATEGORIES = [
    { id: "basic", icon: "🧱", name: "方砖" },
    { id: "plate", icon: "⬜", name: "地砖" },
    { id: "slope", icon: "🔺", name: "飞檐" },
    { id: "arch", icon: "🏛️", name: "柱拱" },
    { id: "mystic", icon: "✨", name: "灵物" }
  ];

  const BRICK_CATALOG = [
    // 基础方砖
    { id: "brick_1x1", cat: "basic", name: "1×1 方砖", w: 1, h: 1, d: 1, studs: true, shape: "box", meaning: "基石一点" },
    { id: "brick_1x2", cat: "basic", name: "1×2 长砖", w: 2, h: 1, d: 1, studs: true, shape: "box", meaning: "连横稳步" },
    { id: "brick_2x2", cat: "basic", name: "2×2 稳基", w: 2, h: 1, d: 2, studs: true, shape: "box", meaning: "四方承重" },
    { id: "brick_2x4", cat: "basic", name: "2×4 横梁", w: 4, h: 1, d: 2, studs: true, shape: "box", meaning: "栋梁架势" },
    // 薄片地砖
    { id: "plate_1x2", cat: "plate", name: "1×2 榫片", w: 2, h: 1, d: 1, studs: true, shape: "plate", meaning: "细微铺垫" },
    { id: "plate_2x2", cat: "plate", name: "2×2 卦盘", w: 2, h: 1, d: 2, studs: false, shape: "tile", meaning: "平局明镜" },
    { id: "plate_4x4", cat: "plate", name: "4×4 坛基", w: 4, h: 1, d: 4, studs: true, shape: "plate", meaning: "广开疆界" },
    // 斜坡飞檐
    { id: "slope_1x2", cat: "slope", name: "1×2 瓦坡", w: 2, h: 1, d: 1, studs: false, shape: "slope", meaning: "顺势转折" },
    { id: "roof_2x2", cat: "slope", name: "2×2 攒尖顶", w: 2, h: 1, d: 2, studs: false, shape: "pyramid", meaning: "聚气封顶" },
    { id: "inv_slope_1x2", cat: "slope", name: "1×2 斗拱", w: 2, h: 1, d: 1, studs: true, shape: "bracket", meaning: "外拓挑檐" },
    // 圆柱拱门
    { id: "pillar_1x1", cat: "arch", name: "1×1 盘龙柱", w: 1, h: 2, d: 1, studs: true, shape: "pillar", meaning: "擎天柱石" },
    { id: "arch_1x3", cat: "arch", name: "1×3 汉阙门", w: 3, h: 2, d: 1, studs: true, shape: "arch", meaning: "门户通达" },
    { id: "round_2x2", cat: "arch", name: "2×2 浑天台", w: 2, h: 1, d: 2, studs: true, shape: "round", meaning: "圆融周转" },
    // 灵物法器
    { id: "orb_1x1", cat: "mystic", name: "灵光宝珠", w: 1, h: 1, d: 1, studs: false, shape: "orb", meaning: "天机灵犀" },
    { id: "lantern_1x1", cat: "mystic", name: "八卦铜灯", w: 1, h: 1, d: 1, studs: false, shape: "lantern", meaning: "心火引路" },
    { id: "ding_1x1", cat: "mystic", name: "青铜鼎炉", w: 1, h: 1, d: 1, studs: false, shape: "ding", meaning: "镇宅定鼎" },
    { id: "spire_1x1", cat: "mystic", name: "圭表星塔", w: 1, h: 2, d: 1, studs: false, shape: "spire", meaning: "观星问命" }
  ];
  const BRICK_MAP = Object.fromEntries(BRICK_CATALOG.map((b) => [b.id, b]));

  // ==========================================
  // 1. 网格坐标、旋转占用与防穿模重力算法
  // ==========================================
  function normalizeRot(rot) {
    const r = ((Number(rot) || 0) % 360 + 360) % 360;
    return Math.round(r / 90) * 90 % 360;
  }

  function getOrientedDims(type, rot = 0) {
    const def = BRICK_MAP[type] || BRICK_MAP.brick_1x1;
    const r = normalizeRot(rot);
    const swapped = r === 90 || r === 270;
    return {
      w: swapped ? def.d : def.w,
      h: def.h,
      d: swapped ? def.w : def.d,
      def
    };
  }

  function clampToBoard(type, gx, gz, rot = 0) {
    const { w, d } = getOrientedDims(type, rot);
    const x = Math.max(GRID_MIN, Math.min(GRID_MAX - w + 1, Math.round(Number(gx) || 0)));
    const z = Math.max(GRID_MIN, Math.min(GRID_MAX - d + 1, Math.round(Number(gz) || 0)));
    return { gx: x, gz: z };
  }

  function getFootprintCells(type, gx, gy, gz, rot = 0) {
    const { w, h, d } = getOrientedDims(type, rot);
    const cells = [];
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        for (let dz = 0; dz < d; dz++) {
          cells.push(`${gx + dx},${gy + dy},${gz + dz}`);
        }
      }
    }
    return cells;
  }

  function buildOccupiedSet(bricks) {
    const occ = new Set();
    for (const b of bricks || []) {
      for (const cell of getFootprintCells(b.type, b.gx, b.gy, b.gz, b.rot)) {
        occ.add(cell);
      }
    }
    return occ;
  }

  /**
   * 确定性重力落位 / 碰撞上浮算法：
   * - 如果 preferredMinY = 0（默认），从下方寻找最高支撑层，保证绝对不悬空、不穿模。
   * - 如果指定 preferredMinY > 0，从 preferredMinY 开始寻找第一个无碰撞层。
   */
  function findLandingY(existingBricks, type, gx, gz, rot = 0, preferredMinY = 0) {
    const occ = buildOccupiedSet(existingBricks);
    const { w, h, d } = getOrientedDims(type, rot);

    // 先算出该水平投影下方最高被占层 + 1，保证真实重力支撑
    let supportY = 0;
    for (const b of existingBricks || []) {
      const bd = getOrientedDims(b.type, b.rot);
      const overlapX = gx < b.gx + bd.w && gx + w > b.gx;
      const overlapZ = gz < b.gz + bd.d && gz + d > b.gz;
      if (overlapX && overlapZ) {
        const topY = b.gy + bd.h;
        if (topY > supportY) supportY = topY;
      }
    }

    let y = Math.max(supportY, Math.max(0, Math.round(Number(preferredMinY) || 0)));
    while (y + h <= MAX_HEIGHT) {
      const cells = getFootprintCells(type, gx, y, gz, rot);
      if (cells.every((c) => !occ.has(c))) return y;
      y += 1;
    }
    return -1; // 超出最大层高
  }

  let _uidSeq = 1;
  function placeBrick(existingBricks, { type = "brick_1x1", gx = 0, gz = 0, rot = 0, color = "cinnabar", preferredMinY = 0 } = {}) {
    const safeType = BRICK_MAP[type] ? type : "brick_1x1";
    const safeColor = COLOR_MAP[color] ? color : "cinnabar";
    const safeRot = normalizeRot(rot);
    const clamped = clampToBoard(safeType, gx, gz, safeRot);
    const gy = findLandingY(existingBricks, safeType, clamped.gx, clamped.gz, safeRot, preferredMinY);
    if (gy < 0) return { ok: false, error: "MAX_HEIGHT_EXCEEDED", bricks: existingBricks };

    const brick = {
      id: `bk_${Date.now()}_${_uidSeq++}`,
      type: safeType,
      gx: clamped.gx,
      gy,
      gz: clamped.gz,
      rot: safeRot,
      color: safeColor
    };
    return { ok: true, brick, bricks: [...(existingBricks || []), brick] };
  }

  function removeBrick(existingBricks, id) {
    return (existingBricks || []).filter((b) => b.id !== id);
  }

  // ==========================================
  // 2. 积木格局量化分析器（为 AI 解签提供物证）
  // ==========================================
  function analyzeStructure(bricks) {
    const list = Array.isArray(bricks) ? bricks : [];
    if (!list.length) {
      return {
        totalCount: 0,
        maxHeight: 0,
        footprintSpread: 0,
        symmetryScore: 100,
        stabilityHint: "空坛待筑",
        elementRatio: { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 },
        dominantElement: "土",
        mysticItems: [],
        archetype: "虚室生白",
        summaryText: "坛上尚未落砖，虚室生白，静待起念。"
      };
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let maxHeight = 0;
    let groundArea = 0;
    let upperCount = 0;
    const elemCounts = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
    const mysticSet = new Set();
    const catCounts = { basic: 0, plate: 0, slope: 0, arch: 0, mystic: 0 };
    const cellSet = new Set();

    for (const b of list) {
      const { w, h, d, def } = getOrientedDims(b.type, b.rot);
      const col = COLOR_MAP[b.color] || COLOR_PALETTE[0];
      elemCounts[col.element] = (elemCounts[col.element] || 0) + 1;
      catCounts[def.cat] = (catCounts[def.cat] || 0) + 1;
      if (def.cat === "mystic") mysticSet.add(def.name);

      minX = Math.min(minX, b.gx);
      maxX = Math.max(maxX, b.gx + w - 1);
      minZ = Math.min(minZ, b.gz);
      maxZ = Math.max(maxZ, b.gz + d - 1);
      maxHeight = Math.max(maxHeight, b.gy + h);
      if (b.gy === 0) groundArea += w * d;
      else upperCount += 1;

      for (let dx = 0; dx < w; dx++) {
        for (let dz = 0; dz < d; dz++) {
          cellSet.add(`${b.gx + dx},${b.gy},${b.gz + dz}`);
        }
      }
    }

    const spreadX = maxX - minX + 1;
    const spreadZ = maxZ - minZ + 1;
    const footprintSpread = Math.max(spreadX, spreadZ);
    const midX = (minX + maxX) / 2;

    // 计算左右对称度
    let symHits = 0;
    for (const key of cellSet) {
      const [cx, cy, cz] = key.split(",").map(Number);
      const mx = Math.round(2 * midX - cx);
      if (cellSet.has(`${mx},${cy},${cz}`)) symHits += 1;
    }
    const symmetryScore = cellSet.size ? Math.round((symHits / cellSet.size) * 100) : 100;

    // 稳度评估
    let stabilityHint = "四平八稳，根基扎实";
    if (maxHeight >= 5 && groundArea <= 6) stabilityHint = "高耸危立，险中求胜";
    else if (upperCount > list.length * 0.65) stabilityHint = "重心偏高，锋芒外露";
    else if (groundArea >= 16 && maxHeight <= 2) stabilityHint = "广布阵脚，厚积薄发";

    // 主导五行
    let dominantElement = "土";
    let bestElemN = -1;
    for (const [el, cnt] of Object.entries(elemCounts)) {
      if (cnt > bestElemN) {
        bestElemN = cnt;
        dominantElement = el;
      }
    }
    const elementRatio = {};
    for (const [el, cnt] of Object.entries(elemCounts)) {
      elementRatio[el] = Math.round((cnt / list.length) * 100);
    }

    // 格局原型判定
    let archetype = "稳步筑台";
    if (maxHeight >= 5) archetype = "高塔登临";
    else if (catCounts.arch >= 2) archetype = "门庭洞开";
    else if (catCounts.mystic >= 2) archetype = "灵坛通玄";
    else if (catCounts.slope >= 2) archetype = "飞檐庇佑";
    else if (footprintSpread >= 6) archetype = "广厦经纬";

    const mysticItems = Array.from(mysticSet);
    const elemStr = Object.entries(elementRatio)
      .filter(([, pct]) => pct > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([el, pct]) => `${el}${pct}%`)
      .join("、");

    const summaryText = `共落 ${list.length} 块积木，最高 ${maxHeight} 层，跨度 ${spreadX}×${spreadZ}，对称度 ${symmetryScore}%，格局「${archetype}」（${stabilityHint}）；五行色泽以【${dominantElement}】为主（${elemStr}）${mysticItems.length ? `；坛中安放灵物：${mysticItems.join("、")}` : ""}。`;

    return {
      totalCount: list.length,
      maxHeight,
      footprintSpread,
      symmetryScore,
      stabilityHint,
      elementRatio,
      dominantElement,
      mysticItems,
      archetype,
      summaryText
    };
  }

  // ==========================================
  // 3. 6 大建筑原型骨架 & 玩家 3 套范例 & 蓝图防穿模清洗器
  // ==========================================
  function buildFromRawList(rawSpecs) {
    let bricks = [];
    for (const sp of rawSpecs) {
      const res = placeBrick(bricks, sp);
      if (res.ok) bricks = res.bricks;
    }
    return bricks;
  }

  function buildArchetypeSkeleton(archetype = "pavilion", primary = "cinnabar", accent = "gold") {
    const p = COLOR_MAP[primary] ? primary : "cinnabar";
    const a = COLOR_MAP[accent] ? accent : "gold";
    const base = "ochre";
    const jade = "jade";

    const templates = {
      tower: [
        { type: "plate_4x4", gx: -2, gz: -2, color: base },
        { type: "brick_2x2", gx: -1, gz: -1, color: p },
        { type: "brick_2x2", gx: -1, gz: -1, color: jade },
        { type: "round_2x2", gx: -1, gz: -1, color: p },
        { type: "roof_2x2", gx: -1, gz: -1, color: a },
        { type: "spire_1x1", gx: -1, gz: -1, color: a },
        { type: "lantern_1x1", gx: -2, gz: 1, color: a },
        { type: "lantern_1x1", gx: 1, gz: 1, color: a }
      ],
      pavilion: [
        { type: "plate_4x4", gx: -2, gz: -2, color: base },
        { type: "pillar_1x1", gx: -2, gz: -2, color: p },
        { type: "pillar_1x1", gx: 1, gz: -2, color: p },
        { type: "pillar_1x1", gx: -2, gz: 1, color: p },
        { type: "pillar_1x1", gx: 1, gz: 1, color: p },
        { type: "brick_2x4", gx: -2, gz: -2, color: jade },
        { type: "brick_2x4", gx: -2, gz: 0, color: jade },
        { type: "roof_2x2", gx: -1, gz: -1, color: a },
        { type: "ding_1x1", gx: 0, gz: 0, color: a }
      ],
      altar: [
        { type: "plate_4x4", gx: -2, gz: -2, color: "ink" },
        { type: "round_2x2", gx: -1, gz: -1, color: p },
        { type: "orb_1x1", gx: 0, gz: 0, color: a },
        { type: "lantern_1x1", gx: -2, gz: -2, color: a },
        { type: "lantern_1x1", gx: 1, gz: -2, color: a },
        { type: "lantern_1x1", gx: -2, gz: 1, color: a },
        { type: "lantern_1x1", gx: 1, gz: 1, color: a },
        { type: "plate_2x2", gx: -1, gz: 2, color: jade }
      ],
      gate: [
        { type: "brick_1x2", gx: -3, gz: 0, color: base },
        { type: "brick_1x2", gx: 1, gz: 0, color: base },
        { type: "arch_1x3", gx: -2, gz: 0, color: p },
        { type: "pillar_1x1", gx: -3, gz: 0, color: jade },
        { type: "pillar_1x1", gx: 2, gz: 0, color: jade },
        { type: "slope_1x2", gx: -3, gz: 0, color: a },
        { type: "slope_1x2", gx: 1, gz: 0, color: a },
        { type: "orb_1x1", gx: -1, gz: 0, color: a },
        { type: "ding_1x1", gx: -1, gz: 2, color: p }
      ],
      bridge: [
        { type: "brick_2x2", gx: -4, gz: -1, color: base },
        { type: "brick_2x2", gx: 2, gz: -1, color: base },
        { type: "arch_1x3", gx: -2, gz: -1, color: jade },
        { type: "arch_1x3", gx: -2, gz: 0, color: jade },
        { type: "plate_2x2", gx: -1, gz: -1, color: p },
        { type: "slope_1x2", gx: -3, gz: -1, color: a },
        { type: "slope_1x2", gx: 1, gz: -1, color: a },
        { type: "lantern_1x1", gx: -4, gz: 0, color: a },
        { type: "lantern_1x1", gx: 3, gz: 0, color: a }
      ],
      garden: [
        { type: "plate_4x4", gx: -2, gz: -2, color: "celadon" },
        { type: "pillar_1x1", gx: -2, gz: -2, color: p },
        { type: "brick_1x2", gx: -1, gz: -2, color: jade },
        { type: "arch_1x3", gx: -1, gz: 1, color: p },
        { type: "ding_1x1", gx: 0, gz: -1, color: a },
        { type: "orb_1x1", gx: -1, gz: 0, color: "azure" },
        { type: "lantern_1x1", gx: 1, gz: -2, color: a },
        { type: "spire_1x1", gx: 1, gz: 1, color: a }
      ]
    };
    return buildFromRawList(templates[archetype] || templates.pavilion);
  }

  const PRESET_BUILDS = [
    { id: "preset_pavilion", icon: "🏮", name: "广陵阙楼", build: () => buildArchetypeSkeleton("pavilion", "cinnabar", "gold") },
    { id: "preset_altar", icon: "🔮", name: "紫微祭坛", build: () => buildArchetypeSkeleton("altar", "purple", "gold") },
    { id: "preset_tower", icon: "🗼", name: "观星高台", build: () => buildArchetypeSkeleton("tower", "azure", "jade") }
  ];

  /**
   * 蓝图防幻觉与重力落位清洗器：
   * 把 LLM 输出的骨架原型 + 自定义砖块全部经严格碰撞校验与重力落位，保证 0 穿模 0 悬空
   */
  function sanitizeAndGroundBlueprint(raw = {}) {
    const validArchetypes = ["tower", "pavilion", "altar", "gate", "bridge", "garden"];
    const arch = validArchetypes.includes(raw.baseArchetype) ? raw.baseArchetype : "pavilion";
    const primary = COLOR_MAP[raw.primaryColor] ? raw.primaryColor : "cinnabar";
    const accent = COLOR_MAP[raw.accentColor] ? raw.accentColor : "gold";

    let bricks = buildArchetypeSkeleton(arch, primary, accent);
    const extras = Array.isArray(raw.customBricks) ? raw.customBricks.slice(0, 14) : [];
    for (const item of extras) {
      if (!item || typeof item !== "object") continue;
      const res = placeBrick(bricks, {
        type: BRICK_MAP[item.type] ? item.type : "brick_1x1",
        gx: Number(item.gx) || 0,
        gz: Number(item.gz) || 0,
        rot: Number(item.rot) || 0,
        color: COLOR_MAP[item.color] ? item.color : accent
      });
      if (res.ok) bricks = res.bricks;
    }
    return bricks;
  }

  // ==========================================
  // 4. Three.js r128 参数化乐高积木建模器（含材质缓存防发热）
  // ==========================================
  const _matCache = new Map();
  let _studGeoCache = null;

  function getCachedMaterial(THREE, colorId, { ghost = false, emissive = false, transparent = false } = {}) {
    const key = `${colorId}_${ghost ? 1 : 0}_${emissive ? 1 : 0}_${transparent ? 1 : 0}`;
    if (_matCache.has(key)) return _matCache.get(key);
    const col = (COLOR_MAP[colorId] || COLOR_PALETTE[0]).hex;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(col),
      roughness: emissive ? 0.25 : 0.42,
      metalness: colorId === "gold" ? 0.38 : 0.08,
      emissive: emissive ? new THREE.Color(col) : new THREE.Color("#000000"),
      emissiveIntensity: emissive ? 0.55 : 0,
      transparent: ghost || transparent,
      opacity: ghost ? 0.45 : transparent ? 0.78 : 1.0
    });
    _matCache.set(key, mat);
    return mat;
  }

  function brickGridToWorld(brick) {
    const { w, h, d } = getOrientedDims(brick.type, brick.rot);
    return {
      wx: (brick.gx + w / 2) * CELL_SIZE,
      wy: brick.gy * LAYER_HEIGHT,
      wz: (brick.gz + d / 2) * CELL_SIZE,
      w,
      h,
      d
    };
  }

  function createBrickMesh(THREE, brick, { ghost = false } = {}) {
    const def = BRICK_MAP[brick.type] || BRICK_MAP.brick_1x1;
    const { wx, wy, wz, w, h, d } = brickGridToWorld(brick);
    const group = new THREE.Group();
    group.position.set(wx, wy, wz);
    group.userData = { brickId: brick.id, brick };

    const isGlowing = def.shape === "orb" || def.shape === "lantern";
    const mat = getCachedMaterial(THREE, brick.color, {
      ghost,
      emissive: isGlowing,
      transparent: def.shape === "orb"
    });
    const trimMat = getCachedMaterial(THREE, "gold", { ghost, emissive: def.shape === "lantern" });

    const bw = w * CELL_SIZE - 0.04;
    const bd = d * CELL_SIZE - 0.04;
    const bh = def.shape === "plate" || def.shape === "tile" ? LAYER_HEIGHT * 0.48 : h * LAYER_HEIGHT - 0.02;

    if (!_studGeoCache) {
      _studGeoCache = new THREE.CylinderGeometry(0.24, 0.24, 0.14, 14);
    }

    const addStuds = (topY) => {
      if (!def.studs) return;
      for (let ix = 0; ix < w; ix++) {
        for (let iz = 0; iz < d; iz++) {
          const stud = new THREE.Mesh(_studGeoCache, mat);
          stud.position.set((ix - (w - 1) / 2) * CELL_SIZE, topY + 0.06, (iz - (d - 1) / 2) * CELL_SIZE);
          stud.castShadow = !ghost;
          stud.receiveShadow = !ghost;
          group.add(stud);
        }
      }
    };

    if (def.shape === "box" || def.shape === "plate" || def.shape === "tile") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      body.position.y = bh / 2;
      body.castShadow = !ghost;
      body.receiveShadow = !ghost;
      group.add(body);
      addStuds(bh);
    } else if (def.shape === "slope") {
      // 阶梯飞檐斜坡（兼容旋转）
      const base = new THREE.Mesh(new THREE.BoxGeometry(bw, bh * 0.45, bd), mat);
      base.position.y = bh * 0.225;
      group.add(base);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.55, bh * 0.55, bd * 0.96), mat);
      upper.position.set(-bw * 0.2, bh * 0.72, 0);
      group.add(upper);
      const slant = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.62, bh * 0.22, bd * 0.94), mat);
      slant.position.set(bw * 0.12, bh * 0.65, 0);
      slant.rotation.z = -0.58;
      group.add(slant);
    } else if (def.shape === "bracket") {
      const top = new THREE.Mesh(new THREE.BoxGeometry(bw, bh * 0.45, bd), mat);
      top.position.y = bh * 0.76;
      group.add(top);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.52, bh * 0.55, bd * 0.92), mat);
      foot.position.set(-bw * 0.22, bh * 0.28, 0);
      group.add(foot);
      addStuds(bh);
    } else if (def.shape === "pyramid") {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.min(bw, bd) * 0.72, bh * 1.15, 4), mat);
      cone.position.y = bh * 0.58;
      cone.rotation.y = Math.PI / 4;
      cone.castShadow = !ghost;
      group.add(cone);
    } else if (def.shape === "pillar") {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.16, bd), mat);
      plinth.position.y = 0.08;
      group.add(plinth);
      const colMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, bh - 0.24, 16), mat);
      colMesh.position.y = bh / 2;
      colMesh.castShadow = !ghost;
      group.add(colMesh);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.16, bd), mat);
      cap.position.y = bh - 0.08;
      group.add(cap);
      addStuds(bh);
    } else if (def.shape === "arch") {
      const spanX = w >= d;
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(spanX ? 0.85 : bw, bh, spanX ? bd : 0.85), mat);
      const p2 = p1.clone();
      const offset = (Math.max(w, d) / 2 - 0.5) * CELL_SIZE;
      if (spanX) { p1.position.set(-offset, bh / 2, 0); p2.position.set(offset, bh / 2, 0); }
      else { p1.position.set(0, bh / 2, -offset); p2.position.set(0, bh / 2, offset); }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(bw, LAYER_HEIGHT * 0.58, bd), mat);
      lintel.position.y = bh - LAYER_HEIGHT * 0.29;
      group.add(p1, p2, lintel);
      addStuds(bh);
    } else if (def.shape === "round") {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.5, bw * 0.5, bh, 22), mat);
      cyl.position.y = bh / 2;
      cyl.castShadow = !ghost;
      group.add(cyl);
      addStuds(bh);
    } else if (def.shape === "orb") {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.22, 14), trimMat);
      ped.position.y = 0.11;
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 16), mat);
      sphere.position.y = 0.48;
      group.add(ped, sphere);
    } else if (def.shape === "lantern") {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.16, 8), trimMat);
      base.position.y = 0.08;
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.42, 8), mat);
      glow.position.y = 0.36;
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.2, 8), trimMat);
      hat.position.y = 0.66;
      group.add(base, glow, hat);
    } else if (def.shape === "ding") {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.26, 0.42, 12), mat);
      bowl.position.y = 0.44;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 16), trimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.65;
      group.add(bowl, rim);
      for (let k = 0; k < 3; k++) {
        const ang = (k * Math.PI * 2) / 3;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.28, 8), mat);
        leg.position.set(Math.cos(ang) * 0.22, 0.14, Math.sin(ang) * 0.22);
        group.add(leg);
      }
    } else if (def.shape === "spire") {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.3, 0.84), mat);
      ped.position.y = 0.15;
      const needle = new THREE.Mesh(new THREE.ConeGeometry(0.32, bh - 0.22, 6), mat);
      needle.position.y = 0.3 + (bh - 0.22) / 2;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), trimMat);
      tip.position.y = bh + 0.06;
      group.add(ped, needle, tip);
    }

    return group;
  }

  function disposeCache() {
    for (const m of _matCache.values()) {
      try { m.dispose(); } catch (e) { }
    }
    _matCache.clear();
    if (_studGeoCache) {
      try { _studGeoCache.dispose(); } catch (e) { }
      _studGeoCache = null;
    }
  }

  const api = {
    GRID_MIN,
    GRID_MAX,
    MAX_HEIGHT,
    CELL_SIZE,
    LAYER_HEIGHT,
    COLOR_PALETTE,
    COLOR_MAP,
    BRICK_CATEGORIES,
    BRICK_CATALOG,
    BRICK_MAP,
    PRESET_BUILDS,
    normalizeRot,
    getOrientedDims,
    clampToBoard,
    getFootprintCells,
    findLandingY,
    placeBrick,
    removeBrick,
    analyzeStructure,
    buildArchetypeSkeleton,
    sanitizeAndGroundBlueprint,
    brickGridToWorld,
    createBrickMesh,
    disposeCache
  };

  global.ChenweiLegoBricks = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

