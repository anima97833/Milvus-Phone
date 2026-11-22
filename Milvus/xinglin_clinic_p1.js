/**
 * Milvus/xinglin_clinic_p1.js
 * 杏林济生（T10）Phase 1 独立 AI 与传讯闭环引擎
 * 职责：
 *  1. 五维上下文聚合器（角色配置 + 身份配置库 + 开启世界书 + 内置医生人设卡 + 传讯聊天上下文）
 *  2. 正式问诊 AI 双模式（ConsultationModeGate + AIConsultationView，保留原版经典模式一键切换）
 *  3. 名士开药日常生成器 + 本地医案档案馆（CelebrityClinicDailyView）
 *  4. 古风医案药方传讯卡片（ClinicRecordCardBubble）+ 静默转发传讯 + LLM 上下文序列化（formatClinicRecordCardForLLM）
 */
(function (global) {
  "use strict";

  const DAILY_RECORDS_KEY = "xinglin_celebrity_daily_v1";
  const CONSULT_MODE_KEY = "xinglin_consult_mode_v1";

  // ==========================================
  // 1. 工具与五维上下文聚合器
  // ==========================================
  function extractMessages(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.messages)) return raw.messages;
    return [];
  }

  function safeParseJsonLoose(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    try {
      if (typeof global.safeParseLLMJson === "function") {
        const res = global.safeParseLLMJson(cleaned);
        if (res && typeof res === "object") return res;
      }
    } catch (e) {}
    try {
      return JSON.parse(cleaned);
    } catch (e) {}
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch (e) {}
    }
    return null;
  }

  function getActiveUserPersona() {
    try {
      const personas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      let active = activeId ? personas.find((p) => String(p.id) === String(activeId)) : null;
      if (!active && Array.isArray(personas) && personas.length > 0) active = personas[0];
      if (active) {
        return {
          name: active.name || active.nickname || "广陵王",
          identity: active.identity || active.title || active.role || "广陵亲王 / 绣衣楼主",
          personality: active.personality || active.traits || "果敢敏锐",
          background: active.background || active.bio || active.description || "掌管广陵与绣衣楼"
        };
      }
    } catch (e) {}
    return {
      name: "广陵王",
      identity: "广陵亲王 / 绣衣楼主",
      personality: "果敢敏锐",
      background: "东汉末年乱世中执掌广陵与绣衣楼"
    };
  }

  function getCharacterProfileInfo(charObj) {
    const c = charObj || {};
    let extra = {};
    try {
      const profiles = JSON.parse(localStorage.getItem("character_profiles") || "{}");
      if (profiles && c.id && profiles[c.id]) extra = profiles[c.id];
    } catch (e) {}
    const p = c.persona || c.profile || {};
    return {
      id: c.id || "",
      name: c.name || "神秘名士",
      mbti: c.mbti || p.mbti || extra.mbti || "未设定",
      constellation: c.constellation || c.zodiac || p.constellation || p.zodiac || extra.constellation || "未设定",
      speechStyle: c.speechStyle || c.languageStyle || c.style || p.speechStyle || p.languageStyle || extra.speechStyle || "贴合古风人物本色，自然生动",
      personality: c.personality || c.traits || p.personality || extra.personality || "性格鲜明立体",
      background: c.background || c.bio || c.description || c.setting || p.background || extra.background || "东汉末年广陵与乱世中的重要人物"
    };
  }

  async function getEnabledWorldBookText(maxLen) {
    const cap = maxLen || 1600;
    try {
      if (typeof global.getWorldBookContext === "function") {
        const txt = String((await global.getWorldBookContext()) || "").trim();
        if (txt) return txt.slice(0, cap);
      }
    } catch (e) {}
    try {
      if (global.worldBookStore && typeof global.worldBookStore.getData === "function") {
        const data = await global.worldBookStore.getData();
        const entries = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : [];
        const enabled = entries.filter((it) => it && it.enabled !== false && (it.content || it.text));
        const joined = enabled
          .map((it) => `${it.title || it.name || "设定"}：${String(it.content || it.text).trim()}`)
          .join("\n");
        return joined.slice(0, cap);
      }
    } catch (e) {}
    return "";
  }

  async function getRecentChatContext(charId, charName, userName, limit) {
    const maxCount = limit || 14;
    let msgs = [];
    try {
      if (global.chatHistoryStore && typeof global.chatHistoryStore.getAllMessages === "function") {
        msgs = extractMessages(await global.chatHistoryStore.getAllMessages(charId));
      }
    } catch (e) {}
    if (msgs.length === 0) {
      try {
        msgs = extractMessages(JSON.parse(localStorage.getItem("t8_chat_history_" + charId) || "[]"));
      } catch (e) {}
    }
    const valid = msgs
      .filter((m) => m && (m.text || m.content) && m.type !== "system_divider")
      .slice(-maxCount)
      .map((m) => {
        const speaker = m.isMe || m.sender === "me" || m.sender === "user" ? userName : charName;
        const body = String(m.text || (typeof m.content === "string" ? m.content : m.content?.title || "")).trim();
        return `${speaker}：${body.slice(0, 150)}`;
      })
      .filter(Boolean);
    return valid.join("\n");
  }

  function callLLM(messages) {
    return new Promise((resolve, reject) => {
      if (typeof global.sendToLLM !== "function") {
        reject(new Error("未检测到 AI 接口，请先在「设置 - API 配置」中配置模型。"));
        return;
      }
      try {
        global.sendToLLM(
          messages,
          { disableMCP: true },
          (reply) => resolve(String(reply || "")),
          (err) => reject(err instanceof Error ? err : new Error(String(err || "AI 请求失败")))
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  // ==========================================
  // 2. 正式问诊 AI 双模式（ConsultationModeGate + AIConsultationView）
  // ==========================================
  function AIConsultationView({
    doctorName,
    selectedSymptoms,
    mentalQuality,
    illnessSeverity,
    diagnosisAccuracy,
    onOpenPulse,
    onOpenTongue,
    onOpenMemory,
    onPrescribe,
    onBackToQueue
  }) {
    const React = global.React;
    const { useState, useEffect, useRef } = React;

    const docs = global.XINGLIN_DOCTORS || {};
    const doc = docs[doctorName] || docs["董奉"] || {
      name: doctorName || "董奉",
      title: "杏林医者",
      themeColor: "#6d947c",
      bgTint: "#f1f7f3",
      greeting: "请坐，伸手诊脉吧。"
    };

    const symptomsText = Array.isArray(selectedSymptoms) && selectedSymptoms.length > 0
      ? selectedSymptoms.join("、")
      : "气血略虚";

    const [chatList, setChatList] = useState(() => [
      {
        id: Date.now(),
        role: "doctor",
        text: doc.greeting || `坐下吧，你今日报的是「${symptomsText}」，先说说哪里最难受？`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ]);
    const [quickReplies, setQuickReplies] = useState([
      `大夫，我这几日确实「${symptomsText}」，夜里也不大安稳。`,
      `其实也没多大事，就是被旁人硬拖来瞧瞧的……`
    ]);
    const [inputVal, setInputVal] = useState("");
    const [loading, setLoading] = useState(false);
    const [confirmPct, setConfirmPct] = useState(25);
    const [prescription, setPrescription] = useState(null);
    const [prescribing, setPrescribing] = useState(false);
    const [lastReportedAcc, setLastReportedAcc] = useState(0);
    const scrollRef = useRef(null);

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [chatList, loading, prescription]);

    const sendUserReply = async (textToSend) => {
      const content = String(textToSend || inputVal).trim();
      if (!content || loading) return;
      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const nextList = [...chatList, { id: Date.now(), role: "user", text: content, time: nowStr }];
      setChatList(nextList);
      setInputVal("");
      setLoading(true);

      try {
        const userPersona = getActiveUserPersona();
        const wb = await getEnabledWorldBookText(1000);
        const docPrompt = typeof global.buildXinglinDoctorPrompt === "function"
          ? global.buildXinglinDoctorPrompt(doc.name)
          : `坐诊大夫：${doc.name}`;

        const historyStr = nextList
          .slice(-10)
          .map((m) => `${m.role === "doctor" ? doc.name : userPersona.name}：${m.text}`)
          .join("\n");

        const sysPrompt = `你是杏林济生医馆正在坐诊的大夫【${doc.name}】。你必须严格保持人设，绝不出戏，绝不说现代医学术语或客服腔。
${docPrompt}

【就诊患者信息（用户身份设定）】
- 称呼/姓名：${userPersona.name}（${userPersona.identity}）
- 性格与背景：${userPersona.personality}；${userPersona.background}
- 本次挂号主诉：${symptomsText}
- 当前体征数值：心理素质 ${mentalQuality} / 病情程度 ${illnessSeverity} / 三诊查体准确率 ${diagnosisAccuracy}%
${wb ? `\n【世界观参考】\n${wb}` : ""}

【输出要求】
请严格输出合法 JSON（不要 Markdown 代码块）：
{
  "reply": "大夫的口语回复，60~140字，可带少量动作/神态描写（用括号），极度贴合人设",
  "confirmDelta": 25,
  "quickReplies": ["给患者的快捷回应选项1（15~28字，口语自然）", "给患者的快捷回应选项2（15~28字，可略带嘴硬或撒娇）"]
}`;

        const raw = await callLLM([
          { role: "system", content: sysPrompt },
          { role: "user", content: `【目前诊室对话记录】\n${historyStr}\n\n请以【${doc.name}】的身份继续接诊并输出 JSON。` }
        ]);

        const parsed = safeParseJsonLoose(raw);
        const replyText = (parsed && parsed.reply) ? String(parsed.reply).trim() : String(raw || "").trim() || "唔……脉象我已心里有数，你且再仔细说说。";
        const delta = Math.max(10, Math.min(40, Number(parsed?.confirmDelta) || 25));
        const nextQuick = Array.isArray(parsed?.quickReplies) && parsed.quickReplies.length > 0
          ? parsed.quickReplies.slice(0, 2).map(String)
          : ["大夫说的是，那该怎么调理？", "能开点不那么苦的药吗？"];

        setChatList((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "doctor",
            text: replyText,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]);
        setConfirmPct((prev) => Math.min(100, prev + delta));
        setQuickReplies(nextQuick);
      } catch (err) {
        setChatList((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "doctor",
            text: `（AI 连接暂未就绪：${err.message}。你可以点击上方切回「经典问诊」继续体验。）`,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    const handleReportExam = () => {
      setLastReportedAcc(diagnosisAccuracy);
      sendUserReply(`（已完成号脉/观舌/望面查体，当前诊察准确率 ${diagnosisAccuracy}%，请大夫结合体征看看我的情况。）`);
    };

    const handleGeneratePrescription = async () => {
      if (prescribing || loading) return;
      setPrescribing(true);
      try {
        const userPersona = getActiveUserPersona();
        const docPrompt = typeof global.buildXinglinDoctorPrompt === "function"
          ? global.buildXinglinDoctorPrompt(doc.name)
          : `坐诊大夫：${doc.name}`;
        const historyStr = chatList
          .slice(-10)
          .map((m) => `${m.role === "doctor" ? doc.name : userPersona.name}：${m.text}`)
          .join("\n");

        const raw = await callLLM([
          {
            role: "system",
            content: `你是坐诊大夫【${doc.name}】，现在问诊结束，请根据刚才的对话与症状为患者【${userPersona.name}】开具一帖古风中医处方。
${docPrompt}
严格输出 JSON（不要 Markdown 代码块）：
{
  "name": "古风方剂名（5~10字）",
  "diagnosis": "中医四诊辨证结论（20~45字）",
  "herbs": ["药材1 用量", "药材2 用量", "药材3 用量", "药材4 用量"],
  "note": "煎服法与大夫贴合人设的叮嘱/吐槽（30~70字）"
}`
          },
          { role: "user", content: `主诉：${symptomsText}\n查体准确率：${diagnosisAccuracy}%\n诊室记录：\n${historyStr}` }
        ]);
        const parsed = safeParseJsonLoose(raw);
        if (parsed && parsed.name) {
          setPrescription({
            doctorName: doc.name,
            themeColor: doc.themeColor || "#6d947c",
            name: String(parsed.name),
            diagnosis: String(parsed.diagnosis || `${symptomsText}所致气机不畅`),
            herbs: Array.isArray(parsed.herbs) && parsed.herbs.length > 0 ? parsed.herbs.map(String) : (doc.signatureHerbs || ["甘草 二钱", "茯苓 三钱"]),
            note: String(parsed.note || "文火慢煎，温服。")
          });
        } else {
          setPrescription(global.XinglinClinicEngine.pickDefaultPrescription(doc.name));
        }
        setConfirmPct(100);
      } catch (e) {
        setPrescription(global.XinglinClinicEngine.pickDefaultPrescription(doc.name));
      } finally {
        setPrescribing(false);
      }
    };

    const handleGoDecoctionWithRx = () => {
      const rx = prescription || global.XinglinClinicEngine.pickDefaultPrescription(doc.name);
      if (global.XinglinClinicEngine && typeof global.XinglinClinicEngine.setActivePrescription === "function") {
        global.XinglinClinicEngine.setActivePrescription(rx);
      }
      if (typeof onPrescribe === "function") onPrescribe();
    };

    return React.createElement(
      "div",
      {
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          minHeight: 0
        }
      },
      // 医生名片与状态条
      React.createElement(
        "div",
        {
          style: {
            background: doc.bgTint || "#f1f7f3",
            border: `1px solid ${doc.themeColor || "#7fa68a"}44`,
            borderRadius: "12px",
            padding: "10px 12px"
          }
        },
        React.createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" } },
          React.createElement(
            "div",
            { style: { fontWeight: "800", fontSize: "14px", color: doc.themeColor || "#4a6b57" } },
            `🩺 ${doc.name} · ${doc.title || "坐诊医师"}`
          ),
          React.createElement(
            "span",
            { style: { fontSize: "11px", color: "#767b69" } },
            `主诉：${symptomsText}`
          )
        ),
        React.createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#7c8170", marginBottom: "4px" } },
          React.createElement("span", null, `心理素质 ${mentalQuality} · 病情 ${illnessSeverity}`),
          React.createElement("span", { style: { fontWeight: "700", color: doc.themeColor || "#6d947c" } }, `诊断确认度 ${confirmPct}%`)
        ),
        React.createElement(
          "div",
          { style: { height: "5px", background: "rgba(0,0,0,0.08)", borderRadius: "999px", overflow: "hidden" } },
          React.createElement("div", {
            style: {
              width: `${confirmPct}%`,
              height: "100%",
              background: doc.themeColor || "#6d947c",
              transition: "width 0.3s ease"
            }
          })
        )
      ),

      // 诊室对话流
      React.createElement(
        "div",
        {
          ref: scrollRef,
          style: {
            flex: 1,
            minHeight: "190px",
            maxHeight: "340px",
            overflowY: "auto",
            background: "#f8f4ec",
            borderRadius: "12px",
            padding: "12px",
            border: "1px solid #e7e0ce",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }
        },
        chatList.map((m) =>
          React.createElement(
            "div",
            {
              key: m.id,
              style: {
                display: "flex",
                flexDirection: m.role === "user" ? "row-reverse" : "row",
                alignItems: "flex-start",
                gap: "6px"
              }
            },
            React.createElement(
              "div",
              {
                style: {
                  maxWidth: "82%",
                  padding: "9px 12px",
                  borderRadius: m.role === "user" ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
                  background: m.role === "user" ? "#e8b4ae" : "#fff",
                  color: "#3f4238",
                  fontSize: "13px",
                  lineHeight: 1.55,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
                }
              },
              React.createElement(
                "div",
                { style: { fontSize: "10px", fontWeight: "700", color: m.role === "user" ? "#6d3b36" : (doc.themeColor || "#6d947c"), marginBottom: "2px" } },
                m.role === "user" ? "我" : doc.name
              ),
              m.text
            )
          )
        ),
        loading &&
          React.createElement(
            "div",
            { style: { fontSize: "12px", color: "#8c917b", fontStyle: "italic" } },
            `${doc.name} 正在搭脉思索…`
          ),
        prescription &&
          React.createElement(
            "div",
            {
              style: {
                background: "#fffdf7",
                border: `1.5px solid ${doc.themeColor || "#6d947c"}`,
                borderRadius: "12px",
                padding: "12px",
                boxShadow: "0 3px 10px rgba(0,0,0,0.06)"
              }
            },
            React.createElement(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
              React.createElement("strong", { style: { fontSize: "14px", color: "#3d4637" } }, `📜 处方：《${prescription.name}》`),
              React.createElement("span", { style: { fontSize: "11px", color: doc.themeColor, fontWeight: "700" } }, `${doc.name} 亲笔`)
            ),
            prescription.diagnosis &&
              React.createElement("div", { style: { fontSize: "12px", color: "#5e6353", marginBottom: "6px" } }, `辨证：${prescription.diagnosis}`),
            React.createElement(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "6px" } },
              (prescription.herbs || []).map((h, i) =>
                React.createElement(
                  "span",
                  { key: i, style: { fontSize: "11px", background: "#f2eee2", padding: "2px 7px", borderRadius: "6px", color: "#4a4e42" } },
                  h
                )
              )
            ),
            React.createElement("div", { style: { fontSize: "12px", color: "#6b6f5f", lineHeight: 1.5, marginBottom: "10px" } }, `医嘱：${prescription.note}`),
            React.createElement(
              "button",
              {
                onClick: handleGoDecoctionWithRx,
                style: {
                  width: "100%",
                  padding: "10px",
                  borderRadius: "10px",
                  border: "none",
                  background: doc.themeColor || "#6d947c",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer"
                }
              },
              "🫖 携此药方前往煎药台"
            )
          )
      ),

      // 快捷回应胶囊
      !prescription && quickReplies.length > 0 &&
        React.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "5px" } },
          quickReplies.map((qr, i) =>
            React.createElement(
              "button",
              {
                key: i,
                disabled: loading,
                onClick: () => sendUserReply(qr),
                style: {
                  padding: "8px 11px",
                  borderRadius: "10px",
                  border: "1px solid #e2d8c5",
                  background: "#fff",
                  color: "#4d5243",
                  fontSize: "12px",
                  textAlign: "left",
                  cursor: "pointer"
                }
              },
              `💬 ${qr}`
            )
          )
        ),

      // 自由输入栏
      !prescription &&
        React.createElement(
          "div",
          { style: { display: "flex", gap: "8px" } },
          React.createElement("input", {
            value: inputVal,
            onChange: (e) => setInputVal(e.target.value),
            onKeyDown: (e) => e.key === "Enter" && sendUserReply(),
            placeholder: `向${doc.name}诉说病情或搭话…`,
            style: {
              flex: 1,
              padding: "10px 13px",
              borderRadius: "999px",
              border: "1px solid #dfd5c2",
              background: "#fff",
              fontSize: "13px",
              outline: "none"
            }
          }),
          React.createElement(
            "button",
            {
              onClick: () => sendUserReply(),
              disabled: loading,
              style: {
                padding: "10px 16px",
                borderRadius: "999px",
                border: "none",
                background: doc.themeColor || "#6d947c",
                color: "#fff",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "发送"
          )
        ),

      // 三诊查体按钮 + 汇报体征 + 请大夫开方
      React.createElement(
        "div",
        { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
        React.createElement("button", { onClick: onOpenPulse, style: miniBtnStyle }, "号脉"),
        React.createElement("button", { onClick: onOpenTongue, style: miniBtnStyle }, "观舌"),
        React.createElement("button", { onClick: onOpenMemory, style: miniBtnStyle }, "望面"),
        diagnosisAccuracy > 0 && diagnosisAccuracy !== lastReportedAcc &&
          React.createElement(
            "button",
            {
              onClick: handleReportExam,
              style: { ...miniBtnStyle, background: "#fff4d9", borderColor: "#e3b65d", color: "#7d4f0a", fontWeight: "700" }
            },
            `汇报查体(${diagnosisAccuracy}%)`
          ),
        React.createElement(
          "button",
          {
            onClick: handleGeneratePrescription,
            disabled: prescribing,
            style: {
              flex: 1,
              minWidth: "100px",
              padding: "9px 12px",
              borderRadius: "10px",
              border: "none",
              background: "#c86d51",
              color: "#fff",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer"
            }
          },
          prescribing ? "开方中…" : "📜 请大夫开方"
        )
      ),

      React.createElement(
        "button",
        {
          onClick: onBackToQueue,
          style: {
            width: "100%",
            padding: "10px",
            borderRadius: "12px",
            background: "#eee9dd",
            border: "none",
            color: "#6b6e5e",
            fontSize: "13px",
            cursor: "pointer"
          }
        },
        "返回候诊排表"
      )
    );
  }

  const miniBtnStyle = {
    padding: "9px 12px",
    borderRadius: "10px",
    background: "#f2efde",
    border: "1px solid #95bba5",
    color: "#5a5f4d",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer"
  };

  function ConsultationModeGate(props) {
    const React = global.React;
    const { useState } = React;
    const [mode, setMode] = useState(() => {
      try {
        const saved = localStorage.getItem(CONSULT_MODE_KEY);
        if (saved === "ai" || saved === "classic") return saved;
      } catch (e) {}
      return typeof global.sendToLLM === "function" ? "ai" : "classic";
    });

    const switchMode = (next) => {
      setMode(next);
      try {
        localStorage.setItem(CONSULT_MODE_KEY, next);
      } catch (e) {}
    };

    return React.createElement(
      "div",
      {
        style: {
          padding: "12px 16px 18px",
          minHeight: "100%",
          background: "#fbf9f4",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          boxSizing: "border-box"
        }
      },
      // 模式切换胶囊栏
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f2eee2",
            padding: "5px 8px",
            borderRadius: "12px"
          }
        },
        React.createElement("span", { style: { fontSize: "12px", fontWeight: "700", color: "#5a5f4d" } }, "问诊模式"),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "4px" } },
          React.createElement(
            "button",
            {
              onClick: () => switchMode("ai"),
              style: {
                padding: "5px 11px",
                borderRadius: "999px",
                border: "none",
                background: mode === "ai" ? "#6d947c" : "transparent",
                color: mode === "ai" ? "#fff" : "#6b705e",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "🌿 AI 名医坐诊"
          ),
          React.createElement(
            "button",
            {
              onClick: () => switchMode("classic"),
              style: {
                padding: "5px 11px",
                borderRadius: "999px",
                border: "none",
                background: mode === "classic" ? "#8c917b" : "transparent",
                color: mode === "classic" ? "#fff" : "#6b705e",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "📜 经典问诊"
          )
        )
      ),
      mode === "ai"
        ? React.createElement(AIConsultationView, props)
        : typeof props.renderClassic === "function"
        ? props.renderClassic()
        : null
    );
  }

  // ==========================================
  // 3. 传讯静默转发服务 + 古风医案药方气泡 + LLM 协议
  // ==========================================
  async function sendClinicRecordToChat(targetChar, record, note) {
    if (!targetChar || targetChar.id === undefined) throw new Error("未选择有效的传讯名士");
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const formulaName = record?.prescription?.name || "杏林调理方";
    const patientName = record?.charName || targetChar.name;
    const doctorName = record?.doctorName || "董奉";

    const msg = {
      id: now,
      type: "clinic_record_card",
      isMe: true,
      sender: "me",
      timestamp: now,
      time: timeStr,
      text: `[杏林医案] ${patientName} × ${doctorName} · 《${formulaName}》`,
      content: {
        recordId: String(record?.id || now),
        date: record?.date || new Date().toLocaleDateString(),
        patientId: record?.charId || "",
        patientName,
        doctorName,
        doctorTitle: record?.doctorTitle || "坐诊医师",
        chiefComplaint: record?.diagnosis?.chiefComplaint || "",
        syndrome: record?.diagnosis?.syndrome || "",
        pulseTongue: record?.diagnosis?.pulseTongue || "",
        advice: record?.diagnosis?.advice || "",
        formulaName,
        herbs: Array.isArray(record?.prescription?.herbs) ? record.prescription.herbs : [],
        usage: record?.prescription?.usage || "",
        doctorRemark: record?.prescription?.doctorRemark || "",
        dialogue: Array.isArray(record?.dialogue) ? record.dialogue : [],
        note: String(note || "").trim()
      }
    };

    // 静默写入传讯聊天主线，绝不自动触发 AI 回复
    let saved = false;
    try {
      if (global.chatHistoryStore && typeof global.chatHistoryStore.saveMessage === "function") {
        await global.chatHistoryStore.saveMessage(targetChar.id, msg);
        saved = true;
      }
    } catch (e) {}
    if (!saved) {
      try {
        const key = "t8_chat_history_" + targetChar.id;
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.push(msg);
        localStorage.setItem(key, JSON.stringify(arr));
      } catch (e) {}
    }

    try {
      const rawList = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      if (Array.isArray(rawList)) {
        const updated = rawList.map((c) =>
          c && String(c.id) === String(targetChar.id)
            ? { ...c, lastMessage: msg.text, lastTime: timeStr, timestamp: now }
            : c
        );
        localStorage.setItem("t8_chat_list", JSON.stringify(updated));
      }
    } catch (e) {}

    return msg;
  }

  function formatClinicRecordCardForLLM(msg, chatData) {
    const c = msg?.content || {};
    const charName = chatData?.name || "";
    const involvesSelf = Boolean(charName && c.patientName && c.patientName.includes(charName));
    const dlgLines = (Array.isArray(c.dialogue) ? c.dialogue : [])
      .slice(0, 6)
      .map((d) => `${d.speaker || "人"}：${d.text || ""}`)
      .join("\n");

    const guidance = involvesSelf
      ? `注意：这份杏林济生医案记录的正是【你自己（${charName}）】去找【${c.doctorName}】大夫看病抓药的日常！请结合你的角色配置（MBTI、星座、语言风格、性格特点、个人背景）、用户身份设定、当前开启的世界书以及你们的传讯聊天上下文，针对这份病历、大夫的诊断/吐槽与药方做出真实生动、贴合人设的反应（比如嘴硬、害羞、吐槽大夫、怕苦、或顺势和用户撒娇/斗嘴）。`
      : `注意：这是用户把【${c.patientName}】在杏林济生找【${c.doctorName}】看病抓药的医案日常转发给你看/分享吃瓜。请结合你的角色人设、用户身份设定、开启的世界书与传讯上下文发表自然贴合人设的评论或关心。`;

    return {
      role: msg.isMe ? "user" : "assistant",
      content: `【杏林济生 · 名士医案药方卡片】
就诊日期：${c.date || ""}
就诊名士：${c.patientName || "未知"}
坐诊大夫：${c.doctorName || "杏林大夫"}（${c.doctorTitle || ""}）
主诉与四诊：${c.chiefComplaint || ""}；${c.pulseTongue || ""}
辨证结论：${c.syndrome || ""}
医嘱：${c.advice || ""}
开具方剂：《${c.formulaName || ""}》
药材组成：${(c.herbs || []).join("、")}
煎服法：${c.usage || ""}
大夫私批：${c.doctorRemark || ""}
诊室对话摘录：
${dlgLines}
${c.note ? `用户转发附言：“${c.note}”\n` : ""}（提示：${guidance}）`
    };
  }

  function ClinicRecordCardBubble({ msg }) {
    const React = global.React;
    const { useState } = React;
    const [expanded, setExpanded] = useState(false);
    const c = msg?.content || {};
    const firstLine = Array.isArray(c.dialogue) && c.dialogue[0] ? `${c.dialogue[0].speaker}：「${c.dialogue[0].text}」` : "";

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        {
          onClick: () => setExpanded(true),
          style: {
            width: "242px",
            maxWidth: "100%",
            background: "linear-gradient(160deg, #fffdf7 0%, #f5efe0 100%)",
            border: "1.5px solid #c9b995",
            borderRadius: "13px",
            padding: "11px 12px",
            color: "#3f4337",
            boxShadow: "0 3px 10px rgba(92, 78, 48, 0.1)",
            cursor: "pointer",
            textAlign: "left"
          }
        },
        React.createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px dashed #d7cab0", paddingBottom: "6px", marginBottom: "7px" } },
          React.createElement("span", { style: { fontSize: "11px", fontWeight: "800", color: "#5e7f69", letterSpacing: "1px" } }, "🌿 杏林济生 · 医案"),
          React.createElement(
            "span",
            {
              style: {
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: "4px",
                border: "1px solid #c45746",
                color: "#b44332",
                fontWeight: "700",
                background: "#fdf2ef"
              }
            },
            `${c.doctorName || "医者"} 印`
          )
        ),
        React.createElement(
          "div",
          { style: { fontSize: "14px", fontWeight: "800", color: "#2f362a", marginBottom: "4px" } },
          `《${c.formulaName || "调理方"}》`
        ),
        React.createElement(
          "div",
          { style: { fontSize: "11px", color: "#6c705e", marginBottom: "5px" } },
          `患者：${c.patientName || ""} · ${c.syndrome || c.chiefComplaint || "脉象调理"}`
        ),
        firstLine &&
          React.createElement(
            "div",
            {
              style: {
                fontSize: "11px",
                color: "#575b4d",
                background: "rgba(255,255,255,0.7)",
                padding: "5px 7px",
                borderRadius: "7px",
                marginBottom: "6px",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden"
              }
            },
            firstLine
          ),
        c.note &&
          React.createElement(
            "div",
            { style: { fontSize: "11px", color: "#8a5c24", fontStyle: "italic", marginBottom: "5px" } },
            `附言：“${c.note}”`
          ),
        React.createElement(
          "div",
          { style: { fontSize: "10px", color: "#8c917b", display: "flex", justifyContent: "space-between" } },
          React.createElement("span", null, `${(c.herbs || []).length} 味药材`),
          React.createElement("span", { style: { color: "#5e7f69", fontWeight: "700" } }, "点击展开完整医案 ›")
        )
      ),
      expanded &&
        React.createElement(
          "div",
          {
            onClick: () => setExpanded(false),
            style: {
              position: "fixed",
              inset: 0,
              background: "rgba(24, 28, 22, 0.55)",
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px"
            }
          },
          React.createElement(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "100%",
                maxWidth: "360px",
                maxHeight: "82vh",
                overflowY: "auto",
                background: "#fffdf8",
                borderRadius: "16px",
                padding: "16px",
                border: "1.5px solid #d5c7a7",
                color: "#3d4236",
                boxShadow: "0 12px 32px rgba(0,0,0,0.22)"
              }
            },
            React.createElement(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" } },
              React.createElement("strong", { style: { fontSize: "15px" } }, `📜 ${c.patientName} × ${c.doctorName}`),
              React.createElement(
                "button",
                {
                  onClick: () => setExpanded(false),
                  style: { border: "none", background: "#efeae0", borderRadius: "999px", width: "26px", height: "26px", cursor: "pointer" }
                },
                "✕"
              )
            ),
            React.createElement("div", { style: { fontSize: "12px", color: "#5f6554", lineHeight: 1.6, marginBottom: "10px", background: "#f7f3e8", padding: "9px 10px", borderRadius: "10px" } },
              React.createElement("div", null, React.createElement("strong", null, "主诉："), c.chiefComplaint),
              c.pulseTongue && React.createElement("div", null, React.createElement("strong", null, "脉舌："), c.pulseTongue),
              React.createElement("div", null, React.createElement("strong", null, "辨证："), c.syndrome),
              React.createElement("div", null, React.createElement("strong", null, "医嘱："), c.advice)
            ),
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", marginBottom: "6px", color: "#4d6e58" } }, "💬 诊室问诊实录"),
            React.createElement(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" } },
              (c.dialogue || []).map((d, i) =>
                React.createElement(
                  "div",
                  { key: i, style: { fontSize: "12px", lineHeight: 1.5, background: d.isDoctor ? "#eff6f1" : "#faf5ec", padding: "7px 9px", borderRadius: "9px" } },
                  React.createElement("strong", { style: { color: d.isDoctor ? "#466e54" : "#8b571d" } }, `${d.speaker}：`),
                  d.text
                )
              )
            ),
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", marginBottom: "5px", color: "#a44a38" } }, `🍵 方剂：《${c.formulaName}》`),
            React.createElement(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "6px" } },
              (c.herbs || []).map((h, i) =>
                React.createElement("span", { key: i, style: { fontSize: "11px", background: "#f3eee1", padding: "2px 7px", borderRadius: "6px" } }, h)
              )
            ),
            c.usage && React.createElement("div", { style: { fontSize: "11px", color: "#686d5c", marginBottom: "4px" } }, `煎服法：${c.usage}`),
            c.doctorRemark && React.createElement("div", { style: { fontSize: "11px", color: "#8a5228", fontStyle: "italic" } }, `大夫私批：${c.doctorRemark}`)
          )
        )
    );
  }

  // ==========================================
  // 4. 名士开药日常生成器 + 历史医案馆（CelebrityClinicDailyView）
  // ==========================================
  function loadDailyRecords() {
    try {
      const arr = JSON.parse(localStorage.getItem(DAILY_RECORDS_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveDailyRecords(arr) {
    try {
      localStorage.setItem(DAILY_RECORDS_KEY, JSON.stringify((arr || []).slice(0, 50)));
    } catch (e) {}
  }

  function CelebrityClinicDailyView({ preselectedChar, onGoDecoction }) {
    const React = global.React;
    const { useState, useEffect } = React;

    const docs = global.XINGLIN_DOCTORS || {};
    const docNames = global.XINGLIN_DOCTOR_NAMES || Object.keys(docs);

    const [chatChars, setChatChars] = useState(() =>
      global.XinglinClinicEngine ? global.XinglinClinicEngine.getCachedChatCharacters() : []
    );
    const [selectedCharId, setSelectedCharId] = useState(() => (preselectedChar ? String(preselectedChar.id) : "random"));
    const [selectedDocName, setSelectedDocName] = useState("random");
    const [topicHint, setTopicHint] = useState("");
    const [generating, setGenerating] = useState(false);
    const [errorTip, setErrorTip] = useState("");
    const [records, setRecords] = useState(() => loadDailyRecords());
    const [filterChar, setFilterChar] = useState("all");
    const [showDocGallery, setShowDocGallery] = useState(false);
    const [galleryDoc, setGalleryDoc] = useState(docNames[0] || "董奉");

    // 转发弹窗状态
    const [forwardRecord, setForwardRecord] = useState(null);
    const [forwardTargetId, setForwardTargetId] = useState("");
    const [forwardNote, setForwardNote] = useState("");
    const [toastMsg, setToastMsg] = useState("");

    useEffect(() => {
      if (global.XinglinClinicEngine && typeof global.XinglinClinicEngine.refreshChatCharacters === "function") {
        global.XinglinClinicEngine.refreshChatCharacters().then((list) => {
          if (Array.isArray(list)) setChatChars(list);
        });
      }
    }, []);

    useEffect(() => {
      if (preselectedChar && preselectedChar.id !== undefined) {
        setSelectedCharId(String(preselectedChar.id));
      }
    }, [preselectedChar]);

    const showToast = (txt) => {
      setToastMsg(txt);
      setTimeout(() => setToastMsg(""), 2600);
    };

    const handleGenerateDaily = async () => {
      if (generating) return;
      if (chatChars.length === 0) {
        setErrorTip("传讯列表中暂无角色，请先在「传讯」中添加角色后再生成。");
        return;
      }
      setErrorTip("");
      setGenerating(true);

      try {
        const chosenChar =
          selectedCharId === "random"
            ? chatChars[Math.floor(Math.random() * chatChars.length)]
            : chatChars.find((c) => String(c.id) === String(selectedCharId)) || chatChars[0];

        const chosenDocName =
          selectedDocName === "random"
            ? docNames[Math.floor(Math.random() * docNames.length)] || "董奉"
            : selectedDocName;
        const chosenDoc = docs[chosenDocName] || docs["董奉"];

        // 聚合五维上下文
        const charInfo = getCharacterProfileInfo(chosenChar);
        const userInfo = getActiveUserPersona();
        const worldBookText = await getEnabledWorldBookText(1500);
        const doctorPrompt = typeof global.buildXinglinDoctorPrompt === "function"
          ? global.buildXinglinDoctorPrompt(chosenDocName)
          : `坐诊大夫：${chosenDocName}`;
        const chatContext = await getRecentChatContext(chosenChar.id, charInfo.name, userInfo.name, 14);

        const sysPrompt = `你是《代号鸢》杏林济生医馆的「名士开药日常」编剧。请根据提供的【五维真实设定】，创作一段极具活人感、反差萌与角色还原度的看病抓药日常！
严格要求：
1. 双方（就诊名士与坐诊大夫）必须 100% 贴合各自人设、口癖与性格冲突，严禁 OOC 与客服腔；
2. 若传讯聊天上下文中有近期互动、情绪、熬夜/淋雨/拌嘴等细节，必须自然巧妙地融进这次看病的缘由或对话里！
3. 必须严格输出合法 JSON，不要包含 Markdown 代码块或任何多余解释：
{
  "tag": "2~5字今日病机标签（如：心火偏旺/熬夜劳神/嘴硬怕苦）",
  "dialogue": [
    { "speaker": "${chosenDocName}", "isDoctor": true, "text": "大夫台词（可含括号神态动作，40~90字）" },
    { "speaker": "${charInfo.name}", "isDoctor": false, "text": "名士台词（可含括号神态动作，40~90字）" }
  ],
  "diagnosis": {
    "chiefComplaint": "主诉（12~30字）",
    "pulseTongue": "脉象与舌象简评（15~30字）",
    "syndrome": "中医辨证结论（12~25字）",
    "advice": "大夫医嘱（20~45字）"
  },
  "prescription": {
    "name": "古风方剂名（5~10字）",
    "herbs": ["药材1 用量", "药材2 用量", "药材3 用量", "药材4 用量"],
    "usage": "煎服法（15~30字）",
    "doctorRemark": "大夫写在病历角落的一句私批或吐槽（20~45字）"
  }
}
其中 dialogue 数组请生成 4~6 轮有来有往的精彩医患对话。`;

        const userPrompt = `【维度一：就诊名士角色配置】
- 角色姓名：${charInfo.name}（ID：${charInfo.id}）
- MBTI 性格类型：${charInfo.mbti}
- 星座：${charInfo.constellation}
- 语言风格：${charInfo.speechStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}

【维度二：当前用户身份设定（设置-身份配置库）】
- 名称/身份：${userInfo.name}（${userInfo.identity}）
- 性格特点：${userInfo.personality}
- 个人背景：${userInfo.background}

【维度三：已开启的世界书条目】
${worldBookText || "东汉末年乱世，广陵王掌管绣衣楼，诸位名士与医者往来于广陵与天下之间。"}

【维度四：本次坐诊内置医生人设卡】
${doctorPrompt}

【维度五：传讯中 ${charInfo.name} 与 ${userInfo.name} 的近期聊天上下文】
${chatContext || "（暂无近期传讯记录，请结合角色背景与今日契机自然展开）"}

${topicHint.trim() ? `【用户补充的今日看病契机】：${topicHint.trim()}` : "【今日看病契机】：由你结合上述五维上下文自由发挥最有趣的看病理由。"}`;

        const raw = await callLLM([
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt }
        ]);

        const parsed = safeParseJsonLoose(raw);
        if (!parsed || (!Array.isArray(parsed.dialogue) && !parsed.diagnosis)) {
          throw new Error("AI 返回格式解析失败，请点击重试。");
        }

        const newRec = {
          id: `xl_daily_${Date.now()}`,
          createdAt: Date.now(),
          date: new Date().toLocaleDateString(),
          charId: chosenChar.id,
          charName: charInfo.name,
          charAvatar: chosenChar.avatar || chosenChar.avatarId || chosenChar.avatarUrl || "",
          doctorName: chosenDocName,
          doctorTitle: chosenDoc?.title || "坐诊医师",
          doctorColor: chosenDoc?.themeColor || "#6d947c",
          tag: String(parsed.tag || "日常调理"),
          dialogue: Array.isArray(parsed.dialogue) ? parsed.dialogue : [],
          diagnosis: parsed.diagnosis || {
            chiefComplaint: "近来劳神略倦",
            pulseTongue: "脉弦微数",
            syndrome: "气血略滞",
            advice: "按时起居，忌熬夜动怒。"
          },
          prescription: parsed.prescription || {
            name: "杏林安神调理汤",
            herbs: ["茯神 三钱", "白芍 二钱", "甘草 一钱"],
            usage: "水煎温服，一日一帖。",
            doctorRemark: "按时服药，莫要讳疾忌医。"
          }
        };

        const nextRecords = [newRec, ...records];
        setRecords(nextRecords);
        saveDailyRecords(nextRecords);
        setTopicHint("");
        showToast(`✨ 已收录 ${charInfo.name} × ${chosenDocName} 的今日医案`);
      } catch (err) {
        setErrorTip(err.message || "生成失败，请检查 API 设置后重试。");
      } finally {
        setGenerating(false);
      }
    };

    const handleOpenForward = (rec) => {
      setForwardRecord(rec);
      setForwardTargetId(String(rec.charId || (chatChars[0]?.id ?? "")));
      setForwardNote("");
    };

    const handleConfirmForward = async () => {
      if (!forwardRecord) return;
      const target = chatChars.find((c) => String(c.id) === String(forwardTargetId));
      if (!target) {
        showToast("请先选择一位传讯名士");
        return;
      }
      try {
        await sendClinicRecordToChat(target, forwardRecord, forwardNote);
        setForwardRecord(null);
        showToast(`📨 已递给「${target.name}」，去传讯点击触发回复即可看 TA 反应`);
      } catch (e) {
        showToast("转发失败：" + e.message);
      }
    };

    const handleDeleteRecord = (id) => {
      const next = records.filter((r) => r.id !== id);
      setRecords(next);
      saveDailyRecords(next);
    };

    const visibleRecords = filterChar === "all"
      ? records
      : records.filter((r) => String(r.charId) === String(filterChar) || r.charName === filterChar);

    const activeGalleryDoc = docs[galleryDoc] || docs["董奉"];

    return React.createElement(
      "div",
      {
        style: {
          flex: 1,
          height: "100%",
          overflowY: "auto",
          background: "linear-gradient(180deg, #faf7f0 0%, #f3efe4 100%)",
          padding: "12px 14px 24px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          color: "#43483b",
          position: "relative"
        }
      },
      toastMsg &&
        React.createElement(
          "div",
          {
            style: {
              position: "sticky",
              top: 0,
              zIndex: 20,
              background: "#3f5d4a",
              color: "#fff",
              fontSize: "12px",
              padding: "8px 12px",
              borderRadius: "10px",
              textAlign: "center",
              boxShadow: "0 4px 12px rgba(0,0,0,0.16)"
            }
          },
          toastMsg
        ),

      // 1. 生成控制台
      React.createElement(
        "div",
        {
          style: {
            background: "#fff",
            borderRadius: "16px",
            padding: "14px",
            border: "1px solid #e7e0ce",
            boxShadow: "0 2px 10px rgba(80,72,52,0.05)",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }
        },
        React.createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          React.createElement("strong", { style: { fontSize: "14px", color: "#3d4637" } }, "📋 传讯名士 · 开药日常生成器"),
          React.createElement(
            "button",
            {
              onClick: () => setShowDocGallery((v) => !v),
              style: {
                border: "1px solid #d9d0bc",
                background: "#faf7f0",
                color: "#6b705e",
                borderRadius: "999px",
                padding: "3px 9px",
                fontSize: "11px",
                cursor: "pointer"
              }
            },
            showDocGallery ? "收起名医图鉴 ▲" : "🌿 五位名医图鉴 ▼"
          )
        ),

        // 可折叠五位名医图鉴
        showDocGallery &&
          React.createElement(
            "div",
            { style: { background: "#faf7f0", borderRadius: "12px", padding: "10px", border: "1px solid #e7e0ce" } },
            React.createElement(
              "div",
              { style: { display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "8px" } },
              docNames.map((dn) => {
                const d = docs[dn];
                const isSel = dn === galleryDoc;
                return React.createElement(
                  "button",
                  {
                    key: dn,
                    onClick: () => setGalleryDoc(dn),
                    style: {
                      padding: "4px 10px",
                      borderRadius: "999px",
                      border: isSel ? `1.5px solid ${d.themeColor}` : "1px solid #ddd5c2",
                      background: isSel ? d.bgTint : "#fff",
                      color: isSel ? d.themeColor : "#636858",
                      fontSize: "11px",
                      fontWeight: "700",
                      cursor: "pointer"
                    }
                  },
                  dn
                );
              })
            ),
            activeGalleryDoc &&
              React.createElement(
                "div",
                { style: { fontSize: "11px", lineHeight: 1.55, color: "#525748" } },
                React.createElement("div", { style: { fontWeight: "700", color: activeGalleryDoc.themeColor, marginBottom: "3px" } }, `${activeGalleryDoc.name} · ${activeGalleryDoc.title}`),
                React.createElement("div", null, `擅长：${activeGalleryDoc.specialty}`),
                React.createElement("div", null, `性格：${activeGalleryDoc.corePersonality}`)
              )
          ),

        // 选择传讯名士
        React.createElement("div", { style: { fontSize: "11px", color: "#7d8270", fontWeight: "600" } }, "① 选择前来抓药的传讯名士"),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px" } },
          React.createElement(
            "button",
            {
              onClick: () => setSelectedCharId("random"),
              style: {
                flexShrink: 0,
                padding: "5px 10px",
                borderRadius: "999px",
                border: selectedCharId === "random" ? "1.5px solid #6d947c" : "1px solid #e0d8c6",
                background: selectedCharId === "random" ? "#ebf5ee" : "#faf7f0",
                color: selectedCharId === "random" ? "#3b6b4e" : "#636858",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "🎲 随机名士"
          ),
          chatChars.map((c) => {
            const isSel = String(selectedCharId) === String(c.id);
            return React.createElement(
              "button",
              {
                key: c.id,
                onClick: () => setSelectedCharId(String(c.id)),
                style: {
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 10px 4px 5px",
                  borderRadius: "999px",
                  border: isSel ? "1.5px solid #d4943a" : "1px solid #e0d8c6",
                  background: isSel ? "#fff7e5" : "#faf7f0",
                  color: isSel ? "#7d4c0e" : "#5a5f4d",
                  fontSize: "12px",
                  fontWeight: isSel ? "700" : "500",
                  cursor: "pointer"
                }
              },
              global.XinglinClinicEngine && global.XinglinClinicEngine.XinglinAvatar
                ? React.createElement(global.XinglinClinicEngine.XinglinAvatar, {
                    avatar: c.avatar || c.avatarId || c.avatarUrl || "",
                    name: c.name,
                    size: 18,
                    fallbackColor: "#c9b995"
                  })
                : React.createElement(
                    "span",
                    { style: { width: "18px", height: "18px", borderRadius: "50%", background: "#c9b995", color: "#fff", fontSize: "10px", display: "inline-flex", alignItems: "center", justifyContent: "center" } },
                    String(c.name || "?").slice(0, 1)
                  ),
              c.name
            );
          })
        ),

        // 选择坐诊大夫
        React.createElement("div", { style: { fontSize: "11px", color: "#7d8270", fontWeight: "600" } }, "② 选择本次值班坐诊大夫"),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
          React.createElement(
            "button",
            {
              onClick: () => setSelectedDocName("random"),
              style: {
                padding: "5px 10px",
                borderRadius: "999px",
                border: selectedDocName === "random" ? "1.5px solid #6d947c" : "1px solid #e0d8c6",
                background: selectedDocName === "random" ? "#ebf5ee" : "#faf7f0",
                color: selectedDocName === "random" ? "#3b6b4e" : "#636858",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "🎲 随机大夫"
          ),
          docNames.map((dn) => {
            const d = docs[dn];
            const isSel = selectedDocName === dn;
            return React.createElement(
              "button",
              {
                key: dn,
                onClick: () => setSelectedDocName(dn),
                style: {
                  padding: "5px 10px",
                  borderRadius: "999px",
                  border: isSel ? `1.5px solid ${d.themeColor}` : "1px solid #e0d8c6",
                  background: isSel ? d.bgTint : "#faf7f0",
                  color: isSel ? d.themeColor : "#636858",
                  fontSize: "12px",
                  fontWeight: isSel ? "700" : "500",
                  cursor: "pointer"
                }
              },
              dn
            );
          })
        ),

        // 可选看病契机
        React.createElement("input", {
          value: topicHint,
          onChange: (e) => setTopicHint(e.target.value),
          placeholder: "可选：输入今日看病契机（留空则 AI 结合传讯近期上下文自由发挥）",
          style: {
            width: "100%",
            boxSizing: "border-box",
            padding: "9px 12px",
            borderRadius: "10px",
            border: "1px solid #e2d9c6",
            background: "#fcfaf5",
            fontSize: "12px",
            outline: "none"
          }
        }),

        errorTip &&
          React.createElement("div", { style: { fontSize: "12px", color: "#c2452d" } }, errorTip),

        React.createElement(
          "button",
          {
            onClick: handleGenerateDaily,
            disabled: generating,
            style: {
              width: "100%",
              padding: "11px",
              borderRadius: "12px",
              border: "none",
              background: generating ? "#a7bdb0" : "linear-gradient(135deg, #74a587, #59896c)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "700",
              cursor: generating ? "wait" : "pointer",
              boxShadow: "0 4px 12px rgba(89, 137, 108, 0.24)"
            }
          },
          generating ? "✨ 正在结合五维设定撰写医案…" : "✨ 生成今日开药日常"
        )
      ),

      // 2. 历史医案筛选与归档流
      records.length > 0 &&
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", overflowX: "auto" } },
          React.createElement("span", { style: { fontSize: "11px", color: "#7d8270", flexShrink: 0 } }, `医案馆 (${records.length})：`),
          React.createElement(
            "button",
            {
              onClick: () => setFilterChar("all"),
              style: {
                flexShrink: 0,
                padding: "3px 9px",
                borderRadius: "999px",
                border: "none",
                background: filterChar === "all" ? "#6d947c" : "#e9e3d3",
                color: filterChar === "all" ? "#fff" : "#636858",
                fontSize: "11px",
                cursor: "pointer"
              }
            },
            "全部"
          ),
          Array.from(new Set(records.map((r) => r.charName))).map((cn) =>
            React.createElement(
              "button",
              {
                key: cn,
                onClick: () => setFilterChar(cn),
                style: {
                  flexShrink: 0,
                  padding: "3px 9px",
                  borderRadius: "999px",
                  border: "none",
                  background: filterChar === cn ? "#6d947c" : "#e9e3d3",
                  color: filterChar === cn ? "#fff" : "#636858",
                  fontSize: "11px",
                  cursor: "pointer"
                }
              },
              cn
            )
          )
        ),

      visibleRecords.length === 0
        ? React.createElement(
            "div",
            {
              style: {
                background: "#fff",
                borderRadius: "14px",
                padding: "26px 16px",
                textAlign: "center",
                color: "#8c917b",
                fontSize: "12px",
                border: "1px dashed #d8d0bc",
                lineHeight: 1.6
              }
            },
            "尚无名士开药日常记录。选一位传讯名士和坐诊大夫，点击上方按钮即可记录今日诊室趣闻！"
          )
        : visibleRecords.map((rec) =>
            React.createElement(
              "div",
              {
                key: rec.id,
                style: {
                  background: "#fffdf8",
                  borderRadius: "16px",
                  padding: "14px",
                  border: "1px solid #e4dac4",
                  boxShadow: "0 3px 12px rgba(85,75,50,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }
              },
              // 抬头
              React.createElement(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px dashed #e2d8c3", paddingBottom: "8px" } },
                React.createElement(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  global.XinglinClinicEngine && global.XinglinClinicEngine.XinglinAvatar
                    ? React.createElement(global.XinglinClinicEngine.XinglinAvatar, {
                        avatar: rec.charAvatar || "",
                        name: rec.charName,
                        size: 28,
                        fallbackColor: "#c9b995",
                        style: { border: "1.5px solid #d9c496" }
                      })
                    : React.createElement("span", { style: { width: "28px", height: "28px", borderRadius: "50%", background: "#c9b995", color: "#fff", fontSize: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: "700" } }, String(rec.charName || "?").slice(0, 1)),
                  React.createElement(
                    "div",
                    null,
                    React.createElement("div", { style: { fontWeight: "800", fontSize: "14px", color: "#3b4235" } }, `${rec.charName} × ${rec.doctorName}`),
                    React.createElement("div", { style: { fontSize: "10px", color: "#8c917b" } }, `${rec.date} · 坐诊：${rec.doctorTitle || rec.doctorName}`)
                  )
                ),
                React.createElement(
                  "span",
                  {
                    style: {
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "#f4ede0",
                      color: rec.doctorColor || "#6d947c",
                      fontWeight: "700"
                    }
                  },
                  rec.tag
                )
              ),

              // 诊室实录（医患对话）
              React.createElement(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                (rec.dialogue || []).map((line, i) =>
                  React.createElement(
                    "div",
                    {
                      key: i,
                      style: {
                        fontSize: "12px",
                        lineHeight: 1.55,
                        padding: "8px 10px",
                        borderRadius: line.isDoctor ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                        background: line.isDoctor ? "#eef6f1" : "#fbf4e6",
                        border: line.isDoctor ? "1px solid #d5e8dc" : "1px solid #eedec0"
                      }
                    },
                    React.createElement(
                      "strong",
                      { style: { color: line.isDoctor ? (rec.doctorColor || "#466e54") : "#8a561a", marginRight: "4px" } },
                      `${line.speaker}：`
                    ),
                    line.text
                  )
                )
              ),

              // 四诊诊断书
              React.createElement(
                "div",
                {
                  style: {
                    background: "#f7f3e8",
                    borderRadius: "10px",
                    padding: "9px 11px",
                    fontSize: "12px",
                    lineHeight: 1.6,
                    color: "#515647"
                  }
                },
                React.createElement("div", null, React.createElement("strong", null, "🩺 主诉："), rec.diagnosis?.chiefComplaint),
                rec.diagnosis?.pulseTongue && React.createElement("div", null, React.createElement("strong", null, "🔎 脉舌："), rec.diagnosis.pulseTongue),
                React.createElement("div", null, React.createElement("strong", null, "📌 辨证："), rec.diagnosis?.syndrome),
                React.createElement("div", null, React.createElement("strong", null, "📝 医嘱："), rec.diagnosis?.advice)
              ),

              // 今日抓药方剂单
              React.createElement(
                "div",
                {
                  style: {
                    background: "#fff",
                    border: "1px solid #e6dcc6",
                    borderRadius: "10px",
                    padding: "10px 11px"
                  }
                },
                React.createElement("div", { style: { fontSize: "13px", fontWeight: "800", color: "#9c4433", marginBottom: "6px" } }, `🍵 处方：《${rec.prescription?.name || "调理方"}》`),
                React.createElement(
                  "div",
                  { style: { display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "6px" } },
                  (rec.prescription?.herbs || []).map((h, i) =>
                    React.createElement("span", { key: i, style: { fontSize: "11px", background: "#f5f1e6", color: "#4e5344", padding: "2px 7px", borderRadius: "6px" } }, h)
                  )
                ),
                rec.prescription?.usage && React.createElement("div", { style: { fontSize: "11px", color: "#6c7060", marginBottom: "4px" } }, `煎服法：${rec.prescription.usage}`),
                rec.prescription?.doctorRemark &&
                  React.createElement("div", { style: { fontSize: "11px", color: "#8a5324", fontStyle: "italic" } }, `大夫私批：「${rec.prescription.doctorRemark}」`)
              ),

              // 底部操作栏
              React.createElement(
                "div",
                { style: { display: "flex", gap: "7px" } },
                React.createElement(
                  "button",
                  {
                    onClick: () => handleOpenForward(rec),
                    style: {
                      flex: 2,
                      padding: "9px 10px",
                      borderRadius: "10px",
                      border: "none",
                      background: "#6d947c",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer"
                    }
                  },
                  "📨 转发给传讯中的 TA"
                ),
                React.createElement(
                  "button",
                  {
                    onClick: () => {
                      if (global.XinglinClinicEngine?.setActivePrescription) {
                        global.XinglinClinicEngine.setActivePrescription({
                          doctorName: rec.doctorName,
                          themeColor: rec.doctorColor,
                          name: rec.prescription?.name || "杏林调理方",
                          herbs: rec.prescription?.herbs || [],
                          note: rec.prescription?.usage || ""
                        });
                      }
                      if (typeof onGoDecoction === "function") onGoDecoction();
                    },
                    style: {
                      flex: 1.4,
                      padding: "9px 8px",
                      borderRadius: "10px",
                      border: "1px solid #d7cbb3",
                      background: "#fffaf0",
                      color: "#7a5321",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer"
                    }
                  },
                  "🫖 照方煎药"
                ),
                React.createElement(
                  "button",
                  {
                    onClick: () => handleDeleteRecord(rec.id),
                    style: {
                      padding: "9px 10px",
                      borderRadius: "10px",
                      border: "1px solid #e6d8d4",
                      background: "#fdf5f3",
                      color: "#b44a3a",
                      fontSize: "12px",
                      cursor: "pointer"
                    }
                  },
                  "删"
                )
              )
            )
          ),

      // 转发至传讯弹窗
      forwardRecord &&
        React.createElement(
          "div",
          {
            onClick: () => setForwardRecord(null),
            style: {
              position: "fixed",
              inset: 0,
              background: "rgba(24, 28, 22, 0.48)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px"
            }
          },
          React.createElement(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "100%",
                maxWidth: "330px",
                background: "#fffdf8",
                borderRadius: "16px",
                padding: "16px",
                border: "1.5px solid #dcd0b4",
                boxShadow: "0 12px 30px rgba(0,0,0,0.2)"
              }
            },
            React.createElement("div", { style: { fontSize: "15px", fontWeight: "800", marginBottom: "8px", color: "#3b4235" } }, "📨 将医案药方卡递给传讯名士"),
            React.createElement("div", { style: { fontSize: "11px", color: "#7d8270", marginBottom: "8px" } }, "静默发送至该名士的聊天主线，不会自动触发 AI 回复，你可以回到传讯按需点击触发。"),
            React.createElement(
              "select",
              {
                value: forwardTargetId,
                onChange: (e) => setForwardTargetId(e.target.value),
                style: {
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: "10px",
                  border: "1px solid #d9cfb8",
                  background: "#fff",
                  fontSize: "13px",
                  marginBottom: "8px"
                }
              },
              chatChars.map((c) =>
                React.createElement("option", { key: c.id, value: String(c.id) }, `${c.name}${String(c.id) === String(forwardRecord.charId) ? "（本医案主角）" : ""}`)
              )
            ),
            React.createElement("input", {
              value: forwardNote,
              onChange: (e) => setForwardNote(e.target.value),
              placeholder: "可选附言（如：大夫让你按时吃药，别又偷偷倒了）",
              style: {
                width: "100%",
                boxSizing: "border-box",
                padding: "9px 10px",
                borderRadius: "10px",
                border: "1px solid #d9cfb8",
                fontSize: "12px",
                marginBottom: "12px"
              }
            }),
            React.createElement(
              "div",
              { style: { display: "flex", gap: "8px" } },
              React.createElement(
                "button",
                {
                  onClick: () => setForwardRecord(null),
                  style: { flex: 1, padding: "9px", borderRadius: "10px", border: "1px solid #ddd5c2", background: "#f7f4ec", color: "#666", fontSize: "12px", cursor: "pointer" }
                },
                "取消"
              ),
              React.createElement(
                "button",
                {
                  onClick: handleConfirmForward,
                  style: { flex: 1.5, padding: "9px", borderRadius: "10px", border: "none", background: "#6d947c", color: "#fff", fontSize: "12px", fontWeight: "700", cursor: "pointer" }
                },
                "确认递入传讯"
              )
            )
          )
        )
    );
  }

  // ==========================================
  // 5. 挂载导出到全局与 XinglinClinicEngine
  // ==========================================
  global.ClinicRecordCardBubble = ClinicRecordCardBubble;
  global.formatClinicRecordCardForLLM = formatClinicRecordCardForLLM;

  if (global.XinglinClinicEngine) {
    global.XinglinClinicEngine.ConsultationModeGate = ConsultationModeGate;
    global.XinglinClinicEngine.AIConsultationView = AIConsultationView;
    global.XinglinClinicEngine.CelebrityClinicDailyView = CelebrityClinicDailyView;
    global.XinglinClinicEngine.sendClinicRecordToChat = sendClinicRecordToChat;
    global.XinglinClinicEngine.ClinicRecordCardBubble = ClinicRecordCardBubble;
    global.XinglinClinicEngine.formatClinicRecordCardForLLM = formatClinicRecordCardForLLM;
  }
})(window);
