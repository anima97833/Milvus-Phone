/**
 * Milvus/chat_settings_organizer.js
 * 传讯 · 对话偏好设置「分层折叠 + 顶部吸顶搜索」独立引擎
 * - 将设置项清晰归为「基础设置」与「进阶设置」两大折叠面板（带旋转小三角 ▾ / ▸）
 * - 顶部吸顶搜索栏支持中文名称、描述与别名模糊检索，搜索时自动展开双分组，清空还原
 * - 折叠与搜索均采用 CSS display 保活，绝不卸载子组件、不丢表单状态、不重复拉取 DB
 * - 折叠偏好持久化至独立 IndexedDB（milvus_mcp_vault_idb），零 localStorage 占用
 */
(function (global) {
  "use strict";

  const VAULT_DB = "milvus_mcp_vault_idb";
  const VAULT_STORE = "kv";
  const ACCORDION_KEY = "milvus_cs_accordion_v1";

  const DEFAULT_STATE = {
    basicOpen: true,
    advancedOpen: false
  };

  let _dbPromise = null;
  let _stateCache = { ...DEFAULT_STATE };
  let _hydrated = false;

  function openVaultDB() {
    if (_dbPromise) return _dbPromise;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    _dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(VAULT_DB, 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(VAULT_STORE)) {
            db.createObjectStore(VAULT_STORE, { keyPath: "key" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return _dbPromise;
  }

  async function hydrateAccordionState() {
    if (_hydrated) return { ..._stateCache };
    const db = await openVaultDB();
    if (!db) {
      _hydrated = true;
      return { ..._stateCache };
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([VAULT_STORE], "readonly");
        const req = tx.objectStore(VAULT_STORE).get(ACCORDION_KEY);
        req.onsuccess = () => {
          const val = req.result && req.result.value;
          if (val && typeof val === "object") {
            _stateCache = {
              basicOpen: val.basicOpen !== false,
              advancedOpen: Boolean(val.advancedOpen)
            };
          }
          _hydrated = true;
          resolve({ ..._stateCache });
        };
        req.onerror = () => {
          _hydrated = true;
          resolve({ ..._stateCache });
        };
      } catch (e) {
        _hydrated = true;
        resolve({ ..._stateCache });
      }
    });
  }

  async function saveAccordionState(next) {
    _stateCache = {
      basicOpen: next.basicOpen !== false,
      advancedOpen: Boolean(next.advancedOpen)
    };
    const db = await openVaultDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([VAULT_STORE], "readwrite");
        tx.objectStore(VAULT_STORE).put({ key: ACCORDION_KEY, value: _stateCache, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  // ==========================================
  // 纯函数检索引擎（支持多词空格分词 + 别名模糊匹配）
  // ==========================================
  function filterSettingsItems(items, rawQuery) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    const q = String(rawQuery || "").trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const matchedIds = new Set();
    let basicCount = 0;
    let advancedCount = 0;

    for (const item of list) {
      const id = String(item.id || "");
      const group = item.group === "advanced" ? "advanced" : "basic";
      if (tokens.length === 0) {
        matchedIds.add(id);
        if (group === "basic") basicCount++;
        else advancedCount++;
        continue;
      }
      const haystack = `${item.title || ""} ${item.keywords || ""} ${group === "basic" ? "基础设置" : "进阶设置 高级设置"}`.toLowerCase();
      const ok = tokens.every((tk) => haystack.includes(tk));
      if (ok) {
        matchedIds.add(id);
        if (group === "basic") basicCount++;
        else advancedCount++;
      }
    }

    return {
      isSearching: tokens.length > 0,
      matchedIds,
      basicCount,
      advancedCount,
      totalMatched: basicCount + advancedCount
    };
  }

  // ==========================================
  // 独立 React 分层折叠 + 吸顶搜索容器组件
  // ==========================================
  function AccordionHeader(props) {
    const React = global.React;
    return React.createElement(
      "button",
      {
        type: "button",
        onClick: props.onToggle,
        style: {
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          background: props.open ? "#FAF7F0" : "#FFFFFF",
          border: "none",
          borderBottom: props.open ? "1px solid #ECE5D8" : "none",
          cursor: "pointer",
          textAlign: "left",
          color: "#3F382E",
          transition: "background 0.18s ease"
        }
      },
      React.createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        React.createElement(
          "span",
          {
            style: {
              display: "inline-block",
              fontSize: "12px",
              color: "#5E6756",
              transform: props.open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
              width: "14px",
              textAlign: "center"
            }
          },
          "▸"
        ),
        React.createElement("span", { style: { fontWeight: 700, fontSize: "13.5px" } }, props.title),
        props.subtitle &&
          React.createElement("span", { style: { fontSize: "11px", color: "#8C8375" } }, props.subtitle)
      ),
      React.createElement(
        "span",
        {
          style: {
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "999px",
            background: props.open ? "rgba(94, 103, 86, 0.12)" : "#F2EFE8",
            color: props.open ? "#4E5747" : "#7D7568",
            fontWeight: 600
          }
        },
        `${props.count} 项`
      )
    );
  }

  function ChatSettingsShell(props) {
    const React = global.React;
    if (!React) return null;
    const { useState, useEffect, useMemo } = React;
    const items = Array.isArray(props && props.items) ? props.items.filter(Boolean) : [];
    const [query, setQuery] = useState("");
    const [accState, setAccState] = useState(_stateCache);

    useEffect(() => {
      let alive = true;
      hydrateAccordionState().then((st) => alive && setAccState(st));
      return () => { alive = false; };
    }, []);

    const toggleGroup = (key) => {
      setAccState((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        saveAccordionState(next).catch(() => {});
        return next;
      });
    };

    const result = useMemo(() => filterSettingsItems(items, query), [items, query]);
    const basicItems = useMemo(() => items.filter((i) => i.group !== "advanced"), [items]);
    const advancedItems = useMemo(() => items.filter((i) => i.group === "advanced"), [items]);

    const showBasicSection = !result.isSearching || result.basicCount > 0;
    const showAdvancedSection = !result.isSearching || result.advancedCount > 0;
    const isBasicOpen = result.isSearching ? true : accState.basicOpen;
    const isAdvancedOpen = result.isSearching ? true : accState.advancedOpen;

    const sectionCardStyle = {
      margin: "10px 12px 12px",
      borderRadius: "14px",
      border: "1px solid #E5DFD3",
      background: "#FFFFFF",
      overflow: "hidden",
      boxShadow: "0 2px 10px rgba(60, 50, 40, 0.04)"
    };

    return React.createElement(
      "div",
      { style: { paddingBottom: "16px" } },
      // 顶部吸顶搜索栏
      React.createElement(
        "div",
        {
          style: {
            position: "sticky",
            top: 0,
            zIndex: 25,
            padding: "10px 12px 8px",
            background: "rgba(250, 248, 244, 0.94)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            borderBottom: "1px solid rgba(215, 206, 190, 0.55)"
          }
        },
        React.createElement(
          "div",
          { style: { position: "relative", display: "flex", alignItems: "center" } },
          React.createElement("span", { style: { position: "absolute", left: "11px", fontSize: "13px", color: "#8C8375", pointerEvents: "none" } }, "🔍"),
          React.createElement("input", {
            type: "text",
            value: query,
            placeholder: "搜索设置项（如：背景、记忆、音色、万象、清空…）",
            onChange: (e) => setQuery(e.target.value),
            style: {
              width: "100%",
              padding: "8px 34px 8px 32px",
              borderRadius: "999px",
              border: "1px solid #DDD4C3",
              background: "#FFFFFF",
              fontSize: "12.5px",
              color: "#3F382E",
              outline: "none",
              boxSizing: "border-box"
            }
          }),
          query &&
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => setQuery(""),
                style: {
                  position: "absolute",
                  right: "8px",
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  border: "none",
                  background: "#EAE4D8",
                  color: "#6B6357",
                  fontSize: "11px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0
                }
              },
              "✕"
            )
        ),
        result.isSearching &&
          React.createElement(
            "div",
            { style: { fontSize: "11px", color: "#7B7366", marginTop: "5px", paddingLeft: "6px" } },
            result.totalMatched > 0 ? `已筛选出 ${result.totalMatched} 项相关设置` : "未找到匹配的设置项，试试换个关键词"
          )
      ),
      // 分组一：基础设置（DOM 保活隐藏）
      React.createElement(
        "div",
        { style: { ...sectionCardStyle, display: showBasicSection ? "block" : "none" } },
        React.createElement(AccordionHeader, {
          title: "基础设置",
          subtitle: "常用模式 · 记忆 · 外观 · 数据",
          count: result.basicCount,
          open: isBasicOpen,
          onToggle: () => toggleGroup("basicOpen")
        }),
        React.createElement(
          "div",
          { style: { display: isBasicOpen ? "block" : "none" } },
          basicItems.map((item) =>
            React.createElement(
              "div",
              {
                key: item.id,
                "data-cs-item": item.id,
                style: { display: result.matchedIds.has(item.id) ? "block" : "none" }
              },
              item.node
            )
          )
        )
      ),
      // 分组二：进阶设置（DOM 保活隐藏）
      React.createElement(
        "div",
        { style: { ...sectionCardStyle, display: showAdvancedSection ? "block" : "none" } },
        React.createElement(AccordionHeader, {
          title: "进阶设置",
          subtitle: "好感 · 参数 · 提示词 · 音色 · 万象",
          count: result.advancedCount,
          open: isAdvancedOpen,
          onToggle: () => toggleGroup("advancedOpen")
        }),
        React.createElement(
          "div",
          { style: { display: isAdvancedOpen ? "block" : "none" } },
          advancedItems.map((item) =>
            React.createElement(
              "div",
              {
                key: item.id,
                "data-cs-item": item.id,
                style: { display: result.matchedIds.has(item.id) ? "block" : "none" }
              },
              item.node
            )
          )
        )
      )
    );
  }

  // ==========================================
  // 自动归组包裹器（零侵入 app.min.js，自动识别 React 子节点归入基础/进阶）
  // ==========================================
  function extractElementText(node, maxLen = 280) {
    let out = "";
    function walk(n) {
      if (out.length >= maxLen || n === null || n === undefined || typeof n === "boolean") return;
      if (typeof n === "string" || typeof n === "number") {
        out += " " + String(n);
        return;
      }
      if (Array.isArray(n)) {
        for (const c of n) {
          walk(c);
          if (out.length >= maxLen) break;
        }
        return;
      }
      if (typeof n === "object" && n.props) {
        if (typeof n.props.placeholder === "string") out += " " + n.props.placeholder;
        walk(n.props.children);
      }
    }
    walk(node);
    return out.replace(/\s+/g, " ").trim();
  }

  function isPureDividerNode(node) {
    if (!node || typeof node !== "object" || node.type !== "div" || !node.props) return false;
    const st = node.props.style || {};
    const hasChildren = node.props.children !== undefined && node.props.children !== null && node.props.children !== "";
    return !hasChildren && (st.height === "1px" || st.height === 1);
  }

  function isCompanionFollowup(text) {
    return /^(🎛️\s*语气旋钮调校|✍️\s*输入该角色的专属定制指令|导出当前角色数据|API密钥\b|输入Pixabay)/.test(text);
  }

  const BASIC_MATCHERS = [
    { re: /线上剧情模式/, title: "线上模式", kw: "线上 网络 表情包 网感" },
    { re: /线下剧情模式/, title: "线下模式", kw: "线下 面对面 动作 剧情" },
    { re: /心声查阅|读心术/, title: "心声查阅", kw: "心声 读心 内心想法" },
    { re: /心情波动|动态状态/, title: "心情波动", kw: "心情 心率 状态 顶部" },
    { re: /上下文记忆/, title: "上下文记忆", kw: "上下文 历史消息 条数 记忆" },
    { re: /时间感知/, title: "时间感知", kw: "时间 感知 现实时间" },
    { re: /朋友圈动态测试|立即发动态/, title: "朋友圈动态测试", kw: "动态 朋友圈 测试 发动态" },
    { re: /头像区域|更换头像|拍一拍/, title: "头像区域", kw: "头像 换头像 显示头像 拍一拍 后缀" },
    { re: /开启时间戳|绝对转换|古代时间/, title: "时间戳", kw: "时间戳 时间 古代 时辰" },
    { re: /背景设置|更换聊天页面背景/, title: "背景设置", kw: "背景 壁纸 颜色 图片" },
    { re: /背景透明度/, title: "背景透明度", kw: "背景 透明度 遮罩" },
    { re: /备份与恢复|导出当前角色数据/, title: "备份与恢复", kw: "备份 恢复 导出 导入 历史记录" },
    { re: /核心记忆挂载/, title: "核心记忆挂载", kw: "核心记忆 记忆 挂载 事件" },
    { re: /清空聊天记录/, title: "清空聊天记录", kw: "清空 删除 聊天记录 重置" }
  ];

  const COMP_MAP = {
    CompanionMemoryEntryCard: { group: "basic", title: "伴侣分层记忆", kw: "伴侣 分层记忆 folio 向量 召回 记忆" },
    ProactiveMsgSettingsCard: { group: "basic", title: "鸿雁传书主动发消息", kw: "主动发消息 定时 离线 鸿雁 传书 推送 早安 晚安 免打扰 群聊" },
    ChatPacingPrefsCard: { group: "advanced", title: "表情包与红包节律", kw: "表情包 红包 节律 冷却 概率 频率" },
    CharacterVoiceCard: { group: "advanced", title: "名士专属音色", kw: "语音 音色 tts 鱼声 fish minimax elevenlabs 试听" },
    WanxiangSettingsEntryCard: { group: "advanced", title: "万象装扮协作台", kw: "万象 气泡 工具栏 头像框 css 美化 装扮" },
    TranslationSettingsCard: { group: "advanced", title: "对话输出翻译", kw: "翻译 双语 羌语 字幕 英语 日语 韩语 外语 原文 译文 西凉" },
    ThinkingChainSettingsCard: { group: "advanced", title: "灵犀推演思维链", kw: "思维链 思考 推演 deepseek 推理 reasoning think 心绪 内心" }
  };

  function classifySettingNode(node) {
    const compName = node && typeof node.type === "function" ? node.type.name : "";
    if (compName && COMP_MAP[compName]) {
      return COMP_MAP[compName];
    }
    const text = extractElementText(node);
    for (const m of BASIC_MATCHERS) {
      if (m.re.test(text)) return { group: "basic", title: m.title, kw: m.kw + " " + text.slice(0, 80) };
    }
    let extraKw = "";
    if (/自主好感/.test(text)) extraKw = "好感 心境 羁绊 印象";
    else if (/浮生梦痕/.test(text)) extraKw = "浮生梦痕 梦 晨间";
    else if (/日历日程/.test(text)) extraKw = "日历 日程 提醒 催促";
    else if (/情境氛围微动效/.test(text)) extraKw = "动效 灵犀生境 氛围 特效";
    else if (/模型高级参数|语气旋钮/.test(text)) extraKw = "模型 参数 温度 temperature top-p 惩罚";
    else if (/专属提示词/.test(text)) extraKw = "提示词 prompt 口癖 指令";
    else if (/Pixabay/i.test(text)) extraKw = "pixabay 图片 搜索 api 密钥";
    return {
      group: "advanced",
      title: text.slice(0, 24) || compName || "进阶项",
      kw: (extraKw + " " + text.slice(0, 100)).trim()
    };
  }

  function ChatSettingsAutoOrganize(props) {
    const React = global.React;
    if (!React) return null;
    const rawList = React.Children.toArray(props && props.children);
    // 展开顶层 Fragment（如 情境氛围微动效 + 朋友圈动态测试），以便精确分别归入进阶/基础
    const flat = [];
    for (const child of rawList) {
      if (!child) continue;
      if (child.type === React.Fragment && child.props && child.props.children) {
        const sub = React.Children.toArray(child.props.children);
        for (const s of sub) if (s) flat.push(s);
      } else {
        flat.push(child);
      }
    }

    const items = [];
    for (let i = 0; i < flat.length; i++) {
      const node = flat[i];
      if (isPureDividerNode(node)) continue;
      const text = extractElementText(node);
      if (items.length > 0 && isCompanionFollowup(text)) {
        const prev = items[items.length - 1];
        prev.keywords += " " + text.slice(0, 80);
        prev.node = React.createElement(React.Fragment, null, prev.node, node);
        continue;
      }
      const meta = classifySettingNode(node);
      items.push({
        id: `cs_item_${i}_${meta.group}`,
        group: meta.group,
        title: meta.title,
        keywords: meta.kw,
        node
      });
    }

    return React.createElement(ChatSettingsShell, { items });
  }

  hydrateAccordionState().catch(() => {});

  const api = {
    filterSettingsItems,
    hydrateAccordionState,
    saveAccordionState,
    classifySettingNode,
    ChatSettingsShell,
    ChatSettingsAutoOrganize
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.ChatSettingsOrganizer = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

