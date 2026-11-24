/**
 * Milvus/couple_feihua_engine.js
 * 情侣空间 ·「飞花传令 2.0」独立智能化引擎
 * - 双模式：✨ AI 雅集（五维人设判诗/考据/对诗/锦囊） vs 📜 离线经典（自动无缝降级）
 * - 支持自定义任意令字、普通飞花 / 序位飞花（第1→7字递增）、💡 卡壳锦囊提示
 * - 令字硬校验 + 序位校验 + 防重复 + 防幻觉标注（即兴赋作），绝不翻车
 * - 独立 IndexedDB: milvus_couple_leisure_idb（零 localStorage 写入）
 */
(function (global) {
  "use strict";

  const DB_NAME = "milvus_couple_leisure_idb";
  const DB_VERSION = 1;
  const STORE_FEIHUA = "saved_feihua";
  const STORE_RECIPES = "saved_recipes";

  const HOT_WORDS = ["月", "花", "风", "酒", "春", "山", "夜", "水", "云", "江", "心", "人", "雪", "秋", "日", "君", "情", "归"];

  // 扩充离线兜底经典诗句库（覆盖全部 18 个热门令字）
  const FALLBACK_POETRY_LINES = [
    { line: "床前明月光，疑是地上霜。", title: "静夜思", author: "李白", dynasty: "唐" },
    { line: "海上生明月，天涯共此时。", title: "望月怀远", author: "张九龄", dynasty: "唐" },
    { line: "明月松间照，清泉石上流。", title: "山居秋暝", author: "王维", dynasty: "唐" },
    { line: "春风又绿江南岸，明月何时照我还。", title: "泊船瓜洲", author: "王安石", dynasty: "宋" },
    { line: "感时花溅泪，恨别鸟惊心。", title: "春望", author: "杜甫", dynasty: "唐" },
    { line: "夜来风雨声，花落知多少。", title: "春晓", author: "孟浩然", dynasty: "唐" },
    { line: "人面不知何处去，桃花依旧笑春风。", title: "题都城南庄", author: "崔护", dynasty: "唐" },
    { line: "落红不是无情物，化作春泥更护花。", title: "己亥杂诗", author: "龚自珍", dynasty: "清" },
    { line: "大风起兮云飞扬，威加海内兮归故乡。", title: "大风歌", author: "刘邦", dynasty: "汉" },
    { line: "长风破浪会有时，直挂云帆济沧海。", title: "行路难", author: "李白", dynasty: "唐" },
    { line: "对酒当歌，人生几何！", title: "短歌行", author: "曹操", dynasty: "东汉" },
    { line: "劝君更尽一杯酒，西出阳关无故人。", title: "送元二使安西", author: "王维", dynasty: "唐" },
    { line: "绿蚁新醅酒，红泥小火炉。", title: "问刘十九", author: "白居易", dynasty: "唐" },
    { line: "春色满园关不住，一枝红杏出墙来。", title: "游园不值", author: "叶绍翁", dynasty: "宋" },
    { line: "空山新雨后，天气晚来秋。", title: "山居秋暝", author: "王维", dynasty: "唐" },
    { line: "会当凌绝顶，一览众山小。", title: "望岳", author: "杜甫", dynasty: "唐" },
    { line: "相看两不厌，只有敬亭山。", title: "独坐敬亭山", author: "李白", dynasty: "唐" },
    { line: "随风潜入夜，润物细无声。", title: "春夜喜雨", author: "杜甫", dynasty: "唐" },
    { line: "姑苏城外寒山寺，夜半钟声到客船。", title: "枫桥夜泊", author: "张继", dynasty: "唐" },
    { line: "问渠那得清如许，为有源头活水来。", title: "观书有感", author: "朱熹", dynasty: "宋" },
    { line: "行到水穷处，坐看云起时。", title: "终南别业", author: "王维", dynasty: "唐" },
    { line: "黄鹤一去不复返，白云千载空悠悠。", title: "黄鹤楼", author: "崔颢", dynasty: "唐" },
    { line: "无边落木萧萧下，不尽长江滚滚来。", title: "登高", author: "杜甫", dynasty: "唐" },
    { line: "日出江花红胜火，春来江水绿如蓝。", title: "忆江南", author: "白居易", dynasty: "唐" },
    { line: "身无彩凤双飞翼，心有灵犀一点通。", title: "无题", author: "李商隐", dynasty: "唐" },
    { line: "洛阳亲友如相问，一片冰心在玉壶。", title: "芙蓉楼送辛渐", author: "王昌龄", dynasty: "唐" },
    { line: "人生若只如初见，何事秋风悲画扇。", title: "木兰花", author: "纳兰性德", dynasty: "清" },
    { line: "柴门闻犬吠，风雪夜归人。", title: "逢雪宿芙蓉山主人", author: "刘长卿", dynasty: "唐" },
    { line: "孤舟蓑笠翁，独钓寒江雪。", title: "江雪", author: "柳宗元", dynasty: "唐" },
    { line: "忽如一夜春风来，千树万树梨花开。", title: "白雪歌送武判官归京", author: "岑参", dynasty: "唐" },
    { line: "自古逢秋悲寂寥，我言秋日胜春朝。", title: "秋词", author: "刘禹锡", dynasty: "唐" },
    { line: "白日依山尽，黄河入海流。", title: "登鹳雀楼", author: "王之涣", dynasty: "唐" },
    { line: "莫愁前路无知己，天下谁人不识君。", title: "别董大", author: "高适", dynasty: "唐" },
    { line: "多情自古伤离别，更那堪冷落清秋节。", title: "雨霖铃", author: "柳永", dynasty: "宋" },
    { line: "露从今夜白，月是故乡明。", title: "月夜忆舍弟", author: "杜甫", dynasty: "唐" },
    { line: "少小离家老大回，乡音无改鬓毛衰。", title: "回乡偶书", author: "贺知章", dynasty: "唐" }
  ];

  // ==========================================
  // 1. 独立 IDB 存储（零 localStorage 写入）
  // ==========================================
  let _dbPromise = null;
  let _memSaved = [];

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

  async function saveFeihuaSession(record) {
    const rec = {
      id: record.id || `fh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      charId: String(record.charId || ""),
      charName: String(record.charName || "名士"),
      keyword: String(record.keyword || "月"),
      ruleMode: record.ruleMode || "normal",
      history: Array.isArray(record.history) ? record.history : [],
      savedAt: Date.now()
    };
    const db = await openDb();
    if (!db) {
      _memSaved = [rec, ..._memSaved.filter((r) => r.id !== rec.id)];
      return rec;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_FEIHUA, "readwrite");
        tx.objectStore(STORE_FEIHUA).put(rec);
        tx.oncomplete = () => resolve(rec);
        tx.onerror = () => resolve(rec);
      } catch (e) {
        resolve(rec);
      }
    });
  }

  async function listSavedFeihua() {
    const db = await openDb();
    if (!db) return [..._memSaved].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_FEIHUA, "readonly");
        const req = tx.objectStore(STORE_FEIHUA).getAll();
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

  // ==========================================
  // 2. 令字 & 序位硬校验 + 本地兜底检索
  // ==========================================
  function stripPunctuation(text) {
    return String(text || "").replace(/[\s，。！？、；：“”‘’《》【】（）().,!?;:'"-]/g, "");
  }

  function computeTargetPosition(turnIndex = 0) {
    return (Math.max(0, Math.floor(Number(turnIndex) || 0)) % 7) + 1;
  }

  function validateFeihuaLine(line, keyword, { ruleMode = "normal", targetPos = 1, usedLines = [] } = {}) {
    const clean = String(line || "").trim();
    const kw = String(keyword || "").trim();
    if (!clean) return { ok: false, reason: "empty", message: "请先吟出一句诗句！" };
    if (!kw) return { ok: false, reason: "no_keyword", message: "请先设定令字！" };
    if (!clean.includes(kw)) {
      return { ok: false, reason: "missing_keyword", message: `诗句中必须包含令字【${kw}】！` };
    }
    const pure = stripPunctuation(clean);
    if (pure.length < 4) {
      return { ok: false, reason: "too_short", message: "字数太短啦，至少吟出一句完整短诗（≥4字）哦。" };
    }
    const normalizedUsed = new Set((usedLines || []).map((u) => stripPunctuation(u)));
    if (normalizedUsed.has(pure)) {
      return { ok: false, reason: "duplicate", message: "此句刚才已经吟诵过啦，请另赋一句新诗！" };
    }
    if (ruleMode === "positional") {
      const pos = Math.max(1, Math.min(7, Math.floor(Number(targetPos) || 1)));
      const charAtPos = pure[pos - 1];
      if (charAtPos !== kw) {
        return {
          ok: false,
          reason: "wrong_position",
          message: `序位飞花：本轮令字【${kw}】须落在第 ${pos} 字（当前第 ${pos} 字为「${charAtPos || "空"}」）。`
        };
      }
    }
    return { ok: true, reason: "ok", message: "" };
  }

  function matchLocalPoetry(keyword, { ruleMode = "normal", targetPos = 1, usedLines = [] } = {}) {
    const kw = String(keyword || "").trim();
    const normalizedUsed = new Set((usedLines || []).map((u) => stripPunctuation(u)));
    const pool = [...FALLBACK_POETRY_LINES];

    if (global.mcpPoetryEngine && Array.isArray(global.mcpPoetryEngine.database)) {
      for (const poem of global.mcpPoetryEngine.database) {
        for (const l of poem.lines || []) {
          pool.push({ line: l, title: poem.title, author: poem.author, dynasty: poem.dynasty });
        }
      }
    }

    const candidates = pool.filter((item) => {
      if (!item || !item.line || !item.line.includes(kw)) return false;
      const pure = stripPunctuation(item.line);
      if (normalizedUsed.has(pure)) return false;
      if (ruleMode === "positional") {
        const pos = Math.max(1, Math.min(7, Math.floor(Number(targetPos) || 1)));
        if (pure[pos - 1] !== kw) return false;
      }
      return true;
    });

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ==========================================
  // 3. LLM 调用封装（复用主 API，自动清洗 JSON）
  // ==========================================
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

  async function callLeisureLlm(messages, { maxTokens = 360, timeoutMs = 12000, customChatFn = null } = {}) {
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
          temperature: 0.78,
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
    const uLine = `- 对弈对象（用户）：${uName}${mePersona?.personality ? `（${mePersona.personality}）` : ""}`;
    return `${lines.join("\n")}\n${uLine}`;
  }

  // ==========================================
  // 4. 核心玩法：AI 判诗 + 人设接句 + 卡壳锦囊
  // ==========================================
  async function submitFeihuaTurn({
    userLine,
    keyword,
    ruleMode = "normal",
    history = [],
    taCharacter = null,
    mePersona = null,
    aiMode = true,
    customChatFn = null
  } = {}) {
    const usedLines = (history || []).map((h) => h.line);
    const userTargetPos = computeTargetPosition(usedLines.length);
    const preCheck = validateFeihuaLine(userLine, keyword, { ruleMode, targetPos: userTargetPos, usedLines });
    if (!preCheck.ok) {
      return { ok: false, error: preCheck.message };
    }

    const nextUsed = [...usedLines, String(userLine).trim()];
    const taTargetPos = computeTargetPosition(nextUsed.length);

    const buildOfflineResult = (extraFeedback = "") => {
      let uTitle = "古风诗赋";
      let uAuthor = mePersona?.name || "楼主雅句";
      let uDynasty = "雅集";
      if (global.mcpPoetryEngine && typeof global.mcpPoetryEngine.searchPoetry === "function") {
        const res = global.mcpPoetryEngine.searchPoetry(userLine);
        if (res && res.length > 0) {
          uTitle = `《${res[0].title}》`;
          uAuthor = res[0].author;
          uDynasty = res[0].dynasty;
        }
      }
      const taHit = matchLocalPoetry(keyword, { ruleMode, targetPos: taTargetPos, usedLines: nextUsed });
      return {
        ok: true,
        usedAi: false,
        userItem: {
          id: Date.now(),
          sender: "user",
          line: String(userLine).trim(),
          title: uTitle,
          author: uAuthor,
          dynasty: uDynasty,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        },
        taItem: taHit
          ? {
              id: Date.now() + 1,
              sender: "ta",
              line: taHit.line,
              title: `《${taHit.title}》`,
              author: taHit.author,
              dynasty: taHit.dynasty,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            }
          : null,
        feedback: extraFeedback || (taHit ? `好一句！${taCharacter?.name || "名士"}以此句相和。` : `楼主才高八斗！关于令字【${keyword}】，${taCharacter?.name || "名士"}甘拜下风！`),
        scoreDelta: taHit ? { user: 10, ta: 10 } : { user: 20, ta: 0 }
      };
    };

    if (!aiMode) return buildOfflineResult();

    let worldBook = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb) worldBook = String(wb).slice(0, 600);
      }
    } catch (e) {}

    const sysPrompt = [
      `你正在扮演【${taCharacter?.name || "名士"}】，与用户在情侣空间玩「飞花传令」。`,
      buildCharPersonaBlock(taCharacter, mePersona),
      worldBook ? `【世界书】${worldBook}` : "",
      `【本局规则】令字：【${keyword}】；模式：${ruleMode === "positional" ? `序位飞花（你的接句中，去除标点后第 ${taTargetPos} 字必须是「${keyword}」）` : `普通飞花（诗句包含「${keyword}」即可）`}。`,
      "【硬性要求】",
      "1. 先辨别用户所发句子：若是真实古诗词，准确填出篇名/作者/朝代；若是用户原创诗句或现代句，如实标 isClassic=false、title='即兴雅句'；若明显敷衍乱凑字（如'月亮月亮123'），设 userValid=false 并在 feedback 里按你的性格笑着抓包！",
      "2. 若 userValid=true，你必须接一句**未在历史中出现过**的诗句。优先引用真实传世诗词并如实写出处；若你即兴原创则必须设 taIsOriginal=true、taTitle='即兴赋作'、taAuthor=你的名字，严禁胡编假古诗安在李白/苏轼头上！",
      "3. feedback 必须完全贴合你的性格与口吻点评用户刚才那句（25~65字），绝不用千篇一律的模板。",
      "严格输出纯 JSON 对象：",
      '{"userValid":true,"userIsClassic":true,"userTitle":"诗题(不带书名号)","userAuthor":"作者","userDynasty":"朝代","taLine":"你接的诗句","taIsOriginal":false,"taTitle":"诗题(不带书名号)","taAuthor":"作者","taDynasty":"朝代","feedback":"你用本人性格点评用户这一句的活人感台词"}'
    ]
      .filter(Boolean)
      .join("\n");

    const userPrompt = `本局已用诗句：\n${usedLines.length ? usedLines.join("\n") : "（无）"}\n\n用户刚刚吟出：「${userLine}」\n请判定并对出下一句。`;

    try {
      const raw = await callLeisureLlm(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt }
        ],
        { maxTokens: 380, timeoutMs: 12000, customChatFn }
      );
      const parsed = extractJsonObject(raw);
      if (!parsed) return buildOfflineResult();

      if (parsed.userValid === false) {
        return {
          ok: false,
          rejectedByAi: true,
          error: String(parsed.feedback || `这句可不算诗哦，${taCharacter?.name || "名士"}笑着摇了摇头，请另赋一句吧！`)
        };
      }

      const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const userItem = {
        id: Date.now(),
        sender: "user",
        line: String(userLine).trim(),
        title: parsed.userTitle ? `《${String(parsed.userTitle).replace(/[《》]/g, "")}》` : (parsed.userIsClassic ? "古风诗赋" : "即兴雅句"),
        author: String(parsed.userAuthor || mePersona?.name || "楼主"),
        dynasty: String(parsed.userDynasty || (parsed.userIsClassic ? "传世" : "今作")),
        time: nowTime
      };

      // 对 AI 接句执行硬校验（防漏字/重句/序位出错），不合格则用本地库替补诗句但保留 AI 评语
      let taItem = null;
      const aiTaLine = String(parsed.taLine || "").trim();
      const taCheck = validateFeihuaLine(aiTaLine, keyword, { ruleMode, targetPos: taTargetPos, usedLines: nextUsed });
      if (taCheck.ok) {
        taItem = {
          id: Date.now() + 1,
          sender: "ta",
          line: aiTaLine,
          title: parsed.taIsOriginal ? "《即兴赋作》" : `《${String(parsed.taTitle || "古诗").replace(/[《》]/g, "")}》`,
          author: parsed.taIsOriginal ? (taCharacter?.name || "名士") : String(parsed.taAuthor || "佚名"),
          dynasty: parsed.taIsOriginal ? "即兴" : String(parsed.taDynasty || "古韵"),
          time: nowTime
        };
      } else {
        const localHit = matchLocalPoetry(keyword, { ruleMode, targetPos: taTargetPos, usedLines: nextUsed });
        if (localHit) {
          taItem = {
            id: Date.now() + 1,
            sender: "ta",
            line: localHit.line,
            title: `《${localHit.title}》`,
            author: localHit.author,
            dynasty: localHit.dynasty,
            time: nowTime
          };
        }
      }

      return {
        ok: true,
        usedAi: true,
        userItem,
        taItem,
        feedback: String(parsed.feedback || (taItem ? "好诗！且听我接这一联。" : `${taCharacter?.name || "名士"}思索片刻，拱手认输！`)),
        scoreDelta: taItem ? { user: 10, ta: 10 } : { user: 20, ta: 0 }
      };
    } catch (e) {
      return buildOfflineResult();
    }
  }

  async function requestFeihuaHint({ keyword, ruleMode = "normal", history = [], taCharacter = null, mePersona = null, aiMode = true, customChatFn = null } = {}) {
    const usedLines = (history || []).map((h) => h.line);
    const targetPos = computeTargetPosition(usedLines.length);
    const localHit = matchLocalPoetry(keyword, { ruleMode, targetPos, usedLines });

    if (!aiMode) {
      return localHit
        ? { hintText: `💡 悄悄递你一句提示：试试「${localHit.line.slice(0, 4)}……」`, suggestedLine: localHit.line }
        : { hintText: `💡 想想含「${keyword}」字的唐诗宋词吧！`, suggestedLine: "" };
    }

    const sysPrompt = [
      `你是【${taCharacter?.name || "名士"}】，用户在飞花令（令字【${keyword}】${ruleMode === "positional" ? `，需落第 ${targetPos} 字` : ""}）卡壳了，向你讨要锦囊提示。`,
      buildCharPersonaBlock(taCharacter, mePersona),
      "请用符合你性格的口吻（或纵容放水、或傲娇点拨）给出一句未用过的含令字诗句提示。",
      '严格输出 JSON：{"hintText":"你的俏皮点拨话语(35字内)","suggestedLine":"一句含令字的完整诗句"}'
    ].join("\n");

    try {
      const raw = await callLeisureLlm(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: `已用诗句：${usedLines.join(" / ") || "无"}` }
        ],
        { maxTokens: 180, timeoutMs: 8000, customChatFn }
      );
      const parsed = extractJsonObject(raw);
      if (parsed && parsed.suggestedLine && validateFeihuaLine(parsed.suggestedLine, keyword, { ruleMode, targetPos, usedLines }).ok) {
        return {
          hintText: String(parsed.hintText || `💡 ${taCharacter?.name || "名士"}悄悄递来纸条`),
          suggestedLine: String(parsed.suggestedLine).trim()
        };
      }
    } catch (e) {}

    return localHit
      ? { hintText: `💡 ${taCharacter?.name || "名士"}轻声提醒：不妨试试这句？`, suggestedLine: localHit.line }
      : { hintText: `💡 想想含「${keyword}」字的古诗词吧！`, suggestedLine: "" };
  }

  async function sendFeihuaSummaryToChat({ taCharacter, keyword, history = [] } = {}) {
    const cid = String(taCharacter?.id || "");
    if (!cid || !global.chatHistoryStore || typeof global.chatHistoryStore.appendMessage !== "function") return false;
    const preview = (history || []).slice(-4).map((h) => `${h.sender === "user" ? "我" : (taCharacter?.name || "TA")}：${h.line}`).join("\n");
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const msg = {
      id: `feihua_share_${Date.now()}`,
      isMe: true,
      sender: "我",
      senderId: "me",
      text: `🎋 刚在情侣空间和你玩了一局「飞花传令」（令字【${keyword}】，共 ${history.length} 句）：\n${preview}`,
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

  function FeihuaQuickControls({
    aiMode,
    onToggleAiMode,
    ruleMode,
    onToggleRuleMode,
    keyword,
    onSetCustomKeyword,
    onRequestHint,
    onShareToChat,
    busy = false,
    hasHistory = false
  }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState } = React;
    const [tip, setTip] = useState("");
    const [showHelp, setShowHelp] = useState(false);

    const flash = (m) => {
      setTip(m);
      setTimeout(() => setTip(""), 1800);
    };

    const helpItems = [
      { icon: "✨ / 📜", title: "AI 雅集 / 离线经典", desc: "✨ 开启 AI 五维人设判诗考据与活人感接句（断网自动降级）；📜 切回纯离线经典诗库。" },
      { icon: "∞ / ①", title: "普通飞花 / 序位飞花", desc: "∞ 诗句含令字即可；① 进阶序位飞花，令字须按第 1→7 字循环递增落位。" },
      { icon: "✎", title: "自定义令字", desc: "自由设定任意单字作为本局令字（如名士姓名中的字、季节字等）。" },
      { icon: "💡", title: "卡壳锦囊", desc: "一时想不出诗句时，向 TA 讨要一句贴合性格的提示并可一键填入输入框。" },
      { icon: "✉️", title: "雅集发回传讯", desc: "将本局飞花令精彩对句静默同步至传讯聊天主线，留作共同记忆。" }
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
            h("span", { style: { fontSize: "14px", fontWeight: 700, color: "#5A5F4D" } }, "🎋 飞花传令 · 按钮说明"),
            h("button", { type: "button", onClick: () => setShowHelp(false), style: { border: "none", background: "#EFECE6", color: "#666", borderRadius: "50%", width: "24px", height: "24px", cursor: "pointer", fontSize: "12px" } }, "✕")
          ),
          helpItems.map((it) =>
            h(
              "div",
              { key: it.icon, style: { display: "flex", gap: "10px", alignItems: "flex-start", background: "#FFFFFF", border: "1px solid #EFECE6", borderRadius: "12px", padding: "8px 10px" } },
              h("span", { style: { minWidth: "46px", textAlign: "center", fontSize: "12.5px", fontWeight: 700, color: "#A26148", background: "#F5EFEB", borderRadius: "8px", padding: "3px 5px", flexShrink: 0 } }, it.icon),
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

    const btnStyle = (active) => ({
      border: active ? "1px solid #A26148" : "1px solid #DDBAA8",
      background: active ? "#F5EFEB" : "#FFFFFF",
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
      { style: { display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" } },
      h(
        "button",
        {
          type: "button",
          disabled: busy,
          title: aiMode ? "当前：AI 雅集模式（点击切至离线经典）" : "当前：离线经典模式（点击切至 AI 雅集）",
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
          title: ruleMode === "positional" ? "当前：序位飞花（第1→7字递增），点击切普通" : "当前：普通飞花，点击切序位飞花",
          onClick: onToggleRuleMode,
          style: btnStyle(ruleMode === "positional")
        },
        ruleMode === "positional" ? "①" : "∞"
      ),
      h(
        "button",
        {
          type: "button",
          disabled: busy,
          title: "自定义任意单字令字",
          onClick: () => {
            const val = window.prompt("输入你想设定的单字令字（如：霜、剑、琴、舟）：", keyword || "月");
            if (val && val.trim()) {
              const ch = val.trim().slice(0, 1);
              if (typeof onSetCustomKeyword === "function") onSetCustomKeyword(ch);
            }
          },
          style: btnStyle(false)
        },
        "✎"
      ),
      h(
        "button",
        {
          type: "button",
          disabled: busy,
          title: "卡壳锦囊：向 TA 讨要一句提示",
          onClick: onRequestHint,
          style: btnStyle(false)
        },
        "💡"
      ),
      hasHistory &&
        h(
          "button",
          {
            type: "button",
            disabled: busy,
            title: "将本局飞花雅集发回传讯",
            onClick: async () => {
              if (typeof onShareToChat === "function") {
                const ok = await onShareToChat();
                flash(ok ? "✓" : "!");
              }
            },
            style: btnStyle(Boolean(tip))
          },
          tip || "✉️"
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
    );
  }

  const api = {
    DB_NAME,
    HOT_WORDS,
    FALLBACK_POETRY_LINES,
    stripPunctuation,
    computeTargetPosition,
    validateFeihuaLine,
    matchLocalPoetry,
    submitFeihuaTurn,
    requestFeihuaHint,
    saveFeihuaSession,
    listSavedFeihua,
    sendFeihuaSummaryToChat,
    FeihuaQuickControls
  };

  global.CoupleFeihuaEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

