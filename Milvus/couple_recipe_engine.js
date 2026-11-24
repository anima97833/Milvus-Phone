/**
 * Milvus/couple_recipe_engine.js
 * 情侣空间 ·「旧日食谱 2.0」独立智能化引擎
 * - 双模式：✨ AI 私房厨房（时令+人设点菜 / 食材与任意菜名定制 / 名士试吃点评） vs 📜 离线经典菜谱
 * - 独立 IndexedDB: milvus_couple_leisure_idb (saved_recipes 表，零 localStorage 写入)
 * - 支持一键将做好的「私房食单」同步发回传讯主线
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_couple_leisure_idb";
  const DB_VERSION = 1;
  const STORE_FEIHUA = "saved_feihua";
  const STORE_RECIPES = "saved_recipes";

  // ==========================================
  // 1. 独立 IDB 菜谱收藏库（零 localStorage 写入）
  // ==========================================
  let _dbPromise = null;
  let _memRecipes = [];

  function openDb() {
    if (typeof indexedDB === "undefined" || !indexedDB) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_FEIHUA)) {
            db.createObjectStore(STORE_FEIHUA, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(STORE_RECIPES)) {
            db.createObjectStore(STORE_RECIPES, { keyPath: "id" });
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

  async function saveRecipeToVault(recipe, charMeta = {}) {
    if (!recipe || !recipe.name) return null;
    const rec = {
      ...recipe,
      id: recipe.id || `rcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      charId: String(charMeta.charId || recipe.charId || ""),
      charName: String(charMeta.charName || recipe.charName || "名士"),
      savedAt: Date.now()
    };
    const db = await openDb();
    if (!db) {
      _memRecipes = [rec, ..._memRecipes.filter((r) => r.id !== rec.id)];
      return rec;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_RECIPES, "readwrite");
        tx.objectStore(STORE_RECIPES).put(rec);
        tx.oncomplete = () => resolve(rec);
        tx.onerror = () => resolve(rec);
      } catch (e) {
        resolve(rec);
      }
    });
  }

  async function listSavedRecipes() {
    const db = await openDb();
    if (!db) return [..._memRecipes].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_RECIPES, "readonly");
        const req = tx.objectStore(STORE_RECIPES).getAll();
        req.onsuccess = () => {
          const arr = Array.isArray(req.result) ? req.result : [];
          resolve(arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)));
        };
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async function deleteSavedRecipe(id) {
    const db = await openDb();
    if (!db) {
      _memRecipes = _memRecipes.filter((r) => r.id !== id);
      return true;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_RECIPES, "readwrite");
        tx.objectStore(STORE_RECIPES).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  // ==========================================
  // 2. 时令感知 & 菜谱结构标准化
  // ==========================================
  function getMealTimeContext(now = new Date()) {
    const m = now.getMonth() + 1;
    const h = now.getHours();
    const season = m >= 3 && m <= 5 ? "春季" : m >= 6 && m <= 8 ? "夏季" : m >= 9 && m <= 11 ? "秋季" : "冬季";
    const mealSlot =
      h >= 5 && h < 10 ? "晨食（早餐）" :
      h >= 10 && h < 14 ? "午膳（午餐）" :
      h >= 14 && h < 17 ? "午后茶点" :
      h >= 17 && h < 21 ? "晚膳（晚餐）" :
      "深夜宵夜";
    return { season, mealSlot, hour: h };
  }

  function extractJsonObject(raw) {
    const cleaned = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1].trim() : cleaned;
    const s = body.indexOf("{");
    const e = body.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try {
      return JSON.parse(body.slice(s, e + 1));
    } catch (err) {
      return null;
    }
  }

  function normalizeRecipeObject(rawObj) {
    if (!rawObj || typeof rawObj !== "object" || !rawObj.name) return null;
    const ing = rawObj.ingredients || {};
    const toArr = (v) => (Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : []);
    const main = Array.isArray(ing) ? toArr(ing) : toArr(ing.main);
    const sub = Array.isArray(ing) ? [] : toArr(ing.sub);
    const seasoning = Array.isArray(ing) ? [] : toArr(ing.seasoning);
    const steps = toArr(rawObj.steps);
    return {
      id: `ai_rcp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: String(rawObj.name).trim().slice(0, 24),
      category: String(rawObj.category || "私房定制").trim().slice(0, 12),
      cuisine: String(rawObj.cuisine || "家常雅味").trim().slice(0, 12),
      difficulty: String(rawObj.difficulty || "家常易做").trim().slice(0, 10),
      timeCost: String(rawObj.timeCost || "25分钟").trim().slice(0, 12),
      summary: String(rawObj.summary || "色香味俱佳，适合今日趁热品尝。").trim().slice(0, 120),
      ingredients: {
        main: main.length > 0 ? main : ["主料适量"],
        sub,
        seasoning
      },
      steps: steps.length > 0 ? steps : ["备齐食材洗净切配", "热锅下料翻炒至熟透调味出锅"],
      tips: String(rawObj.tips || "").trim().slice(0, 120),
      isAiGenerated: true
    };
  }

  // ==========================================
  // 3. LLM 调用封装（复用主 API）
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

  async function callLeisureLlm(messages, { maxTokens = 560, timeoutMs = 15000, customChatFn = null } = {}) {
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
          temperature: 0.8,
          max_tokens: maxTokens
        })
      });
      if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
      const json = await resp.json();
      return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
    };
    return Promise.race([
      invoke(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("LLM_TIMEOUT")), timeoutMs))
    ]);
  }

  function buildCharPersonaBlock(taCharacter, mePersona) {
    const pf = (taCharacter && taCharacter.profile) || {};
    const lines = [
      `- 角色姓名与ID：${taCharacter?.name || "名士"} (${taCharacter?.id || ""})`,
      pf.mbti ? `- MBTI：${pf.mbti}` : "",
      pf.constellation || pf.zodiac ? `- 星座：${pf.constellation || pf.zodiac}` : "",
      pf.style || pf.speakingStyle ? `- 语言风格：${pf.style || pf.speakingStyle}` : "",
      pf.personality ? `- 性格特点：${pf.personality}` : "",
      pf.background || pf.description ? `- 个人背景：${String(pf.background || pf.description).slice(0, 260)}` : ""
    ].filter(Boolean);
    const uName = mePersona?.name || "楼主";
    return `${lines.join("\n")}\n- 共餐对象（用户）：${uName}`;
  }

  // ==========================================
  // 4. 核心智能接口：AI 点菜 / 食材定制 / 名士试吃点评
  // ==========================================
  async function recommendAiRecipe({ taCharacter, mePersona, keyword = "", aiMode = true, customChatFn = null } = {}) {
    const offlineFallback = () => {
      if (global.mcpCuisineEngine && typeof global.mcpCuisineEngine.recommendDish === "function") {
        const res = global.mcpCuisineEngine.recommendDish(taCharacter?.name || "名士", keyword);
        if (res && res.dish) return { ok: true, usedAi: false, dish: res.dish, dialogue: res.dialogue };
      }
      return { ok: false, usedAi: false, error: "离线菜谱暂不可用" };
    };

    if (!aiMode) return offlineFallback();

    const { season, mealSlot } = getMealTimeContext();
    const sysPrompt = [
      `你是【${taCharacter?.name || "名士"}】，正在情侣空间「旧日食谱」与用户商量吃什么。`,
      buildCharPersonaBlock(taCharacter, mePersona),
      `【当前时令】${season} · ${mealSlot}。`,
      "请结合你的籍贯口味偏好、性格与当前时段，推荐一道**现代厨房真能照做的真实美味菜肴**（中式家常、古风名菜或精致点心皆可），给出精准克数食材与实操步骤，并附一句符合你口吻的点菜台词。",
      "严格输出纯 JSON 对象：",
      '{"dialogue":"你点菜时的活人感台词(25~60字)","name":"菜名","category":"分类","cuisine":"菜系风味","difficulty":"初级/中级","timeCost":"约XX分钟","summary":"一句话诱人简介","ingredients":{"main":["主料含克数"],"sub":["辅料"],"seasoning":["调味"]},"steps":["步骤1","步骤2","步骤3","步骤4"],"tips":"火候或私房小贴士"}'
    ].join("\n");

    const userPrompt = keyword ? `用户补充想吃的方向/关键词：「${keyword}」。请为我点一道菜并给出完整菜谱。` : `现在是${season}${mealSlot}，你现在最想吃什么？请点一道菜并附上做法。`;

    try {
      const raw = await callLeisureLlm(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt }
        ],
        { maxTokens: 580, timeoutMs: 15000, customChatFn }
      );
      const parsed = extractJsonObject(raw);
      const dish = normalizeRecipeObject(parsed);
      if (dish) {
        return {
          ok: true,
          usedAi: true,
          dish,
          dialogue: String(parsed.dialogue || `今日${mealSlot}，不如尝尝这道《${dish.name}》？`).slice(0, 120)
        };
      }
    } catch (e) {}

    return offlineFallback();
  }

  async function customizeRecipeByInput({ taCharacter, mePersona, userInput = "", mode = "ingredients", aiMode = true, customChatFn = null } = {}) {
    const query = String(userInput || "").trim();
    if (!query) return { ok: false, error: "请先输入菜名或手头食材！" };

    if (!aiMode) {
      if (global.mcpCookbookEngine && typeof global.mcpCookbookEngine.fetchOnlineRecipe === "function") {
        const res = await global.mcpCookbookEngine.fetchOnlineRecipe(query);
        if (res) return { ok: true, usedAi: false, dish: res, dialogue: `《${res.name}》离线秘籍已调阅就绪！` };
      }
      return { ok: false, error: "离线模式未检索到该菜谱，可切至 ✨ AI 私房模式自由定制。" };
    }

    const { season, mealSlot } = getMealTimeContext();
    const taskDesc =
      mode === "ingredients"
        ? `用户冰箱/手头现有食材：【${query}】。请巧妙利用这些现有食材（可补常见基础调料），定制一道最下饭、现代厨房零门槛可做的美味菜肴。`
        : `用户点名想做这道菜：【${query}】。请给出一份现代厨房实操级详细菜谱，并结合你的口味给出微调建议。`;

    const sysPrompt = [
      `你是【${taCharacter?.name || "名士"}】，正在情侣空间陪用户定制私房菜谱（${season} · ${mealSlot}）。`,
      buildCharPersonaBlock(taCharacter, mePersona),
      taskDesc,
      "严格输出纯 JSON 对象：",
      '{"dialogue":"你看到这些食材/菜名后的本人性格点评(25~60字)","name":"菜名","category":"私房定制","cuisine":"风味","difficulty":"初级/中级","timeCost":"约XX分钟","summary":"一句话简介","ingredients":{"main":["主料含克数"],"sub":["辅料"],"seasoning":["调味"]},"steps":["步骤1","步骤2","步骤3","步骤4"],"tips":"关键火候贴士"}'
    ].join("\n");

    try {
      const raw = await callLeisureLlm(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: query }
        ],
        { maxTokens: 580, timeoutMs: 15000, customChatFn }
      );
      const parsed = extractJsonObject(raw);
      const dish = normalizeRecipeObject(parsed);
      if (dish) {
        return {
          ok: true,
          usedAi: true,
          dish,
          dialogue: String(parsed.dialogue || `用这些来做《${dish.name}》再合适不过。`).slice(0, 120)
        };
      }
    } catch (e) {}

    return { ok: false, error: "AI 定制菜谱暂时繁忙，请稍后再试或切至离线模式。" };
  }

  async function requestTaTastingFeedback({ taCharacter, mePersona, dish, cookNote = "", aiMode = true, customChatFn = null } = {}) {
    if (!dish || !dish.name) return null;
    const note = String(cookNote || "").trim() || `为 ${taCharacter?.name || "名士"} 亲手烹制，趁热端上桌。`;
    const fallback = {
      usedAi: false,
      action: "夹起一筷细细品尝",
      comment: `这盘《${dish.name}》火候正好，合我心意。辛苦你下厨了。`,
      scoreDelta: 15
    };
    if (!aiMode) return fallback;

    const sysPrompt = [
      `你是【${taCharacter?.name || "名士"}】，用户刚刚亲手为你做好了一道《${dish.name}》端上桌。`,
      buildCharPersonaBlock(taCharacter, mePersona),
      `用户端菜时的附言/做菜小记：「${note}」。`,
      "请完全贴合你的性格给出真实鲜活的试吃反馈（若用户说放咸了/糊了，按你性格体贴宽慰或嘴硬傲娇但还是吃光；若做得很棒则真诚夸赞）。",
      '严格输出 JSON：{"action":"8~16字试吃动作神态","comment":"30~75字第一人称品评台词","scoreDelta":15}'
    ].join("\n");

    try {
      const raw = await callLeisureLlm(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: `我端上了亲手做的《${dish.name}》，附言：${note}` }
        ],
        { maxTokens: 220, timeoutMs: 10000, customChatFn }
      );
      const parsed = extractJsonObject(raw);
      if (parsed && parsed.comment) {
        const delta = Math.max(10, Math.min(25, Math.round(Number(parsed.scoreDelta) || 15)));
        return {
          usedAi: true,
          action: String(parsed.action || "尝了一口，眉眼微动").slice(0, 24),
          comment: String(parsed.comment).trim().slice(0, 120),
          scoreDelta: delta
        };
      }
    } catch (e) {}

    return fallback;
  }

  async function sendRecipeCardToChat({ taCharacter, dish, cookNote = "", tastingComment = "" } = {}) {
    const cid = String(taCharacter?.id || "");
    if (!cid || !dish || !global.chatHistoryStore || typeof global.chatHistoryStore.appendMessage !== "function") return false;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const lines = [`🍲 刚在情侣空间为你备好《${dish.name}》`];
    if (cookNote) lines.push(`备菜小记：${cookNote}`);
    if (tastingComment) lines.push(`${taCharacter?.name || "TA"}试吃评价：「${tastingComment}」`);
    const msg = {
      id: `recipe_share_${Date.now()}`,
      isMe: true,
      sender: "我",
      senderId: "me",
      text: lines.join("\n"),
      time: hhmm,
      timestamp: Date.now()
    };
    try {
      await global.chatHistoryStore.appendMessage(cid, msg);
      return true;
    } catch (e) {
      return false;
    }
  }

  function RecipeSmartBar({
    aiMode,
    onToggleAiMode,
    busy = false,
    currentRecipe,
    taCharacter,
    mePersona,
    onApplyRecipe,
    onShareRecipe
  }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState } = React;
    const [openInput, setOpenInput] = useState(false);
    const [inputVal, setInputVal] = useState("");
    const [inputMode, setInputMode] = useState("ingredients"); // "ingredients" | "dish"
    const [savedTip, setSavedTip] = useState("");
    const [showHelp, setShowHelp] = useState(false);

    const flash = (m) => {
      setSavedTip(m);
      setTimeout(() => setSavedTip(""), 1800);
    };

    const helpItems = [
      { icon: "✨ / 📜", title: "AI 私房厨房 / 离线经典", desc: "✨ 按实时早午晚时段与名士籍贯口味实时定制完整菜谱，端上桌后 TA 会真实试吃点评；📜 切回本地经典菜谱库。" },
      { icon: "🥕", title: "看菜下锅 / 自由定制", desc: "展开定制输入条，可切换 🥬「输入手头食材」或 🍲「输入任意菜名」，即时生成可实操菜谱。" },
      { icon: "⭐", title: "收藏私房菜谱", desc: "将当前这道好菜永久收藏至独立私房宝库（不占本地缓存限额）。" },
      { icon: "✉️", title: "食单发回传讯", desc: "把刚做好的菜名、备菜小记与 TA 的试吃评价同步发回传讯聊天主线。" }
    ];

    const helpModal =
      showHelp &&
      h(
        "div",
        {
          onClick: (e) => { if (e.target === e.currentTarget) setShowHelp(false); },
          style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(38,35,30,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
        },
        h(
          "div",
          { style: { width: "100%", maxWidth: "340px", background: "#FAF8F5", borderRadius: "18px", border: "1px solid #E8D5C4", boxShadow: "0 16px 36px rgba(0,0,0,0.22)", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h("span", { style: { fontSize: "14px", fontWeight: 700, color: "#5A5F4D" } }, "🍲 旧日食谱 · 按钮说明"),
            h("button", { type: "button", onClick: () => setShowHelp(false), style: { border: "none", background: "#EFECE6", color: "#666", borderRadius: "50%", width: "24px", height: "24px", cursor: "pointer", fontSize: "12px" } }, "✕")
          ),
          helpItems.map((it) =>
            h(
              "div",
              { key: it.icon, style: { display: "flex", gap: "10px", alignItems: "flex-start", background: "#FFFFFF", border: "1px solid #EFECE6", borderRadius: "12px", padding: "8px 10px" } },
              h("span", { style: { minWidth: "46px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "#D6724B", background: "#FDF0E6", borderRadius: "8px", padding: "3px 5px", flexShrink: 0 } }, it.icon),
              h(
                "div",
                { style: { flex: 1, minWidth: 0 } },
                h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#44403C" } }, it.title),
                h("div", { style: { fontSize: "11px", color: "#78716C", lineHeight: 1.45, marginTop: "2px" } }, it.desc)
              )
            )
          )
        )
      );

    const portalHelp =
      helpModal && global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined"
        ? global.ReactDOM.createPortal(helpModal, document.body)
        : helpModal;

    const runCustom = async () => {
      if (!inputVal.trim() || busy) return;
      const res = await customizeRecipeByInput({
        taCharacter,
        mePersona,
        userInput: inputVal.trim(),
        mode: inputMode,
        aiMode
      });
      if (res && res.ok && typeof onApplyRecipe === "function") {
        onApplyRecipe(res);
        setInputVal("");
        setOpenInput(false);
      } else if (res && res.error) {
        alert(res.error);
      }
    };

    const btnStyle = (active) => ({
      border: active ? "1px solid #D6724B" : "1px solid #DDBAA8",
      background: active ? "#FDF0E6" : "#FFFFFF",
      color: "#A26148",
      borderRadius: "10px",
      padding: "4px 8px",
      fontSize: "12px",
      fontWeight: 700,
      cursor: busy ? "not-allowed" : "pointer",
      opacity: busy ? 0.6 : 1
    });

    return h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "6px" } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" } },
        h(
          "button",
          {
            type: "button",
            disabled: busy,
            title: aiMode ? "当前：AI 私房厨房（点击切离线菜谱）" : "当前：离线经典菜谱（点击切 AI 私房厨房）",
            onClick: onToggleAiMode,
            style: btnStyle(aiMode)
          },
          aiMode ? "✨" : "📜"
        ),
        h(
          "button",
          {
            type: "button",
            disabled: busy,
            title: "看菜下锅（输入手头食材或任意菜名定制）",
            onClick: () => setOpenInput((v) => !v),
            style: btnStyle(openInput)
          },
          "🥕"
        ),
        currentRecipe &&
          h(
            "button",
            {
              type: "button",
              disabled: busy,
              title: "收藏此菜谱至私房宝库",
              onClick: async () => {
                await saveRecipeToVault(currentRecipe, { charId: taCharacter?.id, charName: taCharacter?.name });
                flash("⭐");
              },
              style: btnStyle(savedTip === "⭐")
            },
            savedTip === "⭐" ? "✓" : "⭐"
          ),
        currentRecipe &&
          h(
            "button",
            {
              type: "button",
              disabled: busy,
              title: "将此菜谱发回传讯",
              onClick: async () => {
                if (typeof onShareRecipe === "function") {
                  const ok = await onShareRecipe();
                  if (ok) flash("✉️");
                }
              },
              style: btnStyle(savedTip === "✉️")
            },
            savedTip === "✉️" ? "✓" : "✉️"
          ),
        h(
          "button",
          {
            type: "button",
            title: "查看图标说明",
            onClick: () => setShowHelp(true),
            style: {
              border: "1px solid #DDBAA8",
              background: "#FFFFFF",
              color: "#8C917B",
              borderRadius: "50%",
              width: "24px",
              height: "24px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0
            }
          },
          "?"
        ),
        portalHelp
      ),
      openInput &&
        h(
          "div",
          { style: { display: "flex", gap: "5px", alignItems: "center", background: "#FAF7F2", padding: "6px 8px", borderRadius: "12px", border: "1px solid #E8D5C4" } },
          h(
            "button",
            {
              type: "button",
              title: inputMode === "ingredients" ? "按食材定制（点切按菜名）" : "按菜名定制（点切按食材）",
              onClick: () => setInputMode((m) => (m === "ingredients" ? "dish" : "ingredients")),
              style: { border: "1px solid #DDBAA8", background: "#FFF", color: "#A26148", borderRadius: "8px", padding: "4px 6px", fontSize: "11px", cursor: "pointer", flexShrink: 0 }
            },
            inputMode === "ingredients" ? "🥬" : "🍲"
          ),
          h("input", {
            type: "text",
            value: inputVal,
            onChange: (e) => setInputVal(e.target.value),
            onKeyDown: (e) => e.key === "Enter" && runCustom(),
            placeholder: inputMode === "ingredients" ? "输入手头食材（如：番茄、鸡蛋、肥牛）…" : "输入任意菜名（如：苏式蟹粉面）…",
            style: { flex: 1, minWidth: 0, border: "1px solid #EAEAEA", borderRadius: "8px", padding: "5px 8px", fontSize: "12px", outline: "none", background: "#FFF" }
          }),
          h(
            "button",
            {
              type: "button",
              disabled: busy || !inputVal.trim(),
              onClick: runCustom,
              style: { border: "none", background: "#D6724B", color: "#FFF", borderRadius: "8px", padding: "5px 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }
            },
            busy ? "…" : "✨"
          )
        )
    );
  }

  const api = {
    DB_NAME,
    getMealTimeContext,
    normalizeRecipeObject,
    recommendAiRecipe,
    customizeRecipeByInput,
    requestTaTastingFeedback,
    saveRecipeToVault,
    listSavedRecipes,
    deleteSavedRecipe,
    sendRecipeCardToChat,
    RecipeSmartBar
  };

  global.CoupleRecipeEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

