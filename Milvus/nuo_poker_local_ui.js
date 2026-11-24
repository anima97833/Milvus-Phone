/**
 * Milvus/nuo_poker_local_ui.js
 * 「傩·扑克 2.0」4人本土玩法（红十 / 打娘娘）手机竖屏牌桌 UI + 5维人设 AI 决策引擎
 * - 严格独立模块，不触碰德州扑克与 app.min.js
 * - 候选集编号决策法（0% 非法出牌）+ 90 秒大模型等待兜底（90000ms）
 * - 手机端双排错落大牌面手牌托盘（13 张不挤、防误触、💡一键提示、跟花高亮）
 */
(function (global) {
  "use strict";

  const AI_TIMEOUT_MS = 90000;

  function isRenderableUrl(v) {
    if (!v || typeof v !== "string") return false;
    const s = v.trim();
    return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("/");
  }

  function extractJsonObject(text) {
    const raw = String(text || "").trim();
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (e) {
      return null;
    }
  }

  function resolveMainLlmConfig() {
    try {
      if (typeof global.getLlmConfig === "function") {
        const cfg = global.getLlmConfig();
        if (cfg && cfg.apiKey && cfg.endpoint) return cfg;
      }
      const raw = localStorage.getItem("api_config") || localStorage.getItem("llm_config") || localStorage.getItem("openai_config");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.apiKey || parsed.key) && (parsed.endpoint || parsed.baseUrl || parsed.url)) {
          let ep = parsed.endpoint || parsed.baseUrl || parsed.url;
          if (!ep.endsWith("/chat/completions")) ep = ep.replace(/\/+$/, "") + "/chat/completions";
          return { endpoint: ep, apiKey: parsed.apiKey || parsed.key, model: parsed.model || "gpt-4o-mini" };
        }
      }
    } catch (e) { }
    return null;
  }

  async function callLlmWith90sTimeout(msgs) {
    const invoke = async () => {
      if (typeof global.sendToLLM === "function") {
        return await new Promise((resolve, reject) => {
          try {
            global.sendToLLM(msgs, { disableMCP: true }, (reply) => resolve(reply), (err) => reject(err));
          } catch (e) {
            reject(e);
          }
        });
      }
      const llm = resolveMainLlmConfig();
      if (!llm) throw new Error("NO_LLM");
      const headers = { "Content-Type": "application/json" };
      if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
      const resp = await fetch(llm.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: llm.model,
          messages: msgs,
          temperature: 0.82,
          max_tokens: 220
        })
      });
      if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
      const json = await resp.json();
      return (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
    };

    return await Promise.race([
      invoke(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT_90S")), AI_TIMEOUT_MS))
    ]);
  }

  // ==========================================
  // 1. 5 维人设 + 候选集编号 AI 决策器（红十 / 打娘娘）
  // ==========================================
  async function requestLocalAiDecision({ mode, state, seatIdx, contextBundle, tableChat }) {
    const isHS = mode === "hongshi";
    const Engine = isHS ? global.NuoPokerHongShi : global.NuoPokerNiangNiang;
    const seat = state.seats[seatIdx];
    const seatView = Engine.buildSeatView(state, seatIdx);

    // 红十明暗亮牌阶段
    if (isHS && state.stage === "reveal") {
      const fallback = Engine.decideLocalReveal(state, seatIdx);
      const charPrompt = (contextBundle && contextBundle.charPrompts && contextBundle.charPrompts[seat.id]) || `角色：${seat.name}`;
      const userPersona = (contextBundle && contextBundle.userPersona) || { name: "我", bio: "" };
      const worldBook = (contextBundle && contextBundle.worldBookText) || "";
      const recentChat = (contextBundle && contextBundle.charRecentChat && contextBundle.charRecentChat[seat.id]) || "";

      const sysPrompt = [
        `你正在扮演「${seat.name}」，与玩家「${userPersona.name}」及另外两位名士在「傩·扑克」打4人【红十】。`,
        "【角色档案】",
        charPrompt,
        userPersona.bio ? `【玩家身份】${userPersona.name}：${userPersona.bio}` : "",
        worldBook ? `【世界观设定】${worldBook}` : "",
        recentChat ? `【近期私聊记忆】\n${recentChat}` : "",
        "【当前抉择】你摸到了红十！决定是否「亮红十」（公开身份且本局积分翻倍）或「暗藏」（隐藏队友身份互相试探）。",
        "只返回严格 JSON：{\"reveal\": true或false, \"tableTalk\": \"12~34字符合人设的活人感台词\"}"
      ].filter(Boolean).join("\n");

      const userPrompt = `你的手牌：${seatView.mySeat.handText}（红十数量：${seat.redTenCount}${seatView.mySeat.isSoloRed10 ? "，你是独打1v3！" : ""}）。请决定亮牌还是暗藏。`;
      try {
        const raw = await callLlmWith90sTimeout([
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt }
        ]);
        const parsed = extractJsonObject(raw);
        if (parsed && typeof parsed.reveal === "boolean") {
          return {
            reveal: parsed.reveal,
            tableTalk: String(parsed.tableTalk || "").trim().slice(0, 68) || fallback.tableTalk,
            usedAi: true
          };
        }
      } catch (e) { }
      return { ...fallback, usedAi: false };
    }

    // 正常出牌阶段：候选集编号决策
    const candidates = isHS
      ? Engine.enumerateLegalPlays(state, seatIdx, 10)
      : Engine.enumerateLegalPlays(state, seatIdx);

    const fallback = Engine.decideLocalFallbackPlay(state, seatIdx);
    if (!Engine.shouldInvokeAi(state, seatIdx, candidates)) {
      return { ...fallback, usedAi: false };
    }

    const charPrompt = (contextBundle && contextBundle.charPrompts && contextBundle.charPrompts[seat.id]) || `角色：${seat.name}`;
    const userPersona = (contextBundle && contextBundle.userPersona) || { name: "我", bio: "" };
    const worldBook = (contextBundle && contextBundle.worldBookText) || "";
    const recentChat = (contextBundle && contextBundle.charRecentChat && contextBundle.charRecentChat[seat.id]) || "";
    const recentTableTalk = (tableChat || []).slice(-6).map((m) => `${m.sender}：${m.text}`).join("\n");

    const optionsText = candidates.map((c, idx) => `[${idx}] ${c.label}`).join("\n");

    const modeInstruction = isHS
      ? [
        "【红十规则要点】双红十(♥10♦10)全场最大 > 四张炸弹 > 三张/对子/单张；单张大小：红10 > 2 > A > K > ... > 3。",
        `你的阵营：${seatView.mySeat.isSoloRed10 ? "独打双红十(1v3)" : seatView.mySeat.team === "red10" ? "红十方（找队友配合抢头二游）" : "平民方（阻击红十方）"}。`,
        "你只能看到自己的牌和别人打出的牌，严禁编造他人暗牌；台词要有活人感，可试探谁是队友、掩护或嘴炮。"
      ].join("\n")
      : [
        "【打娘娘规则要点】严格跟花色，同花色最大者吃墩；断门可甩牌！",
        "分值：♠Q(黑桃娘娘 -100分，极力甩给别人！) / ♦J(御前侍卫 +100分，趁机抢！) / ♣10(翻倍令 ×2) / 红桃均负分。",
        "台词要有活人感，甩出黑桃娘娘时得意调侃，被塞娘娘时咬牙切齿，抢到侍卫时意气风发。"
      ].join("\n");

    const sysPrompt = [
      `你正在扮演「${seat.name}」，与玩家「${userPersona.name}」及另外两位名士在「傩·扑克」打4人【${isHS ? "红十" : "打娘娘"}】。`,
      "【角色档案】",
      charPrompt,
      userPersona.bio ? `【玩家身份】${userPersona.name}：${userPersona.bio}` : "",
      worldBook ? `【世界观设定】${worldBook}` : "",
      recentChat ? `【近期私聊记忆】\n${recentChat}` : "",
      modeInstruction,
      "【输出要求】只能从下方合法候选编号中选择 1 项！只返回严格 JSON，不要额外解释：",
      "{\"choiceIndex\": 0, \"tableTalk\": \"10~34字极具角色活人感的牌桌发言，可回应他人话茬\"}"
    ].filter(Boolean).join("\n");

    const stateSummary = isHS
      ? [
        `第 ${seatView.handNumber} 局（倍率 ×${seatView.multiplier}），${seatView.isLeading ? "由你自由领出" : `需压过 ${seatView.tableTop.by}（${seatView.tableTop.byTeamVisible}）的 ${seatView.tableTop.label}`}`,
        `你的手牌(${seatView.mySeat.cardCount}张)：${seatView.mySeat.handText}`,
        `其他三家：${seatView.others.map((o) => `${o.name}(剩${o.cardCount}张${o.revealedRed10 ? ",🔴已明红十" : ""}${o.finished ? `,已跑第${o.finishRank}` : ""})`).join(" | ")}`
      ].join("\n")
      : [
        `第 ${seatView.trickNumber}/13 墩，领出花色：${seatView.leadSuit}，当前暂吃墩：${seatView.currentTrickWinner || "暂无"}`,
        `本墩已出：${seatView.trickPlays.map((p) => `${p.by}:${p.card}`).join(" -> ") || "（你先手）"}`,
        `你的手牌(${seatView.mySeat.cardCount}张)：${seatView.mySeat.handText}（本局暂分 ${seatView.mySeat.roundScore}）`,
        `其他三家：${seatView.others.map((o) => `${o.name}(剩${o.cardCount}张,分:${o.roundScore},已吃:${o.capturedText})`).join(" | ")}`
      ].join("\n");

    const userPrompt = [
      stateSummary,
      recentTableTalk ? `【牌桌近期群聊】\n${recentTableTalk}` : "",
      "【你的合法候选出牌（必须选其中之一编号）】",
      optionsText
    ].filter(Boolean).join("\n\n");

    try {
      const raw = await callLlmWith90sTimeout([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ]);
      const parsed = extractJsonObject(raw);
      if (parsed && typeof parsed.choiceIndex === "number") {
        const idx = Math.max(0, Math.min(candidates.length - 1, Math.floor(parsed.choiceIndex)));
        const chosen = candidates[idx];
        const talk = String(parsed.tableTalk || "").trim().slice(0, 68);
        if (isHS) {
          return {
            choiceIndex: idx,
            cardIds: chosen.cardIds,
            isPass: chosen.isPass,
            tableTalk: talk || fallback.tableTalk,
            usedAi: true
          };
        }
        return {
          choiceIndex: idx,
          cardId: chosen.cardId,
          tableTalk: talk || fallback.tableTalk,
          usedAi: true
        };
      }
    } catch (e) { }

    return { ...fallback, usedAi: false };
  }

  // ==========================================
  // 2. 牌面渲染组件（支持红十/娘娘/侍卫/翻倍微标与选中抬起）
  // ==========================================
  function renderLocalCard(h, card, {
    mode,
    size = "md",
    selected = false,
    disabled = false,
    onClick = null,
    overlapLeft = 0
  } = {}) {
    if (!card) return null;
    const isRed = card.suit === "hearts" || card.suit === "diamonds";
    const suitSym = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" }[card.suit] || "";
    const rankLbl = { 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A" }[card.rank] || card.rank;

    let tag = "";
    let tagBg = "#EDE9FE";
    let tagColor = "#6D28D9";
    if (mode === "hongshi" && card.rank === 10 && isRed) {
      tag = "红十";
      tagBg = "#FFE4E6";
      tagColor = "#BE123C";
    } else if (mode === "niangniang" && global.NuoPokerNiangNiang) {
      const t = global.NuoPokerNiangNiang.getCardSpecialTag(card);
      if (t) {
        tag = t;
        if (t === "娘娘") { tagBg = "#1E293B"; tagColor = "#FDE047"; }
        else if (t === "侍卫") { tagBg = "#DCFCE7"; tagColor = "#15803D"; }
        else if (t === "×2") { tagBg = "#FEF3C7"; tagColor = "#B45309"; }
        else { tagBg = "#FFE4E6"; tagColor = "#E11D48"; }
      }
    }

    const dims = size === "hand"
      ? { w: 45, h: 63, font: 13.5, suit: 16 }
      : size === "sm"
        ? { w: 34, h: 48, font: 11, suit: 13 }
        : { w: 42, h: 58, font: 12.5, suit: 15 };

    return h(
      "div",
      {
        onClick: disabled ? undefined : onClick,
        style: {
          width: `${dims.w}px`,
          height: `${dims.h}px`,
          marginLeft: overlapLeft ? `${overlapLeft}px` : "0px",
          borderRadius: "9px",
          background: disabled ? "#F1F5F9" : "#FFFFFF",
          border: selected ? "2.5px solid #7C6BF0" : tag === "娘娘" ? "1.5px solid #334155" : "1px solid #DCE1F2",
          boxShadow: selected
            ? "0 8px 18px rgba(124, 107, 240, 0.32)"
            : "0 3px 8px rgba(15, 23, 42, 0.08)",
          transform: selected ? "translateY(-11px)" : "translateY(0)",
          transition: "transform 0.14s ease, box-shadow 0.14s ease",
          opacity: disabled ? 0.42 : 1,
          cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "3px 3px 4px",
          boxSizing: "border-box",
          color: isRed ? "#E11D48" : "#1E293B",
          fontWeight: 800,
          position: "relative",
          flexShrink: 0,
          userSelect: "none"
        }
      },
      h("div", { style: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", lineHeight: 1 } },
        h("span", { style: { fontSize: `${dims.font}px` } }, rankLbl),
        h("span", { style: { fontSize: `${dims.font - 2}px` } }, suitSym)
      ),
      tag
        ? h("span", { style: { fontSize: "8.5px", fontWeight: 900, background: tagBg, color: tagColor, padding: "1px 4px", borderRadius: "4px", lineHeight: 1.2, whiteSpace: "nowrap" } }, tag)
        : h("span", { style: { fontSize: `${dims.suit}px`, lineHeight: 1 } }, suitSym)
    );
  }

  // ==========================================
  // 3. 4 人本土牌桌组件（红十 & 打娘娘共用）
  // ==========================================
  function LocalPokerTable({
    mode,
    seatsMeta,
    startingChips,
    contextBundle,
    resolvedAvatars,
    onBackToLobby,
    onSaveRecord,
    onShareSummary
  }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const isHS = mode === "hongshi";
    const Engine = isHS ? global.NuoPokerHongShi : global.NuoPokerNiangNiang;
    if (!Engine) return null;

    const [gameState, setGameState] = useState(() =>
      Engine.createGameState({ seatsMeta, handNumber: 1 })
    );
    const [selectedCardIds, setSelectedCardIds] = useState([]);
    const [hintCursor, setHintCursor] = useState(0);
    const [tableChat, setTableChat] = useState(() => [
      {
        id: "sys_init",
        sender: "荷官",
        text: isHS
          ? "第 1 局「红十」发牌完毕！每人 13 张，摸到红十者可先抉择明暗。"
          : "第 1 局「打娘娘」发牌完毕！13 墩严格跟花，小心黑桃娘娘(♠Q)！",
        isSys: true
      }
    ]);
    const [bubblesBySeat, setBubblesBySeat] = useState({});
    const [thinkingSeat, setThinkingSeat] = useState(-1);
    const [showChatDrawer, setShowChatDrawer] = useState(false);
    const [showRulesHelp, setShowRulesHelp] = useState(false);
    const [chatInput, setChatInput] = useState("");
    const [toast, setToast] = useState("");

    const tokenRef = useRef(1);
    const tableChatRef = useRef(tableChat);
    useEffect(() => { tableChatRef.current = tableChat; }, [tableChat]);

    const flashToast = (m) => {
      setToast(m);
      setTimeout(() => setToast(""), 2000);
    };

    // AI 回合自动推进调度器（90s 超时兜底 + tokenRef 防串台）
    useEffect(() => {
      if (!gameState || gameState.stage === "finished") {
        setThinkingSeat(-1);
        return;
      }
      const curIdx = gameState.currentSeat;
      if (curIdx < 0) return;
      const curSeat = gameState.seats[curIdx];
      if (!curSeat || curSeat.isUser) {
        setThinkingSeat(-1);
        return;
      }

      const myToken = tokenRef.current;
      setThinkingSeat(curIdx);
      const startTs = Date.now();

      (async () => {
        const decision = await requestLocalAiDecision({
          mode,
          state: gameState,
          seatIdx: curIdx,
          contextBundle,
          tableChat: tableChatRef.current
        });
        const elapsed = Date.now() - startTs;
        if (elapsed < 650) {
          await new Promise((r) => setTimeout(r, 650 - elapsed));
        }
        if (myToken !== tokenRef.current) return;

        if (decision.tableTalk) {
          setBubblesBySeat((prev) => ({ ...prev, [curSeat.id]: decision.tableTalk }));
          setTableChat((prev) => [
            ...prev.slice(-45),
            { id: `lc_${Date.now()}_${Math.random()}`, sender: curSeat.name, text: decision.tableTalk, isMe: false }
          ]);
        }

        setThinkingSeat(-1);
        setGameState((prev) => {
          if (!prev || prev.stage === "finished" || prev.currentSeat !== curIdx) return prev;
          const cloned = JSON.parse(JSON.stringify(prev));
          if (isHS && cloned.stage === "reveal") {
            Engine.applyRevealChoice(cloned, curIdx, !!decision.reveal);
            return cloned;
          }
          const res = isHS
            ? Engine.applyPlay(cloned, curIdx, decision.isPass ? [] : decision.cardIds, decision.tableTalk || "")
            : Engine.applyPlay(cloned, curIdx, decision.cardId, decision.tableTalk || "");
          if (!res.ok) {
            const fb = Engine.decideLocalFallbackPlay(cloned, curIdx);
            if (isHS) Engine.applyPlay(cloned, curIdx, fb.isPass ? [] : fb.cardIds, fb.tableTalk || "");
            else Engine.applyPlay(cloned, curIdx, fb.cardId, fb.tableTalk || "");
          }
          if (cloned.stage === "finished" && typeof onSaveRecord === "function") {
            onSaveRecord({
              mode,
              handNumber: cloned.handNumber,
              resultTitle: cloned.resultTitle,
              resultSummary: cloned.resultSummary,
              players: cloned.seats.map((s) => ({ name: s.name, chips: s.chips }))
            });
          }
          return cloned;
        });
      })();
    }, [
      gameState?.stage,
      gameState?.currentSeat,
      gameState?.turnCount,
      gameState?.trickNumber,
      gameState?.currentTrick?.plays?.length,
      gameState?.handNumber
    ]);

    const meSeat = gameState.seats[0];
    const isMyTurn = gameState.stage !== "finished" && gameState.currentSeat === 0;
    const isMyRevealTurn = isHS && gameState.stage === "reveal" && isMyTurn;

    // 用户的合法提示候选
    const myLegalCandidates = isMyTurn && gameState.stage === "playing"
      ? (isHS ? Engine.enumerateAllLegalPlays(gameState, 0) : Engine.enumerateLegalPlays(gameState, 0))
      : [];
    const legalCardIdSet = !isHS && isMyTurn
      ? new Set(Engine.getLegalCards(gameState, 0).map((c) => c.id))
      : null;

    // 校验用户当前选中的牌是否合法
    const canSubmitSelection = (() => {
      if (!isMyTurn || gameState.stage !== "playing" || !selectedCardIds.length) return false;
      if (isHS) {
        const chosen = meSeat.hand.filter((c) => selectedCardIds.includes(c.id));
        const info = Engine.classifyPlay(chosen);
        const curPlay = gameState.currentTrick ? gameState.currentTrick.play : null;
        const isLeading = !curPlay || gameState.currentTrick.leaderSeat === 0;
        return !!info && (isLeading || Engine.canBeat(info, curPlay));
      }
      return selectedCardIds.length === 1 && legalCardIdSet && legalCardIdSet.has(selectedCardIds[0]);
    })();

    const handleToggleCard = (cardId) => {
      if (gameState.stage !== "playing") return;
      if (!isHS) {
        if (!isMyTurn || !legalCardIdSet || !legalCardIdSet.has(cardId)) return;
        // 打娘娘单选：再点一次已选牌直接打出，丝滑顺手！
        if (selectedCardIds[0] === cardId) {
          handleUserPlay([cardId]);
        } else {
          setSelectedCardIds([cardId]);
        }
        return;
      }
      setSelectedCardIds((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]));
    };

    const handleHint = () => {
      if (!isMyTurn || gameState.stage !== "playing") return;
      const playable = isHS ? myLegalCandidates.filter((c) => !c.isPass) : myLegalCandidates;
      if (!playable.length) {
        flashToast("本轮没有更大的牌，请点「不要」");
        return;
      }
      const nextIdx = hintCursor % playable.length;
      const pick = playable[nextIdx];
      setHintCursor(nextIdx + 1);
      setSelectedCardIds(isHS ? pick.cardIds.slice() : [pick.cardId]);
    };

    const handleUserReveal = (reveal) => {
      if (!isMyRevealTurn) return;
      const cloned = JSON.parse(JSON.stringify(gameState));
      Engine.applyRevealChoice(cloned, 0, reveal);
      setTableChat((prev) => [
        ...prev.slice(-45),
        { id: `u_rev_${Date.now()}`, sender: meSeat.name, text: reveal ? "🔥 亮红十！倍率翻倍！" : "🎭 暗藏红十，且看局势。", isMe: true }
      ]);
      setGameState(cloned);
    };

    const handleUserPlay = (overrideIds = null, isPass = false) => {
      if (!isMyTurn || gameState.stage !== "playing") return;
      const ids = overrideIds || selectedCardIds;
      const cloned = JSON.parse(JSON.stringify(gameState));
      const res = isHS
        ? Engine.applyPlay(cloned, 0, isPass ? [] : ids, "")
        : Engine.applyPlay(cloned, 0, ids[0], "");
      if (!res.ok) {
        flashToast(isHS ? "所选牌型不合法或压不过上家" : "请按领出花色跟牌");
        return;
      }
      setSelectedCardIds([]);
      setHintCursor(0);
      setTableChat((prev) => [
        ...prev.slice(-45),
        { id: `u_p_${Date.now()}`, sender: meSeat.name, text: `（${cloned.seats[0].lastActionText || "出牌"}）`, isMe: true }
      ]);
      if (cloned.stage === "finished" && typeof onSaveRecord === "function") {
        onSaveRecord({
          mode,
          handNumber: cloned.handNumber,
          resultTitle: cloned.resultTitle,
          resultSummary: cloned.resultSummary,
          players: cloned.seats.map((s) => ({ name: s.name, chips: s.chips }))
        });
      }
      setGameState(cloned);
    };

    const handleNextHand = () => {
      tokenRef.current += 1;
      const nextSeatsMeta = gameState.seats.map((s) => ({
        ...s,
        chips: s.chips <= 0 ? startingChips : s.chips
      }));
      const nextHandNum = (gameState.handNumber || 1) + 1;
      const fresh = Engine.createGameState({ seatsMeta: nextSeatsMeta, handNumber: nextHandNum });
      setSelectedCardIds([]);
      setHintCursor(0);
      setBubblesBySeat({});
      setTableChat((prev) => [
        ...prev.slice(-30),
        { id: `sys_n_${Date.now()}`, sender: "荷官", text: `第 ${nextHandNum} 局「${isHS ? "红十" : "打娘娘"}」重新发牌！`, isSys: true }
      ]);
      setGameState(fresh);
    };

    const handleSendBanter = () => {
      const txt = chatInput.trim();
      if (!txt) return;
      setTableChat((prev) => [...prev.slice(-45), { id: `b_${Date.now()}`, sender: meSeat.name, text: txt, isMe: true }]);
      setChatInput("");
    };

    // 4 人手机竖屏座位：seat 1(左) / seat 2(顶对家) / seat 3(右)
    const seatCoords = [
      { left: "16%", top: "24%" }, // seat 1
      { left: "50%", top: "2%" },  // seat 2 (对家)
      { left: "84%", top: "24%" }  // seat 3
    ];

    // 双排错落手牌切分（上排最多 7 张，下排最多 6 张，手机端手指绝不误触）
    const myHand = meSeat.hand || [];
    const splitAt = Math.ceil(myHand.length / 2);
    const rowTop = myHand.slice(0, splitAt);
    const rowBottom = myHand.slice(splitAt);
    const overlapFor = (len) => (len >= 7 ? -6 : len >= 6 ? -3 : 3);

    const canPassNow = isHS && isMyTurn && gameState.stage === "playing" && gameState.currentTrick && gameState.currentTrick.leaderSeat !== 0;

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99990,
          background: "#F6F7FC",
          color: "#1E293B",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          userSelect: "none"
        }
      },
      // 顶栏
      h(
        "div",
        {
          style: {
            padding: "calc(8px + env(safe-area-inset-top, 0px)) 12px 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("button", { type: "button", onClick: () => { tokenRef.current += 1; onBackToLobby(); }, style: { border: "none", background: "#FFFFFF", color: "#475569", borderRadius: "10px", padding: "5px 9px", fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,0.05)", cursor: "pointer" } }, "←"),
          h(
            "div",
            null,
            h("div", { style: { fontSize: "13px", fontWeight: 800, color: "#312E81" } }, `${isHS ? "🔟 红十" : "👑 打娘娘"} · #${gameState.handNumber}`),
            h("div", { style: { fontSize: "10.5px", color: "#7C6BF0", fontWeight: 700 } },
              isHS
                ? `倍率 ×${gameState.multiplier} · ${meSeat.team === "red10" ? (gameState.isSoloRed10 ? "🔥独打红十" : "🔴红十方") : "🛡️平民方"}`
                : `第 ${gameState.trickNumber}/13 墩 · 本局分 ${meSeat.roundScore >= 0 ? "+" : ""}${meSeat.roundScore}`
            )
          )
        ),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "6px" } },
          h("button", { type: "button", onClick: () => setShowChatDrawer((v) => !v), style: { border: "none", background: showChatDrawer ? "#7C6BF0" : "#FFFFFF", color: showChatDrawer ? "#FFF" : "#6D5CE7", borderRadius: "999px", padding: "5px 10px", fontSize: "12px", fontWeight: 700, boxShadow: "0 2px 6px rgba(0,0,0,0.06)", cursor: "pointer" } }, `💬 ${tableChat.length}`),
          h("button", { type: "button", onClick: () => setShowRulesHelp(true), style: { border: "none", background: "#FFFFFF", color: "#6D5CE7", borderRadius: "50%", width: "28px", height: "28px", fontWeight: 800, boxShadow: "0 2px 6px rgba(0,0,0,0.06)", cursor: "pointer" } }, "?")
        )
      ),

      toast &&
      h("div", { style: { position: "fixed", top: "54px", left: "50%", transform: "translateX(-50%)", zIndex: 99998, background: "#312E81", color: "#FFF", padding: "5px 12px", borderRadius: "999px", fontSize: "11.5px", fontWeight: 700 } }, toast),

      // 中上部：椭圆柔白紫晶牌桌 + 3 位名士环绕
      h(
        "div",
        { style: { flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px" } },
        // 桌面本体
        h(
          "div",
          {
            style: {
              width: "76%",
              height: "62%",
              maxWidth: "310px",
              maxHeight: "260px",
              borderRadius: "110px",
              background: "radial-gradient(circle at 50% 40%, #F4F5FF 0%, #E8EBFE 100%)",
              border: "5px solid #FFFFFF",
              boxShadow: "0 14px 34px rgba(124, 107, 240, 0.14), inset 0 2px 10px rgba(124, 107, 240, 0.08)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px",
              boxSizing: "border-box",
              marginTop: "28px"
            }
          },
          // 桌心内容：红十展示当前压牌组；打娘娘展示本墩落牌
          isHS
            ? (gameState.currentTrick && gameState.currentTrick.cards && gameState.currentTrick.cards.length
              ? h(
                React.Fragment,
                null,
                h("div", { style: { fontSize: "11px", fontWeight: 800, color: "#5B21B6", background: "#FFFFFF", padding: "2px 10px", borderRadius: "999px" } },
                  `${gameState.seats[gameState.currentTrick.lastPlaySeat].name} · ${gameState.currentTrick.play.label}`
                ),
                h(
                  "div",
                  { style: { display: "flex", gap: "4px", justifyContent: "center" } },
                  gameState.currentTrick.cards.map((c) => h(React.Fragment, { key: c.id }, renderLocalCard(h, c, { mode, size: "md" })))
                )
              )
              : h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#6D5CE7", textAlign: "center" } },
                gameState.stage === "reveal" ? "🔥 明暗红十抉择中…" : "✨ 牌桌已清，自由领出"
              ))
            : h(
              React.Fragment,
              null,
              h("div", { style: { fontSize: "10.5px", fontWeight: 800, color: "#5B21B6", background: "#FFFFFF", padding: "2px 10px", borderRadius: "999px" } },
                gameState.currentTrick.leadSuit
                  ? `本墩领花：${Engine.SUIT_SYMBOL[gameState.currentTrick.leadSuit]}`
                  : (gameState.lastTrickSummary ? gameState.lastTrickSummary.note : `第 ${gameState.trickNumber} 墩 · 请领出`)
              ),
              h(
                "div",
                { style: { display: "flex", gap: "6px", justifyContent: "center", alignItems: "center", minHeight: "56px" } },
                (gameState.currentTrick.plays.length
                  ? gameState.currentTrick.plays
                  : (gameState.lastTrickSummary ? gameState.lastTrickSummary.plays : [])
                ).map((p) =>
                  h(
                    "div",
                    { key: `${p.seatIdx}_${p.card.id}`, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", opacity: gameState.currentTrick.plays.length ? 1 : 0.65 } },
                    renderLocalCard(h, p.card, { mode, size: "sm" }),
                    h("span", { style: { fontSize: "9px", fontWeight: 700, color: "#475569" } }, gameState.seats[p.seatIdx].name.slice(0, 3))
                  )
                )
              )
            )
        ),

        // 3 位名士座位
        gameState.seats.slice(1).map((s, i) => {
          const seatIdx = i + 1;
          const pos = seatCoords[i];
          const isTurn = gameState.stage !== "finished" && gameState.currentSeat === seatIdx;
          const av = resolvedAvatars[s.id] || (isRenderableUrl(s.avatar) ? s.avatar : "");
          const bubble = bubblesBySeat[s.id];

          const specialBadges = [];
          if (isHS) {
            if (s.revealedRed10) specialBadges.push("🔴10");
            if (s.finishRank > 0) specialBadges.push(["🥇头游", "🥈二游", "🥉三游", "末游"][s.finishRank - 1]);
          } else {
            const hasSQ = s.capturedCards.some((c) => Engine.isSpadeQueen(c));
            const hasDJ = s.capturedCards.some((c) => Engine.isDiamondJack(c));
            const hasC10 = s.capturedCards.some((c) => Engine.isClubTen(c));
            const hCnt = s.capturedCards.filter((c) => c.suit === "hearts").length;
            if (hasSQ) specialBadges.push("♠Q");
            if (hasDJ) specialBadges.push("♦J");
            if (hasC10) specialBadges.push("×2");
            if (hCnt > 0) specialBadges.push(`♥${hCnt}`);
          }

          return h(
            "div",
            {
              key: s.id,
              style: {
                position: "absolute",
                left: pos.left,
                top: pos.top,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                zIndex: isTurn ? 9 : 5,
                maxWidth: "112px"
              }
            },
            bubble &&
            h(
              "div",
              {
                style: {
                  background: "#FFFFFF",
                  color: "#334155",
                  fontSize: "10px",
                  lineHeight: 1.35,
                  padding: "4px 7px",
                  borderRadius: "10px",
                  boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
                  border: "1px solid #E2E8F0",
                  maxWidth: "120px",
                  textAlign: "center",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden"
                }
              },
              bubble
            ),
            h(
              "div",
              {
                style: {
                  background: "#FFFFFF",
                  borderRadius: "999px",
                  padding: "3px 8px 3px 3px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  border: isTurn ? "2px solid #7C6BF0" : "1.5px solid #ECEEFE",
                  boxShadow: isTurn ? "0 0 0 3px rgba(124,107,240,0.22)" : "0 4px 10px rgba(15,23,42,0.06)"
                }
              },
              av
                ? h("img", { src: av, alt: s.name, style: { width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                : h("div", { style: { width: "28px", height: "28px", borderRadius: "50%", background: "#C7D2FE", color: "#3730A3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 800, flexShrink: 0 } }, s.name.slice(0, 1)),
              h(
                "div",
                { style: { minWidth: 0 } },
                h("div", { style: { fontSize: "11px", fontWeight: 800, color: "#1E293B", whiteSpace: "nowrap" } }, s.name),
                h("div", { style: { fontSize: "10px", color: "#7C6BF0", fontWeight: 700 } }, isHS ? `🃏${s.hand.length}` : `🃏${s.hand.length} · ${s.roundScore >= 0 ? "+" : ""}${s.roundScore}`)
              )
            ),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "3px" } },
              specialBadges.map((b, bi) =>
                h("span", { key: bi, style: { fontSize: "9px", fontWeight: 800, padding: "1px 5px", borderRadius: "999px", background: b === "♠Q" ? "#1E293B" : "#FFE4E6", color: b === "♠Q" ? "#FDE047" : "#BE123C" } }, b)
              ),
              s.lastActionText &&
              h("span", { style: { fontSize: "9.5px", fontWeight: 700, padding: "1px 6px", borderRadius: "999px", background: "#EDE9FE", color: "#5B21B6", whiteSpace: "nowrap" } }, s.lastActionText)
            )
          );
        })
      ),

      // 回合提示胶囊
      h(
        "div",
        { style: { display: "flex", justifyContent: "center", padding: "2px 12px 4px", flexShrink: 0 } },
        h(
          "div",
          {
            style: {
              background: "#FFFFFF",
              borderRadius: "999px",
              padding: "5px 14px",
              boxShadow: "0 4px 12px rgba(124, 107, 240, 0.14)",
              fontSize: "12px",
              fontWeight: 800,
              color: "#312E81",
              textAlign: "center"
            }
          },
          gameState.stage === "finished"
            ? `${gameState.resultTitle}（${gameState.resultSummary}）`
            : isMyRevealTurn
              ? "🔥 你摸到了红十！选择「亮红十」或「暗藏」"
              : isMyTurn
                ? (isHS ? "✨ 轮到你出牌（可多选或点 💡 提示）" : `✨ 轮到你出牌（${gameState.currentTrick.leadSuit ? `须跟 ${Engine.SUIT_SYMBOL[gameState.currentTrick.leadSuit]}` : "你先手领出"}）`)
                : `${gameState.seats[thinkingSeat >= 0 ? thinkingSeat : gameState.currentSeat]?.name || "名士"} 正在思索出牌…`
        )
      ),

      // 底部：手机端双排 13 张大牌面托盘 + 极简行动条
      h(
        "div",
        {
          style: {
            background: "#FFFFFF",
            borderTop: "1px solid #ECEEFE",
            borderRadius: "20px 20px 0 0",
            padding: "10px 10px calc(10px + env(safe-area-inset-bottom, 0px))",
            boxShadow: "0 -6px 22px rgba(124, 107, 240, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            flexShrink: 0
          }
        },
        // 双排错落手牌区
        myHand.length > 0 &&
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingTop: "6px" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "center", alignItems: "flex-end" } },
            rowTop.map((c, idx) =>
              h(
                React.Fragment,
                { key: c.id },
                renderLocalCard(h, c, {
                  mode,
                  size: "hand",
                  selected: selectedCardIds.includes(c.id),
                  disabled: !isHS && isMyTurn && legalCardIdSet && !legalCardIdSet.has(c.id),
                  overlapLeft: idx === 0 ? 0 : overlapFor(rowTop.length),
                  onClick: () => handleToggleCard(c.id)
                })
              )
            )
          ),
          rowBottom.length > 0 &&
          h(
            "div",
            { style: { display: "flex", justifyContent: "center", alignItems: "flex-end" } },
            rowBottom.map((c, idx) =>
              h(
                React.Fragment,
                { key: c.id },
                renderLocalCard(h, c, {
                  mode,
                  size: "hand",
                  selected: selectedCardIds.includes(c.id),
                  disabled: !isHS && isMyTurn && legalCardIdSet && !legalCardIdSet.has(c.id),
                  overlapLeft: idx === 0 ? 0 : overlapFor(rowBottom.length),
                  onClick: () => handleToggleCard(c.id)
                })
              )
            )
          )
        ),

        // 行动按钮栏
        gameState.stage === "finished"
          ? h(
            "div",
            { style: { display: "flex", gap: "8px" } },
            h("button", { type: "button", onClick: handleNextHand, style: { flex: 1.5, padding: "11px", borderRadius: "999px", border: "none", background: "linear-gradient(135deg, #8B7CF6 0%, #6D5CE7 100%)", color: "#FFF", fontSize: "14px", fontWeight: 800, cursor: "pointer" } }, "🃏 再来一局"),
            h("button", { type: "button", onClick: () => onShareSummary && onShareSummary(`🃏 刚在「傩·扑克·${isHS ? "红十" : "打娘娘"}」打完第 ${gameState.handNumber} 局：${gameState.resultTitle}（${gameState.resultSummary}）`), style: { flex: 1, padding: "11px", borderRadius: "999px", border: "1.5px solid #DDD6FE", background: "#F5F3FF", color: "#6D28D9", fontSize: "13px", fontWeight: 800, cursor: "pointer" } }, "✉️ 发战报")
          )
          : isMyRevealTurn
            ? h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h("button", { type: "button", onClick: () => handleUserReveal(true), style: { flex: 1, padding: "11px", borderRadius: "999px", border: "none", background: "linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)", color: "#FFF", fontSize: "13.5px", fontWeight: 800, cursor: "pointer" } }, "🔥 亮红十 (×2)"),
              h("button", { type: "button", onClick: () => handleUserReveal(false), style: { flex: 1, padding: "11px", borderRadius: "999px", border: "1.5px solid #DDD6FE", background: "#F5F3FF", color: "#5B21B6", fontSize: "13.5px", fontWeight: 800, cursor: "pointer" } }, "🎭 暗藏试探")
            )
            : h(
              "div",
              { style: { display: "flex", gap: "7px", alignItems: "center" } },
              h("button", { type: "button", disabled: !isMyTurn, onClick: handleHint, style: { padding: "10px 12px", borderRadius: "999px", border: "1px solid #DDD6FE", background: "#F5F3FF", color: "#6D28D9", fontSize: "13px", fontWeight: 800, cursor: isMyTurn ? "pointer" : "not-allowed", opacity: isMyTurn ? 1 : 0.45 } }, "💡 提示"),
              isHS &&
              h("button", { type: "button", disabled: !canPassNow, onClick: () => handleUserPlay([], true), style: { flex: 0.9, padding: "10px", borderRadius: "999px", border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", fontSize: "13px", fontWeight: 800, cursor: canPassNow ? "pointer" : "not-allowed", opacity: canPassNow ? 1 : 0.45 } }, "不要"),
              h("button", { type: "button", disabled: !canSubmitSelection, onClick: () => handleUserPlay(), style: { flex: 1.4, padding: "10px", borderRadius: "999px", border: "none", background: canSubmitSelection ? "linear-gradient(135deg, #8B7CF6 0%, #6D5CE7 100%)" : "#E2E8F0", color: canSubmitSelection ? "#FFF" : "#94A3B8", fontSize: "14px", fontWeight: 800, cursor: canSubmitSelection ? "pointer" : "not-allowed" } }, "出牌"),
              h("button", { type: "button", onClick: () => setShowChatDrawer(true), style: { padding: "10px 11px", borderRadius: "999px", border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontSize: "13px", fontWeight: 700, cursor: "pointer" } }, "💬")
            )
      ),

      // 牌桌群聊抽屉
      showChatDrawer &&
      h(
        "div",
        {
          onClick: (e) => { if (e.target === e.currentTarget) setShowChatDrawer(false); },
          style: { position: "fixed", inset: 0, zIndex: 99995, background: "rgba(15,23,42,0.35)", display: "flex", alignItems: "flex-end" }
        },
        h(
          "div",
          { style: { width: "100%", height: "54%", background: "#FFFFFF", borderRadius: "20px 20px 0 0", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: "13.5px", color: "#312E81" } },
            h("span", null, "💬 牌桌闲聊（全桌名士实时听见）"),
            h("button", { type: "button", onClick: () => setShowChatDrawer(false), style: { border: "none", background: "#F1F5F9", borderRadius: "999px", padding: "4px 10px", fontSize: "12px", cursor: "pointer" } }, "收起")
          ),
          h(
            "div",
            { style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" } },
            tableChat.map((m) =>
              h(
                "div",
                {
                  key: m.id,
                  style: {
                    alignSelf: m.isSys ? "center" : m.isMe ? "flex-end" : "flex-start",
                    background: m.isSys ? "#F1F5F9" : m.isMe ? "#7C6BF0" : "#F5F3FF",
                    color: m.isSys ? "#64748B" : m.isMe ? "#FFFFFF" : "#312E81",
                    padding: "6px 10px",
                    borderRadius: "12px",
                    maxWidth: "85%"
                  }
                },
                !m.isSys && h("strong", { style: { marginRight: "5px" } }, `${m.sender}：`),
                m.text
              )
            )
          ),
          h(
            "div",
            { style: { display: "flex", gap: "6px" } },
            h("input", {
              type: "text",
              value: chatInput,
              onChange: (e) => setChatInput(e.target.value),
              onKeyDown: (e) => e.key === "Enter" && handleSendBanter(),
              placeholder: isHS ? "试探谁是红十队友或放狠话…" : "调侃谁要吃黑桃娘娘…",
              style: { flex: 1, border: "1px solid #E2E8F0", borderRadius: "999px", padding: "7px 12px", fontSize: "12.5px", outline: "none" }
            }),
            h("button", { type: "button", onClick: handleSendBanter, style: { border: "none", borderRadius: "999px", background: "#7C6BF0", color: "#FFF", padding: "7px 14px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" } }, "发送")
          )
        )
      ),

      // ? 模式专属速查规则弹窗
      showRulesHelp &&
      h(
        "div",
        {
          onClick: (e) => { if (e.target === e.currentTarget) setShowRulesHelp(false); },
          style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
        },
        h(
          "div",
          { style: { width: "100%", maxWidth: "330px", background: "#FFFFFF", borderRadius: "18px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", color: "#334155" } },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: "14px", color: "#312E81" } },
            h("span", null, isHS ? "🔟 红十速查规则" : "👑 打娘娘速查规则"),
            h("button", { type: "button", onClick: () => setShowRulesHelp(false), style: { border: "none", background: "#F1F5F9", borderRadius: "50%", width: "24px", height: "24px", cursor: "pointer" } }, "✕")
          ),
          isHS
            ? h("div", { style: { background: "#F6F7FC", borderRadius: "12px", padding: "10px", lineHeight: 1.75 } },
              "• 4人52张，持 ♥10 / ♦10 为红十方（独揽双红十为 1v3 独打），其余为平民方。\n• 牌点：红十 > 2 > A > K > Q > J > 黑10 > 9…3。\n• 牌型：双红十(♥10♦10)全场最大 > 四张炸弹 > 三张/对子/单张。\n• 亮红十积分 ×2；包揽头二游为双抓大胜！"
            )
            : h("div", { style: { background: "#F6F7FC", borderRadius: "12px", padding: "10px", lineHeight: 1.75 } },
              "• 4人52张共打13墩，必须跟领出花色，同花色最大吃墩；断门可任意甩牌！\n• ♠Q 黑桃娘娘：-100分（快甩给别人！）\n• ♦J 御前侍卫：+100分（趁机抢下！）\n• ♣10 翻倍令：本局自身分值 ×2（单吃+50）\n• 红桃 A~5 共 -200分；独吃全红桃+♠Q触发「凤仪天下」+300反杀！"
            )
        )
      )
    );
  }

  global.NuoPokerLocalTable = LocalPokerTable;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { LocalPokerTable, requestLocalAiDecision };
  }
})(typeof window !== "undefined" ? window : globalThis);

