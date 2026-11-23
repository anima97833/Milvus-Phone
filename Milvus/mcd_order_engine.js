/**
 * Milvus/mcd_order_engine.js
 * 麦当劳中国官方 MCP 独立引擎（Phase 0）
 * - 100% IndexedDB 持久化（复用 t8_chat_db -> user_settings，零 localStorage 占用，源码绝不含明文 Token）
 * - 动态拉取并缓存麦当劳官方 tools/list（点餐 / 领券 / 查卡券 / 查活动日历 / 查积分 / 积分商城 / 抽奖）
 * - 自动识别高危写操作（下单/支付/兑换/抽奖/退单），代码级强制人工二次确认弹窗
 * - 支持一键复用已配置的 Cloudflare Worker 域名自动拼接 `/mcd`
 */
(function (global) {
  "use strict";

  const IDB_PREFS_KEY = "milvus_mcd_real_prefs_v1";

  const DEFAULT_PREFS = {
    gatewayUrl: "",           // 如 https://luckin-mcp.xxx.workers.dev/mcd 或 http://127.0.0.1:8765/mcd
    token: "",                // 个人麦当劳 MCP Token（仅存本机 IndexedDB；若配了 CF Secret 可留空）
    autoConfirmCoupon: true,  // 领免费优惠券免弹确认框（下单/积分兑换/抽奖仍强制确认）
    cachedTools: []           // [{ name, description, inputSchema }]
  };

  let _prefsCache = { ...DEFAULT_PREFS };
  let _hydratePromise = null;
  let _sessionId = "";
  let _pendingConfirmation = null;

  const VAULT_DB_NAME = "milvus_mcp_vault_idb";
  const VAULT_STORE = "kv";
  let _vaultDbPromise = null;

  function openVaultDB() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    if (_vaultDbPromise) return _vaultDbPromise;
    _vaultDbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(VAULT_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(VAULT_STORE)) {
            db.createObjectStore(VAULT_STORE, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          _vaultDbPromise = null;
          resolve(null);
        };
      } catch (e) {
        _vaultDbPromise = null;
        resolve(null);
      }
    });
    return _vaultDbPromise;
  }

  function hasMainIDB() {
    return (
      typeof global !== "undefined" &&
      typeof global.openDB === "function" &&
      global.STORES &&
      global.STORES.USER_SETTINGS
    );
  }

  async function idbRead(key) {
    // 1. 优先读取零冲突专用 IndexedDB
    const vdb = await openVaultDB();
    if (vdb) {
      try {
        const vHit = await new Promise((resolve) => {
          const tx = vdb.transaction([VAULT_STORE], "readonly");
          const req = tx.objectStore(VAULT_STORE).get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : null);
          req.onerror = () => resolve(null);
        });
        if (vHit && typeof vHit === "object") return vHit;
      } catch (e) {}
    }
    // 2. 兼容读取主库 t8_chat_db -> user_settings
    if (hasMainIDB()) {
      try {
        const db = await global.openDB();
        return await new Promise((resolve) => {
          const tx = db.transaction([global.STORES.USER_SETTINGS], "readonly");
          const req = tx.objectStore(global.STORES.USER_SETTINGS).get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : null);
          req.onerror = () => resolve(null);
        });
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async function idbWrite(key, value) {
    let ok = false;
    const vdb = await openVaultDB();
    if (vdb) {
      try {
        ok = await new Promise((resolve) => {
          const tx = vdb.transaction([VAULT_STORE], "readwrite");
          tx.objectStore(VAULT_STORE).put({ key, value, updatedAt: Date.now() });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
      } catch (e) {}
    }
    if (hasMainIDB()) {
      try {
        const db = await global.openDB();
        const mainOk = await new Promise((resolve) => {
          const tx = db.transaction([global.STORES.USER_SETTINGS], "readwrite");
          tx.objectStore(global.STORES.USER_SETTINGS).put({ key, value, updatedAt: Date.now() });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        });
        ok = ok || mainOk;
      } catch (e) {}
    }
    return ok;
  }

  let _dirtyByUser = false;

  function hydrate(force = false) {
    if (_hydratePromise && !force) return _hydratePromise;
    const p = (async () => {
      const saved = await idbRead(IDB_PREFS_KEY);
      if (saved && typeof saved === "object" && (!_dirtyByUser || force)) {
        _prefsCache = {
          ...DEFAULT_PREFS,
          ...saved,
          cachedTools: Array.isArray(saved.cachedTools) ? saved.cachedTools : []
        };
      } else if (!saved) {
        // 未读到数据时不永久锁定缓存，允许下次打开再次尝试水合
        _hydratePromise = null;
      }
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-mcd-prefs-changed", { detail: _prefsCache }));
      }
      return _prefsCache;
    })();
    _hydratePromise = p;
    return p;
  }

  if (typeof window !== "undefined") {
    hydrate(true);
  }

  function getPrefs() {
    return { ...DEFAULT_PREFS, ..._prefsCache };
  }

  function savePrefs(patch) {
    _dirtyByUser = true;
    _prefsCache = { ...getPrefs(), ...(patch || {}) };
    idbWrite(IDB_PREFS_KEY, _prefsCache).then((ok) => {
      if (ok && typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-mcd-saved", { detail: { ok: true, ts: Date.now() } }));
      }
    });
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-mcd-prefs-changed", { detail: _prefsCache }));
    }
    return getPrefs();
  }

  function resetStateForTest() {
    _prefsCache = { ...DEFAULT_PREFS, cachedTools: [] };
    _sessionId = "";
    _pendingConfirmation = null;
  }

  function isConfigured() {
    const p = getPrefs();
    return Boolean(p.gatewayUrl && p.gatewayUrl.trim());
  }

  function deriveGatewayFromLuckin() {
    try {
      if (global.LuckinOrderEngine && typeof global.LuckinOrderEngine.getPrefs === "function") {
        const lp = global.LuckinOrderEngine.getPrefs();
        const raw = String(lp?.gatewayUrl || "").trim();
        if (raw) {
          const u = new URL(raw);
          return `${u.origin}/mcd`;
        }
      }
    } catch (e) {}
    return "";
  }

  // ==========================================
  // 1. 敏感写操作自动分级（代码级硬安全门）
  // ==========================================
  const SAFE_ORDER_QUERY_RE = /(query|get|list|detail|status|history|preview)/i;
  const FREE_COUPON_RE = /(bind[-_]?coupon|claim[-_]?coupon|receive[-_]?coupon|auto[-_]?bind)/i;
  const HIGH_RISK_WRITE_RE = /(create|submit|pay|redeem|exchange|buy|cancel|draw|lottery|consume|deduct|place)/i;

  function classifyToolRisk(toolName) {
    const name = String(toolName || "").trim();
    if (!name) return "readonly";
    if (FREE_COUPON_RE.test(name)) return "free_coupon";
    if (HIGH_RISK_WRITE_RE.test(name)) return "sensitive_write";
    if (/order/i.test(name) && !SAFE_ORDER_QUERY_RE.test(name)) return "sensitive_write";
    return "readonly";
  }

  // ==========================================
  // 2. Streamable HTTP JSON-RPC 调用器（支持 JSON & SSE + Session）
  // ==========================================
  function parseMcpResponseText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      const lines = text.split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith("data:")) {
          try {
            return JSON.parse(lines[i].slice(5).trim());
          } catch (e2) {}
        }
      }
      throw new Error("麦当劳网关返回了无法解析的响应: " + text.slice(0, 120));
    }
  }

  async function rpcRequest(method, params, overridePrefs = null) {
    const prefs = overridePrefs ? { ...getPrefs(), ...overridePrefs } : getPrefs();
    const url = String(prefs.gatewayUrl || "").trim();
    if (!url) {
      throw new Error("尚未配置麦当劳转发网关地址，请先在「设置 → MCP 工具箱 → 麦当劳真实 MCP 配置」中填写。");
    }

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };
    const rawTok = String(prefs.token || "").trim();
    if (rawTok) {
      headers["Authorization"] = rawTok.toLowerCase().startsWith("bearer ") ? rawTok : `Bearer ${rawTok}`;
    }
    if (_sessionId) {
      headers["Mcp-Session-Id"] = _sessionId;
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params: params || {}
        }),
        signal: controller ? controller.signal : undefined
      });
      const upSid = resp.headers && typeof resp.headers.get === "function" ? resp.headers.get("mcp-session-id") : "";
      if (upSid) _sessionId = upSid;

      const text = await resp.text();
      if (resp.status === 429) {
        throw new Error("麦当劳接口触发限流（600次/分钟），请稍后再试。");
      }
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("麦当劳 MCP Token 无效或已过期，请前往 open.mcd.cn/mcp/doc 控制台重新复制。");
      }
      if (!resp.ok) {
        throw new Error(`网关请求失败 (${resp.status})：${text.slice(0, 160)}`);
      }
      const data = parseMcpResponseText(text);
      if (data && data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }
      return data ? data.result : null;
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("连接麦当劳网关超时（15秒），请检查网络或 Worker 状态。");
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function syncToolsAndTest(overridePrefs = null) {
    _sessionId = "";
    const initRes = await rpcRequest(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "milvus-phone", version: "1.0.0" }
      },
      overridePrefs
    );
    const listRes = await rpcRequest("tools/list", {}, overridePrefs);
    const tools = Array.isArray(listRes?.tools)
      ? listRes.tools.map((t) => ({
          name: t.name,
          description: t.description || "",
          inputSchema: t.inputSchema || { type: "object", properties: {} },
          risk: classifyToolRisk(t.name)
        }))
      : [];
    savePrefs({ cachedTools: tools });
    return {
      ok: true,
      serverName: initRes?.serverInfo?.name || "mcd-mcp",
      toolCount: tools.length,
      tools
    };
  }

  async function callMcdTool(toolName, toolArgs) {
    const result = await rpcRequest("tools/call", {
      name: toolName,
      arguments: toolArgs || {}
    });
    if (result && Array.isArray(result.content)) {
      const textParts = result.content.map((c) => (c && c.text ? c.text : JSON.stringify(c))).join("\n");
      try {
        return JSON.parse(textParts);
      } catch (e) {
        return { text: textParts, isError: Boolean(result.isError) };
      }
    }
    return result;
  }

  // ==========================================
  // 3. 两阶段人工确认弹窗控制
  // ==========================================
  function requestUserConfirmation(toolName, toolArgs, summary) {
    return new Promise((resolve) => {
      _pendingConfirmation = { toolName, toolArgs, summary, resolve };
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-mcd-confirm-changed", { detail: _pendingConfirmation }));
      } else {
        _pendingConfirmation = null;
        resolve(false);
      }
    });
  }

  function resolveUserConfirmation(approved) {
    const cur = _pendingConfirmation;
    _pendingConfirmation = null;
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-mcd-confirm-changed", { detail: null }));
    }
    if (cur && typeof cur.resolve === "function") {
      cur.resolve(Boolean(approved));
    }
  }

  // ==========================================
  // 4. 统一 MCP 工具调度入口（聚合为 mcdonalds_assistant）
  // ==========================================
  async function handleToolCall(args = {}) {
    await hydrate();
    const prefs = getPrefs();

    if (!isConfigured()) {
      return {
        status: "unconfigured",
        error: "主公尚未配置麦当劳转发网关。请温柔提醒主公前往「设置 → MCP 工具箱 → 麦当劳真实 MCP 配置」填入网关地址（如 Worker域名/mcd）与个人麦当劳 Token。"
      };
    }

    const action = String(args.action || "list_capabilities").trim();

    try {
      if (action === "list_capabilities") {
        let tools = Array.isArray(prefs.cachedTools) ? prefs.cachedTools : [];
        if (tools.length === 0) {
          const synced = await syncToolsAndTest();
          tools = synced.tools;
        }
        return {
          status: "success",
          action: "list_capabilities",
          toolCount: tools.length,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            risk: t.risk,
            required: t.inputSchema?.required || [],
            properties: Object.keys(t.inputSchema?.properties || {})
          })),
          instruction: "请根据上述官方子工具清单，再调用 action='call_tool' 并传入准确的 tool_name 与 tool_args 执行对应操作。"
        };
      }

      if (action === "call_tool") {
        const toolName = String(args.tool_name || "").trim();
        if (!toolName) {
          return { status: "need_params", error: "缺少 tool_name，请先调用 action='list_capabilities' 查看麦当劳官方可用工具名。" };
        }
        const toolArgs = args.tool_args && typeof args.tool_args === "object" ? args.tool_args : {};
        const risk = classifyToolRisk(toolName);

        const needConfirm =
          risk === "sensitive_write" || (risk === "free_coupon" && prefs.autoConfirmCoupon === false);

        if (needConfirm) {
          const approved = await requestUserConfirmation(toolName, toolArgs, {
            summaryText: args.summary || `即将向麦当劳官方执行：${toolName}`
          });
          if (!approved) {
            return {
              status: "cancelled_by_user",
              message: "主公在确认弹窗中取消了本次麦当劳操作，未产生任何下单或积分变动。"
            };
          }
        }

        const res = await callMcdTool(toolName, toolArgs);
        return {
          status: "success",
          action: "call_tool",
          tool_name: toolName,
          data: res
        };
      }

      return { status: "error", error: `不支持的 action: ${action}` };
    } catch (err) {
      return { status: "error", error: err.message || "调用麦当劳真实 MCP 失败" };
    }
  }

  // ==========================================
  // 5. React UI：设置配置卡 + 两阶段确认弹窗
  // ==========================================
  function McdGatewayConfigCard() {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;

    const [prefs, setPrefs] = useState(() => getPrefs());
    const [expanded, setExpanded] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testMsg, setTestMsg] = useState("");
    const [savedHint, setSavedHint] = useState("");

    useEffect(() => {
      hydrate(true).then((p) => setPrefs({ ...p }));
      const onChange = () => setPrefs(getPrefs());
      const onSaved = () => {
        setSavedHint("已自动保存至 IndexedDB ✓");
        setTimeout(() => setSavedHint(""), 2000);
      };
      global.addEventListener("milvus-mcd-prefs-changed", onChange);
      global.addEventListener("milvus-mcd-saved", onSaved);
      return () => {
        global.removeEventListener("milvus-mcd-prefs-changed", onChange);
        global.removeEventListener("milvus-mcd-saved", onSaved);
      };
    }, []);

    const updateField = (k, v) => setPrefs(savePrefs({ [k]: v }));

    const handleReuseWorker = () => {
      const derived = deriveGatewayFromLuckin();
      if (!derived) {
        setTestMsg("未检测到已填的瑞幸网关地址，请手动填入 `你的Worker域名/mcd`");
        return;
      }
      updateField("gatewayUrl", derived);
      setTestMsg(`已自动填入：${derived}`);
    };

    const handleTest = async () => {
      setTesting(true);
      setTestMsg("正在连接麦当劳官方 MCP 并同步工具列表...");
      try {
        const res = await syncToolsAndTest(prefs);
        setTestMsg(`✅ 连通成功！已同步 ${res.toolCount} 个麦当劳官方工具（${res.tools.map((t) => t.name).slice(0, 5).join("、")}${res.toolCount > 5 ? " 等" : ""}）`);
      } catch (err) {
        setTestMsg(`❌ 连接失败：${err.message}`);
      } finally {
        setTesting(false);
      }
    };

    const configured = Boolean(prefs.gatewayUrl && prefs.gatewayUrl.trim());
    const syncedCount = Array.isArray(prefs.cachedTools) ? prefs.cachedTools.length : 0;

    return h(
      "div",
      {
        style: {
          background: "#FFFFFF",
          borderRadius: "16px",
          padding: "14px 16px",
          border: "1px solid #E5DFD3",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }
      },
      h(
        "div",
        {
          onClick: () => setExpanded(!expanded),
          style: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }
        },
        h(
          "div",
          null,
          h(
            "div",
            { style: { fontSize: "13px", fontWeight: "700", color: "#3B4235", display: "flex", alignItems: "center", gap: "6px" } },
            "🍟 麦当劳中国 · 真实 MCP 网关配置",
            h(
              "span",
              {
                style: {
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  background: configured ? "#EEF6F1" : "#F5F3ED",
                  color: configured ? "#2F6B48" : "#8E9485",
                  border: configured ? "1px solid #CFE5D7" : "1px solid #E5DFD3"
                }
              },
              configured ? (syncedCount > 0 ? `已同步 ${syncedCount} 工具` : "已配置") : "未配置"
            )
          ),
          h("div", { style: { fontSize: "11px", color: savedHint ? "#2F6B48" : "#8E9485", marginTop: "2px", fontWeight: savedHint ? "600" : "400" } }, savedHint || "可复用同一个 Cloudflare Worker（末尾加 /mcd），配置自动持久保存至 IndexedDB")
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          global.ZhugedanMcpGuide &&
            global.ZhugedanMcpGuide.GuideHelpButton &&
            h(global.ZhugedanMcpGuide.GuideHelpButton, { tab: "mcd" }),
          h("span", { style: { fontSize: "12px", color: "#6F7668", fontWeight: "700" } }, expanded ? "收起 ▲" : "展开配置 ▼")
        )
      ),

      expanded &&
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "9px", paddingTop: "8px", borderTop: "1px solid #F1EEE6" } },
          h(
            "div",
            null,
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } },
              h("span", { style: { fontSize: "11.5px", fontWeight: "600", color: "#5A6254" } }, "麦当劳转发网关地址"),
              h(
                "button",
                {
                  type: "button",
                  onClick: handleReuseWorker,
                  style: {
                    border: "1px solid #D8C7A8",
                    background: "#FBF5E8",
                    color: "#80582C",
                    borderRadius: "999px",
                    padding: "2px 8px",
                    fontSize: "10.5px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }
                },
                "⚡ 一键复用瑞幸 Worker (/mcd)"
              )
            ),
            h("input", {
              type: "text",
              value: prefs.gatewayUrl || "",
              onChange: (e) => updateField("gatewayUrl", e.target.value),
              placeholder: "如 https://luckin-mcp.xxx.workers.dev/mcd 或 http://127.0.0.1:8765/mcd",
              style: { width: "100%", padding: "8px 10px", borderRadius: "9px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
            })
          ),
          h(
            "div",
            null,
            h("div", { style: { fontSize: "11.5px", fontWeight: "600", color: "#5A6254", marginBottom: "4px" } }, "个人麦当劳 MCP Token（open.mcd.cn 控制台获取；配了 CF Secret 可留空）"),
            h("input", {
              type: "password",
              value: prefs.token || "",
              onChange: (e) => updateField("token", e.target.value),
              placeholder: "填入你自己的 MCD_MCP_TOKEN（不需写 Bearer）",
              style: { width: "100%", padding: "8px 10px", borderRadius: "9px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
            })
          ),
          h(
            "label",
            { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11.5px", color: "#5C6355", cursor: "pointer" } },
            h("span", null, "免费领券免弹确认框（点餐/积分兑换/抽奖仍强制确认）"),
            h("input", {
              type: "checkbox",
              checked: prefs.autoConfirmCoupon !== false,
              onChange: (e) => updateField("autoConfirmCoupon", e.target.checked),
              style: { width: "16px", height: "16px", cursor: "pointer" }
            })
          ),
          h(
            "button",
            {
              type: "button",
              onClick: handleTest,
              disabled: testing || !configured,
              style: {
                width: "100%",
                padding: "8px",
                borderRadius: "9px",
                border: "none",
                background: configured ? "#C24B38" : "#D4D1C9",
                color: "#FFFFFF",
                fontSize: "12px",
                fontWeight: "700",
                cursor: configured ? "pointer" : "not-allowed"
              }
            },
            testing ? "探测与同步中..." : "🔍 测试连通性并同步麦当劳工具"
          ),
          testMsg &&
            h(
              "div",
              {
                style: {
                  fontSize: "11.5px",
                  padding: "7px 10px",
                  borderRadius: "8px",
                  background: testMsg.startsWith("✅") ? "#EEF6F1" : testMsg.startsWith("❌") ? "#FDEFEF" : "#FAF7F0",
                  color: testMsg.startsWith("✅") ? "#2F6B48" : testMsg.startsWith("❌") ? "#A63D3D" : "#6B5A45",
                  lineHeight: 1.5
                }
              },
              testMsg
            )
        )
    );
  }

  function McdConfirmModalHost() {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const [pending, setPending] = useState(_pendingConfirmation);

    useEffect(() => {
      const onChange = (e) => setPending(e?.detail || null);
      global.addEventListener("milvus-mcd-confirm-changed", onChange);
      return () => global.removeEventListener("milvus-mcd-confirm-changed", onChange);
    }, []);

    if (!pending) return null;

    const modal = h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(22, 20, 18, 0.65)",
          backdropFilter: "blur(4px)",
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
            width: "min(90vw, 340px)",
            background: "#FFFDF8",
            borderRadius: "16px",
            border: "1.5px solid #E5B9A8",
            boxShadow: "0 18px 42px rgba(0,0,0,0.35)",
            padding: "18px",
            color: "#3A3128",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }
        },
        h("div", { style: { fontSize: "15px", fontWeight: "800", color: "#B83B28" } }, "🍟 麦当劳真实操作 · 二次确认"),
        h(
          "div",
          { style: { background: "#FAF3EE", borderRadius: "10px", padding: "11px 12px", fontSize: "12.5px", lineHeight: 1.65 } },
          h("div", null, h("strong", null, "操作说明："), pending.summary?.summaryText || pending.toolName),
          h("div", { style: { marginTop: "4px", fontSize: "11.5px", color: "#6F5D52" } }, "官方工具：", pending.toolName),
          pending.toolArgs &&
            Object.keys(pending.toolArgs).length > 0 &&
            h(
              "pre",
              {
                style: {
                  margin: "6px 0 0",
                  padding: "6px",
                  background: "rgba(255,255,255,0.75)",
                  borderRadius: "6px",
                  fontSize: "10.5px",
                  maxHeight: "100px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all"
                }
              },
              JSON.stringify(pending.toolArgs, null, 2)
            )
        ),
        h(
          "div",
          { style: { fontSize: "11px", color: "#8B7D6B", lineHeight: 1.5 } },
          "安全提示：该操作涉及真实下单、积分兑换、抽奖或退单，请确认无误后再放行。"
        ),
        h(
          "div",
          { style: { display: "flex", gap: "8px" } },
          h(
            "button",
            {
              type: "button",
              onClick: () => resolveUserConfirmation(false),
              style: {
                flex: 1,
                padding: "9px",
                borderRadius: "10px",
                border: "1px solid #D5CEC0",
                background: "#FFFFFF",
                color: "#6A6258",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "取消"
          ),
          h(
            "button",
            {
              type: "button",
              onClick: () => resolveUserConfirmation(true),
              style: {
                flex: 1,
                padding: "9px",
                borderRadius: "10px",
                border: "none",
                background: "#C24B38",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "✅ 确认执行"
          )
        )
      )
    );

    if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body) {
      return global.ReactDOM.createPortal(modal, document.body);
    }
    return modal;
  }

  const api = {
    hydrate,
    getPrefs,
    savePrefs,
    resetStateForTest,
    isConfigured,
    deriveGatewayFromLuckin,
    classifyToolRisk,
    syncToolsAndTest,
    callMcdTool,
    handleToolCall,
    McdGatewayConfigCard,
    McdConfirmModalHost
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.McdOrderEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
