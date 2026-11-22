/**
 * Milvus/calendar_enhance_app.js
 * 日历增强独立模块化引擎（P0）
 * - 功能 A：我的日程「未竟之事」顶部横幅提醒（当日 T-0 + 提前 1 天 T-1 + 用户可开关）
 * - 功能 B：角色日历「未竟之事」到期催促与操办/推脱回执卡片（注入角色6维配置 + 用户身份库 + 开启世界书）
 */
(function (global) {
  "use strict";

  const BANNER_ENABLE_KEY = "calendar_top_banner_enabled";
  const BANNER_DISMISSED_KEY = "calendar_top_banner_dismissed_v1";

  function getCalendarBannerEnabled() {
    try {
      const v = localStorage.getItem(BANNER_ENABLE_KEY);
      return v === null ? true : v === "1" || v === "true";
    } catch (e) {
      return true;
    }
  }

  function setCalendarBannerEnabled(enabled) {
    try {
      localStorage.setItem(BANNER_ENABLE_KEY, enabled ? "1" : "0");
    } catch (e) {}
    if (!enabled) {
      removeTopBannerDom();
    } else {
      scanAndShowTopBanner();
    }
  }

  function getTodayKey(now) {
    const d = now || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // 统一解析日历任务距离今天的天数差（0=今日，1=明日，<0=已逾期，>1=未来，null=无明确日期）
  function resolveCalendarTaskDayDiff(task, nowObj, fallbackYear, fallbackMonth) {
    if (!task) return null;
    const now = nowObj || new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();

    if (task.repeatType === "daily") return 0;
    if (task.repeatType === "weekly") {
      const targetWd = task.repeatWeekday !== undefined && task.repeatWeekday !== null ? Number(task.repeatWeekday) : now.getDay();
      const diffWd = (targetWd - now.getDay() + 7) % 7;
      return diffWd;
    }

    if (task.date && /^\d{4}-\d{1,2}-\d{1,2}$/.test(String(task.date).trim())) {
      const p = String(task.date).trim().split("-").map(Number);
      const tMid = new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).getTime();
      return Math.round((tMid - todayMid) / 86400000);
    }

    const timeStr = String(task.time || "");
    if (/今日|今天/.test(timeStr) && !task.day) return 0;

    const fullDateMatch = timeStr.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (fullDateMatch) {
      const tMid = new Date(Number(fullDateMatch[1]), Number(fullDateMatch[2]) - 1, Number(fullDateMatch[3]), 0, 0, 0, 0).getTime();
      return Math.round((tMid - todayMid) / 86400000);
    }

    const mdMatch = timeStr.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (mdMatch) {
      const y = Number(task.year) || fallbackYear || now.getFullYear();
      const tMid = new Date(y, Number(mdMatch[1]) - 1, Number(mdMatch[2]), 0, 0, 0, 0).getTime();
      return Math.round((tMid - todayMid) / 86400000);
    }

    const dayVal = task.day
      ? parseInt(String(task.day).trim(), 10)
      : timeStr.match(/(\d{1,2})\s*日/)
      ? parseInt(timeStr.match(/(\d{1,2})\s*日/)[1], 10)
      : NaN;

    if (!isNaN(dayVal) && dayVal >= 1 && dayVal <= 31) {
      const y = Number(task.year) || fallbackYear || now.getFullYear();
      const m = Number(task.month) || (fallbackMonth !== undefined ? fallbackMonth + 1 : now.getMonth() + 1);
      const tMid = new Date(y, m - 1, dayVal, 0, 0, 0, 0).getTime();
      return Math.round((tMid - todayMid) / 86400000);
    }

    return null;
  }

  // ==========================================
  // 功能 A：我的日程「未竟之事」屏幕顶部横幅提醒守护（T-0 & T-1）
  // ==========================================
  let _activeBannerItems = [];
  let _activeBannerIdx = 0;

  function readDismissedMap() {
    try {
      return JSON.parse(localStorage.getItem(BANNER_DISMISSED_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function markBannerDismissed(dismissKey) {
    try {
      const map = readDismissedMap();
      map[dismissKey] = Date.now();
      // 清理超过 7 天的旧记录
      const cutoff = Date.now() - 7 * 86400000;
      Object.keys(map).forEach((k) => {
        if (map[k] < cutoff) delete map[k];
      });
      localStorage.setItem(BANNER_DISMISSED_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function removeTopBannerDom() {
    if (typeof document === "undefined") return;
    const old = document.getElementById("milvus-calendar-top-banner");
    if (old) old.remove();
  }

  function renderTopBannerDom() {
    if (typeof document === "undefined") return;
    if (!getCalendarBannerEnabled() || _activeBannerItems.length === 0) {
      removeTopBannerDom();
      return;
    }
    if (_activeBannerIdx >= _activeBannerItems.length) _activeBannerIdx = 0;
    const item = _activeBannerItems[_activeBannerIdx];
    if (!item) {
      removeTopBannerDom();
      return;
    }

    let container = document.getElementById("milvus-calendar-top-banner");
    if (!container) {
      container = document.createElement("div");
      container.id = "milvus-calendar-top-banner";
      Object.assign(container.style, {
        position: "fixed",
        top: "12px",
        left: "12px",
        right: "12px",
        maxWidth: "460px",
        margin: "0 auto",
        zIndex: "99990",
        background: "rgba(255, 253, 249, 0.96)",
        backdropFilter: "blur(10px)",
        border: "1px solid #EADBC2",
        borderRadius: "16px",
        padding: "10px 14px",
        boxShadow: "0 10px 28px rgba(44, 40, 37, 0.16)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        fontFamily: "system-ui, -apple-system, sans-serif"
      });
      document.body.appendChild(container);
    }

    const isToday = item.daysDiff === 0;
    const tagBg = isToday ? "#FEE2E2" : "#FEF3C7";
    const tagColor = isToday ? "#B91C1C" : "#B45309";
    const tagText = isToday ? "⏰ 今日未竟" : "📅 明日预告 · 剩1天";
    const total = _activeBannerItems.length;

    container.innerHTML = "";

    const left = document.createElement("div");
    Object.assign(left.style, { minWidth: "0", flex: "1" });

    const topRow = document.createElement("div");
    Object.assign(topRow.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" });

    const badge = document.createElement("span");
    badge.textContent = tagText;
    Object.assign(badge.style, {
      fontSize: "10.5px",
      fontWeight: "700",
      padding: "1px 7px",
      borderRadius: "999px",
      background: tagBg,
      color: tagColor,
      flexShrink: "0"
    });
    topRow.appendChild(badge);

    if (item.task.time) {
      const timeSpan = document.createElement("span");
      timeSpan.textContent = String(item.task.time);
      Object.assign(timeSpan.style, { fontSize: "10.5px", color: "#8C857B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
      topRow.appendChild(timeSpan);
    }

    const titleEl = document.createElement("div");
    titleEl.textContent = `未竟之事：「${item.task.title || "待办事项"}」`;
    Object.assign(titleEl.style, {
      fontSize: "12.5px",
      fontWeight: "700",
      color: "#292524",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    });

    left.appendChild(topRow);
    left.appendChild(titleEl);
    container.appendChild(left);

    const right = document.createElement("div");
    Object.assign(right.style, { display: "flex", alignItems: "center", gap: "6px", flexShrink: "0" });

    if (total > 1) {
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.textContent = `${_activeBannerIdx + 1}/${total} ›`;
      Object.assign(nextBtn.style, {
        border: "1px solid #E5DFD6",
        background: "#FFFFFF",
        color: "#57534E",
        fontSize: "11px",
        padding: "3px 8px",
        borderRadius: "999px",
        cursor: "pointer"
      });
      nextBtn.onclick = () => {
        _activeBannerIdx = (_activeBannerIdx + 1) % _activeBannerItems.length;
        renderTopBannerDom();
      };
      right.appendChild(nextBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "知道了";
    Object.assign(closeBtn.style, {
      border: "none",
      background: isToday ? "#D6724B" : "#292524",
      color: "#FFFFFF",
      fontSize: "11px",
      fontWeight: "600",
      padding: "4px 10px",
      borderRadius: "999px",
      cursor: "pointer"
    });
    closeBtn.onclick = () => {
      markBannerDismissed(item.dismissKey);
      _activeBannerItems = _activeBannerItems.filter((x) => x.dismissKey !== item.dismissKey);
      renderTopBannerDom();
    };
    right.appendChild(closeBtn);
    container.appendChild(right);
  }

  async function scanAndShowTopBanner() {
    if (!getCalendarBannerEnabled()) {
      removeTopBannerDom();
      return;
    }
    try {
      let pendingList = [];
      const raw = localStorage.getItem("cached_calendar_tasks");
      if (raw) {
        const parsed = JSON.parse(raw);
        pendingList = parsed["未竟之事"] || [];
      }
      if (pendingList.length === 0 && global.calendarStore && typeof global.calendarStore.getTasks === "function") {
        const loaded = await global.calendarStore.getTasks();
        pendingList = (loaded && loaded["未竟之事"]) || [];
      }
      if (!Array.isArray(pendingList) || pendingList.length === 0) {
        _activeBannerItems = [];
        removeTopBannerDom();
        return;
      }

      const now = new Date();
      const todayKey = getTodayKey(now);
      const dismissed = readDismissedMap();
      const hits = [];

      pendingList.forEach((task) => {
        if (!task || task.characterId) return; // 仅提醒「我的日程」未竟之事
        const diff = resolveCalendarTaskDayDiff(task, now);
        if (diff === 0 || diff === 1) {
          const dismissKey = `${task.id}_${todayKey}_d${diff}`;
          if (!dismissed[dismissKey]) {
            hits.push({ task, daysDiff: diff, dismissKey });
          }
        }
      });

      // 当日优先排在明日之前
      hits.sort((a, b) => a.daysDiff - b.daysDiff);
      _activeBannerItems = hits;
      renderTopBannerDom();
    } catch (e) {}
  }

  // 启动后台定时守护（每 60s 检查一次）
  if (typeof window !== "undefined") {
    setTimeout(scanAndShowTopBanner, 3200);
    setInterval(scanAndShowTopBanner, 60000);
  }

  // 我的日程「未竟之事」顶部的横幅提醒开关组件
  const CalendarBannerToggle = () => {
    const h = React.createElement;
    const [enabled, setEnabled] = React.useState(() => getCalendarBannerEnabled());

    const handleToggle = () => {
      const next = !enabled;
      setEnabled(next);
      setCalendarBannerEnabled(next);
    };

    return h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          marginBottom: "10px",
          borderRadius: "14px",
          background: enabled ? "#FFFBF4" : "#F6F5F3",
          border: enabled ? "1px solid #F0DEC2" : "1px solid #EAE7E1",
          fontSize: "12px"
        }
      },
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "2px" } },
        h(
          "span",
          { style: { fontWeight: 700, color: "#292524" } },
          "🔔 未竟之事顶部横幅提醒"
        ),
        h(
          "span",
          { style: { fontSize: "10.5px", color: "#8C857B" } },
          "当日到期与提前 1 天时在屏幕顶部提醒"
        )
      ),
      h(
        "button",
        {
          type: "button",
          onClick: handleToggle,
          style: {
            border: "none",
            borderRadius: "999px",
            padding: "5px 12px",
            fontSize: "11.5px",
            fontWeight: 700,
            background: enabled ? "#D6724B" : "#D6D3D1",
            color: "#FFFFFF",
            cursor: "pointer",
            flexShrink: 0
          }
        },
        enabled ? "已开启" : "已关闭"
      )
    );
  };

  // ==========================================
  // 功能 B：角色日历「未竟之事」到期催促与操办/推脱回执卡片
  // ==========================================
  function getActiveUserPersona() {
    try {
      const savedPersonas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      let activeUser = activeId ? savedPersonas.find((p) => String(p.id) === String(activeId)) : null;
      if (!activeUser && savedPersonas.length > 0) activeUser = savedPersonas[0];
      if (activeUser) {
        return {
          name: activeUser.name || "广陵王",
          identity: activeUser.identity || "广陵王 / 绣衣楼主",
          personality: activeUser.personality || "果敢敏锐",
          background: activeUser.background || activeUser.bio || ""
        };
      }
    } catch (e) {}
    return { name: "广陵王", identity: "广陵王 / 绣衣楼主", personality: "果敢敏锐", background: "" };
  }

  async function resolveFullCharacter(charObj) {
    if (!charObj) return null;
    let full = charObj;
    try {
      let list = [];
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        list = await global.chatCharacterStore.getAll();
      } else {
        list = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      }
      const matched = (list || []).find(
        (c) => c && (String(c.id) === String(charObj.id) || (charObj.name && c.name === charObj.name))
      );
      if (matched) {
        full = {
          ...matched,
          ...charObj,
          profile: { ...(matched.profile || {}), ...(charObj.profile || {}) }
        };
      }
    } catch (e) {}

    const p = full.profile || {};
    return {
      id: full.id || charObj.id || "",
      name: full.name || p.name || "名士",
      mbti: p.mbti || full.mbti || "未设定",
      constellation: p.constellation || p.zodiac || full.constellation || full.zodiac || "未设定",
      speakingStyle: p.speakingStyle || p.style || full.speakingStyle || full.style || "贴合原作角色口吻与神韵",
      personality: p.personality || full.personality || "性格鲜明立体",
      background: p.background || p.bio || p.description || full.background || full.description || "身处乱世、与你羁绊深厚"
    };
  }

  function parseNudgeJson(rawText) {
    const cleaned = String(rawText || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const tryParse = (s) => {
      try {
        const obj = JSON.parse(s);
        if (obj && typeof obj === "object" && (obj.decision || obj.steps || obj.excuseReason)) return obj;
      } catch (e) {}
      return null;
    };
    let parsed = tryParse(cleaned);
    if (!parsed) {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) parsed = tryParse(m[0]) || tryParse(m[0].replace(/\r?\n/g, "\\n"));
    }
    if (parsed) {
      const isSkip = String(parsed.decision || "").toLowerCase() === "skip" || String(parsed.decision || "") === "不做";
      return {
        decision: isSkip ? "skip" : "do",
        statusTag: String(parsed.statusTag || (isSkip ? "暂未操办" : "已妥善办妥")).trim().slice(0, 10),
        openingLine: String(parsed.openingLine || "").trim(),
        steps: Array.isArray(parsed.steps) ? parsed.steps.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 5) : [],
        reflection: String(parsed.reflection || "").trim(),
        excuseReason: String(parsed.excuseReason || "").trim(),
        counterProposal: String(parsed.counterProposal || "").trim(),
        updatedAt: Date.now()
      };
    }
    return {
      decision: "do",
      statusTag: "已记在心上",
      openingLine: "催什么催，这不正办着呢么。",
      steps: ["按原定计划着手处理了这件事。"],
      reflection: cleaned || "事情虽琐碎，倒也勉强应付过去了。",
      excuseReason: "",
      counterProposal: "",
      updatedAt: Date.now()
    };
  }

  async function nudgeCharCalendarTask({ task, character, prevExcuse }) {
    if (typeof global.sendToLLM !== "function") {
      throw new Error("未配置 API，请先前往「设置 → API 配置中心」配置");
    }
    const charInfo = await resolveFullCharacter(character);
    const userInfo = getActiveUserPersona();
    let worldContext = "未开启特定世界书，可按角色原有背景自然展开。";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldContext = wb;
      }
    } catch (e) {}

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】。今天到了你日历里「未竟之事」指定的日子，【${userInfo.name}】跑来催促你处理这件事。请严格依据以下三源设定做出高度符合人设、极具活人感的真实判定：

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
${worldContext}`;

    const prevLine = prevExcuse ? `\n【上次你推脱的借口】：「${prevExcuse}」，现在对方又来催了一遍！` : "";
    const userPrompt = `【被催促的未竟之事】
- 事项标题：${task.title || "待办"}
- 副标题/概要：${task.subtitle || "无"}
- 原定时间：${task.time || "今日"}
- 详细备注：${task.description || "无"}${prevLine}

请你完全顺从你的性格（勤勉负责、敷衍摸鱼、傲娇嘴硬、算计权衡、嫌麻烦等）自主决定这件事你到底「做（do）」还是「不做（skip）」：
- 如果判定做（"do"）：写出你的第一句回应（openingLine）、2~4 步具体的操办流程（steps，有细节与画面感）以及事后操办心得（reflection）。
- 如果判定不做（"skip"）：写出你的第一句回应（openingLine）、极其贴合人设的真实理由或花式借口（excuseReason，60~120字）以及一句改期/甩锅/嘴硬提议（counterProposal）。

请严格返回纯 JSON 对象（不要 \`\`\`json 包裹）：
{
  "decision": "do 或 skip",
  "statusTag": "2~6字状态，如：已妥善办妥 / 偷懒婉拒 / 暂缓操办",
  "openingLine": "听见对方催促后的第一句反应（15~40字）",
  "steps": ["步骤1（仅do时填写）", "步骤2", "步骤3"],
  "reflection": "具体操办心得（仅do时填写，45~100字）",
  "excuseReason": "不做的理由与借口（仅skip时填写，60~120字）",
  "counterProposal": "嘴硬附言或改期/甩锅提议（仅skip时填写，20~50字）"
}`;

    const raw = await new Promise((resolve, reject) => {
      global.sendToLLM(
        [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt }
        ],
        { disableMCP: true },
        (reply) => resolve(reply),
        (err) => reject(new Error(typeof err === "string" ? err : err?.message || "AI 请求失败"))
      );
    });

    return parseNudgeJson(raw);
  }

  // 角色日历「未竟之事」任务卡片内的催促 / 查看回执按钮
  const CalendarNudgeActionBtn = ({ task, character, currentYear, currentMonth, onOpenNudge }) => {
    const h = React.createElement;
    if (!character || !task) return null;
    const diff = resolveCalendarTaskDayDiff(task, new Date(), currentYear, currentMonth);
    const isFuture = diff !== null && diff > 0;
    const hasResult = Boolean(task.nudgeResult);

    if (isFuture) {
      return h(
        "span",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            display: "inline-flex",
            alignItems: "center",
            fontSize: "10.5px",
            color: "#A8A29E",
            background: "#F5F3EF",
            border: "1px solid #EAE5DC",
            padding: "2px 8px",
            borderRadius: "999px",
            marginLeft: "8px"
          }
        },
        `⏳ 还差 ${diff} 天`
      );
    }

    return h(
      "button",
      {
        type: "button",
        onClick: (e) => {
          e.stopPropagation();
          if (typeof onOpenNudge === "function") onOpenNudge(task);
        },
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          marginLeft: "8px",
          border: hasResult ? "1px solid #CBE0D6" : "1px solid #F3C6B4",
          background: hasResult ? "#EAF5EF" : "#FFF3EE",
          color: hasResult ? "#2E6B50" : "#C2542D",
          fontSize: "11px",
          fontWeight: 700,
          padding: "3px 10px",
          borderRadius: "999px",
          cursor: "pointer"
        }
      },
      hasResult
        ? `📜 ${task.nudgeResult.decision === "do" ? "已操办·看回执" : "未操办·看借口"}`
        : `🔔 催促 ${character.name || "TA"}`
    );
  };

  // 角色催促回执弹窗卡片
  const CalendarNudgeResultModal = ({ task, character, onClose, onSaveNudgeResult, onMoveToDone }) => {
    const h = React.createElement;
    const [loading, setLoading] = React.useState(false);
    const [result, setResult] = React.useState(task?.nudgeResult || null);
    const [errMsg, setErrMsg] = React.useState("");

    const runNudge = async (isRetry) => {
      if (!task || !character || loading) return;
      setLoading(true);
      setErrMsg("");
      try {
        const prevExcuse = isRetry && result?.decision === "skip" ? result.excuseReason : "";
        const res = await nudgeCharCalendarTask({ task, character, prevExcuse });
        setResult(res);
        if (typeof onSaveNudgeResult === "function") {
          onSaveNudgeResult(task.id, res);
        }
      } catch (e) {
        setErrMsg(e?.message || "催促失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    };

    React.useEffect(() => {
      if (!task) return;
      if (task.nudgeResult) {
        setResult(task.nudgeResult);
        setErrMsg("");
      } else {
        setResult(null);
        runNudge(false);
      }
    }, [task?.id]);

    if (!task || !character) return null;
    const isDo = result?.decision === "do";

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 12000,
          background: "rgba(28, 25, 23, 0.5)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px"
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
            maxWidth: "390px",
            maxHeight: "82vh",
            background: "#FFFDF9",
            borderRadius: "20px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0,0,0,0.24)",
            border: "1px solid #EAE2D6"
          }
        },
        // 顶栏
        h(
          "div",
          {
            style: {
              padding: "13px 16px",
              background: result ? (isDo ? "#F1F9F5" : "#FDF4F2") : "#FAF6F0",
              borderBottom: "1px solid #EFEAE2",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 } },
            h("span", { style: { fontSize: "14px", fontWeight: 700, color: "#292524" } }, `${character.name} · 事务回执`),
            result &&
              h(
                "span",
                {
                  style: {
                    fontSize: "10.5px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: isDo ? "#DDF2E7" : "#FCE2DF",
                    color: isDo ? "#2E6B50" : "#B33E38"
                  }
                },
                isDo ? `✓ ${result.statusTag || "已操办"}` : `✕ ${result.statusTag || "暂未操办"}`
              )
          ),
          h(
            "button",
            {
              onClick: onClose,
              style: { border: "none", background: "rgba(0,0,0,0.06)", color: "#57534E", width: "26px", height: "26px", borderRadius: "50%", cursor: "pointer" }
            },
            "✕"
          )
        ),

        // 内容主体
        h(
          "div",
          {
            style: {
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }
          },
          // 事项标题卡
          h(
            "div",
            {
              style: {
                padding: "10px 12px",
                borderRadius: "12px",
                background: "#FAF8F5",
                border: "1px solid #EFEAE2"
              }
            },
            h("div", { style: { fontSize: "13.5px", fontWeight: 700, color: "#292524" } }, task.title || "未竟之事"),
            h("div", { style: { fontSize: "11px", color: "#8C857B", marginTop: "3px" } }, `${task.time || "今日"}${task.subtitle ? ` · ${task.subtitle}` : ""}`)
          ),

          loading &&
            h(
              "div",
              { style: { textAlign: "center", padding: "36px 12px", color: "#8C857B", fontSize: "13px" } },
              `正在催促 ${character.name} 交代操办进展……`
            ),

          errMsg &&
            h(
              "div",
              { style: { padding: "10px 12px", borderRadius: "10px", background: "#FEF2F2", color: "#B91C1C", fontSize: "12px" } },
              errMsg
            ),

          !loading &&
            result &&
            h(
              React.Fragment,
              null,
              result.openingLine &&
                h(
                  "div",
                  {
                    style: {
                      padding: "10px 12px",
                      borderRadius: "12px",
                      background: "#FFFFFF",
                      borderLeft: `3px solid ${isDo ? "#4F8A6E" : "#C85A53"}`,
                      borderTop: "1px solid #EFEAE2",
                      borderRight: "1px solid #EFEAE2",
                      borderBottom: "1px solid #EFEAE2",
                      fontSize: "13px",
                      color: "#292524",
                      lineHeight: "1.65"
                    }
                  },
                  `“${result.openingLine}”`
                ),

              // 分支 1：决定做 -> 操办流程 + 心得
              isDo
                ? h(
                    React.Fragment,
                    null,
                    result.steps &&
                      result.steps.length > 0 &&
                      h(
                        "div",
                        {
                          style: {
                            background: "#FFFFFF",
                            border: "1px solid #E2EFE8",
                            borderRadius: "14px",
                            padding: "12px 14px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                          }
                        },
                        h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#2E6B50" } }, "📋 具体操办流程"),
                        result.steps.map((st, idx) =>
                          h(
                            "div",
                            { key: idx, style: { display: "flex", gap: "8px", fontSize: "12.5px", color: "#3F3A36", lineHeight: "1.65" } },
                            h(
                              "span",
                              {
                                style: {
                                  width: "18px",
                                  height: "18px",
                                  borderRadius: "50%",
                                  background: "#EAF5EF",
                                  color: "#2E6B50",
                                  fontSize: "10.5px",
                                  fontWeight: 700,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  marginTop: "2px"
                                }
                              },
                              idx + 1
                            ),
                            h("span", null, st)
                          )
                        )
                      ),
                    result.reflection &&
                      h(
                        "div",
                        {
                          style: {
                            background: "#FAF8F5",
                            border: "1px solid #EFEAE2",
                            borderRadius: "14px",
                            padding: "12px 14px"
                          }
                        },
                        h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#57534E", marginBottom: "5px" } }, "✍️ 操办心得"),
                        h("div", { style: { fontSize: "13px", color: "#44403C", lineHeight: "1.75", whiteSpace: "pre-wrap" } }, result.reflection)
                      )
                  )
                : // 分支 2：决定不做 -> 理由与借口 + 提议
                  h(
                    React.Fragment,
                    null,
                    h(
                      "div",
                      {
                        style: {
                          background: "#FFFFFF",
                          border: "1px solid #F2D7D3",
                          borderRadius: "14px",
                          padding: "12px 14px"
                        }
                      },
                      h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#B33E38", marginBottom: "6px" } }, "💬 推脱理由与借口"),
                      h(
                        "div",
                        { style: { fontSize: "13px", color: "#3F3A36", lineHeight: "1.75", whiteSpace: "pre-wrap" } },
                        result.excuseReason || "今日诸事缠身，此事容后再议罢。"
                      )
                    ),
                    result.counterProposal &&
                      h(
                        "div",
                        {
                          style: {
                            background: "#FFF9EE",
                            border: "1px solid #F3E2C0",
                            borderRadius: "12px",
                            padding: "10px 12px",
                            fontSize: "12px",
                            color: "#8A5A19",
                            lineHeight: "1.65"
                          }
                        },
                        `💡 ${character.name} 补充：${result.counterProposal}`
                      )
                  ),

              // 底部操作按钮
              h(
                "div",
                { style: { display: "flex", gap: "8px", marginTop: "4px" } },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => runNudge(true),
                    disabled: loading,
                    style: {
                      flex: 1,
                      border: "1px solid #E5DFD6",
                      background: "#FFFFFF",
                      color: "#57534E",
                      borderRadius: "10px",
                      padding: "9px 10px",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }
                  },
                  "再催一次"
                ),
                isDo && typeof onMoveToDone === "function"
                  ? h(
                      "button",
                      {
                        type: "button",
                        onClick: () => {
                          onMoveToDone(task);
                          onClose();
                        },
                        style: {
                          flex: 1.3,
                          border: "none",
                          background: "#2E6B50",
                          color: "#FFFFFF",
                          borderRadius: "10px",
                          padding: "9px 10px",
                          fontSize: "12.5px",
                          fontWeight: 700,
                          cursor: "pointer"
                        }
                      },
                      "✓ 移入已毕之事"
                    )
                  : h(
                      "button",
                      {
                        type: "button",
                        onClick: onClose,
                        style: {
                          flex: 1.3,
                          border: "none",
                          background: "#292524",
                          color: "#FFFFFF",
                          borderRadius: "10px",
                          padding: "9px 10px",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          cursor: "pointer"
                        }
                      },
                      "留在未竟之事"
                    )
              )
            )
        )
      )
    );
  };

  global.resolveCalendarTaskDayDiff = resolveCalendarTaskDayDiff;
  global.getCalendarBannerEnabled = getCalendarBannerEnabled;
  global.setCalendarBannerEnabled = setCalendarBannerEnabled;
  global.scanAndShowTopBanner = scanAndShowTopBanner;
  global.nudgeCharCalendarTask = nudgeCharCalendarTask;
  global.CalendarBannerToggle = CalendarBannerToggle;
  global.CalendarNudgeActionBtn = CalendarNudgeActionBtn;
  global.CalendarNudgeResultModal = CalendarNudgeResultModal;
})(typeof window !== "undefined" ? window : globalThis);
