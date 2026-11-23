/**
 * Milvus/ao3_reader_engine.js
 * AO3 官方同人检索与分页调阅独立引擎（Phase 0）
 * - 100% 独立零冲突 IndexedDB 持久化（milvus_mcp_vault_idb），零 localStorage 占用
 * - 复用同一 Cloudflare Worker（/ao3/* 路由）或自定义代理，彻底摆脱本地 python ao3_server.py
 * - 原生 DOMParser 解析 AO3 搜索页与正文页 + 5000 字分页续读 + 15 分钟防限流缓存 + 蓝锁文识别
 */
(function (global) {
  "use strict";

  const VAULT_DB_NAME = "milvus_mcp_vault_idb";
  const VAULT_STORE = "kv";
  const IDB_PREFS_KEY = "milvus_ao3_prefs_v1";
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const DEFAULT_PAGE_CHARS = 5000;

  const DEFAULT_PREFS = {
    gatewayUrl: "" // 如 https://luckin-mcp.xxx.workers.dev/ao3 或 http://127.0.0.1:8765/ao3
  };

  let _vaultDbPromise = null;
  let _prefsCache = { ...DEFAULT_PREFS };
  let _hydratePromise = null;
  let _dirtyByUser = false;

  const _searchCache = new Map(); // key -> { ts, results }
  const _workCache = new Map();   // workId -> { ts, work }
  let _lastSearchResults = [];

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

  async function idbRead(key) {
    const vdb = await openVaultDB();
    if (!vdb) return null;
    try {
      return await new Promise((resolve) => {
        const tx = vdb.transaction([VAULT_STORE], "readonly");
        const req = tx.objectStore(VAULT_STORE).get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function idbWrite(key, value) {
    const vdb = await openVaultDB();
    if (!vdb) return false;
    try {
      return await new Promise((resolve) => {
        const tx = vdb.transaction([VAULT_STORE], "readwrite");
        tx.objectStore(VAULT_STORE).put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
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
        global.dispatchEvent(new CustomEvent("milvus-ao3-prefs-changed", { detail: _prefsCache }));
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
        global.dispatchEvent(new CustomEvent("milvus-ao3-saved", { detail: { ok: true, ts: Date.now() } }));
      }
    });
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-ao3-prefs-changed", { detail: _prefsCache }));
    }
    return getPrefs();
  }

  function resetForTest() {
    _prefsCache = { ...DEFAULT_PREFS };
    _searchCache.clear();
    _workCache.clear();
    _lastSearchResults = [];
  }

  function isConfigured() {
    const p = getPrefs();
    return Boolean(p.gatewayUrl && p.gatewayUrl.trim());
  }

  function deriveGatewayFromExisting() {
    try {
      const sources = [
        global.LuckinOrderEngine && global.LuckinOrderEngine.getPrefs && global.LuckinOrderEngine.getPrefs().gatewayUrl,
        global.McdOrderEngine && global.McdOrderEngine.getPrefs && global.McdOrderEngine.getPrefs().gatewayUrl,
        global.ImaNotesEngine && global.ImaNotesEngine.getPrefs && global.ImaNotesEngine.getPrefs().gatewayUrl
      ];
      for (const raw of sources) {
        if (raw && String(raw).trim()) {
          const u = new URL(String(raw).trim());
          return `${u.origin}/ao3`;
        }
      }
    } catch (e) {}
    return "";
  }

  // ==========================================
  // 1. 原生 DOMParser HTML 解析器（含 Node 轻量回退便于单测）
  // ==========================================
  function stripHtml(html) {
    return String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function parseAo3SearchHtml(html) {
    const raw = String(html || "");
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      const items = Array.from(doc.querySelectorAll("ol.work.index.group > li.work.blurb, li.work.blurb"));
      return items.slice(0, 8).map((li, idx) => {
        const titleLink = li.querySelector("h4.heading a[href*='/works/']");
        const href = titleLink ? titleLink.getAttribute("href") || "" : "";
        const idMatch = href.match(/\/works\/(\d+)/);
        const id = idMatch ? idMatch[1] : String(li.id || "").replace(/^work_/, "");
        const authorEl = li.querySelector("h4.heading a[rel='author']");
        const fandoms = Array.from(li.querySelectorAll("h5.fandoms a.tag")).map((a) => a.textContent.trim());
        const rels = Array.from(li.querySelectorAll("ul.tags li.relationships a.tag")).map((a) => a.textContent.trim());
        const chars = Array.from(li.querySelectorAll("ul.tags li.characters a.tag")).map((a) => a.textContent.trim());
        const freeforms = Array.from(li.querySelectorAll("ul.tags li.freeforms a.tag")).map((a) => a.textContent.trim());
        const summaryEl = li.querySelector("blockquote.userstuff.summary");
        const wordsEl = li.querySelector("dl.stats dd.words");
        const kudosEl = li.querySelector("dl.stats dd.kudos");
        const locked = Boolean(li.querySelector("img[title*='Restricted'], span.locked"));

        return {
          index: idx + 1,
          id,
          title: titleLink ? titleLink.textContent.trim() : "无题",
          author: authorEl ? authorEl.textContent.trim() : "匿名",
          fandom: fandoms.join(" / ") || "未知",
          relationships: rels.join("、"),
          characters: chars.slice(0, 6).join("、"),
          tags: freeforms.slice(0, 8),
          summary: summaryEl ? summaryEl.textContent.replace(/\s+/g, " ").trim().slice(0, 220) : "（无摘要）",
          words: wordsEl ? wordsEl.textContent.trim() : "未知",
          kudos: kudosEl ? kudosEl.textContent.trim() : "0",
          locked,
          url: id ? `https://archiveofourown.org/works/${id}` : ""
        };
      }).filter((x) => x.id);
    }

    // Node.js 单元测试轻量回退解析
    const out = [];
    const re = /<li[^>]*class="[^"]*work[^"]*blurb[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = re.exec(raw)) && out.length < 8) {
      const block = m[1];
      const tm = block.match(/<a[^>]*href="[^"]*\/works\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (!tm) continue;
      const am = block.match(/rel="author"[^>]*>([\s\S]*?)<\/a>/i);
      const wm = block.match(/class="words"[^>]*>([\s\S]*?)<\/dd>/i);
      out.push({
        index: out.length + 1,
        id: tm[1],
        title: stripHtml(tm[2]),
        author: am ? stripHtml(am[1]) : "匿名",
        fandom: "未知",
        relationships: "",
        characters: "",
        tags: [],
        summary: "（摘要）",
        words: wm ? stripHtml(wm[1]) : "未知",
        kudos: "0",
        locked: /Restricted|locked/i.test(block),
        url: `https://archiveofourown.org/works/${tm[1]}`
      });
    }
    return out;
  }

  function parseAo3WorkHtml(html, workId) {
    const raw = String(html || "");
    if (/only available to registered users|Log In<\/h2>/i.test(raw) && !/id="chapters"/i.test(raw)) {
      return { locked: true, error: "该作品为 AO3 仅注册用户可见的蓝锁作品，免登录暂无法调阅正文。" };
    }

    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      const titleEl = doc.querySelector("h2.title.heading");
      const authorEl = doc.querySelector("h3.byline.heading a[rel='author']");
      const wordsEl = doc.querySelector("dl.stats dd.words");
      const chaptersEl = doc.querySelector("dl.stats dd.chapters");
      const summaryEl = doc.querySelector("div.summary blockquote.userstuff");
      const chapterNodes = Array.from(doc.querySelectorAll("#chapters .userstuff"));
      const fullText = chapterNodes
        .map((node) => {
          const clone = node.cloneNode(true);
          clone.querySelectorAll("h3.landmark.heading").forEach((h3) => h3.remove());
          return clone.textContent.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
        })
        .filter(Boolean)
        .join("\n\n---\n\n");

      return {
        locked: false,
        work_id: String(workId),
        title: titleEl ? titleEl.textContent.trim() : `作品 #${workId}`,
        author: authorEl ? authorEl.textContent.trim() : "匿名",
        words: wordsEl ? wordsEl.textContent.trim() : String(fullText.length),
        chapters: chaptersEl ? chaptersEl.textContent.trim() : "1/1",
        summary: summaryEl ? summaryEl.textContent.trim() : "",
        content: fullText,
        url: `https://archiveofourown.org/works/${workId}`
      };
    }

    const tm = raw.match(/<h2[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
    const cm = raw.match(/<div[^>]*id="chapters"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) || raw.match(/<div[^>]*class="[^"]*userstuff[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const fullText = cm ? stripHtml(cm[1]) : stripHtml(raw);
    return {
      locked: false,
      work_id: String(workId),
      title: tm ? stripHtml(tm[1]) : `作品 #${workId}`,
      author: "匿名",
      words: String(fullText.length),
      chapters: "1/1",
      summary: "",
      content: fullText,
      url: `https://archiveofourown.org/works/${workId}`
    };
  }

  function paginateContent(fullText, page = 1, pageSize = DEFAULT_PAGE_CHARS) {
    const text = String(fullText || "");
    const size = Math.max(1000, Math.min(8000, Number(pageSize) || DEFAULT_PAGE_CHARS));
    const totalPages = Math.max(1, Math.ceil(text.length / size));
    const curPage = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
    const start = (curPage - 1) * size;
    const slice = text.slice(start, start + size);
    return {
      page: curPage,
      totalPages,
      hasMore: curPage < totalPages,
      content: slice,
      totalChars: text.length
    };
  }

  // ==========================================
  // 2. 网关请求 & 15 分钟缓存
  // ==========================================
  async function fetchAo3Html(subPathWithQuery, overridePrefs = null) {
    const prefs = overridePrefs ? { ...getPrefs(), ...overridePrefs } : getPrefs();
    const base = String(prefs.gatewayUrl || "").trim().replace(/\/+$/, "");
    if (!base) {
      throw new Error("尚未配置 AO3 转发网关地址，请先在「设置 → MCP 工具箱 → AO3 同人网关配置」中填写（可一键复用 Worker /ao3）。");
    }

    const url = `${base}${subPathWithQuery.startsWith("/") ? "" : "/"}${subPathWithQuery}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 18000) : null;
    try {
      const res = await fetch(url, { method: "GET", signal: controller ? controller.signal : undefined });
      if (res.status === 429) {
        throw new Error("AO3 当前触发限流（429 Too Many Requests），请稍等 1~2 分钟后再试。");
      }
      if (!res.ok) {
        throw new Error(`AO3 网关响应异常 (${res.status})`);
      }
      return await res.text();
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("连接 AO3 超时（18秒），请稍后重试或检查网关状态。");
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function testConnection(overridePrefs = null) {
    const prefs = overridePrefs ? { ...getPrefs(), ...overridePrefs } : getPrefs();
    const base = String(prefs.gatewayUrl || "").trim().replace(/\/+$/, "");
    if (!base) throw new Error("请先填写 AO3 网关地址");
    const res = await fetch(base, { method: "GET" });
    if (!res.ok) throw new Error(`网关状态异常 (${res.status})`);
    const html = await fetchAo3Html("/works/search?work_search%5Bquery%5D=test", prefs);
    const parsed = parseAo3SearchHtml(html);
    return { ok: true, sampleCount: parsed.length };
  }

  async function handleToolCall(args = {}) {
    await hydrate();
    if (!isConfigured()) {
      return {
        status: "unconfigured",
        error: "主公尚未配置 AO3 转发网关。请先在「设置 → MCP 工具箱 → AO3 同人检索网关配置」点一下「⚡ 一键复用 Worker (/ao3)」。"
      };
    }

    const action = String(args.action || "search").trim();

    try {
      if (action === "read") {
        let targetId = "";
        const titleQ = String(args.title || args.keyword || "").trim();

        if (args.work_id && /^\d+$/.test(String(args.work_id).trim())) {
          targetId = String(args.work_id).trim();
        }
        if (!targetId && args.work_index && _lastSearchResults.length > 0) {
          const idx = parseInt(args.work_index, 10) - 1;
          if (idx >= 0 && idx < _lastSearchResults.length) targetId = _lastSearchResults[idx].id;
        }
        if (!targetId && titleQ && _lastSearchResults.length > 0) {
          const hit = _lastSearchResults.find((w) => w.title.includes(titleQ) || titleQ.includes(w.title));
          if (hit) targetId = hit.id;
        }
        if (!targetId && titleQ) {
          const sRes = await handleToolCall({ action: "search", keyword: titleQ, fandom: args.fandom || "" });
          if (sRes.status === "success" && sRes.results && sRes.results.length > 0) {
            targetId = sRes.results[0].id;
          }
        }
        if (!targetId) {
          return { status: "error", error: "未能定位到作品编号，请先搜索该同人或直接提供作品 ID。" };
        }

        const now = Date.now();
        let work = null;
        const cached = _workCache.get(targetId);
        if (cached && now - cached.ts < CACHE_TTL_MS) {
          work = cached.work;
        } else {
          const html = await fetchAo3Html(`/works/${targetId}?view_adult=true&view_full_work=true`);
          work = parseAo3WorkHtml(html, targetId);
          if (!work.locked) {
            _workCache.set(targetId, { ts: now, work });
          }
        }

        if (work.locked) {
          return { status: "locked", work_id: targetId, error: work.error };
        }

        const paged = paginateContent(work.content, args.page || 1, DEFAULT_PAGE_CHARS);
        return {
          status: "success",
          action: "read",
          work_id: targetId,
          title: work.title,
          author: work.author,
          words: work.words,
          chapters: work.chapters,
          page: paged.page,
          totalPages: paged.totalPages,
          hasMore: paged.hasMore,
          url: work.url,
          content: paged.content,
          message: `《${work.title}》（作者：${work.author} · 第 ${paged.page}/${paged.totalPages} 页${paged.hasMore ? "，可说“接着看下一页”续读" : "，已至文末"}）：\n\n${paged.content}`
        };
      }

      // search 模式
      const kw = String(args.keyword || args.title || "").trim();
      if (!kw) return { status: "need_params", error: "请提供搜索关键词、作品名或 CP 名。" };
      const fandom = String(args.fandom || "").trim();
      const cacheKey = `${kw}::${fandom}`;
      const now = Date.now();

      let results = null;
      const cached = _searchCache.get(cacheKey);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        results = cached.results;
      } else {
        const qs = new URLSearchParams();
        qs.set("work_search[query]", kw);
        if (fandom) qs.set("work_search[fandom_names]", fandom);
        const html = await fetchAo3Html(`/works/search?${qs.toString()}`);
        results = parseAo3SearchHtml(html);
        _searchCache.set(cacheKey, { ts: now, results });
      }

      _lastSearchResults = results;
      if (typeof window !== "undefined") window.__last_ao3_search_results = results;

      if (results.length === 0) {
        return { status: "empty", query: kw, message: `在 AO3 上暂未检索到与「${kw}」相关的公开作品。` };
      }

      return {
        status: "success",
        action: "search",
        count: results.length,
        results,
        tip: "想看哪篇正文，直接说“读第 1 篇”或说出作品名即可，长文支持分页续读。"
      };
    } catch (err) {
      return { status: "error", error: err.message || "AO3 检索失败" };
    }
  }

  // ==========================================
  // 3. React UI：设置页极简配置卡
  // ==========================================
  function Ao3GatewayConfigCard() {
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
      const onC = () => setPrefs(getPrefs());
      const onS = () => {
        setSavedHint("已自动保存至 IndexedDB ✓");
        setTimeout(() => setSavedHint(""), 2000);
      };
      global.addEventListener("milvus-ao3-prefs-changed", onC);
      global.addEventListener("milvus-ao3-saved", onS);
      return () => {
        global.removeEventListener("milvus-ao3-prefs-changed", onC);
        global.removeEventListener("milvus-ao3-saved", onS);
      };
    }, []);

    const updateField = (k, v) => setPrefs(savePrefs({ [k]: v }));

    const handleReuse = () => {
      const url = deriveGatewayFromExisting();
      if (!url) {
        setTestMsg("未检测到已填的 Worker 地址，请手动填入 `你的Worker域名/ao3`");
        return;
      }
      updateField("gatewayUrl", url);
      setTestMsg(`已自动填入：${url}`);
    };

    const handleTest = async () => {
      setTesting(true);
      setTestMsg("正在探测 AO3 网关连通性...");
      try {
        const res = await testConnection(prefs);
        setTestMsg(`✅ 连通成功！已通过网关实时解析 AO3 搜索页（样例命中 ${res.sampleCount} 篇）`);
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
            "📚 AO3 同人检索 · 云端网关配置",
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
            savedHint || "复用同一个 Cloudflare Worker（末尾加 /ao3），免 Python 实时搜文与分页阅读"
          )
        ),
        h("span", { style: { fontSize: "12px", color: "#6F7668", fontWeight: "700" } }, expanded ? "收起 ▲" : "展开配置 ▼")
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
              h("span", { style: { fontSize: "11.5px", fontWeight: "600", color: "#5A6254" } }, "AO3 转发网关地址"),
              h(
                "button",
                {
                  type: "button",
                  onClick: handleReuse,
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
                "⚡ 一键复用 Worker (/ao3)"
              )
            ),
            h("input", {
              type: "text",
              value: prefs.gatewayUrl || "",
              onChange: (e) => updateField("gatewayUrl", e.target.value),
              placeholder: "如 https://luckin-mcp.xxx.workers.dev/ao3 或 http://127.0.0.1:8765/ao3",
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
                background: configured ? "#9B2C2C" : "#D4D1C9",
                color: "#FFFFFF",
                fontSize: "12px",
                fontWeight: "700",
                cursor: configured ? "pointer" : "not-allowed"
              }
            },
            testing ? "探测中..." : "🔍 测试 AO3 网关连通性"
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
    resetForTest,
    isConfigured,
    deriveGatewayFromExisting,
    parseAo3SearchHtml,
    parseAo3WorkHtml,
    paginateContent,
    testConnection,
    handleToolCall,
    Ao3GatewayConfigCard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.Ao3ReaderEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

