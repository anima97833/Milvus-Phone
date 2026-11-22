/**
 * Milvus/t12_coshopping_app.js
 * 传讯 ↔ 太疾驰「携手同游选购」独立模块化引擎（Phase 0）
 * 职责：
 *  1. T12ContextBus：全分区商品/菜品/剧目/结算实时感知总线 + 幂等下单事件通知
 *  2. CoShopAvatar：双协议安全头像解析（兼容 idb:persona_avatar_* 与名士 IndexedDB avatarId，彻底消灭 ERR_UNKNOWN_URL_SCHEME）
 *  3. shouldPromptShopping：关键词意图防重判定（绝不对旧历史消息反复弹窗）
 *  4. CoShoppingFloatingPanel：三态可拖拽同游悬浮窗（胶囊球/紧凑条/可滚动完整记录 + 一键问当前商品 + 完整人设 + 幂等下单反应 + 自动收口归档）
 *  5. CollapsibleShoppingCardV2 & formatShoppingSessionCardForLLM：带购物/对话简介的折叠卡片与结构化传讯 LLM 上下文协议
 */
(function (global) {
  "use strict";

  const SHOPPING_KEYWORDS = /买点|吃点|去吃|看戏|买票|逛街|买东西|太疾驰|点外卖/;

  // ==========================================
  // 1. T12ContextBus：统一页面商品感知总线
  // ==========================================
  const _contextState = {
    tab: "food",
    tabLabel: "餐饮外卖",
    viewingDetail: null,
    visibleList: [],
    rawText: "",
    updatedAt: 0
  };

  function updatePageContext(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.tab !== undefined) _contextState.tab = String(payload.tab);
    if (payload.tabLabel !== undefined) _contextState.tabLabel = String(payload.tabLabel);
    if ("viewingDetail" in payload) _contextState.viewingDetail = payload.viewingDetail || null;
    if (Array.isArray(payload.visibleList)) _contextState.visibleList = payload.visibleList.slice(0, 8);
    if (payload.rawText !== undefined) _contextState.rawText = String(payload.rawText || "");
    _contextState.updatedAt = Date.now();

    const formatted = getFormattedPageContext();
    global.currentT12Data = formatted;
    try {
      global.dispatchEvent(new CustomEvent("t12ContextUpdated", { detail: { ..._contextState, formatted } }));
    } catch (e) {}
  }

  function getFormattedPageContext() {
    const parts = [];
    if (_contextState.tabLabel) {
      parts.push(`当前分区：太疾驰·${_contextState.tabLabel}`);
    }
    if (_contextState.viewingDetail) {
      const d = _contextState.viewingDetail;
      let line = `正在查看详情：【${d.name || "商品"}】`;
      if (d.shop) line += `（商家：${d.shop}）`;
      if (d.price) line += `，价格：${d.price}`;
      if (d.intro) line += `，简介：${String(d.intro).slice(0, 60)}`;
      if (Array.isArray(d.variants) && d.variants.length > 0) {
        line += `，款式：${d.variants.slice(0, 4).map((v) => `${v.name}(${v.price})`).join("、")}`;
      }
      parts.push(line);
    }
    if (Array.isArray(_contextState.visibleList) && _contextState.visibleList.length > 0) {
      const limit = _contextState.viewingDetail ? 4 : 8;
      const listStr = _contextState.visibleList
        .slice(0, limit)
        .map((it) => {
          const shopPart = it.shop ? `${it.shop}-` : "";
          return `${shopPart}${it.name || "物品"}(${it.price || "时价"})`;
        })
        .join("；");
      parts.push(`页面可见商品/菜品：${listStr}`);
    }
    if (parts.length > 0) return parts.join("\n");
    if (_contextState.rawText) return _contextState.rawText;
    if (global.currentT12Data) return String(global.currentT12Data);
    return "用户正在闲逛太疾驰集市…";
  }

  function getCurrentFocusItem() {
    if (_contextState.viewingDetail && _contextState.viewingDetail.name) {
      return _contextState.viewingDetail;
    }
    if (Array.isArray(_contextState.visibleList) && _contextState.visibleList.length > 0) {
      return _contextState.visibleList[0];
    }
    return null;
  }

  function notifyOrderPlaced(orderInfo) {
    if (!orderInfo) return;
    const detail = {
      eventId: orderInfo.eventId || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      itemName: String(orderInfo.itemName || orderInfo.name || "心仪好物"),
      shop: String(orderInfo.shop || orderInfo.shopName || "太疾驰商坊"),
      price: String(orderInfo.price || "若干五铢钱"),
      category: String(orderInfo.category || _contextState.tabLabel || "购物")
    };
    try {
      global.dispatchEvent(new CustomEvent("t12OrderPlaced", { detail }));
    } catch (e) {}
  }

  // ==========================================
  // 2. 同游偏好开关 & 关键词弹窗防重判定（只对新鲜未提示过的消息生效）
  // ==========================================
  const COSHOP_PREF_KEY = "t12_coshop_pref_v1";

  function getStoredCoShopPref(chatId) {
    try {
      const map = JSON.parse(localStorage.getItem(COSHOP_PREF_KEY) || "{}");
      if (chatId && Object.prototype.hasOwnProperty.call(map, String(chatId))) {
        return map[String(chatId)] !== false;
      }
    } catch (e) {}
    return true;
  }

  function setStoredCoShopPref(chatId, enabled) {
    try {
      const map = JSON.parse(localStorage.getItem(COSHOP_PREF_KEY) || "{}");
      if (chatId) map[String(chatId)] = Boolean(enabled);
      localStorage.setItem(COSHOP_PREF_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function isCoShoppingEnabled(chatId, settings) {
    if (settings && typeof settings.enableCoShopping === "boolean") {
      return settings.enableCoShopping;
    }
    return getStoredCoShopPref(chatId);
  }

  const _promptedMsgIds = new Set();
  function shouldPromptShopping(chatId, lastMsg, settings) {
    if (!chatId || !lastMsg || !lastMsg.text) return false;
    if (!isCoShoppingEnabled(chatId, settings)) return false;
    if (lastMsg.type && lastMsg.type !== "text") return false;
    if (!SHOPPING_KEYWORDS.test(String(lastMsg.text))) return false;
    const key = `${chatId}_${lastMsg.id || lastMsg.timestamp || ""}`;
    if (_promptedMsgIds.has(key)) return false;
    try {
      const storeKey = "t12_last_prompted_" + chatId;
      if (sessionStorage.getItem(storeKey) === key) {
        _promptedMsgIds.add(key);
        return false;
      }
    } catch (e) {}
    // 若消息自带较早的时间戳（超过 35 秒的旧历史记录），重新打开聊天时绝不重复弹窗
    const ts = Number(lastMsg.timestamp || (typeof lastMsg.id === "number" && lastMsg.id > 1e12 ? lastMsg.id : 0));
    if (ts > 0 && Date.now() - ts > 35000) {
      _promptedMsgIds.add(key);
      return false;
    }
    _promptedMsgIds.add(key);
    try {
      sessionStorage.setItem("t12_last_prompted_" + chatId, key);
    } catch (e) {}
    return true;
  }

  // ==========================================
  // 3. 双协议安全头像解析组件（对齐 傩·观影 NuoAvatar + personaAvatarStore + USER_SETTINGS）
  // ==========================================
  async function readUserSettingAvatar(settingKey) {
    try {
      if (typeof global.openDB === "function" && global.STORES && global.STORES.USER_SETTINGS) {
        const db = await global.openDB();
        return await new Promise((resolve) => {
          try {
            const tx = db.transaction(global.STORES.USER_SETTINGS, "readonly");
            const req = tx.objectStore(global.STORES.USER_SETTINGS).get(settingKey);
            req.onsuccess = () => resolve(req.result?.value || "");
            req.onerror = () => resolve("");
          } catch (e) {
            resolve("");
          }
        });
      }
    } catch (e) {}
    return "";
  }

  function isDirectImageUrl(val) {
    return (
      typeof val === "string" &&
      (val.startsWith("data:image") ||
        val.startsWith("http://") ||
        val.startsWith("https://") ||
        val.startsWith("blob:") ||
        val.startsWith("/") ||
        val.startsWith("./") ||
        /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(val))
    );
  }

  function CoShopAvatar({ avatar, personaId, chatId, name = "我", size = 36, bgColor = "#A8C8BA", isUserPersona = false }) {
    const h = React.createElement;
    const [src, setSrc] = React.useState("");
    const [hasError, setHasError] = React.useState(false);

    React.useEffect(() => {
      let alive = true;
      setHasError(false);

      const resolve = async () => {
        // 1. 用户头像解析：先查单聊自定义头像 -> 再查身份配置库 personaAvatarStore（保留完整 idb: 前缀！）-> 再查直连 URL
        if (isUserPersona) {
          if (chatId) {
            const customUserAv = await readUserSettingAvatar(`user_avatar_${chatId}`);
            if (alive && isDirectImageUrl(customUserAv)) {
              setSrc(customUserAv);
              return;
            }
          }
          if (isDirectImageUrl(avatar)) {
            if (alive) setSrc(avatar);
            return;
          }
          if (global.personaAvatarStore) {
            try {
              const refOrId = avatar && String(avatar).startsWith("idb:") ? avatar : personaId || avatar;
              if (refOrId && typeof global.personaAvatarStore.get === "function") {
                const real = await global.personaAvatarStore.get(refOrId);
                if (alive && isDirectImageUrl(real)) {
                  setSrc(real);
                  return;
                }
              }
              if (typeof global.personaAvatarStore.resolveSync === "function") {
                const syncVal = global.personaAvatarStore.resolveSync(avatar, personaId);
                if (alive && isDirectImageUrl(syncVal)) {
                  setSrc(syncVal);
                  return;
                }
              }
            } catch (e) {}
          }
          if (alive) setSrc("");
          return;
        }

        // 2. 名士头像解析：先查单聊自定义 role_avatar -> 再完全对齐 傩·观影 NuoAvatar（直连 URL / resolveAvatarUrl / avatarStore.get）
        if (chatId) {
          const customRoleAv = await readUserSettingAvatar(`role_avatar_${chatId}`);
          if (alive && isDirectImageUrl(customRoleAv)) {
            setSrc(customRoleAv);
            return;
          }
        }

        let targetAvatar = avatar;
        if (!targetAvatar && chatId && global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
          try {
            const all = await global.chatCharacterStore.getAll();
            const found = (all || []).find((c) => c && String(c.id) === String(chatId));
            if (found) targetAvatar = found.avatar || found.avatarId || found.profile?.avatar || "";
          } catch (e) {}
        }

        if (!targetAvatar || typeof targetAvatar !== "string") {
          if (alive) setSrc("");
          return;
        }

        if (isDirectImageUrl(targetAvatar)) {
          if (alive) setSrc(targetAvatar);
          return;
        }

        try {
          if (typeof global.resolveAvatarUrl === "function") {
            const res = await global.resolveAvatarUrl(targetAvatar, "");
            if (alive && res) {
              setSrc(res);
              return;
            }
          }
          const store = global.avatarStore || (typeof avatarStore !== "undefined" ? avatarStore : null);
          if (store && typeof store.get === "function") {
            const item = await store.get(targetAvatar);
            const url = item && (item.avatarData || item.data || item.url || "");
            if (alive && url) {
              setSrc(url);
              return;
            }
          }
        } catch (e) {}
        if (alive) setSrc("");
      };

      resolve();
      return () => {
        alive = false;
      };
    }, [avatar, personaId, chatId, isUserPersona]);

    return h(
      "div",
      {
        style: {
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          background: bgColor,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "700",
          fontSize: `${Math.max(11, Math.round(size * 0.42))}px`,
          overflow: "hidden",
          flexShrink: 0,
          border: "2px solid #fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.12)"
        }
      },
      src && !hasError
        ? h("img", {
            src,
            alt: name,
            onError: () => setHasError(true),
            style: { width: "100%", height: "100%", objectFit: "cover", display: "block" }
          })
        : String(name || "我").charAt(0)
    );
  }

  function getActiveUserPersona() {
    try {
      const savedPersonas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      let active = activeId ? savedPersonas.find((p) => String(p.id) === String(activeId)) : null;
      if (!active && Array.isArray(savedPersonas) && savedPersonas.length > 0) active = savedPersonas[0];
      if (active) return active;
    } catch (e) {}
    return { name: "我", personality: "果敢敏锐", avatar: "" };
  }

  function buildCharPersonaPrompt(character) {
    const c = character || {};
    const p = c.profile || c.persona || {};
    return [
      `姓名：${c.name || "名士"}`,
      `MBTI：${c.mbti || p.mbti || "未设定"}`,
      `星座：${c.constellation || c.zodiac || p.constellation || p.zodiac || "未设定"}`,
      `语言风格：${c.speechStyle || c.languageStyle || p.style || p.speechStyle || "贴合人物古风本色"}`,
      `性格特点：${c.personality || p.personality || "鲜明立体"}`,
      `个人背景：${String(c.background || p.background || "").slice(0, 220) || "东汉末年乱世旧识"}`
    ].join("；");
  }

  // ==========================================
  // 4. 三态可拖拽同游悬浮窗（CoShoppingFloatingPanel）
  // ==========================================
  function CoShoppingFloatingPanel({ session, onClose, onEndSession }) {
    const h = React.createElement;
    const { useState, useEffect, useRef, useCallback } = React;
    const { character, chatId } = session || {};

    const [viewMode, setViewMode] = useState("compact"); // "pill" | "compact" | "expanded"
    const [messages, setMessages] = useState([]);
    const [sessionMessages, setSessionMessages] = useState([]);
    const [inputText, setInputText] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [isPicking, setIsPicking] = useState(false);
    const [charRecommendation, setCharRecommendation] = useState(null); // { itemName, shop, price, reason, added }
    const [focusItem, setFocusItem] = useState(() => getCurrentFocusItem());
    const [userPersona, setUserPersona] = useState(() => getActiveUserPersona());
    const [position, setPosition] = useState({
      x: Math.max(10, Math.round(window.innerWidth * 0.04)),
      y: 56
    });

    const dragRef = useRef({ dragging: false, startX: 0, startY: 0, initX: 0, initY: 0, moved: false });
    const sessionRef = useRef([]);
    const messagesRef = useRef([]);
    const processedOrderIdsRef = useRef(new Set());
    const closingRef = useRef(false);
    const scrollBoxRef = useRef(null);

    useEffect(() => {
      sessionRef.current = sessionMessages;
    }, [sessionMessages]);

    useEffect(() => {
      messagesRef.current = messages;
      if (scrollBoxRef.current) {
        scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
      }
    }, [messages, viewMode, isTyping]);

    // 加载最近 4 条传讯背景 + 刷新用户身份配置
    useEffect(() => {
      setUserPersona(getActiveUserPersona());
      if (chatId && global.chatHistoryStore && typeof global.chatHistoryStore.getMessages === "function") {
        global.chatHistoryStore
          .getMessages(chatId, 1, 4)
          .then((res) => {
            const arr = Array.isArray(res) ? res : Array.isArray(res?.messages) ? res.messages : [];
            setMessages(arr);
          })
          .catch(() => {});
      }
    }, [chatId]);

    // 监听太疾驰页面商品切换，刷新「问 TA 这件」快捷按钮
    useEffect(() => {
      const onCtx = () => setFocusItem(getCurrentFocusItem());
      global.addEventListener("t12ContextUpdated", onCtx);
      return () => global.removeEventListener("t12ContextUpdated", onCtx);
    }, []);

    // 统一 LLM 调用
    const askCompanionLLM = useCallback(
      async (latestPromptInstruction, currentHistory) => {
        if (typeof global.sendToLLM !== "function") return null;
        const worldContext = global.getWorldBookContext ? String((await global.getWorldBookContext()) || "").slice(0, 1200) : "";
        const userCtx = `【用户身份】姓名：${userPersona?.name || "广陵王"}；性格：${userPersona?.personality || "果敢敏锐"}${userPersona?.background ? `；背景：${String(userPersona.background).slice(0, 120)}` : ""}`;
        const charCtx = `【你的角色设定】${buildCharPersonaPrompt(character)}`;
        const pageCtx = `【太疾驰当前页面实时物品信息】\n${getFormattedPageContext()}`;
        const histStr = (currentHistory || [])
          .slice(-8)
          .map((m) =>
            m.type === "order_card"
              ? `[用户刚下单：${m.content?.shop || ""}-${m.content?.itemName || ""}（${m.content?.price || ""}）]`
              : `${m.isMe ? userPersona?.name || "我" : character?.name || "名士"}：${m.text}`
          )
          .join("\n");

        return new Promise((resolve) => {
          global.sendToLLM(
            [
              {
                role: "system",
                content: `你正在太疾驰集市陪用户一起逛街选单，必须 100% 保持【${character?.name || "名士"}】的人设与口吻，严禁出戏或客服腔。回复简短自然（18~55字），直接输出台词。`
              },
              {
                role: "user",
                content: `${worldContext ? `【世界书参考】\n${worldContext}\n\n` : ""}${userCtx}\n${charCtx}\n\n${pageCtx}\n\n【近期同游对话】\n${histStr}\n\n【当前指令】${latestPromptInstruction}`
              }
            ],
            { disableMCP: true },
            (reply) => resolve(String(reply || "").replace(/```json|```/g, "").trim()),
            () => resolve(null)
          );
        });
      },
      [character, userPersona]
    );

    // 监听幂等下单事件（彻底修复双倍写入与 state updater 副作用）
    useEffect(() => {
      const handleOrder = async (e) => {
        const orderInfo = e?.detail;
        if (!orderInfo) return;
        const evtId = orderInfo.eventId || `${orderInfo.shop}_${orderInfo.itemName}_${orderInfo.price}_${Math.floor(Date.now() / 1500)}`;
        if (processedOrderIdsRef.current.has(evtId)) return;
        processedOrderIdsRef.current.add(evtId);

        const cardMsg = {
          id: Date.now(),
          type: "order_card",
          content: {
            itemName: orderInfo.itemName || "心仪好物",
            shop: orderInfo.shop || "太疾驰商坊",
            price: orderInfo.price || "",
            category: orderInfo.category || ""
          },
          isMe: true,
          text: `下单了：${orderInfo.itemName || "商品"}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };

        const nextAll = [...messagesRef.current, cardMsg];
        const nextSession = [...sessionRef.current, cardMsg];
        setMessages(nextAll);
        setSessionMessages(nextSession);

        setIsTyping(true);
        const reply = await askCompanionLLM(
          `用户刚刚在【${cardMsg.content.shop}】下单买了【${cardMsg.content.itemName}】（${cardMsg.content.price}）。请结合你的人设和刚才的聊天，简短点评一句。`,
          nextSession
        );
        if (reply) {
          const aiMsg = {
            id: Date.now() + 1,
            text: reply,
            type: "text",
            isMe: false,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          };
          setMessages((prev) => [...prev, aiMsg]);
          setSessionMessages((prev) => [...prev, aiMsg]);
        }
        setIsTyping(false);
      };

      global.addEventListener("t12OrderPlaced", handleOrder);
      return () => global.removeEventListener("t12OrderPlaced", handleOrder);
    }, [askCompanionLLM]);

    // 结束同游并归档为带简介的 shopping_session_card
    const finishSession = useCallback(
      async (returnToChat = true) => {
        if (closingRef.current) return;
        closingRef.current = true;
        const list = sessionRef.current || [];

        if (list.length > 0 && chatId) {
          const orders = list.filter((m) => m.type === "order_card").map((m) => m.content || {});
          const chatTurns = list.filter((m) => m.type !== "order_card").length;
          const orderNames = orders.map((o) => o.itemName).filter(Boolean);
          const summaryHeadline =
            orderNames.length > 0
              ? `已购 ${orderNames.slice(0, 2).join("、")}${orderNames.length > 2 ? ` 等 ${orderNames.length} 件` : ""}`
              : `携手同逛太疾驰 · 闲聊 ${chatTurns} 句`;
          const summaryText = list
            .map((m) =>
              m.type === "order_card"
                ? `[下单了：${m.content?.shop || ""}-${m.content?.itemName || ""}（${m.content?.price || ""}）]`
                : `${m.isMe ? userPersona?.name || "我" : character?.name || "名士"}：${m.text}`
            )
            .join(" | ");

          const now = Date.now();
          const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const summaryCard = {
            id: now,
            type: "shopping_session_card",
            isMe: false,
            text: `【太疾驰同行记录】${summaryHeadline}｜${summaryText}`,
            time: timeStr,
            timestamp: now,
            content: {
              partnerName: character?.name || "名士",
              summaryHeadline,
              orderCount: orders.length,
              chatTurns,
              orders,
              messages: list
            }
          };

          try {
            if (global.chatHistoryStore && typeof global.chatHistoryStore.saveMessage === "function") {
              await global.chatHistoryStore.saveMessage(chatId, summaryCard);
            }
          } catch (e) {}

          // 同步更新传讯列表最后一条预览
          try {
            const rawList = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
            if (Array.isArray(rawList)) {
              const updated = rawList.map((c) =>
                c && String(c.id) === String(chatId)
                  ? { ...c, lastMessage: `[太疾驰同行] ${summaryHeadline}`, lastTime: timeStr, time: timeStr, timestamp: now }
                  : c
              );
              localStorage.setItem("t8_chat_list", JSON.stringify(updated));
            }
          } catch (e) {}

          try {
            global.dispatchEvent(new CustomEvent("reloadChats"));
            global.dispatchEvent(new CustomEvent("appendShoppingSummary", { detail: { chatId, message: summaryCard } }));
          } catch (e) {}
        }

        if (returnToChat && typeof onEndSession === "function") {
          onEndSession(chatId);
        } else if (typeof onClose === "function") {
          onClose();
        }
      },
      [chatId, character, userPersona, onClose, onEndSession]
    );

    // 监听太疾驰左上角返回按钮派发的自动收口事件
    useEffect(() => {
      const onReqFinish = (e) => {
        const returnToChat = e?.detail?.returnToChat !== false;
        finishSession(returnToChat);
      };
      global.addEventListener("t12-request-finish-coshopping", onReqFinish);
      return () => global.removeEventListener("t12-request-finish-coshopping", onReqFinish);
    }, [finishSession]);

    const handleSend = async (customText) => {
      const txt = String(customText !== undefined ? customText : inputText).trim();
      if (!txt || isTyping) return;
      const myMsg = {
        id: Date.now(),
        text: txt,
        type: "text",
        isMe: true,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      const nextAll = [...messagesRef.current, myMsg];
      const nextSession = [...sessionRef.current, myMsg];
      setMessages(nextAll);
      setSessionMessages(nextSession);
      if (customText === undefined) setInputText("");
      setIsTyping(true);

      const reply = await askCompanionLLM(
        `用户刚刚对你说：「${txt}」。请结合当前太疾驰页面上的真实商品/菜品信息回复用户。`,
        nextAll
      );
      if (reply) {
        const aiMsg = {
          id: Date.now() + 1,
          text: reply,
          type: "text",
          isMe: false,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setMessages((prev) => [...prev, aiMsg]);
        setSessionMessages((prev) => [...prev, aiMsg]);
      }
      setIsTyping(false);
    };

    // P1：让名士结合当前太疾驰页面主动挑一样好物/推荐一道菜，并支持一键加购
    const handleAskCharacterPick = async () => {
      if (isTyping || isPicking) return;
      if (typeof global.sendToLLM !== "function") return;
      setIsPicking(true);
      setCharRecommendation(null);
      try {
        const worldContext = global.getWorldBookContext ? String((await global.getWorldBookContext()) || "").slice(0, 1000) : "";
        const userCtx = `【用户身份】姓名：${userPersona?.name || "广陵王"}；性格：${userPersona?.personality || "果敢敏锐"}`;
        const charCtx = `【你的角色设定】${buildCharPersonaPrompt(character)}`;
        const pageCtx = getFormattedPageContext();

        const raw = await new Promise((resolve) => {
          global.sendToLLM(
            [
              {
                role: "system",
                content: `你正在太疾驰陪用户逛街，现在请你以【${character?.name || "名士"}】的人设和审美，从当前页面的真实商品/菜品中主动挑一件推荐给用户（若页面列表为空，则结合当前分区推荐一件古风好物/美食）。
严格输出合法 JSON（不要 Markdown 代码块）：
{
  "itemName": "推荐的商品或菜品名称",
  "shop": "店名/商家名",
  "price": "价格（如 36 钱）",
  "reason": "你推荐它的理由与贴合人设的口语台词（20~55字）"
}`
              },
              {
                role: "user",
                content: `${worldContext ? `【世界书】\n${worldContext}\n\n` : ""}${userCtx}\n${charCtx}\n\n【太疾驰当前页面商品】\n${pageCtx}`
              }
            ],
            { disableMCP: true },
            (reply) => resolve(String(reply || "")),
            () => resolve("")
          );
        });

        let parsed = null;
        try {
          const cleaned = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
          parsed = global.safeParseLLMJson ? global.safeParseLLMJson(cleaned) : JSON.parse(cleaned);
        } catch (e) {
          const s = raw.indexOf("{");
          const end = raw.lastIndexOf("}");
          if (s !== -1 && end > s) {
            try {
              parsed = JSON.parse(raw.slice(s, end + 1));
            } catch (err) {}
          }
        }

        const fallbackItem = getCurrentFocusItem() || { name: "招牌桂花糕", shop: "太疾驰精选商坊", price: "32 钱" };
        const rec = {
          itemName: String(parsed?.itemName || fallbackItem.name || "精选好物").trim(),
          shop: String(parsed?.shop || fallbackItem.shop || "太疾驰商坊").trim(),
          price: String(parsed?.price || fallbackItem.price || "38 钱").trim(),
          reason: String(parsed?.reason || raw.replace(/```json|```/g, "").trim() || `这个「${fallbackItem.name}」瞧着挺衬你，要不带上？`).trim(),
          added: false
        };

        setCharRecommendation(rec);
        const aiMsg = {
          id: Date.now() + 1,
          text: `（挑中了「${rec.itemName}」）${rec.reason}`,
          type: "text",
          isMe: false,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setMessages((prev) => [...prev, aiMsg]);
        setSessionMessages((prev) => [...prev, aiMsg]);
      } catch (e) {
      } finally {
        setIsPicking(false);
      }
    };

    const handleAcceptRecommendation = () => {
      if (!charRecommendation || charRecommendation.added) return;
      const rec = charRecommendation;
      setCharRecommendation({ ...rec, added: true });
      try {
        global.dispatchEvent(
          new CustomEvent("t12-coshop-add-to-cart", {
            detail: {
              itemName: rec.itemName,
              shop: rec.shop,
              price: rec.price,
              category: _contextState.tabLabel || "名士严选",
              pickedBy: character?.name || "名士"
            }
          })
        );
      } catch (e) {}
      notifyOrderPlaced({
        itemName: rec.itemName,
        shop: rec.shop,
        price: rec.price,
        category: `${character?.name || "名士"}推荐`
      });
    };

    // PointerEvents 平滑拖拽（限幅在安全区内）
    const onDragStart = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "button" || e.target.closest("button") || e.target.closest("input")) return;
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        initX: position.x,
        initY: position.y,
        moved: false
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {}
    };

    const onDragMove = (e) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
      const panelW = viewMode === "pill" ? 150 : Math.min(370, window.innerWidth * 0.92);
      const nx = Math.max(8, Math.min(window.innerWidth - panelW - 8, dragRef.current.initX + dx));
      const ny = Math.max(8, Math.min(window.innerHeight - 90, dragRef.current.initY + dy));
      setPosition({ x: nx, y: ny });
    };

    const onDragEnd = () => {
      dragRef.current.dragging = false;
    };

    const lastAiMsg = [...messages].reverse().find((m) => !m.isMe);
    const lastMyMsg = [...messages].reverse().find((m) => m.isMe);

    // 最小化胶囊球模式
    if (viewMode === "pill") {
      return h(
        "div",
        {
          onPointerDown: onDragStart,
          onPointerMove: onDragMove,
          onPointerUp: onDragEnd,
          onClick: () => {
            if (!dragRef.current.moved) setViewMode("compact");
          },
          style: {
            position: "fixed",
            top: `${position.y}px`,
            left: `${position.x}px`,
            zIndex: 4000,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px 6px 6px",
            borderRadius: "999px",
            background: "rgba(253, 252, 248, 0.96)",
            border: "1.5px solid #e6d8be",
            boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
            cursor: "grab",
            touchAction: "none"
          }
        },
        h(CoShopAvatar, {
          avatar: character?.avatar || character?.avatarId || character?.profile?.avatar,
          chatId,
          name: character?.name || "名",
          size: 30,
          bgColor: character?.avatarColor || "#A8C8BA"
        }),
        h(
          "div",
          { style: { fontSize: "12px", fontWeight: "700", color: "#5a5f4d", whiteSpace: "nowrap" } },
          isTyping ? `${character?.name} 正在看…` : `与 ${character?.name} 同逛`
        ),
        h("span", { style: { fontSize: "11px", color: "#D6724B" } }, "展开")
      );
    }

    return h(
      "div",
      {
        onPointerDown: onDragStart,
        onPointerMove: onDragMove,
        onPointerUp: onDragEnd,
        style: {
          position: "fixed",
          top: `${position.y}px`,
          left: `${position.x}px`,
          width: "92%",
          maxWidth: "370px",
          background: "rgba(253, 252, 248, 0.97)",
          backdropFilter: "blur(14px)",
          borderRadius: "20px",
          padding: "12px 14px",
          zIndex: 4000,
          boxShadow: "0 12px 36px rgba(0,0,0,0.16)",
          border: "1px solid #eadfcd",
          cursor: "grab",
          touchAction: "none",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }
      },
      // 顶部标题栏
      h(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #efe9da",
            paddingBottom: "8px"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: "700", color: "#5a5f4d" } },
          h("span", { style: { width: "8px", height: "8px", borderRadius: "50%", background: "#D6724B", display: "inline-block" } }),
          `与 ${character?.name || "名士"} 同游太疾驰`,
          sessionMessages.length > 0 &&
            h(
              "span",
              { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: "#f4ece0", color: "#a45c37" } },
              `${sessionMessages.length}条`
            )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          h(
            "button",
            {
              onClick: () => setViewMode((m) => (m === "expanded" ? "compact" : "expanded")),
              style: {
                border: "none",
                background: "#f3efe4",
                color: "#6b6e5e",
                borderRadius: "8px",
                padding: "3px 7px",
                fontSize: "11px",
                cursor: "pointer"
              }
            },
            viewMode === "expanded" ? "收起记录" : "展开记录"
          ),
          h(
            "button",
            {
              onClick: () => setViewMode("pill"),
              title: "缩成小胶囊",
              style: {
                border: "none",
                background: "#f3efe4",
                color: "#6b6e5e",
                borderRadius: "8px",
                padding: "3px 7px",
                fontSize: "11px",
                cursor: "pointer"
              }
            },
            "最小化"
          ),
          h(
            "button",
            {
              onClick: () => finishSession(true),
              title: "结束同游并返回传讯",
              style: {
                border: "none",
                background: "#fdeee9",
                color: "#c65032",
                borderRadius: "8px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "结束回传讯"
          )
        )
      ),

      // 对话内容区（紧凑模式 vs 可滚动展开记录模式）
      viewMode === "compact"
        ? h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", gap: "8px" } },
            h(
              "div",
              { style: { flex: 1, display: "flex", gap: "8px", minWidth: 0 } },
              h(CoShopAvatar, {
                avatar: character?.avatar || character?.avatarId || character?.profile?.avatar,
                chatId,
                name: character?.name || "名",
                size: 34,
                bgColor: character?.avatarColor || "#A8C8BA"
              }),
              h(
                "div",
                {
                  style: {
                    background: "#F9F7F5",
                    padding: "8px 10px",
                    borderRadius: "2px 12px 12px 12px",
                    fontSize: "12px",
                    color: "#5a5f4d",
                    border: "1px solid #EAE6D6",
                    lineHeight: 1.45,
                    wordBreak: "break-word"
                  }
                },
                isTyping ? "正在翻看货单…" : lastAiMsg ? lastAiMsg.text : "想看点什么？我陪你挑。"
              )
            ),
            h(
              "div",
              { style: { flex: 1, display: "flex", gap: "8px", flexDirection: "row-reverse", minWidth: 0 } },
              h(CoShopAvatar, {
                avatar: userPersona?.avatar || "",
                personaId: userPersona?.id,
                chatId,
                name: userPersona?.name || "我",
                size: 34,
                bgColor: "#5d4e37",
                isUserPersona: true
              }),
              h(
                "div",
                {
                  style: {
                    background: "#FADBD8",
                    padding: "8px 10px",
                    borderRadius: "12px 2px 12px 12px",
                    fontSize: "12px",
                    color: "#5d4e37",
                    border: "1px solid #F5C6C1",
                    lineHeight: 1.45,
                    wordBreak: "break-word"
                  }
                },
                lastMyMsg ? lastMyMsg.text : "打开了太疾驰…"
              )
            )
          )
        : h(
            "div",
            {
              ref: scrollBoxRef,
              onPointerDown: (e) => e.stopPropagation(),
              style: {
                maxHeight: "190px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "4px 2px"
              }
            },
            (sessionMessages.length > 0 ? sessionMessages : messages.slice(-4)).map((m, idx) =>
              h(
                "div",
                {
                  key: m.id || idx,
                  style: {
                    display: "flex",
                    flexDirection: m.isMe ? "row-reverse" : "row",
                    alignItems: "flex-start",
                    gap: "7px"
                  }
                },
                h(CoShopAvatar, {
                  avatar: m.isMe ? userPersona?.avatar || "" : character?.avatar || character?.avatarId || character?.profile?.avatar,
                  personaId: m.isMe ? userPersona?.id : undefined,
                  chatId,
                  name: m.isMe ? userPersona?.name || "我" : character?.name || "名",
                  size: 26,
                  bgColor: m.isMe ? "#5d4e37" : character?.avatarColor || "#A8C8BA",
                  isUserPersona: Boolean(m.isMe)
                }),
                m.type === "order_card"
                  ? h(
                      "div",
                      {
                        style: {
                          background: "#fff7ec",
                          border: "1px solid #f0d7b5",
                          borderRadius: "10px",
                          padding: "7px 10px",
                          fontSize: "11.5px",
                          color: "#7d4c1c",
                          maxWidth: "78%"
                        }
                      },
                      `🛍️ 已下单：${m.content?.itemName || "商品"}（${m.content?.price || ""}）`
                    )
                  : h(
                      "div",
                      {
                        style: {
                          background: m.isMe ? "#FADBD8" : "#F9F7F5",
                          color: "#5d4e37",
                          padding: "7px 10px",
                          borderRadius: m.isMe ? "11px 2px 11px 11px" : "2px 11px 11px 11px",
                          fontSize: "12px",
                          lineHeight: 1.45,
                          maxWidth: "78%",
                          border: m.isMe ? "1px solid #F5C6C1" : "1px solid #EAE6D6"
                        }
                      },
                      m.text
                    )
              )
            ),
            isTyping && h("div", { style: { fontSize: "11px", color: "#8c917b", fontStyle: "italic" } }, `${character?.name} 正在斟酌…`)
          ),

      // P1：名士主动种草推荐卡（支持一键加入太疾驰结算单）
      charRecommendation &&
        h(
          "div",
          {
            onPointerDown: (e) => e.stopPropagation(),
            style: {
              background: "linear-gradient(135deg, #fff9ee 0%, #fdf2e6 100%)",
              border: "1px solid #eccfa9",
              borderRadius: "12px",
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px"
            }
          },
          h(
            "div",
            { style: { minWidth: 0, flex: 1 } },
            h(
              "div",
              { style: { fontSize: "11.5px", fontWeight: "700", color: "#8c4a1c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
              `🎁 ${character?.name || "TA"} 推荐：${charRecommendation.itemName}`
            ),
            h(
              "div",
              { style: { fontSize: "10.5px", color: "#9c7c5c" } },
              `${charRecommendation.shop} · ${charRecommendation.price}`
            )
          ),
          h(
            "button",
            {
              onClick: handleAcceptRecommendation,
              disabled: charRecommendation.added,
              style: {
                flexShrink: 0,
                border: "none",
                borderRadius: "999px",
                padding: "5px 10px",
                fontSize: "11px",
                fontWeight: "700",
                background: charRecommendation.added ? "#cfd8ce" : "#D6724B",
                color: charRecommendation.added ? "#586857" : "#fff",
                cursor: charRecommendation.added ? "default" : "pointer"
              }
            },
            charRecommendation.added ? "已加购 ✓" : "🛒 就听TA的"
          )
        ),

      // 快捷操作行：问 TA 当前商品 + 让 TA 主动挑一样
      h(
        "div",
        { style: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" } },
        focusItem &&
          focusItem.name &&
          h(
            "button",
            {
              onPointerDown: (e) => e.stopPropagation(),
              disabled: isTyping || isPicking,
              onClick: () => handleSend(`你看「${focusItem.name}」（${focusItem.price || "时价"}）怎么样？要不要买？`),
              style: {
                border: "1px dashed #dfbe9a",
                background: "#fffaf2",
                color: "#9a5928",
                borderRadius: "999px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                maxWidth: "60%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }
            },
            `✨ 问 TA：「${focusItem.name}」`
          ),
        h(
          "button",
          {
            onPointerDown: (e) => e.stopPropagation(),
            disabled: isTyping || isPicking,
            onClick: handleAskCharacterPick,
            style: {
              border: "1px solid #e2c5a2",
              background: "#fff4e5",
              color: "#b4532a",
              borderRadius: "999px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: "700",
              cursor: isPicking ? "wait" : "pointer",
              flexShrink: 0
            }
          },
          isPicking ? "🎁 TA 正在挑…" : "🎁 让 TA 挑一样"
        )
      ),

      // 输入栏
      h(
        "div",
        { style: { display: "flex", gap: "8px", alignItems: "center" } },
        h("input", {
          type: "text",
          value: inputText,
          onChange: (e) => setInputText(e.target.value),
          placeholder: `询问 ${character?.name || "TA"} 的意见…`,
          onKeyDown: (e) => e.key === "Enter" && handleSend(),
          onPointerDown: (e) => e.stopPropagation(),
          style: {
            flex: 1,
            padding: "9px 13px",
            borderRadius: "999px",
            border: "1px solid #e5dfd0",
            outline: "none",
            fontSize: "13px",
            background: "#fff"
          }
        }),
        h(
          "button",
          {
            onClick: () => handleSend(),
            onPointerDown: (e) => e.stopPropagation(),
            disabled: isTyping || !inputText.trim(),
            style: {
              padding: "9px 14px",
              background: isTyping ? "#ccc" : "linear-gradient(135deg, #D6724B 0%, #C95E36 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              fontSize: "12.5px",
              fontWeight: "700",
              cursor: "pointer"
            }
          },
          "发送"
        )
      )
    );
  }

  // ==========================================
  // 5. 增强版「太疾驰同行简介卡片」+ LLM 结构化序列化
  // ==========================================
  function CollapsibleShoppingCardV2({ msg }) {
    const h = React.createElement;
    const [isExpanded, setIsExpanded] = React.useState(false);
    const list = Array.isArray(msg?.content?.messages) ? msg.content.messages : [];
    const orders = Array.isArray(msg?.content?.orders)
      ? msg.content.orders
      : list.filter((m) => m.type === "order_card").map((m) => m.content || {});
    const chatCount =
      typeof msg?.content?.chatTurns === "number"
        ? msg.content.chatTurns
        : list.filter((m) => m.type !== "order_card").length;
    const orderNames = orders.map((o) => o.itemName).filter(Boolean);
    const headline =
      msg?.content?.summaryHeadline ||
      (orderNames.length > 0
        ? `已购 ${orderNames.slice(0, 2).join("、")}${orderNames.length > 2 ? ` 等 ${orderNames.length} 件` : ""}`
        : `携手同逛太疾驰 · 闲聊 ${chatCount} 句`);

    return h(
      "div",
      {
        onClick: (e) => {
          e.stopPropagation();
          setIsExpanded((v) => !v);
        },
        style: {
          background: "linear-gradient(160deg, #fffdf9 0%, #faf5eb 100%)",
          borderRadius: "15px",
          padding: "12px 14px",
          border: "1px solid #eadcc5",
          width: "100%",
          minWidth: "248px",
          maxWidth: "300px",
          boxShadow: "0 4px 12px rgba(96, 76, 44, 0.06)",
          margin: "6px 0",
          cursor: "pointer",
          textAlign: "left"
        }
      },
      // 抬头 + 展开按钮
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px", color: "#C95E36", fontWeight: "800", fontSize: "13px" } },
          "🛍️ 太疾驰同行简介"
        ),
        h(
          "span",
          { style: { color: "#9c9484", fontSize: "11px", fontWeight: "600" } },
          isExpanded ? "收起 ▴" : "展开明细 ▾"
        )
      ),
      // 收起态也一目了然的简介摘要条
      h(
        "div",
        {
          style: {
            marginTop: "6px",
            fontSize: "12px",
            color: "#524c40",
            fontWeight: "600",
            lineHeight: 1.45
          }
        },
        headline
      ),
      h(
        "div",
        {
          style: {
            marginTop: "5px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "10.5px",
            color: "#8e8878"
          }
        },
        h("span", null, `下单 ${orders.length} 件 · 互动 ${chatCount} 句`),
        h("span", null, msg?.time || "")
      ),

      // 展开明细
      isExpanded &&
        h(
          "div",
          {
            style: {
              marginTop: "10px",
              paddingTop: "10px",
              borderTop: "1px dashed #e2d5be",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }
          },
          list.map((m, i) =>
            h(
              "div",
              {
                key: i,
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: m.isMe ? "flex-end" : "flex-start"
                }
              },
              m.type === "order_card"
                ? h(
                    "div",
                    {
                      style: {
                        background: "#fff7ec",
                        padding: "7px 10px",
                        borderRadius: "9px",
                        border: "1px solid #f0d7b5",
                        maxWidth: "92%",
                        fontSize: "11.5px",
                        color: "#7a4a1a"
                      }
                    },
                    h("strong", null, `下单：${m.content?.itemName || "商品"}`),
                    m.content?.price ? ` · ${m.content.price}` : ""
                  )
                : h(
                    "div",
                    {
                      style: {
                        background: m.isMe ? "#FADBD8" : "#fff",
                        color: "#5d4e37",
                        padding: "7px 10px",
                        borderRadius: m.isMe ? "11px 2px 11px 11px" : "2px 11px 11px 11px",
                        fontSize: "12px",
                        maxWidth: "92%",
                        border: m.isMe ? "1px solid #F5C6C1" : "1px solid #EAE6D6",
                        lineHeight: 1.45
                      }
                    },
                    m.text
                  )
            )
          )
        )
    );
  }

  function formatShoppingSessionCardForLLM(msg, chatData) {
    const c = msg?.content || {};
    const list = Array.isArray(c.messages) ? c.messages : [];
    const orders = Array.isArray(c.orders)
      ? c.orders
      : list.filter((m) => m.type === "order_card").map((m) => m.content || {});
    const partner = chatData?.name || c.partnerName || "你";
    const orderLines =
      orders.length > 0
        ? orders.map((o) => `- ${o.shop ? `【${o.shop}】` : ""}${o.itemName || "物品"}（${o.price || "时价"}）`).join("\n")
        : "（本次只逛未下单）";
    const dlgLines = list
      .filter((m) => m.type !== "order_card")
      .slice(-8)
      .map((m) => `${m.isMe ? "用户" : partner}：${m.text}`)
      .join("\n");

    return {
      role: "assistant",
      content: `【太疾驰携手同游记录】\n本次下单物品：\n${orderLines}\n同行关键对话：\n${dlgLines || "（略）"}`
    };
  }

  // ==========================================
  // 6. 私聊「对话偏好设置」同游开关 + 私聊顶栏快捷邀约按钮（P1）
  // ==========================================
  function CoShopPreferenceRow({ settings, onChange, chatData, onClose }) {
    const h = React.createElement;
    const enabled = isCoShoppingEnabled(chatData?.id, settings);

    const toggle = () => {
      const next = !enabled;
      setStoredCoShopPref(chatData?.id, next);
      if (typeof onChange === "function") {
        onChange({ ...(settings || {}), enableCoShopping: next });
      }
    };

    const launchNow = () => {
      if (!chatData || !chatData.id) return;
      if (typeof onClose === "function") onClose();
      global.dispatchEvent(
        new CustomEvent("startShoppingSession", {
          detail: { character: chatData, chatId: chatData.id }
        })
      );
    };

    return h(
      "div",
      { className: "cs-row", style: { alignItems: "center", gap: "10px" } },
      h(
        "div",
        { style: { flex: 1 } },
        h("div", { className: "cs-label" }, "太疾驰携手同游"),
        h(
          "div",
          { className: "cs-desc" },
          "开启后可在下方立即邀 TA 同逛太疾驰，并在聊到买东西/点外卖时轻提示同游"
        ),
        enabled &&
          chatData &&
          h(
            "button",
            {
              type: "button",
              onClick: launchNow,
              style: {
                marginTop: "6px",
                padding: "4px 10px",
                borderRadius: "999px",
                border: "1px solid #e6c5a3",
                background: "#fff7ec",
                color: "#b4532a",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            `🛒 立即邀 ${chatData.name || "TA"} 同逛太疾驰`
          )
      ),
      h(
        "label",
        { className: "toggle-switch" },
        h("input", {
          type: "checkbox",
          className: "toggle-input",
          checked: enabled,
          onChange: toggle
        }),
        h("span", { className: "toggle-slider" })
      )
    );
  }

  function HeaderCoShopButton({ chatData, settings }) {
    const h = React.createElement;
    if (!chatData || !chatData.id) return null;
    if (chatData.isGroup || chatData.type === "group" || String(chatData.id).startsWith("group_chat")) return null;
    if (!isCoShoppingEnabled(chatData.id, settings)) return null;

    return h(
      "div",
      {
        className: "chat-header-btn",
        title: `邀 ${chatData.name || "TA"} 同逛太疾驰`,
        onClick: (e) => {
          e.stopPropagation();
          global.dispatchEvent(
            new CustomEvent("startShoppingSession", {
              detail: { character: chatData, chatId: chatData.id }
            })
          );
        },
        style: {
          width: "36px",
          height: "36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          background: "rgba(255, 255, 255, 0.22)",
          borderRadius: "50%",
          backdropFilter: "blur(4px)",
          boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
          marginLeft: "6px",
          fontSize: "16px"
        }
      },
      "🛒"
    );
  }

  // 挂载全局导出
  global.CollapsibleShoppingCardV2 = CollapsibleShoppingCardV2;
  global.formatShoppingSessionCardForLLM = formatShoppingSessionCardForLLM;
  global.T12CoShoppingEngine = {
    updatePageContext,
    getFormattedPageContext,
    getCurrentFocusItem,
    notifyOrderPlaced,
    isCoShoppingEnabled,
    setStoredCoShopPref,
    shouldPromptShopping,
    CoShopAvatar,
    CoShoppingFloatingPanel,
    CoShopPreferenceRow,
    HeaderCoShopButton,
    CollapsibleShoppingCardV2,
    formatShoppingSessionCardForLLM,
    requestFinishSession: (returnToChat = true) => {
      try {
        global.dispatchEvent(new CustomEvent("t12-request-finish-coshopping", { detail: { returnToChat } }));
      } catch (e) {}
    }
  };
})(window);
