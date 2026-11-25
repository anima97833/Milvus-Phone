/**
 * Milvus/home_bg_css.js
 * 「主屏幕主题背景自定义 CSS / 导入美化 / 4 套配套动效预设」独立引擎与设置面板
 * - 独立 IndexedDB: milvus_home_bg_css_idb（零 localStorage 写入）
 * - 安全作用域编译器 scopeBgCss：将 .home-bg / .dock-bg 映射至主屏桌面 (.page.page-r2)、Dock 栏与预览台
 * - 自动注入防遮挡层级保护（背景伪元素 z-index:0; pointer-events:none，桌面内容 z-index:2），绝不阻挡点击与翻页
 * - 内置 4 套与图标预设 1:1 配套的动效背景预设：厚倒角极光玻璃 / 清透水光波影 / 软绵绵糖果云朵 / 暗夜舞台聚光灯
 * - 零 Emoji（全量手绘细线矢量 SVG）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_home_bg_css_idb";
  const DB_VERSION = 1;
  const STORE_NAME = "bg_css_store";
  const STYLE_TAG_ID = "milvus-home-bg-custom-css";

  // ==========================================
  // 1. 基准默认 CSS 模板 & 4 套与图标配套的质感/动效预设
  // ==========================================
  const DEFAULT_BG_CSS = [
    "/* === 主屏幕主题背景默认 CSS（支持 ::before / ::after 动效层与 @keyframes） === */",
    "/* 提示：若只想在已上传壁纸上叠加光影滤镜，可删掉 .home-bg 的 background，仅保留 ::before/::after */",
    ".home-bg {",
    "  background: linear-gradient(160deg, #F4EFE6 0%, #EAE3D5 100%) !important;",
    "}",
    ".home-bg::before {",
    "  content: \"\";",
    "  position: absolute;",
    "  inset: 0;",
    "  background: radial-gradient(circle at 25% 20%, rgba(255, 255, 255, 0.55) 0%, transparent 55%);",
    "  pointer-events: none;",
    "}",
    ".dock-bg {",
    "  background: rgba(255, 255, 255, 0.72) !important;",
    "  backdrop-filter: blur(16px) !important;",
    "  -webkit-backdrop-filter: blur(16px) !important;",
    "  border: 1px solid rgba(255, 255, 255, 0.65) !important;",
    "}"
  ].join("\n");

  const BUILTIN_BG_PRESETS = [
    {
      id: "builtin_bg_thick_aurora",
      name: "厚倒角极光玻璃",
      builtin: true,
      css: [
        "/* === 内置预设：厚倒角极光玻璃（配套「厚倒角折射玻璃」图标） === */",
        ".home-bg {",
        "  background: linear-gradient(155deg, #D9E8F8 0%, #E7DFF4 48%, #F4E7EE 100%) !important;",
        "}",
        "/* 极光流动柔和光斑 */",
        ".home-bg::before {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: -20%;",
        "  background:",
        "    radial-gradient(ellipse 56% 42% at 24% 26%, rgba(168, 208, 252, 0.75) 0%, transparent 70%),",
        "    radial-gradient(ellipse 52% 48% at 78% 72%, rgba(212, 188, 246, 0.72) 0%, transparent 72%),",
        "    radial-gradient(ellipse 46% 36% at 68% 22%, rgba(255, 255, 255, 0.78) 0%, transparent 65%);",
        "  animation: hbAuroraDrift 11s ease-in-out infinite alternate;",
        "  pointer-events: none;",
        "}",
        "/* 45° 厚玻璃折射斜光带 */",
        ".home-bg::after {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: -10%;",
        "  background: linear-gradient(128deg, transparent 28%, rgba(255, 255, 255, 0.42) 45%, rgba(255, 255, 255, 0.12) 54%, transparent 68%);",
        "  animation: hbGlassSweep 8s ease-in-out infinite alternate;",
        "  pointer-events: none;",
        "}",
        ".dock-bg {",
        "  background: linear-gradient(145deg, rgba(255, 255, 255, 0.52) 0%, rgba(236, 244, 255, 0.34) 100%) !important;",
        "  border: 1.5px solid rgba(255, 255, 255, 0.85) !important;",
        "  box-shadow: 0 10px 26px rgba(72, 86, 108, 0.14), inset 1.5px 1.5px 3px rgba(255, 255, 255, 0.9), inset -1.5px -1.5px 4px rgba(154, 174, 206, 0.35) !important;",
        "  backdrop-filter: blur(20px) saturate(165%) !important;",
        "  -webkit-backdrop-filter: blur(20px) saturate(165%) !important;",
        "}",
        "@keyframes hbAuroraDrift {",
        "  0%   { transform: translate3d(-4%, -3%, 0) scale(1); }",
        "  100% { transform: translate3d(5%, 4%, 0) scale(1.06); }",
        "}",
        "@keyframes hbGlassSweep {",
        "  0%   { transform: translate3d(-6%, 0, 0); opacity: 0.72; }",
        "  100% { transform: translate3d(6%, 0, 0); opacity: 1; }",
        "}"
      ].join("\n")
    },
    {
      id: "builtin_bg_clear_ripple",
      name: "清透水光波影",
      builtin: true,
      css: [
        "/* === 内置预设：清透水光波影（配套「清透水光玻璃」图标） === */",
        ".home-bg {",
        "  background: linear-gradient(170deg, #E7F5FA 0%, #D9EEF6 46%, #EDF4FA 100%) !important;",
        "}",
        "/* 日光水波轻盈漫反射 */",
        ".home-bg::before {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: -12%;",
        "  background:",
        "    radial-gradient(ellipse 65% 34% at 30% 18%, rgba(255, 255, 255, 0.85) 0%, transparent 68%),",
        "    radial-gradient(ellipse 70% 38% at 74% 58%, rgba(164, 224, 244, 0.45) 0%, transparent 72%),",
        "    radial-gradient(ellipse 58% 30% at 28% 82%, rgba(255, 255, 255, 0.62) 0%, transparent 66%);",
        "  animation: hbWaterFloat 9s ease-in-out infinite alternate;",
        "  pointer-events: none;",
        "}",
        "/* 细微清透涟漪光环 */",
        ".home-bg::after {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: 0;",
        "  background: repeating-radial-gradient(circle at 65% 28%, rgba(255, 255, 255, 0.24) 0px, rgba(255, 255, 255, 0.24) 2px, transparent 2px, transparent 34px);",
        "  opacity: 0.55;",
        "  animation: hbRipplePulse 7s ease-in-out infinite alternate;",
        "  pointer-events: none;",
        "}",
        ".dock-bg {",
        "  background: rgba(255, 255, 255, 0.28) !important;",
        "  border: 1px solid rgba(255, 255, 255, 0.78) !important;",
        "  box-shadow: 0 6px 18px rgba(45, 76, 98, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.9) !important;",
        "  backdrop-filter: blur(12px) saturate(140%) !important;",
        "  -webkit-backdrop-filter: blur(12px) saturate(140%) !important;",
        "}",
        "@keyframes hbWaterFloat {",
        "  0%   { transform: translate3d(0, -3%, 0) scale(1); }",
        "  100% { transform: translate3d(3%, 3%, 0) scale(1.05); }",
        "}",
        "@keyframes hbRipplePulse {",
        "  0%   { opacity: 0.35; transform: scale(0.98); }",
        "  100% { opacity: 0.65; transform: scale(1.04); }",
        "}"
      ].join("\n")
    },
    {
      id: "builtin_bg_fluffy_cloud",
      name: "软绵绵糖果云朵",
      builtin: true,
      css: [
        "/* === 内置预设：软绵绵糖果云朵（配套「3D 毛绒绒」糖果毛球图标） === */",
        ".home-bg {",
        "  background: #FAF3EB !important;",
        "}",
        "/* 草莓粉 / 芒果黄 / 香芋紫 / 薄荷蓝 四团棉花糖云球缓慢漂浮 */",
        ".home-bg::before {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: -16%;",
        "  background:",
        "    radial-gradient(circle at 18% 22%, rgba(250, 178, 198, 0.55) 0%, transparent 44%),",
        "    radial-gradient(circle at 84% 26%, rgba(252, 224, 134, 0.52) 0%, transparent 42%),",
        "    radial-gradient(circle at 24% 78%, rgba(164, 222, 194, 0.48) 0%, transparent 44%),",
        "    radial-gradient(circle at 80% 76%, rgba(206, 174, 248, 0.50) 0%, transparent 46%);",
        "  filter: blur(14px);",
        "  animation: hbCloudBob 12s ease-in-out infinite alternate;",
        "  pointer-events: none;",
        "}",
        "/* 哑光绒纸细腻颗粒层 */",
        ".home-bg::after {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: 0;",
        "  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' seed='4'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3C/defs%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.14'/%3E%3C/svg%3E\");",
        "  background-size: 120px 120px;",
        "  mix-blend-mode: multiply;",
        "  pointer-events: none;",
        "}",
        ".dock-bg {",
        "  background: rgba(255, 252, 247, 0.78) !important;",
        "  border: 1.5px solid rgba(255, 255, 255, 0.92) !important;",
        "  box-shadow: 0 8px 22px rgba(178, 126, 138, 0.14), inset 0 2px 4px rgba(255, 255, 255, 0.95) !important;",
        "  backdrop-filter: blur(14px) !important;",
        "  -webkit-backdrop-filter: blur(14px) !important;",
        "}",
        "@keyframes hbCloudBob {",
        "  0%   { transform: translate3d(-3%, -2%, 0) scale(1); }",
        "  100% { transform: translate3d(4%, 3%, 0) scale(1.06); }",
        "}"
      ].join("\n")
    },
    {
      id: "builtin_bg_stage_spotlight",
      name: "暗夜舞台聚光灯",
      builtin: true,
      css: [
        "/* === 内置预设：暗夜舞台聚光灯（配套「暗夜舞台聚光灯」图标） === */",
        ".home-bg {",
        "  background: radial-gradient(ellipse at 50% 0%, #2B2C32 0%, #1B1C20 55%, #111215 100%) !important;",
        "}",
        "/* 左侧丁达尔舞台聚光束缓缓摇曳 */",
        ".home-bg::before {",
        "  content: \"\";",
        "  position: absolute;",
        "  top: -4%;",
        "  left: -8%;",
        "  width: 72%;",
        "  height: 92%;",
        "  transform-origin: 22% 0%;",
        "  clip-path: polygon(16% 0%, 30% 0%, 100% 100%, 0% 100%);",
        "  -webkit-clip-path: polygon(16% 0%, 30% 0%, 100% 100%, 0% 100%);",
        "  background: linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.08) 48%, rgba(255, 255, 255, 0) 100%);",
        "  animation: hbStageBeamLeft 8.5s ease-in-out infinite alternate;",
        "  pointer-events: none;",
        "}",
        "/* 右侧丁达尔舞台聚光束交错呼应 */",
        ".home-bg::after {",
        "  content: \"\";",
        "  position: absolute;",
        "  top: -4%;",
        "  right: -8%;",
        "  width: 72%;",
        "  height: 92%;",
        "  transform-origin: 78% 0%;",
        "  clip-path: polygon(70% 0%, 84% 0%, 100% 100%, 0% 100%);",
        "  -webkit-clip-path: polygon(70% 0%, 84% 0%, 100% 100%, 0% 100%);",
        "  background: linear-gradient(180deg, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.06) 52%, rgba(255, 255, 255, 0) 100%);",
        "  animation: hbStageBeamRight 9.5s ease-in-out infinite alternate;",
        "  pointer-events: none;",
        "}",
        ".dock-bg {",
        "  background: rgba(34, 35, 40, 0.76) !important;",
        "  border: 1px solid rgba(255, 255, 255, 0.14) !important;",
        "  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.48), inset 0 1px 1px rgba(255, 255, 255, 0.16) !important;",
        "  backdrop-filter: blur(18px) !important;",
        "  -webkit-backdrop-filter: blur(18px) !important;",
        "}",
        "@keyframes hbStageBeamLeft {",
        "  0%   { transform: rotate(-9deg); opacity: 0.72; }",
        "  100% { transform: rotate(8deg); opacity: 1; }",
        "}",
        "@keyframes hbStageBeamRight {",
        "  0%   { transform: rotate(8deg); opacity: 0.65; }",
        "  100% { transform: rotate(-9deg); opacity: 0.98; }",
        "}"
      ].join("\n")
    }
  ];

  // ==========================================
  // 2. 安全作用域背景 CSS 编译器（带防遮挡层级基座）
  // ==========================================
  function sanitizeRawCss(rawCss) {
    if (!rawCss || typeof rawCss !== "string") return "";
    return rawCss
      .replace(/<\/style/gi, "")
      .replace(/@import\b[^;]*;?/gi, "")
      .replace(/expression\s*\(/gi, "");
  }

  function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function scopeBgSelectorList(selectorText) {
    const out = [];
    for (const rawPart of selectorText.split(",")) {
      const s = rawPart.trim();
      if (!s) continue;
      if (/^\.home-bg(?=$|[\s.:#\[>+~])/.test(s)) {
        out.push(s.replace(/^\.home-bg/, ".page.page-r2"));
        out.push(s.replace(/^\.home-bg/, ".hb-preview-stage"));
      } else if (/^\.dock-bg(?=$|[\s.:#\[>+~])/.test(s)) {
        out.push(s.replace(/^\.dock-bg/, ".page.page-r2 .dock-bar-container"));
        out.push(s.replace(/^\.dock-bg/, ".hb-preview-stage .hb-preview-dock"));
      } else if (s.startsWith("::")) {
        out.push(`.page.page-r2${s}`);
        out.push(`.hb-preview-stage${s}`);
      } else {
        out.push(`.page.page-r2 ${s}`);
        out.push(`.hb-preview-stage ${s}`);
      }
    }
    return out.join(", ");
  }

  function scopeBlock(cssBody) {
    let out = "";
    let i = 0;
    const len = cssBody.length;
    while (i < len) {
      while (i < len && /\s/.test(cssBody[i])) i++;
      if (i >= len) break;
      const openIdx = cssBody.indexOf("{", i);
      if (openIdx < 0) break;
      const header = cssBody.slice(i, openIdx).trim();
      let depth = 1;
      let j = openIdx + 1;
      while (j < len && depth > 0) {
        if (cssBody[j] === "{") depth++;
        else if (cssBody[j] === "}") depth--;
        j++;
      }
      const inner = cssBody.slice(openIdx + 1, j - 1);
      i = j;
      if (!header) continue;
      if (/^@(-webkit-)?keyframes\b/i.test(header)) {
        out += `${header} {${inner}}\n`;
      } else if (/^@(media|supports|container)\b/i.test(header)) {
        out += `${header} {\n${scopeBlock(inner)}}\n`;
      } else if (header.startsWith("@")) {
        continue;
      } else {
        const scopedSel = scopeBgSelectorList(header);
        if (scopedSel) out += `${scopedSel} {${inner}}\n`;
      }
    }
    return out;
  }

  const SAFE_LAYER_BASE = [
    ".page.page-r2, .hb-preview-stage { position: relative; overflow: hidden; isolation: isolate; }",
    ".page.page-r2::before, .page.page-r2::after, .hb-preview-stage::before, .hb-preview-stage::after { pointer-events: none !important; z-index: 0 !important; }",
    ".page.page-r2 > *, .hb-preview-stage > * { position: relative; z-index: 2; }"
  ].join("\n") + "\n";

  function scopeBgCss(rawCss) {
    const clean = stripComments(sanitizeRawCss(rawCss)).trim();
    if (!clean) return "";
    return SAFE_LAYER_BASE + scopeBlock(clean);
  }

  function applyLiveBgStyleTag(rawCss) {
    if (typeof global.document === "undefined" || !global.document.head) return;
    let el = global.document.getElementById(STYLE_TAG_ID);
    const compiled = scopeBgCss(rawCss);
    if (!compiled) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (!el) {
      el = global.document.createElement("style");
      el.id = STYLE_TAG_ID;
      global.document.head.appendChild(el);
    }
    el.textContent = compiled;
  }

  // ==========================================
  // 3. 独立 IndexedDB 持久化（零 localStorage 写入）
  // ==========================================
  let _dbPromise = null;
  let _memState = { activeCss: "", presets: [] };

  function openDb() {
    if (typeof indexedDB === "undefined" || !indexedDB) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return _dbPromise;
  }

  async function loadState() {
    const db = await openDb();
    if (!db) return { ..._memState };
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get("bg_css_state");
        req.onsuccess = () => {
          const res = req.result || {};
          const state = {
            activeCss: typeof res.activeCss === "string" ? res.activeCss : "",
            presets: Array.isArray(res.presets) ? res.presets : []
          };
          _memState = state;
          resolve(state);
        };
        req.onerror = () => resolve({ ..._memState });
      } catch (e) { resolve({ ..._memState }); }
    });
  }

  async function saveState(patch) {
    const cur = await loadState();
    const next = { ...cur, ...(patch || {}), id: "bg_css_state", updatedAt: Date.now() };
    _memState = { activeCss: next.activeCss, presets: next.presets };
    applyLiveBgStyleTag(next.activeCss);
    const db = await openDb();
    if (!db) return _memState;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(next);
        tx.oncomplete = () => resolve(_memState);
        tx.onerror = () => resolve(_memState);
      } catch (e) { resolve(_memState); }
    });
  }

  async function addPreset({ name, css }) {
    const cleanCss = String(css || "").trim();
    if (!cleanCss) return { ok: false };
    const cleanName = String(name || "").trim() || `背景样式 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const cur = await loadState();
    const preset = { id: `bg_pr_${Date.now()}_${Math.floor(Math.random() * 1000)}`, name: cleanName, css: cleanCss, createdAt: Date.now() };
    const next = await saveState({ presets: [preset, ...(cur.presets || [])] });
    return { ok: true, preset, state: next };
  }

  async function deletePreset(presetId) {
    const cur = await loadState();
    const nextPresets = (cur.presets || []).filter((p) => p.id !== presetId);
    return await saveState({ presets: nextPresets });
  }

  // 启动自动热挂载已保存的背景 CSS
  loadState().then((st) => {
    if (st && st.activeCss) applyLiveBgStyleTag(st.activeCss);
  }).catch(() => {});

  // ==========================================
  // 4. 手绘细线矢量 SVG（零 Emoji）
  // ==========================================
  function BgCssSvg(h, name, { size = 13, color = "currentColor" } = {}) {
    const common = {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block", flexShrink: 0 }
    };
    switch (name) {
      case "copy":
        return h("svg", common,
          h("rect", { x: 9, y: 9, width: 11, height: 11, rx: 2 }),
          h("path", { d: "M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" })
        );
      case "upload":
        return h("svg", common,
          h("path", { d: "M12 16V5M7.5 9.5L12 5l4.5 4.5" }),
          h("path", { d: "M4 17.5v1.5A1.5 1.5 0 0 0 5.5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5" })
        );
      case "eye":
        return h("svg", common,
          h("path", { d: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" }),
          h("circle", { cx: 12, cy: 12, r: 2.8 })
        );
      case "bookmark":
        return h("svg", common, h("path", { d: "M6 4h12a1 1 0 0 1 1 1v16l-7-4.5L5 21V5a1 1 0 0 1 1-1z" }));
      case "close":
        return h("svg", common, h("path", { d: "M6 6l12 12M18 6L6 18" }));
      default:
        return h("svg", common, h("circle", { cx: 12, cy: 12, r: 6 }));
    }
  }

  async function copyText(text) {
    if (global.HomeWidgetCss && typeof global.HomeWidgetCss.copyTextWithFallback === "function") {
      return await global.HomeWidgetCss.copyTextWithFallback(text);
    }
    try {
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // ==========================================
  // 5. 设置 → 主题 → 图标自定义 CSS 下方：主题背景 CSS 工坊面板
  // ==========================================
  function HomeBgCssSection() {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const [activeCss, setActiveCss] = useState("");
    const [presets, setPresets] = useState([]);
    const [presetName, setPresetName] = useState("");
    const [showPreview, setShowPreview] = useState(true);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [toast, setToast] = useState("");
    const fileInputRef = useRef(null);

    const flash = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(""), 2000);
    };

    useEffect(() => {
      let alive = true;
      loadState().then((st) => {
        if (!alive) return;
        setActiveCss(st.activeCss || "");
        setPresets(st.presets || []);
      });
      return () => { alive = false; };
    }, []);

    const handleCssChange = (val) => {
      setActiveCss(val);
      saveState({ activeCss: val });
    };

    const handleCopyDefault = async () => {
      const ok = await copyText(DEFAULT_BG_CSS);
      flash(ok ? "已复制主题背景原本 CSS 模板" : "复制失败，请手动选中");
    };

    const handleSavePreset = async () => {
      if (!String(activeCss || "").trim()) {
        flash("请先编写或套用背景 CSS 再存为预设");
        return;
      }
      const res = await addPreset({ name: presetName, css: activeCss });
      if (res.ok) {
        setPresets(res.state.presets);
        setPresetName("");
        flash(`已存为背景预设「${res.preset.name}」`);
      }
    };

    const handleImportFile = async (e) => {
      const file = e.target?.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const rawText = typeof file.text === "function"
          ? await file.text()
          : await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result || ""));
              r.onerror = reject;
              r.readAsText(file, "utf-8");
            });
        const trimmed = String(rawText || "").replace(/^\uFEFF/, "").trim();
        if (!trimmed) {
          flash("导入失败：文件内容为空");
          return;
        }
        const baseName = String(file.name || "导入背景样式").replace(/\.(css|txt|json)$/i, "").trim() || "导入背景样式";
        if (/\.json$/i.test(file.name || "")) {
          const parsed = JSON.parse(trimmed);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          let count = 0;
          let firstCss = "";
          let latestPresets = presets;
          for (const it of items) {
            if (!it || typeof it.css !== "string" || !it.css.trim()) continue;
            const r = await addPreset({ name: String(it.name || baseName).trim() || baseName, css: it.css.trim() });
            if (r.ok) {
              latestPresets = r.state.presets;
              if (!firstCss) firstCss = it.css.trim();
              count += 1;
            }
          }
          if (count > 0) {
            setPresets(latestPresets);
            setActiveCss(firstCss);
            await saveState({ activeCss: firstCss });
            flash(`已导入 ${count} 套背景 CSS 至 IndexedDB`);
          } else {
            flash("JSON 中未找到有效 css 字段");
          }
          return;
        }
        const r = await addPreset({ name: baseName, css: trimmed });
        if (r.ok) {
          setPresets(r.state.presets);
          setActiveCss(trimmed);
          await saveState({ activeCss: trimmed });
          flash(`已导入「${r.preset.name}」并存入本地 IndexedDB`);
        }
      } catch (err) {
        flash("导入失败，请确认文件为 UTF-8 编码的 .css / .txt 文件");
      }
    };

    const handleConfirmDelete = async () => {
      if (!pendingDelete) return;
      const st = await deletePreset(pendingDelete.id);
      setPresets(st.presets || []);
      setPendingDelete(null);
      flash("已删除该背景样式预设");
    };

    const allPresets = [...BUILTIN_BG_PRESETS, ...presets];

    return h(
      React.Fragment,
      null,
      h("input", {
        ref: fileInputRef,
        type: "file",
        accept: ".css,.txt,.json,text/css,text/plain,application/json",
        style: { display: "none" },
        onChange: handleImportFile
      }),
      h("div", { style: { fontSize: "13px", fontWeight: 700, color: "#7A826E", margin: "18px 0 8px 4px" } }, "主题背景自定义 CSS 与配套动效预设"),
      h(
        "div",
        {
          style: {
            background: "#FFFFFF",
            borderRadius: "16px",
            padding: "12px",
            border: "1px solid #EAE6DC",
            boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }
        },
        // 顶部工具条
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexWrap: "wrap" } },
          h(
            "div",
            { style: { display: "flex", gap: "5px", flexWrap: "wrap" } },
            h("button", {
              type: "button",
              onClick: handleCopyDefault,
              style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "8px", padding: "5px 8px", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }
            }, BgCssSvg(h, "copy", { size: 12, color: "#5A6252" }), "复制原本 CSS"),
            h("button", {
              type: "button",
              onClick: () => fileInputRef.current && fileInputRef.current.click(),
              style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "8px", padding: "5px 8px", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }
            }, BgCssSvg(h, "upload", { size: 12, color: "#5A6252" }), "导入 CSS"),
            h("button", {
              type: "button",
              onClick: () => {
                const content = String(activeCss || "").trim();
                if (!content) {
                  flash("当前背景 CSS 为空，请先选择预设或填写样式");
                  return;
                }
                try {
                  const blob = new Blob([content], { type: "text/css;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "主屏主题背景-自定义样式.css";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  flash("已导出主题背景 CSS 文件");
                } catch (_) {
                  flash("导出失败，请手动复制");
                }
              },
              style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "8px", padding: "5px 8px", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }
            }, h("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "#5A6252", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }, h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), h("polyline", { points: "7 10 12 15 17 10" }), h("line", { x1: 12, y1: 15, x2: 12, y2: 3 })), "导出 CSS")
          ),
          h(
            "div",
            { style: { display: "flex", gap: "5px" } },
            h("button", {
              type: "button",
              onClick: () => setShowPreview((v) => !v),
              style: { border: showPreview ? "1px solid #6D735B" : "1px solid #C5CEB8", background: showPreview ? "#6D735B" : "#FAF9F5", color: showPreview ? "#FFFFFF" : "#3A4233", borderRadius: "8px", padding: "5px 8px", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }
            }, BgCssSvg(h, "eye", { size: 12, color: showPreview ? "#FFFFFF" : "#5A6252" }), showPreview ? "收起预览" : "实时预览"),
            h("button", {
              type: "button",
              onClick: () => { handleCssChange(""); flash("已恢复默认壁纸背景"); },
              style: { border: "1px solid #E2DFD5", background: "#FAF9F5", color: "#7A826E", borderRadius: "8px", padding: "5px 8px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
            }, "重置")
          )
        ),

        // 实时微缩手机桌面预览舞台
        showPreview &&
          h(
            "div",
            { style: { display: "flex", justifyContent: "center" } },
            h(
              "div",
              {
                className: "hb-preview-stage",
                style: {
                  width: "100%",
                  height: "152px",
                  borderRadius: "16px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "linear-gradient(160deg, #F4EFE6 0%, #EAE3D5 100%)",
                  padding: "12px 14px 10px",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between"
                }
              },
              // 顶部模拟小组件条
              h("div", { style: { height: "26px", borderRadius: "10px", background: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.5)", backdropFilter: "blur(8px)" } }),
              // 中部模拟 4 枚微缩图标
              h(
                "div",
                { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", justifyItems: "center" } },
                [0, 1, 2, 3].map((n) =>
                  h("div", { key: n, style: { width: "28px", height: "28px", borderRadius: "9px", background: "rgba(255,255,255,0.58)", border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 3px 8px rgba(0,0,0,0.08)" } })
                )
              ),
              // 底部模拟 Dock 栏
              h(
                "div",
                {
                  className: "hb-preview-dock",
                  style: {
                    height: "30px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.68)",
                    border: "1px solid rgba(255,255,255,0.7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-around",
                    padding: "0 14px"
                  }
                },
                [0, 1, 2, 3].map((n) =>
                  h("span", { key: n, style: { width: "16px", height: "16px", borderRadius: "5px", background: "rgba(109,115,91,0.32)" } })
                )
              )
            )
          ),

        // 预设胶囊列表
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px" } },
          h("span", { style: { fontSize: "11px", color: "#7A826E", fontWeight: 700 } }, "一键套用配套背景预设（含动态特效）"),
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
            allPresets.map((pr) =>
              h(
                "div",
                {
                  key: pr.id,
                  style: { display: "inline-flex", alignItems: "center", gap: "4px", background: pr.builtin ? "#EEF2E8" : "#F5F3EC", border: pr.builtin ? "1px solid #C5D1B6" : "1px solid #DDD7C7", borderRadius: "999px", padding: "4px 8px 4px 10px", fontSize: "11px", color: "#3A4233" }
                },
                h("span", {
                  onClick: () => { handleCssChange(pr.css); flash(`已套用背景预设「${pr.name}」`); },
                  style: { cursor: "pointer", fontWeight: 700 }
                }, pr.name),
                !pr.builtin &&
                  h("button", {
                    type: "button",
                    onClick: () => setPendingDelete(pr),
                    style: { border: "none", background: "transparent", padding: "1px", cursor: "pointer", display: "flex" }
                  }, BgCssSvg(h, "close", { size: 11, color: "#7A826E" }))
              )
            )
          )
        ),

        // 自定义 CSS 编辑框
        h("textarea", {
          rows: 5,
          value: activeCss,
          onChange: (e) => handleCssChange(e.target.value),
          placeholder: "在此粘贴或编写主题背景 CSS（使用 .home-bg / .home-bg::before / .home-bg::after / .dock-bg 与 @keyframes）…",
          style: { width: "100%", boxSizing: "border-box", border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px", fontSize: "11px", fontFamily: "ui-monospace, Consolas, monospace", background: "#FAF9F5", color: "#2D3328", outline: "none", resize: "vertical" }
        }),

        // 存为预设行
        h(
          "div",
          { style: { display: "flex", gap: "6px" } },
          h("input", {
            type: "text",
            value: presetName,
            onChange: (e) => setPresetName(e.target.value),
            placeholder: "给当前背景 CSS 预设起个名字…",
            style: { flex: 1, minWidth: 0, border: "1px solid #E2DFD5", borderRadius: "9px", padding: "6px 9px", fontSize: "11.5px", outline: "none" }
          }),
          h("button", {
            type: "button",
            onClick: handleSavePreset,
            style: { border: "none", background: "#6D735B", color: "#FFFFFF", borderRadius: "9px", padding: "6px 11px", fontSize: "11.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", flexShrink: 0 }
          }, BgCssSvg(h, "bookmark", { size: 12, color: "#FFFFFF" }), "存为预设")
        ),

        toast &&
          h("div", { style: { fontSize: "11.5px", color: "#4E6B42", background: "#EEF5EA", borderRadius: "8px", padding: "6px 9px", textAlign: "center", fontWeight: 700 } }, toast)
      ),

      // 删除自定义预设防误触二次确认弹窗
      pendingDelete &&
        (() => {
          const modalNode = h(
            "div",
            {
              onClick: (e) => { if (e.target === e.currentTarget) setPendingDelete(null); },
              style: { position: "fixed", inset: 0, zIndex: 99997, background: "rgba(30,34,28,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }
            },
            h(
              "div",
              {
                onClick: (e) => e.stopPropagation(),
                style: { width: "100%", maxWidth: "290px", background: "#FFFFFF", borderRadius: "16px", padding: "16px", boxShadow: "0 14px 36px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column", gap: "12px", color: "#3A4233" }
              },
              h("div", { style: { fontSize: "14px", fontWeight: 800 } }, "确认删除预设？"),
              h("div", { style: { fontSize: "12.5px", color: "#6E7766", lineHeight: 1.55 } }, `确定要删除主题背景预设「${pendingDelete.name}」吗？删除后无法恢复。`),
              h(
                "div",
                { style: { display: "flex", gap: "8px" } },
                h("button", { type: "button", onClick: () => setPendingDelete(null), style: { flex: 1, border: "1px solid #DCD7CA", background: "#FAF9F5", color: "#5A6252", borderRadius: "10px", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" } }, "取消"),
                h("button", { type: "button", onClick: handleConfirmDelete, style: { flex: 1, border: "none", background: "#C84B31", color: "#FFFFFF", borderRadius: "10px", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" } }, "确认删除")
              )
            )
          );
          if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && global.document && global.document.body) {
            return global.ReactDOM.createPortal(modalNode, global.document.body);
          }
          return modalNode;
        })()
    );
  }

  global.HomeBgCssSection = HomeBgCssSection;
  global.HomeBgCssEngine = {
    DB_NAME,
    DEFAULT_BG_CSS,
    BUILTIN_BG_PRESETS,
    scopeBgCss,
    applyLiveBgStyleTag,
    loadState,
    saveState,
    addPreset,
    deletePreset
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.HomeBgCssEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
