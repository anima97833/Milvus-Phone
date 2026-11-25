/**
 * Milvus/home_widget_css.js
 * 「主屏小组件 2.0」独立自定义 CSS 作用域编译器 + 6 大组件基准 CSS 模板库
 * - 完整支持 ::before / ::after 伪元素、@keyframes 动画与 @media 查询
 * - 自动限定作用域至 [data-hw-id="..."]，绝不污染全局主屏幕
 * - 提供一键复制默认 CSS（Clipboard API + execCommand 双轨兜底）
 */
(function (global) {
  "use strict";

  const COMMON_PSEUDO_HINT = [
    "/* 伪元素挂件示例（取消注释即可在卡片边缘挂贴纸/装饰，不会被裁切）：",
    ".hw-card::after {",
    "  content: \"\";",
    "  position: absolute;",
    "  right: 10px;",
    "  bottom: -14px;",
    "  width: 48px;",
    "  height: 48px;",
    "  background: url('你的图片链接') center/contain no-repeat;",
    "  pointer-events: none;",
    "  z-index: 6;",
    "}",
    "*/"
  ].join("\n");

  const DEFAULT_CSS_TEMPLATES = {
    music: [
      "/* === 留声机控台默认 CSS（支持 ::before / ::after 伪元素） === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 24px;",
      "  background: rgba(248, 248, 250, 0.86);",
      "  border: 1px solid rgba(255, 255, 255, 0.82);",
      "  box-shadow: 0 10px 26px rgba(30, 34, 42, 0.09);",
      "  backdrop-filter: blur(18px);",
      "  -webkit-backdrop-filter: blur(18px);",
      "  color: #1F2329;",
      "}",
      ".hw-music-cover {",
      "  border-radius: 12px;",
      "  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);",
      "}",
      ".hw-music-title {",
      "  color: #1F2329;",
      "  font-weight: 800;",
      "}",
      ".hw-music-artist {",
      "  color: #8E929B;",
      "}",
      ".hw-music-bar-track {",
      "  background: rgba(140, 145, 155, 0.24);",
      "}",
      ".hw-music-bar-fill {",
      "  background: #7A7E86;",
      "}",
      ".hw-music-controls button {",
      "  color: #1F2329;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    couple_wish: [
      "/* === 心愿签默认 CSS（支持 ::before / ::after 伪元素） === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: rgba(250, 246, 238, 0.94);",
      "  border: 1px solid rgba(184, 155, 114, 0.36);",
      "  backdrop-filter: blur(14px);",
      "  color: #3E342B;",
      "}",
      ".hw-wish-title {",
      "  color: #3E342B;",
      "  font-weight: 700;",
      "  line-height: 1.55;",
      "}",
      ".hw-wish-tag {",
      "  color: #B85D3B;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    guangling_news: [
      "/* === 广陵联播小组件默认 CSS（支持 ::before / ::after 伪元素） === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: linear-gradient(145deg, rgba(16, 36, 76, 0.92), rgba(10, 22, 46, 0.94));",
      "  border: 1px solid rgba(130, 192, 255, 0.32);",
      "  backdrop-filter: blur(14px);",
      "  color: #EAF3FF;",
      "}",
      ".hw-news-brand {",
      "  color: #93C5FD;",
      "  font-weight: 800;",
      "}",
      ".hw-news-headline {",
      "  color: #F4F8FF;",
      "  font-weight: 700;",
      "}",
      ".hw-news-meta {",
      "  color: #9BB4D6;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    couple_bills: [
      "/* === 共同账本默认 CSS（支持 ::before / ::after 伪元素） === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: rgba(250, 246, 238, 0.94);",
      "  border: 1px solid rgba(184, 155, 114, 0.36);",
      "  backdrop-filter: blur(14px);",
      "  color: #3E342B;",
      "}",
      ".hw-bill-summary {",
      "  font-weight: 800;",
      "}",
      ".hw-bill-row {",
      "  color: #4A3C31;",
      "}",
      ".hw-bill-amount {",
      "  font-weight: 800;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    chenwei_oracle: [
      "/* === 谶纬签匣默认 CSS（支持 ::before / ::after 伪元素） === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: rgba(250, 246, 238, 0.94);",
      "  border: 1px solid rgba(184, 155, 114, 0.42);",
      "  backdrop-filter: blur(14px);",
      "  color: #3E342B;",
      "}",
      ".hw-chenwei-hex {",
      "  color: #C84B31;",
      "  font-weight: 800;",
      "}",
      ".hw-chenwei-verse {",
      "  color: #4A3C31;",
      "  line-height: 1.55;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    clock: [
      "/* === 时辰节气钟默认 CSS === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: rgba(255, 255, 255, 0.74);",
      "  border: 1px solid rgba(255, 255, 255, 0.68);",
      "  backdrop-filter: blur(14px);",
      "  color: #3A4233;",
      "}",
      ".hw-clock-time {",
      "  font-weight: 800;",
      "  letter-spacing: 1px;",
      "}",
      ".hw-clock-shichen {",
      "  color: #6D735B;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    couple_days: [
      "/* === 情侣纪念日默认 CSS === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: rgba(250, 246, 238, 0.94);",
      "  border: 1px solid rgba(184, 155, 114, 0.36);",
      "  color: #3E342B;",
      "}",
      ".hw-couple-days-num {",
      "  color: #D6724B;",
      "  font-weight: 900;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    photo: [
      "/* === 自由相框（支持多图平滑轮播）默认 CSS === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: rgba(250, 246, 238, 0.94);",
      "  border: 1px solid rgba(184, 155, 114, 0.36);",
      "}",
      ".hw-photo-track {",
      "  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);",
      "}",
      ".hw-photo-img {",
      "  object-fit: cover;",
      "}",
      ".hw-photo-caption {",
      "  color: #8C7A68;",
      "}",
      ".hw-photo-dots {",
      "  bottom: 6px;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    char_quote: [
      "/* === 名士语录签（支持多行与黑点清单）默认 CSS === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: rgba(255, 255, 255, 0.76);",
      "  border: 1px solid rgba(255, 255, 255, 0.7);",
      "  color: #3A4233;",
      "}",
      ".hw-quote-body {",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "}",
      ".hw-quote-text {",
      "  line-height: 1.6;",
      "}",
      ".hw-quote-bullet {",
      "  background-color: currentColor;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    calendar: [
      "/* === 日程便签默认 CSS === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 20px;",
      "  background: rgba(250, 246, 238, 0.94);",
      "  border: 1px solid rgba(184, 155, 114, 0.36);",
      "  color: #3E342B;",
      "}",
      ".hw-calendar-item {",
      "  font-size: 11px;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n"),

    fold_card: [
      "/* === 折叠式卡片默认 CSS === */",
      ".hw-card {",
      "  position: relative;",
      "  overflow: visible;",
      "}",
      ".hw-surface {",
      "  border-radius: 24px;",
      "  background: rgba(255, 255, 255, 0.86);",
      "  border: 1px solid rgba(109, 115, 91, 0.2);",
      "  backdrop-filter: blur(14px);",
      "  color: #3A4233;",
      "}",
      ".hw-fold-title {",
      "  color: #3A4233;",
      "  font-weight: 800;",
      "}",
      ".hw-fold-sub {",
      "  color: #7A826E;",
      "}",
      "",
      COMMON_PSEUDO_HINT
    ].join("\n")
  };

  function getDefaultCss(type) {
    return DEFAULT_CSS_TEMPLATES[type] || DEFAULT_CSS_TEMPLATES.clock;
  }

  // ==========================================
  // 1. 安全作用域 CSS 编译器（完整支持伪元素与 @keyframes）
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

  function scopeSelectorList(selectorText, scopeSelector) {
    return selectorText
      .split(",")
      .map((part) => {
        const s = part.trim();
        if (!s) return "";
        if (s.startsWith(scopeSelector)) return s;
        if (s.startsWith("::")) return `${scopeSelector}${s}`;
        if (/^\.hw-card(?=$|[\s.:#\[>+~])/.test(s)) {
          return `${scopeSelector}${s}`;
        }
        return `${scopeSelector} ${s}`;
      })
      .filter(Boolean)
      .join(", ");
  }

  function scopeBlock(cssBody, scopeSelector) {
    let out = "";
    let i = 0;
    const len = cssBody.length;

    while (i < len) {
      while (i < len && /\s/.test(cssBody[i])) i++;
      if (i >= len) break;

      const openIdx = cssBody.indexOf("{", i);
      if (openIdx < 0) break;

      const header = cssBody.slice(i, openIdx).trim();
      // 匹配成对花括号
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
        // 保留动画关键帧原样可用
        out += `${header} {${inner}}\n`;
      } else if (/^@(media|supports|container)\b/i.test(header)) {
        out += `${header} {\n${scopeBlock(inner, scopeSelector)}}\n`;
      } else if (header.startsWith("@")) {
        // 忽略其他不安全顶层 at-rule
        continue;
      } else {
        const scopedSel = scopeSelectorList(header, scopeSelector);
        if (scopedSel) {
          out += `${scopedSel} {${inner}}\n`;
        }
      }
    }
    return out;
  }

  function scopeWidgetCss(rawCss, widgetId) {
    const clean = stripComments(sanitizeRawCss(rawCss)).trim();
    if (!clean) return "";
    const safeId = String(widgetId || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeId) return "";
    const scopeSelector = `[data-hw-id="${safeId}"]`;
    return scopeBlock(clean, scopeSelector);
  }

  // ==========================================
  // 2. 双轨一键复制工具（Clipboard API + execCommand 兜底）
  // ==========================================
  async function copyTextWithFallback(text) {
    const str = String(text || "");
    if (!str) return false;
    try {
      if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === "function") {
        await global.navigator.clipboard.writeText(str);
        return true;
      }
    } catch (e) {}
    try {
      if (global.document && global.document.body) {
        const ta = global.document.createElement("textarea");
        ta.value = str;
        ta.setAttribute("readonly", "readonly");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.left = "-9999px";
        global.document.body.appendChild(ta);
        ta.select();
        const ok = global.document.execCommand("copy");
        global.document.body.removeChild(ta);
        return !!ok;
      }
    } catch (e) {}
    return false;
  }

  const BUILTIN_CSS_PRESETS = [
    {
      id: "builtin_couple_oatmeal",
      name: "燕麦棕",
      type: "all",
      builtin: true,
      css: `/* === 1. 整体外框（必须 visible，让顶部棕胶带探出卡片边缘） === */
.hw-card {
  position: relative;
  overflow: visible !important;
}

/* === 2. 顶部正中央立体咖啡棕胶带 === */
.hw-card::before {
  content: "";
  position: absolute;
  top: -7px;
  left: 0;
  right: 0;
  height: 24px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 28'%3E%3Crect x='2' y='4' width='56' height='22' rx='7' fill='%237D5B3F'/%3E%3Crect x='2' y='1' width='56' height='21' rx='7' fill='%23997352'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: top center;
  background-size: 44px 20px;
  z-index: 8;
  pointer-events: none;
}

/* === 3. 奶白明信片机身 + 底部暖米色分段底座 === */
.hw-surface {
  position: relative;
  z-index: 2;
  height: 100% !important;
  border-radius: 18px !important;
  background: linear-gradient(180deg, #FAF7F0 0%, #FAF7F0 74%, #F2ECE0 74.1%, #F2ECE0 100%) !important;
  border: 1.5px solid #EAE2D3 !important;
  box-shadow:
    0 5px 14px rgba(135, 115, 85, 0.12),
    0 2px 4px rgba(135, 115, 85, 0.08) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  color: #3E3A35 !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}

/* === 4. 右上角：复古圆形邮戳波浪水印 === */
.hw-surface::before {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: 135px;
  height: 68px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 150 75'%3E%3Cg stroke='%23EFE9DD' stroke-width='2.2' fill='none'%3E%3Ccircle cx='88' cy='38' r='32'/%3E%3Ccircle cx='88' cy='38' r='22'/%3E%3Ccircle cx='88' cy='38' r='12'/%3E%3Cpath d='M95 25 Q108 19 120 25 T145 25 T165 25'/%3E%3Cpath d='M95 36 Q108 30 120 36 T145 36 T165 36'/%3E%3Cpath d='M95 47 Q108 41 120 47 T145 47 T165 47'/%3E%3C/g%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: top right;
  z-index: 0;
  pointer-events: none;
}

.hw-surface > * {
  position: relative;
  z-index: 2;
}

/* === 5. 头像框与文字 === */
.hw-surface img {
  background: #F4EFE4 !important;
  border-radius: 14px !important;
  border: 2px solid #EFE8DA !important;
}

.hw-surface * {
  color: #ACA18E !important;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Rounded", "PingFang SC", sans-serif !important;
}

.hw-couple-days-num,
.hw-clock-time {
  display: inline-block !important;
  background: #EAE1CD !important;
  color: #3B3734 !important;
  font-weight: 800 !important;
  border-radius: 9px !important;
  padding: 2px 10px !important;
  margin: 0 3px !important;
  letter-spacing: 0.4px;
}

.hw-music-title,
.hw-fold-title {
  color: #3B3734 !important;
  font-weight: 800 !important;
}`
    },
    {
      id: "builtin_couple_bevel_glass",
      name: "后倒角折射玻璃",
      type: "all",
      builtin: true,
      css: `/* === 1. 整体外框 === */
.hw-card {
  position: relative;
  overflow: visible !important;
}

/* === 2. 底部：立体悬浮柔影 + 玻璃折射透光斑 === */
.hw-card::before {
  content: "";
  position: absolute;
  left: 5%;
  right: 3%;
  bottom: -11px;
  height: 22px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 18% 20%, rgba(255, 255, 255, 0.95) 0%, transparent 35%),
    radial-gradient(ellipse 45% 60% at 50% 30%, rgba(255, 255, 255, 0.75) 0%, transparent 70%),
    linear-gradient(90deg, rgba(145, 155, 170, 0.32) 0%, rgba(120, 130, 145, 0.45) 50%, rgba(110, 120, 136, 0.55) 100%);
  filter: blur(6px);
  z-index: 0;
  pointer-events: none;
}

/* === 3. 3D 液态厚水晶机身 === */
.hw-surface {
  position: relative;
  z-index: 2;
  height: 100% !important;
  border-radius: 22px !important;
  background:
    radial-gradient(circle at 14% 8%, rgba(255, 255, 255, 0.95) 0%, transparent 18%),
    radial-gradient(circle at 16% 93%, rgba(255, 255, 255, 0.98) 0%, transparent 16%),
    radial-gradient(circle at 92% 16%, rgba(255, 255, 255, 0.9) 0%, transparent 18%),
    radial-gradient(circle at 93% 86%, rgba(255, 255, 255, 0.92) 0%, transparent 18%),
    radial-gradient(ellipse 75% 50% at 50% 90%, rgba(255, 255, 255, 0.55) 0%, transparent 70%),
    linear-gradient(180deg, rgba(235, 240, 246, 0.42) 0%, rgba(215, 222, 232, 0.25) 48%, rgba(230, 236, 244, 0.48) 100%) !important;
  border: 1.5px solid rgba(255, 255, 255, 0.88) !important;
  box-shadow:
    inset 0 0 0 1.5px rgba(150, 160, 175, 0.35),
    inset 0 3px 4px rgba(135, 145, 160, 0.42),
    inset 0 -3px 4px rgba(140, 150, 165, 0.35),
    inset 4px 0 5px rgba(140, 150, 165, 0.32),
    inset -4px 0 5px rgba(140, 150, 165, 0.32),
    inset 0 6px 10px rgba(255, 255, 255, 0.75),
    inset 0 -7px 14px rgba(255, 255, 255, 0.9),
    0 10px 20px -5px rgba(125, 136, 152, 0.38),
    0 2px 6px rgba(125, 136, 152, 0.22) !important;
  backdrop-filter: blur(12px) saturate(120%) !important;
  -webkit-backdrop-filter: blur(12px) saturate(120%) !important;
  color: #5A6069 !important;
  box-sizing: border-box !important;
}

/* === 4. 第二道内环高光 === */
.hw-card::after {
  content: "";
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: 6px;
  right: 6px;
  border-radius: 17px;
  border: 1.2px solid rgba(255, 255, 255, 0.78);
  box-shadow:
    inset 0 1px 2px rgba(130, 140, 155, 0.25),
    0 1px 2px rgba(255, 255, 255, 0.6);
  z-index: 5;
  pointer-events: none;
}

.hw-surface > * {
  position: relative;
  z-index: 6;
}

.hw-surface * {
  color: #5E646E !important;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.85) !important;
}

.hw-couple-days-num,
.hw-clock-time,
.hw-music-title,
.hw-fold-title {
  color: #484E57 !important;
  font-weight: 700 !important;
  letter-spacing: 0.5px;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.95),
    0 0 10px rgba(255, 255, 255, 0.7) !important;
}`
    },
    {
      id: "builtin_couple_neumorphism",
      name: "新拟态",
      type: "all",
      builtin: true,
      css: `/* === 1. 整体外框 === */
.hw-card {
  position: relative;
  overflow: visible !important;
}

/* === 2. 外层方卡：向上凸起的软白新拟态机身 === */
.hw-surface {
  position: relative;
  height: 100% !important;
  border-radius: 22px !important;
  background: #ECEDF1 !important;
  border: 1px solid rgba(255, 255, 255, 0.65) !important;
  box-shadow:
    7px 7px 15px rgba(166, 173, 189, 0.55),
    -6px -6px 14px rgba(255, 255, 255, 0.95),
    inset 1px 1px 1px rgba(255, 255, 255, 0.85),
    inset -1px -1px 2px rgba(174, 180, 194, 0.25) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  color: #7D818A !important;
  padding: 16px 18px !important;
  box-sizing: border-box !important;
}

/* === 3. 内部对称内凹方槽 === */
.hw-surface::before {
  content: "";
  position: absolute;
  top: 9px;
  bottom: 9px;
  left: 9px;
  right: 9px;
  border-radius: 14px;
  background: #EAEBF0;
  box-shadow:
    inset 4px 4px 7px rgba(163, 170, 185, 0.62),
    inset 1.5px 1.5px 3px rgba(155, 162, 178, 0.45),
    inset -4px -4px 7px rgba(255, 255, 255, 0.96),
    inset -1px -1px 2px rgba(255, 255, 255, 1),
    0 1px 0 rgba(255, 255, 255, 0.7);
  z-index: 0;
  pointer-events: none;
}

.hw-surface > * {
  position: relative;
  z-index: 2;
}

/* === 4. 内部文字与纪念日数字 === */
.hw-surface * {
  color: #82868F !important;
}

.hw-couple-days-num,
.hw-clock-time,
.hw-music-title,
.hw-fold-title {
  color: #6B707B !important;
  font-weight: 700 !important;
  letter-spacing: 0.4px;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.85) !important;
}`
    },
    {
      id: "builtin_couple_clear_glass",
      name: "透明玻璃",
      type: "all",
      builtin: true,
      css: `/* === 1. 整体外框 === */
.hw-card {
  position: relative;
  overflow: visible !important;
}

/* === 2. 底部焦散聚光灯 + 右下立体深影 === */
.hw-card::before {
  content: "";
  position: absolute;
  left: 6%;
  right: 2%;
  bottom: -10px;
  height: 22px;
  border-radius: 16px;
  background:
    radial-gradient(ellipse 48% 70% at 54% 15%, rgba(255, 252, 245, 0.95) 0%, rgba(255, 246, 232, 0.45) 50%, transparent 80%),
    rgba(72, 62, 52, 0.34);
  filter: blur(5px);
  z-index: 0;
  pointer-events: none;
}

/* === 3. visionOS 空间磨砂玻璃机身 === */
.hw-surface {
  position: relative;
  z-index: 2;
  height: 100% !important;
  border-radius: 14px !important;
  background:
    radial-gradient(ellipse 55% 38% at 55% 100%, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0) 75%),
    linear-gradient(135deg, rgba(235, 229, 222, 0.58) 0%, rgba(190, 182, 173, 0.36) 52%, rgba(168, 158, 148, 0.44) 100%) !important;
  border: 1px solid rgba(255, 255, 255, 0.48) !important;
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.78),
    inset 1px 0 1px rgba(255, 255, 255, 0.45),
    inset 0 -1.5px 2px rgba(255, 255, 255, 0.92),
    inset 0 -6px 14px rgba(255, 250, 240, 0.38),
    0 8px 18px -4px rgba(65, 55, 45, 0.28) !important;
  backdrop-filter: blur(18px) saturate(130%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(130%) !important;
  color: rgba(255, 255, 255, 0.95) !important;
  text-shadow: 0 1px 3px rgba(70, 60, 50, 0.22) !important;
  box-sizing: border-box !important;
}

/* === 4. 底部边缘高光灯条 === */
.hw-card::after {
  content: "";
  position: absolute;
  left: 22%;
  right: 18%;
  bottom: -1px;
  height: 3px;
  background: radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 250, 240, 0.7) 45%, transparent 80%);
  filter: blur(0.6px);
  z-index: 6;
  pointer-events: none;
}

/* === 5. 柔光纯白粗体字 === */
.hw-surface * {
  color: rgba(255, 255, 255, 0.94) !important;
  border-color: rgba(255, 255, 255, 0.5) !important;
}

.hw-couple-days-num,
.hw-clock-time,
.hw-music-title,
.hw-fold-title {
  color: #FFFFFF !important;
  font-weight: 800 !important;
  letter-spacing: 0.4px;
  text-shadow:
    0 0 12px rgba(255, 255, 255, 0.65),
    0 1px 2px rgba(60, 50, 40, 0.25) !important;
}`
    },
    {
      id: "builtin_couple_rustic",
      name: "质朴风",
      type: "all",
      builtin: true,
      css: `/* === 1. 整体外框 === */
.hw-card {
  position: relative;
  overflow: visible;
}

/* 复古奶黄网页窗口机身 + 炭黑描边 */
.hw-surface {
  position: relative;
  height: 100% !important;
  border-radius: 7px !important;
  background: #F6F3E2 !important;
  border: 1.5px solid #35332E !important;
  color: #2E2C28 !important;
  box-shadow:
    0 3px 0 rgba(53, 51, 46, 0.14),
    0 6px 14px rgba(53, 51, 46, 0.08) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  padding-top: 26px !important;
  box-sizing: border-box !important;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif !important;
  overflow: hidden !important;
}

/* === 2. 顶部：复古描边红黄绿三点 + home. + 分割线 === */
.hw-surface::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 22px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 24'%3E%3Crect width='300' height='23' fill='%23F3EFE0'/%3E%3Cline x1='0' y1='22.5' x2='300' y2='22.5' stroke='%239E9A8B' stroke-width='0.8'/%3E%3Ccircle cx='13' cy='11.5' r='4.2' fill='%23D96B70' stroke='%2335332E' stroke-width='1.3'/%3E%3Ccircle cx='26' cy='11.5' r='4.2' fill='%23E3CF74' stroke='%2335332E' stroke-width='1.3'/%3E%3Ccircle cx='39' cy='11.5' r='4.2' fill='%23A3B899' stroke='%2335332E' stroke-width='1.3'/%3E%3Ctext x='286' y='15.5' text-anchor='end' font-family='-apple-system, BlinkMacSystemFont, sans-serif' font-size='11.5' font-weight='500' fill='%2335332E' letter-spacing='0.2'%3Ehome.%3C/text%3E%3C/svg%3E");
  background-size: 100% 100%;
  background-repeat: no-repeat;
  z-index: 1;
  pointer-events: none;
}

.hw-surface > * {
  position: relative;
  z-index: 2;
}

/* === 3. 情侣头像复古黑细边 === */
.hw-surface img {
  border: 1.5px solid #35332E !important;
  box-shadow: 0 1.5px 0 rgba(53, 51, 46, 0.15) !important;
}`
    }
  ];

  const api = {
    DEFAULT_CSS_TEMPLATES,
    BUILTIN_CSS_PRESETS,
    getDefaultCss,
    scopeWidgetCss,
    copyTextWithFallback
  };

  global.HomeWidgetCss = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

