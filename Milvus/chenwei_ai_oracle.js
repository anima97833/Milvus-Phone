/**
 * Milvus/chenwei_ai_oracle.js
 * 「谶纬小摊 2.0」5 维名士上下文采集器 + 乐高解签引擎 + 名士专属谶纬蓝图生成引擎 + 独立 IDB 卷宗库
 * - 零 localStorage 写入，全部卷宗与名士谶纬缓存存入 milvus_chenwei_lego_idb
 * - 严格采集 5 维上下文：角色 6 项核心配置 + 身份配置库 + 世界书开启条目 + 传讯近期至少 30 条聊天记录 + 乐高积木量化格局
 * - 统一 90 秒大模型等待兜底（AI_TIMEOUT_MS = 90000），优先复用 window.sendToLLM
 * - 内置 5 级全链路名士头像解析器（100% 兼容 t8_mansion_custom_avatars / role_avatar / avatarStore）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_chenwei_lego_idb";
  const DB_VERSION = 1;
  const STORE_ORACLE = "oracle_records";
  const STORE_CHAR_PROPHECY = "char_prophecies";
  const AI_TIMEOUT_MS = 90000;
  const MIN_CHAT_HISTORY_COUNT = 36; // 确保拉取至少 30 条近期传讯上下文

  // 东汉三大正统谶纬体裁（单次起卦一并输出，弹窗内三键切换阅览）
  const ORACLE_FORMS = [
    { id: "poem",   label: "古诗签",   seal: "诗签", subtitle: "四言/五言/七言绝句 · 观象寄情" },
    { id: "ballad", label: "东汉童谣", seal: "童谣", subtitle: "巷陌歌谣 · 三言/三三七言隐喻" },
    { id: "chenyu", label: "图谶秘语", seal: "图谶", subtitle: "河图纬书 · 拆字象数断语" }
  ];

  // ==========================================
  // 1. 独立 IndexedDB 卷宗与名士谶纬缓存
  // ==========================================
  let _dbPromise = null;
  let _memOracle = [];
  const _memCharMap = new Map();

  function openDb() {
    if (typeof indexedDB === "undefined" || !indexedDB) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_ORACLE)) {
            db.createObjectStore(STORE_ORACLE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_CHAR_PROPHECY)) {
            db.createObjectStore(STORE_CHAR_PROPHECY, { keyPath: "charId" });
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

  function notifyChenweiUpdated() {
    try {
      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("chenwei_oracle_updated", { detail: { at: Date.now() } }));
      }
    } catch (e) {}
  }

  async function saveOracleRecord(rec) {
    const item = { id: rec.id || `cw_${Date.now()}`, ...rec, savedAt: Date.now() };
    const db = await openDb();
    if (!db) {
      _memOracle = [item, ..._memOracle.slice(0, 29)];
      notifyChenweiUpdated();
      return item;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ORACLE, "readwrite");
        tx.objectStore(STORE_ORACLE).put(item);
        tx.oncomplete = () => { notifyChenweiUpdated(); resolve(item); };
        tx.onerror = () => resolve(item);
      } catch (e) { resolve(item); }
    });
  }

  async function loadOracleRecords(limit = 30) {
    const db = await openDb();
    if (!db) return _memOracle.slice(0, limit);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ORACLE, "readonly");
        const req = tx.objectStore(STORE_ORACLE).getAll();
        req.onsuccess = () => {
          const list = Array.isArray(req.result) ? req.result : [];
          list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
          resolve(list.slice(0, limit));
        };
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  async function getOracleRecordById(recordId) {
    const rid = String(recordId || "");
    if (!rid) return null;
    const db = await openDb();
    if (!db) return _memOracle.find((r) => String(r.id) === rid) || null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ORACLE, "readonly");
        const req = tx.objectStore(STORE_ORACLE).get(rid);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function updateOracleRecord(recordId, updater) {
    const rid = String(recordId || "");
    if (!rid || typeof updater !== "function") return null;
    const existing = await getOracleRecordById(rid);
    if (!existing) return null;
    const next = { ...existing, ...(updater(existing) || {}), id: rid, updatedAt: Date.now() };
    const db = await openDb();
    if (!db) {
      const idx = _memOracle.findIndex((r) => String(r.id) === rid);
      if (idx >= 0) _memOracle[idx] = next;
      else _memOracle = [next, ..._memOracle.slice(0, 29)];
      return next;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ORACLE, "readwrite");
        tx.objectStore(STORE_ORACLE).put(next);
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => resolve(next);
      } catch (e) { resolve(next); }
    });
  }

  async function saveCharProphecy(charId, data) {
    const cid = String(charId);
    const item = { charId: cid, ...data, savedAt: Date.now() };
    const db = await openDb();
    if (!db) {
      _memCharMap.set(cid, item);
      notifyChenweiUpdated();
      return item;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CHAR_PROPHECY, "readwrite");
        tx.objectStore(STORE_CHAR_PROPHECY).put(item);
        tx.oncomplete = () => { notifyChenweiUpdated(); resolve(item); };
        tx.onerror = () => resolve(item);
      } catch (e) { resolve(item); }
    });
  }

  async function loadAllCharProphecies() {
    const db = await openDb();
    if (!db) return Object.fromEntries(_memCharMap.entries());
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CHAR_PROPHECY, "readonly");
        const req = tx.objectStore(STORE_CHAR_PROPHECY).getAll();
        req.onsuccess = () => {
          const map = {};
          for (const it of (req.result || [])) {
            if (it && it.charId) map[String(it.charId)] = it;
          }
          resolve(map);
        };
        req.onerror = () => resolve({});
      } catch (e) { resolve({}); }
    });
  }

  // ==========================================
  // 2. 5 级全链路名士头像解析器与名士加载
  // ==========================================
  function isRenderableUrl(url) {
    if (!url || typeof url !== "string") return false;
    const s = url.trim();
    if (!s) return false;
    return (
      s.startsWith("data:") ||
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("blob:") ||
      s.startsWith("/") ||
      s.startsWith("./") ||
      /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(s)
    );
  }

  async function tryResolveSingleAvatarKey(key) {
    if (key === undefined || key === null || key === "") return "";
    if (typeof key === "string" && isRenderableUrl(key)) return key.trim();

    try {
      if (typeof global.resolveAvatarUrl === "function") {
        const res = await global.resolveAvatarUrl(key, "");
        if (isRenderableUrl(res)) return res;
      }
    } catch (e) {}

    const cleanKey = typeof key === "string" && key.startsWith("idb:") ? key.slice(4) : key;
    try {
      const store = global.avatarStore;
      if (store && typeof store.get === "function") {
        const item = await store.get(key);
        if (item && isRenderableUrl(item.avatarData)) return item.avatarData;
        if (cleanKey !== key) {
          const item2 = await store.get(cleanKey);
          if (item2 && isRenderableUrl(item2.avatarData)) return item2.avatarData;
        }
      }
    } catch (e) {}

    try {
      if (typeof global.openDB === "function") {
        const db = await global.openDB();
        if (db && db.objectStoreNames && db.objectStoreNames.contains("avatars")) {
          const val = await new Promise((resolve) => {
            try {
              const tx = db.transaction("avatars", "readonly");
              const req = tx.objectStore("avatars").get(cleanKey);
              req.onsuccess = () => resolve(req.result?.avatarData || req.result?.data || "");
              req.onerror = () => resolve("");
            } catch (e) { resolve(""); }
          });
          if (isRenderableUrl(val)) return val;
        }
      }
    } catch (e) {}

    return "";
  }

  async function resolveCharAvatarUrl(c) {
    if (!c) return "";
    const id = c.id;
    const idStr = id !== undefined && id !== null ? String(id) : "";
    const name = String(c.name || "");

    if (idStr && typeof global.localStorage !== "undefined") {
      try {
        const customMap = JSON.parse(global.localStorage.getItem("t8_mansion_custom_avatars") || "{}");
        const arr = customMap[idStr] || customMap[id];
        if (Array.isArray(arr) && arr.length > 0 && arr[0]) {
          const r = await tryResolveSingleAvatarKey(arr[0]);
          if (r) return r;
        }
      } catch (e) {}
    }

    if (idStr && typeof global.openDB === "function") {
      try {
        const db = await global.openDB();
        if (db && db.objectStoreNames && db.objectStoreNames.contains("user_settings")) {
          const custom = await new Promise((resolve) => {
            try {
              const tx = db.transaction("user_settings", "readonly");
              const req = tx.objectStore("user_settings").get(`role_avatar_${idStr}`);
              req.onsuccess = () => resolve(req.result?.value || "");
              req.onerror = () => resolve("");
            } catch (e) { resolve(""); }
          });
          if (custom) {
            const r = await tryResolveSingleAvatarKey(custom);
            if (r) return r;
          }
        }
      } catch (e) {}
    }

    const candidates = [];
    if (c.avatar) candidates.push(c.avatar);
    if (c.avatarUrl) candidates.push(c.avatarUrl);
    if (c.avatarKey) candidates.push(c.avatarKey);
    if (c.avatarId) candidates.push(c.avatarId);
    if (c.profile && c.profile.avatar) candidates.push(c.profile.avatar);
    if (c.profile && c.profile.avatarId) candidates.push(c.profile.avatarId);
    try {
      if (typeof global.localStorage !== "undefined") {
        const csMap = JSON.parse(global.localStorage.getItem("character_settings") || "{}");
        const cs = csMap[idStr] || csMap[id] || (name ? csMap[name] : null);
        if (cs && cs.avatar) candidates.push(cs.avatar);
      }
    } catch (e) {}
    if (idStr) candidates.push(idStr);
    if (id !== "" && id !== idStr) candidates.push(id);
    if (idStr && /^\d+$/.test(idStr)) candidates.push(Number(idStr));

    const seen = new Set();
    for (const key of candidates) {
      const sk = `${typeof key}:${key}`;
      if (seen.has(sk)) continue;
      seen.add(sk);
      const url = await tryResolveSingleAvatarKey(key);
      if (url) return url;
    }
    return "";
  }

  async function loadAllCharacters() {
    let raw = [];
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        raw = await global.chatCharacterStore.getAll();
      } else if (typeof global.localStorage !== "undefined") {
        raw = JSON.parse(global.localStorage.getItem("t8_chat_list") || "[]");
      }
    } catch (e) { raw = []; }
    return (Array.isArray(raw) ? raw : []).filter((c) => {
      if (!c || !c.id || !c.name) return false;
      const cid = String(c.id);
      if (cid.startsWith("group") || c.type === "group" || c.isGroup || c.type === "decor") return false;
      if (String(c.name).includes("未知角色")) return false;
      return true;
    });
  }

  // ==========================================
  // 3. 5 维名士上下文采集（含近期 ≥30 条传讯上下文）
  // ==========================================
  function formatRecentMessages(msgs, charName, userName) {
    if (!Array.isArray(msgs) || !msgs.length) return { count: 0, text: "" };
    const sliced = msgs.slice(-MIN_CHAT_HISTORY_COUNT);
    const lines = sliced.map((m) => {
      const who = m.isMe || m.sender === "我" || m.senderId === "me" ? userName : (m.sender || charName);
      let txt = String(m.text || m.content || "").replace(/\[(?:图片|语音|表情|sticker)[^\]]*\]/gi, "[互动]").trim();
      if (!txt) txt = "(发送了互动消息)";
      return `${who}：${txt.slice(0, 120)}`;
    });
    return { count: lines.length, text: lines.join("\n") };
  }

  async function collectCharacter5DContext(charObj) {
    // 1. 用户身份配置库
    let userPersona = { name: "主公", identity: "", personality: "", background: "" };
    try {
      if (typeof global.localStorage !== "undefined") {
        const list = JSON.parse(global.localStorage.getItem("user_personas") || "[]");
        const activeId = global.localStorage.getItem("active_persona_id");
        const hit = Array.isArray(list) ? (list.find((p) => String(p.id) === String(activeId)) || list[0]) : null;
        if (hit) {
          userPersona = {
            name: hit.name || "主公",
            identity: hit.identity || "",
            personality: hit.personality || "",
            background: String(hit.background || hit.bio || "").slice(0, 260)
          };
        }
      }
    } catch (e) {}

    // 2. 世界书开启条目
    let worldBookText = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldBookText = String(wb).trim().slice(0, 1100);
      }
    } catch (e) {}

    // 3. 角色 6 项完整配置（姓名ID / MBTI / 星座 / 语言风格 / 性格特点 / 个人背景）
    let charProfile = null;
    let recentChat = { count: 0, text: "" };

    if (charObj) {
      const cid = String(charObj.id);
      const prof = charObj.profile || {};
      let cs = {};
      try {
        if (typeof global.localStorage !== "undefined") {
          const csMap = JSON.parse(global.localStorage.getItem("character_settings") || "{}");
          cs = csMap[cid] || csMap[charObj.name] || {};
        }
      } catch (e) {}

      charProfile = {
        id: cid,
        name: String(charObj.name || "名士"),
        mbti: prof.mbti || charObj.mbti || cs.mbti || "未知",
        constellation: prof.constellation || charObj.constellation || cs.constellation || "未知",
        speakingStyle: prof.speakingStyle || prof.style || charObj.speakingStyle || cs.speakingStyle || "古风雅致，贴合人物口吻",
        personality: prof.personality || charObj.personality || cs.personality || charObj.desc || "深沉鲜明",
        background: String(prof.background || prof.bio || charObj.background || cs.background || charObj.desc || "").slice(0, 420)
      };

      // 4. 传讯近期上下文（拉取至少 30~36 条）
      let msgs = [];
      if (global.chatHistoryStore) {
        try {
          if (typeof global.chatHistoryStore.getRecentMessages === "function") {
            msgs = await global.chatHistoryStore.getRecentMessages(cid, MIN_CHAT_HISTORY_COUNT);
          } else if (typeof global.chatHistoryStore.getMessages === "function") {
            const all = await global.chatHistoryStore.getMessages(cid);
            msgs = Array.isArray(all) ? all.slice(-MIN_CHAT_HISTORY_COUNT) : [];
          }
        } catch (e) {}
      }
      recentChat = formatRecentMessages(msgs, charProfile.name, userPersona.name);
    }

    return { userPersona, worldBookText, charProfile, recentChat };
  }

  // ==========================================
  // 4. 90 秒大模型调用器 + JSON 清洗
  // ==========================================
  function extractJsonObject(text) {
    const raw = String(text || "").trim();
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (e) {
      return null;
    }
  }

  function resolveMainLlmConfig() {
    try {
      if (typeof global.getLlmConfig === "function") {
        const cfg = global.getLlmConfig();
        if (cfg && cfg.apiKey && cfg.endpoint) return cfg;
      }
      if (typeof global.localStorage !== "undefined") {
        const raw = global.localStorage.getItem("api_config") || global.localStorage.getItem("llm_config") || global.localStorage.getItem("openai_config");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.apiKey || parsed.key) && (parsed.endpoint || parsed.baseUrl || parsed.url)) {
            let ep = parsed.endpoint || parsed.baseUrl || parsed.url;
            if (!ep.endsWith("/chat/completions")) ep = ep.replace(/\/+$/, "") + "/chat/completions";
            return { endpoint: ep, apiKey: parsed.apiKey || parsed.key, model: parsed.model || "gpt-4o-mini" };
          }
        }
      }
    } catch (e) {}
    return null;
  }

  async function callOracleLLM(msgs, maxTokens = 650) {
    let timer = null;
    const invoke = async () => {
      if (typeof global.sendToLLM === "function") {
        return await new Promise((resolve, reject) => {
          try {
            global.sendToLLM(msgs, { disableMCP: true }, (reply) => resolve(reply), (err) => reject(err));
          } catch (e) { reject(e); }
        });
      }
      const llm = resolveMainLlmConfig();
      if (!llm) throw new Error("NO_LLM");
      const headers = { "Content-Type": "application/json" };
      if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
      const resp = await fetch(llm.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: llm.model,
          messages: msgs,
          temperature: 0.85,
          max_tokens: maxTokens
        })
      });
      if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
      const json = await resp.json();
      return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
    };

    try {
      return await Promise.race([
        invoke(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("TIMEOUT_90S")), AI_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ==========================================
  // 5. 东汉三体裁（古诗签 + 东汉童谣 + 图谶秘语）兜底生成器 & 玩家积木起卦
  // ==========================================
  function buildOfflineTriVerses(analysis = {}, qText = "") {
    const elem = analysis.dominantElement || "火";
    const arch = analysis.archetype || "筑台问天";
    const count = Number(analysis.brickCount || 6);
    const elemMap = {
      "火": {
        poem: `赤焰登台照夜阑，\n${arch}气象入云端。\n莫道风云多诡谲，\n守心落子自安然。`,
        ballad: `城南火，照高台，\n三尺砖，九重开。\n朱雀飞过广陵陌，\n笑看风起故人来。`,
        chenyu: `赤雀衔书，炎精上腾；\n双火成炎，三日见明；\n动静失衡则灼，守中而行大吉。`,
        chenyuGloss: `【象数拆解】主气归「火」，砖石共${count}枚成「${arch}」之势，利明谋、忌躁进。`
      },
      "木": {
        poem: `青枝叠玉应星躔，\n松柏生风气象全。\n静待春雷惊蛰处，\n旧盟新约两相牵。`,
        ballad: `青青草，绕石阶，\n东边枝，西边栽。\n莫问枯荣谁作主，\n风吹一夜百花开。`,
        chenyu: `青龙吐气，木生于坎；\n十口相传，生机暗藏；\n曲直有度，久谋必成。`,
        chenyuGloss: `【象数拆解】主气归「木」，${count}石相衔如林木滋长，宜徐图缓进、广结善缘。`
      },
      "水": {
        poem: `寒潭映月玉阶清，\n叠石藏锋暗浪平。\n莫笑潜龙犹未跃，\n一朝雷动九川鸣。`,
        ballad: `黑水水，流石桥，\n桥头雾，桥尾潮。\n船家不言前路险，\n半夜听桨过江皋。`,
        chenyu: `玄武伏波，坎水润下；\n三点成川，隐字藏锋；\n明退暗进，利在幽微。`,
        chenyuGloss: `【象数拆解】主气归「水」，象主深谋秘计，表面波澜不惊，实则暗流已转。`
      },
      "金": {
        poem: `白玉为台剑气寒，\n规矩方圆自可观。\n若问前程谁主断，\n一诺千金石不刊。`,
        ballad: `白石砌，铜铃响，\n直如弦，莫相仿。\n西风吹断阶前叶，\n留得金印在君掌。`,
        chenyu: `白虎司权，兑金凝肃；\n一刀断葛，刚克柔从；\n决断莫迟，迟则生变。`,
        chenyuGloss: `【象数拆解】主气归「金」，${arch}筋骨分明，所问「${String(qText || "前程").slice(0, 10)}」宜当机立断。`
      },
      "土": {
        poem: `厚土承天四柱安，\n重台叠影耐风寒。\n纵有浮云遮望眼，\n根深不动万山宽。`,
        ballad: `黄土厚，筑高墙，\n墙内暖，墙外凉。\n莫怨行人归步晚，\n灯火原在自家堂。`,
        chenyu: `黄龙镇中，坤厚载物；\n四隅既固，外邪难侵；\n守成待时，终得其位。`,
        chenyuGloss: `【象数拆解】主气归「土」，重心稳固，凡事以守为攻，静候对方先露破绽。`
      }
    };
    return elemMap[elem] || elemMap["火"];
  }

  function normalizeTriVerses(parsed, fallbackVerses) {
    const vObj = (parsed && parsed.verses && typeof parsed.verses === "object") ? parsed.verses : {};
    const poem = String(vObj.poem || parsed?.oracleVerse || fallbackVerses.poem).trim();
    const ballad = String(vObj.ballad || parsed?.balladVerse || fallbackVerses.ballad).trim();
    const chenyu = String(vObj.chenyu || parsed?.chenyuVerse || fallbackVerses.chenyu).trim();
    const chenyuGloss = String(parsed?.chenyuGloss || vObj.chenyuGloss || fallbackVerses.chenyuGloss).trim();
    return {
      verses: { poem, ballad, chenyu },
      chenyuGloss,
      oracleVerse: poem
    };
  }

  async function requestPlayerDivination({ question = "", bricks = [], commentatorChar = null } = {}) {
    const Bricks = global.ChenweiLegoBricks;
    const analysis = Bricks ? Bricks.analyzeStructure(bricks) : { summaryText: "坛上已落积木。", dominantElement: "火", archetype: "筑台问天", brickCount: bricks.length };
    const ctx = await collectCharacter5DContext(commentatorChar);
    const qText = String(question || "").trim() || "近日气运与心中所系之事";
    const offlineVerses = buildOfflineTriVerses(analysis, qText);

    const sysPrompt = [
      "你是东汉末年「谶纬小摊」的司天监掌卦先生，精通五行谶纬、器物观象与东汉三大正统签体。",
      ctx.userPersona.name ? `【问卦人身份】${ctx.userPersona.name}（${ctx.userPersona.identity || "广陵王"}）${ctx.userPersona.background ? `：${ctx.userPersona.background}` : ""}` : "",
      ctx.worldBookText ? `【世界观设定】${ctx.worldBookText}` : "",
      ctx.charProfile ? `【同行点评名士】${ctx.charProfile.name}（MBTI:${ctx.charProfile.mbti}，星座:${ctx.charProfile.constellation}，语风:${ctx.charProfile.speakingStyle}，性格:${ctx.charProfile.personality}）` : "",
      ctx.recentChat.text ? `【该名士与问卦人近期传讯】\n${ctx.recentChat.text}` : "",
      "请严格结合问卦人亲手拼搭的「3D 乐高积木量化格局」与所问之事，一次性同时输出东汉三种正统体裁的卦文：",
      "1. poem（古诗签）：四句古风签诗（五言或七言绝句，用\\n换行），典雅含蓄；",
      "2. ballad（东汉童谣）：仿《后汉书·五行志》体例（如「千里草，何青青；十日卜，不得生」「直如弦，死道边；曲如钩，反封侯」），用三言/三三七言、顶真叠字、市井白描隐喻时局与人心（4~6短句，用\\n换行），自带东汉街头童谣的诡谲宿命感；",
      "3. chenyu（图谶秘语）：仿《河图》《洛书》《春秋纬》东汉图谶体，使用拆字隐语、干支星象与四字断语（3~4句，用\\n换行），古奥神秘，并配一句 chenyuGloss（30~55字）点破拆字或象数玄机。",
      "只返回严格 JSON，不要额外解释：",
      "{\"hexagram\":\"卦名 · 吉凶（如：风火家人 · 上吉）\",\"verses\":{\"poem\":\"四句古诗签（\\n换行）\",\"ballad\":\"东汉童谣（\\n换行）\",\"chenyu\":\"图谶秘语（\\n换行）\"},\"chenyuGloss\":\"30~55字拆字/象数注脚\",\"structureReading\":\"80~130字结合积木层高、对称度、五行色泽与灵物的象意解读\",\"advice\":\"50~90字切实温柔的行事建言\",\"charComment\":\"若指定了同行名士，以该名士第一人称口吻写40~80字点评，否则为空字符串\"}"
    ].filter(Boolean).join("\n");

    const userPrompt = `【所问之事】${qText}\n【积木实体格局】${analysis.summaryText}`;

    try {
      const raw = await callOracleLLM([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ], 920);
      const parsed = extractJsonObject(raw);
      if (parsed && parsed.hexagram) {
        const tri = normalizeTriVerses(parsed, offlineVerses);
        const result = {
          id: `cw_${Date.now()}`,
          question: qText,
          hexagram: String(parsed.hexagram).trim(),
          oracleVerse: tri.oracleVerse,
          verses: tri.verses,
          chenyuGloss: tri.chenyuGloss,
          structureReading: String(parsed.structureReading || "").trim(),
          advice: String(parsed.advice || "").trim(),
          charComment: String(parsed.charComment || "").trim(),
          commentatorName: ctx.charProfile ? ctx.charProfile.name : "",
          interpretations: {},
          analysis,
          bricks,
          usedAi: true
        };
        const saved = await saveOracleRecord(result);
        return saved;
      }
    } catch (e) {}

    // 离线古风三体裁兜底
    const fallback = {
      id: `cw_${Date.now()}`,
      question: qText,
      hexagram: `${analysis.dominantElement}曜${analysis.archetype} · 中上吉`,
      oracleVerse: offlineVerses.poem,
      verses: {
        poem: offlineVerses.poem,
        ballad: offlineVerses.ballad,
        chenyu: offlineVerses.chenyu
      },
      chenyuGloss: offlineVerses.chenyuGloss,
      structureReading: `${analysis.summaryText} 观此积木之象，${analysis.stabilityHint}，主气归于「${analysis.dominantElement}」，所问之事虽有微澜，然根基已成，顺势而为必见回响。`,
      advice: "宜先固眼前根基，忌急躁冒进；三日内若有旧人讯息或新机上门，可从容应之。",
      charComment: ctx.charProfile ? `（${ctx.charProfile.name}端详片刻）这般搭法倒有几分你的性子，放心去做便是。` : "",
      commentatorName: ctx.charProfile ? ctx.charProfile.name : "",
      interpretations: {},
      analysis,
      bricks,
      usedAi: false
    };
    const savedFallback = await saveOracleRecord(fallback);
    return savedFallback;
  }

  // ==========================================
  // 6. 名士专属 3D 乐高积木与谶纬手札生成
  // ==========================================
  async function requestCharacterProphecy(charObj) {
    const Bricks = global.ChenweiLegoBricks;
    const ctx = await collectCharacter5DContext(charObj);
    const cp = ctx.charProfile;
    if (!cp) throw new Error("NO_CHARACTER");

    const partIds = Bricks ? Bricks.BRICK_CATALOG.map((b) => b.id).join(", ") : "brick_2x2, pillar_1x1, orb_1x1";
    const colorIds = Bricks ? Bricks.COLOR_PALETTE.map((c) => c.id).join(", ") : "cinnabar, gold, ink";

    const sysPrompt = [
      `你正在深度扮演「${cp.name}」（ID: ${cp.id}），在东汉「谶纬小摊」亲自用 3D 乐高积木搭出一座象征自己近期心事与气运的微缩建筑，并写下自己的谶纬手札。`,
      "【角色 6 项完整档案（最高遵从）】",
      `- 姓名/ID：${cp.name} (${cp.id})`,
      `- MBTI：${cp.mbti}`,
      `- 星座：${cp.constellation}`,
      `- 语言风格：${cp.speakingStyle}`,
      `- 性格特点：${cp.personality}`,
      `- 个人背景：${cp.background}`,
      `【与你羁绊的玩家身份】${ctx.userPersona.name}（${ctx.userPersona.identity || "广陵王"}）${ctx.userPersona.personality ? `，性格：${ctx.userPersona.personality}` : ""}${ctx.userPersona.background ? `；背景：${ctx.userPersona.background}` : ""}`,
      ctx.worldBookText ? `【世界书设定】\n${ctx.worldBookText}` : "",
      ctx.recentChat.text ? `【你与 ${ctx.userPersona.name} 最近的 ${ctx.recentChat.count} 条传讯记录（务必自然呼应近期话题与情绪）】\n${ctx.recentChat.text}` : "",
      "【3D 积木蓝图规范】",
      `- 可选建筑骨架 baseArchetype（必选其一）：tower | pavilion | altar | gate | bridge | garden`,
      `- 可选配色 primaryColor / accentColor（必选其一）：${colorIds}`,
      `- customBricks 为额外点缀的 4~8 块积木，每块格式 {"type":"零件ID","gx":-4到3整数,"gz":-4到3整数,"rot":0或90,"color":"颜色ID"}，可用零件ID：${partIds}`,
      "只返回严格 JSON，不要额外解释：",
      "{\"question\":\"名士心中暗问之事（15~36字）\",\"buildTitle\":\"作品雅名（4~8字）\",\"baseArchetype\":\"pavilion\",\"primaryColor\":\"cinnabar\",\"accentColor\":\"gold\",\"customBricks\":[{\"type\":\"orb_1x1\",\"gx\":0,\"gz\":0,\"rot\":0,\"color\":\"gold\"}],\"hexagram\":\"卦名 · 吉凶\",\"verses\":{\"poem\":\"四句古诗签（\\n换行）\",\"ballad\":\"仿东汉童谣（三言/三三七言隐喻，\\n换行）\",\"chenyu\":\"东汉图谶秘语（拆字/象数断语，\\n换行）\"},\"chenyuGloss\":\"25~45字拆字或象数注脚\",\"charNote\":\"120~200字名士第一人称手札，贴合口癖解释自己为何搭这座积木，并自然流露对玩家的挂念\"}"
    ].filter(Boolean).join("\n");

    const userPrompt = `请以「${cp.name}」的视角完成本次谶纬积木搭建与手札，务必体现近期传讯中的互动心境。`;

    try {
      const raw = await callOracleLLM([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ], 980);
      const parsed = extractJsonObject(raw);
      if (parsed && (parsed.buildTitle || parsed.charNote)) {
        const bricks = Bricks ? Bricks.sanitizeAndGroundBlueprint(parsed) : [];
        const analysis = Bricks ? Bricks.analyzeStructure(bricks) : null;
        const offlineTri = buildOfflineTriVerses(analysis || {}, parsed.question || "");
        const tri = normalizeTriVerses(parsed, offlineTri);
        const result = {
          charId: cp.id,
          charName: cp.name,
          question: String(parsed.question || "问前路风云与眼前人安康").trim(),
          buildTitle: String(parsed.buildTitle || `${cp.name}的灵台`).trim(),
          hexagram: String(parsed.hexagram || "紫微照命 · 中上吉").trim(),
          oracleVerse: tri.oracleVerse,
          verses: tri.verses,
          chenyuGloss: tri.chenyuGloss,
          charNote: String(parsed.charNote || "").trim(),
          bricks,
          analysis,
          chatContextCount: ctx.recentChat.count,
          usedAi: true
        };
        await saveCharProphecy(cp.id, result);
        return result;
      }
    } catch (e) {}

    // 基于角色 MBTI 的确定性本地兜底蓝图
    const mbti = String(cp.mbti || "").toUpperCase();
    const fallbackArch = mbti.includes("N") ? "tower" : mbti.includes("F") ? "garden" : mbti.includes("J") ? "gate" : "pavilion";
    const fallbackPrimary = mbti.includes("I") ? "azure" : mbti.includes("T") ? "ink" : "cinnabar";
    const fallbackBricks = Bricks ? Bricks.sanitizeAndGroundBlueprint({ baseArchetype: fallbackArch, primaryColor: fallbackPrimary, accentColor: "gold" }) : [];
    const fallbackAnalysis = Bricks ? Bricks.analyzeStructure(fallbackBricks) : null;
    const fallbackTri = buildOfflineTriVerses(fallbackAnalysis || {}, `暗问近日局势与${ctx.userPersona.name}安否`);
    const fallback = {
      charId: cp.id,
      charName: cp.name,
      question: `暗问近日局势与${ctx.userPersona.name}安否`,
      buildTitle: `${cp.name} · 观星灵台`,
      hexagram: "天风姤 · 中吉",
      oracleVerse: fallbackTri.poem,
      verses: {
        poem: fallbackTri.poem,
        ballad: fallbackTri.ballad,
        chenyu: fallbackTri.chenyu
      },
      chenyuGloss: fallbackTri.chenyuGloss,
      charNote: `闲来无事，便在谶纬小摊随手垒了这座小台。近来与${ctx.userPersona.name}几番往来，心中所系终究逃不过安稳二字。这几块砖石看着虽小，倒也算替眼下局势定个心气。`,
      bricks: fallbackBricks,
      analysis: fallbackAnalysis,
      chatContextCount: ctx.recentChat.count,
      usedAi: false
    };
    await saveCharProphecy(cp.id, fallback);
    return fallback;
  }

  const api = {
    DB_NAME,
    AI_TIMEOUT_MS,
    MIN_CHAT_HISTORY_COUNT,
    ORACLE_FORMS,
    saveOracleRecord,
    loadOracleRecords,
    getOracleRecordById,
    updateOracleRecord,
    saveCharProphecy,
    loadAllCharProphecies,
    resolveCharAvatarUrl,
    loadAllCharacters,
    collectCharacter5DContext,
    callOracleLLM,
    extractJsonObject,
    buildOfflineTriVerses,
    requestPlayerDivination,
    requestCharacterProphecy
  };

  global.ChenweiAiOracle = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

