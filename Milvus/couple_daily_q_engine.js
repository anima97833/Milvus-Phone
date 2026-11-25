/**
 * Milvus/couple_daily_q_engine.js
 * 情侣空间 ·「每日一问」独立持久化 + 4 维必选/3 项自选上下文采集 + 角色作答引擎
 * - 独立 IndexedDB: milvus_couple_daily_q_idb（answers / prefs / trajectories 三表，零 localStorage 写入）
 * - 必选 4 维：角色 6 项完整配置 + 身份配置库 + 世界书开启条目 + 传讯近期 ≥30 条上下文
 * - 可选 3 项（用户自由勾选）：当天心情日记（momentCalendarStore）+ 当前日历事件（cached_calendar_tasks）+ 传讯行程轨迹（trajectories 缓存）
 * - 严格 1~3 句活人感短答，90s 超时兜底（AI_TIMEOUT_MS = 90000）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_couple_daily_q_idb";
  const DB_VERSION = 1;
  const STORE_ANSWERS = "answers";
  const STORE_PREFS = "prefs";
  const STORE_TRAJ = "trajectories";
  const AI_TIMEOUT_MS = 90000;
  const MIN_CHAT_HISTORY = 32;

  const DEFAULT_PREFS = {
    id: "global_prefs",
    includeMoodDiary: true,
    includeCalendar: true,
    includeTrajectory: true
  };

  let _dbPromise = null;
  const _memAnswers = new Map();
  let _memPrefs = { ...DEFAULT_PREFS };
  const _memTraj = new Map();

  function openDb() {
    if (typeof indexedDB === "undefined" || !indexedDB) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_ANSWERS)) {
            db.createObjectStore(STORE_ANSWERS, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_PREFS)) {
            db.createObjectStore(STORE_PREFS, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_TRAJ)) {
            db.createObjectStore(STORE_TRAJ, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return _dbPromise;
  }

  function formatDateYmd(dateObj = new Date()) {
    const dt = dateObj instanceof Date ? dateObj : new Date(dateObj);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseDateParts(dateStr) {
    const clean = String(dateStr || formatDateYmd());
    const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { year: m[1], mmdd: `${m[2]}-${m[3]}`, dateStr: clean };
    const now = formatDateYmd();
    return { year: now.slice(0, 4), mmdd: now.slice(5), dateStr: now };
  }

  function recordKey(charId, mmdd) {
    return `${String(charId || "default")}_${String(mmdd || "01-01")}`;
  }

  // ==========================================
  // 1. 跨年问答记录读写（按 charId + MM-DD 聚合不同年份）
  // ==========================================
  async function loadDayRecord(charId, mmdd) {
    const key = recordKey(charId, mmdd);
    const db = await openDb();
    if (!db) return _memAnswers.get(key) || { id: key, charId: String(charId), mmdd, years: {}, rating: 0 };
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ANSWERS, "readonly");
        const req = tx.objectStore(STORE_ANSWERS).get(key);
        req.onsuccess = () => {
          const rec = req.result || { id: key, charId: String(charId), mmdd, years: {}, rating: 0 };
          _memAnswers.set(key, rec);
          resolve(rec);
        };
        req.onerror = () => resolve({ id: key, charId: String(charId), mmdd, years: {}, rating: 0 });
      } catch (e) {
        resolve({ id: key, charId: String(charId), mmdd, years: {}, rating: 0 });
      }
    });
  }

  async function saveDayRecord(rec) {
    if (!rec || !rec.id) return rec;
    const item = { ...rec, updatedAt: Date.now() };
    _memAnswers.set(item.id, item);
    const db = await openDb();
    if (!db) return item;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ANSWERS, "readwrite");
        tx.objectStore(STORE_ANSWERS).put(item);
        tx.oncomplete = () => resolve(item);
        tx.onerror = () => resolve(item);
      } catch (e) { resolve(item); }
    });
  }

  async function saveUserAnswer({ charId, dateStr, text }) {
    const { year, mmdd } = parseDateParts(dateStr);
    const rec = await loadDayRecord(charId, mmdd);
    const curYear = (rec.years && rec.years[year]) || {};
    const next = {
      ...rec,
      years: {
        ...(rec.years || {}),
        [year]: {
          ...curYear,
          userAnswer: String(text || "").trim(),
          userUpdatedAt: Date.now()
        }
      }
    };
    return await saveDayRecord(next);
  }

  async function saveCharAnswer({ charId, dateStr, text, usedSources = [] }) {
    const { year, mmdd } = parseDateParts(dateStr);
    const rec = await loadDayRecord(charId, mmdd);
    const curYear = (rec.years && rec.years[year]) || {};
    const next = {
      ...rec,
      years: {
        ...(rec.years || {}),
        [year]: {
          ...curYear,
          charAnswer: String(text || "").trim(),
          usedSources: Array.isArray(usedSources) ? usedSources : [],
          charUpdatedAt: Date.now()
        }
      }
    };
    return await saveDayRecord(next);
  }

  async function saveRating({ charId, mmdd, rating }) {
    const rec = await loadDayRecord(charId, mmdd);
    return await saveDayRecord({ ...rec, rating: Math.max(0, Math.min(5, Number(rating) || 0)) });
  }

  async function loadAllRecordsForChar(charId) {
    const cid = String(charId || "");
    const db = await openDb();
    if (!db) {
      return Array.from(_memAnswers.values()).filter((r) => String(r.charId) === cid);
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ANSWERS, "readonly");
        const req = tx.objectStore(STORE_ANSWERS).getAll();
        req.onsuccess = () => {
          const list = (Array.isArray(req.result) ? req.result : []).filter((r) => r && String(r.charId) === cid);
          list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  // ==========================================
  // 2. 3 项自选开关偏好持久化 + 传讯行程轨迹轻量缓存
  // ==========================================
  async function loadPrefs() {
    const db = await openDb();
    if (!db) return { ..._memPrefs };
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PREFS, "readonly");
        const req = tx.objectStore(STORE_PREFS).get("global_prefs");
        req.onsuccess = () => {
          const val = req.result ? { ...DEFAULT_PREFS, ...req.result } : { ...DEFAULT_PREFS };
          _memPrefs = val;
          resolve(val);
        };
        req.onerror = () => resolve({ ...DEFAULT_PREFS });
      } catch (e) { resolve({ ...DEFAULT_PREFS }); }
    });
  }

  async function savePrefs(patch) {
    const next = { ...DEFAULT_PREFS, ..._memPrefs, ...(patch || {}), id: "global_prefs" };
    _memPrefs = next;
    const db = await openDb();
    if (!db) return next;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PREFS, "readwrite");
        tx.objectStore(STORE_PREFS).put(next);
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => resolve(next);
      } catch (e) { resolve(next); }
    });
  }

  async function cacheTrajectory(charId, events, dateStr = formatDateYmd()) {
    if (!charId || !Array.isArray(events) || !events.length) return null;
    const key = `${String(charId)}_${dateStr}`;
    const item = { id: key, charId: String(charId), dateStr, events, savedAt: Date.now() };
    _memTraj.set(key, item);
    _memTraj.set(`latest_${String(charId)}`, item);
    const db = await openDb();
    if (!db) return item;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_TRAJ, "readwrite");
        const st = tx.objectStore(STORE_TRAJ);
        st.put(item);
        st.put({ ...item, id: `latest_${String(charId)}` });
        tx.oncomplete = () => resolve(item);
        tx.onerror = () => resolve(item);
      } catch (e) { resolve(item); }
    });
  }

  async function loadCachedTrajectory(charId, dateStr = formatDateYmd()) {
    if (!charId) return null;
    const cid = String(charId);
    const exactKey = `${cid}_${dateStr}`;
    const latestKey = `latest_${cid}`;
    const db = await openDb();
    if (!db) return _memTraj.get(exactKey) || _memTraj.get(latestKey) || null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_TRAJ, "readonly");
        const st = tx.objectStore(STORE_TRAJ);
        const r1 = st.get(exactKey);
        r1.onsuccess = () => {
          if (r1.result) return resolve(r1.result);
          const r2 = st.get(latestKey);
          r2.onsuccess = () => resolve(r2.result || null);
          r2.onerror = () => resolve(null);
        };
        r1.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  // ==========================================
  // 3. 3 项可选上下文实时探测（当天心情日记 / 当前日历事件 / 传讯行程轨迹）
  // ==========================================
  async function probeOptionalContexts({ charObj, dateStr = formatDateYmd() } = {}) {
    const cid = charObj ? String(charObj.id) : "";
    let moodDiaryText = "";
    let calendarText = "";
    let trajectoryText = "";

    // A. 当天心情日记（来自 window.momentCalendarStore）
    try {
      const store = global.momentCalendarStore;
      if (store && cid) {
        let entry = null;
        if (typeof store.getMoodEntry === "function") {
          entry = await store.getMoodEntry(cid, dateStr);
        } else if (typeof store.getAllMoods === "function") {
          const all = await store.getAllMoods(cid);
          if (Array.isArray(all)) entry = all.find((x) => x && x.dateStr === dateStr);
          else if (all && typeof all === "object") entry = all[dateStr] || null;
        }
        if (entry) {
          const parts = [];
          const u = entry.user || entry.userEntry;
          const t = entry.ta || entry.charEntry || entry.char;
          if (u && (u.text || u.content || u.moodLabel)) {
            parts.push(`用户今日心情（${u.moodLabel || "心情"}）：${String(u.text || u.content || "").slice(0, 100)}`);
          }
          if (t && (t.text || t.content || t.moodLabel)) {
            parts.push(`你今日的心情日记（${t.moodLabel || "心情"}）：${String(t.text || t.content || "").slice(0, 120)}`);
          }
          if (!parts.length && (entry.content || entry.text)) {
            parts.push(`当日心情日记（${entry.moodLabel || "心情"}）：${String(entry.content || entry.text).slice(0, 120)}`);
          }
          moodDiaryText = parts.join("；");
        }
      }
    } catch (e) {}

    // B. 当前日历事件（来自 cached_calendar_tasks）
    try {
      if (typeof global.localStorage !== "undefined") {
        const raw = global.localStorage.getItem("cached_calendar_tasks");
        if (raw) {
          const parsed = JSON.parse(raw);
          const buckets = ["进行之事", "未竟之事", "已毕之事"];
          const hits = [];
          for (const bName of buckets) {
            const arr = Array.isArray(parsed[bName]) ? parsed[bName] : [];
            for (const it of arr) {
              if (!it || !it.title) continue;
              const ownerMatch = !it.characterId || String(it.characterId) === cid;
              if (!ownerMatch) continue;
              hits.push(`[${bName}]${it.title}${it.subtitle ? `(${it.subtitle})` : ""}`);
              if (hits.length >= 6) break;
            }
            if (hits.length >= 6) break;
          }
          if (hits.length) calendarText = hits.join("；");
        }
      }
    } catch (e) {}

    // C. 传讯行程轨迹（来自独立 IDB 缓存）
    try {
      const traj = await loadCachedTrajectory(cid, dateStr);
      if (traj && Array.isArray(traj.events) && traj.events.length) {
        trajectoryText = traj.events
          .slice(0, 6)
          .map((ev) => `${ev.time || ""} ${ev.title || ""}${ev.description ? `（${String(ev.description).slice(0, 36)}）` : ""}`.trim())
          .join("；");
      }
    } catch (e) {}

    return {
      hasMoodDiary: Boolean(moodDiaryText),
      hasCalendar: Boolean(calendarText),
      hasTrajectory: Boolean(trajectoryText),
      moodDiaryText,
      calendarText,
      trajectoryText
    };
  }

  // ==========================================
  // 4. 必选 4 维核心上下文采集（复用全站统一口径）
  // ==========================================
  async function collectBase4DContext(charObj) {
    let userPersona = { name: "广陵王", identity: "", personality: "", background: "" };
    try {
      if (typeof global.localStorage !== "undefined") {
        const list = JSON.parse(global.localStorage.getItem("user_personas") || "[]");
        const activeId = global.localStorage.getItem("active_persona_id");
        const hit = Array.isArray(list) ? (list.find((p) => String(p.id) === String(activeId)) || list[0]) : null;
        if (hit) {
          userPersona = {
            name: hit.name || "广陵王",
            identity: hit.identity || "",
            personality: hit.personality || "",
            background: String(hit.background || hit.bio || "").slice(0, 260)
          };
        }
      }
    } catch (e) {}

    let worldBookText = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldBookText = String(wb).trim().slice(0, 1100);
      }
    } catch (e) {}

    const cid = charObj ? String(charObj.id) : "";
    let fullChar = charObj || {};
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        const all = await global.chatCharacterStore.getAll();
        const hit = (all || []).find((c) => c && String(c.id) === cid);
        if (hit) fullChar = { ...hit, ...charObj, profile: { ...(hit.profile || {}), ...(charObj?.profile || {}) } };
      }
    } catch (e) {}

    const prof = fullChar.profile || {};
    let cs = {};
    try {
      if (typeof global.localStorage !== "undefined") {
        const csMap = JSON.parse(global.localStorage.getItem("character_settings") || "{}");
        cs = csMap[cid] || csMap[fullChar.name] || {};
      }
    } catch (e) {}

    const charProfile = {
      id: cid,
      name: String(fullChar.name || "名士"),
      mbti: prof.mbti || fullChar.mbti || cs.mbti || "未知",
      constellation: prof.constellation || prof.zodiac || fullChar.constellation || cs.constellation || "未知",
      speakingStyle: prof.speakingStyle || prof.style || fullChar.speakingStyle || cs.speakingStyle || "贴合人物原著口吻",
      personality: prof.personality || fullChar.personality || cs.personality || fullChar.desc || "性格鲜明",
      background: String(prof.background || prof.bio || fullChar.background || cs.background || fullChar.desc || "").slice(0, 420)
    };

    let recentChatText = "";
    let recentChatCount = 0;
    try {
      let msgs = [];
      if (global.chatHistoryStore) {
        if (typeof global.chatHistoryStore.getRecentMessages === "function") {
          msgs = await global.chatHistoryStore.getRecentMessages(cid, MIN_CHAT_HISTORY);
        } else if (typeof global.chatHistoryStore.getMessages === "function") {
          const all = await global.chatHistoryStore.getMessages(cid);
          msgs = Array.isArray(all) ? all.slice(-MIN_CHAT_HISTORY) : [];
        }
      }
      if (Array.isArray(msgs) && msgs.length) {
        recentChatCount = msgs.length;
        recentChatText = msgs.map((m) => {
          const who = m.isMe || m.sender === "me" || m.sender === "我" ? userPersona.name : (m.sender || charProfile.name);
          const txt = String(m.text || m.content || "").replace(/\[(?:图片|语音|表情|sticker)[^\]]*\]/gi, "[互动]").trim();
          return `${who}：${(txt || "(互动消息)").slice(0, 100)}`;
        }).join("\n");
      }
    } catch (e) {}

    return { userPersona, worldBookText, charProfile, recentChatText, recentChatCount };
  }

  // ==========================================
  // 5. 生成角色「此刻 · 1~3 句」每日一问回答（90s 超时 + 离线兜底）
  // ==========================================
  async function callDailyLlm(messages) {
    let timer = null;
    const invoke = async () => {
      if (typeof global.sendToLLM === "function") {
        return await new Promise((resolve, reject) => {
          try {
            global.sendToLLM(messages, { disableMCP: true }, (reply) => resolve(reply), (err) => reject(err));
          } catch (e) { reject(e); }
        });
      }
      throw new Error("NO_LLM");
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

  async function generateCharDailyAnswer({
    charObj,
    dateStr = formatDateYmd(),
    questionObj,
    userAnswer = "",
    pastYearsEntries = [],
    options = {}
  } = {}) {
    if (!charObj || !questionObj) throw new Error("INVALID_DAILY_Q_ARGS");
    const { year, mmdd } = parseDateParts(dateStr);
    const [base, optProbe] = await Promise.all([
      collectBase4DContext(charObj),
      probeOptionalContexts({ charObj, dateStr })
    ]);

    const cp = base.charProfile;
    const up = base.userPersona;
    const usedSources = [];
    const optBlocks = [];

    if (options.includeMoodDiary && optProbe.hasMoodDiary) {
      usedSources.push("心情日记");
      optBlocks.push(`【今日心情日记】${optProbe.moodDiaryText}`);
    }
    if (options.includeCalendar && optProbe.hasCalendar) {
      usedSources.push("日历事件");
      optBlocks.push(`【当前日历事项】${optProbe.calendarText}`);
    }
    if (options.includeTrajectory && optProbe.hasTrajectory) {
      usedSources.push("行程轨迹");
      optBlocks.push(`【你今日的传讯行程轨迹】${optProbe.trajectoryText}`);
    }

    const pastBlock = Array.isArray(pastYearsEntries) && pastYearsEntries.length
      ? "【往年同一天你曾写下的回答（可自然感慨心境变化，切勿照抄）】\n" +
        pastYearsEntries.map((p) => `- ${p.year}年：${p.charAnswer}`).join("\n")
      : "";

    const userAnsBlock = String(userAnswer || "").trim()
      ? `【${up.name} 今年刚刚写下的回答】「${String(userAnswer).trim()}」`
      : "";

    const sysPrompt = [
      `你正在深度扮演「${cp.name}」（角色ID：${cp.id}），正在情侣空间「每日一问」的 ${year}年${mmdd} 卡片上，写下你「此年、此刻」对今日问题的真实回答。`,
      "【角色 6 项完整档案（最高遵从）】",
      `- 姓名与 ID：${cp.name} (${cp.id})`,
      `- MBTI 性格类型：${cp.mbti}`,
      `- 星座：${cp.constellation}`,
      `- 语言风格：${cp.speakingStyle}`,
      `- 性格特点：${cp.personality}`,
      `- 个人背景：${cp.background}`,
      `【与你共同答题的用户身份】${up.name}（${up.identity || "广陵王"}）${up.personality ? `，性格：${up.personality}` : ""}${up.background ? `；背景：${up.background}` : ""}`,
      base.worldBookText ? `【当前开启的世界书设定】\n${base.worldBookText}` : "",
      base.recentChatText ? `【你们近期 ${base.recentChatCount} 条传讯上下文】\n${base.recentChatText}` : "",
      ...optBlocks,
      pastBlock,
      userAnsBlock,
      "【作答硬性要求】",
      "1. 只写 1~3 句话（30~95 字以内），像亲手写在小小纸卡上的真实随笔，简短隽永、有血有肉；",
      "2. 严禁使用「岁月静好」「无论何时我都陪着你」等泛滥 AI 鸡汤套话，严禁输出 JSON 或引号包裹或旁白动作前缀，直接输出第一人称回答正文即可。"
    ].filter(Boolean).join("\n");

    const userPrompt = `【${year}年${mmdd} · 每日一问】${questionObj.question}\n请以「${cp.name}」此刻最真实的心境回答（1~3句话）。`;

    let answerText = "";
    let usedAi = false;
    try {
      const raw = await callDailyLlm([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ]);
      const cleaned = String(raw || "").replace(/^["「『]+|["」』]+$/g, "").trim();
      if (cleaned) {
        answerText = cleaned;
        usedAi = true;
      }
    } catch (e) {}

    if (!answerText) {
      answerText = `${year}年这会儿问起这个，我倒真停下来想了片刻。眼下世事虽杂，能与${up.name}在纸卡上各留一两句真心话，便已算偷得半日清闲。`;
    }

    const updatedRec = await saveCharAnswer({
      charId: cp.id,
      dateStr,
      text: answerText,
      usedSources
    });

    return { answer: answerText, usedSources, usedAi, record: updatedRec };
  }

  const api = {
    DB_NAME,
    AI_TIMEOUT_MS,
    DEFAULT_PREFS,
    formatDateYmd,
    parseDateParts,
    loadDayRecord,
    saveDayRecord,
    saveUserAnswer,
    saveCharAnswer,
    saveRating,
    loadAllRecordsForChar,
    loadPrefs,
    savePrefs,
    cacheTrajectory,
    loadCachedTrajectory,
    probeOptionalContexts,
    generateCharDailyAnswer
  };

  global.CoupleDailyQEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

