/**
 * Milvus/nuo_poker_rules.js
 * 「傩·扑克（Nuo Poker）」100% 确定性标准德州扑克规则与状态机引擎
 * - 52 张标准扑克 Fisher-Yates 洗牌，绝不重牌/漏牌
 * - 完整 7 选 5 精确牌力评估器（覆盖皇家同花顺~高牌 10 级 + A-2-3-4-5 最小顺 + 踢脚牌比对）
 * - 完整庄家轮转 / 大小盲注 / 四轮下注（翻牌前/翻牌/转牌/河牌/摊牌）/ 提前全弃牌收池 / 主边池精确结算
 * - 严格信息隔离 buildSeatView（AI 绝不偷看他人暗牌）+ 合法动作校准 + 本地 MBTI 性格化兜底策略
 */
(function (global) {
  "use strict";

  const SUITS = ["spades", "hearts", "diamonds", "clubs"];
  const SUIT_SYMBOL = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
  const RANK_LABEL = {
    2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8",
    9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A"
  };

  const HAND_NAMES = [
    "高牌",
    "一对",
    "两对",
    "三条",
    "顺子",
    "同花",
    "葫芦",
    "四条",
    "同花顺",
    "皇家同花顺"
  ];

  const STAGE_NAMES = {
    preflop: "翻牌前",
    flop: "翻牌",
    turn: "转牌",
    river: "河牌",
    showdown: "摊牌结算"
  };

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

  function formatCard(card) {
    if (!card) return "??";
    return `${RANK_LABEL[card.rank] || card.rank}${SUIT_SYMBOL[card.suit] || ""}`;
  }

  // ==========================================
  // 1. 精确 5 张 & 7 选 5 牌力评估器
  // ==========================================
  function compareScoreTuple(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const va = a[i] || 0;
      const vb = b[i] || 0;
      if (va !== vb) return va - vb;
    }
    return 0;
  }

  function evaluate5(cards5) {
    const ranks = cards5.map((c) => c.rank).sort((a, b) => b - a);
    const isFlush = cards5.every((c) => c.suit === cards5[0].suit);

    // 检查顺子（含 A-5-4-3-2 最小顺）
    const uniqueRanks = Array.from(new Set(ranks));
    let isStraight = false;
    let straightHigh = 0;
    if (uniqueRanks.length === 5) {
      if (uniqueRanks[0] - uniqueRanks[4] === 4) {
        isStraight = true;
        straightHigh = uniqueRanks[0];
      } else if (
        uniqueRanks[0] === 14 &&
        uniqueRanks[1] === 5 &&
        uniqueRanks[2] === 4 &&
        uniqueRanks[3] === 3 &&
        uniqueRanks[4] === 2
      ) {
        isStraight = true;
        straightHigh = 5;
      }
    }

    const counts = new Map();
    for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
    const groups = Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0] - a[0];
    });

    if (isFlush && isStraight) {
      const cat = straightHigh === 14 ? 9 : 8;
      return { category: cat, name: HAND_NAMES[cat], tuple: [cat, straightHigh] };
    }
    if (groups[0][1] === 4) {
      return { category: 7, name: HAND_NAMES[7], tuple: [7, groups[0][0], groups[1][0]] };
    }
    if (groups[0][1] === 3 && groups[1][1] === 2) {
      return { category: 6, name: HAND_NAMES[6], tuple: [6, groups[0][0], groups[1][0]] };
    }
    if (isFlush) {
      return { category: 5, name: HAND_NAMES[5], tuple: [5, ...ranks] };
    }
    if (isStraight) {
      return { category: 4, name: HAND_NAMES[4], tuple: [4, straightHigh] };
    }
    if (groups[0][1] === 3) {
      return { category: 3, name: HAND_NAMES[3], tuple: [3, groups[0][0], groups[1][0], groups[2][0]] };
    }
    if (groups[0][1] === 2 && groups[1][1] === 2) {
      return { category: 2, name: HAND_NAMES[2], tuple: [2, groups[0][0], groups[1][0], groups[2][0]] };
    }
    if (groups[0][1] === 2) {
      return { category: 1, name: HAND_NAMES[1], tuple: [1, groups[0][0], groups[1][0], groups[2][0], groups[3][0]] };
    }
    return { category: 0, name: HAND_NAMES[0], tuple: [0, ...ranks] };
  }

  function evaluateBestHand(cards = []) {
    const valid = (Array.isArray(cards) ? cards : []).filter((c) => c && c.rank && c.suit);
    if (valid.length < 5) {
      // 翻牌前（2张底牌）给出可读描述
      if (valid.length === 2) {
        const sorted = [...valid].sort((a, b) => b.rank - a.rank);
        const paired = sorted[0].rank === sorted[1].rank;
        const suited = sorted[0].suit === sorted[1].suit;
        return {
          category: paired ? 1 : 0,
          name: paired ? `口袋对 ${RANK_LABEL[sorted[0].rank]}` : `${RANK_LABEL[sorted[0].rank]}${RANK_LABEL[sorted[1].rank]}${suited ? "同花" : "杂色"}`,
          tuple: [paired ? 1 : 0, sorted[0].rank, sorted[1].rank]
        };
      }
      return { category: 0, name: "高牌", tuple: [0] };
    }

    let best = null;
    const n = valid.length;
    for (let a = 0; a < n - 4; a++) {
      for (let b = a + 1; b < n - 3; b++) {
        for (let c = b + 1; c < n - 2; c++) {
          for (let d = c + 1; d < n - 1; d++) {
            for (let e = d + 1; e < n; e++) {
              const ev = evaluate5([valid[a], valid[b], valid[c], valid[d], valid[e]]);
              if (!best || compareScoreTuple(ev.tuple, best.tuple) > 0) {
                best = ev;
              }
            }
          }
        }
      }
    }
    return best;
  }

  /**
   * 估算手牌客观胜率强度（0~100），供 AI 决策与本地兜底策略使用
   */
  function estimateHandStrength(holeCards = [], communityCards = []) {
    if (!Array.isArray(holeCards) || holeCards.length < 2) return 35;
    if (!Array.isArray(communityCards) || communityCards.length < 3) {
      // 翻牌前 Chen-like 快速强度估算
      const [h, l] = [...holeCards].sort((a, b) => b.rank - a.rank);
      const suited = h.suit === l.suit;
      const gap = h.rank - l.rank;
      let score = 20 + (h.rank - 2) * 3.2 + (l.rank - 2) * 1.4;
      if (gap === 0) score += 26 + (h.rank >= 10 ? 12 : 0);
      if (suited) score += 7;
      if (gap > 0 && gap <= 2) score += 6;
      if (gap >= 5) score -= 8;
      return Math.max(8, Math.min(98, Math.round(score)));
    }
    const best = evaluateBestHand([...holeCards, ...communityCards]);
    const baseByCat = [22, 46, 66, 76, 83, 88, 93, 97, 99, 100];
    let score = baseByCat[best.category] || 22;
    if (best.category === 1 && best.tuple[1] >= 11) score += 9;
    if (best.category === 0 && best.tuple[1] >= 13) score += 8;
    return Math.max(10, Math.min(100, Math.round(score)));
  }

  // ==========================================
  // 2. 标准德州扑克状态机（盲注 / 下注 / 过街 / 边池结算）
  // ==========================================
  function nextActiveSeat(players, fromIdx, predicate) {
    const n = players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIdx + step) % n;
      if (predicate(players[idx], idx)) return idx;
    }
    return -1;
  }

  function startNewHand(playersInput, { handNumber = 1, dealerIndex = 0, smallBlind = 10, bigBlind = 20, deckOverride = null } = {}) {
    const deck = Array.isArray(deckOverride) ? [...deckOverride] : createShuffledDeck();
    const players = playersInput.map((p, idx) => ({
      id: String(p.id),
      name: p.name || `玩家${idx + 1}`,
      isUser: Boolean(p.isUser),
      avatar: p.avatar || "",
      profile: p.profile || {},
      chips: Math.max(0, Math.floor(Number(p.chips) || 0)),
      holeCards: [],
      betThisStreet: 0,
      totalCommitted: 0,
      folded: Math.floor(Number(p.chips) || 0) <= 0,
      allIn: false,
      actedThisStreet: false,
      lastActionText: ""
    }));

    const activeCount = players.filter((p) => !p.folded).length;
    if (activeCount < 2) {
      return { error: "至少需要 2 位有筹码的玩家才能开局" };
    }

    const safeDealer = dealerIndex % players.length;
    const sbIdx = activeCount === 2 ? safeDealer : nextActiveSeat(players, safeDealer, (p) => !p.folded);
    const bbIdx = nextActiveSeat(players, sbIdx, (p) => !p.folded);

    // 发底牌（每人 2 张）
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < players.length; i++) {
        const seat = (sbIdx + i) % players.length;
        if (!players[seat].folded && deck.length > 0) {
          players[seat].holeCards.push(deck.pop());
        }
      }
    }

    const postBlind = (idx, amt, label) => {
      const p = players[idx];
      const pay = Math.min(p.chips, amt);
      p.chips -= pay;
      p.betThisStreet += pay;
      p.totalCommitted += pay;
      if (p.chips === 0) p.allIn = true;
      p.lastActionText = `${label} ${pay}`;
      return pay;
    };

    const sbPaid = postBlind(sbIdx, smallBlind, "小盲");
    const bbPaid = postBlind(bbIdx, bigBlind, "大盲");
    const pot = sbPaid + bbPaid;
    const currentBet = Math.max(players[sbIdx].betThisStreet, players[bbIdx].betThisStreet);

    const firstToAct = nextActiveSeat(players, bbIdx, (p) => !p.folded && !p.allIn);

    const state = {
      handNumber,
      stage: "preflop",
      deck,
      communityCards: [],
      players,
      dealerIndex: safeDealer,
      sbIndex: sbIdx,
      bbIndex: bbIdx,
      smallBlind,
      bigBlind,
      pot,
      currentBet,
      minRaise: bigBlind,
      turnIndex: firstToAct,
      finished: false,
      winners: [],
      potEvents: [
        `${players[sbIdx].name} 下小盲注 ${sbPaid}`,
        `${players[bbIdx].name} 下大盲注 ${bbPaid}`
      ]
    };

    if (firstToAct < 0) {
      return runOutToShowdown(state);
    }
    return state;
  }

  function getLegalActions(state, seatIdx) {
    if (!state || state.finished) return { canCheck: false, canCall: false, canRaise: false, canFold: false, toCall: 0, minRaiseTo: 0, maxRaiseTo: 0 };
    const p = state.players[seatIdx];
    if (!p || p.folded || p.allIn) return { canCheck: false, canCall: false, canRaise: false, canFold: false, toCall: 0, minRaiseTo: 0, maxRaiseTo: 0 };

    const toCall = Math.max(0, state.currentBet - p.betThisStreet);
    const maxRaiseTo = p.betThisStreet + p.chips;
    const minRaiseTo = Math.min(maxRaiseTo, state.currentBet === 0 ? state.bigBlind : state.currentBet + state.minRaise);

    return {
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canRaise: p.chips > toCall,
      canFold: true,
      toCall: Math.min(toCall, p.chips),
      minRaiseTo,
      maxRaiseTo
    };
  }

  function sanitizeAction(state, seatIdx, rawAction) {
    const legal = getLegalActions(state, seatIdx);
    const act = String(rawAction?.action || "").toLowerCase();
    if (act === "fold") {
      // 无人加注时避免 AI 无故弃牌，改为过牌
      if (legal.canCheck && !rawAction?.forceFold) return { action: "check", raiseTo: 0 };
      return { action: "fold", raiseTo: 0 };
    }
    if (act === "check") {
      return legal.canCheck ? { action: "check", raiseTo: 0 } : { action: "call", raiseTo: 0 };
    }
    if (act === "call") {
      return legal.canCall ? { action: "call", raiseTo: 0 } : { action: "check", raiseTo: 0 };
    }
    if (act === "allin") {
      return { action: "allin", raiseTo: legal.maxRaiseTo };
    }
    if (act === "raise" || act === "bet") {
      if (!legal.canRaise) return legal.canCall ? { action: "call", raiseTo: 0 } : { action: "check", raiseTo: 0 };
      const req = Math.floor(Number(rawAction?.raiseTo) || legal.minRaiseTo);
      const clamped = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, req));
      return clamped >= legal.maxRaiseTo ? { action: "allin", raiseTo: legal.maxRaiseTo } : { action: "raise", raiseTo: clamped };
    }
    return legal.canCheck ? { action: "check", raiseTo: 0 } : { action: "call", raiseTo: 0 };
  }

  function settleShowdown(state) {
    const next = {
      ...state,
      stage: "showdown",
      finished: true,
      turnIndex: -1,
      players: state.players.map((p) => ({ ...p }))
    };

    const contenders = next.players
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => !p.folded);

    // 仅剩 1 人未弃牌：直接赢走全部底池
    if (contenders.length === 1) {
      const w = contenders[0];
      w.p.chips += next.pot;
      next.winners = [{ seatIndex: w.idx, id: w.p.id, name: w.p.name, amount: next.pot, handName: "对手全弃牌获胜" }];
      return next;
    }

    // 精确主池/边池按贡献层级切分结算
    const evalMap = new Map();
    for (const { p, idx } of contenders) {
      evalMap.set(idx, evaluateBestHand([...p.holeCards, ...next.communityCards]));
    }

    const levels = Array.from(new Set(next.players.map((p) => p.totalCommitted).filter((v) => v > 0))).sort((a, b) => a - b);
    const winAmountBySeat = new Map();
    let prevLevel = 0;

    for (const lvl of levels) {
      const slice = lvl - prevLevel;
      if (slice <= 0) continue;
      let sidePot = 0;
      const eligible = [];
      next.players.forEach((p, idx) => {
        if (p.totalCommitted >= lvl) {
          sidePot += slice;
          if (!p.folded) eligible.push(idx);
        } else if (p.totalCommitted > prevLevel) {
          sidePot += p.totalCommitted - prevLevel;
        }
      });
      prevLevel = lvl;
      if (sidePot <= 0 || eligible.length === 0) continue;

      let bestTuple = null;
      let potWinners = [];
      for (const idx of eligible) {
        const ev = evalMap.get(idx);
        if (!bestTuple) {
          bestTuple = ev.tuple;
          potWinners = [idx];
        } else {
          const cmp = compareScoreTuple(ev.tuple, bestTuple);
          if (cmp > 0) {
            bestTuple = ev.tuple;
            potWinners = [idx];
          } else if (cmp === 0) {
            potWinners.push(idx);
          }
        }
      }

      const share = Math.floor(sidePot / potWinners.length);
      let rem = sidePot - share * potWinners.length;
      for (const wIdx of potWinners) {
        const gain = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem -= 1;
        winAmountBySeat.set(wIdx, (winAmountBySeat.get(wIdx) || 0) + gain);
      }
    }

    const winners = [];
    winAmountBySeat.forEach((amt, idx) => {
      next.players[idx].chips += amt;
      const ev = evalMap.get(idx);
      winners.push({
        seatIndex: idx,
        id: next.players[idx].id,
        name: next.players[idx].name,
        amount: amt,
        handName: ev ? ev.name : "胜出"
      });
    });
    next.winners = winners;
    return next;
  }

  function advanceStreet(state) {
    const deck = [...state.deck];
    const communityCards = [...state.communityCards];
    let nextStage = state.stage;

    if (state.stage === "preflop") {
      nextStage = "flop";
      if (deck.length > 0) deck.pop(); // 切牌 burn
      for (let i = 0; i < 3 && deck.length > 0; i++) communityCards.push(deck.pop());
    } else if (state.stage === "flop") {
      nextStage = "turn";
      if (deck.length > 0) deck.pop();
      if (deck.length > 0) communityCards.push(deck.pop());
    } else if (state.stage === "turn") {
      nextStage = "river";
      if (deck.length > 0) deck.pop();
      if (deck.length > 0) communityCards.push(deck.pop());
    } else {
      return settleShowdown(state);
    }

    const players = state.players.map((p) => ({
      ...p,
      betThisStreet: 0,
      actedThisStreet: false,
      lastActionText: p.folded ? "已弃牌" : p.allIn ? "梭哈" : ""
    }));

    const canActPlayers = players.filter((p) => !p.folded && !p.allIn);
    const nextState = {
      ...state,
      stage: nextStage,
      deck,
      communityCards,
      players,
      currentBet: 0,
      minRaise: state.bigBlind,
      turnIndex: canActPlayers.length >= 2 ? nextActiveSeat(players, state.dealerIndex, (p) => !p.folded && !p.allIn) : -1
    };

    if (canActPlayers.length < 2) {
      return runOutToShowdown(nextState);
    }
    return nextState;
  }

  function runOutToShowdown(state) {
    let cur = state;
    while (!cur.finished && cur.stage !== "showdown") {
      if (cur.stage === "river") {
        cur = settleShowdown(cur);
      } else {
        cur = advanceStreet(cur);
      }
    }
    return cur;
  }

  function applyPlayerAction(state, seatIdx, rawAction) {
    if (!state || state.finished || seatIdx !== state.turnIndex) return state;
    const clean = sanitizeAction(state, seatIdx, rawAction);
    const players = state.players.map((p) => ({ ...p }));
    const p = players[seatIdx];
    let pot = state.pot;
    let currentBet = state.currentBet;
    let minRaise = state.minRaise;

    if (clean.action === "fold") {
      p.folded = true;
      p.actedThisStreet = true;
      p.lastActionText = "弃牌";
    } else if (clean.action === "check") {
      p.actedThisStreet = true;
      p.lastActionText = "过牌";
    } else if (clean.action === "call") {
      const pay = Math.min(p.chips, Math.max(0, currentBet - p.betThisStreet));
      p.chips -= pay;
      p.betThisStreet += pay;
      p.totalCommitted += pay;
      pot += pay;
      p.actedThisStreet = true;
      if (p.chips === 0) {
        p.allIn = true;
        p.lastActionText = `梭哈 ${p.betThisStreet}`;
      } else {
        p.lastActionText = `跟注 ${pay}`;
      }
    } else if (clean.action === "raise" || clean.action === "allin") {
      const target = clean.action === "allin" ? p.betThisStreet + p.chips : clean.raiseTo;
      const pay = Math.min(p.chips, Math.max(0, target - p.betThisStreet));
      p.chips -= pay;
      p.betThisStreet += pay;
      p.totalCommitted += pay;
      pot += pay;
      p.actedThisStreet = true;
      if (p.betThisStreet > currentBet) {
        const raiseDelta = p.betThisStreet - currentBet;
        if (raiseDelta >= minRaise) minRaise = raiseDelta;
        currentBet = p.betThisStreet;
        // 有人加注后，其余未弃牌/未梭哈玩家须重新表态
        players.forEach((other, idx) => {
          if (idx !== seatIdx && !other.folded && !other.allIn) {
            other.actedThisStreet = false;
          }
        });
      }
      if (p.chips === 0) {
        p.allIn = true;
        p.lastActionText = `梭哈 ${p.betThisStreet}`;
      } else {
        p.lastActionText = `加注至 ${p.betThisStreet}`;
      }
    }

    const nextBase = { ...state, players, pot, currentBet, minRaise };
    const alive = players.filter((pl) => !pl.folded);
    if (alive.length <= 1) {
      return settleShowdown(nextBase);
    }

    const needAct = players.some((pl) => !pl.folded && !pl.allIn && (!pl.actedThisStreet || pl.betThisStreet < currentBet));
    if (!needAct) {
      return advanceStreet(nextBase);
    }

    const nextTurn = nextActiveSeat(players, seatIdx, (pl) => !pl.folded && !pl.allIn && (!pl.actedThisStreet || pl.betThisStreet < currentBet));
    if (nextTurn < 0) {
      return advanceStreet(nextBase);
    }
    return { ...nextBase, turnIndex: nextTurn };
  }

  // ==========================================
  // 3. 严格信息隔离视图 & 本地性格化兜底策略
  // ==========================================
  function buildSeatView(state, seatIdx) {
    const me = state.players[seatIdx];
    const legal = getLegalActions(state, seatIdx);
    const strength = estimateHandStrength(me.holeCards, state.communityCards);
    const bestHand = evaluateBestHand([...me.holeCards, ...state.communityCards]);
    return {
      stage: state.stage,
      stageLabel: STAGE_NAMES[state.stage] || state.stage,
      pot: state.pot,
      currentBet: state.currentBet,
      communityCards: state.communityCards.map(formatCard),
      myCards: me.holeCards.map(formatCard),
      myBestHand: bestHand.name,
      myStrength: strength,
      myChips: me.chips,
      legal,
      others: state.players
        .map((p, idx) =>
          idx === seatIdx
            ? null
            : {
                name: p.name,
                chips: p.chips,
                betThisStreet: p.betThisStreet,
                folded: p.folded,
                allIn: p.allIn,
                lastAction: p.lastActionText || "待行动",
                holeCards: ["??", "??"] // 严格隐藏他人底牌
              }
        )
        .filter(Boolean)
    };
  }

  function decideLocalFallbackAction(state, seatIdx) {
    const me = state.players[seatIdx];
    const view = buildSeatView(state, seatIdx);
    const { legal, myStrength } = view;
    const mbti = String(me.profile?.mbti || "").toUpperCase();
    const isBold = mbti.startsWith("E") || mbti.includes("P");
    const potOdds = legal.toCall > 0 ? legal.toCall / Math.max(1, state.pot + legal.toCall) : 0;

    let action = "check";
    let raiseTo = legal.minRaiseTo;
    let talk = "先过牌看看风色。";

    if (myStrength >= 76 && legal.canRaise) {
      action = "raise";
      raiseTo = Math.min(legal.maxRaiseTo, legal.minRaiseTo + (isBold ? state.bigBlind * 2 : state.bigBlind));
      talk = isBold ? `这把牌面不错，我加到 ${raiseTo}，诸位跟不跟？` : `我加注至 ${raiseTo}。`;
    } else if (legal.canCheck) {
      if (isBold && myStrength >= 58 && legal.canRaise && Math.random() < 0.35) {
        action = "raise";
        raiseTo = legal.minRaiseTo;
        talk = `闲着也是闲着，试探性加个 ${raiseTo}。`;
      } else {
        action = "check";
        talk = "过牌，看下一张。";
      }
    } else if (myStrength >= 45 || (potOdds < 0.22 && myStrength >= 30)) {
      action = "call";
      talk = `跟 ${legal.toCall}，倒要看看你底牌是什么。`;
    } else if (isBold && Math.random() < 0.12 && legal.canRaise) {
      action = "raise";
      raiseTo = legal.minRaiseTo;
      talk = "哼，虚张声势罢了，我偏加注！";
    } else {
      action = "fold";
      talk = "这手牌不成气候，弃了。";
    }

    const safe = sanitizeAction(state, seatIdx, { action, raiseTo, forceFold: action === "fold" });
    return { ...safe, tableTalk: talk };
  }

  const api = {
    SUITS,
    SUIT_SYMBOL,
    RANK_LABEL,
    HAND_NAMES,
    STAGE_NAMES,
    createShuffledDeck,
    formatCard,
    compareScoreTuple,
    evaluate5,
    evaluateBestHand,
    estimateHandStrength,
    startNewHand,
    getLegalActions,
    sanitizeAction,
    applyPlayerAction,
    buildSeatView,
    decideLocalFallbackAction
  };

  global.NuoPokerRules = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

