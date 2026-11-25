/**
 * Milvus/guangling_news_engine.js (v2.0)
 * 独立引擎（阶段一）：
 * - 5 大可指定真实栏目只读采集器：论坛·名人小报（详细播报）/ 论坛·超话圈 / 传讯近3-5条 / 绣衣楼·公告 / 太疾驰随机商品
 * - 指定角色主播 + 传讯·心纸居（心纸君）立绘库只读桥接 + 自定义透明立绘持久化
 * - 定时档期 + 离线补播 + 手机端到点纯净模式配置
 * - 零新增 localStorage 写入（本模块自身全部存入独立 IndexedDB: milvus_guangling_news_idb）
 * - 零 Emoji
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_GUANGLING_NEWS_ENGINE_V2_LOADED__) return;
  global.__MILVUS_GUANGLING_NEWS_ENGINE_V2_LOADED__ = true;

  const DB_NAME = "milvus_guangling_news_idb";
  const DB_VERSION = 1;
  const STORE_NAME = "news_state";

  const DEFAULT_SOURCES = {
    tabloid: true, // 论坛 · 名人小报（随机挑 1 条详细播报）
    superTopic: true, // 论坛 · 超话圈（随机挑 1 条播报）
    chatRecent: true, // 传讯 · 随机角色近 3-5 条播报
    moments: true, // 传讯 · 角色朋友圈
    xiuyilouNotice: true, // 绣衣楼 · 公告随机播报
    xiuyiSurvey: true, // 绣衣楼 · 绣衣问卷
    taijichiGoods: true, // 太疾驰 · 随机商品播报
    coupleWish: true, // 情侣空间 · 角色愿望
    coupleDailyQ: true, // 情侣空间 · 每日一问
    canghaiMoment: true, // 情侣空间 · 沧海一刻
    funNews: true // 广陵街头趣味快讯兜底/彩蛋
  };

  const SOURCE_META = [
    { id: "tabloid", group: "public", label: "论坛 · 名人小报", desc: "随机挑选一条名人小报并分段详细播报" },
    { id: "superTopic", group: "public", label: "论坛 · 超话圈", desc: "随机挑选一条超话热帖趣味播报" },
    { id: "xiuyilouNotice", group: "public", label: "绣衣楼 · 公告", desc: "随机挑选一条绣衣楼四大板块公告宣读" },
    { id: "xiuyiSurvey", group: "public", label: "绣衣楼 · 绣衣问卷", desc: "随机播报已保存的官方或自拟问卷答卷" },
    { id: "taijichiGoods", group: "public", label: "太疾驰 · 随机商品", desc: "随机挑选太疾驰上架商品做物价好物快讯" },
    { id: "funNews", group: "public", label: "广陵街头趣闻", desc: "穿插轻松诙谐的广陵城日常彩蛋" },
    { id: "chatRecent", group: "private", label: "传讯 · 角色近况", desc: "随机抽选一位角色的近 3-5 条聊天播报" },
    { id: "moments", group: "private", label: "传讯 · 角色朋友圈", desc: "随机播报一条角色朋友圈动态与神评" },
    { id: "coupleWish", group: "private", label: "情侣空间 · 角色愿望", desc: "随机播报角色悄悄写下的愿望清单" },
    { id: "coupleDailyQ", group: "private", label: "情侣空间 · 每日一问", desc: "随机重温一道已作答的每日默契问答" },
    { id: "canghaiMoment", group: "private", label: "情侣空间 · 沧海一刻", desc: "播报角色近期心情贴纸与手札片段" }
  ];

  const DEFAULT_VOICE_SETTINGS = {
    mode: "animalese",
    preset: "sunny-helper",
    basePitchHz: 485,
    unitsPerSecond: 10.2,
    toneAmount: 0.62,
    mixRatio: 0.0,
    warmthHz: 9500,
    volume: 0.84,
    maxLag: 0.75,
    webSpeechRate: 1.08,
    webSpeechPitch: 1.0,
    webSpeechVoiceURI: "",
    cloneVoiceId: "",
    clonePrefetch: true,
    anchorVoiceMap: {}
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    scheduleTimes: ["08:00", "12:30", "20:00"],
    autoPopupOnSchedule: true, // 前台到点自动切入演播室
    pureModeOnSchedule: true, // 到点播放时手机端启用纯净画面模式
    logoMain: "广陵联播",
    logoSub: "GLN",
    soundEnabled: true,
    anchorMode: "default", // "default" | "mansion" | "custom"
    anchorCharId: "",
    anchorName: "广陵值班主播",
    anchorSpriteIndex: 0,
    anchorScale: 1.0,
    anchorOffsetX: 0.0,
    anchorOffsetY: 0.0,
    episodeMaxSections: 4, // 每期精选栏目数（3 / 4 / 0 表示全量播报）
    sources: { ...DEFAULT_SOURCES },
    voice: { ...DEFAULT_VOICE_SETTINGS },
    customScript: ""
  };

  const GUANGLING_FUN_NEWS = [
    "据东市点心铺线报，今日出炉的第一笼桂花糕在半柱香内宣告售罄，现场多位路人表示只是路过闻了一下就被香味留住了脚步。",
    "绣衣楼后院的狸花猫今日成功占领了日照最好的青石台阶，并拒绝了三名路过密探的摸头申请，态度十分高冷。",
    "广陵城观星台发布最新生活指数：今日微风和煦，宜喝温茶、宜晒太阳、忌对着账本发愁。",
    "据西街茶肆不完全统计，今天聊起「今晚吃什么」的频率较昨日上升了三成，目前尚未得出统一结论。",
    "城南画舫传来消息，一只白鹭在船头端坐了整整一个时辰，围观群众纷纷猜测它也在等一条重要传讯。",
    "广陵气象观察员友情提醒：无论窗外晴雨如何，记得给自己的好心情留一把随时能撑开的小伞。",
    "据坊间传闻，今日有人在书肆角落翻到一张夹着干花的旧书签，上面只写着四个字：记得早睡。",
    "城东花市今日新到一批晚香玉与浅粉山茶，摊主称凡是今天笑过三次以上的人路过都会觉得格外香甜。",
    "绣衣楼茶水间最新民意调查显示，高达九成的受访者认为「忙完手头的事去吃顿好的」是世间头等大事。",
    "今日广陵驿道车马平顺，信鸽状态极佳，据称连最爱偷懒的那只灰鸽都准时把信送到了屋檐下。",
    "城北糖画摊今日推出了限量小猪与飞鸢造型，据说买到的人一整天都会被好运轻轻眷顾。",
    "本台特约生活顾问播报：如果你此刻觉得有点累，说明你今天已经足够努力了，现在可以理直气壮地歇五分钟。",
    "据城中琴社消息，傍晚的风穿过竹林时奏出了一段极好听的羽调，路过的行人都忍不住放慢了步子。",
    "今日广陵物价平稳，唯独「温柔与好心情」属于无价之宝，本台建议各位观众妥善珍藏。",
    "坊间夜话栏目统计，每当夜幕降临，打开小手机翻看旧日传讯的人嘴角上扬概率高达百分之九十八。",
    "广陵城甜水铺老板今日宣布：凡是对今天的小事感到一丝雀跃的顾客，都自动获得一份无形加倍快乐。"
  ];

  // ===================== 通用工具与长句智能切分器 =====================
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDateKey(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj || Date.now());
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function formatReadableDate(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj || Date.now());
    const weeks = ["日", "一", "二", "三", "四", "五", "六"];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${weeks[d.getDay()]}`;
  }

  function cleanPlainText(raw) {
    if (raw === null || raw === undefined) return "";
    if (typeof raw === "object") {
      if (Array.isArray(raw)) {
        return raw.map((x) => cleanPlainText(x)).filter(Boolean).join("、");
      }
      const picked =
        raw.name ?? raw.nickname ?? raw.title ?? raw.text ?? raw.content ?? raw.value ?? raw.label ?? "";
      return cleanPlainText(picked);
    }
    return String(raw)
      .replace(/<[^>]+>/g, " ")
      .replace(/\[object Object\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickRandom(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function pickRandomMany(arr, count) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  /**
   * 智能按中文标点将长正文拆分为适合字幕框阅读的多条短句（每条 <= maxLen 字）
   */
  function splitIntoBroadcastChunks(text, maxLen) {
    const limit = maxLen || 56;
    const clean = cleanPlainText(text);
    if (!clean) return [];
    if (clean.length <= limit) return [clean];

    const sentences = clean.match(/[^。！？；\n]+[。！？；]?/g) || [clean];
    const chunks = [];
    let buf = "";

    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i].trim();
      if (!s) continue;
      if (buf && buf.length + s.length > limit) {
        chunks.push(buf);
        buf = "";
      }
      if (s.length > limit) {
        if (buf) {
          chunks.push(buf);
          buf = "";
        }
        for (let p = 0; p < s.length; p += limit) {
          chunks.push(s.slice(p, p + limit));
        }
      } else {
        buf += s;
      }
    }
    if (buf) chunks.push(buf);
    return chunks.slice(0, 4); // 单条长新闻最多拆 4 屏，保持播报节奏紧凑
  }

  // ===================== 档期与状态评估 =====================
  function parseTimeToMinutes(hhmm) {
    const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return -1;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return -1;
    return h * 60 + min;
  }

  function normalizeScheduleTimes(list) {
    const raw = Array.isArray(list) ? list : DEFAULT_SETTINGS.scheduleTimes;
    const seen = new Set();
    const out = [];
    raw.forEach((item) => {
      const mins = parseTimeToMinutes(item);
      if (mins < 0) return;
      const formatted = `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
      if (!seen.has(formatted)) {
        seen.add(formatted);
        out.push({ formatted, mins });
      }
    });
    out.sort((a, b) => a.mins - b.mins);
    const result = out.slice(0, 6).map((x) => x.formatted);
    return result.length > 0 ? result : [...DEFAULT_SETTINGS.scheduleTimes];
  }

  function normalizeSources(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const out = {};
    Object.keys(DEFAULT_SOURCES).forEach((k) => {
      out[k] = src[k] !== undefined ? !!src[k] : !!DEFAULT_SOURCES[k];
    });
    return out;
  }

  function getSlotPeriodLabel(hhmm) {
    const mins = parseTimeToMinutes(hhmm);
    if (mins < 0) return "广陵快讯";
    if (mins < 11 * 60) return "早间联播";
    if (mins < 14 * 60 + 30) return "午间快讯";
    if (mins < 18 * 60) return "午后播报";
    return "晚间联播";
  }

  function evaluateBroadcastStatus(settings, watchedMap, dateInput) {
    const now = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const todayKey = formatDateKey(now);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const times = normalizeScheduleTimes(settings && settings.scheduleTimes);
    const watched = watchedMap && typeof watchedMap === "object" ? watchedMap : {};

    let latestPassed = null;
    let pendingSlot = null;
    let isLiveNow = false;
    let nextSlot = null;
    let minutesToNext = 0;

    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const mins = parseTimeToMinutes(t);
      const isWatched = !!watched[`${todayKey}::${t}`];
      if (mins <= nowMins) {
        latestPassed = t;
        if (!isWatched) {
          pendingSlot = t;
          if (nowMins - mins <= 30) {
            isLiveNow = true;
          }
        }
      } else if (!nextSlot) {
        nextSlot = t;
        minutesToNext = mins - nowMins;
      }
    }

    if (!nextSlot) {
      nextSlot = times[0];
      minutesToNext = 24 * 60 - nowMins + parseTimeToMinutes(times[0]);
    }

    const activeSlot = pendingSlot || latestPassed || times[0];
    const hLeft = Math.floor(minutesToNext / 60);
    const mLeft = minutesToNext % 60;
    const countdownText =
      hLeft > 0 ? `${hLeft}小时${mLeft > 0 ? `${mLeft}分` : ""}后` : `${Math.max(1, mLeft)}分钟后`;

    return {
      todayKey,
      scheduleTimes: times,
      activeSlot,
      pendingSlot,
      hasUnread: !!pendingSlot,
      isLiveNow,
      nextSlot,
      minutesToNext,
      countdownText,
      periodLabel: getSlotPeriodLabel(activeSlot)
    };
  }

  // ===================== IndexedDB 持久层（本模块零 localStorage 写入） =====================
  function openDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function idbGet(key, fallback) {
    const db = await openDB();
    if (!db) return fallback;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
          db.close();
          resolve(req.result !== undefined ? req.result : fallback);
        };
        req.onerror = () => {
          db.close();
          resolve(fallback);
        };
      } catch (_) {
        try { db.close(); } catch (__) {}
        resolve(fallback);
      }
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch (_) {
        try { db.close(); } catch (__) {}
        resolve(false);
      }
    });
  }

  function dispatchUpdate(kind, detail) {
    if (typeof global.dispatchEvent === "function") {
      try {
        global.dispatchEvent(new CustomEvent("milvus-guangling-news-updated", { detail: { kind, detail } }));
      } catch (_) {}
    }
  }

  function normalizeVoiceSettings(raw) {
    if (global.GuanglingVoiceEngine && typeof global.GuanglingVoiceEngine.normalizeVoiceConfig === "function") {
      return global.GuanglingVoiceEngine.normalizeVoiceConfig(raw);
    }
    const base = { ...DEFAULT_VOICE_SETTINGS };
    if (raw && typeof raw === "object") {
      Object.assign(base, raw);
      base.anchorVoiceMap =
        raw.anchorVoiceMap && typeof raw.anchorVoiceMap === "object" ? { ...raw.anchorVoiceMap } : {};
    }
    return base;
  }

  function resolveAnchorVoiceConfig(settings, anchorCharId) {
    const base = normalizeVoiceSettings(settings && settings.voice);
    const cid = String(anchorCharId || (settings && settings.anchorCharId) || "").trim();
    if (cid && base.anchorVoiceMap && base.anchorVoiceMap[cid] && typeof base.anchorVoiceMap[cid] === "object") {
      return normalizeVoiceSettings({
        ...base,
        ...base.anchorVoiceMap[cid],
        anchorVoiceMap: base.anchorVoiceMap
      });
    }
    return base;
  }

  async function loadSettings() {
    const saved = await idbGet("settings", null);
    const merged = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
    merged.scheduleTimes = normalizeScheduleTimes(merged.scheduleTimes);
    merged.sources = normalizeSources(merged.sources);
    merged.voice = normalizeVoiceSettings(merged.voice);
    return merged;
  }

  async function saveSettings(patch) {
    const cur = await loadSettings();
    const next = { ...cur, ...(patch || {}) };
    next.scheduleTimes = normalizeScheduleTimes(next.scheduleTimes);
    next.sources = normalizeSources(next.sources);
    next.voice = normalizeVoiceSettings(next.voice);
    next.logoMain = String(next.logoMain || "广陵联播").trim().slice(0, 12) || "广陵联播";
    next.logoSub = String(next.logoSub || "GLN").trim().toUpperCase().slice(0, 3) || "GLN";
    await idbSet("settings", next);
    dispatchUpdate("settings", next);
    return next;
  }

  async function loadAnchorMedia() {
    return await idbGet("anchor_media", "");
  }

  async function saveAnchorMedia(dataUrl) {
    const ok = await idbSet("anchor_media", String(dataUrl || ""));
    dispatchUpdate("anchor_media", ok);
    return ok;
  }

  async function loadWatchedMap() {
    const m = await idbGet("watched_map", {});
    return m && typeof m === "object" ? m : {};
  }

  async function markSlotWatched(slotTime, dateInput) {
    const todayKey = formatDateKey(dateInput || new Date());
    const map = await loadWatchedMap();
    map[`${todayKey}::${slotTime}`] = Date.now();
    const cutoff = Date.now() - 14 * 86400000;
    Object.keys(map).forEach((k) => {
      if (typeof map[k] === "number" && map[k] < cutoff) delete map[k];
    });
    await idbSet("watched_map", map);
    dispatchUpdate("watched", { todayKey, slotTime });
    return map;
  }

  async function loadEpisodesArchive() {
    const list = await idbGet("episodes_archive", []);
    return Array.isArray(list) ? list : [];
  }

  async function saveEpisodeToArchive(episode) {
    if (!episode || !episode.id) return [];
    const list = await loadEpisodesArchive();
    const idx = list.findIndex((e) => e.id === episode.id);
    if (idx >= 0) list[idx] = episode;
    else list.unshift(episode);
    const trimmed = list.slice(0, 15);
    await idbSet("episodes_archive", trimmed);
    dispatchUpdate("episode", episode);
    return trimmed;
  }

  // ===================== 只读读取主库 user_settings 辅助 =====================
  async function readMainUserSetting(key) {
    if (typeof global.openDB !== "function") return null;
    try {
      const db = await global.openDB();
      if (!db || !db.objectStoreNames || !db.objectStoreNames.contains("user_settings")) return null;
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction("user_settings", "readonly");
          const req = tx.objectStore("user_settings").get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : null);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    } catch (_) {
      return null;
    }
  }

  // ===================== 心纸居（心纸君）立绘库只读桥接 =====================
  async function loadHeartPaperSprites() {
    const map = {};
    const mergeMap = (raw) => {
      if (!raw || typeof raw !== "object") return;
      Object.keys(raw).forEach((k) => {
        const val = raw[k];
        const arr = Array.isArray(val) ? val : typeof val === "string" && val ? [val] : [];
        const valid = arr.filter((u) => typeof u === "string" && u.trim().length > 0);
        if (valid.length > 0) {
          map[k] = valid;
        }
      });
    };

    try {
      const idbVal = await readMainUserSetting("mansion_character_sprites");
      mergeMap(idbVal);
    } catch (_) {}

    if (typeof global.localStorage !== "undefined") {
      try {
        const lsRaw = global.localStorage.getItem("t8_mansion_custom_avatars");
        if (lsRaw) mergeMap(JSON.parse(lsRaw));
      } catch (_) {}
    }

    return map;
  }

  function getSpritesForCharacter(charObj, spritesMap) {
    if (!charObj || !spritesMap || typeof spritesMap !== "object") return [];
    const keys = [charObj.id, String(charObj.id || ""), charObj.name].filter(Boolean);
    for (let i = 0; i < keys.length; i++) {
      const hit = spritesMap[keys[i]];
      if (Array.isArray(hit) && hit.length > 0) return hit;
    }
    return [];
  }

  async function resolveAnchorDisplay(settings) {
    const st = settings || (await loadSettings());
    const result = {
      name: st.anchorName || DEFAULT_SETTINGS.anchorName,
      charObj: null,
      imageUrl: "",
      sprites: [],
      sourceLabel: "默认猫嘴主播"
    };

    let chars = [];
    if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
      try {
        const all = await global.chatCharacterStore.getAll();
        if (Array.isArray(all)) chars = all;
      } catch (_) {}
    }

    if (st.anchorCharId) {
      const found = chars.find((c) => c && String(c.id) === String(st.anchorCharId));
      if (found) {
        result.charObj = found;
        result.name = found.name || result.name;
      }
    }

    if (st.anchorMode === "custom") {
      const customMedia = await loadAnchorMedia();
      if (customMedia) {
        result.imageUrl = customMedia;
        result.sourceLabel = "自定义透明立绘";
        return result;
      }
    }

    if (st.anchorMode === "mansion" && result.charObj) {
      const spritesMap = await loadHeartPaperSprites();
      const sprites = getSpritesForCharacter(result.charObj, spritesMap);
      result.sprites = sprites;
      if (sprites.length > 0) {
        const idx = Math.max(0, Math.min(sprites.length - 1, Number(st.anchorSpriteIndex) || 0));
        result.imageUrl = sprites[idx];
        result.sourceLabel = `心纸居形象 (${idx + 1}/${sprites.length})`;
        return result;
      }
      // 若该角色未在心纸居配置立绘，柔和回退至角色传讯头像（若有）
      if (result.charObj.avatar && typeof result.charObj.avatar === "string" && /^(data:|https?:|blob:)/.test(result.charObj.avatar)) {
        result.imageUrl = result.charObj.avatar;
        result.sourceLabel = "传讯头像兜底（心纸居未配置）";
        return result;
      }
    }

    return result;
  }

  // ===================== 5 大真实栏目只读采集器（含防连续重复抽取记忆） =====================
  const lastPickedKeys = {
    tabloid: "",
    superTopic: "",
    chatChar: "",
    notice: ""
  };

  function pickRandomAvoiding(pool, bucketKey, idGetter) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    if (pool.length === 1) {
      lastPickedKeys[bucketKey] = idGetter(pool[0]);
      return pool[0];
    }
    const prev = lastPickedKeys[bucketKey];
    const filtered = prev ? pool.filter((item) => idGetter(item) !== prev) : pool;
    const chosen = pickRandom(filtered.length > 0 ? filtered : pool);
    if (chosen) lastPickedKeys[bucketKey] = idGetter(chosen);
    return chosen;
  }

  // 1. 论坛 · 名人小报（优先读取真实键 localStorage["character_news_<角色名>"]，并支持详播）
  function collectTabloidItem(storageObj) {
    const ls = storageObj || (typeof global.localStorage !== "undefined" ? global.localStorage : null);
    if (!ls) return null;
    const pool = [];

    // 1A. 真实名人小报正文：character_news_<角色名> => [{ title, content }, ...]
    try {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (!k || !k.startsWith("character_news_")) continue;
        const charName = k.slice("character_news_".length).trim();
        const raw = ls.getItem(k);
        if (!raw) continue;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) continue;
        arr.forEach((n) => {
          if (!n) return;
          const title = cleanPlainText(n.title || n.headline || "");
          const content = cleanPlainText(n.content || n.summary || n.body || n.desc || "");
          if (title || content) {
            pool.push({
              charName: charName && charName !== "default" ? charName : "",
              title,
              content
            });
          }
        });
      }
    } catch (_) {}

    // 1B. 兼容社区转发的小报帖：area_content_*
    try {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (!k || !k.startsWith("area_content_")) continue;
        const parsed = JSON.parse(ls.getItem(k) || "{}");
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        items.forEach((it) => {
          if (!it) return;
          if (it.sourceType === "tabloid" || it.tabloidCharName || /名人|小报|八卦/.test(String(it.section || ""))) {
            const title = cleanPlainText(it.title || "");
            const content = cleanPlainText(it.content || it.text || it.body || "");
            if (title || content) {
              pool.push({ charName: it.tabloidCharName || it.author || "", title, content });
            }
          }
        });
      }
    } catch (_) {}

    // 1C. 若尚未打开过任意角色的小报页，最后回退 celebrity_cards_cache 名片热点
    if (pool.length === 0) {
      try {
        const rawCache = ls.getItem("celebrity_cards_cache");
        if (rawCache) {
          const parsed = JSON.parse(rawCache);
          const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed && parsed.cards) ? parsed.cards : [];
          list.forEach((c) => {
            if (!c) return;
            const charName = c.name || c.charName || c.character || "";
            const title = cleanPlainText(c.title || c.tagLine || c.tagline || "");
            const content = cleanPlainText(c.content || c.subTag || c.bio || c.summary || "");
            if (title || content) pool.push({ charName, title, content });
          });
        }
      } catch (_) {}
    }

    return pickRandomAvoiding(pool, "tabloid", (x) => `${x.charName}::${x.title}`);
  }

  // 2. 论坛 · 超话圈（随机挑 1 条）
  function collectSuperTopicItem(storageObj) {
    const ls = storageObj || (typeof global.localStorage !== "undefined" ? global.localStorage : null);
    if (!ls) return null;
    const pool = [];

    try {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (!k || !k.startsWith("weibo_circle_")) continue;
        const arr = JSON.parse(ls.getItem(k) || "[]");
        if (!Array.isArray(arr)) continue;
        arr.forEach((it) => {
          if (!it) return;
          const content = cleanPlainText(it.content || it.text || it.title || "");
          if (content.length < 4) return;
          const authorRaw =
            typeof it.author === "object" && it.author
              ? it.author.name || it.author.nickname || it.author.userName || ""
              : it.author || it.userName || it.nickname || "";
          pool.push({
            circleName: it.circleCharName ? `#${it.circleCharName}超话#` : "超话圈",
            author: cleanPlainText(authorRaw) || "匿名网友",
            content
          });
        });
      }
    } catch (_) {}

    return pickRandomAvoiding(pool, "superTopic", (x) => `${x.circleName}::${x.content.slice(0, 24)}`);
  }

  // 3. 传讯 · 随机挑选一位角色的近 3-5 条聊天记录（兼容 { messages: [...] } 对象返回与多形态 ID）
  async function extractMessagesForChar(ch, mockGetMessages) {
    if (typeof mockGetMessages === "function") {
      const res = await mockGetMessages(ch.id);
      return Array.isArray(res) ? res : (res && Array.isArray(res.messages) ? res.messages : []);
    }
    const store = global.chatHistoryStore;
    if (!store) return [];

    const candidateIds = [];
    const pushId = (v) => {
      if (v !== undefined && v !== null && v !== "" && !candidateIds.includes(v)) candidateIds.push(v);
    };
    pushId(ch.id);
    if (typeof ch.id === "string" && !isNaN(Number(ch.id))) pushId(Number(ch.id));
    if (typeof ch.id === "number") pushId(String(ch.id));
    pushId(ch.name);

    for (let i = 0; i < candidateIds.length; i++) {
      const cid = candidateIds[i];
      try {
        if (typeof store.getRecentMessages === "function") {
          const r1 = await store.getRecentMessages(cid, 15);
          const list1 = Array.isArray(r1) ? r1 : (r1 && Array.isArray(r1.messages) ? r1.messages : []);
          if (list1.length > 0) return list1;
        }
        if (typeof store.getMessages === "function") {
          const r2 = await store.getMessages(cid, 1, 20);
          const list2 = Array.isArray(r2) ? r2 : (r2 && Array.isArray(r2.messages) ? r2.messages : []);
          if (list2.length > 0) return list2;
        }
      } catch (_) {}
    }
    return [];
  }

  async function collectRandomChatRecent(mockChars, mockGetMessages) {
    let chars = Array.isArray(mockChars) ? mockChars : [];
    if (chars.length === 0 && global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
      try {
        const all = await global.chatCharacterStore.getAll();
        if (Array.isArray(all)) chars = all;
      } catch (_) {}
    }
    if (chars.length === 0) return null;

    // 优先排开上次刚播报过的角色，全量打乱逐一尝试直到找到有真实对话的角色
    const shuffled = pickRandomMany(chars, chars.length);
    const ordered = shuffled.filter((c) => String(c && c.id) !== lastPickedKeys.chatChar)
      .concat(shuffled.filter((c) => String(c && c.id) === lastPickedKeys.chatChar));

    for (let i = 0; i < ordered.length; i++) {
      const ch = ordered[i];
      if (!ch || (!ch.id && !ch.name)) continue;
      try {
        const msgs = await extractMessagesForChar(ch, mockGetMessages);
        if (!Array.isArray(msgs) || msgs.length === 0) continue;
        const valid = msgs
          .filter((m) => {
            if (!m || m.type === "narration" || m.type === "system" || m.type === "recall") return false;
            const rawText = m.text || m.content || m.message || "";
            const t = cleanPlainText(rawText);
            return t.length >= 2 && !t.startsWith("{") && !t.startsWith("[") && !/^data:image\//.test(t);
          })
          .slice(-5);
        if (valid.length > 0) {
          const wantCount = valid.length >= 5 ? (3 + Math.floor(Math.random() * 3)) : valid.length;
          const picked = valid.slice(-wantCount).map((m) => ({
            sender: m.isMe || m.sender === "user" || m.role === "user" ? "你" : ch.name || "对方",
            text: cleanPlainText(m.text || m.content || m.message || "").slice(0, 48)
          }));
          lastPickedKeys.chatChar = String(ch.id || ch.name);
          return {
            charId: String(ch.id || ch.name),
            charName: ch.name || "名士",
            messages: picked
          };
        }
      } catch (_) {}
    }
    return null;
  }

  // 4. 绣衣楼 · 公告随机挑 1 条（优先读真实四大板块 settingsStore.getXiuyiNotices，合并导出历史）
  async function collectXiuYiLouNotice(mockNotices) {
    const pool = [];
    const TAB_NAMES = ["绣衣要闻", "楼内新规", "内外交流", "广陵爆报"];

    const pushNoticeItem = (item, sectionName) => {
      if (!item) return;
      const fields = item.fields || item;
      const title = cleanPlainText(item.title || fields.headline1 || fields.headline2 || "");
      const body = cleanPlainText(item.content || fields.story1 || fields.fluffyContent || fields.rightBody1 || "");
      const funLine = cleanPlainText(fields.funLine || "");
      const author = cleanPlainText(item.character || "");
      if (title || body) {
        pool.push({
          section: sectionName || "绣衣楼公告",
          title: title || "绣衣楼公告",
          body,
          funLine,
          author
        });
      }
    };

    if (Array.isArray(mockNotices)) {
      mockNotices.forEach((entry, idx) => {
        if (Array.isArray(entry)) {
          entry.forEach((it) => pushNoticeItem(it, TAB_NAMES[idx] || "绣衣楼公告"));
        } else {
          pushNoticeItem(entry, "绣衣楼公告");
        }
      });
    } else {
      // 4A. 真实四大板块公告：window.settingsStore.getXiuyiNotices()
      if (global.settingsStore && typeof global.settingsStore.getXiuyiNotices === "function") {
        try {
          const savedTabs = await global.settingsStore.getXiuyiNotices();
          if (Array.isArray(savedTabs)) {
            savedTabs.forEach((tabArr, idx) => {
              if (Array.isArray(tabArr)) {
                tabArr.forEach((it) => pushNoticeItem(it, TAB_NAMES[idx] || "绣衣楼公告"));
              }
            });
          }
        } catch (_) {}
      }
      // 4B. 补充导出历史鸢报：xiuyi_daily_news_history_v1
      try {
        const history = await readMainUserSetting("xiuyi_daily_news_history_v1");
        if (Array.isArray(history)) {
          history.forEach((it) => pushNoticeItem(it, "绣衣鸢报"));
        }
      } catch (_) {}
    }

    return pickRandomAvoiding(pool, "notice", (x) => `${x.section}::${x.title}`);
  }

  // 5. 太疾驰 · 随机挑 2-3 件商品
  async function collectTaiJiChiGoods(mockProducts) {
    let allGoods = Array.isArray(mockProducts) ? mockProducts : [];

    if (allGoods.length === 0 && global.tjcStore) {
      try {
        if (typeof global.tjcStore.getAll === "function") {
          const vals = await global.tjcStore.getAll();
          if (Array.isArray(vals)) {
            vals.forEach((v) => {
              if (Array.isArray(v)) allGoods.push(...v);
              else if (v && Array.isArray(v.value)) allGoods.push(...v.value);
            });
          }
        } else if (typeof global.tjcStore.get === "function") {
          const commonCats = ["推荐", "百货", "美食", "餐饮", "服饰", "雅玩", "美妆", "日用", "奇珍", "二手"];
          for (let i = 0; i < commonCats.length; i++) {
            const arr = await global.tjcStore.get("products_" + commonCats[i]);
            if (Array.isArray(arr) && arr.length > 0) allGoods.push(...arr);
          }
        }
      } catch (_) {}
    }

    const cleaned = allGoods
      .filter((p) => p && (p.productName || p.foodName || p.name || p.title))
      .map((p) => ({
        shopName: cleanPlainText(p.shopName || p.merchantName || "太疾驰严选"),
        name: cleanPlainText(p.productName || p.foodName || p.name || p.title),
        price: p.price !== undefined && p.price !== null ? String(p.price) : "",
        intro: cleanPlainText(p.intro || p.desc || p.description || "").slice(0, 38)
      }));

    return pickRandomMany(cleaned, 3);
  }

  // ===================== 汇总全站真实素材（含独立采集插件） =====================
  async function collectLocalWorldDigest(dateInput, options) {
    const opts = options || {};
    const now = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    const sources = normalizeSources(opts.sources);

    const extraPromise =
      global.GuanglingNewsCollectors && typeof global.GuanglingNewsCollectors.collectAllExtra === "function"
        ? global.GuanglingNewsCollectors.collectAllExtra(sources, opts)
        : Promise.resolve({});

    const [chatRecent, xiuyilouNotice, taijichiGoods, extraDigest] = await Promise.all([
      sources.chatRecent ? collectRandomChatRecent(opts.mockChars, opts.mockGetMessages) : Promise.resolve(null),
      sources.xiuyilouNotice ? collectXiuYiLouNotice(opts.mockNotices) : Promise.resolve(null),
      sources.taijichiGoods ? collectTaiJiChiGoods(opts.mockGoods) : Promise.resolve([]),
      extraPromise
    ]);

    const tabloid = sources.tabloid ? collectTabloidItem(opts.mockStorage) : null;
    const superTopic = sources.superTopic ? collectSuperTopicItem(opts.mockStorage) : null;

    let solarTerm = null;
    if (global.SeasonalPushEngine) {
      try {
        solarTerm = global.SeasonalPushEngine.getSolarTermByDate(now);
      } catch (_) {}
    }

    return {
      dateKey: formatDateKey(now),
      readableDate: formatReadableDate(now),
      tabloid,
      superTopic,
      chatRecent,
      xiuyilouNotice,
      taijichiGoods,
      ...(extraDigest && typeof extraDigest === "object" ? extraDigest : {}),
      solarTerm
    };
  }

  // ===================== 离线详播编稿引擎（全站联动 + 智能栏目配额 + 长句分页） =====================
  let lastServedSectionIds = [];

  function composeOfflineEpisode(digest, slotTime, settings, nowInput) {
    const now = nowInput instanceof Date ? nowInput : new Date(nowInput || Date.now());
    const dateKey = (digest && digest.dateKey) || formatDateKey(now);
    const period = getSlotPeriodLabel(slotTime);
    const anchorName = (settings && settings.anchorName) || DEFAULT_SETTINGS.anchorName;
    const logoMain = (settings && settings.logoMain) || DEFAULT_SETTINGS.logoMain;
    const sources = normalizeSources(settings && settings.sources);
    const maxSections =
      settings && typeof settings.episodeMaxSections === "number" ? settings.episodeMaxSections : 4;

    if (settings && settings.customScript && settings.customScript.trim()) {
      const customLines = settings.customScript
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (customLines.length > 0) {
        return {
          id: `${dateKey}::${slotTime}`,
          dateKey,
          slotTime,
          periodLabel: period,
          source: "custom",
          anchorName,
          headline: customLines[0].slice(0, 34),
          lines: customLines,
          createdAt: Date.now()
        };
      }
    }

    const sectionEntries = [];

    // 1. 论坛 · 名人小报（详细分页播报）
    if (sources.tabloid && digest.tabloid) {
      const tb = digest.tabloid;
      const sLines = [`【名人小报详报】${tb.charName ? `焦点人物${tb.charName}：` : ""}${tb.title || "广陵最新秘闻"}。`];
      if (tb.content) {
        splitIntoBroadcastChunks(tb.content, 56).forEach((c) => sLines.push(c));
      }
      sectionEntries.push({
        id: "tabloid",
        headline: `名人小报：${tb.title || tb.charName || "广陵秘闻"}`,
        lines: sLines
      });
    }

    // 2. 论坛 · 超话圈
    if (sources.superTopic && digest.superTopic) {
      const st = digest.superTopic;
      const sLines = [`【超话圈直击】${st.circleName}里，网友「${st.author}」刚刚发来一条热帖：`];
      splitIntoBroadcastChunks(st.content, 56).slice(0, 2).forEach((c) => sLines.push(c));
      sectionEntries.push({
        id: "superTopic",
        headline: `${st.circleName}热议速递`,
        lines: sLines
      });
    }

    // 3. 传讯 · 随机角色近 3-5 条消息
    if (sources.chatRecent && digest.chatRecent && digest.chatRecent.messages.length > 0) {
      const cr = digest.chatRecent;
      const sLines = [`【传讯快讯】本台随机连线了与${cr.charName}的传讯频道，精选近期 ${cr.messages.length} 条对话实录：`];
      cr.messages.forEach((m) => sLines.push(`${m.sender}提到：「${m.text}」`));
      sectionEntries.push({
        id: "chatRecent",
        headline: `传讯一线：${cr.charName}近期动向`,
        lines: sLines
      });
    }

    // 4. 绣衣楼 · 公告
    if (sources.xiuyilouNotice && digest.xiuyilouNotice) {
      const nt = digest.xiuyilouNotice;
      const secTag = nt.section ? `绣衣楼·${nt.section}` : "绣衣楼公告";
      const sLines = [`【${secTag}】今日楼内发布《${nt.title}》：`];
      if (nt.body) {
        splitIntoBroadcastChunks(nt.body, 56).slice(0, 2).forEach((c) => sLines.push(c));
      }
      if (nt.funLine) sLines.push(`据楼内线报，现场名士点评道：${nt.funLine}`);
      sectionEntries.push({
        id: "xiuyilouNotice",
        headline: `绣衣楼公告：${nt.title}`,
        lines: sLines
      });
    }

    // 5. 太疾驰 · 随机商品
    if (sources.taijichiGoods && Array.isArray(digest.taijichiGoods) && digest.taijichiGoods.length > 0) {
      const goods = digest.taijichiGoods;
      const listStr = goods.map((g) => `「${g.name}」${g.price ? `（${g.price}）` : ""}`).join("、");
      const sLines = [`【太疾驰商肆速递】今日太疾驰货架上新热销：${listStr}。`];
      if (goods[0].intro) {
        sLines.push(`其中${goods[0].shopName}力荐的「${goods[0].name}」备受好评：${goods[0].intro}`);
      }
      sectionEntries.push({
        id: "taijichiGoods",
        headline: `太疾驰好物：${goods[0].name}`,
        lines: sLines
      });
    }

    // 6. 独立采集插件新增的 5 大联动栏目（朋友圈 / 绣衣问卷 / 情侣愿望 / 每日一问 / 沧海一刻）
    if (global.GuanglingNewsCollectors && typeof global.GuanglingNewsCollectors.composeExtraSectionEntries === "function") {
      const extraEntries = global.GuanglingNewsCollectors.composeExtraSectionEntries(digest, sources, splitIntoBroadcastChunks);
      if (Array.isArray(extraEntries)) {
        extraEntries.forEach((e) => sectionEntries.push(e));
      }
    }

    // 智能栏目轮播配额：勾选超过配额时优先播上次未出现的栏目，保持单期紧凑有趣
    let chosenSections = sectionEntries;
    if (maxSections > 0 && sectionEntries.length > maxSections) {
      const fresh = pickRandomMany(
        sectionEntries.filter((s) => !lastServedSectionIds.includes(s.id)),
        sectionEntries.length
      );
      const stale = pickRandomMany(
        sectionEntries.filter((s) => lastServedSectionIds.includes(s.id)),
        sectionEntries.length
      );
      chosenSections = fresh.concat(stale).slice(0, maxSections);
    }
    lastServedSectionIds = chosenSections.map((s) => s.id);

    const lines = [];
    let headline = "";
    lines.push(`各位观众好，欢迎收看${digest.readableDate} ${slotTime}档《${logoMain}·${period}》，我是值班主播${anchorName}。`);

    chosenSections.forEach((sec) => {
      if (!headline && sec.headline) headline = sec.headline;
      sec.lines.forEach((l) => lines.push(l));
    });

    // 岁时节气或广陵街头趣闻兜底
    if (digest.solarTerm) {
      lines.push(`【岁时提醒】今天是二十四节气「${digest.solarTerm.name} · ${digest.solarTerm.alias}」，${digest.solarTerm.tip}`);
    }
    if (sources.funNews || lines.length <= 2) {
      const fun = pickRandom(GUANGLING_FUN_NEWS);
      if (!headline) headline = fun.slice(0, 32);
      lines.push(`【广陵街头趣闻】${fun}`);
    }

    lines.push(`以上就是本期《${logoMain}》的全部内容，感谢您的收看，我是${anchorName}，我们下一档再见！`);

    return {
      id: `${dateKey}::${slotTime}`,
      dateKey,
      slotTime,
      periodLabel: period,
      source: "offline",
      anchorName,
      headline: (headline || "今日广陵联播已开播").slice(0, 36),
      lines,
      createdAt: Date.now()
    };
  }

  async function getOrCreateEpisode(slotTime, options) {
    const opts = options || {};
    const now = opts.now instanceof Date ? opts.now : new Date();
    const settings = opts.settings || (await loadSettings());
    const dateKey = formatDateKey(now);
    const id = `${dateKey}::${slotTime}`;

    if (!opts.forceRegenerate && !settings.customScript.trim()) {
      const archive = await loadEpisodesArchive();
      const existing = archive.find((e) => e.id === id);
      if (existing && Array.isArray(existing.lines) && existing.lines.length > 0) {
        return existing;
      }
    }

    const digest = await collectLocalWorldDigest(now, { sources: settings.sources });
    const ep = composeOfflineEpisode(digest, slotTime, settings, now);
    await saveEpisodeToArchive(ep);
    return ep;
  }

  // ===================== 名士 6 维人设 + 开启世界书上下文采集 & 真实 AI 精编 =====================
  async function collectAnchorPersonaContext(anchorCharId, anchorName) {
    let userPersona = { name: "广陵王", identity: "绣衣楼主", personality: "", background: "" };
    try {
      if (typeof global.localStorage !== "undefined") {
        const list = JSON.parse(global.localStorage.getItem("user_personas") || "[]");
        const activeId = global.localStorage.getItem("active_persona_id");
        const hit = Array.isArray(list) ? list.find((p) => String(p.id) === String(activeId)) || list[0] : null;
        if (hit) {
          userPersona = {
            name: cleanPlainText(hit.name || "广陵王") || "广陵王",
            identity: cleanPlainText(hit.identity || ""),
            personality: cleanPlainText(hit.personality || ""),
            background: cleanPlainText(hit.background || hit.bio || "").slice(0, 220)
          };
        }
      }
    } catch (_) {}

    let worldBookText = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) {
          worldBookText = String(wb).trim().slice(0, 1200);
        }
      }
    } catch (_) {}

    const cid = String(anchorCharId || "").trim();
    let fullChar = null;
    if (cid && global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
      try {
        const all = await global.chatCharacterStore.getAll();
        if (Array.isArray(all)) {
          fullChar = all.find((c) => c && String(c.id) === cid) || null;
        }
      } catch (_) {}
    }

    let cs = {};
    try {
      if (typeof global.localStorage !== "undefined" && (cid || (fullChar && fullChar.name))) {
        const csMap = JSON.parse(global.localStorage.getItem("character_settings") || "{}");
        cs = (cid && csMap[cid]) || (fullChar && fullChar.name && csMap[fullChar.name]) || {};
      }
    } catch (_) {}

    const prof = (fullChar && fullChar.profile) || {};
    const hasCharacter = !!fullChar;
    const charProfile = {
      id: cid || "default_anchor",
      name: cleanPlainText((fullChar && fullChar.name) || anchorName || "广陵值班主播"),
      mbti: cleanPlainText(prof.mbti || (fullChar && fullChar.mbti) || cs.mbti || ""),
      constellation: cleanPlainText(
        prof.constellation || prof.zodiac || (fullChar && fullChar.constellation) || cs.constellation || ""
      ),
      speakingStyle: cleanPlainText(
        prof.speakingStyle || prof.style || (fullChar && fullChar.speakingStyle) || cs.speakingStyle || ""
      ),
      personality: cleanPlainText(
        prof.personality || (fullChar && fullChar.personality) || cs.personality || (fullChar && fullChar.desc) || ""
      ),
      background: cleanPlainText(
        prof.background || prof.bio || (fullChar && fullChar.background) || cs.background || (fullChar && fullChar.desc) || ""
      ).slice(0, 420)
    };

    return { hasCharacter, charProfile, worldBookText, userPersona };
  }

  async function callGuanglingLLM(messages, timeoutMs) {
    const limit = Number(timeoutMs) || 90000;
    if (typeof global.sendToLLM !== "function") {
      throw new Error("未检测到全局模型接口（请先在设置中配置 API）");
    }
    let timer = null;
    const invoke = new Promise((resolve, reject) => {
      try {
        global.sendToLLM(
          messages,
          { disableMCP: true },
          (reply) => resolve(reply),
          (err) => reject(err instanceof Error ? err : new Error(String(err || "模型调用失败")))
        );
      } catch (e) {
        reject(e);
      }
    });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("AI 撰稿超时，已自动回退离线播报稿")), limit);
    });
    try {
      return await Promise.race([invoke, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function parseAiBroadcastLines(rawReply) {
    let text = String(rawReply || "").trim();
    text = text.replace(/```(?:json|text|markdown)?/gi, "").replace(/```/g, "").trim();

    // 若模型误返回 JSON 数组，优先解析数组
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) {
          return arr
            .map((s) => cleanPlainText(s).replace(/[\p{Extended_Pictographic}]/gu, "").trim())
            .filter((s) => s.length >= 6)
            .slice(0, 10);
        }
      } catch (_) {}
    }

    return text
      .split(/\r?\n/)
      .map((s) =>
        s
          .replace(/^[\d一二三四五六七八九十]+[、.．:：\-\s]+/, "")
          .replace(/^[-•*·\s]+/, "")
          .replace(/[\p{Extended_Pictographic}]/gu, "")
          .trim()
      )
      .filter((s) => s.length >= 6)
      .slice(0, 10);
  }

  async function generateAiEpisode(slotTime, optionsOrDate) {
    const isDate = optionsOrDate instanceof Date;
    const opts = !isDate && optionsOrDate && typeof optionsOrDate === "object" ? optionsOrDate : {};
    const now = isDate ? optionsOrDate : opts.now instanceof Date ? opts.now : new Date();
    const settings = opts.settings || (await loadSettings());

    let fallback = opts.baseEpisode;
    if (!fallback || !Array.isArray(fallback.lines) || fallback.lines.length === 0) {
      const digest = await collectLocalWorldDigest(now, { sources: settings.sources });
      fallback = composeOfflineEpisode(digest, slotTime, settings, now);
    }

    const ctx = await collectAnchorPersonaContext(settings.anchorCharId, settings.anchorName);
    const cp = ctx.charProfile;
    const up = ctx.userPersona;

    const personaLines = ctx.hasCharacter
      ? [
          `- 角色姓名：${cp.name}（ID: ${cp.id}）`,
          cp.mbti ? `- MBTI 性格类型：${cp.mbti}` : "",
          cp.constellation ? `- 星座：${cp.constellation}` : "",
          cp.speakingStyle ? `- 语言风格：${cp.speakingStyle}` : "",
          cp.personality ? `- 性格特点：${cp.personality}` : "",
          cp.background ? `- 个人背景：${cp.background}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      : `- 角色姓名：${cp.name}\n- 语言风格：机敏风趣、熟悉广陵掌故的金牌值班主播`;

    const worldBookBlock = ctx.worldBookText
      ? `\n\n【当前生效的世界书设定（请自然遵守并融入世界观细节）】\n${ctx.worldBookText}`
      : "";

    const userBlock = `\n\n【收看节目的观众身份】\n称呼：${up.name}${up.identity ? `（${up.identity}）` : ""}`;

    const systemPrompt =
      `你现在完全代入「${cp.name}」担任《${settings.logoMain || "广陵联播"}》的当值新闻主播。\n` +
      `【你的 6 维角色配置】\n${personaLines}${worldBookBlock}${userBlock}\n\n` +
      `【播报要求】\n` +
      `1. 严格保持「${cp.name}」本人的口吻、脾气、说话习惯与称呼方式，像任天堂《朋友收集：梦想生活》新闻台一样生动有趣、有反差感与活人感。\n` +
      `2. 忠实保留下面提供的真实新闻事件、具体人名、商品名、问卷/朋友圈/沧海一刻等细节，用你自己的话来播报与点评，不要凭空编造完全无关的事件。\n` +
      `3. 输出 6~9 条简短中文播报台词（含开场问候与结束语），每条单独一行，每条 18~54 字。\n` +
      `4. 严禁输出序号、项目符号、Markdown、JSON、舞台括号动作说明或任何 Emoji。`;

    const rawFacts = fallback.lines.length > 2 ? fallback.lines.slice(1, -1).join("\n") : fallback.lines.join("\n");
    const userPrompt = `今天是${formatReadableDate(now)}，档期为 ${slotTime}。以下是本台刚采编到的真实素材，请你以「${cp.name}」本人的口吻重新播报一遍：\n\n${rawFacts}`;

    try {
      const reply = await callGuanglingLLM(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        90000
      );

      const lines = parseAiBroadcastLines(reply);
      if (lines.length >= 3) {
        const ep = {
          ...fallback,
          source: "ai",
          anchorName: cp.name,
          headline: (lines[1] || lines[0]).slice(0, 36),
          lines,
          aiMeta: {
            hasPersona: ctx.hasCharacter,
            hasWorldBook: !!ctx.worldBookText,
            anchorName: cp.name
          },
          createdAt: Date.now()
        };
        await saveEpisodeToArchive(ep);
        return ep;
      }
      return {
        ...fallback,
        aiMeta: { hasPersona: ctx.hasCharacter, hasWorldBook: !!ctx.worldBookText, error: "模型返回行数不足，已保留离线稿" }
      };
    } catch (err) {
      return {
        ...fallback,
        aiMeta: {
          hasPersona: ctx.hasCharacter,
          hasWorldBook: !!ctx.worldBookText,
          error: (err && err.message) || "AI 精编失败，已保留离线稿"
        }
      };
    }
  }

  // ===================== 前台轻量整点调度器（30s 心跳） =====================
  let schedulerTimer = null;
  let lastLiveNotifiedKey = "";

  function startScheduler() {
    if (schedulerTimer) return;
    const tick = async () => {
      const settings = await loadSettings();
      if (!settings.enabled) return;
      const watched = await loadWatchedMap();
      const status = evaluateBroadcastStatus(settings, watched, new Date());
      if (status.isLiveNow && status.pendingSlot) {
        const key = `${status.todayKey}::${status.pendingSlot}`;
        if (lastLiveNotifiedKey !== key) {
          lastLiveNotifiedKey = key;
          dispatchUpdate("live_start", { status, settings });
        }
      }
    };
    tick();
    schedulerTimer = setInterval(tick, 30000);
  }

  function stopScheduler() {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startScheduler, { once: true });
    } else {
      startScheduler();
    }
  }

  global.GuanglingNewsEngine = {
    DB_NAME,
    STORE_NAME,
    DEFAULT_SOURCES,
    SOURCE_META,
    DEFAULT_VOICE_SETTINGS,
    DEFAULT_SETTINGS,
    GUANGLING_FUN_NEWS,
    formatDateKey,
    formatReadableDate,
    splitIntoBroadcastChunks,
    normalizeScheduleTimes,
    normalizeSources,
    normalizeVoiceSettings,
    resolveAnchorVoiceConfig,
    getSlotPeriodLabel,
    evaluateBroadcastStatus,
    loadSettings,
    saveSettings,
    loadAnchorMedia,
    saveAnchorMedia,
    loadWatchedMap,
    markSlotWatched,
    loadEpisodesArchive,
    saveEpisodeToArchive,
    loadHeartPaperSprites,
    getSpritesForCharacter,
    resolveAnchorDisplay,
    collectTabloidItem,
    collectSuperTopicItem,
    collectRandomChatRecent,
    collectXiuYiLouNotice,
    collectTaiJiChiGoods,
    collectLocalWorldDigest,
    composeOfflineEpisode,
    getOrCreateEpisode,
    collectAnchorPersonaContext,
    generateAiEpisode,
    startScheduler,
    stopScheduler
  };
})(window);
