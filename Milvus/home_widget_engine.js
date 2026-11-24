/**
 * Milvus/home_widget_engine.js
 * 「主屏幕桌面布局升级 & 多尺寸小组件系统」核心占位引擎与独立 IndexedDB 持久化模块
 * - 严格 4 列网格（1 格 = 1 应用图标），支持 2×1（横双格）、3×1（横三格）、2×2（正方四格）
 * - 第 1 页 4×4（16 格），第 2 页及后续扩展页 4×5（20 格），动态无限扩容
 * - 确定性碰撞检测 + 空位自动寻址 + 100% 无损应用图标流式顺延回填（绝不丢图标、绝不重叠）
 * - 独立 IndexedDB: milvus_home_widgets_idb（零 localStorage 写入，大图相框独立分表）
 */
(function (global) {
  "use strict";

  const COLS = 4;
  const DB_NAME = "milvus_home_widgets_idb";
  const DB_VERSION = 1;
  const STORE_CONFIG = "widget_config";
  const STORE_MEDIA = "widget_media";
  const CONFIG_KEY = "home_widgets_v1";

  const SIZE_SPECS = {
    "2x1": { id: "2x1", label: "横双格", short: "2×1", w: 2, h: 1 },
    "3x1": { id: "3x1", label: "横三格", short: "3×1", w: 3, h: 1 },
    "4x1": { id: "4x1", label: "整行四格", short: "4×1", w: 4, h: 1 },
    "2x2": { id: "2x2", label: "方四格", short: "2×2", w: 2, h: 2 }
  };

  const SKIN_PRESETS = {
    glass: {
      id: "glass",
      name: "浅雾毛玻璃",
      bg: "rgba(255, 255, 255, 0.72)",
      border: "rgba(255, 255, 255, 0.65)",
      text: "#3A4233",
      subText: "#6E7766",
      accent: "#6D735B"
    },
    paper: {
      id: "paper",
      name: "暖宣纸白",
      bg: "rgba(250, 246, 238, 0.94)",
      border: "rgba(184, 155, 114, 0.36)",
      text: "#3E342B",
      subText: "#8C7A68",
      accent: "#C84B31"
    },
    ink: {
      id: "ink",
      name: "深墨琉璃",
      bg: "rgba(32, 36, 42, 0.84)",
      border: "rgba(255, 255, 255, 0.16)",
      text: "#F6F3EC",
      subText: "#B9C0C8",
      accent: "#E3B86A"
    }
  };

  const WIDGET_CATALOG = [
    {
      type: "clock",
      name: "时辰节气钟",
      desc: "实时数字时间、东汉十二时辰与农历日期",
      sizes: ["2x1", "3x1", "2x2"],
      defaultSize: "2x1",
      defaultSkin: "glass"
    },
    {
      type: "couple_days",
      name: "情侣纪念日",
      desc: "同步情侣空间自动校准天数、TA头像与亲密状态",
      sizes: ["2x1", "3x1", "2x2"],
      defaultSize: "2x1",
      defaultSkin: "paper"
    },
    {
      type: "photo",
      name: "自由相框",
      desc: "上传本地高清照片存至 IndexedDB，可配底部手写小字",
      sizes: ["2x1", "3x1", "2x2"],
      defaultSize: "2x2",
      defaultSkin: "paper"
    },
    {
      type: "char_quote",
      name: "名士语录签",
      desc: "绑定一位传讯名士，在桌面常伴一句温柔叮嘱",
      sizes: ["2x1", "3x1", "2x2"],
      defaultSize: "3x1",
      defaultSkin: "glass"
    },
    {
      type: "music",
      name: "留声机控台",
      desc: "同步音乐播放器实时曲目与进度，支持自定义封面存 IndexedDB",
      sizes: ["2x1", "3x1", "4x1", "2x2"],
      defaultSize: "3x1",
      defaultSkin: "glass"
    },
    {
      type: "fold_card",
      name: "折叠式卡片",
      desc: "名士天气叮嘱与折叠展开卡片，放入桌面后自动替换顶部固定卡片",
      sizes: ["3x1", "4x1", "2x2"],
      defaultSize: "4x1",
      defaultSkin: "glass"
    },
    {
      type: "calendar",
      name: "日程便签",
      desc: "同步日历重要事项与待办，重要日子一眼可见",
      sizes: ["3x1", "2x2"],
      defaultSize: "3x1",
      defaultSkin: "paper"
    }
  ];
  const CATALOG_MAP = Object.fromEntries(WIDGET_CATALOG.map((w) => [w.type, w]));

  function getRowsForPage(pageIndex, allWidgets = null, topSlotsMap = null) {
    // 每页若顶部存在横幅（默认页眉/折叠卡 或 顶部小组件），固定 3 行（4×3=12格）确保手机端底部 Dock 栏 100% 可见；
    // 仅当该页顶部显式「隐藏顶部」（或第 1 页已将折叠卡移入网格且未设顶部横幅）时，才释放为 4 行（16格）。
    const slots = topSlotsMap || _memTopSlots || {};
    const topSlot = slots[String(pageIndex)];
    if (topSlot && topSlot.hidden) return 4;
    if (pageIndex === 0 && !topSlot) {
      const hasFoldWidget = Array.isArray(allWidgets) && allWidgets.some((w) => w && w.enabled !== false && w.type === "fold_card");
      if (hasFoldWidget) return 4;
    }
    return 3;
  }

  function getSizeSpec(sizeId) {
    return SIZE_SPECS[sizeId] || SIZE_SPECS["2x1"];
  }

  // ==========================================
  // 1. 东汉十二时辰换算
  // ==========================================
  function getChineseShichen(date = new Date()) {
    const h = date.getHours();
    const list = [
      { name: "子时", alias: "夜半" },
      { name: "丑时", alias: "鸡鸣" },
      { name: "寅时", alias: "平旦" },
      { name: "卯时", alias: "日出" },
      { name: "辰时", alias: "食时" },
      { name: "巳时", alias: "隅中" },
      { name: "午时", alias: "日中" },
      { name: "未时", alias: "日昳" },
      { name: "申时", alias: "哺时" },
      { name: "酉时", alias: "日入" },
      { name: "戌时", alias: "黄昏" },
      { name: "亥时", alias: "人定" }
    ];
    const idx = Math.floor(((h + 1) % 24) / 2);
    return list[idx] || list[0];
  }

  // ==========================================
  // 2. 4 列网格占用、碰撞检测与自动寻位
  // ==========================================
  function createEmptyGrid(rows) {
    return Array.from({ length: rows }, () => Array(COLS).fill(null));
  }

  function canPlaceRect(grid, row, col, w, h, rows) {
    if (row < 0 || col < 0 || col + w > COLS || row + h > rows) return false;
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        if (grid[r][c] !== null) return false;
      }
    }
    return true;
  }

  function markRect(grid, row, col, w, h, marker) {
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        grid[r][c] = marker;
      }
    }
  }

  function buildPageWidgetGrid(allWidgets, pageIndex, excludeId = null) {
    const rows = getRowsForPage(pageIndex, allWidgets);
    const grid = createEmptyGrid(rows);
    for (const w of allWidgets || []) {
      if (!w || w.enabled === false || w.pageIndex !== pageIndex || w.id === excludeId) continue;
      const sp = getSizeSpec(w.size);
      const r = Math.max(0, Math.min(rows - sp.h, Number(w.row) || 0));
      const c = Math.max(0, Math.min(COLS - sp.w, Number(w.col) || 0));
      if (canPlaceRect(grid, r, c, sp.w, sp.h, rows)) {
        markRect(grid, r, c, sp.w, sp.h, w.id);
      }
    }
    return { grid, rows };
  }

  function findFirstFitOnPage(allWidgets, sizeId, pageIndex, excludeId = null) {
    const sp = getSizeSpec(sizeId);
    const { grid, rows } = buildPageWidgetGrid(allWidgets, pageIndex, excludeId);
    for (let r = 0; r <= rows - sp.h; r++) {
      for (let c = 0; c <= COLS - sp.w; c++) {
        if (canPlaceRect(grid, r, c, sp.w, sp.h, rows)) {
          return { pageIndex, row: r, col: c };
        }
      }
    }
    return null;
  }

  function findFirstFitAcrossPages(allWidgets, sizeId, preferredPage = 0, excludeId = null) {
    const startPage = Math.max(0, Math.floor(Number(preferredPage) || 0));
    for (let p = startPage; p < startPage + 8; p++) {
      const hit = findFirstFitOnPage(allWidgets, sizeId, p, excludeId);
      if (hit) return hit;
    }
    return { pageIndex: startPage + 1, row: 0, col: 0 };
  }

  let _widSeq = 1;
  function addWidgetInstance(allWidgets, { type = "clock", size, pageIndex = 0, row, col, skin, customCss = "", config = {} } = {}) {
    const meta = CATALOG_MAP[type] || WIDGET_CATALOG[0];
    const safeSize = size && meta.sizes.includes(size) ? size : meta.defaultSize;
    const sp = getSizeSpec(safeSize);
    const targetPage = Math.max(0, Math.floor(Number(pageIndex) || 0));

    let placement = null;
    if (typeof row === "number" && typeof col === "number") {
      const { grid, rows } = buildPageWidgetGrid(allWidgets, targetPage);
      if (canPlaceRect(grid, row, col, sp.w, sp.h, rows)) {
        placement = { pageIndex: targetPage, row, col };
      }
    }
    if (!placement) {
      placement = findFirstFitAcrossPages(allWidgets, safeSize, targetPage);
    }

    const widget = {
      id: `hw_${Date.now()}_${_widSeq++}`,
      type: meta.type,
      size: safeSize,
      pageIndex: placement.pageIndex,
      row: placement.row,
      col: placement.col,
      skin: SKIN_PRESETS[skin] ? skin : meta.defaultSkin,
      customCss: typeof customCss === "string" ? customCss : "",
      enabled: true,
      config: { ...config }
    };
    return {
      ok: true,
      widget,
      movedToPage: placement.pageIndex !== targetPage ? placement.pageIndex : null,
      widgets: [...(allWidgets || []), widget]
    };
  }

  function updateWidgetInstance(allWidgets, widgetId, patch = {}) {
    const list = Array.isArray(allWidgets) ? allWidgets.slice() : [];
    const idx = list.findIndex((w) => w.id === widgetId);
    if (idx < 0) return { ok: false, error: "NOT_FOUND", widgets: list };

    const cur = list[idx];
    const meta = CATALOG_MAP[cur.type] || WIDGET_CATALOG[0];
    const nextSize = patch.size && meta.sizes.includes(patch.size) ? patch.size : cur.size;
    const sp = getSizeSpec(nextSize);
    const nextPage = patch.pageIndex !== undefined ? Math.max(0, Math.floor(Number(patch.pageIndex) || 0)) : cur.pageIndex;
    const rows = getRowsForPage(nextPage, list);
    let nextRow = patch.row !== undefined ? Math.max(0, Math.min(rows - sp.h, Math.floor(Number(patch.row) || 0))) : Math.min(rows - sp.h, cur.row);
    let nextCol = patch.col !== undefined ? Math.max(0, Math.min(COLS - sp.w, Math.floor(Number(patch.col) || 0))) : Math.min(COLS - sp.w, cur.col);

    // 冲突检测：若目标槽位冲突，自动就近寻找合法空位
    const { grid } = buildPageWidgetGrid(list, nextPage, widgetId);
    let finalPage = nextPage;
    if (!canPlaceRect(grid, nextRow, nextCol, sp.w, sp.h, rows)) {
      const fit = findFirstFitAcrossPages(list, nextSize, nextPage, widgetId);
      finalPage = fit.pageIndex;
      nextRow = fit.row;
      nextCol = fit.col;
    }

    const updated = {
      ...cur,
      ...patch,
      size: nextSize,
      pageIndex: finalPage,
      row: nextRow,
      col: nextCol,
      skin: patch.skin && SKIN_PRESETS[patch.skin] ? patch.skin : cur.skin,
      config: patch.config ? { ...(cur.config || {}), ...patch.config } : (cur.config || {})
    };
    list[idx] = updated;
    return { ok: true, widget: updated, widgets: list };
  }

  function removeWidgetInstance(allWidgets, widgetId) {
    return (allWidgets || []).filter((w) => w.id !== widgetId);
  }

  // ==========================================
  // 3. 多页「小组件 + 应用图标」无损混排引擎
  // ==========================================
  function computeAllPagesLayout(appIcons = [], widgets = [], { storeItem = null, minPages = 3 } = {}) {
    const validApps = (Array.isArray(appIcons) ? appIcons : []).filter(Boolean);
    const activeWidgets = (Array.isArray(widgets) ? widgets : []).filter((w) => w && w.enabled !== false);

    let maxWidgetPage = 0;
    for (const w of activeWidgets) {
      if ((w.pageIndex || 0) > maxWidgetPage) maxWidgetPage = w.pageIndex;
    }

    const pages = [];
    const ensurePage = (pIdx) => {
      while (pages.length <= pIdx) {
        const pi = pages.length;
        const rows = getRowsForPage(pi, activeWidgets);
        pages.push({
          pageIndex: pi,
          rows,
          cols: COLS,
          grid: createEmptyGrid(rows),
          items: []
        });
      }
      return pages[pIdx];
    };

    const basePages = Math.max(minPages, maxWidgetPage + 1);
    for (let i = 0; i < basePages; i++) ensurePage(i);

    // 1. 先放置所有小组件（保证绝对零重叠）
    for (const w of activeWidgets) {
      const sp = getSizeSpec(w.size);
      let pIdx = Math.max(0, Math.floor(Number(w.pageIndex) || 0));
      let page = ensurePage(pIdx);
      let r = Math.max(0, Math.min(page.rows - sp.h, Number(w.row) || 0));
      let c = Math.max(0, Math.min(COLS - sp.w, Number(w.col) || 0));

      if (!canPlaceRect(page.grid, r, c, sp.w, sp.h, page.rows)) {
        // 寻找本页或后续页第一个合法空位
        let placed = false;
        for (let tryP = pIdx; tryP < pIdx + 8 && !placed; tryP++) {
          const tp = ensurePage(tryP);
          for (let tr = 0; tr <= tp.rows - sp.h && !placed; tr++) {
            for (let tc = 0; tc <= COLS - sp.w && !placed; tc++) {
              if (canPlaceRect(tp.grid, tr, tc, sp.w, sp.h, tp.rows)) {
                page = tp;
                r = tr;
                c = tc;
                placed = true;
              }
            }
          }
        }
      }

      markRect(page.grid, r, c, sp.w, sp.h, w.id);
      page.items.push({
        kind: "widget",
        id: w.id,
        row: r,
        col: c,
        w: sp.w,
        h: sp.h,
        widget: w
      });
    }

    // 2. 第 2 页（index=1）优先保留常驻「商城」图标在第一个空位
    if (storeItem) {
      const p1 = ensurePage(1);
      let placedStore = false;
      for (let r = 0; r < p1.rows && !placedStore; r++) {
        for (let c = 0; c < COLS && !placedStore; c++) {
          if (p1.grid[r][c] === null) {
            p1.grid[r][c] = "__store__";
            p1.items.push({
              kind: "app",
              id: storeItem.actionId || storeItem.id || "appstore",
              row: r,
              col: c,
              w: 1,
              h: 1,
              app: storeItem,
              slotIndex: r * COLS + c
            });
            placedStore = true;
          }
        }
      }
    }

    // 3. 将所有普通应用图标流式无损回填到各页剩余 1×1 空槽位
    let curPageIdx = 0;
    for (let appIdx = 0; appIdx < validApps.length; appIdx++) {
      const app = validApps[appIdx];
      let placed = false;
      while (!placed) {
        const page = ensurePage(curPageIdx);
        for (let r = 0; r < page.rows && !placed; r++) {
          for (let c = 0; c < COLS && !placed; c++) {
            if (page.grid[r][c] === null) {
              page.grid[r][c] = `app_${appIdx}`;
              page.items.push({
                kind: "app",
                id: app.actionId || app.id || app.label || `app_${appIdx}`,
                row: r,
                col: c,
                w: 1,
                h: 1,
                app,
                appIndex: appIdx,
                slotIndex: r * COLS + c
              });
              placed = true;
            }
          }
        }
        if (!placed) curPageIdx += 1;
      }
    }

    return {
      totalPages: pages.length,
      pages: pages.map((p) => ({
        pageIndex: p.pageIndex,
        rows: p.rows,
        cols: COLS,
        items: p.items
      }))
    };
  }

  // ==========================================
  // 4. 独立 IndexedDB 持久化 + 实时订阅总线
  // ==========================================
  let _dbPromise = null;
  let _memWidgets = [];
  const _memMedia = new Map();
  const _listeners = new Set();

  function openDb() {
    if (typeof indexedDB === "undefined" || !indexedDB) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_CONFIG)) {
            db.createObjectStore(STORE_CONFIG, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_MEDIA)) {
            db.createObjectStore(STORE_MEDIA, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return _dbPromise;
  }

  function subscribe(fn) {
    if (typeof fn === "function") _listeners.add(fn);
    return () => _listeners.delete(fn);
  }

  function notify(widgets) {
    for (const fn of _listeners) {
      try { fn(widgets); } catch (e) {}
    }
  }

  async function loadWidgets() {
    const db = await openDb();
    if (!db) return _memWidgets.slice();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CONFIG, "readonly");
        const req = tx.objectStore(STORE_CONFIG).get(CONFIG_KEY);
        req.onsuccess = () => {
          const list = Array.isArray(req.result?.value) ? req.result.value : [];
          _memWidgets = list;
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  async function saveWidgets(widgets) {
    const clean = Array.isArray(widgets) ? widgets : [];
    _memWidgets = clean;
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_CONFIG, "readwrite");
          tx.objectStore(STORE_CONFIG).put({ id: CONFIG_KEY, value: clean, updatedAt: Date.now() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    }
    notify(clean);
    return clean;
  }

  async function saveWidgetMedia(mediaId, dataUrl) {
    const id = String(mediaId || `wm_${Date.now()}`);
    _memMedia.set(id, dataUrl);
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_MEDIA, "readwrite");
          if (dataUrl) tx.objectStore(STORE_MEDIA).put({ id, value: dataUrl, updatedAt: Date.now() });
          else tx.objectStore(STORE_MEDIA).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    }
    return id;
  }

  async function loadWidgetMedia(mediaId) {
    if (!mediaId) return "";
    const id = String(mediaId);
    if (_memMedia.has(id)) return _memMedia.get(id) || "";
    const db = await openDb();
    if (!db) return "";
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_MEDIA, "readonly");
        const req = tx.objectStore(STORE_MEDIA).get(id);
        req.onsuccess = () => {
          const val = req.result?.value || "";
          if (val) _memMedia.set(id, val);
          resolve(val);
        };
        req.onerror = () => resolve("");
      } catch (e) { resolve(""); }
    });
  }

  const TYPE_CSS_KEY = "home_widget_type_css_v1";
  const CSS_PRESETS_KEY = "home_widget_css_presets_v1";
  const TOP_SLOTS_KEY = "home_widget_top_slots_v1";
  let _memTypeCss = {};
  let _memCssPresets = [];
  let _memTopSlots = {};
  const _cssListeners = new Set();
  const _topSlotListeners = new Set();

  function subscribeTopSlots(fn) {
    if (typeof fn === "function") _topSlotListeners.add(fn);
    return () => _topSlotListeners.delete(fn);
  }

  function notifyTopSlots(map) {
    for (const fn of _topSlotListeners) {
      try { fn(map); } catch (e) {}
    }
  }

  async function loadTopSlots() {
    const db = await openDb();
    if (!db) return { ..._memTopSlots };
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CONFIG, "readonly");
        const req = tx.objectStore(STORE_CONFIG).get(TOP_SLOTS_KEY);
        req.onsuccess = () => {
          const val = req.result?.value && typeof req.result.value === "object" ? req.result.value : {};
          _memTopSlots = { ...val };
          resolve({ ...val });
        };
        req.onerror = () => resolve({ ..._memTopSlots });
      } catch (e) { resolve({ ..._memTopSlots }); }
    });
  }

  async function saveTopSlot(pageIndex, slotWidgetOrNull) {
    const key = String(Math.max(0, Math.floor(Number(pageIndex) || 0)));
    const next = { ..._memTopSlots };
    if (!slotWidgetOrNull) {
      delete next[key];
    } else if (slotWidgetOrNull.hidden) {
      next[key] = { id: `top_p${key}`, hidden: true };
    } else {
      const meta = CATALOG_MAP[slotWidgetOrNull.type] || WIDGET_CATALOG[0];
      next[key] = {
        id: slotWidgetOrNull.id || `top_p${key}`,
        isTopSlot: true,
        pageIndex: Number(key),
        type: meta.type,
        size: "4x1",
        skin: SKIN_PRESETS[slotWidgetOrNull.skin] ? slotWidgetOrNull.skin : meta.defaultSkin,
        customCss: typeof slotWidgetOrNull.customCss === "string" ? slotWidgetOrNull.customCss : "",
        config: { ...(slotWidgetOrNull.config || {}) }
      };
    }
    _memTopSlots = next;
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_CONFIG, "readwrite");
          tx.objectStore(STORE_CONFIG).put({ id: TOP_SLOTS_KEY, value: next, updatedAt: Date.now() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    }
    notifyTopSlots(next);
    return next;
  }

  async function loadCssPresets() {
    const db = await openDb();
    if (!db) return _memCssPresets.slice();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CONFIG, "readonly");
        const req = tx.objectStore(STORE_CONFIG).get(CSS_PRESETS_KEY);
        req.onsuccess = () => {
          const list = Array.isArray(req.result?.value) ? req.result.value : [];
          _memCssPresets = list;
          resolve(list);
        };
        req.onerror = () => resolve(_memCssPresets.slice());
      } catch (e) { resolve(_memCssPresets.slice()); }
    });
  }

  async function saveCssPreset({ name, type, css }) {
    const cleanCss = String(css || "").trim();
    if (!cleanCss) return { ok: false, presets: _memCssPresets };
    const cleanName = String(name || "").trim() || `样式预设 ${_memCssPresets.length + 1}`;
    const item = {
      id: `cssp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName.slice(0, 20),
      type: type || "all",
      css: cleanCss,
      savedAt: Date.now()
    };
    const next = [item, ..._memCssPresets.slice(0, 39)];
    _memCssPresets = next;
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_CONFIG, "readwrite");
          tx.objectStore(STORE_CONFIG).put({ id: CSS_PRESETS_KEY, value: next, updatedAt: Date.now() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    }
    return { ok: true, preset: item, presets: next };
  }

  async function deleteCssPreset(presetId) {
    const next = _memCssPresets.filter((p) => p.id !== presetId);
    _memCssPresets = next;
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_CONFIG, "readwrite");
          tx.objectStore(STORE_CONFIG).put({ id: CSS_PRESETS_KEY, value: next, updatedAt: Date.now() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    }
    return next;
  }

  function subscribeTypeCss(fn) {
    if (typeof fn === "function") _cssListeners.add(fn);
    return () => _cssListeners.delete(fn);
  }

  function notifyTypeCss(map) {
    for (const fn of _cssListeners) {
      try { fn(map); } catch (e) {}
    }
  }

  async function loadTypeCssMap() {
    const db = await openDb();
    if (!db) return { ..._memTypeCss };
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CONFIG, "readonly");
        const req = tx.objectStore(STORE_CONFIG).get(TYPE_CSS_KEY);
        req.onsuccess = () => {
          const val = req.result?.value && typeof req.result.value === "object" ? req.result.value : {};
          _memTypeCss = { ...val };
          resolve({ ...val });
        };
        req.onerror = () => resolve({ ..._memTypeCss });
      } catch (e) { resolve({ ..._memTypeCss }); }
    });
  }

  async function saveTypeCss(type, cssText) {
    const next = { ..._memTypeCss };
    const clean = String(cssText || "");
    if (clean.trim()) next[type] = clean;
    else delete next[type];
    _memTypeCss = next;
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_CONFIG, "readwrite");
          tx.objectStore(STORE_CONFIG).put({ id: TYPE_CSS_KEY, value: next, updatedAt: Date.now() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    }
    notifyTypeCss(next);
    return next;
  }

  const api = {
    COLS,
    DB_NAME,
    SIZE_SPECS,
    SKIN_PRESETS,
    WIDGET_CATALOG,
    CATALOG_MAP,
    getRowsForPage,
    getSizeSpec,
    getChineseShichen,
    canPlaceRect,
    findFirstFitOnPage,
    findFirstFitAcrossPages,
    addWidgetInstance,
    updateWidgetInstance,
    removeWidgetInstance,
    computeAllPagesLayout,
    subscribe,
    loadWidgets,
    saveWidgets,
    subscribeTypeCss,
    loadTypeCssMap,
    saveTypeCss,
    loadCssPresets,
    saveCssPreset,
    deleteCssPreset,
    subscribeTopSlots,
    loadTopSlots,
    saveTopSlot,
    saveWidgetMedia,
    loadWidgetMedia
  };

  global.HomeWidgetEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

