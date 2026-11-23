/**
 * Ano-phone「灵犀推演 · 思维链（Thinking Chain）」独立模块化引擎
 * - 独立 IndexedDB: milvus_thinking_chain_idb (零 localStorage 占用)
 * - 双模兼容：原生捕获 reasoning_content / reasoning / <think> + 普通模型推演兜底
 * - 暂存队列一次消费绑定：零破坏 callAPI 纯字符串返回、多气泡拆发仅挂首条
 * - 外语思维链保守启发式检测 + 译文缓存与一键切换
 * - 3 套原创视觉皮肤：极简云灰（DeepSeek 风格）/ 青黛宣纸 / 玄墨暗夜
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_thinking_chain_idb";
  const DB_VERSION = 1;
  const STORE_CONFIGS = "char_configs";
  const STORE_RECORDS = "thinking_records";
  const CHANGE_EVENT = "milvus-thinking-chain-changed";
  const RECORD_EVENT = "milvus-thinking-record-updated";

  const DEFAULT_CHAR_CONFIG = {
    enabled: false,
    promptFallback: true,
    autoTranslateForeign: false,
    defaultExpanded: false,
    cardStyle: "deepseek", // "deepseek" | "celadon" | "ink"
    lengthPreset: "rich", // "short" | "rich" | "deep"
    customPrompt: ""
  };

  const LENGTH_PRESETS = [
    { id: "short", label: "精炼", range: "120~220 字" },
    { id: "rich", label: "丰满碎碎念（推荐）", range: "220~480 字" },
    { id: "deep", label: "深度长独白", range: "400~700 字" }
  ];

  const CARD_STYLES = [
    { id: "deepseek", label: "极简云灰", desc: "经典大模型折叠条" },
    { id: "celadon", label: "青黛宣纸", desc: "温润手账纸墨风" },
    { id: "ink", label: "玄墨暗夜", desc: "适合深色壁纸" }
  ];

  // ==========================================
  // 1. 存储层（IndexedDB + 内存同步缓存，零 localStorage）
  // ==========================================
  let _dbPromise = null;
  let _memConfigs = new Map();
  let _memRecords = new Map();
  const _cfgSyncCache = new Map();
  const _recSyncCache = new Map();
  const _pendingByChar = new Map(); // charId -> { source, sourceType, durationMs, createdAt }
  const _inflightTranslate = new Map();

  function hasIndexedDB() {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  }

  function openDb() {
    if (!hasIndexedDB()) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_CONFIGS)) {
            db.createObjectStore(STORE_CONFIGS, { keyPath: "charId" });
          }
          if (!db.objectStoreNames.contains(STORE_RECORDS)) {
            const st = db.createObjectStore(STORE_RECORDS, { keyPath: "recordKey" });
            st.createIndex("by_char", "charId", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return _dbPromise;
  }

  async function idbGet(storeName, key) {
    const db = await openDb();
    if (!db) {
      return storeName === STORE_CONFIGS ? _memConfigs.get(key) || null : _memRecords.get(key) || null;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function idbPut(storeName, record) {
    const db = await openDb();
    if (!db) {
      if (storeName === STORE_CONFIGS) _memConfigs.set(record.charId, record);
      else _memRecords.set(record.recordKey, record);
      return record;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => resolve(record);
      } catch (e) {
        resolve(record);
      }
    });
  }

  function dispatchEvt(name, detail) {
    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent(name, { detail }));
      }
    } catch (e) {}
  }

  function getCharConfigSync(charId) {
    const cid = String(charId || "");
    if (!cid) return { ...DEFAULT_CHAR_CONFIG, charId: "" };
    const cached = _cfgSyncCache.get(cid);
    return cached ? { ...DEFAULT_CHAR_CONFIG, ...cached, charId: cid } : { ...DEFAULT_CHAR_CONFIG, charId: cid };
  }

  async function hydrateCharConfig(charId) {
    const cid = String(charId || "");
    if (!cid) return { ...DEFAULT_CHAR_CONFIG, charId: "" };
    const rec = await idbGet(STORE_CONFIGS, cid);
    const merged = { ...DEFAULT_CHAR_CONFIG, ...(rec || {}), charId: cid };
    _cfgSyncCache.set(cid, merged);
    return merged;
  }

  async function saveCharConfig(charId, patch) {
    const cid = String(charId || "");
    if (!cid) return { ...DEFAULT_CHAR_CONFIG, charId: "" };
    const cur = await hydrateCharConfig(cid);
    const validStyle = ["deepseek", "celadon", "ink"].includes(patch?.cardStyle) ? patch.cardStyle : cur.cardStyle;
    const validLen = ["short", "rich", "deep"].includes(patch?.lengthPreset) ? patch.lengthPreset : cur.lengthPreset;
    const next = {
      ...cur,
      ...(patch || {}),
      charId: cid,
      cardStyle: validStyle || "deepseek",
      lengthPreset: validLen || "rich",
      customPrompt:
        patch && patch.customPrompt !== undefined
          ? String(patch.customPrompt || "").slice(0, 600)
          : cur.customPrompt || "",
      updatedAt: Date.now()
    };
    _cfgSyncCache.set(cid, next);
    await idbPut(STORE_CONFIGS, next);
    dispatchEvt(CHANGE_EVENT, { charId: cid });
    return next;
  }

  function _resetForTests() {
    _memConfigs = new Map();
    _memRecords = new Map();
    _cfgSyncCache.clear();
    _recSyncCache.clear();
    _pendingByChar.clear();
    _inflightTranslate.clear();
  }

  // ==========================================
  // 2. 思维链捕获（原生推理字段 + <think> 标签）与暂存绑定
  // ==========================================
  function computeFingerprint(text) {
    const s = String(text || "");
    let hash = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `v1:${s.length}:${hash.toString(16)}`;
  }

  function extractThinkingFromResponse(apiData, rawContent) {
    const msg = apiData && apiData.choices && apiData.choices[0] && apiData.choices[0].message;
    const nativeRaw =
      (msg && (msg.reasoning_content || msg.reasoning || msg.thinking)) ||
      (apiData && apiData.reasoning_content) ||
      "";
    const nativeStr = typeof nativeRaw === "string" ? nativeRaw.trim() : "";

    let contentStr = typeof rawContent === "string" ? rawContent : (msg && typeof msg.content === "string" ? msg.content : "");
    const tagParts = [];

    // 提取所有闭合的 <think>...</think>
    const closedRe = /<think>([\s\S]*?)<\/think>/gi;
    let m;
    while ((m = closedRe.exec(contentStr)) !== null) {
      const inner = String(m[1] || "").trim();
      if (inner) tagParts.push(inner);
    }
    let cleanContent = contentStr.replace(closedRe, "").trim();

    // 容错：若存在未闭合的 <think> 且后面有明显换行正文，仅在存在其他正文时截断，避免清空整条消息
    if (!cleanContent && /<think>/i.test(contentStr)) {
      cleanContent = contentStr.replace(/<\/?think>/gi, "").trim();
    } else if (/<think>/i.test(cleanContent)) {
      const idx = cleanContent.search(/<think>/i);
      const before = cleanContent.slice(0, idx).trim();
      const after = cleanContent.slice(idx).replace(/<\/?think>/gi, "").trim();
      if (before) {
        if (after) tagParts.push(after);
        cleanContent = before;
      } else {
        cleanContent = after;
      }
    }

    const thinking = [nativeStr, ...tagParts].filter(Boolean).join("\n\n").trim();
    const sourceType = nativeStr ? "native_reasoning" : tagParts.length > 0 ? "think_tag" : "none";

    return { thinking, cleanContent, sourceType };
  }

  function stagePending(charId, payload) {
    const cid = String(charId || "");
    if (!cid || !payload || !String(payload.source || "").trim()) return false;
    _pendingByChar.set(cid, {
      source: String(payload.source).trim(),
      sourceType: payload.sourceType || "think_tag",
      durationMs: Math.max(0, Number(payload.durationMs) || 0),
      createdAt: Date.now()
    });
    return true;
  }

  /**
   * 在 callAPI 收到响应后调用：自动剥离 <think> 返回干净正文，并在该角色开启思维链时暂存等待首条气泡消费
   */
  function captureFromApiResponse(charId, apiData, rawContent, durationMs = 0) {
    const { thinking, cleanContent, sourceType } = extractThinkingFromResponse(apiData, rawContent);
    const cid = String(charId || "");
    if (cid && thinking) {
      const cfg = getCharConfigSync(cid);
      if (cfg.enabled) {
        stagePending(cid, { source: thinking, sourceType, durationMs });
      }
    }
    return cleanContent;
  }

  function makeRecordKey(charId, msgId) {
    return `${String(charId || "")}::${String(msgId || "")}`;
  }

  /**
   * 一次消费语义：只绑定到本轮第一条 AI 气泡，后续同轮拆出的气泡不再重复展示
   */
  async function bindLatestPending(charId, msgId) {
    const cid = String(charId || "");
    const mid = String(msgId || "");
    if (!cid || !mid) return null;
    const pending = _pendingByChar.get(cid);
    if (!pending) return null;
    // 超过 2 分钟的陈旧暂存丢弃
    if (Date.now() - pending.createdAt > 120000) {
      _pendingByChar.delete(cid);
      return null;
    }
    _pendingByChar.delete(cid);

    const recordKey = makeRecordKey(cid, mid);
    const rec = {
      recordKey,
      charId: cid,
      msgId: mid,
      source: pending.source,
      sourceType: pending.sourceType,
      durationMs: pending.durationMs,
      fingerprint: computeFingerprint(pending.source),
      translated: "",
      createdAt: Date.now()
    };
    _recSyncCache.set(recordKey, rec);
    await idbPut(STORE_RECORDS, rec);
    dispatchEvt(RECORD_EVENT, { charId: cid, msgId: mid });

    // 若开启了自动翻译外语思维链，后台静默触发
    const cfg = getCharConfigSync(cid);
    if (cfg.autoTranslateForeign && shouldTranslateThinking(rec.source)) {
      translateThinkingRecord(cid, mid).catch(() => {});
    }
    return rec;
  }

  async function getThinkingRecord(charId, msgId) {
    const key = makeRecordKey(charId, msgId);
    if (_recSyncCache.has(key)) return _recSyncCache.get(key);
    const rec = await idbGet(STORE_RECORDS, key);
    if (rec) _recSyncCache.set(key, rec);
    return rec || null;
  }

  // ==========================================
  // 3. System Prompt 构造（通用模型推演兜底 + 追加提示词）
  // ==========================================
  function buildThinkingSystemPrompt(charId, overrideCfg = null) {
    const cfg = overrideCfg || getCharConfigSync(charId);
    if (!cfg || !cfg.enabled) return "";

    const lenMeta = LENGTH_PRESETS.find((x) => x.id === cfg.lengthPreset) || LENGTH_PRESETS[1];
    const extra = String(cfg.customPrompt || "").trim();
    const extraLine = extra ? `\n- 额外风味要求：${extra}` : "";

    const humanInnerStyle = `【内心碎碎念写法（核心要求）】
- 100% 沉浸在角色本人的第一人称「我」里，像一个真实活人在心里偷偷转念头、碎碎念，仿佛绝不会被人听见；
- 写出细腻真实的心理流转：看到对方这句话瞬间的真实第一反应（怔一下、心口发软、暗自发笑、莫名吃味或警觉）→ 顺着念头联想到过往的小细节、对方平时的脾气或此刻身边的环境感官 → 在心里反复斟酌措辞、自我打断或口是心非地自我否决（比如“算了，这么说显得太在意了……”“啧，要是直接问，肯定又要被笑话……”）→ 最终决定怎么说出口；
- 篇幅请写得充实自然（约 ${lenMeta.range}），多用口语停顿、省略号、反问和真实情绪起伏，有生活气息；
- 【绝对禁区】严禁使用 1. 2. 3. 提纲分点，严禁出现“首先/其次/分析用户意图/根据人设/保持口吻/作为角色”等任何生硬的 AI 分析腔或旁观者视角！${extraLine}`;

    if (!cfg.promptFallback) {
      return `\n\n### 🧠 内部思考风格要求\n当你在内部推理思考时，请不要写机械的任务分析，而是直接用角色本人的内心碎碎念展开：\n${humanInnerStyle}`;
    }

    return `\n\n### 🧠 灵犀推演 · 角色私密内心思维链
请你在正式回复前，先在 <think>...</think> 标签内写一段角色本人的私密内心碎碎念，然后再在 </think> 之后输出正式聊天气泡内容。
${humanInnerStyle}
- 必须严格闭合 </think>，正式要发给对方的台词写在 </think> 之外，不要把正式回复写进 <think> 里。`;
  }

  // ==========================================
  // 4. 外语思维链启发式检测与译文缓存
  // ==========================================
  function shouldTranslateThinking(source) {
    const prose = String(source || "").replace(/```[\s\S]*?```|`[^`]*`|https?:\/\/\S+/g, " ");
    const han = (prose.match(/[\u3400-\u9fff]/g) || []).length;
    const latin = (prose.match(/[a-zA-Z]/g) || []).length;
    const kana = (prose.match(/[\u3040-\u30ff]/g) || []).length;
    const hangul = (prose.match(/[\uac00-\ud7af]/g) || []).length;
    if (kana >= 8 && kana >= han) return true;
    if (hangul >= 8 && hangul > han) return true;
    if (han >= 8 && han * 2 >= latin + kana + hangul) return false;
    return latin >= 24 && latin > han * 3;
  }

  async function callTranslateApi(messages, opts = {}) {
    if (typeof opts.customChatFn === "function") {
      return opts.customChatFn(messages, opts);
    }
    const cme = global.CompanionMemoryEngine;
    if (cme && typeof cme.callPickerLlmText === "function") {
      try {
        const res = await cme.callPickerLlmText(messages, { temperature: 0.2, max_tokens: 2000 });
        if (res) return res;
      } catch (e) {}
    }
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
    if (!cfg || !cfg.url) throw new Error("未检测到可用的 API 配置");
    const baseUrl = String(cfg.url).trim().replace(/\/+$/, "");
    const endpoint = /\/chat\/completions$/i.test(baseUrl)
      ? baseUrl
      : cfg.type === "official"
      ? (/\/v1$/i.test(baseUrl) ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`)
      : (/\/v1$/i.test(baseUrl) ? `${baseUrl}/chat/completions` : `${baseUrl}/api/chat/completions`);
    const headers = { "Content-Type": "application/json" };
    if (cfg.key || cfg.apiKey) headers.Authorization = `Bearer ${cfg.key || cfg.apiKey}`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.model || "gpt-4o-mini",
        messages,
        temperature: 0.2,
        max_tokens: 2000
      })
    });
    if (!resp.ok) throw new Error(`思维链翻译请求失败 (${resp.status})`);
    const json = await resp.json();
    return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
  }

  async function translateThinkingRecord(charId, msgId, opts = {}) {
    const cid = String(charId || "");
    const mid = String(msgId || "");
    const key = makeRecordKey(cid, mid);
    const rec = await getThinkingRecord(cid, mid);
    if (!rec || !rec.source) throw new Error("未找到可翻译的思维链记录");
    if (rec.translated && !opts.force) {
      return { ...rec, fromCache: true };
    }
    if (_inflightTranslate.has(key)) {
      return _inflightTranslate.get(key);
    }

    const task = (async () => {
      const sys =
        "请将下面这段角色的内部思考过程忠实译成自然流畅的中文。保留原本的人称、情绪强弱、停顿与内心碎碎念，不要总结删减，不要写成分析报告，只输出译文本身。";
      const reply = await callTranslateApi(
        [
          { role: "system", content: sys },
          { role: "user", content: rec.source.slice(0, 12000) }
        ],
        opts
      );
      const translated = String(reply || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();
      if (!translated) throw new Error("思维链译文为空");

      const updated = { ...rec, translated, translatedAt: Date.now() };
      _recSyncCache.set(key, updated);
      await idbPut(STORE_RECORDS, updated);
      dispatchEvt(RECORD_EVENT, { charId: cid, msgId: mid });
      return { ...updated, fromCache: false };
    })();

    _inflightTranslate.set(key, task);
    try {
      return await task;
    } finally {
      _inflightTranslate.delete(key);
    }
  }

  // ==========================================
  // 5. 原创样式注入 & React 组件
  // ==========================================
  function ensureStylesInjected() {
    if (typeof document === "undefined") return;
    if (document.getElementById("tce-thinking-styles")) return;
    const style = document.createElement("style");
    style.id = "tce-thinking-styles";
    style.textContent = `
      .tce-wrap { margin-bottom: 6px; max-width: 100%; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
      .tce-toggle {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
        cursor: pointer; border: 1px solid transparent; transition: all 0.16s ease;
        user-select: none; max-width: 100%;
      }
      .tce-body {
        margin-top: 6px; padding: 9px 12px; border-radius: 11px;
        font-size: 12px; line-height: 1.64; white-space: pre-wrap; word-break: break-word;
        border-left: 2.5px solid;
      }
      .tce-toolbar {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        margin-bottom: 6px; font-size: 10.5px; opacity: 0.78;
      }
      .tce-mini-btn {
        border: 1px solid currentColor; background: transparent; color: inherit;
        border-radius: 999px; padding: 1px 8px; font-size: 10.5px; cursor: pointer; opacity: 0.85;
      }
      .tce-mini-btn:hover { opacity: 1; }

      /* 皮肤 1：极简云灰（DeepSeek 经典推演质感） */
      .tce-style-deepseek .tce-toggle { background: rgba(241, 245, 249, 0.92); color: #475569; border-color: rgba(148, 163, 184, 0.35); }
      .tce-style-deepseek .tce-toggle:hover { background: #E2E8F0; }
      .tce-style-deepseek .tce-body { background: rgba(248, 250, 252, 0.94); color: #475569; border-left-color: #94A3B8; }

      /* 皮肤 2：青黛宣纸（Ano-phone 专属手账纸墨风） */
      .tce-style-celadon .tce-toggle { background: rgba(250, 247, 240, 0.95); color: #4C5646; border-color: rgba(94, 103, 86, 0.28); }
      .tce-style-celadon .tce-toggle:hover { background: #F1ECE0; }
      .tce-style-celadon .tce-body { background: rgba(252, 249, 243, 0.96); color: #4B4A44; border-left-color: #5E6756; }

      /* 皮肤 3：玄墨暗夜 */
      .tce-style-ink .tce-toggle { background: rgba(28, 32, 38, 0.88); color: #CBD5E1; border-color: rgba(148, 163, 184, 0.28); }
      .tce-style-ink .tce-toggle:hover { background: rgba(38, 44, 54, 0.95); }
      .tce-style-ink .tce-body { background: rgba(24, 27, 32, 0.9); color: #CBD5E1; border-left-color: #64748B; }

      .tce-pill {
        border: 1px solid #D9D4C8; background: #FAF8F3; color: #3A352F;
        border-radius: 999px; padding: 4px 10px; font-size: 11.5px; cursor: pointer;
      }
      .tce-pill.active { background: #475569; color: #FFFFFF; border-color: #475569; font-weight: 600; }
    `;
    document.head.appendChild(style);
  }

  /**
   * 进阶设置配置卡：自动归类至「传讯 → 对话偏好设置 → 进阶设置」
   */
  function ThinkingChainSettingsCard({ chatData, isGroup }) {
    if (isGroup || !chatData?.id || typeof React === "undefined") return null;
    ensureStylesInjected();
    const h = React.createElement;
    const { useState, useEffect } = React;
    const charId = String(chatData.id);
    const [cfg, setCfg] = useState(() => getCharConfigSync(charId));
    const [showTips, setShowTips] = useState(false);

    useEffect(() => {
      let alive = true;
      hydrateCharConfig(charId).then((c) => alive && setCfg(c));
      const onChange = (ev) => {
        if (!ev?.detail?.charId || ev.detail.charId === charId) {
          setCfg(getCharConfigSync(charId));
        }
      };
      global.addEventListener(CHANGE_EVENT, onChange);
      return () => {
        alive = false;
        global.removeEventListener(CHANGE_EVENT, onChange);
      };
    }, [charId]);

    const update = (patch) => {
      setCfg((prev) => ({ ...prev, ...patch }));
      saveCharConfig(charId, patch).then((saved) => setCfg(saved));
    };

    return h(
      "div",
      {
        "data-settings-item": "thinking_chain",
        "data-settings-group": "advanced",
        style: {
          background: "#FFFFFF",
          border: "1px solid #E4E6E8",
          borderRadius: "12px",
          padding: "12px",
          marginTop: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }
      },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" } },
        h(
          "div",
          { style: { flex: 1 } },
          h(
            "div",
            { style: { fontSize: "13px", fontWeight: 800, color: "#2D3748", display: "flex", alignItems: "center", gap: "6px" } },
            "🧠 灵犀推演 · 思维链",
            h(
              "button",
              {
                type: "button",
                onClick: () => setShowTips((v) => !v),
                style: {
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: "1px solid #CBD5E1",
                  background: "#F1F5F9",
                  color: "#475569",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center"
                }
              },
              "?"
            )
          ),
          h(
            "div",
            { style: { fontSize: "11px", color: "#718096", marginTop: "2px" } },
            cfg.enabled
              ? `已开启 · ${cfg.promptFallback ? "兼容推理与普通模型" : "仅捕获原生推理字段"} · 折叠条风格`
              : "在名士气泡上方展示可折叠的 DeepSeek 风格深度思考过程"
          )
        ),
        h("input", {
          type: "checkbox",
          checked: Boolean(cfg.enabled),
          onChange: (e) => update({ enabled: e.target.checked }),
          style: { width: "18px", height: "18px", cursor: "pointer" }
        })
      ),

      showTips &&
        h(
          "div",
          {
            style: {
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: "9px",
              padding: "8px 10px",
              fontSize: "11px",
              lineHeight: 1.6,
              color: "#475569"
            }
          },
          "• 推理模型（DeepSeek-R1 / Qwen-QwQ 等）会自动无损捕获原生 reasoning_content。\n",
          "• 普通模型（GPT-4o / DeepSeek-V3 等）勾选下方「普通模型也启用角色推演」即可稳定看到折叠思考块。\n",
          "• 思维链独立存于本地 IndexedDB，绝不作为普通聊天记录传回下一轮。"
        ),

      cfg.enabled &&
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "9px", paddingTop: "6px", borderTop: "1px dashed #E2E8F0" } },
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#334155", cursor: "pointer" } },
            h("input", {
              type: "checkbox",
              checked: cfg.promptFallback !== false,
              onChange: (e) => update({ promptFallback: e.target.checked })
            }),
            "普通模型也启用角色第一人称推演（非推理模型也能稳定显示思考条）"
          ),
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#334155", cursor: "pointer" } },
            h("input", {
              type: "checkbox",
              checked: Boolean(cfg.autoTranslateForeign),
              onChange: (e) => update({ autoTranslateForeign: e.target.checked })
            }),
            "检测到英文/日文/韩文思维链时自动译成中文（保留原文可随时切回）"
          ),
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#334155", cursor: "pointer" } },
            h("input", {
              type: "checkbox",
              checked: Boolean(cfg.defaultExpanded),
              onChange: (e) => update({ defaultExpanded: e.target.checked })
            }),
            "默认展开思考过程（取消勾选则默认折叠为一行）"
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
            h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: "#475569" } }, "思考篇幅："),
            LENGTH_PRESETS.map((lp) =>
              h(
                "button",
                {
                  key: lp.id,
                  type: "button",
                  className: `tce-pill ${(cfg.lengthPreset || "rich") === lp.id ? "active" : ""}`,
                  onClick: () => update({ lengthPreset: lp.id })
                },
                lp.label
              )
            )
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
            h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: "#475569" } }, "卡片皮肤："),
            CARD_STYLES.map((st) =>
              h(
                "button",
                {
                  key: st.id,
                  type: "button",
                  className: `tce-pill ${cfg.cardStyle === st.id ? "active" : ""}`,
                  onClick: () => update({ cardStyle: st.id })
                },
                st.label
              )
            )
          ),
          h(
            "div",
            null,
            h("div", { style: { fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" } }, "追加思考风格提示词（可选）"),
            h("textarea", {
              rows: 2,
              placeholder: "例如：用克制嘴硬的语气暗自思忖，多写细节感官与对主公的在意…",
              value: cfg.customPrompt || "",
              onChange: (e) => update({ customPrompt: e.target.value }),
              style: {
                width: "100%",
                boxSizing: "border-box",
                padding: "6px 9px",
                borderRadius: "8px",
                border: "1px solid #CBD5E1",
                fontSize: "11.5px",
                resize: "vertical"
              }
            })
          )
        )
    );
  }

  /**
   * 聊天气泡上方的 DeepSeek 风格折叠思考卡片
   */
  function ThinkingChainCard({ charId, msgId }) {
    if (!charId || !msgId || typeof React === "undefined") return null;
    ensureStylesInjected();
    const h = React.createElement;
    const { useState, useEffect } = React;

    const cid = String(charId);
    const mid = String(msgId);
    const [cfg, setCfg] = useState(() => getCharConfigSync(cid));
    const [rec, setRec] = useState(() => _recSyncCache.get(makeRecordKey(cid, mid)) || null);
    const [expanded, setExpanded] = useState(() => Boolean(cfg.defaultExpanded));
    const [showTrans, setShowTrans] = useState(true);
    const [translating, setTranslating] = useState(false);

    useEffect(() => {
      let alive = true;
      hydrateCharConfig(cid).then((c) => {
        if (!alive) return;
        setCfg(c);
        setExpanded(Boolean(c.defaultExpanded));
      });
      getThinkingRecord(cid, mid).then((r) => alive && r && setRec(r));

      const onCfg = (ev) => {
        if (!ev?.detail?.charId || ev.detail.charId === cid) setCfg(getCharConfigSync(cid));
      };
      const onRec = (ev) => {
        if (ev?.detail?.charId === cid && ev?.detail?.msgId === mid) {
          getThinkingRecord(cid, mid).then((r) => alive && r && setRec(r));
        }
      };
      global.addEventListener(CHANGE_EVENT, onCfg);
      global.addEventListener(RECORD_EVENT, onRec);
      return () => {
        alive = false;
        global.removeEventListener(CHANGE_EVENT, onCfg);
        global.removeEventListener(RECORD_EVENT, onRec);
      };
    }, [cid, mid]);

    if (!rec || !rec.source) return null;

    const secStr = rec.durationMs >= 500 ? `${(rec.durationMs / 1000).toFixed(1)}s · ` : "";
    const charCount = rec.source.length;
    const isForeign = shouldTranslateThinking(rec.source);
    const displayBody = rec.translated && showTrans ? rec.translated : rec.source;

    return h(
      "div",
      {
        className: `tce-wrap tce-style-${cfg.cardStyle || "deepseek"}`,
        onClick: (e) => e.stopPropagation()
      },
      h(
        "button",
        {
          type: "button",
          className: "tce-toggle",
          onClick: () => setExpanded((v) => !v)
        },
        h("span", null, "✦"),
        h("span", null, `已深度推演（${secStr}${charCount} 字）`),
        h("span", { style: { fontSize: "10px", opacity: 0.75 } }, expanded ? "▴" : "▾")
      ),
      expanded &&
        h(
          "div",
          { className: "tce-body" },
          h(
            "div",
            { className: "tce-toolbar" },
            h("span", null, rec.sourceType === "native_reasoning" ? "原生推理链" : "角色心绪推演"),
            h(
              "div",
              { style: { display: "flex", gap: "6px" } },
              rec.translated
                ? h(
                    "button",
                    {
                      type: "button",
                      className: "tce-mini-btn",
                      onClick: () => setShowTrans((v) => !v)
                    },
                    showTrans ? "查看原文" : "查看译文"
                  )
                : isForeign &&
                  h(
                    "button",
                    {
                      type: "button",
                      className: "tce-mini-btn",
                      disabled: translating,
                      onClick: async () => {
                        setTranslating(true);
                        try {
                          const updated = await translateThinkingRecord(cid, mid);
                          setRec(updated);
                          setShowTrans(true);
                        } catch (err) {
                          console.warn("[ThinkingChain] 翻译失败:", err);
                        } finally {
                          setTranslating(false);
                        }
                      }
                    },
                    translating ? "翻译中…" : "🌐 译成中文"
                  ),
              h(
                "button",
                {
                  type: "button",
                  className: "tce-mini-btn",
                  onClick: () => setExpanded(false)
                },
                "收起"
              )
            )
          ),
          displayBody
        )
    );
  }

  const api = {
    DB_NAME,
    CARD_STYLES,
    getCharConfigSync,
    hydrateCharConfig,
    saveCharConfig,
    computeFingerprint,
    extractThinkingFromResponse,
    stagePending,
    captureFromApiResponse,
    bindLatestPending,
    getThinkingRecord,
    buildThinkingSystemPrompt,
    shouldTranslateThinking,
    translateThinkingRecord,
    ThinkingChainSettingsCard,
    ThinkingChainCard,
    _resetForTests
  };

  global.ThinkingChainEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

