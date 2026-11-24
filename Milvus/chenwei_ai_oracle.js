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

  async function saveOracleRecord(rec) {
    const item = { id: rec.id || `cw_${Date.now()}`, ...rec, savedAt: Date.now() };
    const db = await openDb();
    if (!db) {
      _memOracle = [item, ..._memOracle.slice(0, 29)];
      return item;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_ORACLE, "readwrite");
        tx.objectStore(STORE_ORACLE).put(item);
        tx.oncomplete = () => resolve(item);
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

  async function saveCharProphecy(charId, data) {
    const cid = String(charId);
    const item = { charId: cid, ...data, savedAt: Date.now() };
    const db = await openDb();
    if (!db) {
      _memCharMap.set(cid, item);
      return item;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_CHAR_PROPHECY, "readwrite");
        tx.objectStore(STORE_CHAR_PROPHECY).put(item);
        tx.oncomplete = () => resolve(item);
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
  // 5. 玩家积木起卦解签
  // ==========================================
  async function requestPlayerDivination({ question = "", bricks = [], commentatorChar = null } = {}) {
    const Bricks = global.ChenweiLegoBricks;
    const analysis = Bricks ? Bricks.analyzeStructure(bricks) : { summaryText: "坛上已落积木。", dominantElement: "火", archetype: "筑台问天" };
    const ctx = await collectCharacter5DContext(commentatorChar);
    const qText = String(question || "").trim() || "近日气运与心中所系之事";

    const sysPrompt = [
      "你是东汉末年「谶纬小摊」的司天监掌卦先生，精通五行谶纬与器物观象。",
      ctx.userPersona.name ? `【问卦人身份】${ctx.userPersona.name}（${ctx.userPersona.identity || "广陵王"}）${ctx.userPersona.background ? `：${ctx.userPersona.background}` : ""}` : "",
      ctx.worldBookText ? `【世界观设定】${ctx.worldBookText}` : "",
      ctx.charProfile ? `【同行点评名士】${ctx.charProfile.name}（MBTI:${ctx.charProfile.mbti}，星座:${ctx.charProfile.constellation}，语风:${ctx.charProfile.speakingStyle}，性格:${ctx.charProfile.personality}）` : "",
      ctx.recentChat.text ? `【该名士与问卦人近期传讯】\n${ctx.recentChat.text}` : "",
      "请严格结合问卦人亲手拼搭的「3D 乐高积木量化格局」，给出极具代入感与古风韵味的谶纬解签。",
      "只返回严格 JSON：",
      "{\"hexagram\":\"卦名 · 吉凶（如：风火家人 · 上吉）\",\"oracleVerse\":\"四句古风签文（用\\n换行）\",\"structureReading\":\"80~130字结合积木层高、对称度、五行色泽与灵物的象意解读\",\"advice\":\"50~90字切实温柔的行事建言\",\"charComment\":\"若指定了同行名士，以该名士第一人称口吻写40~80字点评，否则为空字符串\"}"
    ].filter(Boolean).join("\n");

    const userPrompt = `【所问之事】${qText}\n【积木实体格局】${analysis.summaryText}`;

    try {
      const raw = await callOracleLLM([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ], 680);
      const parsed = extractJsonObject(raw);
      if (parsed && parsed.hexagram) {
        const result = {
          question: qText,
          hexagram: String(parsed.hexagram).trim(),
          oracleVerse: String(parsed.oracleVerse || "").trim(),
          structureReading: String(parsed.structureReading || "").trim(),
          advice: String(parsed.advice || "").trim(),
          charComment: String(parsed.charComment || "").trim(),
          commentatorName: ctx.charProfile ? ctx.charProfile.name : "",
          analysis,
          bricks,
          usedAi: true
        };
        await saveOracleRecord(result);
        return result;
      }
    } catch (e) {}

    // 离线古风兜底
    const fallback = {
      question: qText,
      hexagram: `${analysis.dominantElement}曜${analysis.archetype} · 中上吉`,
      oracleVerse: `重台叠玉应星躔，\n${analysis.dominantElement}德相生气象全。\n莫道风云多诡谲，\n守心落子自安然。`,
      structureReading: `${analysis.summaryText} 观此积木之象，${analysis.stabilityHint}，主气归于「${analysis.dominantElement}」，所问之事虽有微澜，然根基已成，顺势而为必见回响。`,
      advice: "宜先固眼前根基，忌急躁冒进；三日内若有旧人讯息或新机上门，可从容应之。",
      charComment: ctx.charProfile ? `（${ctx.charProfile.name}端详片刻）这般搭法倒有几分你的性子，放心去做便是。` : "",
      commentatorName: ctx.charProfile ? ctx.charProfile.name : "",
      analysis,
      bricks,
      usedAi: false
    };
    await saveOracleRecord(fallback);
    return fallback;
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
      "{\"question\":\"名士心中暗问之事（15~36字）\",\"buildTitle\":\"作品雅名（4~8字）\",\"baseArchetype\":\"pavilion\",\"primaryColor\":\"cinnabar\",\"accentColor\":\"gold\",\"customBricks\":[{\"type\":\"orb_1x1\",\"gx\":0,\"gz\":0,\"rot\":0,\"color\":\"gold\"}],\"hexagram\":\"卦名 · 吉凶\",\"oracleVerse\":\"四句古风签文（用\\n换行）\",\"charNote\":\"120~200字名士第一人称手札，贴合口癖解释自己为何搭这座积木，并自然流露对玩家的挂念\"}"
    ].filter(Boolean).join("\n");

    const userPrompt = `请以「${cp.name}」的视角完成本次谶纬积木搭建与手札，务必体现近期传讯中的互动心境。`;

    try {
      const raw = await callOracleLLM([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ], 820);
      const parsed = extractJsonObject(raw);
      if (parsed && (parsed.buildTitle || parsed.charNote)) {
        const bricks = Bricks ? Bricks.sanitizeAndGroundBlueprint(parsed) : [];
        const analysis = Bricks ? Bricks.analyzeStructure(bricks) : null;
        const result = {
          charId: cp.id,
          charName: cp.name,
          question: String(parsed.question || "问前路风云与眼前人安康").trim(),
          buildTitle: String(parsed.buildTitle || `${cp.name}的灵台`).trim(),
          hexagram: String(parsed.hexagram || "紫微照命 · 中上吉").trim(),
          oracleVerse: String(parsed.oracleVerse || "星移斗转意难平，\n独上高楼听风声。\n幸有灵台明月在，\n寸心千里共长明。").trim(),
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
    const fallback = {
      charId: cp.id,
      charName: cp.name,
      question: `暗问近日局势与${ctx.userPersona.name}安否`,
      buildTitle: `${cp.name} · 观星灵台`,
      hexagram: "天风姤 · 中吉",
      oracleVerse: "星落寒阶夜未央，\n垒石为台候晓光。\n纵使前尘多变数，\n此心终不负韶光。",
      charNote: `闲来无事，便在谶纬小摊随手垒了这座小台。近来与${ctx.userPersona.name}几番往来，心中所系终究逃不过安稳二字。这几块砖石看着虽小，倒也算替眼下局势定个心气。`,
      bricks: fallbackBricks,
      analysis: Bricks ? Bricks.analyzeStructure(fallbackBricks) : null,
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
    saveOracleRecord,
    loadOracleRecords,
    saveCharProphecy,
    loadAllCharProphecies,
    resolveCharAvatarUrl,
    loadAllCharacters,
    collectCharacter5DContext,
    requestPlayerDivination,
    requestCharacterProphecy
  };

  global.ChenweiAiOracle = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

