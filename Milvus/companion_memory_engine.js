/**
 * Milvus/companion_memory_engine.js
 * 传讯名士「伴侣分层记忆引擎」（1:1 复刻 Ivyy-Ting/companion-memory 核心架构）
 *
 * Architecture & protocols adapted from:
 *   Ivyy-Ting/companion-memory (https://github.com/Ivyy-Ting/companion-memory) — MIT License
 *
 * 四大核心模块：
 * 1. Folio 滚动压缩胶囊（6000 token / 8 轮 / 24 条触发，最近 2 轮永留原话，纯文本防 JSON 截断，相对时间落成具体日期）
 * 2. 分段日总结 + 真向量检索（3h 切段 + <原始对话>防演戏 + 一件事一段 + BAAI/bge-m3 余弦相似度 Top3 ≥0.62，无 Key 自动降级 Bigram）+ read_day 原话证据翻阅
 * 3. 独立小模型挑选门 Recall Gate（过滤近期已展示/归档候选，宽松抠 [2,5] 编号，失败返回 unavailable 宁缺毋滥）
 * 4. Prompt 缓存友好四层排布（固定人设 -> Folio 胶囊 -> 最近原文 -> <volatile_context> -> 当前输入）
 *
 * 持久化：100% 独立零冲突 IndexedDB (`milvus_companion_mem_idb`)，零 localStorage 占用。
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_companion_mem_idb";
  const DB_VER = 1;
  const STORE_CAPSULES = "capsules";
  const STORE_SUMMARIES = "day_summaries";
  const STORE_PREFS = "prefs";
  const PREFS_RECORD_KEY = "global_prefs_v1";

  // 1:1 对齐 companion-memory 参数常量
  const TRIGGER_TOKENS = 6000;
  const ROUND_CAP = 8;
  const MESSAGE_CAP = 24;
  const KEEP_ROUNDS = 2;
  const BATCH_TOKENS = 2400;
  const CAPSULE_BUDGET = 7500;
  const DAY_SEG_GAP_MS = 3 * 3600 * 1000;
  const DAY_SEG_CHARS = 24000;
  const DAY_TOP_K = 3;
  const DAY_MIN_SIM = 0.62;
  const READ_DAY_CAP = 12000;
  const RECALL_MAX_CANDS = 12;
  const RECALL_MAX_ACCEPT = 4;
  const RECALL_BODY_CHARS = 320;
  const RECENT_MEMORY_COOLDOWN_TURNS = 3;
  const COMPRESS_FAIL_COOLDOWN_MS = 5 * 60 * 1000;

  const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];

  const DEFAULT_PREFS = {
    enabled: false,                // 总开关（用户在对话偏好设置中开启）
    autoFolio: true,               // 自动后台 Folio 滚动压缩
    folioTriggerMessages: 24,      // 全局默认：每累积多少条未归档消息记录一次胶囊（可自定义 6~200）
    perChatTriggerMessages: {},    // { [charId]: number } 按单个名士独立设置触发条数
    autoDaySummary: true,          // 跨天自动生成前一日分段总结
    useRecallGate: true,           // 启用独立小模型挑选门
    embedUrl: "https://api.siliconflow.cn/v1/embeddings",
    embedApiKey: "",               // 留空时自动降级为中文 Bigram 余弦检索
    embedModel: "BAAI/bge-m3",
    embedViaWorker: false,         // 若遇 CORS，走已有 Cloudflare Worker 的 /embed 路由
    embedWorkerUrl: "",
    pickerUseCustom: false,        // 是否单独指定便宜小模型做 Recall Gate 挑选者
    pickerBaseUrl: "",
    pickerApiKey: "",
    pickerModel: "",
    perChatEnabled: {}             // { [charId]: boolean } 可按单个名士独立开关
  };

  function clampTriggerMessages(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return MESSAGE_CAP;
    return Math.max(6, Math.min(200, n));
  }

  function getTriggerMessageCount(charId) {
    const p = _prefsCache || DEFAULT_PREFS;
    const cid = String(charId || "");
    if (cid && p.perChatTriggerMessages && Number(p.perChatTriggerMessages[cid]) > 0) {
      return clampTriggerMessages(p.perChatTriggerMessages[cid]);
    }
    return clampTriggerMessages(p.folioTriggerMessages || MESSAGE_CAP);
  }

  // ==========================================
  // 1. 独立 IndexedDB 存储层（含 Node.js 内存兜底便于单测）
  // ==========================================
  let _dbPromise = null;
  let _prefsCache = { ...DEFAULT_PREFS, perChatEnabled: {} };
  let _memFallback = { capsules: [], day_summaries: [], prefs: {} };
  let _recentShownByChar = {}; // { [charId]: Map<memId, lastTurn> }
  let _turnCounterByChar = {}; // { [charId]: number }
  let _compressCooldownByChar = {}; // { [charId]: untilTs }
  let _compressRunningByChar = {};
  let _lastHydratePromise = null;

  function hasIDB() {
    return typeof indexedDB !== "undefined";
  }

  function openMemDB() {
    if (!hasIDB()) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_CAPSULES)) {
            const s1 = db.createObjectStore(STORE_CAPSULES, { keyPath: "id" });
            s1.createIndex("by_char", "charId", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_SUMMARIES)) {
            const s2 = db.createObjectStore(STORE_SUMMARIES, { keyPath: "id" });
            s2.createIndex("by_char", "charId", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_PREFS)) {
            db.createObjectStore(STORE_PREFS, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          _dbPromise = null;
          resolve(null);
        };
      } catch (e) {
        _dbPromise = null;
        resolve(null);
      }
    });
    return _dbPromise;
  }

  async function dbGetAllByChar(storeName, charId) {
    const cid = String(charId || "");
    const db = await openMemDB();
    if (!db) {
      return (_memFallback[storeName] || []).filter((x) => String(x.charId) === cid);
    }
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readonly");
        const idx = tx.objectStore(storeName).index("by_char");
        const req = idx.getAll(cid);
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function dbPut(storeName, record) {
    const db = await openMemDB();
    if (!db) {
      const list = _memFallback[storeName] || [];
      const keyField = storeName === STORE_PREFS ? "key" : "id";
      const i = list.findIndex((x) => x[keyField] === record[keyField]);
      if (i >= 0) list[i] = record;
      else list.push(record);
      _memFallback[storeName] = list;
      return true;
    }
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readwrite");
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function dbDelete(storeName, id) {
    const db = await openMemDB();
    if (!db) {
      _memFallback[storeName] = (_memFallback[storeName] || []).filter((x) => x.id !== id);
      return true;
    }
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readwrite");
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function hydratePrefs(force = false) {
    if (_lastHydratePromise && !force) return _lastHydratePromise;
    _lastHydratePromise = (async () => {
      const db = await openMemDB();
      if (db) {
        const rec = await new Promise((resolve) => {
          try {
            const tx = db.transaction([STORE_PREFS], "readonly");
            const req = tx.objectStore(STORE_PREFS).get(PREFS_RECORD_KEY);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
        if (rec && typeof rec === "object") {
          _prefsCache = {
            ...DEFAULT_PREFS,
            ...rec,
            perChatEnabled: { ...(rec.perChatEnabled || {}) },
            perChatTriggerMessages: { ...(rec.perChatTriggerMessages || {}) }
          };
        }
      }
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-companion-mem-changed", { detail: _prefsCache }));
      }
      return _prefsCache;
    })();
    return _lastHydratePromise;
  }

  if (typeof window !== "undefined") {
    hydratePrefs(true);
  }

  function getPrefs() {
    return {
      ...DEFAULT_PREFS,
      ..._prefsCache,
      perChatEnabled: { ...(_prefsCache.perChatEnabled || {}) },
      perChatTriggerMessages: { ...(_prefsCache.perChatTriggerMessages || {}) }
    };
  }

  function savePrefs(patch) {
    const cur = getPrefs();
    const next = {
      ...cur,
      ...(patch || {}),
      perChatEnabled: patch && patch.perChatEnabled ? { ...cur.perChatEnabled, ...patch.perChatEnabled } : cur.perChatEnabled,
      perChatTriggerMessages: patch && patch.perChatTriggerMessages ? { ...cur.perChatTriggerMessages, ...patch.perChatTriggerMessages } : cur.perChatTriggerMessages
    };
    _prefsCache = next;
    dbPut(STORE_PREFS, { key: PREFS_RECORD_KEY, value: next, updatedAt: Date.now() });
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-companion-mem-changed", { detail: next }));
    }
    return next;
  }

  function isEnabledForChat(charId) {
    const p = getPrefs();
    if (charId && p.perChatEnabled && typeof p.perChatEnabled[charId] === "boolean") {
      return p.perChatEnabled[charId];
    }
    return Boolean(p.enabled);
  }

  function resetForTest() {
    _prefsCache = { ...DEFAULT_PREFS, perChatEnabled: {} };
    _memFallback = { capsules: [], day_summaries: [], prefs: {} };
    _recentShownByChar = {};
    _turnCounterByChar = {};
    _compressCooldownByChar = {};
    _compressRunningByChar = {};
  }

  // ==========================================
  // 2. 基础工具：中文 UTF-8/3 Token 估算与本地时间戳
  // ==========================================
  function estimateTokens(text) {
    const s = String(text || "");
    if (!s) return 0;
    try {
      if (typeof TextEncoder === "function") {
        return Math.floor(new TextEncoder().encode(s).length / 3);
      }
      if (typeof Buffer !== "undefined") {
        return Math.floor(Buffer.byteLength(s, "utf8") / 3);
      }
    } catch (e) {}
    return Math.ceil(s.length * 0.75);
  }

  function formatLocalStamp(ts) {
    const d = ts ? new Date(Number(ts)) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function formatLocalDay(ts) {
    const d = ts ? new Date(Number(ts)) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function normalizeMsgTime(m, fallbackIdx) {
    if (m && typeof m.createdAt === "number" && m.createdAt > 1e11) return m.createdAt;
    if (m && typeof m.id === "number" && m.id > 1e11) return m.id;
    return Date.now() - Math.max(0, 1000 - (fallbackIdx || 0)) * 60000;
  }

  function normalizeChatMsg(m, idx) {
    const role = m.role || (m.isMe ? "user" : "assistant");
    const content = typeof m.content === "string" ? m.content : typeof m.text === "string" ? m.text : "";
    const numId = typeof m.id === "number" ? m.id : Number(m.createdAt) || idx + 1;
    const createdAt = normalizeMsgTime(m, idx);
    return { id: numId, rawId: m.id, role, content: content.trim(), createdAt };
  }

  function groupRounds(msgs) {
    const out = [];
    for (const m of msgs) {
      if (m.role === "user" || out.length === 0) out.push([m]);
      else out[out.length - 1].push(m);
    }
    return out;
  }

  // ==========================================
  // 3. 轻量文本 LLM & Embeddings 统一调用器
  // ==========================================
  function callMainLlmText(messages, opts = {}) {
    return new Promise((resolve, reject) => {
      if (typeof opts.customChatFn === "function") {
        Promise.resolve(opts.customChatFn(messages, opts)).then(resolve, reject);
        return;
      }
      if (typeof global.sendToLLM !== "function") {
        reject(new Error("window.sendToLLM 未就绪"));
        return;
      }
      global.sendToLLM(
        messages,
        {
          temperature: opts.temperature ?? 0,
          max_tokens: opts.max_tokens,
          disableMCP: true
        },
        (reply) => resolve(String(reply || "")),
        (err) => reject(new Error(String(err || "LLM 请求失败")))
      );
    });
  }

  async function callPickerLlmText(messages, opts = {}) {
    if (typeof opts.customChatFn === "function") {
      return await opts.customChatFn(messages, opts);
    }
    const p = getPrefs();
    if (p.pickerUseCustom && p.pickerBaseUrl && p.pickerApiKey && p.pickerModel) {
      let endpoint = p.pickerBaseUrl.trim().replace(/\/+$/, "");
      if (!endpoint.endsWith("/chat/completions")) endpoint += "/chat/completions";
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.pickerApiKey.trim()}`
          },
          body: JSON.stringify({
            model: p.pickerModel.trim(),
            messages,
            temperature: opts.temperature ?? 0,
            max_tokens: opts.max_tokens || 60,
            stream: false
          }),
          signal: controller ? controller.signal : undefined
        });
        if (!res.ok) throw new Error(`Picker HTTP ${res.status}`);
        const data = await res.json();
        return String(data?.choices?.[0]?.message?.content || "");
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    return await callMainLlmText(messages, opts);
  }

  async function computeEmbedding(text, overridePrefs = null) {
    const p = overridePrefs ? { ...getPrefs(), ...overridePrefs } : getPrefs();
    if (!p.embedApiKey || !String(p.embedApiKey).trim()) return null;

    const targetUrl = String(p.embedUrl || DEFAULT_PREFS.embedUrl).trim();
    const useWorker = Boolean(p.embedViaWorker && p.embedWorkerUrl && p.embedWorkerUrl.trim());
    const fetchUrl = useWorker ? p.embedWorkerUrl.trim() : targetUrl;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.embedApiKey.trim()}`
    };
    if (useWorker) headers["X-Target-Embed-Url"] = targetUrl;

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      const res = await fetch(fetchUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: String(p.embedModel || DEFAULT_PREFS.embedModel).trim(),
          input: String(text || "").slice(0, 4000)
        }),
        signal: controller ? controller.signal : undefined
      });
      if (!res.ok) throw new Error(`Embed HTTP ${res.status}`);
      const data = await res.json();
      const vec = data?.data?.[0]?.embedding;
      return Array.isArray(vec) && vec.length > 0 ? vec : null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function cosineSimilarity(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom > 0 ? dot / denom : 0;
  }

  // 未配置 Embedding Key 时的纯前端中文 Bigram 余弦相似度兜底
  function bigramScore(query, doc) {
    const tokenize = (s) => {
      const clean = String(s || "").toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, "");
      const set = new Set();
      for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
      if (clean.length === 1) set.add(clean);
      return set;
    };
    const qs = tokenize(query);
    const ds = tokenize(doc);
    if (qs.size === 0 || ds.size === 0) return 0;
    let hit = 0;
    for (const g of qs) if (ds.has(g)) hit++;
    return hit / Math.sqrt(qs.size * ds.size);
  }

  // ==========================================
  // 4. Module 1：Folio 滚动压缩胶囊（1:1 复刻 folio.py）
  // ==========================================
  function buildFolioPrompt(names) {
    return `你在替${names.assistant}整理和${names.user}的聊天，写成以后能翻看的回忆。
把下面这几轮对话写成一段连贯的叙述：
- 发生了什么，谁说了什么要紧的话，当时的情绪；
- 约定、计划、没做完的事写清楚；
- 用名字（${names.user}、${names.assistant}），不要写“用户”“助手”；
- 时间以每条消息的本地时间为准；“明天”“刚才”这类相对时间换成具体日期，免得旧的“明天”读起来像新安排。
只写正文，不要 JSON，不要标题，不要列表。`;
  }

  async function getCapsules(charId) {
    const list = await dbGetAllByChar(STORE_CAPSULES, charId);
    list.sort((a, b) => (a.lastMsgId || 0) - (b.lastMsgId || 0));
    return list;
  }

  // ==========================================
  // 2.5 全屏顶部横幅提示（透明告知用户伴侣分层记忆正在调用 AI）
  // ==========================================
  let _bannerHideTimer = null;
  function showMemoryAiBanner(title, detail, state = "loading") {
    try {
      if (typeof document === "undefined" || !document.body) return;
      if (_bannerHideTimer) {
        clearTimeout(_bannerHideTimer);
        _bannerHideTimer = null;
      }
      let el = document.getElementById("milvus-companion-memory-ai-banner");
      if (!el) {
        el = document.createElement("div");
        el.id = "milvus-companion-memory-ai-banner";
        el.style.cssText = [
          "position:fixed",
          "top:max(12px, env(safe-area-inset-top))",
          "left:50%",
          "transform:translateX(-50%) translateY(-16px)",
          "z-index:999999",
          "width:min(92vw, 420px)",
          "padding:10px 14px",
          "border-radius:14px",
          "backdrop-filter:blur(12px)",
          "-webkit-backdrop-filter:blur(12px)",
          "box-shadow:0 10px 28px rgba(38,28,22,0.22)",
          "display:flex",
          "align-items:center",
          "gap:10px",
          "font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans SC',sans-serif",
          "transition:opacity 0.25s ease, transform 0.25s ease",
          "pointer-events:none",
          "opacity:0"
        ].join(";");
        document.body.appendChild(el);
      }

      const palette = state === "done"
        ? { bg: "rgba(44, 78, 56, 0.94)", border: "1px solid rgba(163, 217, 179, 0.45)", icon: "✅" }
        : state === "error"
          ? { bg: "rgba(128, 42, 34, 0.94)", border: "1px solid rgba(255, 178, 168, 0.45)", icon: "⚠️" }
          : { bg: "rgba(46, 39, 35, 0.94)", border: "1px solid rgba(226, 198, 152, 0.48)", icon: "🧠" };

      el.style.background = palette.bg;
      el.style.border = palette.border;
      el.style.color = "#fffaf2";

      const safeTitle = String(title || "伴侣分层记忆 · 调用 AI").replace(/</g, "&lt;");
      const safeDetail = String(detail || "").replace(/</g, "&lt;");
      el.innerHTML =
        `<div style="font-size:18px;line-height:1;flex-shrink:0;">${palette.icon}</div>` +
        `<div style="flex:1;min-width:0;">` +
          `<div style="font-size:12px;font-weight:700;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeTitle}</div>` +
          (safeDetail ? `<div style="font-size:11px;opacity:0.86;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeDetail}</div>` : "") +
        `</div>`;

      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateX(-50%) translateY(0)";
      });

      if (state === "done" || state === "error") {
        _bannerHideTimer = setTimeout(() => {
          el.style.opacity = "0";
          el.style.transform = "translateX(-50%) translateY(-16px)";
        }, state === "error" ? 3200 : 2400);
      }
    } catch (_) {}
  }

  async function folioCompressOnce(charId, rawMessages, names, opts = {}) {
    const capsules = await getCapsules(charId);
    const maxCoveredId = capsules.reduce((mx, c) => Math.max(mx, Number(c.lastMsgId) || 0), 0);

    const normalized = (rawMessages || [])
      .map(normalizeChatMsg)
      .filter((m) => m.content && (m.role === "user" || m.role === "assistant") && m.id > maxCoveredId)
      .sort((a, b) => a.id - b.id);

    const rs = groupRounds(normalized);
    const force = Boolean(opts.force);
    const triggerMsgs = getTriggerMessageCount(charId);
    const dynamicBatchTokens = Math.max(12000, triggerMsgs * 350);

    if (rs.length <= KEEP_ROUNDS) return { compressed: false, reason: "keep_recent_rounds" };
    if (!force && normalized.length < triggerMsgs) {
      return { compressed: false, reason: "below_threshold", currentCount: normalized.length, triggerMsgs };
    }

    const batch = [];
    let size = 0;
    for (const r of rs.slice(0, rs.length - KEEP_ROUNDS)) {
      const n = r.reduce((acc, m) => acc + estimateTokens(m.content), 0);
      if (batch.length > 0 && size + n > dynamicBatchTokens) break;
      batch.push(r);
      size += n;
    }
    if (batch.length === 0) return { compressed: false, reason: "empty_batch" };

    const flat = batch.flat();
    const rows = flat.map((m) => ({
      who: m.role === "user" ? names.user : names.assistant,
      time: formatLocalStamp(m.createdAt),
      content: m.content
    }));

    showMemoryAiBanner(
      "伴侣分层记忆 · 正在调用 AI 总结",
      `「记忆胶囊」正在归纳与 ${names.assistant || "名士"} 的 ${flat.length} 条对话…`,
      "loading"
    );
    let text = "";
    try {
      text = (
        await callMainLlmText(
          [
            { role: "system", content: buildFolioPrompt(names) },
            { role: "user", content: JSON.stringify(rows) }
          ],
          { temperature: 0, customChatFn: opts.customChatFn }
        )
      ).trim();
    } catch (err) {
      showMemoryAiBanner("伴侣分层记忆 · 总结调用失败", err?.message || "请检查 API 配置", "error");
      throw err;
    }

    if (!text || text[0] === "{" || text[0] === "[") {
      showMemoryAiBanner("伴侣分层记忆 · 摘要格式异常", "已跳过本次胶囊写入", "error");
      throw new Error("Folio 只收纯文本摘要，拒绝异常 JSON 输出");
    }
    showMemoryAiBanner(
      "伴侣分层记忆 · 记忆胶囊归纳完成",
      `已归档与 ${names.assistant || "名士"} 的 ${flat.length} 条对话记忆`,
      "done"
    );

    const record = {
      id: `cap_${charId}_${flat[flat.length - 1].id}_${Date.now()}`,
      charId: String(charId),
      lastMsgId: flat[flat.length - 1].id,
      startAt: flat[0].createdAt,
      endAt: flat[flat.length - 1].createdAt,
      text,
      pinned: false,
      createdAt: Date.now()
    };
    await dbPut(STORE_CAPSULES, record);
    return { compressed: true, capsule: record };
  }

  async function buildFolioContext(charId, rawMessages) {
    const capsules = await getCapsules(charId);
    const maxCoveredId = capsules.reduce((mx, c) => Math.max(mx, Number(c.lastMsgId) || 0), 0);

    // 置顶胶囊必留 + 最新胶囊按 CAPSULE_BUDGET (7500 token) 倒序装入
    const pinned = capsules.filter((c) => c.pinned);
    const others = capsules.filter((c) => !c.pinned).sort((a, b) => (b.lastMsgId || 0) - (a.lastMsgId || 0));

    const picked = [...pinned];
    let used = pinned.reduce((s, c) => s + estimateTokens(c.text), 0);
    for (const c of others) {
      const n = estimateTokens(c.text);
      if (used + n > CAPSULE_BUDGET) break;
      picked.push(c);
      used += n;
    }
    picked.sort((a, b) => (a.lastMsgId || 0) - (b.lastMsgId || 0));

    const capsuleBlock =
      picked.length > 0
        ? "【Folio 过往回忆胶囊（较早对话压缩归档，按时间由远及近）】\n" +
          picked
            .map((c) => `[${formatLocalStamp(c.startAt)} ~ ${formatLocalStamp(c.endAt)}]\n${c.text}`)
            .join("\n\n")
        : "";

    const uncovered = (rawMessages || [])
      .map(normalizeChatMsg)
      .filter((m) => m.content && (m.role === "user" || m.role === "assistant") && m.id > maxCoveredId)
      .sort((a, b) => a.id - b.id);

    return {
      capsuleBlock,
      capsuleCount: picked.length,
      uncoveredMessages: uncovered
    };
  }

  // ==========================================
  // 5. Module 2：分段日总结 + 真向量检索 + read_day 原话证据
  // ==========================================
  function segmentDayMessages(dayMsgs) {
    const sorted = [...dayMsgs].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
    const segs = [];
    let cur = [];
    let chars = 0;
    let prevTs = null;

    for (const m of sorted) {
      const gapTooBig = prevTs !== null && m.createdAt - prevTs >= DAY_SEG_GAP_MS;
      const tooLong = cur.length > 0 && chars + m.content.length > DAY_SEG_CHARS;
      if (cur.length > 0 && (gapTooBig || tooLong)) {
        segs.push(cur);
        cur = [];
        chars = 0;
      }
      cur.push(m);
      chars += m.content.length;
      prevTs = m.createdAt;
    }
    if (cur.length > 0) segs.push(cur);
    return segs;
  }

  async function summarizeDay(charId, dayStr, rawMessages, names, opts = {}) {
    const allNorm = (rawMessages || [])
      .map(normalizeChatMsg)
      .filter((m) => m.content && (m.role === "user" || m.role === "assistant") && formatLocalDay(m.createdAt) === dayStr);

    if (allNorm.length === 0) return { count: 0, summaries: [] };

    const segs = segmentDayMessages(allNorm);
    const existing = await dbGetAllByChar(STORE_SUMMARIES, charId);
    const created = [];

    for (let sIdx = 0; sIdx < segs.length; sIdx++) {
      const segMsgs = segs[sIdx];
      const segNo = sIdx + 1;
      const dup = existing.find((x) => x.day === dayStr && x.segIdx === segNo && !x.archived);
      if (dup && !opts.force) continue;

      const transcript = segMsgs
        .map((m) => `[${formatLocalStamp(m.createdAt)}] ${m.role === "user" ? names.user : names.assistant}：${m.content}`)
        .join("\n");

      const sysPrompt = `下面是${names.user}和${names.assistant}在 ${dayStr} 这一天里的一段原始对话。请写一份总结：
- 一件事一段，段与段之间空一行；
- 写清楚时间、发生了什么、说过的要紧的话和情绪；
- 只根据原文写，不要补充，不要接着对话往下演；
- 如果没有值得记的内容，只回一个字：无。
只写正文，不要 JSON，不要标题。`;

      showMemoryAiBanner(
        "伴侣分层记忆 · 正在调用 AI 生成日总结",
        `正在归纳 ${names.assistant || "名士"} ${dayStr} 第 ${segNo}/${segs.length} 段对话…`,
        "loading"
      );
      let reply = "";
      try {
        reply = (
          await callMainLlmText(
            [
              { role: "system", content: sysPrompt },
              { role: "user", content: `<原始对话>\n${transcript}\n</原始对话>\n请按要求总结以上对话，严禁接着往下写。` }
            ],
            { temperature: 0, customChatFn: opts.customChatFn }
          )
        ).trim();
      } catch (err) {
        showMemoryAiBanner("伴侣分层记忆 · 日总结调用失败", err?.message || "请检查 API 配置", "error");
        throw err;
      }
      showMemoryAiBanner(
        "伴侣分层记忆 · 分段日总结完成",
        `已完成 ${names.assistant || "名士"} ${dayStr} 第 ${segNo}/${segs.length} 段归纳`,
        "done"
      );

      if (!reply || reply === "无" || reply === "无。") continue;

      const paragraphs = reply
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 6 && p !== "无");

      for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const para = paragraphs[pIdx];
        let embedding = null;
        try {
          embedding = await computeEmbedding(para, opts.embedPrefs);
        } catch (e) {
          embedding = null;
        }
        const rec = {
          id: `sum_${charId}_${dayStr}_s${segNo}_p${pIdx + 1}_${Date.now()}`,
          charId: String(charId),
          day: dayStr,
          segIdx: segNo,
          msgStartId: segMsgs[0].id,
          msgEndId: segMsgs[segMsgs.length - 1].id,
          text: para,
          embedding,
          archived: false,
          shownCount: 0,
          createdAt: Date.now()
        };
        await dbPut(STORE_SUMMARIES, rec);
        created.push(rec);
      }
    }

    return { count: created.length, summaries: created };
  }

  async function searchDaySummaries(charId, query, opts = {}) {
    const all = (await dbGetAllByChar(STORE_SUMMARIES, charId)).filter((x) => !x.archived && x.text);
    if (all.length === 0 || !String(query || "").trim()) return [];

    let qVec = null;
    const hasAnyVec = all.some((x) => Array.isArray(x.embedding) && x.embedding.length > 0);
    if (hasAnyVec) {
      try {
        qVec = await computeEmbedding(query, opts.embedPrefs);
      } catch (e) {
        qVec = null;
      }
    }

    const scored = all.map((item) => {
      let score = 0;
      if (qVec && Array.isArray(item.embedding) && item.embedding.length === qVec.length) {
        score = cosineSimilarity(qVec, item.embedding);
      } else {
        score = bigramScore(query, item.text);
      }
      return { ...item, score };
    });

    const minThreshold = qVec ? DAY_MIN_SIM : 0.16;
    scored.sort((a, b) => b.score - a.score);
    return scored
      .filter((x) => x.score >= minThreshold)
      .slice(0, opts.limit || RECALL_MAX_CANDS)
      .map((x, idx) => ({ ...x, rank: idx + 1 }));
  }

  async function readDayEvidence(charId, dayStr, segIdx, rawMessages, names = { user: "主公", assistant: "名士" }) {
    const allSums = await dbGetAllByChar(STORE_SUMMARIES, charId);
    const matched = allSums.find((s) => s.day === String(dayStr) && Number(s.segIdx) === Number(segIdx));

    let sourceMsgs = (rawMessages || [])
      .map(normalizeChatMsg)
      .filter((m) => m.content && (m.role === "user" || m.role === "assistant"));

    if (matched && matched.msgStartId && matched.msgEndId) {
      sourceMsgs = sourceMsgs.filter((m) => m.id >= matched.msgStartId && m.id <= matched.msgEndId);
    } else {
      const sameDay = sourceMsgs.filter((m) => formatLocalDay(m.createdAt) === String(dayStr));
      const segs = segmentDayMessages(sameDay);
      sourceMsgs = segs[Math.max(0, Number(segIdx || 1) - 1)] || sameDay;
    }

    if (sourceMsgs.length === 0) {
      return { ok: false, text: `未找到 ${dayStr} 第 ${segIdx || 1} 段的原始对话记录。` };
    }

    let out = "";
    for (const m of sourceMsgs) {
      const line = `[${formatLocalStamp(m.createdAt)}] ${m.role === "user" ? names.user : names.assistant}：${m.content}\n`;
      if (out.length + line.length > READ_DAY_CAP) {
        out += "…（后续原文已截断）";
        break;
      }
      out += line;
    }
    return { ok: true, day: dayStr, seg: Number(segIdx || 1), messageCount: sourceMsgs.length, text: out.trim() };
  }

  // ==========================================
  // 6. Module 3：独立小模型挑选门（1:1 复刻 recall_gate.py）
  // ==========================================
  function filterCandidatePool(candidates, recentIdSet) {
    const seen = new Set();
    const out = [];
    const sorted = [...(candidates || [])].sort((a, b) => (a.rank || 999) - (b.rank || 999));

    for (const c of sorted) {
      if (recentIdSet && recentIdSet.has(c.id)) {
        c.fate = "RECENTLY_SHOWN";
      } else if (c.archived) {
        c.fate = "ARCHIVED";
      } else if (seen.has(c.id) || !String(c.text || "").trim()) {
        c.fate = "DUPLICATE";
      } else if (out.length >= RECALL_MAX_CANDS) {
        c.fate = "OVER_LIMIT";
      } else {
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  }

  function parsePickIndices(replyText, maxN) {
    const m = String(replyText || "").match(/\[[\d,\s]*\]/);
    if (!m) return null;
    const nums = m[0].match(/\d+/g) || [];
    const picks = [];
    for (const raw of nums) {
      const n = parseInt(raw, 10);
      if (n >= 1 && n <= maxN && !picks.includes(n)) picks.push(n);
    }
    return picks;
  }

  async function recallGatePick({ query, candidates, names, prevAssistantReply = "", recentIdSet = null, customChatFn = null }) {
    const pool = filterCandidatePool(candidates, recentIdSet);
    if (pool.length === 0) return { accepted: [], ok: true };

    const listing = pool.map((c, i) => `${i + 1}. ${String(c.text).slice(0, RECALL_BODY_CHARS)}`).join("\n");
    const sysPrompt = `你是记忆挑选器。根据${names.user}当前这句话，从候选旧记忆里挑出真正相关的编号（最多 ${RECALL_MAX_ACCEPT} 条）。
规则：
- 只挑和当前话题直接相关的；不相关或勉强沾边的一律不选；
- 仅输出 JSON 编号数组，如 [] 或 [2, 5]，不要输出任何解释。`;

    const ask =
      (prevAssistantReply ? `${names.assistant}上一句（结尾）：${prevAssistantReply.slice(-120)}\n` : "") +
      `${names.user}现在说：${String(query || "").slice(0, 400)}\n\n候选记忆：\n${listing}`;

    let picks = null;
    try {
      showMemoryAiBanner(
        "伴侣分层记忆 · 正在调用 AI 检索记忆",
        `「记忆挑选器」正在从 ${pool.length} 条历史摘要中筛选关联记忆…`,
        "loading"
      );
      const reply = await callPickerLlmText(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: ask }
        ],
        { temperature: 0, max_tokens: 60, customChatFn }
      );
      picks = parsePickIndices(reply, pool.length);
      showMemoryAiBanner(
        "伴侣分层记忆 · 记忆检索完成",
        picks && picks.length > 0 ? `已唤醒 ${picks.length} 条相关旧记忆` : "当前话题无关联旧记忆",
        "done"
      );
    } catch (e) {
      picks = null;
      showMemoryAiBanner("伴侣分层记忆 · 记忆检索失败", "已跳过旧记忆注入", "error");
    }

    if (picks === null) {
      pool.forEach((c) => (c.fate = "PICKER_UNAVAILABLE"));
      return { accepted: [], ok: false };
    }

    pool.forEach((c, idx) => {
      c.fate = picks.includes(idx + 1) ? "PICKED" : "NOT_PICKED";
    });
    return {
      accepted: picks.slice(0, RECALL_MAX_ACCEPT).map((i) => pool[i - 1]),
      ok: true
    };
  }

  function renderRecallBlock(accepted, unavailable = false) {
    if (unavailable) {
      return '<recall status="unavailable">记忆暂时查不到。别假装记得，也别说没发生过。</recall>';
    }
    if (!accepted || accepted.length === 0) {
      return "";
    }
    const rules = `以下是可能相关的旧记忆，不是这一轮说的话。
1. 只用和当前话题真相关的，不相关就当没看见。
2. 记忆里没写的细节不要补；要细节就用 read_day(day, seg) 翻出处的原话，翻不到就说记不清。
3. 记忆和原话对不上时，以原话为准。
4. 不要提“记忆库”“召回”，像自然想起来那样说。`;
    const items = accepted
      .map((c) => {
        const src = c.day && c.segIdx ? ` source="${c.day}#${c.segIdx}"` : "";
        return `<memory id="${c.id}"${src}>${c.text}</memory>`;
      })
      .join("\n");
    return `<recall status="ok">\n${rules}\n${items}\n</recall>`;
  }

  // ==========================================
  // 7. Module 4：Prompt 缓存友好四层排布（1:1 复刻 layout.py）
  // ==========================================
  function buildCachedLayout({ fixedSystemPrompt, capsuleBlock, recentMessages, volatileBlocks, currentUserMessage, now = new Date() }) {
    const msgs = [{ role: "system", content: fixedSystemPrompt }];
    if (capsuleBlock) {
      msgs.push({ role: "system", content: capsuleBlock });
    }
    for (const m of recentMessages || []) {
      msgs.push({ role: m.role, content: m.content });
    }

    const nowStr = `现在是 ${formatLocalDay(now.getTime())} 周${WEEK_ZH[now.getDay()]} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const vParts = [nowStr, ...(volatileBlocks || []).filter(Boolean)];
    msgs.push({
      role: "user",
      content: `<volatile_context>\n${vParts.join("\n\n")}\n</volatile_context>`
    });
    if (currentUserMessage) {
      msgs.push({ role: "user", content: currentUserMessage });
    }
    return msgs;
  }

  // ==========================================
  // 8. 传讯私聊接入调度（请求前排布 + 回复后后台压缩）
  // ==========================================
  async function applyLayoutForSoloChat({ charId, charName, userName, fixedSystemPrompt, rawHistory, currentUserText, fallbackApiMessages }) {
    await hydratePrefs();
    if (!isEnabledForChat(charId)) return { messages: fallbackApiMessages, hasRecall: false };

    const cid = String(charId);
    const turn = (_turnCounterByChar[cid] || 0) + 1;
    _turnCounterByChar[cid] = turn;

    const folio = await buildFolioContext(cid, rawHistory);
    const names = { user: userName || "主公", assistant: charName || "名士" };

    // 查日总结候选
    const cands = await searchDaySummaries(cid, currentUserText);
    const recentMap = _recentShownByChar[cid] || new Map();
    const recentIdSet = new Set();
    for (const [id, lastT] of recentMap.entries()) {
      if (turn - lastT <= RECENT_MEMORY_COOLDOWN_TURNS) recentIdSet.add(id);
    }

    let recallBlock = "";
    let accepted = [];
    if (cands.length > 0) {
      const p = getPrefs();
      if (p.useRecallGate) {
        const lastAssistant = [...folio.uncoveredMessages].reverse().find((m) => m.role === "assistant");
        const picked = await recallGatePick({
          query: currentUserText,
          candidates: cands,
          names,
          prevAssistantReply: lastAssistant ? lastAssistant.content : "",
          recentIdSet
        });
        accepted = picked.accepted;
        recallBlock = renderRecallBlock(picked.accepted, !picked.ok);
      } else {
        accepted = filterCandidatePool(cands, recentIdSet).slice(0, DAY_TOP_K);
        recallBlock = renderRecallBlock(accepted, false);
      }
    }

    // 仅给真正喂给模型的记忆记「被翻起」（防马太效应）
    if (accepted.length > 0) {
      for (const a of accepted) {
        recentMap.set(a.id, turn);
        dbPut(STORE_SUMMARIES, { ...a, shownCount: (a.shownCount || 0) + 1, lastShownTurn: turn });
      }
      _recentShownByChar[cid] = recentMap;
    }

    // 协同注入：东汉十三州密卷（朱砂御批 + 活跃金兰契 + BM25/向量混合召回，自动与日总结去重）
    let archiveBlock = "";
    let archiveCount = 0;
    if (global.ThirteenProvincesEngine && typeof global.ThirteenProvincesEngine.buildArchiveContext === "function") {
      try {
        const tpRes = await global.ThirteenProvincesEngine.buildArchiveContext(cid, currentUserText, {
          excludeTexts: accepted.map((a) => a.text)
        });
        if (tpRes && tpRes.block) {
          archiveBlock = tpRes.block;
          archiveCount = (tpRes.pinnedCount || 0) + (tpRes.vowCount || 0) + (tpRes.recalledCount || 0);
        }
      } catch (e) {
        console.warn("[CompanionMemory] 十三州密卷检索跳过:", e);
      }
    }

    const layoutMsgs = buildCachedLayout({
      fixedSystemPrompt,
      capsuleBlock: folio.capsuleBlock,
      recentMessages: folio.uncoveredMessages,
      volatileBlocks: [archiveBlock, recallBlock],
      currentUserMessage: currentUserText
    });

    return {
      messages: layoutMsgs,
      hasRecall: accepted.length > 0 || archiveCount > 0,
      capsuleCount: folio.capsuleCount,
      recalledCount: accepted.length,
      archiveCount
    };
  }

  function onAfterSoloReply({ charId, charName, userName, allMessages }) {
    if (global.ThirteenProvincesEngine && typeof global.ThirteenProvincesEngine.maybeAutoDigest === "function") {
      try {
        global.ThirteenProvincesEngine.maybeAutoDigest({ charId, charName, userName, allMessages });
      } catch (e) {}
    }
    if (!isEnabledForChat(charId)) return;
    const p = getPrefs();
    if (!p.autoFolio) return;

    const cid = String(charId);
    const now = Date.now();
    if (_compressRunningByChar[cid]) return;
    if ((_compressCooldownByChar[cid] || 0) > now) return;

    _compressRunningByChar[cid] = true;
    const names = { user: userName || "主公", assistant: charName || "名士" };

    setTimeout(async () => {
      try {
        await folioCompressOnce(cid, allMessages, names);
      } catch (err) {
        console.warn("[CompanionMemory] 后台 Folio 压缩失败，冷却 5 分钟后重试:", err);
        _compressCooldownByChar[cid] = Date.now() + COMPRESS_FAIL_COOLDOWN_MS;
      } finally {
        _compressRunningByChar[cid] = false;
      }
    }, 600);
  }

  async function exportCharBackup(charId) {
    const [capsules, summaries] = await Promise.all([
      getCapsules(charId),
      dbGetAllByChar(STORE_SUMMARIES, charId)
    ]);
    let thirteenProvinces = null;
    if (global.ThirteenProvincesEngine && typeof global.ThirteenProvincesEngine.exportCharArchive === "function") {
      try {
        thirteenProvinces = await global.ThirteenProvincesEngine.exportCharArchive(charId);
      } catch (e) {}
    }
    return { version: 2, charId: String(charId), exportedAt: Date.now(), capsules, summaries, thirteenProvinces };
  }

  async function importCharBackup(charId, data) {
    if (!data || typeof data !== "object") throw new Error("无效的备份 JSON");
    let count = 0;
    for (const c of Array.isArray(data.capsules) ? data.capsules : []) {
      await dbPut(STORE_CAPSULES, { ...c, charId: String(charId) });
      count++;
    }
    for (const s of Array.isArray(data.summaries) ? data.summaries : []) {
      await dbPut(STORE_SUMMARIES, { ...s, charId: String(charId) });
      count++;
    }
    if (data.thirteenProvinces && global.ThirteenProvincesEngine && typeof global.ThirteenProvincesEngine.importCharArchive === "function") {
      try {
        count += await global.ThirteenProvincesEngine.importCharArchive(charId, data.thirteenProvinces);
      } catch (e) {}
    }
    return count;
  }

  async function loadRawHistoryForChar(charId) {
    try {
      if (global.chatHistoryStore && typeof global.chatHistoryStore.get === "function") {
        const arr = await global.chatHistoryStore.get(charId);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) {}
    return [];
  }

  async function readDayFromHistoryStore(charId, dayStr, segIdx, names) {
    const raw = await loadRawHistoryForChar(charId);
    return await readDayEvidence(charId, dayStr, segIdx, raw, names);
  }

  function deriveEmbedWorkerUrl() {
    try {
      const candidates = [
        global.LuckinOrderEngine && global.LuckinOrderEngine.getPrefs && global.LuckinOrderEngine.getPrefs().gatewayUrl,
        global.McdOrderEngine && global.McdOrderEngine.getPrefs && global.McdOrderEngine.getPrefs().gatewayUrl,
        global.ImaNotesEngine && global.ImaNotesEngine.getPrefs && global.ImaNotesEngine.getPrefs().gatewayUrl
      ];
      for (const raw of candidates) {
        if (raw && String(raw).trim()) {
          const u = new URL(String(raw).trim());
          return `${u.origin}/embed`;
        }
      }
    } catch (e) {}
    return "";
  }

  // ==========================================
  // 9. React UI：私聊偏好入口卡 + 分层记忆工作台弹窗
  // ==========================================
  function CompanionMemoryDrawerModal({ isOpen, onClose, chatData }) {
    if (!isOpen || typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;

    const charId = String(chatData?.id || "");
    const charName = chatData?.name || chatData?.profile?.name || "名士";
    const userName = chatData?.profile?.userNickname || "主公";

    const [tab, setTab] = useState("capsules"); // "capsules" | "summaries" | "config"
    const [prefs, setPrefs] = useState(() => getPrefs());
    const [capsules, setCapsules] = useState([]);
    const [summaries, setSummaries] = useState([]);
    const [busyMsg, setBusyMsg] = useState("");
    const [dayInput, setDayInput] = useState(() => formatLocalDay(Date.now()));

    const reloadData = async () => {
      await hydratePrefs(true);
      setPrefs(getPrefs());
      const [caps, sums] = await Promise.all([
        getCapsules(charId),
        dbGetAllByChar(STORE_SUMMARIES, charId)
      ]);
      sums.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setCapsules(caps);
      setSummaries(sums);
    };

    useEffect(() => {
      reloadData();
    }, [charId, isOpen]);

    const updatePrefs = (patch) => setPrefs(savePrefs(patch));

    const handleManualFolio = async () => {
      setBusyMsg("正在压缩较早对话为 Folio 胶囊...");
      try {
        const raw = await loadRawHistoryForChar(charId);
        const res = await folioCompressOnce(charId, raw, { user: userName, assistant: charName }, { force: true });
        if (res.compressed) {
          setBusyMsg("✅ 已生成 1 枚新 Folio 回忆胶囊！");
          await reloadData();
        } else {
          setBusyMsg("ℹ️ 未压缩对话不足 3 轮（最近 2 轮永远保留原话）");
        }
      } catch (err) {
        setBusyMsg("❌ 压缩失败：" + (err.message || err));
      }
    };

    const handleManualDaySummary = async () => {
      setBusyMsg(`正在生成 ${dayInput} 分段日总结与向量...`);
      try {
        const raw = await loadRawHistoryForChar(charId);
        const res = await summarizeDay(charId, dayInput, raw, { user: userName, assistant: charName }, { force: true });
        if (res.count > 0) {
          setBusyMsg(`✅ 已生成 ${res.count} 条 ${dayInput} 分段日总结！`);
          await reloadData();
        } else {
          setBusyMsg(`ℹ️ ${dayInput} 当天没有可总结的对话记录`);
        }
      } catch (err) {
        setBusyMsg("❌ 总结失败：" + (err.message || err));
      }
    };

    const handleExport = async () => {
      const data = await exportCharBackup(charId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `companion_memory_${charName}_${formatLocalDay(Date.now())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBusyMsg("✅ 已导出当前名士的伴侣分层记忆备份");
    };

    const handleImport = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      file.text().then(async (txt) => {
        try {
          const n = await importCharBackup(charId, JSON.parse(txt));
          setBusyMsg(`✅ 已成功导入 ${n} 条胶囊与日总结`);
          await reloadData();
        } catch (err) {
          setBusyMsg("❌ 导入失败：" + (err.message || err));
        }
      });
    };

    const modalNode = h(
      "div",
      {
        onClick: onClose,
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99997,
          background: "rgba(24, 22, 19, 0.62)",
          backdropFilter: "blur(5px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "14px 12px"
        }
      },
      h(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "min(94vw, 410px)",
            maxHeight: "86vh",
            background: "#FAF8F2",
            borderRadius: "18px",
            border: "1.5px solid #DCD2BE",
            boxShadow: "0 20px 50px rgba(0,0,0,0.36)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            color: "#35312C"
          }
        },
        // 顶栏
        h(
          "div",
          {
            style: {
              padding: "14px 16px",
              background: "#F3EFE4",
              borderBottom: "1px solid #E5DCCB",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0
            }
          },
          h(
            "div",
            null,
            h("div", { style: { fontSize: "15px", fontWeight: "800", color: "#2F3E42" } }, `🧠 ${charName} · 伴侣分层记忆`),
            h("div", { style: { fontSize: "11px", color: "#7B7468", marginTop: "2px" } }, `Folio 胶囊 ${capsules.length} · 日总结 ${summaries.length} · 存本机 IndexedDB`)
          ),
          h(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: { width: "28px", height: "28px", borderRadius: "50%", border: "none", background: "rgba(90,80,65,0.12)", cursor: "pointer", fontWeight: "700" }
            },
            "✕"
          )
        ),

        // 三标签页
        h(
          "div",
          { style: { padding: "10px 14px 6px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px", flexShrink: 0 } },
          [
            { id: "capsules", label: `📦 胶囊 (${capsules.length})` },
            { id: "summaries", label: `📅 日总结 (${summaries.length})` },
            { id: "config", label: "⚙️ 向量与配置" }
          ].map((t) => {
            const act = tab === t.id;
            return h(
              "button",
              {
                key: t.id,
                type: "button",
                onClick: () => setTab(t.id),
                style: {
                  padding: "7px 4px",
                  borderRadius: "10px",
                  border: act ? "1.5px solid #4E7E8E" : "1px solid #DFD6C5",
                  background: act ? "#EDF5F7" : "#FFFFFF",
                  color: act ? "#2B5664" : "#777064",
                  fontSize: "11.5px",
                  fontWeight: act ? "800" : "600",
                  cursor: "pointer"
                }
              },
              t.label
            );
          })
        ),

        busyMsg &&
          h(
            "div",
            { style: { margin: "0 14px 6px", padding: "7px 10px", borderRadius: "8px", background: "#EEF5F7", color: "#2D5563", fontSize: "11.5px", flexShrink: 0 } },
            busyMsg
          ),

        // 内容滚动区
        h(
          "div",
          { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 14px 16px", display: "flex", flexDirection: "column", gap: "10px" } },
          tab === "capsules" &&
            h(
              React.Fragment,
              null,
              h(
                "button",
                {
                  type: "button",
                  onClick: handleManualFolio,
                  style: { width: "100%", padding: "9px", borderRadius: "10px", border: "none", background: "#4E7E8E", color: "#FFF", fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }
                },
                "✨ 立即将较早对话压成 1 枚 Folio 回忆胶囊"
              ),
              capsules.length === 0
                ? h("div", { style: { textAlign: "center", padding: "24px 10px", fontSize: "12px", color: "#8B8477" } }, "暂无 Folio 胶囊。开启引擎后，聊天满 8 轮 / 24 条会在后台自动封存旧回忆，最近 2 轮永远保留原话。")
                : capsules.map((cap) =>
                    h(
                      "div",
                      { key: cap.id, style: { background: "#FFFFFF", border: cap.pinned ? "1.5px solid #C89B54" : "1px solid #E5DEC9", borderRadius: "12px", padding: "11px 12px", display: "flex", flexDirection: "column", gap: "6px" } },
                      h(
                        "div",
                        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#827869" } },
                        h("span", null, `${cap.pinned ? "📌 " : ""}${formatLocalStamp(cap.startAt)} ~ ${formatLocalStamp(cap.endAt)}`),
                        h(
                          "div",
                          { style: { display: "flex", gap: "6px" } },
                          h("button", {
                            type: "button",
                            onClick: async () => { await dbPut(STORE_CAPSULES, { ...cap, pinned: !cap.pinned }); reloadData(); },
                            style: { border: "none", background: "transparent", color: "#9A6B2F", fontSize: "11px", fontWeight: "700", cursor: "pointer" }
                          }, cap.pinned ? "取消钉住" : "📌 钉住"),
                          h("button", {
                            type: "button",
                            onClick: async () => { await dbDelete(STORE_CAPSULES, cap.id); reloadData(); },
                            style: { border: "none", background: "transparent", color: "#B84C42", fontSize: "11px", cursor: "pointer" }
                          }, "删除")
                        )
                      ),
                      h("div", { style: { fontSize: "12.5px", lineHeight: 1.65, color: "#3A332C", whiteSpace: "pre-wrap" } }, cap.text)
                    )
                  )
            ),

          tab === "summaries" &&
            h(
              React.Fragment,
              null,
              h(
                "div",
                { style: { display: "flex", gap: "6px" } },
                h("input", {
                  type: "date",
                  value: dayInput,
                  onChange: (e) => setDayInput(e.target.value),
                  style: { flex: 1, padding: "7px 9px", borderRadius: "9px", border: "1px solid #D8CEBC", fontSize: "12px", background: "#FFF" }
                }),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: handleManualDaySummary,
                    style: { padding: "8px 12px", borderRadius: "9px", border: "none", background: "#4E7E8E", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }
                  },
                  "✨ 生成该日总结"
                )
              ),
              summaries.length === 0
                ? h("div", { style: { textAlign: "center", padding: "24px 10px", fontSize: "12px", color: "#8B8477" } }, "暂无日总结。选一个聊过天的日期点上方按钮，系统会自动按 3 小时切段、一件事一段并计算语义向量。")
                : summaries.map((s) =>
                    h(
                      "div",
                      { key: s.id, style: { background: "#FFFFFF", border: "1px solid #E5DEC9", borderRadius: "12px", padding: "10px 12px", opacity: s.archived ? 0.55 : 1, display: "flex", flexDirection: "column", gap: "5px" } },
                      h(
                        "div",
                        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#7F776A" } },
                        h("span", null, `${s.day}#${s.segIdx} · ${Array.isArray(s.embedding) ? "🧬 真向量" : "🔤 词面"} · 召回 ${s.shownCount || 0} 次`),
                        h(
                          "div",
                          { style: { display: "flex", gap: "6px" } },
                          h("button", {
                            type: "button",
                            onClick: async () => { await dbPut(STORE_SUMMARIES, { ...s, archived: !s.archived }); reloadData(); },
                            style: { border: "none", background: "transparent", color: "#547682", fontSize: "11px", cursor: "pointer" }
                          }, s.archived ? "恢复" : "归档"),
                          h("button", {
                            type: "button",
                            onClick: async () => { await dbDelete(STORE_SUMMARIES, s.id); reloadData(); },
                            style: { border: "none", background: "transparent", color: "#B84C42", fontSize: "11px", cursor: "pointer" }
                          }, "删除")
                        )
                      ),
                      h("div", { style: { fontSize: "12px", lineHeight: 1.62, color: "#3A332C" } }, s.text)
                    )
                  )
            ),

          tab === "config" &&
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "10px", background: "#FFFFFF", border: "1px solid #E5DEC9", borderRadius: "12px", padding: "12px" } },
              h(
                "label",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", fontWeight: "700" } },
                h("span", null, "自动后台 Folio 压缩（满 8 轮/24 条触发）"),
                h("input", { type: "checkbox", checked: prefs.autoFolio !== false, onChange: (e) => updatePrefs({ autoFolio: e.target.checked }) })
              ),
              h(
                "label",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", fontWeight: "700" } },
                h("span", null, "启用小模型挑选门（Recall Gate 防乱召回）"),
                h("input", { type: "checkbox", checked: prefs.useRecallGate !== false, onChange: (e) => updatePrefs({ useRecallGate: e.target.checked }) })
              ),
              h("div", { style: { borderTop: "1px solid #EFECE2", paddingTop: "8px", fontSize: "12px", fontWeight: "800", color: "#2F4E5A" } }, "🧬 向量检索配置（留空自动降级中文词面检索）"),
              h("input", { type: "text", value: prefs.embedUrl || "", onChange: (e) => updatePrefs({ embedUrl: e.target.value }), placeholder: "Embeddings URL，如 https://api.siliconflow.cn/v1/embeddings", style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD5C4", fontSize: "11.5px", boxSizing: "border-box" } }),
              h("input", { type: "text", value: prefs.embedModel || "", onChange: (e) => updatePrefs({ embedModel: e.target.value }), placeholder: "模型名，如 BAAI/bge-m3", style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD5C4", fontSize: "11.5px", boxSizing: "border-box" } }),
              h("input", { type: "password", value: prefs.embedApiKey || "", onChange: (e) => updatePrefs({ embedApiKey: e.target.value }), placeholder: "Embeddings API Key（存本机 IndexedDB）", style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD5C4", fontSize: "11.5px", boxSizing: "border-box" } }),
              h(
                "label",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11.5px", color: "#5E584F" } },
                h("span", null, "通过已有 Cloudflare Worker (/embed) 解决跨域"),
                h("input", {
                  type: "checkbox",
                  checked: Boolean(prefs.embedViaWorker),
                  onChange: (e) => {
                    const nextWorker = prefs.embedWorkerUrl || deriveEmbedWorkerUrl();
                    updatePrefs({ embedViaWorker: e.target.checked, embedWorkerUrl: nextWorker });
                  }
                })
              ),
              prefs.embedViaWorker &&
                h("input", { type: "text", value: prefs.embedWorkerUrl || "", onChange: (e) => updatePrefs({ embedWorkerUrl: e.target.value }), placeholder: "https://你的Worker域名/embed", style: { width: "100%", padding: "7px 9px", borderRadius: "8px", border: "1px solid #DCD5C4", fontSize: "11.5px", boxSizing: "border-box" } }),

              h("div", { style: { borderTop: "1px solid #EFECE2", paddingTop: "8px", fontSize: "12px", fontWeight: "800", color: "#2F4E5A" } }, "💾 备份与恢复"),
              h(
                "div",
                { style: { display: "flex", gap: "8px" } },
                h("button", { type: "button", onClick: handleExport, style: { flex: 1, padding: "8px", borderRadius: "9px", border: "1px solid #D5CBB6", background: "#FBF6EA", color: "#785328", fontSize: "12px", fontWeight: "700", cursor: "pointer" } }, "💾 导出 JSON 备份"),
                h(
                  "label",
                  { style: { flex: 1, padding: "8px", borderRadius: "9px", border: "1px solid #C9DAE0", background: "#EEF5F7", color: "#2F5866", fontSize: "12px", fontWeight: "700", cursor: "pointer", textAlign: "center" } },
                  "📥 导入恢复",
                  h("input", { type: "file", accept: ".json", onChange: handleImport, style: { display: "none" } })
                )
              )
            )
        )
      )
    );

    if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body) {
      return global.ReactDOM.createPortal(modalNode, document.body);
    }
    return modalNode;
  }

  function ZhangLiaoMemoryGuideModal({ isOpen, onClose }) {
    if (!isOpen || typeof React === "undefined") return null;
    const h = React.createElement;

    const steps = [
      {
        title: "一、这「分层记忆」到底是干嘛的？",
        voice:
          "行军打仗不能把一年的陈年旧账全捆在马背上，沉得跑不动；全扔了又容易忘事。这法子就是替你分门别类理账——把老话压成几行「胶囊」，最近两轮原话原封不动留着，省军粮（Token），人还不犯糊涂。",
        bullets: [
          "勾选开启后，每个名士都有自己独立的记忆库（存在本机 IndexedDB，不占 localStorage，互不串记忆）。",
          "聊得越久越顺手，既省 API 额度，又不会聊过 15 句就把上周答应你的事忘得一干二净。"
        ]
      },
      {
        title: "二、📦 Folio 胶囊 & 📅 日总结，平常怎么玩？",
        voice:
          "你只管照常聊天，剩下的让后台自己干。真有哪段话舍不得被盖过去，顺手给它钉上就是——就像我给商队留的死契，谁也动不得。",
        bullets: [
          "📦 Folio 胶囊：开启自动压缩后，聊天满 8 轮 / 24 条会在后台自动把较老的几轮压成回忆段，最近 2 轮永远留原话；觉得某段特别重要，点「📌 钉住」就会每轮必带。",
          "📅 日总结：切到「日总结」页挑一个聊过天的日期点「✨ 生成该日总结」，系统会按 3 小时切段、一件事写一段。以后聊到旧事，名士还能自己翻出那天的原话接住你当时的情绪。"
        ]
      },
      {
        title: "三、🧬 那个 Embedding（向量）是啥？小白要不要配？",
        voice:
          "先说清楚——懒得折腾就空着，照样能用！不配的时候，它是照着字面翻账本（你提「甜酥」，它就找写着「甜酥」的那页）。配了 Embedding 就不一样了，哪怕旧账写的是「冰生椰拿铁」，今儿你只叹一句「想喝点冰咖啡」，它也能一听就懂，精准给你捞出来。",
        bullets: [
          "不配也能玩：Embedding API Key 留空即可，自动用纯前端中文词面检索，零额外开销。",
          "想开真语义向量（推荐免费）：去硅基流动（https://cloud.siliconflow.cn）注册拿一个免费 API Key，填进工作台「⚙️ 向量与配置」里的 Embeddings API Key，模型默认 BAAI/bge-m3 不用改。",
          "如果手机/网页提示跨域报错：把你的 Cloudflare Worker 更新为最新代码，再勾选「通过已有 Cloudflare Worker (/embed) 解决跨域」即可。"
        ],
        link: { label: "去硅基流动领免费 Embedding Key ↗", url: "https://cloud.siliconflow.cn" }
      },
      {
        title: "四、小模型挑选门（Recall Gate）& 留底账",
        voice:
          "挑选门是个守门的小校：先帮名士把翻出来的旧事过一遍筛子，跟眼下无关的统统挡在外头，免得你正高高兴兴聊着天，他突然提一嘴八百年前的陈芝麻烂谷子扫兴。",
        bullets: [
          "挑选门默认开启即可，会自动过滤无关和刚提过的旧记忆。",
          "🗺️ 东汉十三州密卷：点下方「打开东汉十三州密卷」可以按十三州查看/手动补记主公画像、信物与金兰契约定，点卷阁右上角「?」我再细拆给你听。",
          "换手机或清浏览器前，记得进「⚙️ 向量与配置」点「💾 导出 JSON 备份」，连同十三州密卷一并留底账，丢不了。"
        ]
      }
    ];

    const modalNode = h(
      "div",
      {
        onClick: onClose,
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(22, 24, 26, 0.66)",
          backdropFilter: "blur(5px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 12px",
          boxSizing: "border-box"
        }
      },
      h(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "min(93vw, 395px)",
            maxHeight: "85vh",
            background: "#FAF8F3",
            borderRadius: "18px",
            border: "1.5px solid #BFC9C6",
            boxShadow: "0 20px 50px rgba(14, 22, 24, 0.38)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            color: "#2F3537"
          }
        },
        // 顶栏：雁门军账 · 张辽
        h(
          "div",
          {
            style: {
              padding: "14px 16px 12px",
              background: "linear-gradient(135deg, #2B3B40 0%, #3E555C 100%)",
              color: "#F5F7F6",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              flexShrink: 0
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px" } },
            h(
              "div",
              {
                style: {
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(130, 196, 188, 0.2)",
                  border: "1.5px solid #82C4BC",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "17px",
                  flexShrink: 0
                }
              },
              "⚔️"
            ),
            h(
              "div",
              null,
              h("div", { style: { fontSize: "14.5px", fontWeight: "800", letterSpacing: "0.5px" } }, "雁门军账 · 文远教你理记忆"),
              h("div", { style: { fontSize: "11px", color: "#BBD2D0", marginTop: "1px" } }, "张辽大白话拆解 Folio 与 Embedding 玩法")
            )
          ),
          h(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: {
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "none",
                background: "rgba(255,255,255,0.16)",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                flexShrink: 0
              }
            },
            "✕"
          )
        ),

        // 滚动正文
        h(
          "div",
          {
            style: {
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "12px 14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "11px"
            }
          },
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                borderLeft: "3px solid #4E7E8E",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "12.5px",
                lineHeight: 1.68,
                color: "#364042"
              }
            },
            "「啧，看着那一堆洋文词儿犯懵了？有什么好怕的，说白了就是管账、理货的门道。坐稳了，听我一句一句拆给你听——看在阿蝉的份上，这回教你我不额外加钱。」"
          ),

          steps.map((st, idx) =>
            h(
              "div",
              {
                key: idx,
                style: {
                  background: "#FFFFFF",
                  border: "1px solid #E3E7E5",
                  borderRadius: "13px",
                  padding: "12px 13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }
              },
              h("div", { style: { fontSize: "13px", fontWeight: "800", color: "#2B4A54" } }, st.title),
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "#4A595D",
                    lineHeight: 1.62,
                    background: "#F4F7F6",
                    padding: "7px 10px",
                    borderRadius: "8px"
                  }
                },
                `「${st.voice}」`
              ),
              h(
                "ul",
                {
                  style: {
                    margin: 0,
                    paddingLeft: "17px",
                    fontSize: "12px",
                    color: "#373E40",
                    lineHeight: 1.66,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }
                },
                st.bullets.map((b, bi) => h("li", { key: bi }, b))
              ),
              st.link &&
                h(
                  "a",
                  {
                    href: st.link.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    style: {
                      alignSelf: "flex-start",
                      fontSize: "11.5px",
                      fontWeight: "700",
                      color: "#2F6170",
                      textDecoration: "none",
                      background: "#EAF3F5",
                      border: "1px solid #C6DCE2",
                      padding: "4px 10px",
                      borderRadius: "999px"
                    }
                  },
                  st.link.label
                )
            )
          ),

          h(
            "div",
            {
              style: {
                background: "#F4F1E8",
                border: "1px dashed #CBBFA7",
                borderRadius: "11px",
                padding: "10px 12px",
                fontSize: "11.5px",
                color: "#5D5242",
                lineHeight: 1.65
              }
            },
            "「行了，要紧的就这些。先勾上开关用起来，日后再慢慢添置向量也不迟。记着按时吃饭，别光顾着抱个小手机折腾到半夜——又不是在打仗，饿坏了肚子可没人替你扛。」"
          )
        )
      )
    );

    if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body) {
      return global.ReactDOM.createPortal(modalNode, document.body);
    }
    return modalNode;
  }

  function CompanionMemoryEntryCard({ chatData, isGroup }) {
    if (isGroup || !chatData?.id || typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const charId = String(chatData.id);
    const [enabled, setEnabled] = useState(() => isEnabledForChat(charId));
    const [triggerMsgs, setTriggerMsgs] = useState(() => getTriggerMessageCount(charId));
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);

    useEffect(() => {
      hydratePrefs().then(() => {
        setEnabled(isEnabledForChat(charId));
        setTriggerMsgs(getTriggerMessageCount(charId));
      });
      const onChange = () => {
        setEnabled(isEnabledForChat(charId));
        setTriggerMsgs(getTriggerMessageCount(charId));
      };
      global.addEventListener("milvus-companion-mem-changed", onChange);
      return () => global.removeEventListener("milvus-companion-mem-changed", onChange);
    }, [charId]);

    const toggleChat = () => {
      const next = !enabled;
      setEnabled(next);
      savePrefs({ perChatEnabled: { [charId]: next } });
    };

    const updateTriggerMsgs = (val) => {
      const clamped = clampTriggerMessages(val);
      setTriggerMsgs(clamped);
      const curMap = (getPrefs().perChatTriggerMessages || {});
      savePrefs({ perChatTriggerMessages: { ...curMap, [charId]: clamped } });
    };

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          style: {
            background: "#FFFFFF",
            border: "1px solid #E6EAE8",
            borderRadius: "12px",
            padding: "12px",
            marginTop: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "9px"
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
              { style: { fontSize: "13px", fontWeight: "800", color: "#2D3B3F", display: "flex", alignItems: "center", gap: "6px" } },
              "🧠 伴侣分层记忆（Folio + 向量召回）",
              h(
                "button",
                {
                  type: "button",
                  title: "张辽大白话教你玩转伴侣分层记忆",
                  onClick: (e) => {
                    e.stopPropagation();
                    setGuideOpen(true);
                  },
                  style: {
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    border: "1px solid #BFD0D4",
                    background: "#EEF5F7",
                    color: "#2F5866",
                    fontSize: "11.5px",
                    fontWeight: "800",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    lineHeight: 1
                  }
                },
                "?"
              )
            ),
            h("div", { style: { fontSize: "11px", color: "#7B888C", marginTop: "2px" } }, "滚动压缩旧回忆、最近 2 轮永留原话、按需召回省 Token")
          ),
          h("input", {
            type: "checkbox",
            checked: enabled,
            onChange: toggleChat,
            style: { width: "18px", height: "18px", cursor: "pointer" }
          })
        ),
        h(
          "div",
          {
            style: {
              background: "#F7FAFA",
              border: "1px solid #E2ECEF",
              borderRadius: "9px",
              padding: "8px 10px",
              display: "flex",
              flexDirection: "column",
              gap: "6px"
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "11.5px", color: "#364A50" } },
            h("span", { style: { fontWeight: "700" } }, "胶囊记录频率（每满几条记录一次）"),
            h(
              "div",
              { style: { display: "inline-flex", alignItems: "center", gap: "4px" } },
              h("input", {
                type: "number",
                min: 6,
                max: 200,
                step: 1,
                value: triggerMsgs,
                onChange: (e) => {
                  const raw = parseInt(e.target.value, 10);
                  if (!Number.isNaN(raw)) {
                    setTriggerMsgs(raw);
                    if (raw >= 6 && raw <= 200) {
                      const curMap = (getPrefs().perChatTriggerMessages || {});
                      savePrefs({ perChatTriggerMessages: { ...curMap, [charId]: raw } });
                    }
                  }
                },
                onBlur: (e) => updateTriggerMsgs(e.target.value),
                style: {
                  width: "54px",
                  padding: "3px 6px",
                  borderRadius: "6px",
                  border: "1px solid #C5D6DB",
                  background: "#FFFFFF",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "#2F5866",
                  textAlign: "center"
                }
              }),
              h("span", { style: { fontSize: "11px", color: "#6F8085" } }, "条")
            )
          ),
          h(
            "div",
            { style: { display: "flex", gap: "5px", flexWrap: "wrap" } },
            [15, 24, 40, 60, 100].map((preset) =>
              h(
                "button",
                {
                  key: preset,
                  type: "button",
                  onClick: () => updateTriggerMsgs(preset),
                  style: {
                    padding: "2px 8px",
                    borderRadius: "999px",
                    border: triggerMsgs === preset ? "1px solid #2F5866" : "1px solid #D3E0E4",
                    background: triggerMsgs === preset ? "#2F5866" : "#FFFFFF",
                    color: triggerMsgs === preset ? "#FFFFFF" : "#566B72",
                    fontSize: "10.5px",
                    fontWeight: triggerMsgs === preset ? "700" : "500",
                    cursor: "pointer"
                  }
                },
                `${preset}条`
              )
            )
          )
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => setDrawerOpen(true),
            style: {
              width: "100%",
              padding: "8px",
              borderRadius: "9px",
              border: "1px solid #D5E2E6",
              background: "#F2F7F8",
              color: "#2F5866",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer"
            }
          },
          "打开记忆工作台（查看胶囊 / 日总结 / 向量配置）›"
        ),
        global.ThirteenProvincesEngine &&
          h(
            "button",
            {
              type: "button",
              onClick: () =>
                global.ThirteenProvincesEngine.openModal({
                  charId,
                  charName: chatData.name || (chatData.profile && chatData.profile.name) || "名士",
                  userName: "主公"
                }),
              style: {
                width: "100%",
                padding: "8px",
                borderRadius: "9px",
                border: "1px solid rgba(168, 45, 45, 0.28)",
                background: "linear-gradient(135deg, #FAF3EC 0%, #F7EAE6 100%)",
                color: "#9B2C2C",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "🗺️ 打开东汉十三州密卷（主公画像 / 金兰契 / 绣衣卷宗）›"
          )
      ),
      h(CompanionMemoryDrawerModal, {
        isOpen: drawerOpen,
        onClose: () => setDrawerOpen(false),
        chatData
      }),
      h(ZhangLiaoMemoryGuideModal, {
        isOpen: guideOpen,
        onClose: () => setGuideOpen(false)
      })
    );
  }

  const api = {
    TRIGGER_TOKENS,
    ROUND_CAP,
    MESSAGE_CAP,
    KEEP_ROUNDS,
    CAPSULE_BUDGET,
    hydratePrefs,
    getPrefs,
    savePrefs,
    isEnabledForChat,
    resetForTest,
    estimateTokens,
    groupRounds,
    segmentDayMessages,
    getCapsules,
    dbGetAllByChar,
    dbPut,
    dbDelete,
    STORE_CAPSULES,
    STORE_SUMMARIES,
    folioCompressOnce,
    buildFolioContext,
    summarizeDay,
    searchDaySummaries,
    readDayEvidence,
    readDayFromHistoryStore,
    filterCandidatePool,
    parsePickIndices,
    recallGatePick,
    renderRecallBlock,
    buildCachedLayout,
    applyLayoutForSoloChat,
    onAfterSoloReply,
    exportCharBackup,
    importCharBackup,
    computeEmbedding,
    cosineSimilarity,
    callPickerLlmText,
    loadRawHistoryForChar,
    CompanionMemoryEntryCard,
    CompanionMemoryDrawerModal
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.CompanionMemoryEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

