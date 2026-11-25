/**
 * Milvus/couple_wish_bridge.js
 * 情侣空间「愿望清单」独立数据读取 + 传讯双向联动引擎
 * - loadLatestWishForWidget: 纯只读扫描既有 t9_wishlist_<charId>，精准返回最新 1 条心愿（优先未实现）
 * - getWishlistContextForChat: 传讯单聊自动注入近期愿望记忆（至多 5 条未实现 + 2 条已实现，严格隔离群聊）
 * - sendWishCardToChat: 将单条心愿静默写入指定名士传讯主线（chatHistoryStore.saveMessage），绝不自动触发 AI
 * - window.CoupleWishChatCard: 传讯内古风心愿信笺卡片（默认紧凑展示标题与状态，点击 Portal 展卷）
 * - window.formatCoupleWishCardForLLM: 手动点击「触发 AI 回复」时注入心愿卡片完整语义
 * - 零 Emoji（手绘细线矢量 SVG），零新增 localStorage 键
 */
(function (global) {
  "use strict";

  function WishSvg(h, name, { size = 16, color = "currentColor", strokeWidth = 1.75 } = {}) {
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
    if (name === "check") {
      return h("svg", common, h("path", { d: "M5 12.5l4.5 4.5L19 7.5" }));
    }
    if (name === "chevron") {
      return h("svg", common, h("path", { d: "M9 6l6 6-6 6" }));
    }
    // 默认：古风星愿灯笼/星芒
    return h("svg", common,
      h("path", { d: "M12 3.2l2.4 5.1 5.6.8-4.1 3.9 1 5.6L12 15.9 7.1 18.6l1-5.6-4.1-3.9 5.6-.8z" })
    );
  }

  function resolveActiveWishCharId() {
    try {
      if (typeof global.localStorage !== "undefined") {
        const direct = global.localStorage.getItem("t9_current_ta_id") || global.localStorage.getItem("couple_active_char_id");
        if (direct) return String(direct);
        for (let i = 0; i < global.localStorage.length; i++) {
          const k = global.localStorage.key(i);
          if (k && k.startsWith("t9_wishlist_")) {
            const raw = global.localStorage.getItem(k);
            if (raw && raw.length > 10) return k.slice("t9_wishlist_".length);
          }
        }
      }
    } catch (e) {}
    return "";
  }

  function readRawWishlist(charId) {
    const cid = String(charId || "");
    if (!cid || typeof global.localStorage === "undefined") return [];
    try {
      const raw = global.localStorage.getItem(`t9_wishlist_${cid}`);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((w) => w && w.title) : [];
    } catch (e) {
      return [];
    }
  }

  // ==========================================
  // 1. 小组件只读：获取最新 1 条心愿（优先未实现）
  // ==========================================
  function loadLatestWishForWidget({ charId = "", creatorFilter = "all" } = {}) {
    const cid = String(charId || "") || resolveActiveWishCharId();
    const list = readRawWishlist(cid);
    const filtered = list.filter((w) => {
      if (creatorFilter === "user") return w.creator === "user";
      if (creatorFilter === "ta") return w.creator === "ta";
      return true;
    });
    const pending = filtered.filter((w) => !w.done);
    const latest = pending[0] || filtered[0] || null;
    return {
      charId: cid,
      wish: latest,
      totalCount: filtered.length,
      pendingCount: pending.length
    };
  }

  // ==========================================
  // 2. 传讯隐式记忆联动：生成紧凑的愿望清单上下文（严格隔离群聊）
  // ==========================================
  function getWishlistContextForChat(chatData) {
    if (!chatData || !chatData.id) return "";
    const cid = String(chatData.id);
    if (cid.startsWith("group_chat") || chatData.type === "group" || chatData.isGroup) return "";

    const list = readRawWishlist(cid);
    if (!list.length) return "";

    const pending = list.filter((w) => !w.done).slice(0, 5);
    const done = list.filter((w) => w.done).slice(0, 2);
    if (!pending.length && !done.length) return "";

    const lines = [];
    if (pending.length) {
      lines.push("未实现心愿：" + pending.map((w) => `[${w.creator === "user" ? "对方许愿" : "你许愿"}]${String(w.title).slice(0, 28)}`).join("；"));
    }
    if (done.length) {
      lines.push("已实现心愿：" + done.map((w) => String(w.title).slice(0, 24)).join("；"));
    }
    const body = lines.join("\n").slice(0, 240);
    return `\n【情侣空间·愿望清单记忆（可在闲聊或应景时自然提及，切勿生硬背诵）】\n${body}\n`;
  }

  // ==========================================
  // 3. 传讯显式卡片联动：静默发送心愿信笺卡片（绝不自动触发 AI）
  // ==========================================
  async function sendWishCardToChat({ targetChar, wish, note = "" } = {}) {
    if (!targetChar || !targetChar.id || !wish || !wish.title) {
      return { ok: false, error: "MISSING_ARGS" };
    }
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const title = String(wish.title || "").trim();
    const previewText = `[心愿信笺] ${title}`;

    const msg = {
      id: now,
      type: "couple_wish_card",
      isMe: true,
      sender: "me",
      timestamp: now,
      time: timeStr,
      text: previewText,
      content: {
        wishId: String(wish.id || now),
        title,
        category: String(wish.category || "心之所向").trim(),
        creator: wish.creator === "ta" ? "ta" : "user",
        creatorLabel: wish.creator === "ta" ? `${targetChar.name || "TA"}许下的心愿` : "我许下的心愿",
        done: Boolean(wish.done),
        date: String(wish.date || new Date().toISOString().split("T")[0]),
        note: String(note || "").trim()
      }
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
  // 4. 触发 AI 回复时的卡片语义序列化
  // ==========================================
  function formatCoupleWishCardForLLM(m, chatData) {
    const c = (m && m.content) || {};
    const isGroup = String(chatData?.id || "").startsWith("group_chat") || chatData?.type === "group";
    const prefix = isGroup ? "[我]：" : "";
    const lines = [
      `${prefix}【情侣空间 · 心愿信笺卡片】`,
      `心愿内容：${c.title || m?.text || "一条心愿"}`,
      `许愿归属：${c.creatorLabel || (c.creator === "ta" ? "你许下的心愿" : "我许下的心愿")}`,
      `心愿分类：${c.category || "心之所向"}`,
      `当前状态：${c.done ? "已兑现" : "待兑现"}`,
      c.date ? `许愿日期：${c.date}` : "",
      c.note ? `我附带的一句话：「${c.note}」` : "",
      "请结合你自身角色设定、我的身份配置、已开启的世界书、这条心愿信笺以及我们近期传讯上下文，以第一人称自然回应（可温柔应约、商量如何实现或逗趣回应）。"
    ];
    return {
      role: m && m.isMe ? "user" : "assistant",
      content: lines.filter(Boolean).join("\n")
    };
  }

  // ==========================================
  // 5. 传讯聊天页精致心愿信笺卡片（默认紧凑标题，点击 Portal 展卷）
  // ==========================================
  function CoupleWishChatCard({ msg }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState } = React;

    const c = (msg && msg.content) || {};
    const [open, setOpen] = useState(false);
    const title = String(c.title || msg?.text || "心愿信笺").replace(/^\[心愿信笺\]\s*/, "");

    const modalNode = open
      ? h(
          "div",
          {
            onClick: (e) => { if (e.target === e.currentTarget) setOpen(false); },
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 99995,
              background: "rgba(38, 30, 22, 0.46)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "18px",
              fontFamily: "'Noto Serif SC', 'Songti SC', serif"
            }
          },
          h(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "100%",
                maxWidth: "330px",
                background: "#FAF6EE",
                border: "1.5px solid #D8B48A",
                borderRadius: "18px",
                padding: "16px",
                boxShadow: "0 16px 40px rgba(38, 30, 22, 0.28)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                color: "#3E342B"
              }
            },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
              h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", fontWeight: 900, color: "#B85D3B" } },
                WishSvg(h, "star", { size: 16, color: "#B85D3B" }),
                "心愿信笺"
              ),
              h("button", { type: "button", onClick: () => setOpen(false), style: { border: "none", background: "transparent", padding: "4px", cursor: "pointer" } }, WishSvg(h, "close", { size: 17, color: "#6B5A49" }))
            ),
            h(
              "div",
              { style: { background: "#FFFDF8", borderRadius: "12px", border: "1px solid #EAE0CE", padding: "14px 12px", textAlign: "center", fontSize: "14px", fontWeight: 700, lineHeight: 1.7, color: "#3E342B", wordBreak: "break-word" } },
              title
            ),
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "#8C7A68" } },
              h("span", null, `${c.creatorLabel || "心愿"} · ${c.category || "心之所向"}`),
              h("span", { style: { color: c.done ? "#4E7D5B" : "#B85D3B", fontWeight: 700 } }, c.done ? "已兑现" : "待兑现")
            ),
            c.date && h("div", { style: { fontSize: "11px", color: "#A2927E" } }, `许愿日期：${c.date}`),
            c.note && h("div", { style: { fontSize: "12px", color: "#6E553E", background: "#F3EAE0", borderRadius: "9px", padding: "7px 10px" } }, `附言：「${c.note}」`)
          )
        )
      : null;

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          onClick: () => setOpen(true),
          style: {
            background: "linear-gradient(135deg, #FFFDF9 0%, #F7EFE4 100%)",
            border: "1px solid rgba(206, 152, 108, 0.45)",
            borderLeft: `3.5px solid ${c.done ? "#5A8F6D" : "#C96A42"}`,
            borderRadius: "14px",
            padding: "10px 13px",
            minWidth: "196px",
            maxWidth: "268px",
            boxShadow: "0 5px 15px rgba(62, 52, 43, 0.09)",
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
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: c.done ? "linear-gradient(135deg, #6EA482 0%, #4E7D5B 100%)" : "linear-gradient(135deg, #D97B54 0%, #B85230 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }
          },
          WishSvg(h, c.done ? "check" : "star", { size: 17, color: "#FFFDF7" })
        ),
        h(
          "div",
          { style: { flex: 1, minWidth: 0 } },
          h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#3E342B", lineHeight: 1.4, wordBreak: "break-word" } }, title),
          h(
            "div",
            { style: { marginTop: "3px", fontSize: "10px", color: "#9B7B58", display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", null, `心愿信笺 · ${c.done ? "已兑现" : "待兑现"}`),
            WishSvg(h, "chevron", { size: 12, color: "#B85D3B" })
          )
        )
      ),
      modalNode && (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && global.document && global.document.body
        ? global.ReactDOM.createPortal(modalNode, global.document.body)
        : modalNode)
    );
  }

  global.CoupleWishChatCard = CoupleWishChatCard;
  global.formatCoupleWishCardForLLM = formatCoupleWishCardForLLM;
  global.CoupleWishBridge = {
    resolveActiveWishCharId,
    readRawWishlist,
    loadLatestWishForWidget,
    getWishlistContextForChat,
    sendWishCardToChat,
    formatCoupleWishCardForLLM,
    CoupleWishChatCard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.CoupleWishBridge;
  }
})(typeof window !== "undefined" ? window : globalThis);
