/**
 * Milvus/luckin_order_engine.js
 * 瑞幸咖啡真实 MCP 点单引擎（支持 Cloudflare Worker / 本机 Node 网关 + 两阶段人工确认安全闸门）
 * - 100% IndexedDB 持久化（复用 t8_chat_db -> user_settings，零 localStorage 占用，源码绝不含任何明文 Token）
 * - 真实对接瑞幸官方 Streamable HTTP MCP 全部 8 个工具：
 *   只读：queryShopList / searchProductForMcp / queryProductDetailInfo / switchProduct / previewOrder / queryOrderDetailInfo
 *   写操作（强制人工二次确认）：createOrder / cancelOrder
 */
(function (global) {
  "use strict";

  const IDB_PREFS_KEY = "milvus_luckin_real_prefs_v1";

  const DEFAULT_PREFS = {
    gatewayUrl: "",       // Cloudflare Worker URL 或 http://127.0.0.1:8765/mcp/luckin
    token: "",            // 用户个人瑞幸 MCP Token（仅存本机 IndexedDB，支持 Worker Secret 留空）
    longitude: "",        // 经度（支持一键 GPS 获取）
    latitude: "",         // 纬度
    defaultDeptId: "",    // 常用门店 ID（可选）
    defaultDeptName: ""   // 常用门店名称（可选）
  };

  let _prefsCache = { ...DEFAULT_PREFS };
  let _hydratePromise = null;
  let _pendingConfirmation = null; // { type: 'createOrder'|'cancelOrder', payload, summary, resolve }

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
      } catch (e) { }
    }
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
      } catch (e) { }
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
      } catch (e) { }
    }
    return ok;
  }

  let _dirtyByUser = false;

  function hydrate(force = false) {
    if (_hydratePromise && !force) return _hydratePromise;
    const p = (async () => {
      const saved = await idbRead(IDB_PREFS_KEY);
      if (saved && typeof saved === "object" && (!_dirtyByUser || force)) {
        _prefsCache = { ...DEFAULT_PREFS, ...saved };
      } else if (!saved) {
        _hydratePromise = null;
      }
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-luckin-prefs-changed", { detail: _prefsCache }));
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
    idbWrite(IDB_PREFS_KEY, _prefsCache);
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-luckin-prefs-changed", { detail: _prefsCache }));
    }
    return getPrefs();
  }

  function isConfigured() {
    const p = getPrefs();
    return Boolean(p.gatewayUrl && p.gatewayUrl.trim());
  }

  // ==========================================
  // 1. 真实 Streamable HTTP JSON-RPC 调用器
  // ==========================================
  function parseMcpResponseText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      // 兼容 text/event-stream 格式 (data: {...})
      const lines = text.split(/\r?\n/);
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].startsWith("data:")) {
          try {
            return JSON.parse(lines[i].slice(5).trim());
          } catch (e2) { }
        }
      }
      throw new Error("瑞幸网关返回了无法解析的响应: " + text.slice(0, 120));
    }
  }

  async function rpcRequest(method, params, overridePrefs = null) {
    const prefs = overridePrefs ? { ...getPrefs(), ...overridePrefs } : getPrefs();
    const url = String(prefs.gatewayUrl || "").trim();
    if (!url) {
      throw new Error("尚未配置瑞幸转发网关地址，请先在「设置 → MCP 工具箱 → 瑞幸真实点单配置」中填写。");
    }

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };
    const rawTok = String(prefs.token || "").trim();
    if (rawTok) {
      headers["Authorization"] = rawTok.toLowerCase().startsWith("bearer ") ? rawTok : `Bearer ${rawTok}`;
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
      const text = await resp.text();
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
        throw new Error("连接瑞幸网关超时（15秒），请检查网络或网关是否正常运行。");
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function callLuckinTool(toolName, toolArgs) {
    const result = await rpcRequest("tools/call", {
      name: toolName,
      arguments: toolArgs || {}
    });
    // 提取 MCP content 文本并尝试 JSON 解析，方便大模型阅读
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

  async function testConnection(overridePrefs = null) {
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
    const tools = Array.isArray(listRes?.tools) ? listRes.tools : [];
    return {
      ok: true,
      serverName: initRes?.serverInfo?.name || "luckin-mcp",
      toolCount: tools.length,
      toolNames: tools.map((t) => t.name)
    };
  }

  // ==========================================
  // 2. 两阶段安全确认闸门（严防 AI 幻觉自动真实下单/取消）
  // ==========================================
  function requestUserConfirmation(type, payload, summary) {
    return new Promise((resolve) => {
      _pendingConfirmation = { type, payload, summary, resolve };
      if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
        global.dispatchEvent(new CustomEvent("milvus-luckin-confirm-changed", { detail: _pendingConfirmation }));
      } else {
        // 非浏览器环境直接拒绝敏感写操作
        _pendingConfirmation = null;
        resolve(false);
      }
    });
  }

  function resolveUserConfirmation(approved) {
    const cur = _pendingConfirmation;
    _pendingConfirmation = null;
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-luckin-confirm-changed", { detail: null }));
    }
    if (cur && typeof cur.resolve === "function") {
      cur.resolve(Boolean(approved));
    }
  }

  // ==========================================
  // 3. 统一 MCP 工具调度入口（供 mcp_store.js 委托调用）
  // ==========================================
  async function handleToolCall(args = {}) {
    await hydrate();
    const prefs = getPrefs();

    if (!isConfigured()) {
      return {
        status: "unconfigured",
        error: "用户尚未配置瑞幸真实转发网关。请温柔提醒主公先前往「设置 → MCP 工具箱 → 瑞幸真实点单配置」填入 Cloudflare Worker 或本地代理地址与瑞幸 Token。"
      };
    }

    const action = String(args.action || "search_shop").trim();
    const lng = Number(args.longitude || prefs.longitude);
    const lat = Number(args.latitude || prefs.latitude);
    const deptId = Number(args.deptId || args.dept_id || prefs.defaultDeptId) || undefined;

    try {
      if (action === "search_shop") {
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || (!lng && !lat)) {
          return {
            status: "need_location",
            error: "查询附近真实瑞幸门店需要经纬度。请提醒主公在「设置 → MCP → 瑞幸真实点单配置」里点一下「📍 获取当前定位」，或直接告知所在坐标。"
          };
        }
        const queryArgs = { longitude: lng, latitude: lat };
        if (args.shop_name || args.deptName) queryArgs.deptName = String(args.shop_name || args.deptName);
        const res = await callLuckinTool("queryShopList", queryArgs);
        return { status: "success", action, data: res };
      }

      if (action === "search_menu") {
        if (!deptId) {
          return { status: "need_dept", error: "请先调用 search_shop 获取真实门店的 deptId，再查询该门店菜单。" };
        }
        const res = await callLuckinTool("searchProductForMcp", {
          deptId,
          query: String(args.product_name || args.query || "生椰拿铁")
        });
        return { status: "success", action, deptId, data: res };
      }

      if (action === "product_detail") {
        if (!deptId || !args.productId) {
          return { status: "need_params", error: "缺少 deptId 或 productId。" };
        }
        const res = await callLuckinTool("queryProductDetailInfo", {
          deptId,
          productId: Number(args.productId)
        });
        return { status: "success", action, data: res };
      }

      if (action === "switch_spec") {
        if (!deptId || !args.productId || !args.skuCode || !args.attrOperationParam) {
          return { status: "need_params", error: "切换规格缺少 deptId / productId / skuCode / attrOperationParam。" };
        }
        const res = await callLuckinTool("switchProduct", {
          deptId,
          productId: Number(args.productId),
          skuCode: String(args.skuCode),
          attrOperationParam: args.attrOperationParam,
          amount: Number(args.amount) || 1
        });
        return { status: "success", action, data: res };
      }

      if (action === "preview_order") {
        if (!deptId || !Array.isArray(args.productList) || args.productList.length === 0) {
          return { status: "need_params", error: "订单预览需要 deptId 和 productList（含 productId、skuCode、amount）。" };
        }
        const res = await callLuckinTool("previewOrder", {
          deptId,
          productList: args.productList
        });
        return {
          status: "success",
          action,
          data: res,
          instruction: "请将预览到的门店、饮品、规格与券后实付金额清晰报给主公核对，询问是否确认提交真实订单。"
        };
      }

      if (action === "create_order") {
        if (!deptId || !Array.isArray(args.productList) || args.productList.length === 0) {
          return { status: "need_params", error: "创建真实订单需要 deptId、productList，并建议先调用 preview_order 获取 couponCodeList。" };
        }
        if (!Number.isFinite(lng) || !Number.isFinite(lat) || (!lng && !lat)) {
          return { status: "need_location", error: "创建真实订单需要经纬度，请先配置定位。" };
        }

        const orderPayload = {
          deptId,
          productList: args.productList,
          longitude: lng,
          latitude: lat
        };
        if (Array.isArray(args.couponCodeList) && args.couponCodeList.length > 0) {
          orderPayload.couponCodeList = args.couponCodeList;
        }
        if (args.remark) orderPayload.remark = String(args.remark);

        // 强制人工二次确认弹窗（独立于 Prompt，100% 防止误下单）
        const approved = await requestUserConfirmation("createOrder", orderPayload, {
          shopName: args.shop_name || prefs.defaultDeptName || `门店 #${deptId}`,
          productSummary: args.product_name || JSON.stringify(args.productList),
          specs: args.specs || "",
          estimatedPrice: args.estimated_price || "",
          couponCount: (orderPayload.couponCodeList || []).length
        });

        if (!approved) {
          return {
            status: "cancelled_by_user",
            message: "主公在确认弹窗中取消了本次真实下单，未产生任何订单。"
          };
        }

        const res = await callLuckinTool("createOrder", orderPayload);
        return {
          status: "success",
          action,
          data: res,
          instruction: "真实订单已创建！请将返回的订单号/支付提示或取餐信息告诉主公，提醒主公在瑞幸 App / 小程序中完成支付或取餐。"
        };
      }

      if (action === "order_status") {
        if (!args.order_id && !args.orderId) {
          return { status: "need_params", error: "查询订单详情需要提供 orderId。" };
        }
        const res = await callLuckinTool("queryOrderDetailInfo", {
          orderId: String(args.orderId || args.order_id)
        });
        return { status: "success", action, data: res };
      }

      if (action === "cancel_order") {
        const oid = String(args.orderId || args.order_id || "").trim();
        if (!oid) return { status: "need_params", error: "取消订单需要提供 orderId。" };
        const approved = await requestUserConfirmation("cancelOrder", { orderId: oid }, {
          orderId: oid
        });
        if (!approved) {
          return { status: "cancelled_by_user", message: "主公取消了退单操作，原订单保持不变。" };
        }
        const res = await callLuckinTool("cancelOrder", { orderId: oid });
        return { status: "success", action, data: res };
      }

      return { status: "error", error: `不支持的 action: ${action}` };
    } catch (err) {
      return { status: "error", error: err.message || "调用瑞幸真实 MCP 失败" };
    }
  }

  // ==========================================
  // 4. React UI：设置配置卡 + 两阶段人工确认弹窗
  // ==========================================
  function LuckinGatewayConfigCard() {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;

    const [prefs, setPrefs] = useState(() => getPrefs());
    const [expanded, setExpanded] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testMsg, setTestMsg] = useState("");
    const [locating, setLocating] = useState(false);

    useEffect(() => {
      hydrate(true).then((p) => setPrefs({ ...p }));
      const onChange = () => setPrefs(getPrefs());
      global.addEventListener("milvus-luckin-prefs-changed", onChange);
      return () => global.removeEventListener("milvus-luckin-prefs-changed", onChange);
    }, []);

    const updateField = (k, v) => {
      const next = savePrefs({ [k]: v });
      setPrefs(next);
    };

    const handleLocate = () => {
      if (!navigator.geolocation) {
        setTestMsg("当前浏览器不支持 GPS 定位，请手动填写经纬度");
        return;
      }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lng = Number(pos.coords.longitude.toFixed(6));
          const lat = Number(pos.coords.latitude.toFixed(6));
          const next = savePrefs({ longitude: String(lng), latitude: String(lat) });
          setPrefs(next);
          setLocating(false);
          setTestMsg(`📍 已定位：经度 ${lng}, 纬度 ${lat}`);
        },
        (err) => {
          setLocating(false);
          setTestMsg(`定位失败（${err.message || "权限被拒"}），可手动填经纬度`);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };

    const handleTest = async () => {
      setTesting(true);
      setTestMsg("正在探测瑞幸官方 MCP 连通性...");
      try {
        const res = await testConnection(prefs);
        setTestMsg(`✅ 连通成功！服务：${res.serverName}，已发现 ${res.toolCount} 个官方工具`);
      } catch (err) {
        setTestMsg(`❌ 连接失败：${err.message}`);
      } finally {
        setTesting(false);
      }
    };

    const configured = Boolean(prefs.gatewayUrl && prefs.gatewayUrl.trim());

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
            "☕ 瑞幸咖啡 · 真实点单网关配置",
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
              configured ? "已配置" : "未配置"
            )
          ),
          h("div", { style: { fontSize: "11px", color: "#8E9485", marginTop: "2px" } }, "Token 仅存本机 IndexedDB；真实下单前会弹出人工二次确认")
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          global.ZhugedanMcpGuide &&
            global.ZhugedanMcpGuide.GuideHelpButton &&
            h(global.ZhugedanMcpGuide.GuideHelpButton, { tab: "luckin" }),
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
          h("div", { style: { fontSize: "11.5px", fontWeight: "600", color: "#5A6254", marginBottom: "4px" } }, "转发网关地址（Cloudflare Worker 或本机代理）"),
          h("input", {
            type: "text",
            value: prefs.gatewayUrl || "",
            onChange: (e) => updateField("gatewayUrl", e.target.value),
            placeholder: "如 https://luckin-mcp.xxx.workers.dev 或 http://127.0.0.1:8765/mcp/luckin",
            style: { width: "100%", padding: "8px 10px", borderRadius: "9px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
          })
        ),
        h(
          "div",
          null,
          h("div", { style: { fontSize: "11.5px", fontWeight: "600", color: "#5A6254", marginBottom: "4px" } }, "个人瑞幸 MCP Token（若已在 Cloudflare Secret 配置可留空）"),
          h("input", {
            type: "password",
            value: prefs.token || "",
            onChange: (e) => updateField("token", e.target.value),
            placeholder: "填入你自己的 LUCKIN_MCP_TOKEN（不需写 Bearer）",
            style: { width: "100%", padding: "8px 10px", borderRadius: "9px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
          })
        ),
        h(
          "div",
          { style: { display: "flex", gap: "6px", alignItems: "flex-end" } },
          h(
            "div",
            { style: { flex: 1 } },
            h("div", { style: { fontSize: "11px", color: "#7B8072", marginBottom: "3px" } }, "经度 (longitude)"),
            h("input", {
              type: "text",
              value: prefs.longitude || "",
              onChange: (e) => updateField("longitude", e.target.value),
              placeholder: "如 116.397128",
              style: { width: "100%", padding: "7px 8px", borderRadius: "8px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
            })
          ),
          h(
            "div",
            { style: { flex: 1 } },
            h("div", { style: { fontSize: "11px", color: "#7B8072", marginBottom: "3px" } }, "纬度 (latitude)"),
            h("input", {
              type: "text",
              value: prefs.latitude || "",
              onChange: (e) => updateField("latitude", e.target.value),
              placeholder: "如 39.916527",
              style: { width: "100%", padding: "7px 8px", borderRadius: "8px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
            })
          ),
          h(
            "button",
            {
              type: "button",
              onClick: handleLocate,
              disabled: locating,
              style: {
                padding: "7px 10px",
                borderRadius: "8px",
                border: "1px solid #C9D8DC",
                background: "#EEF5F7",
                color: "#2E5B69",
                fontSize: "11.5px",
                fontWeight: "700",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }
            },
            locating ? "定位中..." : "📍 定位"
          )
        ),
        h(
          "div",
          { style: { display: "flex", gap: "8px" } },
          h(
            "button",
            {
              type: "button",
              onClick: handleTest,
              disabled: testing || !configured,
              style: {
                flex: 1,
                padding: "8px",
                borderRadius: "9px",
                border: "none",
                background: configured ? "#4E7E8E" : "#D4D1C9",
                color: "#FFFFFF",
                fontSize: "12px",
                fontWeight: "700",
                cursor: configured ? "pointer" : "not-allowed"
              }
            },
            testing ? "探测中..." : "🔍 测试真实连通性"
          )
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

  function LuckinConfirmModalHost() {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const [pending, setPending] = useState(_pendingConfirmation);

    useEffect(() => {
      const onChange = (e) => setPending(e?.detail || null);
      global.addEventListener("milvus-luckin-confirm-changed", onChange);
      return () => global.removeEventListener("milvus-luckin-confirm-changed", onChange);
    }, []);

    if (!pending) return null;

    const isCancel = pending.type === "cancelOrder";
    const s = pending.summary || {};

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
            border: "1.5px solid #D8C7A8",
            boxShadow: "0 18px 42px rgba(0,0,0,0.35)",
            padding: "18px",
            color: "#3A3128",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }
        },
        h(
          "div",
          { style: { fontSize: "15px", fontWeight: "800", color: isCancel ? "#A63D3D" : "#2D4F5C" } },
          isCancel ? "⚠️ 确认取消真实瑞幸订单？" : "☕ 瑞幸真实下单 · 二次确认"
        ),
        h(
          "div",
          {
            style: {
              background: "#F7F3EA",
              borderRadius: "10px",
              padding: "11px 12px",
              fontSize: "12.5px",
              lineHeight: 1.7
            }
          },
          isCancel
            ? `即将向瑞幸官方提交退单请求，订单号：${s.orderId || ""}`
            : h(
              React.Fragment,
              null,
              h("div", null, h("strong", null, "门店："), s.shopName || "已选门店"),
              h("div", null, h("strong", null, "商品："), s.productSummary || "所选饮品"),
              s.specs && h("div", null, h("strong", null, "规格："), s.specs),
              s.estimatedPrice && h("div", null, h("strong", null, "预估实付："), s.estimatedPrice),
              s.couponCount > 0 && h("div", null, h("strong", null, "已选优惠券："), `${s.couponCount} 张`)
            )
        ),
        h(
          "div",
          { style: { fontSize: "11px", color: "#8B7D6B", lineHeight: 1.5 } },
          "安全提示：点击确认后将向瑞幸官方提交真实订单（不会自动扣款，通常需在瑞幸 App / 小程序完成支付）。"
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
                background: isCancel ? "#B84A4A" : "#3E6F80",
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            isCancel ? "确认取消订单" : "✅ 确认真实下单"
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
    isConfigured,
    callLuckinTool,
    testConnection,
    handleToolCall,
    LuckinGatewayConfigCard,
    LuckinConfirmModalHost
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.LuckinOrderEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
