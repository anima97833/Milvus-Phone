/**
 * Milvus/diary_archive_app.js
 * 传讯 · 竹简日记「过往日子日历 + 七维记忆聚合」独立模块化引擎（P0）
 * - 复用 IndexedDB STORES.DIARY 按日期独立归档（id: diary_day_${charKey}_${dateStr}），绝不覆盖旧日记
 * - 七维当日聚合：角色6维配置 + 身份配置库 + 开启世界书 + 严格当日传讯 + 日历当日已毕之事 + 情侣空间当日心情日记 + 情侣空间当日账本
 * - 严格守则：当日未聊天严禁编造传讯对话，纯写活人感日常；当日有聊天则参考传讯并兼顾活人感日常
 */
(function (global) {
  "use strict";

  const WEEKDAYS_MON = ["一", "二", "三", "四", "五", "六", "日"];

  function formatDateStr(d) {
    const dt = d || new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getTodayStr() {
    return formatDateStr(new Date());
  }

  function formatDisplayDateTitle(dateStr) {
    const p = String(dateStr || "").split("-").map(Number);
    if (p.length === 3 && !p.some(isNaN)) {
      return `${p[0]}年 ${p[1]}月 ${p[2]}日`;
    }
    const n = new Date();
    return `${n.getFullYear()}年 ${n.getMonth() + 1}月 ${n.getDate()}日`;
  }

  function getCharStorageKey(character, characterName) {
    return String(character?.id || characterName || "default").trim();
  }

  // ==========================================
  // 1. 按日归档存储层（复用 STORES.DIARY + localStorage 兜底）
  // ==========================================
  const diaryArchiveStore = {
    _lsKey: (charKey) => `milvus_diary_archive_v1_${charKey}`,

    saveDayDiary: async (charKey, dateStr, entry) => {
      const id = `diary_day_${charKey}_${dateStr}`;
      const record = {
        id,
        kind: "dated_diary",
        charKey: String(charKey),
        dateStr,
        content: entry,
        updatedAt: Date.now()
      };
      try {
        if (typeof global.openDB === "function" && global.STORES?.DIARY) {
          const db = await global.openDB();
          await new Promise((resolve, reject) => {
            const tx = db.transaction(global.STORES.DIARY, "readwrite");
            const req = tx.objectStore(global.STORES.DIARY).put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject("save failed");
          });
        }
      } catch (e) {}
      try {
        const map = JSON.parse(localStorage.getItem(diaryArchiveStore._lsKey(charKey)) || "{}");
        map[dateStr] = record;
        localStorage.setItem(diaryArchiveStore._lsKey(charKey), JSON.stringify(map));
      } catch (e) {}
      return record;
    },

    getAllDiariesByChar: async (charKey) => {
      const map = {};
      try {
        const ls = JSON.parse(localStorage.getItem(diaryArchiveStore._lsKey(charKey)) || "{}");
        Object.keys(ls || {}).forEach((d) => {
          if (ls[d]?.content) map[d] = ls[d];
        });
      } catch (e) {}
      try {
        if (typeof global.openDB === "function" && global.STORES?.DIARY) {
          const db = await global.openDB();
          const all = await new Promise((resolve) => {
            const tx = db.transaction(global.STORES.DIARY, "readonly");
            const req = tx.objectStore(global.STORES.DIARY).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          });
          const prefix = `diary_day_${charKey}_`;
          (all || []).forEach((rec) => {
            if (rec && String(rec.id || "").startsWith(prefix) && rec.dateStr && rec.content) {
              map[rec.dateStr] = rec;
            }
          });
        }
      } catch (e) {}
      return map;
    },

    deleteDayDiary: async (charKey, dateStr) => {
      const id = `diary_day_${charKey}_${dateStr}`;
      try {
        if (typeof global.openDB === "function" && global.STORES?.DIARY) {
          const db = await global.openDB();
          await new Promise((resolve) => {
            const tx = db.transaction(global.STORES.DIARY, "readwrite");
            const req = tx.objectStore(global.STORES.DIARY).delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
          });
        }
      } catch (e) {}
      try {
        const map = JSON.parse(localStorage.getItem(diaryArchiveStore._lsKey(charKey)) || "{}");
        if (map && map[dateStr]) {
          delete map[dateStr];
          localStorage.setItem(diaryArchiveStore._lsKey(charKey), JSON.stringify(map));
        }
      } catch (e) {}
      return true;
    }
  };

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

  function formatDiaryForCopy(characterName, dateStr, record) {
    const title = record?.title || formatDisplayDateTitle(dateStr);
    const body = (record?.paragraphs || []).join("\n\n");
    return `【${characterName || "名士"} · ${title}】\n\n${body}`;
  }

  // ==========================================
  // 2. 七维当日记忆聚合引擎
  // ==========================================
  function getActiveUserPersona() {
    try {
      const personas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      let active = activeId ? personas.find((p) => String(p.id) === String(activeId)) : null;
      if (!active && personas.length > 0) active = personas[0];
      if (active) {
        return {
          name: active.name || "广陵王",
          identity: active.identity || active.occupation || "广陵王 / 绣衣楼主",
          personality: active.personality || "果敢敏锐",
          background: active.background || active.bio || ""
        };
      }
    } catch (e) {}
    return { name: "广陵王", identity: "广陵王 / 绣衣楼主", personality: "果敢敏锐", background: "" };
  }

  async function resolveFullCharacter(character, characterName) {
    let full = character || { name: characterName || "名士" };
    try {
      let list = [];
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        list = await global.chatCharacterStore.getAll();
      } else {
        list = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      }
      const matched = (list || []).find(
        (c) =>
          c &&
          ((character?.id && String(c.id) === String(character.id)) ||
            (characterName && c.name === characterName))
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
      name: full.name || p.name || characterName || "名士",
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
    if (typeof msg.timestamp === "string") {
      if (/^\d{13}$/.test(msg.timestamp)) return Number(msg.timestamp);
      const parsedTs = Date.parse(msg.timestamp);
      if (!isNaN(parsedTs) && parsedTs > 1500000000000) return parsedTs;
    }
    if (typeof msg.createdAt === "number" && msg.createdAt > 1500000000000) return msg.createdAt;
    if (typeof msg.createdAt === "string") {
      const parsedCreated = Date.parse(msg.createdAt);
      if (!isNaN(parsedCreated) && parsedCreated > 1500000000000) return parsedCreated;
    }
    const numId = Number(msg.id);
    if (!isNaN(numId) && numId > 1500000000000 && numId < 3000000000000) return numId;
    if (typeof msg.id === "string") {
      const m13 = msg.id.match(/(1[5-9]\d{11}|2\d{12})/);
      if (m13) return Number(m13[1]);
    }
    if (msg.date && !isNaN(Date.parse(msg.date))) return Date.parse(msg.date);
    return null;
  }

  function isSameCalendarDate(raw, targetDateStr) {
    if (!raw || !targetDateStr) return false;
    const [ty, tm, td] = targetDateStr.split("-").map(Number);
    if (typeof raw === "number" && raw > 1500000000000) {
      return formatDateStr(new Date(raw)) === targetDateStr;
    }
    const s = String(raw).trim();
    const ymd = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (ymd) {
      return Number(ymd[1]) === ty && Number(ymd[2]) === tm && Number(ymd[3]) === td;
    }
    const md = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (md) {
      return Number(md[1]) === tm && Number(md[2]) === td;
    }
    return false;
  }

  async function fetchSameDayChat(charRawId, charId, charName, userName, targetDateStr, liveMessages) {
    const parts = targetDateStr.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN) || (!charId && !Array.isArray(liveMessages))) {
      return { hasChatOnDay: false, count: 0, text: "" };
    }
    const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
    const dayEnd = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();

    const extractMsgs = (res) => {
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.messages)) return res.messages;
      return [];
    };

    // 兼容 IndexedDB 键类型（Number vs String）
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

    // 合并当前聊天窗口内存中的最新消息（防尚未落盘的刚发消息漏读），按 id 去重
    if (Array.isArray(liveMessages) && liveMessages.length > 0) {
      const seen = new Set(rawList.map((m) => String(m?.id ?? "")));
      liveMessages.forEach((m) => {
        const key = String(m?.id ?? "");
        if (!key || !seen.has(key)) {
          rawList.push(m);
          if (key) seen.add(key);
        }
      });
    }

    const sameDay = rawList
      .map((m) => ({ msg: m, t: resolveStrictMsgTimestamp(m) }))
      .filter((item) => item.t !== null && item.t >= dayStart && item.t <= dayEnd)
      .sort((a, b) => a.t - b.t)
      .map((item) => {
        const m = item.msg;
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

    if (sameDay.length === 0) return { hasChatOnDay: false, count: 0, text: "" };

    const recent = sameDay.slice(-25);
    const lines = [];
    let total = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      const line = `[${recent[i].speaker}]：${recent[i].text}`;
      if (total + line.length > 1800 && lines.length > 0) break;
      lines.unshift(line);
      total += line.length + 1;
    }
    return { hasChatOnDay: lines.length > 0, count: lines.length, text: lines.join("\n") };
  }

  async function fetchSameDayCompletedCalendarTasks(charId, targetDateStr) {
    if (!charId) return [];
    const [ty, tm, td] = targetDateStr.split("-").map(Number);
    let doneList = [];
    try {
      if (global.calendarStore && typeof global.calendarStore.getTasks === "function") {
        const loaded = await global.calendarStore.getTasks();
        doneList = (loaded && loaded["已毕之事"]) || [];
      }
    } catch (e) {}
    if (doneList.length === 0) {
      try {
        const cached = JSON.parse(localStorage.getItem("cached_calendar_tasks") || "{}");
        doneList = cached["已毕之事"] || [];
      } catch (e) {}
    }

    return (doneList || [])
      .filter((t) => {
        if (!t || String(t.characterId) !== String(charId)) return false;
        if (t.date && isSameCalendarDate(t.date, targetDateStr)) return true;
        if (t.time && isSameCalendarDate(t.time, targetDateStr)) return true;
        const y = Number(t.year) || ty;
        const m = Number(t.month) || tm;
        const dVal = t.day
          ? parseInt(String(t.day), 10)
          : String(t.time || "").match(/(\d{1,2})\s*日/)
          ? parseInt(String(t.time).match(/(\d{1,2})\s*日/)[1], 10)
          : NaN;
        if (!isNaN(dVal)) return y === ty && m === tm && dVal === td;
        return false;
      })
      .slice(0, 6);
  }

  async function fetchSameDayCoupleMood(charId, targetDateStr) {
    if (!charId || !global.momentCalendarStore || typeof global.momentCalendarStore.getMoodsByChar !== "function") {
      return null;
    }
    try {
      const list = await global.momentCalendarStore.getMoodsByChar(charId);
      return (list || []).find((r) => r && r.date === targetDateStr) || null;
    } catch (e) {
      return null;
    }
  }

  function fetchSameDayCoupleBills(charId, targetDateStr) {
    if (!charId) return [];
    try {
      const raw = localStorage.getItem(`t9_bills_${charId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const all = [
        ...(Array.isArray(parsed.userBills) ? parsed.userBills.map((b) => ({ ...b, _owner: "用户" })) : []),
        ...(Array.isArray(parsed.taBills) ? parsed.taBills.map((b) => ({ ...b, _owner: "角色" })) : [])
      ];
      return all
        .filter((b) => b && (isSameCalendarDate(b.date, targetDateStr) || isSameCalendarDate(b.timestamp, targetDateStr) || isSameCalendarDate(b.id, targetDateStr)))
        .slice(0, 8);
    } catch (e) {
      return [];
    }
  }

  // ==========================================
  // 3. 七维活人感日记生成引擎
  // ==========================================
  async function generateDatedCharacterDiary({ character, characterName, dateStr, liveMessages }) {
    if (typeof global.sendToLLM !== "function") {
      throw new Error("未配置 API，请先前往「设置 → API 配置中心」配置");
    }
    const targetDate = dateStr || getTodayStr();
    const charInfo = await resolveFullCharacter(character, characterName);
    const userInfo = getActiveUserPersona();

    let worldContext = "未开启特定世界书，可按角色原有背景自然展开。";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldContext = wb;
      }
    } catch (e) {}

    const [chatSnap, doneTasks, moodRec, bills] = await Promise.all([
      fetchSameDayChat(charInfo.rawId, charInfo.id, charInfo.name, userInfo.name, targetDate, liveMessages),
      fetchSameDayCompletedCalendarTasks(charInfo.id, targetDate),
      fetchSameDayCoupleMood(charInfo.id, targetDate),
      Promise.resolve(fetchSameDayCoupleBills(charInfo.id, targetDate))
    ]);

    const memoryBadges = [];
    if (chatSnap.hasChatOnDay) memoryBadges.push(`当日传讯 ${chatSnap.count} 条`);
    else memoryBadges.push("当日无聊·独立日常");
    if (doneTasks.length > 0) memoryBadges.push(`已毕之事 ${doneTasks.length} 项`);
    if (moodRec && (moodRec.charEntry || moodRec.userEntry)) memoryBadges.push("情侣空间心情");
    if (bills.length > 0) memoryBadges.push(`情侣账本 ${bills.length} 笔`);

    const optionalBlocks = [];
    if (doneTasks.length > 0) {
      const lines = doneTasks.map((t) => {
        const note = t.nudgeResult?.reflection ? `（心得：${t.nudgeResult.reflection.slice(0, 50)}）` : t.description ? `（${String(t.description).slice(0, 40)}）` : "";
        return `- ${t.title}${t.time ? ` [${t.time}]` : ""}${note}`;
      });
      optionalBlocks.push(`【维度五·你自己在日历上当日的「已毕之事」】\n${lines.join("\n")}`);
    }
    if (moodRec && (moodRec.charEntry || moodRec.userEntry)) {
      const parts = [];
      if (moodRec.charEntry) parts.push(`你当日心情：${moodRec.charEntry.moodLabel || ""}（${moodRec.charEntry.text || ""}）`);
      if (moodRec.userEntry) parts.push(`${userInfo.name}当日心情：${moodRec.userEntry.moodLabel || ""}（${moodRec.userEntry.text || ""}）`);
      optionalBlocks.push(`【维度六·情侣空间「沧海一刻」当日心情日记】\n${parts.join("\n")}`);
    }
    if (bills.length > 0) {
      const bLines = bills.map((b) => {
        const dir = b.type === "income" ? "收入" : "支出";
        return `- [${b._owner}${dir}] ${b.title || b.category || "记账"}：${b.amount || 0}${b.note ? `（${b.note}）` : ""}`;
      });
      optionalBlocks.push(`【维度七·情侣空间账本当日账目】\n${bLines.join("\n")}`);
    }

    const chatBlock = chatSnap.hasChatOnDay
      ? `【维度四·${targetDate} 当日传讯聊天记录（共 ${chatSnap.count} 条）】
${chatSnap.text}
（守则：请自然融入今天聊天带给你的真实情绪与细节，切忌像会议纪要般复述；同时**必须**写出你自己这一天经历的活人感日常琐事！）`
      : `【维度四·${targetDate} 当日传讯记录（无聊天）】
【绝对守则】你在 ${targetDate} 当天与【${userInfo.name}】在传讯中**没有任何聊天记录**！严禁编造或提及“今天在传讯里聊了什么”“收到对方消息”等内容。请完全写出你自己这一天的活人感个人日常（吃喝、琐事、见闻、烦恼、小确幸或独处心事）。`;

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】，正在私人竹简日记本上写下 ${targetDate} 这一天的日记。

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

${chatBlock}
${optionalBlocks.length > 0 ? "\n" + optionalBlocks.join("\n\n") : ""}

【写作铁律】
1. 严禁“亲爱的日记”“今天又是充实的一天”“希望明天会更好”等 AI 模板套话！
2. 保持高度活人感与私密手记质感，严格贴合你的语言风格、MBTI 与星座。
3. 字数控制在 220~380 字，分 2~3 个自然段，直接输出日记正文，不要添加日期标题或任何前缀。`;

    const raw = await new Promise((resolve, reject) => {
      global.sendToLLM(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: `请以【${charInfo.name}】的身份，写下 ${formatDisplayDateTitle(targetDate)} 这一天的私人日记正文。` }
        ],
        { disableMCP: true },
        (reply) => resolve(reply),
        (err) => reject(new Error(typeof err === "string" ? err : err?.message || "生成日记失败"))
      );
    });

    const paragraphs = String(raw || "")
      .replace(/^```[a-z]*|```$/gi, "")
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const entry = {
      dateStr: targetDate,
      title: formatDisplayDateTitle(targetDate),
      paragraphs: paragraphs.length > 0 ? paragraphs : ["今日无甚大事，且记一笔。"],
      memoryBadges
    };

    const charKey = getCharStorageKey(charInfo, characterName);
    await diaryArchiveStore.saveDayDiary(charKey, targetDate, entry);

    // 若是今天，同时兼容同步到旧键 diary_${characterName}
    if (targetDate === getTodayStr() && typeof global.openDB === "function" && global.STORES?.DIARY) {
      try {
        const db = await global.openDB();
        const tx = db.transaction(global.STORES.DIARY, "readwrite");
        tx.objectStore(global.STORES.DIARY).put({
          id: `diary_${charInfo.name}`,
          characterName: charInfo.name,
          content: entry,
          updatedAt: Date.now()
        });
      } catch (e) {}
    }

    return entry;
  }

  // ==========================================
  // 4. 过往日子日历弹窗组件（P1：含本月日记目录 + 一键复制/删除）
  // ==========================================
  const DiaryCalendarPickerModal = ({
    isOpen,
    onClose,
    character,
    characterName,
    activeDateStr,
    onSelectDate,
    onDeleteDate,
    onGenerateForDate,
    isGenerating
  }) => {
    const h = React.createElement;
    const todayStr = getTodayStr();
    const now = new Date();

    const [viewYear, setViewYear] = React.useState(now.getFullYear());
    const [viewMonth, setViewMonth] = React.useState(now.getMonth());
    const [archiveMap, setArchiveMap] = React.useState({});
    const [pickedDate, setPickedDate] = React.useState(activeDateStr || todayStr);
    const [copiedKey, setCopiedKey] = React.useState("");

    const charKey = getCharStorageKey(character, characterName);

    const reloadArchive = async () => {
      const map = await diaryArchiveStore.getAllDiariesByChar(charKey);
      setArchiveMap(map || {});
    };

    React.useEffect(() => {
      if (!isOpen) return;
      const target = activeDateStr || todayStr;
      setPickedDate(target);
      const parts = String(target).split("-").map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        setViewYear(parts[0]);
        setViewMonth(parts[1] - 1);
      }
      reloadArchive();
    }, [isOpen, charKey, activeDateStr]);

    if (!isOpen) return null;

    const firstDay = new Date(viewYear, viewMonth, 1);
    const jsDow = firstDay.getDay();
    const leadingBlanks = jsDow === 0 ? 6 : jsDow - 1;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        dateStr: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      });
    }

    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
    const monthEntries = Object.keys(archiveMap || {})
      .filter((ds) => ds.startsWith(monthPrefix) && archiveMap[ds]?.content)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((ds) => ({ dateStr: ds, record: archiveMap[ds].content }));

    const pickedRecord = archiveMap[pickedDate]?.content || null;
    const isPickedFuture = pickedDate > todayStr;

    const handleCopy = async (ds, rec, keyTag) => {
      if (!rec) return;
      const ok = await copyPlainText(formatDiaryForCopy(characterName, ds, rec));
      if (ok) {
        setCopiedKey(keyTag);
        setTimeout(() => setCopiedKey((prev) => (prev === keyTag ? "" : prev)), 1800);
      }
    };

    const handleDelete = async (ds) => {
      if (!ds) return;
      if (!window.confirm(`确定要删除 ${formatDisplayDateTitle(ds)} 的竹简日记吗？删除后可随时重新撰写。`)) return;
      await diaryArchiveStore.deleteDayDiary(charKey, ds);
      await reloadArchive();
      if (typeof onDeleteDate === "function") onDeleteDate(ds);
    };

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 13000,
          background: "rgba(38, 31, 22, 0.52)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
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
            maxWidth: "396px",
            maxHeight: "86vh",
            background: "#FAF5E8",
            borderRadius: "20px",
            border: "1px solid #DECFA9",
            boxShadow: "0 20px 50px rgba(0,0,0,0.28)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }
        },
        // 顶栏
        h(
          "div",
          {
            style: {
              padding: "13px 16px",
              borderBottom: "1px solid #E7D9B8",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#F5ECD6"
            }
          },
          h("span", { style: { fontSize: "14.5px", fontWeight: 700, color: "#4A3C2C" } }, `📅 ${characterName || "名士"} · 往日日记册`),
          h(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: { border: "none", background: "rgba(90,79,63,0.12)", color: "#4A3C2C", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" }
            },
            "✕"
          )
        ),

        // 月历与选中日面板 + 本月目录
        h(
          "div",
          { style: { flex: 1, overflowY: "auto", padding: "14px 16px 18px", display: "flex", flexDirection: "column", gap: "12px" } },
          // 年月切换
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "8px" } },
              h(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    const d = new Date(viewYear, viewMonth - 1, 1);
                    setViewYear(d.getFullYear());
                    setViewMonth(d.getMonth());
                  },
                  style: { border: "1px solid #DFCFA9", background: "#FFFDF7", borderRadius: "8px", width: "26px", height: "26px", cursor: "pointer", color: "#5A4F3F" }
                },
                "‹"
              ),
              h("span", { style: { fontSize: "14px", fontWeight: 700, color: "#4A3C2C" } }, `${viewYear}年 ${viewMonth + 1}月`),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    const d = new Date(viewYear, viewMonth + 1, 1);
                    setViewYear(d.getFullYear());
                    setViewMonth(d.getMonth());
                  },
                  style: { border: "1px solid #DFCFA9", background: "#FFFDF7", borderRadius: "8px", width: "26px", height: "26px", cursor: "pointer", color: "#5A4F3F" }
                },
                "›"
              )
            ),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "8px" } },
              h(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    const n = new Date();
                    setViewYear(n.getFullYear());
                    setViewMonth(n.getMonth());
                    setPickedDate(todayStr);
                  },
                  style: {
                    border: "1px solid #DFCFA9",
                    background: "#FFFDF7",
                    color: "#7A5B36",
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    cursor: "pointer"
                  }
                },
                "今"
              ),
              h("span", { style: { fontSize: "11px", color: "#8A775D" } }, "红点 = 已存")
            )
          ),

          // 周表头
          h(
            "div",
            { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", fontSize: "11px", color: "#9C8A70" } },
            WEEKDAYS_MON.map((w) => h("div", { key: w }, w))
          ),

          // 日期网格
          h(
            "div",
            { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: "6px", columnGap: "4px" } },
            cells.map((cell, idx) => {
              if (!cell) return h("div", { key: "b_" + idx });
              const isFuture = cell.dateStr > todayStr;
              const isSelected = cell.dateStr === pickedDate;
              const hasDiary = Boolean(archiveMap[cell.dateStr]);
              const isToday = cell.dateStr === todayStr;
              return h(
                "div",
                {
                  key: cell.dateStr,
                  onClick: () => {
                    if (!isFuture) setPickedDate(cell.dateStr);
                  },
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "36px",
                    borderRadius: "10px",
                    cursor: isFuture ? "not-allowed" : "pointer",
                    opacity: isFuture ? 0.35 : 1,
                    background: isSelected ? "#8A5A30" : isToday ? "rgba(184,93,67,0.12)" : "transparent",
                    color: isSelected ? "#FFFDF7" : "#4A3C2C",
                    fontWeight: isSelected || isToday ? 700 : 500,
                    fontSize: "12.5px",
                    position: "relative"
                  }
                },
                h("span", null, cell.day),
                hasDiary &&
                  h("span", {
                    style: {
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: isSelected ? "#FDE68A" : "#B85D43",
                      marginTop: "2px"
                    }
                  })
              );
            })
          ),

          // 选中日操作卡片
          h(
            "div",
            {
              style: {
                background: "#FFFDF7",
                border: "1px solid #E5D6B5",
                borderRadius: "14px",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" } },
              h("span", { style: { fontSize: "13px", fontWeight: 700, color: "#4A3C2C" } }, formatDisplayDateTitle(pickedDate)),
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "6px" } },
                pickedRecord &&
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => handleCopy(pickedDate, pickedRecord, "picked_" + pickedDate),
                      style: {
                        border: "1px solid #E0D0AE",
                        background: copiedKey === "picked_" + pickedDate ? "#E9F5EC" : "#FAF5E8",
                        color: copiedKey === "picked_" + pickedDate ? "#2E6B50" : "#6B573D",
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    copiedKey === "picked_" + pickedDate ? "已复制 ✓" : "复制"
                  ),
                pickedRecord &&
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => handleDelete(pickedDate),
                      style: {
                        border: "1px solid #E8C5BE",
                        background: "#FDF2F0",
                        color: "#A84434",
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    "删除"
                  ),
                h(
                  "span",
                  { style: { fontSize: "11px", color: pickedRecord ? "#2E6B50" : "#9C8A70", fontWeight: 600 } },
                  pickedRecord ? "已有日记" : "尚未落笔"
                )
              )
            ),
            pickedRecord &&
              Array.isArray(pickedRecord.memoryBadges) &&
              pickedRecord.memoryBadges.length > 0 &&
              h(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "5px" } },
                pickedRecord.memoryBadges.map((b, i) =>
                  h(
                    "span",
                    {
                      key: i,
                      style: {
                        fontSize: "10px",
                        padding: "2px 7px",
                        borderRadius: "999px",
                        background: "#F5ECD6",
                        color: "#7A5B36"
                      }
                    },
                    b
                  )
                )
              ),
            pickedRecord &&
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "#6B5D4D",
                    lineHeight: "1.6",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden"
                  }
                },
                (pickedRecord.paragraphs || []).join(" ")
              ),
            !isPickedFuture &&
              h(
                "div",
                { style: { display: "flex", gap: "8px", marginTop: "2px" } },
                pickedRecord &&
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        onSelectDate(pickedDate, pickedRecord);
                        onClose();
                      },
                      style: {
                        flex: 1,
                        border: "none",
                        borderRadius: "10px",
                        padding: "8px 10px",
                        background: "#8A5A30",
                        color: "#FFFFFF",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        cursor: "pointer"
                      }
                    },
                    "展卷阅读"
                  ),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: isGenerating,
                    onClick: async () => {
                      await onGenerateForDate(pickedDate);
                      await reloadArchive();
                      onClose();
                    },
                    style: {
                      flex: 1,
                      border: pickedRecord ? "1px solid #D9C49B" : "none",
                      borderRadius: "10px",
                      padding: "8px 10px",
                      background: isGenerating ? "#C9B9AA" : pickedRecord ? "#FAF5E8" : "#8A5A30",
                      color: pickedRecord ? "#5A4F3F" : "#FFFFFF",
                      fontSize: "12.5px",
                      fontWeight: 700,
                      cursor: isGenerating ? "not-allowed" : "pointer"
                    }
                  },
                  isGenerating ? "正在撰写…" : pickedRecord ? "重撰该日" : "✨ 补写这一天日记"
                )
              )
          ),

          // P1：本月日记目录（倒序速览）
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "2px" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h(
                "span",
                { style: { fontSize: "12.5px", fontWeight: 700, color: "#5A4A35" } },
                `📖 ${viewMonth + 1}月日记目录（${monthEntries.length} 篇）`
              ),
              monthEntries.length > 0 &&
                h("span", { style: { fontSize: "11px", color: "#9C8A70" } }, "点击即展卷")
            ),
            monthEntries.length === 0
              ? h(
                  "div",
                  {
                    style: {
                      padding: "12px",
                      borderRadius: "12px",
                      background: "rgba(255,253,247,0.7)",
                      border: "1px dashed #DFCFA9",
                      textAlign: "center",
                      fontSize: "12px",
                      color: "#9C8A70"
                    }
                  },
                  "本月尚未留墨，点选上方任意过往日期即可补写"
                )
              : monthEntries.map((item) => {
                  const isCurrent = item.dateStr === pickedDate;
                  const copyTag = "list_" + item.dateStr;
                  return h(
                    "div",
                    {
                      key: item.dateStr,
                      onClick: () => {
                        onSelectDate(item.dateStr, item.record);
                        onClose();
                      },
                      style: {
                        background: isCurrent ? "#F6EBD2" : "#FFFDF7",
                        border: isCurrent ? "1px solid #C8A26B" : "1px solid #EAE0C8",
                        borderRadius: "12px",
                        padding: "10px 12px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "5px"
                      }
                    },
                    h(
                      "div",
                      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" } },
                      h(
                        "span",
                        { style: { fontSize: "12.5px", fontWeight: 700, color: "#4A3C2C" } },
                        formatDisplayDateTitle(item.dateStr)
                      ),
                      h(
                        "div",
                        {
                          style: { display: "flex", alignItems: "center", gap: "5px" },
                          onClick: (e) => e.stopPropagation()
                        },
                        h(
                          "button",
                          {
                            type: "button",
                            onClick: () => handleCopy(item.dateStr, item.record, copyTag),
                            style: {
                              border: "1px solid #E2D3B3",
                              background: copiedKey === copyTag ? "#E9F5EC" : "#FAF5E8",
                              color: copiedKey === copyTag ? "#2E6B50" : "#7A5B36",
                              fontSize: "10.5px",
                              padding: "1px 7px",
                              borderRadius: "999px",
                              cursor: "pointer"
                            }
                          },
                          copiedKey === copyTag ? "已复制" : "复制"
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            onClick: () => handleDelete(item.dateStr),
                            style: {
                              border: "1px solid #ECCAC3",
                              background: "#FDF2F0",
                              color: "#A84434",
                              fontSize: "10.5px",
                              padding: "1px 7px",
                              borderRadius: "999px",
                              cursor: "pointer"
                            }
                          },
                          "删"
                        )
                      )
                    ),
                    Array.isArray(item.record.memoryBadges) &&
                      item.record.memoryBadges.length > 0 &&
                      h(
                        "div",
                        { style: { display: "flex", flexWrap: "wrap", gap: "4px" } },
                        item.record.memoryBadges.map((b, bi) =>
                          h(
                            "span",
                            {
                              key: bi,
                              style: {
                                fontSize: "10px",
                                padding: "1px 6px",
                                borderRadius: "999px",
                                background: "#F3E8CE",
                                color: "#7A5B36"
                              }
                            },
                            b
                          )
                        )
                      ),
                    h(
                      "div",
                      {
                        style: {
                          fontSize: "11.5px",
                          color: "#6B5D4D",
                          lineHeight: "1.55",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden"
                        }
                      },
                      (item.record.paragraphs || []).join(" ")
                    )
                  );
                })
          )
        )
      )
    );
  };

  // ==========================================
  // 5. 竹简页顶栏记忆来源微标条 + 一键复制（P1：可折叠防遮挡）
  // ==========================================
  const DiaryMemoryBadgesBar = ({ characterName, dateStr, content }) => {
    const h = React.createElement;
    const [expanded, setExpanded] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const badges = Array.isArray(content?.memoryBadges) ? content.memoryBadges : [];
    const hasParagraphs = Array.isArray(content?.paragraphs) && content.paragraphs.length > 0;
    if (badges.length === 0 && !hasParagraphs) return null;

    return h(
      "div",
      {
        style: {
          position: "relative",
          width: "100%",
          padding: "0 4px 4px 4px",
          boxSizing: "border-box",
          fontFamily: "system-ui, -apple-system, sans-serif",
          zIndex: 95,
          flexShrink: 0
        }
      },
      // 极简折叠触发条（默认收起，仅占约 22px 高度，绝不挤压竹简）
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px"
          }
        },
        h(
          "button",
          {
            type: "button",
            onClick: () => setExpanded((v) => !v),
            style: {
              border: "1px solid rgba(138, 114, 80, 0.25)",
              background: "rgba(255, 252, 245, 0.6)",
              color: "#6E4B26",
              fontSize: "10.5px",
              padding: "2px 8px",
              borderRadius: "999px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              lineHeight: 1.4
            }
          },
          h("span", { style: { fontSize: "9px", display: "inline-block", transition: "transform 0.15s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" } }, "▼"),
          h("span", null, badges.length > 0 ? `记忆线索 (${badges.length})` : "日记工具")
        ),
        !expanded &&
          hasParagraphs &&
          h(
            "button",
            {
              type: "button",
              onClick: async () => {
                const ok = await copyPlainText(formatDiaryForCopy(characterName, dateStr, content));
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }
              },
              style: {
                border: "1px solid rgba(138, 114, 80, 0.25)",
                background: copied ? "rgba(46, 107, 80, 0.14)" : "rgba(255, 252, 245, 0.6)",
                color: copied ? "#2E6B50" : "#5A4F3F",
                fontSize: "10.5px",
                padding: "2px 8px",
                borderRadius: "999px",
                cursor: "pointer",
                lineHeight: 1.4
              }
            },
            copied ? "已复制 ✓" : "复制"
          )
      ),
      // 展开时以浮层卡片呈现，不向下挤压竹简正文
      expanded &&
        h(
          "div",
          {
            style: {
              position: "absolute",
              top: "26px",
              left: "4px",
              right: "4px",
              background: "rgba(250, 245, 232, 0.96)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(196, 174, 134, 0.7)",
              borderRadius: "12px",
              padding: "8px 10px",
              boxShadow: "0 8px 22px rgba(58, 42, 24, 0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              zIndex: 110
            }
          },
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "5px", flex: 1, minWidth: 0 } },
            badges.length > 0
              ? badges.map((b, idx) =>
                  h(
                    "span",
                    {
                      key: idx,
                      style: {
                        fontSize: "10.5px",
                        padding: "2px 7px",
                        borderRadius: "999px",
                        background: "rgba(138, 90, 48, 0.1)",
                        border: "1px solid rgba(138, 90, 48, 0.2)",
                        color: "#6E4B26",
                        whiteSpace: "nowrap"
                      }
                    },
                    b
                  )
                )
              : h("span", { style: { fontSize: "11px", color: "#8A775D" } }, "暂无记忆线索标签")
          ),
          hasParagraphs &&
            h(
              "button",
              {
                type: "button",
                onClick: async () => {
                  const ok = await copyPlainText(formatDiaryForCopy(characterName, dateStr, content));
                  if (ok) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }
                },
                style: {
                  border: "1px solid rgba(138, 114, 80, 0.3)",
                  background: copied ? "rgba(46, 107, 80, 0.14)" : "#FFFDF7",
                  color: copied ? "#2E6B50" : "#5A4F3F",
                  fontSize: "11px",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  cursor: "pointer",
                  flexShrink: 0
                }
              },
              copied ? "已复制 ✓" : "复制正文"
            )
        )
    );
  };

  global.diaryArchiveStore = diaryArchiveStore;
  global.generateDatedCharacterDiary = generateDatedCharacterDiary;
  global.DiaryCalendarPickerModal = DiaryCalendarPickerModal;
  global.DiaryMemoryBadgesBar = DiaryMemoryBadgesBar;
})(typeof window !== "undefined" ? window : globalThis);
