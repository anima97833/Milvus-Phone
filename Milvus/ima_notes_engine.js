/**
 * Milvus/ima_notes_engine.js
 * 腾讯 IMA 智能知识库与笔记 · 真实 OpenAPI 独立引擎（Phase 0）
 * - 100% IndexedDB 持久化（零冲突专用库 milvus_mcp_vault_idb + 主库双写，零 localStorage 占用）
 * - 复用同一 Cloudflare Worker（/ima/openapi/* 白名单路由）直连 https://ima.qq.com/openapi/*
 * - 支持真实：搜笔记、列笔记、读笔记、新建/追加 Markdown 笔记、列笔记本、搜/列知识库、搜知识库内文档
 */
(function (global) {
  "use strict";

  const IDB_PREFS_KEY = "milvus_ima_real_prefs_v1";
  const VAULT_DB_NAME = "milvus_mcp_vault_idb";
  const VAULT_STORE = "kv";

  const DEFAULT_PREFS = {
    gatewayUrl: "",  // 如 https://luckin-mcp.xxx.workers.dev/ima 或 http://127.0.0.1:8765/ima
    clientId: "",    // 个人 IMA OpenAPI Client ID（若配了 CF Secret 可留空）
    apiKey: ""       // 个人 IMA OpenAPI API Key（仅存本机 IndexedDB；若配了 CF Secret 可留空）
  };

  let _prefsCache = { ...DEFAULT_PREFS };
  let _vaultDbPromise = null;
  let _hydratePromise = null;
  let _dirtyByUser = false;

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
      } catch (e) {}
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
        global.dispatchEvent(new CustomEvent("milvus-ima-prefs-changed", { detail: _prefsCache }));
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
        global.dispatchEvent(new CustomEvent("milvus-ima-saved", { detail: { ok: true, ts: Date.now() } }));
      }
    });
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-ima-prefs-changed", { detail: _prefsCache }));
    }
    return getPrefs();
  }

  function resetStateForTest() {
    _prefsCache = { ...DEFAULT_PREFS };
    _dirtyByUser = false;
    _hydratePromise = null;
  }

  function isConfigured() {
    const p = getPrefs();
    return Boolean(p.gatewayUrl && p.gatewayUrl.trim());
  }

  function deriveGatewayFromExisting() {
    try {
      const sources = [
        global.LuckinOrderEngine && global.LuckinOrderEngine.getPrefs && global.LuckinOrderEngine.getPrefs().gatewayUrl,
        global.McdOrderEngine && global.McdOrderEngine.getPrefs && global.McdOrderEngine.getPrefs().gatewayUrl
      ];
      for (const raw of sources) {
        if (raw && String(raw).trim()) {
          const u = new URL(String(raw).trim());
          return `${u.origin}/ima`;
        }
      }
    } catch (e) {}
    return "";
  }

  // ==========================================
  // 1. 腾讯 IMA 真实 OpenAPI 调用器
  // ==========================================
  async function callImaApi(apiPath, body, overridePrefs = null) {
    const prefs = overridePrefs ? { ...getPrefs(), ...overridePrefs } : getPrefs();
    const base = String(prefs.gatewayUrl || "").trim().replace(/\/+$/, "");
    if (!base) {
      throw new Error("尚未配置腾讯 IMA 转发网关地址，请先在「设置 → MCP 工具箱 → 腾讯 IMA 配置」中填写。");
    }

    const cleanPath = String(apiPath || "").replace(/^\/+/, "");
    if (!cleanPath.startsWith("openapi/") || cleanPath.includes("..")) {
      throw new Error(`非法的 IMA OpenAPI 路径: ${cleanPath}`);
    }

    const url = `${base}/${cleanPath}`;
    const headers = {
      "Content-Type": "application/json",
      "ima-openapi-ctx": "skill_version=1.1.10"
    };
    if (prefs.clientId && String(prefs.clientId).trim()) {
      headers["ima-openapi-clientid"] = String(prefs.clientId).trim();
    }
    if (prefs.apiKey && String(prefs.apiKey).trim()) {
      headers["ima-openapi-apikey"] = String(prefs.apiKey).trim();
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body || {}),
        signal: controller ? controller.signal : undefined
      });
      const text = await resp.text();
      if (resp.status === 401 || resp.status === 403) {
        throw new Error("腾讯 IMA Client ID 或 API Key 无效/缺失，请核对凭证。");
      }
      if (!resp.ok) {
        throw new Error(`IMA 网关返回错误 (${resp.status})：${text.slice(0, 160)}`);
      }
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error("IMA 接口返回了非 JSON 响应：" + text.slice(0, 120));
      }
      if (parsed && typeof parsed.code !== "undefined" && Number(parsed.code) !== 0) {
        throw new Error(`IMA API 错误 (${parsed.code})：${parsed.msg || "请检查参数或权限"}`);
      }
      return parsed && parsed.data !== undefined ? parsed.data : parsed;
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("连接腾讯 IMA 网关超时（15秒），请检查网络或 Worker 状态。");
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function testConnection(overridePrefs = null) {
    const data = await callImaApi("openapi/note/v1/list_note", { sort_type: 0, cursor: "", limit: 1 }, overridePrefs);
    const list = (data && (data.notes || data.docs || data.list)) || [];
    return {
      ok: true,
      sampleCount: Array.isArray(list) ? list.length : 0
    };
  }

  // ==========================================
  // 2. 统一 MCP 工具调度入口（供 mcp_store.js 委托调用）
  // ==========================================
  async function handleToolCall(args = {}, context = {}) {
    await hydrate();
    if (!isConfigured()) {
      return {
        status: "unconfigured",
        error: "主公尚未配置腾讯 IMA 真实网关。请温柔提醒主公前往「设置 → MCP 工具箱 → 腾讯 IMA 真实知识库配置」填入网关地址（如 Worker域名/ima）与 Client ID / API Key。"
      };
    }

    const action = String(args.action || "search_notes").trim();
    const charName = context?.character || context?.characterName || "名士";

    try {
      if (action === "search_notes") {
        const kw = String(args.query || args.title || "").trim();
        const body = { search_type: 0, sort_type: 0, start: 0, end: 10 };
        if (kw) body.query_info = { title: kw, content: kw };
        const data = await callImaApi("openapi/note/v1/search_note", body);
        return { status: "success", action, query: kw, data };
      }

      if (action === "list_notes") {
        const body = { sort_type: 0, cursor: String(args.cursor || ""), limit: Math.min(20, Math.max(1, Number(args.limit) || 10)) };
        if (args.folder_id) body.folder_id = String(args.folder_id);
        const data = await callImaApi("openapi/note/v1/list_note", body);
        return { status: "success", action, data };
      }

      if (action === "get_note") {
        const noteId = String(args.note_id || "").trim();
        if (!noteId) return { status: "need_params", error: "获取笔记详情需要提供 note_id（可先调 search_notes 或 list_notes 获取）。" };
        try {
          const data = await callImaApi("openapi/note/v1/get_doc_content", {
            note_id: noteId,
            target_content_format: 1
          });
          return { status: "success", action, note_id: noteId, data };
        } catch (err) {
          const msg = String(err?.message || "");
          if (msg.includes("210005") || /not author/i.test(msg)) {
            return {
              status: "not_author_or_kb_media",
              note_id: noteId,
              message: "腾讯 IMA 限制：get_note 只能读取用户本人创建的「个人笔记」全文。该 ID 可能是知识库文件（media_id）或他人共享知识库文档，无法直接拉取全文。请不要重复调用 get_note，直接基于此前 search_knowledge / search_notes 返回的检索摘要作答，或改用 search_notes 检索个人笔记。"
            };
          }
          throw err;
        }
      }

      if (action === "create_note") {
        const title = String(args.title || `【${charName}整理】随笔`).trim();
        const rawContent = String(args.content || "").trim();
        if (!rawContent) return { status: "need_params", error: "新建笔记需要提供 content 正文内容。" };
        const md = rawContent.startsWith("#") ? rawContent : `# ${title}\n\n${rawContent}`;
        const body = { content_format: 1, content: md };
        if (args.folder_id) body.folder_id = String(args.folder_id);
        if (args.folder_name) body.folder_name = String(args.folder_name);
        const data = await callImaApi("openapi/note/v1/import_doc", body);
        return { status: "success", action, title, data, message: `已真实存入腾讯 IMA 笔记：《${title}》` };
      }

      if (action === "append_note") {
        const noteId = String(args.note_id || "").trim();
        const rawContent = String(args.content || "").trim();
        if (!noteId || !rawContent) {
          return { status: "need_params", error: "追加笔记需要提供 note_id 与 content。" };
        }
        const data = await callImaApi("openapi/note/v1/append_doc", {
          note_id: noteId,
          content_format: 1,
          content: rawContent
        });
        return { status: "success", action, note_id: noteId, data, message: "已真实追加到指定腾讯 IMA 笔记中。" };
      }

      if (action === "list_notebooks") {
        const data = await callImaApi("openapi/note/v1/list_notebook", { cursor: "", limit: 20 });
        return { status: "success", action, data };
      }

      if (action === "list_knowledge_bases") {
        const data = await callImaApi("openapi/wiki/v1/search_knowledge_base", {
          query: String(args.query || ""),
          cursor: "",
          limit: 15
        });
        return { status: "success", action, data };
      }

      if (action === "list_knowledge") {
        const kbId = String(args.knowledge_base_id || "").trim();
        if (!kbId) {
          const kbList = await callImaApi("openapi/wiki/v1/search_knowledge_base", { query: "", cursor: "", limit: 15 });
          return {
            status: "need_kb_id",
            message: "未指定 knowledge_base_id，已为你查出全部知识库，请挑选对应 id 再调用 list_knowledge。",
            knowledge_bases: kbList
          };
        }
        const body = {
          knowledge_base_id: kbId,
          cursor: String(args.cursor || ""),
          limit: Math.min(50, Math.max(1, Number(args.limit) || 20))
        };
        if (args.folder_id) body.folder_id = String(args.folder_id);
        const data = await callImaApi("openapi/wiki/v1/get_knowledge_list", body);
        return { status: "success", action, knowledge_base_id: kbId, data };
      }

      if (action === "search_knowledge") {
        const kbId = String(args.knowledge_base_id || "").trim();
        const kw = String(args.query || "").trim();
        if (!kbId) {
          // 若未给 knowledge_base_id，先帮模型列出知识库
          const kbList = await callImaApi("openapi/wiki/v1/search_knowledge_base", { query: "", cursor: "", limit: 15 });
          return {
            status: "need_kb_id",
            message: "未指定 knowledge_base_id，已为你查出全部知识库，请挑选对应 id 再调用 search_knowledge。",
            knowledge_bases: kbList
          };
        }
        const data = await callImaApi("openapi/wiki/v1/search_knowledge", {
          knowledge_base_id: kbId,
          query: kw,
          cursor: ""
        });
        return { status: "success", action, knowledge_base_id: kbId, query: kw, data };
      }

      return { status: "error", error: `不支持的 IMA action: ${action}` };
    } catch (err) {
      return { status: "error", error: err.message || "调用腾讯 IMA OpenAPI 失败" };
    }
  }

  // ==========================================
  // 3. React UI：设置页极简配置卡（含 ? 诸葛诞指引）
  // ==========================================
  function ImaGatewayConfigCard() {
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
      global.addEventListener("milvus-ima-prefs-changed", onChange);
      global.addEventListener("milvus-ima-saved", onSaved);
      return () => {
        global.removeEventListener("milvus-ima-prefs-changed", onChange);
        global.removeEventListener("milvus-ima-saved", onSaved);
      };
    }, []);

    const updateField = (k, v) => setPrefs(savePrefs({ [k]: v }));

    const handleReuseWorker = () => {
      const derived = deriveGatewayFromExisting();
      if (!derived) {
        setTestMsg("未检测到已填的 Worker 地址，请手动填入 `你的Worker域名/ima`");
        return;
      }
      updateField("gatewayUrl", derived);
      setTestMsg(`已自动填入：${derived}`);
    };

    const handleTest = async () => {
      setTesting(true);
      setTestMsg("正在探测腾讯 IMA OpenAPI 连通性...");
      try {
        await testConnection(prefs);
        setTestMsg("✅ 连通成功！已直连你的真实腾讯 IMA 笔记与知识库");
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
            "📓 腾讯 IMA · 真实知识库与笔记配置",
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
          h(
            "div",
            { style: { fontSize: "11px", color: savedHint ? "#2F6B48" : "#8E9485", marginTop: "2px", fontWeight: savedHint ? "600" : "400" } },
            savedHint || "可复用同一个 Cloudflare Worker（末尾加 /ima），支持真实读写笔记与知识库"
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          global.ZhugedanMcpGuide &&
            global.ZhugedanMcpGuide.GuideHelpButton &&
            h(global.ZhugedanMcpGuide.GuideHelpButton, { tab: "ima" }),
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
              h("span", { style: { fontSize: "11.5px", fontWeight: "600", color: "#5A6254" } }, "腾讯 IMA 转发网关地址"),
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
                "⚡ 一键复用 Worker (/ima)"
              )
            ),
            h("input", {
              type: "text",
              value: prefs.gatewayUrl || "",
              onChange: (e) => updateField("gatewayUrl", e.target.value),
              placeholder: "如 https://luckin-mcp.xxx.workers.dev/ima 或 http://127.0.0.1:8765/ima",
              style: { width: "100%", padding: "8px 10px", borderRadius: "9px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
            })
          ),
          h(
            "div",
            null,
            h("div", { style: { fontSize: "11.5px", fontWeight: "600", color: "#5A6254", marginBottom: "4px" } }, "IMA Client ID（若已在 CF Secret 配置可留空）"),
            h("input", {
              type: "text",
              value: prefs.clientId || "",
              onChange: (e) => updateField("clientId", e.target.value),
              placeholder: "填入你的 IMA_OPENAPI_CLIENTID",
              style: { width: "100%", padding: "8px 10px", borderRadius: "9px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
            })
          ),
          h(
            "div",
            null,
            h("div", { style: { fontSize: "11.5px", fontWeight: "600", color: "#5A6254", marginBottom: "4px" } }, "IMA API Key（仅存本机 IndexedDB；配了 CF Secret 可留空）"),
            h("input", {
              type: "password",
              value: prefs.apiKey || "",
              onChange: (e) => updateField("apiKey", e.target.value),
              placeholder: "填入你的 IMA_OPENAPI_APIKEY",
              style: { width: "100%", padding: "8px 10px", borderRadius: "9px", border: "1px solid #DCD7CC", fontSize: "12px", boxSizing: "border-box" }
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
                background: configured ? "#3D6A5E" : "#D4D1C9",
                color: "#FFFFFF",
                fontSize: "12px",
                fontWeight: "700",
                cursor: configured ? "pointer" : "not-allowed"
              }
            },
            testing ? "探测中..." : "🔍 测试腾讯 IMA 真实连通性"
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

  const api = {
    hydrate,
    getPrefs,
    savePrefs,
    resetStateForTest,
    isConfigured,
    deriveGatewayFromExisting,
    callImaApi,
    testConnection,
    handleToolCall,
    ImaGatewayConfigCard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.ImaNotesEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

