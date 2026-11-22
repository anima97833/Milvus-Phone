/**
 * Milvus/forum_share_app.js
 * 论坛（光晕球）→ 传讯 · 帖子转发卡片独立模块化引擎（P0）
 * - window.ForumSharePickerModal：帖子详情页「转发」名士选择弹窗
 * - window.ForumShareCardBubble：传讯聊天流中的极简分享卡片（仅显示标题+发帖人，左下已阅/右下拒收）
 * - window.ForumShareDetailModal：点击卡片展开的完整帖子正文与评论区详情弹窗
 */
(function (global) {
  "use strict";

  // 安全异步头像组件（对齐 傩·观影 NuoAvatar / resolveAvatarUrl / avatarStore.get 机制）
  const ShareCharAvatar = ({ avatar, name, size = 38 }) => {
    const h = React.createElement;
    const [src, setSrc] = React.useState("");
    const [hasError, setHasError] = React.useState(false);

    React.useEffect(() => {
      let alive = true;
      setHasError(false);
      const resolve = async () => {
        if (!avatar) {
          if (alive) setSrc("");
          return;
        }
        if (typeof avatar === "string") {
          if (
            avatar.startsWith("data:image") ||
            avatar.startsWith("http://") ||
            avatar.startsWith("https://") ||
            avatar.startsWith("blob:") ||
            avatar.startsWith("/") ||
            avatar.startsWith("./") ||
            /^(emoji-time\/|Milvus\/)/i.test(avatar) ||
            /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(avatar)
          ) {
            if (alive) setSrc(avatar);
            return;
          }
          try {
            if (typeof global.resolveAvatarUrl === "function") {
              const res = await global.resolveAvatarUrl(avatar, "");
              if (alive && res) {
                setSrc(res);
                return;
              }
            }
            const store = global.avatarStore || (typeof avatarStore !== "undefined" ? avatarStore : null);
            if (store && typeof store.get === "function") {
              const item = await store.get(avatar);
              const url = item && (item.avatarData || item.data || item.url || "");
              if (alive && url) {
                setSrc(url);
                return;
              }
            }
            if (store && typeof store.getAvatar === "function") {
              const res = await store.getAvatar(avatar);
              const url = typeof res === "string" ? res : res?.avatarData || res?.data || res?.url || "";
              if (alive && url) {
                setSrc(url);
                return;
              }
            }
          } catch (e) { }
          if (alive) setSrc("");
        } else if (typeof avatar === "object") {
          const url = avatar.avatarData || avatar.data || avatar.url || avatar.src || "";
          if (alive && typeof url === "string") setSrc(url);
        }
      };
      resolve();
      return () => {
        alive = false;
      };
    }, [avatar]);

    if (src && !hasError) {
      return h("img", {
        src,
        alt: name || "名士",
        onError: () => setHasError(true),
        style: {
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          border: "1px solid #EFEAE2"
        }
      });
    }
    return h(
      "div",
      {
        style: {
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #D6724B 0%, #B85D43 100%)",
          color: "#FFFFFF",
          fontSize: `${Math.round(size * 0.42)}px`,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }
      },
      String(name || "名")[0]
    );
  };

  // 识别帖子来源（光晕球 vs 超话圈 vs 名人小报）并提取关联名士与风向
  function detectPostSource(post, sectionName) {
    const rawArea = String(post?.areaContent?.name || sectionName || "").trim();
    const isTabloid = post?.sourceType === "tabloid" || Boolean(post?.tabloidCharName);
    if (isTabloid) {
      const tabloidCharName = String(post?.tabloidCharName || post?.circleCharName || "").trim();
      const areaName = rawArea || (tabloidCharName ? `${tabloidCharName}风闻小报` : "名人风闻小报");
      return {
        sourceType: "tabloid",
        circleCharName: tabloidCharName,
        tabloidCharName,
        windMode: String(post?.tag || post?.windMode || "").trim(),
        areaName
      };
    }
    const superMatch = rawArea.match(/#?\s*([^#\s]+?)\s*超话\s*#?/);
    const isSuperTopic =
      post?.sourceType === "supertopic" ||
      Boolean(post?.circleCharName) ||
      Boolean(superMatch) ||
      /超话/.test(rawArea);
    const circleCharName = String(post?.circleCharName || (superMatch && superMatch[1]) || "").trim();
    const windMode = String(post?.windMode || "").trim();
    const areaName = isSuperTopic
      ? (rawArea || (circleCharName ? `#${circleCharName}超话#` : "超话圈"))
      : (rawArea || "光晕球");
    return {
      sourceType: isSuperTopic ? "supertopic" : "halo",
      circleCharName,
      tabloidCharName: "",
      windMode,
      areaName
    };
  }

  function isMatchingSuperTopicHost(charName, circleCharName) {
    const a = String(charName || "").replace(/\s+/g, "").trim();
    const b = String(circleCharName || "").replace(/\s+/g, "").trim();
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  // 将帖子与当前评论区整理为结构化快照（兼容 npcReplies 的 r.npc 路人网名 + 列表快捷转发时自动读取本地缓存评论）
  function buildPostSnapshot({ post, author, sectionName, postLikes, totalCommentsCount, npcReplies, roleReplies, userReplies }) {
    const src = detectPostSource(post, sectionName);
    let finalUser = userReplies;
    let finalRole = roleReplies;
    let finalNpc = npcReplies;
    if ((!finalUser || finalUser.length === 0) && (!finalRole || finalRole.length === 0) && (!finalNpc || finalNpc.length === 0) && post?.id) {
      try {
        const cachedRaw = localStorage.getItem(`post_detail_cache_${post.id}`);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (Array.isArray(cached?.userReplies)) finalUser = cached.userReplies;
          if (Array.isArray(cached?.roleReplies)) finalRole = cached.roleReplies;
          if (Array.isArray(cached?.npcReplies)) finalNpc = cached.npcReplies;
        }
      } catch (e) { }
    }
    const combinedComments = [];
    (finalUser || []).forEach((r) => {
      combinedComments.push({
        id: r.id || "u_" + Math.random().toString(36).slice(2, 6),
        author: r.userName || "你",
        badge: "你",
        text: String(r.content || "").trim(),
        likes: Number(r.likes || 0),
        time: r.timestamp || ""
      });
    });
    (finalRole || []).forEach((r) => {
      combinedComments.push({
        id: r.id || "r_" + Math.random().toString(36).slice(2, 6),
        author: r.role || "密友",
        badge: "密友",
        text: String(r.content || "").trim(),
        likes: Number(r.likes || 0),
        time: r.timestamp || ""
      });
    });
    (finalNpc || []).forEach((r) => {
      combinedComments.push({
        id: r.id || "n_" + Math.random().toString(36).slice(2, 6),
        author: r.npc || r.author || r.userName || "路人",
        badge: r.badge || "",
        text: String(r.content || "").trim(),
        likes: Number(r.likes || 0),
        time: r.timestamp || ""
      });
    });
    // 兼容名人小报自带的用户批注评论（post.userComments）
    if (Array.isArray(post?.userComments)) {
      post.userComments.forEach((r) => {
        if (!r || !r.text) return;
        combinedComments.push({
          id: r.id || "tc_" + Math.random().toString(36).slice(2, 6),
          author: r.author || "你",
          badge: "小报批注",
          text: String(r.text || "").trim(),
          likes: 0,
          time: r.time || ""
        });
      });
    }

    const cleanComments = combinedComments.filter((c) => c.text).slice(0, 30);
    return {
      sourceType: src.sourceType,
      circleCharName: src.circleCharName,
      tabloidCharName: src.tabloidCharName || "",
      windMode: src.windMode,
      postId: String(post?.id || "post_" + Date.now()),
      areaName: src.areaName,
      title: String(post?.title || "无题").trim(),
      authorName: String(author?.name || post?.author?.name || post?.source || post?.reporter || post?.author || "匿名帖主").trim(),
      authorBadge: String(author?.badge || post?.author?.badge || (src.sourceType === "tabloid" ? "八卦小报" : "")).trim(),
      authorColor: String(author?.color || "#D6724B"),
      postDate: String(post?.date || "刚刚"),
      body: String(post?.content || "该帖子暂无详细内容").trim(),
      likes: Number(postLikes || post?.likes || 0),
      commentsCount: Number(totalCommentsCount || cleanComments.length || 0),
      comments: cleanComments
    };
  }

  // 投递论坛分享卡片至指定名士的传讯聊天主线（不自动触发 AI 回复）
  async function sendForumPostToChat(targetChar, snapshot, forwardNote) {
    if (!targetChar || !targetChar.id) {
      throw new Error("未找到目标名士");
    }
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const cleanNote = String(forwardNote || "").trim().slice(0, 120);
    const isTabloid = snapshot.sourceType === "tabloid";
    const isSuper = !isTabloid && (snapshot.sourceType === "supertopic" || /超话/.test(String(snapshot.areaName || "")));
    const textPrefix = isTabloid ? "【名人小报转发】" : isSuper ? "【超话圈帖子转发】" : "【光晕球帖子转发】";
    const previewPrefix = isTabloid ? "[小报分享]" : isSuper ? "[超话分享]" : "[论坛分享]";
    const shareMsg = {
      id: now,
      type: "forum_share_card",
      isMe: true,
      sender: "user",
      time: timeStr,
      timestamp: now,
      text: `${textPrefix}《${snapshot.title}》 - ${snapshot.authorName}`,
      content: {
        ...snapshot,
        forwardNote: cleanNote,
        cardStatus: "pending",
        statusUpdatedAt: null,
        actionBy: ""
      }
    };

    // 1. 持久化写入 IndexedDB（window.chatHistoryStore）
    if (global.chatHistoryStore && typeof global.chatHistoryStore.saveMessage === "function") {
      await global.chatHistoryStore.saveMessage(targetChar.id, shareMsg);
    }

    // 2. 兼容同步 localStorage 历史缓存（若存在）
    try {
      const lsKey = `t8_chat_history_${targetChar.id}`;
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.push(shareMsg);
          localStorage.setItem(lsKey, JSON.stringify(arr));
        }
      }
    } catch (e) { }

    // 3. 同步更新传讯列表最新摘要预览
    try {
      const listRaw = localStorage.getItem("t8_chat_list");
      if (listRaw) {
        const list = JSON.parse(listRaw);
        if (Array.isArray(list)) {
          const next = list.map((c) =>
            String(c.id) === String(targetChar.id)
              ? { ...c, lastMessage: `${previewPrefix} 《${snapshot.title}》`, lastTime: timeStr, time: timeStr, updatedAt: now }
              : c
          );
          localStorage.setItem("t8_chat_list", JSON.stringify(next));
        }
      }
    } catch (e) { }

    // 4. 派发自定义事件，通知传讯列表与正在打开的传讯页实时同步
    try {
      global.dispatchEvent(new CustomEvent("reloadChats"));
      global.dispatchEvent(
        new CustomEvent("milvus-forum-share-sent", {
          detail: { charId: String(targetChar.id), msg: shareMsg }
        })
      );
    } catch (e) { }

    return shareMsg;
  }

  // ==========================================
  // 1. 帖子完整详情预览弹窗（点击传讯卡片展开）
  // ==========================================
  const ForumShareDetailModal = ({ content, onClose }) => {
    const h = React.createElement;
    if (!content) return null;
    const comments = Array.isArray(content.comments) ? content.comments : [];
    const isTabloid = content.sourceType === "tabloid";
    const isSuper = !isTabloid && (content.sourceType === "supertopic" || /超话/.test(String(content.areaName || "")));

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 12000,
          background: "rgba(28, 25, 23, 0.52)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "14px"
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
            maxWidth: "410px",
            maxHeight: "84vh",
            background: "#FAF8F5",
            borderRadius: "20px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0,0,0,0.24)",
            border: "1px solid #EAE2D6"
          }
        },
        // 顶栏
        h(
          "div",
          {
            style: {
              padding: "12px 16px",
              background: "#FFFFFF",
              borderBottom: "1px solid #EFEAE2",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "6px" } },
            h(
              "span",
              {
                style: {
                  fontSize: "11px",
                  fontWeight: 700,
                  color: isTabloid ? "#A16207" : isSuper ? "#7C4D99" : "#D6724B",
                  background: isTabloid ? "#FEF7E0" : isSuper ? "#F5EEFA" : "#FFF0E6",
                  padding: "2px 8px",
                  borderRadius: "999px"
                }
              },
              isTabloid
                ? `📰 名人小报 · ${content.areaName || "风闻小报"}`
                : isSuper
                  ? `#️⃣ 超话圈 · ${content.areaName || "超话"}`
                  : `光晕球 · #${content.areaName || "热议"}`
            ),
            (isSuper || isTabloid) &&
            content.windMode &&
            h(
              "span",
              {
                style: {
                  fontSize: "10.5px",
                  fontWeight: 600,
                  color: "#8C7B6C",
                  background: "#F5F1EB",
                  padding: "2px 7px",
                  borderRadius: "999px"
                }
              },
              isTabloid ? content.windMode : `风向：${content.windMode}`
            )
          ),
          h(
            "button",
            {
              onClick: onClose,
              style: {
                border: "none",
                background: "#F3F1EC",
                color: "#57534E",
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                cursor: "pointer",
                fontSize: "13px"
              }
            },
            "✕"
          )
        ),
        // 滚动内容区：发帖人 + 标题 + 正文 + 评论区
        h(
          "div",
          {
            style: {
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "14px"
            }
          },
          // 帖子主体卡片
          h(
            "div",
            {
              style: {
                background: "#FFFFFF",
                border: "1px solid #EFEAE2",
                borderRadius: "16px",
                padding: "14px"
              }
            },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" } },
              h(
                "div",
                {
                  style: {
                    width: "34px",
                    height: "34px",
                    borderRadius: "50%",
                    background: content.authorColor || "#D6724B",
                    color: "#FFFFFF",
                    fontWeight: 700,
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }
                },
                String(content.authorName || "匿")[0]
              ),
              h(
                "div",
                null,
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "6px" } },
                  h("span", { style: { fontSize: "13px", fontWeight: 700, color: "#292524" } }, content.authorName || "匿名帖主"),
                  content.authorBadge &&
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "10px",
                        padding: "1px 6px",
                        borderRadius: "6px",
                        background: "#FFF0E6",
                        color: "#D6724B",
                        fontWeight: 600
                      }
                    },
                    content.authorBadge
                  )
                ),
                h("div", { style: { fontSize: "11px", color: "#A8A29E", marginTop: "2px" } }, content.postDate || "刚刚")
              )
            ),
            h(
              "div",
              { style: { fontSize: "15.5px", fontWeight: 700, color: "#1C1917", lineHeight: "1.45", marginBottom: "10px" } },
              content.title || "无题"
            ),
            h(
              "div",
              { style: { fontSize: "13.5px", color: "#44403C", lineHeight: "1.75", whiteSpace: "pre-wrap" } },
              content.body || "该帖子暂无详细内容"
            ),
            content.forwardNote &&
            h(
              "div",
              {
                style: {
                  marginTop: "10px",
                  padding: "8px 10px",
                  borderRadius: "10px",
                  background: "#FAF8F5",
                  borderLeft: "2.5px solid #D6724B",
                  fontSize: "12px",
                  color: "#57534E"
                }
              },
              `转发附言：「${content.forwardNote}」`
            ),
            h(
              "div",
              {
                style: {
                  marginTop: "12px",
                  paddingTop: "8px",
                  borderTop: "1px dashed #EFEAE2",
                  display: "flex",
                  gap: "14px",
                  fontSize: "11.5px",
                  color: "#8C857B"
                }
              },
              h("span", null, `❤ ${content.likes || 0} 赞`),
              h("span", null, `💬 ${content.commentsCount || comments.length} 评论`)
            )
          ),

          // 评论区快照
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            h(
              "div",
              { style: { fontSize: "12.5px", fontWeight: 700, color: "#57534E", paddingLeft: "2px" } },
              `评论区（${comments.length}）`
            ),
            comments.length === 0
              ? h(
                "div",
                {
                  style: {
                    background: "#FFFFFF",
                    border: "1px solid #EFEAE2",
                    borderRadius: "12px",
                    padding: "18px",
                    textAlign: "center",
                    fontSize: "12px",
                    color: "#A8A29E"
                  }
                },
                "转发时尚无评论记录"
              )
              : comments.map((c, idx) =>
                h(
                  "div",
                  {
                    key: c.id || idx,
                    style: {
                      background: "#FFFFFF",
                      border: "1px solid #EFEAE2",
                      borderRadius: "12px",
                      padding: "10px 12px"
                    }
                  },
                  h(
                    "div",
                    { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "6px" } },
                      h("span", { style: { fontSize: "12px", fontWeight: 700, color: "#292524" } }, c.author || "路人"),
                      c.badge &&
                      h(
                        "span",
                        {
                          style: {
                            fontSize: "10px",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: c.badge === "密友" ? "#D6E8E3" : "#F5F1EB",
                            color: c.badge === "密友" ? "#2A5C50" : "#78716C"
                          }
                        },
                        c.badge
                      )
                    ),
                    h("span", { style: { fontSize: "10.5px", color: "#A8A29E" } }, c.likes > 0 ? `♥ ${c.likes}` : c.time || "")
                  ),
                  h("div", { style: { fontSize: "12.5px", color: "#44403C", lineHeight: "1.6", whiteSpace: "pre-wrap" } }, c.text)
                )
              )
          )
        )
      )
    );
  };

  // ==========================================
  // 2. 传讯聊天流中的「论坛分享卡片」气泡组件
  // ==========================================
  const ForumShareCardBubble = ({ msg, chatData, onResetCardStatus }) => {
    const h = React.createElement;
    const [showDetail, setShowDetail] = React.useState(false);
    const [btnTip, setBtnTip] = React.useState("");

    const content = msg?.content || {};
    const status = content.cardStatus || "pending"; // "pending" | "read" | "rejected"
    const isRead = status === "read";
    const isRejected = status === "rejected";
    const isTabloid = content.sourceType === "tabloid";
    const isSuper = !isTabloid && (content.sourceType === "supertopic" || /超话/.test(String(content.areaName || "")));
    const charName = chatData?.name || "名士";
    const statusTimeStr = content.statusUpdatedAt
      ? new Date(content.statusUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

    const handleActionBtnHint = (e, label) => {
      e.stopPropagation();
      const tip =
        status === "pending"
          ? `「${label}」由 ${charName} 在触发 AI 回复时自主点选`
          : isRead
            ? `${charName} 已点选「已阅」`
            : `${charName} 已点选「拒收」`;
      setBtnTip(tip);
      setTimeout(() => setBtnTip(""), 2200);
    };

    const handleResend = (e) => {
      e.stopPropagation();
      if (typeof onResetCardStatus === "function") {
        onResetCardStatus(msg.id, "pending");
        setBtnTip(`已重新递给 ${charName}，触发 AI 回复后即可再次查收`);
        setTimeout(() => setBtnTip(""), 2400);
      }
    };

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          onClick: () => setShowDetail(true),
          style: {
            width: "252px",
            maxWidth: "74vw",
            background: "#FFFDF9",
            borderRadius: "16px",
            border: isRejected
              ? "1px solid #E5CFCB"
              : isRead
                ? "1px solid #CBE0D6"
                : "1px solid #E9DFD3",
            boxShadow: "0 4px 14px rgba(44, 40, 37, 0.08)",
            overflow: "hidden",
            cursor: "pointer",
            textAlign: "left",
            userSelect: "none"
          }
        },
        // 顶部来源条
        h(
          "div",
          {
            style: {
              padding: "8px 12px 6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: isRejected ? "#FBF4F3" : isTabloid ? "#FFF9EB" : isSuper ? "#F7F2FA" : "#FAF5EE",
              borderBottom: isTabloid ? "1px solid #F3E5C2" : isSuper ? "1px solid #ECE2F3" : "1px solid #F1EAE0"
            }
          },
          h(
            "span",
            {
              style: {
                fontSize: "10.5px",
                fontWeight: 700,
                color: isTabloid ? "#A16207" : isSuper ? "#7C4D99" : "#B85D43",
                letterSpacing: "0.04em"
              }
            },
            isTabloid
              ? `📰 名人小报 · ${content.areaName || "风闻小报"}`
              : isSuper
                ? `#️⃣ 超话圈 · ${content.areaName || "超话转发"}`
                : `光晕球 · ${content.areaName || "论坛转发"}`
          ),
          h(
            "span",
            {
              style: {
                fontSize: "10px",
                color: isRead ? "#3D7A63" : isRejected ? "#B94A48" : "#A89F94",
                fontWeight: isRead || isRejected ? 700 : 400
              }
            },
            isRead
              ? `名士已阅${statusTimeStr ? ` · ${statusTimeStr}` : ""}`
              : isRejected
                ? `名士拒收${statusTimeStr ? ` · ${statusTimeStr}` : ""}`
                : "待查收"
          )
        ),

        // 主体：仅显示标题与发帖人（点击可查看详情与评论）
        h(
          "div",
          { style: { padding: "12px 13px 11px" } },
          h(
            "div",
            {
              style: {
                fontSize: "13.5px",
                fontWeight: 700,
                color: isRejected ? "#8C8279" : "#292524",
                lineHeight: "1.45",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                textDecoration: isRejected ? "line-through" : "none"
              }
            },
            `《${content.title || "无题"}》`
          ),
          h(
            "div",
            {
              style: {
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "11.5px",
                color: "#8C857B"
              }
            },
            h(
              "span",
              { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "148px" } },
              `发帖人：${content.authorName || "匿名"}`
            ),
            h("span", { style: { fontSize: "10.5px", color: "#B85D43", flexShrink: 0 } }, "详情 ›")
          )
        ),

        // 底部双按钮栏：左下角「已阅」，右下角「拒收」（供名士点选）
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "7px 10px 9px",
              borderTop: "1px dashed #EFE8DC",
              background: "#FFFFFF",
              gap: "8px"
            }
          },
          h(
            "button",
            {
              type: "button",
              onClick: (e) => handleActionBtnHint(e, "已阅"),
              style: {
                border: isRead ? "1px solid #4F8A6E" : "1px solid #E5DFD6",
                background: isRead ? "#EAF5EF" : "#FAF8F5",
                color: isRead ? "#2E6B50" : isRejected ? "#C7C1B9" : "#78716C",
                fontSize: "11px",
                fontWeight: isRead ? 700 : 500,
                padding: "3px 11px",
                borderRadius: "999px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: isRead ? "0 1px 4px rgba(79, 138, 110, 0.2)" : "none"
              }
            },
            isRead ? "已阅 ✓" : "已阅"
          ),
          isRejected &&
          typeof onResetCardStatus === "function" &&
          h(
            "button",
            {
              type: "button",
              onClick: handleResend,
              style: {
                border: "1px dashed #D6A77A",
                background: "#FFF9F0",
                color: "#9A5B13",
                fontSize: "10.5px",
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: "999px",
                cursor: "pointer"
              }
            },
            "重递给TA"
          ),
          h(
            "button",
            {
              type: "button",
              onClick: (e) => handleActionBtnHint(e, "拒收"),
              style: {
                border: isRejected ? "1px solid #C85A53" : "1px solid #E5DFD6",
                background: isRejected ? "#FDECEC" : "#FAF8F5",
                color: isRejected ? "#B33E38" : isRead ? "#C7C1B9" : "#78716C",
                fontSize: "11px",
                fontWeight: isRejected ? 700 : 500,
                padding: "3px 11px",
                borderRadius: "999px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: isRejected ? "0 1px 4px rgba(200, 90, 83, 0.2)" : "none"
              }
            },
            isRejected ? "已拒收 ✕" : "拒收"
          )
        ),

        btnTip &&
        h(
          "div",
          {
            style: {
              padding: "4px 10px 6px",
              fontSize: "10px",
              color: "#9A6B3F",
              background: "#FFF9EE",
              textAlign: "center",
              borderTop: "1px solid #F5EAD6"
            }
          },
          btnTip
        )
      ),
      showDetail &&
      h(ForumShareDetailModal, {
        content,
        onClose: () => setShowDetail(false)
      })
    );
  };

  // ==========================================
  // 3. 论坛帖子详情页「转发给名士」选择弹窗
  // ==========================================
  const ForumSharePickerModal = ({
    isOpen,
    onClose,
    post,
    author,
    sectionName,
    postLikes,
    totalCommentsCount,
    npcReplies,
    roleReplies,
    userReplies
  }) => {
    const h = React.createElement;
    const { useState, useEffect } = React;

    const [chars, setChars] = useState([]);
    const [query, setQuery] = useState("");
    const [forwardNote, setForwardNote] = useState("");
    const [sendingId, setSendingId] = useState("");
    const [sentTargetChar, setSentTargetChar] = useState(null);
    const [errMsg, setErrMsg] = useState("");

    useEffect(() => {
      if (!isOpen) return;
      setQuery("");
      setForwardNote("");
      setSendingId("");
      setSentTargetChar(null);
      setErrMsg("");

      (async () => {
        let list = [];
        try {
          if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
            const res = await global.chatCharacterStore.getAll();
            if (Array.isArray(res) && res.length > 0) list = res;
          }
        } catch (e) { }
        if (list.length === 0) {
          try {
            const ls = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
            if (Array.isArray(ls)) list = ls;
          } catch (e) { }
        }
        // 严格过滤掉群聊、朋友圈数据、装饰样式及无名/未知角色，仅保留真实单人名士
        const solo = (list || []).filter((c) => {
          if (!c || !c.id || !c.name) return false;
          const n = String(c.name).trim();
          const id = String(c.id || "");
          if (!n || n === "未知角色" || n === "未知" || n === "?") return false;
          if (
            c.isGroup ||
            id.startsWith("group") ||
            id.startsWith("style_") ||
            id === "moments_data" ||
            id.startsWith("moments") ||
            c.type === "group" ||
            c.type === "decor" ||
            c.type === "moments" ||
            c.profile?.members
          ) {
            return false;
          }
          return true;
        });
        setChars(solo);
      })();
    }, [isOpen]);

    if (!isOpen) return null;

    const srcMeta = detectPostSource(post, sectionName);
    const isTabloid = srcMeta.sourceType === "tabloid";
    const isSuper = srcMeta.sourceType === "supertopic";
    const featuredCharName = srcMeta.tabloidCharName || srcMeta.circleCharName;
    const q = query.trim().toLowerCase();
    const filtered = chars
      .filter((c) => {
        if (!q) return true;
        const hay = `${c.name || ""} ${c.profile?.personality || ""} ${c.profile?.mbti || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (!featuredCharName) return 0;
        const aHost = isMatchingSuperTopicHost(a.name, featuredCharName) ? 1 : 0;
        const bHost = isMatchingSuperTopicHost(b.name, featuredCharName) ? 1 : 0;
        return bHost - aHost;
      });

    const handleSendToChar = async (targetChar) => {
      if (sendingId) return;
      setSendingId(String(targetChar.id));
      setErrMsg("");
      try {
        const snapshot = buildPostSnapshot({
          post,
          author,
          sectionName,
          postLikes,
          totalCommentsCount,
          npcReplies,
          roleReplies,
          userReplies
        });
        await sendForumPostToChat(targetChar, snapshot, forwardNote);
        setSentTargetChar(targetChar);
      } catch (e) {
        setErrMsg(e?.message || "转发失败，请稍后重试");
      } finally {
        setSendingId("");
      }
    };

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 11500,
          background: "rgba(28, 25, 23, 0.48)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px"
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
            maxWidth: "390px",
            maxHeight: "78vh",
            background: "#FFFFFF",
            borderRadius: "20px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0,0,0,0.22)",
            border: "1px solid #EFEAE2"
          }
        },
        // 顶栏
        h(
          "div",
          {
            style: {
              padding: "14px 16px",
              borderBottom: "1px solid #F2EDE6",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0
            }
          },
          h("span", { style: { fontSize: "15px", fontWeight: 700, color: "#292524" } }, isTabloid ? "转发名人小报给名士" : isSuper ? "转发超话帖子给名士" : "转发帖子给传讯名士"),
          h(
            "button",
            {
              onClick: onClose,
              style: {
                border: "none",
                background: "#F3F1EC",
                color: "#6B7280",
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                cursor: "pointer"
              }
            },
            "✕"
          )
        ),

        // 帖子迷你预览条
        h(
          "div",
          {
            style: {
              margin: "12px 16px 8px",
              padding: "10px 12px",
              borderRadius: "12px",
              background: "#FAF8F5",
              border: "1px solid #EFEAE2",
              flexShrink: 0
            }
          },
          h(
            "div",
            { style: { fontSize: "12.5px", fontWeight: 700, color: "#292524", lineHeight: "1.4" } },
            `《${post?.title || "无题"}》`
          ),
          h(
            "div",
            { style: { fontSize: "11px", color: "#8C857B", marginTop: "3px" } },
            `发帖人：${author?.name || "匿名"} · #${sectionName || "光晕球"}`
          )
        ),

        // 转发成功提示（支持一键前往传讯）
        sentTargetChar &&
        h(
          "div",
          {
            style: {
              margin: "0 16px 8px",
              padding: "9px 12px",
              borderRadius: "10px",
              background: "#EAF5EF",
              border: "1px solid #BFE0CE",
              color: "#2E6B50",
              fontSize: "12px",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0
            }
          },
          h("span", null, `✓ 已转发至「${sentTargetChar.name || "名士"}」的传讯主线`),
          h(
            "button",
            {
              onClick: () => {
                const targetId = sentTargetChar.id;
                onClose();
                try {
                  global.dispatchEvent(new CustomEvent("open-specific-chat", { detail: { chatId: targetId } }));
                } catch (e) { }
              },
              style: {
                border: "none",
                background: "#2E6B50",
                color: "#FFFFFF",
                fontSize: "11px",
                borderRadius: "999px",
                padding: "4px 10px",
                cursor: "pointer",
                flexShrink: 0
              }
            },
            "前往传讯"
          )
        ),

        errMsg &&
        h(
          "div",
          {
            style: {
              margin: "0 16px 8px",
              padding: "8px 12px",
              borderRadius: "10px",
              background: "#FEF2F2",
              color: "#B91C1C",
              fontSize: "12px",
              flexShrink: 0
            }
          },
          errMsg
        ),

        // 转发附言 + 搜索框
        h(
          "div",
          { style: { padding: "0 16px 10px", display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 } },
          h("input", {
            type: "text",
            value: forwardNote,
            onChange: (e) => setForwardNote(e.target.value),
            placeholder: "附带一句留言给 TA（可选，如：快看评论区！）…",
            style: {
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #EFE4D6",
              borderRadius: "10px",
              padding: "8px 12px",
              fontSize: "12.5px",
              background: "#FFFDF9",
              outline: "none"
            }
          }),
          h("input", {
            type: "text",
            value: query,
            onChange: (e) => setQuery(e.target.value),
            placeholder: "搜索传讯中的名士……",
            style: {
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #E8E2D9",
              borderRadius: "10px",
              padding: "8px 12px",
              fontSize: "12.5px",
              background: "#FAF9F7",
              outline: "none"
            }
          })
        ),

        // 名士列表
        h(
          "div",
          {
            style: {
              flex: 1,
              overflowY: "auto",
              padding: "0 16px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }
          },
          filtered.length === 0
            ? h(
              "div",
              { style: { textAlign: "center", padding: "32px 12px", fontSize: "12.5px", color: "#A8A29E" } },
              "传讯中暂无可选名士"
            )
            : filtered.map((c) => {
              const isSending = sendingId === String(c.id);
              const isHost = Boolean(featuredCharName) && isMatchingSuperTopicHost(c.name, featuredCharName);
              const hostBg = isTabloid ? "#FFFBF0" : "#F9F4FC";
              const hostBorder = isTabloid ? "1px solid #F3DC9E" : "1px solid #DEC8EB";
              const hostBadgeColor = isTabloid ? "#A16207" : "#7C4D99";
              const hostBadgeBg = isTabloid ? "#FEF3C7" : "#EFE3F7";
              const hostBadgeText = isTabloid ? "📰 小报当事名士" : "✨ 超话正主";
              return h(
                "div",
                {
                  key: c.id,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "10px 12px",
                    borderRadius: "14px",
                    background: isHost ? hostBg : "#FAF9F7",
                    border: isHost ? hostBorder : "1px solid #EFECE6"
                  }
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 } },
                  h(ShareCharAvatar, { avatar: c.avatar || c.avatarId || c.profile?.avatar, name: c.name, size: 38 }),
                  h(
                    "div",
                    { style: { minWidth: 0 } },
                    h(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "6px" } },
                      h("span", { style: { fontSize: "13.5px", fontWeight: 700, color: "#292524" } }, c.name || "名士"),
                      isHost &&
                      h(
                        "span",
                        {
                          style: {
                            fontSize: "10px",
                            fontWeight: 700,
                            color: hostBadgeColor,
                            background: hostBadgeBg,
                            padding: "1px 6px",
                            borderRadius: "999px"
                          }
                        },
                        hostBadgeText
                      )
                    ),
                    h(
                      "div",
                      {
                        style: {
                          fontSize: "11px",
                          color: "#8C857B",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "170px"
                        }
                      },
                      c.profile?.personality || c.profile?.mbti || "传讯密友"
                    )
                  )
                ),
                h(
                  "button",
                  {
                    onClick: () => handleSendToChar(c),
                    disabled: !!sendingId,
                    style: {
                      border: "none",
                      borderRadius: "999px",
                      padding: "6px 13px",
                      background: isSending ? "#C9B9AA" : "#D6724B",
                      color: "#FFFFFF",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: sendingId ? "not-allowed" : "pointer",
                      flexShrink: 0
                    }
                  },
                  isSending ? "发送中…" : "转发"
                )
              );
            })
        )
      )
    );
  };

  // ==========================================
  // 4. P1：传讯 AI 上下文序列化 & 自主「已阅 / 拒收」决策协议（支持光晕球 + 超话圈 + 名人小报三源双视角）
  // ==========================================
  function formatForumShareCardForLLM(msg, chatData) {
    const c = msg?.content || {};
    const title = String(c.title || "无题").trim();
    const authorName = String(c.authorName || "匿名帖主").trim();
    const areaName = String(c.areaName || "光晕球").trim();
    const status = c.cardStatus || "pending";
    const cardId = String(msg?.id || "");

    const isTabloid = c.sourceType === "tabloid" || Boolean(c.tabloidCharName);
    const superMatch = areaName.match(/#?\s*([^#\s]+?)\s*超话\s*#?/);
    const isSuper = !isTabloid && (c.sourceType === "supertopic" || Boolean(c.circleCharName) || Boolean(superMatch) || /超话/.test(areaName));
    const featuredName = String(c.tabloidCharName || c.circleCharName || (superMatch && superMatch[1]) || "").trim();
    const receiverName = String(chatData?.name || chatData?.profile?.name || "").trim();
    const isSelfHost = (isSuper || isTabloid) && isMatchingSuperTopicHost(receiverName, featuredName);
    const sourceLabel = isTabloid
      ? `名人小报「${areaName}」`
      : isSuper
        ? `超话圈「${areaName}」`
        : `光晕球论坛（#${areaName}）`;
    const eventTitle = isTabloid ? "名人小报" : isSuper ? "超话圈" : "光晕球";

    if (status === "rejected") {
      return {
        role: msg?.isMe === false ? "assistant" : "user",
        content: `【历史事件】我曾向你转发过${sourceLabel}的帖子《${title}》（署名：${authorName}），但你当时选择了「拒收」，并未查看该内容的正文详情与评论区。`
      };
    }

    if (status === "read") {
      const shortBody = String(c.body || "").replace(/\s+/g, " ").slice(0, 140);
      return {
        role: msg?.isMe === false ? "assistant" : "user",
        content: `【历史事件】我曾向你转发过${sourceLabel}的帖子《${title}》（署名：${authorName}），你已点选「已阅」并看过内容（正文节选：${shortBody}${String(c.body || "").length > 140 ? "…" : ""}）。`
      };
    }

    // status === "pending"：完整注入发帖人、正文详情与精选评论 + 三源双视角 + 自主决策协议
    const bodyText = String(c.body || "该帖子暂无详细内容").trim().slice(0, 650);
    const rawComments = Array.isArray(c.comments) ? c.comments : [];
    const commentLines = [];
    let commentBudget = 0;
    for (let i = 0; i < Math.min(rawComments.length, 12); i++) {
      const cm = rawComments[i];
      if (!cm || !cm.text) continue;
      const line = `- ${cm.author || "路人"}${cm.badge ? `(${cm.badge})` : ""}：${String(cm.text).replace(/\s+/g, " ").slice(0, 95)}`;
      if (commentBudget + line.length > 900 && commentLines.length > 0) break;
      commentLines.push(line);
      commentBudget += line.length + 1;
    }
    const commentsBlock = commentLines.length > 0 ? commentLines.join("\n") : "（暂无评论）";
    const noteLine = c.forwardNote ? `\n- 我转发时顺带说了一句：「${c.forwardNote}」` : "";
    const windLine = (isSuper || isTabloid) && c.windMode ? `\n- ${isTabloid ? "小报标签" : "超话风向"}：${c.windMode}` : "";

    const perspectiveHint = isTabloid
      ? isSelfHost
        ? `\n【名人小报当事名士专属语境】这是一篇在论坛里疯传、专门写你本人的八卦风闻小报！如果你选择「已阅」，请结合你的性格、背景与当下心情真实反应（如解释、冷笑辟谣、狡辩装傻、反客为主调侃用户或气极反笑）。`
        : `\n【名人小报吃瓜语境】这是一篇关于【${featuredName || "某位名士"}】的论坛八卦风闻小报，我转发给你一起吃瓜议论。如果你选择「已阅」，请结合你与 ${featuredName || "对方"} 的关系、世界书与性格自然吐槽、点评或暗暗吃醋。`
      : isSuper
        ? isSelfHost
          ? `\n【超话正主专属语境】这篇帖子来自你本人的专属超话「${areaName}」！帖主与评论区里的路人/粉丝正在议论你本人。如果你选择「已阅」，请结合你的性格真实反应（如得意、傲娇嘴硬、害羞转移话题、冷笑辟谣或吐槽网友离谱脑洞）。`
          : `\n【超话吃瓜语境】这篇帖子来自「${areaName}」（关于 ${featuredName || "他人"} 的超话），我转发给你一起看热闹/吃瓜。如果你选择「已阅」，请结合你与 ${featuredName || "对方"} 的关系、世界书与性格自然点评、调侃或暗暗吃醋。`
        : "";

    return {
      role: msg?.isMe === false ? "assistant" : "user",
      content: `【系统事件·${eventTitle}转发卡片（cardId: ${cardId}）】
我刚刚在${sourceLabel}把这篇内容转发给了你：
- 所属板块：${areaName}${windLine}
- ${isTabloid ? "报社/署名" : "发帖人"}：${authorName}${c.authorBadge ? `（${c.authorBadge}）` : ""}
- 标题：《${title}》${noteLine}
- 正文详情：
${bodyText}
- 评论/批注区：
${commentsBlock}${perspectiveHint}

【名士自主决策指令（务必严格遵守）】
卡片左下角有「已阅」按钮，右下角有「拒收」按钮。请你结合你自身完整角色配置（姓名/ID、MBTI、星座、语言风格、性格特点、个人背景）、用户身份设定、当前开启的世界书，以及刚才我们传讯聊天的氛围自主决定：
1. 如果你愿意点开看：请在回复最开头输出隐藏标记 [FORUM_CARD:READ:${cardId}]（用户看不到此标记），随后用你本人的语气自然回应内容、署名或评论区。
2. 如果我们刚才聊得不太愉快、你正在生气/闹别扭/没心情看，你完全可以选择拒收不看：请在回复最开头输出隐藏标记 [FORUM_CARD:REJECT:${cardId}]，随后按你的性格冷淡/傲娇/赌气地表达你拒收了不想看（注意：既然拒收不看，就严禁复述或评论正文与评论区里的具体内容！）。`
    };
  }

  function applyForumShareActionsToChat(baseMessages, newAiMsgs, chatData) {
    if (!Array.isArray(baseMessages) || !Array.isArray(newAiMsgs) || newAiMsgs.length === 0) {
      return baseMessages;
    }

    const explicitActions = {}; // { cardId: "read" | "rejected" }
    let wildcardAction = null;
    const tagRegex = /\[FORUM_CARD\s*[:：]\s*(READ|REJECT)(?:\s*[:：]\s*([^\]]+))?\]/gi;

    newAiMsgs.forEach((am) => {
      if (!am || typeof am.text !== "string") return;
      am.text = am.text
        .replace(tagRegex, (_, rawAct, rawId) => {
          const act = String(rawAct || "").toUpperCase() === "REJECT" ? "rejected" : "read";
          const cid = String(rawId || "").trim();
          if (cid) explicitActions[cid] = act;
          else wildcardAction = act;
          return "";
        })
        .trim();
    });

    // 找出所有待查收的论坛分享卡片
    const pendingIndices = [];
    baseMessages.forEach((m, idx) => {
      if (m && m.type === "forum_share_card" && (m.content?.cardStatus || "pending") === "pending") {
        pendingIndices.push(idx);
      }
    });
    if (pendingIndices.length === 0) return baseMessages;

    const combinedReply = newAiMsgs.map((m) => String(m?.text || "")).join(" ");
    const rejectRegex = /(拒收|不看|懒得看|不想看|拿走|没心情看|别给我看|不稀罕看|不瞧|不想瞧|懒得瞧)/;
    const inferredFallback = rejectRegex.test(combinedReply) ? "rejected" : "read";

    const charName = chatData?.name || chatData?.profile?.name || "名士";
    const nextMessages = [...baseMessages];
    const now = Date.now();

    pendingIndices.forEach((idx) => {
      const card = nextMessages[idx];
      const cid = String(card.id || "");
      const decided = explicitActions[cid] || wildcardAction || inferredFallback;
      nextMessages[idx] = {
        ...card,
        content: {
          ...(card.content || {}),
          cardStatus: decided,
          statusUpdatedAt: now,
          actionBy: charName
        }
      };
    });

    return nextMessages;
  }

  global.sendForumPostToChat = sendForumPostToChat;
  global.formatForumShareCardForLLM = formatForumShareCardForLLM;
  global.applyForumShareActionsToChat = applyForumShareActionsToChat;
  global.ForumShareDetailModal = ForumShareDetailModal;
  global.ForumShareCardBubble = ForumShareCardBubble;
  global.ForumSharePickerModal = ForumSharePickerModal;
})(typeof window !== "undefined" ? window : globalThis);
