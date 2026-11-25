/**
 * Milvus/chenwei_char_interpreter.js
 * 「谶纬小摊 2.1」独立名士解签与多轮追问博弈引擎
 * - 零 localStorage 写入，全部解签与追问线程持久化至 milvus_chenwei_lego_idb (oracle_records.interpretations)
 * - 严格注入 5 维完整上下文：角色 6 项核心档案 + 身份配置库 + 世界书开启条目 + 卦签三体裁本体 + 传讯近 30+ 条上下文
 * - 利益博弈机制：名士可依自身立场、性格与亲疏自主选择「直言相告 / 善意隐瞒 / 私心误导」，并附微表情破绽与可折叠真实盘算
 * - 支持多轮追问，名士在用户步步紧逼下可圆谎、露馅、反将一军或吐露真情
 */
(function (global) {
  "use strict";

  const STANCE_META = {
    truth:       { id: "truth",       label: "直言相告", tone: "#3F6B4E", bg: "#EEF5F0", border: "#C4DCCB" },
    white_lie:   { id: "white_lie",   label: "善意隐瞒", tone: "#9A6B2F", bg: "#FAF3E6", border: "#E5CFA8" },
    selfish_lie: { id: "selfish_lie", label: "私心误导", tone: "#A33B2E", bg: "#FBECE9", border: "#EBC0B8" }
  };

  const QUICK_FOLLOWUPS = [
    "你老实说，是不是在哄我？",
    "这童谣和图谶里，究竟暗指何人？",
    "若真藏隐忧，依你之见当如何破局？",
    "你方才神色有异，可还有话瞒着我？"
  ];

  function normalizeStance(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (s === "white_lie" || s === "selfish_lie" || s === "truth") return s;
    if (s.includes("white") || s.includes("善")) return "white_lie";
    if (s.includes("selfish") || s.includes("恶") || s.includes("私")) return "selfish_lie";
    return "truth";
  }

  function formatOracleSlipForPrompt(record) {
    const v = (record && record.verses) || {};
    const poem = String(v.poem || record?.oracleVerse || "").trim();
    const ballad = String(v.ballad || "").trim();
    const chenyu = String(v.chenyu || "").trim();
    const parts = [
      `【所问之事】${record?.question || "近日气运"}`,
      `【卦名吉凶】${record?.hexagram || "未明"}`,
      poem ? `【古诗签】\n${poem}` : "",
      ballad ? `【东汉童谣】\n${ballad}` : "",
      chenyu ? `【图谶秘语】\n${chenyu}` : "",
      record?.chenyuGloss ? `【图谶注脚】${record.chenyuGloss}` : "",
      record?.structureReading ? `【司天监象意原批】${record.structureReading}` : "",
      record?.advice ? `【司天监建言】${record.advice}` : ""
    ];
    return parts.filter(Boolean).join("\n");
  }

  function buildCharacterContextHeader(ctx) {
    const cp = ctx.charProfile;
    const up = ctx.userPersona;
    return [
      `你正在深度扮演东汉名士「${cp.name}」（角色ID：${cp.id}）。`,
      "【角色 6 项完整档案（必须严格贴合）】",
      `- 姓名与 ID：${cp.name} (${cp.id})`,
      `- MBTI 性格类型：${cp.mbti}`,
      `- 星座：${cp.constellation}`,
      `- 语言风格：${cp.speakingStyle}`,
      `- 性格特点：${cp.personality}`,
      `- 个人背景：${cp.background}`,
      `【问卦人（用户）身份配置库】姓名：${up.name}；身份：${up.identity || "广陵王"}${up.personality ? `；性格：${up.personality}` : ""}${up.background ? `；背景：${up.background}` : ""}`,
      ctx.worldBookText ? `【当前已开启世界书设定】\n${ctx.worldBookText}` : "",
      ctx.recentChat && ctx.recentChat.text
        ? `【你与 ${up.name} 最近的 ${ctx.recentChat.count} 条传讯上下文（务必自然呼应你们近来的关系、情绪与旧事）】\n${ctx.recentChat.text}`
        : ""
    ].filter(Boolean).join("\n");
  }

  function buildOfflineInterpretation(ctx, record) {
    const cp = ctx.charProfile;
    const mbti = String(cp.mbti || "").toUpperCase();
    let stance = "truth";
    if (mbti.includes("F")) stance = "white_lie";
    else if (mbti.includes("T") && mbti.includes("N")) stance = "selfish_lie";

    const name = ctx.userPersona?.name || "你";
    if (stance === "white_lie") {
      return {
        reply: `（接过签筒细看片刻，唇角噙着温和笑意）这支「${record?.hexagram || "吉签"}」看着虽有几分曲折，实则是先抑后扬之象。${name}近日已够劳心，不必被那几句童谣吓着，只管安心歇息，余下的风波自有我去挡。`,
        stance,
        tellClue: "指腹在「图谶」那一行多摩挲了半息，旋即不动声色地合上了签折。",
        hiddenMotive: `签中其实暗藏几分凶险与变数，但念及${name}近来奔波劳神，宁可先拣好听的宽慰，暗地里自己去替${name}查清底细。`
      };
    }
    if (stance === "selfish_lie") {
      return {
        reply: `（轻叩竹签，目光意味深长地落在${name}脸上）这童谣与图谶分明是在警示你：近日切忌轻信外人，也莫要独自远行。照我看，眼下最稳妥的破局之法，便是多留在我身边商议，免得平白落入旁人算计。`,
        stance,
        tellClue: "说至「多留在我身边」时眼底闪过一丝极淡的笃定笑意，语速比平日慢了半分。",
        hiddenMotive: `卦象本身未必真指向外患，不过正好借题发挥、顺水推舟，既能试探${name}的心意，又能把人多留在眼皮底下。`
      };
    }
    return {
      reply: `（眉梢微挑，将诗签、童谣与图谶逐一摊开）既请我来断，我便不拣虚词哄你。这支「${record?.hexagram || "卦签"}」吉中有险，童谣所指多半应验在近日往来之人身上。${name}心里当早有计较，切莫因一时心软误了决断。`,
      stance: "truth",
      tellClue: "神色坦然，话音落定后目光直直看着你，并无闪躲。",
      hiddenMotive: "此事干系重大，与其粉饰太平，不如据实相告，好让对方早作提防。"
    };
  }

  function buildOfflineFollowUp(ctx, thread, userQuestion) {
    const q = String(userQuestion || "");
    const stance = thread.stance || "truth";
    const name = ctx.userPersona?.name || "你";
    if (stance === "selfish_lie") {
      if (/哄|骗|瞒|假|心虚|破绽/.test(q)) {
        return {
          reply: `（闻言轻笑一声，不退反进）${name}倒真是敏锐。就算我方才添了三分私心，难道我说「外头风波未平」也是假话不成？信我这一回，总归亏不了你。`,
          stance: "selfish_lie",
          tellClue: "被点破后并未慌乱，反而顺势将竹签推回你掌心。",
          hiddenMotive: "既已被看出几分端倪，干脆半真半假地承认一半，反而更难叫人拆穿真正意图。"
        };
      }
      return {
        reply: `（神色从容）这其中的弯绕一时半刻说不尽，${name}只需记住一点——旁人的话听三分便罢，真正紧要的关头，还是先来问我。`,
        stance: "selfish_lie",
        tellClue: "巧妙避开了对童谣具体所指的正面回答。",
        hiddenMotive: "继续引导对方把重心放在自己身上，不愿节外生枝。"
      };
    }
    if (stance === "white_lie") {
      if (/哄|骗|瞒|假|真话/.test(q)) {
        return {
          reply: `（微微一怔，旋即无奈叹气）……果然什么都瞒不过${name}的眼睛。签里确有两句偏险，我只是不想见你平白添堵。既然你追问到此，我便把那点隐忧一并说与你听，咱们一起想法子便是。`,
          stance: "truth",
          tellClue: "眉宇间的刻意轻松褪去，神情认真了几分。",
          hiddenMotive: "见实在瞒不住，决定吐露实情，与对方并肩应对。"
        };
      }
      return {
        reply: `（温声安抚）无妨的，那几句图谶向来爱故弄玄虚。${name}只管照常行事，真有什么不对劲的苗头，我自会第一时间告诉你。`,
        stance: "white_lie",
        tellClue: "语气温柔，却下意识把签折往自己袖边挪了半寸。",
        hiddenMotive: "仍想独自替对方兜底，不愿让对方过早焦虑。"
      };
    }
    return {
      reply: `（颔首沉吟）你问得正中要害。照这三体签文互相印证来看，眼下切忌急于表态，不妨先按兵不动三日，待对方露出破绽再一举定局。`,
      stance: "truth",
      tellClue: "条理分明，坦荡如初。",
      hiddenMotive: "依然维持据实分析的立场，希望帮对方稳妥破局。"
    };
  }

  // ==========================================
  // 1. 首轮：指定名士解读卦签（含利益博弈与谎言机制）
  // ==========================================
  async function interpretOracleByCharacter({ record, charObj } = {}) {
    const Oracle = global.ChenweiAiOracle;
    if (!Oracle || !record || !charObj) throw new Error("INVALID_INTERPRET_ARGS");

    const ctx = await Oracle.collectCharacter5DContext(charObj);
    const cp = ctx.charProfile;
    if (!cp) throw new Error("NO_CHARACTER_PROFILE");

    const slipText = formatOracleSlipForPrompt(record);
    const sysPrompt = [
      buildCharacterContextHeader(ctx),
      "",
      "【本次场景：名士解签与人性博弈】",
      `问卦人刚刚在「谶纬小摊」抽得以下卦签（包含古诗签、东汉童谣、图谶秘语），此刻亲自拿来请你为 TA 解签。`,
      "请完全代入你的角色性格、个人利益、立场、与问卦人的亲疏及近期传讯氛围进行解签：",
      "- 你**不必**永远说绝对客观的大实话！你可以出于自身性格与利益自主决定策略（stance）：",
      "  1. truth（直言相告）：坦诚剖析签文（可引用诗签/童谣/图谶中的关键句）并给出真实建议；",
      "  2. white_lie（善意隐瞒）：若察觉凶象、隐忧或怕对方难过/涉险，出于保护或温柔哄劝，刻意往好里圆场或隐瞒部分凶兆；",
      "  3. selfish_lie（私心误导）：出于自身权谋利益、试探试心、醋意独占、掩饰秘密或想引导对方按你心意行事，故意曲解童谣/图谶含义误导对方。",
      "- 无论选择哪一种策略，你的出口话术（reply）都必须高度贴合自己的语言风格与口癖，且巧妙呼应卦签原文或近期传讯。",
      "- 同时给出一句极细微的神态/动作破绽（tellClue，15~36字，第三人称简短白描），以及你心底真正的盘算（hiddenMotive，35~75字）。",
      "只返回严格 JSON，不要额外解释：",
      "{\"reply\":\"90~170字名士第一人称解签话术\",\"stance\":\"truth|white_lie|selfish_lie\",\"tellClue\":\"15~36字微表情或动作细节\",\"hiddenMotive\":\"35~75字名士真实内心盘算\"}"
    ].join("\n");

    const userPrompt = `${slipText}\n\n请以「${cp.name}」的口吻为我解这支签。`;

    let parsedRes = null;
    let usedAi = false;
    try {
      const raw = await Oracle.callOracleLLM([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ], 680);
      const obj = Oracle.extractJsonObject(raw);
      if (obj && obj.reply) {
        parsedRes = {
          reply: String(obj.reply).trim(),
          stance: normalizeStance(obj.stance),
          tellClue: String(obj.tellClue || "神色如常，令人难辨深浅。").trim(),
          hiddenMotive: String(obj.hiddenMotive || "心中自有思量，不便尽数道破。").trim()
        };
        usedAi = true;
      } else if (raw && String(raw).trim()) {
        parsedRes = {
          reply: String(raw).trim().slice(0, 260),
          stance: "truth",
          tellClue: "端详签文片刻，缓缓道出心中所想。",
          hiddenMotive: "顺着当下心境据实回应。"
        };
        usedAi = true;
      }
    } catch (e) {}

    if (!parsedRes) {
      parsedRes = buildOfflineInterpretation(ctx, record);
    }

    const thread = {
      charId: cp.id,
      charName: cp.name,
      stance: parsedRes.stance,
      tellClue: parsedRes.tellClue,
      hiddenMotive: parsedRes.hiddenMotive,
      chatContextCount: ctx.recentChat ? ctx.recentChat.count : 0,
      usedAi,
      updatedAt: Date.now(),
      turns: [
        {
          id: `t_${Date.now()}_0`,
          role: "char",
          text: parsedRes.reply,
          stance: parsedRes.stance,
          tellClue: parsedRes.tellClue,
          hiddenMotive: parsedRes.hiddenMotive,
          at: Date.now()
        }
      ]
    };

    const updatedRecord = await Oracle.updateOracleRecord(record.id, (prev) => ({
      interpretations: {
        ...(prev.interpretations || {}),
        [cp.id]: thread
      }
    }));

    return { thread, updatedRecord: updatedRecord || { ...record, interpretations: { ...(record.interpretations || {}), [cp.id]: thread } } };
  }

  // ==========================================
  // 2. 多轮追问：用户继续质疑/套话/细问
  // ==========================================
  async function followUpOracleInterpretation({ record, charObj, thread, userQuestion } = {}) {
    const Oracle = global.ChenweiAiOracle;
    const qText = String(userQuestion || "").trim();
    if (!Oracle || !record || !charObj || !thread || !qText) {
      throw new Error("INVALID_FOLLOWUP_ARGS");
    }

    const ctx = await Oracle.collectCharacter5DContext(charObj);
    const cp = ctx.charProfile;
    const slipText = formatOracleSlipForPrompt(record);

    const prevTurns = Array.isArray(thread.turns) ? thread.turns : [];
    const keptTurns = prevTurns.length > 10
      ? [prevTurns[0], ...prevTurns.slice(-8)]
      : prevTurns;
    const dialogHistory = keptTurns
      .map((t) => `${t.role === "user" ? ctx.userPersona.name : cp.name}：${t.text}`)
      .join("\n");

    const sysPrompt = [
      buildCharacterContextHeader(ctx),
      "",
      "【原卦签内容】",
      slipText,
      "",
      "【你此前确立的解签立场与暗中心思】",
      `- 此前立场：${thread.stance}（${(STANCE_META[thread.stance] || STANCE_META.truth).label}）`,
      `- 此前心底盘算：${thread.hiddenMotive}`,
      "",
      "【此前解签与追问对话】",
      dialogHistory,
      "",
      "【本轮指令】",
      `问卦人（${ctx.userPersona.name}）现在针对你的解签发起了进一步追问。`,
      "请严格保持角色一贯人设与语气回应：",
      "- 若你此前在说善意谎言或私心误导，面对追问你可自主决定：继续巧妙圆谎、半真半假周旋、反将一军，或在对方步步紧逼/动之以情时松口坦白（此时可将 stance 改回 truth）；",
      "- 若你此前直言相告，则顺着卦象与传讯记忆继续深入剖析或给出更具体的破局筹谋。",
      "只返回严格 JSON，不要额外解释：",
      "{\"reply\":\"70~160字第一人称回应\",\"stance\":\"truth|white_lie|selfish_lie\",\"tellClue\":\"15~36字本轮微表情或动作细节\",\"hiddenMotive\":\"30~70字本轮最新内心盘算\"}"
    ].join("\n");

    let parsedRes = null;
    let usedAi = false;
    try {
      const raw = await Oracle.callOracleLLM([
        { role: "system", content: sysPrompt },
        { role: "user", content: `${ctx.userPersona.name}追问：${qText}` }
      ], 620);
      const obj = Oracle.extractJsonObject(raw);
      if (obj && obj.reply) {
        parsedRes = {
          reply: String(obj.reply).trim(),
          stance: normalizeStance(obj.stance || thread.stance),
          tellClue: String(obj.tellClue || "神色微动，思忖片刻后作答。").trim(),
          hiddenMotive: String(obj.hiddenMotive || thread.hiddenMotive || "").trim()
        };
        usedAi = true;
      } else if (raw && String(raw).trim()) {
        parsedRes = {
          reply: String(raw).trim().slice(0, 260),
          stance: thread.stance || "truth",
          tellClue: "顺着你的追问缓缓开口。",
          hiddenMotive: thread.hiddenMotive || ""
        };
        usedAi = true;
      }
    } catch (e) {}

    if (!parsedRes) {
      parsedRes = buildOfflineFollowUp(ctx, thread, qText);
    }

    const now = Date.now();
    const nextTurns = [
      ...prevTurns,
      { id: `u_${now}`, role: "user", text: qText, at: now },
      {
        id: `c_${now + 1}`,
        role: "char",
        text: parsedRes.reply,
        stance: parsedRes.stance,
        tellClue: parsedRes.tellClue,
        hiddenMotive: parsedRes.hiddenMotive,
        at: now + 1
      }
    ];

    const nextThread = {
      ...thread,
      stance: parsedRes.stance,
      tellClue: parsedRes.tellClue,
      hiddenMotive: parsedRes.hiddenMotive,
      usedAi: thread.usedAi || usedAi,
      updatedAt: now + 1,
      turns: nextTurns
    };

    const updatedRecord = await Oracle.updateOracleRecord(record.id, (prev) => ({
      interpretations: {
        ...(prev.interpretations || {}),
        [cp.id]: nextThread
      }
    }));

    return {
      thread: nextThread,
      updatedRecord: updatedRecord || { ...record, interpretations: { ...(record.interpretations || {}), [cp.id]: nextThread } }
    };
  }

  function buildShareSummary(record, thread) {
    const v = (record && record.verses) || {};
    const verseSnippet = String(v.poem || record?.oracleVerse || "").replace(/\n/g, " ");
    const lastCharTurn = thread && Array.isArray(thread.turns)
      ? [...thread.turns].reverse().find((t) => t.role === "char")
      : null;
    if (lastCharTurn) {
      return `我在谶纬小摊起卦问「${record?.question || "气运"}」，得【${record?.hexagram || "卦签"}】（${verseSnippet}）。方才听你解签道：「${lastCharTurn.text.slice(0, 80)}${lastCharTurn.text.length > 80 ? "…" : ""}」`;
    }
    return `我在谶纬小摊起卦问「${record?.question || "气运"}」，得【${record?.hexagram || "卦签"}】：${verseSnippet}`;
  }

  const api = {
    STANCE_META,
    QUICK_FOLLOWUPS,
    interpretOracleByCharacter,
    followUpOracleInterpretation,
    buildShareSummary
  };

  global.ChenweiCharInterpreter = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

