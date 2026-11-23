/**
 * Ano-phone「📞 视频通话契机 · 主动来电 / 拒接 / 回拨 / 群聊互邀拒出镜」独立模块化引擎
 * - 复用独立 IndexedDB: milvus_video_call_idb (v3, 新增 call_invite_state 表，零 localStorage 写入)
 * - 支持 AI 文本协议标签 [[VIDEO_CALL_INVITE:理由]] / [[GROUP_VIDEO_INVITE:发起人|理由]]
 * - 四重防骚扰闸门：通话/振铃互斥锁、单会话 15 分钟冷却、免打扰时段拦截、每日主动来电上限
 * - 顶部悬浮来电横幅 + 可展开全屏振铃/呼叫 Portal (z-index: 99999) + Web Audio 柔和铃声
 * - 私聊拟真呼叫判定（第 2 次回拨强制接通）+ 群聊单次批量入场分流（3.5s 超时降级 + 保底人数）
 * - 群聊角色互邀引擎：支持用户或某名士邀请其他角色出镜，被邀者按 6 项人设决定露脸/仅语音/拒绝出镜
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_video_call_idb";
  const DB_VERSION = 3;
  const STORE_PREFS = "call_prefs";
  const STORE_STAGE_ASSETS = "char_stage_assets";
  const STORE_INVITE_STATE = "call_invite_state";
  const SAVED_EVENT = "milvus-video-call-record-saved";

  const COOLDOWN_MS = 15 * 60 * 1000;
  const CALLBACK_WINDOW_MS = 5 * 60 * 1000;
  const DEFAULT_DAILY_LIMIT = 3;
  const RING_TIMEOUT_SEC = 30;

  const QUICK_DECLINE_REASONS = [
    "现在不太方便接视频",
    "手头有点忙，晚点回你",
    "外面人多，先打字聊吧"
  ];

  // ==========================================
  // 1. 独立 IDB 存储（v3）+ Node 内存降级
  // ==========================================
  let _dbPromise = null;
  let _memInviteStates = new Map();

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
          if (!db.objectStoreNames.contains(STORE_PREFS)) {
            db.createObjectStore(STORE_PREFS, { keyPath: "key" });
          }
          if (!db.objectStoreNames.contains(STORE_STAGE_ASSETS)) {
            db.createObjectStore(STORE_STAGE_ASSETS, { keyPath: "charId" });
          }
          if (!db.objectStoreNames.contains(STORE_INVITE_STATE)) {
            db.createObjectStore(STORE_INVITE_STATE, { keyPath: "chatId" });
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

  function todayStr(now = Date.now()) {
    const d = new Date(now);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function loadInviteState(chatId) {
    const cid = String(chatId || "__global__");
    const db = await openDb();
    if (!db) {
      return _memInviteStates.get(cid) || {
        chatId: cid,
        lastInviteAt: 0,
        dailyDate: "",
        dailyCount: 0,
        lastOutgoingAt: 0,
        consecutiveAttempts: 0
      };
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_INVITE_STATE, "readonly");
        const req = tx.objectStore(STORE_INVITE_STATE).get(cid);
        req.onsuccess = () =>
          resolve(
            req.result || {
              chatId: cid,
              lastInviteAt: 0,
              dailyDate: "",
              dailyCount: 0,
              lastOutgoingAt: 0,
              consecutiveAttempts: 0
            }
          );
        req.onerror = () =>
          resolve({
            chatId: cid,
            lastInviteAt: 0,
            dailyDate: "",
            dailyCount: 0,
            lastOutgoingAt: 0,
            consecutiveAttempts: 0
          });
      } catch (e) {
        resolve({
          chatId: cid,
          lastInviteAt: 0,
          dailyDate: "",
          dailyCount: 0,
          lastOutgoingAt: 0,
          consecutiveAttempts: 0
        });
      }
    });
  }

  async function saveInviteState(chatId, patch) {
    const cid = String(chatId || "__global__");
    const cur = await loadInviteState(cid);
    const next = { ...cur, ...(patch || {}), chatId: cid, updatedAt: Date.now() };
    const db = await openDb();
    if (!db) {
      _memInviteStates.set(cid, next);
      return next;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_INVITE_STATE, "readwrite");
        tx.objectStore(STORE_INVITE_STATE).put(next);
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => resolve(next);
      } catch (e) {
        resolve(next);
      }
    });
  }

  function _resetForTests() {
    _memInviteStates = new Map();
    _ringState = { mode: "idle" };
    _activeCallBusy = false;
  }

  // ==========================================
  // 2. 协议标签解析 & 四重防骚扰闸门
  // ==========================================
  function extractInviteTag(rawText) {
    const src = String(rawText || "");
    if (!src) return { cleanText: "", invite: null };

    // 群聊来电标签：[[GROUP_VIDEO_INVITE:发起人|理由]] 或 [[GROUP_VIDEO_INVITE:理由]]
    const groupRe = /(?:\[\[|【【)\s*GROUP_VIDEO_INVITE\s*[:：]\s*([^\]】]+?)\s*(?:\]\]|】】)/i;
    const gm = src.match(groupRe);
    if (gm) {
      const payload = gm[1].trim();
      const parts = payload.split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
      const initiatorName = parts.length >= 2 ? parts[0] : "";
      const reason = parts.length >= 2 ? parts.slice(1).join(" ") : payload;
      const cleanText = src.replace(groupRe, "").replace(/\n{3,}/g, "\n\n").trim();
      return {
        cleanText,
        invite: { kind: "group", initiatorName, reason: reason || "邀你加入群视频会议" }
      };
    }

    // 私聊来电标签：[[VIDEO_CALL_INVITE:理由]]
    const soloRe = /(?:\[\[|【【)\s*VIDEO_CALL_INVITE\s*[:：]?\s*([^\]】]*?)\s*(?:\]\]|】】)/i;
    const sm = src.match(soloRe);
    if (sm) {
      const reason = (sm[1] || "").trim() || "想当面和你说句话";
      const cleanText = src.replace(soloRe, "").replace(/\n{3,}/g, "\n\n").trim();
      return {
        cleanText,
        invite: { kind: "solo", initiatorName: "", reason }
      };
    }

    return { cleanText: src, invite: null };
  }

  function isInQuietHours(nowMs, quietStart, quietEnd) {
    if (!quietStart || !quietEnd) return false;
    const parseMin = (hhmm) => {
      const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return -1;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    const s = parseMin(quietStart);
    const e = parseMin(quietEnd);
    if (s < 0 || e < 0 || s === e) return false;
    const d = new Date(nowMs);
    const cur = d.getHours() * 60 + d.getMinutes();
    return s < e ? cur >= s && cur < e : cur >= s || cur < e;
  }

  let _ringState = { mode: "idle" }; // "idle" | "incoming" | "outgoing"
  let _activeCallBusy = false;

  function setCallActiveBusy(flag) {
    _activeCallBusy = Boolean(flag);
  }

  function isBusy() {
    if (_activeCallBusy) return true;
    if (_ringState && _ringState.mode !== "idle") return true;
    if (typeof document !== "undefined" && document.querySelector(".vce-zoom-overlay.open")) return true;
    return false;
  }

  async function canTriggerIncomingCall(chatId, opts = {}) {
    const now = Number(opts.now) || Date.now();
    if (isBusy() && !opts.ignoreBusy) {
      return { allowed: false, reason: "busy" };
    }
    if (isInQuietHours(now, opts.quietStart, opts.quietEnd)) {
      return { allowed: false, reason: "quiet_hours" };
    }
    const st = await loadInviteState(chatId);
    const cooldownMs = Number(opts.cooldownMs) || COOLDOWN_MS;
    if (st.lastInviteAt && now - st.lastInviteAt < cooldownMs) {
      return { allowed: false, reason: "cooldown", remainingMs: cooldownMs - (now - st.lastInviteAt) };
    }
    const today = todayStr(now);
    const dailyLimit = Number(opts.dailyLimit) || DEFAULT_DAILY_LIMIT;
    const countToday = st.dailyDate === today ? Number(st.dailyCount || 0) : 0;
    if (countToday >= dailyLimit) {
      return { allowed: false, reason: "daily_limit" };
    }
    return { allowed: true, reason: "ok" };
  }

  async function markIncomingTriggered(chatId, now = Date.now()) {
    const st = await loadInviteState(chatId);
    const today = todayStr(now);
    const countToday = st.dailyDate === today ? Number(st.dailyCount || 0) : 0;
    return saveInviteState(chatId, {
      lastInviteAt: now,
      dailyDate: today,
      dailyCount: countToday + 1
    });
  }

  // ==========================================
  // 3. 复用主 LLM 轻量请求辅助函数
  // ==========================================
  function resolveMainLlmConfig() {
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
    if (!cfg || !cfg.url) return null;
    const base = String(cfg.url).trim().replace(/\/+$/, "");
    const endpoint = /\/chat\/completions$/i.test(base)
      ? base
      : cfg.type === "official"
      ? (/\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`)
      : (/\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/api/chat/completions`);
    return {
      endpoint,
      apiKey: cfg.apiKey || cfg.key || "",
      model: cfg.model || "gpt-4o-mini"
    };
  }

  async function callLightweightLlm(messages, { maxTokens = 240, temperature = 0.78, timeoutMs = 3500, customChatFn = null } = {}) {
    const invoke = async () => {
      if (typeof customChatFn === "function") return customChatFn(messages);
      const llm = resolveMainLlmConfig();
      if (!llm) throw new Error("NO_LLM_CONFIG");
      const headers = { "Content-Type": "application/json" };
      if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
      const resp = await fetch(llm.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: llm.model,
          messages,
          temperature,
          max_tokens: maxTokens
        })
      });
      if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
      const json = await resp.json();
      return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
    };

    if (!timeoutMs || timeoutMs <= 0) return invoke();
    return Promise.race([
      invoke(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("LLM_TIMEOUT")), timeoutMs))
    ]);
  }

  function extractJsonBlock(raw) {
    const cleaned = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1].trim() : cleaned;
    const startObj = body.indexOf("{");
    const startArr = body.indexOf("[");
    let start = -1;
    let end = -1;
    if (startArr >= 0 && (startObj < 0 || startArr < startObj)) {
      start = startArr;
      end = body.lastIndexOf("]");
    } else if (startObj >= 0) {
      start = startObj;
      end = body.lastIndexOf("}");
    }
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // 4. 私聊呼叫判定（含第 2 次回拨必接保底）
  // ==========================================
  async function decidePrivateOutgoingOutcome({ chatData, attemptCount = 1, recentContext = "", customChatFn = null } = {}) {
    const name = chatData?.name || "名士";
    // 防挫败保底：5 分钟内连续第 2 次回拨 100% 强制接通
    if (attemptCount >= 2) {
      return {
        accepted: true,
        openingAction: "轻叹一声，还是接起了你的回拨",
        openingLine: "罢了，你都打第二遍了，说吧，什么事？",
        declineReason: ""
      };
    }

    const pf = (chatData && chatData.profile) || {};
    const sys = [
      `你是「${name}」，对方正在向你发起视频通话。`,
      pf.mbti ? `MBTI：${pf.mbti}` : "",
      pf.personality ? `性格：${pf.personality}` : "",
      pf.style || pf.speakingStyle ? `语言风格：${pf.style || pf.speakingStyle}` : "",
      "绝大多数情况下（约 90%）你都会接起视频；仅当近期上下文明确处于激烈吵架、隐秘危急任务或你正在气头上时才可能拒接。",
      "严格输出单行 JSON，不要输出任何额外解释：",
      '{"accepted":true,"openingAction":"刚放下茶盏凑近镜头","openingLine":"怎么突然弹视频了？","declineReason":""}'
    ]
      .filter(Boolean)
      .join("\n");

    const userPrompt = recentContext
      ? `近期对话摘要：\n${String(recentContext).slice(-500)}\n\n现在对方给你打来视频通话，请立刻决定是否接通。`
      : "现在对方给你打来视频通话，请立刻决定是否接通。";

    try {
      const raw = await callLightweightLlm(
        [
          { role: "system", content: sys },
          { role: "user", content: userPrompt }
        ],
        { maxTokens: 160, timeoutMs: 2800, customChatFn }
      );
      const parsed = extractJsonBlock(raw);
      if (parsed && typeof parsed.accepted === "boolean") {
        return {
          accepted: parsed.accepted,
          openingAction: String(parsed.openingAction || "接通了视频画面").slice(0, 32),
          openingLine: String(parsed.openingLine || "").slice(0, 90),
          declineReason: String(parsed.declineReason || "现在不太方便接视频，晚点再说。").slice(0, 90)
        };
      }
    } catch (e) {}

    return {
      accepted: true,
      openingAction: "接通了视频画面",
      openingLine: "",
      declineReason: ""
    };
  }

  // ==========================================
  // 5. 群聊批量入场分流 + 保底机制 + 角色互邀拒出镜
  // ==========================================
  function buildLocalFallbackAttendance(members, initiatorName = "") {
    const list = Array.isArray(members) ? members : [];
    const states = {};
    list.forEach((m, idx) => {
      const id = String(m.id || `m_${idx}`);
      const isInit = initiatorName && m.name === initiatorName;
      if (isInit) {
        states[id] = { state: "joined_camera", reason: "发起本次群视频" };
        return;
      }
      const mbti = String(m.mbti || "").toUpperCase();
      const isIntrovert = mbti.startsWith("I");
      if (list.length >= 3 && isIntrovert && idx === list.length - 1) {
        states[id] = { state: "declined", reason: "手头有事，暂不出镜" };
      } else if (list.length >= 2 && isIntrovert && idx % 2 === 1) {
        states[id] = { state: "joined_audio_only", reason: "不便露面，仅开麦旁听" };
      } else {
        states[id] = { state: "joined_camera", reason: "已露脸接入" };
      }
    });
    return ensureGroupAttendanceFloor(list, states, initiatorName);
  }

  function ensureGroupAttendanceFloor(members, stateMap, initiatorName = "") {
    const list = Array.isArray(members) ? members : [];
    if (list.length === 0) return {};
    const out = { ...(stateMap || {}) };
    const validStates = new Set(["joined_camera", "joined_audio_only", "declined"]);

    for (const m of list) {
      const id = String(m.id);
      if (!out[id] || !validStates.has(out[id].state)) {
        out[id] = { state: "joined_camera", reason: "已接入视频" };
      }
      if (initiatorName && m.name === initiatorName) {
        out[id] = { state: "joined_camera", reason: out[id].reason || "发起本次群视频" };
      }
    }

    const joinedCount = list.filter((m) => out[String(m.id)].state !== "declined").length;
    const cameraCount = list.filter((m) => out[String(m.id)].state === "joined_camera").length;
    const minCamera = list.length >= 3 ? 2 : 1;

    if (joinedCount === 0 || cameraCount < minCamera) {
      let need = minCamera - cameraCount;
      for (const m of list) {
        if (need <= 0) break;
        const id = String(m.id);
        if (out[id].state !== "joined_camera") {
          out[id] = { state: "joined_camera", reason: "顺手接通了镜头" };
          need -= 1;
        }
      }
    }
    return out;
  }

  async function decideGroupInitialAttendance({ chatData, members = [], initiatorName = "", recentContext = "", customChatFn = null } = {}) {
    const list = Array.isArray(members) ? members : [];
    if (list.length === 0) return {};

    const memberBrief = list
      .map((m) => {
        const parts = [`id=${m.id}`, `姓名=${m.name}`];
        if (m.mbti) parts.push(`MBTI=${m.mbti}`);
        if (m.personality) parts.push(`性格=${String(m.personality).slice(0, 40)}`);
        if (m.speakingStyle) parts.push(`风格=${String(m.speakingStyle).slice(0, 30)}`);
        return `- ${parts.join(" | ")}`;
      })
      .join("\n");

    const sys = [
      `群聊「${chatData?.name || "群视频"}」正在开启视频会议${initiatorName ? `（由 ${initiatorName} 发起）` : ""}。`,
      "请根据每位群成员的人设（MBTI/性格/语言风格）与近期上下文，一次性判定谁会露脸出镜、谁只开麦不开摄像头、谁高冷/害羞/忙碌拒绝出镜。",
      "注意：绝大多数活跃/外向角色会 joined_camera；少数内向/忙碌/傲娇角色可以是 joined_audio_only 或 declined；至少保证 1~2 人 joined_camera。",
      "严格返回 JSON 数组，不要输出任何额外文字：",
      '[{"id":"成员id","state":"joined_camera|joined_audio_only|declined","reason":"12字以内符合人设的简短理由"}]'
    ].join("\n");

    const userPrompt = `群成员列表：\n${memberBrief}${recentContext ? `\n\n近期群聊：\n${String(recentContext).slice(-400)}` : ""}`;

    try {
      const raw = await callLightweightLlm(
        [
          { role: "system", content: sys },
          { role: "user", content: userPrompt }
        ],
        { maxTokens: 280, timeoutMs: 3500, customChatFn }
      );
      const arr = extractJsonBlock(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        const map = {};
        for (const item of arr) {
          if (!item || !item.id) continue;
          const hit = list.find((m) => String(m.id) === String(item.id) || m.name === item.name);
          if (!hit) continue;
          const st = ["joined_camera", "joined_audio_only", "declined"].includes(item.state) ? item.state : "joined_camera";
          map[String(hit.id)] = {
            state: st,
            reason: String(item.reason || "").slice(0, 28)
          };
        }
        return ensureGroupAttendanceFloor(list, map, initiatorName);
      }
    } catch (e) {}

    return buildLocalFallbackAttendance(list, initiatorName);
  }

  /**
   * 群聊会中拉人：用户或某已入场名士 A 邀请名士 B 出镜，B 按完整人设与关系决定露脸 / 仅语音 / 拒绝出镜
   */
  async function requestMemberInviteTurn({ inviter, target, chatData, transcript = [], userName = "主公", customChatFn = null } = {}) {
    if (!target) return null;
    const inviterIsMe = Boolean(inviter && inviter.isMe);
    const inviterName = inviterIsMe ? (userName || "主公") : (inviter?.name || "名士");

    const describeChar = (c) => {
      if (!c) return "";
      const ls = [`姓名：${c.name}`, `ID：${c.id}`];
      if (c.mbti) ls.push(`MBTI：${c.mbti}`);
      if (c.constellation) ls.push(`星座：${c.constellation}`);
      if (c.speakingStyle) ls.push(`语言风格：${c.speakingStyle}`);
      if (c.personality) ls.push(`性格：${c.personality}`);
      if (c.background) ls.push(`背景：${String(c.background).slice(0, 180)}`);
      return ls.join("；");
    };

    const recentLines = (transcript || [])
      .slice(-6)
      .map((t) => `${t.sender}: ${t.text}`)
      .join("\n");

    const sys = [
      `这是群聊「${chatData?.name || "群视频"}」的视频会议现场。`,
      inviterIsMe
        ? `用户「${inviterName}」正在点名邀请未露脸的「${target.name}」开启摄像头出镜。`
        : `已入场的「${inviterName}」正在点名邀请未露脸的「${target.name}」出镜。\n邀请人人设：${describeChar(inviter)}`,
      `被邀请人「${target.name}」完整人设：${describeChar(target)}`,
      "请严格结合双方人设与关系决定被邀请人的真实反应：",
      "- accept_camera：同意露脸出镜（可能是爽快答应，也可能是被催得没办法/看在主公面子上打开镜头）；",
      "- accept_audio：拒绝露脸但肯开麦说两句；",
      "- reject：继续拒绝出镜（如高冷、害羞、正在忙、嫌弃邀请人并回怼）。",
      "严格输出单行 JSON，不要额外解释：",
      '{"inviterLine":"邀请人喊话(若为用户亲自邀请可留空)","decision":"accept_camera|accept_audio|reject","targetAction":"10字以内动作神态","targetReply":"被邀请人符合人设的回应台词(45字内)"}'
    ].join("\n");

    const userPrompt = recentLines ? `刚才会议里的对话：\n${recentLines}\n\n请生成这次点名邀请与回应。` : "请生成这次点名邀请与回应。";

    try {
      const raw = await callLightweightLlm(
        [
          { role: "system", content: sys },
          { role: "user", content: userPrompt }
        ],
        { maxTokens: 240, timeoutMs: 8000, customChatFn }
      );
      const parsed = extractJsonBlock(raw);
      if (parsed && parsed.targetReply) {
        const decision = ["accept_camera", "accept_audio", "reject"].includes(parsed.decision) ? parsed.decision : "accept_camera";
        const nextState = decision === "accept_camera" ? "joined_camera" : decision === "accept_audio" ? "joined_audio_only" : "declined";
        return {
          inviterName,
          inviterIsMe,
          inviterLine: inviterIsMe ? "" : String(parsed.inviterLine || `${target.name}，别躲着了，快露个脸。`).slice(0, 70),
          decision,
          nextState,
          targetAction: String(parsed.targetAction || (decision === "reject" ? "直接拒掉了镜头邀请" : "调整了下镜头")).slice(0, 32),
          targetReply: String(parsed.targetReply).slice(0, 100)
        };
      }
    } catch (e) {}

    return {
      inviterName,
      inviterIsMe,
      inviterLine: inviterIsMe ? "" : `${target.name}，快把镜头打开，大家都在呢。`,
      decision: "accept_camera",
      nextState: "joined_camera",
      targetAction: "无奈打开了摄像头",
      targetReply: "行吧行吧，催什么催，这不是露脸了么。"
    };
  }

  // ==========================================
  // 6. Web Audio 柔和铃声（兼容移动端 Autoplay 限制）
  // ==========================================
  let _ringAudioCtx = null;
  let _ringToneTimer = null;

  function playRingPulse() {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([180, 120, 180]);
      }
    } catch (e) {}
    try {
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;
      if (!_ringAudioCtx) _ringAudioCtx = new AudioCtx();
      if (_ringAudioCtx.state === "suspended") {
        _ringAudioCtx.resume().catch(() => {});
      }
      if (_ringAudioCtx.state !== "running") return;
      const now = _ringAudioCtx.currentTime;
      const playTone = (freq, start, dur) => {
        const osc = _ringAudioCtx.createOscillator();
        const gain = _ringAudioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.06, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(_ringAudioCtx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      };
      playTone(523.25, now, 0.28);
      playTone(659.25, now + 0.32, 0.34);
    } catch (e) {}
  }

  function startRingtone() {
    stopRingtone();
    playRingPulse();
    _ringToneTimer = setInterval(playRingPulse, 2400);
  }

  function stopRingtone() {
    if (_ringToneTimer) {
      clearInterval(_ringToneTimer);
      _ringToneTimer = null;
    }
  }

  // ==========================================
  // 7. 传讯未接/拒接卡片落盘 + 性格化文字跟进
  // ==========================================
  async function recordCallOutcome({ chatData, isGroup = false, status = "missed", reason = "", initiatorName = "", isMe = false } = {}) {
    const cid = String(chatData?.id || "");
    if (!cid || !global.chatHistoryStore || typeof global.chatHistoryStore.appendMessage !== "function") return null;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const labelMap = {
      missed: "未接视频通话",
      rejected: "对方已拒绝",
      rejected_by_user: "已拒绝",
      canceled: "已取消"
    };
    const msg = {
      id: `vcall_evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      isMe: Boolean(isMe),
      sender: isMe ? (chatData?.profile?.userNickname || "我") : (initiatorName || chatData?.name || "名士"),
      senderId: isMe ? "me" : cid,
      type: "voice_call_record",
      callKind: "video",
      isGroupCall: Boolean(isGroup),
      status,
      durationText: "00:00",
      declineReason: String(reason || "").slice(0, 120),
      initiatorName: initiatorName || "",
      text: reason ? `${labelMap[status] || "视频通话"} · ${reason}` : (labelMap[status] || "视频通话"),
      dialogue: [],
      time: hhmm,
      timestamp: Date.now()
    };
    try {
      await global.chatHistoryStore.appendMessage(cid, msg);
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: { chatId: cid, record: msg, message: msg } }));
      }
    } catch (e) {}
    return msg;
  }

  async function appendCharacterTextMsg(chatData, isGroup, text, speakerName = "") {
    const cid = String(chatData?.id || "");
    if (!cid || !text || !global.chatHistoryStore || typeof global.chatHistoryStore.appendMessage !== "function") return null;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const msg = {
      id: `vcall_txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      isMe: false,
      sender: speakerName || chatData?.name || "名士",
      senderId: cid,
      text: String(text).trim(),
      time: hhmm,
      timestamp: Date.now()
    };
    try {
      await global.chatHistoryStore.appendMessage(cid, msg);
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: { chatId: cid, record: msg, message: msg } }));
      }
    } catch (e) {}
    return msg;
  }

  async function generateDeclineOrMissFollowUp({ chatData, isGroup, scenario, inviteReason, userDeclineReason, initiatorName }) {
    const speaker = initiatorName || chatData?.name || "名士";
    const pf = (chatData && chatData.profile) || {};
    const sys = [
      `你是「${speaker}」，刚才你给对方打了一通${isGroup ? "群" : ""}视频通话（来电原因：${inviteReason || "想见你"}）。`,
      pf.personality ? `性格：${pf.personality}` : "",
      pf.style || pf.speakingStyle ? `语言风格：${pf.style || pf.speakingStyle}` : "",
      scenario === "missed"
        ? "对方 30 秒没接通，请发 1 句简短自然的传讯留言（30字内，不要带引号和旁白）。"
        : `对方挂断了你的视频来电${userDeclineReason ? `，并回了一句「${userDeclineReason}」` : ""}。请发 1 句符合你人设的自然回复（35字内，不要带引号和旁白）。`
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const raw = await callLightweightLlm(
        [
          { role: "system", content: sys },
          { role: "user", content: "请发这条传讯消息。" }
        ],
        { maxTokens: 90, timeoutMs: 5000 }
      );
      const clean = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (clean) return clean.slice(0, 90);
    } catch (e) {}
    return scenario === "missed"
      ? "怎么没接呀，在忙吗？忙完给我回个视频。"
      : (userDeclineReason ? "好吧，那你先忙，回头有空再打给我。" : "挂得这么快……行吧，等你方便再聊。");
  }

  // ==========================================
  // 8. 来电横幅 & 全屏振铃 / 呼叫 Portal (z-index: 99999)
  // ==========================================
  let _portalEl = null;
  let _portalRoot = null;
  let _RingComp = null;
  let _styleInjected = false;
  let _outgoingAbortToken = 0;

  function ensureStylesInjected() {
    if (_styleInjected || typeof document === "undefined") return;
    _styleInjected = true;
    const style = document.createElement("style");
    style.id = "vcie-invite-styles";
    style.textContent = `
      .vcie-banner {
        position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
        width: min(94vw, 420px); z-index: 99999; box-sizing: border-box;
        background: rgba(20, 22, 29, 0.96); backdrop-filter: blur(14px);
        border: 1px solid rgba(255,255,255,0.16); border-radius: 18px;
        box-shadow: 0 14px 36px rgba(0,0,0,0.52); color: #F8FAFC;
        padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
        animation: vcieSlideDown 0.25s ease-out;
      }
      @keyframes vcieSlideDown {
        from { opacity: 0; transform: translate(-50%, -22px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
      .vcie-fullscreen {
        position: fixed; inset: 0; z-index: 99999;
        background: radial-gradient(circle at 50% 25%, #262B3A 0%, #111319 72%);
        color: #F8FAFC; display: flex; flex-direction: column; align-items: center; justify-content: space-between;
        padding: calc(48px + env(safe-area-inset-top, 0px)) 24px calc(36px + env(safe-area-inset-bottom, 0px));
        box-sizing: border-box;
      }
      .vcie-pulse-ring {
        width: 104px; height: 104px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: rgba(34, 197, 94, 0.16);
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
        animation: vciePulse 1.8s infinite;
      }
      @keyframes vciePulse {
        0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45); }
        70% { box-shadow: 0 0 0 24px rgba(34, 197, 94, 0); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
      }
      .vcie-btn-accept {
        border: none; border-radius: 999px; background: #22C55E; color: #FFFFFF;
        padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .vcie-btn-decline {
        border: none; border-radius: 999px; background: #DC2626; color: #FFFFFF;
        padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer;
      }
      .vcie-chip {
        border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.08); color: #E2E8F0;
        border-radius: 999px; padding: 6px 11px; font-size: 11.5px; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function createRingComponent() {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect } = React;

    return function RingOverlay({ st }) {
      const [expanded, setExpanded] = useState(Boolean(st.startExpanded));
      const [countdown, setCountdown] = useState(RING_TIMEOUT_SEC);
      const [showDeclineOpts, setShowDeclineOpts] = useState(false);
      const [customReason, setCustomReason] = useState("");

      useEffect(() => {
        if (st.mode !== "incoming") return;
        setCountdown(RING_TIMEOUT_SEC);
        const timer = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              clearInterval(timer);
              handleIncomingTimeout(st);
              return 0;
            }
            return c - 1;
          });
        }, 1000);
        return () => clearInterval(timer);
      }, [st.ringId, st.mode]);

      if (st.mode === "idle") return null;

      const title = st.isGroup
        ? `${st.chatData?.name || "群视频会议"}${st.initiatorName ? ` · ${st.initiatorName} 发起` : ""}`
        : (st.initiatorName || st.chatData?.name || "名士");

      if (st.mode === "outgoing") {
        return h(
          "div",
          { className: "vcie-fullscreen" },
          h(
            "div",
            { style: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" } },
            h(
              "div",
              { className: "vcie-pulse-ring" },
              h("span", { style: { fontSize: "40px" } }, st.isGroup ? "👥" : "📹")
            ),
            h("div", { style: { fontSize: "20px", fontWeight: 700 } }, title),
            h("div", { style: { fontSize: "13px", color: "#94A3B8" } }, st.statusText || (st.isGroup ? "正在呼叫群成员入镜…" : "正在等待对方接听视频…"))
          ),
          h(
            "button",
            { type: "button", className: "vcie-btn-decline", style: { padding: "12px 32px", fontSize: "14px" }, onClick: cancelOutgoingCall },
            "取消呼叫"
          )
        );
      }

      // incoming 模式：支持顶部悬浮横幅与全屏振铃切换
      if (!expanded) {
        return h(
          "div",
          { className: "vcie-banner" },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0, cursor: "pointer", flex: 1 }, onClick: () => setExpanded(true) },
              h("div", { style: { width: "40px", height: "40px", borderRadius: "50%", background: "rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 } }, st.isGroup ? "👥" : "📹"),
              h(
                "div",
                { style: { minWidth: 0 } },
                h("div", { style: { fontSize: "13.5px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, `${title} · 邀请你视频通话`),
                h("div", { style: { fontSize: "11.5px", color: "#CBD5E1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, `「${st.reason || "想当面和你说句话"}」 (${countdown}s)`)
              )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "6px", flexShrink: 0 } },
              h("button", { type: "button", className: "vcie-btn-decline", style: { padding: "7px 11px", fontSize: "12px" }, onClick: () => setShowDeclineOpts((v) => !v) }, "拒接"),
              h("button", { type: "button", className: "vcie-btn-accept", style: { padding: "7px 12px", fontSize: "12px" }, onClick: () => acceptIncomingCall(st) }, "接听")
            )
          ),
          showDeclineOpts &&
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "6px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "8px" } },
              h(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                h("button", { type: "button", className: "vcie-chip", style: { borderColor: "#EF4444", color: "#FCA5A5" }, onClick: () => declineIncomingCall(st, "") }, "直接挂断"),
                QUICK_DECLINE_REASONS.map((r) =>
                  h("button", { key: r, type: "button", className: "vcie-chip", onClick: () => declineIncomingCall(st, r) }, r)
                )
              ),
              h(
                "div",
                { style: { display: "flex", gap: "6px" } },
                h("input", {
                  type: "text",
                  placeholder: "自定义拒接理由…",
                  value: customReason,
                  onChange: (e) => setCustomReason(e.target.value),
                  style: { flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "999px", padding: "5px 10px", color: "#FFF", fontSize: "12px", outline: "none" }
                }),
                h("button", { type: "button", className: "vcie-btn-decline", style: { padding: "5px 11px", fontSize: "11.5px" }, onClick: () => declineIncomingCall(st, customReason.trim()) }, "挂断并回复")
              )
            )
        );
      }

      return h(
        "div",
        { className: "vcie-fullscreen" },
        h(
          "div",
          { style: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" } },
          h("button", { type: "button", className: "vcie-chip", onClick: () => setExpanded(false) }, "收起为横幅"),
          h("span", { style: { fontSize: "12px", color: "#94A3B8" } }, `${countdown}s 后未接挂断`)
        ),
        h(
          "div",
          { style: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" } },
          h("div", { className: "vcie-pulse-ring" }, h("span", { style: { fontSize: "42px" } }, st.isGroup ? "👥" : "📹")),
          h("div", { style: { fontSize: "22px", fontWeight: 700 } }, title),
          h("div", { style: { fontSize: "13.5px", color: "#E2E8F0", maxWidth: "300px", lineHeight: 1.5 } }, `“${st.reason || "想当面和你说句话"}”`)
        ),
        h(
          "div",
          { style: { width: "100%", maxWidth: "340px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" } },
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" } },
            QUICK_DECLINE_REASONS.map((r) =>
              h("button", { key: r, type: "button", className: "vcie-chip", onClick: () => declineIncomingCall(st, r) }, `挂断：${r}`)
            )
          ),
          h(
            "div",
            { style: { display: "flex", gap: "28px", marginTop: "8px" } },
            h("button", { type: "button", className: "vcie-btn-decline", style: { padding: "14px 30px", fontSize: "15px" }, onClick: () => declineIncomingCall(st, "") }, "挂断"),
            h("button", { type: "button", className: "vcie-btn-accept", style: { padding: "14px 30px", fontSize: "15px" }, onClick: () => acceptIncomingCall(st) }, "接听")
          )
        )
      );
    };
  }

  function renderRingPortal() {
    if (typeof document === "undefined" || !global.React || !global.ReactDOM) return;
    ensureStylesInjected();
    if (!_RingComp) _RingComp = createRingComponent();
    if (!_RingComp) return;
    if (!_portalEl) {
      _portalEl = document.createElement("div");
      _portalEl.id = "vcie-ring-portal-root";
      document.body.appendChild(_portalEl);
    }
    const el = _ringState.mode === "idle" ? null : global.React.createElement(_RingComp, { key: _ringState.ringId || "ring", st: { ..._ringState } });
    if (typeof global.ReactDOM.createRoot === "function") {
      if (!_portalRoot) _portalRoot = global.ReactDOM.createRoot(_portalEl);
      _portalRoot.render(el);
    } else if (typeof global.ReactDOM.render === "function") {
      global.ReactDOM.render(el, _portalEl);
    }
  }

  // ==========================================
  // 9. 核心对外动作：接收来电 / 接听 / 拒接 / 超时 / 主动呼叫与回拨
  // ==========================================
  async function receiveIncomingCall({
    chatData,
    isGroup = false,
    initiatorName = "",
    reason = "想当面和你说句话",
    triggerSource = "chat_tag",
    userAvatar = "",
    userName = "",
    quietStart = "",
    quietEnd = "",
    ignoreGate = false
  } = {}) {
    if (!chatData || !chatData.id) return { triggered: false, reason: "missing_chat" };
    const cid = String(chatData.id);
    if (!ignoreGate) {
      const gate = await canTriggerIncomingCall(cid, { quietStart, quietEnd });
      if (!gate.allowed) {
        // 通话中收到另一通来电：自动静默转为未接记录，不打断当前通话
        if (gate.reason === "busy") {
          await recordCallOutcome({ chatData, isGroup, status: "missed", reason: `通话中未接 · ${reason}`, initiatorName, isMe: false });
        }
        return { triggered: false, reason: gate.reason };
      }
      await markIncomingTriggered(cid);
    }

    _ringState = {
      mode: "incoming",
      ringId: `in_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      chatData,
      isGroup: Boolean(isGroup),
      initiatorName: initiatorName || (isGroup ? "" : chatData.name || "名士"),
      reason,
      triggerSource,
      userAvatar,
      userName: userName || chatData?.profile?.userNickname || "主公",
      startExpanded: false
    };
    startRingtone();
    renderRingPortal();
    return { triggered: true, reason: "ringing" };
  }

  async function acceptIncomingCall(st) {
    stopRingtone();
    _ringState = { mode: "idle" };
    renderRingPortal();

    const vce = global.VideoCallEngine;
    if (!vce || typeof vce.openCall !== "function") return;

    let initialMemberStates = null;
    if (st.isGroup) {
      const members = vce.normalizeParticipants(st.chatData, true);
      const enriched = typeof vce.enrichGroupMembers === "function" ? await vce.enrichGroupMembers(members, true) : members;
      initialMemberStates = await decideGroupInitialAttendance({
        chatData: st.chatData,
        members: enriched,
        initiatorName: st.initiatorName
      });
    }

    vce.openCall({
      chatData: st.chatData,
      isGroup: st.isGroup,
      userAvatar: st.userAvatar || "",
      userName: st.userName || "主公",
      callContext: {
        triggerSource: st.triggerSource || "incoming",
        inviteReason: st.reason || "",
        initiatorName: st.initiatorName || "",
        isCallback: false,
        initialMemberStates
      }
    });
  }

  async function declineIncomingCall(st, userReason = "") {
    stopRingtone();
    _ringState = { mode: "idle" };
    renderRingPortal();

    await recordCallOutcome({
      chatData: st.chatData,
      isGroup: st.isGroup,
      status: "rejected_by_user",
      reason: userReason,
      initiatorName: st.initiatorName,
      isMe: false
    });
    const followUp = await generateDeclineOrMissFollowUp({
      chatData: st.chatData,
      isGroup: st.isGroup,
      scenario: "declined",
      inviteReason: st.reason,
      userDeclineReason: userReason,
      initiatorName: st.initiatorName
    });
    if (followUp) {
      await appendCharacterTextMsg(st.chatData, st.isGroup, followUp, st.initiatorName || st.chatData?.name);
    }
  }

  async function handleIncomingTimeout(st) {
    if (_ringState.mode !== "incoming" || _ringState.ringId !== st.ringId) return;
    stopRingtone();
    _ringState = { mode: "idle" };
    renderRingPortal();

    await recordCallOutcome({
      chatData: st.chatData,
      isGroup: st.isGroup,
      status: "missed",
      reason: st.reason,
      initiatorName: st.initiatorName,
      isMe: false
    });
    const followUp = await generateDeclineOrMissFollowUp({
      chatData: st.chatData,
      isGroup: st.isGroup,
      scenario: "missed",
      inviteReason: st.reason,
      initiatorName: st.initiatorName
    });
    if (followUp) {
      await appendCharacterTextMsg(st.chatData, st.isGroup, followUp, st.initiatorName || st.chatData?.name);
    }
  }

  function cancelOutgoingCall() {
    _outgoingAbortToken += 1;
    const prev = _ringState;
    stopRingtone();
    _ringState = { mode: "idle" };
    renderRingPortal();
    if (prev && prev.mode === "outgoing" && prev.chatData) {
      recordCallOutcome({
        chatData: prev.chatData,
        isGroup: prev.isGroup,
        status: "canceled",
        reason: "",
        isMe: true
      });
    }
  }

  async function startOutgoingCall({ chatData, isGroup = false, userAvatar = "", userName = "主公", isCallback = false, skipRinging = false } = {}) {
    const vce = global.VideoCallEngine;
    if (!vce || typeof vce.openCall !== "function" || !chatData) return;

    const cid = String(chatData.id || "");
    const prefs = typeof vce.loadPrefs === "function" ? await vce.loadPrefs() : {};
    const useRinging = !skipRinging && prefs.realisticRinging !== false;

    if (!useRinging) {
      vce.openCall({
        chatData,
        isGroup,
        userAvatar,
        userName,
        callContext: { triggerSource: isCallback ? "callback" : "user", isCallback }
      });
      return;
    }

    const token = ++_outgoingAbortToken;
    const now = Date.now();
    const st = await loadInviteState(cid);
    const withinWindow = st.lastOutgoingAt && now - st.lastOutgoingAt < CALLBACK_WINDOW_MS;
    const attemptCount = withinWindow ? Number(st.consecutiveAttempts || 0) + 1 : 1;
    await saveInviteState(cid, { lastOutgoingAt: now, consecutiveAttempts: attemptCount });

    _ringState = {
      mode: "outgoing",
      ringId: `out_${token}`,
      chatData,
      isGroup: Boolean(isGroup),
      initiatorName: "",
      statusText: isGroup ? "正在呼叫群成员入镜…" : (isCallback ? "正在回拨视频通话…" : "正在等待对方接听视频…")
    };
    startRingtone();
    renderRingPortal();

    const minDelay = new Promise((r) => setTimeout(r, 1500));

    if (isGroup) {
      const members = vce.normalizeParticipants(chatData, true);
      const enriched = typeof vce.enrichGroupMembers === "function" ? await vce.enrichGroupMembers(members, true) : members;
      const [memberStates] = await Promise.all([
        decideGroupInitialAttendance({ chatData, members: enriched, initiatorName: "" }),
        minDelay
      ]);
      if (token !== _outgoingAbortToken) return;
      stopRingtone();
      _ringState = { mode: "idle" };
      renderRingPortal();
      vce.openCall({
        chatData,
        isGroup: true,
        userAvatar,
        userName,
        callContext: {
          triggerSource: isCallback ? "callback" : "user",
          isCallback,
          initialMemberStates: memberStates
        }
      });
      return;
    }

    const [outcome] = await Promise.all([
      decidePrivateOutgoingOutcome({ chatData, attemptCount }),
      minDelay
    ]);
    if (token !== _outgoingAbortToken) return;
    stopRingtone();
    _ringState = { mode: "idle" };
    renderRingPortal();

    if (!outcome.accepted) {
      await recordCallOutcome({
        chatData,
        isGroup: false,
        status: "rejected",
        reason: outcome.declineReason,
        isMe: true
      });
      if (outcome.declineReason) {
        await appendCharacterTextMsg(chatData, false, outcome.declineReason, chatData.name);
      }
      return;
    }

    await saveInviteState(cid, { consecutiveAttempts: 0 });
    vce.openCall({
      chatData,
      isGroup: false,
      userAvatar,
      userName,
      callContext: {
        triggerSource: isCallback ? "callback" : "user",
        isCallback,
        openingAction: outcome.openingAction,
        openingLine: outcome.openingLine
      }
    });
  }

  /**
   * 监听 AI 回复文本：若检测到 [[VIDEO_CALL_INVITE:...]] 标签，返回剥离后的干净文本并按闸门触发来电横幅
   */
  async function inspectAiReplyForInvite(chatData, rawText, opts = {}) {
    const parsed = extractInviteTag(rawText);
    if (!parsed.invite) return { cleanText: parsed.cleanText, triggered: false };
    const isGroup = Boolean(
      opts.isGroup ||
        parsed.invite.kind === "group" ||
        chatData?.isGroup ||
        chatData?.type === "group" ||
        String(chatData?.id || "").startsWith("group_chat")
    );
    const res = await receiveIncomingCall({
      chatData,
      isGroup,
      initiatorName: parsed.invite.initiatorName,
      reason: parsed.invite.reason,
      triggerSource: "chat_tag",
      userAvatar: opts.userAvatar || "",
      userName: opts.userName || ""
    });
    return { cleanText: parsed.cleanText, triggered: res.triggered, gateReason: res.reason };
  }

  const api = {
    DB_NAME,
    COOLDOWN_MS,
    DEFAULT_DAILY_LIMIT,
    QUICK_DECLINE_REASONS,
    extractInviteTag,
    isInQuietHours,
    isBusy,
    setCallActiveBusy,
    canTriggerIncomingCall,
    loadInviteState,
    saveInviteState,
    decidePrivateOutgoingOutcome,
    decideGroupInitialAttendance,
    ensureGroupAttendanceFloor,
    requestMemberInviteTurn,
    receiveIncomingCall,
    startOutgoingCall,
    cancelOutgoingCall,
    inspectAiReplyForInvite,
    recordCallOutcome,
    _resetForTests
  };

  global.VideoCallInviteEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

