/**
 * Milvus/chat_pacing_engine.js
 * 传讯（私聊 & 群聊）表情包与红包智能节律引擎（Phase 0）
 * - 100% IndexedDB 持久化（复用主库 t8_chat_db -> user_settings，零 localStorage 占用）+ 内存热缓存
 * - 闸门 A（请求前）：冷却期 Cooldown + 真随机概率 + 斗图/发薪语义豁免 + 动态 Prompt 裁剪（省 Token）
 * - 闸门 B（回复后）：逐条精确绑定 sender（彻底修复群聊表情挂在群名下与多标签残留）、同义词精准匹配（废除随机瞎抽图）、单轮红包防连发
 * - 提供极简 React 设置组件 ChatPacingPrefsCard，可直接嵌入私聊/群聊偏好设置抽屉
 */
(function (global) {
  "use strict";

  const IDB_PREFS_KEY = "milvus_chat_pacing_prefs_v1";
  const IDB_STATE_KEY = "milvus_chat_pacing_state_v1";

  const STICKER_TIERS = {
    off:        { id: "off",        label: "关闭",       prob: 0,    cooldown: 999, groupMax: 0 },
    restrained: { id: "restrained", label: "克制",       prob: 0.20, cooldown: 3,   groupMax: 1 },
    natural:    { id: "natural",    label: "自然(推荐)", prob: 0.35, cooldown: 2,   groupMax: 1 },
    lively:     { id: "lively",     label: "活泼",       prob: 0.60, cooldown: 1,   groupMax: 2 }
  };

  const REDPACKET_TIERS = {
    off:      { id: "off",      label: "关闭",       prob: 0,    soloCooldown: 999, groupCooldown: 999, dailyLimit: 0 },
    rare:     { id: "rare",     label: "稀缺",       prob: 0.08, soloCooldown: 10,  groupCooldown: 15,  dailyLimit: 1 },
    natural:  { id: "natural",  label: "自然(推荐)", prob: 0.15, soloCooldown: 6,   groupCooldown: 10,  dailyLimit: 2 },
    generous: { id: "generous", label: "大方",       prob: 0.30, soloCooldown: 3,   groupCooldown: 5,   dailyLimit: 5 }
  };

  const DEFAULT_PREFS = {
    stickerTier: "natural",
    redPacketTier: "natural",
    stickerDuelBypass: true,
    redPacketKeywordBypass: true,
    perChat: {} // { [chatId]: { stickerTier?, redPacketTier? } }
  };

  const EMOTION_SYNONYM_CLUSTERS = [
    ["无语", "翻白眼", "白眼", "汗颜", "流汗", "地铁老人", "黑线", "嫌弃", "呵呵"],
    ["害羞", "脸红", "娇羞", "羞", "不好意思", "捂脸", "扭捏"],
    ["得意", "骄傲", "叉腰", "哼", "嚣张", "臭屁", "挑眉", "傲娇"],
    ["开心", "大笑", "哈哈", "乐", "高兴", "喜悦", "笑死", "偷笑", "坏笑"],
    ["生气", "炸毛", "怒", "发火", "咬牙", "气鼓鼓", "锤", "拳头", "刀"],
    ["委屈", "哭", "流泪", "大哭", "泪目", "可怜", "惨", "心碎"],
    ["叹气", "累", "疲惫", "瘫", "躺平", "摆烂", "摸鱼", "沧桑"],
    ["震惊", "问号", "懵", "呆", "惊", "啊", "裂开", "石化"],
    ["点赞", "夸", "棒", "好耶", "鼓掌", "牛", "优秀", "认可"],
    ["晚安", "困", "睡", "打哈欠", "熬夜", "zz", "呼呼"],
    ["吃瓜", "围观", "看戏", "暗中观察", "盯", "探头"],
    ["摸头", "安慰", "抱抱", "拍拍", "乖", "贴贴", "蹭蹭"],
    ["比心", "爱你", "喜欢", "心动", "玫瑰", "亲亲", "撒娇"],
    ["冷漠", "面无表情", "哦", "静静", "已读", "微笑"]
  ];

  const REDPACKET_KEYWORDS_RE =
    /(红包|发薪|俸禄|报销|打赏|零花钱|过年|新年|除夕|压岁|生辰|生日|买糖|买蜜饯|请客|分红|赏钱|发钱)/;
  const STICKER_REQUEST_RE = /(发表情|表情包|斗图|发个图|回个表情)/;

  // ==========================================
  // 1. 内存热缓存 + 100% IndexedDB 异步持久化层（零 localStorage 占用）
  // ==========================================
  let _prefsCache = { ...DEFAULT_PREFS, perChat: {} };
  let _stateCache = {}; // { [chatId]: { turnCount, lastStickerTurn, lastRedPacketTurn, redPacketTodayCount, redPacketDate } }
  let _hydrated = false;
  let _hydratePromise = null;

  function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    if (hasMainIDB()) {
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
    return false;
  }

  function hydrate() {
    if (_hydratePromise) return _hydratePromise;
    _hydratePromise = (async () => {
      try {
        const [savedPrefs, savedState] = await Promise.all([
          idbRead(IDB_PREFS_KEY),
          idbRead(IDB_STATE_KEY)
        ]);
        if (savedPrefs && typeof savedPrefs === "object") {
          _prefsCache = {
            ...DEFAULT_PREFS,
            ...savedPrefs,
            perChat: { ...(savedPrefs.perChat || {}) }
          };
        }
        if (savedState && typeof savedState === "object") {
          _stateCache = { ...savedState };
        }
        _hydrated = true;
        if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
          global.dispatchEvent(new CustomEvent("milvus-chat-pacing-changed", { detail: _prefsCache }));
        }
      } catch (e) {
        _hydrated = true;
      }
      return { prefs: _prefsCache, state: _stateCache };
    })();
    return _hydratePromise;
  }

  // 浏览器环境下延迟 120ms 自动水合，避免阻塞首屏
  if (typeof window !== "undefined") {
    setTimeout(() => {
      hydrate();
    }, 120);
  }

  function getPrefs(chatId) {
    const base = { ...DEFAULT_PREFS, ..._prefsCache };
    if (chatId && _prefsCache.perChat && _prefsCache.perChat[chatId]) {
      return { ...base, ..._prefsCache.perChat[chatId] };
    }
    return base;
  }

  function savePrefs(patch, chatId) {
    if (!patch || typeof patch !== "object") return getPrefs(chatId);
    if (chatId) {
      const nextPerChat = {
        ...(_prefsCache.perChat || {}),
        [chatId]: {
          ...((_prefsCache.perChat && _prefsCache.perChat[chatId]) || {}),
          ...patch
        }
      };
      _prefsCache = { ..._prefsCache, perChat: nextPerChat };
    } else {
      const { perChat, ...rest } = patch;
      _prefsCache = {
        ..._prefsCache,
        ...rest,
        perChat: perChat ? { ...(_prefsCache.perChat || {}), ...perChat } : { ...(_prefsCache.perChat || {}) }
      };
    }
    idbWrite(IDB_PREFS_KEY, _prefsCache);
    if (typeof global.dispatchEvent === "function" && typeof CustomEvent === "function") {
      global.dispatchEvent(new CustomEvent("milvus-chat-pacing-changed", { detail: _prefsCache }));
    }
    return getPrefs(chatId);
  }

  function getChatState(chatId) {
    const key = String(chatId || "default");
    const today = getTodayKey();
    const cur = _stateCache[key] || {
      turnCount: 0,
      lastStickerTurn: -999,
      lastRedPacketTurn: -999,
      redPacketTodayCount: 0,
      redPacketDate: today
    };
    if (cur.redPacketDate !== today) {
      cur.redPacketDate = today;
      cur.redPacketTodayCount = 0;
    }
    _stateCache[key] = cur;
    return cur;
  }

  function persistState() {
    idbWrite(IDB_STATE_KEY, _stateCache);
  }

  function resetStateForTest() {
    _prefsCache = { ...DEFAULT_PREFS, perChat: {} };
    _stateCache = {};
  }

  // ==========================================
  // 2. 闸门 A：请求前动态节律门控 + Prompt 构建
  // ==========================================
  function evaluateTurnGate(params = {}) {
    const chatId = String(params.chatId || "default");
    const isGroup = Boolean(params.isGroup);
    const userInput = String(params.userInput || "");
    const userSentSticker = Boolean(params.userSentSticker) || /\[表情包[:：]/.test(userInput);
    const rng = typeof params.randomFn === "function" ? params.randomFn : Math.random;

    const prefs = getPrefs(chatId);
    const st = getChatState(chatId);
    st.turnCount += 1;
    persistState();

    // --- 表情包门控 ---
    const sTier = STICKER_TIERS[prefs.stickerTier] || STICKER_TIERS.natural;
    let allowSticker = false;
    let stickerReason = "cooldown_or_roll_miss";

    if (sTier.id === "off") {
      allowSticker = false;
      stickerReason = "disabled";
    } else {
      const turnsSinceSticker = st.turnCount - st.lastStickerTurn;
      const duelTriggered =
        prefs.stickerDuelBypass !== false && (userSentSticker || STICKER_REQUEST_RE.test(userInput));

      if (duelTriggered) {
        allowSticker = rng() < 0.80;
        stickerReason = allowSticker ? "duel_bypass" : "duel_roll_miss";
      } else if (turnsSinceSticker > sTier.cooldown) {
        allowSticker = rng() < sTier.prob;
        stickerReason = allowSticker ? "natural_roll_hit" : "natural_roll_miss";
      } else {
        allowSticker = false;
        stickerReason = `in_cooldown(${turnsSinceSticker}/${sTier.cooldown})`;
      }
    }

    // --- 红包门控 ---
    const rTier = REDPACKET_TIERS[prefs.redPacketTier] || REDPACKET_TIERS.natural;
    let allowRedPacket = false;
    let redPacketReason = "cooldown_or_roll_miss";

    if (rTier.id === "off") {
      allowRedPacket = false;
      redPacketReason = "disabled";
    } else {
      const cooldownNeed = isGroup ? rTier.groupCooldown : rTier.soloCooldown;
      const turnsSinceRP = st.turnCount - st.lastRedPacketTurn;
      const keywordTriggered =
        prefs.redPacketKeywordBypass !== false && REDPACKET_KEYWORDS_RE.test(userInput);

      if (keywordTriggered) {
        allowRedPacket = true;
        redPacketReason = "keyword_bypass";
      } else if (st.redPacketTodayCount >= rTier.dailyLimit) {
        allowRedPacket = false;
        redPacketReason = `daily_limit(${st.redPacketTodayCount}/${rTier.dailyLimit})`;
      } else if (turnsSinceRP > cooldownNeed) {
        allowRedPacket = rng() < rTier.prob;
        redPacketReason = allowRedPacket ? "natural_roll_hit" : "natural_roll_miss";
      } else {
        allowRedPacket = false;
        redPacketReason = `in_cooldown(${turnsSinceRP}/${cooldownNeed})`;
      }
    }

    return {
      chatId,
      isGroup,
      turnCount: st.turnCount,
      allowSticker,
      allowRedPacket,
      stickerMaxPerTurn: isGroup ? Math.max(1, sTier.groupMax || 1) : 1,
      stickerReason,
      redPacketReason
    };
  }

  function buildStickerPromptBlock(availableStoredEmojis, gate) {
    if (!gate || !gate.allowSticker) return "";
    if (!Array.isArray(availableStoredEmojis) || availableStoredEmojis.length === 0) return "";
    const emojiNames = availableStoredEmojis
      .map((e) => (e && e.name ? String(e.name).trim() : ""))
      .filter(Boolean)
      .slice(0, 60)
      .join("、");
    if (!emojiNames) return "";

    const sampleName = availableStoredEmojis[0]?.name || "趣味表情";
    const groupNote = gate.isGroup
      ? "（群聊中本轮最多 1 位角色在情绪极契合时附带，严禁多人扎堆刷图）"
      : "（仅当情绪特别契合时可选附 1 个；若纯文字更自然则不必强发）";

    return `
【手机本地共享表情包图库（本轮可选）】
可用表情包名称：【${emojiNames}】。
若当下情绪特别贴切，可在对应台词末尾附带 1 个标签：[发表情: 表情名称]（例如：[发表情: ${sampleName}]）。
注意：必须从上述可用名称中挑选，切勿生造图库里没有的名字；${groupNote}
`;
  }

  function buildRedPacketPromptLine(isGroup, gate) {
    if (!gate) return "";
    if (gate.redPacketReason === "disabled") return "";
    if (isGroup) {
      if (!gate.allowRedPacket) return "";
      return `   - 发起群拼手气红包（本轮仅当剧情自然契合发薪/庆贺/哄人时至多 1 人使用）：[发起红包: 总金额|份数|祝福语]（如 [发起红包: 88|4|发薪同乐]）\n`;
    }
    if (gate.allowRedPacket) {
      return `3. 主动发五铢钱红包（仅在发薪、哄人或表达心意极契合时使用，不必强发）：[发红包: 金额|祝福语]（如 [发红包: 88|拿去买蜜饯吃]），对方可点击拆开入账。\n`;
    }
    return `3. 主动发五铢钱红包（当前处于自然冷却期，仅在对方明确讨红包、逢节庆生或哄人情绪极到位时才偶尔使用，日常闲聊请勿使用）：[发红包: 金额|祝福语]（如 [发红包: 88|拿去买蜜饯吃]）。\n`;
  }

  // ==========================================
  // 3. 闸门 B：回复后精准匹配、群聊归属修复与硬上限拦截
  // ==========================================
  function matchEmojiSmart(targetName, availableStoredEmojis) {
    const raw = String(targetName || "").trim();
    if (!raw || !Array.isArray(availableStoredEmojis) || availableStoredEmojis.length === 0) return null;

    // 1. 精确匹配
    let hit = availableStoredEmojis.find((e) => e && e.name && e.name.trim() === raw);
    if (hit) return hit;

    // 2. 包含匹配
    hit = availableStoredEmojis.find(
      (e) => e && e.name && (raw.includes(e.name.trim()) || e.name.trim().includes(raw))
    );
    if (hit) return hit;

    // 3. 分词包含
    const words = raw.split(/[,，\s_\-\.·]+/).filter((w) => w.length >= 1);
    if (words.length > 0) {
      hit = availableStoredEmojis.find(
        (e) => e && e.name && words.some((w) => w.length >= 2 && (e.name.includes(w) || w.includes(e.name)))
      );
      if (hit) return hit;
    }

    // 4. 情绪同义词簇匹配（精准贴合心境，绝不瞎抽随机图！）
    const matchedCluster = EMOTION_SYNONYM_CLUSTERS.find((cluster) =>
      cluster.some((kw) => raw.includes(kw) || kw.includes(raw))
    );
    if (matchedCluster) {
      hit = availableStoredEmojis.find(
        (e) => e && e.name && matchedCluster.some((kw) => e.name.includes(kw))
      );
      if (hit) return hit;
    }

    // 5. 宁缺毋滥：全未命中返回 null，避免图文严重违和
    return null;
  }

  const STICKER_TAG_RE = /\[\s*(?:发表情|表情包|发送表情|发个表情|表情|emoji|sticker)\s*[:：]\s*([^\]]+)\]/gi;

  /**
   * 逐条处理私聊/群聊消息中的 [发表情: xxx] 标签：
   * - 群聊精确绑定到每条消息各自的 sender（彻底修复挂在群名下的 Bug）
   * - 严格执行本轮许可与数量上限，超出或匹配不到的标签静默剥离
   */
  function processStickerTagsInMessages(msgs, availableStoredEmojis, options = {}) {
    if (!Array.isArray(msgs) || msgs.length === 0) return msgs;
    const chatId = String(options.chatId || "default");
    const isGroup = Boolean(options.isGroup);
    const gate = options.gate || { allowSticker: true, stickerMaxPerTurn: 1 };
    const maxPerTurn = gate.allowSticker ? Math.max(1, gate.stickerMaxPerTurn || 1) : 0;
    const defaultSender = options.defaultSender || "名士";

    const out = [];
    let emittedCount = 0;
    const emittedSenders = new Set();

    for (const msg of msgs) {
      if (!msg || typeof msg.text !== "string" || !STICKER_TAG_RE.test(msg.text)) {
        STICKER_TAG_RE.lastIndex = 0;
        out.push(msg);
        continue;
      }
      STICKER_TAG_RE.lastIndex = 0;

      const senderName = msg.sender || defaultSender;
      const spawnedStickers = [];
      const cleanedText = msg.text.replace(STICKER_TAG_RE, (_, rawTag) => {
        if (emittedCount >= maxPerTurn) return "";
        if (isGroup && emittedSenders.has(senderName)) return "";
        const matched = matchEmojiSmart(rawTag, availableStoredEmojis);
        if (matched && matched.url) {
          emittedCount += 1;
          emittedSenders.add(senderName);
          spawnedStickers.push({
            id: Date.now() + Math.random(),
            type: "image",
            text: `[表情包: ${matched.name || rawTag.trim()}]`,
            content: matched.url,
            isMe: false,
            time: msg.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            sender: senderName
          });
        }
        return "";
      }).trim();

      if (cleanedText) {
        out.push({ ...msg, text: cleanedText });
      }
      for (const stMsg of spawnedStickers) {
        out.push(stMsg);
      }
    }

    if (emittedCount > 0) {
      const st = getChatState(chatId);
      st.lastStickerTurn = st.turnCount;
      persistState();
    }

    return out;
  }

  function shouldAllowRedPacketCard(options = {}) {
    const gate = options.gate;
    const isGroup = Boolean(options.isGroup);
    const spawnedCountInTurn = Number(options.spawnedCountInTurn) || 0;
    if (spawnedCountInTurn >= 1) return false;
    // 用户明确关闭红包档位时严格拦截
    if (gate && gate.redPacketReason === "disabled") return false;
    // 群聊继续遵循门控（避免多人刷红包）；私聊只要未禁用且本轮未发过，尊重 AI 主动发出的 [发红包:...] 标签，不再 85% 静默吞掉
    if (isGroup && gate && gate.allowRedPacket === false) return false;
    return true;
  }

  function recordRedPacketTriggered(chatId) {
    const st = getChatState(chatId);
    st.lastRedPacketTurn = st.turnCount;
    st.redPacketTodayCount = (st.redPacketTodayCount || 0) + 1;
    persistState();
  }

  // ==========================================
  // 4. 极简 React 偏好设置卡（嵌入「对话偏好设置」抽屉）
  // ==========================================
  function ChatPacingPrefsCard({ chatId, isGroup }) {
    if (typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const [prefs, setPrefs] = useState(() => getPrefs(chatId));

    useEffect(() => {
      hydrate().then(() => setPrefs(getPrefs(chatId)));
      const onChange = () => setPrefs(getPrefs(chatId));
      global.addEventListener("milvus-chat-pacing-changed", onChange);
      return () => global.removeEventListener("milvus-chat-pacing-changed", onChange);
    }, [chatId]);

    const update = (patch) => {
      const next = savePrefs(patch, chatId);
      setPrefs(next);
    };

    const renderTierRow = (title, desc, tiersObj, currentId, onPick) =>
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        h(
          "div",
          null,
          h("div", { style: { fontSize: "13px", fontWeight: "700", color: "#333A3C" } }, title),
          h("div", { style: { fontSize: "11px", color: "#7B888C", marginTop: "2px" } }, desc)
        ),
        h(
          "div",
          { style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px" } },
          Object.values(tiersObj).map((tier) => {
            const active = currentId === tier.id;
            return h(
              "button",
              {
                key: tier.id,
                type: "button",
                onClick: () => onPick(tier.id),
                style: {
                  padding: "6px 4px",
                  borderRadius: "8px",
                  border: active ? "1.5px solid #5B7880" : "1px solid #DDE3E1",
                  background: active ? "#EEF4F3" : "#FAFBF9",
                  color: active ? "#2F4A52" : "#6A777B",
                  fontSize: "11px",
                  fontWeight: active ? "700" : "500",
                  cursor: "pointer"
                }
              },
              tier.label
            );
          })
        )
      );

    return h(
      "div",
      {
        style: {
          background: "#FFFFFF",
          border: "1px solid #E6EAE8",
          borderRadius: "12px",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginTop: "10px"
        }
      },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        h("span", { style: { fontSize: "13px", fontWeight: "800", color: "#2D3B3F" } }, "✨ 表情包与红包节律"),
        h("span", { style: { fontSize: "10.5px", color: "#8A979B" } }, isGroup ? "当前群聊生效" : "当前会话生效")
      ),
      renderTierRow(
        "主动发表情包频率",
        "未命中冷却窗口时自动隐藏表情清单，杜绝机械刷屏",
        STICKER_TIERS,
        prefs.stickerTier || "natural",
        (id) => update({ stickerTier: id })
      ),
      renderTierRow(
        "主动发红包频率",
        "带冷却与每日上限，聊到发薪/过节/红包时自动豁免",
        REDPACKET_TIERS,
        prefs.redPacketTier || "natural",
        (id) => update({ redPacketTier: id })
      ),
      h(
        "label",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#4A5659",
            paddingTop: "6px",
            borderTop: "1px solid #F0F3F2",
            cursor: "pointer"
          }
        },
        h("span", null, "斗图豁免（我发表情包时允许对方及时接招）"),
        h("input", {
          type: "checkbox",
          checked: prefs.stickerDuelBypass !== false,
          onChange: (e) => update({ stickerDuelBypass: e.target.checked }),
          style: { width: "16px", height: "16px", cursor: "pointer" }
        })
      )
    );
  }

  const api = {
    STICKER_TIERS,
    REDPACKET_TIERS,
    hydrate,
    getPrefs,
    savePrefs,
    getChatState,
    resetStateForTest,
    evaluateTurnGate,
    buildStickerPromptBlock,
    buildRedPacketPromptLine,
    matchEmojiSmart,
    processStickerTagsInMessages,
    shouldAllowRedPacketCard,
    recordRedPacketTriggered,
    ChatPacingPrefsCard
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (global) {
    global.ChatPacingEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

