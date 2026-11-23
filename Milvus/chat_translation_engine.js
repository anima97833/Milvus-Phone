/**
 * Ano-phone 传讯双语翻译引擎（含西凉羌语双轨特色）
 * - 独立 IndexedDB: milvus_translation_studio_idb (零 localStorage 占用)
 * - 单次主 LLM 双语标签输出（零外部翻译 API、零 CORS、零二次延迟）
 * - 原创双轨西凉羌语（西凉边城混语风 / 全句尔玛音译风）+ 真实羌语与代号鸢词表锚点
 * - 4 级容错解析 + 历史/记忆双模式剥离 + 单条旧消息补翻缓存
 * - 内置进阶设置配置卡 TranslationSettingsCard 与双样式气泡渲染组件 BilingualMessageView
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_translation_studio_idb";
  const DB_VERSION = 1;
  const STORE_CONFIGS = "char_configs";
  const STORE_CACHE = "msg_cache";
  const CHANGE_EVENT = "milvus-chat-translation-changed";
  const BILINGUAL_SEP = "\n%%BILINGUAL%%\n";
  const PHONETIC_SEP = "\n%%PHONETIC%%\n";
  const MAX_LANG_LEN = 24;

  // ==========================================
  // 1. 语种预设 & 真实尔玛羌语（Rma）全句词表与语法锚点
  // ==========================================
  const QIANG_GLOSSARY = [
    { word: "qa", meaning: "我" },
    { word: "un / ʔũ", meaning: "你" },
    { word: "the", meaning: "他/她" },
    { word: "qale", meaning: "我们" },
    { word: "Rma", meaning: "尔玛/羌人" },
    { word: "Huabo", meaning: "花勃（美人/夸人/战马）" },
    { word: "Guge", meaning: "古格（兄长/尊称）" },
    { word: "Mia / Ama", meaning: "米阿（母亲）" },
    { word: "Apa", meaning: "阿爸（父亲）" },
    { word: "Ayi", meaning: "阿依（姑娘）" },
    { word: "naji", meaning: "好/吉祥/平安" },
    { word: "asu", meaning: "多谢/感念" },
    { word: "mə-", meaning: "否定前缀（不/没，如 mə-naji=不好）" },
    { word: "dze", meaning: "吃" },
    { word: "thi", meaning: "喝" },
    { word: "ka / kə", meaning: "去/走" },
    { word: "la", meaning: "来" },
    { word: "xe / ɕi", meaning: "看/望" },
    { word: "leba", meaning: "酒" },
    { word: "sabi", meaning: "酥油/干粮" },
    { word: "tsə", meaning: "水" },
    { word: "mɔ", meaning: "火" },
    { word: "ʁu / ru", meaning: "马" },
    { word: "gesa", meaning: "勇士" },
    { word: "kare", meaning: "雪山/关山" },
    { word: "pə", meaning: "今日/现在" },
    { word: "ɲi / nyi", meaning: "夜晚" }
  ];

  const LANG_PRESETS = [
    { id: "中文", label: "中文", short: "中文", icon: "🇨🇳" },
    { id: "English", label: "English", short: "英语", icon: "🇬🇧" },
    { id: "qiang_full", label: "羌语（全羌语）", short: "羌语", icon: "🏔️", isQiang: true, mode: "full" },
    { id: "日本語", label: "日本語", short: "日语", icon: "🇯🇵" },
    { id: "한국어", label: "한국어", short: "韩语", icon: "🇰🇷" },
    { id: "Français", label: "Français", short: "法语", icon: "🇫🇷" },
    { id: "Español", label: "Español", short: "西语", icon: "🇪🇸" },
    { id: "Deutsch", label: "Deutsch", short: "德语", icon: "🇩🇪" },
    { id: "Русский", label: "Русский", short: "俄语", icon: "🇷🇺" },
    { id: "粤语", label: "粤语", short: "粤语", icon: "🏮" },
    { id: "文言", label: "文言官话", short: "文言", icon: "📜" },
    { id: "custom", label: "自定义", short: "自定义", icon: "✏️" }
  ];

  const SOURCE_PRESETS = [
    { id: "中文", label: "中文", short: "中文", icon: "🇨🇳" },
    { id: "English", label: "English", short: "英语", icon: "🇬🇧" },
    { id: "qiang_full", label: "羌语（全羌语）", short: "羌语", icon: "🏔️", isQiang: true, mode: "full" },
    { id: "日本語", label: "日本語", short: "日语", icon: "🇯🇵" },
    { id: "한국어", label: "한국어", short: "韩语", icon: "🇰🇷" },
    { id: "custom", label: "自定义", short: "自定义", icon: "✏️" }
  ];

  const TARGET_PRESETS = LANG_PRESETS;

  const DEFAULT_CHAR_CONFIG = {
    enabled: false,
    sourceLang: "中文",
    customSourceLang: "",
    targetLang: "qiang_full",
    customTargetLang: "",
    displayStyle: "bubble", // "bubble" | "subtitle"
    defaultExpanded: true,
    showPhonetic: true,
    showLangBadge: true
  };

  function normalizeLangLabel(input) {
    return String(input == null ? "" : input)
      .replace(/<[^>]*>/g, " ")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/[<>{}\[\]`"'\\|#$%^*]/g, "")
      .replace(/[;；:：!?！？。]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_LANG_LEN)
      .trim();
  }

  function resolveLangMeta(langId, customVal, fallbackLabel = "中文") {
    // 兼容旧版 qiang_mix 自动升级为全羌语
    const normalizedId = langId === "qiang_mix" ? "qiang_full" : langId;
    if (normalizedId === "custom") {
      const cleaned = normalizeLangLabel(customVal) || fallbackLabel;
      return { id: "custom", label: cleaned, short: cleaned, icon: "🌐", isQiang: false };
    }
    const found = LANG_PRESETS.find((p) => p.id === normalizedId);
    if (found) return found;
    const cleaned = normalizeLangLabel(normalizedId) || fallbackLabel;
    return { id: cleaned, label: cleaned, short: cleaned, icon: "🌐", isQiang: false };
  }

  function resolveSourceMeta(cfg) {
    const c = cfg || DEFAULT_CHAR_CONFIG;
    return resolveLangMeta(c.sourceLang, c.customSourceLang, "中文");
  }

  function resolveTargetMeta(cfg) {
    const c = cfg || DEFAULT_CHAR_CONFIG;
    return resolveLangMeta(c.targetLang, c.customTargetLang, "English");
  }

  // ==========================================
  // 2. 存储层（IndexedDB + 内存同步缓存，零 localStorage）
  // ==========================================
  let _dbPromise = null;
  let _memConfigs = new Map();
  let _memCache = new Map();
  const _cfgSyncCache = new Map();

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
          if (!db.objectStoreNames.contains(STORE_CACHE)) {
            const st = db.createObjectStore(STORE_CACHE, { keyPath: "cacheKey" });
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
      return storeName === STORE_CONFIGS ? _memConfigs.get(key) || null : _memCache.get(key) || null;
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
      else _memCache.set(record.cacheKey, record);
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

  function dispatchChanged(charId) {
    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { charId: String(charId || "") } }));
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
    const next = {
      ...cur,
      ...(patch || {}),
      charId: cid,
      customSourceLang:
        patch && patch.customSourceLang !== undefined
          ? normalizeLangLabel(patch.customSourceLang)
          : cur.customSourceLang,
      customTargetLang:
        patch && patch.customTargetLang !== undefined
          ? normalizeLangLabel(patch.customTargetLang)
          : cur.customTargetLang,
      targetLang:
        patch && patch.targetLang !== undefined
          ? (patch.targetLang === "custom" ? "custom" : normalizeLangLabel(patch.targetLang) || "English")
          : cur.targetLang || "English",
      displayStyle:
        (patch && patch.displayStyle === "subtitle") || (!patch?.displayStyle && cur.displayStyle === "subtitle")
          ? "subtitle"
          : "bubble",
      updatedAt: Date.now()
    };
    _cfgSyncCache.set(cid, next);
    await idbPut(STORE_CONFIGS, next);
    dispatchChanged(cid);
    return next;
  }

  function _resetForTests() {
    _memConfigs = new Map();
    _memCache = new Map();
    _cfgSyncCache.clear();
  }

  // ==========================================
  // 3. System Prompt 生成（支持双轨西凉羌语词表锚点）
  // ==========================================
  function buildSideRule(tagName, meta) {
    const glossaryText = QIANG_GLOSSARY.map((g) => `${g.word}=${g.meaning}`).join("；");
    if (meta.isQiang) {
      return `- <${tagName}> 必须使用【100% 纯全羌语（尔玛语 Rma 拉丁拼写）】，严禁夹杂任何中文汉字、严禁中羌混杂、严禁混入英语或藏/蒙语！请严格遵循羌语 SOV（主语-宾语-动词）语序，否定用前缀 mə-，疑问句尾加 -a/-na，优先组合下方真实尔玛羌语词表（例：Huabo, pə nyi sabi dze, leba thi-na?）。核心词表：${glossaryText}。`;
    }
    return `- <${tagName}> 必须使用自然地道、贴合角色人设与口语习惯的「${meta.label}」，严禁机翻腔。`;
  }

  function buildTranslationSystemPrompt(charId, overrideCfg = null) {
    const cfg = overrideCfg || getCharConfigSync(charId);
    if (!cfg || !cfg.enabled) return "";

    const src = resolveSourceMeta(cfg);
    const tgt = resolveTargetMeta(cfg);
    const needPhonetic = cfg.showPhonetic !== false && (src.id !== "中文" || tgt.id !== "中文");
    const phoneticSide = src.isQiang ? src.label : tgt.isQiang ? tgt.label : (src.id !== "中文" ? src.label : tgt.label);

    const langRule = `【双语语种规范】\n${buildSideRule("原文", src)}\n${buildSideRule("译文", tgt)}`;
    const formatTemplate = needPhonetic
      ? `<翻译><原文>角色实际说出的${src.label}内容</原文><音译>用常见好念的中文汉字标出「${phoneticSide}」整句的读音谐音</音译><译文>对应的${tgt.label}译文</译文></翻译>`
      : `<翻译><原文>角色实际说出的${src.label}内容</原文><译文>对应的${tgt.label}译文</译文></翻译>`;
    const phoneticRule = needPhonetic
      ? `\n- <音译> 专门给用户看怎么念出「${phoneticSide}」，请用常见易读的中文汉字谐音标出整句读音（如羌语示例：花勃，珀尼萨比泽，勒巴提那？），不要用生僻字，不要写释义。`
      : "";

    return `\n\n### 🌐 对话双语输出规范（最高格式优先级）
当前已开启「${src.label} → ${tgt.label}」双语输出。你的每一条普通文字气泡都必须严格使用如下格式输出：
${formatTemplate}

${langRule}${phoneticRule}

【格式铁律】
1. 每条独立文字消息都用一组完整的 ${needPhonetic ? "<翻译><原文>...</原文><音译>...</音译><译文>...</译文></翻译>" : "<翻译><原文>...</原文><译文>...</译文></翻译>"} 包裹，不要遗漏闭合标签，不要输出额外解释。
2. 若同时开启了 <语音> 功能，发语音时只写 <语音>...</语音>（不套入 <翻译> 标签），文字与语音严禁互相嵌套。
3. 严禁在标签外重复输出同一句话，严禁输出 %%BILINGUAL%% 或 %%PHONETIC%% 等内部标记。`;
  }

  // ==========================================
  // 4. 4 级容错解析 & 历史/记忆双模式剥离
  // ==========================================
  const VOICE_TAG_RE = /<语音(?:\s+[^>]*)?>[\s\S]*?<\/语音>/gi;

  function stripLooseTags(str) {
    return String(str || "")
      .replace(/[<＜]\s*\/?\s*(?:翻译|翻譯|原文|音译|音譯|读音|讀音|译文|譯文)\s*[>＞]/gi, "")
      .replace(/%%(?:BILINGUAL|PHONETIC)%%/gi, "")
      .trim();
  }

  function parseBilingualText(rawText) {
    const text = String(rawText == null ? "" : rawText);
    if (!text.trim()) {
      return { isBilingual: false, original: "", phonetic: "", translated: "", raw: text };
    }

    // 1. 优先识别已规范化的 %%BILINGUAL%%（及可选 %%PHONETIC%%）分隔格式
    if (/%%BILINGUAL%%/i.test(text)) {
      const parts = text.split(/%%BILINGUAL%%/i);
      const head = parts[0] || "";
      const trans = stripLooseTags(parts.slice(1).join("\n"));
      let orig = "";
      let phon = "";
      if (/%%PHONETIC%%/i.test(head)) {
        const hp = head.split(/%%PHONETIC%%/i);
        orig = stripLooseTags(hp[0]);
        phon = stripLooseTags(hp.slice(1).join(" "));
      } else {
        orig = stripLooseTags(head);
      }
      if (orig && trans) {
        return { isBilingual: true, original: orig, phonetic: phon, translated: trans, raw: text };
      }
      return { isBilingual: false, original: orig || trans, phonetic: "", translated: "", raw: text };
    }

    // 2. 保护 <语音> 块，防止误把语音条当双语文本破坏
    const hasVoice = VOICE_TAG_RE.test(text);
    VOICE_TAG_RE.lastIndex = 0;
    const textForParse = hasVoice ? text.replace(VOICE_TAG_RE, "").trim() : text;

    // 3. 标准 + 全角/简繁/空格变体标签解析（支持可选 <音译>/<读音> 与多组 <翻译> 合并）
    const pairRe =
      /[<＜]\s*(?:翻译|翻譯)\s*[>＞]\s*[<＜]\s*原文\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*原文\s*[>＞]\s*(?:[<＜]\s*(?:音译|音譯|读音|讀音)\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*(?:音译|音譯|读音|讀音)\s*[>＞]\s*)?[<＜]\s*(?:译文|譯文)\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*(?:译文|譯文)\s*[>＞]\s*(?:[<＜]\s*\/\s*(?:翻译|翻譯)\s*[>＞])?/gi;

    const origParts = [];
    const phonParts = [];
    const transParts = [];
    let matched = false;
    let m;
    while ((m = pairRe.exec(textForParse)) !== null) {
      matched = true;
      const o = stripLooseTags(m[1]);
      const p = stripLooseTags(m[2]);
      const t = stripLooseTags(m[3]);
      if (o) origParts.push(o);
      if (p) phonParts.push(p);
      if (t) transParts.push(t);
    }
    if (matched && origParts.length > 0 && transParts.length > 0) {
      return {
        isBilingual: true,
        original: origParts.join("\n"),
        phonetic: phonParts.join("\n"),
        translated: transParts.join("\n"),
        raw: text
      };
    }

    // 4. 容错：未包 <翻译> 但直接写了 <原文>...</原文>[<音译>...</音译>]<译文>...</译文>
    const barePairRe =
      /[<＜]\s*原文\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*原文\s*[>＞]\s*(?:[<＜]\s*(?:音译|音譯|读音|讀音)\s*[>＞]([\s\S]*?)[<＜]\s*\/\s*(?:音译|音譯|读音|讀音)\s*[>＞]\s*)?[<＜]\s*(?:译文|譯文)\s*[>＞]([\s\S]*?)(?:[<＜]\s*\/\s*(?:译文|譯文)\s*[>＞]|$)/i;
    const bm = textForParse.match(barePairRe);
    if (bm && stripLooseTags(bm[1]) && stripLooseTags(bm[3])) {
      return {
        isBilingual: true,
        original: stripLooseTags(bm[1]),
        phonetic: stripLooseTags(bm[2]),
        translated: stripLooseTags(bm[3]),
        raw: text
      };
    }

    // 5. 兜底：若只存在残缺孤立标签，剥离干净避免裸露给用户
    const cleaned = stripLooseTags(text);
    return { isBilingual: false, original: cleaned, phonetic: "", translated: "", raw: text };
  }

  function normalizeForStorage(rawText) {
    const parsed = parseBilingualText(rawText);
    if (parsed.isBilingual) {
      if (parsed.phonetic) {
        return `${parsed.original}${PHONETIC_SEP}${parsed.phonetic}${BILINGUAL_SEP}${parsed.translated}`;
      }
      return `${parsed.original}${BILINGUAL_SEP}${parsed.translated}`;
    }
    return parsed.original || String(rawText || "");
  }

  /**
   * 历史回传 / 记忆入库清洗（幂等）
   * @param {string} text
   * @param {"original"|"translated"} mode - "original" 给主 LLM 历史，"translated" 给记忆库（优先保留中文）
   */
  function stripBilingualForHistory(text, mode = "original") {
    const raw = String(text == null ? "" : text);
    if (!raw) return "";
    const parsed = parseBilingualText(raw);
    if (!parsed.isBilingual) return parsed.original || raw;
    if (mode === "translated") {
      return parsed.translated || parsed.original;
    }
    return parsed.original || parsed.translated;
  }

  // ==========================================
  // 5. 旧消息 / 漏标签消息：单条补翻与 IndexedDB 缓存
  // ==========================================
  function makeCacheKey(charId, msgId) {
    return `${String(charId || "")}::${String(msgId || "")}`;
  }

  async function getCachedTranslation(charId, msgId) {
    if (!charId || !msgId) return null;
    return idbGet(STORE_CACHE, makeCacheKey(charId, msgId));
  }

  async function callTranslationLlm(messages, opts = {}) {
    if (typeof opts.customChatFn === "function") {
      return opts.customChatFn(messages, opts);
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
    if (!cfg || !cfg.url) {
      throw new Error("未检测到可用 API 配置，请先在设置中配置主接口");
    }
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
        max_tokens: 600
      })
    });
    if (!resp.ok) throw new Error(`补翻请求失败 (${resp.status})`);
    const json = await resp.json();
    return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
  }

  async function translateSingleMessage(charId, msgId, rawText, opts = {}) {
    const cid = String(charId || "");
    const cleanText = stripBilingualForHistory(rawText, "original");
    if (!cleanText.trim()) return { original: "", translated: "", fromCache: false };

    if (!opts.force && cid && msgId) {
      const hit = await getCachedTranslation(cid, msgId);
      if (hit && hit.translated && hit.original === cleanText) {
        return { ...hit, fromCache: true };
      }
    }

    const cfg = opts.config || (await hydrateCharConfig(cid));
    const src = resolveSourceMeta(cfg);
    const tgt = resolveTargetMeta(cfg);

    const glossaryHint =
      src.isQiang || tgt.isQiang
        ? `\n若目标为羌语，必须输出 100% 纯全羌语（尔玛语 Rma 拉丁拼写，SOV 语序，严禁夹杂任何中文汉字或中羌混杂）。参考尔玛羌语词表：${QIANG_GLOSSARY.map((g) => `${g.word}=${g.meaning}`).join("；")}。`
        : "";
    const sys = `你是精准的对话翻译官。请将下面这段「${src.label}」台词翻译为自然流畅的「${tgt.label}」，保留原语气与情感，只输出译文本身，不要加任何前缀、引号或解释。${glossaryHint}`;

    const reply = await callTranslationLlm(
      [
        { role: "system", content: sys },
        { role: "user", content: cleanText }
      ],
      opts
    );
    const translated = String(reply || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    if (!translated) throw new Error("补翻结果为空");

    const rec = {
      cacheKey: makeCacheKey(cid, msgId || `tmp_${Date.now()}`),
      charId: cid,
      msgId: String(msgId || ""),
      original: cleanText,
      translated,
      sourceLang: src.label,
      targetLang: tgt.label,
      updatedAt: Date.now()
    };
    if (cid && msgId) {
      await idbPut(STORE_CACHE, rec);
    }
    return { ...rec, fromCache: false };
  }

  // ==========================================
  // 6. 样式注入 & React UI 组件
  // ==========================================
  function ensureStylesInjected() {
    if (typeof document === "undefined") return;
    if (document.getElementById("cte-translation-styles")) return;
    const style = document.createElement("style");
    style.id = "cte-translation-styles";
    style.textContent = `
      .cte-bubble-wrap { display: flex; flex-direction: column; gap: 4px; }
      .cte-divider { height: 1px; background: currentColor; opacity: 0.16; margin: 3px 0 2px; }
      .cte-phonetic-text { font-size: 0.8em; line-height: 1.42; opacity: 0.72; font-style: italic; white-space: pre-wrap; word-break: break-word; }
      .cte-trans-text { font-size: 0.88em; line-height: 1.5; opacity: 0.86; white-space: pre-wrap; word-break: break-word; }
      .cte-lang-chip {
        display: inline-flex; align-items: center; gap: 3px;
        font-size: 10px; padding: 1px 6px; border-radius: 999px;
        background: rgba(0, 0, 0, 0.08); opacity: 0.78; margin-top: 2px; align-self: flex-start;
        cursor: pointer; border: none; color: inherit;
      }
      .cte-subtitle-box {
        margin-top: 5px; padding: 2px 4px;
        color: #ffffff; font-weight: 700; font-size: 13.5px; line-height: 1.42;
        white-space: pre-wrap; word-break: break-word;
        text-shadow:
          -1px -1px 0 rgba(15,15,18,0.92),
           1px -1px 0 rgba(15,15,18,0.92),
          -1px  1px 0 rgba(15,15,18,0.92),
           1px  1px 0 rgba(15,15,18,0.92),
           0px  2px 4px rgba(0,0,0,0.65);
      }
      .cte-mini-action {
        border: none; background: transparent; color: inherit; opacity: 0.58;
        font-size: 11px; padding: 1px 4px; cursor: pointer; align-self: flex-end;
      }
      .cte-mini-action:hover { opacity: 0.95; text-decoration: underline; }
      .cte-pill {
        border: 1px solid #D9D4C8; background: #FAF8F3; color: #3A352F;
        border-radius: 999px; padding: 4px 9px; font-size: 11.5px; cursor: pointer;
        transition: all 0.15s;
      }
      .cte-pill.active { background: #5E6756; color: #FFFFFF; border-color: #5E6756; font-weight: 600; }
      .cte-pill.qiang.active { background: #9B2C2C; border-color: #9B2C2C; }
    `;
    document.head.appendChild(style);
  }

  /**
   * 进阶设置配置卡：自动归类至「传讯 → 对话偏好设置 → 进阶设置」
   */
  function TranslationSettingsCard({ chatData, isGroup }) {
    if (isGroup || !chatData?.id || typeof React === "undefined") return null;
    ensureStylesInjected();
    const h = React.createElement;
    const { useState, useEffect } = React;
    const charId = String(chatData.id);
    const [cfg, setCfg] = useState(() => getCharConfigSync(charId));

    useEffect(() => {
      let alive = true;
      hydrateCharConfig(charId).then((loaded) => alive && setCfg(loaded));
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
      const optimistic = { ...cfg, ...patch };
      setCfg(optimistic);
      saveCharConfig(charId, patch).then((saved) => setCfg(saved));
    };

    const srcMeta = resolveSourceMeta(cfg);
    const tgtMeta = resolveTargetMeta(cfg);
    const showQiangTip = srcMeta.isQiang || tgtMeta.isQiang;
    const qiangMode = srcMeta.isQiang ? srcMeta.mode : tgtMeta.mode;

    return h(
      "div",
      {
        "data-settings-item": "chat_translation",
        "data-settings-group": "advanced",
        style: {
          background: "#FFFFFF",
          border: "1px solid #E6E3DA",
          borderRadius: "12px",
          padding: "12px",
          marginTop: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }
      },
      // 标题行 + 开关
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" } },
        h(
          "div",
          { style: { flex: 1 } },
          h(
            "div",
            { style: { fontSize: "13px", fontWeight: "800", color: "#2F3530", display: "flex", alignItems: "center", gap: "5px" } },
            "🌐 对话输出翻译（双语 / 西凉羌语）"
          ),
          h(
            "div",
            { style: { fontSize: "11px", color: "#7B7A72", marginTop: "2px" } },
            cfg.enabled
              ? `已开启：${srcMeta.label} → ${tgtMeta.label}（${cfg.displayStyle === "subtitle" ? "影视字幕" : "气泡对照"}）`
              : "单次输出原文+译文，支持中/英/羌语及多国译语与自定义"
          )
        ),
        h("input", {
          type: "checkbox",
          checked: Boolean(cfg.enabled),
          onChange: (e) => update({ enabled: e.target.checked }),
          style: { width: "18px", height: "18px", cursor: "pointer" }
        })
      ),

      // 展开配置区
      cfg.enabled &&
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "10px", paddingTop: "6px", borderTop: "1px dashed #E6E2D8" } },

          // 名士输出语种（原文）
          h(
            "div",
            null,
            h("div", { style: { fontSize: "11.5px", fontWeight: 700, color: "#52514A", marginBottom: "6px" } }, "名士输出语种（原文）"),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
              SOURCE_PRESETS.map((p) =>
                h(
                  "button",
                  {
                    key: p.id,
                    type: "button",
                    className: `cte-pill ${p.isQiang ? "qiang" : ""} ${cfg.sourceLang === p.id ? "active" : ""}`,
                    onClick: () => update({ sourceLang: p.id })
                  },
                  `${p.icon} ${p.label}`
                )
              )
            ),
            cfg.sourceLang === "custom" &&
              h("input", {
                type: "text",
                placeholder: "输入自定义原文语种（如：粤语、法语、古吴语）",
                value: cfg.customSourceLang || "",
                onChange: (e) => update({ customSourceLang: e.target.value }),
                style: {
                  width: "100%",
                  marginTop: "6px",
                  padding: "6px 9px",
                  borderRadius: "8px",
                  border: "1px solid #D8D3C6",
                  fontSize: "12px",
                  boxSizing: "border-box"
                }
              })
          ),

          // 译文语种（译语，提供完整多语种 + 自定义）
          h(
            "div",
            null,
            h("div", { style: { fontSize: "11.5px", fontWeight: 700, color: "#52514A", marginBottom: "6px" } }, "译文语种（译语）"),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
              TARGET_PRESETS.map((p) =>
                h(
                  "button",
                  {
                    key: p.id,
                    type: "button",
                    className: `cte-pill ${p.isQiang ? "qiang" : ""} ${cfg.targetLang === p.id ? "active" : ""}`,
                    onClick: () => update({ targetLang: p.id })
                  },
                  `${p.icon} ${p.label}`
                )
              )
            ),
            cfg.targetLang === "custom" &&
              h("input", {
                type: "text",
                placeholder: "输入自定义译语（如：拉丁语、古希腊语、四川话、闽南语）",
                value: cfg.customTargetLang || "",
                onChange: (e) => update({ customTargetLang: e.target.value }),
                style: {
                  width: "100%",
                  marginTop: "6px",
                  padding: "6px 9px",
                  borderRadius: "8px",
                  border: "1px solid #D8D3C6",
                  fontSize: "12px",
                  boxSizing: "border-box"
                }
              })
          ),

          // 羌语词表小贴士（原文或译语任一侧选羌语即展示）
          showQiangTip &&
            h(
              "div",
              {
                style: {
                  background: "#FAF2EE",
                  border: "1px solid rgba(155,44,44,0.22)",
                  borderRadius: "9px",
                  padding: "8px 10px",
                  fontSize: "11px",
                  lineHeight: 1.55,
                  color: "#6B2D2D"
                }
              },
              h(
                "div",
                { style: { fontWeight: 700, marginBottom: "3px" } },
                "🏔️ 纯全羌语（尔玛语 Rma 拉丁拼写 · SOV 语序 · 严禁中羌混杂）"
              ),
              "内置词表锚点：",
              QIANG_GLOSSARY.slice(0, 10)
                .map((g) => `${g.word}(${g.meaning.split("/")[0].trim()})`)
                .join(" · ")
            ),

          // 展示样式
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
            h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: "#52514A" } }, "展示样式："),
            h(
              "button",
              {
                type: "button",
                className: `cte-pill ${cfg.displayStyle !== "subtitle" ? "active" : ""}`,
                onClick: () => update({ displayStyle: "bubble" })
              },
              "💬 气泡对照"
            ),
            h(
              "button",
              {
                type: "button",
                className: `cte-pill ${cfg.displayStyle === "subtitle" ? "active" : ""}`,
                onClick: () => update({ displayStyle: "subtitle" })
              },
              "🎬 影视字幕"
            )
          ),

          // 默认展开开关 + 读音音译开关
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#55544E", cursor: "pointer" } },
            h("input", {
              type: "checkbox",
              checked: cfg.showPhonetic !== false,
              onChange: (e) => update({ showPhonetic: e.target.checked })
            }),
            "🔊 附带中文谐音/读音音译（方便直接念出羌语或外语）"
          ),
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#55544E", cursor: "pointer" } },
            h("input", {
              type: "checkbox",
              checked: cfg.defaultExpanded !== false,
              onChange: (e) => update({ defaultExpanded: e.target.checked })
            }),
            "默认展开译文（取消勾选后点击气泡内「译」按钮再展开）"
          )
        )
    );
  }

  /**
   * 气泡双语渲染组件（兼容气泡对照 / 影视描边字幕 / 单条旧消息补翻）
   */
  function BilingualMessageView({ charId, msgId, text, renderPlain }) {
    if (typeof React === "undefined") return null;
    ensureStylesInjected();
    const h = React.createElement;
    const { useState, useEffect } = React;

    const cid = String(charId || "");
    const [cfg, setCfg] = useState(() => getCharConfigSync(cid));
    const parsed = parseBilingualText(text);
    const [expanded, setExpanded] = useState(() => cfg.defaultExpanded !== false);
    const [manualTrans, setManualTrans] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      let alive = true;
      if (cid) {
        hydrateCharConfig(cid).then((c) => {
          if (!alive) return;
          setCfg(c);
          setExpanded(c.defaultExpanded !== false);
        });
        if (!parsed.isBilingual && msgId) {
          getCachedTranslation(cid, msgId).then((hit) => {
            if (alive && hit && hit.translated) setManualTrans(hit.translated);
          });
        }
      }
      const onChange = (ev) => {
        if (!ev?.detail?.charId || ev.detail.charId === cid) {
          const next = getCharConfigSync(cid);
          setCfg(next);
          setExpanded(next.defaultExpanded !== false);
        }
      };
      global.addEventListener(CHANGE_EVENT, onChange);
      return () => {
        alive = false;
        global.removeEventListener(CHANGE_EVENT, onChange);
      };
    }, [cid, msgId, parsed.isBilingual]);

    const origText = parsed.original || String(text || "");
    const phoneticText = parsed.phonetic || "";
    const transText = parsed.isBilingual ? parsed.translated : manualTrans;
    const renderOrig = typeof renderPlain === "function" ? renderPlain(origText) : origText;

    // 未含译文：如果未开启翻译直接走纯原文；已开启翻译则给一个极轻的「译」补翻按钮
    if (!transText) {
      if (!cfg.enabled) return renderOrig;
      return h(
        "div",
        { className: "cte-bubble-wrap" },
        h("div", null, renderOrig),
        h(
          "button",
          {
            type: "button",
            className: "cte-mini-action",
            disabled: loading,
            onClick: async (e) => {
              e.stopPropagation();
              setLoading(true);
              try {
                const res = await translateSingleMessage(cid, msgId, origText);
                if (res && res.translated) {
                  setManualTrans(res.translated);
                  setExpanded(true);
                }
              } catch (err) {
                console.warn("[ChatTranslation] 单条补翻失败:", err);
              } finally {
                setLoading(false);
              }
            }
          },
          loading ? "翻译中…" : "🌐 译"
        )
      );
    }

    // 影视描边字幕模式
    if (cfg.displayStyle === "subtitle") {
      return h(
        "div",
        { className: "cte-bubble-wrap" },
        h("div", null, renderOrig),
        phoneticText && cfg.showPhonetic !== false && h("div", { className: "cte-phonetic-text" }, `🔊 ${phoneticText}`),
        expanded
          ? h("div", { className: "cte-subtitle-box", onClick: (e) => { e.stopPropagation(); setExpanded(false); } }, transText)
          : h(
              "button",
              {
                type: "button",
                className: "cte-lang-chip",
                onClick: (e) => { e.stopPropagation(); setExpanded(true); }
              },
              "🎬 展开字幕"
            )
      );
    }

    // 默认：气泡内双语对照模式
    return h(
      "div",
      { className: "cte-bubble-wrap" },
      h("div", null, renderOrig),
      phoneticText && cfg.showPhonetic !== false && h("div", { className: "cte-phonetic-text" }, `🔊 ${phoneticText}`),
      expanded
        ? h(
            React.Fragment,
            null,
            h("div", { className: "cte-divider" }),
            h("div", { className: "cte-trans-text" }, transText),
            h(
              "button",
              {
                type: "button",
                className: "cte-lang-chip",
                onClick: (e) => { e.stopPropagation(); setExpanded(false); }
              },
              `${resolveSourceMeta(cfg).short} → ${resolveTargetMeta(cfg).short} ▴`
            )
          )
        : h(
            "button",
            {
              type: "button",
              className: "cte-lang-chip",
              onClick: (e) => { e.stopPropagation(); setExpanded(true); }
            },
            "🌐 查看译文 ▾"
          )
    );
  }

  function renderBubbleContent({ charId, msgId, text, renderPlain }) {
    if (typeof React === "undefined") {
      return typeof renderPlain === "function" ? renderPlain(text) : text;
    }
    const cfg = getCharConfigSync(charId);
    const hasBilingualMarkers = /%%BILINGUAL%%|[<＜]\s*(?:翻译|翻譯|原文)\s*[>＞]/i.test(String(text || ""));
    if (!cfg.enabled && !hasBilingualMarkers) {
      return typeof renderPlain === "function" ? renderPlain(text) : text;
    }
    return React.createElement(BilingualMessageView, { charId, msgId, text, renderPlain });
  }

  // ==========================================
  // 7. 公共 API 导出
  // ==========================================
  const api = {
    DB_NAME,
    BILINGUAL_SEP,
    QIANG_GLOSSARY,
    LANG_PRESETS,
    SOURCE_PRESETS,
    TARGET_PRESETS,
    normalizeLangLabel,
    resolveSourceMeta,
    resolveTargetMeta,

    getCharConfigSync,
    hydrateCharConfig,
    saveCharConfig,

    buildTranslationSystemPrompt,
    parseBilingualText,
    normalizeForStorage,
    stripBilingualForHistory,
    getCachedTranslation,
    translateSingleMessage,

    TranslationSettingsCard,
    BilingualMessageView,
    renderBubbleContent,

    _resetForTests
  };

  global.ChatTranslationEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

