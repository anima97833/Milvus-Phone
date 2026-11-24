/**
 * Milvus/couple_bill_clone_engine.js
 * 情侣空间 ·「共同记账 · 我的账本」跨角色一键复刻独立引擎
 * - 纯只读扫描既有 localStorage `t9_bills_*`，零新增 localStorage 键
 * - 业务指纹去重（日期|收支|金额|类目），杜绝多次复刻重复记账与总支出翻倍
 * - 防串名预警：类目提及原角色名时标记 ⚠️ 并默认取消勾选
 * - 严格仅更新 userBills，100% 不触碰 taBills（TA 的账本）
 * - 极简图标化交互（⧉ 微胶囊 + Portal 轻浮层），Milvus/app.min.js 仅需 1 行挂载
 */
(function (global) {
  "use strict";

  const BILL_KEY_PREFIX = "t9_bills_";

  function getTodayStr(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function normalizeAmount(val) {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.round(num * 100) / 100;
  }

  function buildBillFingerprint(bill) {
    if (!bill || typeof bill !== "object") return "";
    const amt = normalizeAmount(bill.amount);
    if (amt === null) return "";
    const type = bill.type === "income" ? "income" : "expense";
    const date = String(bill.date || "").trim();
    const cat = String(bill.category || "").trim();
    return `${date}|${type}|${amt.toFixed(2)}|${cat}`;
  }

  function detectBillCharMention(category, sourceCharNames = []) {
    const body = String(category || "").trim();
    if (!body || !Array.isArray(sourceCharNames) || sourceCharNames.length === 0) return [];
    const ignore = new Set(["其他空间", "名士", "角色", "TA", "我"]);
    const hits = [];
    for (const raw of sourceCharNames) {
      const name = String(raw || "").trim();
      if (!name || name.length < 2 || ignore.has(name)) continue;
      if (body.includes(name) && !hits.includes(name)) hits.push(name);
    }
    return hits;
  }

  function collectStorageKeys(storage) {
    if (!storage) return [];
    const keys = [];
    if (typeof storage.length === "number" && typeof storage.key === "function") {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k) keys.push(k);
      }
      return keys;
    }
    return Object.keys(storage);
  }

  function readStorageItem(storage, key) {
    if (!storage) return null;
    if (typeof storage.getItem === "function") return storage.getItem(key);
    return storage[key] !== undefined ? storage[key] : null;
  }

  /**
   * 扫描所有其他角色的 userBills，按业务指纹跨角色去重并自动排除当前账本已有记录
   */
  function scanCrossCharUserBills(storage, currentCharId, currentUserBills = [], charNameMap = {}) {
    const curId = String(currentCharId || "");
    const existingFps = new Set();
    for (const b of Array.isArray(currentUserBills) ? currentUserBills : []) {
      const fp = buildBillFingerprint(b);
      if (fp) existingFps.add(fp);
    }

    const keys = collectStorageKeys(storage).filter(
      (k) => typeof k === "string" && k.startsWith(BILL_KEY_PREFIX)
    );
    const dedupMap = new Map();

    for (const k of keys) {
      const sourceCharId = k.slice(BILL_KEY_PREFIX.length);
      if (!sourceCharId || (curId && sourceCharId === curId)) continue;
      let parsed = null;
      try {
        const raw = readStorageItem(storage, k);
        if (raw) parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch (e) {
        parsed = null;
      }
      const list = Array.isArray(parsed?.userBills) ? parsed.userBills : [];
      const sourceCharName = (charNameMap && charNameMap[sourceCharId]) || "其他空间";

      for (const bill of list) {
        const amt = normalizeAmount(bill?.amount);
        if (amt === null) continue;
        const fp = buildBillFingerprint(bill);
        if (!fp || existingFps.has(fp)) continue;

        const type = bill.type === "income" ? "income" : "expense";
        const date = String(bill.date || "").trim();
        const category = String(bill.category || "").trim() || (type === "income" ? "收入" : "消费");

        if (!dedupMap.has(fp)) {
          dedupMap.set(fp, {
            fp,
            type,
            category,
            amount: amt,
            date,
            sourceCharIds: [sourceCharId],
            sourceCharNames: [sourceCharName],
            primaryCharName: sourceCharName,
            mentionHits: []
          });
        } else {
          const item = dedupMap.get(fp);
          if (!item.sourceCharIds.includes(sourceCharId)) item.sourceCharIds.push(sourceCharId);
          if (!item.sourceCharNames.includes(sourceCharName)) item.sourceCharNames.push(sourceCharName);
        }
      }
    }

    const result = Array.from(dedupMap.values()).map((item) => ({
      ...item,
      mentionHits: detectBillCharMention(item.category, item.sourceCharNames)
    }));

    return result.sort((a, b) => {
      if (b.date !== a.date) return String(b.date).localeCompare(String(a.date));
      return b.amount - a.amount;
    });
  }

  function filterBillsByScope(candidates = [], scope = "all", todayStr = getTodayStr()) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (scope === "today") {
      return list.filter((c) => c.date === todayStr);
    }
    if (scope === "month") {
      const monthPrefix = String(todayStr || "").slice(0, 7);
      return monthPrefix ? list.filter((c) => String(c.date || "").startsWith(monthPrefix)) : list;
    }
    return list;
  }

  function pickSmartDefaultScope(candidates = [], todayStr = getTodayStr()) {
    if (filterBillsByScope(candidates, "today", todayStr).length > 0) return "today";
    if (filterBillsByScope(candidates, "month", todayStr).length > 0) return "month";
    return "all";
  }

  /**
   * 将选中的复刻账单安全合并进 currentUserBills（生成唯一 id、再次按指纹防重、按日期倒序）
   */
  function mergeClonedBills(currentUserBills = [], selectedCandidates = [], nowMs = Date.now()) {
    const base = Array.isArray(currentUserBills) ? [...currentUserBills] : [];
    const existingFps = new Set(base.map(buildBillFingerprint).filter(Boolean));
    const added = [];

    (Array.isArray(selectedCandidates) ? selectedCandidates : []).forEach((cand, idx) => {
      const amt = normalizeAmount(cand?.amount);
      if (amt === null) return;
      const fp = buildBillFingerprint(cand);
      if (!fp || existingFps.has(fp)) return;
      existingFps.add(fp);
      added.push({
        id: `bill_clone_${nowMs}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        type: cand.type === "income" ? "income" : "expense",
        category: String(cand.category || "").trim() || (cand.type === "income" ? "收入" : "消费"),
        amount: amt,
        date: String(cand.date || getTodayStr()).trim(),
        clonedFromCharName: cand.primaryCharName || (Array.isArray(cand.sourceCharNames) ? cand.sourceCharNames.join("·") : "")
      });
    });

    const merged = [...added, ...base];
    merged.sort((a, b) => {
      const da = String(a?.date || "");
      const db = String(b?.date || "");
      if (db !== da) return db.localeCompare(da);
      return String(b?.id || "").localeCompare(String(a?.id || ""));
    });
    return { merged, addedCount: added.length };
  }

  // ==========================================
  // 极简图标化 React 组件：BillCloneTrigger
  // ==========================================
  function BillCloneTrigger({ currentCharId, userBills, onApplyClonedBills }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useMemo } = React;

    const [open, setOpen] = useState(false);
    const [charNameMap, setCharNameMap] = useState({});
    const [scope, setScope] = useState("today");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [checkedFps, setCheckedFps] = useState({});
    const [toast, setToast] = useState("");

    const todayStr = getTodayStr();

    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          let list = [];
          if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
            list = await global.chatCharacterStore.getAll();
          } else if (typeof global.localStorage !== "undefined") {
            list = JSON.parse(global.localStorage.getItem("t8_chat_list") || "[]");
          }
          if (!alive) return;
          const map = {};
          (list || []).forEach((c) => {
            if (c && c.id) map[String(c.id)] = c.name || c.profile?.name || "名士";
          });
          setCharNameMap(map);
        } catch (e) {}
      })();
      return () => {
        alive = false;
      };
    }, [currentCharId, open]);

    const allCandidates = useMemo(() => {
      if (typeof global.localStorage === "undefined") return [];
      return scanCrossCharUserBills(global.localStorage, currentCharId, userBills, charNameMap);
    }, [currentCharId, userBills, charNameMap, open]);

    const scopedCandidates = useMemo(
      () => filterBillsByScope(allCandidates, scope, todayStr),
      [allCandidates, scope, todayStr]
    );

    const sourceNames = useMemo(() => {
      const set = new Set();
      scopedCandidates.forEach((c) => c.sourceCharNames.forEach((n) => set.add(n)));
      return Array.from(set);
    }, [scopedCandidates]);

    const visibleCandidates = useMemo(() => {
      if (sourceFilter === "all") return scopedCandidates;
      return scopedCandidates.filter((c) => c.sourceCharNames.includes(sourceFilter));
    }, [scopedCandidates, sourceFilter]);

    const openPicker = () => {
      const smartScope = pickSmartDefaultScope(allCandidates, todayStr);
      setScope(smartScope);
      setSourceFilter("all");
      const initList = filterBillsByScope(allCandidates, smartScope, todayStr);
      const nextChecked = {};
      initList.forEach((c) => {
        // 含原角色名（⚠️）默认不勾选，防串戏
        if (!c.mentionHits || c.mentionHits.length === 0) nextChecked[c.fp] = true;
      });
      setCheckedFps(nextChecked);
      setOpen(true);
    };

    const handleSwitchScope = (nextScope) => {
      setScope(nextScope);
      setSourceFilter("all");
      const list = filterBillsByScope(allCandidates, nextScope, todayStr);
      const nextChecked = {};
      list.forEach((c) => {
        if (!c.mentionHits || c.mentionHits.length === 0) nextChecked[c.fp] = true;
      });
      setCheckedFps(nextChecked);
    };

    const flashToast = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(""), 1800);
    };

    const applyList = (targetList) => {
      if (!targetList || targetList.length === 0) return;
      const { merged, addedCount } = mergeClonedBills(userBills, targetList);
      if (addedCount > 0 && typeof onApplyClonedBills === "function") {
        onApplyClonedBills(merged);
        flashToast(`✓ +${addedCount}`);
      }
      setOpen(false);
    };

    const selectedList = visibleCandidates.filter((c) => checkedFps[c.fp]);
    const safeAllList = visibleCandidates.filter((c) => !c.mentionHits || c.mentionHits.length === 0);

    const modalNode =
      open &&
      h(
        "div",
        {
          onClick: (e) => {
            if (e.target === e.currentTarget) setOpen(false);
          },
          style: {
            position: "fixed",
            inset: 0,
            zIndex: 99995,
            background: "rgba(38, 35, 30, 0.42)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }
        },
        h(
          "div",
          {
            style: {
              width: "100%",
              maxWidth: "360px",
              maxHeight: "76vh",
              background: "#FAF8F5",
              borderRadius: "20px",
              border: "1px solid #EAE6D6",
              boxShadow: "0 16px 40px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              padding: "14px"
            }
          },
          // 顶栏：时间范围胶囊 + 关闭
          h(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "10px" } },
            h(
              "div",
              { style: { display: "inline-flex", background: "#EFECE6", borderRadius: "999px", padding: "2px", gap: "2px" } },
              [
                { id: "today", label: "今日" },
                { id: "month", label: "本月" },
                { id: "all", label: "全部" }
              ].map((tab) => {
                const active = scope === tab.id;
                return h(
                  "button",
                  {
                    key: tab.id,
                    type: "button",
                    onClick: () => handleSwitchScope(tab.id),
                    style: {
                      border: "none",
                      borderRadius: "999px",
                      padding: "4px 10px",
                      fontSize: "11.5px",
                      fontWeight: active ? 700 : 500,
                      background: active ? "#D6724B" : "transparent",
                      color: active ? "#FFFFFF" : "#78716C",
                      cursor: "pointer"
                    }
                  },
                  tab.label
                );
              })
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => setOpen(false),
                style: { border: "none", background: "#EFECE6", color: "#666", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer", fontSize: "13px" }
              },
              "✕"
            )
          ),

          // 来源角色过滤条（≥2 个来源时显示）
          sourceNames.length > 1 &&
            h(
              "div",
              { style: { display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "8px" } },
              ["all", ...sourceNames].map((sn) => {
                const active = sourceFilter === sn;
                return h(
                  "button",
                  {
                    key: sn,
                    type: "button",
                    onClick: () => setSourceFilter(sn),
                    style: {
                      border: active ? "1px solid #D6724B" : "1px solid #E5E0D8",
                      background: active ? "#FDF0E6" : "#FFFFFF",
                      color: active ? "#D6724B" : "#78716C",
                      borderRadius: "999px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      cursor: "pointer"
                    }
                  },
                  sn === "all" ? "全部" : sn
                );
              })
            ),

          // 账单勾选列表
          h(
            "div",
            { style: { flex: 1, minHeight: "100px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", paddingRight: "2px" } },
            visibleCandidates.length === 0
              ? h(
                  "div",
                  { style: { textAlign: "center", color: "#A8A29E", fontSize: "12px", padding: "32px 0" } },
                  "✓ 暂无可复刻项"
                )
              : visibleCandidates.map((item) => {
                  const checked = Boolean(checkedFps[item.fp]);
                  const hasWarn = item.mentionHits && item.mentionHits.length > 0;
                  const isExp = item.type === "expense";
                  return h(
                    "div",
                    {
                      key: item.fp,
                      onClick: () => setCheckedFps((prev) => ({ ...prev, [item.fp]: !prev[item.fp] })),
                      style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "8px",
                        padding: "8px 10px",
                        borderRadius: "12px",
                        background: checked ? "#FFFFFF" : "rgba(255,255,255,0.55)",
                        border: checked ? "1px solid #E8C5B5" : "1px solid #EFECE6",
                        cursor: "pointer"
                      }
                    },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 } },
                      h("input", {
                        type: "checkbox",
                        checked,
                        onChange: () => {},
                        style: { accentColor: "#D6724B", cursor: "pointer", flexShrink: 0 }
                      }),
                      h(
                        "div",
                        { style: { minWidth: 0, flex: 1 } },
                        h(
                          "div",
                          { style: { fontSize: "12.5px", fontWeight: 600, color: "#44403C", display: "flex", alignItems: "center", gap: "4px" } },
                          h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.category),
                          hasWarn &&
                            h(
                              "span",
                              { title: `含「${item.mentionHits.join("、")}」，默认未勾选`, style: { fontSize: "11px", flexShrink: 0 } },
                              "⚠️"
                            )
                        ),
                        h(
                          "div",
                          { style: { fontSize: "10.5px", color: "#A8A29E", display: "flex", gap: "6px" } },
                          h("span", null, item.date),
                          h("span", null, `· ${item.sourceCharNames.join(" / ")}`)
                        )
                      )
                    ),
                    h(
                      "span",
                      { style: { fontSize: "13px", fontWeight: 700, color: isExp ? "#D6724B" : "#5A8F6D", flexShrink: 0 } },
                      `${isExp ? "-" : "+"}¥${item.amount}`
                    )
                  );
                })
          ),

          // 底栏：极简图标双按钮（⚡ 一键复刻全部安全项 / ✓ 复刻所选）
          visibleCandidates.length > 0 &&
            h(
              "div",
              { style: { display: "flex", gap: "8px", marginTop: "10px" } },
              h(
                "button",
                {
                  type: "button",
                  disabled: safeAllList.length === 0,
                  title: `一键复刻全部安全项 (${safeAllList.length} 笔)`,
                  onClick: () => applyList(safeAllList),
                  style: {
                    flex: 1,
                    padding: "8px",
                    borderRadius: "12px",
                    border: "1px solid #E2B46D",
                    background: "#FFF8EB",
                    color: "#9A5B13",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: safeAllList.length === 0 ? "not-allowed" : "pointer",
                    opacity: safeAllList.length === 0 ? 0.5 : 1
                  }
                },
                `⚡ ${safeAllList.length}`
              ),
              h(
                "button",
                {
                  type: "button",
                  disabled: selectedList.length === 0,
                  title: `复刻已勾选的 ${selectedList.length} 笔账单`,
                  onClick: () => applyList(selectedList),
                  style: {
                    flex: 1.4,
                    padding: "8px",
                    borderRadius: "12px",
                    border: "none",
                    background: "#D6724B",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: selectedList.length === 0 ? "not-allowed" : "pointer",
                    opacity: selectedList.length === 0 ? 0.5 : 1
                  }
                },
                `✓ ${selectedList.length}`
              )
            )
        )
      );

    const hasNew = allCandidates.length > 0;
    const portalModal =
      modalNode && global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined"
        ? global.ReactDOM.createPortal(modalNode, document.body)
        : modalNode;

    return h(
      React.Fragment,
      null,
      h(
        "button",
        {
          type: "button",
          onClick: openPicker,
          title: hasNew ? `跨角色复刻我的账单（可复刻 ${allCandidates.length} 笔）` : "跨角色复刻我的账单（已全部同步）",
          style: {
            border: hasNew ? "1px solid #E8B9A3" : "1px solid #E5E0D8",
            background: toast ? "#5A8F6D" : hasNew ? "#FDF0E6" : "#F5F3EF",
            color: toast ? "#FFFFFF" : hasNew ? "#D6724B" : "#A8A29E",
            borderRadius: "999px",
            padding: "2px 7px",
            fontSize: "11px",
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            lineHeight: 1.2
          }
        },
        toast || (hasNew ? `⧉ ${allCandidates.length}` : "⧉")
      ),
      portalModal
    );
  }

  const api = {
    BILL_KEY_PREFIX,
    getTodayStr,
    buildBillFingerprint,
    detectBillCharMention,
    scanCrossCharUserBills,
    filterBillsByScope,
    pickSmartDefaultScope,
    mergeClonedBills,
    BillCloneTrigger
  };

  global.CoupleBillCloneEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

