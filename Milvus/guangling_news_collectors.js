/**
 * Milvus/guangling_news_collectors.js (v1.0)
 * 广陵联播 4.0 独立世界态采集插件模块（100% 只读，零 localStorage 写入，零 Emoji）
 * 新增 5 大联动栏目：
 * 1. moments       — 传讯 · 角色朋友圈（t8_moments + chatCharacterStore["moments_data"]）
 * 2. xiuyiSurvey   — 绣衣楼 · 绣衣问卷保存内容（5大官方问卷历史 + 自拟问卷答卷）
 * 3. coupleWish    — 情侣空间 · 角色的愿望（t9_wishlist_<charId>，优先 creator === "ta"）
 * 4. coupleDailyQ  — 情侣空间 · 每日一问（独立库 milvus_couple_daily_q_idb -> answers）
 * 5. canghaiMoment — 情侣空间 · 沧海一刻（momentCalendarStore / moment_moods_fallback）
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_GUANGLING_NEWS_COLLECTORS_LOADED__) return;
  global.__MILVUS_GUANGLING_NEWS_COLLECTORS_LOADED__ = true;

  const EXTRA_SOURCE_META = [
    { id: "moments", group: "private", label: "传讯 · 角色朋友圈", desc: "随机播报一条角色朋友圈动态与神评" },
    { id: "xiuyiSurvey", group: "public", label: "绣衣楼 · 绣衣问卷", desc: "随机播报已保存的官方或自拟问卷答卷" },
    { id: "coupleWish", group: "private", label: "情侣空间 · 角色愿望", desc: "随机播报角色悄悄写下的愿望清单" },
    { id: "coupleDailyQ", group: "private", label: "情侣空间 · 每日一问", desc: "随机重温一道已作答的每日默契问答" },
    { id: "canghaiMoment", group: "private", label: "情侣空间 · 沧海一刻", desc: "播报角色近期心情贴纸与手札片段" }
  ];

  const OFFICIAL_SURVEY_KEYS = [
    { key: "xiuyi_satisfaction_survey_history", label: "员工满意度调查" },
    { key: "xiuyi_activity_survey_history", label: "团建活动投票" },
    { key: "xiuyi_location_survey_history", label: "团建地点投票" },
    { key: "xiuyi_gala_survey_history", label: "年会节目投票" },
    { key: "xiuyi_spring_survey_history", label: "新春方案征集" }
  ];

  const MOOD_LABEL_MAP = {
    excited: "兴奋",
    sweet: "甜蜜",
    happy: "美滋滋",
    calm: "平静",
    sleepy: "好困",
    troubled: "苦恼",
    sad: "难过",
    angry: "气愤"
  };

  const lastPickedExtra = {
    moments: "",
    xiuyiSurvey: "",
    coupleWish: "",
    coupleDailyQ: "",
    canghaiMoment: ""
  };

  function cleanText(raw) {
    if (raw === null || raw === undefined) return "";
    if (typeof raw === "object") {
      if (Array.isArray(raw)) {
        return raw.map((x) => cleanText(x)).filter(Boolean).join("、");
      }
      const picked =
        raw.text ?? raw.content ?? raw.value ?? raw.answer ?? raw.label ?? raw.name ?? raw.note ?? raw.title ?? "";
      return cleanText(picked);
    }
    const str = String(raw)
      .replace(/<[^>]+>/g, " ")
      .replace(/\[object Object\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return str;
  }

  function formatSurveyAnswerValue(ans) {
    if (ans === null || ans === undefined) return "";
    if (typeof ans === "number") return `${ans}分`;
    if (typeof ans === "string") return cleanText(ans);
    if (Array.isArray(ans)) {
      return ans.map((x) => formatSurveyAnswerValue(x)).filter(Boolean).join("、");
    }
    if (typeof ans === "object") {
      const mainVal =
        ans.value !== undefined
          ? formatSurveyAnswerValue(ans.value)
          : cleanText(ans.text || ans.answer || ans.label || ans.selected || "");
      const noteVal = cleanText(ans.note || ans.reason || ans.comment || "");
      if (mainVal && noteVal && noteVal !== mainVal) return `${mainVal}（${noteVal}）`;
      return mainVal || noteVal;
    }
    return "";
  }

  function pickRandom(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function pickRandomAvoiding(pool, bucketKey, idGetter) {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    if (pool.length === 1) {
      lastPickedExtra[bucketKey] = idGetter(pool[0]);
      return pool[0];
    }
    const prev = lastPickedExtra[bucketKey];
    const filtered = prev ? pool.filter((item) => idGetter(item) !== prev) : pool;
    const chosen = pickRandom(filtered.length > 0 ? filtered : pool);
    if (chosen) lastPickedExtra[bucketKey] = idGetter(chosen);
    return chosen;
  }

  // 安全只读主库 user_settings
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

  /**
   * 零侵入安全只读外部 IndexedDB（绝不新建空库或触发 VersionError）
   */
  async function safeReadForeignIDB(dbName, storeName) {
    if (typeof indexedDB === "undefined" || !indexedDB) return [];
    try {
      if (typeof indexedDB.databases === "function") {
        const dbs = await indexedDB.databases();
        const exists = Array.isArray(dbs) && dbs.some((d) => d && d.name === dbName);
        if (!exists) return [];
      }
    } catch (_) {}

    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(dbName);
        let abortedNew = false;
        req.onupgradeneeded = () => {
          // 若库原本不存在则直接中止，防止意外新建空库
          abortedNew = true;
          try {
            req.transaction.abort();
          } catch (_) {}
        };
        req.onsuccess = () => {
          const db = req.result;
          if (abortedNew || !db || !db.objectStoreNames || !db.objectStoreNames.contains(storeName)) {
            try {
              db && db.close();
            } catch (_) {}
            resolve([]);
            return;
          }
          try {
            const tx = db.transaction(storeName, "readonly");
            const getAllReq = tx.objectStore(storeName).getAll();
            getAllReq.onsuccess = () => {
              try {
                db.close();
              } catch (_) {}
              resolve(Array.isArray(getAllReq.result) ? getAllReq.result : []);
            };
            getAllReq.onerror = () => {
              try {
                db.close();
              } catch (_) {}
              resolve([]);
            };
          } catch (_) {
            try {
              db.close();
            } catch (_) {}
            resolve([]);
          }
        };
        req.onerror = () => resolve([]);
      } catch (_) {
        resolve([]);
      }
    });
  }

  // 构建 charId -> 角色名映射表（过滤群聊/装饰/朋友圈虚拟记录）
  async function buildCharNameMap(mockChars) {
    const map = new Map();
    let chars = Array.isArray(mockChars) ? mockChars : [];
    if (chars.length === 0 && global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
      try {
        const all = await global.chatCharacterStore.getAll();
        if (Array.isArray(all)) chars = all;
      } catch (_) {}
    }
    chars.forEach((c) => {
      if (!c || !c.name) return;
      const idStr = String(c.id || "");
      if (
        c.isGroup ||
        c.type === "group" ||
        c.type === "decor" ||
        c.type === "moments" ||
        idStr === "moments_data" ||
        idStr.startsWith("group") ||
        idStr.startsWith("style_")
      ) {
        return;
      }
      map.set(idStr, c.name);
      map.set(c.id, c.name);
    });
    return { map, chars };
  }

  // ===================== 1. 传讯 · 角色朋友圈 =====================
  async function collectMomentsItem(opts) {
    const options = opts || {};
    const ls = options.mockStorage || (typeof global.localStorage !== "undefined" ? global.localStorage : null);
    let rawList = Array.isArray(options.mockMoments) ? options.mockMoments.slice() : [];

    if (rawList.length === 0 && ls) {
      try {
        const s = ls.getItem("t8_moments");
        if (s) {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) rawList = parsed;
        }
      } catch (_) {}
    }

    if (rawList.length === 0 && global.chatCharacterStore && typeof global.chatCharacterStore.get === "function") {
      try {
        const rec = await global.chatCharacterStore.get("moments_data");
        if (rec && Array.isArray(rec.data)) rawList = rec.data;
      } catch (_) {}
    }

    const pool = [];
    rawList.forEach((m) => {
      if (!m) return;
      const text = cleanText(m.text || m.content || "");
      if (text.length < 3) return;
      const author = cleanText((m.char && m.char.name) || m.author || m.userName || "");
      if (!author) return;
      const likesCount = Array.isArray(m.likes) ? m.likes.length : Number(m.likes) || 0;
      const commentsArr = Array.isArray(m.comments) ? m.comments : [];
      let topComment = null;
      if (commentsArr.length > 0) {
        const c = commentsArr[commentsArr.length - 1];
        const cText = cleanText(c && (c.text || c.content || ""));
        const cAuthor = cleanText(c && (c.author || c.user || c.name || "好友"));
        if (cText) topComment = { author: cAuthor, text: cText.slice(0, 36) };
      }
      pool.push({
        id: String(m.id || `${author}::${text.slice(0, 20)}`),
        author,
        text,
        likesCount,
        topComment
      });
    });

    return pickRandomAvoiding(pool, "moments", (x) => x.id);
  }

  // ===================== 2. 绣衣楼 · 绣衣问卷 =====================
  async function collectXiuYiSurveyItem(opts) {
    const options = opts || {};
    const pool = [];

    const pushSurveyRecord = (rec, fallbackTitle) => {
      if (!rec) return;
      const title = cleanText(rec.surveyTitle || rec.title || fallbackTitle || "绣衣问卷");
      const respondent = cleanText(rec.answeredBy || rec.respondentName || rec.characterName || "楼内密探");
      const remark = cleanText(rec.characterRemark || rec.closingRemark || rec.remark || rec.summary || "");

      let qaSnippet = "";
      const questions = Array.isArray(rec.surveyQuestions)
        ? rec.surveyQuestions
        : Array.isArray(rec.questions)
        ? rec.questions
        : [];
      const answers = rec.answers && typeof rec.answers === "object" ? rec.answers : {};

      // 优先挑开放文本题或第一个有内容的回答（完整拆解对象型答案 { value, note }）
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q) continue;
        const ansStr = formatSurveyAnswerValue(answers[q.id]);
        if (ansStr && (q.type === "text" || !qaSnippet)) {
          const qTitle = cleanText(q.title || q.question || q.text || "").slice(0, 28);
          qaSnippet = qTitle ? `关于「${qTitle}」，作答道：「${ansStr.slice(0, 44)}」` : `作答道：「${ansStr.slice(0, 48)}」`;
          if (q.type === "text") break;
        }
      }

      if (!qaSnippet) {
        const vals = Object.values(answers)
          .map((v) => formatSurveyAnswerValue(v))
          .filter(Boolean);
        if (vals.length > 0) qaSnippet = `填报意见：「${vals[0].slice(0, 46)}」`;
      }

      if (remark || qaSnippet) {
        pool.push({
          id: String(rec.id || `${title}::${respondent}::${(remark || qaSnippet).slice(0, 18)}`),
          title,
          respondent,
          remark,
          qaSnippet
        });
      }
    };

    if (Array.isArray(options.mockSurveys)) {
      options.mockSurveys.forEach((r) => pushSurveyRecord(r, r.surveyTitle || "绣衣问卷"));
    } else {
      // 2A. 5 大官方问卷历史
      for (let i = 0; i < OFFICIAL_SURVEY_KEYS.length; i++) {
        const entry = OFFICIAL_SURVEY_KEYS[i];
        const hist = await readMainUserSetting(entry.key);
        if (Array.isArray(hist)) {
          hist.forEach((rec) => pushSurveyRecord(rec, entry.label));
        }
      }
      // 2B. 自拟问卷作答记录
      const customRecords = await readMainUserSetting("xiuyi_custom_survey_records_v1");
      if (Array.isArray(customRecords)) {
        customRecords.forEach((rec) => pushSurveyRecord(rec, rec.surveyTitle || "自拟绣衣问卷"));
      }
    }

    return pickRandomAvoiding(pool, "xiuyiSurvey", (x) => x.id);
  }

  // ===================== 3. 情侣空间 · 角色的愿望 =====================
  async function collectCoupleWishItem(opts) {
    const options = opts || {};
    const ls = options.mockStorage || (typeof global.localStorage !== "undefined" ? global.localStorage : null);
    if (!ls && !Array.isArray(options.mockWishes)) return null;

    const { map: charNameMap } = await buildCharNameMap(options.mockChars);
    const taPool = [];
    const allPool = [];

    const ingestWish = (w, charId) => {
      if (!w) return;
      const title = cleanText(w.title || w.text || w.content || "");
      if (title.length < 2) return;
      const charName = charNameMap.get(String(charId)) || charNameMap.get(Number(charId)) || cleanText(w.charName || "");
      const item = {
        id: `${charId}::${w.id || title}`,
        charName: charName || "心上人",
        title,
        category: cleanText(w.category || ""),
        creator: w.creator || "user",
        done: !!w.done
      };
      allPool.push(item);
      if (item.creator === "ta") taPool.push(item);
    };

    if (Array.isArray(options.mockWishes)) {
      options.mockWishes.forEach((w) => ingestWish(w, w.charId || "default"));
    } else if (ls) {
      try {
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (!k || !k.startsWith("t9_wishlist_")) continue;
          const charId = k.slice("t9_wishlist_".length);
          const arr = JSON.parse(ls.getItem(k) || "[]");
          if (Array.isArray(arr)) {
            arr.forEach((w) => ingestWish(w, charId));
          }
        }
      } catch (_) {}
    }

    // 优先抽取角色自己许下的愿望（creator === "ta"），没有则从全量愿望抽
    const targetPool = taPool.length > 0 ? taPool : allPool;
    return pickRandomAvoiding(targetPool, "coupleWish", (x) => x.id);
  }

  // ===================== 4. 情侣空间 · 每日一问 =====================
  async function collectCoupleDailyQItem(opts) {
    const options = opts || {};
    const { map: charNameMap } = await buildCharNameMap(options.mockChars);
    const records = Array.isArray(options.mockDailyQ)
      ? options.mockDailyQ
      : await safeReadForeignIDB("milvus_couple_daily_q_idb", "answers");

    const pool = [];
    records.forEach((rec) => {
      if (!rec || !rec.years || typeof rec.years !== "object") return;
      const charName =
        charNameMap.get(String(rec.charId)) ||
        charNameMap.get(Number(rec.charId)) ||
        cleanText(rec.charName || "") ||
        "名士";

      Object.keys(rec.years).forEach((yr) => {
        const entry = rec.years[yr];
        if (!entry || typeof entry !== "object") return;
        const question = cleanText(entry.question || entry.q || rec.question || "");
        const charAnswer = cleanText(entry.charAnswer || entry.taAnswer || entry.aiAnswer || entry.reply || "");
        const userAnswer = cleanText(entry.userAnswer || entry.myAnswer || "");
        if (!charAnswer && !userAnswer) return;
        pool.push({
          id: `${rec.id || charName}::${yr}`,
          charName,
          dateLabel: `${yr}-${rec.mmdd || ""}`,
          question: question || "今日默契一问",
          userAnswer: userAnswer.slice(0, 48),
          charAnswer: charAnswer.slice(0, 68)
        });
      });
    });

    return pickRandomAvoiding(pool, "coupleDailyQ", (x) => x.id);
  }

  // ===================== 5. 情侣空间 · 沧海一刻（全角色心情日记 charEntry/userEntry + 习惯打卡记录） =====================
  async function collectCanghaiMomentItem(opts) {
    const options = opts || {};
    const { map: charNameMap } = await buildCharNameMap(options.mockChars);
    let moods = Array.isArray(options.mockCanghai) ? options.mockCanghai.slice() : [];
    let habitDefs = Array.isArray(options.mockHabitDefs) ? options.mockHabitDefs.slice() : [];
    let habitLogs = Array.isArray(options.mockHabitLogs) ? options.mockHabitLogs.slice() : [];

    if (moods.length === 0) {
      if (global.momentCalendarStore && typeof global.momentCalendarStore.getMoodsByChar === "function") {
        try {
          // 传 null 一次性读取全角色心情日记
          const allMoods = await global.momentCalendarStore.getMoodsByChar(null);
          if (Array.isArray(allMoods)) moods = allMoods;
        } catch (_) {}
      }
      if (moods.length === 0) {
        const fb = await readMainUserSetting("moment_moods_fallback");
        if (Array.isArray(fb)) moods = fb;
      }
    }

    if (habitDefs.length === 0) {
      if (global.momentCalendarStore && typeof global.momentCalendarStore.getHabitDefsByScope === "function") {
        try {
          const allDefs = await global.momentCalendarStore.getHabitDefsByScope(null);
          if (Array.isArray(allDefs)) habitDefs = allDefs;
        } catch (_) {}
      }
      if (habitDefs.length === 0) {
        const fbDefs = await readMainUserSetting("moment_habits_fallback");
        if (Array.isArray(fbDefs)) habitDefs = fbDefs;
      }
    }

    if (habitLogs.length === 0) {
      if (global.momentCalendarStore && typeof global.momentCalendarStore.getHabitLogsByHabit === "function") {
        try {
          const allLogs = await global.momentCalendarStore.getHabitLogsByHabit(null);
          if (Array.isArray(allLogs)) habitLogs = allLogs;
        } catch (_) {}
      }
      if (habitLogs.length === 0) {
        const fbLogs = await readMainUserSetting("moment_habit_logs_fallback");
        if (Array.isArray(fbLogs)) habitLogs = fbLogs;
      }
    }

    const pool = [];

    // 5A. 心情日记（正确拆解 charEntry / userEntry 嵌套结构 + 兼容旧平铺字段）
    moods.forEach((m) => {
      if (!m) return;
      const charName =
        m._charName ||
        charNameMap.get(String(m.charId)) ||
        charNameMap.get(Number(m.charId)) ||
        cleanText(m.charName || "") ||
        "名士";
      const dateStr = cleanText(m.date || m.dateStr || "");

      const cEntry = m.charEntry && typeof m.charEntry === "object" ? m.charEntry : null;
      const uEntry = m.userEntry && typeof m.userEntry === "object" ? m.userEntry : null;

      const charDiary = cleanText(
        (cEntry && (cEntry.text || cEntry.diary || cEntry.content)) ||
          m.charDiary ||
          m.taDiary ||
          m.aiDiary ||
          m.diary ||
          ""
      );
      const charMoodRaw = (cEntry && (cEntry.moodId || cEntry.mood)) || m.charMood || m.taMood || m.mood || "";
      const charMoodLabel = MOOD_LABEL_MAP[String(charMoodRaw).toLowerCase()] || cleanText(charMoodRaw);

      if (charDiary || charMoodLabel) {
        pool.push({
          id: `${m.id || charName}::${dateStr}::char`,
          kind: "mood",
          who: charName,
          dateStr,
          moodLabel: charMoodLabel || "平静",
          diary: charDiary
        });
      }

      const userDiary = cleanText((uEntry && (uEntry.text || uEntry.diary || uEntry.content)) || m.userDiary || "");
      const userMoodRaw = (uEntry && (uEntry.moodId || uEntry.mood)) || m.userMood || "";
      const userMoodLabel = MOOD_LABEL_MAP[String(userMoodRaw).toLowerCase()] || cleanText(userMoodRaw);

      if (userDiary) {
        pool.push({
          id: `${m.id || charName}::${dateStr}::user`,
          kind: "mood",
          who: `你（与${charName}的沧海一刻）`,
          dateStr,
          moodLabel: userMoodLabel || "平静",
          diary: userDiary
        });
      }
    });

    // 5B. 习惯打卡记录（将 habitDefs 与 habitLogs 关联，过滤私密经期条目）
    const defMap = new Map();
    habitDefs.forEach((d) => {
      if (d && d.id) defMap.set(String(d.id), d);
    });

    habitLogs.forEach((log) => {
      if (!log || log.isPeriod) return;
      const def = defMap.get(String(log.habitId || ""));
      const habitName = cleanText((def && (def.name || def.title)) || log.habitName || "");
      if (!habitName || /经期|生理期/.test(habitName)) return;

      const scope = String((def && def.ownerScope) || log.ownerScope || "");
      let ownerName = "你";
      if (scope.startsWith("char_")) {
        const cid = scope.slice(5);
        ownerName = charNameMap.get(cid) || charNameMap.get(Number(cid)) || "名士";
      } else if (log.charId) {
        const cn = charNameMap.get(String(log.charId)) || charNameMap.get(Number(log.charId));
        if (cn && scope !== "user") ownerName = cn;
      }

      const note = cleanText(log.note || log.memo || "");
      const care = cleanText(log.charReply || log.careReply || log.careText || log.aiReply || "");
      const dateStr = cleanText(log.date || log.dateStr || "");

      pool.push({
        id: `habit::${log.id || `${log.habitId}_${dateStr}`}`,
        kind: "habit",
        who: ownerName,
        dateStr,
        habitName,
        status: log.status || "done",
        note,
        care
      });
    });

    return pickRandomAvoiding(pool, "canghaiMoment", (x) => x.id);
  }

  // ===================== 汇总 5 大新栏目 =====================
  async function collectAllExtra(sources, opts) {
    const src = sources || {};
    const options = opts || {};
    const [moments, xiuyiSurvey, coupleWish, coupleDailyQ, canghaiMoment] = await Promise.all([
      src.moments ? collectMomentsItem(options) : Promise.resolve(null),
      src.xiuyiSurvey ? collectXiuYiSurveyItem(options) : Promise.resolve(null),
      src.coupleWish ? collectCoupleWishItem(options) : Promise.resolve(null),
      src.coupleDailyQ ? collectCoupleDailyQItem(options) : Promise.resolve(null),
      src.canghaiMoment ? collectCanghaiMomentItem(options) : Promise.resolve(null)
    ]);
    return { moments, xiuyiSurvey, coupleWish, coupleDailyQ, canghaiMoment };
  }

  // 将 5 大新栏目素材转为《朋友收集》风格的分屏台词段
  function composeExtraSectionEntries(digest, sources, splitFn) {
    const split =
      typeof splitFn === "function"
        ? splitFn
        : (t) => [cleanText(t).slice(0, 56)];
    const entries = [];
    const src = sources || {};
    const d = digest || {};

    // 1. 传讯 · 角色朋友圈
    if (src.moments && d.moments) {
      const m = d.moments;
      const lines = [];
      const likeSuffix = m.likesCount > 0 ? `，目前已收获 ${m.likesCount} 个点赞` : "";
      lines.push(`【朋友圈前线】据本台线报，${m.author}在朋友圈发布了最新动态${likeSuffix}：`);
      split(m.text, 54).slice(0, 2).forEach((c) => lines.push(c));
      if (m.topComment) {
        lines.push(`评论区里，${m.topComment.author}火速留言道：「${m.topComment.text}」`);
      }
      entries.push({ id: "moments", headline: `朋友圈动态：${m.author}`, lines });
    }

    // 2. 绣衣楼 · 绣衣问卷
    if (src.xiuyiSurvey && d.xiuyiSurvey) {
      const sv = d.xiuyiSurvey;
      const lines = [];
      lines.push(`【广陵民意调查】在《${sv.title}》存档答卷中，${sv.respondent}留下了颇具看点的反馈：`);
      if (sv.qaSnippet) {
        split(sv.qaSnippet, 54).slice(0, 2).forEach((c) => lines.push(c));
      }
      if (sv.remark) {
        split(`附加锐评：「${sv.remark}」`, 54).slice(0, 1).forEach((c) => lines.push(c));
      }
      entries.push({ id: "xiuyiSurvey", headline: `绣衣问卷：${sv.title}`, lines });
    }

    // 3. 情侣空间 · 角色的愿望
    if (src.coupleWish && d.coupleWish) {
      const w = d.coupleWish;
      const lines = [];
      if (w.done) {
        lines.push(`【广陵心愿电台】喜报！${w.charName}的心愿「${w.title}」已经圆满达成，本台特此发来贺电！`);
      } else {
        const whoText = w.creator === "ta" ? `${w.charName}悄悄在愿望清单里写下了一个心愿` : `你与${w.charName}的愿望清单里还挂着一条心愿`;
        lines.push(`【广陵心愿电台】据情侣空间匿名线报，${whoText}：「${w.title}」。`);
        lines.push(`本台友情提示：好心愿宜早不宜迟，记得抽空去兑现哦！`);
      }
      entries.push({ id: "coupleWish", headline: `心愿电台：${w.charName}的愿望`, lines });
    }

    // 4. 情侣空间 · 每日一问
    if (src.coupleDailyQ && d.coupleDailyQ) {
      const dq = d.coupleDailyQ;
      const lines = [];
      lines.push(`【每日默契问答】本台翻开与${dq.charName}的问答档案，抽中题目：「${dq.question}」`);
      if (dq.charAnswer) {
        split(`${dq.charName}的回答是：「${dq.charAnswer}」`, 54).slice(0, 2).forEach((c) => lines.push(c));
      }
      if (dq.userAnswer) {
        lines.push(`而你当时的回答则是：「${dq.userAnswer}」`);
      }
      entries.push({ id: "coupleDailyQ", headline: `每日一问：${dq.charName}默契档案`, lines });
    }

    // 5. 情侣空间 · 沧海一刻（心情日记 + 习惯打卡双形态播报）
    if (src.canghaiMoment && d.canghaiMoment) {
      const cm = d.canghaiMoment;
      const lines = [];
      const datePrefix = cm.dateStr ? `${cm.dateStr} ` : "近日";
      if (cm.kind === "habit") {
        lines.push(`【沧海一刻 · 习惯打卡】${datePrefix}${cm.who}完成了「${cm.habitName}」打卡，自律指数飙升！`);
        if (cm.note) {
          split(`打卡随记：「${cm.note}」`, 54).slice(0, 1).forEach((c) => lines.push(c));
        }
        if (cm.care) {
          split(`收获暖心关怀：「${cm.care}」`, 54).slice(0, 1).forEach((c) => lines.push(c));
        }
        entries.push({ id: "canghaiMoment", headline: `沧海习惯：${cm.who}打卡「${cm.habitName}」`, lines });
      } else {
        lines.push(`【沧海一刻 · 心情气象】${datePrefix}${cm.who}的心情指数为「${cm.moodLabel}」。`);
        if (cm.diary) {
          split(`手札摘录：${cm.diary}`, 54).slice(0, 2).forEach((c) => lines.push(c));
        }
        entries.push({ id: "canghaiMoment", headline: `沧海一刻：${cm.who}心情「${cm.moodLabel}」`, lines });
      }
    }

    return entries;
  }

  global.GuanglingNewsCollectors = {
    EXTRA_SOURCE_META,
    OFFICIAL_SURVEY_KEYS,
    MOOD_LABEL_MAP,
    safeReadForeignIDB,
    buildCharNameMap,
    collectMomentsItem,
    collectXiuYiSurveyItem,
    collectCoupleWishItem,
    collectCoupleDailyQItem,
    collectCanghaiMomentItem,
    collectAllExtra,
    composeExtraSectionEntries
  };
})(window);

