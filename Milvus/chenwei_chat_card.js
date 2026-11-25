/**
 * Milvus/chenwei_chat_card.js
 * 「谶纬小摊 2.2」独立传讯卦签卡片引擎
 * - sendChenweiCardToChat: 静默写入指定名士的传讯聊天主线（chatHistoryStore.saveMessage），绝不自动触发 AI 回复
 * - window.ChenweiChatCard: 传讯内精致古风卡片（默认只显示标题，点击展卷可切换古诗签/东汉童谣/图谶秘语）
 * - window.formatChenweiOracleCardForLLM: 用户手动点击「触发 AI 回复」时，将卡片完整内容注入传讯既有 5 维大模型上下文
 * - 零 Emoji（全量手绘细线矢量 SVG），零新增 localStorage 键
 */
(function (global) {
  "use strict";

  function CardSvg(h, name, { size = 16, color = "currentColor", strokeWidth = 1.75 } = {}) {
    const common = {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block", flexShrink: 0 }
    };
    if (name === "close") {
      return h("svg", common, h("path", { d: "M6 6l12 12M18 6L6 18" }));
    }
    if (name === "chevron") {
      return h("svg", common, h("path", { d: "M9 6l6 6-6 6" }));
    }
    // 默认：古风八卦星盘
    return h("svg", common,
      h("polygon", { points: "12,2.5 18.7,5.3 21.5,12 18.7,18.7 12,21.5 5.3,18.7 2.5,12 5.3,5.3" }),
      h("circle", { cx: 12, cy: 12, r: 4.2 }),
      h("path", { d: "M12 7.8a2.1 2.1 0 0 1 0 4.2 2.1 2.1 0 0 0 0 4.2" }),
      h("circle", { cx: 12, cy: 9.9, r: 0.6, fill: color }),
      h("circle", { cx: 12, cy: 14.1, r: 0.6, fill: color })
    );
  }

  function buildCardContent({ record, activeThread = null, sourceKind = "player", note = "" }) {
    const v = (record && record.verses && typeof record.verses === "object") ? record.verses : {};
    const poem = String(v.poem || record?.oracleVerse || "").trim();
    const ballad = String(v.ballad || "").trim();
    const chenyu = String(v.chenyu || "").trim();
    const hexagram = String(record?.hexagram || "谶纬卦签").trim();
    const isCharSource = sourceKind === "char";
    const ownerName = isCharSource ? String(record?.charName || "名士") : "我";
    const buildTitle = isCharSource ? String(record?.buildTitle || "").trim() : "";
    const cardTitle = isCharSource
      ? (buildTitle ? `${ownerName} · ${buildTitle}（${hexagram}）` : `${ownerName} · ${hexagram}`)
      : hexagram;

    let interpretationSummary = "";
    let interpreterName = "";
    if (activeThread && Array.isArray(activeThread.turns) && activeThread.turns.length) {
      const lastCharTurn = [...activeThread.turns].reverse().find((t) => t.role === "char");
      if (lastCharTurn && lastCharTurn.text) {
        interpretationSummary = String(lastCharTurn.text).trim().slice(0, 180);
        interpreterName = String(activeThread.charName || "").trim();
      }
    }

    return {
      recordId: String(record?.id || `cw_${Date.now()}`),
      sourceKind: isCharSource ? "char" : "player",
      ownerName,
      title: cardTitle,
      hexagram,
      buildTitle,
      question: String(record?.question || "").trim(),
      verses: { poem, ballad, chenyu },
      chenyuGloss: String(record?.chenyuGloss || "").trim(),
      structureReading: String(record?.structureReading || "").trim(),
      advice: String(record?.advice || "").trim(),
      charNote: String(record?.charNote || "").trim(),
      interpreterName,
      interpretationSummary,
      note: String(note || "").trim(),
      date: new Date().toLocaleDateString()
    };
  }

  // ==========================================
  // 1. 静默抄送卦签卡片至名士传讯主线（绝不自动触发 AI 回复）
  // ==========================================
  async function sendChenweiCardToChat({ targetChar, record, activeThread = null, sourceKind = "player", note = "" } = {}) {
    if (!targetChar || !targetChar.id || !record) {
      return { ok: false, error: "MISSING_TARGET_OR_RECORD" };
    }
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const content = buildCardContent({ record, activeThread, sourceKind, note });
    const previewText = `[谶纬卦签] ${content.title}`;

    const msg = {
      id: now,
      type: "chenwei_oracle_card",
      isMe: true,
      sender: "me",
      timestamp: now,
      time: timeStr,
      text: previewText,
      content
    };

    let saved = false;
    try {
      if (global.chatHistoryStore && typeof global.chatHistoryStore.saveMessage === "function") {
        await global.chatHistoryStore.saveMessage(targetChar.id, msg);
        saved = true;
      } else if (global.chatHistoryStore && typeof global.chatHistoryStore.appendMessage === "function") {
        await global.chatHistoryStore.appendMessage(targetChar.id, msg);
        saved = true;
      }
    } catch (e) {}

    if (!saved && typeof global.localStorage !== "undefined") {
      try {
        const key = "t8_chat_history_" + targetChar.id;
        const arr = JSON.parse(global.localStorage.getItem(key) || "[]");
        arr.push(msg);
        global.localStorage.setItem(key, JSON.stringify(arr));
        saved = true;
      } catch (e) {}
    }

    // 同步更新传讯列表最近一条预览文案（仅更新既有存储，不新增 localStorage 键）
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.get === "function" && typeof global.chatCharacterStore.save === "function") {
        const cur = await global.chatCharacterStore.get(targetChar.id);
        if (cur) {
          await global.chatCharacterStore.save({ ...cur, lastMessage: previewText, lastTime: timeStr, updatedAt: now });
        }
      }
    } catch (e) {}

    try {
      if (typeof global.dispatchEvent === "function") {
        global.dispatchEvent(new CustomEvent("t8_chat_history_updated", { detail: { charId: String(targetChar.id), msg } }));
      }
    } catch (e) {}

    return { ok: saved, msg, targetName: targetChar.name || "名士" };
  }

  // ==========================================
  // 2. 传讯 AI 回复上下文序列化（点击「触发AI回复」时由 app.min.js 调用）
  // ==========================================
  function formatChenweiOracleCardForLLM(m, chatData) {
    const c = (m && m.content) || {};
    const v = c.verses || {};
    const isGroup = String(chatData?.id || "").startsWith("group_chat") || chatData?.type === "group";
    const prefix = isGroup ? "[我]：" : "";
    const lines = [
      `${prefix}【谶纬小摊 · 卦签卡片】`,
      `卡片标题：${c.title || c.hexagram || "谶纬卦签"}`,
      c.sourceKind === "char" ? `卦签归属：${c.ownerName || "某位名士"}的专属谶纬` : "卦签归属：我亲自搭积木所起之卦",
      c.question ? `所问之事：${c.question}` : "",
      v.poem ? `古诗签：\n${v.poem}` : "",
      v.ballad ? `东汉童谣：\n${v.ballad}` : "",
      v.chenyu ? `图谶秘语：\n${v.chenyu}` : "",
      c.chenyuGloss ? `图谶注脚：${c.chenyuGloss}` : "",
      c.structureReading ? `司天监象意：${c.structureReading}` : "",
      c.advice ? `司天监建言：${c.advice}` : "",
      c.charNote ? `原主手札：${c.charNote}` : "",
      c.interpretationSummary ? `此前解签参考（${c.interpreterName || "名士"}）：${c.interpretationSummary}` : "",
      c.note ? `我附带的一句话：「${c.note}」` : "",
      "请结合你自身角色设定、我的身份配置、已开启的世界书、以上卦签卡片的全部细节以及我们近期传讯上下文，以第一人称自然回应这支卦签（可根据你的性格与立场坦诚解读、安抚或试探）。"
    ];
    return {
      role: m && m.isMe ? "user" : "assistant",
      content: lines.filter(Boolean).join("\n")
    };
  }

  // ==========================================
  // 3. 传讯聊天页精致卡片组件（默认只显示标题，点击展卷）
  // ==========================================
  function ChenweiChatCard({ msg }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState } = React;

    const c = (msg && msg.content) || {};
    const v = c.verses || {};
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState("poem");

    const title = String(c.title || c.hexagram || msg?.text || "谶纬卦签").replace(/^\[谶纬卦签\]\s*/, "");
    const forms = [
      { id: "poem", label: "古诗签", seal: "诗签" },
      { id: "ballad", label: "东汉童谣", seal: "童谣" },
      { id: "chenyu", label: "图谶秘语", seal: "图谶" }
    ];
    const activeText = String(v[tab] || v.poem || "（签文暂缺）").trim();

    return h(
      React.Fragment,
      null,
      // 默认折叠卡片：极简宣纸卷轴，仅显示标题
      h(
        "div",
        {
          onClick: () => setOpen(true),
          style: {
            background: "linear-gradient(135deg, #FDF9F0 0%, #F5ECDC 100%)",
            border: "1px solid rgba(196, 128, 86, 0.42)",
            borderLeft: "3.5px solid #C84B31",
            borderRadius: "14px",
            padding: "11px 13px",
            minWidth: "198px",
            maxWidth: "268px",
            boxShadow: "0 5px 16px rgba(62, 52, 43, 0.10)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontFamily: "'Noto Serif SC', 'Songti SC', serif"
          }
        },
        h(
          "div",
          {
            style: {
              width: "34px",
              height: "34px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #C84B31 0%, #9E3420 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 6px rgba(158, 52, 32, 0.25)"
            }
          },
          CardSvg(h, "oracle", { size: 18, color: "#FFFDF7" })
        ),
        h(
          "div",
          { style: { flex: 1, minWidth: 0 } },
          h(
            "div",
            {
              style: {
                fontSize: "13px",
                fontWeight: 800,
                color: "#3E342B",
                lineHeight: 1.38,
                wordBreak: "break-word"
              }
            },
            title
          ),
          h(
            "div",
            {
              style: {
                marginTop: "3px",
                fontSize: "10px",
                color: "#9B7B58",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }
            },
            h("span", null, "谶纬卦签 · 点此展卷"),
            CardSvg(h, "chevron", { size: 12, color: "#B84A39" })
          )
        )
      ),

      // 点击展卷详情浮层（Portal 挂载至 body，防止被聊天滚动容器裁切或 transform 偏移）
      open &&
        (() => {
          const modalNode = h(
            "div",
            {
              onClick: (e) => { if (e.target === e.currentTarget) setOpen(false); },
              style: {
                position: "fixed",
                inset: 0,
                zIndex: 99995,
                background: "rgba(38, 30, 22, 0.48)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
                fontFamily: "'Noto Serif SC', 'Songti SC', serif"
              }
            },
            h(
              "div",
              {
                onClick: (e) => e.stopPropagation(),
                style: {
                  width: "100%",
                  maxWidth: "352px",
                  maxHeight: "82vh",
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  background: "#FAF6EE",
                  border: "1.5px solid #D4A03C",
                  borderRadius: "18px",
                  padding: "15px",
                  boxShadow: "0 16px 40px rgba(38, 30, 22, 0.30)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  color: "#3E342B"
                }
              },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "14.5px", fontWeight: 900, color: "#C84B31" } },
                  CardSvg(h, "oracle", { size: 17, color: "#C84B31" }),
                  h("span", null, title)
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => setOpen(false),
                    style: { border: "none", background: "transparent", padding: "4px", cursor: "pointer" }
                  },
                  CardSvg(h, "close", { size: 18, color: "#6B5A49" })
                )
              ),
              c.question && h("div", { style: { fontSize: "12px", color: "#7D6B59" } }, `所问：${c.question}`),

              // 三体裁切换按钮
              h(
                "div",
                { style: { display: "flex", gap: "5px", background: "#EFE7D8", padding: "4px", borderRadius: "10px" } },
                forms.map((fm) => {
                  const act = tab === fm.id;
                  return h("button", {
                    key: fm.id,
                    type: "button",
                    onClick: () => setTab(fm.id),
                    style: {
                      flex: 1,
                      border: "none",
                      borderRadius: "7px",
                      padding: "5px 4px",
                      fontSize: "11px",
                      fontWeight: 800,
                      background: act ? "#C84B31" : "transparent",
                      color: act ? "#FFFDF7" : "#5C4738",
                      cursor: "pointer"
                    }
                  }, fm.label);
                })
              ),

              h(
                "div",
                {
                  style: {
                    background: "#FFFDF8",
                    border: "1px solid #EAE0CE",
                    borderLeft: "3.5px solid #C84B31",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    whiteSpace: "pre-line",
                    fontSize: "13px",
                    fontWeight: 700,
                    lineHeight: 1.8,
                    textAlign: tab === "ballad" ? "center" : "left"
                  }
                },
                activeText
              ),
              tab === "chenyu" && c.chenyuGloss &&
                h("div", { style: { fontSize: "11.5px", color: "#7B5630", background: "#F8EEDB", borderRadius: "8px", padding: "6px 8px", border: "1px dashed #D8B884" } }, c.chenyuGloss),
              c.structureReading &&
                h("div", { style: { fontSize: "12px", lineHeight: 1.65, color: "#4A3C31" } }, c.structureReading),
              c.advice &&
                h("div", { style: { fontSize: "12px", lineHeight: 1.6, color: "#5C4738", background: "#F2EAE0", borderRadius: "9px", padding: "8px 10px" } }, `建言：${c.advice}`),
              c.charNote &&
                h("div", { style: { fontSize: "12px", lineHeight: 1.65, color: "#4A3C31", background: "#F8F3EA", borderRadius: "9px", padding: "8px 10px" } }, c.charNote),
              c.note &&
                h("div", { style: { fontSize: "11.5px", color: "#8C6239", borderTop: "1px dashed #DFD1B8", paddingTop: "6px" } }, `附言：「${c.note}」`)
            )
          );
          if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && global.document && global.document.body) {
            return global.ReactDOM.createPortal(modalNode, global.document.body);
          }
          return modalNode;
        })()
    );
  }

  global.ChenweiChatCard = ChenweiChatCard;
  global.formatChenweiOracleCardForLLM = formatChenweiOracleCardForLLM;
  global.ChenweiChatCardEngine = {
    sendChenweiCardToChat,
    buildCardContent,
    formatChenweiOracleCardForLLM,
    ChenweiChatCard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.ChenweiChatCardEngine;
  }
})(typeof window !== "undefined" ? window : globalThis);
