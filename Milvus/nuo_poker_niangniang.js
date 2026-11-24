/**
 * Milvus/nuo_poker_niangniang.js
 * 「傩·扑克 2.0」4人本土「打娘娘」100% 确定性跟花吃墩规则引擎
 * - 52 张标准扑克 Fisher-Yates 洗牌，4 人整发每人 13 张，共打 13 墩
 * - 特色娘娘牌体系（顶部 NIANGNIANG_CONFIG 可自由微调）：
 *   * ♠Q（黑桃娘娘）：-100 分（全场头号烫手山芋，断门甩牌名场面核心）
 *   * ♦J（御前侍卫 / 羊）：+100 分（全场最香加分牌）
 *   * ♣10（翻倍令）：本局自身得分 ×2（若仅吃 ♣10 无其他分牌则 +50 分）
 *   * ♥A~♥5（红桃情丝分）：共 -200 分
 *   * 凤仪天下（全收反杀）：独揽全部 13 张红桃 + ♠Q，负分瞬间反转为 +300，其余三家各 -100
 * - 严格跟花规则 + 合法牌枚举 + 严格信息隔离 buildSeatView + MBTI 性格兜底策略
 */
(function (global) {
  "use strict";

  const SUITS = ["spades", "hearts", "diamonds", "clubs"];
  const SUIT_SYMBOL = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
  const RANK_LABEL = {
    2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8",
    9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A"
  };

  // 可配置规则表（如需适配地方变体只需调整此处）
  const NIANGNIANG_CONFIG = {
    spadeQueenPenalty: -100, // ♠Q 黑桃娘娘
    diamondJackBonus: 100,   // ♦J 御前侍卫
    clubTenAloneBonus: 50,   // ♣10 单吃无其他分牌时奖励
    fullShootWinnerScore: 300,
    fullShootLoserScore: -100,
    heartPoints: {
      14: -50,
      13: -40,
      12: -30,
      11: -20,
      10: -10,
      9: -10,
      8: -10,
      7: -10,
      6: -10,
      5: -10,
      4: 0,
      3: 0,
      2: 0
    }
  };

  function isSpadeQueen(card) {
    return !!card && card.suit === "spades" && card.rank === 12;
  }
  function isDiamondJack(card) {
    return !!card && card.suit === "diamonds" && card.rank === 11;
  }
  function isClubTen(card) {
    return !!card && card.suit === "clubs" && card.rank === 10;
  }
  function isScoringCard(card) {
    if (!card) return false;
    return isSpadeQueen(card) || isDiamondJack(card) || isClubTen(card) || card.suit === "hearts";
  }

  function getCardSpecialTag(card) {
    if (!card) return "";
    if (isSpadeQueen(card)) return "娘娘";
    if (isDiamondJack(card)) return "侍卫";
    if (isClubTen(card)) return "×2";
    if (card.suit === "hearts" && (NIANGNIANG_CONFIG.heartPoints[card.rank] || 0) < 0) {
      return `${NIANGNIANG_CONFIG.heartPoints[card.rank]}`;
    }
    return "";
  }

  function formatCard(card) {
    if (!card) return "??";
    const base = `${RANK_LABEL[card.rank] || card.rank}${SUIT_SYMBOL[card.suit] || ""}`;
    if (isSpadeQueen(card)) return `${base}(黑桃娘娘)`;
    if (isDiamondJack(card)) return `${base}(侍卫)`;
    if (isClubTen(card)) return `${base}(翻倍令)`;
    return base;
  }

  function sortHandBySuit(cards) {
    const suitOrder = { spades: 0, hearts: 1, clubs: 2, diamonds: 3 };
    return (cards || []).slice().sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      return b.rank - a.rank;
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
  // 1. 合法出牌（严格跟花规则）
  // ==========================================
  function getLegalCards(state, seatIdx) {
    const seat = state.seats[seatIdx];
    if (!seat || !seat.hand.length) return [];
    const leadSuit = state.currentTrick && state.currentTrick.leadSuit;
    if (!leadSuit) return seat.hand.slice();
    const sameSuit = seat.hand.filter((c) => c.suit === leadSuit);
    return sameSuit.length > 0 ? sameSuit : seat.hand.slice();
  }

  function getCurrentTrickLeader(trick) {
    if (!trick || !trick.plays || !trick.plays.length) return null;
    const leadSuit = trick.leadSuit;
    let best = trick.plays[0];
    for (const p of trick.plays) {
      if (p.card.suit === leadSuit && p.card.rank > best.card.rank) {
        best = p;
      }
    }
    return best;
  }

  function enumerateLegalPlays(state, seatIdx) {
    const legal = getLegalCards(state, seatIdx);
    const trick = state.currentTrick;
    const leadSuit = trick ? trick.leadSuit : null;
    const currentBest = getCurrentTrickLeader(trick);
    const isVoid = !!(leadSuit && legal.every((c) => c.suit !== leadSuit));

    return legal.map((card) => {
      let hint = "";
      if (!leadSuit) {
        hint = "领出";
      } else if (isVoid) {
        if (isSpadeQueen(card)) hint = "断门甩出黑桃娘娘!";
        else if (card.suit === "hearts" && card.rank >= 11) hint = "断门甩大红桃";
        else hint = "断门垫牌";
      } else {
        const wouldLead = currentBest && card.rank > currentBest.card.rank;
        if (isDiamondJack(card) && wouldLead) hint = "跟花顺手抢侍卫";
        else hint = wouldLead ? "压大(暂吃墩)" : "跟小(避吃墩)";
      }
      return {
        cardId: card.id,
        card,
        label: `${formatCard(card)}${hint ? ` · ${hint}` : ""}`
      };
    });
  }

  // ==========================================
  // 2. 计分引擎（含翻倍令与凤仪天下全收反杀）
  // ==========================================
  function calculateSeatRawScore(capturedCards) {
    let heartCount = 0;
    let heartScore = 0;
    let hasSpadeQ = false;
    let hasDiamondJ = false;
    let hasClub10 = false;

    for (const c of capturedCards) {
      if (c.suit === "hearts") {
        heartCount += 1;
        heartScore += NIANGNIANG_CONFIG.heartPoints[c.rank] || 0;
      }
      if (isSpadeQueen(c)) hasSpadeQ = true;
      if (isDiamondJack(c)) hasDiamondJ = true;
      if (isClubTen(c)) hasClub10 = true;
    }

    const isFullShoot = heartCount === 13 && hasSpadeQ;
    let base = heartScore + (hasSpadeQ ? NIANGNIANG_CONFIG.spadeQueenPenalty : 0) + (hasDiamondJ ? NIANGNIANG_CONFIG.diamondJackBonus : 0);
    const hasAnyOtherScore = heartCount > 0 || hasSpadeQ || hasDiamondJ;

    let total = base;
    if (hasClub10) {
      total = hasAnyOtherScore ? base * 2 : NIANGNIANG_CONFIG.clubTenAloneBonus;
    }
    return { total, heartCount, hasSpadeQ, hasDiamondJ, hasClub10, isFullShoot };
  }

  function finalizeGameScores(state) {
    const details = state.seats.map((s) => calculateSeatRawScore(s.capturedCards));
    const shooterIdx = details.findIndex((d) => d.isFullShoot);

    const finalScores = [0, 0, 0, 0];
    if (shooterIdx >= 0) {
      for (let i = 0; i < 4; i++) {
        finalScores[i] = i === shooterIdx ? NIANGNIANG_CONFIG.fullShootWinnerScore : NIANGNIANG_CONFIG.fullShootLoserScore;
        if (details[i].hasDiamondJ) finalScores[i] += NIANGNIANG_CONFIG.diamondJackBonus;
        if (details[i].hasClub10) finalScores[i] *= 2;
      }
      state.resultTitle = `👑 ${state.seats[shooterIdx].name} 凤仪天下（全收反杀）！`;
    } else {
      for (let i = 0; i < 4; i++) finalScores[i] = details[i].total;
      let maxScore = -Infinity;
      let bestSeat = state.seats[0];
      for (let i = 0; i < 4; i++) {
        if (finalScores[i] > maxScore) {
          maxScore = finalScores[i];
          bestSeat = state.seats[i];
        }
      }
      state.resultTitle = `👑 ${bestSeat.name} 拔得头筹（${maxScore >= 0 ? "+" : ""}${maxScore} 分）`;
    }

    // 1 分 = 2 筹码，直接与扑克馆筹码账户互通
    const chipDeltas = finalScores.map((sc) => sc * 2);
    for (let i = 0; i < 4; i++) {
      state.seats[i].roundScore = finalScores[i];
      state.seats[i].chips = Math.max(0, state.seats[i].chips + chipDeltas[i]);
    }
    state.finalScores = finalScores;
    state.chipDeltas = chipDeltas;
    state.stage = "finished";
    state.currentSeat = -1;
    state.resultSummary = state.seats
      .map((s, i) => `${s.name}:${finalScores[i] >= 0 ? "+" : ""}${finalScores[i]}分`)
      .join(" · ");
    state.actionLog.push(`${state.resultTitle}（${state.resultSummary}）`);
  }

  // ==========================================
  // 3. 牌局初始化与状态推进
  // ==========================================
  function createGameState({
    seatsMeta = [],
    handNumber = 1
  } = {}) {
    if (!Array.isArray(seatsMeta) || seatsMeta.length !== 4) {
      throw new Error("打娘娘固定为 4 人牌局");
    }
    const deck = createShuffledDeck();
    const seats = seatsMeta.map((m, idx) => ({
      seatIdx: idx,
      id: m.id,
      name: m.name,
      isUser: !!m.isUser,
      avatar: m.avatar || "",
      chips: typeof m.chips === "number" ? m.chips : 2000,
      mbti: m.mbti || "",
      personaPrompt: m.personaPrompt || "",
      hand: sortHandBySuit(deck.slice(idx * 13, (idx + 1) * 13)),
      capturedCards: [],
      roundScore: 0,
      lastActionText: "",
      lastTalk: ""
    }));

    // 持 ♣2 者首墩先手
    let firstLeadSeat = 0;
    for (const s of seats) {
      if (s.hand.some((c) => c.suit === "clubs" && c.rank === 2)) {
        firstLeadSeat = s.seatIdx;
        break;
      }
    }

    return {
      mode: "niangniang",
      handNumber,
      stage: "playing", // playing | trick_pause | finished
      trickNumber: 1,
      seats,
      currentSeat: firstLeadSeat,
      currentTrick: {
        leadSeat: firstLeadSeat,
        leadSuit: null,
        plays: [] // { seatIdx, card }
      },
      lastTrickSummary: null,
      finalScores: [0, 0, 0, 0],
      chipDeltas: [0, 0, 0, 0],
      resultTitle: "",
      resultSummary: "",
      actionLog: [
        `第 ${handNumber} 局「打娘娘」发牌完毕（13 墩），持 ♣2 的 ${seats[firstLeadSeat].name} 先手领出。`
      ]
    };
  }

  function applyPlay(state, seatIdx, cardId, talk = "") {
    if (state.stage !== "playing" || state.currentSeat !== seatIdx) {
      return { ok: false, error: "NOT_YOUR_TURN", state };
    }
    const seat = state.seats[seatIdx];
    const legal = getLegalCards(state, seatIdx);
    const chosen = legal.find((c) => c.id === cardId);
    if (!chosen) {
      return { ok: false, error: "ILLEGAL_CARD_OR_MUST_FOLLOW_SUIT", state };
    }

    seat.hand = seat.hand.filter((c) => c.id !== cardId);
    if (talk) seat.lastTalk = talk;
    seat.lastActionText = formatCard(chosen);

    if (!state.currentTrick.leadSuit) {
      state.currentTrick.leadSuit = chosen.suit;
      state.currentTrick.leadSeat = seatIdx;
    }
    state.currentTrick.plays.push({ seatIdx, card: chosen });
    state.actionLog.push(`第 ${state.trickNumber} 墩 · ${seat.name} 出 ${formatCard(chosen)}`);

    if (state.currentTrick.plays.length < 4) {
      state.currentSeat = (seatIdx + 1) % 4;
      return { ok: true, trickCompleted: false, card: chosen, state };
    }

    // 4 家出齐，判定吃墩
    const winnerPlay = getCurrentTrickLeader(state.currentTrick);
    const winnerIdx = winnerPlay.seatIdx;
    const winnerSeat = state.seats[winnerIdx];
    const trickCards = state.currentTrick.plays.map((p) => p.card);
    const scoredInTrick = trickCards.filter(isScoringCard);
    if (scoredInTrick.length) {
      winnerSeat.capturedCards.push(...scoredInTrick);
    }
    // 实时刷新本局暂估分
    for (const s of state.seats) {
      s.roundScore = calculateSeatRawScore(s.capturedCards).total;
    }

    const gotSpadeQ = scoredInTrick.some(isSpadeQueen);
    const gotDiamondJ = scoredInTrick.some(isDiamondJack);
    const note = gotSpadeQ
      ? `💥 ${winnerSeat.name} 吃下黑桃娘娘(♠Q -100)！`
      : gotDiamondJ
      ? `✨ ${winnerSeat.name} 喜提御前侍卫(♦J +100)！`
      : `${winnerSeat.name} 吃下第 ${state.trickNumber} 墩`;

    state.lastTrickSummary = {
      trickNumber: state.trickNumber,
      winnerSeat: winnerIdx,
      winnerName: winnerSeat.name,
      plays: state.currentTrick.plays.slice(),
      scoredCards: scoredInTrick,
      note
    };
    state.actionLog.push(note);

    if (state.trickNumber >= 13) {
      finalizeGameScores(state);
      return { ok: true, trickCompleted: true, finished: true, winnerIdx, state };
    }

    state.trickNumber += 1;
    state.currentSeat = winnerIdx;
    state.currentTrick = {
      leadSeat: winnerIdx,
      leadSuit: null,
      plays: []
    };
    return { ok: true, trickCompleted: true, finished: false, winnerIdx, state };
  }

  // ==========================================
  // 4. 严格信息隔离视图（AI 绝不偷看他人暗牌）
  // ==========================================
  function buildSeatView(state, seatIdx) {
    const me = state.seats[seatIdx];
    const trick = state.currentTrick;
    const currentBest = getCurrentTrickLeader(trick);

    return {
      mode: "niangniang",
      trickNumber: state.trickNumber,
      leadSuit: trick && trick.leadSuit ? SUIT_SYMBOL[trick.leadSuit] : "由你领出",
      trickPlays: (trick ? trick.plays : []).map((p) => ({
        by: state.seats[p.seatIdx].name,
        card: formatCard(p.card)
      })),
      trickHasSpadeQueen: !!(trick && trick.plays.some((p) => isSpadeQueen(p.card))),
      trickHasDiamondJack: !!(trick && trick.plays.some((p) => isDiamondJack(p.card))),
      currentTrickWinner: currentBest ? state.seats[currentBest.seatIdx].name : null,
      mySeat: {
        seatIdx: me.seatIdx,
        name: me.name,
        handText: me.hand.map(formatCard).join(" "),
        cardCount: me.hand.length,
        roundScore: me.roundScore,
        capturedText: me.capturedCards.map(formatCard).join(" ") || "无"
      },
      others: state.seats
        .filter((s) => s.seatIdx !== seatIdx)
        .map((s) => ({
          seatIdx: s.seatIdx,
          name: s.name,
          cardCount: s.hand.length,
          roundScore: s.roundScore,
          capturedText: s.capturedCards.map(formatCard).join(" ") || "无",
          lastAction: s.lastActionText || "",
          lastTalk: s.lastTalk || ""
        }))
    };
  }

  // ==========================================
  // 5. 本地智能避娘娘/抢侍卫兜底策略 + LLM 节奏分级
  // ==========================================
  function decideLocalFallbackPlay(state, seatIdx) {
    const candidates = enumerateLegalPlays(state, seatIdx);
    if (!candidates.length) return { choiceIndex: 0, cardId: null, tableTalk: "" };
    if (candidates.length === 1) {
      return {
        choiceIndex: 0,
        cardId: candidates[0].cardId,
        tableTalk: isSpadeQueen(candidates[0].card) ? "避无可避，黑桃娘娘出鞘！" : ""
      };
    }

    const trick = state.currentTrick;
    const leadSuit = trick ? trick.leadSuit : null;
    const currentBest = getCurrentTrickLeader(trick);
    const isVoid = !!(leadSuit && candidates.every((c) => c.card.suit !== leadSuit));

    // 1. 断门甩牌：有黑桃娘娘优先甩！其次甩大红桃！
    if (isVoid) {
      const sqIdx = candidates.findIndex((c) => isSpadeQueen(c.card));
      if (sqIdx >= 0) {
        return {
          choiceIndex: sqIdx,
          cardId: candidates[sqIdx].cardId,
          tableTalk: "哈哈，这张黑桃娘娘就敬奉给吃墩那位了！"
        };
      }
      const bigHeart = candidates
        .map((c, i) => ({ c, i }))
        .filter((x) => x.c.card.suit === "hearts")
        .sort((a, b) => b.c.card.rank - a.c.card.rank)[0];
      if (bigHeart) {
        return {
          choiceIndex: bigHeart.i,
          cardId: bigHeart.c.cardId,
          tableTalk: "趁机甩张红桃，轻装上阵。"
        };
      }
      // 甩非侍卫的最大杂牌
      const nonJ = candidates
        .map((c, i) => ({ c, i }))
        .filter((x) => !isDiamondJack(x.c.card))
        .sort((a, b) => b.c.card.rank - a.c.card.rank)[0];
      const pick = nonJ || { c: candidates[0], i: 0 };
      return { choiceIndex: pick.i, cardId: pick.c.cardId, tableTalk: "断门垫张牌。" };
    }

    // 2. 领出：优先出小黑桃/小梅花/小方块避雷，避免直接送出黑桃娘娘或大红桃
    if (!leadSuit) {
      const safe = candidates
        .map((c, i) => ({ c, i }))
        .filter((x) => !isSpadeQueen(x.c.card) && !isClubTen(x.c.card) && !(x.c.card.suit === "hearts" && x.c.card.rank >= 10))
        .sort((a, b) => a.c.card.rank - b.c.card.rank)[0];
      const pick = safe || { c: candidates[0], i: 0 };
      return {
        choiceIndex: pick.i,
        cardId: pick.c.cardId,
        tableTalk: `我领出 ${formatCard(pick.c.card)}，诸位请跟。`
      };
    }

    // 3. 跟花：若桌上已有侍卫(♦J)且无黑桃娘娘，果断抢大！
    const trickHasDanger = trick.plays.some((p) => isSpadeQueen(p.card) || (p.card.suit === "hearts" && p.card.rank >= 10));
    const trickHasBonus = trick.plays.some((p) => isDiamondJack(p.card));

    if (trickHasBonus && !trickHasDanger) {
      const biggest = candidates
        .map((c, i) => ({ c, i }))
        .sort((a, b) => b.c.card.rank - a.c.card.rank)[0];
      return {
        choiceIndex: biggest.i,
        cardId: biggest.c.cardId,
        tableTalk: "御前侍卫在此，我便笑纳了！"
      };
    }

    // 否则尽量出比当前最大略小的牌（安全溜走）
    const under = candidates
      .map((c, i) => ({ c, i }))
      .filter((x) => currentBest && x.c.card.rank < currentBest.card.rank && !isSpadeQueen(x.c.card))
      .sort((a, b) => b.c.card.rank - a.c.card.rank)[0];
    if (under) {
      return {
        choiceIndex: under.i,
        cardId: under.c.cardId,
        tableTalk: trickHasDanger ? "这烫手山芋我可不敢接。" : ""
      };
    }

    // 实在避不开，尽量不出黑桃娘娘（除非必须出）
    const smallestNonSQ = candidates
      .map((c, i) => ({ c, i }))
      .filter((x) => !isSpadeQueen(x.c.card))
      .sort((a, b) => a.c.card.rank - b.c.card.rank)[0];
    const pick = smallestNonSQ || { c: candidates[0], i: 0 };
    return {
      choiceIndex: pick.i,
      cardId: pick.c.cardId,
      tableTalk: trickHasDanger ? "啧，偏偏避不开这一墩。" : ""
    };
  }

  /**
   * 智能节奏分级：关键墩（含娘娘/侍卫/断门甩牌/首末墩/每 3 墩轮换）调 LLM，单张必出瞬出
   */
  function shouldInvokeAi(state, seatIdx, candidates) {
    if (!candidates || candidates.length <= 1) return false;
    const trick = state.currentTrick;
    const leadSuit = trick ? trick.leadSuit : null;
    const isVoid = !!(leadSuit && candidates.every((c) => c.card.suit !== leadSuit));
    const hasSpadeQ = candidates.some((c) => isSpadeQueen(c.card)) || (trick && trick.plays.some((p) => isSpadeQueen(p.card)));
    const hasDiamondJ = candidates.some((c) => isDiamondJack(c.card)) || (trick && trick.plays.some((p) => isDiamondJack(p.card)));

    if ((isVoid && hasSpadeQ) || hasSpadeQ || hasDiamondJ) return true;
    // 第 1 墩与最后 2 墩，以及每 2 墩领出时调 LLM 聊几句
    if (!leadSuit && (state.trickNumber === 1 || state.trickNumber >= 12 || state.trickNumber % 2 === 1)) {
      return true;
    }
    return false;
  }

  const api = {
    SUITS,
    SUIT_SYMBOL,
    RANK_LABEL,
    NIANGNIANG_CONFIG,
    isSpadeQueen,
    isDiamondJack,
    isClubTen,
    isScoringCard,
    getCardSpecialTag,
    formatCard,
    sortHandBySuit,
    getLegalCards,
    getCurrentTrickLeader,
    enumerateLegalPlays,
    calculateSeatRawScore,
    createGameState,
    applyPlay,
    buildSeatView,
    decideLocalFallbackPlay,
    shouldInvokeAi
  };

  global.NuoPokerNiangNiang = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

