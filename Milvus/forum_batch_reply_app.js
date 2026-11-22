/**
 * Milvus/forum_batch_reply_app.js
 * 论坛（光晕球 / 超话圈 / 挂超话私信）帖子评论「单次合并 AI 生成」独立引擎（P0）
 * - 将原本「1 次 NPC + N 次密探串行循环（共 1+N 次扣费）」优化为「恒定 1 次合并调用」
 * - 精准筛选超话圈关联密探，避免误抓无关区域密探
 * - 提供爱心点赞旁的极简透明扣费徽标 window.ForumCostBadge
 */
(function (global) {
  "use strict";

  function normName(str) {
    return String(str || "").replace(/\s+/g, "").trim();
  }

  function matchCharName(a, b) {
    const na = normName(a);
    const nb = normName(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  // 精准筛选需要参与本帖回复的密探名单（区分超话圈与光晕球，避免误抓无关区域）
  function selectForumReplyRoles(post, loadedRoles, loadedAreas, selectedArea) {
    const allRoles = Array.isArray(loadedRoles) ? loadedRoles : [];
    if (allRoles.length === 0) return [];

    const postAuthorName = String(post?.authorName || post?.author?.name || "").trim();
    const excludeAuthor = (r) => {
      if (!r) return false;
      if (post?.authorRoleId && String(r.id) === String(post.authorRoleId)) return false;
      if (postAuthorName && r.name === postAuthorName) return false;
      return true;
    };

    const rawAreaName = String(post?.areaContent?.name || "").trim();
    const superMatch = rawAreaName.match(/#?\s*([^#\s]+?)\s*超话\s*#?/);
    const isSuperTopic =
      post?.sourceType === "supertopic" ||
      Boolean(post?.circleCharName) ||
      Boolean(superMatch) ||
      /超话/.test(rawAreaName);

    if (isSuperTopic) {
      const hostName = String(post?.circleCharName || (superMatch && superMatch[1]) || "").trim();
      const eligible = allRoles.filter(excludeAuthor);
      const picked = [];
      // 1. 优先把超话正主放入首位
      if (hostName) {
        const host = eligible.find((r) => matchCharName(r.name, hostName));
        if (host) picked.push(host);
      }
      // 2. 从其余密探中精选最多 2~3 位（总上限 4 位），避免超话帖乱入过多无关角色
      const others = eligible.filter((r) => !picked.some((p) => String(p.id) === String(r.id)));
      const shuffled = [...others].sort(() => Math.random() - 0.5);
      for (const r of shuffled) {
        if (picked.length >= 4) break;
        picked.push(r);
      }
      return picked;
    }

    // 光晕球普通区域帖：优先当前选中区域的关联密探（最多 5 位）
    const areas = Array.isArray(loadedAreas) ? loadedAreas : [];
    const currentAreaConfig =
      (selectedArea && areas.find((a) => String(a.id) === String(selectedArea.id))) ||
      selectedArea ||
      areas[0];
    const roleIds = currentAreaConfig?.formData?.roles || [];
    const picked = [];
    for (const rid of roleIds) {
      const found = allRoles.find((r) => String(r.id) === String(rid));
      if (found && excludeAuthor(found) && !picked.some((p) => String(p.id) === String(found.id))) {
        picked.push(found);
      }
      if (picked.length >= 5) break;
    }
    return picked;
  }

  // 三层容错解析单次合并返回结果
  function parseBatchReplies(rawText, selectedRoles, parseRepliesFromText) {
    const cleaned = String(rawText || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const tryJson = (s) => {
      try {
        const obj = JSON.parse(s);
        if (obj && typeof obj === "object" && (Array.isArray(obj.npcReplies) || Array.isArray(obj.roleReplies))) {
          return obj;
        }
      } catch (e) {}
      return null;
    };

    let parsed = tryJson(cleaned);
    if (!parsed) {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) parsed = tryJson(m[0]) || tryJson(m[0].replace(/\r?\n/g, "\\n"));
    }

    const npcOut = [];
    const roleOut = [];
    const matchedRoleIds = new Set();

    const findRoleObj = (rawRoleName) => {
      const n = normName(rawRoleName);
      if (!n) return null;
      return (
        selectedRoles.find((r) => normName(r.name) === n) ||
        selectedRoles.find((r) => matchCharName(r.name, n)) ||
        null
      );
    };

    if (parsed) {
      (Array.isArray(parsed.npcReplies) ? parsed.npcReplies : []).forEach((it, idx) => {
        const content = String(it?.content || it?.text || "").trim();
        if (!content) return;
        const npcName = String(it?.npc || it?.author || it?.name || "吃瓜路人").trim().slice(0, 14);
        npcOut.push({
          id: Date.now() + Math.random() + idx,
          npc: npcName,
          content,
          likes: Math.floor(Math.random() * 28) + 3,
          liked: false
        });
      });

      (Array.isArray(parsed.roleReplies) ? parsed.roleReplies : []).forEach((it, idx) => {
        const content = String(it?.content || it?.text || "").trim();
        if (!content) return;
        const matched = findRoleObj(it?.role || it?.name);
        if (matched && !matchedRoleIds.has(String(matched.id))) {
          matchedRoleIds.add(String(matched.id));
          roleOut.push({
            id: Date.now() + Math.random() + 100 + idx,
            role: matched.name,
            roleId: matched.id,
            content,
            likes: Math.floor(Math.random() * 35) + 8,
            liked: false
          });
        }
      });

      if (npcOut.length > 0 || roleOut.length > 0) {
        return { npcReplies: npcOut, roleReplies: roleOut };
      }
    }

    // 兜底：按 [姓名]: 内容 逐行拆分为密探与路人
    const fallbackLines =
      typeof parseRepliesFromText === "function" ? parseRepliesFromText(rawText) : [];
    fallbackLines.forEach((item, idx) => {
      const speaker = item.npc || item.role || "";
      const content = String(item.content || "").trim();
      if (!content) return;
      const matched = findRoleObj(speaker);
      if (matched && !matchedRoleIds.has(String(matched.id))) {
        matchedRoleIds.add(String(matched.id));
        roleOut.push({
          id: Date.now() + Math.random() + 200 + idx,
          role: matched.name,
          roleId: matched.id,
          content,
          likes: Math.floor(Math.random() * 30) + 5,
          liked: false
        });
      } else {
        npcOut.push({
          id: Date.now() + Math.random() + idx,
          npc: speaker || "路过吃瓜",
          content,
          likes: Math.floor(Math.random() * 20) + 2,
          liked: false
        });
      }
    });

    return { npcReplies: npcOut, roleReplies: roleOut };
  }

  // 核心单次合并生成入口：恒定仅调用 1 次 window.sendToLLM
  async function generatePostRepliesInOneCall({
    post,
    sectionName,
    loadedRoles,
    loadedAreas,
    selectedArea,
    seededNpc,
    getFallbackNpcReplies,
    parseRepliesFromText
  }) {
    const baseSeeded = Array.isArray(seededNpc) ? seededNpc : [];
    const fallbackNpc =
      baseSeeded.length > 0
        ? baseSeeded
        : typeof getFallbackNpcReplies === "function"
        ? getFallbackNpcReplies(post?.title)
        : [];

    if (typeof global.sendToLLM !== "function") {
      return { npcReplies: fallbackNpc, roleReplies: [] };
    }

    const selectedRoles = selectForumReplyRoles(post, loadedRoles, loadedAreas, selectedArea);
    const postAuthorName = String(post?.authorName || post?.author?.name || "匿名网友").trim();
    const postBody = String(post?.content || "无").trim().slice(0, 420);

    let worldHint = "";
    try {
      if (typeof global.getWorldBookContext === "function") {
        const wb = await global.getWorldBookContext();
        if (wb && String(wb).trim()) {
          worldHint = `\n【当前世界书背景节选】\n${String(wb).trim().slice(0, 450)}`;
        }
      }
    } catch (e) {}

    const rolesBlock =
      selectedRoles.length > 0
        ? selectedRoles
            .map((r, idx) => {
              const p = r.profile || {};
              const style = p.speakingStyle || r.speakingStyle || p.style || r.style || "贴合原著口吻";
              const personality = p.personality || r.personality || "性格鲜明";
              const identity = p.identity || r.identity || "密探";
              const mbti = p.mbti || r.mbti || "";
              return `${idx + 1}. 姓名：${r.name} | 身份：${identity}${mbti ? ` | MBTI：${mbti}` : ""} | 性格：${personality} | 语言风格：${style}`;
            })
            .join("\n")
        : "（本帖无指定密探，roleReplies 返回空数组 [] 即可）";

    const prompt = `你正在为论坛板块【${sectionName || "光晕球"}】的一篇帖子一次性生成「路人网友评论」与「指定密探回复」。

【帖子信息】
- 标题：《${post?.title || "无题"}》
- 发帖人：${postAuthorName}
- 正文：${postBody}${worldHint}

【待回复密探名单（每位严格按自身人设与语言风格写 1 条，严禁互相串味或 OOC）】
${rolesBlock}

【输出要求】
1. npcReplies：生成 4~5 条风格鲜活、接地气的路人网友评论（网名真实多样，禁止出现“路人甲/网友A”等模板名；每条 12~45 字）。
2. roleReplies：为名单中每一位密探各生成 1 条回复（每条 15~45 字，role 字段必须与名单中的姓名完全一致，严禁 OOC）。
3. 请严格返回纯 JSON 对象（不要 \`\`\`json 代码块包裹）：
{
  "npcReplies": [
    { "npc": "真实感网名", "content": "评论内容" }
  ],
  "roleReplies": [
    { "role": "密探姓名", "content": "符合人设的回复内容" }
  ]
}`;

    const rawReply = await new Promise((resolve) => {
      try {
        global.sendToLLM(
          [{ role: "user", content: prompt }],
          { disableMCP: true },
          (res) => resolve(res || ""),
          () => resolve("")
        );
      } catch (e) {
        resolve("");
      }
    });

    if (!rawReply) {
      return { npcReplies: fallbackNpc, roleReplies: [] };
    }

    const { npcReplies, roleReplies } = parseBatchReplies(rawReply, selectedRoles, parseRepliesFromText);
    const finalNpc = npcReplies.length > 0 ? [...baseSeeded, ...npcReplies] : fallbackNpc;
    return { npcReplies: finalNpc, roleReplies };
  }

  const MANUAL_MODE_KEY = "forum_manual_comments_mode";

  function getForumManualCommentsMode() {
    try {
      return localStorage.getItem(MANUAL_MODE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function setForumManualCommentsMode(enabled) {
    try {
      localStorage.setItem(MANUAL_MODE_KEY, enabled ? "1" : "0");
    } catch (e) {}
  }

  // 轻量级全局浮动提示（如「挂到超话」0 消耗提示）
  function showForumCostToast(message) {
    if (typeof document === "undefined" || !message) return;
    try {
      const prev = document.getElementById("milvus-forum-cost-toast");
      if (prev) prev.remove();
      const el = document.createElement("div");
      el.id = "milvus-forum-cost-toast";
      el.textContent = String(message);
      Object.assign(el.style, {
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: "99999",
        maxWidth: "90vw",
        padding: "9px 15px",
        borderRadius: "999px",
        background: "rgba(41, 37, 36, 0.94)",
        color: "#FAF8F5",
        fontSize: "12px",
        fontWeight: "600",
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        pointerEvents: "none",
        textAlign: "center",
        transition: "opacity 0.28s ease"
      });
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => {
          try {
            el.remove();
          } catch (e) {}
        }, 300);
      }, 3000);
    } catch (e) {}
  }

  // 爱心点赞旁的极简单次合并扣费与省流模式开关徽标
  const ForumCostBadge = ({ loading, roleCount, awaitingManual }) => {
    const h = React.createElement;
    const [showTip, setShowTip] = React.useState(false);
    const [manualMode, setManualMode] = React.useState(() => getForumManualCommentsMode());

    const handleToggleManual = (e) => {
      e.stopPropagation();
      const next = !manualMode;
      setManualMode(next);
      setForumManualCommentsMode(next);
      showForumCostToast(
        next ? "已开启省流模式：进新帖不自动扣费，需手动点生成" : "已关闭省流模式：进新帖自动单次合并生成评论"
      );
    };

    return h(
      "div",
      { style: { position: "relative", display: "inline-flex", alignItems: "center" } },
      h(
        "button",
        {
          type: "button",
          onClick: (e) => {
            e.stopPropagation();
            setShowTip((v) => !v);
          },
          title: "点击查看扣费说明与省流开关",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "3px",
            border: loading ? "1px solid #F3D5B5" : awaitingManual ? "1px solid #CBE0D6" : "1px solid #E5E7EB",
            background: loading ? "#FFF8EB" : awaitingManual ? "#EAF5EF" : "#F9FAFB",
            color: loading ? "#B45309" : awaitingManual ? "#2E6B50" : "#6B7280",
            fontSize: "10px",
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: "999px",
            cursor: "pointer",
            whiteSpace: "nowrap"
          }
        },
        loading ? "⚡ 单次合并中(1次)" : awaitingManual ? "⚡ 省流待生成(0消耗)" : "⚡ 1次合并·已缓存"
      ),
      showTip &&
        h(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: 0,
              zIndex: 60,
              width: "232px",
              padding: "10px 12px",
              borderRadius: "12px",
              background: "#292524",
              color: "#FAF8F5",
              fontSize: "11px",
              lineHeight: "1.55",
              boxShadow: "0 8px 20px rgba(0,0,0,0.22)"
            }
          },
          h(
            "div",
            { style: { marginBottom: "8px" } },
            `已将路人评论与${roleCount > 0 ? ` ${roleCount} 位` : "全部"}密探回复合并为 1 次 AI 调用（不再逐人扣费）。已生成帖子读缓存 0 消耗。`
          ),
          h(
            "button",
            {
              type: "button",
              onClick: handleToggleManual,
              style: {
                width: "100%",
                border: "1px solid rgba(255,255,255,0.2)",
                background: manualMode ? "#4F8A6E" : "rgba(255,255,255,0.08)",
                color: "#FFFFFF",
                borderRadius: "8px",
                padding: "5px 8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }
            },
            manualMode ? "✓ 省流模式已开启（点此关闭）" : "开启省流：进帖手动点才生成"
          )
        )
    );
  };

  // 省流模式开启时，评论区的手动单次生成卡片
  const ForumManualCommentsCard = ({ loading, onGenerate }) => {
    const h = React.createElement;
    return h(
      "div",
      {
        style: {
          background: "#FFFFFF",
          border: "1px dashed #E5D5C5",
          borderRadius: "14px",
          padding: "16px 14px",
          textAlign: "center",
          marginBottom: "10px"
        }
      },
      h(
        "div",
        { style: { fontSize: "12px", color: "#78716C", marginBottom: "10px" } },
        "已开启省流模式（当前 0 消耗），点击下方一次性合并生成路人评论与密探回复"
      ),
      h(
        "button",
        {
          type: "button",
          disabled: loading,
          onClick: onGenerate,
          style: {
            border: "none",
            borderRadius: "999px",
            padding: "7px 16px",
            background: loading ? "#C9B9AA" : "#D6724B",
            color: "#FFFFFF",
            fontSize: "12px",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer"
          }
        },
        loading ? "⚡ 单次合并生成中…" : "✨ 生成本帖评论与密探回复（消耗 1 次）"
      )
    );
  };

  // ==========================================
  // 首页「话题名人卡片（3张轮播）」与「话题名人榜 Top 3」联动 + 新版四源对齐引擎
  // ==========================================
  const HOME_CARD_THEMES = [
    { avatarBg: "#FCEFE3", iconColor: "#E6B980", themeColor: "#FDF6EE" },
    { avatarBg: "#FBE8E8", iconColor: "#E88C8C", themeColor: "#FEF6F6" },
    { avatarBg: "#E8F5E9", iconColor: "#81C784", themeColor: "#F1F8F1" }
  ];

  function mapBoardTop3ToHomeCards(celebList) {
    if (!Array.isArray(celebList) || celebList.length === 0) return null;
    const top3 = celebList.filter((c) => c && c.name).slice(0, 3);
    if (top3.length === 0) return null;
    return top3.map((c, idx) => {
      const th = HOME_CARD_THEMES[idx % HOME_CARD_THEMES.length];
      const tags = Array.isArray(c.tags) ? c.tags.filter(Boolean) : [];
      const headline = String(c.headline || "").trim();
      const tagLine = headline
        ? (headline.startsWith("#") ? headline : `#${headline}`)
        : (tags[0] || `#Top${idx + 1} 话题焦点`);
      const subTag = c.relTrigger
        ? `#🔗 ${c.relTrigger}`
        : (tags[1] || (c.heat ? `#热度 ${c.heat}` : "#全网热议"));
      return {
        id: c.id || idx + 1,
        name: String(c.name).trim(),
        tagLine: tagLine.slice(0, 26),
        subTag: subTag.slice(0, 26),
        avatarBg: th.avatarBg,
        iconColor: th.iconColor,
        themeColor: th.themeColor
      };
    });
  }

  // 零消耗从「话题名人榜」同步 Top 3 至首页卡片
  async function loadSyncedHomeCelebrityCards() {
    let celebList = null;
    try {
      if (global.mansionStore && typeof global.mansionStore.get === "function") {
        celebList = await global.mansionStore.get("topic_celebrities_v1");
      }
    } catch (e) {}
    if (!Array.isArray(celebList) || celebList.length === 0) {
      try {
        const raw = localStorage.getItem("cached_celebrities");
        if (raw) celebList = JSON.parse(raw);
      } catch (e) {}
    }
    return mapBoardTop3ToHomeCards(celebList);
  }

  // 手动刷新首页 3 张卡片时，对齐：新版世界书 + 通讯录名士 + 个人中心关系网 + 光晕球热帖
  async function generateHomeCelebrityCardsSmart(hotTrackingInfo) {
    let wbLines = [];
    try {
      if (global.worldBookStore && typeof global.worldBookStore.getData === "function") {
        const wbData = await global.worldBookStore.getData();
        const allWb = Array.isArray(wbData) ? wbData : wbData?.books || [];
        wbLines = allWb
          .filter((e) => e && e.enabled !== false)
          .map((e) => `[${e.name || e.title}]: ${String(e.content || "").slice(0, 140)}`);
      }
    } catch (e) {}

    let charBriefs = [];
    try {
      let chars = [];
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        chars = await global.chatCharacterStore.getAll();
      } else {
        chars = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      }
      charBriefs = (chars || [])
        .filter((c) => c && c.name && !c.isGroup && c.type !== "group" && c.type !== "decor")
        .slice(0, 15)
        .map((c) => `- ${c.name}：${String(c.profile?.personality || c.personality || "名士").slice(0, 40)}`);
    } catch (e) {}

    let relLines = [];
    try {
      let relData = null;
      if (global.relationshipStore && typeof global.relationshipStore.getData === "function") {
        relData = await global.relationshipStore.getData();
      }
      if (!relData || !Array.isArray(relData.nodes)) {
        const rawRel = localStorage.getItem("relationship_data");
        if (rawRel) relData = JSON.parse(rawRel);
      }
      if (relData && Array.isArray(relData.nodes) && Array.isArray(relData.links)) {
        const myName = localStorage.getItem("user_name") || "主控(我)";
        const nodeMap = new Map();
        relData.nodes.forEach((n) => {
          if (n && n.id !== undefined) {
            const disp = n.id === "1" || n.group === "center" ? `${myName}(我)` : n.name || "";
            nodeMap.set(String(n.id), disp);
          }
        });
        relData.links.slice(0, 14).forEach((lk) => {
          const s = nodeMap.get(String(typeof lk.source === "object" ? lk.source.id : lk.source));
          const t = nodeMap.get(String(typeof lk.target === "object" ? lk.target.id : lk.target));
          if (s && t) relLines.push(`${s} —[${lk.relation || "关联"}]→ ${t}`);
        });
      }
    } catch (e) {}

    const hotBriefs = (Array.isArray(hotTrackingInfo) ? hotTrackingInfo : [])
      .slice(0, 5)
      .map((h) => `- 《${h.title}》（热度 ${h.hotScore || 0}）`);

    const prompt = `请结合以下【通讯录名士录】、【个人中心关系网】、【开启的世界书】与【光晕球热帖】，生成 3 张最具活人吃瓜感的「论坛首页话题名人卡片」。
要求：优先挑选关系网中有连线、或世界书/热帖中最具话题度的 3 位人物（可包含通讯录名士与世界书风云人物），tagLine 和 subTag 需带 # 号且简短有梗（各 6~16 字）。
${charBriefs.length ? `\n【通讯录名士录】\n${charBriefs.join("\n")}` : ""}
${relLines.length ? `\n【个人中心关系网】\n${relLines.join("\n")}` : ""}
${wbLines.length ? `\n【当前开启世界书】\n${wbLines.join("\n").slice(0, 900)}` : ""}
${hotBriefs.length ? `\n【光晕球热门帖】\n${hotBriefs.join("\n")}` : ""}

请严格返回纯 JSON 数组（不要 \`\`\`json 包裹），长度固定为 3：
[
  { "id": 1, "name": "名人姓名", "tagLine": "#主话题标签", "subTag": "#副吃瓜标签", "avatarBg": "#FCEFE3", "iconColor": "#E6B980", "themeColor": "#FDF6EE" }
]`;

    return new Promise((resolve, reject) => {
      if (typeof global.sendToLLM !== "function") {
        reject(new Error("未配置 LLM API"));
        return;
      }
      global.sendToLLM(
        [
          { role: "system", content: "你是论坛话题名人策划专家，擅长结合世界书、名士录与关系网提炼 3 张高网感首页焦点名人卡片。" },
          { role: "user", content: prompt }
        ],
        { disableMCP: true },
        (reply) => {
          try {
            const clean = String(reply || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            const arrMatch = clean.match(/\[[\s\S]*\]/);
            const parsed = JSON.parse(arrMatch ? arrMatch[0] : clean);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const normalized = parsed.slice(0, 3).map((item, idx) => {
                const th = HOME_CARD_THEMES[idx % HOME_CARD_THEMES.length];
                return {
                  id: item.id || idx + 1,
                  name: String(item.name || `焦点名士${idx + 1}`).trim(),
                  tagLine: String(item.tagLine || "#全网热议").trim(),
                  subTag: String(item.subTag || "#话题焦点").trim(),
                  avatarBg: /^#[0-9a-fA-F]{6}$/.test(String(item.avatarBg || "")) ? item.avatarBg : th.avatarBg,
                  iconColor: /^#[0-9a-fA-F]{6}$/.test(String(item.iconColor || "")) ? item.iconColor : th.iconColor,
                  themeColor: /^#[0-9a-fA-F]{6}$/.test(String(item.themeColor || "")) ? item.themeColor : th.themeColor
                };
              });
              resolve(normalized);
              return;
            }
          } catch (e) {}
          reject(new Error("解析名人卡片返回数据失败"));
        },
        (err) => reject(new Error(typeof err === "string" ? err : err?.message || "请求失败"))
      );
    });
  }

  global.mapBoardTop3ToHomeCards = mapBoardTop3ToHomeCards;
  global.loadSyncedHomeCelebrityCards = loadSyncedHomeCelebrityCards;
  global.generateHomeCelebrityCardsSmart = generateHomeCelebrityCardsSmart;
  global.getForumManualCommentsMode = getForumManualCommentsMode;
  global.setForumManualCommentsMode = setForumManualCommentsMode;
  global.showForumCostToast = showForumCostToast;
  global.selectForumReplyRoles = selectForumReplyRoles;
  global.generatePostRepliesInOneCall = generatePostRepliesInOneCall;
  global.ForumCostBadge = ForumCostBadge;
  global.ForumManualCommentsCard = ForumManualCommentsCard;
})(typeof window !== "undefined" ? window : globalThis);
