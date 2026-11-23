/**
 * Milvus/wanxiang_studio_engine.js
 * 鸢小手机「万象」在线装扮协作台（气泡 / 工具栏 / 头像框 / AI 协同设计）
 * - 100% 独立 IndexedDB（milvus_wanxiang_studio_idb），零 localStorage 占用
 * - 借鉴 SullyOS 神经链接·协同工作与装扮工坊架构：Sidecar 隔离 + Scoped CSS 安全校验 + Blob 旁路存储 + AI 协同作品块协议
 * - 导出 window.WanxiangStudioEngine（含 PrivatePlusDrawer / WanxiangStudioModal / applyForChat）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_wanxiang_studio_idb";
  const DB_VERSION = 1;
  const STORE_PRESETS = "presets";
  const STORE_BINDINGS = "char_bindings";
  const STORE_BLOBS = "blob_assets";
  const STORE_COLLAB = "collab_sessions";
  const RUNTIME_STYLE_ID = "milvus-wanxiang-runtime-style";

  const BUBBLE_PRESETS = [
    {
      id: "xuanzhi_ink",
      name: "宣纸墨韵",
      swatch: "#F6F1E6",
      me: { bg: "#5E6756", color: "#FFFFFF", radius: 18, border: "1px solid #4E5647", shadow: "soft", opacity: 1 },
      them: { bg: "#FAF7F0", color: "#38342E", radius: 18, border: "1px solid #E2D9C8", shadow: "soft", opacity: 1 }
    },
    {
      id: "celadon_jade",
      name: "青玉霜华",
      swatch: "#DCE9E2",
      me: { bg: "#4C7A6B", color: "#FFFFFF", radius: 20, border: "1px solid #3E675A", shadow: "soft", opacity: 1 },
      them: { bg: "#F2F8F5", color: "#2D423A", radius: 20, border: "1px solid #CBE0D6", shadow: "none", opacity: 1 }
    },
    {
      id: "warm_apricot",
      name: "暮云暖杏",
      swatch: "#F7E5D8",
      me: { bg: "#C97856", color: "#FFFFFF", radius: 18, border: "1px solid #B66746", shadow: "soft", opacity: 1 },
      them: { bg: "#FFF9F4", color: "#4A3A31", radius: 18, border: "1px solid #EED8C8", shadow: "soft", opacity: 1 }
    },
    {
      id: "obsidian_night",
      name: "炭黑夜读",
      swatch: "#26282E",
      me: { bg: "#3B4252", color: "#F1F5F9", radius: 16, border: "1px solid #4C566A", shadow: "soft", opacity: 1 },
      them: { bg: "#1E2026", color: "#E2E8F0", radius: 16, border: "1px solid #323640", shadow: "soft", opacity: 1 }
    },
    {
      id: "mist_violet",
      name: "雾紫轻纱",
      swatch: "#ECE6F6",
      me: { bg: "#7B6B9B", color: "#FFFFFF", radius: 22, border: "1px solid #695A87", shadow: "soft", opacity: 1 },
      them: { bg: "#FAF8FE", color: "#3D354D", radius: 22, border: "1px solid #DFD5F0", shadow: "none", opacity: 1 }
    },
    {
      id: "glass_clear",
      name: "琉璃清透",
      swatch: "#E8F1F5",
      me: { bg: "#557A8C", color: "#FFFFFF", radius: 20, border: "1px solid rgba(255,255,255,0.45)", shadow: "soft", opacity: 0.92 },
      them: { bg: "#FFFFFF", color: "#334155", radius: 20, border: "1px solid rgba(203,213,225,0.8)", shadow: "soft", opacity: 0.88 }
    }
  ];

  function svgToDataUrl(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.trim());
  }

  const BUILTIN_AVATAR_FRAMES = [
    { id: "none", name: "无头像框", url: "" },
    {
      id: "gold_cloud",
      name: "金丝云纹",
      url: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="none" stroke="#D4AF37" stroke-width="3.2" stroke-dasharray="10 4 2 4"/><circle cx="60" cy="60" r="49" fill="none" stroke="#F3DC8B" stroke-width="1.2"/><circle cx="60" cy="6" r="4.5" fill="#D4AF37"/><circle cx="60" cy="114" r="3.5" fill="#D4AF37"/></svg>`)
    },
    {
      id: "jade_bamboo",
      name: "青竹素环",
      url: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="53" fill="none" stroke="#6E8F7B" stroke-width="3.5"/><circle cx="60" cy="60" r="48" fill="none" stroke="#B6CEBE" stroke-width="1.2" stroke-dasharray="6 5"/><path d="M94 22 C104 14 112 24 102 32 C96 29 94 25 94 22 Z" fill="#6E8F7B"/><path d="M18 92 C10 100 18 109 28 100 C25 95 22 93 18 92 Z" fill="#89A894"/></svg>`)
    },
    {
      id: "cinnabar_seal",
      name: "朱砂方印",
      url: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect x="6" y="6" width="108" height="108" rx="18" fill="none" stroke="#B84A39" stroke-width="3.5"/><rect x="12" y="12" width="96" height="96" rx="14" fill="none" stroke="#E29A8E" stroke-width="1.2" stroke-dasharray="8 4"/></svg>`)
    },
    {
      id: "star_orbit",
      name: "星轨微光",
      url: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="none" stroke="#8C7AA9" stroke-width="2.2"/><ellipse cx="60" cy="60" rx="57" ry="22" transform="rotate(-28 60 60)" fill="none" stroke="#C5B4E3" stroke-width="1.6"/><circle cx="101" cy="30" r="4" fill="#F2D06B"/><circle cx="20" cy="88" r="2.6" fill="#C5B4E3"/></svg>`)
    }
  ];

  const ADVANCED_CSS_TEMPLATES = [
    {
      id: "official_skeleton",
      name: "官方标准骨架模板",
      desc: "含 6 大真实选择器注释，适合直接改色或发给外部 AI 定制",
      css: `/* =====================================================
   鸢小手机 · 万象自定义 CSS 标准模板
   说明：无需手写角色 ID 前缀，系统会自动限定在当前私聊内生效。
   安全规范：禁止写 html / body / :root / @import / javascript:
   ===================================================== */

/* 1. 聊天顶栏 */
.chat-header {
  background: rgba(250, 248, 244, 0.92) !important;
  backdrop-filter: blur(10px) !important;
  border-bottom: 1px solid #E5DFD3 !important;
}

/* 2. 名士气泡（左侧）与 我的气泡（右侧） */
.msg-bubble.them {
  background: #FAF7F0 !important;
  color: #38342E !important;
  border: 1px solid #E2D9C8 !important;
  border-radius: 18px !important;
}
.msg-bubble.me {
  background: #5E6756 !important;
  color: #FFFFFF !important;
  border-radius: 18px !important;
}

/* 3. 双方头像与头像框（.role-avatar 为名士，.user-avatar 为我） */
.role-avatar, .user-avatar {
  border: 2px solid #D8CFC0 !important;
  box-shadow: 0 2px 8px rgba(60, 50, 40, 0.12) !important;
}

/* 4. 底部工具栏与图标按钮 */
.chat-toolbar.chat-action-bar {
  background: rgba(250, 248, 243, 0.92) !important;
  border-top: 1px solid #E5DFD3 !important;
}
.chat-toolbar .chat-action-btn i {
  color: #5E6756 !important;
}

/* 5. 输入框 */
.chat-input {
  background: #FFFFFF !important;
  border: 1px solid #DDD5C7 !important;
  border-radius: 18px !important;
  color: #38342E !important;
}

/* 6. 发送按钮 */
.chat-send-btn {
  background: #5E6756 !important;
  color: #FFFFFF !important;
  border-radius: 16px !important;
}`
    },
    {
      id: "xuanzhi_full",
      name: "宣纸墨韵整屏",
      desc: "温润暖宣纸 + 细金描边 + 黛青点缀",
      css: `/* 宣纸墨韵整屏装扮 */
.chat-header {
  background: linear-gradient(180deg, #FAF6EE 0%, #F4EFE4 100%) !important;
  border-bottom: 1px solid #DFD4BF !important;
}
.msg-bubble.them {
  background: #FFFDF8 !important;
  color: #3D352C !important;
  border: 1px solid #E3D7C1 !important;
  box-shadow: 0 2px 8px rgba(90, 72, 48, 0.08) !important;
  border-radius: 16px !important;
}
.msg-bubble.me {
  background: linear-gradient(135deg, #5E6756 0%, #4A5243 100%) !important;
  color: #FAF8F3 !important;
  border-radius: 16px !important;
}
.chat-toolbar.chat-action-bar {
  background: rgba(248, 243, 233, 0.94) !important;
  border-top: 1px solid #E2D6C0 !important;
}
.chat-input {
  background: #FFFDF9 !important;
  border: 1px solid #D9CBB2 !important;
  border-radius: 14px !important;
}
.chat-send-btn {
  background: #8B5E3C !important;
  color: #FFFDF9 !important;
}`
    },
    {
      id: "glass_full",
      name: "微透琉璃整屏",
      desc: "轻盈毛玻璃 + 清透冰蓝边框",
      css: `/* 微透琉璃整屏装扮 */
.chat-header {
  background: rgba(255, 255, 255, 0.72) !important;
  backdrop-filter: blur(14px) !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25) !important;
}
.msg-bubble.them {
  background: rgba(255, 255, 255, 0.84) !important;
  backdrop-filter: blur(8px) !important;
  color: #2D3748 !important;
  border: 1px solid rgba(255, 255, 255, 0.7) !important;
  box-shadow: 0 4px 14px rgba(100, 116, 139, 0.1) !important;
}
.msg-bubble.me {
  background: rgba(85, 122, 140, 0.9) !important;
  color: #FFFFFF !important;
  border: 1px solid rgba(255, 255, 255, 0.35) !important;
}
.chat-toolbar.chat-action-bar {
  background: rgba(255, 255, 255, 0.7) !important;
  backdrop-filter: blur(14px) !important;
}
.chat-send-btn {
  background: linear-gradient(135deg, #557A8C 0%, #6D97AB 100%) !important;
  color: #FFFFFF !important;
}`
    },
    {
      id: "night_ink",
      name: "暗夜护眼整屏",
      desc: "深炭灰低眩光 + 高对比柔白字",
      css: `/* 暗夜护眼整屏装扮 */
.chat-header {
  background: #1C1E24 !important;
  color: #E2E8F0 !important;
  border-bottom: 1px solid #2D313B !important;
}
.msg-bubble.them {
  background: #252830 !important;
  color: #E2E8F0 !important;
  border: 1px solid #353945 !important;
}
.msg-bubble.me {
  background: #3B4958 !important;
  color: #F8FAFC !important;
  border: 1px solid #4C5D70 !important;
}
.chat-toolbar.chat-action-bar {
  background: #1C1E24 !important;
  border-top: 1px solid #2D313B !important;
}
.chat-toolbar .chat-action-btn i {
  color: #CBD5E1 !important;
}
.chat-input {
  background: #252830 !important;
  border: 1px solid #353945 !important;
  color: #F1F5F9 !important;
}
.chat-send-btn {
  background: #4C6478 !important;
  color: #FFFFFF !important;
}`
    }
  ];

  function createDefaultDraft() {
    return {
      version: 1,
      bubble: {
        enabled: true,
        me: { bg: "#5E6756", color: "#FFFFFF", radius: 18, border: "1px solid #4E5647", shadow: "soft", opacity: 1 },
        them: { bg: "#FAF7F0", color: "#38342E", radius: 18, border: "1px solid #E2D9C8", shadow: "soft", opacity: 1 },
        customCss: ""
      },
      toolbar: {
        enabled: true,
        bg: "#FAF8F3",
        opacity: 0.92,
        blur: 12,
        iconColor: "#5E6756",
        borderColor: "#E5DFD3",
        floating: false,
        customCss: ""
      },
      avatarFrame: {
        enabled: false,
        target: "both", // "them" | "me" | "both"
        builtinId: "none",
        blobId: "",
        x: 50,
        y: 50,
        scale: 1.24,
        rotate: 0,
        customCss: ""
      },
      partCss: {
        header: "",
        input: "",
        sendBtn: ""
      },
      advancedCss: ""
    };
  }

  // ==========================================
  // 1. 安全 CSS 校验器 & 编译器（纯函数，可单测）
  // ==========================================
  const FORBIDDEN_CSS_PATTERNS = [
    { re: /@import\b/i, msg: "禁止使用 @import 外部样式导入" },
    { re: /javascript\s*:/i, msg: "禁止包含 javascript: 脚本协议" },
    { re: /expression\s*\(/i, msg: "禁止包含 expression() 表达式" },
    { re: /(?:^|[},;\s])(?:html|body|:root)\b/i, msg: "禁止直接修改 html / body / :root 全局选择器" }
  ];

  function stripCssComments(cssText) {
    return String(cssText || "").replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function validateScopedCss(cssText) {
    const raw = String(cssText || "").trim();
    if (!raw) return { ok: true, errors: [], sanitized: "" };
    const noComments = stripCssComments(raw).trim();
    const errors = [];
    for (const rule of FORBIDDEN_CSS_PATTERNS) {
      if (rule.re.test(noComments)) errors.push(rule.msg);
    }
    const openBraces = (noComments.match(/\{/g) || []).length;
    const closeBraces = (noComments.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push("CSS 花括号数量不匹配，请检查是否漏写 { 或 }");
    }
    return {
      ok: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? noComments : ""
    };
  }

  function hexToRgba(hex, alpha) {
    const a = Math.max(0, Math.min(1, Number(alpha === undefined ? 1 : alpha)));
    const clean = String(hex || "#ffffff").trim();
    if (/^rgba?\(/i.test(clean)) return clean;
    const m = clean.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return clean;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function shadowValue(kind) {
    if (kind === "strong") return "0 6px 18px rgba(45, 38, 30, 0.14)";
    if (kind === "soft") return "0 2px 10px rgba(45, 38, 30, 0.08)";
    return "none";
  }

  function prefixScopedCss(rawCss, scopeSelector) {
    const check = validateScopedCss(rawCss);
    if (!check.ok || !check.sanitized) return "";
    // 兼容把 .ai-avatar 自动映射到小手机真实的名士头像类名 .role-avatar
    const normalized = check.sanitized.replace(/\.ai-avatar\b/g, ".role-avatar");
    // 轻量将未带 scopeSelector 前缀的普通规则自动限定在 scopeSelector 下
    return normalized.replace(/(^|\})\s*([^{}@]+)\{/g, (match, sep, sel) => {
      const trimmed = sel.trim();
      if (!trimmed) return match;
      const scoped = trimmed
        .split(",")
        .map((part) => {
          const p = part.trim();
          if (!p) return "";
          if (p.startsWith(scopeSelector)) return p;
          return `${scopeSelector} ${p}`;
        })
        .filter(Boolean)
        .join(", ");
      return `${sep}\n${scoped} {`;
    });
  }

  function compileDecorationCss(draft, scopeSelector, resolvedFrameUrl) {
    if (!draft || !scopeSelector) return "";
    const parts = [];

    // 1. 气泡样式（严格区分 me=我 与 them=对方，各自独立生效）
    if (draft.bubble && draft.bubble.enabled) {
      const me = draft.bubble.me || {};
      const them = draft.bubble.them || {};
      if (me.enabled !== false) {
        parts.push(`${scopeSelector} .msg-bubble.me {
  background: ${hexToRgba(me.bg || "#5E6756", me.opacity)} !important;
  color: ${me.color || "#FFFFFF"} !important;
  border-radius: ${Number(me.radius || 18)}px !important;
  border: ${me.border || "none"} !important;
  box-shadow: ${shadowValue(me.shadow)} !important;
}`);
        if (me.customCss && String(me.customCss).trim()) {
          const rawMe = String(me.customCss).trim();
          const wrappedMe = rawMe.includes("{") ? rawMe : `.msg-bubble.me {\n${rawMe}\n}`;
          const extraMe = prefixScopedCss(wrappedMe, scopeSelector);
          if (extraMe) parts.push(extraMe);
        }
      }
      if (them.enabled !== false) {
        parts.push(`${scopeSelector} .msg-bubble.them {
  background: ${hexToRgba(them.bg || "#FAF7F0", them.opacity)} !important;
  color: ${them.color || "#38342E"} !important;
  border-radius: ${Number(them.radius || 18)}px !important;
  border: ${them.border || "none"} !important;
  box-shadow: ${shadowValue(them.shadow)} !important;
}`);
        if (them.customCss && String(them.customCss).trim()) {
          const rawThem = String(them.customCss).trim();
          const wrappedThem = rawThem.includes("{") ? rawThem : `.msg-bubble.them {\n${rawThem}\n}`;
          const extraThem = prefixScopedCss(wrappedThem, scopeSelector);
          if (extraThem) parts.push(extraThem);
        }
      }
      if (draft.bubble.customCss) {
        const extra = prefixScopedCss(draft.bubble.customCss, scopeSelector);
        if (extra) parts.push(extra);
      }
    }

    // 2. 工具栏样式
    if (draft.toolbar && draft.toolbar.enabled) {
      const tb = draft.toolbar;
      const floatCss = tb.floating
        ? `margin: 6px 10px 4px !important; border-radius: 16px !important; box-shadow: 0 4px 16px rgba(40,35,28,0.1) !important;`
        : "";
      parts.push(`${scopeSelector} .chat-toolbar.chat-action-bar {
  background-color: ${hexToRgba(tb.bg || "#FAF8F3", tb.opacity)} !important;
  backdrop-filter: blur(${Number(tb.blur || 0)}px) !important;
  -webkit-backdrop-filter: blur(${Number(tb.blur || 0)}px) !important;
  border-top: 1px solid ${tb.borderColor || "rgba(0,0,0,0.06)"} !important;
  border-bottom: 1px solid ${tb.borderColor || "rgba(0,0,0,0.06)"} !important;
  ${floatCss}
}`);
      if (tb.iconColor) {
        parts.push(`${scopeSelector} .chat-toolbar .chat-action-btn i { color: ${tb.iconColor} !important; }`);
      }
      if (tb.customCss) {
        const extra = prefixScopedCss(tb.customCss, scopeSelector);
        if (extra) parts.push(extra);
      }
    }

    // 3. 头像框样式（.role-avatar 为对方名士，.user-avatar 为我方，pointer-events: none 不挡点击）
    if (draft.avatarFrame && draft.avatarFrame.enabled) {
      const af = draft.avatarFrame;
      let frameUrl = resolvedFrameUrl || "";
      if (!frameUrl && af.builtinId && af.builtinId !== "none") {
        const hit = BUILTIN_AVATAR_FRAMES.find((f) => f.id === af.builtinId);
        if (hit) frameUrl = hit.url;
      }
      const targetSelectors = [];
      if (af.target === "them" || af.target === "both") {
        targetSelectors.push(`${scopeSelector} .role-avatar`, `${scopeSelector} .wx-preview-ai-avatar`);
      }
      if (af.target === "me" || af.target === "both") {
        targetSelectors.push(`${scopeSelector} .user-avatar`, `${scopeSelector} .wx-preview-me-avatar`);
      }
      if (frameUrl && targetSelectors.length > 0) {
        const hostSel = targetSelectors.join(", ");
        const afterSel = targetSelectors.map((t) => `${t}::after`).join(", ");
        const x = Number(af.x === undefined ? 50 : af.x);
        const y = Number(af.y === undefined ? 50 : af.y);
        const scale = Number(af.scale === undefined ? 1.24 : af.scale);
        const rotate = Number(af.rotate === undefined ? 0 : af.rotate);
        parts.push(`${hostSel} { position: relative !important; overflow: visible !important; }`);
        parts.push(`${afterSel} {
  content: "" !important;
  position: absolute !important;
  left: ${x}% !important;
  top: ${y}% !important;
  width: 100% !important;
  height: 100% !important;
  transform: translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg) !important;
  background-image: url("${frameUrl.replace(/"/g, '\\"')}") !important;
  background-size: contain !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  pointer-events: none !important;
  z-index: 6 !important;
}`);
      }
      if (af.customCss && String(af.customCss).trim()) {
        const rawAf = String(af.customCss).trim();
        const fallbackAfSel = af.target === "them" ? ".role-avatar" : af.target === "me" ? ".user-avatar" : ".role-avatar, .user-avatar";
        const wrappedAf = rawAf.includes("{") ? rawAf : `${fallbackAfSel} {\n${rawAf}\n}`;
        const extra = prefixScopedCss(wrappedAf, scopeSelector);
        if (extra) parts.push(extra);
      }
    }

    // 4. 分部件专框 CSS（顶栏 / 输入栏 / 发送按钮，支持裸属性或完整选择器）
    if (draft.partCss && typeof draft.partCss === "object") {
      const partMap = [
        ["header", ".chat-header"],
        ["input", ".chat-input"],
        ["sendBtn", ".chat-send-btn"]
      ];
      for (const [key, fallbackSel] of partMap) {
        const rawPart = String(draft.partCss[key] || "").trim();
        if (!rawPart) continue;
        const wrapped = rawPart.includes("{") ? rawPart : `${fallbackSel} {\n${rawPart}\n}`;
        const extraPart = prefixScopedCss(wrapped, scopeSelector);
        if (extraPart) parts.push(extraPart);
      }
    }

    // 5. 高级整屏自定义 CSS（最后注入，优先级最高）
    if (draft.advancedCss && String(draft.advancedCss).trim()) {
      const extraAdv = prefixScopedCss(draft.advancedCss, scopeSelector);
      if (extraAdv) parts.push(extraAdv);
    }

    return parts.join("\n\n");
  }

  function parseWanxiangArtifact(rawText) {
    const text = String(rawText || "");
    const blockMatch = text.match(/```(?:wanxiang-artifact|json)\s*([\s\S]*?)```/i);
    if (!blockMatch) return null;
    let body = blockMatch[1].trim();
    let title = "AI 协同装扮";
    let kind = "full-theme";

    if (body.includes("---")) {
      const splitIdx = body.indexOf("---");
      const header = body.slice(0, splitIdx);
      body = body.slice(splitIdx + 3).trim();
      const km = header.match(/kind\s*:\s*([^\n]+)/i);
      const tm = header.match(/title\s*:\s*([^\n]+)/i);
      if (km) kind = km[1].trim();
      if (tm) title = tm[1].trim();
    }

    try {
      const payload = JSON.parse(body);
      if (!payload || typeof payload !== "object") return null;
      // 校验内嵌自定义 CSS 安全性
      const cssFields = [
        payload.bubble && payload.bubble.customCss,
        payload.toolbar && payload.toolbar.customCss,
        payload.avatarFrame && payload.avatarFrame.customCss,
        payload.partCss && payload.partCss.header,
        payload.partCss && payload.partCss.input,
        payload.partCss && payload.partCss.sendBtn,
        payload.advancedCss,
        payload.customCss
      ].filter(Boolean);
      for (const c of cssFields) {
        const res = validateScopedCss(c);
        if (!res.ok) return { error: res.errors[0], title, kind };
      }
      return { kind, title: payload.title || title, payload };
    } catch (e) {
      return { error: "作品 JSON 解析失败: " + e.message, title, kind };
    }
  }

  function mergeArtifactIntoDraft(baseDraft, artifact) {
    const next = JSON.parse(JSON.stringify(baseDraft || createDefaultDraft()));
    if (!artifact || !artifact.payload) return next;
    const p = artifact.payload;
    if (p.bubble && typeof p.bubble === "object") {
      next.bubble = {
        ...next.bubble,
        ...p.bubble,
        me: { ...next.bubble.me, ...(p.bubble.me || {}) },
        them: { ...next.bubble.them, ...(p.bubble.them || {}) }
      };
    }
    if (p.toolbar && typeof p.toolbar === "object") {
      next.toolbar = { ...next.toolbar, ...p.toolbar };
    }
    if (p.avatarFrame && typeof p.avatarFrame === "object") {
      next.avatarFrame = { ...next.avatarFrame, ...p.avatarFrame };
    }
    if (p.partCss && typeof p.partCss === "object") {
      next.partCss = { ...(next.partCss || { header: "", input: "", sendBtn: "" }), ...p.partCss };
    }
    if (typeof p.advancedCss === "string") {
      next.advancedCss = p.advancedCss;
    }
    return next;
  }

  function serializePack(draft, title, embeddedFrameDataUrl) {
    return JSON.stringify(
      {
        format: "milvus-wanxiang-pack",
        version: 1,
        title: String(title || "未命名万象装扮").slice(0, 48),
        exportedAt: Date.now(),
        draft,
        embeddedFrameDataUrl: embeddedFrameDataUrl || ""
      },
      null,
      2
    );
  }

  function parseImportedPack(jsonText) {
    const obj = JSON.parse(String(jsonText || ""));
    if (!obj || obj.format !== "milvus-wanxiang-pack" || obj.version !== 1 || !obj.draft) {
      throw new Error("无效的万象装扮包格式（需 milvus-wanxiang-pack v1）");
    }
    const d = obj.draft;
    for (const c of [d.bubble && d.bubble.customCss, d.toolbar && d.toolbar.customCss, d.avatarFrame && d.avatarFrame.customCss, d.partCss && d.partCss.header, d.partCss && d.partCss.input, d.partCss && d.partCss.sendBtn, d.advancedCss]) {
      if (c) {
        const v = validateScopedCss(c);
        if (!v.ok) throw new Error("装扮包内含不安全 CSS：" + v.errors[0]);
      }
    }
    return {
      title: String(obj.title || "导入的装扮").slice(0, 48),
      draft: mergeArtifactIntoDraft(createDefaultDraft(), { payload: d }),
      embeddedFrameDataUrl: typeof obj.embeddedFrameDataUrl === "string" ? obj.embeddedFrameDataUrl : ""
    };
  }

  // ==========================================
  // 2. 独立 IndexedDB 存储层（零 localStorage）
  // ==========================================
  let _dbPromise = null;
  let _activeFrameObjUrl = "";

  function openWanxiangDB() {
    if (_dbPromise) return _dbPromise;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_PRESETS)) db.createObjectStore(STORE_PRESETS, { keyPath: "id" });
          if (!db.objectStoreNames.contains(STORE_BINDINGS)) db.createObjectStore(STORE_BINDINGS, { keyPath: "charId" });
          if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS, { keyPath: "id" });
          if (!db.objectStoreNames.contains(STORE_COLLAB)) db.createObjectStore(STORE_COLLAB, { keyPath: "charId" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return _dbPromise;
  }

  async function idbGet(store, key) {
    const db = await openWanxiangDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([store], "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function idbPut(store, record) {
    const db = await openWanxiangDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([store], "readwrite");
        tx.objectStore(store).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function idbDelete(store, key) {
    const db = await openWanxiangDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([store], "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function idbGetAll(store) {
    const db = await openWanxiangDB();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([store], "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function saveFrameBlob(file) {
    const id = "wx_blob_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    await idbPut(STORE_BLOBS, { id, blob: file, mime: file.type || "image/png", createdAt: Date.now() });
    return id;
  }

  async function loadFrameBlob(blobId) {
    if (!blobId) return null;
    const rec = await idbGet(STORE_BLOBS, blobId);
    return rec && rec.blob ? rec.blob : null;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      if (!blob) return resolve("");
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  async function getBinding(charId) {
    const cid = String(charId || "");
    if (cid) {
      const hit = await idbGet(STORE_BINDINGS, cid);
      if (hit && hit.draft) return hit.draft;
    }
    const g = await idbGet(STORE_BINDINGS, "global");
    return g && g.draft ? g.draft : null;
  }

  async function saveBinding(charId, draft) {
    const cid = String(charId || "global");
    await idbPut(STORE_BINDINGS, { charId: cid, draft, updatedAt: Date.now() });
    return true;
  }

  async function clearBinding(charId) {
    const cid = String(charId || "global");
    await idbDelete(STORE_BINDINGS, cid);
    return true;
  }

  // 旧版对话偏好 8 个 CSS 键的无损检测与迁移
  const LEGACY_CSS_SPECS = [
    { keyPrefix: "user_dialog_", wrapSelector: ".msg-bubble.me", label: "旧版用户气泡", eventType: "userDialog" },
    { keyPrefix: "role_dialog_", wrapSelector: ".msg-bubble.them", label: "旧版名士气泡", eventType: "roleDialog" },
    { keyPrefix: "user_avatar_frame_", wrapSelector: ".user-avatar", label: "旧版用户头像框", eventType: "userAvatarFrame" },
    { keyPrefix: "role_avatar_frame_", wrapSelector: ".role-avatar", label: "旧版名士头像框", eventType: "roleAvatarFrame" },
    { keyPrefix: "chat_header_css_", wrapSelector: ".chat-header", label: "旧版顶栏", eventType: "header" },
    { keyPrefix: "chat_input_css_", wrapSelector: ".chat-input", label: "旧版输入栏", eventType: "input" },
    { keyPrefix: "chat_toolbar_css_", wrapSelector: ".chat-toolbar", label: "旧版工具栏", eventType: "toolbar" },
    { keyPrefix: "chat_buttons_css_", wrapSelector: ".chat-send-btn", label: "旧版发送按钮", eventType: "buttons" }
  ];

  async function detectLegacyCssForChar(charId) {
    if (!charId || typeof global.openDB !== "function" || !global.STORES || !global.STORES.USER_SETTINGS) {
      return { found: false, count: 0, combinedCss: "", keys: [] };
    }
    try {
      const db = await global.openDB();
      const blocks = [];
      const keys = [];
      for (const spec of LEGACY_CSS_SPECS) {
        const k = `${spec.keyPrefix}${charId}`;
        const val = await new Promise((resolve) => {
          try {
            const tx = db.transaction([global.STORES.USER_SETTINGS], "readonly");
            const req = tx.objectStore(global.STORES.USER_SETTINGS).get(k);
            req.onsuccess = () => resolve(req.result ? req.result.value : "");
            req.onerror = () => resolve("");
          } catch (e) { resolve(""); }
        });
        const str = String(val || "").trim();
        if (str) {
          keys.push({ key: k, eventType: spec.eventType });
          const wrapped = str.includes("{") ? str : `${spec.wrapSelector} {\n  ${str}\n}`;
          blocks.push(`/* ${spec.label} */\n${wrapped}`);
        }
      }
      return { found: blocks.length > 0, count: blocks.length, combinedCss: blocks.join("\n\n"), keys };
    } catch (e) {
      return { found: false, count: 0, combinedCss: "", keys: [] };
    }
  }

  async function clearLegacyCssForChar(charId, keys) {
    if (!charId || typeof global.openDB !== "function" || !global.STORES || !global.STORES.USER_SETTINGS) return;
    try {
      const db = await global.openDB();
      const tx = db.transaction([global.STORES.USER_SETTINGS], "readwrite");
      const store = tx.objectStore(global.STORES.USER_SETTINGS);
      for (const item of keys || []) {
        store.delete(item.key);
        if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
          global.dispatchEvent(new CustomEvent("chatCustomStyleUpdated", { detail: { type: item.eventType, css: "", chatId: charId } }));
        }
      }
    } catch (e) {}
  }

  // ==========================================
  // 3. 运行时样式注入（按 chatId 隔离）
  // ==========================================
  function clearRuntimeStyle() {
    if (typeof document === "undefined") return;
    const el = document.getElementById(RUNTIME_STYLE_ID);
    if (el) el.remove();
    if (_activeFrameObjUrl) {
      try { URL.revokeObjectURL(_activeFrameObjUrl); } catch (e) {}
      _activeFrameObjUrl = "";
    }
  }

  async function applyForChat(chatId) {
    if (typeof document === "undefined" || !chatId) return;
    const draft = await getBinding(chatId);
    if (!draft) {
      clearRuntimeStyle();
      return;
    }
    let frameUrl = "";
    if (draft.avatarFrame && draft.avatarFrame.enabled && draft.avatarFrame.blobId) {
      const blob = await loadFrameBlob(draft.avatarFrame.blobId);
      if (blob) {
        if (_activeFrameObjUrl) {
          try { URL.revokeObjectURL(_activeFrameObjUrl); } catch (e) {}
        }
        _activeFrameObjUrl = URL.createObjectURL(blob);
        frameUrl = _activeFrameObjUrl;
      }
    }
    const css = compileDecorationCss(draft, `.chat-detail-overlay.chat-${chatId}`, frameUrl);
    let el = document.getElementById(RUNTIME_STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = RUNTIME_STYLE_ID;
    }
    el.textContent = css;
    // 始终置于 <head> 最末位 + 更高权重 .chat-detail-overlay.chat-{id}，确保压过任何旧版样式
    document.head.appendChild(el);
  }

  // ==========================================
  // 4. AI 协同设计调用器（1:1 对齐主聊天 API + 完整人设/身份/世界书/主线上下文）
  // ==========================================
  function resolveActiveLlmConfig() {
    try {
      const raw = global.localStorage && global.localStorage.getItem("api_configs");
      if (!raw) return null;
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || list.length === 0) return null;
      const savedIdx = global.localStorage && global.localStorage.getItem("selected_api_config_index");
      const idx = savedIdx !== null && savedIdx !== "" ? parseInt(savedIdx, 10) : 0;
      const hit = list[idx] || list[0];
      const rawUrl = String((hit && (hit.url || hit.baseUrl)) || "").trim();
      const apiKey = String((hit && (hit.apiKey || hit.key)) || "").trim();
      if (!rawUrl || !apiKey) return null;

      let endpoint = rawUrl;
      if (!/\/chat\/completions$/i.test(endpoint)) {
        if (!endpoint.endsWith("/")) endpoint += "/";
        if (hit.type === "official") {
          endpoint += /\/v1\/$/i.test(endpoint) ? "chat/completions" : "v1/chat/completions";
        } else {
          endpoint += "api/chat/completions";
        }
      }
      return {
        endpoint,
        siteUrl: rawUrl,
        siteName: hit.name || rawUrl,
        apiKey,
        model: String(hit.model || "gpt-3.5-turbo").trim()
      };
    } catch (e) {
      return null;
    }
  }

  async function buildRoleplayCollabContext(chatData, recentMessages) {
    const profile = (chatData && chatData.profile) || {};
    const charName = (chatData && chatData.name) || profile.name || "名士";
    const charId = (chatData && chatData.id) || "";

    // 1. 当前聊天角色完整配置
    const charLines = [`- 角色姓名：${charName}`, `- 角色 ID：${charId || "未知"}`];
    if (profile.gender) charLines.push(`- 性别：${profile.gender}`);
    if (profile.age) charLines.push(`- 年龄：${profile.age}`);
    const mbti = profile.mbti || (chatData && chatData.mbti);
    if (mbti) charLines.push(`- MBTI 性格类型：${mbti}${profile.enneagram ? `（九型：${profile.enneagram}）` : ""}`);
    const constellation = profile.constellation || (chatData && chatData.constellation);
    if (constellation) charLines.push(`- 星座：${constellation}`);
    const style = profile.style || profile.speakingStyle || (chatData && chatData.style);
    if (style) charLines.push(`- 语言风格：${style}`);
    const personality = profile.personality || (chatData && chatData.personality);
    if (personality) charLines.push(`- 性格特点：${personality}`);
    const bg = profile.background || profile.description || (chatData && chatData.background);
    if (bg) charLines.push(`- 个人背景：${String(bg).slice(0, 600)}`);
    if (charId && global.characterDocStore && typeof global.characterDocStore.getEnabledDocContext === "function") {
      try {
        const docCtx = await global.characterDocStore.getEnabledDocContext(charId);
        if (docCtx && docCtx.trim()) charLines.push(`- 角色专属设定摘录：${docCtx.trim().slice(0, 500)}`);
      } catch (e) {}
    }

    // 2. 用户在「设置 - 身份配置库」中选择的设定
    let userPersonaBlock = "";
    try {
      const personas = JSON.parse((global.localStorage && global.localStorage.getItem("user_personas")) || "[]");
      const activePid = global.localStorage && global.localStorage.getItem("active_persona_id");
      const activeUser = Array.isArray(personas)
        ? (personas.find((p) => String(p.id) === String(activePid)) || personas[0])
        : null;
      if (activeUser) {
        const uLines = [`- 用户姓名：${activeUser.name || "我"}`];
        if (activeUser.gender) uLines.push(`- 性别：${activeUser.gender}`);
        if (activeUser.age) uLines.push(`- 年龄：${activeUser.age}`);
        if (activeUser.personality) uLines.push(`- 性格：${activeUser.personality}`);
        if (activeUser.background) uLines.push(`- 背景：${String(activeUser.background).slice(0, 400)}`);
        if (activeUser.style) uLines.push(`- 说话风格：${activeUser.style}`);
        userPersonaBlock = `【用户身份配置库设定】\n${uLines.join("\n")}`;
      }
    } catch (e) {}

    // 3. 用户在「设置 - 世界书设置」中开启的世界书条目
    let worldBookBlock = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = global.getWorldBookContext();
        if (wb && String(wb).trim()) {
          worldBookBlock = `【已开启的世界书条目】\n${String(wb).trim().slice(0, 1800)}`;
        }
      }
    } catch (e) {}

    // 4. 传讯主线中该角色与用户的近期上下文
    let msgs = Array.isArray(recentMessages) ? recentMessages : [];
    if (msgs.length === 0 && charId && global.chatHistoryStore && typeof global.chatHistoryStore.getMessages === "function") {
      try {
        const loaded = await global.chatHistoryStore.getMessages(charId);
        if (Array.isArray(loaded)) msgs = loaded.slice(-16);
      } catch (e) {}
    }
    const chatLines = msgs
      .filter((m) => m && (!m.type || m.type === "text" || m.type === "voice" || m.type === "narration"))
      .slice(-14)
      .map((m) => {
        const who = m.isMe ? "用户" : charName;
        const txt = String(m.text || m.content || "").replace(/\s+/g, " ").trim().slice(0, 140);
        return txt ? `${who}：${txt}` : "";
      })
      .filter(Boolean);
    const historyBlock = chatLines.length > 0 ? `【传讯主线近期对话上下文】\n${chatLines.join("\n")}` : "";

    return {
      charName,
      contextText: [
        `【你的角色设定（必须严格扮演，严禁 OOC）】\n${charLines.join("\n")}`,
        userPersonaBlock,
        worldBookBlock,
        historyBlock
      ].filter(Boolean).join("\n\n")
    };
  }

  async function requestAiCollaboration(userPrompt, targetKind, currentDraft, chatData, recentMessages) {
    const llm = resolveActiveLlmConfig();
    if (!llm) {
      throw new Error("未检测到已配置的主聊天 API，请先在「设置 → API 配置」填好接口地址与 API Key");
    }
    const roleCtx = await buildRoleplayCollabContext(chatData, recentMessages);
    const targetDescMap = {
      "full-theme": "整套私聊装扮（气泡+工具栏+头像框+顶栏+输入栏+发送按钮）",
      bubble: "聊天气泡",
      toolbar: "底部工具栏",
      avatarFrame: "头像框风格",
      header: "聊天顶栏 (.chat-header)",
      input: "底部输入栏 (.chat-input / .chat-input-bar)",
      sendBtn: "发送按钮 (.chat-send-btn)"
    };
    const targetDesc = targetDescMap[targetKind] || targetDescMap["full-theme"];

    const sysPrompt = `${roleCtx.contextText}

【当前协同任务：万象装扮协作台】
你正在和用户一起在「万象」协作台里定制你们私聊界面的「${targetDesc}」。
1. 你的所有自然语言回复必须【100% 保持「${roleCtx.charName}」本人的人设、口吻、称呼习惯、世界观与主线记忆】，像你们平时相处那样自然说话，严禁变成机械的“AI 设计师/客服腔”！
2. 先用符合你角色口吻的 2~4 句话回应用户的要求、聊聊你挑这套配色/材质的心思；然后必须在回复末尾附上一个严格 JSON 作品块（只需填写本次涉及的部件字段即可）：
\`\`\`wanxiang-artifact
kind: ${targetKind}
title: 主题名称
---
{
  "bubble": {
    "enabled": true,
    "me": { "bg": "#5E6756", "color": "#FFFFFF", "radius": 18, "border": "1px solid #4E5647", "shadow": "soft", "opacity": 1 },
    "them": { "bg": "#FAF7F0", "color": "#38342E", "radius": 18, "border": "1px solid #E2D9C8", "shadow": "soft", "opacity": 1 },
    "customCss": ""
  },
  "toolbar": {
    "enabled": true,
    "bg": "#FAF8F3",
    "opacity": 0.92,
    "blur": 12,
    "iconColor": "#5E6756",
    "borderColor": "#E5DFD3",
    "floating": false,
    "customCss": ""
  },
  "avatarFrame": {
    "enabled": true,
    "target": "both",
    "builtinId": "gold_cloud",
    "scale": 1.24,
    "rotate": 0,
    "customCss": ""
  },
  "partCss": {
    "header": ".chat-header { background: rgba(250,248,244,0.92) !important; border-bottom: 1px solid #E5DFD3 !important; }",
    "input": ".chat-input { background: #FFFFFF !important; border: 1px solid #DDD5C7 !important; border-radius: 18px !important; }",
    "sendBtn": ".chat-send-btn { background: #5E6756 !important; color: #FFFFFF !important; border-radius: 16px !important; }"
  }
}
\`\`\`
技术铁律：
- builtinId 只能从 none / gold_cloud / jade_bamboo / cinnabar_seal / star_orbit 中选一个；
- shadow 只能是 none / soft / strong；
- customCss 与 partCss 禁止出现 html、body、:root、@import、javascript:，只允许写 .chat-header / .msg-bubble.me / .msg-bubble.them / .role-avatar / .user-avatar / .chat-toolbar / .chat-input / .chat-send-btn 等子选择器（注意：.role-avatar 为对方名士头像，.user-avatar 为用户头像；.msg-bubble.them 为对方气泡，.msg-bubble.me 为用户气泡）；
- 保证文字与底色高对比度可读，适配手机窄屏；不要向用户解释 JSON 格式。`;

    const res = await fetch(llm.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`
      },
      body: JSON.stringify({
        model: llm.model,
        temperature: 0.75,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data.error && data.error.message) || `AI 协同请求失败 (HTTP ${res.status})`);
    }
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    const artifact = parseWanxiangArtifact(content);
    const replyText = content.replace(/```(?:wanxiang-artifact|json)[\s\S]*?```/gi, "").trim() || "这套搭配我替你拟好了，先瞧瞧合不合眼缘。";
    return { replyText, artifact, rawContent: content };
  }

  // ==========================================
  // 5. 私聊底部「+」扩展抽屉组件
  // ==========================================
  function PrivatePlusDrawer(props) {
    const React = global.React;
    if (!React || !props || !props.open) return null;
    const apps = [
      {
        id: "wanxiang",
        name: "万象",
        desc: "气泡·工具栏·头像框",
        icon: "🎨",
        bg: "linear-gradient(135deg, #F5EFE2 0%, #E7EEDF 100%)",
        border: "#D5DFCC",
        onClick: () => {
          props.onClose && props.onClose();
          props.onOpenWanxiang && props.onOpenWanxiang();
        }
      },
      ...(global.ThirteenProvincesEngine
        ? [
            {
              id: "thirteen_provinces",
              name: "十三州密卷",
              desc: "画像·金兰契·卷宗",
              icon: "🗺️",
              bg: "linear-gradient(135deg, #FAF0E8 0%, #F5E1DC 100%)",
              border: "#E3C3BC",
              onClick: () => {
                props.onClose && props.onClose();
                const cd = props.chatData || {};
                global.ThirteenProvincesEngine.openModal({
                  charId: String(cd.id || props.charId || ""),
                  charName: cd.name || (cd.profile && cd.profile.name) || props.charName || "名士",
                  userName: props.userName || "主公"
                });
              }
            }
          ]
        : [])
    ];

    return React.createElement(
      "div",
      {
        style: {
          background: "rgba(252, 250, 246, 0.96)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderTop: "1px solid rgba(94, 103, 86, 0.14)",
          padding: "16px 18px calc(16px + env(safe-area-inset-bottom, 0px))",
          minHeight: "152px",
          maxHeight: "230px",
          overflowY: "auto"
        }
      },
      React.createElement(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "14px" } },
        apps.map((app) =>
          React.createElement(
            "button",
            {
              key: app.id,
              type: "button",
              onClick: app.onClick,
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px 2px"
              }
            },
            React.createElement(
              "div",
              {
                style: {
                  width: "54px",
                  height: "54px",
                  borderRadius: "16px",
                  background: app.bg,
                  border: `1px solid ${app.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  boxShadow: "0 3px 10px rgba(60, 55, 45, 0.06)"
                }
              },
              app.icon
            ),
            React.createElement("span", { style: { fontSize: "12px", fontWeight: 600, color: "#3A3630" } }, app.name),
            React.createElement("span", { style: { fontSize: "10px", color: "#8C8577", whiteSpace: "nowrap" } }, app.desc)
          )
        )
      )
    );
  }

  // ==========================================
  // 6. 「万象」简洁全屏协作台弹窗
  // ==========================================
  function WanxiangStudioModal(props) {
    const React = global.React;
    const ReactDOM = global.ReactDOM;
    if (!React || !props || !props.open) return null;
    const { useState, useEffect, useMemo, useRef } = React;

    const chatData = props.chatData || {};
    const charId = String(chatData.id || "");
    const charName = chatData.name || (chatData.profile && chatData.profile.name) || "名士";
    const charAvatar = chatData.avatar || (chatData.profile && chatData.profile.avatar) || "";
    const userAvatar = props.userAvatar || "";

    const [tab, setTab] = useState("bubble"); // bubble | toolbar | frame | ai
    const [bubbleSide, setBubbleSide] = useState("them"); // them | me
    const [draft, setDraft] = useState(createDefaultDraft);
    const [previewFrameUrl, setPreviewFrameUrl] = useState("");
    const [toast, setToast] = useState("");
    const [showLibrary, setShowLibrary] = useState(false);
    const [presets, setPresets] = useState([]);
    const [presetTitle, setPresetTitle] = useState("");
    const [aiKind, setAiKind] = useState("full-theme");
    const [aiInput, setAiInput] = useState("");
    const [aiBusy, setAiBusy] = useState(false);
    const [aiLogs, setAiLogs] = useState([]);
    const [legacyInfo, setLegacyInfo] = useState({ found: false, count: 0, combinedCss: "", keys: [] });
    const [cssUploadMode, setCssUploadMode] = useState("replace"); // replace | append
    const [cssSubTab, setCssSubTab] = useState("all"); // all | header | input | sendBtn
    const fileInputRef = useRef(null);
    const packImportRef = useRef(null);
    const cssUploadRef = useRef(null);

    const flash = (msg) => {
      setToast(msg);
      setTimeout(() => setToast((cur) => (cur === msg ? "" : cur)), 2400);
    };

    useEffect(() => {
      let alive = true;
      getBinding(charId).then(async (saved) => {
        if (!alive) return;
        const d = saved ? mergeArtifactIntoDraft(createDefaultDraft(), { payload: saved }) : createDefaultDraft();
        setDraft(d);
        if (d.avatarFrame && d.avatarFrame.blobId) {
          const b = await loadFrameBlob(d.avatarFrame.blobId);
          if (alive && b) setPreviewFrameUrl(URL.createObjectURL(b));
        }
      });
      idbGetAll(STORE_PRESETS).then((list) => alive && setPresets(list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))));
      idbGet(STORE_COLLAB, charId || "global").then((rec) => alive && rec && Array.isArray(rec.logs) && setAiLogs(rec.logs));
      detectLegacyCssForChar(charId).then((info) => alive && setLegacyInfo(info));
      return () => { alive = false; };
    }, [charId]);

    const advCssCheck = useMemo(() => validateScopedCss(draft.advancedCss || ""), [draft.advancedCss]);

    const handleUploadCssFile = async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) return;
      if (file.size > 512 * 1024) return flash("CSS 文件请控制在 512KB 以内");
      try {
        const text = (await file.text()).trim();
        const check = validateScopedCss(text);
        if (!check.ok) return flash("CSS 校验未通过：" + check.errors[0]);
        setDraft((prev) => ({
          ...prev,
          advancedCss: cssUploadMode === "append" && prev.advancedCss ? `${prev.advancedCss}\n\n${text}` : text
        }));
        flash(`已载入「${file.name}」，上方实时预览已更新 ✓`);
      } catch (e) {
        flash("读取 CSS 文件失败：" + e.message);
      }
    };

    const handleCopyText = async (text, label) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(`已复制${label} ✓`);
      } catch (e) {
        flash("复制失败，请手动选中复制");
      }
    };

    const handleMigrateLegacy = async () => {
      if (!legacyInfo.found) return;
      const check = validateScopedCss(legacyInfo.combinedCss);
      if (!check.ok) return flash("旧版样式含不安全规则，请手动检查：" + check.errors[0]);
      setDraft((prev) => ({
        ...prev,
        advancedCss: prev.advancedCss ? `${prev.advancedCss}\n\n${legacyInfo.combinedCss}` : legacyInfo.combinedCss
      }));
      await clearLegacyCssForChar(charId, legacyInfo.keys);
      setLegacyInfo({ found: false, count: 0, combinedCss: "", keys: [] });
      flash("已无损迁入旧版 CSS 并清理冲突旧键，点右上角「应用」生效 ✓");
    };

    const previewCss = useMemo(() => {
      return compileDecorationCss(draft, ".wx-preview-stage", previewFrameUrl);
    }, [draft, previewFrameUrl]);

    const handleApply = async (scope) => {
      const targetId = scope === "global" ? "global" : charId || "global";
      await saveBinding(targetId, draft);
      await applyForChat(charId);
      flash(scope === "global" ? "已应用为全局默认装扮 ✓" : `已应用给 ${charName} ✓`);
    };

    const handleReset = async () => {
      const def = createDefaultDraft();
      setDraft(def);
      setPreviewFrameUrl("");
      await clearBinding(charId);
      await applyForChat(charId);
      flash("已恢复默认外观 ✓");
    };

    const handleUploadFrame = async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) return flash("头像框图片请控制在 10MB 以内");
      const blobId = await saveFrameBlob(file);
      const url = URL.createObjectURL(file);
      setPreviewFrameUrl(url);
      setDraft((prev) => ({
        ...prev,
        avatarFrame: { ...prev.avatarFrame, enabled: true, builtinId: "none", blobId }
      }));
      flash("透明头像框已载入，可用滑杆微调位置 ✓");
    };

    const handleSavePreset = async () => {
      const name = (presetTitle || "").trim() || `${charName}·万象搭配`;
      const id = "wx_preset_" + Date.now();
      const rec = { id, title: name, draft, updatedAt: Date.now() };
      await idbPut(STORE_PRESETS, rec);
      setPresets((prev) => [rec, ...prev]);
      setPresetTitle("");
      flash(`已存入万象库：「${name}」`);
    };

    const handleExportPack = async () => {
      let dataUrl = "";
      if (draft.avatarFrame && draft.avatarFrame.blobId) {
        const b = await loadFrameBlob(draft.avatarFrame.blobId);
        if (b) dataUrl = await blobToDataUrl(b);
      }
      const json = serializePack(draft, presetTitle || `${charName}万象装扮`, dataUrl);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(presetTitle || charName || "wanxiang").replace(/[^\w\u4e00-\u9fa5-]/g, "")}.wanxiang.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash("已导出 .wanxiang.json 装扮包 ✓");
    };

    const handleImportPack = async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = parseImportedPack(text);
        let nextDraft = parsed.draft;
        if (parsed.embeddedFrameDataUrl) {
          const b = await dataUrlToBlob(parsed.embeddedFrameDataUrl);
          const blobId = await saveFrameBlob(b);
          nextDraft = { ...nextDraft, avatarFrame: { ...nextDraft.avatarFrame, blobId } };
          setPreviewFrameUrl(URL.createObjectURL(b));
        }
        setDraft(nextDraft);
        flash(`已载入装扮包「${parsed.title}」，点击右上角应用生效`);
        setShowLibrary(false);
      } catch (e) {
        flash("导入失败：" + e.message);
      }
    };

    const handleSendAi = async () => {
      const q = aiInput.trim();
      if (!q || aiBusy) return;
      setAiInput("");
      setAiBusy(true);
      const nextLogs = [...aiLogs, { role: "user", text: q }];
      setAiLogs(nextLogs);
      try {
        const res = await requestAiCollaboration(q, aiKind, draft, chatData, props.recentMessages);
        const updated = [...nextLogs, { role: "assistant", text: res.replyText, artifact: res.artifact }];
        setAiLogs(updated);
        idbPut(STORE_COLLAB, { charId: charId || "global", logs: updated.slice(-20), updatedAt: Date.now() }).catch(() => {});
      } catch (err) {
        setAiLogs([...nextLogs, { role: "assistant", text: "⚠ " + (err.message || "生成失败") }]);
      } finally {
        setAiBusy(false);
      }
    };

    const sideData = draft.bubble[bubbleSide] || {};
    const updateBubbleSide = (patch) => {
      setDraft((prev) => ({
        ...prev,
        bubble: { ...prev.bubble, enabled: true, [bubbleSide]: { ...prev.bubble[bubbleSide], ...patch } }
      }));
    };

    const pillStyle = (active) => ({
      padding: "6px 12px",
      borderRadius: "999px",
      border: active ? "1px solid #5E6756" : "1px solid #E3DDD1",
      background: active ? "#5E6756" : "#FFFFFF",
      color: active ? "#FFFFFF" : "#5B564B",
      fontSize: "12px",
      fontWeight: active ? 600 : 500,
      cursor: "pointer",
      whiteSpace: "nowrap"
    });

    const inputStyle = {
      width: "100%",
      padding: "8px 10px",
      borderRadius: "10px",
      border: "1px solid #E2DBD0",
      background: "#FFFFFF",
      fontSize: "12px",
      color: "#38342E",
      boxSizing: "border-box"
    };

    const modal = React.createElement(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99996,
          background: "#FAF8F4",
          display: "flex",
          flexDirection: "column",
          color: "#38342E",
          fontFamily: "inherit"
        }
      },
      React.createElement("style", null, previewCss),
      // 顶部极简导航栏
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "calc(10px + env(safe-area-inset-top, 0px)) 14px 10px",
            background: "#FFFFFF",
            borderBottom: "1px solid #ECE6DA",
            gap: "8px"
          }
        },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: props.onClose,
            style: { border: "none", background: "transparent", fontSize: "14px", color: "#5E6756", cursor: "pointer", padding: "4px 6px", fontWeight: 600 }
          },
          "← 返回"
        ),
        React.createElement("div", { style: { fontWeight: 700, fontSize: "14px", color: "#2F2C27" } }, "万象 · 装扮协作台"),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "6px" } },
          React.createElement("button", { type: "button", onClick: () => setShowLibrary((v) => !v), style: { ...pillStyle(showLibrary), padding: "5px 10px", fontSize: "11px" } }, "预设库"),
          React.createElement("button", { type: "button", onClick: () => handleApply("char"), style: { ...pillStyle(true), padding: "5px 12px", fontSize: "11px" } }, "应用")
        )
      ),
      toast &&
        React.createElement(
          "div",
          { style: { background: "#5E6756", color: "#FFF", fontSize: "11.5px", textAlign: "center", padding: "6px 12px" } },
          toast
        ),
      // 上半区：固定实时微缩预览舞台
      React.createElement(
        "div",
        {
          className: "wx-preview-stage",
          style: {
            margin: "12px 14px 8px",
            borderRadius: "16px",
            border: "1px solid #E5DFD3",
            background: "linear-gradient(180deg, #F5F1E8 0%, #EFEAE0 100%)",
            overflow: "hidden",
            flexShrink: 0
          }
        },
        React.createElement(
          "div",
          {
            className: "chat-header",
            style: {
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px",
              fontWeight: 600,
              background: "rgba(255,255,255,0.72)",
              borderBottom: "1px solid rgba(0,0,0,0.06)"
            }
          },
          React.createElement("span", { style: { opacity: 0.65 } }, "‹"),
          React.createElement("span", null, charName),
          React.createElement("span", { style: { opacity: 0.65 } }, "···")
        ),
        React.createElement(
          "div",
          { style: { padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: "10px" } },
          // 名士示例消息
          React.createElement(
            "div",
            { style: { display: "flex", alignItems: "flex-start", gap: "10px" } },
            React.createElement(
              "div",
              {
                className: "role-avatar wx-preview-ai-avatar",
                style: {
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "#D8CFC0",
                  backgroundImage: charAvatar ? `url(${charAvatar})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  color: "#FFF"
                }
              },
              charAvatar ? "" : charName.slice(0, 1)
            ),
            React.createElement("div", { className: "msg-bubble them", style: { padding: "8px 12px", fontSize: "12.5px", maxWidth: "74%" } }, `殿下，这套新装扮看着可还舒心？`)
          ),
          // 用户示例消息
          React.createElement(
            "div",
            { style: { display: "flex", alignItems: "flex-start", justifyContent: "flex-end", gap: "10px" } },
            React.createElement("div", { className: "msg-bubble me", style: { padding: "8px 12px", fontSize: "12.5px", maxWidth: "74%" } }, "配色清雅，正好合我心意。"),
            React.createElement(
              "div",
              {
                className: "user-avatar wx-preview-me-avatar",
                style: {
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: "#7A6B58",
                  backgroundImage: userAvatar ? `url(${userAvatar})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  color: "#FFF"
                }
              },
              userAvatar ? "" : "我"
            )
          )
        ),
        // 微缩工具栏预览
        React.createElement(
          "div",
          {
            className: "chat-toolbar chat-action-bar",
            style: { display: "flex", gap: "18px", padding: "6px 14px", alignItems: "center" }
          },
          ["ph-image", "ph-smiley", "ph-sparkle", "ph-phone-call", "ph-plus-circle"].map((ic) =>
            React.createElement(
              "span",
              { key: ic, className: "chat-action-btn", style: { display: "inline-flex", alignItems: "center" } },
              React.createElement("i", { className: `ph-bold ${ic}`, style: { fontSize: "17px" } })
            )
          )
        ),
        // 微缩输入栏与发送按钮预览
        React.createElement(
          "div",
          {
            className: "chat-input-bar",
            style: { display: "flex", gap: "8px", padding: "6px 10px 8px", alignItems: "center", background: "rgba(255,255,255,0.6)" }
          },
          React.createElement("div", { className: "chat-input", style: { flex: 1, padding: "5px 10px", borderRadius: "14px", background: "#FFF", border: "1px solid #E2DBD0", fontSize: "11px", color: "#9C9486" } }, "输入传讯内容..."),
          React.createElement("div", { className: "chat-send-btn", style: { padding: "5px 11px", borderRadius: "12px", background: "#5E6756", color: "#FFF", fontSize: "11px", fontWeight: 600 } }, "发送")
        )
      ),
      // 预设库面板或 4-Tab 编辑区
      showLibrary
        ? React.createElement(
            "div",
            { style: { flex: 1, overflowY: "auto", padding: "8px 14px 20px" } },
            React.createElement(
              "div",
              { style: { background: "#FFF", borderRadius: "14px", border: "1px solid #E5DFD3", padding: "12px", marginBottom: "10px" } },
              React.createElement("div", { style: { fontWeight: 600, fontSize: "12.5px", marginBottom: "8px" } }, "保存或分享当前搭配"),
              React.createElement(
                "div",
                { style: { display: "flex", gap: "6px", marginBottom: "8px" } },
                React.createElement("input", {
                  type: "text",
                  value: presetTitle,
                  placeholder: "给这套搭配起个名字...",
                  onChange: (e) => setPresetTitle(e.target.value),
                  style: inputStyle
                }),
                React.createElement("button", { type: "button", onClick: handleSavePreset, style: pillStyle(true) }, "保存")
              ),
              React.createElement(
                "div",
                { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                React.createElement("button", { type: "button", onClick: () => handleApply("global"), style: pillStyle(false) }, "设为全局默认"),
                React.createElement("button", { type: "button", onClick: handleExportPack, style: pillStyle(false) }, "导出装扮包"),
                React.createElement("button", { type: "button", onClick: () => packImportRef.current && packImportRef.current.click(), style: pillStyle(false) }, "导入装扮包"),
                React.createElement("button", { type: "button", onClick: handleReset, style: { ...pillStyle(false), color: "#B54534", borderColor: "#E5C6C0" } }, "一键恢复默认")
              ),
              React.createElement("input", { ref: packImportRef, type: "file", accept: ".json,application/json", style: { display: "none" }, onChange: handleImportPack })
            ),
            React.createElement("div", { style: { fontSize: "11.5px", color: "#888072", marginBottom: "6px" } }, `已收藏的万象搭配（${presets.length}）`),
            presets.length === 0
              ? React.createElement("div", { style: { textAlign: "center", color: "#9C9486", padding: "24px 0", fontSize: "12px" } }, "暂无收藏，调好喜欢的风格后点上方「保存」即可")
              : presets.map((item) =>
                  React.createElement(
                    "div",
                    {
                      key: item.id,
                      style: {
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        background: "#FFF",
                        border: "1px solid #E5DFD3",
                        marginBottom: "8px"
                      }
                    },
                    React.createElement("span", { style: { fontSize: "12.5px", fontWeight: 600 } }, item.title),
                    React.createElement(
                      "div",
                      { style: { display: "flex", gap: "6px" } },
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setDraft(mergeArtifactIntoDraft(createDefaultDraft(), { payload: item.draft }));
                            setShowLibrary(false);
                            flash(`已载入「${item.title}」`);
                          },
                          style: { ...pillStyle(true), padding: "4px 10px", fontSize: "11px" }
                        },
                        "载入"
                      ),
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          onClick: async () => {
                            await idbDelete(STORE_PRESETS, item.id);
                            setPresets((prev) => prev.filter((p) => p.id !== item.id));
                          },
                          style: { ...pillStyle(false), padding: "4px 9px", fontSize: "11px", color: "#B54534" }
                        },
                        "删除"
                      )
                    )
                  )
                )
          )
        : React.createElement(
            React.Fragment,
            null,
            // Tab 栏
            React.createElement(
              "div",
              { style: { display: "flex", gap: "8px", padding: "4px 14px 8px", overflowX: "auto", flexShrink: 0 } },
              [
                ["bubble", "💬 气泡"],
                ["toolbar", "🧰 工具栏"],
                ["frame", "🖼️ 头像框"],
                ["css", "📜 高级 CSS"],
                ["ai", "✨ AI 协同"]
              ].map(([id, label]) =>
                React.createElement("button", { key: id, type: "button", onClick: () => setTab(id), style: pillStyle(tab === id) }, label)
              )
            ),
            // 编辑内容区
            React.createElement(
              "div",
              { style: { flex: 1, overflowY: "auto", padding: "4px 14px 24px" } },
              tab === "bubble" &&
                React.createElement(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "10px" } },
                  draft.advancedCss && /\.msg-bubble/i.test(draft.advancedCss) &&
                    React.createElement(
                      "div",
                      {
                        style: {
                          background: "#FFF8EC",
                          border: "1px solid #E8CFA2",
                          borderRadius: "10px",
                          padding: "8px 10px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          fontSize: "11px",
                          color: "#6B5128"
                        }
                      },
                      React.createElement("span", null, "「高级 CSS」中含气泡规则，会覆盖此处预设"),
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setDraft((p) => ({ ...p, advancedCss: "" }));
                            flash("已清空高级 CSS，现在可直接点选气泡预设 ✓");
                          },
                          style: { ...pillStyle(true), padding: "3px 8px", fontSize: "10.5px" }
                        },
                        "清空高级 CSS"
                      )
                    ),
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                    BUBBLE_PRESETS.map((p) => {
                      const isActive = draft.bubble && draft.bubble.presetId === p.id;
                      return React.createElement(
                        "button",
                        {
                          key: p.id,
                          type: "button",
                          onClick: () => {
                            setDraft((prev) => ({
                              ...prev,
                              bubble: {
                                ...prev.bubble,
                                presetId: p.id,
                                enabled: true,
                                me: { ...p.me, enabled: true, customCss: "" },
                                them: { ...p.them, enabled: true, customCss: "" },
                                customCss: ""
                              }
                            }));
                            flash(`已套用「${p.name}」气泡预设，点右上角「应用」生效`);
                          },
                          style: { ...pillStyle(isActive), display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 10px" }
                        },
                        React.createElement("span", { style: { width: "10px", height: "10px", borderRadius: "50%", background: p.swatch, border: "1px solid rgba(0,0,0,0.18)" } }),
                        p.name
                      );
                    })
                  ),
                  React.createElement(
                    "div",
                    { style: { background: "#FFF", borderRadius: "14px", border: "1px solid #E5DFD3", padding: "12px", display: "grid", gap: "10px" } },
                    React.createElement(
                      "div",
                      { style: { display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" } },
                      React.createElement(
                        "div",
                        { style: { display: "flex", gap: "8px" } },
                        React.createElement("button", { type: "button", onClick: () => setBubbleSide("them"), style: pillStyle(bubbleSide === "them") }, `${charName}气泡`),
                        React.createElement("button", { type: "button", onClick: () => setBubbleSide("me"), style: pillStyle(bubbleSide === "me") }, "我的气泡")
                      ),
                      React.createElement(
                        "label",
                        { style: { fontSize: "11px", color: "#6E675C", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" } },
                        React.createElement("input", {
                          type: "checkbox",
                          checked: sideData.enabled !== false,
                          onChange: (e) => updateBubbleSide({ enabled: e.target.checked })
                        }),
                        bubbleSide === "them" ? `覆盖${charName}气泡` : "覆盖我的气泡"
                      )
                    ),
                    React.createElement(
                      "div",
                      { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px" } },
                      React.createElement("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, "底色", React.createElement("input", { type: "color", value: sideData.bg || "#FAF7F0", onChange: (e) => updateBubbleSide({ bg: e.target.value }) })),
                      React.createElement("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, "字色", React.createElement("input", { type: "color", value: sideData.color || "#38342E", onChange: (e) => updateBubbleSide({ color: e.target.value }) }))
                    ),
                    React.createElement(
                      "label",
                      { style: { fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
                      `圆角 ${Number(sideData.radius || 18)}px`,
                      React.createElement("input", { type: "range", min: 4, max: 28, value: Number(sideData.radius || 18), onChange: (e) => updateBubbleSide({ radius: Number(e.target.value) }), style: { flex: 1 } })
                    ),
                    React.createElement(
                      "label",
                      { style: { fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
                      `透明度 ${Math.round(Number(sideData.opacity === undefined ? 1 : sideData.opacity) * 100)}%`,
                      React.createElement("input", { type: "range", min: 0.5, max: 1, step: 0.02, value: Number(sideData.opacity === undefined ? 1 : sideData.opacity), onChange: (e) => updateBubbleSide({ opacity: Number(e.target.value) }), style: { flex: 1 } })
                    ),
                    React.createElement(
                      "div",
                      { style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "12px" } },
                      "阴影：",
                      [["none", "无"], ["soft", "柔和"], ["strong", "立体"]].map(([id, lb]) =>
                        React.createElement("button", { key: id, type: "button", onClick: () => updateBubbleSide({ shadow: id }), style: { ...pillStyle(sideData.shadow === id), padding: "3px 10px", fontSize: "11px" } }, lb)
                      )
                    ),
                    React.createElement(
                      "details",
                      null,
                      React.createElement("summary", { style: { fontSize: "11.5px", color: "#7B7468", cursor: "pointer" } }, `进阶 ${bubbleSide === "them" ? charName : "我的"}气泡自定义 CSS（仅作用于当前选中一侧）`),
                      React.createElement("textarea", {
                        rows: 3,
                        value: sideData.customCss || "",
                        placeholder: bubbleSide === "them" ? ".msg-bubble.them { letter-spacing: 0.5px; }" : ".msg-bubble.me { letter-spacing: 0.5px; }",
                        onChange: (e) => updateBubbleSide({ customCss: e.target.value }),
                        style: { ...inputStyle, marginTop: "6px", fontFamily: "monospace" }
                      })
                    )
                  )
                ),
              tab === "toolbar" &&
                React.createElement(
                  "div",
                  { style: { background: "#FFF", borderRadius: "14px", border: "1px solid #E5DFD3", padding: "12px", display: "grid", gap: "10px", fontSize: "12px" } },
                  React.createElement(
                    "div",
                    { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } },
                    React.createElement("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, "底色", React.createElement("input", { type: "color", value: draft.toolbar.bg || "#FAF8F3", onChange: (e) => setDraft((p) => ({ ...p, toolbar: { ...p.toolbar, enabled: true, bg: e.target.value } })) })),
                    React.createElement("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, "图标色", React.createElement("input", { type: "color", value: draft.toolbar.iconColor || "#5E6756", onChange: (e) => setDraft((p) => ({ ...p, toolbar: { ...p.toolbar, enabled: true, iconColor: e.target.value } })) }))
                  ),
                  React.createElement(
                    "label",
                    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
                    `透明度 ${Math.round(Number(draft.toolbar.opacity || 0.92) * 100)}%`,
                    React.createElement("input", { type: "range", min: 0.35, max: 1, step: 0.02, value: Number(draft.toolbar.opacity || 0.92), onChange: (e) => setDraft((p) => ({ ...p, toolbar: { ...p.toolbar, enabled: true, opacity: Number(e.target.value) } })), style: { flex: 1 } })
                  ),
                  React.createElement(
                    "label",
                    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
                    `毛玻璃 ${Number(draft.toolbar.blur || 12)}px`,
                    React.createElement("input", { type: "range", min: 0, max: 24, value: Number(draft.toolbar.blur || 12), onChange: (e) => setDraft((p) => ({ ...p, toolbar: { ...p.toolbar, enabled: true, blur: Number(e.target.value) } })), style: { flex: 1 } })
                  ),
                  React.createElement(
                    "label",
                    { style: { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" } },
                    React.createElement("input", { type: "checkbox", checked: !!draft.toolbar.floating, onChange: (e) => setDraft((p) => ({ ...p, toolbar: { ...p.toolbar, enabled: true, floating: e.target.checked } })) }),
                    "悬浮圆角胶囊工具栏"
                  ),
                  React.createElement(
                    "details",
                    null,
                    React.createElement("summary", { style: { fontSize: "11.5px", color: "#7B7468", cursor: "pointer" } }, "进阶工具栏自定义 CSS（可选）"),
                    React.createElement("textarea", {
                      rows: 3,
                      value: draft.toolbar.customCss || "",
                      placeholder: ".chat-toolbar { box-shadow: inset 0 1px 0 rgba(255,255,255,0.6) !important; }",
                      onChange: (e) => setDraft((p) => ({ ...p, toolbar: { ...p.toolbar, enabled: true, customCss: e.target.value } })),
                      style: { ...inputStyle, marginTop: "6px", fontFamily: "monospace" }
                    })
                  )
                ),
              tab === "frame" &&
                React.createElement(
                  "div",
                  { style: { background: "#FFF", borderRadius: "14px", border: "1px solid #E5DFD3", padding: "12px", display: "grid", gap: "10px", fontSize: "12px" } },
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" } },
                    "佩戴对象：",
                    [["both", "双方"], ["them", charName], ["me", "仅我"]].map(([id, lb]) =>
                      React.createElement("button", { key: id, type: "button", onClick: () => setDraft((p) => ({ ...p, avatarFrame: { ...p.avatarFrame, target: id } })), style: { ...pillStyle(draft.avatarFrame.target === id), padding: "3px 10px", fontSize: "11px" } }, lb)
                    )
                  ),
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                    BUILTIN_AVATAR_FRAMES.map((f) =>
                      React.createElement(
                        "button",
                        {
                          key: f.id,
                          type: "button",
                          onClick: () => {
                            setPreviewFrameUrl("");
                            setDraft((p) => ({ ...p, avatarFrame: { ...p.avatarFrame, enabled: f.id !== "none", builtinId: f.id, blobId: "" } }));
                          },
                          style: pillStyle(draft.avatarFrame.builtinId === f.id && !draft.avatarFrame.blobId)
                        },
                        f.name
                      )
                    )
                  ),
                  React.createElement(
                    "div",
                    null,
                    React.createElement("button", { type: "button", onClick: () => fileInputRef.current && fileInputRef.current.click(), style: pillStyle(!!draft.avatarFrame.blobId) }, "📤 上传透明头像框 (PNG / WebP / GIF)"),
                    React.createElement("input", { ref: fileInputRef, type: "file", accept: "image/*", style: { display: "none" }, onChange: handleUploadFrame })
                  ),
                  draft.avatarFrame.enabled &&
                    React.createElement(
                      "div",
                      { style: { display: "grid", gap: "8px", paddingTop: "4px", borderTop: "1px solid #EFEAE0" } },
                      [
                        ["x", "左右位置", 20, 80, 1],
                        ["y", "上下位置", 20, 80, 1],
                        ["scale", "缩放比例", 0.8, 2.0, 0.02],
                        ["rotate", "旋转角度", -180, 180, 2]
                      ].map(([key, label, min, max, step]) =>
                        React.createElement(
                          "label",
                          { key, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
                          `${label} ${draft.avatarFrame[key]}`,
                          React.createElement("input", {
                            type: "range",
                            min,
                            max,
                            step,
                            value: Number(draft.avatarFrame[key]),
                            onChange: (e) => setDraft((p) => ({ ...p, avatarFrame: { ...p.avatarFrame, [key]: Number(e.target.value) } })),
                            style: { flex: 1 }
                          })
                        )
                      )
                    ),
                  React.createElement(
                    "details",
                    null,
                    React.createElement("summary", { style: { fontSize: "11.5px", color: "#7B7468", cursor: "pointer" } }, `进阶头像框自定义 CSS（当前对象：${draft.avatarFrame.target === "them" ? charName : draft.avatarFrame.target === "me" ? "仅我" : "双方"}）`),
                    React.createElement("textarea", {
                      rows: 3,
                      value: draft.avatarFrame.customCss || "",
                      placeholder: draft.avatarFrame.target === "them"
                        ? ".role-avatar { border: 2px solid #D4AF37 !important; box-shadow: 0 0 10px rgba(212,175,55,0.45) !important; }"
                        : draft.avatarFrame.target === "me"
                        ? ".user-avatar { border: 2px solid #D4AF37 !important; box-shadow: 0 0 10px rgba(212,175,55,0.45) !important; }"
                        : ".role-avatar, .user-avatar { border: 2px solid #D4AF37 !important; box-shadow: 0 0 10px rgba(212,175,55,0.45) !important; }",
                      onChange: (e) => setDraft((p) => ({ ...p, avatarFrame: { ...p.avatarFrame, enabled: true, customCss: e.target.value } })),
                      style: { ...inputStyle, marginTop: "6px", fontFamily: "monospace" }
                    })
                  )
                ),
              tab === "css" &&
                React.createElement(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "10px" } },
                  legacyInfo.found &&
                    React.createElement(
                      "div",
                      {
                        style: {
                          background: "#FFF8EC",
                          border: "1px solid #E8CFA2",
                          borderRadius: "12px",
                          padding: "10px 12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "8px",
                          fontSize: "11.5px",
                          color: "#6B5128"
                        }
                      },
                      React.createElement("span", null, `检测到 ${legacyInfo.count} 项旧版自定义样式，可一键迁入万象防冲突`),
                      React.createElement("button", { type: "button", onClick: handleMigrateLegacy, style: { ...pillStyle(true), padding: "4px 10px", fontSize: "11px" } }, "一键迁入")
                    ),
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                    [
                      ["all", "📄 整屏合写 / 模板"],
                      ["header", "📌 顶栏 CSS"],
                      ["input", "⌨️ 输入栏 CSS"],
                      ["sendBtn", "🚀 发送按钮 CSS"]
                    ].map(([id, lb]) =>
                      React.createElement("button", { key: id, type: "button", onClick: () => setCssSubTab(id), style: { ...pillStyle(cssSubTab === id), padding: "4px 10px", fontSize: "11px" } }, lb)
                    )
                  ),
                  cssSubTab === "all" &&
                    React.createElement(
                      React.Fragment,
                      null,
                      React.createElement(
                        "div",
                        { style: { background: "#FFF", borderRadius: "14px", border: "1px solid #E5DFD3", padding: "12px", display: "grid", gap: "8px" } },
                        React.createElement("div", { style: { fontWeight: 600, fontSize: "12px" } }, "官方标准 CSS 模板（含 6 大真实选择器注释）"),
                        ADVANCED_CSS_TEMPLATES.map((tpl) =>
                          React.createElement(
                            "div",
                            {
                              key: tpl.id,
                              style: {
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                padding: "7px 9px",
                                borderRadius: "10px",
                                background: "#FAF8F4",
                                border: "1px solid #ECE6DA"
                              }
                            },
                            React.createElement(
                              "div",
                              { style: { minWidth: 0 } },
                              React.createElement("div", { style: { fontSize: "12px", fontWeight: 600, color: "#38342E" } }, tpl.name),
                              React.createElement("div", { style: { fontSize: "10.5px", color: "#888072" } }, tpl.desc)
                            ),
                            React.createElement(
                              "div",
                              { style: { display: "flex", gap: "5px", flexShrink: 0 } },
                              React.createElement(
                                "button",
                                {
                                  type: "button",
                                  onClick: () => {
                                    setDraft((p) => ({ ...p, advancedCss: tpl.css }));
                                    flash(`已填入「${tpl.name}」`);
                                  },
                                  style: { ...pillStyle(true), padding: "3px 9px", fontSize: "11px" }
                                },
                                "填入"
                              ),
                              React.createElement(
                                "button",
                                {
                                  type: "button",
                                  onClick: () => handleCopyText(tpl.css, `「${tpl.name}」`),
                                  style: { ...pillStyle(false), padding: "3px 9px", fontSize: "11px" }
                                },
                                "复制"
                              )
                            )
                          )
                        )
                      ),
                      React.createElement(
                        "div",
                        { style: { background: "#FFF", borderRadius: "14px", border: "1px solid #E5DFD3", padding: "12px", display: "grid", gap: "8px" } },
                        React.createElement(
                          "div",
                          { style: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" } },
                          React.createElement("button", { type: "button", onClick: () => cssUploadRef.current && cssUploadRef.current.click(), style: pillStyle(true) }, "📤 上传 .css / .txt"),
                          React.createElement(
                            "select",
                            { value: cssUploadMode, onChange: (e) => setCssUploadMode(e.target.value), style: { ...inputStyle, width: "auto", padding: "5px 8px", fontSize: "11px" } },
                            React.createElement("option", { value: "replace" }, "上传时覆盖"),
                            React.createElement("option", { value: "append" }, "上传时追加")
                          ),
                          React.createElement("button", { type: "button", onClick: () => handleCopyText(draft.advancedCss || "", "当前 CSS"), style: { ...pillStyle(false), padding: "5px 10px", fontSize: "11px" } }, "📋 复制"),
                          React.createElement("button", { type: "button", onClick: () => setDraft((p) => ({ ...p, advancedCss: "" })), style: { ...pillStyle(false), padding: "5px 10px", fontSize: "11px", color: "#B54534" } }, "清空"),
                          React.createElement("input", { ref: cssUploadRef, type: "file", accept: ".css,.txt,text/css,text/plain", style: { display: "none" }, onChange: handleUploadCssFile })
                        ),
                        React.createElement("textarea", {
                          rows: 8,
                          value: draft.advancedCss || "",
                          placeholder: "在此粘贴整屏自定义 CSS，或点击上方「填入」加载官方标准模板 /「上传 .css」...",
                          onChange: (e) => setDraft((p) => ({ ...p, advancedCss: e.target.value })),
                          style: { ...inputStyle, fontFamily: "monospace", lineHeight: 1.5, resize: "vertical" }
                        }),
                        !advCssCheck.ok
                          ? React.createElement("div", { style: { fontSize: "11px", color: "#B54534" } }, "⚠ " + advCssCheck.errors.join("；"))
                          : React.createElement("div", { style: { fontSize: "11px", color: "#5E6756" } }, draft.advancedCss ? "✓ 安全作用域校验通过，已实时预览" : "提示：也可切换上方「顶栏 / 输入栏 / 发送按钮」分部件单独填写")
                      )
                    ),
                  cssSubTab !== "all" &&
                    (() => {
                      const metaMap = {
                        header: { title: "📌 聊天顶栏 CSS（.chat-header）", ph: ".chat-header {\n  background: rgba(250, 248, 244, 0.92) !important;\n  border-bottom: 1px solid #E5DFD3 !important;\n}" },
                        input: { title: "⌨️ 底部输入栏 CSS（.chat-input / .chat-input-bar）", ph: ".chat-input {\n  background: #FFFFFF !important;\n  border: 1px solid #DDD5C7 !important;\n  border-radius: 18px !important;\n}" },
                        sendBtn: { title: "🚀 发送按钮 CSS（.chat-send-btn）", ph: ".chat-send-btn {\n  background: #5E6756 !important;\n  color: #FFFFFF !important;\n  border-radius: 16px !important;\n}" }
                      };
                      const meta = metaMap[cssSubTab];
                      const curVal = (draft.partCss && draft.partCss[cssSubTab]) || "";
                      const curCheck = validateScopedCss(curVal.includes("{") ? curVal : curVal ? `${meta.title} { ${curVal} }` : "");
                      return React.createElement(
                        "div",
                        { style: { background: "#FFF", borderRadius: "14px", border: "1px solid #E5DFD3", padding: "12px", display: "grid", gap: "8px" } },
                        React.createElement(
                          "div",
                          { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                          React.createElement("span", { style: { fontWeight: 600, fontSize: "12px" } }, meta.title),
                          React.createElement(
                            "div",
                            { style: { display: "flex", gap: "6px" } },
                            React.createElement("button", { type: "button", onClick: () => setDraft((p) => ({ ...p, partCss: { ...(p.partCss || {}), [cssSubTab]: meta.ph } })), style: { ...pillStyle(false), padding: "3px 8px", fontSize: "11px" } }, "填示例"),
                            React.createElement("button", { type: "button", onClick: () => setDraft((p) => ({ ...p, partCss: { ...(p.partCss || {}), [cssSubTab]: "" } })), style: { ...pillStyle(false), padding: "3px 8px", fontSize: "11px", color: "#B54534" } }, "清空")
                          )
                        ),
                        React.createElement("textarea", {
                          rows: 6,
                          value: curVal,
                          placeholder: meta.ph,
                          onChange: (e) => setDraft((p) => ({ ...p, partCss: { ...(p.partCss || { header: "", input: "", sendBtn: "" }), [cssSubTab]: e.target.value } })),
                          style: { ...inputStyle, fontFamily: "monospace", lineHeight: 1.5, resize: "vertical" }
                        }),
                        !curCheck.ok
                          ? React.createElement("div", { style: { fontSize: "11px", color: "#B54534" } }, "⚠ " + curCheck.errors.join("；"))
                          : React.createElement("div", { style: { fontSize: "11px", color: "#5E6756" } }, "支持直接写属性（如 background: #fff;）或完整选择器，上方微缩预览实时生效")
                      );
                    })()
                ),
              tab === "ai" &&
                React.createElement(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "10px" } },
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                    [
                      ["full-theme", "整套搭配"],
                      ["bubble", "只做气泡"],
                      ["toolbar", "只做工具栏"],
                      ["avatarFrame", "只做头像框"],
                      ["header", "只做顶栏"],
                      ["input", "只做输入栏"],
                      ["sendBtn", "只做发送按钮"]
                    ].map(([id, lb]) =>
                      React.createElement("button", { key: id, type: "button", onClick: () => setAiKind(id), style: { ...pillStyle(aiKind === id), padding: "4px 10px", fontSize: "11px" } }, lb)
                    )
                  ),
                  React.createElement(
                    "div",
                    { style: { background: "#FFF", borderRadius: "14px", border: "1px solid #E5DFD3", padding: "12px", minHeight: "150px", maxHeight: "230px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" } },
                    aiLogs.length === 0
                      ? React.createElement("div", { style: { fontSize: "12px", color: "#8C8577", lineHeight: 1.6 } }, "独立协同工作台（不污染名士主聊天记录）。描述你想要的风格，例如：「给我做一套江南青瓷宣纸风，带金丝云纹头像框」，AI 会生成可一键应用的装扮卡。")
                      : aiLogs.map((item, idx) =>
                          React.createElement(
                            "div",
                            {
                              key: idx,
                              style: {
                                alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                                maxWidth: "90%",
                                padding: "8px 10px",
                                borderRadius: "12px",
                                background: item.role === "user" ? "#5E6756" : "#F6F3EC",
                                color: item.role === "user" ? "#FFF" : "#38342E",
                                fontSize: "12px",
                                lineHeight: 1.5
                              }
                            },
                            React.createElement("div", null, item.text),
                            item.artifact && !item.artifact.error &&
                              React.createElement(
                                "div",
                                { style: { marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #E3DDD1", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
                                React.createElement("span", { style: { fontWeight: 600, fontSize: "11.5px" } }, `🎨 ${item.artifact.title}`),
                                React.createElement(
                                  "button",
                                  {
                                    type: "button",
                                    onClick: () => {
                                      setDraft((prev) => mergeArtifactIntoDraft(prev, item.artifact));
                                      flash(`已将「${item.artifact.title}」载入上方预览，点右上角应用生效`);
                                    },
                                    style: { ...pillStyle(true), padding: "3px 10px", fontSize: "11px" }
                                  },
                                  "载入预览"
                                )
                              ),
                            item.artifact && item.artifact.error &&
                              React.createElement("div", { style: { marginTop: "4px", fontSize: "11px", color: "#B54534" } }, "⚠ " + item.artifact.error)
                          )
                        )
                  ),
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: "6px" } },
                    React.createElement("input", {
                      type: "text",
                      value: aiInput,
                      placeholder: "描述想要的气泡/工具栏/头像框风格...",
                      onChange: (e) => setAiInput(e.target.value),
                      onKeyDown: (e) => { if (e.key === "Enter") handleSendAi(); },
                      style: inputStyle
                    }),
                    React.createElement("button", { type: "button", disabled: aiBusy, onClick: handleSendAi, style: pillStyle(true) }, aiBusy ? "设计中..." : "生成")
                  )
                )
            )
          )
    );

    if (ReactDOM && typeof ReactDOM.createPortal === "function" && global.document && global.document.body) {
      return ReactDOM.createPortal(modal, global.document.body);
    }
    return modal;
  }

  if (typeof document !== "undefined" && !document.getElementById("milvus-wanxiang-base-style")) {
    try {
      const baseEl = document.createElement("style");
      baseEl.id = "milvus-wanxiang-base-style";
      baseEl.textContent = ".chat-toolbar.chat-action-bar > * { flex-shrink: 0 !important; }";
      document.head.appendChild(baseEl);
    } catch (e) {}
  }

  function WanxiangSettingsEntryCard(props) {
    const React = global.React;
    if (!React) return null;
    const { useState, useEffect } = React;
    const charId = String((props && props.charId) || "");
    const charName = (props && props.charName) || "当前名士";
    const [hasBinding, setHasBinding] = useState(false);

    useEffect(() => {
      getBinding(charId).then((b) => setHasBinding(Boolean(b))).catch(() => {});
    }, [charId]);

    return React.createElement(
      "div",
      {
        style: {
          margin: "12px 16px",
          padding: "13px 14px",
          borderRadius: "14px",
          border: "1px solid #E3D9C8",
          background: "linear-gradient(135deg, #FFFCF7 0%, #F5EFE2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px"
        }
      },
      React.createElement(
        "div",
        { style: { minWidth: 0 } },
        React.createElement("div", { style: { fontWeight: 700, fontSize: "13px", color: "#3A342B" } }, "🎨 万象 · 统一装扮协作台"),
        React.createElement(
          "div",
          { style: { fontSize: "11px", color: "#7D7362", marginTop: "3px" } },
          `${charName}的气泡、工具栏、头像框与高级 CSS 均已整合至此${hasBinding ? "（已启用装扮）" : ""}`
        )
      ),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => props && props.onOpenWanxiang && props.onOpenWanxiang(),
          style: {
            padding: "7px 12px",
            borderRadius: "999px",
            border: "none",
            background: "#5E6756",
            color: "#FFFFFF",
            fontSize: "11.5px",
            fontWeight: 600,
            cursor: "pointer",
            flexShrink: 0
          }
        },
        "前往万象"
      )
    );
  }

  const api = {
    BUBBLE_PRESETS,
    BUILTIN_AVATAR_FRAMES,
    ADVANCED_CSS_TEMPLATES,
    createDefaultDraft,
    validateScopedCss,
    compileDecorationCss,
    parseWanxiangArtifact,
    mergeArtifactIntoDraft,
    serializePack,
    parseImportedPack,
    getBinding,
    saveBinding,
    clearBinding,
    detectLegacyCssForChar,
    clearLegacyCssForChar,
    applyForChat,
    clearRuntimeStyle,
    resolveActiveLlmConfig,
    buildRoleplayCollabContext,
    PrivatePlusDrawer,
    WanxiangStudioModal,
    WanxiangSettingsEntryCard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.WanxiangStudioEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

