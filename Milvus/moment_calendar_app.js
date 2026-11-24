/**
 * Milvus/moment_calendar_app.js
 * 情侣空间 ·「沧海一刻」独立模块化引擎（P0）
 * - 双独立日历架构：心情日记（独立日历A）与习惯记录（独立日历B，P1落地）互不混用
 * - 心情贴纸采用 emoji-time/*.png，月历每格日期下方纵向排列两个圆圈（上：用户 / 下：角色）
 * - 严格当天传讯近30条门控：当天有聊天则自然化用；当天无聊天则严禁编造传讯，改写活人感独立日常
 * - 数据持久化至 IndexedDB（window.momentCalendarStore）
 */
(function (global) {
  "use strict";

  const MOOD_STICKERS = [
    { id: "excited", label: "兴奋", img: "emoji-time/兴奋.png?v=2", tint: "#FFF6D6" },
    { id: "sweet", label: "甜蜜", img: "emoji-time/甜蜜.png?v=2", tint: "#FFE6EE" },
    { id: "happy", label: "美滋滋", img: "emoji-time/美滋滋.png?v=2", tint: "#FFECD9" },
    { id: "calm", label: "平静", img: "emoji-time/平静.png?v=2", tint: "#E4F3DC" },
    { id: "sleepy", label: "好困", img: "emoji-time/好困.png?v=2", tint: "#EAEAF5" },
    { id: "troubled", label: "苦恼", img: "emoji-time/苦恼.png?v=2", tint: "#E8EEF5" },
    { id: "sad", label: "难过", img: "emoji-time/难过.png?v=2", tint: "#E2ECF7" },
    { id: "angry", label: "气愤", img: "emoji-time/气愤.png?v=2", tint: "#FCE4E4" }
  ];

  const WEEKDAYS_MON_FIRST = ["一", "二", "三", "四", "五", "六", "日"];

  function getStickerById(idOrLabel) {
    if (!idOrLabel) return null;
    const key = String(idOrLabel).trim().toLowerCase();
    return (
      MOOD_STICKERS.find((s) => s.id === key || s.label === String(idOrLabel).trim()) ||
      null
    );
  }

  function formatDateStr(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getTodayStr() {
    return formatDateStr(new Date());
  }

  function buildMonthCells(year, monthIndex) {
    // 周一为每周第一列（0=周一 ... 6=周日）
    const firstDay = new Date(year, monthIndex, 1);
    const jsDow = firstDay.getDay(); // 0=Sun..6=Sat
    const leadingBlanks = jsDow === 0 ? 6 : jsDow - 1;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(monthIndex + 1).padStart(2, "0");
      const dStr = String(d).padStart(2, "0");
      cells.push({ day: d, dateStr: `${year}-${mStr}-${dStr}` });
    }
    return cells;
  }

  function getActiveUserPersona(mePersona) {
    try {
      const savedPersonas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      let activeUser = activeId ? savedPersonas.find((p) => String(p.id) === String(activeId)) : null;
      if (!activeUser && savedPersonas.length > 0) activeUser = savedPersonas[0];
      if (activeUser) {
        return {
          name: activeUser.name || mePersona?.name || "广陵王",
          identity: activeUser.identity || mePersona?.identity || "广陵王 / 绣衣楼主",
          personality: activeUser.personality || mePersona?.personality || "果敢敏锐、重情重义",
          background: activeUser.background || activeUser.bio || mePersona?.background || ""
        };
      }
    } catch (e) {}
    return {
      name: mePersona?.name || "广陵王",
      identity: mePersona?.identity || "广陵王 / 绣衣楼主",
      personality: mePersona?.personality || "果敢敏锐",
      background: mePersona?.background || ""
    };
  }

  async function resolveFullCharacter(taCharacter) {
    if (!taCharacter) return null;
    let full = taCharacter;
    try {
      let list = [];
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        list = await global.chatCharacterStore.getAll();
      } else {
        list = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      }
      const matched = (list || []).find(
        (c) => c && (String(c.id) === String(taCharacter.id) || (taCharacter.name && c.name === taCharacter.name))
      );
      if (matched) {
        full = {
          ...matched,
          ...taCharacter,
          profile: { ...(matched.profile || {}), ...(taCharacter.profile || {}) }
        };
      }
    } catch (e) {}

    const p = full.profile || {};
    return {
      id: full.id || taCharacter.id || "",
      name: full.name || p.name || "名士",
      mbti: p.mbti || full.mbti || "未设定",
      constellation: p.constellation || p.zodiac || full.constellation || full.zodiac || "未设定",
      speakingStyle: p.speakingStyle || p.style || full.speakingStyle || full.style || "贴合原作角色口吻与神韵",
      personality: p.personality || full.personality || "性格鲜明立体",
      background: p.background || p.bio || p.description || full.background || full.description || "身处乱世、与你羁绊深厚"
    };
  }

  function resolveStrictMsgTimestamp(msg) {
    if (!msg) return null;
    if (typeof msg.timestamp === "number" && msg.timestamp > 1500000000000) return msg.timestamp;
    if (typeof msg.timestamp === "string" && /^\d{13}$/.test(msg.timestamp)) return Number(msg.timestamp);
    if (typeof msg.createdAt === "number" && msg.createdAt > 1500000000000) return msg.createdAt;
    const numId = Number(msg.id);
    if (!isNaN(numId) && numId > 1500000000000 && numId < 3000000000000) return numId;
    if (msg.date && !isNaN(Date.parse(msg.date))) return Date.parse(msg.date);
    return null;
  }

  function cleanChatText(msg) {
    if (!msg) return "";
    if (msg.type === "system" || msg.tap === true) return "";
    let raw = String(msg.text || msg.content || "").trim();
    if (!raw) {
      if (msg.type === "sticker" || msg.type === "emoji") return "[表情包]";
      if (msg.type === "image" || msg.image) return "[图片]";
      return "";
    }
    raw = raw.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, "[图片]");
    raw = raw.replace(/\s+/g, " ").trim();
    if (!raw) return "";
    if (raw.length > 120) raw = raw.slice(0, 118) + "…";
    return raw;
  }

  // 严格提取「当天（本地 YYYY-MM-DD 00:00~23:59）」近 30 条有效传讯记录
  async function fetchSameDayChatContext(charId, charName, userName, targetDateStr, limit = 30) {
    const parts = String(targetDateStr || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return { hasChatToday: false, count: 0, text: "" };
    }
    const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
    const dayEnd = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();

    let rawList = [];
    try {
      if (charId && global.chatHistoryStore && typeof global.chatHistoryStore.getAllMessages === "function") {
        const res = await global.chatHistoryStore.getAllMessages(charId);
        if (Array.isArray(res) && res.length > 0) rawList = res;
      }
    } catch (e) {}
    if (rawList.length === 0 && charId) {
      try {
        const ls = JSON.parse(localStorage.getItem("t8_chat_history_" + charId) || "[]");
        if (Array.isArray(ls)) rawList = ls;
      } catch (e) {}
    }

    const sameDay = rawList
      .map((m) => ({ msg: m, t: resolveStrictMsgTimestamp(m) }))
      .filter((item) => item.t !== null && item.t >= dayStart && item.t <= dayEnd)
      .sort((a, b) => a.t - b.t)
      .map((item) => {
        const m = item.msg;
        const text = cleanChatText(m);
        if (!text) return null;
        const sender = String(m.sender || m.role || "").toLowerCase();
        const isUser = sender === "user" || sender === "me" || sender === "self" || m.isUser === true;
        return { speaker: isUser ? userName : charName, text };
      })
      .filter(Boolean);

    if (sameDay.length === 0) {
      return { hasChatToday: false, count: 0, text: "" };
    }

    const recent = sameDay.slice(-limit);
    const selected = [];
    let totalLen = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      const line = `[${recent[i].speaker}]：${recent[i].text}`;
      if (totalLen + line.length > 2200 && selected.length > 0) break;
      selected.unshift(line);
      totalLen += line.length + 1;
    }

    return {
      hasChatToday: selected.length > 0,
      count: selected.length,
      text: selected.join("\n")
    };
  }

  function callLLMAsync(messages) {
    return new Promise((resolve, reject) => {
      if (typeof global.sendToLLM !== "function") {
        reject(new Error("未配置 API，请先前往「设置 → API 配置中心」配置"));
        return;
      }
      global.sendToLLM(
        messages,
        { disableMCP: true },
        (reply) => resolve(reply),
        (err) => reject(new Error(typeof err === "string" ? err : err?.message || "AI 请求失败"))
      );
    });
  }

  function parseMoodJson(rawText) {
    const cleaned = String(rawText || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const tryParse = (str) => {
      try {
        const obj = JSON.parse(str);
        if (obj && typeof obj === "object" && (obj.content || obj.text)) return obj;
      } catch (e) {}
      return null;
    };
    let parsed = tryParse(cleaned);
    if (!parsed) {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) parsed = tryParse(m[0]) || tryParse(m[0].replace(/\r?\n/g, "\\n"));
    }
    if (parsed) {
      const sticker = getStickerById(parsed.moodId) || getStickerById(parsed.moodLabel) || MOOD_STICKERS[3];
      return {
        moodId: sticker.id,
        moodLabel: sticker.label,
        shortTag: String(parsed.shortTag || "").trim().slice(0, 14),
        text: String(parsed.content || parsed.text || "").replace(/\\n/g, "\n").trim(),
        whisperToUser: String(parsed.whisperToUser || "").trim().slice(0, 50)
      };
    }
    return {
      moodId: "calm",
      moodLabel: "平静",
      shortTag: "今日一记",
      text: cleaned || "今天也没什么特别的事，随手记上一笔罢了。",
      whisperToUser: ""
    };
  }

  async function generateCharMoodDiary({ taCharacter, mePersona, dateStr, userEntry }) {
    const charInfo = await resolveFullCharacter(taCharacter);
    const userInfo = getActiveUserPersona(mePersona);
    let worldContext = "未开启特定世界书，可按既有背景自然展开。";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldContext = wb;
      }
    } catch (e) {}

    const chatSnap = await fetchSameDayChatContext(charInfo?.id, charInfo?.name || "角色", userInfo.name, dateStr, 30);

    const chatSection = chatSnap.hasChatToday
      ? `【维度四·传讯中 ${dateStr} 当天近 ${chatSnap.count} 条聊天记录】
${chatSnap.text}
（提示：可以自然化用今天聊完后的真实情绪余波——开心、别扭、暗爽、在意、吐槽或小委屈，但切忌像会议纪要一样机械复述聊天内容。）`
      : `【维度四·传讯记录（${dateStr} 当天无聊天）】
【绝对禁令】你在 ${dateStr} 这一天与【${userInfo.name}】在传讯中没有任何聊天记录！严禁提及、暗示或编造“今天在传讯里和你聊了什么”“收到你消息”等内容。
请完全从你自己的日常出发，在符合人设与世界书的前提下，自由发挥你这一天独自经历的某件具体小事（比如琐事卡壳、吃到合胃口的点心、被旁人气到、半夜睡不着、无聊发呆、突发奇想的小动作等），写出你今天最真实的情绪切片。`;

    const userDiaryNote = userEntry && (userEntry.text || userEntry.moodLabel)
      ? `\n【附：${userInfo.name} 刚写完今天的心情并催你写】对方选了「${userEntry.moodLabel || "心情"}」，写了：「${userEntry.text || "（只贴了心情贴纸）"}」。你可以顺嘴吐槽、心疼或嘴硬提一笔，也可以主要写你自己的事，完全按你的性格来。`
      : "";

    const stickerListStr = MOOD_STICKERS.map((s) => `${s.id}(${s.label})`).join(" / ");

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】，正在情侣空间「沧海一刻」写 ${dateStr} 这一天的私人心情日记。

【维度一·角色完整配置】
- 角色姓名与ID：${charInfo.name} (ID: ${charInfo.id})
- MBTI 性格类型：${charInfo.mbti}
- 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}

【维度二·用户身份设定】
- 姓名：${userInfo.name}
- 身份：${userInfo.identity}
- 性格与背景：${userInfo.personality}；${userInfo.background || "与你同行之人"}

【维度三·当前开启的世界书条目】
${worldContext}

${chatSection}${userDiaryNote}

【活人感反模板铁律】
1. 严禁出现“亲爱的日记”“今天又是美好的一天”“希望明天会更好”“无论发生什么我都会陪着你”等 AI 鸡汤套话！
2. 心情日记写的是“今天最能戳到自己的那一刻真实情绪”——可以烦躁、犯懒、小气、嘴硬、莫名其妙发呆、为一件破事耿耿于怀，或因为微不足道的小事美滋滋半天。
3. 篇幅自然（约 45~140 字），口语化且彻底贴合你的语言风格、MBTI 与背景。`;

    const userPrompt = `请从以下 8 个心情贴纸中选出最契合你今天心境的一个：${stickerListStr}
并严格返回纯 JSON 对象（不要 \`\`\`json 包裹）：
{
  "moodId": "上述8个英文id之一，如 happy / calm / angry / sleepy / sweet / excited / troubled / sad",
  "moodLabel": "对应中文标签",
  "shortTag": "2~6字今日关键词，如：公文堆成山 / 偷懒半日",
  "content": "真实活人感心情日记正文（45~140字）",
  "whisperToUser": "写完后随手留给${userInfo.name}看的一句简短碎碎念（10~30字，可留空）"
}`;

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);

    const parsed = parseMoodJson(raw);
    return {
      ...parsed,
      usedSameDayChatCount: chatSnap.count,
      updatedAt: Date.now()
    };
  }

  // ==========================================
  // 习惯记录引擎（P1）：经期周期算法 + 角色专属习惯生成与打卡
  // ==========================================
  const PERIOD_HABIT_ID = "habit_user_period";
  const DEFAULT_PERIOD_HABIT = {
    id: PERIOD_HABIT_ID,
    ownerScope: "user",
    ownerRole: "user",
    charId: "",
    type: "period",
    preset: true,
    name: "经期记录",
    icon: "🌸",
    color: "#D9778A",
    personaReason: "记录经期与体感变化，自动推算周期与下次预计窗口"
  };

  const PERIOD_FLOWS = [
    { id: "light", label: "偏少" },
    { id: "medium", label: "适中" },
    { id: "heavy", label: "偏多" }
  ];

  const PERIOD_SYMPTOMS = ["痛经", "腰酸", "嗜睡", "情绪敏感", "头痛", "嘴馋", "小腹胀", "状态良好"];
  const USER_HABIT_ICONS = ["💧", "🌙", "📖", "🏃", "🍵", "✍️", "🎧", "🌿"];
  const USER_HABIT_COLORS = ["#6B8E78", "#5B7C99", "#C48B5C", "#8E7AA8", "#B86B77", "#5E8C8A"];

  function dateStrToMs(dateStr) {
    const p = String(dateStr || "").split("-").map(Number);
    if (p.length !== 3 || p.some(isNaN)) return 0;
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0).getTime();
  }

  function addDaysToDateStr(dateStr, days) {
    const ms = dateStrToMs(dateStr);
    if (!ms) return "";
    return formatDateStr(new Date(ms + days * 86400000));
  }

  function diffDaysBetween(aStr, bStr) {
    return Math.round((dateStrToMs(bStr) - dateStrToMs(aStr)) / 86400000);
  }

  // 纯本地确定性经期周期合并与预测算法
  function computePeriodStats(logsMap, todayStr) {
    const periodDates = Object.keys(logsMap || {})
      .filter((d) => logsMap[d] && logsMap[d].isPeriod)
      .sort();

    if (periodDates.length === 0) {
      return {
        cycles: [],
        avgCycleDays: 28,
        avgPeriodDays: 5,
        predictedSet: new Set(),
        statusText: "点击日历任意日期记录经期，自动推算周期与下次预测"
      };
    }

    // 连续间隔 <= 2 天合并为同一次经期
    const cycles = [];
    let curStart = periodDates[0];
    let curEnd = periodDates[0];
    for (let i = 1; i < periodDates.length; i++) {
      const gap = diffDaysBetween(curEnd, periodDates[i]);
      if (gap <= 2) {
        curEnd = periodDates[i];
      } else {
        cycles.push({
          start: curStart,
          end: curEnd,
          duration: diffDaysBetween(curStart, curEnd) + 1
        });
        curStart = periodDates[i];
        curEnd = periodDates[i];
      }
    }
    cycles.push({
      start: curStart,
      end: curEnd,
      duration: diffDaysBetween(curStart, curEnd) + 1
    });

    const recentCycles = cycles.slice(-6);
    const durations = recentCycles.map((c) => c.duration).filter((d) => d >= 2 && d <= 10);
    const avgPeriodDays = durations.length
      ? Math.max(3, Math.min(9, Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)))
      : 5;

    const cycleGaps = [];
    for (let i = 1; i < recentCycles.length; i++) {
      const g = diffDaysBetween(recentCycles[i - 1].start, recentCycles[i].start);
      if (g >= 21 && g <= 45) cycleGaps.push(g);
    }
    const avgCycleDays = cycleGaps.length
      ? Math.round(cycleGaps.reduce((a, b) => a + b, 0) / cycleGaps.length)
      : 28;

    const lastCycle = cycles[cycles.length - 1];
    const nextStart = addDaysToDateStr(lastCycle.start, avgCycleDays);
    const predictedSet = new Set();
    for (let i = 0; i < avgPeriodDays; i++) {
      const d = addDaysToDateStr(nextStart, i);
      if (d && !logsMap[d]?.isPeriod) predictedSet.add(d);
    }

    let statusText = `平均周期 ${avgCycleDays} 天 · 平均经期 ${avgPeriodDays} 天`;
    if (logsMap[todayStr]?.isPeriod) {
      const dayNum = diffDaysBetween(lastCycle.start, todayStr) + 1;
      statusText = `经期第 ${Math.max(1, dayNum)} 天 · 记得保暖休息`;
    } else {
      const daysUntil = diffDaysBetween(todayStr, nextStart);
      if (daysUntil > 0) {
        statusText = `距下次预计还有 ${daysUntil} 天（平均周期 ${avgCycleDays} 天）`;
      } else if (daysUntil >= -avgPeriodDays + 1) {
        statusText = `处于预计经期窗口中（平均周期 ${avgCycleDays} 天）`;
      } else {
        statusText = `预计经期已过 ${Math.abs(daysUntil)} 天 · 平均周期 ${avgCycleDays} 天`;
      }
    }

    return { cycles, avgCycleDays, avgPeriodDays, predictedSet, statusText };
  }

  function parseJsonSafe(rawText) {
    const cleaned = String(rawText || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {}
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch (e) {}
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch (e) {}
      try {
        return JSON.parse(objMatch[0].replace(/\r?\n/g, "\\n"));
      } catch (e) {}
    }
    return null;
  }

  async function generateCharHabits({ taCharacter }) {
    const charInfo = await resolveFullCharacter(taCharacter);
    let worldContext = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldContext = wb;
      }
    } catch (e) {}

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】。
- MBTI：${charInfo.mbti} | 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}
${worldContext ? `- 世界书背景：${worldContext}` : ""}`;

    const userPrompt = `请根据你自己的性格、爱好、职业/身份和恶趣味，生成 3~4 个你平时会坚持（或嘴上说要坚持）的**专属日常习惯**！
【核心要求】
- 严禁千篇一律的“早睡/喝水/跑步/背单词”！必须极具你的个人特色与反差活人感（例如：爱喝茶的→「品茗试新茶」、爱打劫的→「劫道摸金」、爱算账的→「核对暗账」、爱偷懒的→「寻僻静处打盹」、爱练剑的→「晨起拭剑」等）。
- 严格返回纯 JSON 数组（不要 \`\`\`json 包裹），格式如下：
[
  {
    "name": "3~7字习惯名称",
    "icon": "1个贴合的Emoji图标",
    "color": "柔和莫兰迪十六进制色值，如 #6B8E78 / #B86B77 / #5B7C99 / #C48B5C",
    "personaReason": "用你本人的口吻说一句为什么会有这个习惯（12~30字）"
  }
]`;

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);
    const parsed = parseJsonSafe(raw);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.habits) ? parsed.habits : [];
    const fallbackColors = ["#6B8E78", "#5B7C99", "#C48B5C", "#8E7AA8"];
    const baseTs = Date.now();
    const list = (arr.length > 0
      ? arr.slice(0, 4)
      : [
          { name: "独处小憩", icon: "🍵", color: "#6B8E78", personaReason: "总得给自己留半盏茶的清静工夫。" },
          { name: "整理旧物", icon: "📜", color: "#5B7C99", personaReason: "免得哪天忘了要紧事。" },
          { name: "夜观天色", icon: "🌙", color: "#8E7AA8", personaReason: "睡前看一眼外头，心里踏实些。" }
        ]
    ).map((item, idx) => ({
      id: `habit_char_${charInfo.id || "x"}_${baseTs}_${idx}`,
      ownerScope: `char_${charInfo.id || ""}`,
      ownerRole: "char",
      charId: String(charInfo.id || ""),
      type: "custom",
      name: String(item.name || "日常小事").trim().slice(0, 10),
      icon: String(item.icon || "✨").trim().slice(0, 4),
      color: /^#[0-9a-fA-F]{6}$/.test(String(item.color || "")) ? item.color : fallbackColors[idx % fallbackColors.length],
      personaReason: String(item.personaReason || "").trim().slice(0, 48),
      createdAt: baseTs + idx
    }));
    return list;
  }

  async function generateCharHabitLog({ taCharacter, habit, dateStr }) {
    const charInfo = await resolveFullCharacter(taCharacter);
    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】。
- MBTI：${charInfo.mbti} | 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}`;

    const userPrompt = `今天是 ${dateStr}，关于你的专属习惯【${habit.name}】（你的自白：「${habit.personaReason || ""}」），请你真实交代这一天的打卡情况！
不一定要每天都乖乖完成——可以顺利完成（done），也可以偷懒摸鱼（slacked），还可以中途意外翻车或遇到啼笑皆非的插曲（chaos）。保持极强活人感，禁止AI模板套话。
请严格返回纯 JSON 对象（不要 \`\`\`json 包裹）：
{
  "status": "done 或 slacked 或 chaos",
  "statusLabel": "2~4字状态，如：顺利完成 / 偷懒摸鱼 / 半途翻车",
  "note": "20~70字贴合角色口吻的当日打卡小记"
}`;

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);
    const parsed = parseJsonSafe(raw);
    const validStatus = ["done", "slacked", "chaos"].includes(parsed?.status) ? parsed.status : "done";
    return {
      id: `${habit.id}_${dateStr}`,
      habitId: habit.id,
      date: dateStr,
      status: validStatus,
      statusLabel:
        String(parsed?.statusLabel || "").trim().slice(0, 8) ||
        (validStatus === "done" ? "已完成" : validStatus === "slacked" ? "摸鱼了" : "意外翻车"),
      note: String(parsed?.note || raw || "今日随手记下一笔。").trim().slice(0, 120),
      updatedAt: Date.now()
    };
  }

  // 一键生成角色当前月份（截至今日）5~7 天的真实打卡足迹，立刻点亮习惯日历
  async function generateCharHabitMonthLogs({ taCharacter, habit, year, monthIndex, todayStr }) {
    const charInfo = await resolveFullCharacter(taCharacter);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const mStr = String(monthIndex + 1).padStart(2, "0");
    const validDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${mStr}-${String(d).padStart(2, "0")}`;
      if (ds <= todayStr) validDays.push(ds);
    }
    if (validDays.length === 0) return [];

    // 从本月至今随机挑选 5~7 天（不超过可用天数）
    const targetCount = Math.min(validDays.length, Math.max(3, Math.min(7, Math.ceil(validDays.length * 0.4))));
    const shuffled = [...validDays].sort(() => Math.random() - 0.5);
    const pickedDates = shuffled.slice(0, targetCount).sort();

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】。
- MBTI：${charInfo.mbti} | 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}`;

    const userPrompt = `请为你的专属习惯【${habit.name}】（自白：「${habit.personaReason || ""}」）补充以下 ${pickedDates.length} 天的真实打卡足迹：${pickedDates.join("、")}。
要求：
1. 必须包含真实起伏：大部分顺利完成（done），穿插 1~2 天偷懒摸鱼（slacked）或意外翻车（chaos），极富活人感，严禁重复套话。
2. 严格返回纯 JSON 数组（不要 \`\`\`json 包裹）：
[
  {
    "date": "YYYY-MM-DD",
    "status": "done 或 slacked 或 chaos",
    "statusLabel": "2~4字状态",
    "note": "18~55字角色口吻短记"
  }
]`;

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);
    const parsed = parseJsonSafe(raw);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.logs) ? parsed.logs : [];
    const results = [];
    pickedDates.forEach((ds, idx) => {
      const item = arr.find((x) => x && x.date === ds) || arr[idx] || {};
      const validStatus = ["done", "slacked", "chaos"].includes(item.status) ? item.status : idx % 4 === 2 ? "slacked" : "done";
      results.push({
        id: `${habit.id}_${ds}`,
        habitId: habit.id,
        date: ds,
        status: validStatus,
        statusLabel:
          String(item.statusLabel || "").trim().slice(0, 8) ||
          (validStatus === "done" ? "已完成" : validStatus === "slacked" ? "摸鱼了" : "意外翻车"),
        note: String(item.note || "今日照常记下一笔。").trim().slice(0, 120),
        updatedAt: Date.now() + idx
      });
    });
    return results;
  }

  // ==========================================
  // 跨角色一键复刻纯逻辑引擎（Phase 0：候选扫描/智能去重/防串名/白名单合并/习惯摘要）
  // ==========================================
  function findCrossCharMoodCandidates(allMoods, currentCharId, targetDateStr, charNameMap = {}) {
    if (!Array.isArray(allMoods) || !targetDateStr) return [];
    const curId = String(currentCharId || "");
    const rawMatches = allMoods.filter((rec) => {
      if (!rec || rec.date !== targetDateStr) return false;
      if (curId && String(rec.charId || "") === curId) return false;
      const u = rec.userEntry || rec.user;
      if (!u || typeof u !== "object") return false;
      return Boolean(u.moodId || (u.text && String(u.text).trim()));
    });

    // 同贴纸 + 同正文智能去重合并，保留最新 updatedAt
    const dedupMap = new Map();
    for (const rec of rawMatches) {
      const u = rec.userEntry || rec.user;
      const cid = String(rec.charId || "");
      const cname = (charNameMap && charNameMap[cid]) || "其他空间";
      const sticker = getStickerById(u.moodId || u.moodLabel);
      const moodId = sticker ? sticker.id : String(u.moodId || "");
      const moodLabel = sticker ? sticker.label : String(u.moodLabel || "");
      const normText = String(u.text || "").trim();
      const key = `${moodId}::${normText}`;
      const ts = Number(u.updatedAt || rec.updatedAt || 0);

      if (!dedupMap.has(key)) {
        dedupMap.set(key, {
          key,
          moodId,
          moodLabel,
          text: normText,
          updatedAt: ts,
          primaryCharId: cid,
          primaryCharName: cname,
          sourceCharIds: cid ? [cid] : [],
          sourceCharNames: [cname]
        });
      } else {
        const existing = dedupMap.get(key);
        if (cid && !existing.sourceCharIds.includes(cid)) existing.sourceCharIds.push(cid);
        if (!existing.sourceCharNames.includes(cname)) existing.sourceCharNames.push(cname);
        if (ts > existing.updatedAt) {
          existing.updatedAt = ts;
          existing.primaryCharId = cid;
          existing.primaryCharName = cname;
        }
      }
    }

    return Array.from(dedupMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  function detectSourceCharMention(text, sourceCharNames = []) {
    const body = String(text || "").trim();
    if (!body || !Array.isArray(sourceCharNames) || sourceCharNames.length === 0) return [];
    const ignoreNames = new Set(["其他空间", "名士", "角色", "TA", "我"]);
    const hits = [];
    for (const rawName of sourceCharNames) {
      const name = String(rawName || "").trim();
      if (!name || name.length < 2 || ignoreNames.has(name)) continue;
      if (body.includes(name) && !hits.includes(name)) {
        hits.push(name);
      }
    }
    return hits;
  }

  function buildClonedMoodRecord(existingRec, currentCharId, dateStr, sourceUser, sourceMeta = {}) {
    const cid = String(currentCharId || "");
    const sticker = getStickerById(sourceUser?.moodId || sourceUser?.moodLabel);
    const now = Number(sourceMeta.now) || Date.now();
    const base = existingRec && typeof existingRec === "object" ? { ...existingRec } : {};
    const clonedEntry = {
      moodId: sticker ? sticker.id : String(sourceUser?.moodId || "calm"),
      moodLabel: sticker ? sticker.label : String(sourceUser?.moodLabel || "平静"),
      text: String(sourceUser?.text || "").trim(),
      clonedFromCharId: String(sourceMeta.primaryCharId || ""),
      clonedFromCharName: String(sourceMeta.primaryCharName || (Array.isArray(sourceMeta.sourceCharNames) ? sourceMeta.sourceCharNames.join("、") : "")),
      clonedAt: now,
      updatedAt: now
    };
    return {
      ...base,
      id: `${cid}_${dateStr}`,
      charId: cid,
      date: dateStr,
      // 严格白名单拷贝 userEntry 槽，100% 保留原有 charEntry 槽不受污染
      userEntry: clonedEntry,
      updatedAt: now
    };
  }

  function buildDailyHabitSummary(userHabitDefs = [], logsByHabitId = {}, dateStr = "") {
    if (!Array.isArray(userHabitDefs) || !dateStr) {
      return { hasAny: false, periodText: "", completedHabits: [], summaryText: "" };
    }
    let periodText = "";
    const completedHabits = [];
    const flowLabelMap = { light: "偏少", medium: "适中", heavy: "偏多" };

    for (const def of userHabitDefs) {
      if (!def || !def.id) continue;
      const list = logsByHabitId[def.id];
      const log = Array.isArray(list)
        ? list.find((l) => l && l.date === dateStr)
        : list && list[dateStr]
        ? list[dateStr]
        : null;
      if (!log) continue;

      if (def.type === "period" || def.id === PERIOD_HABIT_ID) {
        if (log.isPeriod) {
          const parts = [];
          if (log.flow && flowLabelMap[log.flow]) parts.push(`流量${flowLabelMap[log.flow]}`);
          if (Array.isArray(log.symptoms) && log.symptoms.length > 0) parts.push(log.symptoms.join("、"));
          if (log.note && String(log.note).trim()) parts.push(String(log.note).trim());
          periodText = parts.length > 0 ? `经期中（${parts.join("，")}）` : "经期中";
        }
      } else if (log.done || log.status === "done" || log.checked) {
        const note = log.note && String(log.note).trim() ? `（${String(log.note).trim()}）` : "";
        completedHabits.push(`${def.name || "习惯"}${note}`);
      }
    }

    const segments = [];
    if (periodText) segments.push(periodText);
    if (completedHabits.length > 0) segments.push(`已完成习惯打卡：${completedHabits.join("、")}`);
    const summaryText = segments.join("；");
    return {
      hasAny: segments.length > 0,
      periodText,
      completedHabits,
      summaryText
    };
  }

  // 独立圆圈贴纸槽（仿参考图：日期下两个纵向圆圈）
  function renderStickerCircle(entry, size = 34) {
    const h = React.createElement;
    const sticker = entry ? getStickerById(entry.moodId || entry.moodLabel) : null;
    if (sticker) {
      return h("img", {
        src: sticker.img,
        alt: sticker.label,
        title: sticker.label,
        style: {
          width: `${size}px`,
          height: `${size}px`,
          objectFit: "contain",
          display: "block",
          borderRadius: "50%",
          userSelect: "none"
        }
      });
    }
    return h("div", {
      style: {
        width: `${size - 4}px`,
        height: `${size - 4}px`,
        borderRadius: "50%",
        border: "1px solid #EAEAEA",
        background: "rgba(255,255,255,0.65)",
        boxSizing: "border-box"
      }
    });
  }

  // 注入一次摇罐子与横幅滑入动画样式
  function ensureMomentAnimations() {
    if (typeof document === "undefined") return;
    if (document.getElementById("moment-calendar-anim-style")) return;
    const style = document.createElement("style");
    style.id = "moment-calendar-anim-style";
    style.textContent = `
      @keyframes momentJarShake {
        0% { transform: rotate(0deg) translateX(0); }
        18% { transform: rotate(-7deg) translateX(-4px); }
        36% { transform: rotate(7deg) translateX(4px); }
        54% { transform: rotate(-5deg) translateX(-3px); }
        72% { transform: rotate(4deg) translateX(2px); }
        100% { transform: rotate(0deg) translateX(0); }
      }
      @keyframes momentBannerDrop {
        from { opacity: 0; transform: translateY(-18px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  // 经期不舒服一键告诉 TA 触发角色关怀
  async function generatePeriodComfort({ taCharacter, mePersona, dateStr, flow, symptoms, note }) {
    const charInfo = await resolveFullCharacter(taCharacter);
    const userInfo = getActiveUserPersona(mePersona);
    const flowLabel = PERIOD_FLOWS.find((f) => f.id === flow)?.label || "适中";
    const symStr = Array.isArray(symptoms) && symptoms.length > 0 ? symptoms.join("、") : "略感不适";

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】。
- MBTI：${charInfo.mbti} | 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}
请完全以角色本人的口吻说话，禁止AI模板化鸡汤，保持真实活人感（可以温柔哄人、也可以嘴硬心软或手忙脚乱照料）。`;

    const userPrompt = `今天是 ${dateStr}，【${userInfo.name}】在经期记录里记了今日来例假（流量：${flowLabel}；体感：${symStr}${note ? `；备注：${note}` : ""}），并点了一下「告诉你今天不舒服」。
请用 2~4 句话（约 50~110 字）以你的性格与口吻叮嘱、安抚或逗对方开心。不要加引号或旁白前缀。`;

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);
    return String(raw || "").replace(/^["“「]+|["”」]+$/g, "").trim();
  }

  // 贴纸图片缓存（用于 Canvas 2D 物理罐子渲染）
  const _stickerImgCache = {};
  function getLoadedStickerImg(src) {
    if (!src) return null;
    if (_stickerImgCache[src]) return _stickerImgCache[src];
    const img = new Image();
    img.src = src;
    _stickerImgCache[src] = img;
    return img;
  }

  // 2D 物理碰撞心情罐组件（坠落 + 碰撞堆叠 + 点击摇一摇）
  const MoodJarPhysics = ({ title, subtitle, moodIds, shakeSignal, onJarClick }) => {
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;
    const canvasRef = useRef(null);
    const ballsRef = useRef([]);
    const [shaking, setShaking] = useState(false);

    const W = 166;
    const H = 228;
    // 罐子内壁碰撞边界（精确匹配 emoji-time/透明罐子.png 内腔）
    const LEFT = 24;
    const RIGHT = W - 24;
    const FLOOR = H - 28;
    const CEIL = 34;

    useEffect(() => {
      ensureMomentAnimations();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const list = Array.isArray(moodIds) ? moodIds.slice(0, 31) : [];
      const radius = list.length <= 6 ? 23 : list.length <= 14 ? 18 : 14;

      // 预加载全部贴纸图片
      MOOD_STICKERS.forEach((s) => getLoadedStickerImg(s.img));

      // 初始化待坠落球体队列（逐颗从罐口掉入）
      ballsRef.current = list.map((mid, idx) => {
        const st = getStickerById(mid) || MOOD_STICKERS[3];
        return {
          x: W / 2 + (Math.random() - 0.5) * 44,
          y: 26,
          vx: (Math.random() - 0.5) * 2.2,
          vy: 1.0 + Math.random() * 0.8,
          r: radius,
          angle: (Math.random() - 0.5) * 0.5,
          vAngle: (Math.random() - 0.5) * 0.07,
          spawnFrame: idx * 7,
          active: false,
          sticker: st
        };
      });

      let frame = 0;
      let rafId = 0;

      const step = () => {
        frame++;
        const balls = ballsRef.current;

        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (!b.active) {
            if (frame >= b.spawnFrame) {
              b.active = true;
              b.y = 20;
            } else {
              continue;
            }
          }
          // 重力与空气微阻尼
          b.vy += 0.38;
          b.vx *= 0.992;
          b.vy *= 0.994;
          b.x += b.vx;
          b.y += b.vy;
          b.angle += b.vAngle;
          b.vAngle *= 0.97;

          // 左右罐壁碰撞
          if (b.x - b.r < LEFT) {
            b.x = LEFT + b.r;
            b.vx = Math.abs(b.vx) * 0.48;
            b.vAngle = b.vy * 0.015;
          } else if (b.x + b.r > RIGHT) {
            b.x = RIGHT - b.r;
            b.vx = -Math.abs(b.vx) * 0.48;
            b.vAngle = -b.vy * 0.015;
          }
          // 罐底碰撞
          if (b.y + b.r > FLOOR) {
            b.y = FLOOR - b.r;
            if (Math.abs(b.vy) > 1.2) {
              b.vy = -b.vy * 0.38;
            } else {
              b.vy = 0;
            }
            b.vx *= 0.84;
            b.vAngle *= 0.8;
          }
          // 罐顶防飞出（摇晃时）
          if (b.y - b.r < CEIL && b.vy < 0) {
            b.y = CEIL + b.r;
            b.vy = Math.abs(b.vy) * 0.35;
          }
        }

        // 圆-圆弹性碰撞与位置分离（4 次迭代保证自然堆叠不穿模）
        for (let iter = 0; iter < 4; iter++) {
          for (let i = 0; i < balls.length; i++) {
            const a = balls[i];
            if (!a.active) continue;
            for (let j = i + 1; j < balls.length; j++) {
              const b = balls[j];
              if (!b.active) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const distSq = dx * dx + dy * dy;
              const minDist = a.r + b.r - 0.5;
              if (distSq < minDist * minDist && distSq > 0.0001) {
                const dist = Math.sqrt(distSq);
                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = (minDist - dist) * 0.52;
                a.x -= nx * overlap;
                a.y -= ny * overlap;
                b.x += nx * overlap;
                b.y += ny * overlap;

                if (iter === 0) {
                  const rvx = b.vx - a.vx;
                  const rvy = b.vy - a.vy;
                  const vn = rvx * nx + rvy * ny;
                  if (vn < 0) {
                    const impulse = -0.62 * vn;
                    a.vx -= impulse * nx;
                    a.vy -= impulse * ny;
                    b.vx += impulse * nx;
                    b.vy += impulse * ny;
                    a.vAngle += (Math.random() - 0.5) * 0.04;
                    b.vAngle += (Math.random() - 0.5) * 0.04;
                  }
                }
              }
            }
          }
        }

        // 绘制所有活跃心情贴纸
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (!b.active) continue;
          const img = getLoadedStickerImg(b.sticker.img);
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.angle);
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, -b.r * 1.12, -b.r * 1.12, b.r * 2.24, b.r * 2.24);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, b.r, 0, Math.PI * 2);
            ctx.fillStyle = b.sticker.tint || "#FDE68A";
            ctx.fill();
          }
          ctx.restore();
        }

        rafId = requestAnimationFrame(step);
      };

      rafId = requestAnimationFrame(step);
      return () => cancelAnimationFrame(rafId);
    }, [JSON.stringify(moodIds)]);

    // 响应摇一摇冲量
    useEffect(() => {
      if (!shakeSignal) return;
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 520);
      ballsRef.current.forEach((b) => {
        if (!b.active) return;
        b.vy = -(5.5 + Math.random() * 5.5);
        b.vx = (Math.random() - 0.5) * 9;
        b.vAngle = (Math.random() - 0.5) * 0.35;
      });
      return () => clearTimeout(timer);
    }, [shakeSignal]);

    return h(
      "div",
      {
        onClick: onJarClick,
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none"
        }
      },
      h(
        "div",
        {
          style: {
            position: "relative",
            width: `${W}px`,
            height: `${H}px`,
            animation: shaking ? "momentJarShake 0.48s ease-in-out" : "none"
          }
        },
        h("img", {
          src: "emoji-time/透明罐子.png",
          alt: "心情罐",
          style: {
            position: "absolute",
            inset: 0,
            width: `${W}px`,
            height: `${H}px`,
            objectFit: "contain",
            zIndex: 1,
            pointerEvents: "none"
          }
        }),
        h("canvas", {
          ref: canvasRef,
          style: {
            position: "absolute",
            inset: 0,
            width: `${W}px`,
            height: `${H}px`,
            zIndex: 2,
            pointerEvents: "none"
          }
        }),
        // 顶部柔和玻璃反光层（不遮挡内部贴纸，增强装在罐子里的立体感）
        h("div", {
          style: {
            position: "absolute",
            top: "44px",
            left: "26px",
            width: "14px",
            height: "78px",
            borderRadius: "999px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.08) 100%)",
            zIndex: 3,
            pointerEvents: "none"
          }
        })
      ),
      h("div", { style: { fontSize: "13px", fontWeight: 700, color: "#292524", marginTop: "4px" } }, title),
      h("div", { style: { fontSize: "11px", color: "#9C968D" } }, subtitle)
    );
  };

  // 小轮盘 SVG 心情分布统计组件
  const MoodWheelChart = ({ counts, total, centerLabel }) => {
    const h = React.createElement;
    const size = 128;
    const r = 46;
    const cx = size / 2;
    const cy = size / 2;
    const circ = 2 * Math.PI * r;
    const palette = {
      excited: "#F7C948",
      sweet: "#F29CB0",
      happy: "#F4A261",
      calm: "#8CC084",
      sleepy: "#A8A9D6",
      troubled: "#9EB3C8",
      sad: "#7FA9D6",
      angry: "#E57373"
    };

    const entries = MOOD_STICKERS.map((s) => ({
      sticker: s,
      count: counts[s.id] || 0,
      color: palette[s.id] || "#D6D3D1"
    }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count);

    let offset = 0;

    return h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "14px" } },
      h(
        "svg",
        { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { flexShrink: 0 } },
        h("circle", { cx, cy, r, fill: "none", stroke: "#F3F0EA", strokeWidth: 16 }),
        total > 0 &&
          entries.map((e) => {
            const seg = (e.count / total) * circ;
            const el = h("circle", {
              key: e.sticker.id,
              cx,
              cy,
              r,
              fill: "none",
              stroke: e.color,
              strokeWidth: 16,
              strokeDasharray: `${Math.max(0, seg - 1.5)} ${circ}`,
              strokeDashoffset: -offset,
              transform: `rotate(-90 ${cx} ${cy})`
            });
            offset += seg;
            return el;
          }),
        h(
          "text",
          { x: cx, y: cy - 3, textAnchor: "middle", fontSize: "18", fontWeight: "700", fill: "#292524" },
          String(total)
        ),
        h(
          "text",
          { x: cx, y: cy + 13, textAnchor: "middle", fontSize: "10", fill: "#8C857B" },
          centerLabel || "条记录"
        )
      ),
      h(
        "div",
        { style: { flex: 1, display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 } },
        entries.length === 0
          ? h("div", { style: { fontSize: "12px", color: "#A8A29E" } }, "本月暂无心情记录")
          : entries.slice(0, 5).map((e) => {
              const pct = Math.round((e.count / total) * 100);
              return h(
                "div",
                {
                  key: e.sticker.id,
                  style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "6px" } },
                  h("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: e.color } }),
                  h("img", { src: e.sticker.img, alt: e.sticker.label, style: { width: "18px", height: "18px", objectFit: "contain" } }),
                  h("span", { style: { color: "#44403C", fontWeight: 500 } }, e.sticker.label)
                ),
                h("span", { style: { color: "#78716C", fontSize: "11.5px" } }, `${e.count}次 · ${pct}%`)
              );
            })
      )
    );
  };

  const MomentCalendarModal = ({ isOpen, onClose, taCharacter, mePersona }) => {
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef } = React;
    const statsExportRef = useRef(null);
    const dayExportRef = useRef(null);

    const todayStr = getTodayStr();
    const nowDate = new Date();

    // 双独立日历模式：mood（心情日记） | habit（习惯记录，P1 落地）
    const [activeTab, setActiveTab] = useState("mood");

    // 心情日历独立状态
    const [moodYear, setMoodYear] = useState(nowDate.getFullYear());
    const [moodMonth, setMoodMonth] = useState(nowDate.getMonth()); // 0-11
    const [moodMap, setMoodMap] = useState({}); // { "YYYY-MM-DD": record }
    const [selectedDate, setSelectedDate] = useState(null); // 打开的日期详情抽屉

    // 当日编辑态（心情）
    const [draftMoodId, setDraftMoodId] = useState("happy");
    const [draftText, setDraftText] = useState("");
    const [saveNotice, setSaveNotice] = useState(false);
    const [isNudging, setIsNudging] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // ==========================================
    // 习惯记录独立日历状态（与心情日记完全隔离）
    // ==========================================
    const [habitOwnerTab, setHabitOwnerTab] = useState("user"); // "user" (我的习惯) | "char" (TA的习惯)
    const [habitYear, setHabitYear] = useState(nowDate.getFullYear());
    const [habitMonth, setHabitMonth] = useState(nowDate.getMonth());
    const [habitDefs, setHabitDefs] = useState([]);
    const [selectedHabitId, setSelectedHabitId] = useState(PERIOD_HABIT_ID);
    const [habitLogsMap, setHabitLogsMap] = useState({}); // { "YYYY-MM-DD": log }
    const [habitSelectedDate, setHabitSelectedDate] = useState(null);

    // 经期/习惯单日编辑态
    const [periodDraftOn, setPeriodDraftOn] = useState(true);
    const [periodDraftFlow, setPeriodDraftFlow] = useState("medium");
    const [periodDraftSymptoms, setPeriodDraftSymptoms] = useState([]);
    const [habitDraftNote, setHabitDraftNote] = useState("");
    const [habitSaveNotice, setHabitSaveNotice] = useState(false);

    // 新增用户自定义习惯表单
    const [showAddHabitForm, setShowAddHabitForm] = useState(false);
    const [newHabitName, setNewHabitName] = useState("");
    const [newHabitIcon, setNewHabitIcon] = useState(USER_HABIT_ICONS[0]);
    const [newHabitColor, setNewHabitColor] = useState(USER_HABIT_COLORS[0]);

    // 角色习惯 AI 状态
    const [isGeneratingHabits, setIsGeneratingHabits] = useState(false);
    const [isLoggingCharHabit, setIsLoggingCharHabit] = useState(false);

    // P2 状态：月度心情罐子统计 + 摇一摇小轮盘 + 经期关怀 + 导出 + 今日未记横幅
    const [showStatsView, setShowStatsView] = useState(false);
    const [showWheelPanel, setShowWheelPanel] = useState(false);
    const [wheelScope, setWheelScope] = useState("both"); // "both" | "user" | "char"
    const [jarShakeSignal, setJarShakeSignal] = useState(0);
    const [isAskingComfort, setIsAskingComfort] = useState(false);
    const [copyDayNotice, setCopyDayNotice] = useState(false);
    const [isExportingImg, setIsExportingImg] = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [hasTodayHabitLogged, setHasTodayHabitLogged] = useState(true);
    // 跨角色一键复刻状态
    const [allMoodsCache, setAllMoodsCache] = useState([]);
    const [charNameMap, setCharNameMap] = useState({});
    const [userHabitDefsCache, setUserHabitDefsCache] = useState([]);
    const [userHabitLogsCache, setUserHabitLogsCache] = useState({});
    const [showClonePicker, setShowClonePicker] = useState(false);
    const [cloneMentionWarning, setCloneMentionWarning] = useState([]);
    const [syncToast, setSyncToast] = useState("");

    const flashSyncToast = (msg) => {
      setSyncToast(msg);
      setTimeout(() => setSyncToast(""), 1800);
    };

    const loadCrossCharCache = async () => {
      try {
        if (global.momentCalendarStore && typeof global.momentCalendarStore.getMoodsByChar === "function") {
          const all = await global.momentCalendarStore.getMoodsByChar("");
          setAllMoodsCache(Array.isArray(all) ? all : []);
        }
        let list = [];
        if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
          list = await global.chatCharacterStore.getAll();
        } else {
          list = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
        }
        const cmap = {};
        (list || []).forEach((c) => {
          if (c && c.id) cmap[String(c.id)] = c.name || c.profile?.name || "名士";
        });
        setCharNameMap(cmap);

        if (global.momentCalendarStore) {
          const uDefs = (await global.momentCalendarStore.getHabitDefsByScope("user")) || [];
          setUserHabitDefsCache(uDefs);
          const logsObj = {};
          let loggedToday = false;
          for (const d of uDefs) {
            const logs = (await global.momentCalendarStore.getHabitLogsByHabit(d.id)) || [];
            logsObj[d.id] = logs;
            if (logs.some((l) => l.date === todayStr)) loggedToday = true;
          }
          setUserHabitLogsCache(logsObj);
          setHasTodayHabitLogged(loggedToday);
        }
      } catch (e) {}
    };

    const charId = String(taCharacter?.id || "");
    const charName = taCharacter?.name || taCharacter?.profile?.name || "名士";

    const loadMoods = async () => {
      try {
        if (global.momentCalendarStore && typeof global.momentCalendarStore.getMoodsByChar === "function") {
          const list = await global.momentCalendarStore.getMoodsByChar(charId);
          const map = {};
          (list || []).forEach((rec) => {
            if (rec && rec.date) map[rec.date] = rec;
          });
          setMoodMap(map);
        }
      } catch (e) {
        setMoodMap({});
      }
    };

    const loadHabitDefs = async (ownerTabOverride) => {
      const targetOwner = ownerTabOverride || habitOwnerTab;
      const scope = targetOwner === "user" ? "user" : `char_${charId}`;
      try {
        let defs = [];
        if (global.momentCalendarStore && typeof global.momentCalendarStore.getHabitDefsByScope === "function") {
          defs = await global.momentCalendarStore.getHabitDefsByScope(scope);
        }
        if (targetOwner === "user") {
          const hasPeriod = defs.some((d) => d.id === PERIOD_HABIT_ID);
          if (!hasPeriod) {
            const preset = { ...DEFAULT_PERIOD_HABIT, createdAt: Date.now() };
            if (global.momentCalendarStore && typeof global.momentCalendarStore.saveHabitDef === "function") {
              await global.momentCalendarStore.saveHabitDef(preset);
            }
            defs = [preset, ...defs];
          } else {
            // 始终把经期记录置顶在第一位
            const pItem = defs.find((d) => d.id === PERIOD_HABIT_ID);
            defs = [pItem, ...defs.filter((d) => d.id !== PERIOD_HABIT_ID)];
          }
        }
        setHabitDefs(defs);
        if (defs.length > 0) {
          setSelectedHabitId((prev) => (defs.some((d) => d.id === prev) ? prev : defs[0].id));
        } else {
          setSelectedHabitId("");
          setHabitLogsMap({});
        }
      } catch (e) {
        setHabitDefs([]);
      }
    };

    const loadHabitLogs = async (habitId) => {
      if (!habitId) {
        setHabitLogsMap({});
        return;
      }
      try {
        if (global.momentCalendarStore && typeof global.momentCalendarStore.getHabitLogsByHabit === "function") {
          const list = await global.momentCalendarStore.getHabitLogsByHabit(habitId);
          const map = {};
          (list || []).forEach((l) => {
            if (l && l.date) map[l.date] = l;
          });
          setHabitLogsMap(map);
        }
      } catch (e) {
        setHabitLogsMap({});
      }
    };

    useEffect(() => {
      if (!isOpen) return;
      ensureMomentAnimations();
      setSelectedDate(null);
      setHabitSelectedDate(null);
      setShowStatsView(false);
      setShowWheelPanel(false);
      setErrorMsg("");
      loadMoods();
      loadHabitDefs(habitOwnerTab);
      loadCrossCharCache();
    }, [isOpen, charId]);

    useEffect(() => {
      if (!isOpen) return;
      setHabitSelectedDate(null);
      setShowAddHabitForm(false);
      loadHabitDefs(habitOwnerTab);
    }, [habitOwnerTab]);

    useEffect(() => {
      if (!isOpen) return;
      loadHabitLogs(selectedHabitId);
    }, [selectedHabitId, isOpen]);

    const monthCells = useMemo(() => buildMonthCells(moodYear, moodMonth), [moodYear, moodMonth]);
    const habitMonthCells = useMemo(() => buildMonthCells(habitYear, habitMonth), [habitYear, habitMonth]);
    const activeHabit = useMemo(
      () => habitDefs.find((d) => d.id === selectedHabitId) || null,
      [habitDefs, selectedHabitId]
    );
    const periodStats = useMemo(
      () => (activeHabit?.type === "period" ? computePeriodStats(habitLogsMap, todayStr) : null),
      [activeHabit, habitLogsMap, todayStr]
    );
    const todayCloneCandidates = useMemo(
      () => findCrossCharMoodCandidates(allMoodsCache, charId, todayStr, charNameMap),
      [allMoodsCache, charId, todayStr, charNameMap]
    );
    const selectedCloneCandidates = useMemo(
      () => (selectedDate ? findCrossCharMoodCandidates(allMoodsCache, charId, selectedDate, charNameMap) : []),
      [allMoodsCache, charId, selectedDate, charNameMap]
    );
    const selectedHabitSummary = useMemo(
      () => (selectedDate ? buildDailyHabitSummary(userHabitDefsCache, userHabitLogsCache, selectedDate) : { hasAny: false, summaryText: "" }),
      [userHabitDefsCache, userHabitLogsCache, selectedDate]
    );

    if (!isOpen) return null;

    const todayRecord = moodMap[todayStr];
    const hasTodayUserEntry = !!(todayRecord && todayRecord.userEntry && todayRecord.userEntry.moodId);

    const openDateSheet = (dateStr, autoOpenClone = false) => {
      const rec = moodMap[dateStr];
      setSelectedDate(dateStr);
      setDraftMoodId(rec?.userEntry?.moodId || "happy");
      setDraftText(rec?.userEntry?.text || "");
      setSaveNotice(false);
      setErrorMsg("");
      setShowClonePicker(Boolean(autoOpenClone));
      setCloneMentionWarning([]);
    };

    const applyCloneCandidate = async (cand, targetDate, directSave = false) => {
      if (!cand || !targetDate) return;
      const hits = detectSourceCharMention(cand.text, cand.sourceCharNames);
      const existing = moodMap[targetDate];
      const hasExistingText = Boolean(existing?.userEntry?.text && String(existing.userEntry.text).trim());

      // 若命中防串名预警或已有原稿，优先填入编辑框让用户微调，避免误覆盖/串名乌龙
      if (!directSave || hits.length > 0 || hasExistingText) {
        setSelectedDate(targetDate);
        setDraftMoodId(cand.moodId || "happy");
        setDraftText(cand.text || "");
        setCloneMentionWarning(hits);
        setShowClonePicker(false);
        return;
      }

      const merged = buildClonedMoodRecord(existing, charId, targetDate, cand, cand);
      try {
        if (global.momentCalendarStore && typeof global.momentCalendarStore.saveMood === "function") {
          await global.momentCalendarStore.saveMood(merged);
        }
        setMoodMap((prev) => ({ ...prev, [targetDate]: merged }));
        setAllMoodsCache((prev) => [merged, ...prev.filter((r) => r.id !== merged.id)]);
        setDraftMoodId(merged.userEntry.moodId);
        setDraftText(merged.userEntry.text);
        setShowClonePicker(false);
        setCloneMentionWarning([]);
        setSaveNotice(true);
        setTimeout(() => setSaveNotice(false), 1800);
        flashSyncToast(`✓ 已复刻自 ${cand.primaryCharName}`);
      } catch (e) {
        setErrorMsg("复刻失败：" + (e?.message || e));
      }
    };

    const handleQuickCloneToday = () => {
      if (todayCloneCandidates.length === 0) return;
      if (todayCloneCandidates.length === 1) {
        const only = todayCloneCandidates[0];
        const hits = detectSourceCharMention(only.text, only.sourceCharNames);
        if (hits.length > 0) {
          openDateSheet(todayStr, false);
          setDraftMoodId(only.moodId || "happy");
          setDraftText(only.text || "");
          setCloneMentionWarning(hits);
          return;
        }
        applyCloneCandidate(only, todayStr, true);
      } else {
        openDateSheet(todayStr, true);
      }
    };

    const handleInsertHabitSummary = () => {
      if (!selectedHabitSummary || !selectedHabitSummary.hasAny) return;
      setDraftText((prev) => {
        const base = String(prev || "").trim();
        if (!base) return selectedHabitSummary.summaryText;
        if (base.includes(selectedHabitSummary.summaryText)) return base;
        return `${base}\n${selectedHabitSummary.summaryText}`;
      });
    };

    const handleShiftMonth = (delta) => {
      const d = new Date(moodYear, moodMonth + delta, 1);
      setMoodYear(d.getFullYear());
      setMoodMonth(d.getMonth());
    };

    const handleJumpToday = () => {
      const n = new Date();
      setMoodYear(n.getFullYear());
      setMoodMonth(n.getMonth());
    };

    const handleSaveUserMood = async () => {
      if (!selectedDate) return;
      const sticker = getStickerById(draftMoodId) || MOOD_STICKERS[2];
      const existing = moodMap[selectedDate] || {
        id: `${charId}_${selectedDate}`,
        charId,
        date: selectedDate,
        userEntry: null,
        charEntry: null
      };
      const updated = {
        ...existing,
        id: `${charId}_${selectedDate}`,
        charId,
        date: selectedDate,
        userEntry: {
          moodId: sticker.id,
          moodLabel: sticker.label,
          text: draftText.trim(),
          updatedAt: Date.now()
        },
        updatedAt: Date.now()
      };
      try {
        if (global.momentCalendarStore && typeof global.momentCalendarStore.saveMood === "function") {
          await global.momentCalendarStore.saveMood(updated);
        }
        setMoodMap((prev) => ({ ...prev, [selectedDate]: updated }));
        setAllMoodsCache((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)]);
        setCloneMentionWarning([]);
        setSaveNotice(true);
        setTimeout(() => setSaveNotice(false), 1800);
      } catch (e) {
        setErrorMsg("保存心情失败：" + (e?.message || e));
      }
    };

    const handleNudgeCharMood = async () => {
      if (!selectedDate || isNudging) return;
      if (selectedDate > todayStr) {
        setErrorMsg("这一天尚未到来，等那天到了再催促 TA 写吧～");
        return;
      }
      setIsNudging(true);
      setErrorMsg("");
      try {
        const existing = moodMap[selectedDate] || {
          id: `${charId}_${selectedDate}`,
          charId,
          date: selectedDate,
          userEntry: null,
          charEntry: null
        };
        const charEntry = await generateCharMoodDiary({
          taCharacter,
          mePersona,
          dateStr: selectedDate,
          userEntry: existing.userEntry
        });
        const updated = {
          ...existing,
          id: `${charId}_${selectedDate}`,
          charId,
          date: selectedDate,
          charEntry,
          updatedAt: Date.now()
        };
        if (global.momentCalendarStore && typeof global.momentCalendarStore.saveMood === "function") {
          await global.momentCalendarStore.saveMood(updated);
        }
        setMoodMap((prev) => ({ ...prev, [selectedDate]: updated }));
      } catch (e) {
        setErrorMsg(e?.message || "催促失败，请稍后重试");
      } finally {
        setIsNudging(false);
      }
    };

    const selectedRecord = selectedDate ? moodMap[selectedDate] : null;
    const isFutureSelected = selectedDate ? selectedDate > todayStr : false;

    // 顶部极简导航 + 心情/习惯双独立日历切换
    const renderHeader = () =>
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "#FFFFFF",
            borderBottom: "1px solid #F0F0EE",
            flexShrink: 0
          }
        },
        h(
          "button",
          {
            onClick: onClose,
            style: {
              border: "none",
              background: "transparent",
              color: "#6B7280",
              fontSize: "14px",
              cursor: "pointer",
              padding: "4px 6px"
            }
          },
          "✕"
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          // 心情日记左侧极简统计罐图标按钮
          h(
            "button",
            {
              onClick: () => {
                setActiveTab("mood");
                setSelectedDate(null);
                setShowStatsView((v) => !v);
              },
              title: "月度心情罐统计",
              style: {
                border: showStatsView ? "1px solid #D99B43" : "1px solid #EAEAEA",
                background: showStatsView ? "#FFF8EB" : "#FFFFFF",
                color: showStatsView ? "#B86B27" : "#6B7280",
                borderRadius: "999px",
                width: "30px",
                height: "30px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0
              }
            },
            h(
              "svg",
              { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
              h("path", { d: "M7 4h10" }),
              h("path", { d: "M8 4v2a4 4 0 0 0-3 3.8V18a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9.8A4 4 0 0 0 16 6V4" }),
              h("circle", { cx: 10, cy: 15, r: 1.5 }),
              h("circle", { cx: 14.5, cy: 13.5, r: 1.5 })
            )
          ),
          h(
            "div",
            {
              style: {
                display: "inline-flex",
                background: "#F3F4F6",
                borderRadius: "999px",
                padding: "3px",
                gap: "2px"
              }
            },
            [
              { id: "mood", label: "心情日记" },
              { id: "habit", label: "习惯记录" }
            ].map((t) => {
              const active = activeTab === t.id && !showStatsView;
              return h(
                "button",
                {
                  key: t.id,
                  onClick: () => {
                    setActiveTab(t.id);
                    setShowStatsView(false);
                    setSelectedDate(null);
                    setHabitSelectedDate(null);
                    setErrorMsg("");
                  },
                  style: {
                    border: "none",
                    borderRadius: "999px",
                    padding: "5px 14px",
                    fontSize: "12.5px",
                    fontWeight: active ? 600 : 400,
                    background: active ? "#FFFFFF" : "transparent",
                    color: active ? "#1F2937" : "#6B7280",
                    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                    cursor: "pointer"
                  }
                },
                t.label
              );
            })
          )
        ),
        h(
          "div",
          {
            style: {
              fontSize: "11.5px",
              color: "#8C857B",
              maxWidth: "74px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "right"
            }
          },
          charName
        )
      );

    // 心情日记独立日历视图（1:1 参照上传的方格纸 + 日期下双圆圈格式）
    const renderMoodCalendar = () =>
      h(
        "div",
        {
          style: {
            flex: 1,
            position: "relative",
            overflowY: "auto",
            backgroundColor: "#FFFFFF",
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.025) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            padding: "12px 12px 92px"
          }
        },
        // 年月切换栏 + 双圆圈图例
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 6px 12px"
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px" } },
            h(
              "button",
              {
                onClick: () => handleShiftMonth(-1),
                style: {
                  border: "1px solid #EAEAEA",
                  background: "#FFFFFF",
                  borderRadius: "8px",
                  width: "26px",
                  height: "26px",
                  cursor: "pointer",
                  color: "#555"
                }
              },
              "‹"
            ),
            h(
              "span",
              { style: { fontSize: "15px", fontWeight: 700, color: "#2D2A26", letterSpacing: "0.04em" } },
              `${moodYear}年 ${moodMonth + 1}月`
            ),
            h(
              "button",
              {
                onClick: () => handleShiftMonth(1),
                style: {
                  border: "1px solid #EAEAEA",
                  background: "#FFFFFF",
                  borderRadius: "8px",
                  width: "26px",
                  height: "26px",
                  cursor: "pointer",
                  color: "#555"
                }
              },
              "›"
            )
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            !hasTodayUserEntry &&
              todayCloneCandidates.length > 0 &&
              (() => {
                const firstSt = getStickerById(todayCloneCandidates[0].moodId);
                return h(
                  "button",
                  {
                    type: "button",
                    onClick: handleQuickCloneToday,
                    title: `一键复刻今日在「${todayCloneCandidates[0].primaryCharName}」${todayCloneCandidates.length > 1 ? `等 ${todayCloneCandidates.length} 处` : ""}记录的心情`,
                    style: {
                      border: "1px solid #E2B46D",
                      background: "#FFF8EB",
                      color: "#9A5B13",
                      borderRadius: "999px",
                      padding: "2px 7px",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      boxShadow: "0 1px 4px rgba(217,155,67,0.16)"
                    }
                  },
                  firstSt &&
                    h("img", {
                      src: firstSt.img,
                      alt: firstSt.label,
                      style: { width: "16px", height: "16px", objectFit: "contain", display: "block" }
                    }),
                  h("span", null, todayCloneCandidates.length > 1 ? `⧉ ${todayCloneCandidates.length}` : "⧉")
                );
              })(),
            syncToast &&
              h(
                "span",
                { style: { fontSize: "10.5px", color: "#5E8C61", fontWeight: 600 } },
                syncToast
              ),
            h(
              "span",
              { style: { fontSize: "11px", color: "#9CA3AF" } },
              `上·我 / 下·${charName}`
            ),
            h(
              "button",
              {
                onClick: handleJumpToday,
                style: {
                  border: "1px solid #E5E7EB",
                  background: "#FFFFFF",
                  color: "#4B5563",
                  fontSize: "11px",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  cursor: "pointer"
                }
              },
              "今天"
            )
          )
        ),

        // 周一至周日表头
        h(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              textAlign: "center",
              paddingBottom: "8px",
              fontSize: "12px",
              color: "#9C968D"
            }
          },
          WEEKDAYS_MON_FIRST.map((w) => h("div", { key: w }, w))
        ),

        // 7列日期网格：每格顶部为日期数字，下方纵向排列两个圆圈（上=用户，下=角色）
        h(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              rowGap: "14px",
              columnGap: "2px"
            }
          },
          monthCells.map((cell, idx) => {
            if (!cell) return h("div", { key: "blank_" + idx });
            const rec = moodMap[cell.dateStr];
            const isToday = cell.dateStr === todayStr;
            return h(
              "div",
              {
                key: cell.dateStr,
                onClick: () => openDateSheet(cell.dateStr),
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "5px",
                  cursor: "pointer",
                  padding: "3px 0",
                  borderRadius: "10px",
                  background: isToday ? "rgba(247, 208, 138, 0.16)" : "transparent"
                }
              },
              h(
                "div",
                {
                  style: {
                    fontSize: "13px",
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? "#B86B27" : "#44403C",
                    lineHeight: "18px"
                  }
                },
                cell.day
              ),
              // 上圆圈：用户心情贴纸
              renderStickerCircle(rec?.userEntry, 38),
              // 下圆圈：角色心情贴纸
              renderStickerCircle(rec?.charEntry, 38)
            );
          })
        ),

        // 右下角悬浮写日记按钮（仿参考图 + 未写提示气泡）
        h(
          "div",
          {
            style: {
              position: "sticky",
              bottom: "12px",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              pointerEvents: "none",
              marginTop: "12px",
              paddingRight: "6px"
            }
          },
          !hasTodayUserEntry &&
            h(
              "div",
              {
                style: {
                  pointerEvents: "auto",
                  background: "#EFECE6",
                  color: "#57534E",
                  fontSize: "12px",
                  padding: "7px 14px",
                  borderRadius: "14px",
                  marginBottom: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  cursor: "pointer"
                },
                onClick: () => openDateSheet(todayStr)
              },
              "今天还没写日记"
            ),
          h(
            "button",
            {
              onClick: () => openDateSheet(todayStr),
              title: "记录今天的心情",
              style: {
                pointerEvents: "auto",
                width: "48px",
                height: "48px",
                borderRadius: "16px",
                border: "none",
                background: "#F7CF86",
                color: "#3F352B",
                fontSize: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 18px rgba(217, 165, 78, 0.35)",
                cursor: "pointer"
              }
            },
            "✎"
          )
        )
      );

    // 习惯记录独立日历操作函数
    const handleShiftHabitMonth = (delta) => {
      const d = new Date(habitYear, habitMonth + delta, 1);
      setHabitYear(d.getFullYear());
      setHabitMonth(d.getMonth());
    };

    const openHabitDateSheet = (dateStr) => {
      if (!activeHabit) return;
      const log = habitLogsMap[dateStr];
      setHabitSelectedDate(dateStr);
      setHabitSaveNotice(false);
      setErrorMsg("");
      if (activeHabit.type === "period") {
        setPeriodDraftOn(log ? !!log.isPeriod : true);
        setPeriodDraftFlow(log?.flow || "medium");
        setPeriodDraftSymptoms(Array.isArray(log?.symptoms) ? log.symptoms : []);
        setHabitDraftNote(log?.note || "");
      } else {
        setHabitDraftNote(log?.note || "");
      }
    };

    const handleSavePeriodLog = async () => {
      if (!activeHabit || !habitSelectedDate) return;
      const logId = `${activeHabit.id}_${habitSelectedDate}`;
      try {
        if (!periodDraftOn) {
          if (global.momentCalendarStore && typeof global.momentCalendarStore.deleteHabitLog === "function") {
            await global.momentCalendarStore.deleteHabitLog(logId);
          }
          setHabitLogsMap((prev) => {
            const next = { ...prev };
            delete next[habitSelectedDate];
            return next;
          });
        } else {
          const rec = {
            id: logId,
            habitId: activeHabit.id,
            date: habitSelectedDate,
            status: "done",
            isPeriod: true,
            flow: periodDraftFlow,
            symptoms: periodDraftSymptoms,
            note: habitDraftNote.trim(),
            updatedAt: Date.now()
          };
          if (global.momentCalendarStore && typeof global.momentCalendarStore.saveHabitLog === "function") {
            await global.momentCalendarStore.saveHabitLog(rec);
          }
          setHabitLogsMap((prev) => ({ ...prev, [habitSelectedDate]: rec }));
          if (habitSelectedDate === todayStr) setHasTodayHabitLogged(true);
        }
        setHabitSaveNotice(true);
        setTimeout(() => setHabitSaveNotice(false), 1600);
      } catch (e) {
        setErrorMsg("保存经期记录失败：" + (e?.message || e));
      }
    };

    const handleAskPeriodComfort = async () => {
      if (!activeHabit || !habitSelectedDate || isAskingComfort) return;
      setIsAskingComfort(true);
      setErrorMsg("");
      try {
        const comfortText = await generatePeriodComfort({
          taCharacter,
          mePersona,
          dateStr: habitSelectedDate,
          flow: periodDraftFlow,
          symptoms: periodDraftSymptoms,
          note: habitDraftNote.trim()
        });
        const logId = `${activeHabit.id}_${habitSelectedDate}`;
        const existing = habitLogsMap[habitSelectedDate] || {};
        const rec = {
          ...existing,
          id: logId,
          habitId: activeHabit.id,
          date: habitSelectedDate,
          status: "done",
          isPeriod: true,
          flow: periodDraftFlow,
          symptoms: periodDraftSymptoms,
          note: habitDraftNote.trim(),
          charComfort: comfortText,
          updatedAt: Date.now()
        };
        if (global.momentCalendarStore && typeof global.momentCalendarStore.saveHabitLog === "function") {
          await global.momentCalendarStore.saveHabitLog(rec);
        }
        setHabitLogsMap((prev) => ({ ...prev, [habitSelectedDate]: rec }));
        if (habitSelectedDate === todayStr) setHasTodayHabitLogged(true);
      } catch (e) {
        setErrorMsg("获取角色关怀失败：" + (e?.message || e));
      } finally {
        setIsAskingComfort(false);
      }
    };

    const handleCopyDayDiary = async () => {
      if (!selectedDate) return;
      const rec = moodMap[selectedDate];
      const parts = [
        `【沧海一刻 · ${selectedDate}】`,
        rec?.userEntry
          ? `我（${rec.userEntry.moodLabel || "心情"}）：${rec.userEntry.text || "（仅贴了心情贴纸）"}`
          : "我：今日暂未记录",
        rec?.charEntry
          ? `${charName}（${rec.charEntry.moodLabel || "心情"}${rec.charEntry.shortTag ? " · " + rec.charEntry.shortTag : ""}）：${rec.charEntry.text || ""}`
          : `${charName}：今日暂未记录`,
        rec?.charEntry?.whisperToUser ? `角落碎碎念：“${rec.charEntry.whisperToUser}”` : ""
      ].filter(Boolean);
      const txt = parts.join("\n");
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(txt);
        } else {
          const ta = document.createElement("textarea");
          ta.value = txt;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setCopyDayNotice(true);
        setTimeout(() => setCopyDayNotice(false), 1800);
      } catch (e) {
        setErrorMsg("复制失败，请手动选择复制");
      }
    };

    const handleExportNodeAsPng = async (nodeRef, filename) => {
      if (!nodeRef || !nodeRef.current || isExportingImg) return;
      if (typeof global.html2canvas !== "function") {
        setErrorMsg("当前环境未加载 html2canvas，暂无法导出图片");
        return;
      }
      setIsExportingImg(true);
      setErrorMsg("");
      try {
        const canvas = await global.html2canvas(nodeRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#FFFFFF"
        });
        const link = document.createElement("a");
        link.download = filename;
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        setErrorMsg("导出图片失败：" + (e?.message || e));
      } finally {
        setIsExportingImg(false);
      }
    };

    const handleToggleUserHabitLog = async (checked) => {
      if (!activeHabit || !habitSelectedDate) return;
      const logId = `${activeHabit.id}_${habitSelectedDate}`;
      try {
        if (!checked) {
          if (global.momentCalendarStore && typeof global.momentCalendarStore.deleteHabitLog === "function") {
            await global.momentCalendarStore.deleteHabitLog(logId);
          }
          setHabitLogsMap((prev) => {
            const next = { ...prev };
            delete next[habitSelectedDate];
            return next;
          });
        } else {
          const rec = {
            id: logId,
            habitId: activeHabit.id,
            date: habitSelectedDate,
            status: "done",
            statusLabel: "已完成",
            note: habitDraftNote.trim(),
            updatedAt: Date.now()
          };
          if (global.momentCalendarStore && typeof global.momentCalendarStore.saveHabitLog === "function") {
            await global.momentCalendarStore.saveHabitLog(rec);
          }
          setHabitLogsMap((prev) => ({ ...prev, [habitSelectedDate]: rec }));
          if (habitSelectedDate === todayStr) setHasTodayHabitLogged(true);
        }
        setHabitSaveNotice(true);
        setTimeout(() => setHabitSaveNotice(false), 1500);
      } catch (e) {
        setErrorMsg("保存打卡失败：" + (e?.message || e));
      }
    };

    const handleAddUserHabit = async () => {
      const name = newHabitName.trim();
      if (!name) return;
      const def = {
        id: "habit_user_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5),
        ownerScope: "user",
        ownerRole: "user",
        charId: "",
        type: "custom",
        name: name.slice(0, 12),
        icon: newHabitIcon,
        color: newHabitColor,
        personaReason: "",
        createdAt: Date.now()
      };
      try {
        if (global.momentCalendarStore && typeof global.momentCalendarStore.saveHabitDef === "function") {
          await global.momentCalendarStore.saveHabitDef(def);
        }
        setNewHabitName("");
        setShowAddHabitForm(false);
        await loadHabitDefs("user");
        setSelectedHabitId(def.id);
      } catch (e) {
        setErrorMsg("新增习惯失败");
      }
    };

    const handleDeleteHabit = async (habitId) => {
      if (!habitId || habitId === PERIOD_HABIT_ID) return;
      try {
        if (global.momentCalendarStore && typeof global.momentCalendarStore.deleteHabitDef === "function") {
          await global.momentCalendarStore.deleteHabitDef(habitId);
        }
        await loadHabitDefs(habitOwnerTab);
      } catch (e) {}
    };

    const handleGenerateCharHabits = async () => {
      if (isGeneratingHabits) return;
      setIsGeneratingHabits(true);
      setErrorMsg("");
      try {
        const list = await generateCharHabits({ taCharacter });
        if (global.momentCalendarStore && typeof global.momentCalendarStore.saveHabitDef === "function") {
          for (const item of list) {
            await global.momentCalendarStore.saveHabitDef(item);
          }
        }
        await loadHabitDefs("char");
        if (list[0]) setSelectedHabitId(list[0].id);
      } catch (e) {
        setErrorMsg(e?.message || "生成角色专属习惯失败");
      } finally {
        setIsGeneratingHabits(false);
      }
    };

    const handleCheckinCharHabit = async () => {
      if (!activeHabit || !habitSelectedDate || isLoggingCharHabit) return;
      if (habitSelectedDate > todayStr) {
        setErrorMsg("这一天还没到呢，等那天再来看 TA 打卡吧～");
        return;
      }
      setIsLoggingCharHabit(true);
      setErrorMsg("");
      try {
        const log = await generateCharHabitLog({
          taCharacter,
          habit: activeHabit,
          dateStr: habitSelectedDate
        });
        if (global.momentCalendarStore && typeof global.momentCalendarStore.saveHabitLog === "function") {
          await global.momentCalendarStore.saveHabitLog(log);
        }
        setHabitLogsMap((prev) => ({ ...prev, [habitSelectedDate]: log }));
      } catch (e) {
        setErrorMsg(e?.message || "获取角色打卡失败");
      } finally {
        setIsLoggingCharHabit(false);
      }
    };

    const handleBatchFillCharMonthLogs = async () => {
      if (!activeHabit || isLoggingCharHabit) return;
      setIsLoggingCharHabit(true);
      setErrorMsg("");
      try {
        const logs = await generateCharHabitMonthLogs({
          taCharacter,
          habit: activeHabit,
          year: habitYear,
          monthIndex: habitMonth,
          todayStr
        });
        if (logs.length === 0) {
          setErrorMsg("该月份尚未到来，暂无法生成打卡足迹");
          return;
        }
        const nextMap = { ...habitLogsMap };
        for (const lg of logs) {
          if (global.momentCalendarStore && typeof global.momentCalendarStore.saveHabitLog === "function") {
            await global.momentCalendarStore.saveHabitLog(lg);
          }
          nextMap[lg.date] = lg;
        }
        setHabitLogsMap(nextMap);
      } catch (e) {
        setErrorMsg(e?.message || "生成本月打卡足迹失败");
      } finally {
        setIsLoggingCharHabit(false);
      }
    };

    // 习惯记录独立日历视图（与心情日记完全分离）
    const renderHabitCalendar = () => {
      const monthPrefix = `${habitYear}-${String(habitMonth + 1).padStart(2, "0")}-`;
      const monthDoneCount = Object.keys(habitLogsMap).filter((d) => {
        if (!d.startsWith(monthPrefix)) return false;
        const l = habitLogsMap[d];
        return activeHabit?.type === "period" ? !!l?.isPeriod : l?.status === "done";
      }).length;

      return h(
        "div",
        {
          style: {
            flex: 1,
            overflowY: "auto",
            background: "#FAF9F7",
            padding: "14px 14px 36px",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }
        },
        // 顶部归属切换：我的习惯 / TA 的习惯
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 } },
          h(
            "div",
            {
              style: {
                display: "inline-flex",
                background: "#EFECE6",
                borderRadius: "999px",
                padding: "3px",
                gap: "2px"
              }
            },
            [
              { id: "user", label: "我的习惯" },
              { id: "char", label: `${charName} 的习惯` }
            ].map((o) => {
              const active = habitOwnerTab === o.id;
              return h(
                "button",
                {
                  key: o.id,
                  onClick: () => setHabitOwnerTab(o.id),
                  style: {
                    border: "none",
                    borderRadius: "999px",
                    padding: "5px 13px",
                    fontSize: "12px",
                    fontWeight: active ? 600 : 400,
                    background: active ? "#FFFFFF" : "transparent",
                    color: active ? "#292524" : "#78716C",
                    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                    cursor: "pointer"
                  }
                },
                o.label
              );
            })
          ),
          habitOwnerTab === "user"
            ? h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px" } },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => flashSyncToast("🔗 已跨角色共享"),
                    title: "我的习惯与经期记录已自动跨角色同步，切换角色无需重复打卡",
                    style: {
                      border: "1px solid #D7E5D8",
                      background: "#F3F9F4",
                      color: "#4C7A50",
                      fontSize: "11.5px",
                      borderRadius: "999px",
                      padding: syncToast ? "3px 8px" : "3px 7px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px"
                    }
                  },
                  syncToast || "🔗"
                ),
                h(
                  "button",
                  {
                    onClick: () => setShowAddHabitForm((v) => !v),
                    style: {
                      border: "1px solid #E5E0D8",
                      background: "#FFFFFF",
                      color: "#44403C",
                      fontSize: "11.5px",
                      borderRadius: "999px",
                      padding: "4px 10px",
                      cursor: "pointer"
                    }
                  },
                  showAddHabitForm ? "✕" : "+"
                )
              )
            : h(
                "button",
                {
                  onClick: handleGenerateCharHabits,
                  disabled: isGeneratingHabits,
                  style: {
                    border: "1px solid #E2B46D",
                    background: isGeneratingHabits ? "#F3E6CE" : "#FFF8EB",
                    color: "#9A5B13",
                    fontSize: "11.5px",
                    borderRadius: "999px",
                    padding: "4px 10px",
                    cursor: isGeneratingHabits ? "not-allowed" : "pointer"
                  }
                },
                isGeneratingHabits ? "生成中…" : habitDefs.length > 0 ? "+ 再生成一组" : `生成 ${charName} 习惯`
              )
        ),

        // 新增用户自定义习惯表单
        habitOwnerTab === "user" &&
          showAddHabitForm &&
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EAE5DC",
                borderRadius: "14px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }
            },
            h("input", {
              type: "text",
              value: newHabitName,
              onChange: (e) => setNewHabitName(e.target.value),
              placeholder: "习惯名称，如：喝够8杯水、早睡、阅读…",
              style: {
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #E5E0D8",
                borderRadius: "8px",
                padding: "7px 10px",
                fontSize: "12.5px",
                outline: "none"
              }
            }),
            h(
              "div",
              { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
              USER_HABIT_ICONS.map((ic) =>
                h(
                  "button",
                  {
                    key: ic,
                    onClick: () => setNewHabitIcon(ic),
                    style: {
                      border: newHabitIcon === ic ? "1.5px solid #292524" : "1px solid #EAE5DC",
                      background: newHabitIcon === ic ? "#F5F3EF" : "#FFFFFF",
                      borderRadius: "8px",
                      width: "30px",
                      height: "30px",
                      cursor: "pointer"
                    }
                  },
                  ic
                )
              )
            ),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
              h(
                "div",
                { style: { display: "flex", gap: "6px" } },
                USER_HABIT_COLORS.map((c) =>
                  h("div", {
                    key: c,
                    onClick: () => setNewHabitColor(c),
                    style: {
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: c,
                      cursor: "pointer",
                      border: newHabitColor === c ? "2px solid #292524" : "2px solid transparent"
                    }
                  })
                )
              ),
              h(
                "button",
                {
                  onClick: handleAddUserHabit,
                  disabled: !newHabitName.trim(),
                  style: {
                    border: "none",
                    borderRadius: "8px",
                    padding: "6px 14px",
                    background: newHabitName.trim() ? "#292524" : "#D6D3D1",
                    color: "#FFFFFF",
                    fontSize: "12px",
                    cursor: newHabitName.trim() ? "pointer" : "not-allowed"
                  }
                },
                "添加"
              )
            )
          ),

        // 习惯选择胶囊条（自动换行 + flexShrink: 0 杜绝被压缩裁切）
        habitDefs.length > 0 &&
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "6px", flexShrink: 0 } },
            habitDefs.map((hd) => {
              const active = hd.id === selectedHabitId;
              return h(
                "button",
                {
                  key: hd.id,
                  onClick: () => setSelectedHabitId(hd.id),
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    border: active ? `1.5px solid ${hd.color || "#6B8E78"}` : "1px solid #E7E3DC",
                    background: active ? "#FFFFFF" : "#F3F1EC",
                    color: active ? "#292524" : "#78716C",
                    fontSize: "12px",
                    fontWeight: active ? 600 : 400,
                    padding: "5px 11px",
                    borderRadius: "999px",
                    cursor: "pointer"
                  }
                },
                h("span", null, hd.icon || "✨"),
                h("span", null, hd.name)
              );
            })
          ),

        // 角色尚无专属习惯时的空态引导
        habitOwnerTab === "char" &&
          habitDefs.length === 0 &&
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EAE5DC",
                borderRadius: "16px",
                padding: "32px 20px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px"
              }
            },
            h("div", { style: { fontSize: "26px" } }, "✨"),
            h("div", { style: { fontSize: "14px", fontWeight: 700, color: "#292524" } }, `尚未生成 ${charName} 的专属习惯`),
            h(
              "div",
              { style: { fontSize: "12px", color: "#78716C", lineHeight: "1.6", maxWidth: "260px" } },
              `根据 ${charName} 的性格、爱好与背景，生成属于 TA 自己的奇特/真实日常习惯（如品茗、劫道、核账、偷闲补觉等）。`
            ),
            h(
              "button",
              {
                onClick: handleGenerateCharHabits,
                disabled: isGeneratingHabits,
                style: {
                  border: "none",
                  borderRadius: "10px",
                  padding: "9px 18px",
                  background: isGeneratingHabits ? "#C9B9AA" : "#292524",
                  color: "#FFFFFF",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isGeneratingHabits ? "not-allowed" : "pointer"
                }
              },
              isGeneratingHabits ? `正在为 ${charName} 构思习惯…` : `立即生成 ${charName} 的专属习惯`
            )
          ),

        // 选中习惯后的独立状态条 + 独立习惯月历
        activeHabit &&
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EAE5DC",
                borderRadius: "16px",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                flexShrink: 0
              }
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" } },
              h(
                "div",
                { style: { minWidth: 0 } },
                h(
                  "div",
                  { style: { fontSize: "13.5px", fontWeight: 700, color: "#292524", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" } },
                  h("span", null, activeHabit.icon || "✨"),
                  h("span", null, activeHabit.name),
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "11px",
                        color: activeHabit.color || "#6B8E78",
                        background: "rgba(0,0,0,0.03)",
                        padding: "1px 7px",
                        borderRadius: "999px"
                      }
                    },
                    activeHabit.type === "period" ? `本月 ${monthDoneCount} 天` : `本月打卡 ${monthDoneCount} 天`
                  )
                ),
                h(
                  "div",
                  { style: { fontSize: "11.5px", color: "#78716C", marginTop: "4px", lineHeight: "1.5" } },
                  activeHabit.type === "period"
                    ? periodStats?.statusText
                    : activeHabit.personaReason || "点击下方日历日期即可记录或查看打卡"
                )
              ),
              activeHabit.id !== PERIOD_HABIT_ID &&
                h(
                  "button",
                  {
                    onClick: () => handleDeleteHabit(activeHabit.id),
                    style: {
                      border: "none",
                      background: "transparent",
                      color: "#A8A29E",
                      fontSize: "11.5px",
                      cursor: "pointer",
                      flexShrink: 0
                    }
                  },
                  "删除"
                )
            ),
            habitOwnerTab === "char" &&
              h(
                "button",
                {
                  onClick: handleBatchFillCharMonthLogs,
                  disabled: isLoggingCharHabit,
                  style: {
                    width: "100%",
                    border: `1px solid ${activeHabit.color || "#6B8E78"}`,
                    background: isLoggingCharHabit ? "#F3F1EC" : "#FAFDFB",
                    color: activeHabit.color || "#486B55",
                    borderRadius: "10px",
                    padding: "7px 12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: isLoggingCharHabit ? "not-allowed" : "pointer"
                  }
                },
                isLoggingCharHabit
                  ? `正在打探 ${charName} 本月打卡足迹…`
                  : `✨ 一键生成 ${charName} 本月打卡足迹（点亮日历）`
              )
          ),

        activeHabit &&
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EAE5DC",
                borderRadius: "16px",
                padding: "14px 12px",
                flexShrink: 0
              }
            },
            // 独立习惯年月栏
            h(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                  padding: "0 4px"
                }
              },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "8px" } },
                h(
                  "button",
                  {
                    onClick: () => handleShiftHabitMonth(-1),
                    style: { border: "1px solid #EAEAEA", background: "#FFF", borderRadius: "8px", width: "26px", height: "26px", cursor: "pointer" }
                  },
                  "‹"
                ),
                h("span", { style: { fontSize: "14.5px", fontWeight: 700, color: "#292524" } }, `${habitYear}年 ${habitMonth + 1}月`),
                h(
                  "button",
                  {
                    onClick: () => handleShiftHabitMonth(1),
                    style: { border: "1px solid #EAEAEA", background: "#FFF", borderRadius: "8px", width: "26px", height: "26px", cursor: "pointer" }
                  },
                  "›"
                )
              ),
              h(
                "span",
                { style: { fontSize: "11px", color: "#A8A29E" } },
                activeHabit.type === "period"
                  ? "实粉=经期 · 虚粉=预计"
                  : habitOwnerTab === "char"
                  ? "✓完成 · 💤摸鱼 · !翻车"
                  : "点击日期打卡"
              )
            ),
            h(
              "div",
              {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  textAlign: "center",
                  fontSize: "11.5px",
                  color: "#A8A29E",
                  paddingBottom: "8px"
                }
              },
              WEEKDAYS_MON_FIRST.map((w) => h("div", { key: w }, w))
            ),
            h(
              "div",
              {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  rowGap: "10px",
                  columnGap: "4px"
                }
              },
              habitMonthCells.map((cell, idx) => {
                if (!cell) return h("div", { key: "hb_" + idx });
                const log = habitLogsMap[cell.dateStr];
                const isToday = cell.dateStr === todayStr;
                const isPeriodDay = activeHabit.type === "period" && !!log?.isPeriod;
                const isPredicted = activeHabit.type === "period" && !isPeriodDay && periodStats?.predictedSet?.has(cell.dateStr);
                const isDone = activeHabit.type !== "period" && log?.status === "done";
                const isSlacked = activeHabit.type !== "period" && log?.status === "slacked";
                const isChaos = activeHabit.type !== "period" && log?.status === "chaos";
                const accent = activeHabit.color || "#6B8E78";

                let circleBg = "transparent";
                let circleBorder = isToday ? `1.5px solid ${accent}` : "1px solid #F0ECE6";
                let circleColor = "#44403C";
                let badge = "";

                if (isPeriodDay) {
                  circleBg = "#D9778A";
                  circleBorder = "1.5px solid #D9778A";
                  circleColor = "#FFFFFF";
                } else if (isPredicted) {
                  circleBg = "rgba(217, 119, 138, 0.1)";
                  circleBorder = "1.5px dashed #D9778A";
                  circleColor = "#B85368";
                } else if (isDone) {
                  circleBg = accent;
                  circleBorder = `1.5px solid ${accent}`;
                  circleColor = "#FFFFFF";
                  badge = "✓";
                } else if (isSlacked) {
                  circleBg = "#F3F4F6";
                  circleBorder = "1px dashed #9CA3AF";
                  circleColor = "#6B7280";
                  badge = "💤";
                } else if (isChaos) {
                  circleBg = "#FEE2E2";
                  circleBorder = "1.5px solid #DC2626";
                  circleColor = "#B91C1C";
                  badge = "!";
                }

                return h(
                  "div",
                  {
                    key: cell.dateStr,
                    onClick: () => openHabitDateSheet(cell.dateStr),
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "3px",
                      cursor: "pointer"
                    }
                  },
                  h(
                    "div",
                    {
                      style: {
                        width: "34px",
                        height: "34px",
                        borderRadius: "50%",
                        background: circleBg,
                        border: circleBorder,
                        color: circleColor,
                        fontSize: "12.5px",
                        fontWeight: isToday || isPeriodDay || isDone ? 700 : 500,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                      }
                    },
                    cell.day,
                    badge &&
                      h(
                        "span",
                        {
                          style: {
                            position: "absolute",
                            bottom: "-3px",
                            right: "-3px",
                            fontSize: "9px",
                            lineHeight: 1,
                            background: "#FFFFFF",
                            borderRadius: "50%",
                            padding: "1px 2px",
                            color: circleColor === "#FFFFFF" ? accent : circleColor
                          }
                        },
                        badge
                      )
                  )
                );
              })
            )
          )
      );
    };

    // 习惯单日详情与打卡抽屉
    const renderHabitDateSheet = () => {
      if (!habitSelectedDate || !activeHabit) return null;
      const existingLog = habitLogsMap[habitSelectedDate];
      const isFuture = habitSelectedDate > todayStr;

      return h(
        "div",
        {
          style: {
            position: "absolute",
            inset: 0,
            background: "rgba(28, 25, 23, 0.38)",
            display: "flex",
            alignItems: "flex-end",
            zIndex: 25
          },
          onClick: (e) => {
            if (e.target === e.currentTarget) setHabitSelectedDate(null);
          }
        },
        h(
          "div",
          {
            style: {
              width: "100%",
              maxHeight: "78%",
              background: "#FFFFFF",
              borderTopLeftRadius: "22px",
              borderTopRightRadius: "22px",
              padding: "16px 18px 24px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxShadow: "0 -10px 30px rgba(0,0,0,0.12)"
            }
          },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h(
              "div",
              { style: { fontSize: "14.5px", fontWeight: 700, color: "#292524" } },
              `${activeHabit.icon || "✨"} ${activeHabit.name} · ${habitSelectedDate}`
            ),
            h(
              "button",
              {
                onClick: () => setHabitSelectedDate(null),
                style: { border: "none", background: "#F3F4F6", color: "#6B7280", borderRadius: "999px", width: "26px", height: "26px", cursor: "pointer" }
              },
              "✕"
            )
          ),

          errorMsg &&
            h(
              "div",
              { style: { padding: "8px 10px", borderRadius: "8px", background: "#FEF2F2", color: "#B91C1C", fontSize: "12px" } },
              errorMsg
            ),

          // 分支 1：用户经期记录面板
          activeHabit.type === "period"
            ? h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "12px" } },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      background: "#FDF2F5",
                      border: "1px solid #F6D5DF"
                    }
                  },
                  h("span", { style: { fontSize: "13px", fontWeight: 600, color: "#9D3B53" } }, "这一天在经期"),
                  h(
                    "button",
                    {
                      onClick: () => setPeriodDraftOn((v) => !v),
                      style: {
                        border: "none",
                        borderRadius: "999px",
                        padding: "5px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: periodDraftOn ? "#D9778A" : "#E5E7EB",
                        color: periodDraftOn ? "#FFFFFF" : "#6B7280",
                        cursor: "pointer"
                      }
                    },
                    periodDraftOn ? "已开启" : "未在经期"
                  )
                ),
                periodDraftOn &&
                  h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "10px" } },
                    h(
                      "div",
                      null,
                      h("div", { style: { fontSize: "12px", color: "#78716C", marginBottom: "6px" } }, "流量"),
                      h(
                        "div",
                        { style: { display: "flex", gap: "8px" } },
                        PERIOD_FLOWS.map((fl) => {
                          const active = periodDraftFlow === fl.id;
                          return h(
                            "button",
                            {
                              key: fl.id,
                              onClick: () => setPeriodDraftFlow(fl.id),
                              style: {
                                flex: 1,
                                border: active ? "1.5px solid #D9778A" : "1px solid #E5E0D8",
                                background: active ? "#FDF2F5" : "#FAF9F7",
                                color: active ? "#B84760" : "#57534E",
                                borderRadius: "10px",
                                padding: "7px",
                                fontSize: "12.5px",
                                cursor: "pointer"
                              }
                            },
                            fl.label
                          );
                        })
                      )
                    ),
                    h(
                      "div",
                      null,
                      h("div", { style: { fontSize: "12px", color: "#78716C", marginBottom: "6px" } }, "体感症状（可多选）"),
                      h(
                        "div",
                        { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                        PERIOD_SYMPTOMS.map((sy) => {
                          const active = periodDraftSymptoms.includes(sy);
                          return h(
                            "button",
                            {
                              key: sy,
                              onClick: () =>
                                setPeriodDraftSymptoms((prev) =>
                                  prev.includes(sy) ? prev.filter((x) => x !== sy) : [...prev, sy]
                                ),
                              style: {
                                border: active ? "1px solid #D9778A" : "1px solid #E5E0D8",
                                background: active ? "#FDF2F5" : "#FAF9F7",
                                color: active ? "#B84760" : "#57534E",
                                borderRadius: "999px",
                                padding: "4px 10px",
                                fontSize: "11.5px",
                                cursor: "pointer"
                              }
                            },
                            sy
                          );
                        })
                      )
                    ),
                    h("input", {
                      type: "text",
                      value: habitDraftNote,
                      onChange: (e) => setHabitDraftNote(e.target.value),
                      placeholder: "简短备注（可选，如：喝了红糖姜茶）…",
                      style: {
                        width: "100%",
                        boxSizing: "border-box",
                        border: "1px solid #E5E0D8",
                        borderRadius: "10px",
                        padding: "8px 10px",
                        fontSize: "12.5px",
                        outline: "none"
                      }
                    })
                  ),
                h(
                  "button",
                  {
                    onClick: handleSavePeriodLog,
                    style: {
                      width: "100%",
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px",
                      background: habitSaveNotice ? "#5E8C61" : "#D9778A",
                      color: "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }
                  },
                  habitSaveNotice ? "✓ 已保存" : periodDraftOn ? "保存经期记录" : "清除当日经期标记"
                ),
                periodDraftOn &&
                  h(
                    "button",
                    {
                      onClick: handleAskPeriodComfort,
                      disabled: isAskingComfort,
                      style: {
                        width: "100%",
                        border: "1px solid #F1B9C7",
                        borderRadius: "10px",
                        padding: "9px",
                        background: isAskingComfort ? "#F8E5EA" : "#FFF5F7",
                        color: "#A83B55",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        cursor: isAskingComfort ? "not-allowed" : "pointer"
                      }
                    },
                    isAskingComfort ? `${charName} 正在赶来哄你…` : `告诉 ${charName} 今天不舒服`
                  ),
                existingLog?.charComfort &&
                  h(
                    "div",
                    {
                      style: {
                        padding: "10px 12px",
                        borderRadius: "12px",
                        background: "#FFF9FA",
                        border: "1px solid #F6D5DF",
                        fontSize: "13px",
                        lineHeight: "1.75",
                        color: "#4A3A3E"
                      }
                    },
                    h(
                      "div",
                      { style: { fontSize: "11.5px", fontWeight: 700, color: "#B84760", marginBottom: "4px" } },
                      `${charName} 的贴心叮嘱：`
                    ),
                    existingLog.charComfort
                  )
              )
            : // 分支 2：用户自定义普通习惯
            habitOwnerTab === "user"
            ? h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "10px" } },
                h("input", {
                  type: "text",
                  value: habitDraftNote,
                  onChange: (e) => setHabitDraftNote(e.target.value),
                  placeholder: "写一句打卡小记（可选）…",
                  style: {
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid #E5E0D8",
                    borderRadius: "10px",
                    padding: "9px 10px",
                    fontSize: "13px",
                    outline: "none"
                  }
                }),
                h(
                  "div",
                  { style: { display: "flex", gap: "8px" } },
                  h(
                    "button",
                    {
                      onClick: () => handleToggleUserHabitLog(true),
                      style: {
                        flex: 1,
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px",
                        background: habitSaveNotice ? "#5E8C61" : activeHabit.color || "#6B8E78",
                        color: "#FFFFFF",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }
                    },
                    habitSaveNotice ? "✓ 已打卡" : existingLog ? "更新打卡备注" : "✓ 完成今日打卡"
                  ),
                  existingLog &&
                    h(
                      "button",
                      {
                        onClick: () => handleToggleUserHabitLog(false),
                        style: {
                          border: "1px solid #E5E0D8",
                          borderRadius: "10px",
                          padding: "10px 14px",
                          background: "#FAF9F7",
                          color: "#78716C",
                          fontSize: "12.5px",
                          cursor: "pointer"
                        }
                      },
                      "取消打卡"
                    )
                )
              )
            : // 分支 3：角色专属习惯 AI 打卡
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "12px" } },
                existingLog
                  ? h(
                      "div",
                      {
                        style: {
                          background: "#FAF9F7",
                          border: "1px solid #EFECE6",
                          borderRadius: "14px",
                          padding: "14px"
                        }
                      },
                      h(
                        "div",
                        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } },
                        h("span", { style: { fontSize: "13px", fontWeight: 700, color: "#292524" } }, `${charName} 的当日打卡`),
                        h(
                          "span",
                          {
                            style: {
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background:
                                existingLog.status === "done"
                                  ? "rgba(107,142,120,0.14)"
                                  : existingLog.status === "chaos"
                                  ? "#FEE2E2"
                                  : "#F3F4F6",
                              color:
                                existingLog.status === "done"
                                  ? "#486B55"
                                  : existingLog.status === "chaos"
                                  ? "#B91C1C"
                                  : "#6B7280"
                            }
                          },
                          existingLog.statusLabel || existingLog.status
                        )
                      ),
                      h("div", { style: { fontSize: "13.5px", lineHeight: "1.75", color: "#3F3A36" } }, existingLog.note)
                    )
                  : h(
                      "div",
                      { style: { textAlign: "center", padding: "14px 8px", fontSize: "12.5px", color: "#A8A29E" } },
                      isFuture ? "这一天还没到呢，等那天再来看 TA 打卡吧～" : `${charName} 这一天还没有记录「${activeHabit.name}」`
                    ),
                !isFuture &&
                  h(
                    "button",
                    {
                      onClick: handleCheckinCharHabit,
                      disabled: isLoggingCharHabit,
                      style: {
                        width: "100%",
                        border: "none",
                        borderRadius: "10px",
                        padding: "10px",
                        background: isLoggingCharHabit ? "#C9B9AA" : "#292524",
                        color: "#FFFFFF",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: isLoggingCharHabit ? "not-allowed" : "pointer"
                      }
                    },
                    isLoggingCharHabit
                      ? `正在打探 ${charName} 当天战况…`
                      : existingLog
                      ? `重新打探 ${charName} 这一天`
                      : `看看 ${charName} 这一天打卡了吗`
                  )
              )
        )
      );
    };

    // 单日心情详情与编辑弹窗层
    const renderDateSheet = () => {
      if (!selectedDate) return null;
      const charEntry = selectedRecord?.charEntry;
      const charSticker = charEntry ? getStickerById(charEntry.moodId || charEntry.moodLabel) : null;

      return h(
        "div",
        {
          style: {
            position: "absolute",
            inset: 0,
            background: "rgba(28, 25, 23, 0.38)",
            display: "flex",
            alignItems: "flex-end",
            zIndex: 20
          },
          onClick: (e) => {
            if (e.target === e.currentTarget) setSelectedDate(null);
          }
        },
        h(
          "div",
          {
            style: {
              width: "100%",
              maxHeight: "82%",
              background: "#FFFFFF",
              borderTopLeftRadius: "22px",
              borderTopRightRadius: "22px",
              padding: "16px 18px 24px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              boxShadow: "0 -10px 30px rgba(0,0,0,0.12)"
            }
          },
          // 抽屉顶栏
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h(
              "div",
              { style: { fontSize: "15px", fontWeight: 700, color: "#292524" } },
              `${selectedDate}${selectedDate === todayStr ? " · 今天" : ""}`
            ),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "6px" } },
              (selectedRecord?.userEntry || selectedRecord?.charEntry) &&
                h(
                  "button",
                  {
                    onClick: handleCopyDayDiary,
                    style: {
                      border: "1px solid #E5E0D8",
                      background: copyDayNotice ? "#5E8C61" : "#FFFFFF",
                      color: copyDayNotice ? "#FFFFFF" : "#57534E",
                      borderRadius: "999px",
                      padding: "3px 9px",
                      fontSize: "11px",
                      cursor: "pointer"
                    }
                  },
                  copyDayNotice ? "✓ 已复制" : "复制"
                ),
              (selectedRecord?.userEntry || selectedRecord?.charEntry) &&
                h(
                  "button",
                  {
                    onClick: () => handleExportNodeAsPng(dayExportRef, `沧海一刻_${selectedDate}.png`),
                    disabled: isExportingImg,
                    style: {
                      border: "1px solid #E2B46D",
                      background: "#FFF8EB",
                      color: "#9A5B13",
                      borderRadius: "999px",
                      padding: "3px 9px",
                      fontSize: "11px",
                      cursor: isExportingImg ? "not-allowed" : "pointer"
                    }
                  },
                  isExportingImg ? "导出中…" : "存图"
                ),
              h(
                "button",
                {
                  onClick: () => setSelectedDate(null),
                  style: {
                    border: "none",
                    background: "#F3F4F6",
                    color: "#6B7280",
                    borderRadius: "999px",
                    width: "26px",
                    height: "26px",
                    cursor: "pointer"
                  }
                },
                "✕"
              )
            )
          ),

          errorMsg &&
            h(
              "div",
              {
                style: {
                  padding: "8px 12px",
                  borderRadius: "10px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#B91C1C",
                  fontSize: "12px"
                }
              },
              errorMsg
            ),

          // 模块 1：我的心情贴纸与短记
          h(
            "div",
            {
              style: {
                background: "#FAF9F7",
                border: "1px solid #EFECE6",
                borderRadius: "16px",
                padding: "14px"
              }
            },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", gap: "8px" } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px" } },
                h("span", { style: { fontSize: "12.5px", fontWeight: 700, color: "#44403C" } }, "我的心情"),
                selectedRecord?.userEntry?.clonedFromCharName &&
                  h(
                    "span",
                    {
                      title: `复刻自 ${selectedRecord.userEntry.clonedFromCharName}`,
                      style: { fontSize: "10.5px", color: "#9A5B13", background: "#FFF8EB", border: "1px solid #F1DFBE", borderRadius: "999px", padding: "1px 6px" }
                    },
                    `⧉ ${selectedRecord.userEntry.clonedFromCharName}`
                  )
              ),
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px" } },
                selectedHabitSummary.hasAny &&
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: handleInsertHabitSummary,
                      title: `引入当日习惯/经期打卡摘要：${selectedHabitSummary.summaryText}`,
                      style: {
                        border: "1px solid #D7E5D8",
                        background: "#F3F9F4",
                        color: "#4C7A50",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        fontSize: "11.5px",
                        cursor: "pointer"
                      }
                    },
                    "📌"
                  ),
                selectedCloneCandidates.length > 0 &&
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => setShowClonePicker((v) => !v),
                      title: `复刻当日在其他角色处写过的心情（共 ${selectedCloneCandidates.length} 条）`,
                      style: {
                        border: showClonePicker ? "1px solid #D99B43" : "1px solid #E2B46D",
                        background: showClonePicker ? "#FDECC8" : "#FFF8EB",
                        color: "#9A5B13",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        fontSize: "11.5px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px"
                      }
                    },
                    selectedCloneCandidates.length > 1 ? `⧉ ${selectedCloneCandidates.length}` : "⧉"
                  )
              )
            ),
            // 跨角色复刻选择条（简洁图标化）
            showClonePicker &&
              selectedCloneCandidates.length > 0 &&
              h(
                "div",
                {
                  style: {
                    marginBottom: "10px",
                    padding: "8px",
                    borderRadius: "12px",
                    background: "#FFFBF2",
                    border: "1px solid #F1DFBE",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px"
                  }
                },
                selectedCloneCandidates.map((cand) => {
                  const st = getStickerById(cand.moodId);
                  return h(
                    "div",
                    {
                      key: cand.key,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        background: "#FFFFFF",
                        border: "1px solid #EFECE6",
                        borderRadius: "10px",
                        padding: "6px 8px"
                      }
                    },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "7px", minWidth: 0, flex: 1 } },
                      st && h("img", { src: st.img, alt: st.label, style: { width: "22px", height: "22px", objectFit: "contain", flexShrink: 0 } }),
                      h(
                        "div",
                        { style: { minWidth: 0, flex: 1 } },
                        h(
                          "div",
                          { style: { fontSize: "11px", fontWeight: 700, color: "#78716C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
                          cand.sourceCharNames.join(" · ")
                        ),
                        h(
                          "div",
                          { style: { fontSize: "11.5px", color: "#292524", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
                          cand.text || st?.label || "仅贴纸"
                        )
                      )
                    ),
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 } },
                      h(
                        "button",
                        {
                          type: "button",
                          title: "填入草稿框微调",
                          onClick: () => applyCloneCandidate(cand, selectedDate, false),
                          style: { border: "1px solid #E5E0D8", background: "#FFFFFF", color: "#57534E", borderRadius: "8px", width: "26px", height: "26px", fontSize: "12px", cursor: "pointer", padding: 0 }
                        },
                        "✎"
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          title: "一键直接复刻保存",
                          onClick: () => applyCloneCandidate(cand, selectedDate, true),
                          style: { border: "none", background: "#D99B43", color: "#FFFFFF", borderRadius: "8px", width: "26px", height: "26px", fontSize: "12px", cursor: "pointer", padding: 0 }
                        },
                        "⚡"
                      )
                    )
                  );
                })
              ),
            cloneMentionWarning.length > 0 &&
              h(
                "div",
                {
                  style: {
                    marginBottom: "8px",
                    padding: "5px 9px",
                    borderRadius: "8px",
                    background: "#FEF3C7",
                    border: "1px solid #FDE68A",
                    color: "#92400E",
                    fontSize: "11.5px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }
                },
                h("span", null, `⚠️ 原文含「${cloneMentionWarning.join("、")}」`),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => setCloneMentionWarning([]),
                    style: { border: "none", background: "transparent", color: "#92400E", cursor: "pointer", fontSize: "11px" }
                  },
                  "✕"
                )
              ),
            h(
              "div",
              {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "8px",
                  marginBottom: "12px"
                }
              },
              MOOD_STICKERS.map((st) => {
                const active = draftMoodId === st.id;
                return h(
                  "div",
                  {
                    key: st.id,
                    onClick: () => setDraftMoodId(st.id),
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      padding: "6px 4px",
                      borderRadius: "12px",
                      cursor: "pointer",
                      background: active ? st.tint : "#FFFFFF",
                      border: active ? "1.5px solid #D99B43" : "1px solid #EFECE6"
                    }
                  },
                  h("img", {
                    src: st.img,
                    alt: st.label,
                    style: { width: "52px", height: "52px", objectFit: "contain", display: "block" }
                  }),
                  h("span", { style: { fontSize: "11px", color: active ? "#292524" : "#78716C" } }, st.label)
                );
              })
            ),
            h("textarea", {
              rows: 3,
              value: draftText,
              onChange: (e) => setDraftText(e.target.value),
              placeholder: "简单记下今天发生的小事或此刻的心情……",
              style: {
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #E7E3DC",
                borderRadius: "12px",
                padding: "10px 12px",
                fontSize: "13px",
                lineHeight: "1.6",
                color: "#292524",
                background: "#FFFFFF",
                resize: "none",
                outline: "none",
                marginBottom: "10px"
              }
            }),
            h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(
                "button",
                {
                  onClick: handleSaveUserMood,
                  style: {
                    flex: 1,
                    border: "none",
                    borderRadius: "10px",
                    padding: "9px 12px",
                    background: saveNotice ? "#5E8C61" : "#292524",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }
                },
                saveNotice ? "✓ 已保存" : "保存我的心情"
              ),
              !isFutureSelected &&
                h(
                  "button",
                  {
                    onClick: handleNudgeCharMood,
                    disabled: isNudging,
                    style: {
                      flex: 1,
                      border: "1px solid #E2B46D",
                      borderRadius: "10px",
                      padding: "9px 12px",
                      background: isNudging ? "#F3E6CE" : "#FFF8EB",
                      color: "#9A5B13",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isNudging ? "not-allowed" : "pointer"
                    }
                  },
                  isNudging ? `${charName} 提笔中…` : charEntry ? `让 ${charName} 重写` : `催促 ${charName} 写`
                )
            )
          ),

          // 模块 2：角色当天的心情日记展示（带导出引用）
          h(
            "div",
            {
              ref: dayExportRef,
              style: {
                background: "#FFFFFF",
                border: "1px solid #EFECE6",
                borderRadius: "16px",
                padding: "14px"
              }
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px"
                }
              },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "8px" } },
                charSticker &&
                  h("img", {
                    src: charSticker.img,
                    alt: charSticker.label,
                    style: { width: "36px", height: "36px", objectFit: "contain", display: "block" }
                  }),
                h("span", { style: { fontSize: "13px", fontWeight: 700, color: "#292524" } }, `${charName} 的心情`),
                charEntry?.shortTag &&
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: charSticker?.tint || "#F3F4F6",
                        color: "#57534E"
                      }
                    },
                    charEntry.shortTag
                  )
              ),
              charEntry &&
                h(
                  "span",
                  { style: { fontSize: "10.5px", color: "#A8A29E" } },
                  charEntry.usedSameDayChatCount > 0
                    ? `参考当天 ${charEntry.usedSameDayChatCount} 条传讯`
                    : "独立日常心境"
                )
            ),
            charEntry
              ? h(
                  "div",
                  null,
                  h(
                    "div",
                    {
                      style: {
                        fontSize: "13.5px",
                        lineHeight: "1.8",
                        color: "#3F3A36",
                        whiteSpace: "pre-wrap"
                      }
                    },
                    charEntry.text
                  ),
                  charEntry.whisperToUser &&
                    h(
                      "div",
                      {
                        style: {
                          marginTop: "10px",
                          padding: "8px 10px",
                          borderRadius: "10px",
                          background: "#FAF9F7",
                          fontSize: "12px",
                          color: "#78716C",
                          borderLeft: "2.5px solid #E2B46D"
                        }
                      },
                      `“${charEntry.whisperToUser}”`
                    )
                )
              : h(
                  "div",
                  {
                    style: {
                      padding: "16px 8px",
                      textAlign: "center",
                      fontSize: "12.5px",
                      color: "#A8A29E"
                    }
                  },
                  isFutureSelected
                    ? "这一天尚未到来，等那天到了再一起记录吧。"
                    : `${charName} 还没记下这一天的心情，点上方「催促 ${charName} 写」催催 TA 吧～`
                )
          )
        )
      );
    };

    // 月度心情罐统计页（双罐子 2D 物理坠落碰撞 + 点击摇一摇 + 小轮盘分布与默契同频天数）
    const renderStatsView = () => {
      const monthPrefix = `${moodYear}-${String(moodMonth + 1).padStart(2, "0")}-`;
      const userMoodIds = [];
      const charMoodIds = [];
      const userCounts = {};
      const charCounts = {};
      const bothCounts = {};
      let syncDays = 0;
      let coRecordedDays = 0;

      Object.keys(moodMap)
        .filter((d) => d.startsWith(monthPrefix))
        .sort()
        .forEach((d) => {
          const rec = moodMap[d];
          const uId = rec?.userEntry?.moodId;
          const cId = rec?.charEntry?.moodId;
          if (uId) {
            userMoodIds.push(uId);
            userCounts[uId] = (userCounts[uId] || 0) + 1;
            bothCounts[uId] = (bothCounts[uId] || 0) + 1;
          }
          if (cId) {
            charMoodIds.push(cId);
            charCounts[cId] = (charCounts[cId] || 0) + 1;
            bothCounts[cId] = (bothCounts[cId] || 0) + 1;
          }
          if (uId && cId) {
            coRecordedDays++;
            if (uId === cId) syncDays++;
          }
        });

      const activeCounts = wheelScope === "user" ? userCounts : wheelScope === "char" ? charCounts : bothCounts;
      const activeTotal =
        wheelScope === "user"
          ? userMoodIds.length
          : wheelScope === "char"
          ? charMoodIds.length
          : userMoodIds.length + charMoodIds.length;

      const handleShakeJars = () => {
        setJarShakeSignal((s) => s + 1);
        setShowWheelPanel(true);
      };

      return h(
        "div",
        {
          style: {
            flex: 1,
            overflowY: "auto",
            background: "#FAF9F7",
            padding: "14px 16px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }
        },
        // 顶部年月切换与返回
        h(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h(
              "button",
              {
                onClick: () => handleShiftMonth(-1),
                style: { border: "1px solid #EAEAEA", background: "#FFF", borderRadius: "8px", width: "26px", height: "26px", cursor: "pointer" }
              },
              "‹"
            ),
            h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#292524" } }, `${moodYear}年 ${moodMonth + 1}月 心情罐`),
            h(
              "button",
              {
                onClick: () => handleShiftMonth(1),
                style: { border: "1px solid #EAEAEA", background: "#FFF", borderRadius: "8px", width: "26px", height: "26px", cursor: "pointer" }
              },
              "›"
            )
          ),
          h(
            "button",
            {
              onClick: () => handleExportNodeAsPng(statsExportRef, `沧海一刻_心情罐_${moodYear}_${moodMonth + 1}.png`),
              disabled: isExportingImg,
              style: {
                border: "1px solid #E2B46D",
                background: "#FFF8EB",
                color: "#9A5B13",
                fontSize: "11.5px",
                borderRadius: "999px",
                padding: "4px 10px",
                cursor: isExportingImg ? "not-allowed" : "pointer"
              }
            },
            isExportingImg ? "导出中…" : "导出纪念图"
          )
        ),

        // 双罐子物理碰撞舞台（可整块导出 PNG）
        h(
          "div",
          {
            ref: statsExportRef,
            style: {
              background: "#FFFFFF",
              border: "1px solid #EFECE6",
              borderRadius: "18px",
              padding: "16px 10px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }
          },
          h(
            "div",
            { style: { textAlign: "center", fontSize: "12px", color: "#8C857B" } },
            "点击任意小罐子摇一摇，展开本月双人心情小轮盘 ✨"
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-around",
                alignItems: "flex-end",
                gap: "6px"
              }
            },
            h(MoodJarPhysics, {
              title: "我的心情罐",
              subtitle: `本月已装入 ${userMoodIds.length} 颗`,
              moodIds: userMoodIds,
              shakeSignal: jarShakeSignal,
              onJarClick: handleShakeJars
            }),
            h(MoodJarPhysics, {
              title: `${charName} 的心情罐`,
              subtitle: `本月已装入 ${charMoodIds.length} 颗`,
              moodIds: charMoodIds,
              shakeSignal: jarShakeSignal,
              onJarClick: handleShakeJars
            })
          ),

          // 默契同频天数条
          h(
            "div",
            {
              style: {
                margin: "4px 8px 0",
                padding: "10px 14px",
                borderRadius: "12px",
                background: "#FAF8F4",
                border: "1px solid #EFEAE0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "12px",
                color: "#57534E"
              }
            },
            h("span", null, `本月双人共记 ${coRecordedDays} 天`),
            h(
              "span",
              { style: { fontWeight: 700, color: "#B86B27" } },
              `默契同频 ${syncDays} 天`
            )
          ),

          // 摇一摇展开的小轮盘分布卡片
          showWheelPanel &&
            h(
              "div",
              {
                style: {
                  margin: "4px 6px 0",
                  padding: "14px",
                  borderRadius: "14px",
                  background: "#FFFFFF",
                  border: "1px solid #EFECE6",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }
              },
              h(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                h("span", { style: { fontSize: "13px", fontWeight: 700, color: "#292524" } }, "月度心情小轮盘"),
                h(
                  "div",
                  { style: { display: "inline-flex", background: "#F3F4F6", borderRadius: "999px", padding: "2px" } },
                  [
                    { id: "both", label: "双人" },
                    { id: "user", label: "我" },
                    { id: "char", label: charName }
                  ].map((sc) => {
                    const active = wheelScope === sc.id;
                    return h(
                      "button",
                      {
                        key: sc.id,
                        onClick: () => setWheelScope(sc.id),
                        style: {
                          border: "none",
                          borderRadius: "999px",
                          padding: "3px 9px",
                          fontSize: "11px",
                          fontWeight: active ? 600 : 400,
                          background: active ? "#FFFFFF" : "transparent",
                          color: active ? "#292524" : "#78716C",
                          cursor: "pointer"
                        }
                      },
                      sc.label
                    );
                  })
                )
              ),
              h(MoodWheelChart, {
                counts: activeCounts,
                total: activeTotal,
                centerLabel: wheelScope === "both" ? "双人总计" : wheelScope === "user" ? "我的记录" : `${charName}记录`
              })
            )
        )
      );
    };

    // 全屏顶部横幅提醒（当天心情日记或习惯打卡未记录时显示）
    const renderGlobalReminderBanner = () => {
      if (bannerDismissed) return null;
      const missingMood = !hasTodayUserEntry;
      const missingHabit = !hasTodayHabitLogged;
      if (!missingMood && !missingHabit) return null;

      const text =
        missingMood && missingHabit
          ? "今天的心情日记与习惯打卡还没记录哦～"
          : missingMood
          ? "今天的心情日记还没写，来贴一颗今日心情吧～"
          : "今天的习惯还没打卡，别忘了留下一笔记录～";

      return h(
        "div",
        {
          style: {
            position: "fixed",
            top: "12px",
            left: "12px",
            right: "12px",
            zIndex: 9999,
            background: "rgba(255, 253, 249, 0.96)",
            backdropFilter: "blur(10px)",
            border: "1px solid #EADBC2",
            borderRadius: "16px",
            padding: "10px 14px",
            boxShadow: "0 10px 28px rgba(44, 40, 37, 0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            animation: "momentBannerDrop 0.28s ease-out"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 } },
          h("span", { style: { fontSize: "16px", flexShrink: 0 } }, "🔔"),
          h(
            "div",
            { style: { fontSize: "12.5px", color: "#3F3A36", lineHeight: "1.4" } },
            h("strong", { style: { color: "#9A5B13", marginRight: "4px" } }, "沧海一刻"),
            text
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } },
          missingMood &&
            h(
              "button",
              {
                onClick: () => {
                  setShowStatsView(false);
                  setActiveTab("mood");
                  openDateSheet(todayStr);
                  setBannerDismissed(true);
                },
                style: {
                  border: "none",
                  borderRadius: "999px",
                  padding: "5px 10px",
                  background: "#F7CF86",
                  color: "#3F352B",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer"
                }
              },
              "记心情"
            ),
          missingHabit &&
            h(
              "button",
              {
                onClick: () => {
                  setShowStatsView(false);
                  setActiveTab("habit");
                  setHabitOwnerTab("user");
                  setBannerDismissed(true);
                },
                style: {
                  border: "1px solid #E2D9CC",
                  borderRadius: "999px",
                  padding: "5px 10px",
                  background: "#FFFFFF",
                  color: "#44403C",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  cursor: "pointer"
                }
              },
              "去打卡"
            ),
          h(
            "button",
            {
              onClick: () => setBannerDismissed(true),
              style: {
                border: "none",
                background: "transparent",
                color: "#A8A29E",
                fontSize: "13px",
                cursor: "pointer",
                padding: "2px 4px"
              }
            },
            "✕"
          )
        )
      );
    };

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 1050,
          background: "rgba(28, 25, 23, 0.45)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px"
        },
        onClick: (e) => {
          if (e.target === e.currentTarget) onClose();
        }
      },
      renderGlobalReminderBanner(),
      h(
        "div",
        {
          style: {
            width: "100%",
            maxWidth: "430px",
            height: "88vh",
            maxHeight: "780px",
            background: "#FFFFFF",
            borderRadius: "22px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.2)",
            border: "1px solid #EAEAEA"
          }
        },
        renderHeader(),
        showStatsView ? renderStatsView() : activeTab === "mood" ? renderMoodCalendar() : renderHabitCalendar(),
        renderDateSheet(),
        renderHabitDateSheet()
      )
    );
  };

  const MomentCalendarCloneHelpers = {
    findCrossCharMoodCandidates,
    detectSourceCharMention,
    buildClonedMoodRecord,
    buildDailyHabitSummary
  };

  global.MomentCalendarModal = MomentCalendarModal;
  global.MomentCalendarCloneHelpers = MomentCalendarCloneHelpers;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = MomentCalendarCloneHelpers;
  }
})(typeof window !== "undefined" ? window : globalThis);
