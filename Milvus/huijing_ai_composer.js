/**
 * Milvus/huijing_ai_composer.js
 * 「绘·境 2.0」AI 名士奏画独立引擎（Semantic Music-Painting Composer）
 * - 完整五维上下文聚合：角色 6 项完整配置（姓名ID/MBTI/星座/语言风格/性格特点/个人背景）
 *   + 用户身份配置库 + 开启的世界书 + 传讯近期上下文（16条）+ 用户可选意象
 * - 语义图元编译器（wave / arc / line / dots -> 归一化矢量笔触），全量坐标钳位防畸形
 * - 无 API / 超时 / JSON 异常无缝降级至本地人设意象生成器，零 localStorage 写入
 */
(function (global) {
  "use strict";

  const VALID_BRUSH_IDS = new Set([
    "ink_black", "ink_gray", "bamboo", "cinnabar", "gilded",
    "celadon", "indigo", "rouge", "amethyst", "coral"
  ]);
  const VALID_SCALE_IDS = new Set(["pentatonic", "major", "minor", "miyako"]);
  const VALID_SUSTAIN_IDS = new Set(["long", "soft", "crisp"]);

  const MOTIF_CHIPS = [
    "月夜江潮",
    "红梅落雪",
    "安神助眠小调",
    "窗台打盹的猫",
    "大漠孤烟",
    "竹林骤雨"
  ];

  function clamp(val, min, max) {
    const n = Number(val);
    if (!Number.isFinite(n)) return (min + max) / 2;
    return Math.max(min, Math.min(max, n));
  }

  function safeBrushId(id) {
    const s = String(id || "").trim();
    return VALID_BRUSH_IDS.has(s) ? s : "bamboo";
  }

  function safeScaleId(id) {
    const s = String(id || "").trim();
    return VALID_SCALE_IDS.has(s) ? s : "pentatonic";
  }

  function safeSustainId(id) {
    const s = String(id || "").trim();
    return VALID_SUSTAIN_IDS.has(s) ? s : "long";
  }

  // ==========================================
  // 1. 具象国风简笔画矢量模组库（局部坐标 [-0.5..0.5, -0.5..0.5]，一眼可辨！）
  // ==========================================
  const SHAPE_LIBRARY = {
    // 灵狐（尖耳、瓜子狐脸、眼鼻、蓬松大尾）
    fox: [
      [[-0.26, -0.08], [-0.34, -0.44], [-0.08, -0.22], [0.08, -0.22], [0.34, -0.44], [0.26, -0.08], [0.14, 0.14], [0.0, 0.24], [-0.14, 0.14], [-0.26, -0.08]],
      [[-0.14, -0.04], [-0.07, -0.01]],
      [[0.07, -0.01], [0.14, -0.04]],
      [[0.0, 0.16]],
      [[0.18, 0.18], [0.38, 0.12], [0.48, -0.06], [0.42, -0.22], [0.28, -0.1], [0.24, 0.1]]
    ],
    // 蜷睡小猫（猫耳、圆脸、胡须、卷尾）
    cat: [
      [[-0.24, -0.14], [-0.3, -0.42], [-0.1, -0.26], [0.1, -0.26], [0.3, -0.42], [0.24, -0.14], [0.26, 0.1], [0.14, 0.24], [-0.14, 0.24], [-0.26, 0.1], [-0.24, -0.14]],
      [[-0.36, 0.02], [-0.2, 0.04]],
      [[0.2, 0.04], [0.36, 0.02]],
      [[0.22, 0.2], [0.42, 0.26], [0.46, 0.06], [0.36, -0.04]]
    ],
    // 真正月牙（双弧围合弯月）
    crescent_moon: [
      [[0.18, -0.42], [-0.12, -0.34], [-0.32, -0.12], [-0.32, 0.16], [-0.12, 0.36], [0.18, 0.42], [0.0, 0.24], [-0.08, 0.02], [0.0, -0.22], [0.18, -0.42]]
    ],
    // 乌篷孤舟（船身 + 船篷）
    boat: [
      [[-0.48, 0.1], [-0.32, 0.3], [0.32, 0.3], [0.48, 0.08], [-0.48, 0.1]],
      [[-0.2, 0.1], [-0.14, -0.18], [0.14, -0.18], [0.2, 0.1]],
      [[-0.08, -0.18], [-0.08, -0.4], [0.16, -0.28], [-0.08, -0.22]]
    ],
    // 层峦远山（主峰 + 侧峰）
    mountain: [
      [[-0.5, 0.35], [-0.28, -0.18], [-0.12, 0.08], [0.08, -0.38], [0.28, 0.06], [0.4, -0.12], [0.5, 0.35]]
    ],
    // 江潮水浪（双层涟漪浪）
    river_waves: [
      [[-0.5, -0.05], [-0.34, -0.22], [-0.16, 0.05], [0.0, -0.2], [0.18, 0.05], [0.34, -0.22], [0.5, -0.02]],
      [[-0.44, 0.25], [-0.24, 0.1], [-0.04, 0.28], [0.16, 0.1], [0.38, 0.26]]
    ],
    // 红梅枝与梅花
    plum_blossom: [
      [[-0.46, 0.36], [-0.18, 0.12], [0.12, -0.04], [0.44, -0.26]],
      [[0.0, 0.02], [0.14, -0.28]],
      [[0.14, -0.36], [0.22, -0.3], [0.18, -0.22], [0.1, -0.22], [0.06, -0.3], [0.14, -0.36]],
      [[-0.18, 0.04], [-0.1, 0.1], [-0.14, 0.18], [-0.22, 0.18], [-0.26, 0.1], [-0.18, 0.04]]
    ],
    // 翠竹（竹竿 + 竹节 + 竹叶）
    bamboo_stalk: [
      [[-0.04, 0.46], [-0.02, -0.46]],
      [[-0.12, 0.12], [0.06, 0.12]],
      [[-0.1, -0.18], [0.08, -0.18]],
      [[0.0, -0.18], [0.32, -0.36], [0.18, -0.14]],
      [[-0.04, 0.04], [-0.34, -0.12], [-0.16, 0.08]]
    ],
    // 飞燕 / 孤鸿
    bird: [
      [[-0.42, 0.06], [-0.18, -0.22], [0.0, 0.04], [0.18, -0.22], [0.42, 0.06]]
    ],
    // 锦鲤 / 游鱼
    fish: [
      [[-0.36, 0.0], [-0.14, -0.22], [0.16, -0.16], [0.36, 0.0], [0.16, 0.16], [-0.14, 0.22], [-0.36, 0.0]],
      [[0.34, 0.0], [0.48, -0.2], [0.44, 0.0], [0.48, 0.2], [0.34, 0.0]],
      [[-0.2, -0.04]]
    ],
    // 飞檐亭台 / 戏台
    pavilion: [
      [[-0.46, -0.06], [-0.24, -0.22], [0.0, -0.42], [0.24, -0.22], [0.46, -0.06], [-0.46, -0.06]],
      [[-0.28, -0.06], [-0.28, 0.34]],
      [[0.28, -0.06], [0.28, 0.34]],
      [[-0.4, 0.34], [0.4, 0.34]]
    ],
    // 宫灯
    lantern: [
      [[0.0, -0.46], [0.0, -0.28]],
      [[-0.16, -0.28], [0.16, -0.28], [0.28, 0.0], [0.16, 0.26], [-0.16, 0.26], [-0.28, 0.0], [-0.16, -0.28]],
      [[0.0, 0.26], [0.0, 0.46]]
    ],
    // 长剑
    sword: [
      [[-0.44, 0.4], [0.36, -0.4]],
      [[-0.32, 0.14], [-0.14, 0.32]]
    ],
    // 祥云
    cloud: [
      [[-0.44, 0.16], [-0.4, -0.06], [-0.2, -0.16], [0.0, -0.28], [0.24, -0.14], [0.42, -0.02], [0.44, 0.16], [-0.44, 0.16]]
    ],
    // 心形
    heart: [
      [[0.0, -0.18], [-0.18, -0.36], [-0.38, -0.18], [-0.34, 0.08], [0.0, 0.38], [0.34, 0.08], [0.38, -0.18], [0.18, -0.36], [0.0, -0.18]]
    ],
    // 星雨 / 落雪
    snow_stars: [
      [[-0.4, -0.2]], [[-0.15, 0.12]], [[0.1, -0.28]], [[0.35, 0.05]], [[-0.28, 0.3]], [[0.24, 0.28]]
    ]
  };

  // 语义图元 -> 归一化矢量笔触展开器（支持具象 shape、自由 polyline、wave、arc、line、dots）
  function expandAiPrimitivesToStrokes(elements = []) {
    if (!Array.isArray(elements)) return [];
    const strokes = [];
    const now = Date.now();

    elements.slice(0, 14).forEach((el, idx) => {
      if (!el || typeof el !== "object") return;
      const kind = String(el.kind || (el.shape ? "shape" : "wave")).toLowerCase();
      const brushId = safeBrushId(el.brushId);
      const width = clamp(el.width !== undefined ? el.width : 6, 3.5, 12);
      const velocity = clamp(el.velocity !== undefined ? el.velocity : (width >= 9 ? 0.9 : width <= 5 ? 0.65 : 0.78), 0.45, 0.98);

      if (kind === "shape") {
        const shapeKey = String(el.shape || "mountain").toLowerCase().trim();
        const paths = SHAPE_LIBRARY[shapeKey] || SHAPE_LIBRARY.mountain;
        const cx = clamp(el.cx !== undefined ? el.cx : 0.5, 0.1, 0.9);
        const cy = clamp(el.cy !== undefined ? el.cy : 0.5, 0.1, 0.9);
        const scale = clamp(el.scale !== undefined ? el.scale : 0.34, 0.12, 0.92);
        const sx = clamp(el.scaleX !== undefined ? el.scaleX : scale, 0.1, 0.95);
        const sy = clamp(el.scaleY !== undefined ? el.scaleY : scale, 0.1, 0.95);
        paths.forEach((poly, pIdx) => {
          const pts = poly.map(([lx, ly]) => ({
            x: clamp(cx + lx * sx, 0.03, 0.97),
            y: clamp(cy + ly * sy, 0.06, 0.94)
          }));
          if (pts.length > 0) {
            strokes.push({ id: `ai_sh_${now}_${idx}_${pIdx}`, brushId, width, velocity, points: pts });
          }
        });
      } else if (kind === "polyline" && Array.isArray(el.points) && el.points.length >= 2) {
        const pts = el.points.slice(0, 28).map((p) => ({
          x: clamp(Array.isArray(p) ? p[0] : p?.x, 0.03, 0.97),
          y: clamp(Array.isArray(p) ? p[1] : p?.y, 0.06, 0.94)
        }));
        strokes.push({ id: `ai_pl_${now}_${idx}`, brushId, width, velocity, points: pts });
      } else if (kind === "wave") {
        const startX = clamp(el.startX !== undefined ? el.startX : 0.06, 0.03, 0.92);
        const endX = clamp(el.endX !== undefined ? el.endX : 0.94, Math.min(0.97, startX + 0.08), 0.97);
        const baseY = clamp(el.baseY !== undefined ? el.baseY : 0.5, 0.12, 0.88);
        const amp = clamp(el.amp !== undefined ? el.amp : 0.1, 0.02, 0.28);
        const cycles = clamp(el.cycles !== undefined ? el.cycles : 1.5, 0.5, 3.5);
        const phase = Number.isFinite(Number(el.phase)) ? Number(el.phase) : 0;
        const pts = [];
        const samples = 22;
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          const x = startX + (endX - startX) * t;
          const y = clamp(baseY - Math.sin(t * Math.PI * 2 * cycles + phase) * amp, 0.06, 0.94);
          pts.push({ x, y });
        }
        strokes.push({ id: `ai_w_${now}_${idx}`, brushId, width, velocity, points: pts });
      } else if (kind === "arc") {
        const cx = clamp(el.cx !== undefined ? el.cx : 0.5, 0.08, 0.92);
        const cy = clamp(el.cy !== undefined ? el.cy : 0.4, 0.1, 0.9);
        const rx = clamp(el.rx !== undefined ? el.rx : 0.12, 0.03, 0.4);
        const ry = clamp(el.ry !== undefined ? el.ry : 0.14, 0.03, 0.35);
        const startDeg = Number.isFinite(Number(el.startDeg)) ? Number(el.startDeg) : 180;
        const endDeg = Number.isFinite(Number(el.endDeg)) ? Number(el.endDeg) : 360;
        const pts = [];
        const samples = 16;
        for (let i = 0; i <= samples; i++) {
          const deg = startDeg + ((endDeg - startDeg) * i) / samples;
          const rad = (deg * Math.PI) / 180;
          pts.push({
            x: clamp(cx + Math.cos(rad) * rx, 0.03, 0.97),
            y: clamp(cy + Math.sin(rad) * ry, 0.06, 0.94)
          });
        }
        strokes.push({ id: `ai_a_${now}_${idx}`, brushId, width, velocity, points: pts });
      } else if (kind === "line") {
        const x1 = clamp(el.x1 !== undefined ? el.x1 : 0.12, 0.03, 0.97);
        const y1 = clamp(el.y1 !== undefined ? el.y1 : 0.5, 0.06, 0.94);
        const x2 = clamp(el.x2 !== undefined ? el.x2 : 0.88, 0.03, 0.97);
        const y2 = clamp(el.y2 !== undefined ? el.y2 : 0.4, 0.06, 0.94);
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
        }
        strokes.push({ id: `ai_l_${now}_${idx}`, brushId, width, velocity, points: pts });
      } else if (kind === "dots" && Array.isArray(el.points)) {
        el.points.slice(0, 12).forEach((p, dIdx) => {
          const px = Array.isArray(p) ? p[0] : p?.x;
          const py = Array.isArray(p) ? p[1] : p?.y;
          if (px === undefined || py === undefined) return;
          strokes.push({
            id: `ai_d_${now}_${idx}_${dIdx}`,
            brushId,
            width,
            velocity,
            points: [{ x: clamp(px, 0.03, 0.97), y: clamp(py, 0.06, 0.94) }]
          });
        });
      }
    });

    return strokes;
  }

  // ==========================================
  // 2. 加载可用名士列表 & 五维完整上下文聚合
  // ==========================================
  async function loadAvailableCharacters() {
    let raw = [];
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        raw = await global.chatCharacterStore.getAll();
      } else if (typeof global.localStorage !== "undefined") {
        raw = JSON.parse(global.localStorage.getItem("t8_chat_list") || "[]");
      }
    } catch (e) {
      raw = [];
    }
    return (Array.isArray(raw) ? raw : []).filter((c) => {
      if (!c || !c.id || !c.name) return false;
      const cid = String(c.id);
      if (cid.startsWith("group") || c.type === "group" || c.isGroup || c.type === "decor") return false;
      if (String(c.name).includes("未知角色")) return false;
      return true;
    });
  }

  async function loadFiveDimContext(character, motif = "") {
    const pf = (character && character.profile) || {};
    const charProfile = {
      id: String(character?.id || ""),
      name: character?.name || pf.name || "名士",
      mbti: pf.mbti || character?.mbti || "",
      constellation: pf.constellation || pf.zodiac || character?.constellation || "",
      speakingStyle: pf.style || pf.speakingStyle || character?.style || character?.speakingStyle || "",
      personality: pf.personality || character?.personality || "",
      background: pf.background || pf.description || pf.bio || character?.background || ""
    };

    // 2. 身份配置库
    let userPersonaBlock = "";
    let userName = "主公";
    try {
      if (typeof global.localStorage !== "undefined") {
        const personas = JSON.parse(global.localStorage.getItem("user_personas") || "[]");
        const activeId = global.localStorage.getItem("active_persona_id");
        const active = Array.isArray(personas) ? (personas.find((p) => String(p.id) === String(activeId)) || personas[0]) : null;
        if (active) {
          userName = active.name || userName;
          const uLines = [`- 用户姓名：${userName}`];
          if (active.identity) uLines.push(`- 身份：${active.identity}`);
          if (active.personality) uLines.push(`- 性格：${active.personality}`);
          if (active.background) uLines.push(`- 背景：${String(active.background).slice(0, 260)}`);
          userPersonaBlock = uLines.join("\n");
        }
      }
    } catch (e) {}

    // 3. 世界书
    let worldBookBlock = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldBookBlock = String(wb).trim().slice(0, 1200);
      }
    } catch (e) {}

    // 4. 传讯近期上下文（16条）
    let recentChatLines = [];
    if (charProfile.id && global.chatHistoryStore) {
      try {
        let arr = [];
        if (typeof global.chatHistoryStore.getRecentMessages === "function") {
          arr = await global.chatHistoryStore.getRecentMessages(charProfile.id, 16);
        } else if (typeof global.chatHistoryStore.getMessages === "function") {
          const all = await global.chatHistoryStore.getMessages(charProfile.id);
          arr = Array.isArray(all) ? all.slice(-16) : [];
        }
        recentChatLines = (Array.isArray(arr) ? arr : [])
          .map((m) => {
            const who = m.isMe ? userName : (m.sender || charProfile.name);
            const txt = String(m.text || m.content || "").replace(/\s+/g, " ").trim().slice(0, 90);
            return txt ? `${who}：${txt}` : "";
          })
          .filter(Boolean);
      } catch (e) {}
    }

    return {
      charProfile,
      userName,
      userPersonaBlock,
      worldBookBlock,
      recentChatText: recentChatLines.join("\n"),
      motif: String(motif || "").trim()
    };
  }

  // ==========================================
  // 3. LLM 调用封装 & 本地人设意象降级
  // ==========================================
  function extractJsonObject(raw) {
    const cleaned = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1].trim() : cleaned;
    const s = body.indexOf("{");
    const e = body.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try {
      return JSON.parse(body.slice(s, e + 1));
    } catch (err) {
      return null;
    }
  }

  function resolveMainLlmConfig() {
    let configs = Array.isArray(global.api_configs) ? global.api_configs : [];
    let idx = Number(global.selected_api_config_index) || 0;
    if (configs.length === 0 && typeof global.localStorage !== "undefined") {
      try {
        const raw = global.localStorage.getItem("api_configs");
        if (raw) configs = JSON.parse(raw) || [];
        const si = global.localStorage.getItem("selected_api_config_index");
        if (si !== null && si !== "") idx = parseInt(si, 10) || 0;
      } catch (e) {}
    }
    const cfg = configs[idx] || configs[0];
    if (!cfg || !cfg.url) return null;
    const base = String(cfg.url).trim().replace(/\/+$/, "");
    const endpoint = /\/chat\/completions$/i.test(base)
      ? base
      : cfg.type === "official"
      ? (/\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`)
      : (/\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/api/chat/completions`);
    return {
      endpoint,
      apiKey: cfg.apiKey || cfg.key || "",
      model: cfg.model || "gpt-4o-mini"
    };
  }

  function buildOfflineFallbackComposition(ctxBundle) {
    const c = ctxBundle.charProfile;
    const motif = ctxBundle.motif || "清夜听风";
    const isIntrovert = String(c.mbti || "").toUpperCase().startsWith("I");
    const mainBrush = isIntrovert ? "indigo" : "bamboo";
    const accentBrush = isIntrovert ? "ink_black" : "cinnabar";

    const elements = [
      { kind: "shape", shape: "crescent_moon", brushId: "gilded", cx: 0.78, cy: 0.2, scale: 0.18, width: 5 },
      { kind: "shape", shape: isIntrovert ? "bamboo_stalk" : "plum_blossom", brushId: mainBrush, cx: 0.28, cy: 0.46, scale: 0.38, width: 5 },
      { kind: "shape", shape: "mountain", brushId: accentBrush, cx: 0.55, cy: 0.72, scaleX: 0.88, scaleY: 0.34, width: 7 },
      { kind: "shape", shape: "snow_stars", brushId: "celadon", cx: 0.5, cy: 0.28, scale: 0.75, width: 5 }
    ];

    return {
      ok: true,
      usedAi: false,
      charName: c.name,
      charId: c.id,
      title: motif.slice(0, 12),
      scaleId: isIntrovert ? "miyako" : "pentatonic",
      bpm: isIntrovert ? 88 : 104,
      sustainId: "long",
      note: `以「${motif}」为题，随手替你勾了几笔音画，听听看可合心意？`,
      strokes: expandAiPrimitivesToStrokes(elements)
    };
  }

  async function composeForCharacter({ character, motif = "", customChatFn = null } = {}) {
    const ctxBundle = await loadFiveDimContext(character, motif);
    const c = ctxBundle.charProfile;

    const charLines = [
      `- 角色姓名与ID：${c.name} (${c.id})`,
      c.mbti ? `- MBTI 性格类型：${c.mbti}` : "",
      c.constellation ? `- 星座：${c.constellation}` : "",
      c.speakingStyle ? `- 语言风格：${c.speakingStyle}` : "",
      c.personality ? `- 性格特点：${c.personality}` : "",
      c.background ? `- 个人背景：${String(c.background).slice(0, 320)}` : ""
    ].filter(Boolean);

    const sysPrompt = [
      `你是【${c.name}】，正在「绘·境」音乐画板上亲手为「${ctxBundle.userName}」画一幅“画即乐章”的作品并现场演奏。`,
      "【维度一·角色完整配置】",
      charLines.join("\n"),
      ctxBundle.userPersonaBlock ? `【维度二·用户身份配置库】\n${ctxBundle.userPersonaBlock}` : "",
      ctxBundle.worldBookBlock ? `【维度三·已开启的世界书】\n${ctxBundle.worldBookBlock}` : "",
      ctxBundle.recentChatText ? `【维度四·传讯中你们的近期上下文】\n${ctxBundle.recentChatText}` : "",
      "【画板作画与音乐规则（重要！）】",
      "- 横轴 x (0.05~0.95) 为时间从左到右循环，纵轴 y (0.08=最高音 ~ 0.90=最低音)。",
      "- 可选 10 种画笔（颜色即乐器）：ink_black(玄墨·古琴), ink_gray(淡墨·木鱼玉磬), bamboo(竹青·古筝), cinnabar(朱砂·琵琶), gilded(鎏金·扬琴), celadon(天青·竹笛), indigo(黛蓝·洞箫), rouge(胭脂·二胡), amethyst(紫檀·编钟), coral(珊瑚·钢琴)。",
      "- 可选音阶 scaleId：pentatonic(五声国风) / major(C大调) / minor(A小调) / miyako(空灵都节)；延音 sustainId：long / soft / crisp；速度 bpm：80~136。",
      "- 【具象作画铁律】严禁只用抽象波浪和直线敷衍！你在题跋里说画了什么，画布上就必须**真实画出肉眼一眼能认出的具象简笔画**！",
      "- 强烈优先组合使用内置具象简笔画模组 kind=\"shape\"，可选 shape：fox(灵狐), cat(小猫), crescent_moon(弯月), boat(乌篷孤舟), mountain(层峦远山), river_waves(江潮水浪), plum_blossom(红梅), bamboo_stalk(翠竹), bird(飞燕), fish(游鱼), pavilion(飞檐亭台/戏台), lantern(宫灯), sword(长剑), cloud(祥云), heart(心形), snow_stars(星雨落雪)。参数：{kind:\"shape\", shape:\"fox\", brushId:\"rouge\", cx:0.35, cy:0.55, scale:0.35, width:5}。",
      "- 若需绘制模组库之外的特定轮廓，可用 kind=\"polyline\" + points:[[x,y],...] 勾勒真实轮廓，或少量辅以 wave/dots 点缀背景。",
      "严格输出纯 JSON 对象（不要额外文字）：",
      '{"title":"2~8字曲名","scaleId":"pentatonic","bpm":96,"sustainId":"long","note":"用你本人六维口吻写下的作画题跋(30~80字，与画布上的具象元素严格一致)","elements":[{"kind":"shape","shape":"crescent_moon","brushId":"gilded","cx":0.78,"cy":0.2,"scale":0.18,"width":5},{"kind":"shape","shape":"fox","brushId":"rouge","cx":0.36,"cy":0.52,"scale":0.34,"width":5},{"kind":"shape","shape":"boat","brushId":"ink_black","cx":0.62,"cy":0.68,"scale":0.28,"width":6},{"kind":"shape","shape":"river_waves","brushId":"indigo","cx":0.5,"cy":0.86,"scaleX":0.9,"scaleY":0.22,"width":5}]}'
    ]
      .filter(Boolean)
      .join("\n");

    const userPrompt = ctxBundle.motif
      ? `用户指定的意象：「${ctxBundle.motif}」。请围绕这个意象，结合你的性格与你们近期的互动，亲手画一幅音画并写下题跋。`
      : "用户没有指定具体意象，请完全依照你此刻的心境、你的角色背景以及你们传讯中的近期互动，自主构思一幅专属音画送给对方并写下题跋。";

    try {
      const invoke = async () => {
        if (typeof customChatFn === "function") {
          return customChatFn([
            { role: "system", content: sysPrompt },
            { role: "user", content: userPrompt }
          ]);
        }
        const llm = resolveMainLlmConfig();
        if (!llm) throw new Error("NO_LLM_CONFIG");
        const headers = { "Content-Type": "application/json" };
        if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
        const resp = await fetch(llm.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: llm.model,
            messages: [
              { role: "system", content: sysPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.85,
            max_tokens: 680
          })
        });
        if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
        const json = await resp.json();
        return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
      };

      const raw = await Promise.race([
        invoke(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("LLM_TIMEOUT")), 16000))
      ]);

      const parsed = extractJsonObject(raw);
      const strokes = expandAiPrimitivesToStrokes(parsed?.elements);
      if (parsed && strokes.length > 0) {
        return {
          ok: true,
          usedAi: true,
          charName: c.name,
          charId: c.id,
          title: String(parsed.title || ctxBundle.motif || "即兴音画").trim().slice(0, 16),
          scaleId: safeScaleId(parsed.scaleId),
          bpm: Math.round(clamp(parsed.bpm || 98, 72, 148)),
          sustainId: safeSustainId(parsed.sustainId),
          note: String(parsed.note || "随手为你勾勒一幅音画，静听片刻吧。").trim().slice(0, 140),
          strokes
        };
      }
    } catch (e) {}

    return buildOfflineFallbackComposition(ctxBundle);
  }

  const api = {
    MOTIF_CHIPS,
    expandAiPrimitivesToStrokes,
    loadAvailableCharacters,
    loadFiveDimContext,
    composeForCharacter
  };

  global.HuiJingAiComposer = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

