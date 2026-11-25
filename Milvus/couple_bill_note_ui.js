/**
 * Milvus/couple_bill_note_ui.js
 * 情侣空间「共同记账」批注展卷行 + 增量防重合并 + 主屏小组件账本只读引擎
 * - window.CoupleBillItemRow: 保持清爽单行，带 note 批注的条目显示手绘小角标，点击展开古风便签全貌
 * - window.CoupleBillDataHelper.mergeTaBills: 名士再次生成 5 条时置顶增量追加并按指纹去重，绝不覆盖历史账单
 * - window.CoupleBillDataHelper.loadBillsForWidget: 纯只读扫描既有 t9_bills_<charId>，支持最新 5 条截取与全量详情
 * - 零 Emoji（手绘细线矢量 SVG），零新增 localStorage 键
 */
(function (global) {
  "use strict";

  function BillSvg(h, name, { size = 13, color = "currentColor", rotated = false } = {}) {
    const common = {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth: 1.9,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        display: "block",
        flexShrink: 0,
        transition: "transform 0.18s ease",
        transform: rotated ? "rotate(180deg)" : "rotate(0deg)"
      }
    };
    if (name === "chevron") {
      return h("svg", common, h("path", { d: "M6 9l6 6 6-6" }));
    }
    return h("svg", common,
      h("path", { d: "M5 4.5h14v15l-3.5-2-3.5 2-3.5-2-3.5 2v-15z" }),
      h("path", { d: "M8.5 9h7M8.5 12.5h5" })
    );
  }

  // 业务指纹：用于增量追加时防重复
  function billFingerprint(b) {
    if (!b) return "";
    const d = String(b.date || "").trim();
    const t = b.type === "income" ? "income" : "expense";
    const a = Number(parseFloat(b.amount) || 0).toFixed(2);
    const c = String(b.category || "").trim();
    return `${d}|${t}|${a}|${c}`;
  }

  // 名士记账增量前置合并：新生成的 5 条置顶，完整保留旧账单，自动去重且保证 id 唯一
  function mergeTaBills(prevList, incomingList) {
    const prev = Array.isArray(prevList) ? prevList : [];
    const incoming = Array.isArray(incomingList) ? incomingList : [];
    const seenFp = new Set(prev.map(billFingerprint).filter(Boolean));
    const seenId = new Set(prev.map((b) => String(b && b.id)));
    const fresh = [];
    const nowBase = Date.now();

    for (let i = 0; i < incoming.length; i++) {
      const raw = incoming[i];
      if (!raw || !raw.category) continue;
      const fp = billFingerprint(raw);
      if (fp && seenFp.has(fp)) continue;
      if (fp) seenFp.add(fp);

      let uid = raw.id !== undefined && raw.id !== null ? raw.id : (nowBase + i);
      while (seenId.has(String(uid))) {
        uid = `${nowBase}_${i}_${Math.floor(Math.random() * 10000)}`;
      }
      seenId.add(String(uid));

      fresh.push({
        ...raw,
        id: uid,
        type: raw.type === "income" ? "income" : "expense",
        amount: parseFloat(raw.amount) || 0,
        note: String(raw.note || raw.remark || raw.detail || raw.desc || "").trim()
      });
    }

    return [...fresh, ...prev];
  }

  function buildRecentHintText(prevList, maxCount = 5) {
    const prev = Array.isArray(prevList) ? prevList : [];
    if (!prev.length) return "";
    const recent = prev.slice(0, maxCount).map((b) => `${b.category}（${b.type === "income" ? "+" : "-"}¥${b.amount}）`).join("、");
    return `\n【已有近期账目（请续写全新的 5 笔不同日常收支，切勿与以下重复）】：${recent}`;
  }

  // ==========================================
  // 1. 情侣空间「共同记账」可点击展开 note 批注行
  // ==========================================
  function CoupleBillItemRow({ bill, charName = "TA", isTa = true }) {
    const React = global.React;
    if (!React || !bill) return null;
    const h = React.createElement;
    const { useState } = React;
    const [expanded, setExpanded] = useState(false);

    const noteText = String(bill.note || bill.remark || bill.detail || "").trim();
    const isExp = bill.type !== "income";
    const hasDetail = Boolean(noteText) || String(bill.category || "").length > 16;

    return h(
      "div",
      {
        onClick: () => hasDetail && setExpanded((v) => !v),
        style: {
          padding: "10px 4px",
          borderBottom: "1px solid #f4f1ea",
          cursor: hasDetail ? "pointer" : "default",
          transition: "background 0.15s ease"
        }
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px"
          }
        },
        h(
          "div",
          { style: { flex: 1, minWidth: 0 } },
          h(
            "div",
            {
              style: {
                color: "#5a5f4d",
                fontSize: "14px",
                fontWeight: 500,
                lineHeight: 1.4,
                wordBreak: "break-word"
              }
            },
            bill.category
          ),
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "7px",
                marginTop: "3px",
                fontSize: "11px",
                color: "#aaa"
              }
            },
            h("span", null, bill.date),
            noteText &&
              h(
                "span",
                {
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "2px",
                    padding: "1px 6px",
                    borderRadius: "999px",
                    background: expanded ? "#F3E6DC" : "#F5F2EA",
                    color: expanded ? "#B85535" : "#8A7B66",
                    fontSize: "10px",
                    fontWeight: 700
                  }
                },
                expanded ? "收起批注" : "批注",
                BillSvg(h, "chevron", { size: 11, color: expanded ? "#B85535" : "#8A7B66", rotated: expanded })
              )
          )
        ),
        h(
          "span",
          {
            style: {
              color: isExp ? "#D6724B" : "#5A8F6D",
              fontWeight: "bold",
              fontSize: "15px",
              flexShrink: 0
            }
          },
          isExp ? "-" : "+",
          "¥",
          bill.amount
        )
      ),

      // 点击展开后的古风便签批注全貌
      expanded &&
        h(
          "div",
          {
            style: {
              marginTop: "8px",
              background: "#FAF6EE",
              border: "1px solid #EAE0CE",
              borderLeft: `3px solid ${isExp ? "#D6724B" : "#5A8F6D"}`,
              borderRadius: "9px",
              padding: "8px 10px",
              fontSize: "12px",
              lineHeight: 1.65,
              color: "#5C5246",
              wordBreak: "break-word",
              whiteSpace: "pre-wrap"
            }
          },
          noteText
            ? h(
                React.Fragment,
                null,
                h("div", { style: { fontSize: "10.5px", fontWeight: 700, color: "#9C8466", marginBottom: "3px" } }, `${isTa ? (charName || "TA") : "我"}的账本批注`),
                h("div", null, noteText)
              )
            : h("div", { style: { color: "#8C8275" } }, `类目全称：${bill.category}`)
        )
    );
  }

  // ==========================================
  // 2. 主屏小组件统一只读账本加载器（纯只读既有 t9_bills_<charId>，零新增 localStorage）
  // ==========================================
  function resolveActiveCoupleCharId() {
    try {
      if (typeof global.localStorage !== "undefined") {
        const direct = global.localStorage.getItem("t9_current_ta_id") || global.localStorage.getItem("couple_active_char_id");
        if (direct) return String(direct);
        // 兜底：扫描已有非空 t9_bills_* 键
        for (let i = 0; i < global.localStorage.length; i++) {
          const k = global.localStorage.key(i);
          if (k && k.startsWith("t9_bills_")) {
            const raw = global.localStorage.getItem(k);
            if (raw && raw.length > 25) return k.slice("t9_bills_".length);
          }
        }
      }
    } catch (e) {}
    return "";
  }

  function loadBillsForWidget({ charId = "", ledgerTab = "ta", limit = 5 } = {}) {
    const cid = String(charId || "") || resolveActiveCoupleCharId();
    if (!cid || typeof global.localStorage === "undefined") {
      return {
        charId: cid,
        taBills: [],
        userBills: [],
        allItems: [],
        displayItems: [],
        expense: 0,
        income: 0
      };
    }

    let taBills = [];
    let userBills = [];
    try {
      const raw = global.localStorage.getItem(`t9_bills_${cid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        taBills = Array.isArray(parsed.taBills) ? parsed.taBills : [];
        userBills = Array.isArray(parsed.userBills) ? parsed.userBills : [];
      }
    } catch (e) {}

    const taggedTa = taBills.map((b) => ({ ...b, _owner: "ta" }));
    const taggedUser = userBills.map((b) => ({ ...b, _owner: "user" }));

    let allItems = taggedTa;
    if (ledgerTab === "user") {
      allItems = taggedUser;
    } else if (ledgerTab === "both") {
      allItems = [...taggedTa, ...taggedUser].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }

    const expense = allItems
      .filter((b) => b.type !== "income")
      .reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
    const income = allItems
      .filter((b) => b.type === "income")
      .reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);

    const safeLimit = Math.max(1, Number(limit) || 5);
    return {
      charId: cid,
      taBills: taggedTa,
      userBills: taggedUser,
      allItems,
      displayItems: allItems.slice(0, safeLimit),
      expense: Math.round(expense * 100) / 100,
      income: Math.round(income * 100) / 100
    };
  }

  global.CoupleBillItemRow = CoupleBillItemRow;
  global.CoupleBillDataHelper = {
    billFingerprint,
    mergeTaBills,
    buildRecentHintText,
    resolveActiveCoupleCharId,
    loadBillsForWidget
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { CoupleBillItemRow, CoupleBillDataHelper: global.CoupleBillDataHelper };
  }
})(typeof window !== "undefined" ? window : globalThis);
