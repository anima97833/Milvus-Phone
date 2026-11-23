/**
 * Ano-phone 东汉十三州密卷（Thirteen Provinces Archive）独立模块化引擎
 * - 独立 IndexedDB: milvus_thirteen_provinces_idb (零 localStorage 占用)
 * - 原创正史东汉十三州 × 代号鸢广陵绣衣楼长期记忆体系
 * - 纯前端 BM25 + 显式实体印记 + 可选 Uint8Array 紧凑向量混合检索
 * - 朱砂御批（置顶直通）+ 广陵金兰契（约定追踪）+ 绣衣楼卷宗（合订/启封）+ 密探飞鸢（AI 归州提炼）
 * - 自挂载可视化弹窗 ThirteenProvincesModal（零侵入 Milvus/app.min.js）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_thirteen_provinces_idb";
  const DB_VERSION = 1;

  const STORE_SCROLLS = "province_scrolls";
  const STORE_VECTORS = "scroll_vectors";
  const STORE_DOSSIERS = "case_dossiers";
  const STORE_VOWS = "imperial_vows";
  const STORE_META = "archive_meta";

  const DEFAULT_PREFS = {
    enabled: true,
    autoDigest: true,
    digestInterval: 16,
    maxPinned: 4,
    maxVows: 3,
    maxRecall: 5,
    maxPromptChars: 900,
    dedupThreshold: 0.78,
    summaryOverlapThreshold: 0.65
  };

  const DIGEST_FAIL_COOLDOWN_MS = 10 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

  // ==========================================
  // 1. 东汉十三州元数据与别名归一化
  // ==========================================
  const PROVINCES = [
    {
      id: "yangzhou",
      name: "扬州",
      landmark: "广陵王府",
      icon: "🏯",
      role: "主公画像",
      desc: "主公的喜好、忌口、习惯、性格、称呼与重要背景",
      decayPerHour: 0.9997,
      neverForget: false,
      core: true,
      aliases: ["扬州", "广陵", "广陵王府", "用户", "主公", "主公画像", "yangzhou", "user", "user_room"]
    },
    {
      id: "sili",
      name: "司隶",
      landmark: "洛阳绣衣楼",
      icon: "🦅",
      role: "羁绊与心动",
      desc: "两人的亲密互动、心动瞬间、专属昵称与信任里程碑",
      decayPerHour: 0.9995,
      neverForget: false,
      core: true,
      aliases: ["司隶", "洛阳", "绣衣楼", "羁绊", "亲密", "心动", "sili", "bedroom"]
    },
    {
      id: "xuzhou",
      name: "徐州",
      landmark: "彭城誓约",
      icon: "📜",
      role: "约定与期盼",
      desc: "主公与名士许下的约定、计划与待办之约",
      decayPerHour: 1.0,
      neverForget: true,
      core: true,
      aliases: ["徐州", "彭城", "下邳", "约定", "期盼", "誓约", "xuzhou", "windowsill"]
    },
    {
      id: "jingzhou",
      name: "荆州",
      landmark: "襄阳心纸",
      icon: "🪷",
      role: "名士本心",
      desc: "名士的自我认知、性情底色、内心底线与对主公的誓言",
      decayPerHour: 1.0,
      neverForget: true,
      core: true,
      aliases: ["荆州", "襄阳", "江夏", "心纸", "自我", "本心", "jingzhou", "self", "self_room"]
    },
    {
      id: "yuzhou",
      name: "豫州",
      landmark: "颍川名士",
      icon: "📚",
      role: "学识与谋略",
      desc: "工作、学习、诗书、创作、共谋大计与知识探讨",
      decayPerHour: 0.9988,
      neverForget: false,
      core: true,
      aliases: ["豫州", "许昌", "颍川", "学识", "谋略", "工作", "学习", "yuzhou", "study"]
    },
    {
      id: "yanzhou",
      name: "兖州",
      landmark: "中原烟火",
      icon: "🏮",
      role: "日常琐事",
      desc: "日常闲聊、市井趣事、三餐起居与阶段性生活点滴",
      decayPerHour: 0.9972,
      neverForget: false,
      core: true,
      aliases: ["兖州", "济阴", "陈留", "日常", "闲聊", "琐事", "yanzhou", "living_room"]
    },
    {
      id: "youzhou",
      name: "幽州",
      landmark: "塞北霜雪",
      icon: "❄️",
      role: "未解心事",
      desc: "未消化的困惑、隐藏心事、未揭开的谜团与长期伏笔",
      decayPerHour: 1.0,
      neverForget: true,
      core: true,
      aliases: ["幽州", "塞北", "心事", "伏笔", "困惑", "谜团", "youzhou", "attic"]
    },
    {
      id: "yizhou",
      name: "益州",
      landmark: "巴蜀栈道",
      icon: "⛰️",
      role: "同行与游历",
      desc: "共同出游、线下剧情、重要场景与约会地点回忆",
      decayPerHour: 0.9992,
      neverForget: false,
      core: false,
      aliases: ["益州", "巴蜀", "蜀道", "成都", "游历", "出游", "约会", "yizhou"]
    },
    {
      id: "liangzhou",
      name: "凉州",
      landmark: "西域丝路",
      icon: "🏺",
      role: "信物与珍物",
      desc: "互赠礼物、定情信物、美食茶饮、衣装装扮与收藏偏好",
      decayPerHour: 0.9993,
      neverForget: false,
      core: false,
      aliases: ["凉州", "西域", "丝路", "信物", "礼物", "珍物", "美食", "liangzhou"]
    },
    {
      id: "jizhou",
      name: "冀州",
      landmark: "邺城世家",
      icon: "🏛️",
      role: "故交与人际",
      desc: "提及的其他人物、亲友、同僚、宿敌及人际关系网",
      decayPerHour: 0.9990,
      neverForget: false,
      core: false,
      aliases: ["冀州", "邺城", "世家", "故交", "人际", "亲友", "同僚", "jizhou"]
    },
    {
      id: "qingzhou",
      name: "青州",
      landmark: "东海听涛",
      icon: "🌊",
      role: "情绪与风波",
      desc: "吃醋、争执、哄好、脆弱瞬间、情绪转折与和解记忆",
      decayPerHour: 0.9993,
      neverForget: false,
      core: false,
      aliases: ["青州", "东海", "情绪", "风波", "争执", "吃醋", "和解", "qingzhou"]
    },
    {
      id: "bingzhou",
      name: "并州",
      landmark: "雁门关隘",
      icon: "🛡️",
      role: "危机与守护",
      desc: "生病照料、遭遇困境、挺身而出、共渡难关的守护时刻",
      decayPerHour: 1.0,
      neverForget: true,
      core: false,
      aliases: ["并州", "雁门", "并州关", "危机", "守护", "生病", "照顾", "bingzhou"]
    },
    {
      id: "jiaozhou",
      name: "交州",
      landmark: "南海秘境",
      icon: "🌙",
      role: "梦境与妄念",
      desc: "梦境、奇思妙想、脑洞、角色暗藏的独占欲或隐秘念头",
      decayPerHour: 0.9996,
      neverForget: false,
      core: false,
      aliases: ["交州", "南海", "梦境", "妄念", "脑洞", "隐秘", "jiaozhou"]
    }
  ];

  const PROVINCE_MAP = Object.create(null);
  const PROVINCE_ALIAS_MAP = Object.create(null);
  for (const p of PROVINCES) {
    PROVINCE_MAP[p.id] = p;
    PROVINCE_ALIAS_MAP[p.id.toLowerCase()] = p.id;
    PROVINCE_ALIAS_MAP[p.name.toLowerCase()] = p.id;
    for (const a of p.aliases) {
      PROVINCE_ALIAS_MAP[String(a).toLowerCase()] = p.id;
    }
  }

  function normalizeProvinceId(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "yanzhou";
    if (PROVINCE_ALIAS_MAP[s]) return PROVINCE_ALIAS_MAP[s];
    for (const p of PROVINCES) {
      if (s.includes(p.name) || s.includes(p.id) || s.includes(p.landmark.toLowerCase())) {
        return p.id;
      }
      for (const a of p.aliases) {
        if (a.length >= 2 && s.includes(String(a).toLowerCase())) return p.id;
      }
    }
    return "yanzhou";
  }

  function getProvinceMeta(id) {
    return PROVINCE_MAP[normalizeProvinceId(id)] || PROVINCE_MAP.yanzhou;
  }

  function getImportanceGrade(imp) {
    const n = Number(imp) || 5;
    if (n >= 9) return { label: "绝密", color: "#b91c1c", bg: "rgba(185,28,28,0.12)" };
    if (n >= 7) return { label: "甲等", color: "#c2410c", bg: "rgba(194,65,12,0.12)" };
    if (n >= 5) return { label: "乙等", color: "#a16207", bg: "rgba(161,98,7,0.12)" };
    return { label: "丙等", color: "#64748b", bg: "rgba(100,116,139,0.12)" };
  }

  // ==========================================
  // 2. 存储层（IndexedDB + Node 内存降级适配器）
  // ==========================================
  let _dbPromise = null;
  let _memStores = null;

  function ensureMemStores() {
    if (!_memStores) {
      _memStores = {
        [STORE_SCROLLS]: new Map(),
        [STORE_VECTORS]: new Map(),
        [STORE_DOSSIERS]: new Map(),
        [STORE_VOWS]: new Map(),
        [STORE_META]: new Map()
      };
    }
    return _memStores;
  }

  function hasIndexedDB() {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  }

  function openDb() {
    if (!hasIndexedDB()) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_SCROLLS)) {
            const st = db.createObjectStore(STORE_SCROLLS, { keyPath: "id" });
            st.createIndex("by_char", "charId", { unique: false });
            st.createIndex("by_char_province", ["charId", "province"], { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_VECTORS)) {
            const st = db.createObjectStore(STORE_VECTORS, { keyPath: "scrollId" });
            st.createIndex("by_char", "charId", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_DOSSIERS)) {
            const st = db.createObjectStore(STORE_DOSSIERS, { keyPath: "id" });
            st.createIndex("by_char", "charId", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_VOWS)) {
            const st = db.createObjectStore(STORE_VOWS, { keyPath: "id" });
            st.createIndex("by_char", "charId", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
    return _dbPromise;
  }

  function keyFieldForStore(storeName) {
    if (storeName === STORE_VECTORS) return "scrollId";
    if (storeName === STORE_META) return "key";
    return "id";
  }

  async function dbGet(storeName, key) {
    const db = await openDb();
    if (!db) {
      const m = ensureMemStores()[storeName];
      return m ? m.get(key) || null : null;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(storeName, record) {
    const db = await openDb();
    if (!db) {
      const m = ensureMemStores()[storeName];
      const kf = keyFieldForStore(storeName);
      m.set(record[kf], record);
      return record;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const req = tx.objectStore(storeName).put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbDelete(storeName, key) {
    const db = await openDb();
    if (!db) {
      const m = ensureMemStores()[storeName];
      m.delete(key);
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAllByChar(storeName, charId) {
    const cid = String(charId || "");
    const db = await openDb();
    if (!db) {
      const m = ensureMemStores()[storeName];
      const out = [];
      for (const v of m.values()) {
        if (String(v.charId || "") === cid) out.push(v);
      }
      return out;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const idx = tx.objectStore(storeName).index("by_char");
      const req = idx.getAll(IDBKeyRange.only(cid));
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
  }

  function _resetMemoryStoreForTests() {
    _memStores = null;
    _prefsCache = null;
    _digestRunningByChar = Object.create(null);
    _digestCooldownByChar = Object.create(null);
  }

  // ==========================================
  // 3. 配置读写（全部存 archive_meta，零 localStorage）
  // ==========================================
  let _prefsCache = null;
  let _digestRunningByChar = Object.create(null);
  let _digestCooldownByChar = Object.create(null);

  async function loadPrefs() {
    if (_prefsCache) return _prefsCache;
    try {
      const rec = await dbGet(STORE_META, "prefs");
      _prefsCache = { ...DEFAULT_PREFS, ...(rec && rec.value ? rec.value : {}) };
    } catch (e) {
      _prefsCache = { ...DEFAULT_PREFS };
    }
    return _prefsCache;
  }

  function getPrefsSync() {
    return _prefsCache ? { ..._prefsCache } : { ...DEFAULT_PREFS };
  }

  async function savePrefs(patch) {
    const cur = await loadPrefs();
    const next = { ...cur, ...(patch || {}) };
    _prefsCache = next;
    await dbPut(STORE_META, { key: "prefs", value: next, updatedAt: Date.now() });
    return next;
  }

  async function getCharMeta(charId) {
    const rec = await dbGet(STORE_META, `char_${String(charId)}`);
    return rec && rec.value ? rec.value : { lastDigestedMsgId: null, lastDigestedCount: 0, lastDigestedAt: 0 };
  }

  async function saveCharMeta(charId, patch) {
    const cur = await getCharMeta(charId);
    const next = { ...cur, ...(patch || {}) };
    await dbPut(STORE_META, { key: `char_${String(charId)}`, value: next, updatedAt: Date.now() });
    return next;
  }

  // ==========================================
  // 4. Uint8Array 紧凑向量编解码与余弦相似度
  // ==========================================
  function encodeVectorBytes(arr) {
    if (!arr || !arr.length) return null;
    const f32 = arr instanceof Float32Array ? arr : new Float32Array(arr);
    return new Uint8Array(f32.buffer.slice(f32.byteOffset, f32.byteOffset + f32.byteLength));
  }

  function decodeVectorBytes(u8) {
    if (!u8) return null;
    if (u8 instanceof Float32Array) return u8;
    let bytes = u8;
    if (Array.isArray(u8)) {
      // 兼容备份导入时序列化成数组的场景
      bytes = new Uint8Array(u8);
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4 || bytes.byteLength % 4 !== 0) {
      return null;
    }
    const aligned = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Float32Array(aligned);
  }

  function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      const va = a[i];
      const vb = b[i];
      dot += va * vb;
      na += va * va;
      nb += vb * vb;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  // ==========================================
  // 5. 纯前端中英混合分词 + Okapi BM25 + 显式实体 + 遗忘衰减
  // ==========================================
  const STOP_CHARS = new Set([
    "的", "了", "呢", "啊", "吧", "嘛", "吗", "呀", "哦", "哈", "嗯", "在", "是", "我", "你", "他", "她", "它",
    "这", "那", "就", "也", "都", "很", "还", "和", "与", "跟", "把", "被", "给", "到", "上", "下", "里", "来", "去"
  ]);

  function tokenizeText(text) {
    const raw = String(text || "").toLowerCase();
    if (!raw.trim()) return [];
    const tokens = [];

    // 英文与数字词
    const latinMatches = raw.match(/[a-z0-9_]+/g);
    if (latinMatches) {
      for (const w of latinMatches) {
        if (w.length >= 2) tokens.push(w);
      }
    }

    // 中文连续片段 -> 单字（去停用字）+ 2-gram
    const cjkSegments = raw.match(/[\u4e00-\u9fff]+/g);
    if (cjkSegments) {
      for (const seg of cjkSegments) {
        for (let i = 0; i < seg.length; i++) {
          const ch = seg[i];
          if (!STOP_CHARS.has(ch)) tokens.push(ch);
          if (i + 1 < seg.length) {
            tokens.push(seg.slice(i, i + 2));
          }
        }
      }
    }
    return tokens;
  }

  function bigramOverlap(textA, textB) {
    const a = String(textA || "").replace(/\s+/g, "").toLowerCase();
    const b = String(textB || "").replace(/\s+/g, "").toLowerCase();
    if (a.length < 2 || b.length < 2) return 0;
    const setA = new Set();
    for (let i = 0; i < a.length - 1; i++) setA.add(a.slice(i, i + 2));
    const setB = new Set();
    for (let i = 0; i < b.length - 1; i++) setB.add(b.slice(i, i + 2));
    let hit = 0;
    for (const g of setA) {
      if (setB.has(g)) hit++;
    }
    const denom = Math.min(setA.size, setB.size);
    return denom > 0 ? hit / denom : 0;
  }

  function computeBM25Scores(query, docs) {
    const qTokens = tokenizeText(query);
    const N = docs.length;
    if (N === 0 || qTokens.length === 0) return docs.map(() => 0);

    const k1 = 1.2;
    const b = 0.75;

    const docTokensList = docs.map((d) => tokenizeText(d));
    let totalLen = 0;
    const df = Object.create(null);

    const tfList = docTokensList.map((toks) => {
      totalLen += toks.length;
      const tf = Object.create(null);
      const seen = new Set();
      for (const t of toks) {
        tf[t] = (tf[t] || 0) + 1;
        if (!seen.has(t)) {
          seen.add(t);
          df[t] = (df[t] || 0) + 1;
        }
      }
      return { tf, len: toks.length };
    });

    const avgLen = totalLen / N || 1;
    const uniqueQ = Array.from(new Set(qTokens));

    const rawScores = tfList.map(({ tf, len }) => {
      let score = 0;
      for (const qt of uniqueQ) {
        const freq = tf[qt] || 0;
        if (freq === 0) continue;
        const nDoc = df[qt] || 0;
        const idf = Math.log(1 + (N - nDoc + 0.5) / (nDoc + 0.5));
        const num = freq * (k1 + 1);
        const den = freq + k1 * (1 - b + (b * len) / avgLen);
        score += idf * (num / den);
      }
      return score;
    });

    const maxScore = Math.max(...rawScores, 0);
    if (maxScore <= 0) return rawScores.map(() => 0);
    // 用平滑饱和曲线把 BM25 映射到 [0, 1]，同时保留绝对强度
    return rawScores.map((s) => {
      if (s <= 0) return 0;
      const rel = s / maxScore;
      const absSat = s / (s + 2.2);
      return Math.min(1, 0.55 * rel + 0.45 * absSat);
    });
  }

  function computeEntityScore(query, entities) {
    if (!Array.isArray(entities) || entities.length === 0) return 0;
    const qLower = String(query || "").toLowerCase();
    if (!qLower.trim()) return 0;
    let hits = 0;
    let validCount = 0;
    for (const ent of entities) {
      const e = String(ent || "").trim().toLowerCase();
      if (e.length < 1) continue;
      validCount++;
      if (qLower.includes(e)) hits++;
    }
    if (hits === 0 || validCount === 0) return 0;
    return Math.min(1, 0.65 + 0.35 * (hits / validCount));
  }

  function computeDecayFactor(provinceId, ageHours) {
    const meta = getProvinceMeta(provinceId);
    if (meta.neverForget || meta.decayPerHour >= 1.0) return 1.0;
    const h = Math.max(0, Number(ageHours) || 0);
    return Math.max(0.25, Math.pow(meta.decayPerHour, h));
  }

  function computeVitalWeight(scroll, nowMs = Date.now()) {
    const imp = Math.max(1, Math.min(10, Number(scroll.importance) || 5));
    const refTime = Math.max(scroll.lastRecalledAt || 0, scroll.updatedAt || 0, scroll.createdAt || nowMs);
    const ageHours = Math.max(0, (nowMs - refTime) / 3600000);
    const decay = computeDecayFactor(scroll.province, ageHours);
    const act = Math.min(1.5, Math.max(0.5, Number(scroll.activation) || 1.0));
    return 0.55 + 0.25 * (imp / 10) + 0.20 * decay * act;
  }

  function isPinnedActive(scroll, nowMs = Date.now()) {
    if (!scroll || scroll.archived) return false;
    const pu = Number(scroll.pinnedUntil) || 0;
    return pu === -1 || pu > nowMs;
  }

  // ==========================================
  // 6. 密卷 / 卷宗 / 金兰契 CRUD
  // ==========================================
  function makeId(prefix, charId) {
    return `${prefix}_${String(charId)}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function normalizeEntities(raw) {
    if (Array.isArray(raw)) {
      return Array.from(new Set(raw.map((x) => String(x || "").trim()).filter((x) => x.length >= 1 && x.length <= 24))).slice(0, 10);
    }
    if (typeof raw === "string") {
      return Array.from(
        new Set(
          raw
            .split(/[,，、;；#\s]+/)
            .map((x) => x.trim())
            .filter((x) => x.length >= 1 && x.length <= 24)
        )
      ).slice(0, 10);
    }
    return [];
  }

  function formatTodayStr(ts = Date.now()) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function tryComputeEmbedding(text, opts = {}) {
    if (typeof opts.embedFn === "function") {
      return opts.embedFn(text);
    }
    const cme = global.CompanionMemoryEngine;
    if (cme && typeof cme.computeEmbedding === "function") {
      try {
        return await cme.computeEmbedding(text, opts.embedPrefs);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async function saveScrollVector(scrollId, charId, vec, model = "") {
    const bytes = encodeVectorBytes(vec);
    if (!bytes) return false;
    await dbPut(STORE_VECTORS, {
      scrollId,
      charId: String(charId),
      dim: bytes.byteLength / 4,
      bytes,
      model: String(model || ""),
      updatedAt: Date.now()
    });
    return true;
  }

  async function addScroll(charId, input, opts = {}) {
    const cid = String(charId || "");
    const content = String(input && input.content ? input.content : "").trim();
    if (!cid || !content) throw new Error("密卷内容不能为空");

    const province = normalizeProvinceId(input.province);
    const entities = normalizeEntities(input.entities);
    const importance = Math.max(1, Math.min(10, Math.round(Number(input.importance) || 6)));
    const now = Date.now();

    // 同州去重合并检查（除非显式跳过）
    if (!opts.skipDedup) {
      const prefs = await loadPrefs();
      const existing = (await dbGetAllByChar(STORE_SCROLLS, cid)).filter(
        (s) => !s.archived && s.province === province
      );
      let bestMatch = null;
      let bestSim = 0;
      for (const s of existing) {
        const sim = bigramOverlap(content, s.content);
        if (sim > bestSim) {
          bestSim = sim;
          bestMatch = s;
        }
      }
      if (bestMatch && bestSim >= (opts.dedupThreshold || prefs.dedupThreshold || 0.78)) {
        const mergedEntities = normalizeEntities([...(bestMatch.entities || []), ...entities]);
        const merged = {
          ...bestMatch,
          content: content.length >= bestMatch.content.length ? content : bestMatch.content,
          entities: mergedEntities,
          importance: Math.max(bestMatch.importance || 5, importance),
          occurredDate: input.occurredDate || bestMatch.occurredDate || formatTodayStr(now),
          updatedAt: now
        };
        await dbPut(STORE_SCROLLS, merged);
        if (!opts.skipVector) {
          const vec = await tryComputeEmbedding(merged.content, opts);
          if (vec && vec.length) await saveScrollVector(merged.id, cid, vec, opts.embedModel);
        }
        return { scroll: merged, merged: true };
      }
    }

    const scroll = {
      id: input.id || makeId("tp_scroll", cid),
      charId: cid,
      province,
      content,
      entities,
      importance,
      activation: Number(input.activation) || 1.0,
      occurredDate: String(input.occurredDate || formatTodayStr(now)).trim(),
      pinnedUntil: Number(input.pinnedUntil) || 0,
      dossierId: input.dossierId || null,
      sourceRange: String(input.sourceRange || ""),
      archived: Boolean(input.archived),
      recallCount: Number(input.recallCount) || 0,
      lastRecalledAt: Number(input.lastRecalledAt) || 0,
      createdAt: Number(input.createdAt) || now,
      updatedAt: now
    };
    await dbPut(STORE_SCROLLS, scroll);

    if (!opts.skipVector) {
      const vec = await tryComputeEmbedding(scroll.content, opts);
      if (vec && vec.length) {
        await saveScrollVector(scroll.id, cid, vec, opts.embedModel);
      }
    }
    return { scroll, merged: false };
  }

  async function updateScroll(scrollId, patch, opts = {}) {
    const old = await dbGet(STORE_SCROLLS, scrollId);
    if (!old) return null;
    const next = {
      ...old,
      ...(patch || {}),
      province: patch && patch.province ? normalizeProvinceId(patch.province) : old.province,
      entities: patch && patch.entities !== undefined ? normalizeEntities(patch.entities) : old.entities,
      importance:
        patch && patch.importance !== undefined
          ? Math.max(1, Math.min(10, Math.round(Number(patch.importance) || 5)))
          : old.importance,
      updatedAt: Date.now()
    };
    await dbPut(STORE_SCROLLS, next);
    if (patch && patch.content && patch.content !== old.content && !opts.skipVector) {
      const vec = await tryComputeEmbedding(next.content, opts);
      if (vec && vec.length) await saveScrollVector(next.id, next.charId, vec, opts.embedModel);
    }
    return next;
  }

  async function pinScroll(scrollId, mode = "permanent") {
    let pinnedUntil = 0;
    if (mode === "permanent" || mode === -1) pinnedUntil = -1;
    else if (mode === "7d") pinnedUntil = Date.now() + SEVEN_DAYS_MS;
    else if (typeof mode === "number" && mode > 0) pinnedUntil = mode;
    return updateScroll(scrollId, { pinnedUntil }, { skipVector: true });
  }

  async function deleteScroll(scrollId) {
    await dbDelete(STORE_SCROLLS, scrollId);
    await dbDelete(STORE_VECTORS, scrollId);
    return true;
  }

  async function listScrolls(charId, filter = {}) {
    let list = await dbGetAllByChar(STORE_SCROLLS, charId);
    if (filter.archived !== undefined) {
      list = list.filter((s) => Boolean(s.archived) === Boolean(filter.archived));
    }
    if (filter.province && filter.province !== "all") {
      const pid = normalizeProvinceId(filter.province);
      list = list.filter((s) => s.province === pid);
    }
    if (filter.pinnedOnly) {
      const now = Date.now();
      list = list.filter((s) => isPinnedActive(s, now));
    }
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  }

  // 绣衣楼卷宗（Case Dossier）
  async function createDossier(charId, { title, summary, province, scrollIds = [], importance = 7, collapsed = true }) {
    const cid = String(charId || "");
    const now = Date.now();
    const dossier = {
      id: makeId("tp_dossier", cid),
      charId: cid,
      title: String(title || "未命名卷宗").trim(),
      summary: String(summary || "").trim(),
      province: normalizeProvinceId(province),
      scrollIds: Array.from(new Set(scrollIds)),
      collapsed: Boolean(collapsed),
      importance: Math.max(1, Math.min(10, Math.round(Number(importance) || 7))),
      createdAt: now,
      updatedAt: now
    };
    await dbPut(STORE_DOSSIERS, dossier);
    for (const sid of dossier.scrollIds) {
      await updateScroll(sid, { dossierId: dossier.id }, { skipVector: true });
    }
    return dossier;
  }

  async function updateDossier(dossierId, patch) {
    const old = await dbGet(STORE_DOSSIERS, dossierId);
    if (!old) return null;
    const next = {
      ...old,
      ...(patch || {}),
      province: patch && patch.province ? normalizeProvinceId(patch.province) : old.province,
      updatedAt: Date.now()
    };
    await dbPut(STORE_DOSSIERS, next);
    return next;
  }

  async function deleteDossier(dossierId) {
    const old = await dbGet(STORE_DOSSIERS, dossierId);
    if (old && Array.isArray(old.scrollIds)) {
      for (const sid of old.scrollIds) {
        await updateScroll(sid, { dossierId: null }, { skipVector: true });
      }
    }
    await dbDelete(STORE_DOSSIERS, dossierId);
    return true;
  }

  async function listDossiers(charId) {
    const list = await dbGetAllByChar(STORE_DOSSIERS, charId);
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  }

  // 广陵金兰契（Imperial Vows）
  async function addVow(charId, { title, note = "", targetDate = "", status = "active" }) {
    const cid = String(charId || "");
    const t = String(title || "").trim();
    if (!cid || !t) throw new Error("金兰契内容不能为空");
    const now = Date.now();
    const vow = {
      id: makeId("tp_vow", cid),
      charId: cid,
      title: t,
      note: String(note || "").trim(),
      targetDate: String(targetDate || "").trim(),
      status: ["active", "fulfilled", "expired"].includes(status) ? status : "active",
      createdAt: now,
      updatedAt: now
    };
    await dbPut(STORE_VOWS, vow);
    return vow;
  }

  async function updateVow(vowId, patch) {
    const old = await dbGet(STORE_VOWS, vowId);
    if (!old) return null;
    const next = { ...old, ...(patch || {}), updatedAt: Date.now() };
    await dbPut(STORE_VOWS, next);
    return next;
  }

  async function deleteVow(vowId) {
    return dbDelete(STORE_VOWS, vowId);
  }

  async function listVows(charId) {
    const list = await dbGetAllByChar(STORE_VOWS, charId);
    list.sort((a, b) => {
      const order = { active: 0, fulfilled: 1, expired: 2 };
      const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      return diff !== 0 ? diff : (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return list;
  }

  // ==========================================
  // 7. 混合检索 + 卷宗折叠归拢 + Prompt 协同注入
  // ==========================================
  async function searchScrolls(charId, query, opts = {}) {
    const cid = String(charId || "");
    const q = String(query || "").trim();
    const nowMs = opts.nowMs || Date.now();
    const allScrolls = (await dbGetAllByChar(STORE_SCROLLS, cid)).filter((s) => !s.archived && s.content);
    if (allScrolls.length === 0 || !q) return [];

    // BM25 文档体 = 内容 + 实体印记 + 州名
    const docStrings = allScrolls.map((s) => {
      const pMeta = getProvinceMeta(s.province);
      return `${s.content} ${(s.entities || []).join(" ")} ${pMeta.name} ${pMeta.landmark}`;
    });
    const bm25Scores = computeBM25Scores(q, docStrings);

    // 可选向量检索
    const vecRecords = await dbGetAllByChar(STORE_VECTORS, cid);
    const vecMap = new Map();
    for (const vr of vecRecords) {
      const f32 = decodeVectorBytes(vr.bytes);
      if (f32 && f32.length > 0) vecMap.set(vr.scrollId, f32);
    }

    let qVec = null;
    if (vecMap.size > 0 && !opts.skipVector) {
      const rawQVec = await tryComputeEmbedding(q, opts);
      if (rawQVec && rawQVec.length > 0) {
        qVec = rawQVec instanceof Float32Array ? rawQVec : new Float32Array(rawQVec);
      }
    }

    const scored = allScrolls.map((s, idx) => {
      const sBm25 = bm25Scores[idx] || 0;
      const sEnt = computeEntityScore(q, s.entities);
      let sVec = 0;
      let usedVec = false;
      if (qVec) {
        const dVec = vecMap.get(s.id);
        if (dVec && dVec.length === qVec.length) {
          sVec = Math.max(0, cosineSimilarity(qVec, dVec));
          usedVec = true;
        }
      }
      const wVital = computeVitalWeight(s, nowMs);
      const baseScore = usedVec
        ? 0.45 * sVec + 0.35 * sBm25 + 0.20 * sEnt
        : 0.72 * sBm25 + 0.28 * sEnt;
      const finalScore = baseScore * wVital;
      return {
        scroll: s,
        score: finalScore,
        detail: { sBm25, sEnt, sVec, wVital, usedVec }
      };
    });

    const minScore = opts.minScore !== undefined ? opts.minScore : 0.14;
    scored.sort((a, b) => b.score - a.score);
    return scored.filter((x) => x.score >= minScore).slice(0, opts.limit || 12);
  }

  async function buildArchiveContext(charId, query, opts = {}) {
    const prefs = await loadPrefs();
    if (!prefs.enabled && !opts.force) {
      return { block: "", pinnedCount: 0, vowCount: 0, recalledCount: 0, usedIds: [] };
    }

    const cid = String(charId || "");
    const nowMs = opts.nowMs || Date.now();
    const maxChars = opts.maxPromptChars || prefs.maxPromptChars || 900;
    const overlapThreshold = opts.summaryOverlapThreshold || prefs.summaryOverlapThreshold || 0.65;
    const excludeTexts = Array.isArray(opts.excludeTexts) ? opts.excludeTexts.filter(Boolean) : [];

    const [allScrolls, allDossiers, allVows] = await Promise.all([
      dbGetAllByChar(STORE_SCROLLS, cid),
      dbGetAllByChar(STORE_DOSSIERS, cid),
      dbGetAllByChar(STORE_VOWS, cid)
    ]);

    const dossierMap = new Map();
    for (const d of allDossiers) dossierMap.set(d.id, d);

    // 1. 朱砂御批直通层
    const pinnedScrolls = allScrolls
      .filter((s) => isPinnedActive(s, nowMs))
      .sort((a, b) => (b.importance || 5) - (a.importance || 5) || (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, opts.maxPinned || prefs.maxPinned || 4);

    const pinnedIdSet = new Set(pinnedScrolls.map((s) => s.id));

    // 2. 活跃金兰契直通层
    const activeVows = allVows
      .filter((v) => v.status === "active")
      .slice(0, opts.maxVows || prefs.maxVows || 3);

    // 3. 混合检索召回层（排除已置顶 + 与日总结去重 + 折叠卷宗归拢）
    const hits = await searchScrolls(cid, query, {
      limit: 16,
      nowMs,
      embedFn: opts.embedFn,
      embedPrefs: opts.embedPrefs,
      skipVector: opts.skipVector
    });

    const maxRecall = opts.maxRecall || prefs.maxRecall || 5;
    const pickedRecallItems = [];
    const seenDossierIds = new Set();
    const touchedScrolls = [];

    for (const h of hits) {
      if (pickedRecallItems.length >= maxRecall) break;
      const s = h.scroll;
      if (pinnedIdSet.has(s.id)) continue;

      // 卷宗归拢检查
      if (s.dossierId && dossierMap.has(s.dossierId)) {
        const dos = dossierMap.get(s.dossierId);
        if (dos.collapsed && dos.summary) {
          if (seenDossierIds.has(dos.id)) continue;
          const dupSummary = excludeTexts.some((t) => bigramOverlap(dos.summary, t) > overlapThreshold);
          if (dupSummary) continue;
          seenDossierIds.add(dos.id);
          const pMeta = getProvinceMeta(dos.province);
          pickedRecallItems.push({
            type: "dossier",
            id: dos.id,
            line: `- [${pMeta.name}·卷宗「${dos.title}」] ${dos.summary}`
          });
          touchedScrolls.push(s);
          continue;
        }
      }

      // 与日总结去重
      const dupWithDay = excludeTexts.some((t) => bigramOverlap(s.content, t) > overlapThreshold);
      if (dupWithDay) continue;

      const pMeta = getProvinceMeta(s.province);
      const dateSuffix = s.occurredDate ? `（${s.occurredDate}）` : "";
      pickedRecallItems.push({
        type: "scroll",
        id: s.id,
        line: `- [${pMeta.name}·${pMeta.role}] ${s.content}${dateSuffix}`
      });
      touchedScrolls.push(s);
    }

    if (pinnedScrolls.length === 0 && activeVows.length === 0 && pickedRecallItems.length === 0) {
      return { block: "", pinnedCount: 0, vowCount: 0, recalledCount: 0, usedIds: [] };
    }

    // 4. 按严格字符预算拼装 XML 块
    const header =
      "<thirteen_provinces_archive>\n" +
      "以下是你脑海中自然浮现的长期印象与约定（请自然融入对话与语气，切勿提及“密卷”“档案”“数据库”或州名标签）：\n";
    const footer = "\n</thirteen_provinces_archive>";

    let body = "";
    const budget = Math.max(200, maxChars - header.length - footer.length);

    function appendSection(title, lines) {
      if (!lines.length) return 0;
      let added = 0;
      const prefix = (body ? "\n" : "") + title + "\n";
      if (body.length + prefix.length >= budget) return 0;
      let chunk = prefix;
      for (const ln of lines) {
        const cand = chunk + ln + "\n";
        if (body.length + cand.length > budget) break;
        chunk = cand;
        added++;
      }
      if (added > 0) {
        body += chunk.trimEnd();
      }
      return added;
    }

    const pinnedLines = pinnedScrolls.map((s) => {
      const pMeta = getProvinceMeta(s.province);
      return `- [${pMeta.name}·${pMeta.landmark}] ${s.content}`;
    });
    const vowLines = activeVows.map((v) => {
      const td = v.targetDate ? `（目标：${v.targetDate}）` : "";
      const note = v.note ? `：${v.note}` : "";
      return `- [金兰契] ${v.title}${note}${td}`;
    });
    const recallLines = pickedRecallItems.map((x) => x.line);

    const pinnedCount = appendSection("【深刻铭记】", pinnedLines);
    const vowCount = appendSection("【未履之约】", vowLines);
    const recalledCount = appendSection("【相关往事】", recallLines);

    if (pinnedCount + vowCount + recalledCount === 0) {
      return { block: "", pinnedCount: 0, vowCount: 0, recalledCount: 0, usedIds: [] };
    }

    // 仅给真正注入的密卷增加激活度与召回计数
    if (!opts.dryRun) {
      for (const s of touchedScrolls.slice(0, recalledCount)) {
        const nextAct = Math.min(2.5, (Number(s.activation) || 1.0) + 0.15);
        dbPut(STORE_SCROLLS, {
          ...s,
          activation: Number(nextAct.toFixed(3)),
          recallCount: (s.recallCount || 0) + 1,
          lastRecalledAt: nowMs
        }).catch(() => { });
      }
    }

    return {
      block: `${header}${body}${footer}`,
      pinnedCount,
      vowCount,
      recalledCount,
      usedIds: [
        ...pinnedScrolls.slice(0, pinnedCount).map((s) => s.id),
        ...pickedRecallItems.slice(0, recalledCount).map((x) => x.id)
      ]
    };
  }

  // ==========================================
  // 8. 密探飞鸢：AI 归州提炼器（3 级容错解析 + 复用主 API）
  // ==========================================
  function parseDigestJson(rawText) {
    let s = String(rawText || "").trim();
    if (!s) return null;
    // 1. 剥离推理模型的 <think>...</think>
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    // 2. 剥离 markdown 代码块
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && fence[1]) s = fence[1].trim();
    // 3. 直接解析或提取最外层 {...} / [...]
    const tryParse = (txt) => {
      try {
        return JSON.parse(txt);
      } catch (e) {
        return null;
      }
    };
    let parsed = tryParse(s);
    if (!parsed) {
      const objMatch = s.match(/\{[\s\S]*\}/);
      if (objMatch) parsed = tryParse(objMatch[0]);
    }
    if (!parsed) {
      const arrMatch = s.match(/\[[\s\S]*\]/);
      if (arrMatch) parsed = tryParse(arrMatch[0]);
    }
    if (!parsed) return null;

    if (Array.isArray(parsed)) {
      return { scrolls: parsed, vows: [] };
    }
    return {
      scrolls: Array.isArray(parsed.scrolls) ? parsed.scrolls : Array.isArray(parsed.memories) ? parsed.memories : [],
      vows: Array.isArray(parsed.vows) ? parsed.vows : Array.isArray(parsed.promises) ? parsed.promises : []
    };
  }

  async function callDefaultLlm(messages, opts = {}) {
    if (typeof opts.customChatFn === "function") {
      return opts.customChatFn(messages, opts);
    }
    // 优先复用 CompanionMemoryEngine 的挑选小模型（如果配置了）
    const cme = global.CompanionMemoryEngine;
    if (cme && typeof cme.callPickerLlmText === "function") {
      try {
        const res = await cme.callPickerLlmText(messages, { temperature: 0.2, max_tokens: 1400 });
        if (res) return res;
      } catch (e) {
        // 回退到主 API
      }
    }

    // 回退到 Ano-phone 全局 api_configs（只读兼容 localStorage 存储）
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
      throw new Error("未检测到可用的 AI 接口配置，请先在设置中配置 API");
    }
    const baseUrl = String(cfg.url).trim().replace(/\/+$/, "");
    const endpoint = /\/chat\/completions$/i.test(baseUrl)
      ? baseUrl
      : cfg.type === "official"
      ? (/\/v1$/i.test(baseUrl) ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`)
      : (/\/v1$/i.test(baseUrl) ? `${baseUrl}/chat/completions` : `${baseUrl}/api/chat/completions`);
    const headers = { "Content-Type": "application/json" };
    if (cfg.key || cfg.apiKey) {
      headers.Authorization = `Bearer ${cfg.key || cfg.apiKey}`;
    }
    const resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.model || "gpt-4o-mini",
        messages,
        temperature: 0.2,
        max_tokens: 1400
      })
    });
    if (!resp.ok) {
      throw new Error(`飞鸢提炼请求失败 (${resp.status})`);
    }
    const json = await resp.json();
    return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
  }

  function buildDigestPrompts(transcript, names = { user: "主公", assistant: "名士" }) {
    const provinceGuide = PROVINCES.map((p) => `- ${p.id}（${p.name}·${p.landmark}）：${p.role}——${p.desc}`).join("\n");
    const sysPrompt = `你是绣衣楼「东汉十三州密卷」整理密探。请从以下 ${names.user} 与 ${names.assistant} 的对话中，提炼值得长期铭记的结构化记忆，并归入对应的东汉十三州。
【十三州归州速查表】
${provinceGuide}

【输出要求】
1. 严格只输出合法 JSON 对象，不要输出任何额外解释或 markdown 标记：
{"scrolls":[{"province":"yangzhou","content":"简明完整的长期记忆事实","entities":["实体1","实体2"],"importance":7,"occurredDate":"YYYY-MM-DD"}],"vows":[{"title":"具体约定内容","targetDate":"YYYY-MM-DD或空","note":"补充说明"}]}
2. 过滤寒暄、无营养水话与一次性过渡句；若无值得长期记录的新信息，输出 {"scrolls":[],"vows":[]}。
3. 每条 content 控制在 15~80 字，entities 抽取 1~5 个关键人名/地名/物品/爱好词。
4. 重要度 importance 范围 1~10（日常琐事 3~5，喜好/信物/重要互动 6~8，核心誓言/重大转折 9~10）。`;

    return [
      { role: "system", content: sysPrompt },
      { role: "user", content: `<对话原文>\n${transcript}\n</对话原文>\n请按 JSON 格式归州提炼。` }
    ];
  }

  function formatTranscript(rawMessages, names = { user: "主公", assistant: "名士" }) {
    return (rawMessages || [])
      .filter((m) => m && m.content && (m.role === "user" || m.role === "assistant" || m.sender === "user" || m.sender === "ai" || m.sender === "role"))
      .map((m) => {
        const isUser = m.role === "user" || m.sender === "user";
        const speaker = isUser ? names.user : names.assistant;
        const ts = m.timestamp || m.createdAt || Date.now();
        const text = typeof m.content === "string" ? m.content : String(m.text || "");
        return `[${formatTodayStr(ts)}] ${speaker}：${text.slice(0, 360)}`;
      })
      .join("\n");
  }

  async function digestMessages(charId, rawMessages, opts = {}) {
    const cid = String(charId || "");
    const names = opts.names || { user: "主公", assistant: "名士" };
    const transcript = formatTranscript(rawMessages, names);
    if (!transcript.trim()) {
      return { added: 0, merged: 0, vowsAdded: 0, scrolls: [], vows: [] };
    }

    const prompts = buildDigestPrompts(transcript, names);
    const reply = await callDefaultLlm(prompts, opts);
    const parsed = parseDigestJson(reply);
    if (!parsed) {
      throw new Error("飞鸢提炼返回格式无法解析为 JSON");
    }

    const firstId = rawMessages[0] && rawMessages[0].id ? rawMessages[0].id : "";
    const lastId = rawMessages[rawMessages.length - 1] && rawMessages[rawMessages.length - 1].id ? rawMessages[rawMessages.length - 1].id : "";
    const sourceRange = firstId && lastId ? `${firstId}-${lastId}` : "";

    let added = 0;
    let merged = 0;
    const savedScrolls = [];
    for (const item of parsed.scrolls) {
      if (!item || !String(item.content || "").trim()) continue;
      const res = await addScroll(
        cid,
        {
          province: item.province,
          content: item.content,
          entities: item.entities,
          importance: item.importance,
          occurredDate: item.occurredDate || formatTodayStr(Date.now()),
          sourceRange
        },
        { embedFn: opts.embedFn, embedPrefs: opts.embedPrefs, skipVector: opts.skipVector }
      );
      if (res.merged) merged++;
      else added++;
      savedScrolls.push(res.scroll);
    }

    let vowsAdded = 0;
    const savedVows = [];
    for (const v of parsed.vows) {
      if (!v || !String(v.title || "").trim()) continue;
      const vow = await addVow(cid, {
        title: v.title,
        note: v.note || "",
        targetDate: v.targetDate || "",
        status: "active"
      });
      vowsAdded++;
      savedVows.push(vow);
    }

    if (lastId) {
      await saveCharMeta(cid, {
        lastDigestedMsgId: lastId,
        lastDigestedCount: rawMessages.length,
        lastDigestedAt: Date.now()
      });
    }

    return { added, merged, vowsAdded, scrolls: savedScrolls, vows: savedVows };
  }

  function maybeAutoDigest({ charId, charName, userName, allMessages }) {
    const cid = String(charId || "");
    if (!cid || !Array.isArray(allMessages) || allMessages.length === 0) return;
    if (_digestRunningByChar[cid]) return;
    if ((_digestCooldownByChar[cid] || 0) > Date.now()) return;

    _digestRunningByChar[cid] = true;
    setTimeout(async () => {
      try {
        const prefs = await loadPrefs();
        if (!prefs.enabled || !prefs.autoDigest) return;

        const validMsgs = allMessages.filter(
          (m) => m && (m.content || m.text) && (m.role === "user" || m.role === "assistant" || m.sender === "user" || m.sender === "ai" || m.sender === "role")
        );
        const meta = await getCharMeta(cid);
        let slice = validMsgs;
        if (meta.lastDigestedMsgId) {
          const idx = validMsgs.findIndex((m) => m.id === meta.lastDigestedMsgId);
          if (idx >= 0) slice = validMsgs.slice(idx + 1);
        }
        const interval = Math.max(6, Number(prefs.digestInterval) || 16);
        if (slice.length < interval) return;

        const batch = slice.slice(-Math.min(slice.length, 40));
        await digestMessages(cid, batch, {
          names: { user: userName || "主公", assistant: charName || "名士" }
        });
      } catch (err) {
        console.warn("[ThirteenProvinces] 后台飞鸢提炼失败，冷却 10 分钟:", err);
        _digestCooldownByChar[cid] = Date.now() + DIGEST_FAIL_COOLDOWN_MS;
      } finally {
        _digestRunningByChar[cid] = false;
      }
    }, 1200);
  }

  async function rebuildVectorsForChar(charId, opts = {}) {
    const scrolls = (await dbGetAllByChar(STORE_SCROLLS, charId)).filter((s) => !s.archived && s.content);
    let ok = 0;
    let fail = 0;
    for (const s of scrolls) {
      const vec = await tryComputeEmbedding(s.content, opts);
      if (vec && vec.length) {
        await saveScrollVector(s.id, charId, vec, opts.embedModel);
        ok++;
      } else {
        fail++;
      }
    }
    return { total: scrolls.length, ok, fail };
  }

  // ==========================================
  // 9. 统计 + JSON 备份导入/导出 + 清空角色档案
  // ==========================================
  async function getCharStats(charId) {
    const [scrolls, vectors, dossiers, vows] = await Promise.all([
      dbGetAllByChar(STORE_SCROLLS, charId),
      dbGetAllByChar(STORE_VECTORS, charId),
      dbGetAllByChar(STORE_DOSSIERS, charId),
      dbGetAllByChar(STORE_VOWS, charId)
    ]);
    const activeScrolls = scrolls.filter((s) => !s.archived);
    const byProvince = Object.create(null);
    let pinnedCount = 0;
    const now = Date.now();
    for (const s of activeScrolls) {
      byProvince[s.province] = (byProvince[s.province] || 0) + 1;
      if (isPinnedActive(s, now)) pinnedCount++;
    }
    const litProvinces = Object.keys(byProvince).length;
    const activeVowCount = vows.filter((v) => v.status === "active").length;
    return {
      totalScrolls: activeScrolls.length,
      archivedScrolls: scrolls.length - activeScrolls.length,
      vectorCount: vectors.length,
      dossierCount: dossiers.length,
      activeVowCount,
      totalVows: vows.length,
      pinnedCount,
      litProvinces,
      byProvince
    };
  }

  async function exportCharArchive(charId) {
    const [scrolls, dossiers, vows, meta] = await Promise.all([
      dbGetAllByChar(STORE_SCROLLS, charId),
      dbGetAllByChar(STORE_DOSSIERS, charId),
      dbGetAllByChar(STORE_VOWS, charId),
      getCharMeta(charId)
    ]);
    return {
      schema: "ano_thirteen_provinces_v1",
      charId: String(charId),
      exportedAt: Date.now(),
      scrolls,
      dossiers,
      vows,
      meta
    };
  }

  async function importCharArchive(charId, data) {
    if (!data || typeof data !== "object") throw new Error("无效的十三州密卷备份文件");
    const cid = String(charId);
    let count = 0;
    for (const s of Array.isArray(data.scrolls) ? data.scrolls : []) {
      if (!s || !s.content) continue;
      await dbPut(STORE_SCROLLS, {
        ...s,
        id: s.id || makeId("tp_scroll", cid),
        charId: cid,
        province: normalizeProvinceId(s.province),
        entities: normalizeEntities(s.entities)
      });
      count++;
    }
    for (const d of Array.isArray(data.dossiers) ? data.dossiers : []) {
      if (!d || !d.title) continue;
      await dbPut(STORE_DOSSIERS, {
        ...d,
        id: d.id || makeId("tp_dossier", cid),
        charId: cid,
        province: normalizeProvinceId(d.province)
      });
      count++;
    }
    for (const v of Array.isArray(data.vows) ? data.vows : []) {
      if (!v || !v.title) continue;
      await dbPut(STORE_VOWS, {
        ...v,
        id: v.id || makeId("tp_vow", cid),
        charId: cid
      });
      count++;
    }
    return count;
  }

  async function clearCharArchive(charId) {
    const cid = String(charId);
    const [scrolls, vectors, dossiers, vows] = await Promise.all([
      dbGetAllByChar(STORE_SCROLLS, cid),
      dbGetAllByChar(STORE_VECTORS, cid),
      dbGetAllByChar(STORE_DOSSIERS, cid),
      dbGetAllByChar(STORE_VOWS, cid)
    ]);
    for (const s of scrolls) await dbDelete(STORE_SCROLLS, s.id);
    for (const v of vectors) await dbDelete(STORE_VECTORS, v.scrollId);
    for (const d of dossiers) await dbDelete(STORE_DOSSIERS, d.id);
    for (const w of vows) await dbDelete(STORE_VOWS, w.id);
    await saveCharMeta(cid, { lastDigestedMsgId: null, lastDigestedCount: 0, lastDigestedAt: 0 });
    return true;
  }

  // ==========================================
  // 10. 自挂载可视化管理台 UI（零侵入 app.min.js）
  // ==========================================
  let _portalRoot = null;
  let _portalContainer = null;
  let _modalState = { open: false, charId: "", charName: "名士", userName: "主公", getMessagesFn: null };

  function ensureStylesInjected() {
    if (typeof document === "undefined") return;
    if (document.getElementById("tp-archive-styles")) return;
    const style = document.createElement("style");
    style.id = "tp-archive-styles";
    style.textContent = `
      .tp-overlay {
        position: fixed; inset: 0; z-index: 99998;
        background: rgba(15, 18, 24, 0.62);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        padding: 12px; box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Serif SC", sans-serif;
      }
      .tp-panel {
        width: 100%; max-width: 540px; max-height: 90vh;
        background: #faf7f2; color: #26201a;
        border-radius: 20px; border: 1px solid rgba(168, 45, 45, 0.18);
        box-shadow: 0 20px 50px rgba(0,0,0,0.28);
        display: flex; flex-direction: column; overflow: hidden;
      }
      .dark .tp-panel, [data-theme="dark"] .tp-panel {
        background: #1c1917; color: #f5f0e8; border-color: rgba(220, 90, 90, 0.25);
      }
      .tp-header {
        padding: 14px 16px 10px;
        background: linear-gradient(135deg, rgba(168,45,45,0.10), rgba(196,154,108,0.10));
        border-bottom: 1px solid rgba(120, 90, 60, 0.14);
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .tp-title-wrap h3 { margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
      .tp-sub { font-size: 11px; opacity: 0.72; margin-top: 2px; }
      .tp-btn {
        border: 1px solid rgba(120,90,60,0.22); background: rgba(255,255,255,0.75); color: inherit;
        border-radius: 999px; padding: 5px 10px; font-size: 12px; cursor: pointer;
        display: inline-flex; align-items: center; gap: 4px; transition: all .15s;
      }
      .dark .tp-btn { background: rgba(255,255,255,0.08); }
      .tp-btn:hover { transform: translateY(-1px); border-color: #a82d2d; }
      .tp-btn-crimson { background: #a82d2d; color: #fff !important; border-color: #a82d2d; }
      .tp-btn-crimson:hover { background: #8f2222; }
      .tp-body { flex: 1; overflow-y: auto; padding: 12px 14px 18px; }
      .tp-seal-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .tp-seal {
        border: 1px solid rgba(120,90,60,0.2); border-radius: 10px; padding: 5px 9px;
        font-size: 12px; cursor: pointer; background: rgba(255,255,255,0.6); color: inherit;
        display: inline-flex; align-items: center; gap: 4px; transition: all .15s;
      }
      .dark .tp-seal { background: rgba(255,255,255,0.05); }
      .tp-seal.lit { border-color: rgba(168,45,45,0.45); background: rgba(168,45,45,0.08); font-weight: 600; }
      .tp-seal.active { background: #a82d2d !important; color: #fff !important; border-color: #a82d2d !important; }
      .tp-seal-count {
        font-size: 10px; padding: 0 5px; border-radius: 999px;
        background: rgba(168,45,45,0.16); color: #a82d2d;
      }
      .tp-seal.active .tp-seal-count { background: rgba(255,255,255,0.24); color: #fff; }
      .tp-search-row { display: flex; gap: 6px; margin-bottom: 10px; }
      .tp-input, .tp-textarea, .tp-select {
        width: 100%; box-sizing: border-box;
        border: 1px solid rgba(120,90,60,0.24); border-radius: 10px;
        padding: 7px 10px; font-size: 13px; background: rgba(255,255,255,0.85); color: inherit;
        outline: none;
      }
      .dark .tp-input, .dark .tp-textarea, .dark .tp-select { background: rgba(255,255,255,0.07); }
      .tp-card {
        background: rgba(255,255,255,0.88); border: 1px solid rgba(120,90,60,0.16);
        border-radius: 14px; padding: 11px 12px; margin-bottom: 9px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      }
      .dark .tp-card { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
      .tp-card.pinned { border-color: rgba(185,28,28,0.55); box-shadow: 0 0 0 1px rgba(185,28,28,0.18); }
      .tp-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 6px; }
      .tp-badge { padding: 2px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; }
      .tp-tag {
        font-size: 11px; padding: 1px 6px; border-radius: 6px;
        background: rgba(120,90,60,0.1); opacity: 0.85;
      }
      .tp-card-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
      .tp-mini-btn {
        font-size: 11px; padding: 3px 8px; border-radius: 8px; cursor: pointer;
        border: 1px solid rgba(120,90,60,0.2); background: transparent; color: inherit;
      }
      .tp-mini-btn:hover { border-color: #a82d2d; color: #a82d2d; }
      .tp-subbox {
        background: rgba(168,45,45,0.05); border: 1px dashed rgba(168,45,45,0.3);
        border-radius: 12px; padding: 10px; margin-bottom: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  function createReactModalComponent() {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    return function ThirteenProvincesModal({ state, onClose }) {
      const [tab, setTab] = useState("all"); // all | pinned | vows | dossiers | archived
      const [selectedProvince, setSelectedProvince] = useState("all");
      const [showAllProvinces, setShowAllProvinces] = useState(false);
      const [query, setQuery] = useState("");
      const [sortBy, setSortBy] = useState("updated"); // updated | importance | recall
      const [scrolls, setScrolls] = useState([]);
      const [dossiers, setDossiers] = useState([]);
      const [vows, setVows] = useState([]);
      const [stats, setStats] = useState(null);
      const [prefs, setPrefs] = useState(getPrefsSync());
      const [statusMsg, setStatusMsg] = useState("");

      // 子面板状态
      const [subPanel, setSubPanel] = useState(null); // null | "add" | "digest" | "settings" | "addVow" | "addDossier"
      const [guideOpen, setGuideOpen] = useState(false);
      const [editingScroll, setEditingScroll] = useState(null);

      // 表单状态
      const [formProvince, setFormProvince] = useState("yangzhou");
      const [formContent, setFormContent] = useState("");
      const [formEntities, setFormEntities] = useState("");
      const [formImportance, setFormImportance] = useState(7);
      const [formDate, setFormDate] = useState(formatTodayStr());
      const [digestRangeN, setDigestRangeN] = useState(30);
      const [busy, setBusy] = useState(false);

      // 金兰契表单
      const [vowTitle, setVowTitle] = useState("");
      const [vowDate, setVowDate] = useState("");
      const [vowNote, setVowNote] = useState("");

      // 卷宗表单
      const [dosTitle, setDosTitle] = useState("");
      const [dosSummary, setDosSummary] = useState("");
      const [dosProvince, setDosProvince] = useState("sili");

      const charId = state.charId;

      const refreshAll = useCallback(async () => {
        if (!charId) return;
        const [sc, ds, vs, st, pf] = await Promise.all([
          dbGetAllByChar(STORE_SCROLLS, charId),
          listDossiers(charId),
          listVows(charId),
          getCharStats(charId),
          loadPrefs()
        ]);
        setScrolls(sc);
        setDossiers(ds);
        setVows(vs);
        setStats(st);
        setPrefs(pf);
      }, [charId]);

      useEffect(() => {
        if (state.open && charId) refreshAll();
      }, [state.open, charId, refreshAll]);

      if (!state.open) return null;

      const now = Date.now();
      let visibleScrolls = scrolls.filter((s) => (tab === "archived" ? Boolean(s.archived) : !s.archived));
      if (tab === "pinned") {
        visibleScrolls = visibleScrolls.filter((s) => isPinnedActive(s, now));
      }
      if (selectedProvince !== "all" && (tab === "all" || tab === "pinned")) {
        visibleScrolls = visibleScrolls.filter((s) => s.province === selectedProvince);
      }

      if (query.trim()) {
        const docs = visibleScrolls.map((s) => `${s.content} ${(s.entities || []).join(" ")} ${getProvinceMeta(s.province).name}`);
        const scores = computeBM25Scores(query.trim(), docs);
        visibleScrolls = visibleScrolls
          .map((s, i) => ({ s, sc: scores[i] + computeEntityScore(query.trim(), s.entities) }))
          .filter((x) => x.sc > 0.05)
          .sort((a, b) => b.sc - a.sc)
          .map((x) => x.s);
      } else {
        visibleScrolls = [...visibleScrolls].sort((a, b) => {
          if (sortBy === "importance") return (b.importance || 0) - (a.importance || 0);
          if (sortBy === "recall") return (b.recallCount || 0) - (a.recallCount || 0);
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      }

      async function handleSaveScroll() {
        if (!formContent.trim()) return setStatusMsg("请填写密卷内容");
        setBusy(true);
        try {
          if (editingScroll) {
            await updateScroll(editingScroll.id, {
              province: formProvince,
              content: formContent.trim(),
              entities: normalizeEntities(formEntities),
              importance: Number(formImportance),
              occurredDate: formDate.trim()
            });
            setStatusMsg("已修订密卷");
          } else {
            const res = await addScroll(charId, {
              province: formProvince,
              content: formContent.trim(),
              entities: normalizeEntities(formEntities),
              importance: Number(formImportance),
              occurredDate: formDate.trim()
            });
            setStatusMsg(res.merged ? "检测到相似密卷，已自动融合更新" : "已归入州郡密卷");
          }
          setEditingScroll(null);
          setSubPanel(null);
          setFormContent("");
          setFormEntities("");
          await refreshAll();
        } catch (e) {
          setStatusMsg("保存失败：" + e.message);
        } finally {
          setBusy(false);
        }
      }

      async function handleManualDigest() {
        setBusy(true);
        setStatusMsg("密探飞鸢正在整理近期对话并归州入卷…");
        try {
          let msgs = [];
          if (typeof state.getMessagesFn === "function") {
            msgs = (await state.getMessagesFn()) || [];
          } else if (global.CompanionMemoryEngine && typeof global.CompanionMemoryEngine.loadRawHistoryForChar === "function") {
            msgs = (await global.CompanionMemoryEngine.loadRawHistoryForChar(charId)) || [];
          }
          const slice = msgs.slice(-Math.max(6, Number(digestRangeN) || 30));
          if (slice.length === 0) {
            setStatusMsg("未找到可提炼的聊天记录");
            return;
          }
          const res = await digestMessages(charId, slice, {
            names: { user: state.userName || "主公", assistant: state.charName || "名士" }
          });
          setStatusMsg(`飞鸢归来：新增 ${res.added} 卷，融合 ${res.merged} 卷，金兰契 +${res.vowsAdded}`);
          setSubPanel(null);
          await refreshAll();
        } catch (e) {
          setStatusMsg("飞鸢提炼失败：" + e.message);
        } finally {
          setBusy(false);
        }
      }

      async function handleExportJson() {
        const data = await exportCharArchive(charId);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `十三州密卷_${state.charName || charId}_${formatTodayStr()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatusMsg("已导出十三州密卷 JSON 备份");
      }

      function handleImportJson(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const parsed = JSON.parse(String(reader.result || "{}"));
            const cnt = await importCharArchive(charId, parsed);
            setStatusMsg(`已成功导入 ${cnt} 条密卷/卷宗/金兰契`);
            await refreshAll();
          } catch (err) {
            setStatusMsg("导入失败：" + err.message);
          }
        };
        reader.readAsText(file);
        e.target.value = "";
      }

      const litMap = (stats && stats.byProvince) || {};
      const displayedProvinces = showAllProvinces
        ? PROVINCES
        : PROVINCES.filter((p) => (litMap[p.id] || 0) > 0 || p.id === selectedProvince);
      const hiddenCount = PROVINCES.length - displayedProvinces.length;

      return h(
        "div",
        {
          className: "tp-overlay open",
          style: { position: "fixed", inset: 0, zIndex: 99998 },
          onClick: (e) => e.target === e.currentTarget && onClose()
        },
        h(
          "div",
          { className: "tp-panel" },
          // 顶栏
          h(
            "div",
            { className: "tp-header" },
            h(
              "div",
              { className: "tp-title-wrap" },
              h("h3", null, "🗺️ 十三州密卷 · ", state.charName || "名士"),
              h(
                "div",
                { className: "tp-sub" },
                stats
                  ? `已点亮 ${stats.litProvinces}/13 州 · ${stats.totalScrolls} 卷密档 · ${stats.pinnedCount} 御批 · ${stats.activeVowCount} 金兰契`
                  : "正在启封绣衣楼密档…"
              )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "5px", flexWrap: "wrap", justifyContent: "flex-end" } },
              h("button", { className: "tp-btn tp-btn-crimson", onClick: () => setSubPanel(subPanel === "digest" ? null : "digest") }, "🦅 飞鸢"),
              h(
                "button",
                {
                  className: "tp-btn",
                  onClick: () => {
                    setEditingScroll(null);
                    setFormContent("");
                    setFormEntities("");
                    setFormProvince(selectedProvince !== "all" ? selectedProvince : "yangzhou");
                    setSubPanel(subPanel === "add" ? null : "add");
                  }
                },
                "✒️ 补记"
              ),
              h("button", { className: "tp-btn", onClick: () => setSubPanel(subPanel === "settings" ? null : "settings") }, "⚙️"),
              h(
                "button",
                {
                  className: "tp-btn",
                  title: "张辽大白话教你用十三州密卷",
                  style: { fontWeight: 800, minWidth: "28px", justifyContent: "center" },
                  onClick: () => setGuideOpen(true)
                },
                "?"
              ),
              h("button", { className: "tp-btn", onClick: onClose }, "✕")
            )
          ),

          // 主体
          h(
            "div",
            { className: "tp-body" },
            statusMsg &&
            h(
              "div",
              {
                style: {
                  fontSize: "12px",
                  padding: "6px 10px",
                  borderRadius: "9px",
                  background: "rgba(168,45,45,0.1)",
                  color: "#a82d2d",
                  marginBottom: "8px",
                  display: "flex",
                  justifyContent: "space-between"
                }
              },
              h("span", null, statusMsg),
              h("span", { style: { cursor: "pointer" }, onClick: () => setStatusMsg("") }, "✕")
            ),

            // 飞鸢提炼子面板
            subPanel === "digest" &&
            h(
              "div",
              { className: "tp-subbox" },
              h("div", { style: { fontWeight: 600, fontSize: "13px", marginBottom: "6px" } }, "🦅 密探飞鸢 · 手动归州提炼"),
              h(
                "div",
                { style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" } },
                h("span", { style: { fontSize: "12px" } }, "提炼最近"),
                h("input", {
                  type: "number",
                  min: 6,
                  max: 120,
                  className: "tp-input",
                  style: { width: "76px" },
                  value: digestRangeN,
                  onChange: (e) => setDigestRangeN(Number(e.target.value) || 30)
                }),
                h("span", { style: { fontSize: "12px" } }, "条对话"),
                h(
                  "button",
                  { className: "tp-btn tp-btn-crimson", disabled: busy, onClick: handleManualDigest },
                  busy ? "提炼中…" : "立即派出飞鸢"
                )
              ),
              h("div", { style: { fontSize: "11px", opacity: 0.72 } }, "将自动识别主公画像、信物、羁绊与约定并归入对应东汉十三州，相似记忆自动融合去重。")
            ),

            // 新增 / 修订密卷子面板
            subPanel === "add" &&
            h(
              "div",
              { className: "tp-subbox" },
              h("div", { style: { fontWeight: 600, fontSize: "13px", marginBottom: "6px" } }, editingScroll ? "✏️ 修订密卷" : "✒️ 亲笔补记一条密卷"),
              h(
                "div",
                { style: { display: "flex", gap: "6px", marginBottom: "6px" } },
                h(
                  "select",
                  { className: "tp-select", value: formProvince, onChange: (e) => setFormProvince(e.target.value) },
                  PROVINCES.map((p) => h("option", { key: p.id, value: p.id }, `${p.icon} ${p.name}·${p.landmark}（${p.role}）`))
                ),
                h("input", {
                  className: "tp-input",
                  style: { width: "120px" },
                  placeholder: "日期 YYYY-MM",
                  value: formDate,
                  onChange: (e) => setFormDate(e.target.value)
                })
              ),
              h("textarea", {
                className: "tp-textarea",
                rows: 3,
                placeholder: "写下值得名士长期铭记的事实、习惯、信物或往事…",
                value: formContent,
                onChange: (e) => setFormContent(e.target.value),
                style: { marginBottom: "6px" }
              }),
              h(
                "div",
                { style: { display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" } },
                h("input", {
                  className: "tp-input",
                  placeholder: "关键词印记（逗号分隔，如：香菜, 桂花酿）",
                  value: formEntities,
                  onChange: (e) => setFormEntities(e.target.value)
                }),
                h(
                  "select",
                  {
                    className: "tp-select",
                    style: { width: "105px" },
                    value: formImportance,
                    onChange: (e) => setFormImportance(Number(e.target.value))
                  },
                  [10, 9, 8, 7, 6, 5, 4, 3].map((n) => h("option", { key: n, value: n }, `重要度 ${n}`))
                )
              ),
              h(
                "div",
                { style: { display: "flex", gap: "6px", justifyContent: "flex-end" } },
                h("button", { className: "tp-btn", onClick: () => { setSubPanel(null); setEditingScroll(null); } }, "取消"),
                h("button", { className: "tp-btn tp-btn-crimson", disabled: busy, onClick: handleSaveScroll }, busy ? "保存中…" : "封存入卷")
              )
            ),

            // 卷阁设置子面板
            subPanel === "settings" &&
            h(
              "div",
              { className: "tp-subbox" },
              h("div", { style: { fontWeight: 600, fontSize: "13px", marginBottom: "8px" } }, "⚙️ 十三州卷阁设置与备份"),
              h(
                "label",
                { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", marginBottom: "6px" } },
                h("input", {
                  type: "checkbox",
                  checked: Boolean(prefs.enabled),
                  onChange: async (e) => {
                    const next = await savePrefs({ enabled: e.target.checked });
                    setPrefs(next);
                  }
                }),
                "对话时自动注入十三州密卷（与伴侣分层记忆协同去重）"
              ),
              h(
                "label",
                { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", marginBottom: "8px" } },
                h("input", {
                  type: "checkbox",
                  checked: Boolean(prefs.autoDigest),
                  onChange: async (e) => {
                    const next = await savePrefs({ autoDigest: e.target.checked });
                    setPrefs(next);
                  }
                }),
                "后台自动派出飞鸢提炼（每 ",
                prefs.digestInterval,
                " 条对话）"
              ),
              h(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                h("button", { className: "tp-btn", onClick: handleExportJson }, "📤 导出 JSON"),
                h(
                  "label",
                  { className: "tp-btn", style: { cursor: "pointer" } },
                  "📥 导入 JSON",
                  h("input", { type: "file", accept: ".json", style: { display: "none" }, onChange: handleImportJson })
                ),
                h(
                  "button",
                  {
                    className: "tp-btn",
                    disabled: busy,
                    onClick: async () => {
                      setBusy(true);
                      const r = await rebuildVectorsForChar(charId);
                      setStatusMsg(`全州向量重建完成：成功 ${r.ok}/${r.total}（无 Embedding Key 时自动走纯 BM25）`);
                      setBusy(false);
                      await refreshAll();
                    }
                  },
                  "🔄 重建向量"
                ),
                h(
                  "button",
                  {
                    className: "tp-btn",
                    style: { color: "#b91c1c" },
                    onClick: async () => {
                      if (typeof confirm === "function" && !confirm(`确定清空 ${state.charName} 的全部十三州密卷吗？`)) return;
                      await clearCharArchive(charId);
                      setStatusMsg("已清空当前角色的十三州密卷");
                      await refreshAll();
                    }
                  },
                  "🗑️ 清空本角色档案"
                )
              )
            ),

            // 视图快捷栏
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" } },
              [
                ["all", "🗺️ 全部密卷"],
                ["pinned", "🟥 朱砂御批"],
                ["vows", `📜 金兰契 (${(stats && stats.activeVowCount) || 0})`],
                ["dossiers", `📁 绣衣卷宗 (${(stats && stats.dossierCount) || 0})`],
                ["archived", `🗄️ 封存箱 (${(stats && stats.archivedScrolls) || 0})`]
              ].map(([id, label]) =>
                h(
                  "button",
                  {
                    key: id,
                    className: `tp-seal ${tab === id ? "active" : ""}`,
                    onClick: () => setTab(id)
                  },
                  label
                )
              )
            ),

            // 十三州舆图印鉴栏（仅在全部/御批视图展示）
            (tab === "all" || tab === "pinned") &&
            h(
              "div",
              { className: "tp-seal-grid" },
              h(
                "button",
                {
                  className: `tp-seal ${selectedProvince === "all" ? "active" : ""}`,
                  onClick: () => setSelectedProvince("all")
                },
                "全十三州"
              ),
              displayedProvinces.map((p) => {
                const cnt = litMap[p.id] || 0;
                return h(
                  "button",
                  {
                    key: p.id,
                    className: `tp-seal ${cnt > 0 ? "lit" : ""} ${selectedProvince === p.id ? "active" : ""}`,
                    title: `${p.name}·${p.landmark}：${p.desc}`,
                    onClick: () => setSelectedProvince(p.id)
                  },
                  p.icon,
                  " ",
                  p.name,
                  cnt > 0 && h("span", { className: "tp-seal-count" }, cnt)
                );
              }),
              hiddenCount > 0 &&
              h(
                "button",
                { className: "tp-seal", onClick: () => setShowAllProvinces(true) },
                `展开其余 ${hiddenCount} 州 ▾`
              ),
              showAllProvinces &&
              h(
                "button",
                { className: "tp-seal", onClick: () => setShowAllProvinces(false) },
                "仅看已点亮 ▴"
              )
            ),

            // 搜索与排序栏
            (tab === "all" || tab === "pinned" || tab === "archived") &&
            h(
              "div",
              { className: "tp-search-row" },
              h("input", {
                className: "tp-input",
                placeholder: "BM25 即时搜密卷、关键词印记、州名…",
                value: query,
                onChange: (e) => setQuery(e.target.value)
              }),
              h(
                "select",
                {
                  className: "tp-select",
                  style: { width: "104px" },
                  value: sortBy,
                  onChange: (e) => setSortBy(e.target.value)
                },
                h("option", { value: "updated" }, "最新修订"),
                h("option", { value: "importance" }, "按重要度"),
                h("option", { value: "recall" }, "按召回频次")
              )
            ),

            // 金兰契视图
            tab === "vows" &&
            h(
              "div",
              null,
              h(
                "div",
                { className: "tp-subbox" },
                h("div", { style: { fontWeight: 600, fontSize: "12px", marginBottom: "6px" } }, "📜 新立一纸广陵金兰契"),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px", marginBottom: "6px" } },
                  h("input", {
                    className: "tp-input",
                    placeholder: "约定内容（如：月底一起去城南看灯）",
                    value: vowTitle,
                    onChange: (e) => setVowTitle(e.target.value)
                  }),
                  h("input", {
                    className: "tp-input",
                    style: { width: "120px" },
                    placeholder: "目标日期",
                    value: vowDate,
                    onChange: (e) => setVowDate(e.target.value)
                  })
                ),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px" } },
                  h("input", {
                    className: "tp-input",
                    placeholder: "补充备注（可选）",
                    value: vowNote,
                    onChange: (e) => setVowNote(e.target.value)
                  }),
                  h(
                    "button",
                    {
                      className: "tp-btn tp-btn-crimson",
                      onClick: async () => {
                        if (!vowTitle.trim()) return;
                        await addVow(charId, { title: vowTitle.trim(), targetDate: vowDate.trim(), note: vowNote.trim() });
                        setVowTitle("");
                        setVowDate("");
                        setVowNote("");
                        await refreshAll();
                      }
                    },
                    "立契"
                  )
                )
              ),
              vows.length === 0 && h("div", { style: { textAlign: "center", opacity: 0.6, padding: "24px 0", fontSize: "13px" } }, "暂未立下金兰契"),
              vows.map((v) =>
                h(
                  "div",
                  { key: v.id, className: `tp-card ${v.status === "active" ? "pinned" : ""}` },
                  h(
                    "div",
                    { className: "tp-card-meta" },
                    h(
                      "span",
                      {
                        className: "tp-badge",
                        style: {
                          background: v.status === "active" ? "rgba(185,28,28,0.14)" : "rgba(22,163,74,0.14)",
                          color: v.status === "active" ? "#b91c1c" : "#15803d"
                        }
                      },
                      v.status === "active" ? "待履约" : v.status === "fulfilled" ? "已履约" : "已过期"
                    ),
                    v.targetDate && h("span", { style: { opacity: 0.7 } }, "目标：", v.targetDate)
                  ),
                  h("div", { style: { fontSize: "13px", fontWeight: 600 } }, v.title),
                  v.note && h("div", { style: { fontSize: "12px", opacity: 0.78, marginTop: "3px" } }, v.note),
                  h(
                    "div",
                    { className: "tp-card-actions" },
                    v.status === "active"
                      ? h(
                        "button",
                        {
                          className: "tp-mini-btn",
                          onClick: async () => {
                            await updateVow(v.id, { status: "fulfilled" });
                            await refreshAll();
                          }
                        },
                        "✓ 盖章已履约"
                      )
                      : h(
                        "button",
                        {
                          className: "tp-mini-btn",
                          onClick: async () => {
                            await updateVow(v.id, { status: "active" });
                            await refreshAll();
                          }
                        },
                        "↺ 重启约定"
                      ),
                    h(
                      "button",
                      {
                        className: "tp-mini-btn",
                        onClick: async () => {
                          await deleteVow(v.id);
                          await refreshAll();
                        }
                      },
                      "🗑️ 删除"
                    )
                  )
                )
              )
            ),

            // 绣衣卷宗视图
            tab === "dossiers" &&
            h(
              "div",
              null,
              h(
                "div",
                { className: "tp-subbox" },
                h("div", { style: { fontWeight: 600, fontSize: "12px", marginBottom: "6px" } }, "📁 新建绣衣楼卷宗（合订同事件密卷）"),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px", marginBottom: "6px" } },
                  h("input", {
                    className: "tp-input",
                    placeholder: "卷宗题名（如：广陵元宵夜游风波）",
                    value: dosTitle,
                    onChange: (e) => setDosTitle(e.target.value)
                  }),
                  h(
                    "select",
                    { className: "tp-select", style: { width: "110px" }, value: dosProvince, onChange: (e) => setDosProvince(e.target.value) },
                    PROVINCES.map((p) => h("option", { key: p.id, value: p.id }, p.name))
                  )
                ),
                h("textarea", {
                  className: "tp-textarea",
                  rows: 2,
                  placeholder: "合订摘要（折叠时仅消耗 1 个召回名额）",
                  value: dosSummary,
                  onChange: (e) => setDosSummary(e.target.value),
                  style: { marginBottom: "6px" }
                }),
                h(
                  "button",
                  {
                    className: "tp-btn tp-btn-crimson",
                    onClick: async () => {
                      if (!dosTitle.trim()) return;
                      await createDossier(charId, { title: dosTitle.trim(), summary: dosSummary.trim(), province: dosProvince });
                      setDosTitle("");
                      setDosSummary("");
                      await refreshAll();
                    }
                  },
                  "建立卷宗"
                )
              ),
              dossiers.length === 0 && h("div", { style: { textAlign: "center", opacity: 0.6, padding: "24px 0", fontSize: "13px" } }, "暂无绣衣楼卷宗"),
              dossiers.map((d) => {
                const pMeta = getProvinceMeta(d.province);
                return h(
                  "div",
                  { key: d.id, className: "tp-card" },
                  h(
                    "div",
                    { className: "tp-card-meta" },
                    h("span", { className: "tp-badge", style: { background: "rgba(168,45,45,0.12)", color: "#a82d2d" } }, `${pMeta.icon} ${pMeta.name}·卷宗`),
                    h("span", { style: { opacity: 0.7 } }, d.collapsed ? "已合订折叠" : "已启封展开")
                  ),
                  h("div", { style: { fontWeight: 700, fontSize: "14px", marginBottom: "4px" } }, `《${d.title}》`),
                  h("div", { style: { fontSize: "12px", opacity: 0.85 } }, d.summary || "（暂无摘要）"),
                  h(
                    "div",
                    { className: "tp-card-actions" },
                    h(
                      "button",
                      {
                        className: "tp-mini-btn",
                        onClick: async () => {
                          await updateDossier(d.id, { collapsed: !d.collapsed });
                          await refreshAll();
                        }
                      },
                      d.collapsed ? "📂 启封展开" : "📁 合订折叠"
                    ),
                    h(
                      "button",
                      {
                        className: "tp-mini-btn",
                        onClick: async () => {
                          await deleteDossier(d.id);
                          await refreshAll();
                        }
                      },
                      "🗑️ 拆解卷宗"
                    )
                  )
                );
              })
            ),

            // 密卷列表视图
            (tab === "all" || tab === "pinned" || tab === "archived") &&
            h(
              "div",
              null,
              visibleScrolls.length === 0 &&
              h(
                "div",
                { style: { textAlign: "center", opacity: 0.62, padding: "28px 12px", fontSize: "13px" } },
                tab === "archived"
                  ? "封存箱空空如也"
                  : "此州暂未入卷，可点击右上角「🦅 飞鸢」提炼或「✒️ 补记」亲笔入档"
              ),
              visibleScrolls.map((s) => {
                const pMeta = getProvinceMeta(s.province);
                const grade = getImportanceGrade(s.importance);
                const pinned = isPinnedActive(s, now);
                return h(
                  "div",
                  { key: s.id, className: `tp-card ${pinned ? "pinned" : ""}` },
                  h(
                    "div",
                    { className: "tp-card-meta" },
                    h("span", { className: "tp-badge", style: { background: "rgba(168,45,45,0.12)", color: "#a82d2d" } }, `${pMeta.icon} ${pMeta.name}·${pMeta.role}`),
                    h("span", { className: "tp-badge", style: { background: grade.bg, color: grade.color } }, `${grade.label} ${s.importance}`),
                    pinned && h("span", { className: "tp-badge", style: { background: "#b91c1c", color: "#fff" } }, s.pinnedUntil === -1 ? "🟥 永久御批" : "🟥 7日御批"),
                    s.occurredDate && h("span", { style: { opacity: 0.65 } }, s.occurredDate),
                    s.recallCount > 0 && h("span", { style: { opacity: 0.6 } }, `召回 ${s.recallCount} 次`)
                  ),
                  h("div", { style: { fontSize: "13px", lineHeight: 1.6 } }, s.content),
                  Array.isArray(s.entities) &&
                  s.entities.length > 0 &&
                  h(
                    "div",
                    { style: { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" } },
                    s.entities.map((ent, idx) => h("span", { key: idx, className: "tp-tag" }, `#${ent}`))
                  ),
                  h(
                    "div",
                    { className: "tp-card-actions" },
                    !s.archived &&
                    (pinned
                      ? h(
                        "button",
                        {
                          className: "tp-mini-btn",
                          onClick: async () => {
                            await pinScroll(s.id, 0);
                            await refreshAll();
                          }
                        },
                        "撤御批"
                      )
                      : h(
                        React.Fragment,
                        null,
                        h(
                          "button",
                          {
                            className: "tp-mini-btn",
                            onClick: async () => {
                              await pinScroll(s.id, "permanent");
                              await refreshAll();
                            }
                          },
                          "🟥 永久御批"
                        ),
                        h(
                          "button",
                          {
                            className: "tp-mini-btn",
                            onClick: async () => {
                              await pinScroll(s.id, "7d");
                              await refreshAll();
                            }
                          },
                          "7日御批"
                        )
                      )),
                    h(
                      "button",
                      {
                        className: "tp-mini-btn",
                        onClick: () => {
                          setEditingScroll(s);
                          setFormProvince(s.province);
                          setFormContent(s.content);
                          setFormEntities((s.entities || []).join(", "));
                          setFormImportance(s.importance || 6);
                          setFormDate(s.occurredDate || "");
                          setSubPanel("add");
                        }
                      },
                      "✏️ 修订"
                    ),
                    h(
                      "button",
                      {
                        className: "tp-mini-btn",
                        onClick: async () => {
                          await updateScroll(s.id, { archived: !s.archived }, { skipVector: true });
                          await refreshAll();
                        }
                      },
                      s.archived ? "♻️ 启封" : "🗄️ 封存"
                    ),
                    h(
                      "button",
                      {
                        className: "tp-mini-btn",
                        onClick: async () => {
                          await deleteScroll(s.id);
                          await refreshAll();
                        }
                      },
                      "🗑️"
                    )
                  )
                );
              })
            )
          )
        ),
        // 张辽新手引导弹窗（z-index: 99999，浮于主卷阁之上）
        guideOpen &&
          h(
            "div",
            {
              onClick: () => setGuideOpen(false),
              style: {
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                background: "rgba(18, 22, 26, 0.68)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "14px 12px",
                boxSizing: "border-box"
              }
            },
            h(
              "div",
              {
                onClick: (e) => e.stopPropagation(),
                style: {
                  width: "min(94vw, 410px)",
                  maxHeight: "86vh",
                  background: "#FAF8F3",
                  borderRadius: "18px",
                  border: "1.5px solid #BFC9C6",
                  boxShadow: "0 22px 54px rgba(14, 22, 24, 0.42)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  color: "#2F3537"
                }
              },
              // 顶栏
              h(
                "div",
                {
                  style: {
                    padding: "14px 16px 12px",
                    background: "linear-gradient(135deg, #27363B 0%, #3C535A 100%)",
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
                        background: "rgba(130, 196, 188, 0.18)",
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
                    h("div", { style: { fontSize: "14.5px", fontWeight: 800, letterSpacing: "0.4px" } }, "雁门军账 · 文远教你理十三州密卷"),
                    h("div", { style: { fontSize: "11px", color: "#BCD3D1", marginTop: "1px" } }, "小白一分钟上手指南 · 账目分明不糊涂")
                  )
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => setGuideOpen(false),
                    style: {
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      border: "none",
                      background: "rgba(255,255,255,0.16)",
                      color: "#FFFFFF",
                      fontSize: "14px",
                      fontWeight: 700,
                      cursor: "pointer",
                      flexShrink: 0
                    }
                  },
                  "✕"
                )
              ),
              // 正文
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
                    gap: "10px"
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
                  "「刚把南北两路的绣品账核完，就见你对着这卷舆图发愣。行吧，把算盘挪一边，我顺手替你拆清楚——别老故意叫我文远叔叔，叫了我也不会少算你账，不过看在阿蝉的份上，这回教你不收钱。」"
                ),
                [
                  {
                    title: "一、这「十三州密卷」管什么？跟伴侣分层记忆冲突吗？",
                    voice: "一点不冲突，反倒是左右手。打仗行军得有日行录，也得有总军账：伴侣分层记忆（Folio）管的是这几天刚聊的话别断片；十三州密卷管的是长远事——你的忌口、送过的信物、许过的约，分好州郡落册，过了大半年他也忘不了。",
                    bullets: [
                      "两者默认一起开就行，系统在发消息前会自动把重复的内容筛掉，绝不会让名士像复读机一样车轱辘话。",
                      "每次最多精挑几条最紧要的带进对话，省 Token 也不影响原来的缓存。"
                    ]
                  },
                  {
                    title: "二、十三个州那么多，难道要我自己一条条分类？",
                    voice: "想什么呢，真要你一笔一划抄，我早把账房拆了。你只管照常跟人说话，剩下的交给「🦅 飞鸢」跑腿就行。",
                    bullets: [
                      "自动归州：默认每聊满 16 条对话，后台会自动派出飞鸢，把值得长记的事按东汉十三州归好档（比如你的忌口习惯进扬州·广陵，互赠信物进凉州，约定进徐州）。",
                      "手动提炼：聊完一段精彩剧情想马上记下来，点右上角「🦅 飞鸢」选最近 30 条一键提炼。",
                      "亲笔补记 / 修订：想主动告诉他某件事点「✒️ 补记」；觉得哪条记偏了，点卡片下方「✏️ 修订」直接改内容或换州。平时界面只亮起有记录的州，不显得乱。"
                    ]
                  },
                  {
                    title: "三、🟥 朱砂御批、📜 金兰契、📁 绣衣卷宗怎么玩？",
                    voice: "这三样最顺手，记清了跟管商队死契一样省心。",
                    bullets: [
                      "🟥 朱砂御批（置顶）：最要紧的事（比如绝对不能碰的忌口、专属称呼）点卡片上的「永久御批」或「7日御批」，绕过遗忘曲线，每回说话都保送记牢。",
                      "📜 广陵金兰契（约定）：约好了“月底去看灯”“病好去喝杏仁酪”这类待兑现的承诺，记在「金兰契」页里。没兑现前名士会一直惦记；办成了点「✓ 盖章已履约」留念。",
                      "📁 绣衣卷宗（合订）：同一场风波聊出好几条零碎记录，可以建一册卷宗把它们折叠成一句摘要，不占每轮回忆名额，想看明细随时点「启封」。"
                    ]
                  },
                  {
                    title: "四、我没配 Embedding（向量），搜得准吗？",
                    voice: "照样准，一文钱都不用多花。关外商路没官道难道就不走货了？",
                    bullets: [
                      "零配置即用：卷阁自带纯本地的 BM25 检索 + 关键词印记（卡片底下的 #标签），你提到「青玉鸢佩」或「香菜」，没配向量也能精准捞出来。",
                      "若你已经在伴侣分层记忆里配了免费 Embedding Key，这里会自动借用它做语义加强，不用重复填。"
                    ]
                  },
                  {
                    title: "五、数据存在哪？换手机怎么带走？",
                    voice: "全锁在你自己这台机子的账房里，不往外头瞎传。要换地方前，记得抄一份底账带着。",
                    bullets: [
                      "点右上角「⚙️ → 📤 导出 JSON」可单独备份当前名士的十三州密卷，随时导入恢复。",
                      "在伴侣分层记忆里点导出 JSON 备份时，也会自动把十三州密卷一并打包进去。"
                    ]
                  }
                ].map((st, idx) =>
                  h(
                    "div",
                    {
                      key: idx,
                      style: {
                        background: "#FFFFFF",
                        border: "1px solid #E3E7E5",
                        borderRadius: "13px",
                        padding: "11px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "7px"
                      }
                    },
                    h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#2B4A54" } }, st.title),
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
                          lineHeight: 1.64,
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px"
                        }
                      },
                      st.bullets.map((b, bi) => h("li", { key: bi }, b))
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
                  "「行了，账理明白了就赶紧收手。桌上还有一盒顺道带回来的西域甜酥——先去好好吃饭，吃完再碰点心。又不是在打仗，别抱着这小玩意儿熬到后半夜，听见没？」"
                )
              )
            )
          )
      );
    };
  }

  let _ModalComp = null;

  function renderPortal() {
    if (typeof document === "undefined" || !global.React || !global.ReactDOM) return;
    ensureStylesInjected();
    if (!_ModalComp) _ModalComp = createReactModalComponent();
    if (!_ModalComp) return;

    if (!_portalContainer) {
      _portalContainer = document.createElement("div");
      _portalContainer.id = "tp-archive-portal-root";
      document.body.appendChild(_portalContainer);
    }
    const el = global.React.createElement(_ModalComp, {
      state: { ..._modalState },
      onClose: closeModal
    });
    if (typeof global.ReactDOM.createRoot === "function") {
      if (!_portalRoot) _portalRoot = global.ReactDOM.createRoot(_portalContainer);
      _portalRoot.render(el);
    } else if (typeof global.ReactDOM.render === "function") {
      global.ReactDOM.render(el, _portalContainer);
    }
  }

  function openModal({ charId, charName, userName, getMessagesFn } = {}) {
    _modalState = {
      open: true,
      charId: String(charId || ""),
      charName: charName || "名士",
      userName: userName || "主公",
      getMessagesFn: typeof getMessagesFn === "function" ? getMessagesFn : null
    };
    renderPortal();
  }

  function closeModal() {
    _modalState = { ..._modalState, open: false };
    renderPortal();
  }

  // ==========================================
  // 11. 导出公共 API
  // ==========================================
  const api = {
    DB_NAME,
    PROVINCES,
    normalizeProvinceId,
    getProvinceMeta,
    getImportanceGrade,

    // 配置
    loadPrefs,
    getPrefsSync,
    savePrefs,

    // 向量工具
    encodeVectorBytes,
    decodeVectorBytes,
    cosineSimilarity,

    // 检索与打分工具
    tokenizeText,
    bigramOverlap,
    computeBM25Scores,
    computeEntityScore,
    computeDecayFactor,
    computeVitalWeight,
    isPinnedActive,

    // CRUD
    addScroll,
    updateScroll,
    pinScroll,
    deleteScroll,
    listScrolls,
    createDossier,
    updateDossier,
    deleteDossier,
    listDossiers,
    addVow,
    updateVow,
    deleteVow,
    listVows,

    // 检索与 Prompt 注入
    searchScrolls,
    buildArchiveContext,

    // AI 飞鸢提炼
    parseDigestJson,
    digestMessages,
    maybeAutoDigest,
    rebuildVectorsForChar,

    // 统计与备份
    getCharStats,
    exportCharArchive,
    importCharArchive,
    clearCharArchive,

    // UI Portal
    openModal,
    closeModal,

    // 测试辅助
    _resetMemoryStoreForTests
  };

  global.ThirteenProvincesEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

