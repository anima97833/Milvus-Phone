/**
 * Ano-phone「📹 传讯视频通话（Zoom 会议室风格 · 私聊 & 群聊）」独立模块化引擎
 * - 独立 IndexedDB: milvus_video_call_idb (零 localStorage 写入)
 * - 经典 Zoom 深色会议室 UI：画廊/演讲者视图、发言亮绿框 (#22C55E)、实时字幕、飘屏反应、会议聊天抽屉
 * - 真实前置摄像头镜像预览 + 按轮 Canvas 640px 抓拍多模态视觉 + 不支持视觉模型自动纯文本降级
 * - 复用 VoiceStudioEngine TTS 朗读与浏览器语音识别；挂断自动生成视频会议纪要写入 chatHistoryStore
 * - 自挂载独立 DOM Portal (z-index: 99990)，极轻量埋点接入 Milvus/app.min.js
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_video_call_idb";
  const DB_VERSION = 3;
  const STORE_PREFS = "call_prefs";
  const STORE_STAGE_ASSETS = "char_stage_assets";
  const STORE_INVITE_STATE = "call_invite_state";
  const SAVED_EVENT = "milvus-video-call-record-saved";

  const DEFAULT_PREFS = {
    layoutMode: "speaker", // 私聊默认全屏名士大图 + 右上角竖屏自拍画中画；可切换 "gallery" 上下等大画廊
    sendCameraSnapshot: true,
    ttsEnabled: true,
    showSubtitles: true,
    selfVirtualBgId: "none",
    selfBgBlur: 0,
    realisticRinging: true
  };

  const VIRTUAL_BG_PRESETS = [
    { id: "none", label: "原画面", css: "linear-gradient(145deg, #23262E 0%, #191B21 100%)" },
    { id: "guangling", label: "广陵暖灯书房", css: "radial-gradient(circle at 25% 20%, rgba(251,191,36,0.28), transparent 55%), linear-gradient(155deg, #2D221B 0%, #1C1714 55%, #12100E 100%)" },
    { id: "xiliang", label: "西凉大漠落日", css: "radial-gradient(circle at 75% 22%, rgba(234,88,12,0.42), transparent 52%), linear-gradient(175deg, #431F18 0%, #2B1A19 52%, #181417 100%)" },
    { id: "bamboo", label: "竹林烟雨", css: "radial-gradient(circle at 30% 18%, rgba(74,222,128,0.22), transparent 55%), linear-gradient(160deg, #162A24 0%, #172321 55%, #111819 100%)" },
    { id: "starry", label: "深夜星河", css: "radial-gradient(circle at 70% 15%, rgba(99,102,241,0.34), transparent 50%), radial-gradient(circle at 20% 80%, rgba(56,189,248,0.2), transparent 48%), linear-gradient(160deg, #0F172A 0%, #1E1B4B 60%, #090D16 100%)" },
    { id: "office", label: "极简会议室", css: "radial-gradient(circle at 50% 0%, rgba(148,163,184,0.22), transparent 60%), linear-gradient(180deg, #334155 0%, #1E293B 60%, #0F172A 100%)" }
  ];

  const REACTIONS = [
    { id: "clap", icon: "👏", label: "鼓掌" },
    { id: "heart", icon: "❤️", label: "比心" },
    { id: "laugh", icon: "😂", label: "大笑" },
    { id: "thumb", icon: "👍", label: "赞同" },
    { id: "hand", icon: "✋", label: "举手" }
  ];

  // ==========================================
  // 1. 偏好存储（IndexedDB + Node 内存适配器）
  // ==========================================
  let _dbPromise = null;
  let _memPrefs = null;
  let _memStageAssets = new Map();
  let _prefsCache = null;

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

  async function loadStageAsset(charId) {
    const cid = String(charId || "");
    if (!cid) return null;
    const db = await openDb();
    if (!db) return _memStageAssets.get(cid) || null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_STAGE_ASSETS, "readonly");
        const req = tx.objectStore(STORE_STAGE_ASSETS).get(cid);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function saveStageAsset(charId, patch) {
    const cid = String(charId || "");
    if (!cid) return null;
    const cur = (await loadStageAsset(cid)) || {
      charId: cid,
      portraitBlob: null,
      portraitScale: 100,
      portraitOffsetY: 0,
      bgPresetId: "none",
      bgBlob: null,
      bgBlur: 0
    };
    const next = { ...cur, ...(patch || {}), charId: cid, updatedAt: Date.now() };
    const db = await openDb();
    if (!db) {
      _memStageAssets.set(cid, next);
      return next;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_STAGE_ASSETS, "readwrite");
        tx.objectStore(STORE_STAGE_ASSETS).put(next);
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => resolve(next);
      } catch (e) {
        resolve(next);
      }
    });
  }

  async function clearStageAsset(charId) {
    const cid = String(charId || "");
    if (!cid) return true;
    const db = await openDb();
    if (!db) {
      _memStageAssets.delete(cid);
      return true;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_STAGE_ASSETS, "readwrite");
        tx.objectStore(STORE_STAGE_ASSETS).delete(cid);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async function loadPrefs() {
    if (_prefsCache) return { ...DEFAULT_PREFS, ..._prefsCache };
    const db = await openDb();
    if (!db) {
      _prefsCache = { ...DEFAULT_PREFS, ...(_memPrefs || {}) };
      return { ..._prefsCache };
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PREFS, "readonly");
        const req = tx.objectStore(STORE_PREFS).get("main");
        req.onsuccess = () => {
          _prefsCache = { ...DEFAULT_PREFS, ...(req.result?.value || {}) };
          resolve({ ..._prefsCache });
        };
        req.onerror = () => {
          _prefsCache = { ...DEFAULT_PREFS };
          resolve({ ..._prefsCache });
        };
      } catch (e) {
        _prefsCache = { ...DEFAULT_PREFS };
        resolve({ ..._prefsCache });
      }
    });
  }

  async function savePrefs(patch) {
    const cur = await loadPrefs();
    const next = { ...cur, ...(patch || {}) };
    _prefsCache = next;
    const db = await openDb();
    if (!db) {
      _memPrefs = next;
      return next;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_PREFS, "readwrite");
        tx.objectStore(STORE_PREFS).put({ key: "main", value: next, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => resolve(next);
      } catch (e) {
        resolve(next);
      }
    });
  }

  function _resetForTests() {
    _memPrefs = null;
    _memStageAssets = new Map();
    _prefsCache = null;
  }

  /**
   * 群聊 Zoom 4 格分页算法（每页最多 pageSize 格，默认 4 格）
   */
  function paginateTiles(allTiles, page = 0, pageSize = 4) {
    const list = Array.isArray(allTiles) ? allTiles : [];
    const size = Math.max(1, Math.floor(Number(pageSize) || 4));
    const totalPages = Math.max(1, Math.ceil(list.length / size));
    const safePage = Math.max(0, Math.min(totalPages - 1, Math.floor(Number(page) || 0)));
    const start = safePage * size;
    return {
      page: safePage,
      totalPages,
      items: list.slice(start, start + size)
    };
  }

  // ==========================================
  // 2. 摄像头 Canvas 抓拍 & 多模态视觉自动降级
  // ==========================================
  function fitSnapshotSize(sourceWidth, sourceHeight, maxEdge = 640) {
    const w = Math.floor(Number(sourceWidth));
    const h = Math.floor(Number(sourceHeight));
    const limit = Math.max(160, Math.min(1280, Math.floor(Number(maxEdge) || 640)));
    if (w <= 0 || h <= 0) return null;
    const scale = Math.min(1, limit / Math.max(w, h));
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale))
    };
  }

  function captureCameraSnapshot(videoEl, maxEdge = 640, quality = 0.76) {
    if (!videoEl || typeof document === "undefined") return null;
    if (videoEl.readyState < 2) return null;
    const size = fitSnapshotSize(videoEl.videoWidth, videoEl.videoHeight, maxEdge);
    if (!size) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    // 镜像翻转，确保模型看到的与用户自拍预览完全一致
    ctx.translate(size.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, 0, 0, size.width, size.height);
    return canvas.toDataURL("image/jpeg", Math.max(0.55, Math.min(0.86, quality)));
  }

  function isVisionUnsupportedError(err) {
    const msg = err instanceof Error ? err.message : String(err || "");
    return /image_url|image input|vision|multimodal|multi-modal|unsupported[^\n]*image|does not support[^\n]*image|unknown variant[^\n]*image|content[^\n]*array|invalid.*content/i.test(
      msg
    );
  }

  function attachSnapshotToLastUser(messages, snapshotDataUrl) {
    if (!snapshotDataUrl || !String(snapshotDataUrl).startsWith("data:image/")) return [...messages];
    let targetIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i] && messages[i].role === "user") {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx < 0) return [...messages];
    return messages.map((m, i) => {
      if (i !== targetIdx) return m;
      const txt = typeof m.content === "string" ? m.content : "（随附当前视频通话画面一帧）";
      return {
        ...m,
        content: [
          { type: "text", text: txt },
          { type: "image_url", image_url: { url: snapshotDataUrl } }
        ]
      };
    });
  }

  // ==========================================
  // 3. 私聊 & 群聊视频会议 Prompt 与解析器
  // ==========================================
  function normalizeParticipants(chatData, isGroup) {
    const rawMembers =
      (Array.isArray(chatData?.profile?.members) && chatData.profile.members.length > 0 && chatData.profile.members) ||
      (Array.isArray(chatData?.members) && chatData.members.length > 0 && chatData.members) ||
      [];
    const userNick = chatData?.profile?.userNickname || "";
    const filteredMembers = rawMembers.filter(
      (m) => m && (m.name || m.id) && m.name !== "我" && m.id !== "me" && !m.isMe && (!userNick || m.name !== userNick)
    );
    if (isGroup && filteredMembers.length > 0) {
      // 不截断人数，全部群成员均可翻页出镜（Zoom 每页最多 4 格）
      return filteredMembers.map((m, idx) => {
        const pf = m.profile || {};
        return {
          id: String(m.id || `member_${idx}`),
          name: m.name || pf.name || `名士${idx + 1}`,
          avatar: m.avatar || pf.avatar || "",
          mbti: pf.mbti || m.mbti || "",
          constellation: pf.constellation || m.constellation || "",
          speakingStyle: pf.style || pf.speakingStyle || m.style || m.speakingStyle || "",
          personality: pf.personality || m.personality || "",
          background: pf.background || pf.description || m.background || ""
        };
      });
    }
    const pf = (chatData && chatData.profile) || {};
    return [
      {
        id: String(chatData?.id || "char_solo"),
        name: chatData?.name || pf.name || "名士",
        avatar: chatData?.avatar || pf.avatar || "",
        mbti: pf.mbti || chatData?.mbti || "",
        constellation: pf.constellation || chatData?.constellation || "",
        speakingStyle: pf.style || pf.speakingStyle || chatData?.style || chatData?.speakingStyle || "",
        personality: pf.personality || chatData?.personality || "",
        background: pf.background || pf.description || chatData?.background || ""
      }
    ];
  }

  /**
   * 群聊成员补全：回查 t8_chat_db / chat_characters 与 user_settings(role_avatar_*)，补齐每位名士的高清头像与完整 6 项人设
   */
  async function enrichGroupMembers(participants, isGroup) {
    if (!isGroup || !Array.isArray(participants) || participants.length === 0) return participants;
    let allChars = [];
    const customAvatars = {};
    try {
      if (typeof global.openDB === "function") {
        const db = await global.openDB();
        if (db && db.objectStoreNames && db.objectStoreNames.contains("chat_characters")) {
          allChars = await new Promise((resolve) => {
            try {
              const tx = db.transaction("chat_characters", "readonly");
              const req = tx.objectStore("chat_characters").getAll();
              req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
              req.onerror = () => resolve([]);
            } catch (e) {
              resolve([]);
            }
          });
        }
        if (db && db.objectStoreNames && db.objectStoreNames.contains("user_settings")) {
          await Promise.all(
            participants.map(
              (p) =>
                new Promise((resolve) => {
                  try {
                    const tx = db.transaction("user_settings", "readonly");
                    const req = tx.objectStore("user_settings").get(`role_avatar_${p.id}`);
                    req.onsuccess = () => {
                      const val = req.result && req.result.value;
                      if (val) customAvatars[String(p.id)] = val;
                      resolve();
                    };
                    req.onerror = () => resolve();
                  } catch (e) {
                    resolve();
                  }
                })
            )
          );
        }
      }
    } catch (e) {}

    return participants.map((p) => {
      const hit = allChars.find((c) => String(c.id) === String(p.id) || (c.name && c.name === p.name));
      const pf = (hit && hit.profile) || {};
      const customAv = customAvatars[String(p.id)] || (hit && customAvatars[String(hit.id)]) || "";
      return {
        ...p,
        avatar: customAv || p.avatar || (hit && hit.avatar) || pf.avatar || "",
        mbti: p.mbti || pf.mbti || (hit && hit.mbti) || "",
        constellation: p.constellation || pf.constellation || (hit && hit.constellation) || "",
        speakingStyle: p.speakingStyle || pf.style || pf.speakingStyle || (hit && (hit.style || hit.speakingStyle)) || "",
        personality: p.personality || pf.personality || (hit && hit.personality) || "",
        background: p.background || pf.background || pf.description || (hit && hit.background) || ""
      };
    });
  }

  /**
   * 汇总 5 维完整设定：角色完整配置（含 MBTI/星座/语言风格/性格/背景/文档）+ 身份配置库 + 开启的世界书 + 传讯近期主线上下文
   */
  async function loadFullRoleplayBundle(chatData, isGroup, participants) {
    const cid = String(chatData?.id || "");
    const enrichedParticipants = await enrichGroupMembers(participants, isGroup);

    // 1. 角色完整配置块（群聊逐位补全完整 6 项人设）
    const charBlocks = [];
    for (const p of enrichedParticipants) {
      const lines = [`- 角色姓名：${p.name}`, `- 角色 ID：${p.id}`];
      if (p.mbti) lines.push(`- MBTI 性格类型：${p.mbti}`);
      if (p.constellation) lines.push(`- 星座：${p.constellation}`);
      if (p.speakingStyle) lines.push(`- 语言风格：${p.speakingStyle}`);
      if (p.personality) lines.push(`- 性格特点：${p.personality}`);
      if (p.background) lines.push(`- 个人背景：${String(p.background).slice(0, isGroup ? 220 : 650)}`);
      if (!isGroup && p.id && global.characterDocStore && typeof global.characterDocStore.getEnabledDocContext === "function") {
        try {
          const docCtx = await global.characterDocStore.getEnabledDocContext(p.id);
          if (docCtx && docCtx.trim()) lines.push(`- 角色专属设定摘录：${docCtx.trim().slice(0, 500)}`);
        } catch (e) {}
      }
      charBlocks.push(lines.join("\n"));
    }

    // 2. 用户在「设置 - 身份配置库」中选择的设定
    let userPersonaBlock = "";
    let resolvedUserName = chatData?.profile?.userNickname || "主公";
    try {
      const personas = JSON.parse((global.localStorage && global.localStorage.getItem("user_personas")) || "[]");
      const activePid = global.localStorage && global.localStorage.getItem("active_persona_id");
      const activeUser = Array.isArray(personas)
        ? (personas.find((u) => String(u.id) === String(activePid)) || personas[0])
        : null;
      if (activeUser) {
        if (activeUser.name) resolvedUserName = activeUser.name;
        const uLines = [`- 用户姓名：${activeUser.name || resolvedUserName}`];
        if (activeUser.gender) uLines.push(`- 性别：${activeUser.gender}`);
        if (activeUser.age) uLines.push(`- 年龄：${activeUser.age}`);
        if (activeUser.personality) uLines.push(`- 性格：${activeUser.personality}`);
        if (activeUser.background) uLines.push(`- 背景：${String(activeUser.background).slice(0, 400)}`);
        if (activeUser.style) uLines.push(`- 说话风格：${activeUser.style}`);
        userPersonaBlock = `【用户身份配置库设定】\n${uLines.join("\n")}`;
      }
    } catch (e) {}

    // 3. 用户在「设置 - 世界书设置」中开启的世界书条目
    let worldBookBlock = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = global.getWorldBookContext();
        if (wb && String(wb).trim()) {
          worldBookBlock = `【已开启的世界书条目】\n${String(wb).trim().slice(0, 1800)}`;
        }
      }
    } catch (e) {}

    // 4. 传讯主线中角色与该用户的近期上下文（最近 16 条）
    let recentChatHistory = [];
    if (cid && global.chatHistoryStore) {
      try {
        if (typeof global.chatHistoryStore.getRecentMessages === "function") {
          const arr = await global.chatHistoryStore.getRecentMessages(cid, 16);
          if (Array.isArray(arr)) recentChatHistory = arr;
        } else if (typeof global.chatHistoryStore.getMessages === "function") {
          const arr = await global.chatHistoryStore.getMessages(cid);
          if (Array.isArray(arr)) recentChatHistory = arr.slice(-16);
        }
      } catch (e) {}
    }

    return {
      enrichedParticipants,
      charProfileBlock: charBlocks.join("\n\n"),
      userPersonaBlock,
      worldBookBlock,
      recentChatHistory,
      resolvedUserName
    };
  }

  function buildVideoCallMessages({
    chatData,
    isGroup,
    participants,
    callTranscript = [],
    recentChatHistory = [],
    roleplayBundle = null,
    userInput = "",
    userName = "主公",
    hasSnapshot = false,
    isWhiteboard = false
  }) {
    const finalUserName = (roleplayBundle && roleplayBundle.resolvedUserName) || userName || "主公";
    const srcHistory = (roleplayBundle && Array.isArray(roleplayBundle.recentChatHistory) && roleplayBundle.recentChatHistory.length > 0)
      ? roleplayBundle.recentChatHistory
      : recentChatHistory;

    const historyRef = (srcHistory || [])
      .slice(-16)
      .map((m) => {
        const who = m.isMe ? finalUserName : (m.sender || chatData?.name || "名士");
        let txt = String(m.text || m.content || "");
        if (global.ChatTranslationEngine && typeof global.ChatTranslationEngine.stripBilingualForHistory === "function") {
          txt = global.ChatTranslationEngine.stripBilingualForHistory(txt, "original");
        }
        txt = txt.replace(/\s+/g, " ").trim().slice(0, 140);
        return txt ? `${who}：${txt}` : "";
      })
      .filter(Boolean)
      .join("\n");

    const visionNote = isWhiteboard
      ? "\n【会议白板画作】用户在视频会议的白板上亲手涂写了一幅画作或文字（见附带图片）。请务必仔细辨认白板上的图案、形状或手写字，结合你的角色性格做出生动有趣的猜测、夸奖或吐槽！"
      : hasSnapshot
      ? "\n【实时视频画面】用户开启了摄像头，本轮消息附带了用户此刻的视频画面截图（可能带有虚拟背景）。请务必结合你看到的真实画面（表情、穿搭、举起的物件、背景）自然互动与点评，但切勿机械说出“你发了一张图片”。"
      : "";

    const fallbackProfile = participants
      .map((p) => `- ${p.name} (ID:${p.id})${p.mbti ? ` | MBTI:${p.mbti}` : ""}${p.constellation ? ` | 星座:${p.constellation}` : ""}${p.speakingStyle ? ` | 语言风格:${p.speakingStyle}` : ""}${p.personality ? ` | 性格:${p.personality}` : ""}${p.background ? ` | 背景:${String(p.background).slice(0, 240)}` : ""}`)
      .join("\n");
    const charBlock = (roleplayBundle && roleplayBundle.charProfileBlock) || fallbackProfile;
    const personaBlock = (roleplayBundle && roleplayBundle.userPersonaBlock) || "";
    const wbBlock = (roleplayBundle && roleplayBundle.worldBookBlock) || "";

    let sysPrompt = "";
    if (isGroup) {
      sysPrompt = `你们正在进行一场多人「视频会议通话」（群聊：${chatData?.name || "群聊"}，参会者包含 ${finalUserName} 与下列名士）。
必须 100% 严格贴合每位名士的完整角色配置、用户身份设定与已开启世界书，严禁 OOC！

【参会名士完整角色配置】
${charBlock}
${personaBlock ? `\n${personaBlock}` : ""}
${wbBlock ? `\n${wbBlock}` : ""}${visionNote}

【视频会议回复规范】
1. 让 1~3 位最适合接话的名士依次发言，每条独占一行，严格采用格式：
   [名士名字] (简短镜头神态/动作，6~16字): 自然口语台词（1~2句）
2. 口吻必须完全符合各名士的语言风格、性格与背景，像真人开视频会那样自然接茬、回应 ${finalUserName}。
3. 严禁输出多余解释或 markdown 标记。`;
    } else {
      const p = participants[0] || { name: "名士" };
      sysPrompt = `你正在扮演【${p.name}】，此刻正与【${finalUserName}】面对面「视频通话」中。
你的每一句台词、神态与称呼都必须 100% 严格恪守以下完整设定，严禁变成机械客服腔或 OOC！

【你的完整角色配置】
${charBlock}
${personaBlock ? `\n${personaBlock}` : ""}
${wbBlock ? `\n${wbBlock}` : ""}${visionNote}

【视频通话回复规范】
1. 请严格按如下单行格式回复：
   (简短镜头神态或动作，6~18字) 自然口语台词（1~3句，像隔着屏幕看着对方说话）
2. 充分延续你们在传讯主线里的关系与语气，不要写长篇小说旁白。`;
    }

    const msgs = [{ role: "system", content: sysPrompt }];
    if (historyRef) {
      msgs.push({ role: "system", content: `【传讯主线近期对话上下文】\n${historyRef}` });
    }
    for (const turn of callTranscript.slice(-14)) {
      msgs.push({
        role: turn.isMe ? "user" : "assistant",
        content: turn.isMe ? turn.text : (isGroup ? `[${turn.sender}] (${turn.action || "看着镜头"}): ${turn.text}` : `(${turn.action || "看着镜头"}) ${turn.text}`)
      });
    }
    msgs.push({
      role: "user",
      content: userInput || "（看着镜头等你开口）"
    });
    return msgs;
  }

  function parseVideoReplies(rawText, participants = [], isGroup = false) {
    const cleaned = String(rawText || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!cleaned) return [];
    const fallback = participants[0] || { id: "solo", name: "名士", avatar: "" };

    if (!isGroup) {
      const m = cleaned.match(/^[（(]([^）)]{2,36})[）)]\s*([\s\S]+)$/);
      if (m) {
        return [{ speakerId: fallback.id, sender: fallback.name, avatar: fallback.avatar, action: m[1].trim(), text: m[2].trim() }];
      }
      return [{ speakerId: fallback.id, sender: fallback.name, avatar: fallback.avatar, action: "看着镜头", text: cleaned }];
    }

    const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const gm = line.match(/^[\[【]([^\]】]{1,18})[\]】]\s*(?:[（(]([^）)]{2,36})[）)])?\s*[:：]\s*(.+)$/);
      if (gm) {
        const name = gm[1].trim();
        const action = (gm[2] || "看着镜头").trim();
        const text = gm[3].trim();
        const matched = participants.find((p) => p.name === name) || { id: `m_${name}`, name, avatar: "" };
        if (text) out.push({ speakerId: matched.id, sender: matched.name, avatar: matched.avatar, action, text });
      } else {
        out.push({ speakerId: fallback.id, sender: fallback.name, avatar: fallback.avatar, action: "看着镜头", text: line });
      }
    }
    return out.slice(0, 3);
  }

  // ==========================================
  // 4. LLM 调用（复用主 API + 自动视觉降级）& 纪要落盘
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

  async function requestVideoTurnLlm(baseMessages, snapshotDataUrl = null, opts = {}) {
    const invoke = async (msgs) => {
      if (typeof opts.customChatFn === "function") return opts.customChatFn(msgs);
      const llm = resolveMainLlmConfig();
      if (!llm) throw new Error("未检测到主 API 配置，请先在设置中配置 API");
      const headers = { "Content-Type": "application/json" };
      if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
      const resp = await fetch(llm.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: llm.model,
          messages: msgs,
          temperature: 0.82,
          max_tokens: 360
        })
      });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
      }
      const json = await resp.json();
      return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
    };

    if (snapshotDataUrl) {
      const visionMsgs = attachSnapshotToLastUser(baseMessages, snapshotDataUrl);
      try {
        const reply = await invoke(visionMsgs);
        return { reply, visionUsed: true, downgraded: false };
      } catch (err) {
        if (isVisionUnsupportedError(err)) {
          const reply = await invoke(baseMessages);
          return { reply, visionUsed: false, downgraded: true };
        }
        throw err;
      }
    }
    const reply = await invoke(baseMessages);
    return { reply, visionUsed: false, downgraded: false };
  }

  function formatDurationMMSS(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function buildCallRecordMessage({ chatId, durationSec, transcript, isGroup }) {
    const durStr = formatDurationMMSS(durationSec);
    const now = new Date();
    return {
      id: Date.now(),
      type: "voice_call_record",
      callKind: "video",
      status: "completed",
      duration: durationSec,
      durationText: durStr,
      durationStr: durStr,
      text: `📹 ${isGroup ? "群视频会议" : "视频通话"}已结束 · 时长 ${durStr}（共 ${transcript.length} 句对白）`,
      dialogue: transcript.map((t) => ({
        isMe: Boolean(t.isMe),
        sender: t.sender || "",
        text: t.action && !t.isMe ? `(${t.action}) ${t.text}` : t.text
      })),
      isMe: true,
      isGroupCall: Boolean(isGroup),
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
  }

  async function saveCallRecord(chatId, record) {
    const cid = String(chatId || "");
    if (!cid || !record) return;
    if (global.chatHistoryStore && typeof global.chatHistoryStore.appendMessage === "function") {
      try {
        await global.chatHistoryStore.appendMessage(cid, record);
      } catch (e) {}
    }
    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: { chatId: cid, record } }));
      }
    } catch (e) {}
  }

  // ==========================================
  // 5. 全屏 Zoom 会议室 UI（自挂载独立 Portal）
  // ==========================================
  let _portalRoot = null;
  let _portalEl = null;
  let _callState = { open: false, chatData: null, isGroup: false, userAvatar: "", userName: "主公" };

  function isRenderableImgUrl(url) {
    if (!url || typeof url !== "string") return false;
    const s = url.trim();
    if (!s || s.startsWith("idb:")) return false;
    return /^(?:https?:\/\/|data:image\/|blob:|\/|\.\/)/i.test(s);
  }

  async function resolveAvatarUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "";
    const s = rawUrl.trim();
    if (isRenderableImgUrl(s)) return s;
    if (!s.startsWith("idb:")) return "";
    const key = s.slice(4);
    try {
      if (global.avatarStore && typeof global.avatarStore.get === "function") {
        const res = await global.avatarStore.get(key);
        const val = typeof res === "string" ? res : (res && (res.data || res.url || res.value));
        if (isRenderableImgUrl(val)) return val;
      }
      if (typeof global.openDB === "function") {
        const db = await global.openDB();
        if (db && db.objectStoreNames && db.objectStoreNames.contains("avatars")) {
          const val = await new Promise((resolve) => {
            try {
              const tx = db.transaction("avatars", "readonly");
              const req = tx.objectStore("avatars").get(key);
              req.onsuccess = () => {
                const r = req.result;
                resolve(typeof r === "string" ? r : (r && (r.data || r.url || r.value)) || "");
              };
              req.onerror = () => resolve("");
            } catch (e) {
              resolve("");
            }
          });
          if (isRenderableImgUrl(val)) return val;
        }
      }
    } catch (e) {}
    return "";
  }

  function ensureStylesInjected() {
    if (typeof document === "undefined") return;
    if (document.getElementById("vce-zoom-styles")) return;
    const style = document.createElement("style");
    style.id = "vce-zoom-styles";
    style.textContent = `
      .vce-zoom-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: #141518; color: #F1F5F9;
        display: flex; flex-direction: column; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
      }
      .vce-topbar {
        height: 48px; padding: 0 14px; flex-shrink: 0;
        background: rgba(24, 25, 29, 0.96); border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .vce-pill-btn {
        border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.07); color: #E2E8F0;
        border-radius: 8px; padding: 4px 9px; font-size: 11.5px; cursor: pointer;
        display: inline-flex; align-items: center; gap: 4px;
      }
      .vce-pill-btn:hover { background: rgba(255,255,255,0.14); }
      .vce-stage-wrap { flex: 1; min-height: 0; width: 100%; display: flex; flex-direction: column; position: relative; overflow: hidden; }
      .vce-grid {
        flex: 1; min-height: 0; width: 100%; box-sizing: border-box;
        padding: 10px; display: grid; gap: 10px;
        align-content: stretch; justify-content: stretch; overflow-y: auto;
      }
      .vce-solo-stage {
        flex: 1; min-height: 0; width: 100%; position: relative; padding: 10px; box-sizing: border-box;
        display: flex; flex-direction: column;
      }
      .vce-pip-self {
        position: absolute; top: 18px; right: 18px;
        width: clamp(102px, 28vw, 148px); aspect-ratio: 3 / 4;
        border-radius: 14px; overflow: hidden; z-index: 6;
        background: linear-gradient(145deg, #282C36 0%, #1B1D24 100%);
        border: 2px solid rgba(255,255,255,0.22);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
        display: flex; align-items: center; justify-content: center;
      }
      .vce-pip-self.speaking { border-color: #22C55E; }
      .vce-tile {
        position: relative; border-radius: 16px; overflow: hidden; width: 100%; height: 100%;
        background: linear-gradient(145deg, #23262E 0%, #191B21 100%);
        border: 2.5px solid rgba(255,255,255,0.08);
        display: flex; align-items: center; justify-content: center;
        min-height: 170px; transition: border-color 0.2s, box-shadow 0.2s;
      }
      .vce-tile.speaking {
        border-color: #22C55E;
        box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.28), 0 8px 24px rgba(0, 0, 0, 0.4);
      }
      .vce-avatar-circle {
        width: 88px; height: 88px; aspect-ratio: 1 / 1; flex-shrink: 0;
        border-radius: 50%; object-fit: cover;
        border: 2.5px solid rgba(255,255,255,0.24); box-shadow: 0 6px 20px rgba(0,0,0,0.45);
      }
      .vce-avatar-small {
        width: 52px; height: 52px; aspect-ratio: 1 / 1; flex-shrink: 0;
        border-radius: 50%; object-fit: cover;
        border: 2px solid rgba(255,255,255,0.24);
      }
      .vce-nameplate {
        position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px);
        background: rgba(0, 0, 0, 0.64); backdrop-filter: blur(6px);
        padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 600;
        display: inline-flex; align-items: center; gap: 5px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .vce-action-badge {
        position: absolute; top: 10px; left: 10px; max-width: calc(100% - 20px);
        background: rgba(0, 0, 0, 0.58); padding: 3px 9px; border-radius: 999px;
        font-size: 11px; color: #E2E8F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .vce-subtitle-bar {
        position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%);
        width: min(94%, 560px); box-sizing: border-box; padding: 8px 13px; border-radius: 12px;
        background: rgba(12, 13, 16, 0.84); backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.12); text-align: center;
        font-size: 13px; line-height: 1.5; color: #FFFFFF; z-index: 7;
      }
      .vce-float-emoji {
        position: absolute; right: 20px; bottom: 70px; font-size: 32px;
        animation: vceFloatUp 1.8s ease-out forwards; pointer-events: none; z-index: 8;
      }
      @keyframes vceFloatUp {
        0% { opacity: 0; transform: translateY(10px) scale(0.7); }
        20% { opacity: 1; transform: translateY(-10px) scale(1.1); }
        100% { opacity: 0; transform: translateY(-110px) scale(0.95); }
      }
      .vce-chat-drawer {
        position: absolute; left: 0; right: 0; bottom: 0; height: 52%; max-height: 420px;
        background: rgba(25, 27, 34, 0.97); backdrop-filter: blur(12px);
        border-top: 1px solid rgba(255,255,255,0.14); border-radius: 16px 16px 0 0;
        box-shadow: 0 -10px 30px rgba(0,0,0,0.48);
        display: flex; flex-direction: column; z-index: 15;
      }
      .vce-quick-bar {
        padding: 7px 10px; background: rgba(24, 26, 31, 0.96);
        border-top: 1px solid rgba(255,255,255,0.08);
        display: flex; align-items: center; gap: 7px; flex-shrink: 0;
      }
      .vce-controls {
        padding: 8px 10px calc(10px + env(safe-area-inset-bottom, 0px));
        background: rgba(18, 19, 23, 0.99); border-top: 1px solid rgba(255,255,255,0.08);
        display: flex; align-items: center; gap: 8px; flex-shrink: 0;
        width: 100%; box-sizing: border-box;
      }
      .vce-controls-scroll {
        flex: 1; min-width: 0;
        display: flex; align-items: center; gap: 6px;
        overflow-x: auto; overflow-y: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        touch-action: pan-x;
        padding: 1px 2px;
      }
      .vce-controls-scroll::-webkit-scrollbar { display: none; }
      .vce-ctrl-btn {
        min-width: 50px; padding: 6px 8px; border-radius: 10px; border: none;
        background: rgba(255,255,255,0.07); color: #E2E8F0; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 10.5px;
        flex-shrink: 0; white-space: nowrap;
      }
      .vce-ctrl-btn:hover { background: rgba(255,255,255,0.14); }
      .vce-ctrl-btn.active { background: rgba(34, 197, 94, 0.22); color: #86EFAC; }
      .vce-leave-btn {
        padding: 9px 14px; border-radius: 10px; border: none;
        background: #DC2626; color: #FFFFFF; font-size: 12.5px; font-weight: 700; cursor: pointer;
        flex-shrink: 0; white-space: nowrap;
        box-shadow: -8px 0 14px rgba(18, 19, 23, 0.92);
      }
      .vce-leave-btn:hover { background: #B91C1C; }
    `;
    document.head.appendChild(style);
  }

  function createZoomModalComponent() {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    return function ZoomVideoCallModal({ state, onClose }) {
      const chatData = state.chatData || {};
      const cid = String(chatData.id || "");
      const isGroup = Boolean(state.isGroup || chatData.isGroup || chatData.type === "group" || cid.startsWith("group_chat"));
      const participants = normalizeParticipants(chatData, isGroup);
      const callContext = state.callContext || {};

      const buildInitialStates = (list) => {
        const init = callContext.initialMemberStates || {};
        const out = {};
        for (const m of list) {
          const id = String(m.id);
          out[id] = init[id] || { state: "joined_camera", reason: "" };
        }
        return out;
      };

      const initialSpeaker =
        (callContext.initiatorName && participants.find((p) => p.name === callContext.initiatorName)) ||
        participants[0] || { id: "solo", name: "名士" };
      const initialAction = callContext.openingAction || (callContext.inviteReason ? `因「${callContext.inviteReason}」发起了视频` : "已接入视频会议");
      const initialText =
        callContext.openingLine ||
        (callContext.inviteReason ? `总算接通了——${callContext.inviteReason}。` : "画面接通啦，能看清我吗？");

      const [elapsedSec, setElapsedSec] = useState(0);
      const [prefs, setPrefs] = useState(DEFAULT_PREFS);
      const [cameraOn, setCameraOn] = useState(false);
      const [micListening, setMicListening] = useState(false);
      const [chatOpen, setChatOpen] = useState(false);
      const [whiteboardOpen, setWhiteboardOpen] = useState(false);
      const [stageStudioOpen, setStageStudioOpen] = useState(false);
      const [membersDrawerOpen, setMembersDrawerOpen] = useState(false);
      const [memberStates, setMemberStates] = useState(() => buildInitialStates(participants));
      const [inviterChoice, setInviterChoice] = useState("__me__");
      const [invitingTargetId, setInvitingTargetId] = useState("");
      const [studioTab, setStudioTab] = useState("opponent"); // "opponent" | "self"
      const [studioCharId, setStudioCharId] = useState(participants[0]?.id || "");
      const [galleryPage, setGalleryPage] = useState(0);
      const [enrichedList, setEnrichedList] = useState(participants);
      const [stageAssets, setStageAssets] = useState({}); // { [charId]: { portraitUrl, portraitScale, portraitOffsetY, bgPresetId, bgUrl, bgBlur } }
      const [reactMenuOpen, setReactMenuOpen] = useState(false);
      const [inputText, setInputText] = useState("");
      const [busy, setBusy] = useState(false);
      const [statusToast, setStatusToast] = useState("");
      const [activeSpeakerId, setActiveSpeakerId] = useState(initialSpeaker.id || "");
      const [actionsBySpeaker, setActionsBySpeaker] = useState({});
      const [currentSubtitle, setCurrentSubtitle] = useState({ sender: initialSpeaker.name || "名士", action: initialAction, text: initialText });
      const [transcript, setTranscript] = useState([]);
      const [floats, setFloats] = useState([]);
      const [resolvedAvatars, setResolvedAvatars] = useState({});

      const videoRef = useRef(null);
      const streamRef = useRef(null);
      const roleplayBundleRef = useRef(null);
      const blobUrlsRef = useRef([]);

      const revokeAllBlobUrls = () => {
        for (const u of blobUrlsRef.current) {
          try { URL.revokeObjectURL(u); } catch (e) {}
        }
        blobUrlsRef.current = [];
      };

      const reloadStageAssets = async (memberList) => {
        const ids = ["__self__", ...memberList.map((m) => m.id)];
        const entries = await Promise.all(ids.map((id) => loadStageAsset(id).then((a) => [id, a])));
        const next = {};
        for (const [id, rec] of entries) {
          if (!rec) continue;
          let portraitUrl = "";
          let bgUrl = "";
          if (rec.portraitBlob && typeof URL !== "undefined" && URL.createObjectURL) {
            portraitUrl = URL.createObjectURL(rec.portraitBlob);
            blobUrlsRef.current.push(portraitUrl);
          }
          if (rec.bgBlob && typeof URL !== "undefined" && URL.createObjectURL) {
            bgUrl = URL.createObjectURL(rec.bgBlob);
            blobUrlsRef.current.push(bgUrl);
          }
          next[id] = {
            portraitUrl,
            portraitScale: Number(rec.portraitScale) || 100,
            portraitOffsetY: Number(rec.portraitOffsetY) || 0,
            bgPresetId: rec.bgPresetId || "none",
            bgUrl,
            bgBlur: Number(rec.bgBlur) || 0
          };
        }
        setStageAssets(next);
      };

      // 解析 idb: 头像为真实可渲染 URL，避免 ERR_UNKNOWN_URL_SCHEME
      useEffect(() => {
        if (!state.open) return;
        let alive = true;
        const mapTasks = [
          resolveAvatarUrl(state.userAvatar).then((u) => ["__me__", u]),
          ...enrichedList.map((p) => resolveAvatarUrl(p.avatar).then((u) => [p.id, u]))
        ];
        Promise.all(mapTasks).then((pairs) => {
          if (!alive) return;
          const next = {};
          for (const [k, v] of pairs) if (v) next[k] = v;
          setResolvedAvatars(next);
        });
        return () => { alive = false; };
      }, [state.open, cid, state.userAvatar, enrichedList]);

      const stopCameraStream = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => {
            try { t.stop(); } catch (e) {}
          });
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setCameraOn(false);
      };

      // 初始化：加载偏好、5维完整设定（含群成员头像与人设补全）、加载自定义出镜素材、启动计时器
      useEffect(() => {
        if (!state.open) return;
        setGalleryPage(0);
        setStudioCharId(participants[0]?.id || "");
        loadPrefs().then((p) => setPrefs(p));
        loadFullRoleplayBundle(chatData, isGroup, participants).then((bundle) => {
          roleplayBundleRef.current = bundle;
          const fullMembers = bundle.enrichedParticipants || participants;
          setEnrichedList(fullMembers);
          reloadStageAssets(fullMembers);
        }).catch(() => {
          setEnrichedList(participants);
          reloadStageAssets(participants);
        });
        const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
        return () => {
          clearInterval(timer);
          stopCameraStream();
          revokeAllBlobUrls();
        };
      }, [state.open, cid]);

      // 当切换视图（画中画 <-> 画廊）且摄像头开启时，重新绑定 MediaStream 到新挂载的 <video>
      useEffect(() => {
        if (cameraOn && streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(() => {});
        }
      }, [cameraOn, prefs.layoutMode]);

      if (!state.open) return null;

      const flashToast = (msg) => {
        setStatusToast(msg);
        setTimeout(() => setStatusToast((cur) => (cur === msg ? "" : cur)), 3200);
      };

      const toggleCamera = async () => {
        if (cameraOn) {
          stopCameraStream();
          return;
        }
        if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          flashToast("当前浏览器不支持摄像头访问，已保持头像参会模式");
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
          streamRef.current = stream;
          setCameraOn(true);
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play().catch(() => {});
            }
          }, 50);
        } catch (err) {
          flashToast("未获得摄像头权限（或需 HTTPS），已自动保持头像模式");
        }
      };

      const triggerVoiceInput = () => {
        const vse = global.VoiceStudioEngine;
        if (vse && typeof vse.startCallSpeechCapture === "function") {
          setMicListening(true);
          vse.startCallSpeechCapture({
            onResult: (spoken) => {
              setMicListening(false);
              if (spoken && spoken.trim()) handleSendTurn(spoken.trim());
            },
            onError: () => {
              setMicListening(false);
              flashToast("语音识别未听清，可在聊天栏直接输入");
            },
            onEnd: () => setMicListening(false)
          });
          return;
        }
        const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
        if (!SR) {
          setChatOpen(true);
          flashToast("当前浏览器不支持直接语音识别，请在右侧聊天栏打字");
          return;
        }
        try {
          const rec = new SR();
          rec.lang = "zh-CN";
          rec.interimResults = false;
          setMicListening(true);
          rec.onresult = (e) => {
            const spoken = e.results?.[0]?.[0]?.transcript || "";
            setMicListening(false);
            if (spoken.trim()) handleSendTurn(spoken.trim());
          };
          rec.onerror = () => {
            setMicListening(false);
            flashToast("语音识别未听清，可在聊天栏直接输入");
          };
          rec.onend = () => setMicListening(false);
          rec.start();
        } catch (e) {
          setMicListening(false);
        }
      };

      const playTtsIfEnabled = async (speakerId, text) => {
        if (!prefs.ttsEnabled || !text) return;
        const vse = global.VoiceStudioEngine;
        if (!vse) return;
        const targetId = speakerId || (chatData && chatData.id);
        try {
          if (typeof vse.speakForCharacter === "function") {
            await vse.speakForCharacter(targetId, text, { msgKey: `vcall_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
          } else if (typeof vse.playTextForCharacter === "function" && (!vse.hasVoiceForCharacter || vse.hasVoiceForCharacter(targetId))) {
            await vse.playTextForCharacter(text, targetId, { msgKey: `vcall_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
          }
        } catch (e) {}
      };

      useEffect(() => {
        const vse = global.VoiceStudioEngine;
        if (vse && typeof vse.hasVoiceForCharacter === "function") {
          const anyVoiced = (participants || []).some((p) => vse.hasVoiceForCharacter(p && p.id)) || (chatData && vse.hasVoiceForCharacter(chatData.id));
          if (anyVoiced) {
            try { vse.primeVoiceAudio && vse.primeVoiceAudio(); } catch (_) {}
            if (typeof vse.requestMicPermission === "function") {
              vse.requestMicPermission().catch(() => {});
            }
          }
        }
        return () => {
          try { global.VoiceStudioEngine && global.VoiceStudioEngine.stopPlayback && global.VoiceStudioEngine.stopPlayback(); } catch (_) {}
        };
      }, []);

      const handleSendTurn = async (textOverride, extraOpts = {}) => {
        const wbUrl = extraOpts.whiteboardDataUrl || null;
        const msg = String(textOverride !== undefined ? textOverride : inputText).trim();
        if (busy) return;
        if (!msg && !isGroup && !wbUrl) return;
        setInputText("");
        setBusy(true);

        if (global.VoiceStudioEngine && typeof global.VoiceStudioEngine.primeVoiceAudio === "function") {
          try { global.VoiceStudioEngine.primeVoiceAudio(); } catch (e) {}
        }

        const displayUserText = wbUrl ? (msg ? `🖍️ [白板画作] ${msg}` : "🖍️ [发来一幅白板画作，请你辨认]") : msg;
        const nextTranscript = displayUserText
          ? [...transcript, { isMe: true, sender: state.userName || "主公", text: displayUserText }]
          : [...transcript];
        if (displayUserText) setTranscript(nextTranscript);

        // 白板优先用白板图；否则若开启摄像头且允许画面抓拍，截取发送瞬间的 640px 帧
        const snapshot = wbUrl || (cameraOn && prefs.sendCameraSnapshot && videoRef.current ? captureCameraSnapshot(videoRef.current) : null);
        const activeMembers = enrichedList.length > 0 ? enrichedList : participants;

        try {
          if (!roleplayBundleRef.current) {
            roleplayBundleRef.current = await loadFullRoleplayBundle(chatData, isGroup, activeMembers);
          }
          const llmMsgs = buildVideoCallMessages({
            chatData,
            isGroup,
            participants: activeMembers,
            callTranscript: nextTranscript.slice(0, displayUserText ? -1 : undefined),
            roleplayBundle: roleplayBundleRef.current,
            userInput: displayUserText || "（众人继续在视频会议里自然讨论几句）",
            userName: state.userName || "主公",
            hasSnapshot: Boolean(snapshot),
            isWhiteboard: Boolean(wbUrl)
          });

          const res = await requestVideoTurnLlm(llmMsgs, snapshot);
          if (res.downgraded) {
            flashToast(wbUrl ? "当前所选模型不支持看图辨认白板，请切换支持视觉的模型" : "当前模型不支持画面识别，已自动切换为纯文字视频通话");
          }
          const replies = parseVideoReplies(res.reply, activeMembers, isGroup);
          for (let i = 0; i < replies.length; i++) {
            const rep = replies[i];
            setActiveSpeakerId(rep.speakerId);
            setActionsBySpeaker((prev) => ({ ...prev, [rep.speakerId]: rep.action }));
            setCurrentSubtitle({ sender: rep.sender, action: rep.action, text: rep.text });
            setTranscript((prev) => [...prev, { isMe: false, sender: rep.sender, action: rep.action, text: rep.text }]);
            await playTtsIfEnabled(rep.speakerId, rep.text);
            if (i < replies.length - 1) {
              await new Promise((r) => setTimeout(r, 900));
            }
          }
        } catch (err) {
          flashToast("通话回复失败：" + (err.message || "网络异常"));
        } finally {
          setBusy(false);
        }
      };

      const sendReaction = (r) => {
        setReactMenuOpen(false);
        const fid = Date.now() + Math.random();
        setFloats((prev) => [...prev, { id: fid, icon: r.icon }]);
        setTimeout(() => setFloats((prev) => prev.filter((x) => x.id !== fid)), 1850);
        handleSendTurn(`（在视频会议里发出了 ${r.icon} ${r.label} 反应）`);
      };

      const handleHangUp = async () => {
        stopCameraStream();
        if (cid) {
          const rec = buildCallRecordMessage({ chatId: cid, durationSec: elapsedSec, transcript, isGroup });
          await saveCallRecord(cid, rec);
        }
        onClose();
      };

      // 辅助：渲染名士三层合成视频格（身后背景 + 出镜图片/头像 + Zoom 铭牌与动作）
      const activeMembers = enrichedList.length > 0 ? enrichedList : participants;
      const getBgCss = (presetId) => {
        const found = VIRTUAL_BG_PRESETS.find((x) => x.id === presetId);
        return (found && found.css) || VIRTUAL_BG_PRESETS[0].css;
      };

      const renderMemberTile = (p, isFullSolo = false) => {
        const isSpeaking = p.id === activeSpeakerId;
        const act = actionsBySpeaker[p.id] || (isSpeaking && busy ? "正在组织语言…" : "");
        const safeAvatar = resolvedAvatars[p.id] || (isRenderableImgUrl(p.avatar) ? p.avatar : "");
        const asset = stageAssets[p.id] || {};
        const bgBlurPx = Number(asset.bgBlur) || 0;
        const bgStyle = asset.bgUrl
          ? {
              position: "absolute",
              inset: "-10px",
              backgroundImage: `url(${asset.bgUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: bgBlurPx > 0 ? `blur(${bgBlurPx}px)` : "none"
            }
          : {
              position: "absolute",
              inset: 0,
              background: getBgCss(asset.bgPresetId || "none")
            };

        const mStateRec = isGroup ? memberStates[String(p.id)] : null;
        const isAudioOnly = Boolean(isGroup && mStateRec && mStateRec.state === "joined_audio_only");

        return h(
          "div",
          { key: p.id, className: `vce-tile ${isSpeaking ? "speaking" : ""}`, style: isFullSolo ? { flex: 1 } : undefined },
          h("div", { style: bgStyle }),
          !isAudioOnly && asset.portraitUrl
            ? h("img", {
                src: asset.portraitUrl,
                alt: p.name,
                style: {
                  position: "relative",
                  zIndex: 2,
                  maxWidth: "92%",
                  maxHeight: "94%",
                  objectFit: "contain",
                  transform: `translateY(${asset.portraitOffsetY || 0}%) scale(${(asset.portraitScale || 100) / 100})`,
                  pointerEvents: "none"
                }
              })
            : safeAvatar
            ? h("img", {
                src: safeAvatar,
                alt: p.name,
                className: "vce-avatar-circle",
                style: { position: "relative", zIndex: 2, ...(isAudioOnly ? { opacity: 0.62, filter: "grayscale(0.35)" } : {}), ...(isFullSolo ? { width: "112px", height: "112px" } : {}) }
              })
            : h(
                "div",
                {
                  className: "vce-avatar-circle",
                  style: {
                    position: "relative",
                    zIndex: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#334155",
                    fontSize: isFullSolo ? "34px" : "26px",
                    fontWeight: 700,
                    ...(isAudioOnly ? { opacity: 0.62 } : {}),
                    ...(isFullSolo ? { width: "112px", height: "112px" } : {})
                  }
                },
                p.name.slice(0, 1)
              ),
          isAudioOnly &&
            h(
              "div",
              {
                style: {
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  zIndex: 3,
                  background: "rgba(15,23,42,0.78)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: "999px",
                  padding: "2px 8px",
                  fontSize: "10.5px",
                  color: "#CBD5E1"
                }
              },
              "📷 仅语音"
            ),
          (act || (isAudioOnly && mStateRec && mStateRec.reason)) &&
            h("div", { className: "vce-action-badge", style: { zIndex: 3 } }, act || mStateRec.reason),
          h(
            "div",
            { className: "vce-nameplate", style: { zIndex: 3, ...(isFullSolo && prefs.showSubtitles ? { bottom: "64px" } : {}) } },
            h("span", { style: { color: isSpeaking ? "#22C55E" : "#94A3B8" } }, isSpeaking ? "🎤" : "🔇"),
            h("span", null, p.name)
          )
        );
      };

      const renderSelfTile = (isPip = false) => {
        const selfAsset = stageAssets.__self__ || {};
        const hasVirtualBg = Boolean(selfAsset.bgUrl || (prefs.selfVirtualBgId && prefs.selfVirtualBgId !== "none"));
        const safeMeAvatar = resolvedAvatars.__me__ || (isRenderableImgUrl(state.userAvatar) ? state.userAvatar : "");
        const selfBgStyle = selfAsset.bgUrl
          ? {
              position: "absolute",
              inset: "-8px",
              backgroundImage: `url(${selfAsset.bgUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: prefs.selfBgBlur > 0 ? `blur(${prefs.selfBgBlur}px)` : "none"
            }
          : {
              position: "absolute",
              inset: 0,
              background: getBgCss(prefs.selfVirtualBgId || "none")
            };

        return h(
          "div",
          {
            key: "__self__",
            className: isPip ? `vce-pip-self ${micListening ? "speaking" : ""}` : `vce-tile ${micListening ? "speaking" : ""}`
          },
          h("div", { style: selfBgStyle }),
          cameraOn
            ? h("video", {
                ref: videoRef,
                autoPlay: true,
                playsInline: true,
                muted: true,
                style: hasVirtualBg
                  ? {
                      position: "relative",
                      zIndex: 2,
                      width: "82%",
                      height: "84%",
                      borderRadius: "16px",
                      objectFit: "cover",
                      transform: "scaleX(-1)",
                      boxShadow: "0 4px 18px rgba(0,0,0,0.45)",
                      border: "1.5px solid rgba(255,255,255,0.22)"
                    }
                  : {
                      position: "relative",
                      zIndex: 2,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: "scaleX(-1)"
                    }
              })
            : safeMeAvatar
            ? h("img", { src: safeMeAvatar, alt: "我", className: isPip ? "vce-avatar-small" : "vce-avatar-circle", style: { position: "relative", zIndex: 2 } })
            : h(
                "div",
                {
                  className: isPip ? "vce-avatar-small" : "vce-avatar-circle",
                  style: {
                    position: "relative",
                    zIndex: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#475569",
                    fontSize: isPip ? "16px" : "22px",
                    fontWeight: 700
                  }
                },
                "我"
              ),
          !isPip && h("div", { className: "vce-action-badge", style: { zIndex: 3 } }, cameraOn ? (hasVirtualBg ? "🌄 虚拟背景中" : "📷 摄像头开启") : "摄像头已关闭"),
          h(
            "div",
            { className: "vce-nameplate", style: { zIndex: 3, ...(isPip ? { fontSize: "10px", padding: "2px 6px", left: "5px", bottom: "5px" } : {}) } },
            isPip ? (cameraOn ? "📷 我" : "👤 我") : `${state.userName || "主公"}（我）`
          )
        );
      };

      // 群聊会中拉人：我或某已入场名士邀请未出镜/仅语音名士出镜
      const handleInviteMember = async (targetMember) => {
        if (!targetMember || invitingTargetId) return;
        const inviteEngine = global.VideoCallInviteEngine;
        setInvitingTargetId(String(targetMember.id));
        const inviterObj =
          inviterChoice === "__me__"
            ? { isMe: true, name: state.userName || "主公" }
            : activeMembers.find((m) => String(m.id) === String(inviterChoice)) || { isMe: true, name: state.userName || "主公" };
        try {
          const res =
            inviteEngine && typeof inviteEngine.requestMemberInviteTurn === "function"
              ? await inviteEngine.requestMemberInviteTurn({
                  inviter: inviterObj,
                  target: targetMember,
                  chatData,
                  transcript,
                  userName: state.userName || "主公"
                })
              : {
                  inviterName: inviterObj.name,
                  inviterIsMe: Boolean(inviterObj.isMe),
                  inviterLine: inviterObj.isMe ? "" : `${targetMember.name}，快露个脸。`,
                  decision: "accept_camera",
                  nextState: "joined_camera",
                  targetAction: "打开了摄像头",
                  targetReply: "好吧，这就开镜头。"
                };
          if (res) {
            setMemberStates((prev) => ({
              ...prev,
              [String(targetMember.id)]: { state: res.nextState, reason: res.targetAction || res.targetReply }
            }));
            const newEntries = [];
            if (!res.inviterIsMe && res.inviterLine) {
              newEntries.push({ isMe: false, sender: res.inviterName, action: `点名邀请 ${targetMember.name}`, text: res.inviterLine });
            } else if (res.inviterIsMe) {
              newEntries.push({ isMe: true, sender: state.userName || "我", action: `邀请 ${targetMember.name} 出镜`, text: `邀请 ${targetMember.name} 开启视频画面` });
            }
            newEntries.push({ isMe: false, sender: targetMember.name, action: res.targetAction, text: res.targetReply });
            setTranscript((prev) => [...prev, ...newEntries]);
            setActiveSpeakerId(String(targetMember.id));
            setActionsBySpeaker((prev) => ({ ...prev, [String(targetMember.id)]: res.targetAction }));
            setCurrentSubtitle({ sender: targetMember.name, action: res.targetAction, text: res.targetReply });
            flashToast(
              res.decision === "accept_camera"
                ? `${targetMember.name} 已打开镜头加入画面`
                : res.decision === "accept_audio"
                ? `${targetMember.name} 选择仅开麦旁听`
                : `${targetMember.name} 拒绝了出镜邀请`
            );
          }
        } finally {
          setInvitingTargetId("");
        }
      };

      const handleForceAllJoinCamera = () => {
        const next = {};
        for (const m of activeMembers) {
          next[String(m.id)] = { state: "joined_camera", reason: "已全员入镜" };
        }
        setMemberStates(next);
        flashToast("已切换为全员露脸出镜");
      };

      // 计算网格与分页：群聊严格每页最多 4 格（Zoom 2x2 分页，已拒绝出镜成员收纳至顶部成员抽屉）
      const useSoloPip = !isGroup && prefs.layoutMode !== "gallery";
      const joinedMembers = isGroup
        ? activeMembers.filter((p) => (memberStates[String(p.id)]?.state || "joined_camera") !== "declined")
        : activeMembers;
      const declinedMembers = isGroup
        ? activeMembers.filter((p) => memberStates[String(p.id)]?.state === "declined")
        : [];
      const allGroupTiles = [
        { kind: "self", id: "__self__" },
        ...joinedMembers.map((p) => ({ kind: "member", id: p.id, member: p }))
      ];
      const paged = paginateTiles(allGroupTiles, galleryPage, 4);
      const speakerTileIdx = allGroupTiles.findIndex((t) => t.id === activeSpeakerId);
      const speakerPage = speakerTileIdx >= 0 ? Math.floor(speakerTileIdx / 4) : 0;
      const speakerOnOtherPage = isGroup && paged.totalPages > 1 && speakerPage !== paged.page;
      const cols = !isGroup ? 1 : paged.items.length <= 2 ? 1 : 2;

      return h(
        "div",
        {
          className: "vce-zoom-overlay open",
          style: {
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "#141518",
            color: "#F1F5F9",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }
        },
        // 顶栏
        h(
          "div",
          { className: "vce-topbar" },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 } },
            h("span", { style: { color: "#22C55E", fontSize: "13px" } }, "🔒"),
            h("span", { style: { fontWeight: 700, fontSize: "13.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, chatData.name || "视频会议"),
            h(
              "span",
              { style: { fontSize: "11.5px", padding: "2px 7px", borderRadius: "6px", background: "rgba(255,255,255,0.08)", fontVariantNumeric: "tabular-nums" } },
              formatDurationMMSS(elapsedSec)
            )
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            isGroup &&
              h(
                "button",
                {
                  type: "button",
                  className: "vce-pill-btn",
                  style: membersDrawerOpen ? { borderColor: "#22C55E", color: "#86EFAC" } : undefined,
                  onClick: () => {
                    setStageStudioOpen(false);
                    setChatOpen(false);
                    setMembersDrawerOpen((v) => !v);
                  }
                },
                `👥 成员 ${joinedMembers.length}/${activeMembers.length}`
              ),
            !isGroup &&
              h(
                "button",
                {
                  type: "button",
                  className: "vce-pill-btn",
                  onClick: () => {
                    const next = prefs.layoutMode === "gallery" ? "speaker" : "gallery";
                    setPrefs((p) => ({ ...p, layoutMode: next }));
                    savePrefs({ layoutMode: next });
                  }
                },
                prefs.layoutMode === "gallery" ? "⊞ 画廊" : "▢ 演讲者"
              ),
            h(
              "button",
              {
                type: "button",
                className: "vce-pill-btn",
                title: "切换呼叫时是否播放拟真振铃判定",
                onClick: () => {
                  const next = prefs.realisticRinging === false;
                  setPrefs((p) => ({ ...p, realisticRinging: next }));
                  savePrefs({ realisticRinging: next });
                  flashToast(next ? "已开启拟真呼叫振铃与入场分流" : "已切换为秒接模式");
                }
              },
              prefs.realisticRinging === false ? "⚡ 秒接" : "🔔 振铃"
            ),
            h(
              "button",
              {
                type: "button",
                className: "vce-pill-btn",
                onClick: () => {
                  const next = !prefs.sendCameraSnapshot;
                  setPrefs((p) => ({ ...p, sendCameraSnapshot: next }));
                  savePrefs({ sendCameraSnapshot: next });
                  flashToast(next ? "已开启：开摄像头时名士可看见你的画面" : "已关闭画面识别，仅本机预览");
                }
              },
              prefs.sendCameraSnapshot ? "👁️ 画面可见" : "🙈 仅自览"
            )
          )
        ),

        // 提示条
        statusToast &&
          h(
            "div",
            {
              style: {
                position: "absolute",
                top: "56px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 20,
                background: "rgba(30, 41, 59, 0.92)",
                border: "1px solid rgba(148,163,184,0.3)",
                padding: "6px 12px",
                borderRadius: "999px",
                fontSize: "12px",
                color: "#F8FAFC"
              }
            },
            statusToast
          ),

        // 主舞台 + 分页栏 + 白板 + 背景装扮抽屉 + 底部聊天抽屉
        h(
          "div",
          { className: "vce-stage-wrap" },
          // 群聊超过 4 格时显示 Zoom 分页条
          isGroup &&
            paged.totalPages > 1 &&
            h(
              "div",
              {
                style: {
                  padding: "5px 12px",
                  background: "rgba(24,26,32,0.92)",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "11.5px",
                  flexShrink: 0
                }
              },
              h(
                "button",
                {
                  type: "button",
                  className: "vce-pill-btn",
                  disabled: paged.page <= 0,
                  style: { opacity: paged.page <= 0 ? 0.4 : 1 },
                  onClick: () => setGalleryPage((p) => Math.max(0, p - 1))
                },
                "◀ 上一页"
              ),
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "8px" } },
                h("span", { style: { opacity: 0.85 } }, `第 ${paged.page + 1} / ${paged.totalPages} 页（共 ${allGroupTiles.length} 人）`),
                speakerOnOtherPage &&
                  h(
                    "button",
                    {
                      type: "button",
                      className: "vce-pill-btn",
                      style: { borderColor: "#22C55E", color: "#86EFAC" },
                      onClick: () => setGalleryPage(speakerPage)
                    },
                    `🎤 去看第 ${speakerPage + 1} 页发言`
                  )
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "vce-pill-btn",
                  disabled: paged.page >= paged.totalPages - 1,
                  style: { opacity: paged.page >= paged.totalPages - 1 ? 0.4 : 1 },
                  onClick: () => setGalleryPage((p) => Math.min(paged.totalPages - 1, p + 1))
                },
                "下一页 ▶"
              )
            ),

          useSoloPip
            ? h("div", { className: "vce-solo-stage" }, renderMemberTile(activeMembers[0], true), renderSelfTile(true))
            : h(
                "div",
                {
                  className: "vce-grid",
                  style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
                },
                (isGroup ? paged.items : [{ kind: "member", member: activeMembers[0] }, { kind: "self" }]).map((item) =>
                  item.kind === "self" ? renderSelfTile(false) : renderMemberTile(item.member, false)
                )
              ),

          // 互动白板浮层（独立子模块 VideoCallWhiteboard）
          global.VideoCallWhiteboard &&
            h(global.VideoCallWhiteboard.WhiteboardOverlay, {
              open: whiteboardOpen,
              busy,
              onClose: () => setWhiteboardOpen(false),
              onSubmitDrawing: (dataUrl, caption) => {
                handleSendTurn(caption, { whiteboardDataUrl: dataUrl });
              }
            }),

          // 虚拟背景 & 对面出镜图装扮底部抽屉
          stageStudioOpen &&
            (() => {
              const curCharId = studioCharId || activeMembers[0]?.id || "";
              const curAsset = stageAssets[curCharId] || { portraitScale: 100, portraitOffsetY: 0, bgPresetId: "none", bgBlur: 0 };
              const handleUploadBlob = async (targetId, field, file) => {
                if (!file) return;
                await saveStageAsset(targetId, { [field]: file });
                await reloadStageAssets(activeMembers);
                flashToast("已保存并应用到当前镜头 ✓");
              };

              return h(
                "div",
                { className: "vce-chat-drawer", style: { height: "58%", maxHeight: "460px" } },
                h(
                  "div",
                  {
                    style: {
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "8px"
                    }
                  },
                  h(
                    "div",
                    { style: { display: "flex", gap: "6px" } },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "vce-pill-btn",
                        style: studioTab === "opponent" ? { background: "#2563EB", borderColor: "#2563EB", color: "#fff" } : undefined,
                        onClick: () => setStudioTab("opponent")
                      },
                      "🎨 对面出镜与背景"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "vce-pill-btn",
                        style: studioTab === "self" ? { background: "#2563EB", borderColor: "#2563EB", color: "#fff" } : undefined,
                        onClick: () => setStudioTab("self")
                      },
                      "🌄 我的虚拟背景"
                    )
                  ),
                  h("button", { type: "button", className: "vce-pill-btn", onClick: () => setStageStudioOpen(false) }, "完成")
                ),
                h(
                  "div",
                  { style: { flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" } },
                  studioTab === "self"
                    ? h(
                        React.Fragment,
                        null,
                        h("div", { style: { fontWeight: 700, opacity: 0.85 } }, "选择 Zoom 虚拟背景（纯前端零卡顿）："),
                        h(
                          "div",
                          { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                          VIRTUAL_BG_PRESETS.map((bg) =>
                            h(
                              "button",
                              {
                                key: bg.id,
                                type: "button",
                                className: "vce-pill-btn",
                                style: prefs.selfVirtualBgId === bg.id ? { borderColor: "#22C55E", color: "#86EFAC" } : undefined,
                                onClick: async () => {
                                  await saveStageAsset("__self__", { bgBlob: null });
                                  await reloadStageAssets(activeMembers);
                                  setPrefs((p) => ({ ...p, selfVirtualBgId: bg.id }));
                                  savePrefs({ selfVirtualBgId: bg.id });
                                }
                              },
                              bg.label
                            )
                          )
                        ),
                        h(
                          "div",
                          { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } },
                          h(
                            "label",
                            { className: "vce-pill-btn", style: { cursor: "pointer" } },
                            "📤 上传我的自定义背景图",
                            h("input", {
                              type: "file",
                              accept: "image/*",
                              style: { display: "none" },
                              onChange: (e) => {
                                const f = e.target.files && e.target.files[0];
                                e.target.value = "";
                                handleUploadBlob("__self__", "bgBlob", f);
                              }
                            })
                          ),
                          h("span", { style: { opacity: 0.75 } }, `背景虚化 ${prefs.selfBgBlur || 0}px`),
                          h("input", {
                            type: "range",
                            min: 0,
                            max: 12,
                            value: prefs.selfBgBlur || 0,
                            onChange: (e) => {
                              const v = Number(e.target.value) || 0;
                              setPrefs((p) => ({ ...p, selfBgBlur: v }));
                              savePrefs({ selfBgBlur: v });
                            }
                          })
                        )
                      )
                    : h(
                        React.Fragment,
                        null,
                        isGroup &&
                          h(
                            "div",
                            { style: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" } },
                            h("span", { style: { opacity: 0.8 } }, "装扮名士："),
                            activeMembers.map((m) =>
                              h(
                                "button",
                                {
                                  key: m.id,
                                  type: "button",
                                  className: "vce-pill-btn",
                                  style: curCharId === m.id ? { borderColor: "#22C55E", color: "#86EFAC" } : undefined,
                                  onClick: () => setStudioCharId(m.id)
                                },
                                m.name
                              )
                            )
                          ),
                        h(
                          "div",
                          { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
                          h(
                            "label",
                            { className: "vce-pill-btn", style: { cursor: "pointer", borderColor: "#60A5FA", color: "#BFDBFE" } },
                            "🖼️ 上传对面出镜图（支持透明PNG立绘）",
                            h("input", {
                              type: "file",
                              accept: "image/*",
                              style: { display: "none" },
                              onChange: (e) => {
                                const f = e.target.files && e.target.files[0];
                                e.target.value = "";
                                handleUploadBlob(curCharId, "portraitBlob", f);
                              }
                            })
                          ),
                          h(
                            "label",
                            { className: "vce-pill-btn", style: { cursor: "pointer" } },
                            "🌄 上传对面身后背景图",
                            h("input", {
                              type: "file",
                              accept: "image/*",
                              style: { display: "none" },
                              onChange: (e) => {
                                const f = e.target.files && e.target.files[0];
                                e.target.value = "";
                                handleUploadBlob(curCharId, "bgBlob", f);
                              }
                            })
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              className: "vce-pill-btn",
                              onClick: async () => {
                                await clearStageAsset(curCharId);
                                await reloadStageAssets(activeMembers);
                                flashToast("已还原为默认头像与背景");
                              }
                            },
                            "↺ 重置"
                          )
                        ),
                        h(
                          "div",
                          { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" } },
                          h("span", { style: { opacity: 0.8 } }, "预设身后背景："),
                          VIRTUAL_BG_PRESETS.map((bg) =>
                            h(
                              "button",
                              {
                                key: bg.id,
                                type: "button",
                                className: "vce-pill-btn",
                                style: curAsset.bgPresetId === bg.id ? { borderColor: "#22C55E", color: "#86EFAC" } : undefined,
                                onClick: async () => {
                                  await saveStageAsset(curCharId, { bgPresetId: bg.id, bgBlob: null });
                                  await reloadStageAssets(activeMembers);
                                }
                              },
                              bg.label
                            )
                          )
                        ),
                        h(
                          "div",
                          { style: { display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" } },
                          h("span", null, `出镜缩放 ${curAsset.portraitScale || 100}%`),
                          h("input", {
                            type: "range",
                            min: 60,
                            max: 200,
                            value: curAsset.portraitScale || 100,
                            onChange: async (e) => {
                              await saveStageAsset(curCharId, { portraitScale: Number(e.target.value) });
                              await reloadStageAssets(activeMembers);
                            }
                          }),
                          h("span", null, `上下偏移 ${curAsset.portraitOffsetY || 0}%`),
                          h("input", {
                            type: "range",
                            min: -40,
                            max: 40,
                            value: curAsset.portraitOffsetY || 0,
                            onChange: async (e) => {
                              await saveStageAsset(curCharId, { portraitOffsetY: Number(e.target.value) });
                              await reloadStageAssets(activeMembers);
                            }
                          }),
                          h("span", null, `背景虚化 ${curAsset.bgBlur || 0}px`),
                          h("input", {
                            type: "range",
                            min: 0,
                            max: 12,
                            value: curAsset.bgBlur || 0,
                            onChange: async (e) => {
                              await saveStageAsset(curCharId, { bgBlur: Number(e.target.value) });
                              await reloadStageAssets(activeMembers);
                            }
                          })
                        )
                      )
                )
              );
            })(),

          // 群聊参会成员与点名拉人抽屉（支持「我来邀请」或「让某名士去叫」+ 一键全员出镜）
          isGroup &&
            membersDrawerOpen &&
            h(
              "div",
              { className: "vce-chat-drawer", style: { height: "58%", maxHeight: "460px" } },
              h(
                "div",
                {
                  style: {
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12.5px",
                    fontWeight: 700
                  }
                },
                h("span", null, `👥 参会成员 (${joinedMembers.length}/${activeMembers.length})`),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px" } },
                  h("button", { type: "button", className: "vce-pill-btn", style: { borderColor: "#22C55E", color: "#86EFAC" }, onClick: handleForceAllJoinCamera }, "✨ 一键全员出镜"),
                  h("button", { type: "button", className: "vce-pill-btn", onClick: () => setMembersDrawerOpen(false) }, "收起")
                )
              ),
              h(
                "div",
                { style: { padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", flexWrap: "wrap" } },
                h("span", { style: { opacity: 0.8 } }, "拉人发起方："),
                h(
                  "select",
                  {
                    value: inviterChoice,
                    onChange: (e) => setInviterChoice(e.target.value),
                    style: { background: "#1E293B", color: "#F8FAFC", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "8px", padding: "4px 8px", fontSize: "12px" }
                  },
                  h("option", { value: "__me__" }, `${state.userName || "主公"}（我来邀请）`),
                  joinedMembers.map((jm) => h("option", { key: jm.id, value: String(jm.id) }, `让 ${jm.name} 去叫`))
                )
              ),
              h(
                "div",
                { style: { flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" } },
                activeMembers.map((m) => {
                  const rec = memberStates[String(m.id)] || { state: "joined_camera", reason: "" };
                  const isCam = rec.state === "joined_camera";
                  const isAud = rec.state === "joined_audio_only";
                  const badge = isCam ? "📹 露脸中" : isAud ? "🎙️ 仅语音" : "🚫 未出镜";
                  const badgeColor = isCam ? "#86EFAC" : isAud ? "#FCD34D" : "#FCA5A5";
                  return h(
                    "div",
                    {
                      key: m.id,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)"
                      }
                    },
                    h(
                      "div",
                      { style: { minWidth: 0, flex: 1 } },
                      h(
                        "div",
                        { style: { display: "flex", alignItems: "center", gap: "6px", fontWeight: 700 } },
                        h("span", null, m.name),
                        h("span", { style: { fontSize: "10.5px", color: badgeColor } }, badge)
                      ),
                      rec.reason && h("div", { style: { fontSize: "11px", color: "#94A3B8", marginTop: "2px" } }, rec.reason)
                    ),
                    !isCam &&
                      h(
                        "button",
                        {
                          type: "button",
                          className: "vce-pill-btn",
                          disabled: Boolean(invitingTargetId),
                          style: { borderColor: "#60A5FA", color: "#BFDBFE", flexShrink: 0 },
                          onClick: () => handleInviteMember(m)
                        },
                        invitingTargetId === String(m.id) ? "呼叫中…" : isAud ? "📣 催开镜头" : "📣 邀请出镜"
                      )
                  );
                })
              )
            ),

          // 飘屏表情反应
          floats.map((f) => h("div", { key: f.id, className: "vce-float-emoji" }, f.icon)),

          // 实时字幕条
          prefs.showSubtitles &&
            currentSubtitle &&
            h(
              "div",
              { className: "vce-subtitle-bar" },
              h("span", { style: { color: "#86EFAC", fontWeight: 700, marginRight: "6px" } }, `${currentSubtitle.sender}：`),
              currentSubtitle.action && h("span", { style: { color: "#94A3B8", fontSize: "12px", marginRight: "4px" } }, `(${currentSubtitle.action})`),
              h("span", null, currentSubtitle.text)
            ),

          // 会议聊天抽屉
          chatOpen &&
            h(
              "div",
              { className: "vce-chat-drawer" },
              h(
                "div",
                {
                  style: {
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12.5px",
                    fontWeight: 700
                  }
                },
                h("span", null, "💬 会议中聊天"),
                h("button", { type: "button", className: "vce-pill-btn", onClick: () => setChatOpen(false) }, "收起")
              ),
              h(
                "div",
                { style: { flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" } },
                transcript.length === 0 && h("div", { style: { opacity: 0.55, textAlign: "center", marginTop: "20px" } }, "输入文字或点下方「说话」开始视频对话"),
                transcript.map((t, idx) =>
                  h(
                    "div",
                    {
                      key: idx,
                      style: {
                        alignSelf: t.isMe ? "flex-end" : "flex-start",
                        maxWidth: "88%",
                        background: t.isMe ? "#2563EB" : "rgba(255,255,255,0.08)",
                        padding: "7px 10px",
                        borderRadius: "10px",
                        lineHeight: 1.5
                      }
                    },
                    h("div", { style: { fontSize: "10.5px", opacity: 0.75, marginBottom: "2px" } }, `${t.sender}${t.action ? ` · ${t.action}` : ""}`),
                    h("div", null, t.text)
                  )
                )
              ),
              h(
                "div",
                { style: { padding: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "6px" } },
                h("input", {
                  type: "text",
                  placeholder: busy ? "对方回应中…" : "说点什么…",
                  value: inputText,
                  disabled: busy,
                  onChange: (e) => setInputText(e.target.value),
                  onKeyDown: (e) => e.key === "Enter" && handleSendTurn(),
                  style: {
                    flex: 1,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "8px",
                    padding: "6px 8px",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    outline: "none"
                  }
                }),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: busy,
                    onClick: () => handleSendTurn(),
                    style: {
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#2563EB",
                      color: "#FFFFFF",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer"
                    }
                  },
                  "发送"
                )
              )
            )
        ),

        // 反应弹出条
        reactMenuOpen &&
          h(
            "div",
            {
              style: {
                position: "absolute",
                bottom: "74px",
                left: "50%",
                transform: "translateX(-50%)",
                background: "#23262E",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "999px",
                padding: "6px 12px",
                display: "flex",
                gap: "10px",
                zIndex: 15
              }
            },
            REACTIONS.map((r) =>
              h(
                "button",
                {
                  key: r.id,
                  type: "button",
                  title: r.label,
                  onClick: () => sendReaction(r),
                  style: { background: "transparent", border: "none", fontSize: "20px", cursor: "pointer" }
                },
                r.icon
              )
            )
          ),

        // 常驻全宽快捷输入条（不开聊天抽屉也能边看大屏镜头边打字）
        h(
          "div",
          { className: "vce-quick-bar" },
          h("input", {
            type: "text",
            placeholder: busy ? "名士回应中…" : "对镜头说点什么…",
            value: inputText,
            disabled: busy,
            onChange: (e) => setInputText(e.target.value),
            onKeyDown: (e) => e.key === "Enter" && handleSendTurn(),
            style: {
              flex: 1,
              background: "rgba(255,255,255,0.09)",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: "999px",
              padding: "7px 13px",
              color: "#FFFFFF",
              fontSize: "13px",
              outline: "none"
            }
          }),
          h(
            "button",
            {
              type: "button",
              disabled: busy,
              onClick: () => handleSendTurn(),
              style: {
                padding: "7px 14px",
                borderRadius: "999px",
                border: "none",
                background: "#2563EB",
                color: "#FFFFFF",
                fontSize: "12.5px",
                fontWeight: 700,
                cursor: "pointer",
                flexShrink: 0
              }
            },
            "发送"
          )
        ),

        // 底部 Zoom 控制栏（左侧功能键横向滑动，右侧「离开」常驻不遮挡）
        h(
          "div",
          { className: "vce-controls" },
          h(
            "div",
            { className: "vce-controls-scroll" },
            h(
              "button",
              { type: "button", className: `vce-ctrl-btn ${micListening ? "active" : ""}`, onClick: triggerVoiceInput },
              h("span", { style: { fontSize: "17px" } }, micListening ? "🎙️" : "🎤"),
              h("span", null, micListening ? "聆听中" : "说话")
            ),
            h(
              "button",
              { type: "button", className: `vce-ctrl-btn ${cameraOn ? "active" : ""}`, onClick: toggleCamera },
              h("span", { style: { fontSize: "17px" } }, cameraOn ? "📹" : "📷"),
              h("span", null, cameraOn ? "关视频" : "开视频")
            ),
            h(
              "button",
              { type: "button", className: `vce-ctrl-btn ${whiteboardOpen ? "active" : ""}`, onClick: () => { setStageStudioOpen(false); setChatOpen(false); setWhiteboardOpen((v) => !v); } },
              h("span", { style: { fontSize: "17px" } }, "🖍️"),
              h("span", null, "白板")
            ),
            h(
              "button",
              { type: "button", className: `vce-ctrl-btn ${stageStudioOpen ? "active" : ""}`, onClick: () => { setWhiteboardOpen(false); setChatOpen(false); setStageStudioOpen((v) => !v); } },
              h("span", { style: { fontSize: "17px" } }, "🌄"),
              h("span", null, "背景")
            ),
            h(
              "button",
              { type: "button", className: `vce-ctrl-btn ${reactMenuOpen ? "active" : ""}`, onClick: () => setReactMenuOpen((v) => !v) },
              h("span", { style: { fontSize: "17px" } }, "🙌"),
              h("span", null, "反应")
            ),
            h(
              "button",
              { type: "button", className: `vce-ctrl-btn ${chatOpen ? "active" : ""}`, onClick: () => { setWhiteboardOpen(false); setStageStudioOpen(false); setChatOpen((v) => !v); } },
              h("span", { style: { fontSize: "17px" } }, "💬"),
              h("span", null, "聊天")
            ),
            h(
              "button",
              {
                type: "button",
                className: `vce-ctrl-btn ${prefs.ttsEnabled ? "active" : ""}`,
                onClick: () => {
                  const next = !prefs.ttsEnabled;
                  setPrefs((p) => ({ ...p, ttsEnabled: next }));
                  savePrefs({ ttsEnabled: next });
                }
              },
              h("span", { style: { fontSize: "17px" } }, prefs.ttsEnabled ? "🔊" : "🔇"),
              h("span", null, "语音")
            )
          ),
          h("button", { type: "button", className: "vce-leave-btn", onClick: handleHangUp }, "离开")
        )
      );
    };
  }

  let _ModalComp = null;
  let _sessionSeq = 0;

  function renderPortal() {
    if (typeof document === "undefined" || !global.React || !global.ReactDOM) return;
    ensureStylesInjected();
    if (!_ModalComp) _ModalComp = createZoomModalComponent();
    if (!_ModalComp) return;
    if (!_portalEl) {
      _portalEl = document.createElement("div");
      _portalEl.id = "vce-zoom-portal-root";
      document.body.appendChild(_portalEl);
    }
    // 关闭时彻底卸载组件，切换会话时使用独立 sessionId key，杜绝上一个会话的字幕/聊天记录窜台
    const el = _callState.open
      ? global.React.createElement(_ModalComp, {
          key: _callState.sessionId || "vce_call",
          state: { ..._callState },
          onClose: closeCall
        })
      : null;
    if (typeof global.ReactDOM.createRoot === "function") {
      if (!_portalRoot) _portalRoot = global.ReactDOM.createRoot(_portalEl);
      _portalRoot.render(el);
    } else if (typeof global.ReactDOM.render === "function") {
      global.ReactDOM.render(el, _portalEl);
    }
  }

  function openCall({ chatData, isGroup = false, userAvatar = "", userName = "主公", callContext = null } = {}) {
    _sessionSeq += 1;
    _callState = {
      open: true,
      sessionId: `vce_${_sessionSeq}_${String(chatData?.id || "solo")}`,
      chatData: chatData || { id: "solo", name: "名士" },
      isGroup: Boolean(isGroup),
      userAvatar: userAvatar || "",
      userName: userName || chatData?.profile?.userNickname || "主公",
      callContext: callContext || null
    };
    if (global.VideoCallInviteEngine && typeof global.VideoCallInviteEngine.setCallActiveBusy === "function") {
      global.VideoCallInviteEngine.setCallActiveBusy(true);
    }
    renderPortal();
  }

  function closeCall() {
    _callState = { ..._callState, open: false };
    if (global.VideoCallInviteEngine && typeof global.VideoCallInviteEngine.setCallActiveBusy === "function") {
      global.VideoCallInviteEngine.setCallActiveBusy(false);
    }
    renderPortal();
  }

  const api = {
    DB_NAME,
    SAVED_EVENT,
    VIRTUAL_BG_PRESETS,
    loadPrefs,
    savePrefs,
    loadStageAsset,
    saveStageAsset,
    clearStageAsset,
    paginateTiles,
    enrichGroupMembers,
    fitSnapshotSize,
    captureCameraSnapshot,
    isVisionUnsupportedError,
    attachSnapshotToLastUser,
    normalizeParticipants,
    buildVideoCallMessages,
    parseVideoReplies,
    requestVideoTurnLlm,
    formatDurationMMSS,
    buildCallRecordMessage,
    saveCallRecord,
    openCall,
    closeCall,
    _resetForTests
  };

  global.VideoCallEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

