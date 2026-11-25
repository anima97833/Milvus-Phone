/**
 * Milvus/home_icon_css.js
 * 「主屏幕图标自定义 CSS / 导入美化 / 双玻璃预设」独立引擎与设置面板
 * - 独立 IndexedDB: milvus_home_icon_css_idb（零 localStorage 写入）
 * - 安全作用域编译器 scopeIconCss：仅作用于主屏桌面图标、Dock 栏（可开关）与设置预览台，绝不污染天气等其他页面的 .icon-box
 * - 内置 2 套精致玻璃预设：「厚倒角折射玻璃」&「清透水光玻璃」
 * - 支持一键复制原本 CSS、导入 .css/.txt/.json 文件直存 IndexedDB、实时壁纸预览舞台、预设胶囊与防误触删除弹窗
 * - 零 Emoji（全量手绘细线矢量 SVG）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_home_icon_css_idb";
  const DB_VERSION = 1;
  const STORE_NAME = "icon_css_store";
  const STYLE_TAG_ID = "milvus-home-icon-custom-css";

  // ==========================================
  // 1. 基准默认 CSS 模板 & 两套内置玻璃预设
  // ==========================================
  const DEFAULT_ICON_CSS = [
    "/* === 主屏幕图标默认 CSS（支持 ::before / ::after 伪元素与 @keyframes） === */",
    "/* 提示：.icon-box 有内联背景/阴影，自定义覆盖建议带 !important */",
    ".icon-item {",
    "  position: relative;",
    "}",
    ".icon-box {",
    "  position: relative !important;",
    "  border-radius: 17px !important;",
    "  background: rgba(255, 255, 255, 0.88) !important;",
    "  border: 1px solid rgba(255, 255, 255, 0.75) !important;",
    "  box-shadow: 0 6px 16px rgba(32, 38, 46, 0.08) !important;",
    "  backdrop-filter: blur(12px) !important;",
    "  -webkit-backdrop-filter: blur(12px) !important;",
    "}",
    ".icon-box svg {",
    "  position: relative;",
    "  z-index: 2;",
    "}",
    ".icon-box img {",
    "  border-radius: 16px !important;",
    "}",
    ".icon-label {",
    "  color: #3A4233 !important;",
    "  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.85) !important;",
    "}",
    "/* 伪元素贴纸/高光示例（务必保留 pointer-events: none 不阻挡点击拖拽）：",
    ".icon-box::after {",
    "  content: \"\";",
    "  position: absolute;",
    "  inset: 0;",
    "  border-radius: inherit;",
    "  pointer-events: none;",
    "  z-index: 3;",
    "}",
    "*/"
  ].join("\n");

  const BUILTIN_ICON_PRESETS = [
    {
      id: "builtin_icon_thick_glass",
      name: "厚倒角折射玻璃",
      builtin: true,
      css: [
        "/* === 内置预设：厚倒角折射玻璃（立体厚晶块 + 45° 双层折射内环） === */",
        ".icon-item {",
        "  position: relative;",
        "}",
        ".icon-box {",
        "  position: relative !important;",
        "  border-radius: 17px !important;",
        "  background: linear-gradient(145deg, rgba(255, 255, 255, 0.48) 0%, rgba(238, 245, 255, 0.28) 52%, rgba(255, 255, 255, 0.36) 100%) !important;",
        "  border: 1.5px solid rgba(255, 255, 255, 0.88) !important;",
        "  box-shadow:",
        "    0 8px 18px rgba(72, 86, 108, 0.16),",
        "    0 2px 5px rgba(72, 86, 108, 0.10),",
        "    inset 2px 2px 4px rgba(255, 255, 255, 0.92),",
        "    inset -2px -2px 5px rgba(154, 174, 206, 0.42),",
        "    inset 0 0 10px rgba(255, 255, 255, 0.45) !important;",
        "  backdrop-filter: blur(18px) saturate(165%) !important;",
        "  -webkit-backdrop-filter: blur(18px) saturate(165%) !important;",
        "  overflow: hidden !important;",
        "}",
        "/* 内圈 2px 厚玻璃倒角折射环 */",
        ".icon-box::before {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: 2.5px;",
        "  border-radius: 14px;",
        "  border: 1px solid rgba(255, 255, 255, 0.72);",
        "  background: linear-gradient(135deg, rgba(255, 255, 255, 0.46) 0%, rgba(255, 255, 255, 0.04) 46%, rgba(190, 212, 240, 0.18) 100%);",
        "  box-shadow: inset 1px 1px 2px rgba(255, 255, 255, 0.85);",
        "  pointer-events: none;",
        "  z-index: 3;",
        "}",
        ".icon-box img {",
        "  position: relative;",
        "  z-index: 1;",
        "  border-radius: 15px !important;",
        "}",
        ".icon-box svg {",
        "  position: relative;",
        "  z-index: 4;",
        "  filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8));",
        "}",
        ".icon-label {",
        "  color: #323B46 !important;",
        "  font-weight: 700 !important;",
        "  text-shadow: 0 1px 3px rgba(255, 255, 255, 0.92) !important;",
        "}"
      ].join("\n")
    },
    {
      id: "builtin_icon_clear_glass",
      name: "清透水光玻璃",
      builtin: true,
      css: [
        "/* === 内置预设：清透水光玻璃（高透冰晶 + 顶部轻盈水光弧） === */",
        ".icon-item {",
        "  position: relative;",
        "}",
        ".icon-box {",
        "  position: relative !important;",
        "  border-radius: 17px !important;",
        "  background: rgba(255, 255, 255, 0.22) !important;",
        "  border: 1px solid rgba(255, 255, 255, 0.72) !important;",
        "  box-shadow:",
        "    0 5px 14px rgba(45, 58, 76, 0.10),",
        "    inset 0 1.5px 2px rgba(255, 255, 255, 0.88),",
        "    inset 0 -1px 2px rgba(255, 255, 255, 0.35) !important;",
        "  backdrop-filter: blur(10px) saturate(135%) !important;",
        "  -webkit-backdrop-filter: blur(10px) saturate(135%) !important;",
        "  overflow: hidden !important;",
        "}",
        "/* 顶部轻盈水光反光弧 */",
        ".icon-box::before {",
        "  content: \"\";",
        "  position: absolute;",
        "  top: 0;",
        "  left: 0;",
        "  right: 0;",
        "  height: 48%;",
        "  border-radius: 16px 16px 50% 50% / 16px 16px 10px 10px;",
        "  background: linear-gradient(180deg, rgba(255, 255, 255, 0.52) 0%, rgba(255, 255, 255, 0.02) 100%);",
        "  pointer-events: none;",
        "  z-index: 3;",
        "}",
        ".icon-box img {",
        "  position: relative;",
        "  z-index: 1;",
        "  border-radius: 16px !important;",
        "}",
        ".icon-box svg {",
        "  position: relative;",
        "  z-index: 4;",
        "}",
        ".icon-label {",
        "  text-shadow: 0 1px 3px rgba(255, 255, 255, 0.88) !important;",
        "}"
      ].join("\n")
    },
    {
      id: "builtin_icon_fluffy_3d",
      name: "3D 毛绒绒（糖果毛球）",
      builtin: true,
      css: [
        "/* === 内置预设：3D 毛绒绒（SVG 像素级绒毛置换边缘 + 哑光毛束纹理 + 马卡龙五色） === */",
        ".icon-item {",
        "  position: relative;",
        "  overflow: visible !important;",
        "  --fur-hi: #FF9CB2;",
        "  --fur-mid: #EC6F8E;",
        "  --fur-lo: #C64667;",
        "  --fur-sh: rgba(175, 62, 92, 0.34);",
        "}",
        "/* 兼容桌面槽位编号、Dock 槽位编号与预览舞台的五色马卡龙循环 */",
        ".icon-item[data-drop-desktop-slot=\"1\"], .icon-item[data-drop-desktop-slot=\"6\"], .icon-item[data-drop-desktop-slot=\"11\"], .icon-item[data-drop-desktop-slot=\"16\"], .icon-item[data-drop-dock-slot=\"1\"], .icon-item:nth-child(5n+2) {",
        "  --fur-hi: #FFE07A; --fur-mid: #F2B836; --fur-lo: #C98A16; --fur-sh: rgba(182, 122, 16, 0.34);",
        "}",
        ".icon-item[data-drop-desktop-slot=\"2\"], .icon-item[data-drop-desktop-slot=\"7\"], .icon-item[data-drop-desktop-slot=\"12\"], .icon-item[data-drop-desktop-slot=\"17\"], .icon-item[data-drop-dock-slot=\"2\"], .icon-item:nth-child(5n+3) {",
        "  --fur-hi: #CFA8FF; --fur-mid: #A876F0; --fur-lo: #7D48C9; --fur-sh: rgba(114, 62, 190, 0.34);",
        "}",
        ".icon-item[data-drop-desktop-slot=\"3\"], .icon-item[data-drop-desktop-slot=\"8\"], .icon-item[data-drop-desktop-slot=\"13\"], .icon-item[data-drop-desktop-slot=\"18\"], .icon-item[data-drop-dock-slot=\"3\"], .icon-item:nth-child(5n+4) {",
        "  --fur-hi: #9AD2FF; --fur-mid: #63ABF2; --fur-lo: #3B7FD0; --fur-sh: rgba(54, 118, 198, 0.34);",
        "}",
        ".icon-item[data-drop-desktop-slot=\"4\"], .icon-item[data-drop-desktop-slot=\"9\"], .icon-item[data-drop-desktop-slot=\"14\"], .icon-item[data-drop-desktop-slot=\"19\"], .icon-item:nth-child(5n+5) {",
        "  --fur-hi: #A2E6BA; --fur-mid: #6EC48F; --fur-lo: #459966; --fur-sh: rgba(62, 146, 96, 0.34);",
        "}",
        "/* 外盒透明化，把真实毛球本体交给带 SVG 绒毛置换滤镜的 ::before，保证图标线稿清晰不模糊 */",
        ".icon-box {",
        "  position: relative !important;",
        "  background: transparent !important;",
        "  border: none !important;",
        "  box-shadow: none !important;",
        "  backdrop-filter: none !important;",
        "  -webkit-backdrop-filter: none !important;",
        "  overflow: visible !important;",
        "}",
        "/* 底层：SVG feDisplacementMap 撕扯出的真实毛茸茸 3D 哑光毛球本体 */",
        ".icon-box::before {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: -2px;",
        "  border-radius: 18px;",
        "  background:",
        "    repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.16) 0deg 2deg, rgba(0,0,0,0.08) 2deg 4.5deg, transparent 4.5deg 7deg),",
        "    radial-gradient(circle at 34% 28%, var(--fur-hi) 0%, var(--fur-mid) 56%, var(--fur-lo) 100%);",
        "  box-shadow:",
        "    0 7px 14px var(--fur-sh),",
        "    inset 0 -5px 8px rgba(0, 0, 0, 0.22),",
        "    inset 0 3px 6px rgba(255, 255, 255, 0.32);",
        "  filter: url(#milvus-fluffy-edge);",
        "  pointer-events: none;",
        "  z-index: 0;",
        "}",
        "/* 表层：细密哑光绒毛纤维纹理（消除光滑塑料感） */",
        ".icon-box::after {",
        "  content: \"\";",
        "  position: absolute;",
        "  inset: -1px;",
        "  border-radius: 17px;",
        "  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' seed='11'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3C/defs%3E%3Crect width='64' height='64' filter='url(%23f)' opacity='0.28'/%3E%3C/svg%3E\");",
        "  background-size: 64px 64px;",
        "  mix-blend-mode: overlay;",
        "  pointer-events: none;",
        "  z-index: 2;",
        "}",
        ".icon-box img {",
        "  position: relative;",
        "  z-index: 3;",
        "  border-radius: 15px !important;",
        "  transform: scale(0.9);",
        "}",
        ".icon-box svg {",
        "  position: relative;",
        "  z-index: 4;",
        "  color: #FFFDF8 !important;",
        "  stroke: #FFFDF8 !important;",
        "  filter: drop-shadow(0 1.5px 2px rgba(60, 32, 42, 0.35));",
        "}",
        ".icon-label {",
        "  color: #463A3E !important;",
        "  font-weight: 700 !important;",
        "  text-shadow: 0 1px 3px rgba(255, 255, 255, 0.92) !important;",
        "}"
      ].join("\n")
    },
    {
      id: "builtin_icon_spotlight",
      name: "暗夜舞台聚光灯",
      builtin: true,
      css: [
        "/* === 内置预设：暗夜舞台聚光灯（鼠标悬停 + 手机手指划过实时点亮） === */",
        ".icon-item {",
        "  position: relative;",
        "  -webkit-tap-highlight-color: transparent;",
        "}",
        ".icon-box {",
        "  position: relative !important;",
        "  border-radius: 18px !important;",
        "  background: #58585a !important;",
        "  border: 1px solid rgba(255, 255, 255, 0.08) !important;",
        "  box-shadow:",
        "    0 10px 20px rgba(0, 0, 0, 0.28),",
        "    0 3px 6px rgba(0, 0, 0, 0.18),",
        "    inset 0 1px 1px rgba(255, 255, 255, 0.12),",
        "    inset 0 -2px 4px rgba(0, 0, 0, 0.35) !important;",
        "  backdrop-filter: blur(12px) !important;",
        "  -webkit-backdrop-filter: blur(12px) !important;",
        "  overflow: hidden !important;",
        "  transition:",
        "    background-color 0.32s ease,",
        "    box-shadow 0.32s ease,",
        "    transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) !important;",
        "}",
        "/* 1. 顶部发光白炽灯管 */",
        ".icon-box::before {",
        "  content: \"\";",
        "  position: absolute;",
        "  top: 0;",
        "  left: 50%;",
        "  width: 58%;",
        "  height: 5px;",
        "  transform: translateX(-50%) scaleX(0.2);",
        "  opacity: 0;",
        "  border-radius: 0 0 6px 6px;",
        "  background: #ffffff;",
        "  box-shadow:",
        "    0 0 8px 2px rgba(255, 255, 255, 0.95),",
        "    0 2px 14px 4px rgba(255, 255, 255, 0.65);",
        "  pointer-events: none;",
        "  z-index: 6;",
        "  transition: transform 0.35s cubic-bezier(0.22, 1.4, 0.36, 1), opacity 0.22s ease;",
        "}",
        "/* 2. 梯形倾泻聚光灯光束 */",
        ".icon-box::after {",
        "  content: \"\";",
        "  position: absolute;",
        "  top: 3px;",
        "  left: 50%;",
        "  width: 86%;",
        "  height: 92%;",
        "  transform: translateX(-50%) scaleY(0);",
        "  transform-origin: top center;",
        "  opacity: 0;",
        "  clip-path: polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%);",
        "  -webkit-clip-path: polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%);",
        "  background: linear-gradient(180deg, rgba(255, 255, 255, 0.54) 0%, rgba(255, 255, 255, 0.24) 45%, rgba(255, 255, 255, 0.06) 80%, rgba(255, 255, 255, 0) 100%);",
        "  pointer-events: none;",
        "  z-index: 5;",
        "  transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;",
        "}",
        "/* 3. 未照亮态：暗影剪影 */",
        ".icon-box img {",
        "  position: relative;",
        "  z-index: 2;",
        "  border-radius: 16px !important;",
        "  filter: brightness(0.45) contrast(1.1) grayscale(0.4) !important;",
        "  transition: filter 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) !important;",
        "}",
        ".icon-box svg {",
        "  position: relative;",
        "  z-index: 4;",
        "  color: #252526 !important;",
        "  stroke: #252526 !important;",
        "  filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.08)) !important;",
        "  transition: color 0.28s ease, stroke 0.28s ease, filter 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) !important;",
        "}",
        "/* 4. 鼠标悬停 / 手指划过 (.hi-lit) / 点击激活点亮 */",
        ".icon-item:hover .icon-box, .icon-item:active .icon-box, .icon-item.active .icon-box, .icon-item.hi-lit .icon-box {",
        "  background: #525254 !important;",
        "  transform: translateY(-2px) !important;",
        "  box-shadow:",
        "    0 14px 24px rgba(0, 0, 0, 0.36),",
        "    0 4px 8px rgba(0, 0, 0, 0.22),",
        "    inset 0 2px 6px rgba(255, 255, 255, 0.35),",
        "    inset 0 -2px 5px rgba(0, 0, 0, 0.45) !important;",
        "}",
        ".icon-item:hover .icon-box::before, .icon-item:active .icon-box::before, .icon-item.active .icon-box::before, .icon-item.hi-lit .icon-box::before {",
        "  transform: translateX(-50%) scaleX(1);",
        "  opacity: 1;",
        "  animation: lampFlickerOn 0.42s ease-out forwards;",
        "}",
        ".icon-item:hover .icon-box::after, .icon-item:active .icon-box::after, .icon-item.active .icon-box::after, .icon-item.hi-lit .icon-box::after {",
        "  transform: translateX(-50%) scaleY(1);",
        "  opacity: 1;",
        "  animation: beamPulse 2.4s ease-in-out 0.32s infinite alternate;",
        "}",
        ".icon-item:hover .icon-box svg, .icon-item:active .icon-box svg, .icon-item.active .icon-box svg, .icon-item.hi-lit .icon-box svg {",
        "  color: #ffffff !important;",
        "  stroke: #ffffff !important;",
        "  transform: translateY(-1.5px) scale(1.06) !important;",
        "  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.85)) drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35)) !important;",
        "}",
        ".icon-item:hover .icon-box img, .icon-item:active .icon-box img, .icon-item.active .icon-box img, .icon-item.hi-lit .icon-box img {",
        "  filter: brightness(1.12) contrast(1.05) grayscale(0) drop-shadow(0 0 8px rgba(255, 255, 255, 0.5)) !important;",
        "  transform: scale(1.04) !important;",
        "}",
        ".icon-label {",
        "  color: #7c7c80 !important;",
        "  text-shadow: none !important;",
        "  transition: color 0.28s ease, text-shadow 0.28s ease !important;",
        "}",
        ".icon-item:hover .icon-label, .icon-item:active .icon-label, .icon-item.active .icon-label, .icon-item.hi-lit .icon-label {",
        "  color: #ffffff !important;",
        "  text-shadow: 0 0 8px rgba(255, 255, 255, 0.75) !important;",
        "}",
        "@keyframes lampFlickerOn {",
        "  0%   { opacity: 0.2; transform: translateX(-50%) scaleX(0.3); }",
        "  35%  { opacity: 1;   transform: translateX(-50%) scaleX(1.04); }",
        "  55%  { opacity: 0.75; transform: translateX(-50%) scaleX(0.98); }",
        "  100% { opacity: 1;   transform: translateX(-50%) scaleX(1); }",
        "}",
        "@keyframes beamPulse {",
        "  0%   { opacity: 0.88; transform: translateX(-50%) scaleY(1) scaleX(0.98); }",
        "  100% { opacity: 1;    transform: translateX(-50%) scaleY(1) scaleX(1.03); }",
        "}"
      ].join("\n")
    }
  ];

  // ==========================================
  // 2. 安全作用域 CSS 编译器（绝不污染天气等其他页面的 .icon-box）
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

  function scopeIconSelectorList(selectorText, scopes) {
    const out = [];
    const parts = selectorText.split(",");
    for (const rawPart of parts) {
      const s = rawPart.trim();
      if (!s) continue;
      if (/^\.dock-icon-item(?=$|[\s.:#\[>+~])/.test(s)) {
        out.push(`.icon-item${s}`);
        continue;
      }
      for (const sc of scopes) {
        if (/^\.icon-item(?=$|[\s.:#\[>+~])/.test(s)) {
          out.push(s.replace(/^\.icon-item/, sc));
        } else if (s.startsWith("::")) {
          out.push(`${sc}${s}`);
        } else {
          out.push(`${sc} ${s}`);
        }
      }
    }
    return out.join(", ");
  }

  function scopeBlock(cssBody, scopes) {
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
        out += `${header} {\n${scopeBlock(inner, scopes)}}\n`;
      } else if (header.startsWith("@")) {
        continue;
      } else {
        const scopedSel = scopeIconSelectorList(header, scopes);
        if (scopedSel) out += `${scopedSel} {${inner}}\n`;
      }
    }
    return out;
  }

  function scopeIconCss(rawCss, { applyToDock = true, previewOnly = false } = {}) {
    const clean = stripComments(sanitizeRawCss(rawCss)).trim();
    if (!clean) return "";
    const scopes = previewOnly
      ? [".hi-preview-stage .icon-item"]
      : [
          ".icon-matrix .icon-item",
          ".home-widget-matrix .icon-item",
          ...(applyToDock ? [".icon-item.dock-icon-item"] : []),
          ".hi-preview-stage .icon-item"
        ];
    return scopeBlock(clean, scopes);
  }

  function ensureFluffySvgFilter() {
    if (typeof global.document === "undefined" || !global.document.body) return;
    if (global.document.getElementById("milvus-fluffy-svg-defs")) return;
    try {
      const wrap = global.document.createElement("div");
      wrap.id = "milvus-fluffy-svg-defs";
      wrap.setAttribute("aria-hidden", "true");
      wrap.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0;";
      wrap.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">' +
          '<defs>' +
            '<filter id="milvus-fluffy-edge" x="-22%" y="-22%" width="144%" height="144%" color-interpolation-filters="sRGB">' +
              '<feTurbulence type="fractalNoise" baseFrequency="0.46" numOctaves="3" seed="9" result="furNoise"/>' +
              '<feDisplacementMap in="SourceGraphic" in2="furNoise" scale="5.8" xChannelSelector="R" yChannelSelector="G"/>' +
            '</filter>' +
          '</defs>' +
        '</svg>';
      global.document.body.appendChild(wrap);
    } catch (e) {}
  }

  function applyLiveStyleTag(rawCss, applyToDock = true) {
    if (typeof global.document === "undefined" || !global.document.head) return;
    ensureFluffySvgFilter();
    let el = global.document.getElementById(STYLE_TAG_ID);
    const compiled = scopeIconCss(rawCss, { applyToDock });
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
  let _memState = { activeCss: "", applyToDock: true, presets: [] };

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
        const req = tx.objectStore(STORE_NAME).get("icon_css_state");
        req.onsuccess = () => {
          const res = req.result || {};
          const state = {
            activeCss: typeof res.activeCss === "string" ? res.activeCss : "",
            applyToDock: res.applyToDock !== undefined ? Boolean(res.applyToDock) : true,
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
    const next = { ...cur, ...(patch || {}), id: "icon_css_state", updatedAt: Date.now() };
    _memState = { activeCss: next.activeCss, applyToDock: next.applyToDock, presets: next.presets };
    applyLiveStyleTag(next.activeCss, next.applyToDock);
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
    const cleanName = String(name || "").trim() || `图标样式 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const cur = await loadState();
    const preset = { id: `icon_pr_${Date.now()}_${Math.floor(Math.random() * 1000)}`, name: cleanName, css: cleanCss, createdAt: Date.now() };
    const next = await saveState({ presets: [preset, ...(cur.presets || [])] });
    return { ok: true, preset, state: next };
  }

  async function deletePreset(presetId) {
    const cur = await loadState();
    const nextPresets = (cur.presets || []).filter((p) => p.id !== presetId);
    return await saveState({ presets: nextPresets });
  }

  // 移动端「手指划过实时点亮」桥接器（passive 零阻塞，不干扰翻页与拖拽）
  let _touchBridgeBound = false;
  function initTouchHoverBridge() {
    if (_touchBridgeBound || typeof global.document === "undefined") return;
    _touchBridgeBound = true;
    let curLitEl = null;
    let fadeTimer = null;

    const setLit = (el) => {
      if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
      if (curLitEl === el) return;
      if (curLitEl) curLitEl.classList.remove("hi-lit");
      curLitEl = el || null;
      if (curLitEl) curLitEl.classList.add("hi-lit");
    };

    const pickIconAt = (touch) => {
      if (!touch || typeof global.document.elementFromPoint !== "function") return null;
      const target = global.document.elementFromPoint(touch.clientX, touch.clientY);
      return target && typeof target.closest === "function" ? target.closest(".icon-item") : null;
    };

    global.document.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches.length === 1) setLit(pickIconAt(e.touches[0]));
    }, { passive: true });

    global.document.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length === 1) setLit(pickIconAt(e.touches[0]));
    }, { passive: true });

    const clearLater = () => {
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => setLit(null), 260);
    };
    global.document.addEventListener("touchend", clearLater, { passive: true });
    global.document.addEventListener("touchcancel", clearLater, { passive: true });
  }

  // 启动自动热挂载已保存的图标 CSS + 移动端划过点亮桥接
  initTouchHoverBridge();
  loadState().then((st) => {
    if (st && st.activeCss) applyLiveStyleTag(st.activeCss, st.applyToDock);
  }).catch(() => {});

  // ==========================================
  // 4. 手绘细线矢量 SVG（零 Emoji）
  // ==========================================
  function IconCssSvg(h, name, { size = 14, color = "currentColor" } = {}) {
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
      case "sample_chat":
        return h("svg", common, h("path", { d: "M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.4-4.7A8.4 8.4 0 1 1 21 11.5z" }));
      case "sample_cal":
        return h("svg", common, h("rect", { x: 3.5, y: 5, width: 17, height: 15.5, rx: 2.5 }), h("path", { d: "M8 3v4M16 3v4M3.5 10h17" }));
      case "sample_heart":
        return h("svg", common, h("path", { d: "M12 20.5s-7.5-4.7-9-9.2C1.9 7.8 4.4 4.5 7.8 4.5c2 0 3.4 1.1 4.2 2.4.8-1.3 2.2-2.4 4.2-2.4 3.4 0 5.9 3.3 4.8 6.8-1.5 4.5-9 9.2-9 9.2z" }));
      case "sample_music":
        return h("svg", common, h("circle", { cx: 12, cy: 12, r: 9 }), h("circle", { cx: 12, cy: 12, r: 2.8 }));
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
  // 5. 设置 → 主题 → 图标个性化下方：自定义 CSS 面板组件
  // ==========================================
  function HomeIconCssSection({ currentIcons = [] }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const [activeCss, setActiveCss] = useState("");
    const [applyToDock, setApplyToDock] = useState(true);
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
        setApplyToDock(st.applyToDock !== false);
        setPresets(st.presets || []);
      });
      return () => { alive = false; };
    }, []);

    const handleCssChange = (val) => {
      setActiveCss(val);
      saveState({ activeCss: val, applyToDock });
    };

    const handleToggleDock = () => {
      const next = !applyToDock;
      setApplyToDock(next);
      saveState({ activeCss, applyToDock: next });
      flash(next ? "已开启同步美化 Dock 栏图标" : "已切换为仅美化桌面图标");
    };

    const handleCopyDefault = async () => {
      const ok = await copyText(DEFAULT_ICON_CSS);
      flash(ok ? "已复制图标原本 CSS 模板" : "复制失败，请手动选中");
    };

    const handleSavePreset = async () => {
      if (!String(activeCss || "").trim()) {
        flash("请先编写或套用 CSS 再存为预设");
        return;
      }
      const res = await addPreset({ name: presetName, css: activeCss });
      if (res.ok) {
        setPresets(res.state.presets);
        setPresetName("");
        flash(`已存为预设「${res.preset.name}」`);
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
        const baseName = String(file.name || "导入图标样式").replace(/\.(css|txt|json)$/i, "").trim() || "导入图标样式";
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
            await saveState({ activeCss: firstCss, applyToDock });
            flash(`已导入 ${count} 套图标 CSS 至 IndexedDB`);
          } else {
            flash("JSON 中未找到有效 css 字段");
          }
          return;
        }
        const r = await addPreset({ name: baseName, css: trimmed });
        if (r.ok) {
          setPresets(r.state.presets);
          setActiveCss(trimmed);
          await saveState({ activeCss: trimmed, applyToDock });
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
      flash("已删除该图标样式预设");
    };

    const allPresets = [...BUILTIN_ICON_PRESETS, ...presets];
    const sampleIcons = [
      { label: currentIcons[0]?.label || "传讯", iconImage: currentIcons[0]?.iconImage || "", svg: "sample_chat", bg: "#E7F0EE" },
      { label: currentIcons[1]?.label || "日历", iconImage: currentIcons[1]?.iconImage || "", svg: "sample_cal", bg: "#F8EAE6" },
      { label: currentIcons[2]?.label || "情侣", iconImage: currentIcons[2]?.iconImage || "", svg: "sample_heart", bg: "#F4EFE6" },
      { label: currentIcons[3]?.label || "留声", iconImage: currentIcons[3]?.iconImage || "", svg: "sample_music", bg: "#EBF0F7" }
    ];

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
      h("div", { style: { fontSize: "13px", fontWeight: 700, color: "#7A826E", margin: "18px 0 8px 4px" } }, "图标自定义 CSS 与玻璃预设"),
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
            }, IconCssSvg(h, "copy", { size: 12, color: "#5A6252" }), "复制原本 CSS"),
            h("button", {
              type: "button",
              onClick: () => fileInputRef.current && fileInputRef.current.click(),
              style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "8px", padding: "5px 8px", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }
            }, IconCssSvg(h, "upload", { size: 12, color: "#5A6252" }), "导入 CSS"),
            h("button", {
              type: "button",
              onClick: () => {
                const content = String(activeCss || "").trim();
                if (!content) {
                  flash("当前图标 CSS 为空，请先选择预设或填写样式");
                  return;
                }
                try {
                  const blob = new Blob([content], { type: "text/css;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "主屏图标-自定义样式.css";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  flash("已导出图标 CSS 文件");
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
            }, IconCssSvg(h, "eye", { size: 12, color: showPreview ? "#FFFFFF" : "#5A6252" }), showPreview ? "收起预览" : "实时预览"),
            h("button", {
              type: "button",
              onClick: () => { handleCssChange(""); flash("已恢复图标默认外观"); },
              style: { border: "1px solid #E2DFD5", background: "#FAF9F5", color: "#7A826E", borderRadius: "8px", padding: "5px 8px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
            }, "重置")
          )
        ),

        // 实时预览舞台（模拟柔和渐变壁纸，直观呈现厚玻璃与清透玻璃透底效果）
        showPreview &&
          h(
            "div",
            {
              className: "hi-preview-stage",
              style: {
                background: "linear-gradient(135deg, #BFD5EE 0%, #D9CBE8 48%, #F4D8DC 100%)",
                borderRadius: "14px",
                padding: "14px 10px 12px",
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "8px",
                justifyItems: "center"
              }
            },
            sampleIcons.map((ic, idx) =>
              h(
                "div",
                { key: idx, className: "icon-item", style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" } },
                h(
                  "div",
                  {
                    className: "icon-box",
                    style: {
                      width: "48px",
                      height: "48px",
                      borderRadius: "16px",
                      background: ic.iconImage ? "transparent" : "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 6px 14px rgba(0,0,0,0.05)"
                    }
                  },
                  ic.iconImage
                    ? h("img", { src: ic.iconImage, alt: ic.label, style: { width: "100%", height: "100%", objectFit: "cover", borderRadius: "16px" } })
                    : IconCssSvg(h, ic.svg, { size: 21, color: "#5E6654" })
                ),
                h("span", { className: "icon-label", style: { fontSize: "10.5px", color: "#3A4233", fontWeight: 600 } }, ic.label)
              )
            )
          ),

        // 内置玻璃预设 & 自定义预设胶囊列表
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", { style: { fontSize: "11px", color: "#7A826E", fontWeight: 700 } }, "一键套用预设"),
            h("button", {
              type: "button",
              onClick: handleToggleDock,
              style: { border: "none", background: "transparent", color: applyToDock ? "#5A6B49" : "#999", fontSize: "11px", fontWeight: 700, cursor: "pointer", padding: 0 }
            }, applyToDock ? "同步美化 Dock 栏：开" : "同步美化 Dock 栏：关")
          ),
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
                  onClick: () => { handleCssChange(pr.css); flash(`已套用图标预设「${pr.name}」`); },
                  style: { cursor: "pointer", fontWeight: 700 }
                }, pr.name),
                !pr.builtin &&
                  h("button", {
                    type: "button",
                    onClick: () => setPendingDelete(pr),
                    style: { border: "none", background: "transparent", padding: "1px", cursor: "pointer", display: "flex" }
                  }, IconCssSvg(h, "close", { size: 11, color: "#7A826E" }))
              )
            )
          )
        ),

        // 自定义 CSS 文本域
        h("textarea", {
          rows: 5,
          value: activeCss,
          onChange: (e) => handleCssChange(e.target.value),
          placeholder: "在此粘贴或编写图标 CSS（如 .icon-box / .icon-box::before / .icon-label，覆盖背景阴影建议带 !important）…",
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
            placeholder: "给当前图标 CSS 预设起个名字…",
            style: { flex: 1, minWidth: 0, border: "1px solid #E2DFD5", borderRadius: "9px", padding: "6px 9px", fontSize: "11.5px", outline: "none" }
          }),
          h("button", {
            type: "button",
            onClick: handleSavePreset,
            style: { border: "none", background: "#6D735B", color: "#FFFFFF", borderRadius: "9px", padding: "6px 11px", fontSize: "11.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", flexShrink: 0 }
          }, IconCssSvg(h, "bookmark", { size: 12, color: "#FFFFFF" }), "存为预设")
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
              h("div", { style: { fontSize: "12.5px", color: "#6E7766", lineHeight: 1.55 } }, `确定要删除图标预设「${pendingDelete.name}」吗？删除后无法恢复。`),
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

  global.HomeIconCssSection = HomeIconCssSection;
  global.HomeIconCssEngine = {
    DB_NAME,
    DEFAULT_ICON_CSS,
    BUILTIN_ICON_PRESETS,
    scopeIconCss,
    applyLiveStyleTag,
    loadState,
    saveState,
    addPreset,
    deletePreset
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.HomeIconCssEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
