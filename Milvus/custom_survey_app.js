/**
 * Milvus/custom_survey_app.js
 * 绣衣楼 · 绣衣问卷「自拟问卷 + 名士五维作答」独立模块化引擎（P0）
 * - 复用 IndexedDB STORES.USER_SETTINGS（免升库）+ localStorage 兜底
 * - 五维上下文聚合：角色 6 维配置 + 身份配置库 + 开启世界书 + 传讯最近 30 条上下文 + 自拟问卷完整内容
 * - 零膨胀接入 T11QuestionnaireSubPage，保留傅融引导锚点 data-fr-t11-quest="step3"
 */
(function (global) {
  "use strict";

  const SURVEYS_KEY = "xiuyi_custom_surveys_v1";
  const RECORDS_KEY = "xiuyi_custom_survey_records_v1";
  const UPDATE_EVENT = "milvus-custom-surveys-updated";

  const MORANDI_THEMES = [
    { idx: 1, name: "青瓷", cls: "bg-morandi-1", bg: "#E6EFEA", accent: "#6F9485" },
    { idx: 2, name: "藕粉", cls: "bg-morandi-2", bg: "#F4E8E6", accent: "#B57B74" },
    { idx: 3, name: "杏茶", cls: "bg-morandi-3", bg: "#F3EDE0", accent: "#A38A5C" },
    { idx: 4, name: "烟蓝", cls: "bg-morandi-4", bg: "#E7EEF4", accent: "#6A87A1" },
    { idx: 5, name: "雾紫", cls: "bg-morandi-5", bg: "#EEEAF4", accent: "#8879A3" }
  ];

  const QUESTION_TYPES = [
    { type: "single", label: "单选题" },
    { type: "multi", label: "多选题" },
    { type: "rating", label: "星级评分" },
    { type: "text", label: "开放问答" }
  ];

  const PRESET_TEMPLATES = [
    {
      label: "心腹默契暗访",
      title: "绣衣楼心腹默契度暗访",
      subtitle: "如实作答，不许敷衍，否则扣本月俸禄。",
      colorIndex: 1,
      questions: [
        { id: "q1", type: "single", title: "若半夜收到我急召，你第一反应是？", options: ["立刻抄家伙出门", "先看看是不是又闯祸了", "装睡，天亮再说"] },
        { id: "q2", type: "multi", title: "平时最怕我在楼里提哪件事？", options: ["查账", "团建", "谈心", "加练"] },
        { id: "q3", type: "rating", title: "给近期你我的默契度打几颗星？", options: [] },
        { id: "q4", type: "text", title: "有什么一直想对我说却没当面说的话？", options: [] }
      ]
    },
    {
      label: "私下真心话",
      title: "广陵王私下真心话小笺",
      subtitle: "此卷仅你我二人可见，不必端着架子。",
      colorIndex: 2,
      questions: [
        { id: "q1", type: "single", title: "若是难得休沐一日，你最想同我去做什么？", options: ["城外踏青喝酒", "窝在屋里什么也不干", "去市集逛吃买小玩意"] },
        { id: "q2", type: "rating", title: "最近这段日子，你在我身边过得顺心吗？", options: [] },
        { id: "q3", type: "text", title: "如果现在能向我讨一件东西或一个承诺，你会要什么？", options: [] }
      ]
    },
    {
      label: "楼内匿名吐槽",
      title: "绣衣楼匿名意见箱",
      subtitle: "放心写，绝不秋后算账（大概）。",
      colorIndex: 3,
      questions: [
        { id: "q1", type: "single", title: "你觉得近期楼里伙食水平如何？", options: ["勉强果腹", "还算可口", "不如我去街口买烧饼"] },
        { id: "q2", type: "multi", title: "最希望下个月改善哪几项待遇？", options: ["涨月俸", "多批休沐", "少开早会", "改善茶水点心"] },
        { id: "q3", type: "text", title: "请用一句话锐评一下广陵王最近的工作状态：", options: [] }
      ]
    }
  ];

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function formatTimeShort(ts) {
    try {
      const d = new Date(ts || Date.now());
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch (e) {
      return "";
    }
  }

  async function copyPlainText(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  // ==========================================
  // 1. 持久化存储层（STORES.USER_SETTINGS + localStorage 兜底）
  // ==========================================
  async function idbGetKV(key) {
    try {
      if (typeof global.openDB === "function" && global.STORES?.USER_SETTINGS) {
        const db = await global.openDB();
        const res = await new Promise((resolve) => {
          const tx = db.transaction(global.STORES.USER_SETTINGS, "readonly");
          const req = tx.objectStore(global.STORES.USER_SETTINGS).get(key);
          req.onsuccess = () => resolve(req.result?.value);
          req.onerror = () => resolve(undefined);
        });
        if (res !== undefined) return res;
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  async function idbPutKV(key, value) {
    try {
      if (typeof global.openDB === "function" && global.STORES?.USER_SETTINGS) {
        const db = await global.openDB();
        await new Promise((resolve) => {
          const tx = db.transaction(global.STORES.USER_SETTINGS, "readwrite");
          const req = tx.objectStore(global.STORES.USER_SETTINGS).put({ key, value, updatedAt: Date.now() });
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
      }
    } catch (e) {}
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function emitUpdate() {
    try {
      global.dispatchEvent(new CustomEvent(UPDATE_EVENT));
    } catch (e) {}
  }

  const customSurveyStore = {
    getSurveys: async () => {
      const list = await idbGetKV(SURVEYS_KEY);
      return Array.isArray(list) ? list : [];
    },

    saveSurvey: async (survey) => {
      const list = await customSurveyStore.getSurveys();
      const now = Date.now();
      const normalized = {
        ...survey,
        id: survey.id || uid("cs"),
        colorIndex: Number(survey.colorIndex) || 1,
        icon: survey.icon || "note-pencil",
        createdAt: survey.createdAt || now,
        updatedAt: now
      };
      const idx = list.findIndex((s) => s.id === normalized.id);
      const next = idx >= 0 ? list.map((s) => (s.id === normalized.id ? normalized : s)) : [normalized, ...list];
      await idbPutKV(SURVEYS_KEY, next);
      emitUpdate();
      return normalized;
    },

    deleteSurvey: async (surveyId) => {
      const list = await customSurveyStore.getSurveys();
      const next = list.filter((s) => s.id !== surveyId);
      await idbPutKV(SURVEYS_KEY, next);
      const records = await customSurveyStore.getRecords();
      const nextRecords = records.filter((r) => r.surveyId !== surveyId);
      await idbPutKV(RECORDS_KEY, nextRecords);
      emitUpdate();
      return true;
    },

    getRecords: async () => {
      const list = await idbGetKV(RECORDS_KEY);
      return Array.isArray(list) ? list : [];
    },

    getRecordsBySurvey: async (surveyId) => {
      const all = await customSurveyStore.getRecords();
      return all.filter((r) => r && r.surveyId === surveyId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    saveRecord: async (record) => {
      const all = await customSurveyStore.getRecords();
      const entry = {
        ...record,
        id: record.id || uid("csr"),
        createdAt: record.createdAt || Date.now()
      };
      const next = [entry, ...all.filter((r) => r.id !== entry.id)].slice(0, 120);
      await idbPutKV(RECORDS_KEY, next);
      emitUpdate();
      return entry;
    },

    deleteRecord: async (recordId) => {
      const all = await customSurveyStore.getRecords();
      const next = all.filter((r) => r.id !== recordId);
      await idbPutKV(RECORDS_KEY, next);
      emitUpdate();
      return true;
    }
  };

  // ==========================================
  // 2. 五维上下文聚合引擎
  // ==========================================
  async function loadAllCharacters() {
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        const list = await global.chatCharacterStore.getAll();
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (e) {}
    try {
      const ls = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      if (Array.isArray(ls)) return ls;
    } catch (e) {}
    return [];
  }

  async function resolveFullCharacter(character) {
    let full = character || { name: "名士" };
    try {
      const list = await loadAllCharacters();
      const matched = list.find(
        (c) =>
          c &&
          ((character?.id !== undefined && String(c.id) === String(character.id)) ||
            (character?.name && c.name === character.name))
      );
      if (matched) {
        full = {
          ...matched,
          ...(character || {}),
          profile: { ...(matched.profile || {}), ...(character?.profile || {}) }
        };
      }
    } catch (e) {}

    const p = full.profile || {};
    return {
      rawId: full.id !== undefined && full.id !== null ? full.id : character?.id,
      id: String(full.id || character?.id || ""),
      name: full.name || p.name || "名士",
      avatar: full.avatar || "",
      avatarId: full.avatarId || full.id,
      mbti: p.mbti || full.mbti || "未设定",
      constellation: p.constellation || p.zodiac || full.constellation || full.zodiac || "未设定",
      speakingStyle: p.speakingStyle || p.style || full.speakingStyle || full.style || "贴合原作角色口吻与神韵",
      personality: p.personality || full.personality || "性格鲜明立体",
      background: p.background || p.bio || p.description || full.background || full.description || "身处乱世、与你羁绊深厚"
    };
  }

  function getActiveUserPersona() {
    try {
      const personas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      let active = activeId ? personas.find((p) => String(p.id) === String(activeId)) : null;
      if (!active && personas.length > 0) active = personas[0];
      if (active) {
        return {
          hasCustom: true,
          name: active.name || "广陵王",
          gender: active.gender || "未设定",
          age: active.age || "未设定",
          identity: active.identity || active.occupation || "广陵王 / 绣衣楼主",
          personality: active.personality || "果敢敏锐",
          background: active.background || active.bio || "",
          style: active.style || ""
        };
      }
    } catch (e) {}
    return {
      hasCustom: false,
      name: "广陵王",
      gender: "未设定",
      age: "未设定",
      identity: "广陵王 / 绣衣楼主",
      personality: "果敢敏锐",
      background: "",
      style: ""
    };
  }

  async function fetchRecentChat30(charRawId, charId, charName, userName) {
    const extractMsgs = (res) => {
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.messages)) return res.messages;
      return [];
    };

    const candidateIds = [];
    if (charRawId !== undefined && charRawId !== null && charRawId !== "") candidateIds.push(charRawId);
    if (charId && !candidateIds.includes(charId)) candidateIds.push(charId);
    const numId = Number(charId);
    if (!isNaN(numId) && charId !== "" && !candidateIds.includes(numId)) candidateIds.push(numId);

    let rawList = [];
    for (const cid of candidateIds) {
      try {
        if (global.chatHistoryStore && typeof global.chatHistoryStore.getAllMessages === "function") {
          const msgs = extractMsgs(await global.chatHistoryStore.getAllMessages(cid));
          if (msgs.length > 0) {
            rawList = msgs;
            break;
          }
        }
      } catch (e) {}
    }

    if (rawList.length === 0) {
      for (const cid of candidateIds) {
        try {
          const ls = JSON.parse(localStorage.getItem("t8_chat_history_" + cid) || "[]");
          if (Array.isArray(ls) && ls.length > 0) {
            rawList = ls;
            break;
          }
        } catch (e) {}
      }
    }

    const cleaned = rawList
      .map((m) => {
        if (!m || m.type === "system" || m.tap === true) return null;
        let text = String(m.text || m.content?.title || (typeof m.content === "string" ? m.content : "") || "").trim();
        if (!text) return null;
        text = text.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, "[图片]").replace(/\s+/g, " ").trim();
        if (text.length > 100) text = text.slice(0, 98) + "…";
        const sender = String(m.sender || m.role || "").toLowerCase();
        const isUser = sender === "user" || sender === "me" || m.isMe === true || m.isUser === true;
        return { speaker: isUser ? userName : charName, text };
      })
      .filter(Boolean);

    if (cleaned.length === 0) return { count: 0, text: "" };

    const recent30 = cleaned.slice(-30);
    const lines = [];
    let totalLen = 0;
    for (let i = recent30.length - 1; i >= 0; i--) {
      const line = `[${recent30[i].speaker}]：${recent30[i].text}`;
      if (totalLen + line.length > 2200 && lines.length > 0) break;
      lines.unshift(line);
      totalLen += line.length + 1;
    }
    return { count: lines.length, text: lines.join("\n") };
  }

  // ==========================================
  // 3. 结构化名士作答生成引擎
  // ==========================================
  function safeParseSurveyJSON(raw) {
    const cleaned = String(raw || "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      throw new Error("模型未返回有效的 JSON 答卷格式");
    }
    return JSON.parse(cleaned.slice(first, last + 1));
  }

  function matchOption(rawVal, options) {
    if (!Array.isArray(options) || options.length === 0) return String(rawVal || "");
    const target = String(rawVal || "").trim();
    if (!target) return options[0];
    const exact = options.find((o) => o === target);
    if (exact) return exact;
    const fuzzy = options.find((o) => target.includes(o) || o.includes(target));
    if (fuzzy) return fuzzy;
    return options[0];
  }

  function normalizeAnswers(parsed, questions) {
    const rawAnswers = (parsed && parsed.answers && typeof parsed.answers === "object") ? parsed.answers : {};
    const out = {};

    (questions || []).forEach((q) => {
      const item = rawAnswers[q.id];
      const rawVal = item && typeof item === "object" && !Array.isArray(item) && "value" in item ? item.value : item;
      const aside = item && typeof item === "object" && typeof item.aside === "string" ? item.aside.trim() : "";

      if (q.type === "single") {
        out[q.id] = { value: matchOption(rawVal, q.options), aside };
      } else if (q.type === "multi") {
        const arr = Array.isArray(rawVal) ? rawVal : rawVal ? [rawVal] : [];
        const matched = [];
        arr.forEach((v) => {
          const m = matchOption(v, q.options);
          if (m && !matched.includes(m)) matched.push(m);
        });
        if (matched.length === 0 && Array.isArray(q.options) && q.options.length > 0) {
          matched.push(q.options[0]);
        }
        out[q.id] = { value: matched, aside };
      } else if (q.type === "rating") {
        const n = Math.round(Number(rawVal));
        const clamped = !isNaN(n) ? Math.max(1, Math.min(5, n)) : 4;
        out[q.id] = { value: clamped, aside };
      } else {
        const txt = String(rawVal || "").trim() || "此事容我细想片刻再答复你。";
        out[q.id] = { value: txt, aside };
      }
    });

    return out;
  }

  async function generateCharacterSurveyAnswer({ character, survey }) {
    if (typeof global.sendToLLM !== "function") {
      throw new Error("未配置 API，请先前往「设置 → API 配置中心」配置");
    }
    if (!survey || !Array.isArray(survey.questions) || survey.questions.length === 0) {
      throw new Error("问卷暂无题目，请先编辑添加题目");
    }

    const charInfo = await resolveFullCharacter(character);
    const userInfo = getActiveUserPersona();

    let worldContext = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldContext = String(wb).trim();
      }
    } catch (e) {}

    const chatSnap = await fetchRecentChat30(charInfo.rawId, charInfo.id, charInfo.name, userInfo.name);

    const contextBadges = [];
    if (chatSnap.count > 0) contextBadges.push(`传讯参考 ${chatSnap.count} 条`);
    else contextBadges.push("暂无传讯记录");
    if (worldContext) contextBadges.push("已接入世界书");
    if (userInfo.hasCustom) contextBadges.push(`身份：${userInfo.name}`);

    const questionsDesc = survey.questions
      .map((q, idx) => {
        const typeName = (QUESTION_TYPES.find((t) => t.type === q.type) || {}).label || "问答题";
        const optLine =
          (q.type === "single" || q.type === "multi") && Array.isArray(q.options) && q.options.length > 0
            ? `\n   可选答案（必须严格从中选择原文）：${JSON.stringify(q.options)}`
            : q.type === "rating"
            ? `\n   填答格式：1~5 的整数`
            : `\n   填答格式：简短自然的文字回答（30~120字）`;
        return `${idx + 1}. [id: "${q.id}" | ${typeName}] ${q.title}${optLine}`;
      })
      .join("\n");

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】，正在认真填写由【${userInfo.name}】亲手拟定的一份绣衣楼自拟问卷。

【维度一·角色完整配置】
- 角色姓名与ID：${charInfo.name} (ID: ${charInfo.id})
- MBTI 性格类型：${charInfo.mbti}
- 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}

【维度二·发卷人（用户）身份配置库设定】
- 姓名：${userInfo.name}
- 性别/年龄：${userInfo.gender} / ${userInfo.age}
- 身份：${userInfo.identity}
- 性格特点：${userInfo.personality}
- 个人背景：${userInfo.background || "与你并肩同行之人"}
${userInfo.style ? `- 语言风格：${userInfo.style}` : ""}

【维度三·当前开启的世界书设定】
${worldContext || "未开启特定世界书，按角色原有背景自然作答即可。"}

【维度四·传讯中你们最近的聊天上下文（共 ${chatSnap.count} 条）】
${chatSnap.count > 0 ? chatSnap.text : "近期暂无传讯聊天记录，请勿凭空编造不存在的聊天内容，按角色固有关系与人设自然作答。"}

【维度五·自拟问卷内容】
- 问卷标题：${survey.title}
${survey.subtitle ? `- 问卷导语：${survey.subtitle}` : ""}
- 题目列表：
${questionsDesc}

【作答铁律】
1. 必须完全以【${charInfo.name}】的口吻、思维习惯、MBTI 与星座特质作答，自然呼应近期传讯细节（若有），杜绝官方套话与 AI 腔。
2. 单选题 value 必须精确等于对应 options 里的某一项；多选题 value 必须是 options 子集数组（至少选 1 项）；星级评分 value 必须是 1~5 整数；开放问答 value 写出鲜活自然的回答。
3. 每道题都可以带一句简短的 "aside"（填表时的内心小批注/吐槽，10~30字，可留空），并在卷尾写一句 "closingRemark"（交卷时的落款碎碎念，15~50字）。
4. 只输出合法 JSON，严禁任何解释文字或 Markdown 代码块，格式如下：
{
  "answers": {
    "q1": { "value": "选项原文或数组或数字或文本", "aside": "简短内心批注" }
  },
  "closingRemark": "交卷落款总评"
}`;

    const raw = await new Promise((resolve, reject) => {
      global.sendToLLM(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: `请以【${charInfo.name}】的身份填写这份《${survey.title}》问卷，并直接返回 JSON。` }
        ],
        { disableMCP: true },
        (reply) => resolve(reply),
        (err) => reject(new Error(typeof err === "string" ? err : err?.message || "名士作答生成失败"))
      );
    });

    const parsed = safeParseSurveyJSON(raw);
    const normalizedAnswers = normalizeAnswers(parsed, survey.questions);
    const closingRemark = String(parsed?.closingRemark || "").trim() || "填好了，拿去看吧。";

    const record = await customSurveyStore.saveRecord({
      surveyId: survey.id,
      surveySnapshot: {
        title: survey.title,
        subtitle: survey.subtitle || "",
        questions: JSON.parse(JSON.stringify(survey.questions || []))
      },
      characterId: charInfo.id,
      characterName: charInfo.name,
      answers: normalizedAnswers,
      closingRemark,
      contextBadges
    });

    return record;
  }

  // ==========================================
  // 4. 组件 A：绣衣问卷主页自拟问卷列表区
  // ==========================================
  const CustomSurveyListSection = ({ onOpenSurvey, onEditSurvey }) => {
    const h = React.createElement;
    const [surveys, setSurveys] = React.useState([]);
    const [recordCountMap, setRecordCountMap] = React.useState({});

    const reload = async () => {
      const [list, records] = await Promise.all([
        customSurveyStore.getSurveys(),
        customSurveyStore.getRecords()
      ]);
      const counts = {};
      (records || []).forEach((r) => {
        if (r && r.surveyId) counts[r.surveyId] = (counts[r.surveyId] || 0) + 1;
      });
      setSurveys(list || []);
      setRecordCountMap(counts);
    };

    React.useEffect(() => {
      reload();
      const handler = () => reload();
      global.addEventListener(UPDATE_EVENT, handler);
      return () => global.removeEventListener(UPDATE_EVENT, handler);
    }, []);

    if (!surveys || surveys.length === 0) return null;

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 4px 2px",
            marginTop: "6px"
          }
        },
        h("span", { style: { fontSize: "12px", fontWeight: 700, color: "#7A826F", letterSpacing: "0.5px" } }, `✦ 我的自拟问卷（${surveys.length}）`),
        h("span", { style: { fontSize: "11px", color: "#A0A698" } }, "点开邀请名士作答")
      ),
      surveys.map((survey, index) => {
        const theme = MORANDI_THEMES[((survey.colorIndex || 1) - 1) % MORANDI_THEMES.length] || MORANDI_THEMES[0];
        const recCount = recordCountMap[survey.id] || 0;
        return h(
          "div",
          {
            key: survey.id,
            className: `t11-q-card ${theme.cls}`,
            style: { animationDelay: `${index * 0.06}s`, position: "relative" },
            onClick: () => onOpenSurvey && onOpenSurvey(survey)
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 } },
            h(
              "div",
              {
                style: {
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "rgba(255,255,255,0.65)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }
              },
              h("i", { className: `ph ph-${survey.icon || "note-pencil"}`, style: { fontSize: "20px", opacity: 0.85 } })
            ),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "3px", minWidth: 0, flex: 1 } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
                h(
                  "span",
                  { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 } },
                  survey.title || "未命名问卷"
                ),
                h(
                  "span",
                  {
                    style: {
                      fontSize: "10px",
                      padding: "1px 6px",
                      borderRadius: "999px",
                      background: "rgba(255,255,255,0.7)",
                      color: "#5a5f4d",
                      flexShrink: 0
                    }
                  },
                  "自拟"
                )
              ),
              h(
                "span",
                { style: { fontSize: "11px", opacity: 0.72 } },
                `${(survey.questions || []).length} 题 · 已收 ${recCount} 份答卷`
              )
            )
          ),
          h(
            "div",
            {
              style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 },
              onClick: (e) => e.stopPropagation()
            },
            h(
              "button",
              {
                type: "button",
                title: "复制一份副本",
                onClick: async () => {
                  await customSurveyStore.saveSurvey({
                    title: `${survey.title || "未命名问卷"}（副本）`,
                    subtitle: survey.subtitle || "",
                    colorIndex: survey.colorIndex || 1,
                    icon: survey.icon || "note-pencil",
                    questions: JSON.parse(JSON.stringify(survey.questions || []))
                  });
                },
                style: {
                  border: "none",
                  background: "rgba(255,255,255,0.68)",
                  color: "#5a5f4d",
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }
              },
              h("i", { className: "ph ph-copy", style: { fontSize: "15px" } })
            ),
            h(
              "button",
              {
                type: "button",
                title: "编辑问卷",
                onClick: () => onEditSurvey && onEditSurvey(survey),
                style: {
                  border: "none",
                  background: "rgba(255,255,255,0.68)",
                  color: "#5a5f4d",
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }
              },
              h("i", { className: "ph ph-pencil-simple", style: { fontSize: "15px" } })
            ),
            h(
              "button",
              {
                type: "button",
                title: "删除问卷",
                onClick: async () => {
                  if (!window.confirm(`确定要删除自拟问卷《${survey.title}》及其全部答卷吗？`)) return;
                  await customSurveyStore.deleteSurvey(survey.id);
                },
                style: {
                  border: "none",
                  background: "rgba(255,255,255,0.68)",
                  color: "#B4534B",
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }
              },
              h("i", { className: "ph ph-trash", style: { fontSize: "15px" } })
            )
          )
        );
      })
    );
  };

  // ==========================================
  // 5. 组件 B：自拟问卷编辑器弹窗
  // ==========================================
  const CustomSurveyEditorModal = ({ isOpen, initialSurvey, onClose, onSaved }) => {
    const h = React.createElement;
    const [title, setTitle] = React.useState("");
    const [subtitle, setSubtitle] = React.useState("");
    const [colorIndex, setColorIndex] = React.useState(1);
    const [questions, setQuestions] = React.useState([]);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
      if (!isOpen) return;
      if (initialSurvey) {
        setTitle(initialSurvey.title || "");
        setSubtitle(initialSurvey.subtitle || "");
        setColorIndex(initialSurvey.colorIndex || 1);
        setQuestions(
          Array.isArray(initialSurvey.questions) && initialSurvey.questions.length > 0
            ? JSON.parse(JSON.stringify(initialSurvey.questions))
            : [{ id: uid("q"), type: "text", title: "", options: [] }]
        );
      } else {
        setTitle("");
        setSubtitle("");
        setColorIndex(1);
        setQuestions([
          { id: uid("q"), type: "single", title: "", options: ["选项一", "选项二"] },
          { id: uid("q"), type: "text", title: "", options: [] }
        ]);
      }
    }, [isOpen, initialSurvey]);

    if (!isOpen) return null;

    const addQuestion = (type) => {
      const base = {
        id: uid("q"),
        type,
        title: "",
        options: type === "single" || type === "multi" ? ["选项一", "选项二"] : []
      };
      setQuestions((prev) => [...prev, base]);
    };

    const updateQuestion = (idx, patch) => {
      setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
    };

    const moveQuestion = (idx, delta) => {
      const target = idx + delta;
      if (target < 0 || target >= questions.length) return;
      setQuestions((prev) => {
        const arr = [...prev];
        const tmp = arr[idx];
        arr[idx] = arr[target];
        arr[target] = tmp;
        return arr;
      });
    };

    const removeQuestion = (idx) => {
      if (questions.length <= 1) {
        alert("问卷至少需要保留 1 道题目");
        return;
      }
      setQuestions((prev) => prev.filter((_, i) => i !== idx));
    };

    const applyPreset = (tpl) => {
      setTitle(tpl.title);
      setSubtitle(tpl.subtitle);
      setColorIndex(tpl.colorIndex || 1);
      setQuestions(
        tpl.questions.map((q, i) => ({
          ...q,
          id: `q${i + 1}_${Date.now().toString(36).slice(-3)}`,
          options: Array.isArray(q.options) ? [...q.options] : []
        }))
      );
    };

    const handleSave = async () => {
      const cleanTitle = title.trim();
      if (!cleanTitle) {
        alert("请先填写问卷标题");
        return;
      }
      const validQuestions = questions
        .map((q, idx) => ({
          id: q.id || `q${idx + 1}`,
          type: q.type || "text",
          title: String(q.title || "").trim(),
          options:
            q.type === "single" || q.type === "multi"
              ? (q.options || []).map((o) => String(o || "").trim()).filter(Boolean)
              : []
        }))
        .filter((q) => q.title.length > 0);

      if (validQuestions.length === 0) {
        alert("请至少填写 1 道有效题目");
        return;
      }
      const badChoice = validQuestions.find((q) => (q.type === "single" || q.type === "multi") && q.options.length < 2);
      if (badChoice) {
        alert(`题目「${badChoice.title}」至少需要 2 个非空选项`);
        return;
      }

      setSaving(true);
      try {
        const saved = await customSurveyStore.saveSurvey({
          id: initialSurvey?.id,
          createdAt: initialSurvey?.createdAt,
          title: cleanTitle,
          subtitle: subtitle.trim(),
          colorIndex,
          icon: initialSurvey?.icon || "note-pencil",
          questions: validQuestions
        });
        if (typeof onSaved === "function") onSaved(saved);
        onClose();
      } catch (e) {
        alert("保存问卷失败：" + (e?.message || e));
      } finally {
        setSaving(false);
      }
    };

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 13500,
          background: "rgba(38, 42, 34, 0.52)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "14px",
          fontFamily: "system-ui, -apple-system, sans-serif"
        },
        onClick: (e) => {
          if (e.target === e.currentTarget) onClose();
        }
      },
      h(
        "div",
        {
          style: {
            width: "100%",
            maxWidth: "420px",
            maxHeight: "88vh",
            background: "#F9F7F5",
            borderRadius: "22px",
            border: "1px solid #E5E0D5",
            boxShadow: "0 20px 50px rgba(0,0,0,0.26)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }
        },
        // 顶栏
        h(
          "div",
          {
            style: {
              padding: "14px 16px",
              background: "#FFFFFF",
              borderBottom: "1px solid #ECE7DE",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0
            }
          },
          h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#4A5140" } }, initialSurvey ? "✎ 编辑自拟问卷" : "✦ 新建绣衣自拟问卷"),
          h(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: { border: "none", background: "#F0ECE4", color: "#5a5f4d", width: "28px", height: "28px", borderRadius: "50%", cursor: "pointer" }
            },
            "✕"
          )
        ),

        // 滚动内容区
        h(
          "div",
          {
            style: {
              flex: 1,
              overflowY: "auto",
              padding: "14px 16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }
          },
          // 灵感模板栏（仅新建时显示）
          !initialSurvey &&
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "6px" } },
              h("span", { style: { fontSize: "11.5px", color: "#8A9080", fontWeight: 600 } }, "快速套用模板（可再自由修改）："),
              h(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                PRESET_TEMPLATES.map((tpl, i) =>
                  h(
                    "button",
                    {
                      key: i,
                      type: "button",
                      onClick: () => applyPreset(tpl),
                      style: {
                        border: "1px solid #D8E2DC",
                        background: "#FFFFFF",
                        color: "#5a5f4d",
                        fontSize: "11.5px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    `✨ ${tpl.label}`
                  )
                )
              )
            ),

          // 标题与导语卡片
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                borderRadius: "16px",
                padding: "12px 14px",
                border: "1px solid #EAE5DC",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }
            },
            h("input", {
              value: title,
              onChange: (e) => setTitle(e.target.value),
              placeholder: "问卷标题（如：绣衣楼心腹默契度暗访）",
              style: {
                width: "100%",
                padding: "9px 11px",
                borderRadius: "10px",
                border: "1px solid #DDD8CE",
                fontSize: "14px",
                fontWeight: 700,
                color: "#3F4536",
                boxSizing: "border-box",
                outline: "none"
              }
            }),
            h("textarea", {
              value: subtitle,
              onChange: (e) => setSubtitle(e.target.value),
              placeholder: "问卷导语/要求（选填，例如：如实作答，不许敷衍）",
              rows: 2,
              style: {
                width: "100%",
                padding: "8px 11px",
                borderRadius: "10px",
                border: "1px solid #DDD8CE",
                fontSize: "12.5px",
                color: "#5a5f4d",
                boxSizing: "border-box",
                resize: "none",
                outline: "none",
                fontFamily: "inherit"
              }
            }),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "8px" } },
              h("span", { style: { fontSize: "12px", color: "#7A826F" } }, "卡片色系："),
              MORANDI_THEMES.map((t) =>
                h("button", {
                  key: t.idx,
                  type: "button",
                  title: t.name,
                  onClick: () => setColorIndex(t.idx),
                  style: {
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: t.bg,
                    border: colorIndex === t.idx ? `2.5px solid ${t.accent}` : "1px solid #D5CFC4",
                    cursor: "pointer"
                  }
                })
              )
            )
          ),

          // 题目列表
          questions.map((q, qIdx) =>
            h(
              "div",
              {
                key: q.id || qIdx,
                style: {
                  background: "#FFFFFF",
                  borderRadius: "16px",
                  padding: "12px 14px",
                  border: "1px solid #EAE5DC",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }
              },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" } },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "6px" } },
                  h("span", { style: { fontSize: "12px", fontWeight: 700, color: "#6F9485" } }, `第 ${qIdx + 1} 题`),
                  h(
                    "select",
                    {
                      value: q.type,
                      onChange: (e) => {
                        const nt = e.target.value;
                        updateQuestion(qIdx, {
                          type: nt,
                          options: nt === "single" || nt === "multi" ? (q.options?.length >= 2 ? q.options : ["选项一", "选项二"]) : []
                        });
                      },
                      style: {
                        fontSize: "11.5px",
                        padding: "2px 6px",
                        borderRadius: "8px",
                        border: "1px solid #DDD8CE",
                        color: "#5a5f4d",
                        background: "#F9F7F5"
                      }
                    },
                    QUESTION_TYPES.map((qt) => h("option", { key: qt.type, value: qt.type }, qt.label))
                  )
                ),
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "4px" } },
                  h(
                    "button",
                    {
                      type: "button",
                      disabled: qIdx === 0,
                      onClick: () => moveQuestion(qIdx, -1),
                      style: { border: "1px solid #E5E0D5", background: "#FAF8F4", color: "#666", width: "24px", height: "24px", borderRadius: "6px", cursor: qIdx === 0 ? "not-allowed" : "pointer", opacity: qIdx === 0 ? 0.35 : 1 }
                    },
                    "↑"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      disabled: qIdx === questions.length - 1,
                      onClick: () => moveQuestion(qIdx, 1),
                      style: { border: "1px solid #E5E0D5", background: "#FAF8F4", color: "#666", width: "24px", height: "24px", borderRadius: "6px", cursor: qIdx === questions.length - 1 ? "not-allowed" : "pointer", opacity: qIdx === questions.length - 1 ? 0.35 : 1 }
                    },
                    "↓"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => removeQuestion(qIdx),
                      style: { border: "1px solid #ECCAC3", background: "#FDF2F0", color: "#B4534B", padding: "0 7px", height: "24px", borderRadius: "6px", fontSize: "11px", cursor: "pointer" }
                    },
                    "删"
                  )
                )
              ),
              h("input", {
                value: q.title,
                onChange: (e) => updateQuestion(qIdx, { title: e.target.value }),
                placeholder: "请输入问题内容…",
                style: {
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "10px",
                  border: "1px solid #DDD8CE",
                  fontSize: "13px",
                  color: "#3F4536",
                  boxSizing: "border-box",
                  outline: "none"
                }
              }),
              (q.type === "single" || q.type === "multi") &&
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "4px" } },
                  (q.options || []).map((opt, oIdx) =>
                    h(
                      "div",
                      { key: oIdx, style: { display: "flex", alignItems: "center", gap: "6px" } },
                      h("span", { style: { fontSize: "11px", color: "#9AA190", width: "16px" } }, `${String.fromCharCode(65 + oIdx)}.`),
                      h("input", {
                        value: opt,
                        onChange: (e) => {
                          const nextOpts = [...(q.options || [])];
                          nextOpts[oIdx] = e.target.value;
                          updateQuestion(qIdx, { options: nextOpts });
                        },
                        placeholder: `选项 ${oIdx + 1}`,
                        style: {
                          flex: 1,
                          padding: "6px 9px",
                          borderRadius: "8px",
                          border: "1px solid #E5E0D5",
                          fontSize: "12.5px",
                          color: "#5a5f4d",
                          outline: "none"
                        }
                      }),
                      (q.options || []).length > 2 &&
                        h(
                          "button",
                          {
                            type: "button",
                            onClick: () => {
                              const nextOpts = (q.options || []).filter((_, oi) => oi !== oIdx);
                              updateQuestion(qIdx, { options: nextOpts });
                            },
                            style: { border: "none", background: "transparent", color: "#B4534B", cursor: "pointer", fontSize: "13px" }
                          },
                          "✕"
                        )
                    )
                  ),
                  (q.options || []).length < 8 &&
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => updateQuestion(qIdx, { options: [...(q.options || []), `选项${(q.options || []).length + 1}`] }),
                        style: {
                          alignSelf: "flex-start",
                          border: "1px dashed #B8C7BE",
                          background: "#F5FAF7",
                          color: "#5E8475",
                          fontSize: "11.5px",
                          padding: "3px 10px",
                          borderRadius: "8px",
                          cursor: "pointer"
                        }
                      },
                      "+ 添加选项"
                    )
                ),
              q.type === "rating" &&
                h("div", { style: { fontSize: "11.5px", color: "#9A9F92" } }, "★ ★ ★ ★ ★ （名士将给出 1~5 星评分与简短旁白）"),
              q.type === "text" &&
                h("div", { style: { fontSize: "11.5px", color: "#9A9F92" } }, "名士将以自身口吻自由撰写文字答复")
            )
          ),

          // 添加题型按钮栏
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", paddingTop: "2px" } },
            QUESTION_TYPES.map((qt) =>
              h(
                "button",
                {
                  key: qt.type,
                  type: "button",
                  onClick: () => addQuestion(qt.type),
                  style: {
                    border: "1px dashed #A8C8BA",
                    background: "#FFFFFF",
                    color: "#5a5f4d",
                    fontSize: "12px",
                    fontWeight: 600,
                    padding: "6px 11px",
                    borderRadius: "999px",
                    cursor: "pointer"
                  }
                },
                `+ ${qt.label}`
              )
            )
          )
        ),

        // 固定底栏
        h(
          "div",
          {
            style: {
              padding: "12px 16px",
              background: "#FFFFFF",
              borderTop: "1px solid #ECE7DE",
              display: "flex",
              gap: "10px",
              flexShrink: 0
            }
          },
          h(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: {
                flex: 1,
                padding: "10px",
                borderRadius: "14px",
                border: "1px solid #DDD8CE",
                background: "#F9F7F5",
                color: "#6A7060",
                fontSize: "13.5px",
                fontWeight: 600,
                cursor: "pointer"
              }
            },
            "取消"
          ),
          h(
            "button",
            {
              type: "button",
              disabled: saving,
              onClick: handleSave,
              style: {
                flex: 2,
                padding: "10px",
                borderRadius: "14px",
                border: "none",
                background: "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)",
                color: "#FFFFFF",
                fontSize: "13.5px",
                fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(143, 169, 157, 0.35)"
              }
            },
            saving ? "保存中…" : "保存自拟问卷"
          )
        )
      )
    );
  };

  // ==========================================
  // 6. P1：答卷转发传讯 + 传讯气泡卡片 + LLM 协议
  // ==========================================
  function formatAnswerValueText(q, ans) {
    if (!ans) return "（未答）";
    if (Array.isArray(ans.value)) return ans.value.join("、");
    if (q?.type === "rating") return `${ans.value || 0} / 5 星`;
    return String(ans.value || "");
  }

  async function forwardSurveyRecordToChat(record, targetChar, note) {
    if (!record || !targetChar) throw new Error("缺少转发目标或答卷数据");
    const snap = record.surveySnapshot || { title: "绣衣自拟问卷", questions: [] };
    const qaList = (snap.questions || []).map((q, idx) => {
      const ans = record.answers?.[q.id] || {};
      return {
        index: idx + 1,
        question: q.title,
        type: q.type,
        answerText: formatAnswerValueText(q, ans),
        aside: ans.aside || ""
      };
    });

    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msg = {
      id: now,
      type: "custom_survey_card",
      isMe: true,
      sender: "me",
      timestamp: now,
      time: timeStr,
      text: `[绣衣答卷] ${record.characterName} 填写了《${snap.title}》`,
      content: {
        recordId: record.id,
        surveyTitle: snap.title,
        surveySubtitle: snap.subtitle || "",
        respondentId: record.characterId,
        respondentName: record.characterName,
        createdAt: record.createdAt,
        qaList,
        closingRemark: record.closingRemark || "",
        note: String(note || "").trim()
      }
    };

    const charId = targetChar.id;
    let saved = false;
    try {
      if (global.chatHistoryStore && typeof global.chatHistoryStore.saveMessage === "function") {
        await global.chatHistoryStore.saveMessage(charId, msg);
        saved = true;
      }
    } catch (e) {}
    if (!saved) {
      try {
        const key = "t8_chat_history_" + charId;
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.push(msg);
        localStorage.setItem(key, JSON.stringify(arr));
      } catch (e) {}
    }

    // 同步更新传讯列表最后一条摘要
    try {
      const rawList = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      if (Array.isArray(rawList)) {
        const updated = rawList.map((c) =>
          c && String(c.id) === String(charId)
            ? { ...c, lastMessage: msg.text, lastTime: timeStr, timestamp: now }
            : c
        );
        localStorage.setItem("t8_chat_list", JSON.stringify(updated));
      }
    } catch (e) {}

    return msg;
  }

  function formatCustomSurveyCardForLLM(msg, chatData) {
    const c = msg?.content || {};
    const isSameRespondent =
      chatData &&
      ((c.respondentId && String(c.respondentId) === String(chatData.id)) ||
        (c.respondentName && c.respondentName === chatData.name));
    const qaLines = (c.qaList || [])
      .map((item) => `Q${item.index}. ${item.question}\n   答：${item.answerText}${item.aside ? `（内心旁白：${item.aside}）` : ""}`)
      .join("\n");
    const relationHint = isSameRespondent
      ? `这份答卷正是【你自己】刚才填写的！用户现在把你的答卷直接甩到了传讯里找你对质/追问，请结合你的人设自然回应（可以嘴硬、害羞、补刀、辩解或顺势调情）。`
      : `这份答卷是【${c.respondentName || "另一位名士"}】填写的，用户现在把TA的答卷转给你看，请结合你的人设与你们的关系自然吃瓜、评价或吐槽。`;

    return {
      role: msg.isMe ? "user" : "assistant",
      content: `【绣衣自拟问卷答卷卡片】
问卷标题：《${c.surveyTitle || "绣衣问卷"}》
作答名士：${c.respondentName || "名士"}
${c.note ? `用户转发附言：“${c.note}”\n` : ""}答卷详情：
${qaLines}
${c.closingRemark ? `名士落款：“${c.closingRemark}”\n` : ""}（提示：${relationHint}）`
    };
  }

  const CustomSurveyCardBubble = ({ msg }) => {
    const h = React.createElement;
    const [showDetail, setShowDetail] = React.useState(false);
    const c = msg?.content || {};
    const qaList = Array.isArray(c.qaList) ? c.qaList : [];
    const preview = qaList.slice(0, 2);

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          onClick: () => setShowDetail(true),
          style: {
            width: "242px",
            maxWidth: "74vw",
            background: "linear-gradient(155deg, #FAF8F3 0%, #F1F6F3 100%)",
            border: "1px solid #D5E0D9",
            borderRadius: "16px",
            padding: "11px 12px",
            boxShadow: "0 4px 12px rgba(74, 90, 80, 0.1)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: "7px",
            textAlign: "left",
            fontFamily: "system-ui, -apple-system, sans-serif"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" } },
          h(
            "span",
            { style: { fontSize: "10.5px", fontWeight: 700, color: "#5E8475", background: "#E5F0EA", padding: "2px 7px", borderRadius: "999px" } },
            "📋 绣衣自拟答卷"
          ),
          h("span", { style: { fontSize: "10.5px", color: "#8A9285" } }, `${c.respondentName || "名士"}作答`)
        ),
        h(
          "div",
          { style: { fontSize: "13.5px", fontWeight: 700, color: "#3C4438", lineHeight: 1.35 } },
          `《${c.surveyTitle || "绣衣问卷"}》`
        ),
        preview.map((item, idx) =>
          h(
            "div",
            {
              key: idx,
              style: {
                background: "rgba(255,255,255,0.78)",
                borderRadius: "9px",
                padding: "6px 8px",
                fontSize: "11.5px",
                lineHeight: 1.45,
                color: "#555D4E"
              }
            },
            h("div", { style: { fontWeight: 600, color: "#444C3D" } }, `${item.index}. ${item.question}`),
            h(
              "div",
              {
                style: {
                  color: "#5E8475",
                  marginTop: "2px",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden"
                }
              },
              `答：${item.answerText}`
            )
          )
        ),
        c.note &&
          h(
            "div",
            { style: { fontSize: "11px", color: "#7E6B56", background: "#F5EFE6", borderRadius: "8px", padding: "4px 8px" } },
            `附言：${c.note}`
          ),
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "10.5px", color: "#8A9285", paddingTop: "2px", borderTop: "1px dashed #DFE6E1" } },
          h("span", null, `共 ${qaList.length} 题`),
          h("span", { style: { color: "#5E8475", fontWeight: 600 } }, "点击展卷查看 ›")
        )
      ),
      showDetail &&
        h(
          "div",
          {
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 14000,
              background: "rgba(32, 36, 30, 0.52)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
              fontFamily: "system-ui, -apple-system, sans-serif"
            },
            onClick: (e) => {
              if (e.target === e.currentTarget) setShowDetail(false);
            }
          },
          h(
            "div",
            {
              style: {
                width: "100%",
                maxWidth: "390px",
                maxHeight: "82vh",
                background: "#F9F7F5",
                borderRadius: "20px",
                border: "1px solid #DFD9CE",
                boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column"
              }
            },
            h(
              "div",
              {
                style: {
                  padding: "13px 16px",
                  background: "#FFFFFF",
                  borderBottom: "1px solid #ECE7DE",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }
              },
              h("span", { style: { fontSize: "14px", fontWeight: 700, color: "#3F4536" } }, `📋 ${c.respondentName || "名士"} · 《${c.surveyTitle || "绣衣问卷"}》`),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => setShowDetail(false),
                  style: { border: "none", background: "#F0ECE4", color: "#5a5f4d", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" }
                },
                "✕"
              )
            ),
            h(
              "div",
              { style: { flex: 1, overflowY: "auto", padding: "14px 16px 18px", display: "flex", flexDirection: "column", gap: "10px" } },
              qaList.map((item, idx) =>
                h(
                  "div",
                  {
                    key: idx,
                    style: { background: "#FFFFFF", borderRadius: "13px", padding: "10px 12px", border: "1px solid #ECE7DE", display: "flex", flexDirection: "column", gap: "5px" }
                  },
                  h("div", { style: { fontSize: "13px", fontWeight: 700, color: "#454B3C" } }, `${item.index}. ${item.question}`),
                  h("div", { style: { fontSize: "12.5px", color: "#3F5D50", lineHeight: 1.55, whiteSpace: "pre-wrap" } }, item.answerText),
                  item.aside &&
                    h("div", { style: { fontSize: "11px", color: "#7E6B56", background: "#F5EFE6", borderRadius: "7px", padding: "4px 8px" } }, `💬 旁白：${item.aside}`)
                )
              ),
              c.closingRemark &&
                h(
                  "div",
                  { style: { background: "#F2F7F4", border: "1px dashed #BFD3C8", borderRadius: "12px", padding: "10px 12px", fontSize: "12px", color: "#4A5A50" } },
                  h("strong", null, `${c.respondentName || "名士"} 落款：`),
                  c.closingRemark
                )
            )
          )
        )
    );
  };

  // ==========================================
  // 7. 组件 C：自拟问卷名士作答、多人横向对比与历史答卷页（P0 + P1）
  // ==========================================
  const CustomSurveyRunnerPage = ({ survey, onBack, onEditSurvey }) => {
    const h = React.createElement;
    const [currentSurvey, setCurrentSurvey] = React.useState(survey);
    const [characters, setCharacters] = React.useState([]);
    const [selectedChar, setSelectedChar] = React.useState(null);
    const [records, setRecords] = React.useState([]);
    const [activeRecord, setActiveRecord] = React.useState(null);
    const [viewMode, setViewMode] = React.useState("single"); // "single" | "compare"
    const [isAnswering, setIsAnswering] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    // P1：转发至传讯弹窗状态
    const [forwardRecord, setForwardRecord] = React.useState(null);
    const [forwardTargetId, setForwardTargetId] = React.useState("");
    const [forwardNote, setForwardNote] = React.useState("");
    const [forwarding, setForwarding] = React.useState(false);

    React.useEffect(() => {
      setCurrentSurvey(survey);
    }, [survey]);

    const reloadData = async () => {
      const [chars, recs, latestSurveys] = await Promise.all([
        loadAllCharacters(),
        customSurveyStore.getRecordsBySurvey(survey.id),
        customSurveyStore.getSurveys()
      ]);
      const fresh = (latestSurveys || []).find((s) => s.id === survey.id);
      if (fresh) setCurrentSurvey(fresh);
      setCharacters(chars || []);
      if (!selectedChar && chars && chars.length > 0) setSelectedChar(chars[0]);
      setRecords(recs || []);
      setActiveRecord((prev) => {
        if (prev && (recs || []).some((r) => r.id === prev.id)) return prev;
        return (recs && recs[0]) || null;
      });
    };

    React.useEffect(() => {
      reloadData();
      const handler = () => reloadData();
      global.addEventListener(UPDATE_EVENT, handler);
      return () => global.removeEventListener(UPDATE_EVENT, handler);
    }, [survey?.id]);

    const handleAskCharacter = async () => {
      if (!selectedChar) {
        alert("请先在上方选择一位要作答的名士");
        return;
      }
      if (isAnswering) return;
      setIsAnswering(true);
      try {
        const rec = await generateCharacterSurveyAnswer({
          character: selectedChar,
          survey: currentSurvey
        });
        setActiveRecord(rec);
        setViewMode("single");
        await reloadData();
      } catch (err) {
        console.error("名士作答失败:", err);
        alert("名士作答失败：" + (err?.message || err));
      } finally {
        setIsAnswering(false);
      }
    };

    const openForwardModal = (rec) => {
      if (!rec) return;
      setForwardRecord(rec);
      const matched = characters.find(
        (c) => String(c.id) === String(rec.characterId) || c.name === rec.characterName
      );
      setForwardTargetId(matched ? String(matched.id) : characters[0] ? String(characters[0].id) : "");
      setForwardNote("");
    };

    const handleConfirmForward = async () => {
      const target = characters.find((c) => String(c.id) === String(forwardTargetId));
      if (!target || !forwardRecord) {
        alert("请选择要转发的名士");
        return;
      }
      setForwarding(true);
      try {
        await forwardSurveyRecordToChat(forwardRecord, target, forwardNote);
        setForwardRecord(null);
        alert(`已将答卷卡片转发至【${target.name}】的传讯窗口，快去传讯找 TA 聊聊吧！`);
      } catch (err) {
        alert("转发失败：" + (err?.message || err));
      } finally {
        setForwarding(false);
      }
    };

    const handleCopyRecord = async (rec) => {
      if (!rec) return;
      const snap = rec.surveySnapshot || currentSurvey;
      const lines = [
        `【绣衣自拟问卷 · ${snap.title}】`,
        `作答名士：${rec.characterName}（${formatTimeShort(rec.createdAt)}）`,
        ""
      ];
      (snap.questions || []).forEach((q, idx) => {
        const ans = rec.answers?.[q.id] || {};
        lines.push(`${idx + 1}. ${q.title}`);
        lines.push(`   答：${formatAnswerValueText(q, ans)}`);
        if (ans.aside) lines.push(`   （旁白：${ans.aside}）`);
      });
      if (rec.closingRemark) {
        lines.push("", `—— ${rec.characterName}落款：「${rec.closingRemark}」`);
      }
      const ok = await copyPlainText(lines.join("\n"));
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    };

    const displaySnap = activeRecord?.surveySnapshot || currentSurvey;
    // 多人对比时按角色去重取每位名士最新一份答卷（若同一人填多次也保留最近最多 6 份）
    const compareRecords = records.slice(0, 6);
    const compareQuestions = currentSurvey?.questions || displaySnap?.questions || [];

    return h(
      "div",
      {
        style: {
          position: "absolute",
          inset: 0,
          background: "#F9F7F5",
          zIndex: 35,
          display: "flex",
          flexDirection: "column",
          fontFamily: "system-ui, -apple-system, sans-serif"
        }
      },
      // 顶栏
      h(
        "div",
        {
          className: "t11-nav",
          style: { flexShrink: 0, display: "flex", alignItems: "center", gap: "8px" }
        },
        h(
          "div",
          { className: "back-btn", onClick: onBack },
          h("i", { className: "ph ph-caret-left", style: { fontSize: "24px" } })
        ),
        h(
          "div",
          {
            className: "title",
            style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
          },
          currentSurvey?.title || "自拟问卷"
        ),
        h(
          "button",
          {
            type: "button",
            onClick: () => onEditSurvey && onEditSurvey(currentSurvey),
            style: {
              border: "1px solid #D8DFD2",
              background: "#FFFFFF",
              color: "#5a5f4d",
              fontSize: "12px",
              padding: "4px 10px",
              borderRadius: "999px",
              cursor: "pointer",
              flexShrink: 0
            }
          },
          "编辑题目"
        )
      ),

      // 主滚动区
      h(
        "div",
        {
          className: "no-scrollbar",
          style: {
            flex: 1,
            overflowY: "auto",
            padding: "12px 16px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }
        },
        // 问卷说明 + 名士发卷卡片
        h(
          "div",
          {
            style: {
              background: "#FFFFFF",
              borderRadius: "18px",
              padding: "14px",
              border: "1px solid #EAE5DC",
              boxShadow: "0 4px 14px rgba(90,95,77,0.05)",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }
          },
          currentSurvey?.subtitle &&
            h("div", { style: { fontSize: "12.5px", color: "#767D6B", lineHeight: 1.55 } }, currentSurvey.subtitle),
          h(
            "div",
            { style: { fontSize: "12px", fontWeight: 700, color: "#5a5f4d" } },
            "选择要发卷的名士（将结合人设 + 身份库 + 世界书 + 传讯近30条作答）："
          ),
          characters.length === 0
            ? h("div", { style: { fontSize: "12px", color: "#9AA190" } }, "通讯录中暂无名士，请先前往传讯添加角色")
            : h(
                "div",
                {
                  className: "no-scrollbar",
                  style: { display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }
                },
                characters.map((c) => {
                  const isSel = selectedChar && String(selectedChar.id) === String(c.id);
                  return h(
                    "button",
                    {
                      key: c.id,
                      type: "button",
                      onClick: () => setSelectedChar(c),
                      style: {
                        border: isSel ? "1.5px solid #8FA99D" : "1px solid #E5E0D5",
                        background: isSel ? "#EEF6F2" : "#FAF8F4",
                        color: isSel ? "#3F5D50" : "#5a5f4d",
                        borderRadius: "999px",
                        padding: "5px 12px",
                        fontSize: "12.5px",
                        fontWeight: isSel ? 700 : 500,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      }
                    },
                    c.name
                  );
                })
              ),
          h(
            "button",
            {
              type: "button",
              disabled: isAnswering || !selectedChar,
              onClick: handleAskCharacter,
              style: {
                width: "100%",
                padding: "11px",
                borderRadius: "14px",
                border: "none",
                background: isAnswering ? "#C4CEC8" : "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)",
                color: "#FFFFFF",
                fontSize: "14px",
                fontWeight: 700,
                cursor: isAnswering ? "not-allowed" : "pointer",
                boxShadow: "0 6px 14px rgba(143,169,157,0.32)"
              }
            },
            isAnswering
              ? `正在揣摩【${selectedChar?.name || "名士"}】人设填卷中…`
              : `✨ 请【${selectedChar?.name || "名士"}】填写这份问卷`
          )
        ),

        // 历史答卷切换条 + P1 单人/多人对比切换
        records.length > 0 &&
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
              h(
                "span",
                { style: { fontSize: "12px", fontWeight: 700, color: "#7A826F" } },
                `📋 已回收答卷（${records.length} 份）`
              ),
              records.length >= 2 &&
                h(
                  "div",
                  {
                    style: {
                      display: "inline-flex",
                      background: "#ECE8DF",
                      borderRadius: "999px",
                      padding: "2px"
                    }
                  },
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => setViewMode("single"),
                      style: {
                        border: "none",
                        borderRadius: "999px",
                        padding: "3px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                        background: viewMode === "single" ? "#FFFFFF" : "transparent",
                        color: viewMode === "single" ? "#3F5D50" : "#7A826F"
                      }
                    },
                    "单人阅卷"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => setViewMode("compare"),
                      style: {
                        border: "none",
                        borderRadius: "999px",
                        padding: "3px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                        background: viewMode === "compare" ? "#FFFFFF" : "transparent",
                        color: viewMode === "compare" ? "#3F5D50" : "#7A826F"
                      }
                    },
                    "多人对比"
                  )
                )
            ),
            viewMode === "single" &&
              h(
                "div",
                { className: "no-scrollbar", style: { display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "2px" } },
                records.map((r) => {
                  const isAct = activeRecord && activeRecord.id === r.id;
                  return h(
                    "button",
                    {
                      key: r.id,
                      type: "button",
                      onClick: () => setActiveRecord(r),
                      style: {
                        border: isAct ? "1.5px solid #8FA99D" : "1px solid #E2DDD2",
                        background: isAct ? "#FFFFFF" : "#F3F0EA",
                        color: isAct ? "#3F5D50" : "#6F7666",
                        borderRadius: "12px",
                        padding: "6px 11px",
                        fontSize: "12px",
                        fontWeight: isAct ? 700 : 500,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      }
                    },
                    `${r.characterName} · ${formatTimeShort(r.createdAt).slice(5, 16)}`
                  );
                })
              )
          ),

        // P1：多人对比视图
        viewMode === "compare" && records.length >= 2
          ? h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "12px" } },
              compareQuestions.map((q, qIdx) =>
                h(
                  "div",
                  {
                    key: q.id || qIdx,
                    style: {
                      background: "#FFFFFF",
                      borderRadius: "16px",
                      padding: "13px 14px",
                      border: "1px solid #EAE5DC",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }
                  },
                  h("div", { style: { fontSize: "13.5px", fontWeight: 700, color: "#3F4536" } }, `${qIdx + 1}. ${q.title}`),
                  compareRecords.map((rec) => {
                    const ans = rec.answers?.[q.id];
                    return h(
                      "div",
                      {
                        key: rec.id,
                        style: {
                          background: "#FAF8F4",
                          borderRadius: "11px",
                          padding: "8px 10px",
                          border: "1px solid #EFEAE0",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px"
                        }
                      },
                      h(
                        "div",
                        { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                        h("span", { style: { fontSize: "12px", fontWeight: 700, color: "#4E6E60" } }, rec.characterName),
                        h("span", { style: { fontSize: "10.5px", color: "#9AA190" } }, formatTimeShort(rec.createdAt).slice(5, 16))
                      ),
                      h(
                        "div",
                        { style: { fontSize: "12.5px", color: "#3F4536", lineHeight: 1.55, whiteSpace: "pre-wrap" } },
                        ans ? formatAnswerValueText(q, ans) : "（此卷作答时尚无此题）"
                      ),
                      ans?.aside &&
                        h("div", { style: { fontSize: "11px", color: "#7E6B56" } }, `💬 ${ans.aside}`)
                    );
                  })
                )
              ),
              h(
                "div",
                {
                  style: {
                    background: "#FFFFFF",
                    borderRadius: "16px",
                    padding: "13px 14px",
                    border: "1px solid #EAE5DC",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }
                },
                h("div", { style: { fontSize: "13px", fontWeight: 700, color: "#5E8475" } }, "✦ 各位名士卷末落款一览"),
                compareRecords.map((rec) =>
                  h(
                    "div",
                    { key: rec.id, style: { fontSize: "12px", color: "#4A5A50", background: "#F3F7F4", borderRadius: "10px", padding: "8px 10px", lineHeight: 1.55 } },
                    h("strong", null, `${rec.characterName}：`),
                    rec.closingRemark || "（无落款）"
                  )
                )
              )
            )
          : activeRecord
          ? h(
              "div",
              {
                style: {
                  background: "#FFFFFF",
                  borderRadius: "18px",
                  padding: "16px 14px",
                  border: "1px solid #EAE5DC",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px"
                }
              },
              // 答卷抬头
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px dashed #E6E1D7",
                    paddingBottom: "10px",
                    gap: "6px",
                    flexWrap: "wrap"
                  }
                },
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "3px" } },
                  h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#3F4536" } }, `${activeRecord.characterName} 的答卷`),
                  h("span", { style: { fontSize: "11px", color: "#9AA190" } }, formatTimeShort(activeRecord.createdAt))
                ),
                h(
                  "div",
                  { style: { display: "flex", gap: "5px", flexWrap: "wrap" } },
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => openForwardModal(activeRecord),
                      style: {
                        border: "1px solid #BDD2C6",
                        background: "#EEF6F2",
                        color: "#3F5D50",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        padding: "4px 9px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    "转发传讯"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => handleCopyRecord(activeRecord),
                      style: {
                        border: "1px solid #D8DFD2",
                        background: copied ? "#E9F5EC" : "#FAF8F4",
                        color: copied ? "#2E6B50" : "#5a5f4d",
                        fontSize: "11.5px",
                        padding: "4px 9px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    copied ? "已复制 ✓" : "复制"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: async () => {
                        if (!window.confirm("确定删除这份答卷记录吗？")) return;
                        await customSurveyStore.deleteRecord(activeRecord.id);
                      },
                      style: {
                        border: "1px solid #ECCAC3",
                        background: "#FDF2F0",
                        color: "#B4534B",
                        fontSize: "11.5px",
                        padding: "4px 9px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    "删除"
                  )
                )
              ),
              // 五维记忆来源角标
              Array.isArray(activeRecord.contextBadges) &&
                activeRecord.contextBadges.length > 0 &&
                h(
                  "div",
                  { style: { display: "flex", flexWrap: "wrap", gap: "5px" } },
                  activeRecord.contextBadges.map((b, i) =>
                    h(
                      "span",
                      {
                        key: i,
                        style: {
                          fontSize: "10.5px",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: "#F1F5F2",
                          color: "#5E8475"
                        }
                      },
                      b
                    )
                  )
                ),

              // 逐题答案渲染
              (displaySnap?.questions || []).map((q, idx) => {
                const ans = activeRecord.answers?.[q.id] || {};
                const selectedList = Array.isArray(ans.value) ? ans.value : [ans.value];
                return h(
                  "div",
                  {
                    key: q.id || idx,
                    style: {
                      background: "#FAF8F5",
                      borderRadius: "14px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }
                  },
                  h("div", { style: { fontSize: "13.5px", fontWeight: 700, color: "#454B3C" } }, `${idx + 1}. ${q.title}`),
                  (q.type === "single" || q.type === "multi") &&
                    h(
                      "div",
                      { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                      (q.options || []).map((opt, oi) => {
                        const hit = selectedList.includes(opt);
                        return h(
                          "span",
                          {
                            key: oi,
                            style: {
                              fontSize: "12px",
                              padding: "5px 10px",
                              borderRadius: "10px",
                              background: hit ? "#8FA99D" : "#FFFFFF",
                              color: hit ? "#FFFFFF" : "#7A826F",
                              border: hit ? "1px solid #7E9A8D" : "1px solid #E5E0D5",
                              fontWeight: hit ? 700 : 400
                            }
                          },
                          hit ? `✓ ${opt}` : opt
                        );
                      })
                    ),
                  q.type === "rating" &&
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "16px", color: "#D99B43" } },
                      [1, 2, 3, 4, 5].map((n) => h("span", { key: n, style: { opacity: n <= Number(ans.value || 0) ? 1 : 0.25 } }, "★")),
                      h("span", { style: { fontSize: "12px", color: "#7A826F", marginLeft: "6px" } }, `${ans.value || 0} / 5 星`)
                    ),
                  q.type === "text" &&
                    h(
                      "div",
                      {
                        style: {
                          background: "#FFFFFF",
                          borderRadius: "10px",
                          padding: "9px 11px",
                          border: "1px solid #E8E3D9",
                          fontSize: "13px",
                          color: "#3F4536",
                          lineHeight: 1.65,
                          whiteSpace: "pre-wrap"
                        }
                      },
                      String(ans.value || "")
                    ),
                  ans.aside &&
                    h(
                      "div",
                      {
                        style: {
                          fontSize: "11.5px",
                          color: "#7E6B56",
                          background: "#F5EFE6",
                          borderRadius: "8px",
                          padding: "5px 9px",
                          lineHeight: 1.5
                        }
                      },
                      `💬 ${activeRecord.characterName}旁白：${ans.aside}`
                    )
                );
              }),

              // 卷末落款吐槽
              activeRecord.closingRemark &&
                h(
                  "div",
                  {
                    style: {
                      background: "linear-gradient(135deg, #F3F7F4 0%, #FAF7F0 100%)",
                      border: "1px dashed #BFD3C8",
                      borderRadius: "14px",
                      padding: "11px 13px",
                      fontSize: "12.5px",
                      color: "#4A5A50",
                      lineHeight: 1.6
                    }
                  },
                  h("strong", null, `${activeRecord.characterName} 落款：`),
                  activeRecord.closingRemark
                )
            )
          : h(
              "div",
              {
                style: {
                  background: "#FFFFFF",
                  borderRadius: "18px",
                  padding: "16px 14px",
                  border: "1px solid #EAE5DC",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }
              },
              h("div", { style: { fontSize: "13px", fontWeight: 700, color: "#6F7666" } }, `问卷题目预览（共 ${(currentSurvey?.questions || []).length} 题，尚无名士作答）`),
              (currentSurvey?.questions || []).map((q, idx) =>
                h(
                  "div",
                  { key: q.id || idx, style: { fontSize: "12.5px", color: "#5a5f4d", padding: "8px 10px", background: "#FAF8F5", borderRadius: "10px" } },
                  `${idx + 1}. [${(QUESTION_TYPES.find((t) => t.type === q.type) || {}).label || "问答"}] ${q.title}`
                )
              )
            )
      ),

      // P1：转发至传讯弹窗
      forwardRecord &&
        h(
          "div",
          {
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 13800,
              background: "rgba(38, 42, 34, 0.48)",
              backdropFilter: "blur(3px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px"
            },
            onClick: (e) => {
              if (e.target === e.currentTarget) setForwardRecord(null);
            }
          },
          h(
            "div",
            {
              style: {
                width: "100%",
                maxWidth: "360px",
                background: "#F9F7F5",
                borderRadius: "20px",
                border: "1px solid #E5E0D5",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                boxShadow: "0 18px 45px rgba(0,0,0,0.24)"
              }
            },
            h("div", { style: { fontSize: "14.5px", fontWeight: 700, color: "#3F4536" } }, "📨 将答卷卡片转发至传讯"),
            h(
              "div",
              { style: { fontSize: "12px", color: "#767D6B" } },
              `默认发给作答人【${forwardRecord.characterName}】继续追问，也可以转发给其他名士一起吃瓜：`
            ),
            h(
              "select",
              {
                value: forwardTargetId,
                onChange: (e) => setForwardTargetId(e.target.value),
                style: {
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: "10px",
                  border: "1px solid #D8DFD2",
                  background: "#FFFFFF",
                  fontSize: "13px",
                  color: "#3F4536"
                }
              },
              characters.map((c) => h("option", { key: c.id, value: String(c.id) }, c.name))
            ),
            h("input", {
              value: forwardNote,
              onChange: (e) => setForwardNote(e.target.value),
              placeholder: "附言（选填，如：你第2题怎么好意思这么填？）",
              style: {
                width: "100%",
                padding: "9px 10px",
                borderRadius: "10px",
                border: "1px solid #DDD8CE",
                background: "#FFFFFF",
                fontSize: "12.5px",
                color: "#3F4536",
                boxSizing: "border-box"
              }
            }),
            h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(
                "button",
                {
                  type: "button",
                  onClick: () => setForwardRecord(null),
                  style: { flex: 1, padding: "9px", borderRadius: "12px", border: "1px solid #DDD8CE", background: "#FFFFFF", color: "#6A7060", fontSize: "13px", cursor: "pointer" }
                },
                "取消"
              ),
              h(
                "button",
                {
                  type: "button",
                  disabled: forwarding,
                  onClick: handleConfirmForward,
                  style: { flex: 2, padding: "9px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #A8C8BA 0%, #8FA99D 100%)", color: "#FFFFFF", fontSize: "13px", fontWeight: 700, cursor: "pointer" }
                },
                forwarding ? "发送中…" : "确认转发到传讯"
              )
            )
          )
        )
    );
  };

  global.customSurveyStore = customSurveyStore;
  global.generateCharacterSurveyAnswer = generateCharacterSurveyAnswer;
  global.forwardSurveyRecordToChat = forwardSurveyRecordToChat;
  global.formatCustomSurveyCardForLLM = formatCustomSurveyCardForLLM;
  global.CustomSurveyCardBubble = CustomSurveyCardBubble;
  global.CustomSurveyListSection = CustomSurveyListSection;
  global.CustomSurveyEditorModal = CustomSurveyEditorModal;
  global.CustomSurveyRunnerPage = CustomSurveyRunnerPage;
})(typeof window !== "undefined" ? window : globalThis);
