/**
 * Milvus/trajectory_calendar_bridge.js (v2.0 - Stage 1 + Stage 2)
 * 传讯「轨迹」历史存档 × 日历「已毕/进行/未竟」三向互通独立模块化引擎
 * - 独立 IndexedDB: milvus_trajectory_archive_idb（trajectories / prefs 两表，零新增 localStorage 写入）
 * - 阶段一：历史轨迹永久存档、自动回显、干支古风日期、历史抽屉 0 消耗回顾
 * - 阶段二：
 *   1. 日历 → 轨迹：自动注入角色在日历中的「已毕/进行/未竟」日程 + 全局开启世界书
 *   2. 轨迹 → 日历：按真实当前时辰智能分流至「已毕/进行/未竟」（幂等去重、不污染其他日程、实时广播 calendar_tasks_updated）
 *   3. 轨迹 → 日历 AI：把近 3 天轨迹摘要注入日历月度日程生成 Prompt
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_TRAJECTORY_CALENDAR_BRIDGE_LOADED__) return;
  global.__MILVUS_TRAJECTORY_CALENDAR_BRIDGE_LOADED__ = true;

  const DB_NAME = "milvus_trajectory_archive_idb";
  const DB_VERSION = 1;
  const STORE_TRAJ = "trajectories";
  const STORE_PREFS = "prefs";
  const PREFS_KEY = "trajectory_bridge_prefs_v1";
  const MAX_RECORDS_PER_CHAR = 60;

  const DEFAULT_PREFS = {
    autoSyncToCalendar: true
  };

  let _dbPromise = null;
  let _memStore = new Map();
  let _prefsCache = { ...DEFAULT_PREFS };

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDateYmd(d) {
    const dt = d instanceof Date ? d : d ? new Date(d) : new Date();
    if (Number.isNaN(dt.getTime())) {
      const now = new Date();
      return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    }
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  function formatTimeHm(ts) {
    const dt = ts ? new Date(ts) : new Date();
    if (Number.isNaN(dt.getTime())) return "";
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }

  function formatAncientDate(dateStr) {
    const ymd = dateStr || formatDateYmd();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
    const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const day = dt.getDate();

    const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
    const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    const gz = stems[((year - 4) % 10 + 10) % 10] + branches[((year - 4) % 12 + 12) % 12];

    const cnMonths = ["", "正", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖", "拾", "冬", "腊"];
    const toCnDay = (n) => {
      const d = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
      if (n <= 10) return n === 10 ? "初十" : "初" + d[n];
      if (n < 20) return "十" + d[n - 10];
      if (n === 20) return "二十";
      if (n < 30) return "二十" + d[n - 20];
      if (n === 30) return "三十";
      return "三十一";
    };
    return `${gz}年 ${cnMonths[month] || month}月 ${toCnDay(day)}日`;
  }

  // ==========================================
  // 1. 十二时辰 → 24 小时映射 & 智能状态分流（纯函数）
  // ==========================================
  const SHICHEN_RULES = [
    { match: /辰时/, start: 7, end: 9, label: "07:00 ~ 09:00" },
    { match: /巳时/, start: 9, end: 11, label: "09:00 ~ 11:00" },
    { match: /午初/, start: 11, end: 12, label: "11:00 ~ 12:00" },
    { match: /午正|午时/, start: 12, end: 13, label: "12:00 ~ 13:00" },
    { match: /未初/, start: 13, end: 14, label: "13:00 ~ 14:00" },
    { match: /未正|未时/, start: 14, end: 15, label: "14:00 ~ 15:00" },
    { match: /申时/, start: 15, end: 17, label: "15:00 ~ 17:00" },
    { match: /酉初/, start: 17, end: 18, label: "17:00 ~ 18:00" },
    { match: /酉正|酉时/, start: 18, end: 19, label: "18:00 ~ 19:00" },
    { match: /戌时/, start: 19, end: 21, label: "19:00 ~ 21:00" },
    { match: /亥初/, start: 21, end: 22, label: "21:00 ~ 22:00" },
    { match: /亥正|亥时/, start: 22, end: 23, label: "22:00 ~ 23:00" },
    { match: /上午/, start: 9, end: 11, label: "09:00 ~ 11:00" },
    { match: /中午/, start: 12, end: 14, label: "12:00 ~ 14:00" },
    { match: /下午/, start: 15, end: 17, label: "15:00 ~ 17:00" },
    { match: /晚间|夜晚/, start: 20, end: 22, label: "20:00 ~ 22:00" }
  ];

  function parseShichenTimeRange(timeSlot) {
    const s = String(timeSlot || "");
    for (const rule of SHICHEN_RULES) {
      if (rule.match.test(s)) {
        return { start: rule.start, end: rule.end, label: rule.label };
      }
    }
    return { start: 10, end: 11, label: "10:00 ~ 11:00" };
  }

  function classifyTrajectoryEventCategory(timeSlot, dateStr, nowDate) {
    const now = nowDate instanceof Date ? nowDate : new Date();
    const todayStr = formatDateYmd(now);
    const targetDate = dateStr || todayStr;
    if (targetDate < todayStr) {
      return { category: "已毕之事", progress: 100 };
    }
    if (targetDate > todayStr) {
      return { category: "未竟之事", progress: 0 };
    }
    const nowHour = now.getHours() + now.getMinutes() / 60;
    const range = parseShichenTimeRange(timeSlot);
    if (range.end <= nowHour) {
      return { category: "已毕之事", progress: 100 };
    }
    if (range.start <= nowHour && nowHour < range.end) {
      return { category: "进行之事", progress: 50 };
    }
    return { category: "未竟之事", progress: 0 };
  }

  // ==========================================
  // 2. IndexedDB 持久化底座
  // ==========================================
  function openDB() {
    if (_dbPromise) return _dbPromise;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_TRAJ)) {
            const st = db.createObjectStore(STORE_TRAJ, { keyPath: "id" });
            st.createIndex("by_charId", "charId", { unique: false });
            st.createIndex("by_date", "dateStr", { unique: false });
          }
          if (!db.objectStoreNames.contains(STORE_PREFS)) {
            db.createObjectStore(STORE_PREFS, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return _dbPromise;
  }

  async function idbPut(storeName, record) {
    if (storeName === STORE_TRAJ && record && record.id) {
      _memStore.set(record.id, record);
    }
    const db = await openDB();
    if (!db) return record;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readwrite");
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => resolve(record);
      } catch (_) {
        resolve(record);
      }
    });
  }

  async function idbDelete(storeName, key) {
    if (storeName === STORE_TRAJ) _memStore.delete(key);
    const db = await openDB();
    if (!db) return true;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], "readwrite");
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function idbGetAllByChar(charId) {
    const cid = String(charId || "");
    if (!cid) return [];
    const db = await openDB();
    if (!db) {
      return Array.from(_memStore.values()).filter((r) => String(r.charId) === cid);
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_TRAJ], "readonly");
        const store = tx.objectStore(STORE_TRAJ);
        const idx = store.index("by_charId");
        const req = idx.getAll(cid);
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch (_) {
        resolve([]);
      }
    });
  }

  async function getPrefs() {
    const db = await openDB();
    if (!db) return { ..._prefsCache };
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_PREFS], "readonly");
        const req = tx.objectStore(STORE_PREFS).get(PREFS_KEY);
        req.onsuccess = () => {
          const val = req.result && req.result.value;
          if (val && typeof val === "object") {
            _prefsCache = { ...DEFAULT_PREFS, ...val };
          }
          resolve({ ..._prefsCache });
        };
        req.onerror = () => resolve({ ..._prefsCache });
      } catch (_) {
        resolve({ ..._prefsCache });
      }
    });
  }

  async function savePrefs(patch) {
    _prefsCache = { ..._prefsCache, ...(patch || {}) };
    await idbPut(STORE_PREFS, { key: PREFS_KEY, value: _prefsCache, updatedAt: Date.now() });
    return { ..._prefsCache };
  }

  function emitArchiveUpdated(charId) {
    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-trajectory-archive-updated", { detail: { charId: String(charId || "") } }));
      }
    } catch (_) {}
  }

  // ==========================================
  // 3. 日历任务读写桥接（双存同步 + calendar_tasks_updated 实时广播）
  // ==========================================
  function normalizeTasksBucket(raw) {
    const obj = raw && typeof raw === "object" ? raw : {};
    return {
      已毕之事: Array.isArray(obj["已毕之事"]) ? obj["已毕之事"] : [],
      进行之事: Array.isArray(obj["进行之事"]) ? obj["进行之事"] : [],
      未竟之事: Array.isArray(obj["未竟之事"]) ? obj["未竟之事"] : []
    };
  }

  async function loadCalendarTasks() {
    try {
      if (global.calendarStore && typeof global.calendarStore.getTasks === "function") {
        const res = await global.calendarStore.getTasks();
        if (res && typeof res === "object" && (res["已毕之事"] || res["进行之事"] || res["未竟之事"])) {
          return normalizeTasksBucket(res);
        }
      }
    } catch (_) {}
    try {
      const cached = global.localStorage && global.localStorage.getItem("cached_calendar_tasks");
      if (cached) return normalizeTasksBucket(JSON.parse(cached));
    } catch (_) {}
    return normalizeTasksBucket(null);
  }

  async function saveCalendarTasks(nextTasks) {
    const normalized = normalizeTasksBucket(nextTasks);
    try {
      if (global.calendarStore && typeof global.calendarStore.saveTasks === "function") {
        await global.calendarStore.saveTasks(normalized);
      }
    } catch (_) {}
    try {
      if (global.localStorage && typeof global.localStorage.setItem === "function") {
        global.localStorage.setItem("cached_calendar_tasks", JSON.stringify(normalized));
      }
    } catch (_) {}
    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(
          new CustomEvent("calendar_tasks_updated", {
            detail: { ...normalized, _source: "trajectory_bridge" }
          })
        );
      }
    } catch (_) {}
    return normalized;
  }

  // ==========================================
  // 4. 三向互通核心 API
  // ==========================================

  /**
   * 方向 A（日历 + 开启世界书 → 轨迹生成 Prompt 补充块）
   */
  async function buildTrajectoryContextAddon(charId, charName, dateStr) {
    const blocks = [];
    const targetDate = dateStr || formatDateYmd();
    const parts = targetDate.split("-");
    const targetYear = Number(parts[0]);
    const targetMonth = Number(parts[1]);

    // 1. 全局开启的世界书
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && typeof wb === "string" && wb.trim()) {
          blocks.push(`【全局开启的世界书设定】\n${wb.trim().slice(0, 900)}`);
        }
      }
    } catch (_) {}

    // 2. 该名士在日历中的既定日程（已毕 / 进行 / 未竟）
    try {
      const tasks = await loadCalendarTasks();
      const cidStr = String(charId || "");
      const matchChar = (t) => {
        if (!t) return false;
        if (cidStr && t.characterId !== null && t.characterId !== undefined && String(t.characterId) === cidStr) {
          if (t.year && Number(t.year) !== targetYear) return false;
          if (t.month && Number(t.month) !== targetMonth) return false;
          return true;
        }
        return false;
      };
      const fmtList = (arr) =>
        arr
          .filter(matchChar)
          .slice(0, 6)
          .map((t) => `${t.time ? `[${t.time}] ` : ""}${t.title}${t.description ? `（${String(t.description).slice(0, 40)}）` : ""}`)
          .join("；");

      const doneText = fmtList(tasks["已毕之事"]);
      const ongoingText = fmtList(tasks["进行之事"]);
      const todoText = fmtList(tasks["未竟之事"]);

      if (doneText || ongoingText || todoText) {
        const lines = [
          `【${charName || "该角色"}在日历中的既定日程（${targetYear}年${targetMonth}月，请优先将「进行之事 / 未竟之事」自然编入对应时辰的轨迹，保持时间线一致）】`
        ];
        if (ongoingText) lines.push(`- 进行之事：${ongoingText}`);
        if (todoText) lines.push(`- 未竟之事：${todoText}`);
        if (doneText) lines.push(`- 已毕之事：${doneText}`);
        blocks.push(lines.join("\n"));
      }
    } catch (_) {}

    return blocks.length > 0 ? "\n\n" + blocks.join("\n\n") : "";
  }

  /**
   * 方向 B（轨迹 → 日历「已毕/进行/未竟」幂等智能同步）
   */
  async function syncTrajectoryToCalendar({ charId, charName, events, dateStr, recordId, nowDate }) {
    const cidStr = String(charId || "").trim();
    const list = Array.isArray(events) ? events : [];
    if (!cidStr || list.length === 0) {
      return { synced: 0, counts: { 已毕之事: 0, 进行之事: 0, 未竟之事: 0 } };
    }

    const targetDate = dateStr || formatDateYmd(nowDate);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
    const year = m ? Number(m[1]) : new Date().getFullYear();
    const month = m ? Number(m[2]) : new Date().getMonth() + 1;
    const dayNum = m ? Number(m[3]) : new Date().getDate();
    const dayStr = String(dayNum);

    // 保留原始 charId 类型（如果是纯数字字符串且原本传的是数字则兼容保留）
    const storedCharId = typeof charId === "number" ? charId : cidStr;

    const currentTasks = await loadCalendarTasks();
    const isSameDayTrajTask = (t) =>
      t &&
      t.source === "trajectory" &&
      String(t.characterId) === cidStr &&
      String(t.trajectoryDate || "") === targetDate;

    const nextTasks = {
      已毕之事: currentTasks["已毕之事"].filter((t) => !isSameDayTrajTask(t)),
      进行之事: currentTasks["进行之事"].filter((t) => !isSameDayTrajTask(t)),
      未竟之事: currentTasks["未竟之事"].filter((t) => !isSameDayTrajTask(t))
    };

    const counts = { 已毕之事: 0, 进行之事: 0, 未竟之事: 0 };
    const baseTs = Date.now();

    list.forEach((ev, idx) => {
      if (!ev || !ev.title) return;
      const timeSlot = String(ev.time || "");
      const range = parseShichenTimeRange(timeSlot);
      const { category, progress } = classifyTrajectoryEventCategory(timeSlot, targetDate, nowDate);
      const taskItem = {
        id: baseTs + idx * 7 + (category === "已毕之事" ? 1 : category === "进行之事" ? 2 : 3),
        title: String(ev.title),
        subtitle: `传讯轨迹 · ${ev.category || "日常"}${timeSlot ? ` · ${timeSlot}` : ""}`,
        time: `${dayNum}日 ${range.label}`,
        description: String(ev.description || `${charName || "名士"}于${timeSlot || "今日"}的行程记录`),
        progress,
        year,
        month,
        day: dayStr,
        category,
        characterId: storedCharId,
        source: "trajectory",
        trajectoryDate: targetDate,
        trajectoryTimeSlot: timeSlot
      };
      nextTasks[category].push(taskItem);
      counts[category] += 1;
    });

    await saveCalendarTasks(nextTasks);

    // 若提供了 recordId，更新对应历史轨迹的同步状态
    if (recordId) {
      const existing = await idbGetAllByChar(cidStr);
      const found = existing.find((r) => r && r.id === recordId);
      if (found) {
        const updated = {
          ...found,
          syncedToCalendar: true,
          calendarSyncCount: list.length
        };
        await idbPut(STORE_TRAJ, updated);
        emitArchiveUpdated(cidStr);
      }
    }

    return {
      synced: counts["已毕之事"] + counts["进行之事"] + counts["未竟之事"],
      counts,
      tasks: nextTasks
    };
  }

  /**
   * 方向 C（近 N 天轨迹 → 日历 AI 月度日程生成上下文摘要）
   */
  async function getRecentTrajectoriesSummary(charId, maxRecords) {
    const limit = Math.max(1, Number(maxRecords) || 3);
    const list = await listTrajectories(charId);
    if (!list || list.length === 0) return "";
    const lines = list.slice(0, limit).map((rec) => {
      const evSummary = (rec.events || [])
        .slice(0, 6)
        .map((e) => `${e.time || ""}${e.title || ""}`)
        .filter(Boolean)
        .join("、");
      return `- ${rec.dateStr}：${evSummary}`;
    });
    return `\n\n【该角色近期的传讯轨迹记录（请自然衔接进本月日程）】\n${lines.join("\n")}`;
  }

  // ==========================================
  // 5. 历史轨迹 CRUD（含自动同步日历联动）
  // ==========================================
  async function saveTrajectory(payload) {
    const charId = String((payload && payload.charId) || "").trim();
    const rawCharId = payload && payload.charId;
    const charName = String((payload && payload.charName) || "角色").trim();
    const events = Array.isArray(payload && payload.events) ? payload.events : [];
    if (!charId || events.length === 0) return null;

    const now = Date.now();
    const dateStr = (payload && payload.dateStr) || formatDateYmd(now);
    const record = {
      id: (payload && payload.id) || `traj_${charId}_${dateStr}_${now}`,
      charId,
      charName,
      dateStr,
      displayDate: formatAncientDate(dateStr),
      createdAt: (payload && payload.createdAt) || now,
      events,
      syncedToCalendar: Boolean(payload && payload.syncedToCalendar),
      calendarSyncCount: Number((payload && payload.calendarSyncCount) || 0)
    };

    await idbPut(STORE_TRAJ, record);

    // 兼容双写 CoupleDailyQEngine
    try {
      if (global.CoupleDailyQEngine && typeof global.CoupleDailyQEngine.cacheTrajectory === "function") {
        global.CoupleDailyQEngine.cacheTrajectory(rawCharId || charId, events, dateStr);
      }
    } catch (_) {}

    // 自动同步至日历（若用户开启了 autoSyncToCalendar 且非历史迁移）
    if (!(payload && payload.skipAutoSync)) {
      try {
        const prefs = await getPrefs();
        if (prefs.autoSyncToCalendar !== false) {
          const syncRes = await syncTrajectoryToCalendar({
            charId: rawCharId || charId,
            charName,
            events,
            dateStr,
            recordId: record.id
          });
          if (syncRes && syncRes.synced > 0) {
            record.syncedToCalendar = true;
            record.calendarSyncCount = syncRes.synced;
            await idbPut(STORE_TRAJ, record);
          }
        }
      } catch (_) {}
    }

    // 裁剪超限旧记录
    try {
      const all = await idbGetAllByChar(charId);
      if (all.length > MAX_RECORDS_PER_CHAR) {
        const sorted = all.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        for (const old of sorted.slice(MAX_RECORDS_PER_CHAR)) {
          if (old && old.id) await idbDelete(STORE_TRAJ, old.id);
        }
      }
    } catch (_) {}

    emitArchiveUpdated(charId);
    return record;
  }

  async function listTrajectories(charId) {
    const cid = String(charId || "").trim();
    if (!cid) return [];
    let rows = await idbGetAllByChar(cid);

    if (rows.length === 0 && global.CoupleDailyQEngine && typeof global.CoupleDailyQEngine.loadCachedTrajectory === "function") {
      try {
        const today = formatDateYmd();
        const legacy = await global.CoupleDailyQEngine.loadCachedTrajectory(cid, today);
        if (legacy && Array.isArray(legacy.events) && legacy.events.length > 0) {
          const migrated = await saveTrajectory({
            id: `traj_${cid}_${legacy.dateStr || today}_migrated`,
            charId: cid,
            charName: "",
            dateStr: legacy.dateStr || today,
            createdAt: legacy.updatedAt || Date.now(),
            events: legacy.events,
            skipAutoSync: true
          });
          if (migrated) rows = [migrated];
        }
      } catch (_) {}
    }

    return rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  async function loadLatestTrajectory(charId) {
    const list = await listTrajectories(charId);
    if (list.length === 0) return null;
    const today = formatDateYmd();
    const todayRec = list.find((r) => r.dateStr === today);
    return todayRec || list[0];
  }

  async function deleteTrajectory(id, charId) {
    if (!id) return false;
    const ok = await idbDelete(STORE_TRAJ, id);
    emitArchiveUpdated(charId);
    return ok;
  }

  async function clearTrajectories(charId) {
    const list = await listTrajectories(charId);
    for (const r of list) {
      if (r && r.id) await idbDelete(STORE_TRAJ, r.id);
    }
    emitArchiveUpdated(charId);
    return true;
  }

  // ==========================================
  // 6. UI 组件：顶栏历史入口 + 同步日历按钮 + 历史轨迹抽屉（零 Emoji，细线 SVG）
  // ==========================================
  function SvgIcon({ kind }) {
    const React = global.React;
    const common = {
      width: 13,
      height: 13,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.9,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { flexShrink: 0, display: "block" }
    };
    if (kind === "calendar") {
      return React.createElement(
        "svg",
        common,
        React.createElement("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2.5" }),
        React.createElement("path", { d: "M16 2v4M8 2v4M3 10h18" }),
        React.createElement("path", { d: "M9 15l2 2 4-4" })
      );
    }
    return React.createElement(
      "svg",
      common,
      React.createElement("path", { d: "M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4" }),
      React.createElement("path", { d: "M19 17V5a2 2 0 0 0-2-2H4" }),
      React.createElement("path", { d: "M9 7h6" }),
      React.createElement("path", { d: "M9 11h6" })
    );
  }

  function TrajectoryArchiveBar({ characterId, characterName, activeRecord, onSelectRecord }) {
    const React = global.React;
    if (!React) return null;
    const { useState, useEffect } = React;

    const [historyList, setHistoryList] = useState([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [autoSync, setAutoSync] = useState(true);
    const [syncTip, setSyncTip] = useState("");
    const [syncing, setSyncing] = useState(false);

    const refreshList = async () => {
      if (!characterId) {
        setHistoryList([]);
        return;
      }
      const list = await listTrajectories(characterId);
      setHistoryList(list);
    };

    useEffect(() => {
      refreshList();
      getPrefs().then((p) => setAutoSync(p.autoSyncToCalendar !== false));
      const onUpdated = (e) => {
        const target = e && e.detail && e.detail.charId;
        if (!target || String(target) === String(characterId)) {
          refreshList();
        }
      };
      global.addEventListener && global.addEventListener("milvus-trajectory-archive-updated", onUpdated);
      return () => {
        global.removeEventListener && global.removeEventListener("milvus-trajectory-archive-updated", onUpdated);
      };
    }, [characterId]);

    const handleManualSync = async () => {
      if (!activeRecord || !Array.isArray(activeRecord.events) || activeRecord.events.length === 0) {
        setSyncTip("请先点击放大镜生成轨迹，再同步至日历");
        return;
      }
      setSyncing(true);
      try {
        const res = await syncTrajectoryToCalendar({
          charId: characterId,
          charName: characterName,
          events: activeRecord.events,
          dateStr: activeRecord.dateStr,
          recordId: activeRecord.id
        });
        const c = res.counts || {};
        setSyncTip(`已同步 ${res.synced} 条至日历（已毕 ${c["已毕之事"] || 0} · 进行 ${c["进行之事"] || 0} · 未竟 ${c["未竟之事"] || 0}）`);
        if (typeof onSelectRecord === "function") {
          onSelectRecord({ ...activeRecord, syncedToCalendar: true, calendarSyncCount: res.synced });
        }
      } catch (_) {
        setSyncTip("同步日历失败，请稍后重试");
      } finally {
        setSyncing(false);
      }
    };

    const todayStr = formatDateYmd();
    const isToday = activeRecord && activeRecord.dateStr === todayStr;
    const badgeText = !activeRecord
      ? "示例预览（点放大镜生成今日轨迹）"
      : isToday
        ? `今日存档 · ${activeRecord.dateStr}`
        : `历史回顾 · ${activeRecord.dateStr}`;

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            marginBottom: "12px",
            fontFamily: "sans-serif"
          }
        },
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "6px",
              flexWrap: "wrap"
            }
          },
          React.createElement(
            "span",
            {
              style: {
                fontSize: "11px",
                color: activeRecord ? "#5E6756" : "#8C917B",
                background: activeRecord ? "rgba(255,255,255,0.68)" : "rgba(255,255,255,0.42)",
                border: "1px solid #D9D2C0",
                borderRadius: "999px",
                padding: "3px 9px"
              }
            },
            badgeText
          ),
          React.createElement(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
            activeRecord &&
              React.createElement(
                "button",
                {
                  type: "button",
                  disabled: syncing,
                  onClick: handleManualSync,
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: "1px solid #6D947C",
                    background: activeRecord.syncedToCalendar ? "#EDF5EE" : "#FFFFFF",
                    color: "#3F6249",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    cursor: syncing ? "wait" : "pointer"
                  }
                },
                React.createElement(SvgIcon, { kind: "calendar" }),
                React.createElement("span", null, syncing ? "同步中..." : activeRecord.syncedToCalendar ? "已同步日历" : "同步至日历")
              ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => {
                  refreshList();
                  setDrawerOpen(true);
                },
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  border: "1px solid #8C917B",
                  background: "rgba(255,255,255,0.78)",
                  color: "#505643",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  cursor: "pointer"
                }
              },
              React.createElement(SvgIcon, { kind: "scroll" }),
              React.createElement("span", null, `历史轨迹 (${historyList.length})`)
            )
          )
        ),
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" } },
          React.createElement(
            "label",
            { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#6E7362", cursor: "pointer" } },
            React.createElement("input", {
              type: "checkbox",
              checked: autoSync,
              onChange: (e) => {
                const v = e.target.checked;
                setAutoSync(v);
                savePrefs({ autoSyncToCalendar: v });
              }
            }),
            "生成轨迹后自动按时辰同步至日历（已毕 / 进行 / 未竟）"
          ),
          syncTip && React.createElement("span", { style: { fontSize: "11px", color: "#466B4F", fontWeight: 600 } }, syncTip)
        )
      ),

      drawerOpen &&
        React.createElement(
          "div",
          {
            onClick: () => setDrawerOpen(false),
            style: {
              position: "fixed",
              inset: 0,
              background: "rgba(35, 38, 30, 0.45)",
              zIndex: 1300,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center"
            }
          },
          React.createElement(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "100%",
                maxWidth: "460px",
                maxHeight: "74vh",
                background: "#FAF6EE",
                borderTopLeftRadius: "20px",
                borderTopRightRadius: "20px",
                borderTop: "1px solid #DFD7C4",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                fontFamily: "sans-serif",
                boxShadow: "0 -10px 30px rgba(0,0,0,0.16)"
              }
            },
            React.createElement(
              "div",
              {
                style: {
                  padding: "14px 16px",
                  background: "#FFFFFF",
                  borderBottom: "1px solid #EAE2D0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }
              },
              React.createElement(
                "div",
                null,
                React.createElement("div", { style: { fontWeight: 700, fontSize: "15px", color: "#3F4536" } }, `${characterName || "名士"} · 历史轨迹档案`),
                React.createElement("div", { style: { fontSize: "11px", color: "#8C917B", marginTop: "2px" } }, `共 ${historyList.length} 卷，点击任意记录免消耗直接回顾`)
              ),
              React.createElement(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "8px" } },
                historyList.length > 0 &&
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: async () => {
                        if (global.confirm && !global.confirm(`确定清空「${characterName || "该名士"}」全部 ${historyList.length} 卷历史轨迹吗？`)) return;
                        await clearTrajectories(characterId);
                        setHistoryList([]);
                      },
                      style: {
                        padding: "4px 9px",
                        borderRadius: "999px",
                        border: "1px solid #E6D4D0",
                        background: "#FDF5F3",
                        color: "#B54534",
                        fontSize: "11px",
                        cursor: "pointer"
                      }
                    },
                    "清空"
                  ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: () => setDrawerOpen(false),
                    style: {
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      border: "none",
                      background: "#F0ECE2",
                      color: "#5A5F4D",
                      fontSize: "15px",
                      cursor: "pointer"
                    }
                  },
                  "×"
                )
              )
            ),
            React.createElement(
              "div",
              { style: { flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "9px" } },
              historyList.length === 0
                ? React.createElement(
                    "div",
                    { style: { textAlign: "center", padding: "36px 16px", color: "#8C917B", fontSize: "12.5px", lineHeight: 1.7 } },
                    "尚无历史轨迹存档。点击顶栏放大镜生成今日轨迹后，将自动永久归档至此处。"
                  )
                : historyList.map((rec) => {
                    const isActive = activeRecord && activeRecord.id === rec.id;
                    const previewTitles = (rec.events || []).slice(0, 3).map((ev) => ev && ev.title).filter(Boolean).join(" · ");
                    return React.createElement(
                      "div",
                      {
                        key: rec.id,
                        onClick: () => {
                          if (typeof onSelectRecord === "function") onSelectRecord(rec);
                          setDrawerOpen(false);
                        },
                        style: {
                          padding: "11px 12px",
                          borderRadius: "12px",
                          background: isActive ? "#F2F7EF" : "#FFFFFF",
                          border: isActive ? "1.5px solid #6D947C" : "1px solid #E6DEC9",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: "5px"
                        }
                      },
                      React.createElement(
                        "div",
                        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" } },
                        React.createElement(
                          "div",
                          { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
                          React.createElement("span", { style: { fontWeight: 700, fontSize: "13px", color: "#3F4536" } }, rec.displayDate || formatAncientDate(rec.dateStr)),
                          React.createElement("span", { style: { fontSize: "11px", color: "#8C917B" } }, `${rec.dateStr} ${formatTimeHm(rec.createdAt)}`),
                          rec.syncedToCalendar &&
                            React.createElement(
                              "span",
                              { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: "#E8F2E9", color: "#3D6242" } },
                              "已同步日历"
                            ),
                          isActive &&
                            React.createElement(
                              "span",
                              { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: "#6D947C", color: "#FFFFFF" } },
                              "当前查看"
                            )
                        ),
                        React.createElement(
                          "button",
                          {
                            type: "button",
                            onClick: async (e) => {
                              e.stopPropagation();
                              await deleteTrajectory(rec.id, characterId);
                              refreshList();
                            },
                            style: {
                              border: "none",
                              background: "transparent",
                              color: "#B8B0A0",
                              fontSize: "15px",
                              cursor: "pointer",
                              padding: "0 4px"
                            },
                            title: "删除此卷轨迹"
                          },
                          "×"
                        )
                      ),
                      React.createElement(
                        "div",
                        { style: { fontSize: "11.5px", color: "#6A6F5E", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
                        `共 ${(rec.events || []).length} 个时辰事件：${previewTitles || "查看详情"}`
                      )
                    );
                  })
            )
          )
        )
    );
  }

  const api = {
    formatDateYmd,
    formatAncientDate,
    parseShichenTimeRange,
    classifyTrajectoryEventCategory,
    getPrefs,
    savePrefs,
    loadCalendarTasks,
    saveCalendarTasks,
    buildTrajectoryContextAddon,
    syncTrajectoryToCalendar,
    getRecentTrajectoriesSummary,
    saveTrajectory,
    listTrajectories,
    loadLatestTrajectory,
    deleteTrajectory,
    clearTrajectories,
    TrajectoryArchiveBar
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.TrajectoryCalendarBridge = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
