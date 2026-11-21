/**
 * Milvus/api_quota_app.js
 * 中转站 AI 调用计数与自定义配额监控系统（P0）
 * - window.apiQuotaTracker: 核心状态、跨日重置、按「站点 × 模型」规则扣减、流水记录
 * - 全局顶部横幅通知（自动挂载于 document.body，z-index: 99999，不阻挡点击）
 * - window.ApiQuotaSettingsCard: 挂载于「设置 → API 配置中心 → API 存储库」上方
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "t8_api_quota_store_v1";

  function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function nowTimeStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function roundMoney(n) {
    const v = Number(n);
    if (isNaN(v)) return 0;
    return Math.round(v * 10000) / 10000;
  }

  function formatMoney(n) {
    const v = roundMoney(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 1 && v !== 0 ? 3 : 2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function normalizeSiteKey(urlOrName) {
    if (!urlOrName) return "default";
    let s = String(urlOrName).trim().toLowerCase();
    s = s.replace(/\/+(v1\/)?(api\/)?chat\/completions\/?$/i, "");
    s = s.replace(/\/+v1\/?$/i, "");
    s = s.replace(/\/+$/g, "");
    return s || "default";
  }

  function makeRuleKey(siteUrl, model) {
    return `${normalizeSiteKey(siteUrl)}::${String(model || "*").trim() || "*"}`;
  }

  function createDefaultState() {
    return {
      enabled: false,
      showGlobalBanner: true,
      onlyCountSuccess: true,
      blockWhenExhausted: false,
      totalCalls: 0,
      todayDate: todayStr(),
      todayCalls: 0,
      rules: {},
      recentLogs: []
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...createDefaultState(), ...parsed, rules: parsed.rules || {}, recentLogs: Array.isArray(parsed.recentLogs) ? parsed.recentLogs : [] };
      }
    } catch (e) { }
    return createDefaultState();
  }

  let _state = loadState();
  const _listeners = new Set();

  function notifyListeners() {
    _listeners.forEach((fn) => {
      try { fn({ ..._state }); } catch (e) { }
    });
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (e) { }
    notifyListeners();
  }

  function ensureDailyReset() {
    const today = todayStr();
    let changed = false;
    if (_state.todayDate !== today) {
      _state.todayDate = today;
      _state.todayCalls = 0;
      changed = true;
    }
    Object.keys(_state.rules || {}).forEach((k) => {
      const r = _state.rules[k];
      if (r && r.mode === "daily_count" && r.lastResetDate !== today) {
        r.dailyUsed = 0;
        r.lastResetDate = today;
        changed = true;
      }
    });
    if (changed) saveState();
  }

  // ==================== 全局顶部横幅通知（独立 DOM，全站可用） ====================
  let _bannerTimer = null;
  function showGlobalQuotaBanner({ title, subtitle, level = "normal" }) {
    if (typeof document === "undefined") return;
    let host = document.getElementById("t8-api-quota-banner-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "t8-api-quota-banner-host";
      host.style.cssText =
        "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none;width:92%;max-width:380px;display:flex;justify-content:center;";
      document.body.appendChild(host);
    }

    const palette =
      level === "danger"
        ? { bg: "rgba(254, 242, 242, 0.96)", border: "#FCA5A5", title: "#B91C1C", sub: "#DC2626", icon: "⚠️" }
        : level === "warn"
          ? { bg: "rgba(255, 247, 237, 0.96)", border: "#FDBA74", title: "#9A3412", sub: "#C2410C", icon: "⚡" }
          : { bg: "rgba(255, 255, 255, 0.95)", border: "rgba(17,24,39,0.12)", title: "#111827", sub: "#4B5563", icon: "✨" };

    host.innerHTML = "";
    const pill = document.createElement("div");
    pill.style.cssText = `
      pointer-events:auto;
      display:flex;align-items:center;gap:10px;
      background:${palette.bg};
      border:1px solid ${palette.border};
      backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      border-radius:16px;padding:9px 14px;
      box-shadow:0 8px 24px rgba(0,0,0,0.12);
      font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;
      max-width:100%;box-sizing:border-box;
      opacity:0;transform:translateY(-10px);
      transition:opacity 0.25s ease,transform 0.25s cubic-bezier(0.22,1,0.36,1);
    `;
    pill.innerHTML = `
      <span style="font-size:15px;flex-shrink:0;">${palette.icon}</span>
      <div style="min-width:0;flex:1;">
        <div style="font-size:12px;font-weight:700;color:${palette.title};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
        ${subtitle ? `<div style="font-size:11px;color:${palette.sub};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subtitle}</div>` : ""}
      </div>
    `;
    pill.onclick = () => {
      pill.style.opacity = "0";
      pill.style.transform = "translateY(-10px)";
    };
    host.appendChild(pill);
    requestAnimationFrame(() => {
      pill.style.opacity = "1";
      pill.style.transform = "translateY(0)";
    });

    if (_bannerTimer) clearTimeout(_bannerTimer);
    _bannerTimer = setTimeout(() => {
      pill.style.opacity = "0";
      pill.style.transform = "translateY(-10px)";
    }, 3400);
  }

  function getRuleStatusText(rule) {
    if (!rule) return "未设限额 · 仅计数";
    if (rule.mode === "daily_count") {
      const rem = Math.max(0, (Number(rule.dailyLimit) || 0) - (Number(rule.dailyUsed) || 0));
      return `今日剩余 ${rem}/${rule.dailyLimit} 次`;
    }
    if (rule.mode === "total_count") {
      return `剩余 ${Math.max(0, Number(rule.totalRemaining) || 0)} 次`;
    }
    if (rule.mode === "balance") {
      return `剩余 ${rule.currency || "¥"}${formatMoney(rule.balance)}（每次 -${rule.currency || "¥"}${formatMoney(rule.costPerCall)}）`;
    }
    return `累计调用 ${rule.ruleTotalCalls || 0} 次`;
  }

  const apiQuotaTracker = {
    getState() {
      ensureDailyReset();
      return { ..._state, rules: { ..._state.rules } };
    },
    subscribe(fn) {
      _listeners.add(fn);
      return () => _listeners.delete(fn);
    },
    setEnabled(val) {
      ensureDailyReset();
      _state.enabled = Boolean(val);
      saveState();
    },
    setPreference(key, val) {
      ensureDailyReset();
      _state[key] = val;
      saveState();
    },
    getRuleFor(siteUrl, model) {
      ensureDailyReset();
      const exactKey = makeRuleKey(siteUrl, model);
      if (_state.rules[exactKey]) return { key: exactKey, rule: _state.rules[exactKey] };
      const wildcardKey = makeRuleKey(siteUrl, "*");
      if (_state.rules[wildcardKey]) return { key: wildcardKey, rule: _state.rules[wildcardKey] };
      return null;
    },
    upsertRule(ruleInput) {
      ensureDailyReset();
      const key = makeRuleKey(ruleInput.siteKey || ruleInput.siteUrl, ruleInput.model);
      const prev = _state.rules[key] || {};
      _state.rules[key] = {
        id: prev.id || `rule_${Date.now()}`,
        siteKey: normalizeSiteKey(ruleInput.siteKey || ruleInput.siteUrl),
        siteName: ruleInput.siteName || normalizeSiteKey(ruleInput.siteKey || ruleInput.siteUrl),
        model: String(ruleInput.model || "*").trim() || "*",
        mode: ruleInput.mode || "daily_count",
        dailyLimit: Number(ruleInput.dailyLimit) || 50,
        dailyUsed: ruleInput.dailyUsed !== undefined ? Number(ruleInput.dailyUsed) : (prev.dailyUsed || 0),
        lastResetDate: todayStr(),
        totalLimit: Number(ruleInput.totalLimit) || 100,
        totalRemaining: ruleInput.totalRemaining !== undefined ? Number(ruleInput.totalRemaining) : (Number(ruleInput.totalLimit) || 100),
        currency: ruleInput.currency || "¥",
        balance: roundMoney(ruleInput.balance !== undefined ? ruleInput.balance : (prev.balance || 0)),
        costPerCall: roundMoney(ruleInput.costPerCall !== undefined ? ruleInput.costPerCall : 0.05),
        enableTokenBilling: Boolean(ruleInput.enableTokenBilling),
        inputPricePer1M: roundMoney(ruleInput.inputPricePer1M !== undefined ? ruleInput.inputPricePer1M : (prev.inputPricePer1M ?? 2)),
        outputPricePer1M: roundMoney(ruleInput.outputPricePer1M !== undefined ? ruleInput.outputPricePer1M : (prev.outputPricePer1M ?? 8)),
        warnThreshold: Number(ruleInput.warnThreshold) || 15,
        ruleTotalCalls: prev.ruleTotalCalls || 0
      };
      saveState();
      return _state.rules[key];
    },
    deleteRule(ruleKey) {
      if (_state.rules[ruleKey]) {
        delete _state.rules[ruleKey];
        saveState();
      }
    },
    topUpRule(ruleKey, amount) {
      ensureDailyReset();
      const r = _state.rules[ruleKey];
      if (!r) return;
      if (r.mode === "balance") {
        r.balance = roundMoney((Number(r.balance) || 0) + (Number(amount) || 0));
      } else if (r.mode === "total_count") {
        r.totalRemaining = Math.max(0, (Number(r.totalRemaining) || 0) + (Number(amount) || 0));
        r.totalLimit = Math.max(Number(r.totalLimit) || 0, r.totalRemaining);
      } else if (r.mode === "daily_count") {
        r.dailyUsed = 0;
        r.lastResetDate = todayStr();
      }
      saveState();
    },
    clearLogs() {
      _state.recentLogs = [];
      saveState();
    },
    resetCounts() {
      _state.totalCalls = 0;
      _state.todayCalls = 0;
      _state.todayDate = todayStr();
      _state.recentLogs = [];
      saveState();
    },
    checkCanCall({ siteUrl = "", siteName = "", model = "" }) {
      ensureDailyReset();
      if (!_state.enabled || !_state.blockWhenExhausted) return { allowed: true };
      const matched = this.getRuleFor(siteUrl || siteName, model);
      if (!matched || !matched.rule) return { allowed: true };
      const r = matched.rule;
      const label = `${r.siteName || siteName || "当前站点"} · ${model || r.model}`;
      if (r.mode === "daily_count" && (Number(r.dailyLimit) || 0) - (Number(r.dailyUsed) || 0) <= 0) {
        const msg = `${label} 今日额度已用尽（${r.dailyUsed}/${r.dailyLimit}），已拦截请求`;
        if (_state.showGlobalBanner) showGlobalQuotaBanner({ title: "已拦截 AI 请求", subtitle: msg, level: "danger" });
        return { allowed: false, reason: msg };
      }
      if (r.mode === "total_count" && (Number(r.totalRemaining) || 0) <= 0) {
        const msg = `${label} 总次数已耗尽，请充值或关闭拦截`;
        if (_state.showGlobalBanner) showGlobalQuotaBanner({ title: "已拦截 AI 请求", subtitle: msg, level: "danger" });
        return { allowed: false, reason: msg };
      }
      if (r.mode === "balance" && (Number(r.balance) || 0) <= 0) {
        const msg = `${label} 剩余余额不足（${r.currency || "¥"}0），已拦截请求`;
        if (_state.showGlobalBanner) showGlobalQuotaBanner({ title: "已拦截 AI 请求", subtitle: msg, level: "danger" });
        return { allowed: false, reason: msg };
      }
      return { allowed: true };
    },
    recordCall({ siteUrl = "", siteName = "", model = "", success = true, usage = null }) {
      ensureDailyReset();
      const shouldCount = success || !_state.onlyCountSuccess;
      const labelSite = siteName || normalizeSiteKey(siteUrl) || "默认接口";
      const labelModel = model || "未知模型";

      if (!shouldCount) {
        if (_state.enabled && _state.showGlobalBanner) {
          showGlobalQuotaBanner({
            title: `${labelSite} · ${labelModel}`,
            subtitle: "本次调用失败（未扣减额度）",
            level: "warn"
          });
        }
        return;
      }

      _state.totalCalls = (_state.totalCalls || 0) + 1;
      _state.todayCalls = (_state.todayCalls || 0) + 1;

      const matched = this.getRuleFor(siteUrl || siteName, model);
      let deltaText = "-1 次";
      let remainingText = `总计第 ${_state.totalCalls} 次（今日 ${_state.todayCalls} 次）`;
      let bannerLevel = "normal";

      if (_state.enabled && matched && matched.rule) {
        const r = matched.rule;
        r.ruleTotalCalls = (r.ruleTotalCalls || 0) + 1;
        if (r.mode === "daily_count") {
          r.dailyUsed = (r.dailyUsed || 0) + 1;
          const rem = Math.max(0, (r.dailyLimit || 0) - r.dailyUsed);
          deltaText = "-1 次";
          remainingText = `今日剩余 ${rem}/${r.dailyLimit} 次`;
          const pct = r.dailyLimit > 0 ? (rem / r.dailyLimit) * 100 : 100;
          if (rem <= 0) bannerLevel = "danger";
          else if (pct <= (r.warnThreshold || 15)) bannerLevel = "warn";
        } else if (r.mode === "total_count") {
          r.totalRemaining = Math.max(0, (r.totalRemaining || 0) - 1);
          deltaText = "-1 次";
          remainingText = `剩余 ${r.totalRemaining} 次`;
          const pct = r.totalLimit > 0 ? (r.totalRemaining / r.totalLimit) * 100 : 100;
          if (r.totalRemaining <= 0) bannerLevel = "danger";
          else if (pct <= (r.warnThreshold || 15)) bannerLevel = "warn";
        } else if (r.mode === "balance") {
          let cost = roundMoney(r.costPerCall || 0);
          if (r.enableTokenBilling && usage && (usage.prompt_tokens || usage.completion_tokens || usage.total_tokens)) {
            const inTok = Number(usage.prompt_tokens) || 0;
            const outTok = Number(usage.completion_tokens) || Math.max(0, (Number(usage.total_tokens) || 0) - inTok);
            cost = roundMoney((inTok / 1e6) * (Number(r.inputPricePer1M) || 0) + (outTok / 1e6) * (Number(r.outputPricePer1M) || 0));
          }
          r.balance = roundMoney(Math.max(0, (r.balance || 0) - cost));
          const cur = r.currency || "¥";
          deltaText = `-${cur}${formatMoney(cost)}`;
          remainingText = `剩余 ${cur}${formatMoney(r.balance)}`;
          if (r.balance <= 0) bannerLevel = "danger";
          else if (cost > 0 && r.balance <= cost * 5) bannerLevel = "warn";
        } else {
          deltaText = "+1 次";
          remainingText = `该模型累计 ${r.ruleTotalCalls} 次`;
        }
      }

      const tokens = usage && (usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0))) || 0;
      _state.recentLogs = [
        {
          id: Date.now() + Math.random(),
          time: nowTimeStr(),
          siteName: labelSite,
          model: labelModel,
          deltaText,
          remainingText,
          success,
          tokens
        },
        ...(_state.recentLogs || [])
      ].slice(0, 50);

      saveState();

      if (_state.enabled && _state.showGlobalBanner) {
        showGlobalQuotaBanner({
          title: `${labelSite} · ${labelModel} (${deltaText})`,
          subtitle: `${remainingText}${tokens > 0 ? ` · ${tokens} tokens` : ""}`,
          level: bannerLevel
        });
      }
    }
  };

  // ==================== 设置页「API 次数总计」卡片（位于 API 存储库上方） ====================
  const ApiQuotaSettingsCard = ({ currentConfig, configs = [], selectedConfigIndex = -1 }) => {
    const { useState, useEffect } = React;
    const [qState, setQState] = useState(() => apiQuotaTracker.getState());
    const [showEditor, setShowEditor] = useState(false);
    const [showRuleList, setShowRuleList] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [form, setForm] = useState({
      siteKey: "",
      siteName: "",
      model: "",
      mode: "daily_count",
      dailyLimit: 50,
      dailyUsed: 0,
      totalLimit: 100,
      totalRemaining: 100,
      currency: "¥",
      balance: 10,
      costPerCall: 0.05
    });

    useEffect(() => {
      return apiQuotaTracker.subscribe((next) => setQState(next));
    }, []);

    const activeCfg =
      (selectedConfigIndex >= 0 && configs[selectedConfigIndex]) ||
      (currentConfig && currentConfig.url ? currentConfig : configs[0]) ||
      null;
    const activeMatched = activeCfg ? apiQuotaTracker.getRuleFor(activeCfg.url || activeCfg.name, activeCfg.model) : null;
    const ruleEntries = Object.entries(qState.rules || {});

    const openEditorFor = (cfgOrRule) => {
      const siteUrl = cfgOrRule?.siteKey || cfgOrRule?.url || activeCfg?.url || "";
      const siteName = cfgOrRule?.siteName || cfgOrRule?.name || activeCfg?.name || normalizeSiteKey(siteUrl);
      const model = cfgOrRule?.model || activeCfg?.model || "";
      const existing = apiQuotaTracker.getRuleFor(siteUrl, model)?.rule;
      setForm({
        siteKey: siteUrl,
        siteName: existing?.siteName || siteName,
        model: existing?.model || model,
        mode: existing?.mode || "daily_count",
        dailyLimit: existing?.dailyLimit ?? 50,
        dailyUsed: existing?.dailyUsed ?? 0,
        totalLimit: existing?.totalLimit ?? 100,
        totalRemaining: existing?.totalRemaining ?? 100,
        currency: existing?.currency || "¥",
        balance: existing?.balance ?? 10,
        costPerCall: existing?.costPerCall ?? 0.05,
        enableTokenBilling: Boolean(existing?.enableTokenBilling),
        inputPricePer1M: existing?.inputPricePer1M ?? 2,
        outputPricePer1M: existing?.outputPricePer1M ?? 8
      });
      setShowEditor(true);
    };

    const handleSaveRule = () => {
      if (!form.siteKey.trim() && !form.siteName.trim()) {
        alert("请先填写或选择一个中转站配置！");
        return;
      }
      apiQuotaTracker.upsertRule({
        ...form,
        siteKey: form.siteKey.trim() || form.siteName.trim()
      });
      setShowEditor(false);
    };

    return React.createElement(
      "div",
      {
        style: {
          backgroundColor: "#FFFFFF",
          borderRadius: "16px",
          padding: "18px 20px",
          marginBottom: "20px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          border: "1px solid #F0F2F5"
        }
      },
      /* 顶部标题 + 计数 + 总开关 */
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" } },
        React.createElement(
          "div",
          null,
          React.createElement(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
            React.createElement("span", { style: { fontSize: "16px", fontWeight: "700", color: "#333" } }, "API 次数总计"),
            React.createElement(
              "span",
              { style: { fontSize: "11px", fontWeight: "700", background: "#EEF2FF", color: "#4338CA", padding: "2px 8px", borderRadius: "999px" } },
              `总计 ${qState.totalCalls} 次 · 今日 ${qState.todayCalls} 次`
            )
          ),
          React.createElement(
            "div",
            { style: { fontSize: "11.5px", color: "#888", marginTop: "4px" } },
            qState.enabled ? "已开启额度跟踪与全局调用横幅通知" : "开启后可自定义各中转站模型次数/余额，并在调用时弹横幅"
          )
        ),
        React.createElement(
          "div",
          {
            role: "switch",
            "aria-checked": qState.enabled,
            onClick: () => apiQuotaTracker.setEnabled(!qState.enabled),
            style: {
              width: "46px",
              height: "26px",
              borderRadius: "999px",
              backgroundColor: qState.enabled ? "#34C759" : "#D1D5DB",
              position: "relative",
              cursor: "pointer",
              transition: "background-color 0.2s",
              flexShrink: 0
            }
          },
          React.createElement("div", {
            style: {
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              backgroundColor: "#FFFFFF",
              position: "absolute",
              top: "2px",
              left: qState.enabled ? "22px" : "2px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.22)",
              transition: "left 0.2s"
            }
          })
        )
      ),
      /* 开启后的配置摘要与操作栏 */
      qState.enabled &&
      React.createElement(
        "div",
        { style: { marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #F3F4F6", display: "flex", flexDirection: "column", gap: "10px" } },
        activeCfg &&
        React.createElement(
          "div",
          { style: { background: "#F8F9FB", borderRadius: "12px", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", border: "1px solid #ECEEF2" } },
          React.createElement(
            "div",
            { style: { minWidth: 0 } },
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, `当前：${activeCfg.name || normalizeSiteKey(activeCfg.url)} · ${activeCfg.model || "未选模型"}`),
            React.createElement("div", { style: { fontSize: "11px", color: "#4E7E8E", marginTop: "2px", fontWeight: "600" } }, getRuleStatusText(activeMatched?.rule))
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => openEditorFor(activeCfg),
              style: { border: "none", background: "#111827", color: "#FFFFFF", padding: "6px 10px", borderRadius: "10px", fontSize: "11px", fontWeight: "600", cursor: "pointer", flexShrink: 0 }
            },
            activeMatched ? "修改额度" : "配置额度"
          )
        ),
        React.createElement(
          "div",
          { style: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" } },
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => openEditorFor(activeCfg || {}),
              style: { border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#374151", padding: "6px 11px", borderRadius: "10px", fontSize: "11.5px", fontWeight: "600", cursor: "pointer" }
            },
            "+ 新增模型规则"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => {
                setShowRuleList(!showRuleList);
                if (!showRuleList) setShowLogs(false);
              },
              style: { border: "1px solid #E5E7EB", background: showRuleList ? "#111827" : "#FFFFFF", color: showRuleList ? "#FFFFFF" : "#374151", padding: "6px 11px", borderRadius: "10px", fontSize: "11.5px", fontWeight: "600", cursor: "pointer" }
            },
            `已配规则 (${ruleEntries.length})`
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => {
                setShowLogs(!showLogs);
                if (!showLogs) setShowRuleList(false);
              },
              style: { border: "1px solid #E5E7EB", background: showLogs ? "#111827" : "#FFFFFF", color: showLogs ? "#FFFFFF" : "#374151", padding: "6px 11px", borderRadius: "10px", fontSize: "11.5px", fontWeight: "600", cursor: "pointer" }
            },
            `调用流水 (${(qState.recentLogs || []).length})`
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => {
                if (confirm("确定将总调用计数与今日计数归零吗？")) apiQuotaTracker.resetCounts();
              },
              style: { border: "none", background: "transparent", color: "#9CA3AF", padding: "6px 8px", fontSize: "11px", cursor: "pointer", marginLeft: "auto" }
            },
            "清空计数"
          )
        ),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "11.5px", color: "#4B5563" } },
          React.createElement(
            "label",
            { style: { display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" } },
            React.createElement("input", {
              type: "checkbox",
              checked: qState.showGlobalBanner,
              onChange: (e) => apiQuotaTracker.setPreference("showGlobalBanner", e.target.checked)
            }),
            "每次调用弹出全局横幅"
          ),
          React.createElement(
            "label",
            { style: { display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" } },
            React.createElement("input", {
              type: "checkbox",
              checked: qState.onlyCountSuccess,
              onChange: (e) => apiQuotaTracker.setPreference("onlyCountSuccess", e.target.checked)
            }),
            "仅成功返回时扣减"
          ),
          React.createElement(
            "label",
            { style: { display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" } },
            React.createElement("input", {
              type: "checkbox",
              checked: Boolean(qState.blockWhenExhausted),
              onChange: (e) => apiQuotaTracker.setPreference("blockWhenExhausted", e.target.checked)
            }),
            "额度耗尽时拦截请求"
          )
        ),
        /* 已配规则折叠列表 */
        showRuleList &&
        React.createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" } },
          ruleEntries.length === 0
            ? React.createElement("div", { style: { fontSize: "11.5px", color: "#9CA3AF", textAlign: "center", padding: "10px" } }, "暂未自定义任何模型规则")
            : ruleEntries.map(([rKey, r]) =>
              React.createElement(
                "div",
                {
                  key: rKey,
                  style: { background: "#F9FAFB", border: "1px solid #ECEEF2", borderRadius: "10px", padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }
                },
                React.createElement(
                  "div",
                  { style: { minWidth: 0 } },
                  React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, `${r.siteName} · ${r.model}`),
                  React.createElement("div", { style: { fontSize: "11px", color: "#6B7280" } }, getRuleStatusText(r))
                ),
                React.createElement(
                  "div",
                  { style: { display: "flex", gap: "5px", flexShrink: 0 } },
                  r.mode !== "count_only" &&
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        if (r.mode === "balance") {
                          const raw = prompt(`请输入充值金额（单位：${r.currency || "¥"}）：`, "10");
                          if (raw !== null && !isNaN(Number(raw)) && Number(raw) !== 0) {
                            apiQuotaTracker.topUpRule(rKey, Number(raw));
                          }
                        } else if (r.mode === "total_count") {
                          const raw = prompt("请输入增加的次数：", "50");
                          if (raw !== null && !isNaN(Number(raw)) && Number(raw) !== 0) {
                            apiQuotaTracker.topUpRule(rKey, Number(raw));
                          }
                        } else if (r.mode === "daily_count") {
                          apiQuotaTracker.topUpRule(rKey, 0);
                        }
                      },
                      style: { border: "none", background: "#E8F5E9", color: "#15803D", padding: "3px 7px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", cursor: "pointer" }
                    },
                    r.mode === "daily_count" ? "重置" : "充值"
                  ),
                  React.createElement("button", { type: "button", onClick: () => openEditorFor(r), style: { border: "1px solid #D1D5DB", background: "#FFF", color: "#374151", padding: "3px 8px", borderRadius: "8px", fontSize: "11px", cursor: "pointer" } }, "编辑"),
                  React.createElement("button", { type: "button", onClick: () => apiQuotaTracker.deleteRule(rKey), style: { border: "none", background: "#FEE2E2", color: "#DC2626", padding: "3px 8px", borderRadius: "8px", fontSize: "11px", cursor: "pointer" } }, "删")
                )
              )
            )
        ),
        /* 调用流水明细面板 */
        showLogs &&
        React.createElement(
          "div",
          { style: { marginTop: "4px", background: "#F9FAFB", border: "1px solid #ECEEF2", borderRadius: "12px", padding: "10px" } },
          React.createElement(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } },
            React.createElement("span", { style: { fontSize: "11.5px", fontWeight: "700", color: "#374151" } }, `最近调用明细（共 ${(qState.recentLogs || []).length} 条）`),
            (qState.recentLogs || []).length > 0 &&
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => apiQuotaTracker.clearLogs(),
                style: { border: "none", background: "transparent", color: "#9CA3AF", fontSize: "11px", cursor: "pointer" }
              },
              "清空流水"
            )
          ),
          (qState.recentLogs || []).length === 0
            ? React.createElement("div", { style: { fontSize: "11.5px", color: "#9CA3AF", textAlign: "center", padding: "14px 0" } }, "暂无调用记录")
            : React.createElement(
              "div",
              { className: "no-scrollbar", style: { maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" } },
              (qState.recentLogs || []).map((log) =>
                React.createElement(
                  "div",
                  {
                    key: log.id,
                    style: { background: "#FFFFFF", border: "1px solid #F0F1F4", borderRadius: "9px", padding: "7px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }
                  },
                  React.createElement(
                    "div",
                    { style: { minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: "11.5px", fontWeight: "700", color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, `${log.siteName} · ${log.model}`),
                    React.createElement("div", { style: { fontSize: "10px", color: "#9CA3AF", marginTop: "2px" } }, `${log.time}${log.tokens > 0 ? ` · ${log.tokens} tokens` : ""}`)
                  ),
                  React.createElement(
                    "div",
                    { style: { textAlign: "right", flexShrink: 0 } },
                    React.createElement("div", { style: { fontSize: "11.5px", fontWeight: "700", color: "#D6724B" } }, log.deltaText),
                    React.createElement("div", { style: { fontSize: "10px", color: "#6B7280" } }, log.remainingText)
                  )
                )
              )
            )
        )
      ),
      /* 自定义模型额度弹窗 */
      showEditor &&
      React.createElement(
        "div",
        {
          onClick: () => setShowEditor(false),
          style: {
            position: "fixed",
            inset: 0,
            zIndex: 99990,
            background: "rgba(17,24,39,0.5)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }
        },
        React.createElement(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              width: "100%",
              maxWidth: "360px",
              background: "#FFFFFF",
              borderRadius: "20px",
              padding: "18px",
              boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              maxHeight: "84vh",
              overflowY: "auto"
            }
          },
          React.createElement("div", { style: { fontSize: "15px", fontWeight: "800", color: "#111827" } }, "自定义中转站模型额度"),
          configs && configs.length > 0 &&
          React.createElement(
            "div",
            null,
            React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "从 API 存储库快捷导入"),
            React.createElement(
              "select",
              {
                defaultValue: "",
                onChange: (e) => {
                  const idx = Number(e.target.value);
                  if (!isNaN(idx) && configs[idx]) {
                    const c = configs[idx];
                    setForm((prev) => ({
                      ...prev,
                      siteKey: c.url || prev.siteKey,
                      siteName: c.name || normalizeSiteKey(c.url),
                      model: c.model || prev.model
                    }));
                  }
                },
                style: { width: "100%", padding: "7px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12px", background: "#F9FAFB", boxSizing: "border-box" }
              },
              React.createElement("option", { value: "" }, "— 选择已有中转站配置自动填入 —"),
              configs.map((c, idx) =>
                React.createElement("option", { key: idx, value: idx }, `${c.name || c.url} (${c.model || "未选模型"})`)
              )
            )
          ),
          React.createElement(
            "div",
            null,
            React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "中转站地址（URL）"),
            React.createElement("input", {
              type: "text",
              value: form.siteKey,
              onChange: (e) => setForm({ ...form, siteKey: e.target.value }),
              placeholder: "如 https://api.example.com",
              style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
            })
          ),
          React.createElement(
            "div",
            { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
            React.createElement(
              "div",
              null,
              React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "站点备注名"),
              React.createElement("input", {
                type: "text",
                value: form.siteName,
                onChange: (e) => setForm({ ...form, siteName: e.target.value }),
                placeholder: "如 公益站A",
                style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
              })
            ),
            React.createElement(
              "div",
              null,
              React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "模型名（填 * 为全站通用）"),
              React.createElement("input", {
                type: "text",
                value: form.model,
                onChange: (e) => setForm({ ...form, model: e.target.value }),
                placeholder: "如 deepseek-chat",
                style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
              })
            )
          ),
          React.createElement(
            "div",
            null,
            React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "6px" } }, "计费 / 限额模式"),
            React.createElement(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" } },
              [
                { id: "daily_count", label: "按日次数（自动重置）" },
                { id: "total_count", label: "总次数包（-1次）" },
                { id: "balance", label: "余额扣费（按金额）" },
                { id: "count_only", label: "仅记录调用次数" }
              ].map((m) =>
                React.createElement(
                  "button",
                  {
                    key: m.id,
                    type: "button",
                    onClick: () => setForm({ ...form, mode: m.id }),
                    style: {
                      padding: "7px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: "600",
                      cursor: "pointer",
                      border: form.mode === m.id ? "1.5px solid #111827" : "1px solid #E5E7EB",
                      background: form.mode === m.id ? "#111827" : "#F9FAFB",
                      color: form.mode === m.id ? "#FFFFFF" : "#374151"
                    }
                  },
                  m.label
                )
              )
            )
          ),
          form.mode === "daily_count" &&
          React.createElement(
            "div",
            { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
            React.createElement(
              "div",
              null,
              React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "每日可用次数"),
              React.createElement("input", {
                type: "number",
                value: form.dailyLimit,
                onChange: (e) => setForm({ ...form, dailyLimit: e.target.value }),
                style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
              })
            ),
            React.createElement(
              "div",
              null,
              React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "今日已用次数"),
              React.createElement("input", {
                type: "number",
                value: form.dailyUsed,
                onChange: (e) => setForm({ ...form, dailyUsed: e.target.value }),
                style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
              })
            )
          ),
          form.mode === "total_count" &&
          React.createElement(
            "div",
            { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
            React.createElement(
              "div",
              null,
              React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "总次数上限"),
              React.createElement("input", {
                type: "number",
                value: form.totalLimit,
                onChange: (e) => setForm({ ...form, totalLimit: e.target.value }),
                style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
              })
            ),
            React.createElement(
              "div",
              null,
              React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "当前剩余次数"),
              React.createElement("input", {
                type: "number",
                value: form.totalRemaining,
                onChange: (e) => setForm({ ...form, totalRemaining: e.target.value }),
                style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
              })
            )
          ),
          form.mode === "balance" &&
          React.createElement(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            React.createElement(
              "div",
              { style: { display: "grid", gridTemplateColumns: "70px 1fr 1fr", gap: "8px" } },
              React.createElement(
                "div",
                null,
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "单位"),
                React.createElement("input", {
                  type: "text",
                  value: form.currency,
                  onChange: (e) => setForm({ ...form, currency: e.target.value }),
                  style: { width: "100%", padding: "8px 8px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
                })
              ),
              React.createElement(
                "div",
                null,
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "剩余金额"),
                React.createElement("input", {
                  type: "number",
                  step: "0.01",
                  value: form.balance,
                  onChange: (e) => setForm({ ...form, balance: e.target.value }),
                  style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
                })
              ),
              React.createElement(
                "div",
                null,
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, "定额每次扣费"),
                React.createElement("input", {
                  type: "number",
                  step: "0.001",
                  value: form.costPerCall,
                  onChange: (e) => setForm({ ...form, costPerCall: e.target.value }),
                  style: { width: "100%", padding: "8px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12.5px", boxSizing: "border-box" }
                })
              )
            ),
            React.createElement(
              "label",
              { style: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#4B5563", cursor: "pointer" } },
              React.createElement("input", {
                type: "checkbox",
                checked: Boolean(form.enableTokenBilling),
                onChange: (e) => setForm({ ...form, enableTokenBilling: e.target.checked })
              }),
              "按返回 usage Token 估算扣费（无 usage 自动回退定额）"
            ),
            form.enableTokenBilling &&
              React.createElement(
                "div",
                { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
                React.createElement(
                  "div",
                  null,
                  React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, `输入单价 (${form.currency || "¥"}/百万Tok)`),
                  React.createElement("input", {
                    type: "number",
                    step: "0.1",
                    value: form.inputPricePer1M,
                    onChange: (e) => setForm({ ...form, inputPricePer1M: e.target.value }),
                    style: { width: "100%", padding: "7px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12px", boxSizing: "border-box" }
                  })
                ),
                React.createElement(
                  "div",
                  null,
                  React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", marginBottom: "4px" } }, `输出单价 (${form.currency || "¥"}/百万Tok)`),
                  React.createElement("input", {
                    type: "number",
                    step: "0.1",
                    value: form.outputPricePer1M,
                    onChange: (e) => setForm({ ...form, outputPricePer1M: e.target.value }),
                    style: { width: "100%", padding: "7px 10px", borderRadius: "10px", border: "1px solid #D1D5DB", fontSize: "12px", boxSizing: "border-box" }
                  })
                )
              )
          ),
          React.createElement(
            "div",
            { style: { display: "flex", gap: "10px", marginTop: "6px" } },
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => setShowEditor(false),
                style: { flex: 1, padding: "10px", borderRadius: "12px", border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#4B5563", fontSize: "12.5px", fontWeight: "600", cursor: "pointer" }
              },
              "取消"
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: handleSaveRule,
                style: { flex: 1.2, padding: "10px", borderRadius: "12px", border: "none", background: "#111827", color: "#FFFFFF", fontSize: "12.5px", fontWeight: "700", cursor: "pointer" }
              },
              "保存规则"
            )
          )
        )
      )
    );
  };

  global.apiQuotaTracker = apiQuotaTracker;
  global.ApiQuotaSettingsCard = ApiQuotaSettingsCard;
})(typeof window !== "undefined" ? window : this);

