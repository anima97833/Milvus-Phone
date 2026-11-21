/**
 * Milvus/ink_poetry_app.js
 * 情侣空间 ·「笔墨诗书」独立模块化引擎（P0）
 * - 四大体裁：写诗（先秦至宋诸体）/ 作词（现代歌词、楚辞离骚、汉赋、宋词）/ 撰剧（微剧本）/ 书史（文言史料）
 * - 四维上下文：角色6维配置 + 设置-身份配置库 + 设置-开启世界书 + 传讯近30条有效聊天记录
 * - 用户打分与评语持久化至 IndexedDB（window.inkPoetryStore）
 */
(function (global) {
  "use strict";

  const GENRES = [
    {
      id: "poetry",
      label: "写诗",
      en: "POETRY",
      desc: "先秦至宋 · 诸体皆宜",
      seal: "诗",
      subStyles: ["由TA自定", "先秦四言", "汉魏乐府", "唐韵绝律", "宋风古体"],
      placeholder: "可选命题或意象，如：雨夜煮茶、檐下听风（留空由TA自定）",
      promptRule:
        "体裁要求【写诗】：从先秦《诗经》四言、楚辞体、汉魏乐府、五七言古风、唐代绝句/律诗到宋代诗体均可，请依据角色自身年代、性格、MBTI与语言风格自主选择最契合的诗体（若用户指定了倾向则优先遵循）。讲究意象凝练、声韵自然与真情实感，严禁现代网络用语或敷衍打油诗。诗句每行一句或一联，用 \\n 换行。"
    },
    {
      id: "lyrics",
      label: "作词",
      en: "LYRICS & ODE",
      desc: "现代抒情 · 楚辞汉赋",
      seal: "词",
      subStyles: ["由TA自定", "现代歌词", "楚辞离骚", "汉赋铺陈", "宋词雅韵"],
      placeholder: "可选情绪或关键词，如：星河奔赴、兰舟催发（留空由TA自定）",
      promptRule:
        "体裁要求【作词】：既可写富有画面感与旋律呼吸感的现代歌词（含 [主歌] / [副歌] / [桥段] 分段），也可参考屈原《离骚》楚辞体、汉赋铺陈排比或唐宋长短句词牌。请依角色气质与用户所选风格倾向灵活驾驭，确保韵律优美、情感饱满、分段清晰。"
    },
    {
      id: "drama",
      label: "撰剧",
      en: "DRAMA",
      desc: "一折小戏 · 声情并茂",
      seal: "剧",
      subStyles: ["由TA自定", "古风折子戏", "现代独幕剧", "悬疑心理剧", "荒诞喜剧"],
      placeholder: "可选场景或冲突，如：密室对峙、雨夜茶寮（留空由TA自定）",
      promptRule:
        "体裁要求【撰剧】：创作一折结构完整、可演出的微剧本（约 400~750 字）。正文中必须清晰包含：【人物】、【时空/布景】、以括号（）标注的舞台指示与神态动作，以及「角色名：台词」格式的对白与独白。将二人近期的互动细节与深层羁绊化入戏剧冲突中，极具画面感与张力。"
    },
    {
      id: "chronicle",
      label: "书史",
      en: "CHRONICLE",
      desc: "文言史笔 · 载录芳华",
      seal: "史",
      subStyles: ["由TA自定", "本纪列传", "起居实录", "稗官野史", "墓志铭赞"],
      placeholder: "可选记述之事，如：初遇记、冬夜共酌（留空由TA自定）",
      promptRule:
        "体裁要求【书史】：以纯正典雅的文言文史料笔法（如《史记》列传、起居注、世家或稗官野史）记述二人近期轶事、相处片刻或命运交汇（约 250~500 字）。严禁半文不白或现代大白话；epilogue 字段必须撰写一段「太史公曰：……」或「史臣曰：……」风格的史评赞语，于克制笔墨中见深情。"
    }
  ];

  const QUICK_RATING_TAGS = ["珠玉佳作", "深得我心", "韵味悠长", "意犹未尽", "略有瑕疵"];

  function getGenreMeta(genreId) {
    return GENRES.find((g) => g.id === genreId) || GENRES[0];
  }

  function getActiveUserPersona(mePersona) {
    try {
      const savedPersonas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      let activeUser = activeId ? savedPersonas.find((p) => String(p.id) === String(activeId)) : null;
      if (!activeUser && savedPersonas.length > 0) activeUser = savedPersonas[0];
      if (activeUser) {
        return {
          name: activeUser.name || mePersona?.name || "广陵王",
          identity: activeUser.identity || mePersona?.identity || "广陵王 / 绣衣楼主",
          personality: activeUser.personality || mePersona?.personality || "果敢敏锐、重情重义",
          background: activeUser.background || activeUser.bio || mePersona?.background || ""
        };
      }
    } catch (e) {}
    return {
      name: mePersona?.name || "广陵王",
      identity: mePersona?.identity || "广陵王 / 绣衣楼主",
      personality: mePersona?.personality || "果敢敏锐",
      background: mePersona?.background || ""
    };
  }

  async function resolveFullCharacter(taCharacter) {
    if (!taCharacter) return null;
    let full = taCharacter;
    try {
      let list = [];
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        list = await global.chatCharacterStore.getAll();
      } else {
        list = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      }
      const matched = (list || []).find(
        (c) => c && (String(c.id) === String(taCharacter.id) || (taCharacter.name && c.name === taCharacter.name))
      );
      if (matched) {
        full = {
          ...matched,
          ...taCharacter,
          profile: { ...(matched.profile || {}), ...(taCharacter.profile || {}) }
        };
      }
    } catch (e) {}

    const p = full.profile || {};
    return {
      id: full.id || taCharacter.id || "",
      name: full.name || p.name || "名士",
      mbti: p.mbti || full.mbti || "未设定",
      constellation: p.constellation || p.zodiac || full.constellation || full.zodiac || "未设定",
      speakingStyle: p.speakingStyle || p.style || full.speakingStyle || full.style || "贴合原作角色口吻与神韵",
      personality: p.personality || full.personality || "性格鲜明立体",
      background: p.background || p.bio || p.description || full.background || full.description || "身处乱世、与你羁绊深厚",
      avatar: full.avatar || p.avatar || ""
    };
  }

  function resolveMsgTime(msg, idx) {
    if (!msg) return idx;
    if (typeof msg.timestamp === "number" && msg.timestamp > 0) return msg.timestamp;
    if (typeof msg.timestamp === "string" && /^\d{10,13}$/.test(msg.timestamp)) return Number(msg.timestamp);
    if (msg.createdAt && !isNaN(Number(msg.createdAt))) return Number(msg.createdAt);
    const numId = Number(msg.id);
    if (!isNaN(numId) && numId > 1500000000000) return numId;
    return idx;
  }

  function cleanChatText(msg) {
    if (!msg) return "";
    if (msg.type === "system" || msg.tap === true) return "";
    let raw = String(msg.text || msg.content || "").trim();
    if (!raw) {
      if (msg.type === "sticker" || msg.type === "emoji") return "[表情包]";
      if (msg.type === "image" || msg.image) return "[图片]";
      return "";
    }
    // 剔除超大 Base64 数据串
    raw = raw.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, "[图片]");
    raw = raw.replace(/\s+/g, " ").trim();
    if (!raw) return "";
    if (raw.length > 120) raw = raw.slice(0, 118) + "…";
    return raw;
  }

  async function fetchRecentChatContext(charId, charName, userName, limit = 30) {
    let rawList = [];
    try {
      if (charId && global.chatHistoryStore && typeof global.chatHistoryStore.getAllMessages === "function") {
        const res = await global.chatHistoryStore.getAllMessages(charId);
        if (Array.isArray(res) && res.length > 0) rawList = res;
      }
    } catch (e) {}

    if (rawList.length === 0 && charId) {
      try {
        const ls = JSON.parse(localStorage.getItem("t8_chat_history_" + charId) || "[]");
        if (Array.isArray(ls)) rawList = ls;
      } catch (e) {}
    }

    if (!rawList || rawList.length === 0) {
      return {
        text: "（传讯中暂无近期聊天记录，请直接依据角色设定、用户身份与世界书背景自然创作）",
        count: 0
      };
    }

    const normalized = rawList
      .map((m, idx) => ({ msg: m, t: resolveMsgTime(m, idx), idx }))
      .sort((a, b) => (a.t !== b.t ? a.t - b.t : a.idx - b.idx))
      .map((item) => {
        const m = item.msg;
        const text = cleanChatText(m);
        if (!text) return null;
        const sender = String(m.sender || m.role || "").toLowerCase();
        const isUser = sender === "user" || sender === "me" || sender === "self" || m.isUser === true;
        return { speaker: isUser ? userName : charName, text };
      })
      .filter(Boolean);

    const recent = normalized.slice(-limit);
    // 控制总字符预算 <= 2400（优先保留最新消息）
    const selected = [];
    let totalLen = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      const line = `[${recent[i].speaker}]：${recent[i].text}`;
      if (totalLen + line.length > 2400 && selected.length > 0) break;
      selected.unshift(line);
      totalLen += line.length + 1;
    }

    return {
      text: selected.length > 0 ? selected.join("\n") : "（传讯中暂无有效文字消息）",
      count: selected.length
    };
  }

  async function buildFourDimContext(taCharacter, mePersona) {
    const charInfo = await resolveFullCharacter(taCharacter);
    const userInfo = getActiveUserPersona(mePersona);
    let worldContext = "未开启特定世界书，可按既有背景自然展开。";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldContext = wb;
      }
    } catch (e) {}

    const chatSnap = await fetchRecentChatContext(charInfo?.id, charInfo?.name || "角色", userInfo.name, 30);
    return { charInfo, userInfo, worldContext, chatSnap };
  }

  function callLLMAsync(messages) {
    return new Promise((resolve, reject) => {
      if (typeof global.sendToLLM !== "function") {
        reject(new Error("未配置 API，请先前往「设置 → API 配置中心」配置"));
        return;
      }
      global.sendToLLM(
        messages,
        { disableMCP: true },
        (reply) => resolve(reply),
        (err) => reject(new Error(typeof err === "string" ? err : err?.message || "AI 请求失败"))
      );
    });
  }

  function parseLiteraryResponse(rawText, fallbackGenreLabel) {
    const cleaned = String(rawText || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const tryParse = (str) => {
      try {
        const obj = JSON.parse(str);
        if (obj && typeof obj === "object" && (obj.content || obj.title)) return obj;
      } catch (e) {}
      return null;
    };

    let parsed = tryParse(cleaned);
    if (!parsed) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = tryParse(match[0]);
        if (!parsed) {
          // 尝试修复未转义换行
          const fixed = match[0].replace(/\r?\n/g, "\\n");
          parsed = tryParse(fixed);
        }
      }
    }

    if (parsed) {
      return {
        title: String(parsed.title || "无题").replace(/[《》]/g, "").trim(),
        styleTag: String(parsed.styleTag || fallbackGenreLabel || "").trim(),
        preface: String(parsed.preface || "").trim(),
        content: String(parsed.content || "").replace(/\\n/g, "\n").trim(),
        epilogue: String(parsed.epilogue || "").replace(/\\n/g, "\n").trim(),
        authorWhisper: String(parsed.authorWhisper || "").trim()
      };
    }

    // 兜底纯文本解析
    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const firstLine = (lines[0] || "无题").replace(/^[#【《]+|[】》]+$/g, "").trim();
    const body = lines.length > 1 ? lines.slice(1).join("\n") : cleaned;
    return {
      title: firstLine.length <= 24 ? firstLine : "无题",
      styleTag: fallbackGenreLabel || "",
      preface: "",
      content: body,
      epilogue: "",
      authorWhisper: ""
    };
  }

  async function generateLiteraryWork({ taCharacter, mePersona, genreId, subStyle, promptHint }) {
    const genre = getGenreMeta(genreId);
    const { charInfo, userInfo, worldContext, chatSnap } = await buildFourDimContext(taCharacter, mePersona);

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】，在情侣空间「笔墨诗书」中为【${userInfo.name}】亲手创作一篇【${genre.label}】。请深度融入以下四维设定与记忆：

【维度一·角色完整配置】
- 角色姓名与ID：${charInfo.name} (ID: ${charInfo.id})
- MBTI 性格类型：${charInfo.mbti}
- 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}

【维度二·用户身份设定】
- 姓名：${userInfo.name}
- 身份：${userInfo.identity}
- 性格与背景：${userInfo.personality}；${userInfo.background || "与你并肩同行之人"}

【维度三·当前开启的世界书条目】
${worldContext}

【维度四·传讯中近 ${chatSnap.count} 条聊天记录】
${chatSnap.text}

【创作原则】
1. 务必化用上述四维信息——尤其是角色自身文风与近期传讯中的情绪、称呼、梗或心事，切忌生硬照抄聊天原句。
2. 全程保持角色视角与文学质感，写给【${userInfo.name}】的专属作品，情真意切。`;

    const styleLine = subStyle && subStyle !== "由TA自定"
      ? `用户期望的风格倾向：【${subStyle}】，请以此风格为主进行创作。`
      : `风格倾向：由你依据自身角色气质与当下心境自由择体。`;
    const hintLine = promptHint && promptHint.trim()
      ? `用户给你的命题/灵感线索：「${promptHint.trim()}」，请自然融入作品。`
      : `本次未指定命题，请自由抒怀。`;

    const userPrompt = `${genre.promptRule}
${styleLine}
${hintLine}

请严格返回纯 JSON 对象（不要使用 \`\`\`json 代码块包裹，字符串内换行请使用 \\n）：
{
  "title": "作品标题（不含书名号）",
  "styleTag": "实际采用的体裁/词牌/戏种/史体标签（如：七言绝句 / 楚辞体 / 古风独幕剧 / 列传体）",
  "preface": "简短小序或题记（15~40字，可留空）",
  "content": "作品完整正文（保留诗行/段落/剧本对白换行）",
  "epilogue": "落款或史臣曰（书史体裁必填「太史公曰/史臣曰」，其他体裁可选）",
  "authorWhisper": "你递给${userInfo.name}这份作品时，以自身口吻说的一两句私语（30~75字）"
}`;

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);

    const parsed = parseLiteraryResponse(raw, genre.label);
    return {
      id: "ink_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      charId: String(charInfo.id || ""),
      charName: charInfo.name,
      userName: userInfo.name,
      genre: genre.id,
      subStyle: subStyle || "由TA自定",
      authorRole: "char",
      promptHint: (promptHint || "").trim(),
      title: parsed.title,
      styleTag: parsed.styleTag || genre.label,
      preface: parsed.preface,
      content: parsed.content,
      epilogue: parsed.epilogue,
      authorWhisper: parsed.authorWhisper,
      chatSnapshotCount: chatSnap.count,
      rating: null,
      charReaction: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function parseReviewJson(rawText) {
    const cleaned = String(rawText || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const tryParse = (str) => {
      try {
        const obj = JSON.parse(str);
        if (obj && typeof obj === "object" && (obj.comment || obj.score !== undefined)) return obj;
      } catch (e) {}
      return null;
    };
    let parsed = tryParse(cleaned);
    if (!parsed) {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) parsed = tryParse(m[0]) || tryParse(m[0].replace(/\r?\n/g, "\\n"));
    }
    if (parsed) {
      let sc = Number(parsed.score);
      if (isNaN(sc) || sc < 1) sc = 9.0;
      if (sc > 10) sc = 10;
      sc = Math.round(sc * 10) / 10;
      return {
        score: sc,
        rankLabel: String(parsed.rankLabel || "情真意切").trim().slice(0, 8),
        favoriteLine: String(parsed.favoriteLine || "").trim(),
        comment: String(parsed.comment || "").replace(/\\n/g, "\n").trim()
      };
    }
    return {
      score: 9.0,
      rankLabel: "情真意切",
      favoriteLine: "",
      comment: cleaned || "读罢此篇，字字皆见心意，甚合我心。"
    };
  }

  async function reviewUserLiteraryWork({ taCharacter, mePersona, genreId, title, styleTag, content }) {
    const genre = getGenreMeta(genreId);
    const { charInfo, userInfo, worldContext, chatSnap } = await buildFourDimContext(taCharacter, mePersona);

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】，正在情侣空间「笔墨诗书」中细读【${userInfo.name}】亲手为你写的一篇【${genre.label}】，并为其打分与撰写走心赏析。请严格恪守以下四维设定与记忆：

【维度一·角色完整配置】
- 角色姓名与ID：${charInfo.name} (ID: ${charInfo.id})
- MBTI 性格类型：${charInfo.mbti}
- 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}

【维度二·用户身份设定】
- 姓名：${userInfo.name}
- 身份：${userInfo.identity}
- 性格与背景：${userInfo.personality}；${userInfo.background || "与你同行之人"}

【维度三·当前开启的世界书条目】
${worldContext}

【维度四·传讯中近 ${chatSnap.count} 条聊天记录】
${chatSnap.text}`;

    const userPrompt = `【${userInfo.name} 赠予你的作品】
- 体裁：${genre.label}${styleTag ? `（${styleTag}）` : ""}
- 标题：《${title || "无题"}》
- 正文：
${content}

请你以【${charInfo.name}】本人的口吻细细品读后，给出你的评分与走心赏析。请严格返回纯 JSON 对象（不要 \`\`\`json 包裹）：
{
  "score": 9.5,
  "rankLabel": "四字雅评，如：珠玉佳作 / 情真意切 / 妙笔生花",
  "favoriteLine": "从对方作品中摘录你最心动的一句原文（若无合适则留空）",
  "comment": "100~180字贴合你性格与语言风格的专属赏析与情感回应"
}`;

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);
    const rev = parseReviewJson(raw);

    return {
      id: "ink_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      charId: String(charInfo.id || ""),
      charName: charInfo.name,
      userName: userInfo.name,
      genre: genre.id,
      subStyle: styleTag || genre.label,
      authorRole: "user",
      promptHint: "",
      title: (title || "").replace(/[《》]/g, "").trim() || "无题",
      styleTag: (styleTag || "").trim() || genre.label,
      preface: "",
      content: String(content || "").trim(),
      epilogue: "",
      authorWhisper: "",
      chatSnapshotCount: chatSnap.count,
      rating: {
        score: rev.score,
        rankLabel: rev.rankLabel,
        favoriteLine: rev.favoriteLine,
        comment: rev.comment,
        ratedBy: "char",
        ratedAt: Date.now()
      },
      charReaction: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  async function generateCharRatingReaction({ taCharacter, mePersona, work, rating }) {
    const { charInfo, userInfo } = await buildFourDimContext(taCharacter, mePersona);
    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】。
- MBTI：${charInfo.mbti} | 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}
请完全以角色本人的口吻回应，不要加任何旁白前缀或引号包裹。`;

    const excerpt = String(work.content || "").replace(/\s+/g, " ").slice(0, 140);
    const userPrompt = `你方才在「笔墨诗书」中为【${userInfo.name}】写了一篇《${work.title}》（${work.styleTag || ""}，节选：${excerpt}）。
现在【${userInfo.name}】给你打了 ${rating.score} / 10 分（雅评：${rating.rankLabel || "无"}），并留下评语：「${rating.comment || "未留文字评语，只打了分"}」。
请以你的性格与语言风格，用 2~3 句话（约 45~100 字）自然回应这份评分与评语（如得高分时的欢喜/克制骄傲，或分数不高时的撒娇/不服/约定下次再写）。`;

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);
    return String(raw || "").replace(/^["“「]+|["”」]+$/g, "").trim();
  }

  async function translateChronicleWork(work) {
    const sysPrompt = "你是一位精通中国古代史学与文言文的典雅译者。请将用户提供的文言史料与史评忠实、流畅、优雅地译为现代白话文，保留其含蓄深情与典雅气韵，不要添加多余解释或前缀。";
    const fullText = [
      `标题：《${work.title}》`,
      work.preface ? `题记：${work.preface}` : "",
      `正文：\n${work.content}`,
      work.epilogue ? `史评：\n${work.epilogue}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");

    const raw = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: `请将以下文言文书史作品译为现代白话文（分段清晰）：\n\n${fullText}` }
    ]);
    return String(raw || "").replace(/^```[a-z]*|```$/gi, "").trim();
  }

  function formatDateShort(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 渲染不同体裁的正文排版
  function renderGenreContent(work) {
    const h = React.createElement;
    const lines = String(work.content || "").split(/\r?\n/);

    if (work.genre === "poetry") {
      return h(
        "div",
        {
          style: {
            textAlign: "center",
            fontFamily: "'Noto Serif SC', 'Songti SC', 'STSong', Georgia, serif",
            fontSize: "16px",
            lineHeight: "2.15",
            letterSpacing: "0.08em",
            color: "#2C2825",
            padding: "8px 4px"
          }
        },
        lines.map((line, i) =>
          h("div", { key: i, style: { minHeight: line.trim() ? "auto" : "12px" } }, line)
        )
      );
    }

    if (work.genre === "drama") {
      return h(
        "div",
        {
          style: {
            fontFamily: "'Noto Serif SC', 'Songti SC', Georgia, serif",
            fontSize: "14px",
            lineHeight: "1.9",
            color: "#2C2825",
            display: "flex",
            flexDirection: "column",
            gap: "6px"
          }
        },
        lines.map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return h("div", { key: i, style: { height: "6px" } });
          const isStageDir = /^[（(\[【]/.test(trimmed) && /[）)\]】]$/.test(trimmed);
          const speakerMatch = trimmed.match(/^([^：:]{1,12})[：:](.*)$/);
          if (isStageDir) {
            return h(
              "div",
              {
                key: i,
                style: {
                  fontSize: "12.5px",
                  color: "#7C7268",
                  fontStyle: "italic",
                  padding: "2px 8px",
                  background: "rgba(184, 93, 67, 0.04)",
                  borderRadius: "6px"
                }
              },
              trimmed
            );
          }
          if (speakerMatch) {
            return h(
              "div",
              { key: i },
              h("span", { style: { fontWeight: 700, color: "#8C3D2B", marginRight: "4px" } }, speakerMatch[1] + "："),
              h("span", null, speakerMatch[2])
            );
          }
          return h("div", { key: i, style: { color: "#4A433C" } }, trimmed);
        })
      );
    }

    if (work.genre === "chronicle") {
      return h(
        "div",
        {
          style: {
            fontFamily: "'Noto Serif SC', 'Songti SC', 'STSong', Georgia, serif",
            fontSize: "15px",
            lineHeight: "2.05",
            letterSpacing: "0.04em",
            color: "#2C2825",
            textAlign: "justify"
          }
        },
        lines.map((line, i) =>
          line.trim()
            ? h("p", { key: i, style: { textIndent: "2em", margin: "0 0 10px 0" } }, line.trim())
            : null
        )
      );
    }

    // lyrics（作词）
    return h(
      "div",
      {
        style: {
          fontFamily: "'Noto Serif SC', 'Songti SC', Georgia, serif",
          fontSize: "15px",
          lineHeight: "2.0",
          letterSpacing: "0.04em",
          color: "#2C2825",
          textAlign: "center"
        }
      },
      lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return h("div", { key: i, style: { height: "12px" } });
        const isSectionTag = /^[\[\【].{1,12}[\]\】]$/.test(trimmed);
        return h(
          "div",
          {
            key: i,
            style: isSectionTag
              ? {
                  fontSize: "11px",
                  color: "#B85D43",
                  letterSpacing: "0.14em",
                  marginTop: "10px",
                  marginBottom: "4px",
                  fontWeight: 600
                }
              : {}
          },
          trimmed
        );
      })
    );
  }

  // 主弹窗组件
  const InkPoetryModal = ({ isOpen, onClose, taCharacter, mePersona }) => {
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;
    const exportPaperRef = useRef(null);

    const [view, setView] = useState("home"); // "home" | "studio" | "history"
    const [authorMode, setAuthorMode] = useState("char"); // "char" (TA为我写) | "user" (我为TA写)
    const [selectedGenre, setSelectedGenre] = useState("poetry");
    const [subStyle, setSubStyle] = useState("由TA自定");
    const [promptHint, setPromptHint] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [isReacting, setIsReacting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const [currentWork, setCurrentWork] = useState(null);
    const [savedWorks, setSavedWorks] = useState([]);

    // 用户自写状态（我为TA写）
    const [userTitleDraft, setUserTitleDraft] = useState("");
    const [userStyleDraft, setUserStyleDraft] = useState("");
    const [userContentDraft, setUserContentDraft] = useState("");

    // 用户打分状态
    const [scoreDraft, setScoreDraft] = useState(9.0);
    const [tagDraft, setTagDraft] = useState("");
    const [commentDraft, setCommentDraft] = useState("");
    const [ratingSavedNotice, setRatingSavedNotice] = useState(false);

    // 典藏筛选状态
    const [historyGenreFilter, setHistoryGenreFilter] = useState("all");
    const [historyAuthorFilter, setHistoryAuthorFilter] = useState("all");
    const [historyQuery, setHistoryQuery] = useState("");

    // P2 状态：书史今译、复制与导长图
    const [showTranslation, setShowTranslation] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [copyNotice, setCopyNotice] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const charId = String(taCharacter?.id || "");
    const charName = taCharacter?.name || taCharacter?.profile?.name || "名士";

    const loadHistory = async () => {
      try {
        if (global.inkPoetryStore && typeof global.inkPoetryStore.getByCharId === "function") {
          const list = await global.inkPoetryStore.getByCharId(charId);
          setSavedWorks(list || []);
        }
      } catch (e) {
        setSavedWorks([]);
      }
    };

    useEffect(() => {
      if (!isOpen) return;
      setView("home");
      setCurrentWork(null);
      setErrorMsg("");
      loadHistory();
    }, [isOpen, charId]);

    if (!isOpen) return null;

    const genreMeta = getGenreMeta(selectedGenre);

    const handleEnterGenre = (genreId) => {
      setSelectedGenre(genreId);
      setSubStyle("由TA自定");
      setPromptHint("");
      setUserTitleDraft("");
      setUserStyleDraft("");
      setUserContentDraft("");
      setCurrentWork(null);
      setErrorMsg("");
      setRatingSavedNotice(false);
      setScoreDraft(9.0);
      setTagDraft("");
      setCommentDraft("");
      setView("studio");
    };

    const handleSubmitUserWork = async () => {
      if (isGenerating) return;
      const body = userContentDraft.trim();
      if (!body) {
        setErrorMsg("请先写下你的作品正文，再呈与 TA 赏鉴");
        return;
      }
      setIsGenerating(true);
      setErrorMsg("");
      try {
        const work = await reviewUserLiteraryWork({
          taCharacter,
          mePersona,
          genreId: selectedGenre,
          title: userTitleDraft,
          styleTag: userStyleDraft,
          content: body
        });
        setCurrentWork(work);
        if (global.inkPoetryStore && typeof global.inkPoetryStore.save === "function") {
          await global.inkPoetryStore.save(work);
          await loadHistory();
        }
      } catch (e) {
        setErrorMsg(e?.message || "呈递赏鉴失败，请稍后重试");
      } finally {
        setIsGenerating(false);
      }
    };

    const handleTriggerCharReaction = async (workObj, ratingObj) => {
      const targetWork = workObj || currentWork;
      const targetRating = ratingObj || targetWork?.rating;
      if (!targetWork || !targetRating || isReacting) return;
      setIsReacting(true);
      setErrorMsg("");
      try {
        const reaction = await generateCharRatingReaction({
          taCharacter,
          mePersona,
          work: targetWork,
          rating: targetRating
        });
        const updated = {
          ...targetWork,
          rating: targetRating,
          charReaction: reaction,
          updatedAt: Date.now()
        };
        setCurrentWork(updated);
        if (global.inkPoetryStore && typeof global.inkPoetryStore.save === "function") {
          await global.inkPoetryStore.save(updated);
          await loadHistory();
        }
      } catch (e) {
        setErrorMsg(e?.message || "获取角色回应失败");
      } finally {
        setIsReacting(false);
      }
    };

    const handleGenerate = async () => {
      if (isGenerating) return;
      setIsGenerating(true);
      setErrorMsg("");
      setRatingSavedNotice(false);
      try {
        const work = await generateLiteraryWork({
          taCharacter,
          mePersona,
          genreId: selectedGenre,
          subStyle,
          promptHint
        });
        setCurrentWork(work);
        setScoreDraft(9.0);
        setTagDraft("");
        setCommentDraft("");
        if (global.inkPoetryStore && typeof global.inkPoetryStore.save === "function") {
          await global.inkPoetryStore.save(work);
          await loadHistory();
        }
      } catch (e) {
        setErrorMsg(e?.message || "落笔失败，请稍后重试");
      } finally {
        setIsGenerating(false);
      }
    };

    const handleSaveRating = async (withReaction) => {
      if (!currentWork) return;
      const ratingObj = {
        score: Number(scoreDraft),
        rankLabel: tagDraft || (scoreDraft >= 9 ? "珠玉佳作" : scoreDraft >= 7.5 ? "韵味悠长" : "可圈可点"),
        comment: commentDraft.trim(),
        ratedBy: "user",
        ratedAt: Date.now()
      };
      const updated = {
        ...currentWork,
        rating: ratingObj,
        updatedAt: Date.now()
      };
      setCurrentWork(updated);
      try {
        if (global.inkPoetryStore && typeof global.inkPoetryStore.save === "function") {
          await global.inkPoetryStore.save(updated);
          await loadHistory();
        }
        setRatingSavedNotice(true);
        setTimeout(() => setRatingSavedNotice(false), 2000);
        if (withReaction === true) {
          await handleTriggerCharReaction(updated, ratingObj);
        }
      } catch (e) {
        setErrorMsg("保存评分失败：" + (e?.message || e));
      }
    };

    const handleOpenSavedWork = (work) => {
      setSelectedGenre(work.genre || "poetry");
      setAuthorMode(work.authorRole === "user" ? "user" : "char");
      setCurrentWork(work);
      setScoreDraft(work.rating?.score ?? 9.0);
      setTagDraft(work.rating?.rankLabel || "");
      setCommentDraft(work.rating?.comment || "");
      setRatingSavedNotice(false);
      setShowTranslation(false);
      setErrorMsg("");
      setView("studio");
    };

    const handleToggleTranslation = async () => {
      if (!currentWork || isTranslating) return;
      if (currentWork.translation) {
        setShowTranslation((prev) => !prev);
        return;
      }
      setIsTranslating(true);
      setErrorMsg("");
      try {
        const trans = await translateChronicleWork(currentWork);
        const updated = { ...currentWork, translation: trans, updatedAt: Date.now() };
        setCurrentWork(updated);
        setShowTranslation(true);
        if (global.inkPoetryStore && typeof global.inkPoetryStore.save === "function") {
          await global.inkPoetryStore.save(updated);
          await loadHistory();
        }
      } catch (e) {
        setErrorMsg("生成白话今译失败：" + (e?.message || e));
      } finally {
        setIsTranslating(false);
      }
    };

    const handleCopyWork = async () => {
      if (!currentWork) return;
      const gm = getGenreMeta(currentWork.genre);
      const relation =
        currentWork.authorRole === "user"
          ? `${currentWork.userName} 赠 ${currentWork.charName}`
          : `${currentWork.charName} 赠 ${currentWork.userName}`;
      const parts = [
        `《${currentWork.title}》`,
        `【${currentWork.styleTag || gm.label} · ${relation}】`,
        currentWork.preface ? `题记：${currentWork.preface}` : "",
        "",
        currentWork.content || "",
        currentWork.epilogue ? `\n${currentWork.epilogue}` : "",
        currentWork.translation ? `\n【白话今译】\n${currentWork.translation}` : "",
        currentWork.rating
          ? `\n【品评】${currentWork.rating.score} 分（${currentWork.rating.rankLabel || "已评"}）${
              currentWork.rating.comment ? "：" + currentWork.rating.comment : ""
            }`
          : "",
        currentWork.charReaction ? `【${currentWork.charName} 回响】${currentWork.charReaction}` : ""
      ].filter((p) => p !== "");
      const text = parts.join("\n").trim();

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setCopyNotice(true);
        setTimeout(() => setCopyNotice(false), 2000);
      } catch (e) {
        setErrorMsg("复制失败，请手动长按选择文字");
      }
    };

    const handleExportWorkImage = async () => {
      if (!currentWork || !exportPaperRef.current || isExporting) return;
      if (typeof global.html2canvas !== "function") {
        setErrorMsg("当前环境未加载 html2canvas，暂无法导出长图");
        return;
      }
      setIsExporting(true);
      setErrorMsg("");
      try {
        const canvas = await global.html2canvas(exportPaperRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#FFFDF9"
        });
        const link = document.createElement("a");
        const safeTitle = String(currentWork.title || "笔墨诗书").replace(/[\\/:*?"<>|]/g, "_");
        link.download = `笔墨诗书_${safeTitle}.png`;
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        setErrorMsg("导出长图失败：" + (e?.message || e));
      } finally {
        setIsExporting(false);
      }
    };

    const handleDeleteWork = async (id, e) => {
      if (e) e.stopPropagation();
      try {
        if (global.inkPoetryStore && typeof global.inkPoetryStore.delete === "function") {
          await global.inkPoetryStore.delete(id);
          await loadHistory();
          if (currentWork && currentWork.id === id) setCurrentWork(null);
        }
      } catch (err) {}
    };

    // 顶部导航栏
    const renderHeader = () =>
      h(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid #ECE6DC",
            background: "#FAF8F5",
            flexShrink: 0
          }
        },
        h(
          "button",
          {
            onClick: () => {
              if (view === "home") onClose();
              else setView("home");
            },
            style: {
              border: "none",
              background: "transparent",
              color: "#574F47",
              fontSize: "14px",
              cursor: "pointer",
              padding: "4px 6px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }
          },
          view === "home" ? "✕ 关闭" : "← 返回"
        ),
        h(
          "div",
          {
            style: {
              fontFamily: "'Noto Serif SC', 'Songti SC', Georgia, serif",
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#2C2825"
            }
          },
          view === "studio" ? `笔墨诗书 · ${genreMeta.label}` : view === "history" ? "诗书典藏" : "笔墨诗书"
        ),
        view === "history"
          ? h("div", { style: { width: "54px" } })
          : h(
              "button",
              {
                onClick: () => setView("history"),
                style: {
                  border: "1px solid #E2D9CC",
                  background: "#FFFFFF",
                  color: "#6B5E52",
                  fontSize: "12px",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  cursor: "pointer"
                }
              },
              `典藏 ${savedWorks.length}`
            )
      );

    // 首屏：极简四宫格
    const renderHome = () =>
      h(
        "div",
        {
          style: {
            flex: 1,
            overflowY: "auto",
            padding: "24px 20px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "20px"
          }
        },
        // 顶部执笔人信息
        h(
          "div",
          {
            style: {
              textAlign: "center",
              padding: "6px 8px 2px"
            }
          },
          h(
            "div",
            {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "5px 14px",
                borderRadius: "999px",
                background: "#FFFFFF",
                border: "1px solid #EAE2D6",
                fontSize: "12px",
                color: "#574F47"
              }
            },
            h("span", {
              style: {
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#B85D43"
              }
            }),
            `当前执笔：${charName}`
          ),
          h(
            "div",
            {
              style: {
                marginTop: "10px",
                fontSize: "12px",
                color: "#8E8377",
                letterSpacing: "0.04em"
              }
            },
            authorMode === "char"
              ? "融入人设、身份、世界书与近 30 条传讯记忆，为你落笔"
              : `由你亲手提笔赠予 ${charName}，请 TA 细读品评打分`
          ),
          // 双向模式切换胶囊
          h(
            "div",
            {
              style: {
                marginTop: "14px",
                display: "inline-flex",
                background: "#EFEAE1",
                borderRadius: "999px",
                padding: "3px",
                gap: "4px"
              }
            },
            [
              { id: "char", label: `${charName} 为我写` },
              { id: "user", label: `我为 ${charName} 写` }
            ].map((m) => {
              const active = authorMode === m.id;
              return h(
                "button",
                {
                  key: m.id,
                  onClick: () => setAuthorMode(m.id),
                  style: {
                    border: "none",
                    borderRadius: "999px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: active ? 600 : 400,
                    background: active ? "#FFFFFF" : "transparent",
                    color: active ? "#2C2825" : "#7C7268",
                    boxShadow: active ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                    cursor: "pointer"
                  }
                },
                m.label
              );
            })
          )
        ),

        // 四大体裁 2x2 极简卡片
        h(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px"
            }
          },
          GENRES.map((g) =>
            h(
              "div",
              {
                key: g.id,
                onClick: () => handleEnterGenre(g.id),
                style: {
                  background: "#FFFFFF",
                  border: "1px solid #EAE2D6",
                  borderRadius: "16px",
                  padding: "22px 16px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  gap: "10px",
                  transition: "transform 0.15s ease, border-color 0.15s ease",
                  boxShadow: "0 2px 10px rgba(44, 40, 37, 0.03)"
                }
              },
              h(
                "div",
                {
                  style: {
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    border: "1.5px solid #B85D43",
                    color: "#B85D43",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'Noto Serif SC', 'Songti SC', Georgia, serif",
                    fontSize: "20px",
                    fontWeight: 700,
                    background: "rgba(184, 93, 67, 0.04)"
                  }
                },
                g.seal
              ),
              h(
                "div",
                {
                  style: {
                    fontFamily: "'Noto Serif SC', 'Songti SC', Georgia, serif",
                    fontSize: "17px",
                    fontWeight: 700,
                    color: "#2C2825",
                    letterSpacing: "0.1em"
                  }
                },
                g.label
              ),
              h(
                "div",
                {
                  style: {
                    fontSize: "11.5px",
                    color: "#8E8377",
                    lineHeight: "1.4"
                  }
                },
                g.desc
              )
            )
          )
        ),

        // 最近典藏快捷预览（若有）
        savedWorks.length > 0 &&
          h(
            "div",
            {
              style: {
                marginTop: "4px",
                background: "#FFFFFF",
                border: "1px solid #EAE2D6",
                borderRadius: "14px",
                padding: "14px 16px"
              }
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px"
                }
              },
              h("span", { style: { fontSize: "12px", fontWeight: 600, color: "#6B5E52" } }, "最近落笔"),
              h(
                "span",
                {
                  onClick: () => setView("history"),
                  style: { fontSize: "11.5px", color: "#B85D43", cursor: "pointer" }
                },
                "查看全部 →"
              )
            ),
            savedWorks.slice(0, 3).map((w) => {
              const gm = getGenreMeta(w.genre);
              return h(
                "div",
                {
                  key: w.id,
                  onClick: () => handleOpenSavedWork(w),
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderTop: "1px solid #F3EEE6",
                    cursor: "pointer"
                  }
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 } },
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "11px",
                        color: "#B85D43",
                        border: "1px solid rgba(184,93,67,0.35)",
                        borderRadius: "4px",
                        padding: "1px 5px",
                        flexShrink: 0
                      }
                    },
                    gm.seal
                  ),
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "13.5px",
                        color: "#2C2825",
                        fontFamily: "'Noto Serif SC', serif",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }
                    },
                    `《${w.title}》`
                  )
                ),
                h(
                  "span",
                  { style: { fontSize: "11.5px", color: "#8E8377", flexShrink: 0, marginLeft: "8px" } },
                  w.rating ? `${w.rating.score}分` : formatDateShort(w.createdAt).slice(5, 10)
                )
              );
            })
          )
      );

    // 创作与素笺展示页
    const renderStudio = () => {
      const isUserAuthor = currentWork ? currentWork.authorRole === "user" : authorMode === "user";
      return h(
        "div",
        {
          style: {
            flex: 1,
            overflowY: "auto",
            padding: "18px 18px 36px",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }
        },
        // 顶部创作模式切换条（仅新建/未展示或想重写时可见）
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }
          },
          h(
            "div",
            {
              style: {
                display: "inline-flex",
                background: "#EFEAE1",
                borderRadius: "999px",
                padding: "2px",
                gap: "2px"
              }
            },
            [
              { id: "char", label: "TA 为我写" },
              { id: "user", label: "我为 TA 写" }
            ].map((m) => {
              const active = authorMode === m.id;
              return h(
                "button",
                {
                  key: m.id,
                  onClick: () => {
                    setAuthorMode(m.id);
                    setCurrentWork(null);
                    setErrorMsg("");
                  },
                  style: {
                    border: "none",
                    borderRadius: "999px",
                    padding: "4px 12px",
                    fontSize: "11.5px",
                    fontWeight: active ? 600 : 400,
                    background: active ? "#FFFFFF" : "transparent",
                    color: active ? "#2C2825" : "#7C7268",
                    cursor: "pointer"
                  }
                },
                m.label
              );
            })
          ),
          currentWork &&
            h(
              "button",
              {
                onClick: () => {
                  setCurrentWork(null);
                  setUserTitleDraft("");
                  setUserStyleDraft("");
                  setUserContentDraft("");
                  setErrorMsg("");
                },
                style: {
                  border: "1px solid #E2D9CC",
                  background: "#FFFFFF",
                  color: "#6B5E52",
                  fontSize: "11.5px",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  cursor: "pointer"
                }
              },
              "新起一篇"
            )
        ),

        // 创作配置条：TA 为我写 vs 我为 TA 写
        authorMode === "char"
          ? h(
              "div",
              {
                style: {
                  background: "#FFFFFF",
                  border: "1px solid #EAE2D6",
                  borderRadius: "14px",
                  padding: "14px"
                }
              },
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "#7C7268",
                    marginBottom: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }
                },
                h("span", null, `风格倾向 · ${genreMeta.label}`),
                h("span", { style: { fontSize: "11px", color: "#A4998D" } }, genreMeta.desc)
              ),
              h(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" } },
                genreMeta.subStyles.map((st) => {
                  const active = subStyle === st;
                  return h(
                    "button",
                    {
                      key: st,
                      onClick: () => setSubStyle(st),
                      style: {
                        border: active ? "1px solid #B85D43" : "1px solid #E5DDD1",
                        background: active ? "rgba(184,93,67,0.08)" : "#FAF8F5",
                        color: active ? "#B85D43" : "#6B5E52",
                        fontSize: "12px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        cursor: "pointer"
                      }
                    },
                    st
                  );
                })
              ),
              h("input", {
                type: "text",
                value: promptHint,
                onChange: (e) => setPromptHint(e.target.value),
                placeholder: genreMeta.placeholder,
                style: {
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #E8E0D4",
                  borderRadius: "10px",
                  padding: "9px 12px",
                  fontSize: "13px",
                  color: "#2C2825",
                  background: "#FAF8F5",
                  outline: "none",
                  marginBottom: "10px"
                }
              }),
              h(
                "button",
                {
                  onClick: handleGenerate,
                  disabled: isGenerating,
                  style: {
                    width: "100%",
                    border: "none",
                    borderRadius: "10px",
                    padding: "11px 16px",
                    background: isGenerating ? "#C9B9AA" : "#2C2825",
                    color: "#FAF8F5",
                    fontSize: "14px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    cursor: isGenerating ? "not-allowed" : "pointer"
                  }
                },
                isGenerating ? `研墨落笔中，请静候 ${charName} ……` : currentWork ? `请 ${charName} 再作一篇` : `请 ${charName} 执笔`
              )
            )
          : !currentWork &&
            h(
              "div",
              {
                style: {
                  background: "#FFFFFF",
                  border: "1px solid #EAE2D6",
                  borderRadius: "14px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px"
                }
              },
              h(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                h("span", { style: { fontSize: "12.5px", fontWeight: 600, color: "#2C2825" } }, `执笔赠 ${charName} · ${genreMeta.label}`),
                h("span", { style: { fontSize: "11px", color: "#9A8F82" } }, `${userContentDraft.replace(/\s+/g, "").length} 字`)
              ),
              h(
                "div",
                { style: { display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "8px" } },
                h("input", {
                  type: "text",
                  value: userTitleDraft,
                  onChange: (e) => setUserTitleDraft(e.target.value),
                  placeholder: "作品标题（可留空）",
                  style: {
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid #E8E0D4",
                    borderRadius: "10px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    color: "#2C2825",
                    background: "#FAF8F5",
                    outline: "none"
                  }
                }),
                h("input", {
                  type: "text",
                  value: userStyleDraft,
                  onChange: (e) => setUserStyleDraft(e.target.value),
                  placeholder: `体裁标注（如${genreMeta.subStyles[1] || genreMeta.label}）`,
                  style: {
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid #E8E0D4",
                    borderRadius: "10px",
                    padding: "8px 10px",
                    fontSize: "12.5px",
                    color: "#2C2825",
                    background: "#FAF8F5",
                    outline: "none"
                  }
                })
              ),
              h("textarea", {
                rows: 7,
                value: userContentDraft,
                onChange: (e) => setUserContentDraft(e.target.value),
                placeholder:
                  selectedGenre === "poetry"
                    ? "请写下你的诗句（每句换行）……"
                    : selectedGenre === "lyrics"
                    ? "请写下你的歌词、楚辞或汉赋段落……"
                    : selectedGenre === "drama"
                    ? "请写下你的微剧本（可用括号写舞台指示，用「角色名：台词」写对白）……"
                    : "请以文言史笔写下你想载录的片段……",
                style: {
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #E8E0D4",
                  borderRadius: "12px",
                  padding: "12px",
                  fontSize: "14px",
                  lineHeight: "1.85",
                  fontFamily: "'Noto Serif SC', 'Songti SC', Georgia, serif",
                  color: "#2C2825",
                  background: "#FFFDF9",
                  resize: "vertical",
                  outline: "none"
                }
              }),
              h(
                "button",
                {
                  onClick: handleSubmitUserWork,
                  disabled: isGenerating || !userContentDraft.trim(),
                  style: {
                    width: "100%",
                    border: "none",
                    borderRadius: "10px",
                    padding: "11px 16px",
                    background: isGenerating || !userContentDraft.trim() ? "#C9B9AA" : "#B85D43",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    cursor: isGenerating || !userContentDraft.trim() ? "not-allowed" : "pointer"
                  }
                },
                isGenerating ? `${charName} 正在展卷细读并品评……` : `呈与 ${charName} 赏鉴打分`
              )
            ),

        errorMsg &&
          h(
            "div",
            {
              style: {
                padding: "10px 14px",
                borderRadius: "10px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#B91C1C",
                fontSize: "12.5px"
              }
            },
            errorMsg
          ),

        // 素笺成品展示区（支持 html2canvas 纪念长图导出）
        currentWork &&
          h(
            "div",
            {
              ref: exportPaperRef,
              style: {
                background: "#FFFDF9",
                border: "1px solid #E7DEC9",
                borderRadius: "16px",
                padding: "24px 20px",
                boxShadow: "0 4px 18px rgba(44, 40, 37, 0.04)",
                position: "relative"
              }
            },
            // 右上角评分印章（已评分时）
            currentWork.rating &&
              h(
                "div",
                {
                  style: {
                    position: "absolute",
                    top: "16px",
                    right: "16px",
                    border: "1.5px solid #B85D43",
                    color: "#B85D43",
                    borderRadius: "8px",
                    padding: "3px 8px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    background: "rgba(184,93,67,0.05)",
                    fontFamily: "'Noto Serif SC', serif"
                  }
                },
                `${currentWork.rating.score} 分 · ${currentWork.rating.rankLabel || "已评"}`
              ),

            // 标题与副标
            h(
              "div",
              { style: { textAlign: "center", marginBottom: "16px" } },
              h(
                "div",
                {
                  style: {
                    fontSize: "11px",
                    color: "#9A8F82",
                    letterSpacing: "0.14em",
                    marginBottom: "6px"
                  }
                },
                `${currentWork.styleTag || genreMeta.label} · ${
                  currentWork.authorRole === "user"
                    ? `${currentWork.userName} 赠 ${currentWork.charName}`
                    : `${currentWork.charName} 赠 ${currentWork.userName}`
                }`
              ),
              h(
                "div",
                {
                  style: {
                    fontFamily: "'Noto Serif SC', 'Songti SC', Georgia, serif",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#2C2825",
                    letterSpacing: "0.08em"
                  }
                },
                `《${currentWork.title}》`
              ),
              currentWork.preface &&
                h(
                  "div",
                  {
                    style: {
                      marginTop: "10px",
                      fontSize: "12.5px",
                      color: "#7C7268",
                      fontStyle: "italic",
                      lineHeight: "1.7",
                      padding: "0 8px"
                    }
                  },
                  currentWork.preface
                )
            ),

            h("div", { style: { height: "1px", background: "#EFE8DC", margin: "12px 0 18px" } }),

            // 正文
            renderGenreContent(currentWork),

            // 落款 / 史臣曰
            currentWork.epilogue &&
              h(
                "div",
                {
                  style: {
                    marginTop: "18px",
                    padding: "10px 12px",
                    borderLeft: "2.5px solid #B85D43",
                    background: "rgba(184, 93, 67, 0.035)",
                    fontFamily: "'Noto Serif SC', serif",
                    fontSize: "13.5px",
                    lineHeight: "1.85",
                    color: "#4A433C"
                  }
                },
                currentWork.epilogue
              ),

            // 元信息脚注
            h(
              "div",
              {
                style: {
                  marginTop: "18px",
                  paddingTop: "10px",
                  borderTop: "1px dashed #E8E0D4",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "#A4998D"
                }
              },
              h(
                "span",
                null,
                currentWork.chatSnapshotCount > 0
                  ? `参考近 ${currentWork.chatSnapshotCount} 条传讯`
                  : "依据人设与世界书落笔"
              ),
              h("span", null, formatDateShort(currentWork.createdAt))
            )
          ),

        // P2 工具条：书史今译 / 复制全文 / 导出宣纸长图
        currentWork &&
          h(
            "div",
            {
              style: {
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                justifyContent: "flex-end"
              }
            },
            currentWork.genre === "chronicle" &&
              h(
                "button",
                {
                  onClick: handleToggleTranslation,
                  disabled: isTranslating,
                  style: {
                    border: "1px solid #E2D9CC",
                    background: showTranslation ? "#2C2825" : "#FFFFFF",
                    color: showTranslation ? "#FAF8F5" : "#574F47",
                    fontSize: "12px",
                    padding: "6px 12px",
                    borderRadius: "999px",
                    cursor: isTranslating ? "not-allowed" : "pointer"
                  }
                },
                isTranslating
                  ? "今译生成中……"
                  : showTranslation
                  ? "收起白话今译"
                  : currentWork.translation
                  ? "展开白话今译"
                  : "生成白话今译"
              ),
            h(
              "button",
              {
                onClick: handleCopyWork,
                style: {
                  border: "1px solid #E2D9CC",
                  background: copyNotice ? "#4F6D5A" : "#FFFFFF",
                  color: copyNotice ? "#FFFFFF" : "#574F47",
                  fontSize: "12px",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  cursor: "pointer"
                }
              },
              copyNotice ? "✓ 已复制全文" : "复制全文"
            ),
            h(
              "button",
              {
                onClick: handleExportWorkImage,
                disabled: isExporting,
                style: {
                  border: "1px solid #B85D43",
                  background: "#FFFDF9",
                  color: "#B85D43",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: "999px",
                  cursor: isExporting ? "not-allowed" : "pointer"
                }
              },
              isExporting ? "渲染长图中……" : "导出宣纸长图"
            )
          ),

        // 书史白话今译卡片（按需展开并已缓存）
        currentWork &&
          currentWork.genre === "chronicle" &&
          showTranslation &&
          currentWork.translation &&
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EAE2D6",
                borderRadius: "14px",
                padding: "14px 16px",
                fontSize: "13px",
                lineHeight: "1.85",
                color: "#4A433C",
                whiteSpace: "pre-wrap"
              }
            },
            h(
              "div",
              {
                style: {
                  fontSize: "11.5px",
                  fontWeight: 700,
                  color: "#8C3D2B",
                  marginBottom: "6px",
                  letterSpacing: "0.08em"
                }
              },
              "【白话今译】"
            ),
            currentWork.translation
          ),

        // 角色递稿私语
        currentWork &&
          currentWork.authorWhisper &&
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EAE2D6",
                borderRadius: "14px",
                padding: "12px 14px",
                fontSize: "13px",
                lineHeight: "1.75",
                color: "#574F47"
              }
            },
            h(
              "span",
              { style: { fontWeight: 700, color: "#B85D43", marginRight: "6px" } },
              `${currentWork.charName} 附言：`
            ),
            currentWork.authorWhisper
          ),

        // 用户打分面板（TA 为我写时） + 角色回响
        currentWork &&
          !isUserAuthor &&
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EAE2D6",
                borderRadius: "14px",
                padding: "16px"
              }
            },
            h(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px"
                }
              },
              h("span", { style: { fontSize: "13.5px", fontWeight: 700, color: "#2C2825" } }, `给 ${currentWork.charName} 打分`),
              h(
                "span",
                {
                  style: {
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#B85D43",
                    fontFamily: "'Noto Serif SC', serif"
                  }
                },
                `${Number(scoreDraft).toFixed(1)} / 10`
              )
            ),
            h("input", {
              type: "range",
              min: "1",
              max: "10",
              step: "0.5",
              value: scoreDraft,
              onChange: (e) => setScoreDraft(Number(e.target.value)),
              style: { width: "100%", accentColor: "#B85D43", marginBottom: "10px" }
            }),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" } },
              QUICK_RATING_TAGS.map((tag) => {
                const active = tagDraft === tag;
                return h(
                  "button",
                  {
                    key: tag,
                    onClick: () => setTagDraft(active ? "" : tag),
                    style: {
                      border: active ? "1px solid #B85D43" : "1px solid #E5DDD1",
                      background: active ? "rgba(184,93,67,0.08)" : "#FAF8F5",
                      color: active ? "#B85D43" : "#6B5E52",
                      fontSize: "11.5px",
                      padding: "3px 9px",
                      borderRadius: "999px",
                      cursor: "pointer"
                    }
                  },
                  tag
                );
              })
            ),
            h("textarea", {
              rows: 2,
              value: commentDraft,
              onChange: (e) => setCommentDraft(e.target.value),
              placeholder: `写一句给 ${currentWork.charName} 的评语吧（可选）……`,
              style: {
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #E8E0D4",
                borderRadius: "10px",
                padding: "8px 10px",
                fontSize: "13px",
                color: "#2C2825",
                background: "#FAF8F5",
                resize: "none",
                outline: "none",
                marginBottom: "10px"
              }
            }),
            h(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: "8px" } },
              h(
                "button",
                {
                  onClick: () => handleSaveRating(false),
                  style: {
                    border: "1px solid #E2D9CC",
                    borderRadius: "10px",
                    padding: "9px 10px",
                    background: ratingSavedNotice ? "#6B5E52" : "#FAF8F5",
                    color: ratingSavedNotice ? "#FFFFFF" : "#574F47",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }
                },
                ratingSavedNotice ? "✓ 已记入典藏" : "仅保存评分"
              ),
              h(
                "button",
                {
                  onClick: () => handleSaveRating(true),
                  disabled: isReacting,
                  style: {
                    border: "1px solid #B85D43",
                    borderRadius: "10px",
                    padding: "9px 10px",
                    background: isReacting ? "#D6A191" : "#B85D43",
                    color: "#FFFFFF",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: isReacting ? "not-allowed" : "pointer"
                  }
                },
                isReacting ? `${currentWork.charName} 读评中……` : `递交并听 ${currentWork.charName} 回应`
              )
            ),
            currentWork.charReaction &&
              h(
                "div",
                {
                  style: {
                    marginTop: "12px",
                    padding: "11px 13px",
                    borderRadius: "12px",
                    background: "#FAF6F0",
                    border: "1px solid #ECE2D2",
                    fontSize: "13px",
                    lineHeight: "1.75",
                    color: "#3F3832"
                  }
                },
                h(
                  "div",
                  { style: { fontSize: "11.5px", fontWeight: 700, color: "#B85D43", marginBottom: "4px" } },
                  `${currentWork.charName} 闻评回响：`
                ),
                currentWork.charReaction
              )
          ),

        // 角色赏析打分卡片（我为 TA 写时）
        currentWork &&
          isUserAuthor &&
          currentWork.rating &&
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EAE2D6",
                borderRadius: "14px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("span", { style: { fontSize: "13.5px", fontWeight: 700, color: "#2C2825" } }, `${currentWork.charName} 的赏析与评分`),
              h(
                "span",
                {
                  style: {
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "#B85D43",
                    fontFamily: "'Noto Serif SC', serif"
                  }
                },
                `${Number(currentWork.rating.score).toFixed(1)} 分 · ${currentWork.rating.rankLabel || "情真意切"}`
              )
            ),
            currentWork.rating.favoriteLine &&
              h(
                "div",
                {
                  style: {
                    padding: "8px 12px",
                    borderLeft: "2.5px solid #B85D43",
                    background: "rgba(184,93,67,0.04)",
                    fontSize: "12.5px",
                    color: "#574F47",
                    fontFamily: "'Noto Serif SC', serif"
                  }
                },
                h("span", { style: { color: "#B85D43", fontWeight: 600, marginRight: "6px" } }, "最心动一句："),
                `「${currentWork.rating.favoriteLine}」`
              ),
            h(
              "div",
              { style: { fontSize: "13.5px", lineHeight: "1.85", color: "#3F3832", whiteSpace: "pre-wrap" } },
              currentWork.rating.comment
            )
          )
      );
    };

    // 历史典藏列表（P1 完整版：搜索 + 体裁/执笔人筛选）
    const renderHistory = () => {
      const q = historyQuery.trim().toLowerCase();
      const filtered = savedWorks.filter((w) => {
        if (historyGenreFilter !== "all" && w.genre !== historyGenreFilter) return false;
        if (historyAuthorFilter !== "all" && (w.authorRole || "char") !== historyAuthorFilter) return false;
        if (q) {
          const hay = `${w.title || ""} ${w.content || ""} ${w.rating?.comment || ""} ${w.styleTag || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      return h(
        "div",
        {
          style: {
            flex: 1,
            overflowY: "auto",
            padding: "14px 18px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }
        },
        // 搜索与筛选区
        h(
          "div",
          {
            style: {
              background: "#FFFFFF",
              border: "1px solid #EAE2D6",
              borderRadius: "14px",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }
          },
          h("input", {
            type: "text",
            value: historyQuery,
            onChange: (e) => setHistoryQuery(e.target.value),
            placeholder: "搜索标题、正文或评语关键词……",
            style: {
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #E8E0D4",
              borderRadius: "8px",
              padding: "7px 10px",
              fontSize: "12.5px",
              color: "#2C2825",
              background: "#FAF8F5",
              outline: "none"
            }
          }),
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: "5px" } },
            [{ id: "all", label: "全部体裁" }, ...GENRES.map((g) => ({ id: g.id, label: g.label }))].map((f) => {
              const active = historyGenreFilter === f.id;
              return h(
                "button",
                {
                  key: f.id,
                  onClick: () => setHistoryGenreFilter(f.id),
                  style: {
                    border: active ? "1px solid #B85D43" : "1px solid #E5DDD1",
                    background: active ? "rgba(184,93,67,0.08)" : "#FAF8F5",
                    color: active ? "#B85D43" : "#6B5E52",
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "999px",
                    cursor: "pointer"
                  }
                },
                f.label
              );
            })
          ),
          h(
            "div",
            { style: { display: "flex", gap: "6px" } },
            [
              { id: "all", label: "双向全部" },
              { id: "char", label: `${charName} 赠我` },
              { id: "user", label: `我赠 ${charName}` }
            ].map((af) => {
              const active = historyAuthorFilter === af.id;
              return h(
                "button",
                {
                  key: af.id,
                  onClick: () => setHistoryAuthorFilter(af.id),
                  style: {
                    border: active ? "1px solid #2C2825" : "1px solid #E5DDD1",
                    background: active ? "#2C2825" : "#FAF8F5",
                    color: active ? "#FAF8F5" : "#6B5E52",
                    fontSize: "11px",
                    padding: "3px 9px",
                    borderRadius: "999px",
                    cursor: "pointer"
                  }
                },
                af.label
              );
            })
          )
        ),

        filtered.length === 0
          ? h(
              "div",
              {
                style: {
                  textAlign: "center",
                  padding: "48px 20px",
                  color: "#9A8F82",
                  fontSize: "13px"
                }
              },
              savedWorks.length === 0 ? `与 ${charName} 尚未留下笔墨典藏` : "当前筛选条件下暂无匹配作品"
            )
          : filtered.map((w) => {
              const gm = getGenreMeta(w.genre);
              const fromUser = w.authorRole === "user";
              return h(
                "div",
                {
                  key: w.id,
                  onClick: () => handleOpenSavedWork(w),
                  style: {
                    background: "#FFFFFF",
                    border: "1px solid #EAE2D6",
                    borderRadius: "14px",
                    padding: "14px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px"
                  }
                },
                h(
                  "div",
                  { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "10.5px",
                          color: "#B85D43",
                          border: "1px solid rgba(184,93,67,0.4)",
                          borderRadius: "4px",
                          padding: "1px 5px",
                          flexShrink: 0
                        }
                      },
                      gm.label
                    ),
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "10.5px",
                          color: fromUser ? "#4F6D5A" : "#6B5E52",
                          background: fromUser ? "rgba(79,109,90,0.08)" : "#F3EEE6",
                          borderRadius: "4px",
                          padding: "1px 5px",
                          flexShrink: 0
                        }
                      },
                      fromUser ? "我赠TA" : "TA赠我"
                    ),
                    h(
                      "span",
                      {
                        style: {
                          fontSize: "14.5px",
                          fontWeight: 700,
                          color: "#2C2825",
                          fontFamily: "'Noto Serif SC', serif",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }
                      },
                      `《${w.title}》`
                    )
                  ),
                  h(
                    "button",
                    {
                      onClick: (e) => handleDeleteWork(w.id, e),
                      style: {
                        border: "none",
                        background: "transparent",
                        color: "#A4998D",
                        fontSize: "12px",
                        cursor: "pointer",
                        padding: "2px 4px",
                        flexShrink: 0
                      }
                    },
                    "删除"
                  )
                ),
                h(
                  "div",
                  {
                    style: {
                      fontSize: "12.5px",
                      color: "#7C7268",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }
                  },
                  String(w.content || "").replace(/\s+/g, " ").slice(0, 48)
                ),
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      color: "#A4998D"
                    }
                  },
                  h("span", null, `${w.styleTag || gm.label} · ${formatDateShort(w.createdAt)}`),
                  h(
                    "span",
                    { style: { color: w.rating ? "#B85D43" : "#A4998D", fontWeight: w.rating ? 600 : 400 } },
                    w.rating
                      ? `${w.rating.score}分 · ${w.rating.rankLabel || "已评"}${w.charReaction ? " · 已回响" : ""}`
                      : "未评分"
                  )
                )
              );
            })
      );
    };

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 1050,
          background: "rgba(28, 25, 23, 0.48)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px"
        },
        onClick: (e) => {
          if (e.target === e.currentTarget) onClose();
        }
      },
      h(
        "div",
        {
          style: {
            width: "100%",
            maxWidth: "430px",
            height: "88vh",
            maxHeight: "780px",
            background: "#FAF8F5",
            borderRadius: "22px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.22)",
            border: "1px solid #E8E0D4"
          }
        },
        renderHeader(),
        view === "home" ? renderHome() : view === "history" ? renderHistory() : renderStudio()
      )
    );
  };

  global.InkPoetryModal = InkPoetryModal;
})(typeof window !== "undefined" ? window : globalThis);
