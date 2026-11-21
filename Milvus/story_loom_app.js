/**
 * Milvus/story_loom_app.js
 * 情侣空间 ·「故事织机」双人回合制接话共写系统（P0）
 * - 注入四维设定：角色6维配置（姓名/ID、MBTI、星座、语言风格、性格特点、个人背景）
 *                + 设置-身份配置库 + 设置-世界书条目 + 双方共写前文上下文
 * - 回合制共写：每回合 2~3 句，支持用户定题先写 / 对方定题先写、目标字数与 ≥80% 收官提示
 * - IndexedDB 自动持久化草稿与完结作品
 */
(function (global) {
  "use strict";

  const THEME_SEEDS = [
    "雨夜共躲进一间荒废茶寮，案上摆着一盏未熄的残灯",
    "绣衣楼密档库中突然多了一封没有署名的旧信",
    "冬夜雪落满阶，两人在炭火旁分食最后一块糖糕",
    "微服私访广陵夜市，被人群冲散后在灯笼摊前重逢",
    "一觉醒来发现彼此互换了今日的晨起身份与公文"
  ];

  function countStoryWords(text) {
    return String(text || "").replace(/\s+/g, "").length;
  }

  function sumTurnsWords(turns) {
    return (turns || []).reduce((acc, t) => acc + countStoryWords(t.text), 0);
  }

  function cleanAiParagraph(raw) {
    return String(raw || "")
      .replace(/```[a-z]*|```/gi, "")
      .replace(/^(?:第\s*\d+\s*回合|续写|正文|故事|回复)\s*[:：]\s*/i, "")
      .replace(/^【[^】]{1,20}】\s*/, "")
      .trim();
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
      if (matched) full = { ...matched, ...taCharacter, profile: { ...(matched.profile || {}), ...(taCharacter.profile || {}) } };
    } catch (e) {}

    const p = full.profile || {};
    return {
      id: full.id || taCharacter.id || "",
      name: full.name || p.name || "名士",
      mbti: p.mbti || full.mbti || "未设定",
      constellation: p.constellation || p.zodiac || full.constellation || full.zodiac || "未设定",
      speakingStyle: p.speakingStyle || p.style || full.speakingStyle || full.style || "贴合原作角色口吻与神韵",
      personality: p.personality || full.personality || "性格鲜明立体",
      background: p.background || p.bio || p.description || full.background || full.description || "身处动荡汉末、与用户羁绊深厚",
      avatar: full.avatar || p.avatar || ""
    };
  }

  async function buildFourDimContext(taCharacter, mePersona, turns) {
    const charInfo = await resolveFullCharacter(taCharacter);
    const userInfo = getActiveUserPersona(mePersona);
    let worldContext = "未开启特定世界书，可按汉末古风或当前共同背景自然展开。";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) worldContext = wb;
      }
    } catch (e) {}

    // 格式化双方共写上下文（超长时保留开篇 2 段 + 最近 10 段）
    let storyContext = "（故事尚未开篇，这是第一回合）";
    if (Array.isArray(turns) && turns.length > 0) {
      const totalChars = sumTurnsWords(turns);
      let usedTurns = turns;
      let omittedNote = "";
      if (totalChars > 1600 && turns.length > 12) {
        usedTurns = [...turns.slice(0, 2), ...turns.slice(-10)];
        omittedNote = "\n……（中间情节略，紧接以下最新片段）……\n";
      }
      const lines = usedTurns.map((t, idx) => {
        const tag = t.author === "user" ? `[${userInfo.name}(用户)]` : `[${charInfo?.name || "角色"}]`;
        const prefix = omittedNote && idx === 2 ? omittedNote : "";
        return `${prefix}${tag}：${t.text}`;
      });
      storyContext = lines.join("\n");
    }

    return { charInfo, userInfo, worldContext, storyContext };
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

  async function generateCharOpening({ taCharacter, mePersona, targetWords }) {
    const { charInfo, userInfo, worldContext } = await buildFourDimContext(taCharacter, mePersona, []);
    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】，与【${userInfo.name}】一起玩情侣双人「故事织机」接龙游戏。请严格恪守以下四维设定：
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

【维度三·当前开启的世界书设定】
${worldContext}`;

    const userPrompt = `本次由你先定一个富有画面感与情感张力的故事主题，并写出故事的第 1 回合开篇（严格控制在 2~3 句话、约 45~90 字）。本篇故事总目标字数为 ${targetWords} 字。
请严格返回纯 JSON 对象（不要 \`\`\`json 包裹）：
{
  "theme": "一句话故事主题（10~24字）",
  "opening": "2~3句话的故事开篇正文（第三人称或自然叙事，不含任何旁白前缀）"
}`;

    const reply = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);
    const cleaned = String(reply || "").replace(/```json|```/gi, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    return {
      theme: String(parsed.theme || "月下共叙").trim(),
      opening: cleanAiParagraph(parsed.opening)
    };
  }

  async function generateCharTurn({ taCharacter, mePersona, theme, turns, targetWords }) {
    const { charInfo, userInfo, worldContext, storyContext } = await buildFourDimContext(taCharacter, mePersona, turns);
    const currentWords = sumTurnsWords(turns);
    const remainWords = Math.max(0, targetWords - currentWords);
    const nearEnding = currentWords >= targetWords * 0.8 || remainWords <= 100;

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】，与【${userInfo.name}】共同书写一篇接龙故事。请严格融合以下全部设定：
【维度一·角色完整配置】
- 角色姓名与ID：${charInfo.name} (ID: ${charInfo.id})
- MBTI 性格类型：${charInfo.mbti}
- 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}

【维度二·用户身份设定】
- 姓名：${userInfo.name}（${userInfo.identity}）
- 性格与背景：${userInfo.personality}；${userInfo.background || ""}

【维度三·当前开启的世界书设定】
${worldContext}`;

    const endingInstruction = nearEnding
      ? `【重要·临近收官预警】当前已书写 ${currentWords}/${targetWords} 字（仅剩约 ${remainWords} 字）。请不要再引入新人物或新矛盾，用 2~3 句话顺势收束前文伏笔，向温暖或余韵悠长的结局靠拢！`
      : `请紧承上一句的动作、对话或情绪自然推进剧情，融入你的角色性格与语言韵味。`;

    const userPrompt = `【故事主题】${theme}
【维度四·双方已共同写下的前文上下文】
${storyContext}

【你的写作任务】
严格只写 **2~3 句话**（约 45~90 字），直接输出故事正文段落，不要输出引号外说明、不要加“第X回合：”、不要替【${userInfo.name}】代写下一回合。
${endingInstruction}`;

    const reply = await callLLMAsync([
      { role: "system", content: sysPrompt },
      { role: "user", content: userPrompt }
    ]);
    return cleanAiParagraph(reply);
  }

  async function generateStoryReview({ taCharacter, mePersona, theme, turns }) {
    const { charInfo, userInfo, worldContext, storyContext } = await buildFourDimContext(taCharacter, mePersona, turns);
    const fallback = {
      storyTitle: theme ? String(theme).slice(0, 14) : "同心织卷",
      comment: `与你一针一线把这段故事织完，虽只有寥寥数回合，字里行间却都是咱们的默契。下回若有闲暇，再同我续写新篇罢。`,
      favoriteLine: (turns || []).find((t) => t.author === "user")?.text || "",
      chemistryTag: "心意相通 · 携手成篇",
      score: 95
    };

    const sysPrompt = `你正在扮演【${charInfo.name}（ID: ${charInfo.id}）】，刚刚和【${userInfo.name}】共同写完了一篇接龙故事。
【角色完整配置】
- 姓名与ID：${charInfo.name} (ID: ${charInfo.id})
- MBTI：${charInfo.mbti} | 星座：${charInfo.constellation}
- 语言风格：${charInfo.speakingStyle}
- 性格特点：${charInfo.personality}
- 个人背景：${charInfo.background}
【用户设定】${userInfo.name}（${userInfo.identity}）
【世界观】${worldContext}`;

    const userPrompt = `【故事主题】${theme}
【共同写就的完整故事】
${storyContext}

请完全以【${charInfo.name}】的第一人称语气，为这篇合作故事题名并点评，严格返回纯 JSON 对象（不要 \`\`\`json 标记）：
{
  "storyTitle": "你为这篇故事亲笔拟定的书名（2~8字，不带书名号）",
  "comment": "你的第一人称专属点评（70~140字，须紧扣故事具体情节，点评对方的脑洞与你们的配合，符合你的性格与语言风格）",
  "favoriteLine": "从前文【${userInfo.name}】写下的句子中原封不动摘录你最喜欢的一句",
  "chemistryTag": "4~8字默契评语标签",
  "score": 96
}`;

    try {
      const reply = await callLLMAsync([
        { role: "system", content: sysPrompt },
        { role: "user", content: userPrompt }
      ]);
      const cleaned = String(reply || "").replace(/```json|```/gi, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : cleaned);
      return {
        storyTitle: String(parsed.storyTitle || fallback.storyTitle).replace(/[《》]/g, "").trim(),
        comment: String(parsed.comment || fallback.comment).trim(),
        favoriteLine: String(parsed.favoriteLine || fallback.favoriteLine).trim(),
        chemistryTag: String(parsed.chemistryTag || fallback.chemistryTag).trim(),
        score: Number(parsed.score) || 95
      };
    } catch (e) {
      console.warn("[StoryLoom] 生成点评失败，已使用本地兜底:", e);
      return fallback;
    }
  }

  const StoryLoomModal = ({ isOpen, onClose, taCharacter, mePersona }) => {
    const { useState, useEffect, useRef } = React;
    const [viewMode, setViewMode] = useState("setup"); // "setup" | "playing"
    const [boundChar, setBoundChar] = useState(taCharacter || null);
    const [charCandidates, setCharCandidates] = useState([]);
    const [starter, setStarter] = useState("user"); // "user" | "char"
    const [theme, setTheme] = useState("");
    const [targetWords, setTargetWords] = useState(500);
    const [customWords, setCustomWords] = useState("500");
    const [isCustomWords, setIsCustomWords] = useState(false);

    const [activeStory, setActiveStory] = useState(null);
    const [userDraft, setUserDraft] = useState("");
    const [isAiWriting, setIsAiWriting] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [showHistory, setShowHistory] = useState(false);
    const [historyList, setHistoryList] = useState([]);
    const [historyFilter, setHistoryFilter] = useState("all");
    const [readerMode, setReaderMode] = useState("turns"); // "turns" | "clean"
    const [copyNotice, setCopyNotice] = useState("");
    const [isExporting, setIsExporting] = useState(false);
    const listEndRef = useRef(null);
    const exportCanvasRef = useRef(null);

    useEffect(() => {
      if (taCharacter) setBoundChar(taCharacter);
    }, [taCharacter]);

    useEffect(() => {
      if (!isOpen) return;
      const loadChars = async () => {
        try {
          let list = [];
          if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
            list = await global.chatCharacterStore.getAll();
          } else {
            list = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
          }
          const valid = (list || []).filter((c) => c && c.id && !String(c.id).startsWith("group") && c.type !== "decor");
          setCharCandidates(valid);
          if (!taCharacter && !boundChar && valid.length > 0) setBoundChar(valid[0]);
        } catch (e) {}
      };
      loadChars();
      refreshHistory();
    }, [isOpen]);

    const refreshHistory = async () => {
      if (!global.storyLoomStore) return;
      try {
        const list = await global.storyLoomStore.getAll();
        setHistoryList(list || []);
      } catch (e) {}
    };

    useEffect(() => {
      if (listEndRef.current) {
        listEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, [activeStory?.turns?.length, isAiWriting]);

    if (!isOpen) return null;

    const persistStory = async (storyObj) => {
      setActiveStory(storyObj);
      if (global.storyLoomStore) {
        try {
          await global.storyLoomStore.save(storyObj);
          refreshHistory();
        } catch (e) {
          console.warn("[StoryLoom] 保存失败:", e);
        }
      }
    };

    const handleStartStory = async () => {
      if (!boundChar) {
        alert("请先选择一位共同书写故事的名士！");
        return;
      }
      const finalTarget = Math.max(150, Math.min(3000, Number(isCustomWords ? customWords : targetWords) || 500));
      setErrorMsg("");
      const userInfo = getActiveUserPersona(mePersona);
      const baseStory = {
        id: `loom_${Date.now()}`,
        charId: boundChar.id,
        charName: boundChar.name || "名士",
        charAvatar: boundChar.avatar || "",
        userName: userInfo.name,
        theme: theme.trim() || "月下共叙",
        title: "",
        starter,
        targetWords: finalTarget,
        currentWords: 0,
        status: "ongoing",
        turns: [],
        review: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      if (starter === "user") {
        if (!theme.trim()) {
          alert("请先填写本次故事的主题（或点击骰子随机一个灵感）！");
          return;
        }
        await persistStory(baseStory);
        setViewMode("playing");
        return;
      }

      // TA 定主题并先写第 1 回合
      setIsAiWriting(true);
      setViewMode("playing");
      setActiveStory({ ...baseStory, theme: "正在构思主题中..." });
      try {
        const opened = await generateCharOpening({
          taCharacter: boundChar,
          mePersona,
          targetWords: finalTarget
        });
        const firstTurn = {
          id: Date.now(),
          author: "char",
          authorName: boundChar.name || "名士",
          text: opened.opening,
          words: countStoryWords(opened.opening),
          createdAt: Date.now()
        };
        const nextStory = {
          ...baseStory,
          theme: opened.theme,
          turns: [firstTurn],
          currentWords: firstTurn.words,
          updatedAt: Date.now()
        };
        await persistStory(nextStory);
      } catch (e) {
        setErrorMsg(e.message || "AI 开篇失败");
      } finally {
        setIsAiWriting(false);
      }
    };

    const handleSubmitUserTurn = async () => {
      if (!activeStory || !userDraft.trim() || isAiWriting) return;
      setErrorMsg("");
      const userInfo = getActiveUserPersona(mePersona);
      const text = userDraft.trim();
      const newTurn = {
        id: Date.now(),
        author: "user",
        authorName: userInfo.name,
        text,
        words: countStoryWords(text),
        createdAt: Date.now()
      };
      const turnsAfterUser = [...(activeStory.turns || []), newTurn];
      const storyAfterUser = {
        ...activeStory,
        turns: turnsAfterUser,
        currentWords: sumTurnsWords(turnsAfterUser),
        updatedAt: Date.now()
      };
      setUserDraft("");
      await persistStory(storyAfterUser);

      // 自动轮到角色接写 2~3 句
      setIsAiWriting(true);
      try {
        const aiText = await generateCharTurn({
          taCharacter: boundChar,
          mePersona,
          theme: storyAfterUser.theme,
          turns: turnsAfterUser,
          targetWords: storyAfterUser.targetWords
        });
        const aiTurn = {
          id: Date.now() + 1,
          author: "char",
          authorName: boundChar?.name || storyAfterUser.charName,
          text: aiText,
          words: countStoryWords(aiText),
          createdAt: Date.now()
        };
        const turnsAfterAi = [...turnsAfterUser, aiTurn];
        await persistStory({
          ...storyAfterUser,
          turns: turnsAfterAi,
          currentWords: sumTurnsWords(turnsAfterAi),
          updatedAt: Date.now()
        });
      } catch (e) {
        setErrorMsg(e.message || "AI 接话失败，请重试");
      } finally {
        setIsAiWriting(false);
      }
    };

    const handleRegenerateLastCharTurn = async () => {
      if (!activeStory || isAiWriting || !activeStory.turns?.length) return;
      const turns = activeStory.turns;
      if (turns[turns.length - 1].author !== "char") return;
      setErrorMsg("");
      const trimmedTurns = turns.slice(0, -1);
      setIsAiWriting(true);
      try {
        const aiText = await generateCharTurn({
          taCharacter: boundChar,
          mePersona,
          theme: activeStory.theme,
          turns: trimmedTurns,
          targetWords: activeStory.targetWords
        });
        const aiTurn = {
          id: Date.now(),
          author: "char",
          authorName: boundChar?.name || activeStory.charName,
          text: aiText,
          words: countStoryWords(aiText),
          createdAt: Date.now()
        };
        const nextTurns = [...trimmedTurns, aiTurn];
        await persistStory({
          ...activeStory,
          turns: nextTurns,
          currentWords: sumTurnsWords(nextTurns),
          updatedAt: Date.now()
        });
      } catch (e) {
        setErrorMsg(e.message || "重新生成失败");
      } finally {
        setIsAiWriting(false);
      }
    };

    const handleFinishStory = async () => {
      if (!activeStory || !activeStory.turns?.length || isReviewing) return;
      setErrorMsg("");
      const doneStory = {
        ...activeStory,
        status: "completed",
        updatedAt: Date.now()
      };
      await persistStory(doneStory);
      setIsReviewing(true);
      try {
        const rev = await generateStoryReview({
          taCharacter: boundChar || { id: doneStory.charId, name: doneStory.charName },
          mePersona,
          theme: doneStory.theme,
          turns: doneStory.turns
        });
        await persistStory({
          ...doneStory,
          title: rev.storyTitle ? `《${rev.storyTitle}》` : doneStory.title,
          review: rev,
          updatedAt: Date.now()
        });
      } finally {
        setIsReviewing(false);
      }
    };

    const handleRegenerateReview = async () => {
      if (!activeStory || isReviewing) return;
      setIsReviewing(true);
      try {
        const rev = await generateStoryReview({
          taCharacter: boundChar || { id: activeStory.charId, name: activeStory.charName },
          mePersona,
          theme: activeStory.theme,
          turns: activeStory.turns
        });
        await persistStory({
          ...activeStory,
          title: rev.storyTitle ? `《${rev.storyTitle}》` : activeStory.title,
          review: rev,
          updatedAt: Date.now()
        });
      } finally {
        setIsReviewing(false);
      }
    };

    const handleOpenHistoryStory = (item) => {
      if (!item) return;
      const matched = charCandidates.find((c) => String(c.id) === String(item.charId));
      if (matched) setBoundChar(matched);
      else setBoundChar({ id: item.charId, name: item.charName, avatar: item.charAvatar });
      setActiveStory(item);
      setErrorMsg("");
      setViewMode("playing");
      setShowHistory(false);
    };

    const handleDeleteHistoryStory = async (e, id) => {
      e.stopPropagation();
      if (!global.storyLoomStore) return;
      await global.storyLoomStore.delete(id);
      if (activeStory && activeStory.id === id) {
        setActiveStory(null);
        setViewMode("setup");
      }
      refreshHistory();
    };

    const handleCopyStory = async () => {
      if (!activeStory || !activeStory.turns?.length) return;
      const title = activeStory.title || `《${activeStory.theme || "同心织卷"}》`;
      const body = activeStory.turns.map((t) => t.text).join("\n\n");
      const reviewPart = activeStory.review
        ? `\n\n———\n${activeStory.charName} 点评（${activeStory.review.chemistryTag || "默契成篇"} · ${activeStory.review.score || 95}分）：\n${activeStory.review.comment}`
        : "";
      const fullText = `${title}\n合著：${activeStory.userName} × ${activeStory.charName}\n\n${body}${reviewPart}`;
      try {
        await navigator.clipboard.writeText(fullText);
        setCopyNotice("✓ 已复制全文");
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = fullText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopyNotice("✓ 已复制全文");
      }
      setTimeout(() => setCopyNotice(""), 2400);
    };

    const handleExportStoryImage = async () => {
      if (!activeStory || !activeStory.turns?.length || isExporting) return;
      if (typeof global.html2canvas !== "function") {
        alert("当前环境未加载截图组件，请切换「纯净成文」后直接系统截屏保存。");
        return;
      }
      setIsExporting(true);
      try {
        if (readerMode !== "clean") {
          setReaderMode("clean");
          await new Promise((r) => setTimeout(r, 120));
        }
        const targetEl = exportCanvasRef.current;
        if (!targetEl) throw new Error("未找到导出区域");
        const canvas = await global.html2canvas(targetEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#FAF7F2"
        });
        const link = document.createElement("a");
        const safeName = (activeStory.title || activeStory.theme || "故事织机").replace(/[\\/:*?"<>|《》]/g, "").slice(0, 16);
        link.download = `故事织机_${safeName}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        setCopyNotice("✓ 长图已导出");
        setTimeout(() => setCopyNotice(""), 2400);
      } catch (e) {
        console.error("[StoryLoom] 导出长图失败:", e);
        alert("导出长图失败，建议使用系统截屏保存。");
      } finally {
        setIsExporting(false);
      }
    };

    const curWords = activeStory ? activeStory.currentWords : 0;
    const tgtWords = activeStory ? activeStory.targetWords : targetWords;
    const progressPct = tgtWords > 0 ? Math.min(100, Math.round((curWords / tgtWords) * 100)) : 0;
    const nearEnd = activeStory && curWords >= tgtWords * 0.8 && curWords < tgtWords;
    const reachedTarget = activeStory && curWords >= tgtWords;

    return React.createElement(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 1120,
          background: "#FAF7F2",
          display: "flex",
          flexDirection: "column",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif"
        }
      },
      /* 顶部导航栏 */
      React.createElement(
        "div",
        {
          style: {
            height: "54px",
            background: "#FFFFFF",
            borderBottom: "1px solid #EAE2D3",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 14px",
            flexShrink: 0
          }
        },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              if (viewMode === "playing") setViewMode("setup");
              else onClose();
            },
            style: { border: "none", background: "#F5F1E8", color: "#5A5F4D", padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }
          },
          viewMode === "playing" ? "← 返回配置" : "← 退出"
        ),
        React.createElement("div", { style: { fontSize: "15px", fontWeight: "800", color: "#3E3832" } }, "🧵 故事织机"),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              refreshHistory();
              setShowHistory(true);
            },
            style: { border: "none", background: "#FFF4EE", color: "#D6724B", fontSize: "11.5px", fontWeight: "700", padding: "5px 10px", borderRadius: "999px", cursor: "pointer" }
          },
          `📚 书架 (${historyList.length})`
        )
      ),
      /* 主体内容 */
      viewMode === "setup"
        ? React.createElement(
            "div",
            { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", padding: "18px 18px 40px", maxWidth: "460px", width: "100%", margin: "0 auto", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "16px" } },
            React.createElement(
              "div",
              { style: { background: "#FFFFFF", borderRadius: "18px", padding: "16px", border: "1px solid #ECE3D4", boxShadow: "0 2px 10px rgba(0,0,0,0.03)" } },
              React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#8C7D70", marginBottom: "8px" } }, "共写对象（自动读取 6 维人设与世界书）"),
              charCandidates.length > 0
                ? React.createElement(
                    "select",
                    {
                      value: boundChar?.id || "",
                      onChange: (e) => {
                        const found = charCandidates.find((c) => String(c.id) === e.target.value);
                        if (found) setBoundChar(found);
                      },
                      style: { width: "100%", padding: "9px 12px", borderRadius: "12px", border: "1px solid #DFD5C5", background: "#FAF8F4", fontSize: "13px", fontWeight: "700", color: "#3E3832" }
                    },
                    charCandidates.map((c) => React.createElement("option", { key: c.id, value: c.id }, `${c.name}${c.profile?.mbti ? ` · ${c.profile.mbti}` : ""}`))
                  )
                : React.createElement("div", { style: { fontSize: "12.5px", color: "#999" } }, boundChar ? boundChar.name : "暂无名士，请先在传讯中添加角色")
            ),
            React.createElement(
              "div",
              { style: { background: "#FFFFFF", borderRadius: "18px", padding: "16px", border: "1px solid #ECE3D4", display: "flex", flexDirection: "column", gap: "12px" } },
              React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#8C7D70" } }, "谁来定主题 & 先写？"),
              React.createElement(
                "div",
                { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" } },
                [
                  { id: "user", label: "✍️ 我定主题我先写" },
                  { id: "char", label: "✨ TA 定主题 TA 先写" }
                ].map((opt) =>
                  React.createElement(
                    "button",
                    {
                      key: opt.id,
                      type: "button",
                      onClick: () => setStarter(opt.id),
                      style: {
                        padding: "10px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                        border: starter === opt.id ? "1.5px solid #D6724B" : "1px solid #E6DDD0",
                        background: starter === opt.id ? "#FFF4EE" : "#FAF8F4",
                        color: starter === opt.id ? "#B35446" : "#5A5F4D"
                      }
                    },
                    opt.label
                  )
                )
              ),
              starter === "user" &&
                React.createElement(
                  "div",
                  null,
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
                    React.createElement("span", { style: { fontSize: "11.5px", color: "#8C7D70", fontWeight: "600" } }, "故事主题 / 开篇引子"),
                    React.createElement("button", { type: "button", onClick: () => setTheme(THEME_SEEDS[Math.floor(Math.random() * THEME_SEEDS.length)]), style: { border: "none", background: "#F4ECE1", color: "#915938", fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "999px", cursor: "pointer" } }, "🎲 随机灵感")
                  ),
                  React.createElement("textarea", {
                    value: theme,
                    onChange: (e) => setTheme(e.target.value),
                    placeholder: "例如：雨夜躲进一间荒废茶寮，发现桌上放着一封未署名的旧信...",
                    rows: 2,
                    style: { width: "100%", padding: "10px 12px", borderRadius: "12px", border: "1px solid #DFD5C5", background: "#FAF8F4", fontSize: "13px", color: "#3E3832", boxSizing: "border-box", resize: "none", outline: "none" }
                  })
                )
            ),
            React.createElement(
              "div",
              { style: { background: "#FFFFFF", borderRadius: "18px", padding: "16px", border: "1px solid #ECE3D4", display: "flex", flexDirection: "column", gap: "10px" } },
              React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#8C7D70" } }, "约定故事总字数（临近 80% 时系统提醒收官）"),
              React.createElement(
                "div",
                { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" } },
                [
                  { v: 300, label: "300字" },
                  { v: 500, label: "500字" },
                  { v: 800, label: "800字" },
                  { v: -1, label: "自定义" }
                ].map((item) => {
                  const active = item.v === -1 ? isCustomWords : (!isCustomWords && targetWords === item.v);
                  return React.createElement(
                    "button",
                    {
                      key: item.label,
                      type: "button",
                      onClick: () => {
                        if (item.v === -1) setIsCustomWords(true);
                        else {
                          setIsCustomWords(false);
                          setTargetWords(item.v);
                        }
                      },
                      style: {
                        padding: "8px 4px",
                        borderRadius: "10px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                        border: active ? "1.5px solid #5A8F6D" : "1px solid #E6DDD0",
                        background: active ? "#E8F1ED" : "#FAF8F4",
                        color: active ? "#2D5A3F" : "#5A5F4D"
                      }
                    },
                    item.label
                  );
                })
              ),
              isCustomWords &&
                React.createElement("input", {
                  type: "number",
                  min: 150,
                  max: 3000,
                  value: customWords,
                  onChange: (e) => setCustomWords(e.target.value),
                  placeholder: "输入目标字数 (150~3000)",
                  style: { width: "100%", padding: "8px 12px", borderRadius: "10px", border: "1px solid #DFD5C5", fontSize: "13px", boxSizing: "border-box" }
                })
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: handleStartStory,
                style: { width: "100%", padding: "14px", borderRadius: "16px", border: "none", background: "linear-gradient(135deg, #D6724B 0%, #B35446 100%)", color: "#FFFFFF", fontSize: "14px", fontWeight: "800", cursor: "pointer", boxShadow: "0 6px 16px rgba(214,114,75,0.28)" }
              },
              "开始织写故事"
            )
          )
        : React.createElement(
            React.Fragment,
            null,
            /* 字数进度条与主题条 */
            React.createElement(
              "div",
              { style: { background: "#FFFFFF", padding: "10px 16px", borderBottom: "1px solid #EFE8DA", flexShrink: 0 } },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11.5px", marginBottom: "6px" } },
                React.createElement("span", { style: { fontWeight: "700", color: "#3E3832", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" } }, `主题：${activeStory?.theme || ""}`),
                React.createElement("span", { style: { fontWeight: "800", color: reachedTarget ? "#5A8F6D" : "#D6724B" } }, `${curWords} / ${tgtWords} 字`)
              ),
              React.createElement(
                "div",
                { style: { height: "6px", background: "#F1ECE2", borderRadius: "999px", overflow: "hidden" } },
                React.createElement("div", { style: { width: `${progressPct}%`, height: "100%", background: reachedTarget ? "#5A8F6D" : nearEnd ? "#F59E0B" : "#D6724B", transition: "width 0.35s ease" } })
              ),
              nearEnd &&
                React.createElement("div", { style: { marginTop: "8px", fontSize: "11.5px", fontWeight: "700", color: "#B45309", background: "#FEF3C7", padding: "6px 10px", borderRadius: "10px" } }, `✨ 即将写完（还差约 ${Math.max(0, tgtWords - curWords)} 字），请开始收束伏笔准备结局！`),
              reachedTarget &&
                React.createElement("div", { style: { marginTop: "8px", fontSize: "11.5px", fontWeight: "700", color: "#2D5A3F", background: "#E8F1ED", padding: "6px 10px", borderRadius: "10px" } }, "🎉 已达到约定字数！可继续补写收尾，或点击下方「完结并存档」。"),
              /* 视图切换与复制/导出工具微条 */
              (activeStory?.turns?.length || 0) > 0 &&
                React.createElement(
                  "div",
                  { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", marginTop: "8px" } },
                  React.createElement(
                    "div",
                    { style: { display: "inline-flex", background: "#F5F1E8", padding: "2px", borderRadius: "999px" } },
                    [
                      { id: "turns", label: "📝 稿纸接龙" },
                      { id: "clean", label: "📖 纯净成文" }
                    ].map((m) =>
                      React.createElement("button", {
                        key: m.id,
                        type: "button",
                        onClick: () => setReaderMode(m.id),
                        style: {
                          border: "none",
                          padding: "4px 9px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: "700",
                          cursor: "pointer",
                          background: readerMode === m.id ? "#FFFFFF" : "transparent",
                          color: readerMode === m.id ? "#3E3832" : "#8C7D70",
                          boxShadow: readerMode === m.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none"
                        }
                      }, m.label)
                    )
                  ),
                  React.createElement(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    copyNotice && React.createElement("span", { style: { fontSize: "10.5px", color: "#2D5A3F", fontWeight: "700" } }, copyNotice),
                    React.createElement("button", { type: "button", onClick: handleCopyStory, style: { border: "1px solid #E5DCCB", background: "#FFFFFF", color: "#6B6257", fontSize: "11px", fontWeight: "600", padding: "4px 8px", borderRadius: "999px", cursor: "pointer" } }, "复制"),
                    React.createElement("button", { type: "button", disabled: isExporting, onClick: handleExportStoryImage, style: { border: "none", background: "#D6724B", color: "#FFFFFF", fontSize: "11px", fontWeight: "700", padding: "4px 9px", borderRadius: "999px", cursor: "pointer" } }, isExporting ? "导出中" : "导长图")
                  )
                )
            ),
            /* 回合稿纸区 / 纯净成文阅读区 */
            React.createElement(
              "div",
              { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", maxWidth: "520px", width: "100%", margin: "0 auto", boxSizing: "border-box" } },
              (!activeStory?.turns || activeStory.turns.length === 0) && !isAiWriting &&
                React.createElement("div", { style: { textAlign: "center", padding: "48px 16px", color: "#8C7D70", fontSize: "13px" } }, "由你执笔第一回合：请写下 2~3 句话开启这段故事～"),
              readerMode === "clean" && (activeStory?.turns?.length || 0) > 0
                ? React.createElement(
                    "div",
                    {
                      ref: exportCanvasRef,
                      style: {
                        background: "#FFFDF9",
                        borderRadius: "20px",
                        padding: "22px 20px",
                        border: "1.5px solid #E6DAC6",
                        boxShadow: "0 6px 24px rgba(140,109,79,0.07)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px"
                      }
                    },
                    React.createElement(
                      "div",
                      { style: { textAlign: "center", borderBottom: "1px dashed #E5D9C5", paddingBottom: "12px" } },
                      React.createElement("div", { style: { fontSize: "18px", fontWeight: "800", color: "#3E3832", fontFamily: "Georgia, 'Songti SC', serif" } }, activeStory.title || `《${activeStory.theme || "同心织卷"}》`),
                      React.createElement("div", { style: { fontSize: "11px", color: "#8C7D70", marginTop: "4px" } }, `合著：${activeStory.userName} × ${activeStory.charName} · 共 ${curWords} 字`)
                    ),
                    React.createElement(
                      "div",
                      { style: { display: "flex", flexDirection: "column", gap: "10px", fontFamily: "Georgia, 'Songti SC', serif", fontSize: "14.5px", lineHeight: "1.95", color: "#2F2A25" } },
                      activeStory.turns.map((t, idx) =>
                        React.createElement("p", { key: t.id || idx, style: { margin: 0, textIndent: "2em", whiteSpace: "pre-wrap" } }, t.text)
                      )
                    ),
                    activeStory.review &&
                      React.createElement(
                        "div",
                        { style: { marginTop: "8px", paddingTop: "12px", borderTop: "1px dashed #E5D9C5", display: "flex", flexDirection: "column", gap: "6px" } },
                        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                          React.createElement("span", { style: { fontSize: "12px", fontWeight: "800", color: "#D6724B" } }, `${activeStory.charName} 亲笔题评`),
                          React.createElement("span", { style: { fontSize: "10.5px", color: "#8C6D4F", fontWeight: "700" } }, `${activeStory.review.chemistryTag} · ${activeStory.review.score || 95}分`)
                        ),
                        React.createElement("div", { style: { fontSize: "12.5px", color: "#5A5045", lineHeight: "1.7" } }, activeStory.review.comment),
                        activeStory.review.favoriteLine &&
                          React.createElement("div", { style: { fontSize: "11.5px", color: "#5A8F6D", fontStyle: "italic" } }, `“${activeStory.review.favoriteLine}”`)
                      )
                  )
                : (activeStory?.turns || []).map((t, idx) => {
                const isUser = t.author === "user";
                const isLastChar = !isUser && idx === activeStory.turns.length - 1 && activeStory.status !== "completed";
                return React.createElement(
                  "div",
                  {
                    key: t.id || idx,
                    style: {
                      background: "#FFFFFF",
                      borderRadius: "14px",
                      padding: "12px 14px",
                      borderLeft: `4px solid ${isUser ? "#D6724B" : "#5A8F6D"}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
                    }
                  },
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
                    React.createElement("span", { style: { fontSize: "11px", fontWeight: "800", color: isUser ? "#D6724B" : "#5A8F6D" } }, `第 ${idx + 1} 织 · ${t.authorName}`),
                    React.createElement("span", { style: { fontSize: "10px", color: "#A69B8F" } }, `${t.words} 字`)
                  ),
                  React.createElement("div", { style: { fontSize: "13.5px", lineHeight: "1.75", color: "#3E3832", whiteSpace: "pre-wrap" } }, t.text),
                  isLastChar &&
                    React.createElement(
                      "div",
                      { style: { display: "flex", justifyContent: "flex-end", marginTop: "6px" } },
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          disabled: isAiWriting,
                          onClick: handleRegenerateLastCharTurn,
                          style: { border: "none", background: "#F4F1EA", color: "#7A7062", fontSize: "11px", fontWeight: "600", padding: "3px 9px", borderRadius: "999px", cursor: "pointer" }
                        },
                        "↻ 换一种接法"
                      )
                    )
                );
              }),
              isAiWriting &&
                React.createElement("div", { style: { background: "#FFFFFF", borderRadius: "14px", padding: "12px 14px", borderLeft: "4px solid #5A8F6D", fontSize: "12.5px", color: "#5A8F6D", fontWeight: "600" } }, `✨ ${boundChar?.name || "名士"} 正在斟酌 2~3 句接话...`),
              errorMsg &&
                React.createElement("div", { style: { background: "#FEE2E2", color: "#B91C1C", fontSize: "12px", padding: "10px 12px", borderRadius: "12px" } }, errorMsg),
              /* 完结角色点评纪念卡 */
              isReviewing &&
                React.createElement("div", { style: { background: "#FFFFFF", borderRadius: "16px", padding: "18px", border: "1px dashed #D6724B", textAlign: "center", fontSize: "12.5px", color: "#D6724B", fontWeight: "700" } }, `✨ 正在请 ${boundChar?.name || activeStory?.charName || "名士"} 为本篇故事题名并点评...`),
              activeStory?.status === "completed" && activeStory?.review && !isReviewing && readerMode !== "clean" &&
                React.createElement(
                  "div",
                  { style: { background: "linear-gradient(135deg, #FFFDF9 0%, #FAF3E8 100%)", borderRadius: "18px", padding: "18px", border: "1.5px solid #DFCBB5", boxShadow: "0 6px 20px rgba(140,109,79,0.08)", display: "flex", flexDirection: "column", gap: "10px" } },
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                    React.createElement("span", { style: { fontSize: "15px", fontWeight: "800", color: "#5A4532" } }, activeStory.title || `《${activeStory.review.storyTitle}》`),
                    React.createElement("span", { style: { fontSize: "11px", fontWeight: "800", background: "#D6724B", color: "#FFFFFF", padding: "2px 9px", borderRadius: "999px" } }, `默契 ${activeStory.review.score || 95}`)
                  ),
                  React.createElement("div", { style: { fontSize: "11px", fontWeight: "700", color: "#8C6D4F" } }, `🏷️ ${activeStory.review.chemistryTag}`),
                  React.createElement("div", { style: { fontSize: "13px", lineHeight: "1.7", color: "#3E3832", background: "rgba(255,255,255,0.78)", padding: "10px 12px", borderRadius: "12px", borderLeft: "3px solid #D6724B" } },
                    React.createElement("strong", { style: { color: "#D6724B" } }, `${activeStory.charName} 点评：`),
                    activeStory.review.comment
                  ),
                  activeStory.review.favoriteLine &&
                    React.createElement("div", { style: { fontSize: "12px", color: "#5A8F6D", fontStyle: "italic", background: "#F2F7F4", padding: "8px 12px", borderRadius: "10px" } },
                      `🌿 TA 最偏爱的一句：“${activeStory.review.favoriteLine}”`
                    ),
                  React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" } },
                    React.createElement("button", { type: "button", onClick: handleRegenerateReview, style: { border: "1px solid #DFCBB5", background: "#FFFFFF", color: "#8C6D4F", fontSize: "11px", fontWeight: "700", padding: "5px 10px", borderRadius: "999px", cursor: "pointer" } }, "↻ 重新点评"),
                    React.createElement("button", { type: "button", onClick: () => { setActiveStory(null); setViewMode("setup"); }, style: { border: "none", background: "#5A8F6D", color: "#FFFFFF", fontSize: "11.5px", fontWeight: "700", padding: "6px 14px", borderRadius: "999px", cursor: "pointer" } }, "再织一篇")
                  )
                ),
              React.createElement("div", { ref: listEndRef })
            ),
            /* 底部输入区 */
            activeStory?.status !== "completed" &&
              React.createElement(
                "div",
                { style: { background: "#FFFFFF", borderTop: "1px solid #EAE2D3", padding: "10px 14px 16px", flexShrink: 0 } },
                React.createElement("textarea", {
                  value: userDraft,
                  onChange: (e) => setUserDraft(e.target.value),
                  disabled: isAiWriting,
                  placeholder: "写下 2~3 句话接续故事...",
                  rows: 2,
                  style: { width: "100%", padding: "10px 12px", borderRadius: "12px", border: "1px solid #DFD5C5", background: "#FAF8F4", fontSize: "13px", color: "#3E3832", boxSizing: "border-box", resize: "none", outline: "none" }
                }),
                React.createElement(
                  "div",
                  { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginTop: "8px" } },
                  React.createElement("span", { style: { fontSize: "11px", color: "#8C7D70" } }, `本段 ${countStoryWords(userDraft)} 字`),
                  React.createElement(
                    "div",
                    { style: { display: "flex", gap: "8px" } },
                    (activeStory?.turns?.length || 0) >= 2 &&
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          onClick: handleFinishStory,
                          style: { border: "1px solid #A8C8BA", background: "#E8F1ED", color: "#2D5A3F", padding: "8px 14px", borderRadius: "12px", fontSize: "12px", fontWeight: "700", cursor: "pointer" }
                        },
                        "完结并存档"
                      ),
                    React.createElement(
                      "button",
                      {
                        type: "button",
                        disabled: isAiWriting || !userDraft.trim(),
                        onClick: handleSubmitUserTurn,
                        style: { border: "none", background: isAiWriting || !userDraft.trim() ? "#D1D5DB" : "#D6724B", color: "#FFFFFF", padding: "8px 18px", borderRadius: "12px", fontSize: "12.5px", fontWeight: "700", cursor: isAiWriting ? "wait" : "pointer" }
                      },
                      isAiWriting ? "等待接话..." : "织入此段"
                    )
                  )
                )
              )
          ),
      /* 历史回顾书架抽屉 */
      showHistory &&
        React.createElement(
          "div",
          {
            onClick: () => setShowHistory(false),
            style: { position: "fixed", inset: 0, zIndex: 1150, background: "rgba(30,24,20,0.45)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end" }
          },
          React.createElement(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: { width: "86%", maxWidth: "350px", height: "100%", background: "#FAF7F2", boxShadow: "-8px 0 30px rgba(0,0,0,0.16)", display: "flex", flexDirection: "column", padding: "16px", boxSizing: "border-box" }
            },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "10px", borderBottom: "1px solid #EAE2D3" } },
              React.createElement("div", { style: { fontSize: "15px", fontWeight: "800", color: "#3E3832" } }, "📚 故事织机 · 历史书架"),
              React.createElement("button", { type: "button", onClick: () => setShowHistory(false), style: { border: "none", background: "#EFE9DC", color: "#7A7062", width: "28px", height: "28px", borderRadius: "50%", fontSize: "16px", cursor: "pointer" } }, "×")
            ),
            React.createElement("div", { style: { display: "flex", gap: "6px", padding: "10px 0" } },
              [
                { id: "all", label: "全部" },
                { id: "ongoing", label: "连载中" },
                { id: "completed", label: "已完结" }
              ].map((f) =>
                React.createElement("button", {
                  key: f.id,
                  type: "button",
                  onClick: () => setHistoryFilter(f.id),
                  style: {
                    border: "1px solid #E5DCCB",
                    background: historyFilter === f.id ? "#D6724B" : "#FFFFFF",
                    color: historyFilter === f.id ? "#FFFFFF" : "#6B6257",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "700",
                    cursor: "pointer"
                  }
                }, f.label)
              )
            ),
            React.createElement("div", { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" } },
              (() => {
                const filtered = historyList.filter((s) => historyFilter === "all" || s.status === historyFilter);
                if (filtered.length === 0) {
                  return React.createElement("div", { style: { textAlign: "center", color: "#9C9286", fontSize: "12.5px", padding: "48px 12px" } }, "书架空空如也，快去共同织写第一篇故事吧～");
                }
                return filtered.map((item) =>
                  React.createElement(
                    "div",
                    {
                      key: item.id,
                      onClick: () => handleOpenHistoryStory(item),
                      style: { background: "#FFFFFF", border: "1px solid #EAE2D3", borderRadius: "14px", padding: "12px", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }
                    },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } },
                      React.createElement("span", { style: { fontSize: "13px", fontWeight: "800", color: "#3E3832", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" } }, item.title || item.theme || "未命名故事"),
                      React.createElement("button", { type: "button", onClick: (e) => handleDeleteHistoryStory(e, item.id), style: { border: "none", background: "transparent", color: "#B0A496", fontSize: "15px", cursor: "pointer", padding: "0 4px" } }, "×")
                    ),
                    React.createElement("div", { style: { fontSize: "11px", color: "#7A7062", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
                      React.createElement("span", null, `与 ${item.charName}`),
                      React.createElement("span", null, `${item.currentWords || 0}/${item.targetWords || 500} 字`),
                      React.createElement("span", {
                        style: {
                          fontSize: "10px",
                          padding: "1px 6px",
                          borderRadius: "999px",
                          fontWeight: "700",
                          background: item.status === "completed" ? "#E8F1ED" : "#FEF3C7",
                          color: item.status === "completed" ? "#2D5A3F" : "#B45309"
                        }
                      }, item.status === "completed" ? "已完结" : "连载中 · 点此续写")
                    ),
                    item.review?.chemistryTag &&
                      React.createElement("div", { style: { fontSize: "10.5px", color: "#D6724B", marginTop: "4px", fontWeight: "600" } }, `🏷️ ${item.review.chemistryTag}`),
                    React.createElement("div", { style: { fontSize: "10px", color: "#A69B8F", marginTop: "4px" } }, new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleString())
                  )
                );
              })()
            )
          )
        )
    );
  };

  global.StoryLoomModal = StoryLoomModal;
})(typeof window !== "undefined" ? window : this);
