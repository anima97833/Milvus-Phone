/**
 * Milvus/nuo_poker_app.js
 * 「傩·扑克（Nuo Poker）」名士德州扑克牌桌 UI 与五维人设 AI 群聊互怼引擎
 * - 依赖 Milvus/nuo_poker_rules.js（100% 确定性德州扑克规则，零 AI 乱算牌）
 * - 手机竖屏优先：柔白底色 (#F6F7FC) + 淡薰衣草椭圆牌桌 (#ECEEFE) + 紫晶主按钮 (#7C6BF0) + 彩色筹码
 * - 自由邀请 2~5 位传讯名士（3~6人局），合参五维设定（6项人设 + 身份库 + 世界书 + 传讯近10条 + 牌桌群聊流）
 * - 独立 IndexedDB: milvus_nuo_poker_idb（战绩持久化，零 localStorage 写入）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_nuo_poker_idb";
  const DB_VERSION = 1;
  const STORE_RECORDS = "poker_records";

  const CHIP_COLORS = [
    { val: 10, bg: "#8B5CF6", ring: "#C4B5FD" },
    { val: 25, bg: "#F59E0B", ring: "#FDE68A" },
    { val: 50, bg: "#3B82F6", ring: "#BFDBFE" },
    { val: 100, bg: "#22C55E", ring: "#BBF7D0" },
    { val: 200, bg: "#EF4444", ring: "#FECACA" }
  ];

  // ==========================================
  // 1. 独立 IDB 战绩存储（零 localStorage 写入）
  // ==========================================
  let _dbPromise = null;
  let _memRecords = [];

  function openDb() {
    if (typeof indexedDB === "undefined" || !indexedDB) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_RECORDS)) {
            db.createObjectStore(STORE_RECORDS, { keyPath: "id" });
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

  async function savePokerRecord(rec) {
    const item = { id: rec.id || `pk_${Date.now()}`, ...rec, savedAt: Date.now() };
    const db = await openDb();
    if (!db) {
      _memRecords = [item, ..._memRecords.slice(0, 29)];
      return item;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_RECORDS, "readwrite");
        tx.objectStore(STORE_RECORDS).put(item);
        tx.oncomplete = () => resolve(item);
        tx.onerror = () => resolve(item);
      } catch (e) {
        resolve(item);
      }
    });
  }

  // ==========================================
  // 2. 头像解析（兼容 idb: 协议）& 五维人设上下文加载
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

    // 1. 全局 window.resolveAvatarUrl（对齐 app.min.js / cinema_app.js）
    try {
      if (typeof global.resolveAvatarUrl === "function") {
        const res = await global.resolveAvatarUrl(key, "");
        if (isRenderableUrl(res)) return res;
      }
    } catch (e) {}

    // 2. window.avatarStore（兼容带/不带 idb: 前缀以及字符串/数字 ID）
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

    // 3. 兜底直查 t8_chat_db / avatars 表
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

  async function resolveAvatarUrl(rawUrlOrChar, charId = "") {
    const isCharObj = rawUrlOrChar && typeof rawUrlOrChar === "object";
    const c = isCharObj ? rawUrlOrChar : null;
    const id = charId || (c ? c.id : "");
    const idStr = id !== undefined && id !== null ? String(id) : "";
    const name = c ? String(c.name || "") : "";

    // 1. 优先查傩·观影同款 t8_mansion_custom_avatars
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

    // 2. 查单聊自定义头像 user_settings -> role_avatar_<charId>
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

    // 3. 收集全部候选字段（对齐 CharacterAvatarDisplay: avatar / avatarUrl / avatarKey / avatarId / profile.avatar / character_settings / char.id）
    const candidates = [];
    if (!isCharObj && rawUrlOrChar) candidates.push(rawUrlOrChar);
    if (c) {
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
    }
    // 关键：传讯角色头像常以 char.id（字符串或数字）直接作为 key 存于 avatarStore！
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

  async function loadInviteCandidates() {
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

  async function buildTableContextBundle(selectedChars) {
    let userPersona = { name: "主公", identity: "", personality: "", background: "", avatar: "" };
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
            background: String(hit.background || hit.bio || "").slice(0, 220),
            avatar: hit.avatar || ""
          };
        }
      }
    } catch (e) {}

    let worldBook = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldBook = String(wb).trim().slice(0, 900);
      }
    } catch (e) {}

    const recentByChar = {};
    for (const c of selectedChars || []) {
      const cid = String(c.id);
      if (global.chatHistoryStore) {
        try {
          let msgs = [];
          if (typeof global.chatHistoryStore.getRecentMessages === "function") {
            msgs = await global.chatHistoryStore.getRecentMessages(cid, 10);
          } else if (typeof global.chatHistoryStore.getMessages === "function") {
            const all = await global.chatHistoryStore.getMessages(cid);
            msgs = Array.isArray(all) ? all.slice(-10) : [];
          }
          recentByChar[cid] = (Array.isArray(msgs) ? msgs : [])
            .map((m) => {
              const who = m.isMe ? userPersona.name : (m.sender || c.name);
              const t = String(m.text || m.content || "").replace(/\s+/g, " ").trim().slice(0, 70);
              return t ? `${who}：${t}` : "";
            })
            .filter(Boolean)
            .join("\n");
        } catch (e) {}
      }
    }
    return { userPersona, worldBook, recentByChar };
  }

  // ==========================================
  // 3. AI 牌桌决策与群聊互怼请求（6.5s 超时自动降级本地策略）
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

  function extractJsonObject(raw) {
    const cleaned = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1].trim() : cleaned;
    const s = body.indexOf("{");
    const e = body.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try { return JSON.parse(body.slice(s, e + 1)); } catch (err) { return null; }
  }

  async function requestAiPokerDecision({ state, seatIdx, contextBundle, tableChat = [], customChatFn = null }) {
    const Rules = global.NuoPokerRules;
    const me = state.players[seatIdx];
    const view = Rules.buildSeatView(state, seatIdx);
    const pf = me.profile || {};

    const legalList = [];
    if (view.legal.canCheck) legalList.push("check(过牌)");
    if (view.legal.canCall) legalList.push(`call(跟注${view.legal.toCall})`);
    if (view.legal.canRaise) legalList.push(`raise(加注,范围${view.legal.minRaiseTo}~${view.legal.maxRaiseTo})`);
    legalList.push("allin(梭哈)");
    if (!view.legal.canCheck) legalList.push("fold(弃牌)");

    const charLines = [
      `- 角色姓名与ID：${me.name} (${me.id})`,
      pf.mbti ? `- MBTI：${pf.mbti}` : "",
      pf.constellation || pf.zodiac ? `- 星座：${pf.constellation || pf.zodiac}` : "",
      pf.style || pf.speakingStyle ? `- 语言风格：${pf.style || pf.speakingStyle}` : "",
      pf.personality ? `- 性格特点：${pf.personality}` : "",
      pf.background || pf.description ? `- 个人背景：${String(pf.background || pf.description).slice(0, 220)}` : ""
    ].filter(Boolean);

    const recentTableTalk = (tableChat || []).slice(-8).map((t) => `${t.sender}：${t.text}`).join("\n");
    const recentPrivate = (contextBundle && contextBundle.recentByChar && contextBundle.recentByChar[me.id]) || "";
    const u = (contextBundle && contextBundle.userPersona) || { name: "主公" };

    const sysPrompt = [
      `你是【${me.name}】，正和「${u.name}」以及几位名士围坐一桌打德州扑克。`,
      "【你的完整角色配置】",
      charLines.join("\n"),
      `【用户身份】${u.name}${u.identity ? `（${u.identity}）` : ""}${u.personality ? `；性格：${u.personality}` : ""}`,
      contextBundle?.worldBook ? `【世界书】${contextBundle.worldBook.slice(0, 500)}` : "",
      recentPrivate ? `【你与${u.name}在传讯中的近期上下文】\n${recentPrivate}` : "",
      "【出牌与群聊铁律】",
      "1. 你只能从给定的合法动作中选择，严禁乱选非法动作；结合你的手牌客观强度(0~100)与性格决定稳打、加注或偶尔诈唬。",
      "2. 你的 tableTalk 必须贴合你的语言风格，可以自然接话回复刚才牌桌上其他名士或用户的挑衅/对话（15~42字，严禁透露自己底牌具体点数）。",
      "严格输出单行 JSON：",
      '{"action":"check|call|raise|fold|allin","raiseTo":60,"tableTalk":"你的牌桌发言(15~42字)"}'
    ]
      .filter(Boolean)
      .join("\n");

    const othersBrief = view.others.map((o) => `${o.name}(筹码${o.chips},本轮注${o.betThisStreet},${o.folded ? "已弃牌" : o.lastAction})`).join("；");
    const userPrompt = [
      `【当前牌局】阶段：${view.stageLabel} | 底池：${view.pot} | 当前需跟：${view.legal.toCall}`,
      `公共牌：${view.communityCards.length ? view.communityCards.join(" ") : "尚未翻牌"}`,
      `你的暗牌：${view.myCards.join(" ")}（当前最佳：${view.myBestHand}，客观强度：${view.myStrength}/100，你的剩余筹码：${view.myChips}）`,
      `合法动作：${legalList.join(" / ")}`,
      `桌上他人：${othersBrief}`,
      recentTableTalk ? `【刚才牌桌上的对话】\n${recentTableTalk}` : "",
      "轮到你行动了，请立刻给出决策 JSON。"
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const invoke = async () => {
        const msgs = [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt }
        ];
        if (typeof customChatFn === "function") return customChatFn(msgs);
        // 优先复用全局 window.sendToLLM（与传讯/情侣空间完全一致的 API 链路）
        if (typeof global.sendToLLM === "function") {
          return new Promise((resolve, reject) => {
            try {
              global.sendToLLM(msgs, { disableMCP: true }, (reply) => resolve(reply), (err) => reject(err));
            } catch (e) {
              reject(e);
            }
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
            temperature: 0.82,
            max_tokens: 220
          })
        });
        if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
        const json = await resp.json();
        return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
      };

      const raw = await Promise.race([
        invoke(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 90000))
      ]);
      const parsed = extractJsonObject(raw);
      if (parsed && parsed.action) {
        const clean = Rules.sanitizeAction(state, seatIdx, {
          action: parsed.action,
          raiseTo: parsed.raiseTo,
          forceFold: String(parsed.action).toLowerCase() === "fold"
        });
        return {
          ...clean,
          tableTalk: String(parsed.tableTalk || "").trim().slice(0, 68) || "看牌，走着瞧。",
          usedAi: true
        };
      }
    } catch (e) {}

    return { ...Rules.decideLocalFallbackAction(state, seatIdx), usedAi: false };
  }

  // ==========================================
  // 4. 手机竖屏现代牌桌组件：NuoPokerModal
  // ==========================================
  function renderCard(h, card, { faceDown = false, size = "md" } = {}) {
    const dims =
      size === "lg"
        ? { w: 50, h: 70, font: 15, suit: 17 }
        : size === "sm"
        ? { w: 28, h: 38, font: 10, suit: 11 }
        : { w: 42, h: 58, font: 13, suit: 15 };

    if (faceDown || !card) {
      return h(
        "div",
        {
          style: {
            width: `${dims.w}px`,
            height: `${dims.h}px`,
            borderRadius: size === "sm" ? "5px" : "8px",
            background: "linear-gradient(135deg, #8B7CF6 0%, #6D5CE7 100%)",
            border: "1.5px solid #FFFFFF",
            boxShadow: "0 3px 8px rgba(109, 92, 231, 0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.65)",
            fontSize: `${dims.font}px`,
            flexShrink: 0
          }
        },
        "❖"
      );
    }

    const Rules = global.NuoPokerRules;
    const isRed = card.suit === "hearts" || card.suit === "diamonds";
    const col = isRed ? "#E11D48" : "#1E293B";
    return h(
      "div",
      {
        style: {
          width: `${dims.w}px`,
          height: `${dims.h}px`,
          borderRadius: size === "sm" ? "5px" : "9px",
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
          boxShadow: "0 4px 10px rgba(15, 23, 42, 0.08)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: size === "sm" ? "2px" : "4px 3px",
          boxSizing: "border-box",
          color: col,
          fontWeight: 800,
          flexShrink: 0
        }
      },
      h("span", { style: { fontSize: `${dims.font}px`, lineHeight: 1, alignSelf: "flex-start", paddingLeft: "2px" } }, Rules.RANK_LABEL[card.rank] || card.rank),
      h("span", { style: { fontSize: `${dims.suit}px`, lineHeight: 1 } }, Rules.SUIT_SYMBOL[card.suit] || "")
    );
  }

  function NuoPokerModal({ isOpen, onClose }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const [phase, setPhase] = useState("lobby"); // "lobby" | "table"
    const [gameMode, setGameMode] = useState("texas"); // "texas" | "hongshi" | "niangniang"
    const [localSeatsMeta, setLocalSeatsMeta] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [resolvedAvatars, setResolvedAvatars] = useState({});
    const [startingChips, setStartingChips] = useState(1000);
    const [blindLevel, setBlindLevel] = useState(20); // BB (SB = BB/2)

    const [gameState, setGameState] = useState(null);
    const [tableChat, setTableChat] = useState([]);
    const [bubblesBySeat, setBubblesBySeat] = useState({});
    const [showChatDrawer, setShowChatDrawer] = useState(false);
    const [showRaisePanel, setShowRaisePanel] = useState(false);
    const [raiseAmount, setRaiseAmount] = useState(40);
    const [chatInput, setChatInput] = useState("");
    const [showRulesHelp, setShowRulesHelp] = useState(false);
    const [thinkingSeat, setThinkingSeat] = useState(-1);
    const [toast, setToast] = useState("");

    const contextBundleRef = useRef(null);
    const sessionTokenRef = useRef(0);
    const tableChatRef = useRef([]);
    useEffect(() => { tableChatRef.current = tableChat; }, [tableChat]);

    const flashToast = (m) => {
      setToast(m);
      setTimeout(() => setToast(""), 2000);
    };

    // 加载传讯可选名士并异步解析头像
    useEffect(() => {
      if (!isOpen) {
        sessionTokenRef.current += 1;
        return;
      }
      let alive = true;
      loadInviteCandidates().then(async (list) => {
        if (!alive) return;
        setCandidates(list);
        if (list.length >= 2) {
          setSelectedIds((prev) => (prev.length >= 2 ? prev : list.slice(0, Math.min(3, list.length)).map((c) => String(c.id))));
        }
        const pairs = await Promise.all(list.map((c) => resolveAvatarUrl(c, c.id).then((u) => [String(c.id), u])));
        if (!alive) return;
        const map = {};
        pairs.forEach(([k, v]) => { if (v) map[k] = v; });
        setResolvedAvatars(map);
      });
      return () => { alive = false; };
    }, [isOpen]);

    // AI 回合自动推进调度器（带 sessionToken 防退出串台）
    useEffect(() => {
      if (!isOpen || phase !== "table" || !gameState || gameState.finished) return;
      const turnIdx = gameState.turnIndex;
      if (turnIdx < 0) return;
      const curPlayer = gameState.players[turnIdx];
      if (!curPlayer || curPlayer.isUser) {
        setThinkingSeat(-1);
        return;
      }

      const token = sessionTokenRef.current;
      setThinkingSeat(turnIdx);
      const startTs = Date.now();

      (async () => {
        const decision = await requestAiPokerDecision({
          state: gameState,
          seatIdx: turnIdx,
          contextBundle: contextBundleRef.current,
          tableChat: tableChatRef.current
        });
        const elapsed = Date.now() - startTs;
        if (elapsed < 700) {
          await new Promise((r) => setTimeout(r, 700 - elapsed));
        }
        if (token !== sessionTokenRef.current) return;

        const Rules = global.NuoPokerRules;
        if (decision.tableTalk) {
          setBubblesBySeat((prev) => ({ ...prev, [curPlayer.id]: decision.tableTalk }));
          setTableChat((prev) => [
            ...prev.slice(-40),
            { id: `tc_${Date.now()}_${Math.random()}`, sender: curPlayer.name, text: decision.tableTalk, isMe: false }
          ]);
        }
        setThinkingSeat(-1);
        setGameState((prev) => {
          if (!prev || prev.finished || prev.turnIndex !== turnIdx) return prev;
          const next = Rules.applyPlayerAction(prev, turnIdx, decision);
          if (next.finished && next.winners && next.winners.length > 0) {
            savePokerRecord({
              handNumber: next.handNumber,
              pot: next.pot,
              winners: next.winners.map((w) => `${w.name}(${w.handName}+${w.amount})`),
              players: next.players.map((p) => ({ name: p.name, chips: p.chips }))
            });
          }
          return next;
        });
      })();
    }, [isOpen, phase, gameState?.turnIndex, gameState?.stage, gameState?.handNumber, gameState?.finished]);

    if (!isOpen) return null;

    const Rules = global.NuoPokerRules;
    if (!Rules) return null;

    const isFourPlayerMode = gameMode === "hongshi" || gameMode === "niangniang";
    const maxInviteCount = isFourPlayerMode ? 3 : 5;
    const minInviteCount = isFourPlayerMode ? 3 : 2;

    const handleSwitchMode = (nextMode) => {
      setGameMode(nextMode);
      if (nextMode === "hongshi" || nextMode === "niangniang") {
        setSelectedIds((prev) => {
          if (prev.length > 3) return prev.slice(0, 3);
          if (prev.length < 3 && candidates.length >= 3) {
            const extra = candidates.map((c) => String(c.id)).filter((id) => !prev.includes(id));
            return [...prev, ...extra.slice(0, 3 - prev.length)];
          }
          return prev;
        });
      }
    };

    const toggleSelectChar = (cid) => {
      setSelectedIds((prev) => {
        if (prev.includes(cid)) return prev.filter((x) => x !== cid);
        if (prev.length >= maxInviteCount) {
          flashToast(isFourPlayerMode ? "该玩法固定 4 人局，请邀请 3 位名士" : "一桌最多邀请 5 位名士（共 6 人局）");
          return prev;
        }
        return [...prev, cid];
      });
    };

    const startTableSession = async () => {
      const picked = candidates.filter((c) => selectedIds.includes(String(c.id)));
      if (isFourPlayerMode && picked.length !== 3) {
        flashToast("红十 / 打娘娘为 4 人牌局，请正好选择 3 位名士");
        return;
      }
      if (!isFourPlayerMode && picked.length < 2) {
        flashToast("请至少邀请 2 位名士入座");
        return;
      }
      sessionTokenRef.current += 1;
      const bundle = await buildTableContextBundle(picked);
      contextBundleRef.current = bundle;

      const userAvatarResolved = await resolveAvatarUrl(bundle.userPersona.avatar);
      if (userAvatarResolved) {
        setResolvedAvatars((prev) => ({ ...prev, __me__: userAvatarResolved }));
      }

      const seats = [
        { id: "__me__", name: bundle.userPersona.name || "我", isUser: true, chips: startingChips, avatar: userAvatarResolved },
        ...picked.map((c) => ({
          id: String(c.id),
          name: c.name,
          isUser: false,
          chips: startingChips,
          avatar: resolvedAvatars[String(c.id)] || c.avatar || "",
          mbti: (c.profile && c.profile.mbti) || "",
          profile: c.profile || {}
        }))
      ];

      if (isFourPlayerMode) {
        setLocalSeatsMeta(seats);
        setPhase("table");
        return;
      }

      const initial = Rules.startNewHand(seats, {
        handNumber: 1,
        dealerIndex: 0,
        smallBlind: Math.floor(blindLevel / 2),
        bigBlind: blindLevel
      });
      if (initial.error) return flashToast(initial.error);

      setBubblesBySeat({});
      setTableChat([
        { id: "sys_start", sender: "荷官", text: `第 1 局开牌！盲注 ${Math.floor(blindLevel / 2)}/${blindLevel}，${initial.potEvents.join("，")}。`, isSys: true }
      ]);
      setGameState(initial);
      setShowRaisePanel(false);
      setPhase("table");
    };

    const startNextHand = () => {
      if (!gameState) return;
      sessionTokenRef.current += 1;
      const nextPlayers = gameState.players.map((p) => ({
        ...p,
        // 破产名士自动免费补齐筹码续局，保证牌桌不断人
        chips: p.chips <= 0 ? startingChips : p.chips
      }));
      const nextHandNum = (gameState.handNumber || 1) + 1;
      const nextDealer = (gameState.dealerIndex + 1) % nextPlayers.length;
      const next = Rules.startNewHand(nextPlayers, {
        handNumber: nextHandNum,
        dealerIndex: nextDealer,
        smallBlind: Math.floor(blindLevel / 2),
        bigBlind: blindLevel
      });
      setBubblesBySeat({});
      setTableChat((prev) => [
        ...prev.slice(-30),
        { id: `sys_${Date.now()}`, sender: "荷官", text: `第 ${nextHandNum} 局发牌！${next.potEvents.join("，")}。`, isSys: true }
      ]);
      setShowRaisePanel(false);
      setGameState(next);
    };

    const handleUserAction = (action, customRaiseTo = 0) => {
      if (!gameState || gameState.finished || gameState.turnIndex !== 0) return;
      const next = Rules.applyPlayerAction(gameState, 0, {
        action,
        raiseTo: customRaiseTo,
        forceFold: action === "fold"
      });
      const label = next.players[0]?.lastActionText || action;
      setTableChat((prev) => [
        ...prev.slice(-40),
        { id: `u_act_${Date.now()}`, sender: next.players[0]?.name || "我", text: `（${label}）`, isMe: true }
      ]);
      if (next.finished && next.winners && next.winners.length > 0) {
        savePokerRecord({
          handNumber: next.handNumber,
          pot: next.pot,
          winners: next.winners.map((w) => `${w.name}(${w.handName}+${w.amount})`),
          players: next.players.map((p) => ({ name: p.name, chips: p.chips }))
        });
      }
      setShowRaisePanel(false);
      setGameState(next);
    };

    const handleSendTableBanter = () => {
      const txt = chatInput.trim();
      if (!txt) return;
      const meName = gameState?.players?.[0]?.name || "我";
      setTableChat((prev) => [...prev.slice(-40), { id: `banter_${Date.now()}`, sender: meName, text: txt, isMe: true }]);
      setChatInput("");
    };

    const handleShareResultToChat = async () => {
      if (!gameState || !global.chatHistoryStore || typeof global.chatHistoryStore.appendMessage !== "function") return;
      const winText = (gameState.winners || []).map((w) => `${w.name} 凭「${w.handName}」赢得 ${w.amount}`).join("、");
      const summary = `🃏 刚在「傩·扑克」打完第 ${gameState.handNumber} 局（底池 💎${gameState.pot}）：${winText || "牌局结束"}！`;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const aiPlayers = gameState.players.filter((p) => !p.isUser);
      for (const p of aiPlayers) {
        try {
          await global.chatHistoryStore.appendMessage(p.id, {
            id: `poker_share_${Date.now()}_${p.id}`,
            isMe: true,
            sender: "我",
            senderId: "me",
            text: summary,
            time: hhmm,
            timestamp: Date.now()
          });
        } catch (e) {}
      }
      flashToast("✉️ 已同步战报给入座名士");
    };

    // ==========================================
    // 视图 A：邀请入座大厅（Lobby）
    // ==========================================
    if (phase === "lobby") {
      return h(
        "div",
        {
          style: {
            position: "fixed",
            inset: 0,
            zIndex: 99990,
            background: "#F6F7FC",
            color: "#1E293B",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }
        },
        h(
          "div",
          {
            style: {
              padding: "calc(10px + env(safe-area-inset-top, 0px)) 14px 10px",
              background: "#FFFFFF",
              borderBottom: "1px solid #ECEEFE",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }
          },
          h("button", { type: "button", onClick: onClose, style: { border: "none", background: "#F1F5F9", color: "#475569", borderRadius: "10px", padding: "6px 10px", fontWeight: 700, cursor: "pointer" } }, "←"),
          h("span", { style: { fontSize: "15px", fontWeight: 800, color: "#312E81" } }, "🃏 傩·扑克 · 邀约入座"),
          h("button", { type: "button", onClick: () => setShowRulesHelp(true), style: { border: "none", background: "#ECEEFE", color: "#6D5CE7", borderRadius: "50%", width: "28px", height: "28px", fontWeight: 800, cursor: "pointer" } }, "?")
        ),
        toast &&
          h("div", { style: { position: "fixed", top: "62px", left: "50%", transform: "translateX(-50%)", zIndex: 99998, background: "#312E81", color: "#FFF", padding: "6px 14px", borderRadius: "999px", fontSize: "12px", fontWeight: 700 } }, toast),
        h(
          "div",
          { style: { flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "14px" } },
          // 玩法模式切换胶囊（德州 / 红十 / 打娘娘）
          h(
            "div",
            { style: { background: "#FFFFFF", borderRadius: "16px", padding: "6px", boxShadow: "0 4px 16px rgba(124,107,240,0.06)", border: "1px solid #ECEEFE", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" } },
            [
              { id: "texas", icon: "♠️", label: "德州扑克" },
              { id: "hongshi", icon: "🔟", label: "红十" },
              { id: "niangniang", icon: "👑", label: "打娘娘" }
            ].map((m) =>
              h(
                "button",
                {
                  key: m.id,
                  type: "button",
                  onClick: () => handleSwitchMode(m.id),
                  style: {
                    border: "none",
                    borderRadius: "12px",
                    padding: "9px 4px",
                    fontSize: "12.5px",
                    fontWeight: 800,
                    cursor: "pointer",
                    background: gameMode === m.id ? "linear-gradient(135deg, #8B7CF6 0%, #6D5CE7 100%)" : "#F8FAFC",
                    color: gameMode === m.id ? "#FFFFFF" : "#475569",
                    boxShadow: gameMode === m.id ? "0 4px 12px rgba(109,92,231,0.25)" : "none"
                  }
                },
                `${m.icon} ${m.label}`
              )
            )
          ),
          h(
            "div",
            { style: { background: "#FFFFFF", borderRadius: "18px", padding: "14px", boxShadow: "0 4px 16px rgba(124,107,240,0.06)", border: "1px solid #ECEEFE" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" } },
              h("span", { style: { fontSize: "13px", fontWeight: 700, color: "#334155" } },
                isFourPlayerMode
                  ? `邀请名士（已选 ${selectedIds.length}/3，固定 4 人局）`
                  : `邀请名士（已选 ${selectedIds.length}/5，至少 2 位）`
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    const pickN = isFourPlayerMode ? 3 : Math.min(4, candidates.length);
                    const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, pickN);
                    setSelectedIds(shuffled.map((c) => String(c.id)));
                  },
                  style: { border: "none", background: "#ECEEFE", color: "#6D5CE7", borderRadius: "999px", padding: "4px 10px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }
                },
                "🎲 随机凑桌"
              )
            ),
            h(
              "div",
              { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" } },
              candidates.map((c) => {
                const cid = String(c.id);
                const checked = selectedIds.includes(cid);
                const av = resolvedAvatars[cid];
                return h(
                  "div",
                  {
                    key: cid,
                    onClick: () => toggleSelectChar(cid),
                    style: {
                      padding: "8px 6px",
                      borderRadius: "14px",
                      border: checked ? "2px solid #7C6BF0" : "1.5px solid #E2E8F0",
                      background: checked ? "#F5F3FF" : "#FFFFFF",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "5px",
                      cursor: "pointer"
                    }
                  },
                  av
                    ? h("img", { src: av, alt: c.name, style: { width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover" } })
                    : h("div", { style: { width: "42px", height: "42px", borderRadius: "50%", background: "#C7D2FE", color: "#3730A3", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 } }, c.name.slice(0, 1)),
                  h("span", { style: { fontSize: "12px", fontWeight: 700, color: checked ? "#5B21B6" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" } }, c.name)
                );
              })
            )
          ),
          h(
            "div",
            { style: { background: "#FFFFFF", borderRadius: "18px", padding: "14px", boxShadow: "0 4px 16px rgba(124,107,240,0.06)", border: "1px solid #ECEEFE", display: "flex", flexDirection: "column", gap: "10px" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("span", { style: { fontSize: "12.5px", fontWeight: 700, color: "#475569" } }, "💎 初始筹码"),
              h(
                "div",
                { style: { display: "flex", gap: "6px" } },
                [500, 1000, 2000].map((v) =>
                  h("button", { key: v, type: "button", onClick: () => setStartingChips(v), style: { border: "none", borderRadius: "999px", padding: "4px 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: startingChips === v ? "#7C6BF0" : "#F1F5F9", color: startingChips === v ? "#FFF" : "#64748B" } }, v)
                )
              )
            ),
            !isFourPlayerMode &&
              h(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                h("span", { style: { fontSize: "12.5px", fontWeight: 700, color: "#475569" } }, "🪙 盲注级别"),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px" } },
                  [20, 50].map((bb) =>
                    h("button", { key: bb, type: "button", onClick: () => setBlindLevel(bb), style: { border: "none", borderRadius: "999px", padding: "4px 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: blindLevel === bb ? "#7C6BF0" : "#F1F5F9", color: blindLevel === bb ? "#FFF" : "#64748B" } }, `${bb / 2}/${bb}`)
                  )
                )
              )
          )
        ),
        h(
          "div",
          { style: { padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))", background: "#FFFFFF", borderTop: "1px solid #ECEEFE" } },
          h(
            "button",
            {
              type: "button",
              disabled: selectedIds.length < minInviteCount || (isFourPlayerMode && selectedIds.length !== 3),
              onClick: startTableSession,
              style: {
                width: "100%",
                padding: "13px",
                borderRadius: "999px",
                border: "none",
                background: (selectedIds.length < minInviteCount || (isFourPlayerMode && selectedIds.length !== 3)) ? "#CBD5E1" : "linear-gradient(135deg, #8B7CF6 0%, #6D5CE7 100%)",
                color: "#FFFFFF",
                fontSize: "15px",
                fontWeight: 800,
                boxShadow: "0 8px 20px rgba(109, 92, 231, 0.28)",
                cursor: (selectedIds.length < minInviteCount || (isFourPlayerMode && selectedIds.length !== 3)) ? "not-allowed" : "pointer"
              }
            },
            gameMode === "hongshi"
              ? `🔟 开局打红十（4 人桌）`
              : gameMode === "niangniang"
              ? `👑 开局打娘娘（4 人桌）`
              : `🃏 开局发牌（${selectedIds.length + 1} 人桌）`
          )
        ),
        showRulesHelp &&
          h(
            "div",
            {
              onClick: (e) => { if (e.target === e.currentTarget) setShowRulesHelp(false); },
              style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
            },
            h(
              "div",
              { style: { width: "100%", maxWidth: "330px", background: "#FFFFFF", borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", color: "#334155" } },
              h(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: "14px", color: "#312E81" } },
                h("span", null, gameMode === "hongshi" ? "🔟 红十速查规则" : gameMode === "niangniang" ? "👑 打娘娘速查规则" : "♠️ 德州扑克速查规则"),
                h("button", { type: "button", onClick: () => setShowRulesHelp(false), style: { border: "none", background: "#F1F5F9", borderRadius: "50%", width: "24px", height: "24px", cursor: "pointer" } }, "✕")
              ),
              h(
                "div",
                { style: { background: "#F6F7FC", borderRadius: "12px", padding: "10px", lineHeight: 1.75, whiteSpace: "pre-line" } },
                gameMode === "hongshi"
                  ? "• 4人52张，持 ♥10 / ♦10 为红十方（双红十独打 1v3），其余为平民方。\n• 牌点：红十 > 2 > A > K > Q > J > 黑10 > 9…3。\n• 牌型：双红十(♥10♦10)最大 > 四张炸弹 > 三张/对子/单张。\n• 亮红十积分 ×2；包揽头二游为双抓大胜！"
                  : gameMode === "niangniang"
                  ? "• 4人52张共13墩，必须跟领出花色，同花色最大吃墩；断门可甩牌！\n• ♠Q 黑桃娘娘：-100分（极力甩给别人！）\n• ♦J 御前侍卫：+100分（趁机抢下！）\n• ♣10 翻倍令：本局自身分值 ×2（单吃+50）\n• 独吃全红桃+♠Q 触发「凤仪天下」+300 反杀！"
                  : "• 3~6人局，每人2张暗牌 + 桌面5张公共牌，任选最大5张比牌。\n• 牌型：皇家同花顺 > 同花顺 > 四条 > 葫芦 > 同花 > 顺子 > 三条 > 两对 > 一对 > 高牌。"
              )
            )
          )
      );
    }

    // 视图 B-Local：红十 / 打娘娘 4 人手机竖屏独立牌桌
    if (phase === "table" && isFourPlayerMode && global.NuoPokerLocalTable) {
      const shareLocalSummary = async (summaryText) => {
        if (!global.chatHistoryStore || typeof global.chatHistoryStore.appendMessage !== "function") return;
        const now = new Date();
        const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        for (const s of localSeatsMeta.filter((x) => !x.isUser)) {
          try {
            await global.chatHistoryStore.appendMessage(s.id, {
              id: `poker_local_share_${Date.now()}_${s.id}`,
              isMe: true,
              sender: "我",
              senderId: "me",
              text: summaryText,
              time: hhmm,
              timestamp: Date.now()
            });
          } catch (e) {}
        }
        flashToast("✉️ 已同步战报给入座名士");
      };
      return h(global.NuoPokerLocalTable, {
        key: `${gameMode}_${sessionTokenRef.current}`,
        mode: gameMode,
        seatsMeta: localSeatsMeta,
        startingChips,
        contextBundle: contextBundleRef.current,
        resolvedAvatars,
        onBackToLobby: () => {
          sessionTokenRef.current += 1;
          setPhase("lobby");
        },
        onSaveRecord: savePokerRecord,
        onShareSummary: shareLocalSummary
      });
    }

    // ==========================================
    // 视图 B：手机竖屏现代牌桌（Soft White & Lavender）
    // ==========================================
    const meSeat = gameState?.players?.[0];
    const aiSeats = (gameState?.players || []).slice(1);
    const isMyTurn = Boolean(gameState && !gameState.finished && gameState.turnIndex === 0);
    const myLegal = isMyTurn ? Rules.getLegalActions(gameState, 0) : null;
    const myBestHand = meSeat ? Rules.evaluateBestHand([...meSeat.holeCards, ...(gameState?.communityCards || [])]) : null;

    // 针对 2~5 位名士的手机竖屏对称环绕座位坐标（百分比）
    const seatCoordsMap = {
      2: [{ left: "24%", top: "4%" }, { left: "76%", top: "4%" }],
      3: [{ left: "16%", top: "14%" }, { left: "50%", top: "2%" }, { left: "84%", top: "14%" }],
      4: [{ left: "22%", top: "3%" }, { left: "78%", top: "3%" }, { left: "13%", top: "54%" }, { left: "87%", top: "54%" }],
      5: [{ left: "50%", top: "1%" }, { left: "15%", top: "16%" }, { left: "85%", top: "16%" }, { left: "13%", top: "62%" }, { left: "87%", top: "62%" }]
    };
    const coords = seatCoordsMap[aiSeats.length] || seatCoordsMap[3];

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99990,
          background: "#F6F7FC",
          color: "#1E293B",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          userSelect: "none"
        }
      },
      // 顶栏
      h(
        "div",
        {
          style: {
            padding: "calc(8px + env(safe-area-inset-top, 0px)) 12px 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("button", { type: "button", onClick: () => { sessionTokenRef.current += 1; setPhase("lobby"); }, style: { border: "none", background: "#FFFFFF", color: "#475569", borderRadius: "10px", padding: "5px 9px", fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,0.05)", cursor: "pointer" } }, "←"),
          h(
            "div",
            null,
            h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#312E81" } }, `GAME #${gameState.handNumber}`),
            h("div", { style: { fontSize: "10.5px", color: "#7C6BF0", fontWeight: 700 } }, Rules.STAGE_NAMES[gameState.stage] || gameState.stage)
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          h("button", { type: "button", onClick: () => setShowChatDrawer((v) => !v), style: { border: "none", background: showChatDrawer ? "#7C6BF0" : "#FFFFFF", color: showChatDrawer ? "#FFF" : "#6D5CE7", borderRadius: "999px", padding: "5px 10px", fontSize: "12px", fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,0.06)", cursor: "pointer" } }, `💬 ${tableChat.length}`),
          h("button", { type: "button", onClick: () => setShowRulesHelp(true), style: { border: "none", background: "#FFFFFF", color: "#6D5CE7", borderRadius: "50%", width: "28px", height: "28px", fontWeight: 800, boxShadow: "0 2px 6px rgba(0,0,0,0.06)", cursor: "pointer" } }, "?")
        )
      ),

      toast &&
        h("div", { style: { position: "fixed", top: "54px", left: "50%", transform: "translateX(-50%)", zIndex: 99998, background: "#312E81", color: "#FFF", padding: "5px 12px", borderRadius: "999px", fontSize: "11.5px", fontWeight: 700 } }, toast),

      // 中上部：椭圆薰衣草牌桌 + 环形名士座位
      h(
        "div",
        { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px" } },
        // 柔白紫晶椭圆牌桌本体
        h(
          "div",
          {
            style: {
              width: "76%",
              height: "66%",
              maxWidth: "320px",
              maxHeight: "340px",
              borderRadius: "140px",
              background: "radial-gradient(circle at 50% 40%, #F4F5FF 0%, #E8EBFE 100%)",
              border: "6px solid #FFFFFF",
              boxShadow: "0 14px 36px rgba(124, 107, 240, 0.14), inset 0 2px 10px rgba(124, 107, 240, 0.08)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              padding: "12px",
              boxSizing: "border-box",
              position: "relative"
            }
          },
          // 底池胶囊
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                borderRadius: "999px",
                padding: "4px 12px",
                boxShadow: "0 3px 10px rgba(124, 107, 240, 0.14)",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "13px",
                fontWeight: 800,
                color: "#4338CA"
              }
            },
            "💎",
            String(gameState.pot)
          ),
          // 5 张公共牌槽位
          h(
            "div",
            { style: { display: "flex", gap: "4px", justifyContent: "center", flexWrap: "nowrap" } },
            [0, 1, 2, 3, 4].map((slot) => {
              const card = gameState.communityCards[slot];
              return card
                ? h(React.Fragment, { key: slot }, renderCard(h, card, { size: "md" }))
                : h("div", { key: slot, style: { width: "40px", height: "56px", borderRadius: "8px", border: "1.5px dashed rgba(124,107,240,0.28)", background: "rgba(255,255,255,0.45)" } });
            })
          ),
          // 桌内彩色筹码点缀
          h(
            "div",
            { style: { display: "flex", gap: "4px", alignItems: "center" } },
            CHIP_COLORS.slice(0, Math.min(5, Math.max(2, Math.ceil(gameState.pot / 80)))).map((ch, idx) =>
              h("span", { key: idx, style: { width: "16px", height: "16px", borderRadius: "50%", background: ch.bg, border: `2px dashed ${ch.ring}`, display: "inline-block", boxShadow: "0 2px 4px rgba(0,0,0,0.12)" } })
            )
          )
        ),

        // 环形名士座位
        aiSeats.map((p, idx) => {
          const seatIndex = idx + 1;
          const pos = coords[idx] || { left: "50%", top: "4%" };
          const isTurn = !gameState.finished && gameState.turnIndex === seatIndex;
          const isDealer = gameState.dealerIndex === seatIndex;
          const av = resolvedAvatars[p.id] || (isRenderableUrl(p.avatar) ? p.avatar : "");
          const bubble = bubblesBySeat[p.id];
          const showCards = gameState.finished && !p.folded;

          return h(
            "div",
            {
              key: p.id,
              style: {
                position: "absolute",
                left: pos.left,
                top: pos.top,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                opacity: p.folded ? 0.45 : 1,
                zIndex: isTurn ? 9 : 5,
                maxWidth: "106px"
              }
            },
            bubble &&
              h(
                "div",
                {
                  style: {
                    background: "#FFFFFF",
                    color: "#334155",
                    fontSize: "10px",
                    lineHeight: 1.35,
                    padding: "4px 7px",
                    borderRadius: "10px",
                    boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
                    border: "1px solid #E2E8F0",
                    maxWidth: "118px",
                    textAlign: "center",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden"
                  }
                },
                bubble
              ),
            h(
              "div",
              {
                style: {
                  background: "#FFFFFF",
                  borderRadius: "999px",
                  padding: "3px 8px 3px 3px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  border: isTurn ? "2px solid #7C6BF0" : "1.5px solid #ECEEFE",
                  boxShadow: isTurn ? "0 0 0 3px rgba(124,107,240,0.22)" : "0 4px 10px rgba(15,23,42,0.06)"
                }
              },
              av
                ? h("img", { src: av, alt: p.name, style: { width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                : h("div", { style: { width: "28px", height: "28px", borderRadius: "50%", background: "#C7D2FE", color: "#3730A3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, flexShrink: 0 } }, p.name.slice(0, 1)),
              h(
                "div",
                { style: { minWidth: 0 } },
                h("div", { style: { fontSize: "11px", fontWeight: 800, color: "#1E293B", whiteSpace: "nowrap" } }, `${p.name}${isDealer ? " Ⓓ" : ""}`),
                h("div", { style: { fontSize: "10px", color: "#7C6BF0", fontWeight: 700 } }, `💎${p.chips}`)
              )
            ),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "3px" } },
              p.holeCards.map((c, ci) => h(React.Fragment, { key: ci }, renderCard(h, c, { faceDown: !showCards, size: "sm" }))),
              p.lastActionText &&
                h("span", { style: { fontSize: "9.5px", fontWeight: 700, padding: "2px 6px", borderRadius: "999px", background: p.folded ? "#E2E8F0" : "#EDE9FE", color: p.folded ? "#64748B" : "#5B21B6", whiteSpace: "nowrap" } }, p.lastActionText)
            )
          );
        })
      ),

      // 回合提示胶囊（参考图正中 "It is your turn"）
      h(
        "div",
        { style: { display: "flex", justifyContent: "center", padding: "2px 12px 6px", flexShrink: 0 } },
        h(
          "div",
          {
            style: {
              background: "#FFFFFF",
              borderRadius: "999px",
              padding: "6px 16px",
              boxShadow: "0 4px 14px rgba(124, 107, 240, 0.14)",
              fontSize: "12.5px",
              fontWeight: 700,
              color: "#312E81",
              textAlign: "center"
            }
          },
          gameState.finished
            ? `🏆 ${(gameState.winners || []).map((w) => `${w.name} 胜出（${w.handName} +${w.amount}）`).join(" / ")}`
            : isMyTurn
            ? "✨ 轮到你行动"
            : `${gameState.players[thinkingSeat >= 0 ? thinkingSeat : gameState.turnIndex]?.name || "名士"} 正在掂量筹码…`
        )
      ),

      // 底部：我的大号手牌 + 单手操控台
      h(
        "div",
        {
          style: {
            background: "#FFFFFF",
            borderTop: "1px solid #ECEEFE",
            borderRadius: "22px 22px 0 0",
            padding: "12px 14px calc(12px + env(safe-area-inset-bottom, 0px))",
            boxShadow: "0 -6px 24px rgba(124, 107, 240, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            flexShrink: 0
          }
        },
        // 我的手牌 + 可用筹码 + 当前成牌提示
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px" } },
            (meSeat?.holeCards || []).map((c, idx) => h(React.Fragment, { key: idx }, renderCard(h, c, { size: "lg" }))),
            h(
              "div",
              null,
              h("div", { style: { fontSize: "12px", fontWeight: 800, color: "#1E293B" } }, `${meSeat?.name || "我"}${gameState.dealerIndex === 0 ? " Ⓓ" : ""}`),
              h("div", { style: { fontSize: "11px", color: "#7C6BF0", fontWeight: 700, marginTop: "2px" } }, myBestHand ? myBestHand.name : "")
            )
          ),
          h(
            "div",
            { style: { textAlign: "right" } },
            h("div", { style: { fontSize: "16px", fontWeight: 900, color: "#312E81" } }, `💎 ${meSeat?.chips || 0}`),
            h("div", { style: { fontSize: "10.5px", color: "#94A3B8" } }, meSeat?.betThisStreet ? `本轮已下 ${meSeat.betThisStreet}` : "可用筹码")
          )
        ),

        // 加注筹码选择条（点加注时展开）
        showRaisePanel &&
          myLegal &&
          myLegal.canRaise &&
          h(
            "div",
            { style: { background: "#F6F7FC", borderRadius: "14px", padding: "8px 10px", display: "flex", flexDirection: "column", gap: "8px" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" } },
              CHIP_COLORS.map((ch) =>
                h(
                  "button",
                  {
                    key: ch.val,
                    type: "button",
                    onClick: () => setRaiseAmount((prev) => Math.min(myLegal.maxRaiseTo, Math.max(myLegal.minRaiseTo, prev + ch.val))),
                    style: { width: "36px", height: "36px", borderRadius: "50%", background: ch.bg, border: `2.5px dashed ${ch.ring}`, color: "#FFF", fontSize: "11px", fontWeight: 800, cursor: "pointer", padding: 0 }
                  },
                  `+${ch.val}`
                )
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => setRaiseAmount(myLegal.maxRaiseTo),
                  style: { border: "none", borderRadius: "999px", background: "#EF4444", color: "#FFF", padding: "6px 10px", fontSize: "11px", fontWeight: 800, cursor: "pointer" }
                },
                "梭哈"
              )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "8px", alignItems: "center" } },
              h("input", {
                type: "range",
                min: myLegal.minRaiseTo,
                max: myLegal.maxRaiseTo,
                step: Math.max(5, Math.floor(blindLevel / 2)),
                value: Math.max(myLegal.minRaiseTo, Math.min(myLegal.maxRaiseTo, raiseAmount)),
                onChange: (e) => setRaiseAmount(Number(e.target.value)),
                style: { flex: 1, accentColor: "#7C6BF0" }
              }),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => handleUserAction("raise", Math.max(myLegal.minRaiseTo, Math.min(myLegal.maxRaiseTo, raiseAmount))),
                  style: { border: "none", borderRadius: "999px", background: "#7C6BF0", color: "#FFF", padding: "6px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }
                },
                `加至 ${Math.max(myLegal.minRaiseTo, Math.min(myLegal.maxRaiseTo, raiseAmount))}`
              )
            )
          ),

        // 行动按钮区（结束时切为下一局/发战报，进行中为跟注/弃牌/加注）
        gameState.finished
          ? h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(
                "button",
                {
                  type: "button",
                  onClick: startNextHand,
                  style: { flex: 1.5, padding: "12px", borderRadius: "999px", border: "none", background: "linear-gradient(135deg, #8B7CF6 0%, #6D5CE7 100%)", color: "#FFF", fontSize: "14px", fontWeight: 800, cursor: "pointer" }
                },
                "🃏 下一局"
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: handleShareResultToChat,
                  style: { flex: 1, padding: "12px", borderRadius: "999px", border: "1.5px solid #DDD6FE", background: "#F5F3FF", color: "#6D28D9", fontSize: "13px", fontWeight: 800, cursor: "pointer" }
                },
                "✉️ 发战报"
              )
            )
          : h(
              React.Fragment,
              null,
              h(
                "button",
                {
                  type: "button",
                  disabled: !isMyTurn,
                  onClick: () => handleUserAction(myLegal?.canCheck ? "check" : "call"),
                  style: {
                    width: "100%",
                    padding: "12px",
                    borderRadius: "999px",
                    border: "none",
                    background: !isMyTurn ? "#E2E8F0" : "linear-gradient(135deg, #8B7CF6 0%, #6D5CE7 100%)",
                    color: !isMyTurn ? "#94A3B8" : "#FFFFFF",
                    fontSize: "14.5px",
                    fontWeight: 800,
                    boxShadow: isMyTurn ? "0 6px 18px rgba(109, 92, 231, 0.28)" : "none",
                    cursor: isMyTurn ? "pointer" : "not-allowed"
                  }
                },
                !isMyTurn ? "等待名士出牌…" : myLegal.canCheck ? "过牌 Check" : `跟注 💎 ${myLegal.toCall}`
              ),
              h(
                "div",
                { style: { display: "flex", gap: "8px" } },
                h(
                  "button",
                  {
                    type: "button",
                    disabled: !isMyTurn,
                    onClick: () => handleUserAction("fold"),
                    style: { flex: 1, padding: "9px", borderRadius: "999px", border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", fontSize: "12.5px", fontWeight: 700, cursor: isMyTurn ? "pointer" : "not-allowed" }
                  },
                  "弃牌"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: !isMyTurn || !myLegal?.canRaise,
                    onClick: () => {
                      if (myLegal) setRaiseAmount(myLegal.minRaiseTo);
                      setShowRaisePanel((v) => !v);
                    },
                    style: { flex: 1, padding: "9px", borderRadius: "999px", border: "1px solid #DDD6FE", background: showRaisePanel ? "#EDE9FE" : "#F5F3FF", color: "#6D28D9", fontSize: "12.5px", fontWeight: 700, cursor: isMyTurn && myLegal?.canRaise ? "pointer" : "not-allowed" }
                  },
                  "加注"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => setShowChatDrawer(true),
                    style: { flex: 1, padding: "9px", borderRadius: "999px", border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }
                  },
                  "💬 嘴炮"
                )
              )
            )
      ),

      // 牌桌群聊抽屉
      showChatDrawer &&
        h(
          "div",
          {
            onClick: (e) => { if (e.target === e.currentTarget) setShowChatDrawer(false); },
            style: { position: "fixed", inset: 0, zIndex: 99995, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "flex-end" }
          },
          h(
            "div",
            { style: { width: "100%", height: "54%", background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: "13.5px", color: "#312E81" } },
              h("span", null, "💬 牌桌闲聊（全桌名士实时听见）"),
              h("button", { type: "button", onClick: () => setShowChatDrawer(false), style: { border: "none", background: "#F1F5F9", borderRadius: "999px", padding: "4px 10px", fontSize: "12px", cursor: "pointer" } }, "收起")
            ),
            h(
              "div",
              { style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" } },
              tableChat.map((m) =>
                h(
                  "div",
                  {
                    key: m.id,
                    style: {
                      alignSelf: m.isSys ? "center" : m.isMe ? "flex-end" : "flex-start",
                      background: m.isSys ? "#F1F5F9" : m.isMe ? "#7C6BF0" : "#F5F3FF",
                      color: m.isSys ? "#64748B" : m.isMe ? "#FFFFFF" : "#312E81",
                      padding: "6px 10px",
                      borderRadius: "12px",
                      maxWidth: "85%"
                    }
                  },
                  !m.isSys && h("strong", { style: { marginRight: "5px" } }, `${m.sender}：`),
                  m.text
                )
              )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "6px" } },
              h("input", {
                type: "text",
                value: chatInput,
                onChange: (e) => setChatInput(e.target.value),
                onKeyDown: (e) => e.key === "Enter" && handleSendTableBanter(),
                placeholder: "说句嘴炮或诈唬干扰名士们…",
                style: { flex: 1, border: "1px solid #E2E8F0", borderRadius: "999px", padding: "7px 12px", fontSize: "12.5px", outline: "none" }
              }),
              h("button", { type: "button", onClick: handleSendTableBanter, style: { border: "none", borderRadius: "999px", background: "#7C6BF0", color: "#FFF", padding: "7px 14px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" } }, "发送")
            )
          )
        ),

      // ? 牌型大小速查弹窗
      showRulesHelp &&
        h(
          "div",
          {
            onClick: (e) => { if (e.target === e.currentTarget) setShowRulesHelp(false); },
            style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "330px", background: "#FFFFFF", borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", color: "#334155" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: "14px", color: "#312E81" } },
              h("span", null, "🃏 德州扑克牌型大小"),
              h("button", { type: "button", onClick: () => setShowRulesHelp(false), style: { border: "none", background: "#F1F5F9", borderRadius: "50%", width: "24px", height: "24px", cursor: "pointer" } }, "✕")
            ),
            h("div", { style: { lineHeight: 1.65 } }, "每人 2 张底牌 + 桌面 5 张公共牌，任选最大 5 张比牌："),
            h("div", { style: { background: "#F6F7FC", borderRadius: "12px", padding: "10px", lineHeight: 1.8, fontWeight: 600 } }, "1. 皇家同花顺 > 2. 同花顺 > 3. 四条 > 4. 葫芦（三条+一对）> 5. 同花 > 6. 顺子 > 7. 三条 > 8. 两对 > 9. 一对 > 10. 高牌")
          )
        )
    );
  }

  const api = {
    DB_NAME,
    savePokerRecord,
    loadInviteCandidates,
    requestAiPokerDecision,
    NuoPokerModal
  };

  global.NuoPokerApp = api;
  global.NuoPokerModal = NuoPokerModal;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

