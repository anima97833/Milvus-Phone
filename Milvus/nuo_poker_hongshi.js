/**
 * Milvus/nuo_poker_hongshi.js
 * 「傩·扑克 2.0」4人标准「红十」100% 确定性规则与状态机引擎
 * - 52 张标准扑克（无大小王）Fisher-Yates 洗牌，4 人整发每人 13 张
 * - 阵营判定：持 ♥10 / ♦10 为红十方（单人双红十自动进入「独打 1v3」），其余为平民方
 * - 明暗红十阶段：亮红十公开阵营且结算翻倍；暗红十出牌时自动亮明身份
 * - 完整牌型：单张 / 对子 / 三张 / 四张炸弹 / 双红十王炸（♥10+♦10 全场最大）
 * - 严格合法出牌穷举 enumerateLegalPlays + 接风轮转 + 游次结算 + 信息隔离 buildSeatView + MBTI 兜底
 */
(function (global) {
  "use strict";

  const SUITS = ["spades", "hearts", "diamonds", "clubs"];
  const SUIT_SYMBOL = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
  const RANK_LABEL = {
    2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8",
    9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A"
  };

  function isRedTen(card) {
    return !!card && card.rank === 10 && (card.suit === "hearts" || card.suit === "diamonds");
  }

  /**
   * 红十牌点权重：
   * 3(3) < 4(4) < ... < 9(9) < 黑10(10) < J(11) < Q(12) < K(13) < A(14) < 2(15) < 红10(16)
   */
  function getCardPower(card) {
    if (!card) return 0;
    if (isRedTen(card)) return 16;
    if (card.rank === 2) return 15;
    return card.rank; // 3..14 (black 10 = 10)
  }

  function formatCard(card) {
    if (!card) return "??";
    return `${RANK_LABEL[card.rank] || card.rank}${SUIT_SYMBOL[card.suit] || ""}`;
  }

  function sortHandDesc(cards) {
    const suitOrder = { hearts: 4, diamonds: 3, spades: 2, clubs: 1 };
    return (cards || []).slice().sort((a, b) => {
      const pa = getCardPower(a);
      const pb = getCardPower(b);
      if (pb !== pa) return pb - pa;
      return (suitOrder[b.suit] || 0) - (suitOrder[a.suit] || 0);
    });
  }

  function createShuffledDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let rank = 2; rank <= 14; rank++) {
        deck.push({ rank, suit, id: `${rank}_${suit}` });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    return deck;
  }

  // ==========================================
  // 1. 牌型识别与比大
  // ==========================================
  function classifyPlay(cards) {
    if (!Array.isArray(cards) || cards.length === 0) return null;
    const n = cards.length;
    const powers = cards.map(getCardPower);
    const allSamePower = powers.every((p) => p === powers[0]);

    if (n === 1) {
      return {
        type: "single",
        power: powers[0],
        count: 1,
        label: `单张 ${formatCard(cards[0])}`
      };
    }
    if (n === 2) {
      if (isRedTen(cards[0]) && isRedTen(cards[1])) {
        return {
          type: "double_red10",
          power: 100,
          count: 2,
          label: "双红十王炸 (♥10♦10)"
        };
      }
      if (allSamePower && !isRedTen(cards[0])) {
        return {
          type: "pair",
          power: powers[0],
          count: 2,
          label: `对${RANK_LABEL[cards[0].rank] || cards[0].rank}`
        };
      }
      return null;
    }
    if (n === 3 && allSamePower && !isRedTen(cards[0])) {
      return {
        type: "triple",
        power: powers[0],
        count: 3,
        label: `三张${RANK_LABEL[cards[0].rank] || cards[0].rank}`
      };
    }
    if (n === 4 && allSamePower && !isRedTen(cards[0])) {
      return {
        type: "bomb",
        power: powers[0],
        count: 4,
        label: `炸弹 ${RANK_LABEL[cards[0].rank] || cards[0].rank}×4`
      };
    }
    return null;
  }

  function canBeat(play, currentPlay) {
    if (!play) return false;
    if (!currentPlay) return true;
    if (play.type === "double_red10") return true;
    if (currentPlay.type === "double_red10") return false;
    if (play.type === "bomb") {
      if (currentPlay.type !== "bomb") return true;
      return play.power > currentPlay.power;
    }
    if (currentPlay.type === "bomb") return false;
    return play.type === currentPlay.type && play.power > currentPlay.power;
  }

  // ==========================================
  // 2. 合法出牌穷举与提示器
  // ==========================================
  function groupByPower(hand) {
    const map = new Map();
    for (const c of hand) {
      const p = getCardPower(c);
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(c);
    }
    return map;
  }

  function enumerateAllLegalPlays(state, seatIdx) {
    const seat = state.seats[seatIdx];
    if (!seat || seat.finished || !seat.hand.length) return [];
    const hand = sortHandDesc(seat.hand);
    const groups = groupByPower(hand);
    const powersAsc = Array.from(groups.keys()).sort((a, b) => a - b);
    const currentPlay = state.currentTrick ? state.currentTrick.play : null;
    const isLeading = !currentPlay || state.currentTrick.leaderSeat === seatIdx;

    const results = [];
    const pushIfValid = (cards) => {
      const info = classifyPlay(cards);
      if (!info) return;
      if (isLeading || canBeat(info, currentPlay)) {
        results.push({
          isPass: false,
          type: info.type,
          power: info.power,
          label: info.label,
          cardIds: cards.map((c) => c.id),
          cards: cards.slice()
        });
      }
    };

    // 单张（同点数只需一个代表；红十按具体花色列出）
    for (const p of powersAsc) {
      const grp = groups.get(p);
      pushIfValid([grp[grp.length - 1]]);
    }
    // 对子
    for (const p of powersAsc) {
      const grp = groups.get(p);
      if (grp.length >= 2 && p !== 16) {
        pushIfValid(grp.slice(0, 2));
      }
    }
    // 三张
    for (const p of powersAsc) {
      const grp = groups.get(p);
      if (grp.length >= 3 && p !== 16) {
        pushIfValid(grp.slice(0, 3));
      }
    }
    // 四张炸弹
    for (const p of powersAsc) {
      const grp = groups.get(p);
      if (grp.length === 4) {
        pushIfValid(grp.slice(0, 4));
      }
    }
    // 双红十王炸
    const red10s = groups.get(16);
    if (red10s && red10s.length === 2) {
      pushIfValid(red10s.slice(0, 2));
    }

    // 排序：领出时优先小牌/多张顺出；跟牌时优先最小压牌，炸弹放后
    results.sort((a, b) => {
      const bombRank = (t) => (t === "double_red10" ? 3 : t === "bomb" ? 2 : 1);
      if (bombRank(a.type) !== bombRank(b.type)) return bombRank(a.type) - bombRank(b.type);
      if (isLeading) {
        // 领出优先三张/对子/小单张
        const typeOrder = { triple: 0, pair: 1, single: 2, bomb: 3, double_red10: 4 };
        if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
      }
      return a.power - b.power;
    });

    if (!isLeading) {
      results.push({
        isPass: true,
        type: "pass",
        power: 0,
        label: "不要（过牌）",
        cardIds: [],
        cards: []
      });
    }
    return results;
  }

  /**
   * 供 LLM 决策的精简候选列表（最多 maxCandidates 项，保证含「不要」和关键大牌）
   */
  function enumerateLegalPlays(state, seatIdx, maxCandidates = 10) {
    const all = enumerateAllLegalPlays(state, seatIdx);
    if (all.length <= maxCandidates) return all;
    const nonPass = all.filter((x) => !x.isPass);
    const passOpt = all.find((x) => x.isPass);
    const keepHead = Math.max(4, maxCandidates - (passOpt ? 3 : 2));
    const head = nonPass.slice(0, keepHead);
    const tail = nonPass.slice(-2).filter((x) => !head.includes(x));
    const merged = [...head, ...tail];
    if (passOpt) merged.push(passOpt);
    return merged.slice(0, maxCandidates);
  }

  // ==========================================
  // 3. 牌局初始化与状态机
  // ==========================================
  function createGameState({
    seatsMeta = [],
    handNumber = 1
  } = {}) {
    if (!Array.isArray(seatsMeta) || seatsMeta.length !== 4) {
      throw new Error("红十固定为 4 人牌局");
    }
    const deck = createShuffledDeck();
    const seats = seatsMeta.map((m, idx) => {
      const hand = sortHandDesc(deck.slice(idx * 13, (idx + 1) * 13));
      const redTenCards = hand.filter(isRedTen);
      return {
        seatIdx: idx,
        id: m.id,
        name: m.name,
        isUser: !!m.isUser,
        avatar: m.avatar || "",
        chips: typeof m.chips === "number" ? m.chips : 2000,
        mbti: m.mbti || "",
        personaPrompt: m.personaPrompt || "",
        hand,
        redTenCount: redTenCards.length,
        team: redTenCards.length > 0 ? "red10" : "civilian",
        revealedRed10: false,
        revealDecided: redTenCards.length === 0,
        finished: false,
        finishRank: 0,
        lastActionText: "",
        lastTalk: "",
        passedCurrentTrick: false
      };
    });

    const red10Seats = seats.filter((s) => s.team === "red10").map((s) => s.seatIdx);
    const isSoloRed10 = red10Seats.length === 1;

    // 持 ♣3 者先手
    let firstLeadSeat = 0;
    for (const s of seats) {
      if (s.hand.some((c) => c.rank === 3 && c.suit === "clubs")) {
        firstLeadSeat = s.seatIdx;
        break;
      }
    }

    const firstPendingReveal = seats.findIndex((s) => !s.revealDecided);

    return {
      mode: "hongshi",
      handNumber,
      stage: firstPendingReveal >= 0 ? "reveal" : "playing", // reveal | playing | finished
      seats,
      red10Seats,
      isSoloRed10,
      multiplier: 1,
      firstLeadSeat,
      currentSeat: firstPendingReveal >= 0 ? firstPendingReveal : firstLeadSeat,
      currentTrick: null, // { leaderSeat, lastPlaySeat, play, cards, passCount }
      finishOrder: [],
      turnCount: 0,
      winnerTeam: null,
      resultTitle: "",
      resultSummary: "",
      chipDeltas: [0, 0, 0, 0],
      actionLog: [
        `第 ${handNumber} 局红十发牌完毕（每人 13 张），持 ♣3 的 ${seats[firstLeadSeat].name} 将先手出牌。`
      ]
    };
  }

  function applyRevealChoice(state, seatIdx, reveal) {
    if (state.stage !== "reveal") return state;
    const seat = state.seats[seatIdx];
    if (!seat || seat.revealDecided) return state;

    seat.revealDecided = true;
    if (reveal && seat.redTenCount > 0) {
      seat.revealedRed10 = true;
      state.multiplier = Math.min(4, state.multiplier * 2);
      seat.lastActionText = seat.redTenCount === 2 ? "🔥 亮双红十！" : "🔥 亮红十！";
      state.actionLog.push(`${seat.name} 选择亮出红十（本局倍率 ×${state.multiplier}）！`);
    } else {
      seat.lastActionText = "🎭 暗藏";
    }

    const nextPending = state.seats.findIndex((s) => !s.revealDecided);
    if (nextPending >= 0) {
      state.currentSeat = nextPending;
    } else {
      state.stage = "playing";
      state.currentSeat = state.firstLeadSeat;
      state.actionLog.push(`明暗已定，由 ${state.seats[state.firstLeadSeat].name} 先手出牌。`);
    }
    return state;
  }

  function findNextActiveSeat(state, fromIdx) {
    for (let step = 1; step <= 4; step++) {
      const idx = (fromIdx + step) % 4;
      if (!state.seats[idx].finished) return idx;
    }
    return -1;
  }

  function checkAndFinalizeIfOver(state) {
    const activeSeats = state.seats.filter((s) => !s.finished);
    const red10Remaining = activeSeats.filter((s) => s.team === "red10").length;
    const civRemaining = activeSeats.filter((s) => s.team === "civilian").length;

    if (red10Remaining > 0 && civRemaining > 0 && activeSeats.length > 1) {
      return false;
    }

    // 把尚未跑完的按剩余手牌少→多排入末游
    const rest = activeSeats.slice().sort((a, b) => a.hand.length - b.hand.length);
    for (const s of rest) {
      if (!state.finishOrder.includes(s.seatIdx)) {
        state.finishOrder.push(s.seatIdx);
        s.finishRank = state.finishOrder.length;
      }
    }

    // 结算全部公开身份
    for (const s of state.seats) {
      if (s.team === "red10") s.revealedRed10 = true;
    }

    const firstSeat = state.seats[state.finishOrder[0]];
    const secondSeat = state.seats[state.finishOrder[1]];
    const mult = state.multiplier || 1;
    const deltas = [0, 0, 0, 0];

    if (state.isSoloRed10) {
      const soloIdx = state.red10Seats[0];
      if (firstSeat.seatIdx === soloIdx) {
        state.winnerTeam = "red10";
        state.resultTitle = `🔥 ${firstSeat.name} 独打双红十封神！`;
        const win = 600 * mult;
        deltas[soloIdx] = win;
        for (let i = 0; i < 4; i++) if (i !== soloIdx) deltas[i] = -Math.round(win / 3);
      } else {
        state.winnerTeam = "civilian";
        state.resultTitle = `🛡️ 众名士围剿双红十成功！`;
        const loss = 450 * mult;
        deltas[soloIdx] = -loss;
        for (let i = 0; i < 4; i++) if (i !== soloIdx) deltas[i] = Math.round(loss / 3);
      }
    } else {
      if (firstSeat.team === "red10" && secondSeat.team === "red10") {
        state.winnerTeam = "red10";
        state.resultTitle = "🔴 红十方包揽头二游 · 双抓大胜！";
        for (const s of state.seats) deltas[s.seatIdx] = s.team === "red10" ? 400 * mult : -400 * mult;
      } else if (firstSeat.team === "civilian" && secondSeat.team === "civilian") {
        state.winnerTeam = "civilian";
        state.resultTitle = "🛡️ 平民方包揽头二游 · 反杀成功！";
        for (const s of state.seats) deltas[s.seatIdx] = s.team === "civilian" ? 400 * mult : -400 * mult;
      } else if (firstSeat.team === "red10") {
        state.winnerTeam = "red10";
        state.resultTitle = `🔴 红十方抢得头游 · 险胜（×${mult}）`;
        for (const s of state.seats) deltas[s.seatIdx] = s.team === "red10" ? 150 * mult : -150 * mult;
      } else {
        state.winnerTeam = "civilian";
        state.resultTitle = `🛡️ 平民方抢得头游 · 险胜（×${mult}）`;
        for (const s of state.seats) deltas[s.seatIdx] = s.team === "civilian" ? 150 * mult : -150 * mult;
      }
    }

    for (const s of state.seats) {
      s.chips = Math.max(0, s.chips + deltas[s.seatIdx]);
    }
    state.chipDeltas = deltas;
    state.stage = "finished";
    state.currentSeat = -1;
    const rankStr = state.finishOrder
      .map((idx, r) => `${["头游", "二游", "三游", "末游"][r]}:${state.seats[idx].name}`)
      .join(" · ");
    state.resultSummary = `${rankStr}`;
    state.actionLog.push(`${state.resultTitle}（${rankStr}）`);
    return true;
  }

  function applyPlay(state, seatIdx, cardIds = [], talk = "") {
    if (state.stage !== "playing" || state.currentSeat !== seatIdx) {
      return { ok: false, error: "NOT_YOUR_TURN", state };
    }
    const seat = state.seats[seatIdx];
    const isPass = !Array.isArray(cardIds) || cardIds.length === 0;
    const currentPlay = state.currentTrick ? state.currentTrick.play : null;
    const isLeading = !currentPlay || state.currentTrick.leaderSeat === seatIdx;

    if (talk) seat.lastTalk = talk;
    state.turnCount += 1;

    if (isPass) {
      if (isLeading) return { ok: false, error: "CANNOT_PASS_ON_LEAD", state };
      seat.lastActionText = "不要";
      seat.passedCurrentTrick = true;
      state.actionLog.push(`${seat.name}：不要`);

      // 检查是否除最后出牌者外，其余在局玩家都已不要
      const nextSeat = findNextActiveSeat(state, seatIdx);
      const leaderIdx = state.currentTrick.lastPlaySeat;
      const leaderSeat = state.seats[leaderIdx];

      const everyoneElsePassed = state.seats.every((s) => {
        if (s.finished || s.seatIdx === leaderIdx) return true;
        return s.passedCurrentTrick;
      });

      if (everyoneElsePassed) {
        for (const s of state.seats) s.passedCurrentTrick = false;
        state.currentTrick = null;
        if (!leaderSeat.finished) {
          state.currentSeat = leaderIdx;
        } else {
          // 接风：已暴露的队友优先，否则下家
          const teammate = state.seats.find(
            (s) => !s.finished && s.seatIdx !== leaderIdx && s.team === leaderSeat.team && s.revealedRed10
          );
          state.currentSeat = teammate ? teammate.seatIdx : findNextActiveSeat(state, leaderIdx);
          state.actionLog.push(`💨 ${state.seats[state.currentSeat].name} 接风领出！`);
        }
      } else {
        state.currentSeat = nextSeat;
      }
      return { ok: true, isPass: true, state };
    }

    // 校验所选牌均在手牌中
    const idSet = new Set(cardIds);
    const chosenCards = seat.hand.filter((c) => idSet.has(c.id));
    if (chosenCards.length !== cardIds.length) {
      return { ok: false, error: "CARD_NOT_IN_HAND", state };
    }
    const playInfo = classifyPlay(chosenCards);
    if (!playInfo || (!isLeading && !canBeat(playInfo, currentPlay))) {
      return { ok: false, error: "ILLEGAL_PLAY", state };
    }

    // 合法出牌：从手牌移除
    seat.hand = seat.hand.filter((c) => !idSet.has(c.id));
    for (const s of state.seats) s.passedCurrentTrick = false;

    // 暗红十打出红十时自动公开阵营
    const playedRedTen = chosenCards.some(isRedTen);
    if (playedRedTen && !seat.revealedRed10) {
      seat.revealedRed10 = true;
      state.actionLog.push(`🔴 ${seat.name} 打出红十，亮明红十方身份！`);
    }

    seat.lastActionText = playInfo.label;
    state.currentTrick = {
      leaderSeat: seatIdx,
      lastPlaySeat: seatIdx,
      play: playInfo,
      cards: sortHandDesc(chosenCards)
    };
    state.actionLog.push(`${seat.name} 出牌：${playInfo.label}`);

    // 检查跑牌
    if (seat.hand.length === 0) {
      seat.finished = true;
      state.finishOrder.push(seatIdx);
      seat.finishRank = state.finishOrder.length;
      const rankLabel = ["🥇 头游", "🥈 二游", "🥉 三游", "末游"][seat.finishRank - 1] || "跑完";
      seat.lastActionText = `${rankLabel}！`;
      state.actionLog.push(`🎉 ${seat.name} 出完手牌，夺得 ${rankLabel}！`);

      if (checkAndFinalizeIfOver(state)) {
        return { ok: true, isPass: false, playInfo, finished: true, state };
      }
    }

    // 轮到下一位仍在局的玩家
    state.currentSeat = findNextActiveSeat(state, seatIdx);
    return { ok: true, isPass: false, playInfo, state };
  }

  // ==========================================
  // 4. 严格信息隔离视图（AI 绝不偷看他人暗牌）
  // ==========================================
  function buildSeatView(state, seatIdx) {
    const me = state.seats[seatIdx];
    const currentPlay = state.currentTrick ? state.currentTrick.play : null;
    const isLeading = !currentPlay || state.currentTrick.leaderSeat === seatIdx;

    return {
      mode: "hongshi",
      stage: state.stage,
      handNumber: state.handNumber,
      multiplier: state.multiplier,
      isLeading,
      mySeat: {
        seatIdx: me.seatIdx,
        name: me.name,
        team: me.team,
        isSoloRed10: state.isSoloRed10 && me.team === "red10",
        revealedRed10: me.revealedRed10,
        handText: me.hand.map(formatCard).join(" "),
        cardCount: me.hand.length
      },
      tableTop: currentPlay
        ? {
            by: state.seats[state.currentTrick.lastPlaySeat].name,
            byTeamVisible: state.seats[state.currentTrick.lastPlaySeat].revealedRed10 ? "已明红十" : "身份未明",
            label: currentPlay.label,
            cardsText: state.currentTrick.cards.map(formatCard).join(" ")
          }
        : null,
      others: state.seats
        .filter((s) => s.seatIdx !== seatIdx)
        .map((s) => ({
          seatIdx: s.seatIdx,
          name: s.name,
          cardCount: s.hand.length,
          revealedRed10: s.revealedRed10,
          finished: s.finished,
          finishRank: s.finishRank,
          lastAction: s.lastActionText || "",
          lastTalk: s.lastTalk || ""
        }))
    };
  }

  // ==========================================
  // 5. 本地 MBTI 兜底策略 + 智能 LLM 节奏判断
  // ==========================================
  function decideLocalReveal(state, seatIdx) {
    const seat = state.seats[seatIdx];
    if (!seat || seat.redTenCount === 0) return { reveal: false, tableTalk: "" };
    const mbti = String(seat.mbti || "").toUpperCase();
    const aggressive = mbti.includes("E") || mbti.includes("T");
    const highCards = seat.hand.filter((c) => getCardPower(c) >= 14).length;
    const reveal = seat.redTenCount === 2 ? highCards >= 4 : (aggressive && highCards >= 4);
    return {
      reveal,
      tableTalk: reveal ? "红十在我手里，放马过来便是。" : "且先按兵不动，看看诸位底细。"
    };
  }

  function decideLocalFallbackPlay(state, seatIdx) {
    const seat = state.seats[seatIdx];
    const candidates = enumerateLegalPlays(state, seatIdx, 12);
    if (!candidates.length) {
      return { choiceIndex: 0, cardIds: [], isPass: true, tableTalk: "先过一手。" };
    }
    const currentPlay = state.currentTrick ? state.currentTrick.play : null;
    const isLeading = !currentPlay || state.currentTrick.leaderSeat === seatIdx;
    const nonPass = candidates.filter((c) => !c.isPass);
    const passIdx = candidates.findIndex((c) => c.isPass);

    if (isLeading) {
      // 尽量先出非炸弹的小牌；若只剩最后一手直接出完
      const finishPlay = nonPass.find((c) => c.cardIds.length === seat.hand.length);
      const chosen = finishPlay || nonPass[0] || candidates[0];
      const idx = candidates.indexOf(chosen);
      return {
        choiceIndex: idx,
        cardIds: chosen.cardIds,
        isPass: false,
        tableTalk: finishPlay ? "最后一手，告辞了。" : `我先出 ${chosen.label}。`
      };
    }

    // 跟牌：若队友已明且正在领牌且手牌少，优先让队友跑
    const leaderSeat = state.seats[state.currentTrick.lastPlaySeat];
    const isKnownTeammate =
      seat.team === "red10" && leaderSeat.team === "red10" && leaderSeat.revealedRed10;
    if (isKnownTeammate && leaderSeat.hand.length <= 4 && passIdx >= 0) {
      return {
        choiceIndex: passIdx,
        cardIds: [],
        isPass: true,
        tableTalk: "这手你先走，我替你压阵。"
      };
    }

    // 能一手跑完直接压
    const finishPlay = nonPass.find((c) => c.cardIds.length === seat.hand.length);
    if (finishPlay) {
      return {
        choiceIndex: candidates.indexOf(finishPlay),
        cardIds: finishPlay.cardIds,
        isPass: false,
        tableTalk: "承让，这局我先走一步。"
      };
    }

    // 非炸弹能压则压最小
    const normalBeat = nonPass.find((c) => c.type !== "bomb" && c.type !== "double_red10");
    if (normalBeat) {
      // 保留红十直到对手快跑完或关键压牌
      const usesRedTen = normalBeat.cards.some(isRedTen);
      const dangerOpp = state.seats.some((s) => s.seatIdx !== seatIdx && !s.finished && s.hand.length <= 4);
      if (!usesRedTen || dangerOpp || seat.hand.length <= 5) {
        return {
          choiceIndex: candidates.indexOf(normalBeat),
          cardIds: normalBeat.cardIds,
          isPass: false,
          tableTalk: usesRedTen ? "红十在此，谁敢再压？" : `压一手，${normalBeat.label}。`
        };
      }
    }

    // 对手快跑完时果断丢炸弹
    const dangerOpp = state.seats.some((s) => s.seatIdx !== seatIdx && !s.finished && s.hand.length <= 3);
    const bombPlay = nonPass.find((c) => c.type === "bomb" || c.type === "double_red10");
    if (bombPlay && (dangerOpp || seat.hand.length <= 4)) {
      return {
        choiceIndex: candidates.indexOf(bombPlay),
        cardIds: bombPlay.cardIds,
        isPass: false,
        tableTalk: bombPlay.type === "double_red10" ? "双红十王炸，全场安静！" : "炸了，别想轻易溜走！"
      };
    }

    if (passIdx >= 0) {
      return {
        choiceIndex: passIdx,
        cardIds: [],
        isPass: true,
        tableTalk: "不要，且让你先得意片刻。"
      };
    }
    return {
      choiceIndex: 0,
      cardIds: candidates[0].cardIds,
      isPass: candidates[0].isPass,
      tableTalk: `出 ${candidates[0].label}。`
    };
  }

  /**
   * 智能节奏分级：仅在关键回合/有实质选择时调用大模型，避免只能「不要」时白等
   */
  function shouldInvokeAi(state, seatIdx, candidates) {
    if (!candidates || candidates.length <= 1) return false;
    const seat = state.seats[seatIdx];
    const hasBomb = candidates.some((c) => c.type === "bomb" || c.type === "double_red10");
    const hasRedTen = candidates.some((c) => c.cards && c.cards.some(isRedTen));
    const isLeading = !state.currentTrick || state.currentTrick.leaderSeat === seatIdx;
    const endGame = seat.hand.length <= 5;
    if (hasBomb || hasRedTen || endGame || isLeading) return true;
    // 普通跟牌：每 2 步轮换调用一次 LLM 保持活人感对话
    return state.turnCount % 2 === 0;
  }

  const api = {
    SUITS,
    SUIT_SYMBOL,
    RANK_LABEL,
    isRedTen,
    getCardPower,
    formatCard,
    sortHandDesc,
    classifyPlay,
    canBeat,
    enumerateAllLegalPlays,
    enumerateLegalPlays,
    createGameState,
    applyRevealChoice,
    applyPlay,
    buildSeatView,
    decideLocalReveal,
    decideLocalFallbackPlay,
    shouldInvokeAi
  };

  global.NuoPokerHongShi = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

