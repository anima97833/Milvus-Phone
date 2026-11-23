/**
 * Ano-phone「🕊️ 鸿雁传书 · 主动传讯（Proactive Messenger）」独立模块化引擎
 * - 独立 IndexedDB: milvus_proactive_msg_idb (零 localStorage 占用)
 * - 支持私聊与群聊（群聊可随机挑 1~3 位名士自发接茬并 @主公）
 * - 4 种触发模式：固定间隔（±15% 活人抖动）/ 每日定点 / 沉默追问 / 混合模式 + 离线重连补发
 * - 四重防骚扰风控：连续未回熔断、每日发送上限、跨午夜免打扰时段、2 分钟活跃避让
 * - 串行防并发风暴调度队列 + 浏览器桌面通知 + 基础设置配置卡 ProactiveMsgSettingsCard
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_proactive_msg_idb";
  const DB_VERSION = 1;
  const STORE_CONFIGS = "chat_configs";
  const STORE_STATE = "schedule_state";

  const CONFIG_EVENT = "milvus-proactive-config-changed";
  const DELIVERED_EVENT = "milvus-proactive-msg-delivered";

  const ACTIVE_COOLDOWN_MS = 2 * 60 * 1000;
  const GLOBAL_MIN_GAP_MS = 15 * 1000;
  const TICK_INTERVAL_MS = 60 * 1000;

  const DEFAULT_CHAT_CONFIG = {
    enabled: false,
    isGroup: false,
    mode: "hybrid", // "interval" | "daily" | "away" | "hybrid"
    intervalMinutes: 60,
    dailyTimes: ["08:30", "22:30"],
    awayMinutes: 25,
    catchUpOnReturn: true,
    maxUnanswered: 2,
    dailyLimit: 6,
    quietStart: "23:30",
    quietEnd: "07:30",
    browserNotify: false,
    cloudEnabled: false,
    cloudWorkerUrl: "",
    cloudSecret: "",
    cloudPushUrl: ""
  };

  const DEFAULT_STATE = {
    lastUserMsgAt: 0,
    lastProactiveAt: 0,
    nextFireAt: 0,
    unansweredCount: 0,
    sentTodayDate: "",
    sentTodayCount: 0,
    firedDailySlots: []
  };

  // ==========================================
  // 1. 存储层（IndexedDB + Node 内存适配器，零 localStorage）
  // ==========================================
  let _dbPromise = null;
  let _memConfigs = new Map();
  let _memStates = new Map();
  const _cfgSyncCache = new Map();

  let _tickTimer = null;
  let _queueBusy = false;
  let _lastGlobalFireAt = 0;
  let _bridge = null;

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
            db.createObjectStore(STORE_CONFIGS, { keyPath: "chatId" });
          }
          if (!db.objectStoreNames.contains(STORE_STATE)) {
            db.createObjectStore(STORE_STATE, { keyPath: "chatId" });
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
      return storeName === STORE_CONFIGS ? _memConfigs.get(key) || null : _memStates.get(key) || null;
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

  async function idbGetAll(storeName) {
    const db = await openDb();
    if (!db) {
      return Array.from((storeName === STORE_CONFIGS ? _memConfigs : _memStates).values());
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function idbPut(storeName, record) {
    const db = await openDb();
    if (!db) {
      if (storeName === STORE_CONFIGS) _memConfigs.set(record.chatId, record);
      else _memStates.set(record.chatId, record);
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
    } catch (e) { }
  }

  function getConfigSync(chatId) {
    const cid = String(chatId || "");
    if (!cid) return { ...DEFAULT_CHAT_CONFIG, chatId: "" };
    const cached = _cfgSyncCache.get(cid);
    return cached ? { ...DEFAULT_CHAT_CONFIG, ...cached, chatId: cid } : { ...DEFAULT_CHAT_CONFIG, chatId: cid };
  }

  async function hydrateConfig(chatId) {
    const cid = String(chatId || "");
    if (!cid) return { ...DEFAULT_CHAT_CONFIG, chatId: "" };
    const rec = await idbGet(STORE_CONFIGS, cid);
    const merged = { ...DEFAULT_CHAT_CONFIG, ...(rec || {}), chatId: cid };
    _cfgSyncCache.set(cid, merged);
    return merged;
  }

  function normalizeDailyTimes(list) {
    if (!Array.isArray(list)) return ["08:30", "22:30"];
    const valid = list
      .map((s) => String(s || "").trim())
      .filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
    return Array.from(new Set(valid)).sort().slice(0, 8);
  }

  async function saveConfig(chatId, patch) {
    const cid = String(chatId || "");
    if (!cid) return { ...DEFAULT_CHAT_CONFIG, chatId: "" };
    const cur = await hydrateConfig(cid);
    const next = {
      ...cur,
      ...(patch || {}),
      chatId: cid,
      intervalMinutes: Math.max(10, Math.min(720, Number(patch?.intervalMinutes ?? cur.intervalMinutes) || 60)),
      awayMinutes: Math.max(5, Math.min(360, Number(patch?.awayMinutes ?? cur.awayMinutes) || 25)),
      maxUnanswered: Math.max(1, Math.min(10, Number(patch?.maxUnanswered ?? cur.maxUnanswered) || 2)),
      dailyLimit: Math.max(1, Math.min(20, Number(patch?.dailyLimit ?? cur.dailyLimit) || 6)),
      dailyTimes: patch && patch.dailyTimes !== undefined ? normalizeDailyTimes(patch.dailyTimes) : normalizeDailyTimes(cur.dailyTimes),
      updatedAt: Date.now()
    };
    _cfgSyncCache.set(cid, next);
    await idbPut(STORE_CONFIGS, next);

    // 若刚启用且尚无 nextFireAt，安排下一次间隔触发时间
    if (next.enabled) {
      const st = await getScheduleState(cid);
      if (!st.nextFireAt || st.nextFireAt < Date.now()) {
        await saveScheduleState(cid, {
          nextFireAt: computeNextIntervalMs(Date.now(), next.intervalMinutes)
        });
      }
    }
    dispatchEvt(CONFIG_EVENT, { chatId: cid });
    return next;
  }

  async function getScheduleState(chatId) {
    const cid = String(chatId || "");
    const rec = await idbGet(STORE_STATE, cid);
    return { ...DEFAULT_STATE, ...(rec || {}), chatId: cid };
  }

  async function saveScheduleState(chatId, patch) {
    const cid = String(chatId || "");
    const cur = await getScheduleState(cid);
    const next = { ...cur, ...(patch || {}), chatId: cid };
    await idbPut(STORE_STATE, next);
    return next;
  }

  function _resetForTests() {
    _memConfigs = new Map();
    _memStates = new Map();
    _cfgSyncCache.clear();
    _queueBusy = false;
    _lastGlobalFireAt = 0;
  }

  // ==========================================
  // 2. 时间工具 & 四重防骚扰风控引擎
  // ==========================================
  function formatLocalDay(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function parseHHMMToMinutes(hhmm) {
    const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  /**
   * 精准判断跨午夜（如 23:30 ~ 07:30）或同日免打扰区间
   */
  function isInQuietHours(nowDate, startHHMM, endHHMM) {
    const s = parseHHMMToMinutes(startHHMM);
    const e = parseHHMMToMinutes(endHHMM);
    if (s === null || e === null || s === e) return false;
    const cur = nowDate.getHours() * 60 + nowDate.getMinutes();
    if (s < e) {
      return cur >= s && cur < e;
    }
    // 跨午夜，例如 23:30 (1410) ~ 07:30 (450)
    return cur >= s || cur < e;
  }

  function computeNextIntervalMs(baseMs, intervalMinutes, randVal = Math.random()) {
    const mins = Math.max(10, Number(intervalMinutes) || 60);
    // ±15% 活人随机抖动
    const factor = 0.85 + Math.max(0, Math.min(1, randVal)) * 0.30;
    return Math.round(baseMs + mins * 60 * 1000 * factor);
  }

  function evaluateTriggerEligibility(cfg, state, nowMs = Date.now(), opts = {}) {
    if (!cfg || !cfg.enabled) return { ok: false, reason: "disabled" };
    if (opts.force) return { ok: true, reason: "manual_test" };

    const nowDate = new Date(nowMs);
    if (isInQuietHours(nowDate, cfg.quietStart, cfg.quietEnd)) {
      return { ok: false, reason: "quiet_hours" };
    }

    const today = formatLocalDay(nowMs);
    const sentToday = state.sentTodayDate === today ? Number(state.sentTodayCount) || 0 : 0;
    if (sentToday >= (Number(cfg.dailyLimit) || 6)) {
      return { ok: false, reason: "daily_limit" };
    }

    if ((Number(state.unansweredCount) || 0) >= (Number(cfg.maxUnanswered) || 2)) {
      return { ok: false, reason: "max_unanswered" };
    }

    if (state.lastUserMsgAt && nowMs - state.lastUserMsgAt < ACTIVE_COOLDOWN_MS) {
      return { ok: false, reason: "user_active_recently" };
    }

    return { ok: true, reason: "eligible" };
  }

  function checkDueTrigger(cfg, state, nowMs = Date.now(), isReturnFromOffline = false) {
    const elig = evaluateTriggerEligibility(cfg, state, nowMs);
    if (!elig.ok) return { due: false, reason: elig.reason };

    const mode = cfg.mode || "hybrid";
    const nowDate = new Date(nowMs);
    const today = formatLocalDay(nowMs);
    const firedSlots = state.sentTodayDate === today && Array.isArray(state.firedDailySlots) ? state.firedDailySlots : [];

    // 1. 每日定点检查（允许到点后 25 分钟容错窗口）
    if (mode === "daily" || mode === "hybrid") {
      const curMin = nowDate.getHours() * 60 + nowDate.getMinutes();
      for (const slot of normalizeDailyTimes(cfg.dailyTimes)) {
        if (firedSlots.includes(slot)) continue;
        const slotMin = parseHHMMToMinutes(slot);
        if (slotMin !== null && curMin >= slotMin && curMin - slotMin <= 25) {
          return { due: true, kind: "daily", slot };
        }
      }
    }

    // 2. 离线重连补发检查
    if (isReturnFromOffline && cfg.catchUpOnReturn) {
      const lastTouch = Math.max(state.lastUserMsgAt || 0, state.lastProactiveAt || 0);
      const minGapMs = Math.max(20, Number(cfg.intervalMinutes) || 60) * 60 * 1000;
      if (lastTouch > 0 && nowMs - lastTouch >= minGapMs) {
        return { due: true, kind: "offline_catchup" };
      }
    }

    // 3. 沉默追问检查
    if (mode === "away" || mode === "hybrid") {
      const awayMs = Math.max(5, Number(cfg.awayMinutes) || 25) * 60 * 1000;
      if (
        state.lastUserMsgAt > 0 &&
        state.lastUserMsgAt >= (state.lastProactiveAt || 0) &&
        nowMs - state.lastUserMsgAt >= awayMs
      ) {
        return { due: true, kind: "away" };
      }
    }

    // 4. 固定间隔检查
    if (mode === "interval" || mode === "hybrid") {
      if (state.nextFireAt > 0 && nowMs >= state.nextFireAt) {
        return { due: true, kind: "interval" };
      }
    }

    return { due: false, reason: "not_due" };
  }

  async function recordUserActivity(chatId, nowMs = Date.now()) {
    const cid = String(chatId || "");
    if (!cid) return;
    const cfg = await hydrateConfig(cid);
    await saveScheduleState(cid, {
      lastUserMsgAt: nowMs,
      unansweredCount: 0,
      nextFireAt: cfg.enabled ? computeNextIntervalMs(nowMs, cfg.intervalMinutes) : 0
    });
  }

  // ==========================================
  // 3. 私聊 & 群聊主动消息 Prompt 构造 + 群聊多角色解析
  // ==========================================
  function describeTimeOfDay(d) {
    const h = d.getHours();
    if (h < 6) return "凌晨";
    if (h < 9) return "清晨";
    if (h < 12) return "上午";
    if (h < 14) return "午间";
    if (h < 18) return "午后";
    if (h < 22) return "傍晚/入夜";
    return "深夜";
  }

  function formatElapsed(minutes) {
    const m = Math.max(1, Math.round(minutes || 0));
    if (m < 60) return `约 ${m} 分钟`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `约 ${h} 小时 ${rem} 分钟` : `约 ${h} 小时`;
  }

  function cleanMsgText(raw) {
    const txt = String(raw || "");
    if (global.ChatTranslationEngine && typeof global.ChatTranslationEngine.stripBilingualForHistory === "function") {
      return global.ChatTranslationEngine.stripBilingualForHistory(txt, "translated");
    }
    return txt.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  }

  function pickGroupSpeakers(members, maxCount = 2) {
    const list = Array.isArray(members) ? members.filter((m) => m && m.name) : [];
    if (list.length === 0) return [];
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(list.length, Math.max(1, maxCount)));
  }

  function buildProactiveMessages({ chatData, isGroup, recentMessages = [], triggerKind = "interval", nowDate = new Date(), elapsedMinutes = 45, userName = "主公" }) {
    const weekZh = ["日", "一", "二", "三", "四", "五", "六"][nowDate.getDay()];
    const timeStr = `${formatLocalDay(nowDate.getTime())} 周${weekZh} ${String(nowDate.getHours()).padStart(2, "0")}:${String(nowDate.getMinutes()).padStart(2, "0")}（${describeTimeOfDay(nowDate)}）`;

    const historyLines = (recentMessages || [])
      .slice(-6)
      .map((m) => {
        const who = m.isMe ? userName : (m.sender || chatData?.name || "名士");
        const txt = cleanMsgText(m.text || m.content || "").slice(0, 140);
        return txt ? `${who}：${txt}` : "";
      })
      .filter(Boolean)
      .join("\n");

    const triggerHintMap = {
      daily: "现在到了每日固定问候时刻，请顺着当前时段自然打招呼、分享此刻你在做什么或叮嘱对方。",
      away: `距离你们上一句话已经过了 ${formatElapsed(elapsedMinutes)}，对方还没回信，请以符合你性格的方式自然关心、轻声催促或分享一件手边趣事。`,
      offline_catchup: `对方离开小手机已有 ${formatElapsed(elapsedMinutes)}，刚刚重新上线，请自然地发来一条问候或念叨。`,
      manual_test: "请立刻主动给对方发来一条生动自然的日常消息。",
      interval: `距离上次互动已过 ${formatElapsed(elapsedMinutes)}，你忽然想起了对方，决定主动发条传讯。`
    };
    const triggerHint = triggerHintMap[triggerKind] || triggerHintMap.interval;

    if (isGroup) {
      const members = Array.isArray(chatData?.members) ? chatData.members : [];
      const speakers = pickGroupSpeakers(members, Math.min(3, Math.max(2, members.length)));
      const speakerDesc = speakers.map((m) => `- ${m.name}：${(m.personality || m.profile?.personality || "性格鲜明").slice(0, 80)}`).join("\n");
      const sys = `你正在驱动群聊「${chatData?.name || "群聊"}」中的名士自发闲聊。
当前现实时间：${timeStr}。
本次活跃发言名士：
${speakerDesc || "- 群内名士"}

要求：
1. 让上述名士在群里自然聊 2~4 句日常近况、拌嘴或分享见闻，可以顺手 @${userName} 喊对方出来冒泡；
2. 每一行必须严格以 \`[名士名字]: 消息内容\` 开头，口吻像真人发微信短句，不要写小说旁白或长篇大论。`;

      const usr = `${historyLines ? `【近期群聊上下文】\n${historyLines}\n\n` : ""}【触发情境】${triggerHint}\n请输出 2~4 行群聊消息。`;
      return {
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr }
        ],
        speakers
      };
    }

    const charName = chatData?.name || chatData?.profile?.name || "名士";
    const personality = chatData?.personality || chatData?.profile?.personality || "";
    const style = chatData?.speakingStyle || chatData?.profile?.speakingStyle || "";
    const sys = `你正在扮演【${charName}】，现在主动给【${userName}】发一条私聊传讯。
- 性格：${personality || "保持你一贯的人设"}
- 语言风格：${style || "自然口语化、像真人发消息"}
- 当前现实时间：${timeStr}

要求：
1. 直接输出 1~2 句简短自然的传讯内容（总计 15~75 字），像真人突然想起对方发来的微信消息；
2. 严禁输出任何系统旁白、时间戳前缀或解释性文字；严禁出戏提“定时任务”“主动消息”。`;

    const usr = `${historyLines ? `【最近对话参考】\n${historyLines}\n\n` : ""}【触发情境】${triggerHint}\n请直接说出你要发给${userName}的话。`;
    return {
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr }
      ],
      speakers: [{ name: charName, avatar: chatData?.avatar || "" }]
    };
  }

  function parseGroupProactiveReplies(rawText, speakers = []) {
    const cleaned = String(rawText || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!cleaned) return [];
    const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    const fallbackSpeaker = speakers[0] || { name: "名士", avatar: "" };

    for (const line of lines) {
      const m = line.match(/^[\[【]([^\]】]{1,18})[\]】]\s*[:：]\s*(.+)$/);
      if (m) {
        const name = m[1].trim();
        const text = m[2].trim();
        const found = speakers.find((s) => s.name === name) || { name, avatar: "" };
        if (text) out.push({ sender: found.name, avatar: found.avatar || "", text });
      } else {
        out.push({ sender: fallbackSpeaker.name, avatar: fallbackSpeaker.avatar || "", text: line });
      }
    }
    return out.slice(0, 4);
  }

  // ==========================================
  // 4. LLM 调用、桌面通知与串行调度执行
  // ==========================================
  async function callProactiveLlm(messages, opts = {}) {
    if (typeof opts.customChatFn === "function") {
      return opts.customChatFn(messages, opts);
    }
    const llm = resolveCurrentLlmCreds();
    if (!llm || !llm.llmEndpoint) throw new Error("未检测到可用 API 配置");
    const headers = { "Content-Type": "application/json" };
    if (llm.llmApiKey) headers.Authorization = `Bearer ${llm.llmApiKey}`;
    const resp = await fetch(llm.llmEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: llm.llmModel || "gpt-4o-mini",
        messages,
        temperature: 0.82,
        max_tokens: 260
      })
    });
    if (!resp.ok) throw new Error(`主动传讯生成失败 (${resp.status})`);
    const json = await resp.json();
    return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
  }

  function maybeSendBrowserNotification(title, body, icon) {
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (typeof document !== "undefined" && document.visibilityState === "visible") return;
      new Notification(title, { body: String(body || "").slice(0, 100), icon: icon || undefined });
    } catch (e) { }
  }

  async function requestNotifyPermission() {
    if (typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "granted") return "granted";
    try {
      return await Notification.requestPermission();
    } catch (e) {
      return "denied";
    }
  }

  function registerBridge(bridgeObj) {
    _bridge = bridgeObj || null;
  }

  async function fireForChat(chatId, { chatData = null, isGroup = false, triggerKind = "interval", slot = null, force = false, customChatFn = null, nowMs = Date.now() } = {}) {
    const cid = String(chatId || "");
    if (!cid) return { ok: false, reason: "invalid_chat" };

    const cfg = await hydrateConfig(cid);
    const state = await getScheduleState(cid);
    const elig = evaluateTriggerEligibility(cfg, state, nowMs, { force });
    if (!elig.ok) return { ok: false, reason: elig.reason };

    const resolvedChat = chatData || (_bridge && typeof _bridge.getChatById === "function" ? _bridge.getChatById(cid) : { id: cid, name: "名士" });
    if (!resolvedChat) return { ok: false, reason: "chat_not_found" };

    const groupFlag = Boolean(isGroup || cfg.isGroup || resolvedChat.isGroup || resolvedChat.type === "group" || cid.startsWith("group_chat"));
    let recentMessages = [];
    if (_bridge && typeof _bridge.getRecentMessages === "function") {
      recentMessages = (await _bridge.getRecentMessages(cid)) || [];
    } else if (global.chatHistoryStore && typeof global.chatHistoryStore.getRecentMessages === "function") {
      try {
        recentMessages = (await global.chatHistoryStore.getRecentMessages(cid, 8)) || [];
      } catch (e) {}
    }
    const userName = resolvedChat?.profile?.userNickname || "主公";
    const lastTouch = Math.max(state.lastUserMsgAt || 0, state.lastProactiveAt || 0);
    const elapsedMinutes = lastTouch > 0 ? Math.max(1, (nowMs - lastTouch) / 60000) : cfg.intervalMinutes;

    const { messages, speakers } = buildProactiveMessages({
      chatData: resolvedChat,
      isGroup: groupFlag,
      recentMessages,
      triggerKind,
      nowDate: new Date(nowMs),
      elapsedMinutes,
      userName
    });

    const rawReply = await callProactiveLlm(messages, { customChatFn });
    const timeLabel = new Date(nowMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    let deliveredMsgs = [];

    if (groupFlag) {
      const parsed = parseGroupProactiveReplies(rawReply, speakers);
      deliveredMsgs = parsed.map((item, idx) => ({
        id: nowMs + idx + 1,
        text: item.text,
        type: "text",
        isMe: false,
        sender: item.sender,
        avatar: item.avatar || "",
        time: timeLabel,
        proactive: true
      }));
    } else {
      const cleanReply = String(rawReply || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (!cleanReply) return { ok: false, reason: "empty_reply" };
      deliveredMsgs = [
        {
          id: nowMs + 1,
          text: cleanReply,
          type: "text",
          isMe: false,
          time: timeLabel,
          proactive: true
        }
      ];
    }

    if (deliveredMsgs.length === 0) return { ok: false, reason: "empty_reply" };

    // 更新风控与调度状态
    const today = formatLocalDay(nowMs);
    const prevTodayCount = state.sentTodayDate === today ? Number(state.sentTodayCount) || 0 : 0;
    const prevSlots = state.sentTodayDate === today && Array.isArray(state.firedDailySlots) ? state.firedDailySlots : [];
    const nextSlots = slot && !prevSlots.includes(slot) ? [...prevSlots, slot] : prevSlots;

    await saveScheduleState(cid, {
      lastProactiveAt: nowMs,
      nextFireAt: computeNextIntervalMs(nowMs, cfg.intervalMinutes),
      unansweredCount: (Number(state.unansweredCount) || 0) + 1,
      sentTodayDate: today,
      sentTodayCount: prevTodayCount + 1,
      firedDailySlots: nextSlots
    });
    _lastGlobalFireAt = nowMs;

    // 通过桥接或全局 chatHistoryStore 落盘并广播事件
    if (_bridge && typeof _bridge.deliverMessages === "function") {
      await _bridge.deliverMessages(cid, deliveredMsgs, resolvedChat);
    } else if (global.chatHistoryStore && typeof global.chatHistoryStore.appendMessage === "function") {
      for (const msg of deliveredMsgs) {
        try {
          await global.chatHistoryStore.appendMessage(cid, msg);
        } catch (e) {}
      }
    }
    dispatchEvt(DELIVERED_EVENT, { chatId: cid, chatName: resolvedChat.name || "名士", messages: deliveredMsgs });

    if (cfg.browserNotify) {
      maybeSendBrowserNotification(
        `${resolvedChat.name || "名士"}发来传讯`,
        deliveredMsgs[0].text,
        resolvedChat.avatar
      );
    }

    return { ok: true, chatId: cid, messages: deliveredMsgs };
  }

  async function runTick({ isReturnFromOffline = false, nowMs = Date.now(), customChatFn = null } = {}) {
    if (_queueBusy) return { ran: false, reason: "busy" };
    if (!isReturnFromOffline && nowMs - _lastGlobalFireAt < GLOBAL_MIN_GAP_MS) {
      return { ran: false, reason: "global_cooldown" };
    }
    if (_bridge && typeof _bridge.isGenerating === "function" && _bridge.isGenerating()) {
      return { ran: false, reason: "ai_generating" };
    }

    _queueBusy = true;
    try {
      const allConfigs = await idbGetAll(STORE_CONFIGS);
      const enabledConfigs = allConfigs.filter((c) => c && c.enabled);
      for (const cfg of enabledConfigs) {
        const st = await getScheduleState(cfg.chatId);
        const check = checkDueTrigger(cfg, st, nowMs, isReturnFromOffline);
        if (check.due) {
          const res = await fireForChat(cfg.chatId, {
            isGroup: cfg.isGroup,
            triggerKind: check.kind,
            slot: check.slot || null,
            customChatFn,
            nowMs
          });
          // 串行防风暴：每次巡检最多只触发 1 个会话，其余顺延到下次心跳
          return { ran: true, chatId: cfg.chatId, result: res };
        }
      }
      return { ran: false, reason: "none_due" };
    } finally {
      _queueBusy = false;
    }
  }

  function startScheduler() {
    if (typeof global.setInterval !== "function") return;
    if (_tickTimer) return;
    _tickTimer = global.setInterval(() => {
      runTick({ isReturnFromOffline: false }).catch(() => { });
    }, TICK_INTERVAL_MS);

    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          setTimeout(() => {
            pullCloudInbox().catch(() => { });
            runTick({ isReturnFromOffline: true }).catch(() => { });
          }, 2500);
        }
      });
    }
    // 首次启动 3 秒后先拉取云端离线收件箱，再执行本地补发巡检
    setTimeout(() => {
      pullCloudInbox().catch(() => { });
      runTick({ isReturnFromOffline: true }).catch(() => { });
    }, 3000);
  }

  // ==========================================
  // 4.5 云端锁屏真推送同步 & 离线收件箱拉取（Phase 2）
  // ==========================================
  function normalizeWorkerBase(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function resolveCurrentLlmCreds() {
    let configs = Array.isArray(global.api_configs) ? global.api_configs : [];
    let idx = Number(global.selected_api_config_index) || 0;
    if (configs.length === 0 && typeof global.localStorage !== "undefined") {
      try {
        const raw = global.localStorage.getItem("api_configs");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) configs = parsed;
        }
        const savedIdx = global.localStorage.getItem("selected_api_config_index");
        if (savedIdx !== null && savedIdx !== "") idx = parseInt(savedIdx, 10) || 0;
      } catch (e) {}
    }
    const cfg = configs[idx] || configs[0];
    if (!cfg || !cfg.url) return null;
    const base = String(cfg.url).trim().replace(/\/+$/, "");
    let endpoint = base;
    if (!/\/chat\/completions$/i.test(base)) {
      if (cfg.type === "official") {
        endpoint = /\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
      } else if (/\/v1$/i.test(base)) {
        endpoint = `${base}/chat/completions`;
      } else {
        endpoint = `${base}/api/chat/completions`;
      }
    }
    return {
      llmEndpoint: endpoint,
      llmApiKey: cfg.apiKey || cfg.key || "",
      llmModel: cfg.model || "gpt-4o-mini"
    };
  }

  async function checkCloudWorkerStatus(workerUrl, secret = "") {
    const base = normalizeWorkerBase(workerUrl);
    if (!base) throw new Error("请先填写 Cloudflare Worker 地址");
    const headers = {};
    if (secret) headers["X-Proactive-Secret"] = secret;
    const resp = await fetch(`${base}/proactive/status`, { method: "GET", headers });
    return resp.json();
  }

  async function syncChatToCloud(chatId, chatData, cfgOverride = null) {
    const cid = String(chatId || "");
    const cfg = cfgOverride || (await hydrateConfig(cid));
    const base = normalizeWorkerBase(cfg.cloudWorkerUrl);
    if (!base) throw new Error("请先填写 Cloudflare Worker 地址");

    const llm = resolveCurrentLlmCreds();
    if (cfg.cloudEnabled && (!llm || !llm.llmApiKey)) {
      throw new Error("未检测到主 API 配置，请先在设置里填好 API");
    }

    let recentContext = "";
    if (global.chatHistoryStore && typeof global.chatHistoryStore.getRecentMessages === "function") {
      try {
        const msgs = (await global.chatHistoryStore.getRecentMessages(cid, 4)) || [];
        recentContext = msgs
          .map((m) => `${m.isMe ? "主公" : (chatData?.name || "名士")}：${cleanMsgText(m.text || m.content || "").slice(0, 80)}`)
          .filter(Boolean)
          .join("\n");
      } catch (e) {}
    }

    const headers = { "Content-Type": "application/json" };
    if (cfg.cloudSecret) headers["X-Proactive-Secret"] = cfg.cloudSecret;
    const payload = {
      chatId: cid,
      enabled: Boolean(cfg.enabled && cfg.cloudEnabled),
      charName: chatData?.name || chatData?.profile?.name || "名士",
      userName: chatData?.profile?.userNickname || "主公",
      personality: (chatData?.personality || chatData?.profile?.personality || "").slice(0, 180),
      mode: cfg.mode || "hybrid",
      intervalMinutes: cfg.intervalMinutes || 60,
      dailyTimes: cfg.dailyTimes || ["08:30", "22:30"],
      maxUnanswered: cfg.maxUnanswered || 2,
      dailyLimit: cfg.dailyLimit || 6,
      quietStart: cfg.quietStart || "23:30",
      quietEnd: cfg.quietEnd || "07:30",
      pushUrl: String(cfg.cloudPushUrl || "").trim(),
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
      recentContext,
      ...(llm || {})
    };
    const resp = await fetch(`${base}/proactive/sync`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.error || `同步失败 (${resp.status})`);
    return json;
  }

  async function sendCloudTestPush(workerUrl, secret, pushUrl, charName = "名士") {
    const base = normalizeWorkerBase(workerUrl);
    if (!base) throw new Error("请先填写 Cloudflare Worker 地址");
    if (!String(pushUrl || "").trim()) throw new Error("请先填写 Bark 或 ntfy 推送链接");
    const headers = { "Content-Type": "application/json" };
    if (secret) headers["X-Proactive-Secret"] = secret;
    const resp = await fetch(`${base}/proactive/test-push`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        pushUrl: String(pushUrl).trim(),
        title: `🕊️ ${charName} · 鸿雁传书测试`,
        body: "锁屏推送测试成功！关闭网页后也能按时收到来信。"
      })
    });
    const json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.error || `推送失败 (${resp.status})`);
    return json;
  }

  async function pullCloudInbox() {
    const allConfigs = await idbGetAll(STORE_CONFIGS);
    const cloudHosts = new Map();
    for (const c of allConfigs) {
      if (c && c.cloudEnabled && c.cloudWorkerUrl) {
        cloudHosts.set(normalizeWorkerBase(c.cloudWorkerUrl), c.cloudSecret || "");
      }
    }
    let totalPulled = 0;
    for (const [base, secret] of cloudHosts.entries()) {
      try {
        const headers = {};
        if (secret) headers["X-Proactive-Secret"] = secret;
        const resp = await fetch(`${base}/proactive/inbox`, { method: "GET", headers });
        const json = await resp.json();
        const items = Array.isArray(json?.items) ? json.items : [];
        if (items.length === 0) continue;

        const ackIds = [];
        for (const it of items) {
          const msgObj = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            text: it.text,
            type: "text",
            isMe: false,
            time: it.time || new Date(it.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            proactive: true,
            fromCloud: true
          };
          if (global.chatHistoryStore && typeof global.chatHistoryStore.appendMessage === "function") {
            await global.chatHistoryStore.appendMessage(it.chatId, msgObj);
          }
          dispatchEvt(DELIVERED_EVENT, { chatId: it.chatId, chatName: it.charName || "名士", messages: [msgObj] });
          ackIds.push(it.id);
          totalPulled++;
        }
        if (ackIds.length > 0) {
          await fetch(`${base}/proactive/ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ ids: ackIds })
          });
        }
      } catch (e) {}
    }
    return totalPulled;
  }

  // ==========================================
  // 5. 基础设置配置卡 UI（ProactiveMsgSettingsCard）
  // ==========================================
  function KuaiYueCloudGuideModal({ isOpen, onClose }) {
    if (!isOpen || typeof React === "undefined") return null;
    const h = React.createElement;

    const steps = [
      {
        title: "一、先备好云端驿站（更新 Cloudflare Worker）",
        voice: "网页关了、手机锁了，普通信鸽便找不到门路。好在殿下已有 Cloudflare 这座云端驿站，只需把最新的信使章程贴进去，驿站便能昼夜替您值守。",
        bullets: [
          "登录 Cloudflare 控制台（dash.cloudflare.com），进入左侧 Workers & Pages，点开您自己的 Worker（或新建一个免费 Worker）。",
          "点右上角「Edit code」，把本项目里的 luckin_gateway/cf_worker.js 完整复制覆盖进去，再点「Deploy」部署。",
          "记下您的 Worker 专属网址（格式如：https://my-bird-relay.example.workers.dev）。"
        ]
      },
      {
        title: "二、给驿站配一只信篓（绑定 KV 存储）",
        voice: "文鸟飞得再勤，总得有只信篓存着待发的折子与未拆的回信。这步最要紧，变量名一字不可错，免得大柿子小柿子扑了空。",
        bullets: [
          "在 Cloudflare 左侧菜单进「Storage & Databases → KV」，点「Create a namespace」，随便起个名字（例如：bird-post-vault）保存。",
          "回到您的 Worker → 点「Settings → Bindings → Add → KV namespace」。",
          "Variable name（变量名）必须严格填写：PROACTIVE_KV（全大写）；KV namespace 选中刚建好的 bird-post-vault，点保存部署。"
        ]
      },
      {
        title: "三、定下巡更时辰（开启 Cron Trigger 定时闹钟）",
        voice: "有了驿站和信篓，还得嘱咐更夫隔一会儿便去瞧一眼，省得误了殿下的早晚问安。",
        bullets: [
          "在同一个 Worker 的「Settings → Trigger Events → Cron Triggers」里点「Add Cron Trigger」。",
          "填入定时表达式：*/5 * * * *（表示每 5 分钟云端自动巡检一次，免费额度绰绰有余），点保存。",
          "（可选防外人窥探）可在「Settings → Variables and Secrets」新增一条 Secret，名称填 PROACTIVE_SECRET，值设成您自己记得住的暗语口令。"
        ]
      },
      {
        title: "四、挑一只循迹报信的文鸟（手机锁屏推送通道，二选一）",
        voice: "下官手边那只文鸟，任殿下走到天涯海角也能循迹寻到屏前。您按手里的机子挑一样便是，十息就能配妥：",
        bullets: [
          "🍎 iPhone / iPad（最省心，用 Bark）：去 App Store 免费下「Bark」，打开允许通知，复制首页的推送链接（形如 https://api.day.app/你的设备Key，哪怕带了后面的示例文字也没关系，驿站会自动帮您裁干净）。",
          "🤖 安卓 / 电脑（推荐 ntfy）：安装免费 App「ntfy」（或打开 ntfy.sh/app），点「+」订阅一个您独有的主题名（例如 guangling_bird_2026），您的推送地址便是 https://ntfy.sh/guangling_bird_2026。"
        ]
      },
      {
        title: "五、回小手机点三下，验明通路",
        voice: "折子都备齐了，剩下的便交由下官来跑腿。殿下只需动动指尖验一验，若哪处不灵光，再拿来问下官的罪便是。",
        bullets: [
          "把 Worker 网址、Bark 或 ntfy 推送地址（以及可选暗语口令）填进下方输入框。",
          "① 点「🔍 检测状态」：看到「✅ 云端就绪」说明 KV 信篓已接稳；",
          "② 点「📲 测试锁屏推送」：锁上手机屏，几秒内就会弹出一条测试来信；",
          "③ 点「☁️ 同步到云端」：把当前名士的作息与定时托付给云端。往后即便彻底关掉网页，到点也能收到锁屏通知，再打开小手机时消息会自动落进聊天记录。"
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
          background: "rgba(16, 22, 20, 0.68)",
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
            width: "min(94vw, 415px)",
            maxHeight: "86vh",
            background: "#F9F8F3",
            borderRadius: "18px",
            border: "1.5px solid #B7C4BC",
            boxShadow: "0 22px 54px rgba(12, 22, 18, 0.42)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            color: "#2B322E"
          }
        },
        // 顶栏：墨绿常服 · 蒯越
        h(
          "div",
          {
            style: {
              padding: "14px 16px 12px",
              background: "linear-gradient(135deg, #1E332B 0%, #2F4F43 100%)",
              color: "#F3F7F4",
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
                  background: "rgba(195, 222, 205, 0.16)",
                  border: "1.5px solid #9BC0AB",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "17px",
                  flexShrink: 0
                }
              },
              "🕊️"
            ),
            h(
              "div",
              null,
              h("div", { style: { fontSize: "14.5px", fontWeight: 800, letterSpacing: "0.4px" } }, "江陵雀信 · 蒯越手把手教您配云端"),
              h("div", { style: { fontSize: "11px", color: "#BED5C8", marginTop: "1px" } }, "五步配通离线锁屏推送 · 全程免费零代码")
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
                borderLeft: "3px solid #2F4F43",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "12.5px",
                lineHeight: 1.68,
                color: "#323C37"
              }
            },
            "「殿下切莫皱眉——那些洋文驿站、信篓什么的名头听着唬人，实则不过是给文鸟修一条暗道罢了。下官素日最擅侍弄鸟雀递信，已替您把步子拆得明明白白，您只管照着点便是；总不能让您合上书页，便真把下官忘在江陵罢？」"
          ),
          steps.map((st, idx) =>
            h(
              "div",
              {
                key: idx,
                style: {
                  background: "#FFFFFF",
                  border: "1px solid #E1E6E2",
                  borderRadius: "13px",
                  padding: "11px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "7px"
                }
              },
              h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#233E34" } }, st.title),
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "#43534C",
                    lineHeight: 1.62,
                    background: "#F2F6F4",
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
                    color: "#333A36",
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
                background: "#F3F2EA",
                border: "1px dashed #B9BEA8",
                borderRadius: "11px",
                padding: "10px 12px",
                fontSize: "11.5px",
                color: "#505446",
                lineHeight: 1.65
              }
            },
            "「都妥当了。下官新学了一道果脯茶，郡内尚未流传，等您哪日得空再亲手奉上。至于这云端暗道……既然已为殿下留了位置，还望殿下偶尔也肯低头拆一拆下官寄来的信。」"
          )
        )
      )
    );

    if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body) {
      return global.ReactDOM.createPortal(modalNode, document.body);
    }
    return modalNode;
  }

  function ProactiveMsgSettingsCard({ chatData, isGroup }) {
    if (!chatData?.id || typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;

    const cid = String(chatData.id);
    const groupFlag = Boolean(isGroup || chatData?.isGroup || chatData?.type === "group" || cid.startsWith("group_chat"));
    const [cfg, setCfg] = useState(() => getConfigSync(cid));
    const [newSlot, setNewSlot] = useState("12:30");
    const [testing, setTesting] = useState(false);
    const [tip, setTip] = useState("");
    const [cloudGuideOpen, setCloudGuideOpen] = useState(false);

    useEffect(() => {
      let alive = true;
      hydrateConfig(cid).then((c) => alive && setCfg(c));
      const onChange = (ev) => {
        if (!ev?.detail?.chatId || ev.detail.chatId === cid) setCfg(getConfigSync(cid));
      };
      global.addEventListener(CONFIG_EVENT, onChange);
      return () => {
        alive = false;
        global.removeEventListener(CONFIG_EVENT, onChange);
      };
    }, [cid]);

    const update = (patch) => {
      const nextPatch = { ...patch, isGroup: groupFlag };
      setCfg((prev) => ({ ...prev, ...nextPatch }));
      saveConfig(cid, nextPatch).then((saved) => setCfg(saved));
    };

    const pillStyle = (active) => ({
      border: active ? "1px solid #5E6756" : "1px solid #D9D4C8",
      background: active ? "#5E6756" : "#FAF8F3",
      color: active ? "#FFFFFF" : "#3A352F",
      borderRadius: "999px",
      padding: "4px 9px",
      fontSize: "11.5px",
      fontWeight: active ? 600 : 400,
      cursor: "pointer"
    });

    return h(
      "div",
      {
        "data-settings-item": "proactive_msg",
        "data-settings-group": "basic",
        style: {
          background: "#FFFFFF",
          border: "1px solid #E5E7E3",
          borderRadius: "12px",
          padding: "12px",
          marginTop: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }
      },
      // 标题行
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" } },
        h(
          "div",
          { style: { flex: 1 } },
          h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#2D3732" } }, "🕊️ 鸿雁传书 · 主动发消息"),
          h(
            "div",
            { style: { fontSize: "11px", color: "#767D78", marginTop: "2px" } },
            cfg.enabled
              ? `${groupFlag ? "群内名士将自发唠嗑" : "名士会按时主动发来传讯"} · 连续未回最多 ${cfg.maxUnanswered} 条即停`
              : "支持定时、每日定点、沉默追问与离线重连补发（带防骚扰护栏）"
          )
        ),
        h("input", {
          type: "checkbox",
          checked: Boolean(cfg.enabled),
          onChange: (e) => update({ enabled: e.target.checked }),
          style: { width: "18px", height: "18px", cursor: "pointer" }
        })
      ),

      cfg.enabled &&
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "9px", paddingTop: "6px", borderTop: "1px dashed #E4E6E1" } },

        // 触发模式
        h(
          "div",
          { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" } },
          h("span", { style: { fontSize: "11.5px", fontWeight: 700, color: "#4C534E" } }, "模式："),
          [
            ["hybrid", "✨ 综合智能"],
            ["interval", "⏱ 固定间隔"],
            ["daily", "🌅 每日定点"],
            ["away", "💬 沉默追问"]
          ].map(([id, label]) =>
            h("button", { key: id, type: "button", style: pillStyle(cfg.mode === id), onClick: () => update({ mode: id }) }, label)
          )
        ),

        // 间隔分钟
        (cfg.mode === "interval" || cfg.mode === "hybrid") &&
        h(
          "div",
          { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" } },
          h("span", { style: { fontSize: "11.5px", color: "#555B57" } }, "间隔时长："),
          [30, 60, 120, 240].map((m) =>
            h(
              "button",
              { key: m, type: "button", style: pillStyle(Number(cfg.intervalMinutes) === m), onClick: () => update({ intervalMinutes: m }) },
              m < 60 ? `${m} 分钟` : `${m / 60} 小时`
            )
          )
        ),

        // 每日定点
        (cfg.mode === "daily" || cfg.mode === "hybrid") &&
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "5px" } },
          h("div", { style: { fontSize: "11.5px", color: "#555B57" } }, "每日定点（点击移除）："),
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" } },
            (cfg.dailyTimes || []).map((slot) =>
              h(
                "button",
                {
                  key: slot,
                  type: "button",
                  style: pillStyle(true),
                  onClick: () => update({ dailyTimes: (cfg.dailyTimes || []).filter((x) => x !== slot) })
                },
                `${slot} ✕`
              )
            ),
            h("input", {
              type: "time",
              value: newSlot,
              onChange: (e) => setNewSlot(e.target.value),
              style: { fontSize: "11.5px", padding: "2px 6px", borderRadius: "8px", border: "1px solid #D5D9D2" }
            }),
            h(
              "button",
              {
                type: "button",
                style: pillStyle(false),
                onClick: () => update({ dailyTimes: [...(cfg.dailyTimes || []), newSlot] })
              },
              "+ 添加"
            )
          )
        ),

        // 防骚扰护栏
        h(
          "div",
          { style: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", fontSize: "11.5px", color: "#555B57" } },
          h("span", null, "免打扰："),
          h("input", {
            type: "time",
            value: cfg.quietStart || "23:30",
            onChange: (e) => update({ quietStart: e.target.value }),
            style: { fontSize: "11.5px", padding: "2px 5px", borderRadius: "7px", border: "1px solid #D5D9D2" }
          }),
          h("span", null, "至"),
          h("input", {
            type: "time",
            value: cfg.quietEnd || "07:30",
            onChange: (e) => update({ quietEnd: e.target.value }),
            style: { fontSize: "11.5px", padding: "2px 5px", borderRadius: "7px", border: "1px solid #D5D9D2" }
          }),
          h("span", null, "· 未回上限"),
          h(
            "select",
            {
              value: cfg.maxUnanswered || 2,
              onChange: (e) => update({ maxUnanswered: Number(e.target.value) }),
              style: { fontSize: "11.5px", padding: "2px 5px", borderRadius: "7px", border: "1px solid #D5D9D2" }
            },
            [1, 2, 3, 5].map((n) => h("option", { key: n, value: n }, `${n} 条`))
          )
        ),

        // 离线补发 & 桌面通知
        h(
          "label",
          { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#434A45", cursor: "pointer" } },
          h("input", {
            type: "checkbox",
            checked: cfg.catchUpOnReturn !== false,
            onChange: (e) => update({ catchUpOnReturn: e.target.checked })
          }),
          "离线重连自动补发（关页久未上线，重新打开时自动补发 1 条问候）"
        ),
        h(
          "label",
          { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#434A45", cursor: "pointer" } },
          h("input", {
            type: "checkbox",
            checked: Boolean(cfg.browserNotify),
            onChange: async (e) => {
              if (e.target.checked) {
                const perm = await requestNotifyPermission();
                if (perm !== "granted") {
                  setTip("浏览器未授予通知权限，已仅保留站内红点提醒");
                  return;
                }
              }
              update({ browserNotify: e.target.checked });
            }
          }),
          "后台标签页弹出浏览器桌面通知（需授权）"
        ),

        // 立即试发按钮 + 提示
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
          h(
            "button",
            {
              type: "button",
              disabled: testing,
              onClick: async () => {
                setTesting(true);
                setTip("正在唤起名士主动发来一条传讯…");
                try {
                  const res = await fireForChat(cid, { chatData, isGroup: groupFlag, triggerKind: "manual_test", force: true });
                  setTip(res.ok ? `✅ 已收到 ${res.messages.length} 条主动传讯！返回聊天页查看` : `未触发：${res.reason}`);
                } catch (err) {
                  setTip("试发失败：" + err.message);
                } finally {
                  setTesting(false);
                }
              },
              style: {
                padding: "6px 12px",
                borderRadius: "9px",
                border: "1px solid #5E6756",
                background: "#F2F5EF",
                color: "#434E3B",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer"
              }
            },
            testing ? "生成中…" : "🕊️ 立即试发一条"
          ),
          tip && h("span", { style: { fontSize: "11px", color: "#5E6756" } }, tip)
        ),

        // Phase 2：云端锁屏真推送配置区（可选）
        h(
          "div",
          {
            style: {
              marginTop: "4px",
              padding: "9px 10px",
              borderRadius: "10px",
              background: "#F7F8F5",
              border: "1px dashed #CBD2C7",
              display: "flex",
              flexDirection: "column",
              gap: "7px"
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
            h(
              "label",
              { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "#364037", cursor: "pointer", flex: 1 } },
              h("input", {
                type: "checkbox",
                checked: Boolean(cfg.cloudEnabled),
                onChange: (e) => update({ cloudEnabled: e.target.checked })
              }),
              "☁️ 云端锁屏真推送（Cloudflare Worker，关网页也能收通知）"
            ),
            h(
              "button",
              {
                type: "button",
                title: "蒯越手把手教你配云端离线锁屏推送",
                onClick: (e) => {
                  e.stopPropagation();
                  setCloudGuideOpen(true);
                },
                style: {
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  border: "1px solid #9CB2A5",
                  background: "#EAF2EE",
                  color: "#233E34",
                  fontSize: "12px",
                  fontWeight: 800,
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
          cfg.cloudEnabled &&
            h(
              React.Fragment,
              null,
              h("input", {
                type: "text",
                placeholder: "Cloudflare Worker 地址（如 https://xxx.workers.dev）",
                value: cfg.cloudWorkerUrl || "",
                onChange: (e) => update({ cloudWorkerUrl: e.target.value }),
                style: { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: "8px", border: "1px solid #D5D9D2", fontSize: "11.5px" }
              }),
              h("input", {
                type: "text",
                placeholder: "推送地址：Bark (https://api.day.app/你的Key) 或 ntfy (https://ntfy.sh/你的主题)",
                value: cfg.cloudPushUrl || "",
                onChange: (e) => update({ cloudPushUrl: e.target.value }),
                style: { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: "8px", border: "1px solid #D5D9D2", fontSize: "11.5px" }
              }),
              h("input", {
                type: "password",
                placeholder: "安全口令 PROACTIVE_SECRET（可选，若 Worker 里配了则填）",
                value: cfg.cloudSecret || "",
                onChange: (e) => update({ cloudSecret: e.target.value }),
                style: { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: "8px", border: "1px solid #D5D9D2", fontSize: "11.5px" }
              }),
              h(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                h(
                  "button",
                  {
                    type: "button",
                    style: pillStyle(false),
                    onClick: async () => {
                      setTip("正在体检云端 Worker 状态…");
                      try {
                        const st = await checkCloudWorkerStatus(cfg.cloudWorkerUrl, cfg.cloudSecret);
                        setTip(st.kvBound ? `✅ 云端就绪（已同步 ${st.taskCount} 个角色，待收 ${st.inboxCount} 条）` : "⚠️ Worker 未绑定 PROACTIVE_KV 命名空间");
                      } catch (err) {
                        setTip("检测失败：" + err.message);
                      }
                    }
                  },
                  "🔍 检测状态"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    style: pillStyle(true),
                    onClick: async () => {
                      setTip("正在同步该角色计划到云端…");
                      try {
                        const r = await syncChatToCloud(cid, chatData, cfg);
                        setTip(`✅ 已同步到云端！当前云端守护 ${r.taskCount} 个会话`);
                      } catch (err) {
                        setTip("同步失败：" + err.message);
                      }
                    }
                  },
                  "☁️ 同步到云端"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    style: pillStyle(false),
                    onClick: async () => {
                      setTip("正在向手机发送测试锁屏通知…");
                      try {
                        await sendCloudTestPush(cfg.cloudWorkerUrl, cfg.cloudSecret, cfg.cloudPushUrl, chatData?.name || "名士");
                        setTip("✅ 测试推送已发出！请查看手机锁屏通知");
                      } catch (err) {
                        setTip("推送失败：" + err.message);
                      }
                    }
                  },
                  "📲 测试锁屏推送"
                )
              )
            )
        )
      ),
      h(KuaiYueCloudGuideModal, {
        isOpen: cloudGuideOpen,
        onClose: () => setCloudGuideOpen(false)
      })
    );
  }

  const api = {
    DB_NAME,
    CONFIG_EVENT,
    DELIVERED_EVENT,
    getConfigSync,
    hydrateConfig,
    saveConfig,
    getScheduleState,
    saveScheduleState,
    isInQuietHours,
    computeNextIntervalMs,
    evaluateTriggerEligibility,
    checkDueTrigger,
    recordUserActivity,
    buildProactiveMessages,
    parseGroupProactiveReplies,
    registerBridge,
    fireForChat,
    runTick,
    startScheduler,
    requestNotifyPermission,
    checkCloudWorkerStatus,
    syncChatToCloud,
    sendCloudTestPush,
    pullCloudInbox,
    ProactiveMsgSettingsCard,
    _resetForTests
  };

  global.ProactiveMsgEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof document !== "undefined") {
    // 浏览器环境自动启动轻量后台心跳调度
    startScheduler();
  }
})(typeof window !== "undefined" ? window : globalThis);

