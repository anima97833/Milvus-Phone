/**
 * Milvus/chat_autonomy_p0_engine.js (v1.0)
 * 传讯私聊 · AI「活人感」P0 四大自主权力独立模块化引擎
 * - 零膨胀 app.min.js（仅需 2 处轻量埋点），严格仅在私聊生效，零干扰群聊
 * - 独立 IndexedDB（milvus_ai_autonomy_idb）保存按角色偏好开关，零新增 localStorage 配置键
 * - 四大 P0 能力：
 *   1. 精准引用回复：[引用:原文片段] → 三级模糊匹配最近 18 条聊天，直接挂载原生 msg.quote
 *   2. 自主记入日历：[记入日程:日期|时间|事项] → 自然中文日期推算，复用 TrajectoryCalendarBridge 幂等写入日历「未竟之事」
 *   3. 悄悄记入情侣愿望：[记入愿望:心愿内容] → 去重写入 t9_wishlist_<charId> 并输出克制不剧透彩蛋灰条
 *   4. 「撤回 + 改口」组合技：强化 Prompt 范式 + 自动给撤回后的改口句标记 _afterRecallDelayMs: 2400
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_CHAT_AUTONOMY_P0_LOADED__) return;
  global.__MILVUS_CHAT_AUTONOMY_P0_LOADED__ = true;

  const DB_NAME = "milvus_ai_autonomy_idb";
  const DB_VERSION = 1;
  const STORE_PREFS = "char_prefs";

  const DEFAULT_PREFS = {
    enableQuote: true,
    enableCalendarWrite: true,
    enableSecretWish: true,
    enableRecallCombo: true,
    enableProfileEdit: true,
    enableSilentTrace: true,
    enableTemperBoundary: false
  };

  let _dbPromise = null;
  const _prefsCache = new Map();

  function openDB() {
    if (_dbPromise) return _dbPromise;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_PREFS)) {
            db.createObjectStore(STORE_PREFS, { keyPath: "charId" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return _dbPromise;
  }

  function getPrefsSync(charId) {
    const key = String(charId || "");
    return { ...DEFAULT_PREFS, ...(_prefsCache.get(key) || {}) };
  }

  async function hydratePrefs(charId) {
    const key = String(charId || "");
    if (!key) return { ...DEFAULT_PREFS };
    const db = await openDB();
    if (!db) return getPrefsSync(key);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_PREFS], "readonly");
        const req = tx.objectStore(STORE_PREFS).get(key);
        req.onsuccess = () => {
          const val = req.result && req.result.prefs;
          if (val && typeof val === "object") {
            _prefsCache.set(key, { ...DEFAULT_PREFS, ...val });
          }
          resolve(getPrefsSync(key));
        };
        req.onerror = () => resolve(getPrefsSync(key));
      } catch (_) {
        resolve(getPrefsSync(key));
      }
    });
  }

  async function savePrefs(charId, patch) {
    const key = String(charId || "");
    if (!key) return { ...DEFAULT_PREFS };
    const next = { ...getPrefsSync(key), ...(patch || {}) };
    _prefsCache.set(key, next);
    const db = await openDB();
    if (!db) return next;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_PREFS], "readwrite");
        tx.objectStore(STORE_PREFS).put({ charId: key, prefs: next, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(next);
        tx.onerror = () => resolve(next);
      } catch (_) {
        resolve(next);
      }
    });
  }

  // ==========================================
  // 1. Prompt 指令块构建（克制触发原则）
  // ==========================================
  function buildPromptBlock(chatData) {
    const cid = chatData && chatData.id;
    const prefs = getPrefsSync(cid);
    const lines = [];

    if (prefs.enableQuote) {
      lines.push(
        "6. 精准引用回复：当对方连发多条消息或你想专门回应前文某一句时，可在该句开头加 [引用:原文的4~12字关键片段]（如：[引用:最近赶工好累] 怎又熬到这个时候？）。每轮最多用 2 次，不必每句都引。"
      );
    }
    if (prefs.enableCalendarWrite) {
      lines.push(
        "7. 日历全周期自主联动：\n" +
        "   - 新建约定：当你们明确约定了某天要做的事（或你答应替对方办某事），在句末附带 [记入日程:日期|时间|事项]（如：[记入日程:明天|申时|去城南买桂花糕送往绣衣楼]）。\n" +
        "   - 推进至「进行之事」：若日历中已有约定【已到点】且对方在聊天里明确同意开始/出发/正在做，在句末附带 [日程进行:事项关键词]，系统会自动移入日历「进行之事」。\n" +
        "   - 归档至「已毕之事」：若日历中已有约定【已到点】或正在进行，且对方在聊天里明确同意完成/确认办妥/赴约结束，在句末附带 [日程完成:事项关键词]，系统会自动归档至日历「已毕之事」。\n" +
        "   - 改期或取消：若对方商量改时间，附带 [日程改期:事项关键词|新日期|新时间]；若对方明确取消，附带 [日程取消:事项关键词]。\n" +
        "   - 铁律：推进/归档/改期/取消必须基于对方在对话中的明确同意或确认，严禁未经对方同意擅自勾掉约定！"
      );
      const calHint = buildActiveCalendarStatusHint(cid, new Date());
      if (calHint) {
        lines.push(calHint);
      }
    }
    if (prefs.enableSecretWish) {
      lines.push(
        "8. 悄悄记下心愿：当对方无意间流露出一个真诚的愿望或想一起做的事（如想去某地、想吃某物、想要某份陪伴），你可在句末悄悄附带 [记入愿望:简短心愿]（如：[记入愿望:带主公去看江南的雪]），系统会替你暗中存入情侣愿望清单，且不剧透。"
      );
    }
    if (prefs.enableRecallCombo) {
      lines.push(
        "9. 撤回+改口组合技：若某句真心话太直白、吃醋或说漏嘴，请把带 [撤回] 的那句话单独占一行，紧接着下一行补发一句自然的掩饰/改口（如第一行：其实我一直都在等你消息 [撤回]\\n第二行：……没什么，发错了）。仅在情绪到位时偶尔触发。"
      );
    }
    lines.push(
      "10. 主动赠送心意礼物：当对方喊饿、生病、疲惫、过节，或你想送出特产/点心/信物表达心意时，可在句末附带 [送礼:礼物名|附言]（如：[送礼:桂花糖蒸栗粉糕|方才路过东市买的，趁热吃]），系统会生成精致礼物卡片送达对方。"
    );
    lines.push(
      "11. 拟真语音条发声：当深夜哄睡、情绪浓烈、懒得打字或想让对方亲耳听见你语气时，可用 <语音>想亲口说的话</语音> 或 [语音:想亲口说的话] 发送真实语音条（单轮最多 2 条，日常对话仍以文字为主）。"
    );
    lines.push(
      "12. 构造状态卡片：当你想用一张精致视觉状态卡定格此刻心境、氛围或仪式感瞬间（如深夜听雨、品茗、馋嘴、警报、美好碎片），可在句末附带 [构造状态:简短状态描述]（如：[构造状态:窗外细雨微凉，案头温着一壶碧螺春]），单轮最多 1 张。"
    );
    lines.push(
      "13. 自主生图与手绘简笔画：当想给对方展示眼前风景、自拍、画作或随手涂鸦时，可在句末附带 [生成图片:详细英文或中文画面描述] 或 [简笔画:简短画面描述]（简笔画可离线秒出宣纸手绘卡）。"
    );

    return lines.length > 0 ? lines.join("\n") + "\n" : "";
  }

  // ==========================================
  // 2. 精准引用模糊匹配器
  // ==========================================
  function normalizeForMatch(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[\s，。！？、；：,.!?;:'"“”‘’「」『』（）()【】\[\]~…\-—]/g, "");
  }

  function bigramSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a.length < 2 || b.length < 2) return b.includes(a) ? 1 : 0;
    const gramsA = new Set();
    for (let i = 0; i < a.length - 1; i++) gramsA.add(a.slice(i, i + 2));
    let hit = 0;
    gramsA.forEach((g) => {
      if (b.includes(g)) hit += 1;
    });
    return hit / gramsA.size;
  }

  function resolveQuoteTarget(hint, recentMessages, charName, userName) {
    const rawHint = String(hint || "").trim();
    if (!rawHint || !Array.isArray(recentMessages) || recentMessages.length === 0) return null;

    const candidates = recentMessages
      .filter((m) => m && (!m.type || m.type === "text") && typeof (m.text || m.content) === "string" && (m.text || m.content).trim().length >= 2)
      .slice(-18)
      .reverse();

    if (candidates.length === 0) return null;

    // 优先查用户发出的消息，其次查角色消息
    const ordered = [
      ...candidates.filter((m) => m.isMe),
      ...candidates.filter((m) => !m.isMe)
    ];

    const normHint = normalizeForMatch(rawHint);

    // 1. 精确子串匹配
    for (const m of ordered) {
      const txt = String(m.text || m.content || "").trim();
      if (txt.includes(rawHint)) {
        return {
          sender: m.isMe ? (userName || "我") : (charName || "对方"),
          text: txt.slice(0, 60)
        };
      }
    }

    // 2. 去标点子串匹配
    if (normHint.length >= 2) {
      for (const m of ordered) {
        const txt = String(m.text || m.content || "").trim();
        const normTxt = normalizeForMatch(txt);
        if (normTxt.includes(normHint) || (normTxt.length >= 4 && normHint.includes(normTxt))) {
          return {
            sender: m.isMe ? (userName || "我") : (charName || "对方"),
            text: txt.slice(0, 60)
          };
        }
      }
    }

    // 3. 2-gram 重叠度匹配（>= 0.35）
    let best = null;
    let bestScore = 0;
    for (const m of ordered) {
      const txt = String(m.text || m.content || "").trim();
      const score = bigramSimilarity(normHint, normalizeForMatch(txt)) + (m.isMe ? 0.05 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    if (best && bestScore >= 0.38) {
      const txt = String(best.text || best.content || "").trim();
      return {
        sender: best.isMe ? (userName || "我") : (charName || "对方"),
        text: txt.slice(0, 60)
      };
    }

    return null;
  }

  // ==========================================
  // 3. 自然中文日期推算 + 幂等写入日历「未竟之事」
  // ==========================================
  function parseChineseRelativeDate(dateToken, nowDate) {
    const now = nowDate && typeof nowDate.getFullYear === "function" ? nowDate : new Date();
    const s = String(dateToken || "").trim();

    const makeDate = (offsetDays) => {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
      return {
        year: dt.getFullYear(),
        month: dt.getMonth() + 1,
        day: dt.getDate()
      };
    };

    const ymdMatch = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (ymdMatch) {
      return { year: Number(ymdMatch[1]), month: Number(ymdMatch[2]), day: Number(ymdMatch[3]) };
    }
    const mdMatch = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
    if (mdMatch) {
      return { year: now.getFullYear(), month: Number(mdMatch[1]), day: Number(mdMatch[2]) };
    }
    if (/大后天|大后日/.test(s)) return makeDate(3);
    if (/后天|后日/.test(s)) return makeDate(2);
    if (/明天|明日|明早|明晚|次日/.test(s)) return makeDate(1);
    if (/今天|今日|今晚|今夜|今早|稍后|待会/.test(s)) return makeDate(0);

    // 周几 / 下周几
    const wkMap = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };
    const wkMatch = s.match(/(下)?(?:周|星期)([一二三四五六日天])/);
    if (wkMatch) {
      const targetDow = wkMap[wkMatch[2]];
      const curDow = now.getDay();
      let diff = (targetDow - curDow + 7) % 7;
      if (wkMatch[1] || diff === 0) diff += 7;
      return makeDate(diff);
    }

    return makeDate(1); // 默认明日
  }

  function parseCalendarTagPayload(rawPayload, nowDate) {
    const raw = String(rawPayload || "").trim();
    if (!raw) return null;
    const parts = raw.split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
    let dateToken = "";
    let timeToken = "";
    let title = "";

    if (parts.length >= 3) {
      dateToken = parts[0];
      timeToken = parts[1];
      title = parts.slice(2).join(" ");
    } else if (parts.length === 2) {
      dateToken = parts[0];
      title = parts[1];
    } else {
      dateToken = raw;
      title = raw;
    }

    title = title.trim().slice(0, 40);
    if (!title) return null;
    const dateObj = parseChineseRelativeDate(dateToken, nowDate);
    return {
      ...dateObj,
      timeText: timeToken ? `${dateObj.day}日 ${timeToken}` : `${dateObj.day}日 待定`,
      title
    };
  }

  async function writeCalendarTaskFromChat({ charId, charName, parsed, nowDate }) {
    if (!parsed || !parsed.title || !charId) return { ok: false };

    const bridge = global.TrajectoryCalendarBridge;
    const loadTasks = async () => {
      if (bridge && typeof bridge.loadCalendarTasks === "function") {
        return bridge.loadCalendarTasks();
      }
      try {
        if (global.calendarStore && typeof global.calendarStore.getTasks === "function") {
          const res = await global.calendarStore.getTasks();
          if (res && typeof res === "object") return res;
        }
      } catch (_) {}
      try {
        const cached = global.localStorage && global.localStorage.getItem("cached_calendar_tasks");
        if (cached) return JSON.parse(cached);
      } catch (_) {}
      return { 已毕之事: [], 进行之事: [], 未竟之事: [] };
    };

    const saveTasks = async (nextTasks) => {
      if (bridge && typeof bridge.saveCalendarTasks === "function") {
        return bridge.saveCalendarTasks(nextTasks);
      }
      try {
        if (global.calendarStore && typeof global.calendarStore.saveTasks === "function") {
          await global.calendarStore.saveTasks(nextTasks);
        }
      } catch (_) {}
      try {
        if (global.localStorage && typeof global.localStorage.setItem === "function") {
          global.localStorage.setItem("cached_calendar_tasks", JSON.stringify(nextTasks));
        }
      } catch (_) {}
      try {
        if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
          global.dispatchEvent(new CustomEvent("calendar_tasks_updated", { detail: { ...nextTasks, _source: "chat_autonomy_p0" } }));
        }
      } catch (_) {}
    };

    const rawTasks = await loadTasks();
    const tasks = {
      已毕之事: Array.isArray(rawTasks["已毕之事"]) ? [...rawTasks["已毕之事"]] : [],
      进行之事: Array.isArray(rawTasks["进行之事"]) ? [...rawTasks["进行之事"]] : [],
      未竟之事: Array.isArray(rawTasks["未竟之事"]) ? [...rawTasks["未竟之事"]] : []
    };

    const normNewTitle = normalizeForMatch(parsed.title);
    const dupIdx = tasks["未竟之事"].findIndex(
      (t) =>
        t &&
        String(t.characterId) === String(charId) &&
        Number(t.year) === parsed.year &&
        Number(t.month) === parsed.month &&
        Number(t.day) === parsed.day &&
        (normalizeForMatch(t.title) === normNewTitle || normalizeForMatch(t.title).includes(normNewTitle))
    );

    const taskItem = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      title: parsed.title,
      subtitle: `传讯约定 · ${charName || "名士"}主动记下`,
      time: parsed.timeText,
      description: `在传讯私聊中与${charName || "名士"}约定的事项：${parsed.title}`,
      progress: 0,
      year: parsed.year,
      month: parsed.month,
      day: String(parsed.day),
      category: "未竟之事",
      characterId: charId,
      source: "chat_autonomy"
    };

    if (dupIdx !== -1) {
      tasks["未竟之事"][dupIdx] = { ...tasks["未竟之事"][dupIdx], ...taskItem, id: tasks["未竟之事"][dupIdx].id };
    } else {
      tasks["未竟之事"].unshift(taskItem);
    }

    await saveTasks(tasks);
    return { ok: true, duplicated: dupIdx !== -1, item: taskItem };
  }

  // ==========================================
  // 3.5 日历到点感知 & 全周期状态流转（进行之事 / 已毕之事 / 改期 / 取消）
  // ==========================================
  const SHICHEN_START_HOUR = {
    "子": 23, "丑": 1, "寅": 3, "卯": 5, "辰": 7, "巳": 9,
    "午": 11, "未": 13, "申": 15, "酉": 17, "戌": 19, "亥": 21
  };

  function parseTimeTextToHour(timeText) {
    const s = String(timeText || "").trim();
    if (!s) return null;
    // 1) 24小时制 HH:MM 或 HH点
    const hm = s.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
    if (hm) {
      let h = Number(hm[1]);
      if (/(下午|傍晚|晚上|晚间|夜里)/.test(s) && h >= 1 && h <= 11) h += 12;
      if (h >= 0 && h <= 23) return h + Number(hm[2]) / 60;
    }
    const cnH = s.match(/(清晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜里|深夜)?\s*(\d{1,2})\s*(?:点|时)/);
    if (cnH) {
      let h = Number(cnH[2]);
      const p = cnH[1] || "";
      if (/(下午|傍晚|晚上|晚间|夜里)/.test(p) && h >= 1 && h <= 11) h += 12;
      if (p === "中午" && h >= 1 && h <= 5) h += 12;
      if (h >= 0 && h <= 23) return h;
    }
    // 2) 十二时辰
    const sc = s.match(/([子丑寅卯辰巳午未申酉戌亥])时/);
    if (sc && typeof SHICHEN_START_HOUR[sc[1]] === "number") {
      return SHICHEN_START_HOUR[sc[1]];
    }
    // 3) 模糊时段
    if (/(清晨|早起|早上|晨间)/.test(s)) return 8;
    if (/(上午)/.test(s)) return 10;
    if (/(中午|午间|正午)/.test(s)) return 12;
    if (/(下午|午后)/.test(s)) return 14;
    if (/(傍晚|黄昏)/.test(s)) return 18;
    if (/(晚上|晚间|入夜|夜里)/.test(s)) return 20;
    if (/(深夜|半夜)/.test(s)) return 23;
    return null;
  }

  function evaluateTaskDueState(task, nowDate) {
    const now = nowDate && typeof nowDate.getFullYear === "function" ? nowDate : new Date();
    const ty = Number(task && task.year);
    const tm = Number(task && task.month);
    const td = Number(task && task.day);
    if (!ty || !tm || !td) return "today_upcoming";

    const todayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    const taskKey = ty * 10000 + tm * 100 + td;
    if (taskKey < todayKey) return "overdue";
    if (taskKey > todayKey) return "future";

    // 当天：比对小时
    const targetHour = parseTimeTextToHour(task && task.time);
    if (targetHour === null) return "due"; // 当天未标具体几点，视为当天可执行/到点
    const curHour = now.getHours() + now.getMinutes() / 60;
    // 子时特殊处理（23点起或凌晨0-1点）
    if (targetHour === 23 && curHour < 2) return "due";
    return curHour >= targetHour - 0.25 ? "due" : "today_upcoming";
  }

  function buildActiveCalendarStatusHint(charId, nowDate) {
    if (!charId) return "";
    try {
      const raw = global.localStorage && global.localStorage.getItem("cached_calendar_tasks");
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      const cid = String(charId);
      const ongoing = (Array.isArray(parsed["进行之事"]) ? parsed["进行之事"] : []).filter(
        (t) => t && String(t.characterId) === cid
      );
      const todo = (Array.isArray(parsed["未竟之事"]) ? parsed["未竟之事"] : []).filter(
        (t) => t && String(t.characterId) === cid
      );
      if (ongoing.length === 0 && todo.length === 0) return "";

      const now = nowDate && typeof nowDate.getFullYear === "function" ? nowDate : new Date();
      const items = [];
      ongoing.slice(0, 4).forEach((t) => {
        items.push(`- 【进行中】${t.title}（${t.month || ""}月${t.day || ""}日 ${t.time || ""}）→ 若对方确认完成可发 [日程完成:${t.title}]`);
      });
      todo.slice(0, 5).forEach((t) => {
        const due = evaluateTaskDueState(t, now);
        const tag = due === "overdue" || due === "due" ? "【已到点】" : due === "today_upcoming" ? "【今日待办】" : "【未来约定】";
        const tip = due === "overdue" || due === "due"
          ? ` → 已到点！若对方明确同意开始/完成，请附带 [日程进行:${t.title}] 或 [日程完成:${t.title}]`
          : "";
        items.push(`- ${tag}${t.title}（${t.month || ""}月${t.day || ""}日 ${t.time || ""}）${tip}`);
      });

      if (items.length === 0) return "";
      return `【当前与你关联的日历实时状态（仅供判断是否到点及是否需要联动归档）】\n${items.join("\n")}`;
    } catch (_) {
      return "";
    }
  }

  function matchCalendarTaskByKeyword(list, charId, keyword) {
    if (!Array.isArray(list) || list.length === 0) return -1;
    const cid = String(charId || "");
    const normKw = normalizeForMatch(keyword);
    const candidates = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!t) continue;
      if (cid && t.characterId !== undefined && t.characterId !== null && String(t.characterId) !== cid) {
        continue;
      }
      candidates.push({ idx: i, task: t, normTitle: normalizeForMatch(t.title || "") });
    }
    if (candidates.length === 0) return -1;

    // 1) 精确匹配
    if (normKw) {
      let hit = candidates.find((c) => c.normTitle === normKw);
      if (hit) return hit.idx;
      // 2) 包含匹配
      hit = candidates.find((c) => c.normTitle.includes(normKw) || normKw.includes(c.normTitle));
      if (hit) return hit.idx;
      // 3) 字符重合度 >= 45%
      let best = null;
      let bestScore = 0;
      for (const c of candidates) {
        if (!c.normTitle) continue;
        let overlap = 0;
        const set = new Set(c.normTitle.split(""));
        for (const ch of normKw) {
          if (set.has(ch)) overlap += 1;
        }
        const score = overlap / Math.max(1, Math.min(normKw.length, c.normTitle.length));
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best && bestScore >= 0.45) return best.idx;
    }

    // 4) 若该角色仅有 1 条活跃事项且关键词泛指（如“约定/日程/那件事”），兜底命中唯一项
    if (candidates.length === 1) return candidates[0].idx;
    return -1;
  }

  async function updateCalendarTaskStatusFromChat({
    charId,
    charName,
    action,
    keyword,
    newDateToken,
    newTimeToken,
    nowDate
  }) {
    if (!charId || !action) return { ok: false };

    const bridge = global.TrajectoryCalendarBridge;
    const loadTasks = async () => {
      if (bridge && typeof bridge.loadCalendarTasks === "function") {
        return bridge.loadCalendarTasks();
      }
      try {
        if (global.calendarStore && typeof global.calendarStore.getTasks === "function") {
          const res = await global.calendarStore.getTasks();
          if (res && typeof res === "object") return res;
        }
      } catch (_) {}
      try {
        const cached = global.localStorage && global.localStorage.getItem("cached_calendar_tasks");
        if (cached) return JSON.parse(cached);
      } catch (_) {}
      return { 已毕之事: [], 进行之事: [], 未竟之事: [] };
    };

    const saveTasks = async (nextTasks) => {
      if (bridge && typeof bridge.saveCalendarTasks === "function") {
        return bridge.saveCalendarTasks(nextTasks);
      }
      try {
        if (global.calendarStore && typeof global.calendarStore.saveTasks === "function") {
          await global.calendarStore.saveTasks(nextTasks);
        }
      } catch (_) {}
      try {
        if (global.localStorage && typeof global.localStorage.setItem === "function") {
          global.localStorage.setItem("cached_calendar_tasks", JSON.stringify(nextTasks));
        }
      } catch (_) {}
      try {
        if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
          global.dispatchEvent(new CustomEvent("calendar_tasks_updated", { detail: { ...nextTasks, _source: "chat_autonomy_p0" } }));
        }
      } catch (_) {}
    };

    const rawTasks = await loadTasks();
    const tasks = {
      已毕之事: Array.isArray(rawTasks["已毕之事"]) ? [...rawTasks["已毕之事"]] : [],
      进行之事: Array.isArray(rawTasks["进行之事"]) ? [...rawTasks["进行之事"]] : [],
      未竟之事: Array.isArray(rawTasks["未竟之事"]) ? [...rawTasks["未竟之事"]] : []
    };

    // 搜索顺序：若要归档完成，优先查「进行之事」再查「未竟之事」；若要推进进行，优先查「未竟之事」
    const searchOrder = action === "completed"
      ? ["进行之事", "未竟之事"]
      : ["未竟之事", "进行之事"];

    let foundBucket = null;
    let foundIdx = -1;
    for (const bucket of searchOrder) {
      const idx = matchCalendarTaskByKeyword(tasks[bucket], charId, keyword);
      if (idx !== -1) {
        foundBucket = bucket;
        foundIdx = idx;
        break;
      }
    }

    if (!foundBucket || foundIdx === -1) {
      return { ok: false, reason: "not_found" };
    }

    const [target] = tasks[foundBucket].splice(foundIdx, 1);
    const nowTs = Date.now();
    let updatedItem = { ...target, updatedAt: nowTs };

    if (action === "ongoing") {
      updatedItem = {
        ...updatedItem,
        category: "进行之事",
        progress: Math.max(50, Number(updatedItem.progress) || 50),
        subtitle: `传讯联动 · ${charName || "名士"}已同步为进行中`
      };
      tasks["进行之事"].unshift(updatedItem);
    } else if (action === "completed") {
      updatedItem = {
        ...updatedItem,
        category: "已毕之事",
        progress: 100,
        subtitle: `传讯联动 · ${charName || "名士"}已自动归档完成`
      };
      tasks["已毕之事"].unshift(updatedItem);
    } else if (action === "reschedule") {
      const dateObj = parseChineseRelativeDate(newDateToken || "明天", nowDate);
      const timeText = newTimeToken ? `${dateObj.day}日 ${newTimeToken}` : `${dateObj.day}日 待定`;
      updatedItem = {
        ...updatedItem,
        year: dateObj.year,
        month: dateObj.month,
        day: String(dateObj.day),
        time: timeText,
        category: "未竟之事",
        progress: 0,
        subtitle: `传讯联动 · 已改期至 ${dateObj.month}月${dateObj.day}日`
      };
      tasks["未竟之事"].unshift(updatedItem);
    } else if (action === "cancel") {
      // 已从原 bucket 移除，不再插回
    } else {
      tasks[foundBucket].splice(foundIdx, 0, target);
      return { ok: false, reason: "unknown_action" };
    }

    await saveTasks(tasks);
    return { ok: true, action, item: updatedItem, fromBucket: foundBucket };
  }

  // ==========================================
  // 4. 悄悄写入情侣愿望清单（去重 + 不剧透）
  // ==========================================
  function writeSecretWishFromChat({ charId, title }) {
    const cid = String(charId || "").trim();
    const cleanTitle = String(title || "").trim().slice(0, 60);
    if (!cid || !cleanTitle) return { ok: false };

    const key = `t9_wishlist_${cid}`;
    let list = [];
    try {
      const raw = global.localStorage && global.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      }
    } catch (_) {}

    const normNew = normalizeForMatch(cleanTitle);
    const exists = list.some(
      (w) =>
        w &&
        !w.completed &&
        w.title &&
        (normalizeForMatch(w.title) === normNew ||
          (normNew.length >= 4 && normalizeForMatch(w.title).includes(normNew)))
    );
    if (exists) {
      return { ok: true, duplicated: true };
    }

    const newWish = {
      id: `wish_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      creator: "char",
      completed: false,
      createdAt: Date.now(),
      source: "chat_autonomy_secret"
    };

    const next = [newWish, ...list].slice(0, 80);
    try {
      if (global.localStorage && typeof global.localStorage.setItem === "function") {
        global.localStorage.setItem(key, JSON.stringify(next));
      }
    } catch (_) {
      return { ok: false };
    }

    try {
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-wishlist-updated", { detail: { charId: cid, wish: newWish } }));
      }
    } catch (_) {}

    return { ok: true, duplicated: false, wish: newWish };
  }

  // ==========================================
  // 5. 私聊回复统一后处理入口（含单轮限流 + 0 源码泄露清洗）
  // ==========================================
  const RE_QUOTE = /[\[【]\s*(?:引用|回复)\s*[:：]\s*([^\]】]{1,80})[\]】]/g;
  const RE_CALENDAR = /[\[【]\s*(?:记入日程|加入日历|记入日历|添加日程)\s*[:：]\s*([^\]】]{2,120})[\]】]/g;
  const RE_CAL_ONGOING = /[\[【]\s*(?:日程进行|开始日程|推进日程|进行日程)\s*[:：]\s*([^\]】]{1,80})[\]】]/g;
  const RE_CAL_DONE = /[\[【]\s*(?:日程完成|完成日程|归档日程|日程已毕)\s*[:：]\s*([^\]】]{1,80})[\]】]/g;
  const RE_CAL_RESCHEDULE = /[\[【]\s*(?:日程改期|改期日程|顺延日程)\s*[:：]\s*([^\]】]{2,120})[\]】]/g;
  const RE_CAL_CANCEL = /[\[【]\s*(?:日程取消|取消日程|作废日程)\s*[:：]\s*([^\]】]{1,80})[\]】]/g;
  const RE_CAL_UPDATE = /[\[【]\s*(?:更新日程|日历更新)\s*[:：]\s*([^\]】]{2,120})[\]】]/g;
  const RE_WISH = /[\[【]\s*(?:记入愿望|悄悄记入愿望|许愿|加入愿望清单)\s*[:：]\s*([^\]】]{2,100})[\]】]/g;

  function processSoloReplyMessages(aiMsgs, ctx) {
    if (!Array.isArray(aiMsgs) || aiMsgs.length === 0) return aiMsgs;
    const chatData = (ctx && ctx.chatData) || {};
    const charId = chatData.id;
    const charName = chatData.name || (chatData.profile && chatData.profile.name) || "名士";
    const userName = (ctx && ctx.userName) || "我";
    const recentMessages = (ctx && ctx.recentMessages) || [];
    const nowTime = (ctx && ctx.nowTime) || new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const nowDate = (ctx && ctx.nowDate) || new Date();
    const prefs = getPrefsSync(charId);

    let quoteCount = 0;
    let calCount = 0;
    let calTransitionCount = 0;
    let wishCount = 0;
    let prevWasRecall = false;

    const output = [];
    const systemNotes = [];
    const spawnedGiftCards = [];
    const spawnedVoiceMsgs = [];
    const spawnedConstructCards = [];
    const spawnedSketchCards = [];
    // 严格单调递增的数字 ID（IndexedDB 按主键排序时字符串会排在所有数字之后导致顺序错乱）
    let maxExistingId = Date.now();
    for (let k = 0; k < aiMsgs.length; k++) {
      const idNum = Number(aiMsgs[k] && aiMsgs[k].id);
      if (Number.isFinite(idNum) && idNum > maxExistingId) maxExistingId = idNum;
    }
    const allocNumericId = () => {
      maxExistingId += 1;
      return maxExistingId;
    };
    const RE_GIFT = /[\[【]\s*送礼物?\s*[:：]\s*([^\]】]+)[\]】]/g;
    const RE_VOICE_XML = /<语音>([\s\S]{1,260}?)<\/语音>/g;
    const RE_VOICE_TAG = /[\[【]\s*(?:语音|语音条|发语音)\s*[:：]\s*([^\]】]{1,260})[\]】]/g;
    const RE_CONSTRUCT = /[\[【]\s*(?:构造状态|状态卡|构造卡片|构造|状态)\s*[:：]\s*([^\]】]{2,120})[\]】]/g;
    const RE_SKETCH_FALLBACK = /[\[【]\s*(?:简笔画|手绘|草图|线稿)\s*[:：]\s*([^\]】]{2,160})[\]】]/g;
    let giftCount = 0;
    let voiceCount = 0;
    let constructCount = 0;
    let sketchCount = 0;

    const escapeXml = (str) =>
      String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const buildOfflineSketchSvgUrl = (desc) => {
      const safeTitle = escapeXml(String(desc || "随手一笔").slice(0, 26));
      const safeSigner = escapeXml(String(charName || "名士").slice(0, 12));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="360" viewBox="0 0 520 360">
        <defs>
          <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fbf7ee"/>
            <stop offset="100%" stop-color="#f1e7d3"/>
          </linearGradient>
        </defs>
        <rect width="520" height="360" rx="18" fill="url(#paper)" stroke="#d8c7aa" stroke-width="3"/>
        <rect x="16" y="16" width="488" height="328" rx="12" fill="none" stroke="#c7b290" stroke-width="1.2" stroke-dasharray="6 5"/>
        <path d="M88 215 Q160 115 245 190 T425 170" fill="none" stroke="#3c3329" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="385" cy="98" r="24" fill="#d96b52" opacity="0.22"/>
        <circle cx="385" cy="98" r="14" fill="none" stroke="#a64332" stroke-width="1.8"/>
        <path d="M120 250 Q260 225 400 248" fill="none" stroke="#6f5d47" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
        <text x="40" y="64" font-family="serif" font-size="16" fill="#8b7355" letter-spacing="3">手绘简笔画 · 随笔</text>
        <text x="260" y="294" text-anchor="middle" font-family="serif" font-size="20" font-weight="bold" fill="#3a2f25">「${safeTitle}」</text>
        <text x="470" y="328" text-anchor="end" font-family="serif" font-size="13" fill="#8c7559">—— ${safeSigner} 随手涂鸦</text>
      </svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    };

    const buildConstructCardHtml = (desc) => {
      if (global.constructBubbleEngine && typeof global.constructBubbleEngine.generateFallbackCard === "function") {
        const rawHtml = global.constructBubbleEngine.generateFallbackCard(desc);
        const clean = typeof global.constructBubbleEngine.sanitizeHtml === "function"
          ? global.constructBubbleEngine.sanitizeHtml(rawHtml)
          : rawHtml;
        return `<div class="construct-card-enter">${clean}</div>`;
      }
      const safe = escapeXml(desc);
      return `<div class="construct-card-enter"><div class="bg-white/95 rounded-2xl p-4 shadow-md border border-stone-200 min-w-[230px] max-w-[290px]"><div class="text-xs font-bold text-amber-700 mb-1">✦ 此刻状态</div><div class="text-sm text-stone-800 leading-relaxed">“${safe}”</div></div></div>`;
    };

    const pushVoiceBubble = (rawVoiceText) => {
      const cleanVoice = String(rawVoiceText || "").trim().slice(0, 240);
      if (!cleanVoice || voiceCount >= 2) return;
      voiceCount += 1;
      const duration = Math.max(2, Math.min(60, Math.round(cleanVoice.length / 3.5)));
      spawnedVoiceMsgs.push({
        id: allocNumericId(),
        type: "voice",
        isMe: false,
        text: cleanVoice,
        content: cleanVoice,
        duration,
        showText: false,
        time: nowTime
      });
    };

    for (let i = 0; i < aiMsgs.length; i++) {
      const m = aiMsgs[i];
      if (!m || typeof m.text !== "string") {
        output.push(m);
        prevWasRecall = false;
        continue;
      }

      let txt = m.text;
      let attachedQuote = m.quote || null;

      // 0) [送礼:礼物名|附言] 或 [送礼物:礼物名|附言|来源]（单轮上限 1 份）
      txt = txt.replace(RE_GIFT, (_, rawPayload) => {
        if (giftCount < 1) {
          const parts = String(rawPayload || "").split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
          const itemName = (parts[0] || "").slice(0, 32);
          if (itemName) {
            giftCount += 1;
            const blessing = (parts[1] || "见字如面，特赠此物").slice(0, 80);
            const merchant = (parts[2] || `${charName}私藏`).slice(0, 24);
            spawnedGiftCards.push({
              id: allocNumericId(),
              type: "gift_card",
              isMe: false,
              time: nowTime,
              text: `[赠送心意礼物] ${itemName}：${blessing}`,
              content: {
                itemName,
                merchant,
                price: "心意无价",
                blessing,
                senderName: charName
              }
            });
          }
        }
        return "";
      });

      // 0.1) <语音>...</语音> 与 [语音:...]（拟真语音条，单轮上限 2 条；同时兜底无方括号的“语音:xxx”）
      txt = txt.replace(RE_VOICE_XML, (_, body) => {
        pushVoiceBubble(body);
        return "";
      });
      txt = txt.replace(RE_VOICE_TAG, (_, body) => {
        pushVoiceBubble(body);
        return "";
      });
      const bareVoiceMatch = txt.trim().match(/^(?:语音|语音条|发语音)\s*[:：]\s*([\s\S]{1,260})$/);
      if (bareVoiceMatch && bareVoiceMatch[1]) {
        pushVoiceBubble(bareVoiceMatch[1]);
        txt = "";
      }

      // 0.2) [构造状态:状态描述] / [状态卡:...]（拟物状态卡片，单轮上限 1 张；同时兜底无方括号的“构造状态:xxx”）
      const pushConstructCard = (rawDesc) => {
        const desc = String(rawDesc || "").trim().slice(0, 100);
        if (desc && constructCount < 1) {
          constructCount += 1;
          spawnedConstructCards.push({
            id: allocNumericId(),
            type: "construct_card",
            isMe: false,
            isLoading: false,
            text: `[状态] ${desc}`,
            prompt: desc,
            html: buildConstructCardHtml(desc),
            time: nowTime
          });
        }
      };
      txt = txt.replace(RE_CONSTRUCT, (_, rawDesc) => {
        pushConstructCard(rawDesc);
        return "";
      });
      const bareConstructMatch = txt.trim().match(/^(?:构造状态|状态卡|构造卡片)\s*[:：]\s*([\s\S]{2,120})$/);
      if (bareConstructMatch && bareConstructMatch[1]) {
        pushConstructCard(bareConstructMatch[1]);
        txt = "";
      }

      // 0.3) 离线兜底简笔画 [简笔画:描述]（若前置生图未消耗该标签，则秒出本地宣纸简笔画 SVG）
      txt = txt.replace(RE_SKETCH_FALLBACK, (_, rawDesc) => {
        const desc = String(rawDesc || "").trim().slice(0, 120);
        if (desc && sketchCount < 1) {
          sketchCount += 1;
          spawnedSketchCards.push({
            id: allocNumericId(),
            type: "image",
            isMe: false,
            text: `简笔画：${desc}`,
            content: buildOfflineSketchSvgUrl(desc),
            time: nowTime
          });
        }
        return "";
      });

      // 1) [引用:原文片段]（单轮上限 2 次）
      txt = txt.replace(RE_QUOTE, (_, hint) => {
        if (prefs.enableQuote && quoteCount < 2 && !attachedQuote) {
          const matched = resolveQuoteTarget(hint, recentMessages, charName, userName);
          if (matched) {
            attachedQuote = matched;
            quoteCount += 1;
          }
        }
        return "";
      });

      // 2) [记入日程:日期|时间|事项]（单轮上限 2 条）
      txt = txt.replace(RE_CALENDAR, (_, rawPayload) => {
        if (prefs.enableCalendarWrite && calCount < 2) {
          const parsed = parseCalendarTagPayload(rawPayload, nowDate);
          if (parsed) {
            calCount += 1;
            writeCalendarTaskFromChat({ charId, charName, parsed, nowDate }).catch(() => {});
            systemNotes.push({
              id: allocNumericId(),
              type: "narration",
              tap: true,
              text: `${charName}已将「${parsed.title}」记入日历 · 未竟之事`,
              isMe: false,
              time: nowTime
            });
          }
        }
        return "";
      });

      // 2.5) 日历自主状态流转：[日程进行:关键词] / [日程完成:关键词] / [日程改期:关键词|新日期|新时间] / [日程取消:关键词] / [更新日程:关键词|状态]
      const triggerCalTransition = (action, keyword, newDateToken, newTimeToken) => {
        const kw = String(keyword || "").trim().slice(0, 40);
        if (!prefs.enableCalendarWrite || !kw || calTransitionCount >= 2) return;
        calTransitionCount += 1;
        updateCalendarTaskStatusFromChat({
          charId,
          charName,
          action,
          keyword: kw,
          newDateToken,
          newTimeToken,
          nowDate
        }).catch(() => {});
        const labelMap = {
          ongoing: `「${kw}」已同步至日历 · 进行之事`,
          completed: `「${kw}」已自动归档至日历 · 已毕之事`,
          reschedule: `「${kw}」已改期至 ${newDateToken || "择日"}${newTimeToken ? " " + newTimeToken : ""}`,
          cancel: `「${kw}」已从日历取消`
        };
        if (labelMap[action]) {
          systemNotes.push({
            id: allocNumericId(),
            type: "narration",
            tap: true,
            text: labelMap[action],
            isMe: false,
            time: nowTime
          });
        }
      };

      txt = txt.replace(RE_CAL_ONGOING, (_, kw) => {
        triggerCalTransition("ongoing", kw);
        return "";
      });
      txt = txt.replace(RE_CAL_DONE, (_, kw) => {
        triggerCalTransition("completed", kw);
        return "";
      });
      txt = txt.replace(RE_CAL_RESCHEDULE, (_, raw) => {
        const parts = String(raw || "").split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          triggerCalTransition("reschedule", parts[0], parts[1], parts[2] || "");
        }
        return "";
      });
      txt = txt.replace(RE_CAL_CANCEL, (_, kw) => {
        triggerCalTransition("cancel", kw);
        return "";
      });
      txt = txt.replace(RE_CAL_UPDATE, (_, raw) => {
        const parts = String(raw || "").split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const st = parts[1];
          if (/(进行|开始|正在)/.test(st)) triggerCalTransition("ongoing", parts[0]);
          else if (/(完成|已毕|归档|结束)/.test(st)) triggerCalTransition("completed", parts[0]);
          else if (/(取消|作废|删除)/.test(st)) triggerCalTransition("cancel", parts[0]);
          else if (/(改期|推迟|顺延)/.test(st)) triggerCalTransition("reschedule", parts[0], parts[2] || "明天", parts[3] || "");
        }
        return "";
      });

      // 3) [记入愿望:心愿内容]（单轮上限 1 条，不剧透内容）
      txt = txt.replace(RE_WISH, (_, rawTitle) => {
        if (prefs.enableSecretWish && wishCount < 1) {
          const res = writeSecretWishFromChat({ charId, title: rawTitle });
          if (res && res.ok && !res.duplicated) {
            wishCount += 1;
            systemNotes.push({
              id: allocNumericId(),
              type: "narration",
              tap: true,
              text: `${charName}似乎悄悄记下了一个心愿`,
              isMe: false,
              time: nowTime
            });
          }
        }
        return "";
      });

      txt = txt.trim();
      const isRecallMsg = typeof m.id === "string" && m.id.startsWith("ai-recall-");

      if (txt) {
        const nextMsg = { ...m, text: txt };
        if (attachedQuote) nextMsg.quote = attachedQuote;
        // 4) 撤回 + 改口组合技：若上一条是自动撤回消息，给紧随的改口句标记延迟
        if (prefs.enableRecallCombo && prevWasRecall && !isRecallMsg) {
          nextMsg._afterRecallDelayMs = 2400;
        }
        output.push(nextMsg);
      }

      prevWasRecall = isRecallMsg;
    }

    // 取出本轮 MCP 工具（send_red_packet / send_gift）排队生成的卡片，直接合入实时消息流
    if (charId && global && global.__MILVUS_MCP_PENDING_CARDS__) {
      const key = String(charId);
      const pending = global.__MILVUS_MCP_PENDING_CARDS__[key];
      if (Array.isArray(pending) && pending.length > 0) {
        delete global.__MILVUS_MCP_PENDING_CARDS__[key];
        pending.forEach((card) => {
          if (card && !output.some((m) => m && m.id === card.id)) {
            output.push(card);
          }
        });
      }
    }

    spawnedVoiceMsgs.forEach((v) => output.push(v));
    spawnedConstructCards.forEach((c) => output.push(c));
    spawnedSketchCards.forEach((s) => output.push(s));
    spawnedGiftCards.forEach((g) => output.push(g));
    systemNotes.forEach((n) => output.push(n));
    return output;
  }

  const api = {
    DEFAULT_PREFS,
    getPrefsSync,
    hydratePrefs,
    savePrefs,
    buildPromptBlock,
    resolveQuoteTarget,
    parseChineseRelativeDate,
    parseCalendarTagPayload,
    parseTimeTextToHour,
    evaluateTaskDueState,
    writeCalendarTaskFromChat,
    updateCalendarTaskStatusFromChat,
    writeSecretWishFromChat,
    processSoloReplyMessages
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.ChatAutonomyP0Engine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
