/**
 * Milvus/builtin_voice_bridge.js (v2.0)
 * 广陵内置音色桥接、精调调音台与传讯角色绑定引擎（零 app.min.js 侵入，零 localStorage 写入）
 * 职责：
 *  1. 复用广陵联播内置音色内核（动森中文双核 5 预设 + 完整 5 维精调 / 浏览器系统中文真人声库 / 复古 Mii 拟音）
 *  2. 持有独立 GuanglingVoiceController 实例（调用 configure / loadAssets / playLine({ onComplete })），与广陵联播主播完全隔离
 *  3. 提供演出标签清洗、长文本按句分段连续播报（防 Chrome WebSpeech 15s 截断）、iOS 手势解锁、云端/内置互斥
 *  4. 导出 BuiltinVoiceStudioPanel（设置-语音配置工作台下方：调音 + 试听 + 直接绑定传讯角色）与 CharacterBuiltinVoiceControls（传讯私聊对话偏好设置）
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_BUILTIN_VOICE_BRIDGE_LOADED__) return;
  global.__MILVUS_BUILTIN_VOICE_BRIDGE_LOADED__ = true;

  const DEFAULT_PREVIEW_TEXT = "殿下，广陵夜深露重，这盏热茶先暖暖手。";

  const FALLBACK_ANIMALESE_PRESETS = [
    {
      id: "sunny-helper",
      name: "灵动小报童",
      desc: "原版动森清亮纯采样，四声灵动，活泼轻快",
      config: { basePitchHz: 515, unitsPerSecond: 10.0, toneAmount: 0.62, mixRatio: 0.0, warmthHz: 9500 }
    },
    {
      id: "silk-anchor",
      name: "端庄播音腔",
      desc: "中音清晰稳重纯采样，带有正式播报的轻盈质感",
      config: { basePitchHz: 390, unitsPerSecond: 9.8, toneAmount: 0.55, mixRatio: 0.0, warmthHz: 7800 }
    },
    {
      id: "scholar-warm",
      name: "温润公子音",
      desc: "温和清雅的中低纯采样声线，低通柔化齿音，适合古风名士",
      config: { basePitchHz: 300, unitsPerSecond: 9.4, toneAmount: 0.46, mixRatio: 0.05, warmthHz: 5200 }
    },
    {
      id: "uncle-nook",
      name: "沉稳大掌柜",
      desc: "低沉磁性慢语速，带有温暖厚实的共鸣底色",
      config: { basePitchHz: 245, unitsPerSecond: 10.0, toneAmount: 0.34, mixRatio: 0.12, warmthHz: 3200 }
    },
    {
      id: "honey-hybrid",
      name: "复古电台混音",
      desc: "采样与共振峰等功率融合，经典动森复古电台味",
      config: { basePitchHz: 448, unitsPerSecond: 12.0, toneAmount: 0.52, mixRatio: 0.5, warmthHz: 6000 }
    }
  ];

  // ==========================================
  // 1. 文本清洗与长文本分句（纯函数）
  // ==========================================
  function extractVoiceBlock(raw) {
    const m = String(raw || "").match(/<[语語]音[^>]*>([\s\S]*?)<\/\s*[语語]音\s*>/);
    return m ? m[1] : String(raw || "");
  }

  function sanitizeTextForBuiltin(raw) {
    let text = extractVoiceBlock(raw);
    text = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\[[^\]]{1,40}\]/g, " ")
      .replace(/（[^）]{1,40}）/g, " ")
      .replace(/\([^)]{1,40}\)/g, " ")
      .replace(/\*[^*]{1,40}\*/g, " ")
      .replace(/【[^】]{1,24}】/g, " ")
      .replace(/[#`~>_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 600);
  }

  function splitIntoSpeechChunks(rawText, maxLen) {
    const limit = Math.max(24, Number(maxLen) || 72);
    const clean = String(rawText || "").trim();
    if (!clean) return [];
    if (clean.length <= limit) return [clean];

    const sentences = clean.split(/(?<=[。！？!?…\n])/g).map((s) => s.trim()).filter(Boolean);
    const chunks = [];
    let current = "";

    const pushHardSplit = (seg) => {
      const subParts = seg.split(/(?<=[，、；：,:;])/g).map((s) => s.trim()).filter(Boolean);
      let buf = "";
      for (const p of subParts) {
        if (p.length > limit) {
          if (buf) {
            chunks.push(buf);
            buf = "";
          }
          for (let i = 0; i < p.length; i += limit) {
            chunks.push(p.slice(i, i + limit));
          }
          continue;
        }
        if ((buf + p).length > limit && buf) {
          chunks.push(buf);
          buf = p;
        } else {
          buf += p;
        }
      }
      if (buf) chunks.push(buf);
    };

    for (const s of sentences) {
      if (s.length > limit) {
        if (current) {
          chunks.push(current);
          current = "";
        }
        pushHardSplit(s);
        continue;
      }
      if ((current + s).length > limit && current) {
        chunks.push(current);
        current = s;
      } else {
        current += s;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // ==========================================
  // 2. 内置音色目录、系统真人声库与传讯角色读取
  // ==========================================
  function getAnimalesePresets() {
    const gve = global.GuanglingVoiceEngine;
    if (gve && Array.isArray(gve.VOICE_PRESETS) && gve.VOICE_PRESETS.length > 0) {
      return gve.VOICE_PRESETS;
    }
    return FALLBACK_ANIMALESE_PRESETS;
  }

  function getPresetTuning(presetId) {
    const presets = getAnimalesePresets();
    const found = presets.find((p) => p.id === presetId) || presets.find((p) => p.id === "scholar-warm") || presets[0];
    const c = (found && found.config) || {};
    return {
      basePitchHz: Number(c.basePitchHz || 300),
      unitsPerSecond: Number(c.unitsPerSecond || 9.4),
      toneAmount: Number(c.toneAmount ?? 0.46),
      mixRatio: Number(c.mixRatio ?? 0.05),
      warmthHz: Number(c.warmthHz || 5200),
      webSpeechRate: 1.05,
      webSpeechPitch: 1.0
    };
  }

  function scoreChineseVoice(v) {
    if (!v) return 0;
    const lang = String(v.lang || "").toLowerCase();
    const name = String(v.name || "");
    let score = 0;
    if (lang.startsWith("zh-cn") || lang === "zh_cn") score += 100;
    else if (lang.startsWith("zh")) score += 60;
    if (/natural|online|neural/i.test(name)) score += 35;
    if (/xiaoxiao|yunxi|yunjian|xiaoyi|tingting|sinji|meijia/i.test(name)) score += 25;
    if (v.localService) score += 8;
    return score;
  }

  function listChineseSystemVoices() {
    try {
      if (typeof global.speechSynthesis === "undefined" || typeof global.speechSynthesis.getVoices !== "function") {
        return [];
      }
      const all = global.speechSynthesis.getVoices() || [];
      const zh = all.filter((v) => v && (/^zh/i.test(v.lang || "") || /chinese|mandarin|cantonese|普通话|中文|粤语/i.test(v.name || "")));
      const dedup = [];
      const seen = new Set();
      zh.sort((a, b) => scoreChineseVoice(b) - scoreChineseVoice(a)).forEach((v) => {
        const uri = String(v.voiceURI || v.name || "");
        if (!uri || seen.has(uri)) return;
        seen.add(uri);
        dedup.push({
          voiceURI: uri,
          name: String(v.name || uri),
          lang: String(v.lang || "zh-CN"),
          localService: Boolean(v.localService)
        });
      });
      return dedup;
    } catch (_) {
      return [];
    }
  }

  async function loadChatSoloCharacters() {
    let list = [];
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        const res = await global.chatCharacterStore.getAll();
        if (Array.isArray(res) && res.length > 0) list = res;
      }
    } catch (_) {}
    if (list.length === 0) {
      try {
        const raw = JSON.parse(global.localStorage && global.localStorage.getItem("t8_chat_list") || "[]");
        if (Array.isArray(raw)) list = raw;
      } catch (_) {}
    }
    return list.filter((c) => {
      if (!c || !c.id || !c.name) return false;
      const n = String(c.name).trim();
      const id = String(c.id || "");
      if (!n || n === "未知角色" || n === "未知" || n === "?") return false;
      if (
        c.isGroup ||
        id.startsWith("group") ||
        id.startsWith("style_") ||
        id === "moments_data" ||
        id.startsWith("moments") ||
        c.type === "group" ||
        c.type === "decor" ||
        c.type === "moments" ||
        (c.profile && c.profile.members)
      ) {
        return false;
      }
      return true;
    });
  }

  function getCatalog() {
    const animalese = getAnimalesePresets().map((p) => ({
      key: `animalese:${p.id}`,
      mode: "animalese",
      presetId: p.id,
      webSpeechVoiceURI: "",
      name: p.name,
      categoryLabel: "动森拟音",
      desc: p.desc || "广陵内置中文四声双核动森拟音",
      config: p.config || {},
      offline: true
    }));

    const sysVoices = listChineseSystemVoices();
    const webspeech = [
      {
        key: "webspeech:__auto__",
        mode: "webspeech",
        presetId: "",
        webSpeechVoiceURI: "",
        name: "系统默认中文真人（自动优选）",
        categoryLabel: "系统真人",
        desc: sysVoices.length > 0
          ? `自动优选本机最自然中文声库（当前优先：${sysVoices[0].name}）`
          : "使用浏览器内置中文朗读引擎（依赖系统语音包）",
        offline: true
      }
    ].concat(
      sysVoices.map((v) => ({
        key: `webspeech:${v.voiceURI}`,
        mode: "webspeech",
        presetId: "",
        webSpeechVoiceURI: v.voiceURI,
        name: v.name,
        categoryLabel: "系统真人",
        desc: `系统语言 ${v.lang} · ${v.localService ? "本机离线声库" : "系统在线自然声库"}`,
        offline: v.localService
      }))
    );

    const blip = [
      {
        key: "blip:retro",
        mode: "blip",
        presetId: "retro",
        webSpeechVoiceURI: "",
        name: "复古 Mii 电子拟音",
        categoryLabel: "复古拟音",
        desc: "清脆轻量电子拟音，零依赖极速发声，适合趣味测试",
        offline: true
      }
    ];

    return {
      animalese,
      webspeech,
      blip,
      all: [...animalese, ...webspeech, ...blip],
      systemVoiceCount: sysVoices.length
    };
  }

  function describeBuiltinVoice(opts) {
    const mode = (opts && (opts.builtinMode || opts.mode)) || "animalese";
    const tuning = opts && opts.builtinTuning;
    if (mode === "animalese") {
      const pid = (opts && (opts.builtinPresetId || opts.presetId)) || "scholar-warm";
      const found = getAnimalesePresets().find((p) => p.id === pid);
      const hz = tuning && tuning.basePitchHz ? ` · ${Math.round(tuning.basePitchHz)}Hz` : "";
      return `动森 · ${found ? found.name : "温润公子音"}${hz}`;
    }
    if (mode === "webspeech") {
      const uri = (opts && (opts.builtinWebVoiceURI || opts.webSpeechVoiceURI)) || "";
      if (!uri) return "系统真人 · 自动优选";
      const found = listChineseSystemVoices().find((v) => v.voiceURI === uri);
      return `系统真人 · ${found ? found.name : uri}`;
    }
    if (mode === "blip") return "复古拟音 · Mii";
    return "内置音色";
  }

  // ==========================================
  // 3. 隔离控制器与播报调度（与广陵联播完全隔离）
  // ==========================================
  let _dedicatedController = null;
  let _speakSessionId = 0;
  let _playState = { status: "idle", key: "", label: "", error: "" };

  function emitState(next) {
    _playState = { ..._playState, ...next };
    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-builtin-voice-state", { detail: { ..._playState } }));
      }
    } catch (_) {}
  }

  function getDedicatedController() {
    if (_dedicatedController) return _dedicatedController;
    const gve = global.GuanglingVoiceEngine;
    if (!gve || typeof gve.GuanglingVoiceController !== "function") {
      return null;
    }
    _dedicatedController = new gve.GuanglingVoiceController();
    return _dedicatedController;
  }

  function stop(opts) {
    _speakSessionId += 1;
    if (_dedicatedController && typeof _dedicatedController.stop === "function") {
      try {
        _dedicatedController.stop();
      } catch (_) {}
    }
    try {
      if (typeof global.speechSynthesis !== "undefined" && typeof global.speechSynthesis.cancel === "function") {
        global.speechSynthesis.cancel();
      }
    } catch (_) {}
    emitState({ status: "idle", key: "", label: "", error: "" });

    const skipExternal = opts && opts.skipExternal;
    if (!skipExternal && global.VoiceStudioEngine && typeof global.VoiceStudioEngine.stopPlayback === "function") {
      try {
        global.VoiceStudioEngine.stopPlayback({ skipBuiltin: true });
      } catch (_) {}
    }
  }

  function buildControllerConfig(voiceOpts) {
    const gve = global.GuanglingVoiceEngine;
    const mode = (voiceOpts && (voiceOpts.mode || voiceOpts.builtinMode)) || "animalese";
    const presetId = (voiceOpts && (voiceOpts.presetId || voiceOpts.builtinPresetId)) || "scholar-warm";
    const webVoiceURI = (voiceOpts && (voiceOpts.webSpeechVoiceURI || voiceOpts.builtinWebVoiceURI)) || "";
    const tuning = (voiceOpts && (voiceOpts.tuning || voiceOpts.builtinTuning)) || null;
    const speed = Math.max(0.65, Math.min(1.6, Number((voiceOpts && voiceOpts.speed) || 1.0)));
    const pitchFactor = Math.max(0.65, Math.min(1.5, Number((voiceOpts && (voiceOpts.pitch || voiceOpts.builtinPitch)) || 1.0)));

    let baseCfg = gve && gve.DEFAULT_VOICE_CONFIG ? { ...gve.DEFAULT_VOICE_CONFIG } : {};
    if (gve && typeof gve.applyPresetToVoiceConfig === "function") {
      baseCfg = gve.applyPresetToVoiceConfig(baseCfg, presetId);
    }

    if (tuning && typeof tuning === "object") {
      if (Number.isFinite(Number(tuning.basePitchHz))) baseCfg.basePitchHz = Number(tuning.basePitchHz);
      if (Number.isFinite(Number(tuning.unitsPerSecond))) baseCfg.unitsPerSecond = Number(tuning.unitsPerSecond);
      if (Number.isFinite(Number(tuning.toneAmount))) baseCfg.toneAmount = Number(tuning.toneAmount);
      if (Number.isFinite(Number(tuning.mixRatio))) baseCfg.mixRatio = Number(tuning.mixRatio);
      if (Number.isFinite(Number(tuning.warmthHz))) baseCfg.warmthHz = Number(tuning.warmthHz);
      if (Number.isFinite(Number(tuning.webSpeechRate))) baseCfg.webSpeechRate = Number(tuning.webSpeechRate);
      if (Number.isFinite(Number(tuning.webSpeechPitch))) baseCfg.webSpeechPitch = Number(tuning.webSpeechPitch);
    } else {
      baseCfg.basePitchHz = Math.round((baseCfg.basePitchHz || 300) * pitchFactor);
      baseCfg.unitsPerSecond = Number(((baseCfg.unitsPerSecond || 9.8) * speed).toFixed(2));
      baseCfg.webSpeechRate = Number(Math.max(0.65, Math.min(1.6, speed * 1.05)).toFixed(2));
      baseCfg.webSpeechPitch = Number(Math.max(0.6, Math.min(1.5, pitchFactor)).toFixed(2));
    }

    baseCfg.mode = mode;
    baseCfg.preset = presetId;
    baseCfg.webSpeechVoiceURI = webVoiceURI;
    baseCfg.volume = 0.88;
    return gve && typeof gve.normalizeVoiceConfig === "function"
      ? gve.normalizeVoiceConfig(baseCfg)
      : baseCfg;
  }

  async function speakText(rawText, voiceOpts, callbacks) {
    const cb = callbacks || {};
    const key = String((voiceOpts && voiceOpts.key) || `builtin_${Date.now()}`);
    if (_playState.status === "playing" && _playState.key === key && !(voiceOpts && voiceOpts.forceRestart)) {
      stop();
      if (typeof cb.onEnd === "function") cb.onEnd({ stoppedByToggle: true });
      return { stoppedByToggle: true };
    }

    const clean = sanitizeTextForBuiltin(rawText);
    if (!clean) {
      const err = new Error("可朗读文本为空");
      emitState({ status: "error", key, error: err.message });
      if (typeof cb.onError === "function") cb.onError(err);
      throw err;
    }

    const ctrl = getDedicatedController();
    if (!ctrl) {
      const err = new Error("广陵语音引擎未就绪，请刷新页面重试");
      emitState({ status: "error", key, error: err.message });
      if (typeof cb.onError === "function") cb.onError(err);
      throw err;
    }

    // 同步手势栈内先解锁音频，兼容 iOS Safari
    try {
      if (typeof ctrl.unlock === "function") ctrl.unlock();
    } catch (_) {}

    // 停掉此前正在播的内置或云端音频
    stop({ skipExternal: false });

    const mySession = ++_speakSessionId;
    const cfg = buildControllerConfig(voiceOpts);
    if (typeof ctrl.configure === "function") {
      ctrl.configure(cfg);
    } else {
      ctrl.config = cfg;
    }

    const label = describeBuiltinVoice(voiceOpts);
    emitState({ status: "playing", key, label, error: "" });
    if (typeof cb.onStart === "function") cb.onStart({ key, label, mode: cfg.mode });

    // 动森模式首次按需加载音节库（失败会自动平滑降级数学共振峰）
    if (cfg.mode === "animalese" && typeof ctrl.loadAssets === "function") {
      try {
        await ctrl.loadAssets();
      } catch (_) {}
      if (mySession !== _speakSessionId) return { cancelled: true };
    }

    const chunks = splitIntoSpeechChunks(clean, cfg.mode === "webspeech" ? 65 : 95);
    return new Promise((resolve) => {
      let idx = 0;
      const playNext = () => {
        if (mySession !== _speakSessionId) {
          resolve({ cancelled: true });
          return;
        }
        if (idx >= chunks.length) {
          emitState({ status: "idle", key: "", label: "", error: "" });
          if (typeof cb.onEnd === "function") cb.onEnd({ completed: true });
          resolve({ completed: true, mode: cfg.mode, label });
          return;
        }
        const chunk = chunks[idx++];
        ctrl.playLine(chunk, {
          onComplete: () => {
            if (mySession !== _speakSessionId) {
              resolve({ cancelled: true });
              return;
            }
            playNext();
          }
        });
      };
      playNext();
    });
  }

  // ==========================================
  // 4. 复用 UI 辅助：精调滑块组件
  // ==========================================
  function renderTuningSliders(React, mode, tuning, onChangeTuning) {
    const t = tuning || getPresetTuning("scholar-warm");
    const rowStyle = {
      display: "grid",
      gridTemplateColumns: "92px 1fr 56px",
      alignItems: "center",
      gap: "8px",
      fontSize: "11px",
      color: "#575247"
    };
    const valStyle = { textAlign: "right", fontFamily: "monospace", fontSize: "11px", color: "#5E6756", fontWeight: 700 };

    if (mode === "animalese") {
      return React.createElement(
        "div",
        { style: { display: "grid", gap: "7px", padding: "9px 10px", borderRadius: "10px", background: "#FAF7F0", border: "1px solid #ECE5D8" } },
        React.createElement(
          "div",
          { style: rowStyle },
          React.createElement("span", null, "基准音高"),
          React.createElement("input", {
            type: "range",
            min: "180",
            max: "620",
            step: "5",
            value: Math.round(t.basePitchHz || 300),
            onChange: (e) => onChangeTuning({ basePitchHz: Number(e.target.value) })
          }),
          React.createElement("span", { style: valStyle }, `${Math.round(t.basePitchHz || 300)} Hz`)
        ),
        React.createElement(
          "div",
          { style: rowStyle },
          React.createElement("span", null, "播报语速"),
          React.createElement("input", {
            type: "range",
            min: "6.0",
            max: "16.0",
            step: "0.2",
            value: Number(t.unitsPerSecond || 9.4),
            onChange: (e) => onChangeTuning({ unitsPerSecond: Number(e.target.value) })
          }),
          React.createElement("span", { style: valStyle }, `${Number(t.unitsPerSecond || 9.4).toFixed(1)} /s`)
        ),
        React.createElement(
          "div",
          { style: rowStyle },
          React.createElement("span", null, "四声起伏"),
          React.createElement("input", {
            type: "range",
            min: "0",
            max: "1.2",
            step: "0.02",
            value: Number(t.toneAmount ?? 0.46),
            onChange: (e) => onChangeTuning({ toneAmount: Number(e.target.value) })
          }),
          React.createElement("span", { style: valStyle }, `${Math.round(Number(t.toneAmount ?? 0.46) * 100)}%`)
        ),
        React.createElement(
          "div",
          { style: rowStyle },
          React.createElement("span", null, "采样/合成混音"),
          React.createElement("input", {
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            value: Number(t.mixRatio ?? 0.05),
            onChange: (e) => onChangeTuning({ mixRatio: Number(e.target.value) })
          }),
          React.createElement("span", { style: valStyle }, `${Math.round(Number(t.mixRatio ?? 0.05) * 100)}%`)
        ),
        React.createElement(
          "div",
          { style: rowStyle },
          React.createElement("span", null, "暖度低通"),
          React.createElement("input", {
            type: "range",
            min: "1800",
            max: "12000",
            step: "200",
            value: Math.round(t.warmthHz || 5200),
            onChange: (e) => onChangeTuning({ warmthHz: Number(e.target.value) })
          }),
          React.createElement("span", { style: valStyle }, `${(Number(t.warmthHz || 5200) / 1000).toFixed(1)}k`)
        )
      );
    }

    if (mode === "webspeech") {
      return React.createElement(
        "div",
        { style: { display: "grid", gap: "7px", padding: "9px 10px", borderRadius: "10px", background: "#FAF7F0", border: "1px solid #ECE5D8" } },
        React.createElement(
          "div",
          { style: rowStyle },
          React.createElement("span", null, "朗读语速"),
          React.createElement("input", {
            type: "range",
            min: "0.65",
            max: "1.55",
            step: "0.05",
            value: Number(t.webSpeechRate || 1.05),
            onChange: (e) => onChangeTuning({ webSpeechRate: Number(e.target.value) })
          }),
          React.createElement("span", { style: valStyle }, `${Number(t.webSpeechRate || 1.05).toFixed(2)}x`)
        ),
        React.createElement(
          "div",
          { style: rowStyle },
          React.createElement("span", null, "声线音调"),
          React.createElement("input", {
            type: "range",
            min: "0.65",
            max: "1.45",
            step: "0.05",
            value: Number(t.webSpeechPitch || 1.0),
            onChange: (e) => onChangeTuning({ webSpeechPitch: Number(e.target.value) })
          }),
          React.createElement("span", { style: valStyle }, `${Number(t.webSpeechPitch || 1.0).toFixed(2)}`)
        )
      );
    }

    return null;
  }

  // ==========================================
  // 5. 设置 → 隐私与安全 → 语音配置工作台下方「内置音色调音台 & 角色绑定」
  // ==========================================
  function BuiltinVoiceStudioPanel() {
    const React = global.React;
    if (!React) return null;
    const { useState, useEffect } = React;

    const vse = global.VoiceStudioEngine;
    const [cfg, setCfg] = useState(() => (vse && typeof vse.getConfig === "function" ? vse.getConfig() : {}));
    const [charVoicesMap, setCharVoicesMap] = useState(() => (vse && typeof vse.getAllCharVoices === "function" ? vse.getAllCharVoices() : {}));
    const [chatChars, setChatChars] = useState([]);
    const [catalog, setCatalog] = useState(() => getCatalog());

    const [mode, setMode] = useState(() => (cfg && cfg.defaultBuiltinMode) || "animalese");
    const [presetId, setPresetId] = useState(() => (cfg && cfg.defaultBuiltinPresetId) || "scholar-warm");
    const [webVoiceURI, setWebVoiceURI] = useState(() => (cfg && cfg.defaultBuiltinWebVoiceURI) || "");
    const [tuning, setTuning] = useState(() => (cfg && cfg.defaultBuiltinTuning) || getPresetTuning((cfg && cfg.defaultBuiltinPresetId) || "scholar-warm"));
    const [selectedCharId, setSelectedCharId] = useState("");
    const [sampleText, setSampleText] = useState(DEFAULT_PREVIEW_TEXT);
    const [playState, setPlayState] = useState(_playState);
    const [tip, setTip] = useState("");

    useEffect(() => {
      let alive = true;
      const refreshCatalog = () => alive && setCatalog(getCatalog());
      const onPlay = (e) => alive && setPlayState(e.detail || _playState);
      const onCfgOrChar = () => {
        if (!alive || !vse) return;
        if (typeof vse.getConfig === "function") setCfg({ ...vse.getConfig() });
        if (typeof vse.getAllCharVoices === "function") setCharVoicesMap({ ...vse.getAllCharVoices() });
      };

      if (vse && typeof vse.hydrate === "function") {
        vse.hydrate().then(({ config, charVoices }) => {
          if (!alive) return;
          if (config) {
            setCfg({ ...config });
            setMode(config.defaultBuiltinMode || "animalese");
            const pid = config.defaultBuiltinPresetId || "scholar-warm";
            setPresetId(pid);
            setWebVoiceURI(config.defaultBuiltinWebVoiceURI || "");
            setTuning(config.defaultBuiltinTuning || getPresetTuning(pid));
          }
          if (charVoices) setCharVoicesMap({ ...charVoices });
        }).catch(() => {});
      }

      loadChatSoloCharacters().then((list) => {
        if (!alive) return;
        setChatChars(list);
        if (list.length > 0 && !selectedCharId) {
          setSelectedCharId(String(list[0].id));
        }
      });

      global.addEventListener && global.addEventListener("milvus-builtin-voice-state", onPlay);
      global.addEventListener && global.addEventListener("milvus-voice-config-changed", onCfgOrChar);
      global.addEventListener && global.addEventListener("milvus-voice-char-changed", onCfgOrChar);

      if (typeof global.speechSynthesis !== "undefined") {
        try {
          global.speechSynthesis.getVoices();
          if (typeof global.speechSynthesis.addEventListener === "function") {
            global.speechSynthesis.addEventListener("voiceschanged", refreshCatalog);
          }
        } catch (_) {}
      }
      const timer = setTimeout(refreshCatalog, 600);

      return () => {
        alive = false;
        clearTimeout(timer);
        global.removeEventListener && global.removeEventListener("milvus-builtin-voice-state", onPlay);
        global.removeEventListener && global.removeEventListener("milvus-voice-config-changed", onCfgOrChar);
        global.removeEventListener && global.removeEventListener("milvus-voice-char-changed", onCfgOrChar);
        if (typeof global.speechSynthesis !== "undefined" && typeof global.speechSynthesis.removeEventListener === "function") {
          global.speechSynthesis.removeEventListener("voiceschanged", refreshCatalog);
        }
      };
    }, []);

    const saveCfgPatch = (patch) => {
      const next = { ...cfg, ...patch };
      setCfg(next);
      if (vse && typeof vse.saveConfig === "function") {
        vse.saveConfig(patch).catch(() => {});
      }
    };

    const handlePickPreset = (pid) => {
      setPresetId(pid);
      setTuning((prev) => ({ ...prev, ...getPresetTuning(pid) }));
    };

    const handleUpdateTuning = (patch) => {
      setTuning((prev) => ({ ...prev, ...patch }));
    };

    const handleTestCurrent = () => {
      const text = (sampleText || "").trim() || DEFAULT_PREVIEW_TEXT;
      setTip("");
      speakText(text, {
        key: "studio_current_preview",
        mode,
        presetId,
        webSpeechVoiceURI: webVoiceURI,
        tuning
      }).catch((err) => {
        setTip(err && err.message ? err.message : "试听失败");
      });
    };

    const handleSaveAsDefault = () => {
      saveCfgPatch({
        defaultBuiltinMode: mode,
        defaultBuiltinPresetId: presetId,
        defaultBuiltinWebVoiceURI: mode === "webspeech" ? webVoiceURI : "",
        defaultBuiltinTuning: { ...tuning }
      });
      setTip(`已将当前调校「${describeBuiltinVoice({ mode, presetId, webSpeechVoiceURI: webVoiceURI, builtinTuning: tuning })}」设为全局默认内置音色`);
    };

    const handleBindToSelectedChar = async () => {
      if (!selectedCharId) {
        setTip("请先选择一位传讯名士");
        return;
      }
      if (!vse || typeof vse.saveCharVoice !== "function") {
        setTip("语音引擎未就绪");
        return;
      }
      const targetChar = chatChars.find((c) => String(c.id) === String(selectedCharId));
      const payload = {
        voiceSource: "builtin",
        builtinMode: mode,
        builtinPresetId: presetId,
        builtinWebVoiceURI: mode === "webspeech" ? webVoiceURI : "",
        builtinTuning: { ...tuning },
        speed: mode === "webspeech" ? Number(tuning.webSpeechRate || 1.0) : 1.0,
        builtinPitch: mode === "webspeech" ? Number(tuning.webSpeechPitch || 1.0) : 1.0
      };
      await vse.saveCharVoice(selectedCharId, payload);
      if (typeof vse.getAllCharVoices === "function") {
        setCharVoicesMap({ ...vse.getAllCharVoices() });
      }
      setTip(`✓ 已将「${describeBuiltinVoice(payload)}」绑定给「${targetChar ? targetChar.name : selectedCharId}」，去传讯里直接点朗读即可生效！`);
    };

    const handleUnbindChar = async (cid, cname) => {
      if (!vse || typeof vse.saveCharVoice !== "function") return;
      await vse.saveCharVoice(cid, { voiceSource: "clone" });
      if (typeof vse.getAllCharVoices === "function") {
        setCharVoicesMap({ ...vse.getAllCharVoices() });
      }
      setTip(`已将「${cname}」切回云端克隆音色模式`);
    };

    const handleLoadCharTuning = (vp, cname) => {
      const m = vp.builtinMode || "animalese";
      const pid = vp.builtinPresetId || "scholar-warm";
      setMode(m);
      setPresetId(pid);
      setWebVoiceURI(vp.builtinWebVoiceURI || "");
      setTuning(vp.builtinTuning ? { ...getPresetTuning(pid), ...vp.builtinTuning } : getPresetTuning(pid));
      setSelectedCharId(String(vp.charId || ""));
      setTip(`已载入「${cname}」的音色参数到调音台，可继续微调后重新绑定`);
    };

    const boundBuiltinChars = Object.values(charVoicesMap || {})
      .filter((vp) => vp && vp.charId && vp.voiceSource === "builtin")
      .map((vp) => {
        const matched = chatChars.find((c) => String(c.id) === String(vp.charId));
        return { vp, name: matched ? matched.name : `角色 #${vp.charId}` };
      });

    const isPlayingPreview = playState.status === "playing" && playState.key === "studio_current_preview";
    const pillBtn = (active) => ({
      padding: "5px 10px",
      borderRadius: "999px",
      border: active ? "1px solid #5E6756" : "1px solid #D8CFC0",
      background: active ? "#5E6756" : "#FAF7F0",
      color: active ? "#FFFFFF" : "#4E4940",
      fontSize: "11px",
      fontWeight: active ? 700 : 500,
      cursor: "pointer"
    });
    const inputStyle = {
      width: "100%",
      padding: "8px 10px",
      borderRadius: "8px",
      border: "1px solid #D8CFC0",
      background: "#FAF8F3",
      fontSize: "12px",
      color: "#383833",
      boxSizing: "border-box"
    };

    return React.createElement(
      "div",
      {
        style: {
          margin: "12px 0",
          padding: "14px",
          borderRadius: "14px",
          border: "1px solid #E3DDD1",
          background: "#FFFFFF",
          color: "#383833",
          fontSize: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }
      },
      // 标题栏
      React.createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" } },
        React.createElement(
          "div",
          null,
          React.createElement("div", { style: { fontWeight: 700, fontSize: "13px" } }, "📻 广陵内置音色工作台（免 API Key · 直通传讯）"),
          React.createElement(
            "div",
            { style: { fontSize: "11px", color: "#7B776D", marginTop: "2px" } },
            `动森拟音 ${catalog.animalese.length} 款 · 本机中文真人 ${catalog.systemVoiceCount} 款 · 复古拟音 1 款`
          )
        ),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              const next = getCatalog();
              setCatalog(next);
              setTip(`已刷新：检测到 ${next.systemVoiceCount} 个本机中文真人声库`);
            },
            style: { ...pillBtn(false), padding: "4px 9px", fontSize: "10.5px" }
          },
          "🔄 刷新声库"
        )
      ),

      // 模式切换：动森 / 系统真人 / 复古拟音
      React.createElement(
        "div",
        { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
        [
          ["animalese", "🐾 动森双核拟音"],
          ["webspeech", `🗣️ 系统真人 (${catalog.systemVoiceCount})`],
          ["blip", "🎛️ 复古电子拟音"]
        ].map(([id, label]) =>
          React.createElement(
            "button",
            { key: id, type: "button", onClick: () => setMode(id), style: pillBtn(mode === id) },
            label
          )
        )
      ),

      // 动森预设选择
      mode === "animalese" &&
        React.createElement(
          "div",
          { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
          catalog.animalese.map((item) =>
            React.createElement(
              "button",
              {
                key: item.presetId,
                type: "button",
                onClick: () => handlePickPreset(item.presetId),
                title: item.desc,
                style: {
                  padding: "5px 10px",
                  borderRadius: "10px",
                  border: presetId === item.presetId ? "1.5px solid #5E6756" : "1px solid #E2DACB",
                  background: presetId === item.presetId ? "#EEF4EC" : "#FDFBF7",
                  color: presetId === item.presetId ? "#35533A" : "#575247",
                  fontSize: "11px",
                  fontWeight: presetId === item.presetId ? 700 : 500,
                  cursor: "pointer"
                }
              },
              item.name
            )
          )
        ),

      // 系统真人声库下拉
      mode === "webspeech" &&
        React.createElement(
          "select",
          {
            value: webVoiceURI,
            onChange: (e) => setWebVoiceURI(e.target.value),
            style: inputStyle
          },
          catalog.webspeech.map((item) =>
            React.createElement("option", { key: item.key, value: item.webSpeechVoiceURI }, `${item.name}（${item.desc}）`)
          )
        ),

      // 广陵联播同款精调滑块
      renderTuningSliders(React, mode, tuning, handleUpdateTuning),

      // 试听台词 + 试听/设为默认按钮
      React.createElement("input", {
        type: "text",
        value: sampleText,
        onChange: (e) => setSampleText(e.target.value),
        placeholder: DEFAULT_PREVIEW_TEXT,
        style: inputStyle
      }),
      React.createElement(
        "div",
        { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: handleTestCurrent,
            style: {
              padding: "6px 14px",
              borderRadius: "999px",
              border: "none",
              background: isPlayingPreview ? "#B54534" : "#5E6756",
              color: "#FFFFFF",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer"
            }
          },
          isPlayingPreview ? "⏹ 停止试听" : "▶ 试听当前调校"
        ),
        React.createElement(
          "button",
          { type: "button", onClick: handleSaveAsDefault, style: pillBtn(false) },
          "⭐ 设为全局默认内置音色"
        )
      ),

      // 一键绑定到传讯角色（直接复用！）
      React.createElement(
        "div",
        {
          style: {
            padding: "10px",
            borderRadius: "10px",
            background: "#F7F4EC",
            border: "1px solid #E5DEC9",
            display: "flex",
            flexDirection: "column",
            gap: "8px"
          }
        },
        React.createElement("div", { style: { fontWeight: 700, fontSize: "12px", color: "#433C31" } }, "🔗 绑定当前音色给传讯名士（传讯内直接复用）"),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "6px", alignItems: "center" } },
          React.createElement(
            "select",
            {
              value: selectedCharId,
              onChange: (e) => setSelectedCharId(e.target.value),
              style: { ...inputStyle, flex: 1 }
            },
            chatChars.length === 0
              ? React.createElement("option", { value: "" }, "暂无传讯角色（请先在传讯中添加名士）")
              : chatChars.map((c) =>
                  React.createElement("option", { key: c.id, value: String(c.id) }, c.name)
                )
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: handleBindToSelectedChar,
              disabled: chatChars.length === 0,
              style: {
                padding: "7px 12px",
                borderRadius: "8px",
                border: "none",
                background: chatChars.length === 0 ? "#C9C4B8" : "#7D5A38",
                color: "#FFFFFF",
                fontSize: "11.5px",
                fontWeight: 700,
                cursor: chatChars.length === 0 ? "not-allowed" : "pointer",
                flexShrink: 0
              }
            },
            "绑定给 TA"
          )
        ),
        boundBuiltinChars.length > 0 &&
          React.createElement(
            "div",
            { style: { display: "grid", gap: "5px", marginTop: "2px" } },
            React.createElement("div", { style: { fontSize: "11px", color: "#7B776D" } }, `已绑定内置音色的名士 (${boundBuiltinChars.length})：`),
            boundBuiltinChars.map(({ vp, name }) => {
              const rowKey = `studio_bound_${vp.charId}`;
              const isRowPlaying = playState.status === "playing" && playState.key === rowKey;
              return React.createElement(
                "div",
                {
                  key: vp.charId,
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background: "#FFFFFF",
                    border: "1px solid #E8E1D2"
                  }
                },
                React.createElement(
                  "div",
                  { style: { minWidth: 0, flex: 1 } },
                  React.createElement("span", { style: { fontWeight: 700, fontSize: "11.5px", marginRight: "6px" } }, name),
                  React.createElement("span", { style: { fontSize: "10.5px", color: "#6A685F" } }, describeBuiltinVoice(vp))
                ),
                React.createElement(
                  "div",
                  { style: { display: "flex", gap: "4px", flexShrink: 0 } },
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => speakText((sampleText || "").trim() || DEFAULT_PREVIEW_TEXT, { ...vp, key: rowKey }).catch(() => {}),
                      style: { ...pillBtn(isRowPlaying), padding: "3px 7px", fontSize: "10.5px" }
                    },
                    isRowPlaying ? "⏹" : "▶"
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => handleLoadCharTuning(vp, name),
                      style: { ...pillBtn(false), padding: "3px 7px", fontSize: "10.5px" }
                    },
                    "调参"
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => handleUnbindChar(vp.charId, name),
                      style: { padding: "3px 7px", borderRadius: "999px", border: "1px solid #E6D4D0", background: "#FDF5F3", color: "#B54534", fontSize: "10.5px", cursor: "pointer" }
                    },
                    "解绑"
                  )
                )
              );
            })
          )
      ),

      // 全局未配克隆回退开关
      React.createElement(
        "label",
        {
          style: {
            display: "flex",
            alignItems: "flex-start",
            gap: "7px",
            padding: "8px 10px",
            borderRadius: "10px",
            background: "#FAF7F0",
            border: "1px solid #ECE5D8",
            cursor: "pointer",
            lineHeight: 1.45
          }
        },
        React.createElement("input", {
          type: "checkbox",
          checked: Boolean(cfg.builtinFallbackEnabled),
          onChange: (e) => saveCfgPatch({ builtinFallbackEnabled: e.target.checked }),
          style: { marginTop: "2px" }
        }),
        React.createElement(
          "span",
          { style: { fontSize: "11px", color: "#4D483E" } },
          "未单独绑定音色的传讯名士，自动回退使用「全局默认内置音色」（一键让全员免 Key 开口）"
        )
      ),

      tip && React.createElement("div", { style: { fontSize: "11px", color: "#5E6756", fontWeight: 600 } }, tip)
    );
  }

  // ==========================================
  // 6. 传讯 → 私聊 → 对话偏好设置：角色内置音色控件
  // ==========================================
  function CharacterBuiltinVoiceControls({ charId, charName, vp, onUpdateVp }) {
    const React = global.React;
    if (!React) return null;
    const { useState, useEffect } = React;

    const [catalog, setCatalog] = useState(() => getCatalog());
    const [testLine, setTestLine] = useState(`殿下，${charName || "我"}的内置音色已经调校妥当，听起来可还合意？`);
    const [playState, setPlayState] = useState(_playState);
    const [status, setStatus] = useState("");

    const mode = (vp && vp.builtinMode) || "animalese";
    const presetId = (vp && vp.builtinPresetId) || "scholar-warm";
    const webVoiceURI = (vp && vp.builtinWebVoiceURI) || "";
    const tuning = (vp && vp.builtinTuning) || getPresetTuning(presetId);

    useEffect(() => {
      const refresh = () => setCatalog(getCatalog());
      const onPlay = (e) => setPlayState(e.detail || _playState);
      global.addEventListener && global.addEventListener("milvus-builtin-voice-state", onPlay);
      if (typeof global.speechSynthesis !== "undefined" && typeof global.speechSynthesis.addEventListener === "function") {
        global.speechSynthesis.addEventListener("voiceschanged", refresh);
      }
      const t = setTimeout(refresh, 400);
      return () => {
        clearTimeout(t);
        global.removeEventListener && global.removeEventListener("milvus-builtin-voice-state", onPlay);
        if (typeof global.speechSynthesis !== "undefined" && typeof global.speechSynthesis.removeEventListener === "function") {
          global.speechSynthesis.removeEventListener("voiceschanged", refresh);
        }
      };
    }, []);

    const previewKey = `char_builtin_preview_${charId}`;
    const isPlaying = playState.status === "playing" && playState.key === previewKey;

    const handleTest = () => {
      setStatus("");
      speakText((testLine || "").trim() || DEFAULT_PREVIEW_TEXT, {
        key: previewKey,
        builtinMode: mode,
        builtinPresetId: presetId,
        builtinWebVoiceURI: webVoiceURI,
        builtinTuning: tuning
      }, {
        onStart: ({ label }) => setStatus(`正在播放：${label}`),
        onEnd: () => setStatus("试听结束 ✓"),
        onError: (e) => setStatus((e && e.message) || "试听失败")
      }).catch((e) => setStatus((e && e.message) || "试听失败"));
    };

    const pillBtn = (active) => ({
      padding: "4px 9px",
      borderRadius: "999px",
      border: active ? "1px solid #5E6756" : "1px solid #D8CFC0",
      background: active ? "#5E6756" : "#FAF7F0",
      color: active ? "#FFFFFF" : "#4E4940",
      fontSize: "11px",
      fontWeight: active ? 700 : 500,
      cursor: "pointer"
    });
    const inputStyle = {
      width: "100%",
      padding: "7px 9px",
      borderRadius: "8px",
      border: "1px solid #D8CFC0",
      background: "#FAF8F3",
      fontSize: "11.5px",
      color: "#433C31",
      boxSizing: "border-box"
    };

    return React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "6px" } },
      // 声源模式
      React.createElement(
        "div",
        { style: { display: "flex", gap: "5px", flexWrap: "wrap" } },
        [
          ["animalese", "🐾 动森拟音"],
          ["webspeech", "🗣️ 系统真人"],
          ["blip", "🎛️ 复古拟音"]
        ].map(([id, label]) =>
          React.createElement(
            "button",
            {
              key: id,
              type: "button",
              onClick: () => onUpdateVp({ builtinMode: id }),
              style: pillBtn(mode === id)
            },
            label
          )
        )
      ),

      // 具体音色选择
      mode === "animalese" &&
        React.createElement(
          "select",
          {
            value: presetId,
            onChange: (e) => {
              const pid = e.target.value;
              onUpdateVp({ builtinPresetId: pid, builtinTuning: getPresetTuning(pid) });
            },
            style: inputStyle
          },
          catalog.animalese.map((item) =>
            React.createElement("option", { key: item.presetId, value: item.presetId }, `${item.name} — ${item.desc}`)
          )
        ),

      mode === "webspeech" &&
        React.createElement(
          "select",
          {
            value: webVoiceURI,
            onChange: (e) => onUpdateVp({ builtinWebVoiceURI: e.target.value }),
            style: inputStyle
          },
          catalog.webspeech.map((item) =>
            React.createElement("option", { key: item.key, value: item.webSpeechVoiceURI }, item.name)
          )
        ),

      // 精调滑块（直接与设置页同步互通）
      renderTuningSliders(React, mode, tuning, (patch) => {
        onUpdateVp({ builtinTuning: { ...tuning, ...patch } });
      }),

      // 自定义测试台词 + 试听测试按钮
      React.createElement("input", {
        type: "text",
        value: testLine,
        onChange: (e) => setTestLine(e.target.value),
        placeholder: "输入测试台词试听效果…",
        style: inputStyle
      }),
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" } },
        React.createElement(
          "label",
          { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", cursor: "pointer" } },
          React.createElement("input", {
            type: "checkbox",
            checked: Boolean(vp && vp.autoPlay),
            onChange: (e) => onUpdateVp({ autoPlay: e.target.checked })
          }),
          "收到消息自动播"
        ),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: handleTest,
            style: {
              padding: "5px 12px",
              borderRadius: "999px",
              border: "none",
              background: isPlaying ? "#B54534" : "#5E6756",
              color: "#FFFFFF",
              fontSize: "11.5px",
              fontWeight: 700,
              cursor: "pointer"
            }
          },
          isPlaying ? "⏹ 停止试听" : "🔊 试听测试"
        )
      ),
      status && React.createElement("div", { style: { fontSize: "11px", color: "#5E6756" } }, status)
    );
  }

  const api = {
    DEFAULT_PREVIEW_TEXT,
    extractVoiceBlock,
    sanitizeTextForBuiltin,
    splitIntoSpeechChunks,
    getAnimalesePresets,
    getPresetTuning,
    listChineseSystemVoices,
    loadChatSoloCharacters,
    getCatalog,
    describeBuiltinVoice,
    getDedicatedController,
    buildControllerConfig,
    speakText,
    stop,
    getPlayState: () => ({ ..._playState }),
    BuiltinVoiceStudioPanel,
    CharacterBuiltinVoiceControls
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.BuiltinVoiceBridge = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
