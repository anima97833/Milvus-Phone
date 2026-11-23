/**
 * Milvus/mcp_router_engine.js
 * 设置 · MCP 工具智能按需路由与环境隔离引擎（Phase 0）
 * - 100% IndexedDB 持久化（复用 t8_chat_db -> user_settings，零 localStorage 占用）+ 内存热缓存
 * - 工具能力分级：区分纯前端可用 / 需外网 / 需本地代理(127.0.0.1:8765)，默认隔离不可用的本地代理工具
 * - 智能按需挂载（smart 模式）：按近两轮对话意图挂载 0~3 个相关工具，日常闲聊零 Token 浪费、零误触
 * - 私聊 / 群聊作用域隔离 + 与 ChatPacingEngine 红包节律双通道联动
 * - 不支持 Function Calling 的模型自动记忆降级（7 天缓存），告别每轮 400 重试翻倍延迟
 */
(function (global) {
  "use strict";

  const IDB_PREFS_KEY = "milvus_mcp_router_prefs_v1";
  const IDB_MODEL_CAPS_KEY = "milvus_mcp_model_caps_v1";
  const MODEL_CAP_TTL_MS = 7 * 24 * 3600 * 1000;

  const DEFAULT_PREFS = {
    mode: "smart",           // "smart" (智能按需挂载，推荐) | "full" (全量挂载)
    allowLocalProxy: false,  // 是否允许需 127.0.0.1:8765 本地代理的工具（IMA/瑞幸/AO3）
    dedupeRedPacket: true    // 与传讯红包节律门控联动，防双通道连发
  };

  // 17 个内置工具的能力画像、作用域与轻量意图触发正则
  const TOOL_META = {
    send_red_packet: {
      runtime: "frontend",
      scope: "solo",
      badge: "纯前端 · 仅私聊",
      intents: /(红包|发薪|俸禄|报销|打赏|零花钱|压岁|过年|生辰|赏钱|买糖|买蜜饯|发钱)/i
    },
    send_gift: {
      runtime: "frontend",
      scope: "solo",
      badge: "纯前端 · 仅私聊",
      intents: /(送礼|礼物|信物|赠予|送我|送你|特产|伴手礼|定情)/i
    },
    spicy_monopoly_game: {
      runtime: "external",
      scope: "solo",
      badge: "需外网 · 仅私聊",
      intents: /(大富翁|棋盘|掷骰|走格|买地|过路费|换卡|功能卡|安全词|monopoly|new_game)/i
    },
    manage_ima_notes: {
      runtime: "external",
      scope: "solo",
      badge: "需配 IMA 网关 · 仅私聊",
      intents: /(ima|知识库|腾讯笔记|云笔记|存笔记|记笔记|查笔记|写笔记|读笔记|追加笔记)/i
    },
    order_luckin_coffee: {
      runtime: "external",
      scope: "solo",
      badge: "需配瑞幸网关 · 仅私聊",
      intents: /(瑞幸|luckin|生椰拿铁|橙c美式|酱香拿铁|拿铁|美式|点杯咖啡|买咖啡|喝咖啡|查门店|取餐码)/i
    },
    mcdonalds_assistant: {
      runtime: "external",
      scope: "solo",
      badge: "需配麦当劳网关 · 仅私聊",
      intents: /(麦当劳|麦门|金拱门|mcd|汉堡|薯条|麦乐鸡|麦旋风|巨无霸|板烧|麦辣|领券|优惠券|麦当劳积分|活动日历)/i
    },
    read_day: {
      runtime: "frontend",
      scope: "solo",
      badge: "纯前端 · 记忆原话",
      intents: /(那天|上次|之前说过|还记得|当初|原话|回忆|read_day|<memory)/i
    },
    phantom_touch_control: {
      runtime: "external",
      scope: "solo",
      badge: "连线后生效 · 仅私聊",
      requireConnected: true,
      intents: /.+/
    },
    search_ao3_fanfics: {
      runtime: "external",
      scope: "both",
      badge: "需配 AO3 网关",
      intents: /(ao3|同人文|同人小说|找文|搜文|看文|读第\d+篇|第\d+页|翻页|续读)/i
    },
    query_ancient_cuisine: {
      runtime: "frontend",
      scope: "both",
      badge: "纯前端可用",
      intents: /(御膳|食单|菜单|吃什么|菜谱|点菜|宵夜|用膳|下厨|做菜)/i
    },
    match_ancient_poetry: {
      runtime: "frontend",
      scope: "both",
      badge: "纯前端可用",
      intents: /(飞花令|对诗|诗词|吟诗|作诗|古诗|赋诗|对联)/i
    },
    search_world_book: {
      runtime: "frontend",
      scope: "both",
      badge: "纯前端可用",
      intents: /(世界书|设定|典籍|卷宗|查一下|背景资料|旧事|历史记载|密档)/i
    },
    record_character_memo: {
      runtime: "frontend",
      scope: "solo",
      badge: "纯前端 · 仅私聊",
      intents: /(备忘|记一下|记下来|提醒我|别忘了|日程|日历|安排|计划|待办)/i
    },
    create_shop_order: {
      runtime: "frontend",
      scope: "solo",
      badge: "纯前端 · 仅私聊",
      intents: /(太疾驰|下单|买单|商城|外卖|网购|购物车|代购|记账)/i
    },
    cast_chenwei_hexagram: {
      runtime: "frontend",
      scope: "both",
      badge: "纯前端可用",
      intents: /(算卦|算一卦|占一卦|算命|占卜|起卦|卜一卦|运势|吉凶|谶纬|天机|抽签|求签)/i
    },
    simulate_sandplay: {
      runtime: "frontend",
      scope: "both",
      badge: "纯前端可用",
      intents: /(沙盘|兵推|排兵布阵|战局|军略|推演|行军|攻城|伏击)/i
    },
    get_current_time_and_lunar: {
      runtime: "frontend",
      scope: "both",
      badge: "纯前端可用",
      intents: /(几点了|什么时辰|农历|阴历|节气|黄历|今天星期几|几号)/i
    },
    generate_pollinations_image: {
      runtime: "external",
      scope: "both",
      badge: "需外网生图",
      intents: /(画一张|画一幅|生成图片|生图|丹青|绘卷|给我画|发张图|拍张照)/i
    },
    draw_handdrawn_sketch: {
      runtime: "frontend",
      scope: "both",
      badge: "纯前端可用",
      intents: /(简笔画|手绘|线稿|画个小人|涂鸦|素描)/i
    },
    publish_moment: {
      runtime: "frontend",
      scope: "solo",
      badge: "纯前端 · 仅私聊",
      intents: /(发朋友圈|发个朋友圈|发动态|发条动态|晒照|发圈)/i
    }
  };

  // 外部大富翁 MCP 节点附带工具名集合
  const MONOPOLY_EXT_NAMES = new Set([
    "new_game", "roll", "game_action", "game_info", "buy_card", "use_card", "discard", "status", "rules"
  ]);

  // ==========================================
  // 1. 内存热缓存 + 100% IndexedDB 异步持久化层
  // ==========================================
  let _prefsCache = { ...DEFAULT_PREFS };
  let _modelCapsCache = {}; // { "url::model": { noTools: true, updatedAt: ts } }
  let _hydratePromise = null;

  function hasMainIDB() {
    return (
      typeof global !== "undefined" &&
      typeof global.openDB === "function" &&
      global.STORES &&
      global.STORES.USER_SETTINGS
    );
  }

  async function idbRead(key) {
    if (!hasMainIDB()) return null;
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

  async function idbWrite(key, value) {
    if (!hasMainIDB()) return false;
    try {
      const db = await global.openDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([global.STORES.USER_SETTINGS], "readwrite");
        tx.objectStore(global.STORES.USER_SETTINGS).put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  function hydrate() {
    if (_hydratePromise) return _hydratePromise;
    _hydratePromise = (async () => {
      try {
        const [savedPrefs, savedCaps] = await Promise.all([
          idbRead(IDB_PREFS_KEY),
          idbRead(IDB_MODEL_CAPS_KEY)
        ]);
        if (savedPrefs && typeof savedPrefs === "object") {
          _prefsCache = { ...DEFAULT_PREFS, ...savedPrefs };
        }
        if (savedCaps && typeof savedCaps === "object") {
          _modelCapsCache = { ...savedCaps };
        }
        if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
          global.dispatchEvent(new CustomEvent("milvus-mcp-router-changed", { detail: _prefsCache }));
        }
      } catch (e) {}
      return { prefs: _prefsCache, modelCaps: _modelCapsCache };
    })();
    return _hydratePromise;
  }

  if (typeof window !== "undefined") {
    setTimeout(() => {
      hydrate();
    }, 150);
  }

  function getPrefs() {
    return { ...DEFAULT_PREFS, ..._prefsCache };
  }

  function savePrefs(patch) {
    _prefsCache = { ...getPrefs(), ...(patch || {}) };
    idbWrite(IDB_PREFS_KEY, _prefsCache);
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-mcp-router-changed", { detail: _prefsCache }));
    }
    return getPrefs();
  }

  function resetStateForTest() {
    _prefsCache = { ...DEFAULT_PREFS };
    _modelCapsCache = {};
  }

  // ==========================================
  // 2. 不支持 tools 的模型自动记忆降级（7 天有效）
  // ==========================================
  function makeModelKey(siteUrl, model) {
    return `${String(siteUrl || "").trim().toLowerCase()}::${String(model || "").trim().toLowerCase()}`;
  }

  function isModelNoTools(siteUrl, model) {
    const key = makeModelKey(siteUrl, model);
    const rec = _modelCapsCache[key];
    if (!rec || !rec.noTools) return false;
    if (Date.now() - (rec.updatedAt || 0) > MODEL_CAP_TTL_MS) {
      delete _modelCapsCache[key];
      idbWrite(IDB_MODEL_CAPS_KEY, _modelCapsCache);
      return false;
    }
    return true;
  }

  function markModelNoTools(siteUrl, model) {
    const key = makeModelKey(siteUrl, model);
    if (!key || key === "::") return;
    _modelCapsCache[key] = { noTools: true, updatedAt: Date.now() };
    idbWrite(IDB_MODEL_CAPS_KEY, _modelCapsCache);
  }

  function clearModelNoToolsCache() {
    _modelCapsCache = {};
    idbWrite(IDB_MODEL_CAPS_KEY, _modelCapsCache);
  }

  // ==========================================
  // 3. 工具元数据查询 & 智能按需路由
  // ==========================================
  function getToolMeta(toolName) {
    const name = String(toolName || "");
    if (TOOL_META[name]) return TOOL_META[name];
    if (MONOPOLY_EXT_NAMES.has(name)) {
      return {
        runtime: "external",
        scope: "solo",
        badge: "外部节点 · 仅私聊",
        intents: TOOL_META.spicy_monopoly_game.intents
      };
    }
    return {
      runtime: "external",
      scope: "both",
      badge: "外部 MCP",
      intents: null
    };
  }

  function extractRecentContextText(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return "";
    // 仅取最近 3 条非 system 消息，避免被远古对话误触发
    const nonSys = messages.filter((m) => m && m.role !== "system");
    const recent = nonSys.slice(-3);
    return recent
      .map((m) => {
        if (typeof m.content === "string") return m.content;
        if (Array.isArray(m.content)) {
          return m.content.map((p) => (p && typeof p.text === "string" ? p.text : "")).join(" ");
        }
        return "";
      })
      .join("\n");
  }

  function selectToolsForRequest(params = {}) {
    const allActiveTools = Array.isArray(params.allActiveTools) ? params.allActiveTools : [];
    const messages = Array.isArray(params.messages) ? params.messages : [];
    const isGroup = Boolean(params.isGroup);
    const pacingGate = params.pacingGate || null;
    const siteUrl = params.siteUrl || "";
    const model = params.model || "";

    if (allActiveTools.length === 0) {
      return { tools: [], instruction: "", reason: "no_active_tools", matchedNames: [] };
    }

    if (siteUrl && model && isModelNoTools(siteUrl, model)) {
      return { tools: [], instruction: "", reason: "model_no_tools_cached", matchedNames: [] };
    }

    const prefs = getPrefs();
    const recentText = extractRecentContextText(messages);

    // Step 1：环境 & 作用域 & 双通道硬过滤
    const eligible = [];
    for (const toolDef of allActiveTools) {
      const fn = toolDef && (toolDef.function || toolDef);
      const name = fn && fn.name ? String(fn.name) : "";
      if (!name) continue;
      const meta = getToolMeta(name);

      // 隔离需 127.0.0.1:8765 本地代理的工具
      if (meta.runtime === "local_proxy" && !prefs.allowLocalProxy) {
        continue;
      }

      // 群聊隔离单人专属工具（防群名发朋友圈/送礼/私聊红包）
      if (isGroup && meta.scope === "solo") {
        continue;
      }

      // 外设工具未连线时彻底屏蔽（零打扰、零 Token 浪费）
      if (name === "phantom_touch_control" && !(global.PhantomTouchEngine && typeof global.PhantomTouchEngine.isConnected === "function" && global.PhantomTouchEngine.isConnected())) {
        continue;
      }

      // 与 ChatPacingEngine 红包节律联动
      if (name === "send_red_packet" && prefs.dedupeRedPacket && pacingGate && pacingGate.allowRedPacket === false) {
        continue;
      }

      eligible.push({ toolDef, name, fn, meta });
    }

    if (eligible.length === 0) {
      return { tools: [], instruction: "", reason: "all_filtered_by_env_or_scope", matchedNames: [] };
    }

    // Step 2：smart 按需路由 vs full 全量模式
    let chosen = [];
    if (prefs.mode === "full") {
      chosen = eligible;
    } else {
      for (const item of eligible) {
        if (item.meta.intents) {
          if (item.meta.intents.test(recentText)) {
            chosen.push(item);
          }
        } else {
          // 未知外部自定义工具：匹配其名称或描述中的 2 字以上中文/英文词
          const desc = `${item.name} ${item.fn.description || ""}`;
          const kws = desc.match(/[\u4e00-\u9fa5]{2,4}|[a-zA-Z]{4,}/g) || [];
          const hit = kws.some((kw) => kw.length >= 2 && recentText.toLowerCase().includes(kw.toLowerCase()));
          if (hit) chosen.push(item);
        }
      }
    }

    if (chosen.length === 0) {
      return { tools: [], instruction: "", reason: "smart_no_intent_match", matchedNames: [] };
    }

    // Step 3：生成精简、契合本轮挂载工具的指令（绝不塞无关的大富翁铁律）
    const toolsDescList = chosen
      .map((item, i) => `${i + 1}. ${item.name}: ${item.fn.description || "执行对应操作"}`)
      .join("\n");

    const instruction = `\n\n【MCP 工具按需就绪（本轮挂载 ${chosen.length} 个相关工具）】\n${toolsDescList}\n使用规范：仅当确实需要借助上述工具完成用户请求时发起 tool_calls；工具返回真实结果后，请自然融入当前角色口吻回复，切勿生硬复述 JSON。`;

    return {
      tools: chosen.map((c) => c.toolDef),
      instruction,
      reason: prefs.mode === "full" ? "full_mode" : "smart_matched",
      matchedNames: chosen.map((c) => c.name)
    };
  }

  function getToolBadge(toolName) {
    const meta = getToolMeta(toolName);
    const colorMap = {
      frontend: { bg: "#EEF6F1", fg: "#2F6B48", border: "#CFE5D7" },
      external: { bg: "#FEF6EC", fg: "#9C5B1A", border: "#F3D9B5" },
      local_proxy: { bg: "#FDEFEF", fg: "#A63D3D", border: "#F2CACA" }
    };
    return {
      ...meta,
      style: colorMap[meta.runtime] || colorMap.external
    };
  }

  function ToolBadgePill({ toolName }) {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const b = getToolBadge(toolName);
    return h(
      "span",
      {
        style: {
          display: "inline-block",
          marginLeft: "6px",
          padding: "1px 6px",
          borderRadius: "999px",
          fontSize: "10px",
          fontWeight: "700",
          background: b.style.bg,
          color: b.style.fg,
          border: `1px solid ${b.style.border}`,
          verticalAlign: "middle"
        }
      },
      b.badge
    );
  }

  function McpRouterControlCard() {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const [prefs, setPrefs] = useState(() => getPrefs());
    const [clearedTip, setClearedTip] = useState(false);

    useEffect(() => {
      hydrate().then(() => setPrefs(getPrefs()));
      const onChange = () => setPrefs(getPrefs());
      global.addEventListener("milvus-mcp-router-changed", onChange);
      return () => global.removeEventListener("milvus-mcp-router-changed", onChange);
    }, []);

    const update = (patch) => setPrefs(savePrefs(patch));

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
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" } },
        h(
          "div",
          null,
          h("div", { style: { fontSize: "13px", fontWeight: "700", color: "#3B4235" } }, "⚡ 智能按需挂载（省 Token · 防误触）"),
          h("div", { style: { fontSize: "11px", color: "#8E9485", marginTop: "2px" } }, "仅在对话涉及对应话题时挂载相关工具，日常闲聊 0 额外开销，群聊自动隔离单人工具")
        ),
        h(
          "div",
          { style: { display: "flex", gap: "4px", flexShrink: 0 } },
          [
            { id: "smart", label: "智能按需" },
            { id: "full", label: "全量" }
          ].map((opt) => {
            const active = (prefs.mode || "smart") === opt.id;
            return h(
              "button",
              {
                key: opt.id,
                type: "button",
                onClick: () => update({ mode: opt.id }),
                style: {
                  padding: "5px 9px",
                  borderRadius: "8px",
                  border: active ? "1.5px solid #4E7E8E" : "1px solid #DCD7CC",
                  background: active ? "#EDF5F7" : "#FAF8F4",
                  color: active ? "#2E5B69" : "#7B8072",
                  fontSize: "11px",
                  fontWeight: active ? "700" : "500",
                  cursor: "pointer"
                }
              },
              opt.label
            );
          })
        )
      ),
      h(
        "label",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "11.5px",
            color: "#5C6355",
            paddingTop: "8px",
            borderTop: "1px solid #F1EEE6",
            cursor: "pointer"
          }
        },
        h("span", null, "允许需本地代理 (127.0.0.1:8765) 的工具（IMA / 瑞幸 / AO3）"),
        h("input", {
          type: "checkbox",
          checked: Boolean(prefs.allowLocalProxy),
          onChange: (e) => update({ allowLocalProxy: e.target.checked }),
          style: { width: "16px", height: "16px", cursor: "pointer" }
        })
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "#8E9485" } },
        h("span", null, "已自动记住不支持 tools 参数的模型，避免每轮报错重试"),
        h(
          "button",
          {
            type: "button",
            onClick: () => {
              clearModelNoToolsCache();
              setClearedTip(true);
              setTimeout(() => setClearedTip(false), 1800);
            },
            style: {
              border: "1px solid #DCD7CC",
              background: "#FAF8F4",
              color: "#5A6254",
              borderRadius: "999px",
              padding: "3px 9px",
              fontSize: "10.5px",
              cursor: "pointer"
            }
          },
          clearedTip ? "已重置 ✓" : "重置模型缓存"
        )
      )
    );
  }

  const api = {
    TOOL_META,
    hydrate,
    getPrefs,
    savePrefs,
    resetStateForTest,
    isModelNoTools,
    markModelNoTools,
    clearModelNoToolsCache,
    getToolMeta,
    getToolBadge,
    selectToolsForRequest,
    ToolBadgePill,
    McpRouterControlCard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.McpRouterEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
