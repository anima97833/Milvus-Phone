/**
 * Milvus/chat_report_app.js
 * 传讯·聊天可视化总结报告（周报 / 月报 / 年度报告）
 * P0：确定性本地统计聚合引擎 + 中文高频词提取 + IndexedDB 持久化 + 纯白极简基础界面
 */
(function (global) {
  "use strict";

  const STOPWORDS = new Set([
    "的", "了", "和", "是", "就", "都", "而", "及", "与", "着", "或", "一个", "没有", "我们", "你们", "他们",
    "自己", "知道", "什么", "这个", "那个", "这样", "那样", "这里", "那里", "还是", "但是", "因为", "所以",
    "如果", "虽然", "已经", "可以", "不是", "不会", "不能", "不要", "不想", "真的", "觉得", "现在", "今天",
    "明天", "昨天", "时候", "东西", "地方", "一下", "一点", "一些", "这么", "那么", "怎么", "为什么", "然后",
    "其实", "不过", "只是", "就是", "也是", "还有", "而且", "或者", "如果", "应该", "可能", "大概", "好像",
    "哈哈", "哈哈哈", "哈哈哈哈", "呵呵", "嘿嘿", "嗯嗯", "好的", "好吧", "行吧", "没事", "谢谢", "抱歉",
    "对不起", "不好意思", "请问", "你好", "您好", "晚安", "早安", "午安", "再见", "拜拜", "表情包", "图片",
    "语音", "通话", "系统", "事件", "刚刚", "刚才", "刚才", "一直", "比较", "非常", "特别", "感觉", "有点",
    "确实", "当然", "不过", "另外", "以及", "关于", "对于", "通过", "为了", "正在", "已经", "曾经", "将要",
    "the", "and", "for", "that", "this", "with", "you", "are", "was", "have", "not", "but", "from", "they"
  ]);

  function getGreeting(userName) {
    const h = new Date().getHours();
    let slot = "你好";
    if (h >= 5 && h < 9) slot = "早安";
    else if (h >= 9 && h < 12) slot = "上午好";
    else if (h >= 12 && h < 14) slot = "中午好";
    else if (h >= 14 && h < 18) slot = "下午好";
    else if (h >= 18 && h < 23) slot = "晚上好";
    else slot = "夜深了";
    return `${userName || "广陵王"}，${slot}`;
  }

  function getActiveUserName() {
    try {
      const savedPersonas = JSON.parse(localStorage.getItem("user_personas") || "[]");
      const activeId = localStorage.getItem("active_persona_id");
      let activeUser = activeId ? savedPersonas.find((p) => String(p.id) === String(activeId)) : null;
      if (!activeUser && savedPersonas.length > 0) activeUser = savedPersonas[0];
      if (activeUser && activeUser.name) return activeUser.name;
    } catch (e) {}
    return "广陵王";
  }

  function getPeriodRange(periodType) {
    const now = new Date();
    const endMs = now.getTime();
    let start = new Date(now);
    let periodKey = "";
    let periodLabel = "";

    const pad = (n) => String(n).padStart(2, "0");
    const fmtMD = (d) => `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

    if (periodType === "week") {
      const day = now.getDay(); // 0=Sun..6=Sat
      const diffToMon = day === 0 ? 6 : day - 1;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon, 0, 0, 0, 0);
      const jan1 = new Date(now.getFullYear(), 0, 1);
      const weekNum = Math.ceil((((now - jan1) / 86400000) + jan1.getDay() + 1) / 7);
      periodKey = `${now.getFullYear()}-W${pad(weekNum)}`;
      periodLabel = `${now.getFullYear()}年 第${weekNum}周 (${fmtMD(start)} - ${fmtMD(now)})`;
    } else if (periodType === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      periodKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      periodLabel = `${now.getFullYear()}年${now.getMonth() + 1}月 (${fmtMD(start)} - ${fmtMD(now)})`;
    } else {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      periodKey = `${now.getFullYear()}`;
      periodLabel = `${now.getFullYear()}年度报告 (${fmtMD(start)} - ${fmtMD(now)})`;
    }

    return { startMs: start.getTime(), endMs, periodKey, periodLabel };
  }

  function resolveMsgTime(msg) {
    if (!msg) return null;
    if (typeof msg.timestamp === "number" && msg.timestamp > 1500000000000) return msg.timestamp;
    if (typeof msg.timestamp === "string" && /^\d{13}$/.test(msg.timestamp)) return Number(msg.timestamp);
    const numId = Number(msg.id);
    if (!isNaN(numId) && numId > 1600000000000 && numId < 3000000000000) return numId;
    if (msg.createdAt && Number(msg.createdAt) > 1500000000000) return Number(msg.createdAt);
    if (msg.date && !isNaN(Date.parse(msg.date))) return Date.parse(msg.date);
    return null;
  }

  function parseCallDurationSec(msg) {
    if (typeof msg.durationSec === "number") return msg.durationSec;
    if (typeof msg.duration === "number") return msg.duration;
    const raw = String(msg.durationText || msg.durationStr || msg.text || "");
    const minSec = raw.match(/(\d+)\s*分\s*(\d+)?\s*秒?/);
    if (minSec) return Number(minSec[1]) * 60 + Number(minSec[2] || 0);
    const colon = raw.match(/(\d{1,2}):(\d{2})/);
    if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
    const secOnly = raw.match(/(\d+)\s*秒/);
    if (secOnly) return Number(secOnly[1]);
    return 0;
  }

  function classifyMessage(msg) {
    if (!msg) return { kind: "ignore" };
    if (msg.type === "narration" || msg.tap === true || msg.type === "system") {
      return { kind: "narration" };
    }
    const text = String(msg.text || msg.content || "");
    if (
      msg.type === "voice_call" ||
      msg.type === "call" ||
      msg.isVoiceCall ||
      /通话时长|语音通话结束|发起了语音通话/.test(text)
    ) {
      return { kind: "call", durationSec: parseCallDurationSec(msg) };
    }
    if (
      msg.type === "sticker" ||
      msg.type === "emoji" ||
      /^\[(?:表情包|表情|sticker|emoji)/i.test(text.trim())
    ) {
      return { kind: "sticker" };
    }
    if (msg.type === "image" || msg.image) {
      return { kind: "image", text };
    }
    return { kind: "text", text };
  }

  function extractKeywords(texts, topN = 15) {
    const freq = new Map();
    const hasSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";
    const segmenter = hasSegmenter ? new Intl.Segmenter("zh-CN", { granularity: "word" }) : null;

    const addToken = (raw) => {
      const tok = raw.trim().toLowerCase();
      if (!tok || tok.length < 2 || tok.length > 8) return;
      if (/^\d+$/.test(tok)) return;
      if (STOPWORDS.has(tok)) return;
      freq.set(tok, (freq.get(tok) || 0) + 1);
    };

    for (const rawText of texts) {
      if (!rawText) continue;
      // 清洗系统标签、括号动作描写、URL
      const cleaned = rawText
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/\[[^\]]{1,40}\]/g, " ")
        .replace(/（[^）]{1,60}）/g, " ")
        .replace(/\([^)]{1,60}\)/g, " ");

      if (segmenter) {
        for (const seg of segmenter.segment(cleaned)) {
          if (seg.isWordLike) addToken(seg.segment);
        }
      } else {
        const cjkRuns = cleaned.match(/[\u4e00-\u9fa5]{2,}/g) || [];
        for (const run of cjkRuns) {
          if (run.length <= 4) {
            addToken(run);
          } else {
            for (let i = 0; i <= run.length - 2; i += 2) {
              addToken(run.slice(i, i + 2));
            }
          }
        }
        const enWords = cleaned.match(/[a-zA-Z]{3,}/g) || [];
        for (const w of enWords) addToken(w);
      }
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([word, count]) => ({ word, count }));
  }

  function getPeakTimeLabel(startHour) {
    if (startHour >= 0 && startHour < 5) return "凌晨静谧档";
    if (startHour >= 5 && startHour < 9) return "清晨早起档";
    if (startHour >= 9 && startHour < 12) return "上午元气档";
    if (startHour >= 12 && startHour < 14) return "午间小憩档";
    if (startHour >= 14 && startHour < 18) return "午后茶歇档";
    if (startHour >= 18 && startHour < 22) return "晚间热聊档";
    return "深夜夜猫档";
  }

  function formatDurationText(totalSec) {
    if (!totalSec || totalSec <= 0) return "0 分钟";
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs} 小时 ${remMins} 分钟`;
    }
    return mins > 0 ? `${mins} 分 ${secs} 秒` : `${secs} 秒`;
  }

  function isDirectImgUrl(s) {
    if (typeof s !== "string") return false;
    const t = s.trim();
    if (!t || t.startsWith("#")) return false;
    return (
      t.startsWith("data:image") ||
      t.startsWith("http://") ||
      t.startsWith("https://") ||
      t.startsWith("blob:") ||
      t.startsWith("/") ||
      t.startsWith("./")
    );
  }

  async function resolveAvatarAsync(rawAv, charId, charName) {
    if (isDirectImgUrl(rawAv)) return rawAv.trim();
    if (rawAv && typeof rawAv === "object") {
      const candidate = rawAv.url || rawAv.src || rawAv.dataUrl || rawAv.avatarData || rawAv.image || "";
      if (isDirectImgUrl(candidate)) return candidate.trim();
    }
    try {
      if (rawAv !== undefined && rawAv !== null && rawAv !== "" && typeof global.resolveAvatarUrl === "function") {
        const resolved = await global.resolveAvatarUrl(rawAv, "");
        if (isDirectImgUrl(resolved)) return resolved.trim();
      }
    } catch (e) {}
    try {
      const store = global.avatarStore || (typeof avatarStore !== "undefined" ? avatarStore : null);
      if (store && typeof store.get === "function") {
        const keys = [rawAv, typeof rawAv === "string" && !isNaN(Number(rawAv)) ? Number(rawAv) : null, rawAv != null ? String(rawAv) : null, charId].filter((k) => k !== undefined && k !== null && k !== "");
        for (const k of keys) {
          const item = await store.get(k);
          const data = item && (item.avatarData || item.data || item.url);
          if (isDirectImgUrl(data)) return data.trim();
        }
      }
    } catch (e) {}
    try {
      if (charName) {
        const map = JSON.parse(localStorage.getItem("绣衣楼头像") || "{}");
        if (isDirectImgUrl(map[charName])) return map[charName].trim();
      }
    } catch (e) {}
    return "";
  }

  const ReportAvatar = ({ avatar, rawAvatar, charId, name = "友", color = "#374151", size = 54 }) => {
    const [imgUrl, setImgUrl] = React.useState(() => (isDirectImgUrl(avatar) ? avatar : ""));
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
      let mounted = true;
      setFailed(false);
      if (isDirectImgUrl(avatar)) {
        setImgUrl(avatar);
        return;
      }
      resolveAvatarAsync(rawAvatar !== undefined ? rawAvatar : avatar, charId, name).then((url) => {
        if (mounted && url) setImgUrl(url);
      });
      return () => {
        mounted = false;
      };
    }, [avatar, rawAvatar, charId, name]);

    return React.createElement(
      "div",
      {
        style: {
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          background: color || "#374151",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: `${Math.round(size * 0.37)}px`,
          fontWeight: "700",
          color: "#FFFFFF",
          flexShrink: 0,
          border: "2px solid rgba(255,255,255,0.25)"
        }
      },
      imgUrl && !failed
        ? React.createElement("img", {
            src: imgUrl,
            alt: name,
            onError: () => setFailed(true),
            style: { width: "100%", height: "100%", objectFit: "cover" }
          })
        : (name || "友")[0]
    );
  };

  function sampleEvenly(arr, maxCount) {
    if (arr.length <= maxCount) return arr;
    const step = arr.length / maxCount;
    const out = [];
    for (let i = 0; i < maxCount; i++) {
      out.push(arr[Math.floor(i * step)]);
    }
    return out;
  }

  async function aggregateChatMetrics(periodType = "week", onProgress) {
    const { startMs, endMs, periodKey, periodLabel } = getPeriodRange(periodType);
    const userName = getActiveUserName();

    let allChars = [];
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        allChars = await global.chatCharacterStore.getAll();
      } else {
        allChars = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
      }
    } catch (e) {
      allChars = [];
    }

    const validChars = (allChars || []).filter((c) => c && c.id && c.type !== "decor");
    const hourBuckets = new Array(24).fill(0);
    const dailyMap = new Map(); // YYYY-MM-DD -> { count, byChar: Map }
    const friendStats = [];
    const allTexts = [];
    const userTexts = [];

    let totalMessages = 0;
    let myCount = 0;
    let otherCount = 0;
    let sessionCount = 0;
    let stickerCount = 0;
    let myStickerCount = 0;
    let otherStickerCount = 0;
    let callCount = 0;
    let callDurationSec = 0;
    let untimestampedCount = 0;

    const pad = (n) => String(n).padStart(2, "0");

    for (let i = 0; i < validChars.length; i++) {
      const ch = validChars[i];
      if (typeof onProgress === "function") {
        onProgress({ current: i + 1, total: validChars.length, name: ch.name || "名士" });
      }
      // 让出主线程避免万级消息卡顿
      if (i % 3 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }

      let msgs = [];
      try {
        if (global.chatHistoryStore && typeof global.chatHistoryStore.getAllMessages === "function") {
          const res = await global.chatHistoryStore.getAllMessages(ch.id);
          msgs = res?.messages || [];
        } else if (global.chatHistoryStore && typeof global.chatHistoryStore.getMessages === "function") {
          const res = await global.chatHistoryStore.getMessages(ch.id, 1, 999999);
          msgs = res?.messages || [];
        }
      } catch (e) {
        msgs = [];
      }

      const isGroup = String(ch.id).startsWith("group") || ch.type === "group";
      const inRange = [];

      for (const m of msgs) {
        const ts = resolveMsgTime(m);
        if (ts === null) {
          untimestampedCount++;
          continue;
        }
        if (ts >= startMs && ts <= endMs) {
          inRange.push({ msg: m, ts });
        }
      }

      if (inRange.length === 0) continue;
      inRange.sort((a, b) => a.ts - b.ts);

      let charMsgCount = 0;
      let charSessions = 0;
      let lastTs = 0;
      const charDays = new Set();
      const charTexts = [];

      for (const item of inRange) {
        const { msg, ts } = item;
        const info = classifyMessage(msg);
        if (info.kind === "ignore" || info.kind === "narration") continue;

        if (lastTs === 0 || ts - lastTs > 30 * 60 * 1000) {
          charSessions++;
        }
        lastTs = ts;

        totalMessages++;
        charMsgCount++;
        if (msg.isMe) myCount++;
        else otherCount++;

        const d = new Date(ts);
        hourBuckets[d.getHours()]++;
        const dayKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        charDays.add(dayKey);

        if (!dailyMap.has(dayKey)) {
          dailyMap.set(dayKey, { count: 0, byChar: new Map() });
        }
        const dayRec = dailyMap.get(dayKey);
        dayRec.count++;
        dayRec.byChar.set(ch.name || "名士", (dayRec.byChar.get(ch.name || "名士") || 0) + 1);

        if (info.kind === "sticker") {
          stickerCount++;
          if (msg.isMe) myStickerCount++;
          else otherStickerCount++;
        } else if (info.kind === "call") {
          callCount++;
          callDurationSec += info.durationSec || 0;
        } else if (info.kind === "text" && info.text) {
          allTexts.push(info.text);
          const snippet = info.text.replace(/\s+/g, " ").trim().slice(0, 60);
          if (snippet.length >= 2) {
            if (msg.isMe) userTexts.push(snippet);
            else charTexts.push(snippet);
          }
        }
      }

      sessionCount += charSessions;
      if (!isGroup && charMsgCount > 0) {
        friendStats.push({
          id: ch.id,
          name: ch.name || ch.profile?.name || "名士",
          rawAvatar: ch.avatar !== undefined ? ch.avatar : ch.profile?.avatar,
          avatar: "",
          avatarColor: ch.avatarColor || "#8FA99D",
          count: charMsgCount,
          sessions: charSessions,
          activeDays: charDays.size,
          sampleTexts: charTexts
        });
      }
    }

    friendStats.sort((a, b) => b.count - a.count);
    const topFriendRaw = friendStats[0] || null;
    const resolvedTopAvatar = topFriendRaw
      ? await resolveAvatarAsync(topFriendRaw.rawAvatar, topFriendRaw.id, topFriendRaw.name)
      : "";
    const topFriend = topFriendRaw
      ? {
          id: topFriendRaw.id,
          name: topFriendRaw.name,
          rawAvatar: topFriendRaw.rawAvatar,
          avatar: resolvedTopAvatar,
          avatarColor: topFriendRaw.avatarColor,
          count: topFriendRaw.count,
          sessions: topFriendRaw.sessions,
          activeDays: topFriendRaw.activeDays,
          sharePercent: totalMessages > 0 ? Math.round((topFriendRaw.count / totalMessages) * 100) : 0
        }
      : null;

    // 找 2 小时峰值窗口
    let peakStartHour = 20;
    let peakVal = -1;
    for (let h = 0; h < 24; h++) {
      const pairSum = hourBuckets[h] + hourBuckets[(h + 1) % 24];
      if (pairSum > peakVal) {
        peakVal = pairSum;
        peakStartHour = h;
      }
    }
    const peakEndHour = (peakStartHour + 2) % 24;
    const peakTimeSlot = `${pad(peakStartHour)}:00 - ${pad(peakEndHour)}:00`;
    const peakTimeLabel = getPeakTimeLabel(peakStartHour);

    // 找最活跃的一天 + 每日序列
    const dailySeries = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, rec]) => {
        let topCharOnDay = "";
        let maxC = 0;
        rec.byChar.forEach((c, name) => {
          if (c > maxC) {
            maxC = c;
            topCharOnDay = name;
          }
        });
        return { date, count: rec.count, topChar: topCharOnDay };
      });

    let mostActiveDay = null;
    for (const d of dailySeries) {
      if (!mostActiveDay || d.count > mostActiveDay.count) {
        mostActiveDay = d;
      }
    }

    const topKeywords = extractKeywords(allTexts, 15);
    const userSamples = sampleEvenly(userTexts, 20);
    const friendSamples = topFriendRaw ? sampleEvenly(topFriendRaw.sampleTexts, 20) : [];

    return {
      periodType,
      periodKey,
      periodLabel,
      userName,
      greeting: getGreeting(userName),
      totalMessages,
      myCount,
      otherCount,
      sessionCount,
      activeDaysCount: dailySeries.length,
      hourBuckets,
      peakTimeSlot,
      peakTimeLabel,
      mostActiveDay,
      dailySeries,
      topFriend,
      stickerCount,
      myStickerCount,
      otherStickerCount,
      callCount,
      callDurationSec,
      callDurationText: formatDurationText(callDurationSec),
      topKeywords,
      untimestampedCount,
      samples: {
        userSamples,
        friendSamples
      }
    };
  }

  // ==================== 本地规则总结生成器（作为无 AI / P1 展示与 P2 降级兜底） ====================
  function buildLocalSummary(metrics) {
    if (!metrics) return null;
    const pName = metrics.periodType === "week" ? "本周" : metrics.periodType === "month" ? "本月" : "这一年";
    const myRatio = metrics.totalMessages > 0 ? Math.round((metrics.myCount / metrics.totalMessages) * 100) : 50;
    const userTag = myRatio >= 58 ? "主动倾诉型" : myRatio <= 42 ? "从容倾听型" : "双向奔赴型";
    const friendTag = myRatio >= 58 ? "稳重接话型" : myRatio <= 42 ? "热忱健谈型" : "默契合拍型";
    const topWord = metrics.topKeywords && metrics.topKeywords[0] ? metrics.topKeywords[0].word : "";
    const tf = metrics.topFriend;

    return {
      headline: `${pName}，你在 ${metrics.activeDaysCount} 个日子里留下了 ${metrics.totalMessages} 句回响`,
      overallSummary: `${pName}你一共开启了 ${metrics.sessionCount} 次对话，最常在 ${metrics.peakTimeSlot}（${metrics.peakTimeLabel}）打开传讯${tf ? `，与 ${tf.name} 的互动占据了 ${tf.sharePercent}% 的时光` : ""}。`,
      userStyle: {
        tag: userTag,
        summary: myRatio >= 58
          ? `你的发言占比达 ${myRatio}%，习惯主动抛出话题与分享日常，表达节奏明快直接。`
          : myRatio <= 42
          ? `你的发言占比为 ${myRatio}%，偏好精炼回应与倾听对方的叙述，张弛有度。`
          : `你与对方的发言比例接近均衡（${myRatio}%），来往有度，对话节奏自然流畅。`
      },
      friendStyle: {
        tag: friendTag,
        summary: tf
          ? `${tf.name} 在 ${pName}陪伴了你 ${tf.activeDays} 天，共展开 ${tf.sessions} 次长谈，始终保持稳定回应。`
          : "对方回应节奏平稳，擅长顺着你的话锋延展交流。"
      },
      relationshipVerdict: tf
        ? `你与 ${tf.name} 的对话既有日常松弛感，也藏着长久陪伴的默契。`
        : "每一次落笔传讯，都是你在日常缝隙里为自己留出的情绪出口。",
      sectionSummaries: {
        volume: `平均每次对话聊满 ${metrics.sessionCount > 0 ? Math.max(1, Math.round(metrics.totalMessages / metrics.sessionCount)) : 0} 句，每一段来往都并非敷衍寒暄。`,
        activeTime: metrics.mostActiveDay
          ? `${metrics.mostActiveDay.date} 是你最健谈的一天（${metrics.mostActiveDay.count} 句），${metrics.peakTimeLabel} 是你最放松的倾诉时刻。`
          : `${metrics.peakTimeLabel} 是你最常打开传讯的黄金时段。`,
        topFriend: tf
          ? `${tf.name} 稳居${pName}联系榜首，占据了全部传讯的 ${tf.sharePercent}%。`
          : "你在各位名士之间保持着均衡的往来节奏。",
        keywords: topWord
          ? `「${topWord}」是你${pName}最常提起的字眼，悄悄勾勒出这段时间最牵动你的主题。`
          : "你的对话主题丰富多元，不局限于单一话题。",
        media: metrics.callCount > 0
          ? `发出了 ${metrics.stickerCount} 个表情包并通话 ${metrics.callCount} 次（${metrics.callDurationText}），文字之外更有鲜活情绪。`
          : metrics.stickerCount > 0
          ? `共使用 ${metrics.stickerCount} 个表情包点缀对话，让文字交流更具松弛与活人感。`
          : "你更偏爱用纯粹的文字精准表达心绪，克制而真诚。"
      }
    };
  }

  // ==================== 动效组件：数字缓动递增 + 总结打字/渐显 ====================
  const AnimatedNumber = ({ value, duration = 650, suffix = "" }) => {
    const [display, setDisplay] = React.useState(0);
    React.useEffect(() => {
      const target = Number(value) || 0;
      if (target === 0) {
        setDisplay(0);
        return;
      }
      let rafId = null;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(target * eased));
        if (progress < 1) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
      return () => rafId && cancelAnimationFrame(rafId);
    }, [value, duration]);
    return React.createElement("span", null, display.toLocaleString(), suffix);
  };

  const TypewriterSummary = ({ text, speed = 22 }) => {
    const [shown, setShown] = React.useState("");
    React.useEffect(() => {
      const full = String(text || "");
      setShown("");
      if (!full) return;
      let idx = 0;
      const timer = setInterval(() => {
        idx += 2;
        if (idx >= full.length) {
          setShown(full);
          clearInterval(timer);
        } else {
          setShown(full.slice(0, idx));
        }
      }, speed);
      return () => clearInterval(timer);
    }, [text, speed]);
    return React.createElement(
      "div",
      {
        style: {
          marginTop: "16px",
          padding: "12px 14px",
          borderRadius: "14px",
          background: "#F8F9FB",
          borderLeft: "3px solid #111827",
          fontSize: "12.5px",
          lineHeight: "1.65",
          color: "#4B5563",
          minHeight: "48px"
        }
      },
      shown
    );
  };

  // ==================== 原生 SVG 图表组件（零外部依赖） ====================
  const DonutRatioChart = ({ myCount, otherCount }) => {
    const total = Math.max(1, (myCount || 0) + (otherCount || 0));
    const myPct = Math.round(((myCount || 0) / total) * 100);
    const otherPct = 100 - myPct;
    const r = 46;
    const circ = 2 * Math.PI * r;
    const myDash = (myPct / 100) * circ;

    return React.createElement(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "24px", padding: "10px 0" } },
      React.createElement(
        "svg",
        { width: "120", height: "120", viewBox: "0 0 120 120" },
        React.createElement("circle", { cx: "60", cy: "60", r: String(r), fill: "none", stroke: "#E5E7EB", strokeWidth: "12" }),
        React.createElement("circle", {
          cx: "60",
          cy: "60",
          r: String(r),
          fill: "none",
          stroke: "#111827",
          strokeWidth: "12",
          strokeDasharray: `${myDash} ${circ}`,
          strokeLinecap: "round",
          transform: "rotate(-90 60 60)",
          style: { transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)" }
        }),
        React.createElement("text", { x: "60", y: "56", textAnchor: "middle", fontSize: "18", fontWeight: "800", fill: "#111827" }, `${myPct}%`),
        React.createElement("text", { x: "60", y: "72", textAnchor: "middle", fontSize: "10", fill: "#6B7280" }, "你的发言")
      ),
      React.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" } },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement("span", { style: { width: "10px", height: "10px", borderRadius: "50%", background: "#111827", display: "inline-block" } }),
          React.createElement("span", { style: { color: "#4B5563" } }, `你发送：${myCount} 句 (${myPct}%)`)
        ),
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          React.createElement("span", { style: { width: "10px", height: "10px", borderRadius: "50%", background: "#D1D5DB", display: "inline-block" } }),
          React.createElement("span", { style: { color: "#4B5563" } }, `对方回：${otherCount} 句 (${otherPct}%)`)
        )
      )
    );
  };

  const HourlyBarChart = ({ hourBuckets, peakTimeSlot }) => {
    const buckets = Array.isArray(hourBuckets) && hourBuckets.length === 24 ? hourBuckets : new Array(24).fill(0);
    const maxVal = Math.max(1, ...buckets);
    const peakStart = parseInt(String(peakTimeSlot || "20").slice(0, 2), 10) || 0;
    const peakHours = new Set([peakStart, (peakStart + 1) % 24]);

    return React.createElement(
      "div",
      { style: { width: "100%", padding: "8px 0 2px" } },
      React.createElement(
        "svg",
        { viewBox: "0 0 288 105", style: { width: "100%", height: "105px", overflow: "visible" } },
        buckets.map((val, h) => {
          const barH = Math.max(3, Math.round((val / maxVal) * 76));
          const x = h * 12 + 2;
          const y = 82 - barH;
          const isPeak = peakHours.has(h);
          return React.createElement("rect", {
            key: h,
            x: String(x),
            y: String(y),
            width: "8",
            height: String(barH),
            rx: "3",
            fill: isPeak ? "#D6724B" : val > 0 ? "#1F2937" : "#E5E7EB",
            opacity: isPeak ? "1" : val > 0 ? "0.7" : "0.6",
            style: { transition: "all 0.5s ease" }
          });
        }),
        [0, 6, 12, 18, 23].map((h) =>
          React.createElement(
            "text",
            {
              key: h,
              x: String(h * 12 + 6),
              y: "98",
              textAnchor: "middle",
              fontSize: "9",
              fill: "#9CA3AF"
            },
            `${h}h`
          )
        )
      )
    );
  };

  const DailyTrendLineChart = ({ dailySeries }) => {
    const list = Array.isArray(dailySeries) ? dailySeries.slice(-14) : [];
    if (list.length === 0) return null;
    const maxVal = Math.max(1, ...list.map((d) => d.count));
    const W = 300;
    const H = 96;
    const padX = 12;
    const padY = 14;
    const stepX = list.length > 1 ? (W - padX * 2) / (list.length - 1) : 0;

    const pts = list.map((d, i) => {
      const x = list.length === 1 ? W / 2 : padX + i * stepX;
      const y = H - padY - ((d.count / maxVal) * (H - padY * 2));
      return { x, y, ...d };
    });
    const linePoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const areaPoints = `${pts[0].x.toFixed(1)},${H - padY} ${linePoints} ${pts[pts.length - 1].x.toFixed(1)},${H - padY}`;

    return React.createElement(
      "div",
      { style: { width: "100%", paddingTop: "6px" } },
      React.createElement(
        "svg",
        { viewBox: `0 0 ${W} ${H + 14}`, style: { width: "100%", height: "110px" } },
        React.createElement(
          "defs",
          null,
          React.createElement(
            "linearGradient",
            { id: "crTrendGrad", x1: "0", y1: "0", x2: "0", y2: "1" },
            React.createElement("stop", { offset: "0%", stopColor: "#4E7E8E", stopOpacity: "0.24" }),
            React.createElement("stop", { offset: "100%", stopColor: "#4E7E8E", stopOpacity: "0.0" })
          )
        ),
        pts.length > 1 && React.createElement("polygon", { points: areaPoints, fill: "url(#crTrendGrad)" }),
        pts.length > 1 && React.createElement("polyline", { fill: "none", stroke: "#4E7E8E", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", points: linePoints }),
        pts.map((p, idx) =>
          React.createElement("circle", {
            key: idx,
            cx: p.x.toFixed(1),
            cy: p.y.toFixed(1),
            r: p.count === maxVal ? "4" : "2.5",
            fill: p.count === maxVal ? "#D6724B" : "#4E7E8E"
          })
        ),
        React.createElement("text", { x: String(padX), y: String(H + 8), fontSize: "9", fill: "#9CA3AF" }, list[0].date.slice(5)),
        list.length > 1 &&
          React.createElement("text", { x: String(W - padX), y: String(H + 8), textAnchor: "end", fontSize: "9", fill: "#9CA3AF" }, list[list.length - 1].date.slice(5))
      )
    );
  };

  const KeywordBubbleCloud = ({ keywords }) => {
    const list = (keywords || []).slice(0, 12);
    if (list.length === 0) {
      return React.createElement("div", { style: { textAlign: "center", color: "#9CA3AF", fontSize: "13px", padding: "32px 0" } }, "暂无足够的高频文本词汇");
    }
    const maxC = Math.max(1, list[0].count || 1);
    return React.createElement(
      "div",
      { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "10px", padding: "14px 4px" } },
      list.map((kw, idx) => {
        const ratio = kw.count / maxC;
        const fontSize = Math.round(12 + ratio * 9);
        const isTop = idx < 3;
        return React.createElement(
          "div",
          {
            key: kw.word,
            style: {
              padding: isTop ? "8px 14px" : "6px 12px",
              borderRadius: "999px",
              fontSize: `${fontSize}px`,
              fontWeight: isTop ? "800" : "600",
              background: idx === 0 ? "#111827" : idx < 3 ? "#D6724B" : "#F3F4F6",
              color: idx < 3 ? "#FFFFFF" : "#374151",
              boxShadow: isTop ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
              animation: `crPopIn 0.45s cubic-bezier(0.22,1,0.36,1) ${idx * 45}ms both`
            }
          },
          kw.word,
          React.createElement("span", { style: { fontSize: "10px", opacity: 0.72, marginLeft: "4px", fontWeight: "500" } }, kw.count)
        );
      })
    );
  };

  // ==================== P2 AI 年度报告深度提炼层（含多级 JSON 容错与本地降级） ====================
  function generateAiSummary(metrics) {
    return new Promise((resolve) => {
      const fallback = buildLocalSummary(metrics);
      if (!metrics || !global.sendToLLM) {
        resolve({ summary: fallback, isAiEnhanced: false, reason: "未配置 API，已使用本地统计版" });
        return;
      }

      const pName = metrics.periodType === "week" ? "本周" : metrics.periodType === "month" ? "本月" : "本年度";
      const compactStats = {
        period: metrics.periodLabel,
        userName: metrics.userName,
        sessions: metrics.sessionCount,
        totalMessages: metrics.totalMessages,
        myMessages: metrics.myCount,
        otherMessages: metrics.otherCount,
        activeDays: metrics.activeDaysCount,
        peakTimeSlot: `${metrics.peakTimeSlot} (${metrics.peakTimeLabel})`,
        mostActiveDay: metrics.mostActiveDay ? `${metrics.mostActiveDay.date} (${metrics.mostActiveDay.count}句)` : "无",
        topFriend: metrics.topFriend
          ? `${metrics.topFriend.name} (互动${metrics.topFriend.count}句，占比${metrics.topFriend.sharePercent}%，陪伴${metrics.topFriend.activeDays}天)`
          : "无",
        stickers: metrics.stickerCount,
        calls: `${metrics.callCount}次 (${metrics.callDurationText})`,
        topKeywords: (metrics.topKeywords || []).slice(0, 10).map((k) => `${k.word}(${k.count})`)
      };

      const userSampleStr = (metrics.samples?.userSamples || []).slice(0, 18).join(" / ") || "（暂无文本抽样）";
      const friendSampleStr = (metrics.samples?.friendSamples || []).slice(0, 18).join(" / ") || "（暂无文本抽样）";

      const sysPrompt =
        "你是一位擅长撰写极简、高级、有温度且客观克制的「ChatGPT 年度报告风格」数据洞察作家。请根据用户的真实传讯统计数据与少量对话抽样，输出严格合法的纯 JSON 对象（不要包含 ```json 标记）。";
      const userPrompt = `【${pName}传讯统计快照】
${JSON.stringify(compactStats, null, 2)}

【用户（${metrics.userName}）代表性发言抽样】
${userSampleStr}

【${pName}最佳好友（${metrics.topFriend?.name || "对方"}）代表性发言抽样】
${friendSampleStr}

请严格按以下 JSON 结构返回中文总结（不要增删字段名，不要 Markdown 包裹）：
{
  "headline": "一句极具画面感的报告主标题（15~28字）",
  "overallSummary": "整体回顾总评（55~90字，客观温暖、不浮夸）",
  "userStyle": {
    "tag": "4~6字风格标签（如：细腻倾诉型）",
    "summary": "基于统计与抽样对用户聊天风格的客观分析（35~60字）"
  },
  "friendStyle": {
    "tag": "4~6字风格标签（如：沉稳接梗型）",
    "summary": "基于抽样对最佳好友聊天风格的客观分析（35~60字）"
  },
  "relationshipVerdict": "一句客观且有余韵的双方互动关系总结（25~45字）",
  "sectionSummaries": {
    "volume": "针对聊天次数与总句数的简短洞察（20~38字）",
    "activeTime": "针对最活跃时段与最活跃一天的简短洞察（20~38字）",
    "topFriend": "针对最佳好友陪伴与互动占比的简短洞察（20~38字）",
    "keywords": "针对高频词汇所折射心境或主题的简短洞察（20~38字）",
    "media": "针对表情包与语音电话习惯的简短洞察（20~38字）"
  }
}`;

      try {
        global.sendToLLM(
          [
            { role: "system", content: sysPrompt },
            { role: "user", content: userPrompt }
          ],
          null,
          (reply) => {
            try {
              const cleaned = String(reply || "").replace(/```json|```/gi, "").trim();
              let parsed = null;
              try {
                parsed = JSON.parse(cleaned);
              } catch (e1) {
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) parsed = JSON.parse(match[0]);
              }
              if (parsed && typeof parsed === "object") {
                const merged = {
                  headline: parsed.headline || fallback.headline,
                  overallSummary: parsed.overallSummary || fallback.overallSummary,
                  userStyle: {
                    tag: parsed.userStyle?.tag || fallback.userStyle.tag,
                    summary: parsed.userStyle?.summary || fallback.userStyle.summary
                  },
                  friendStyle: {
                    tag: parsed.friendStyle?.tag || fallback.friendStyle.tag,
                    summary: parsed.friendStyle?.summary || fallback.friendStyle.summary
                  },
                  relationshipVerdict: parsed.relationshipVerdict || fallback.relationshipVerdict,
                  sectionSummaries: {
                    volume: parsed.sectionSummaries?.volume || fallback.sectionSummaries.volume,
                    activeTime: parsed.sectionSummaries?.activeTime || fallback.sectionSummaries.activeTime,
                    topFriend: parsed.sectionSummaries?.topFriend || fallback.sectionSummaries.topFriend,
                    keywords: parsed.sectionSummaries?.keywords || fallback.sectionSummaries.keywords,
                    media: parsed.sectionSummaries?.media || fallback.sectionSummaries.media
                  }
                };
                resolve({ summary: merged, isAiEnhanced: true });
                return;
              }
            } catch (parseErr) {
              console.warn("[ChatReport] AI JSON 解析失败，已降级本地模板:", parseErr);
            }
            resolve({ summary: fallback, isAiEnhanced: false, reason: "AI 返回解析异常，已保留本地统计版" });
          },
          (err) => {
            console.warn("[ChatReport] AI 请求失败，已降级本地模板:", err);
            resolve({ summary: fallback, isAiEnhanced: false, reason: "AI 请求失败，已保留本地统计版" });
          }
        );
      } catch (e) {
        resolve({ summary: fallback, isAiEnhanced: false, reason: "AI 调用异常，已保留本地统计版" });
      }
    });
  }

  // ==================== P2 主界面：极简纯白 7 页幻灯片 + AI 深度总结 + 历史抽屉 + 导出长图 ====================
  const ChatReportOverlay = ({ onClose }) => {
    const { useState, useEffect, useRef } = React;
    const [periodType, setPeriodType] = useState("week");
    const [loading, setLoading] = useState(true);
    const [progressText, setProgressText] = useState("正在整理传讯数据...");
    const [metrics, setMetrics] = useState(null);
    const [summary, setSummary] = useState(null);
    const [isAiEnhanced, setIsAiEnhanced] = useState(false);
    const [isAiGenerating, setIsAiGenerating] = useState(false);
    const [activeReportId, setActiveReportId] = useState(null);
    const [slideIdx, setSlideIdx] = useState(0);
    const [savedNotice, setSavedNotice] = useState("");
    const [showHistory, setShowHistory] = useState(false);
    const [historyList, setHistoryList] = useState([]);
    const [historyFilter, setHistoryFilter] = useState("all");
    const [isExporting, setIsExporting] = useState(false);
    const touchStartX = useRef(null);
    const summaryCardRef = useRef(null);

    const TOTAL_SLIDES = 7;

    const refreshHistoryList = async () => {
      if (!global.chatReportStore) return [];
      const list = await global.chatReportStore.getAll();
      setHistoryList(list || []);
      return list || [];
    };

    const runAggregation = async (type, forceRecompute = false) => {
      setLoading(true);
      setSavedNotice("");
      setSlideIdx(0);
      try {
        const range = getPeriodRange(type);
        if (!forceRecompute && global.chatReportStore) {
          const existing = await global.chatReportStore.getByPeriod(type);
          const matched = (existing || []).find((r) => r.periodKey === range.periodKey && r.metrics && r.metrics.totalMessages > 0);
          if (matched) {
            setMetrics(matched.metrics);
            setSummary(matched.aiSummary || buildLocalSummary(matched.metrics));
            setIsAiEnhanced(Boolean(matched.isAiEnhanced));
            setActiveReportId(matched.id);
            setSavedNotice(matched.isAiEnhanced ? "已读取 AI 历史存档" : "已读取本地历史存档");
            refreshHistoryList();
            setLoading(false);
            return;
          }
        }
        const res = await aggregateChatMetrics(type, (p) => {
          setProgressText(`正在整理第 ${p.current}/${p.total} 位联系人（${p.name}）...`);
        });
        const localSum = buildLocalSummary(res);
        setMetrics(res);
        setSummary(localSum);
        setIsAiEnhanced(false);
        if (res.totalMessages > 0 && global.chatReportStore) {
          const snapshot = {
            id: `report_${res.periodType}_${res.periodKey}_${Date.now()}`,
            periodType: res.periodType,
            periodKey: res.periodKey,
            periodLabel: res.periodLabel,
            createdAt: Date.now(),
            userName: res.userName,
            isAiEnhanced: false,
            metrics: res,
            aiSummary: localSum
          };
          await global.chatReportStore.save(snapshot);
          setActiveReportId(snapshot.id);
          setSavedNotice("已归档至 IndexedDB");
          refreshHistoryList();
        } else {
          setActiveReportId(null);
        }
      } catch (e) {
        console.error("生成聊天统计失败:", e);
      } finally {
        setLoading(false);
      }
    };

    const handleRunAiSummary = async () => {
      if (!metrics || metrics.totalMessages === 0 || isAiGenerating) return;
      setIsAiGenerating(true);
      setSavedNotice("AI 正在深度提炼风格与总结...");
      try {
        const res = await generateAiSummary(metrics);
        setSummary(res.summary);
        setIsAiEnhanced(res.isAiEnhanced);
        if (res.isAiEnhanced && global.chatReportStore) {
          const snapshot = {
            id: activeReportId || `report_${metrics.periodType}_${metrics.periodKey}_${Date.now()}`,
            periodType: metrics.periodType,
            periodKey: metrics.periodKey,
            periodLabel: metrics.periodLabel,
            createdAt: Date.now(),
            userName: metrics.userName,
            isAiEnhanced: true,
            metrics,
            aiSummary: res.summary
          };
          await global.chatReportStore.save(snapshot);
          setActiveReportId(snapshot.id);
          setSavedNotice("✨ AI 深度报告已更新并存档");
          refreshHistoryList();
        } else {
          setSavedNotice(res.reason || "已保留本地统计版");
        }
      } finally {
        setIsAiGenerating(false);
      }
    };

    const handleOpenHistory = async () => {
      await refreshHistoryList();
      setShowHistory(true);
    };

    const handleSelectHistory = (item) => {
      if (!item || !item.metrics) return;
      setPeriodType(item.periodType || "week");
      setMetrics(item.metrics);
      setSummary(item.aiSummary || buildLocalSummary(item.metrics));
      setIsAiEnhanced(Boolean(item.isAiEnhanced));
      setActiveReportId(item.id);
      setSlideIdx(0);
      setSavedNotice(`正在回看历史报告（${new Date(item.createdAt).toLocaleDateString()}）`);
      setShowHistory(false);
    };

    const handleDeleteHistory = async (e, id) => {
      e.stopPropagation();
      if (!global.chatReportStore) return;
      await global.chatReportStore.delete(id);
      await refreshHistoryList();
    };

    const handleExportCardImage = async () => {
      if (!summaryCardRef.current || isExporting) return;
      if (typeof global.html2canvas !== "function") {
        alert("当前环境未加载截图组件，请直接系统截屏保存纪念卡。");
        return;
      }
      setIsExporting(true);
      try {
        const canvas = await global.html2canvas(summaryCardRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#FFFFFF"
        });
        const link = document.createElement("a");
        link.download = `传讯报告_${metrics?.periodKey || "report"}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        setSavedNotice("纪念卡已导出为 PNG");
      } catch (e) {
        console.error("导出纪念卡失败:", e);
        alert("导出图片失败，建议使用系统截屏保存。");
      } finally {
        setIsExporting(false);
      }
    };

    useEffect(() => {
      runAggregation(periodType, false);
    }, [periodType]);

    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "ArrowRight") setSlideIdx((i) => Math.min(TOTAL_SLIDES - 1, i + 1));
        else if (e.key === "ArrowLeft") setSlideIdx((i) => Math.max(0, i - 1));
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    const handleTouchStart = (e) => {
      if (e.touches && e.touches.length === 1) touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e) => {
      if (touchStartX.current === null || !e.changedTouches || !e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (dx < -45) setSlideIdx((i) => Math.min(TOTAL_SLIDES - 1, i + 1));
      else if (dx > 45) setSlideIdx((i) => Math.max(0, i - 1));
    };

    const periodTabs = [
      { id: "week", label: "本周" },
      { id: "month", label: "本月" },
      { id: "year", label: "年度" }
    ];

    const renderSlideContent = () => {
      if (!metrics || !summary) return null;
      const pTitle = periodType === "week" ? "本周" : periodType === "month" ? "本月" : "年度";

      switch (slideIdx) {
        case 0:
          return React.createElement(
            "div",
            { key: "s0", style: { animation: "crFadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1)", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "420px", gap: "18px" } },
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", letterSpacing: "1.5px", color: "#9CA3AF", textTransform: "uppercase" } }, metrics.periodLabel),
            React.createElement("h1", { style: { fontSize: "30px", fontWeight: "800", margin: 0, color: "#111827", lineHeight: "1.25", letterSpacing: "-0.5px" } }, metrics.greeting),
            React.createElement("div", { style: { fontSize: "17px", fontWeight: "600", color: "#374151", lineHeight: "1.5" } }, summary.headline),
            React.createElement(TypewriterSummary, { text: summary.overallSummary }),
            React.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginTop: "8px" } },
              React.createElement(
                "button",
                {
                  type: "button",
                  disabled: isAiGenerating,
                  onClick: handleRunAiSummary,
                  style: {
                    border: "1px solid #E5E7EB",
                    background: isAiEnhanced ? "#F0FDF4" : "#F8F9FB",
                    color: isAiEnhanced ? "#15803D" : "#111827",
                    padding: "9px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: isAiGenerating ? "wait" : "pointer"
                  }
                },
                isAiGenerating ? "AI 总结中..." : isAiEnhanced ? "✨ 重写 AI 点评" : "✨ 生成 AI 深度点评"
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  onClick: () => setSlideIdx(1),
                  style: { border: "none", background: "#111827", color: "#FFFFFF", padding: "10px 20px", borderRadius: "999px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }
                },
                "翻开报告 →"
              )
            ),
            savedNotice && React.createElement("div", { style: { fontSize: "11px", color: "#6B7280", fontWeight: "500" } }, savedNotice)
          );

        case 1:
          return React.createElement(
            "div",
            { key: "s1", style: { animation: "crFadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1)", display: "flex", flexDirection: "column", gap: "14px" } },
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#9CA3AF", letterSpacing: "1px" } }, `01 · ${pTitle}互动总量`),
            React.createElement(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } },
              React.createElement(
                "div",
                { style: { background: "#F8F9FB", border: "1px solid #ECEEF2", borderRadius: "18px", padding: "16px" } },
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280" } }, "共开启对话"),
                React.createElement("div", { style: { fontSize: "28px", fontWeight: "800", color: "#111827", marginTop: "4px" } }, React.createElement(AnimatedNumber, { value: metrics.sessionCount, suffix: " 次" })),
                React.createElement("div", { style: { fontSize: "11px", color: "#9CA3AF", marginTop: "4px" } }, `活跃 ${metrics.activeDaysCount} 天`)
              ),
              React.createElement(
                "div",
                { style: { background: "#F8F9FB", border: "1px solid #ECEEF2", borderRadius: "18px", padding: "16px" } },
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280" } }, "累计传讯"),
                React.createElement("div", { style: { fontSize: "28px", fontWeight: "800", color: "#D6724B", marginTop: "4px" } }, React.createElement(AnimatedNumber, { value: metrics.totalMessages, suffix: " 句" })),
                React.createElement("div", { style: { fontSize: "11px", color: "#9CA3AF", marginTop: "4px" } }, `单次均聊 ${metrics.sessionCount > 0 ? Math.max(1, Math.round(metrics.totalMessages / metrics.sessionCount)) : 0} 句`)
              )
            ),
            React.createElement(
              "div",
              { style: { background: "#FFFFFF", border: "1px solid #ECEEF2", borderRadius: "18px", padding: "14px" } },
              React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#374151", marginBottom: "4px" } }, "发言占比分布"),
              React.createElement(DonutRatioChart, { myCount: metrics.myCount, otherCount: metrics.otherCount })
            ),
            React.createElement(TypewriterSummary, { text: summary.sectionSummaries.volume })
          );

        case 2:
          return React.createElement(
            "div",
            { key: "s2", style: { animation: "crFadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1)", display: "flex", flexDirection: "column", gap: "14px" } },
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#9CA3AF", letterSpacing: "1px" } }, "02 · 活跃节律与巅峰时刻"),
            React.createElement(
              "div",
              { style: { background: "#F8F9FB", border: "1px solid #ECEEF2", borderRadius: "18px", padding: "16px" } },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" } },
                React.createElement("span", { style: { fontSize: "12px", color: "#6B7280", fontWeight: "600" } }, "最活跃时段"),
                React.createElement("span", { style: { fontSize: "11px", color: "#D6724B", fontWeight: "700", background: "#FFF4EE", padding: "2px 8px", borderRadius: "999px" } }, metrics.peakTimeLabel)
              ),
              React.createElement("div", { style: { fontSize: "24px", fontWeight: "800", color: "#111827", marginBottom: "8px" } }, metrics.peakTimeSlot),
              React.createElement(HourlyBarChart, { hourBuckets: metrics.hourBuckets, peakTimeSlot: metrics.peakTimeSlot })
            ),
            metrics.mostActiveDay &&
              React.createElement(
                "div",
                { style: { background: "#FFFFFF", border: "1px solid #ECEEF2", borderRadius: "18px", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" } },
                React.createElement(
                  "div",
                  null,
                  React.createElement("div", { style: { fontSize: "11px", color: "#6B7280" } }, "哪天最活跃"),
                  React.createElement("div", { style: { fontSize: "18px", fontWeight: "800", color: "#111827", marginTop: "2px" } }, metrics.mostActiveDay.date),
                  metrics.mostActiveDay.topChar && React.createElement("div", { style: { fontSize: "11px", color: "#9CA3AF", marginTop: "2px" } }, `当日热聊对象：${metrics.mostActiveDay.topChar}`)
                ),
                React.createElement("div", { style: { fontSize: "22px", fontWeight: "800", color: "#4E7E8E" } }, `${metrics.mostActiveDay.count} 句`)
              ),
            React.createElement(TypewriterSummary, { text: summary.sectionSummaries.activeTime })
          );

        case 3:
          return React.createElement(
            "div",
            { key: "s3", style: { animation: "crFadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1)", display: "flex", flexDirection: "column", gap: "14px" } },
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#9CA3AF", letterSpacing: "1px" } }, `03 · ${pTitle}最佳好友与风格`),
            metrics.topFriend
              ? React.createElement(
                  "div",
                  { style: { background: "#111827", color: "#FFFFFF", borderRadius: "20px", padding: "18px", display: "flex", alignItems: "center", gap: "14px" } },
                  React.createElement(ReportAvatar, {
                    avatar: metrics.topFriend.avatar,
                    rawAvatar: metrics.topFriend.rawAvatar,
                    charId: metrics.topFriend.id,
                    name: metrics.topFriend.name,
                    color: metrics.topFriend.avatarColor || "#374151",
                    size: 54
                  }),
                  React.createElement(
                    "div",
                    { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: "11px", color: "rgba(255,255,255,0.65)" } }, `${pTitle}最佳好友`),
                    React.createElement("div", { style: { fontSize: "20px", fontWeight: "800", marginTop: "2px" } }, metrics.topFriend.name),
                    React.createElement("div", { style: { fontSize: "11.5px", color: "rgba(255,255,255,0.8)", marginTop: "4px" } }, `互动 ${metrics.topFriend.count} 句 · 占总聊天 ${metrics.topFriend.sharePercent}% · 陪伴 ${metrics.topFriend.activeDays} 天`)
                  )
                )
              : React.createElement("div", { style: { background: "#F8F9FB", borderRadius: "18px", padding: "16px", fontSize: "13px", color: "#6B7280" } }, "暂无单聊最佳好友记录"),
            React.createElement(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } },
              React.createElement(
                "div",
                { style: { background: "#F8F9FB", border: "1px solid #ECEEF2", borderRadius: "16px", padding: "14px" } },
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280" } }, "你的聊天风格"),
                React.createElement("div", { style: { fontSize: "14px", fontWeight: "800", color: "#111827", margin: "4px 0 6px" } }, summary.userStyle.tag),
                React.createElement("div", { style: { fontSize: "11.5px", color: "#4B5563", lineHeight: "1.55" } }, summary.userStyle.summary)
              ),
              React.createElement(
                "div",
                { style: { background: "#F8F9FB", border: "1px solid #ECEEF2", borderRadius: "16px", padding: "14px" } },
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280" } }, "对方聊天风格"),
                React.createElement("div", { style: { fontSize: "14px", fontWeight: "800", color: "#D6724B", margin: "4px 0 6px" } }, summary.friendStyle.tag),
                React.createElement("div", { style: { fontSize: "11.5px", color: "#4B5563", lineHeight: "1.55" } }, summary.friendStyle.summary)
              )
            ),
            React.createElement(TypewriterSummary, { text: `客观总评：${summary.relationshipVerdict}` })
          );

        case 4:
          return React.createElement(
            "div",
            { key: "s4", style: { animation: "crFadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1)", display: "flex", flexDirection: "column", gap: "14px" } },
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#9CA3AF", letterSpacing: "1px" } }, `04 · ${pTitle}高频词汇`),
            React.createElement("div", { style: { fontSize: "20px", fontWeight: "800", color: "#111827" } }, "这些词反复出现在你的对话里"),
            React.createElement(
              "div",
              { style: { background: "#FFFFFF", border: "1px solid #ECEEF2", borderRadius: "20px", padding: "14px" } },
              React.createElement(KeywordBubbleCloud, { keywords: metrics.topKeywords })
            ),
            React.createElement(TypewriterSummary, { text: summary.sectionSummaries.keywords })
          );

        case 5:
          return React.createElement(
            "div",
            { key: "s5", style: { animation: "crFadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1)", display: "flex", flexDirection: "column", gap: "14px" } },
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#9CA3AF", letterSpacing: "1px" } }, "05 · 表情包、语音与走势"),
            React.createElement(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } },
              React.createElement(
                "div",
                { style: { background: "#F8F9FB", border: "1px solid #ECEEF2", borderRadius: "18px", padding: "16px" } },
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280" } }, "表情包总数"),
                React.createElement("div", { style: { fontSize: "26px", fontWeight: "800", color: "#111827", marginTop: "4px" } }, React.createElement(AnimatedNumber, { value: metrics.stickerCount, suffix: " 个" })),
                React.createElement("div", { style: { fontSize: "11px", color: "#9CA3AF", marginTop: "4px" } }, `你 ${metrics.myStickerCount} · 对方 ${metrics.otherStickerCount}`)
              ),
              React.createElement(
                "div",
                { style: { background: "#F8F9FB", border: "1px solid #ECEEF2", borderRadius: "18px", padding: "16px" } },
                React.createElement("div", { style: { fontSize: "11px", color: "#6B7280" } }, "语音电话"),
                React.createElement("div", { style: { fontSize: "26px", fontWeight: "800", color: "#4E7E8E", marginTop: "4px" } }, React.createElement(AnimatedNumber, { value: metrics.callCount, suffix: " 次" })),
                React.createElement("div", { style: { fontSize: "11px", color: "#9CA3AF", marginTop: "4px" } }, metrics.callDurationText)
              )
            ),
            React.createElement(
              "div",
              { style: { background: "#FFFFFF", border: "1px solid #ECEEF2", borderRadius: "18px", padding: "14px" } },
              React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#374151", marginBottom: "4px" } }, "近期互动热度趋势"),
              React.createElement(DailyTrendLineChart, { dailySeries: metrics.dailySeries })
            ),
            React.createElement(TypewriterSummary, { text: summary.sectionSummaries.media })
          );

        default:
          return React.createElement(
            "div",
            { key: "s6", style: { animation: "crFadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1)", display: "flex", flexDirection: "column", gap: "14px" } },
            React.createElement("div", { style: { fontSize: "12px", fontWeight: "700", color: "#9CA3AF", letterSpacing: "1px" } }, `06 · ${pTitle}传讯纪念卡`),
            React.createElement(
              "div",
              { ref: summaryCardRef, style: { background: "#FFFFFF", border: "1.5px solid #111827", borderRadius: "22px", padding: "20px", boxShadow: "0 12px 30px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: "14px" } },
              React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("span", { style: { fontSize: "16px", fontWeight: "800", color: "#111827" } }, `${metrics.userName} · ${pTitle}总结`),
                React.createElement("span", { style: { fontSize: "10.5px", color: "#6B7280" } }, isAiEnhanced ? `✨ AI · ${metrics.periodKey}` : metrics.periodKey)
              ),
              React.createElement(
                "div",
                { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", textAlign: "center", background: "#F8F9FB", padding: "12px 8px", borderRadius: "14px" } },
                React.createElement("div", null, React.createElement("div", { style: { fontSize: "17px", fontWeight: "800" } }, metrics.sessionCount), React.createElement("div", { style: { fontSize: "10px", color: "#6B7280" } }, "聊天次数")),
                React.createElement("div", null, React.createElement("div", { style: { fontSize: "17px", fontWeight: "800", color: "#D6724B" } }, metrics.totalMessages), React.createElement("div", { style: { fontSize: "10px", color: "#6B7280" } }, "总句数")),
                React.createElement("div", null, React.createElement("div", { style: { fontSize: "17px", fontWeight: "800", color: "#4E7E8E" } }, metrics.stickerCount), React.createElement("div", { style: { fontSize: "10px", color: "#6B7280" } }, "表情包"))
              ),
              React.createElement("div", { style: { fontSize: "12.5px", color: "#374151", lineHeight: "1.65" } },
                metrics.topFriend ? `${pTitle}最佳好友：${metrics.topFriend.name}（${metrics.topFriend.sharePercent}%） · ` : "",
                `最活跃时段：${metrics.peakTimeSlot}`,
                metrics.topKeywords[0] ? ` · 热词：「${metrics.topKeywords[0].word}」` : ""
              ),
              React.createElement("div", { style: { fontSize: "12px", color: "#6B7280", fontStyle: "italic", borderTop: "1px dashed #E5E7EB", paddingTop: "10px" } }, `“${summary.relationshipVerdict}”`)
            ),
            React.createElement(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "4px" } },
              React.createElement("button", { type: "button", onClick: handleExportCardImage, disabled: isExporting, style: { padding: "11px", borderRadius: "14px", border: "none", background: "#111827", color: "#FFFFFF", fontSize: "12.5px", fontWeight: "700", cursor: "pointer" } }, isExporting ? "导出中..." : "保存纪念卡长图"),
              React.createElement("button", { type: "button", onClick: handleOpenHistory, style: { padding: "11px", borderRadius: "14px", border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#374151", fontSize: "12.5px", fontWeight: "700", cursor: "pointer" } }, "查看历史报告"),
              React.createElement("button", { type: "button", onClick: () => runAggregation(periodType, true), style: { padding: "10px", borderRadius: "14px", border: "1px solid #E5E7EB", background: "#F8F9FB", color: "#4B5563", fontSize: "12px", fontWeight: "600", cursor: "pointer" } }, "重新统计数据"),
              React.createElement("button", { type: "button", onClick: handleRunAiSummary, disabled: isAiGenerating, style: { padding: "10px", borderRadius: "14px", border: "1px solid #E5E7EB", background: "#F8F9FB", color: "#D6724B", fontSize: "12px", fontWeight: "700", cursor: "pointer" } }, isAiGenerating ? "AI 生成中..." : "✨ AI 深度点评")
            )
          );
      }
    };

    return React.createElement(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 1300,
          backgroundColor: "#FFFFFF",
          color: "#111827",
          display: "flex",
          flexDirection: "column",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif"
        }
      },
      React.createElement(
        "style",
        null,
        `
        @keyframes crFadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes crPopIn {
          from { opacity: 0; transform: scale(0.86); }
          to { opacity: 1; transform: scale(1); }
        }
        `
      ),
      /* 顶部极简控制栏 */
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px 8px",
            backgroundColor: "#FFFFFF",
            flexShrink: 0
          }
        },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: onClose,
            style: { border: "none", background: "#F4F5F7", color: "#374151", padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }
          },
          "← 返回"
        ),
        React.createElement(
          "div",
          { style: { display: "flex", background: "#F4F5F7", padding: "3px", borderRadius: "999px", gap: "2px" } },
          periodTabs.map((t) =>
            React.createElement(
              "button",
              {
                key: t.id,
                type: "button",
                onClick: () => setPeriodType(t.id),
                style: {
                  border: "none",
                  padding: "5px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: periodType === t.id ? "700" : "500",
                  background: periodType === t.id ? "#FFFFFF" : "transparent",
                  color: periodType === t.id ? "#111827" : "#6B7280",
                  boxShadow: periodType === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  cursor: "pointer"
                }
              },
              t.label
            )
          )
        ),
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "4px" } },
          React.createElement(
            "button",
            {
              type: "button",
              onClick: handleOpenHistory,
              style: { border: "none", background: "#F4F5F7", color: "#374151", fontSize: "11.5px", fontWeight: "600", cursor: "pointer", padding: "6px 10px", borderRadius: "999px" }
            },
            "历史"
          ),
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => runAggregation(periodType, true),
              disabled: loading,
              style: { border: "none", background: "transparent", color: "#4B5563", fontSize: "12px", fontWeight: "600", cursor: loading ? "wait" : "pointer", padding: "6px 6px" }
            },
            "↻"
          )
        )
      ),
      /* 顶部 7 段式幻灯片进度条 */
      !loading && metrics && metrics.totalMessages > 0 &&
        React.createElement(
          "div",
          { style: { display: "flex", gap: "4px", padding: "4px 20px 8px", maxWidth: "460px", width: "100%", margin: "0 auto", boxSizing: "border-box" } },
          Array.from({ length: TOTAL_SLIDES }).map((_, idx) =>
            React.createElement("div", {
              key: idx,
              onClick: () => setSlideIdx(idx),
              style: {
                flex: 1,
                height: "3.5px",
                borderRadius: "999px",
                cursor: "pointer",
                background: idx <= slideIdx ? "#111827" : "#E5E7EB",
                transition: "background 0.25s ease"
              }
            })
          )
        ),
      /* 幻灯片主体区（支持左右滑动） */
      React.createElement(
        "div",
        {
          className: "no-scrollbar",
          onTouchStart: handleTouchStart,
          onTouchEnd: handleTouchEnd,
          style: {
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px 24px",
            maxWidth: "460px",
            width: "100%",
            margin: "0 auto",
            boxSizing: "border-box"
          }
        },
        loading
          ? React.createElement(
              "div",
              { style: { textAlign: "center", padding: "90px 16px", color: "#6B7280" } },
              React.createElement("div", { style: { fontSize: "15px", fontWeight: "700", color: "#111827", marginBottom: "8px" } }, "正在生成传讯报告"),
              React.createElement("div", { style: { fontSize: "12px" } }, progressText)
            )
          : !metrics || metrics.totalMessages === 0
          ? React.createElement(
              "div",
              { style: { textAlign: "center", padding: "80px 16px" } },
              React.createElement("div", { style: { fontSize: "20px", fontWeight: "800", color: "#111827", marginBottom: "8px" } }, metrics?.greeting || "你好"),
              React.createElement("div", { style: { fontSize: "13px", color: "#6B7280", marginBottom: "22px" } }, `${metrics?.periodLabel || "当前周期"} 尚未留下带时间戳的传讯记录`),
              periodType !== "year" &&
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: () => setPeriodType("year"),
                    style: { border: "none", background: "#111827", color: "#FFFFFF", padding: "10px 20px", borderRadius: "999px", fontSize: "12.5px", fontWeight: "600", cursor: "pointer" }
                  },
                  "查看本年度报告"
                )
            )
          : renderSlideContent()
      ),
      /* 底部极简翻页栏 */
      !loading && metrics && metrics.totalMessages > 0 &&
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 20px 18px",
              borderTop: "1px solid #F3F4F6",
              maxWidth: "460px",
              width: "100%",
              margin: "0 auto",
              boxSizing: "border-box",
              flexShrink: 0
            }
          },
          React.createElement(
            "button",
            {
              type: "button",
              disabled: slideIdx === 0,
              onClick: () => setSlideIdx((i) => Math.max(0, i - 1)),
              style: { border: "1px solid #E5E7EB", background: "#FFFFFF", color: slideIdx === 0 ? "#D1D5DB" : "#374151", padding: "8px 16px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", cursor: slideIdx === 0 ? "default" : "pointer" }
            },
            "← 上一页"
          ),
          React.createElement("span", { style: { fontSize: "11.5px", color: "#9CA3AF", fontWeight: "600" } }, `${slideIdx + 1} / ${TOTAL_SLIDES}`),
          React.createElement(
            "button",
            {
              type: "button",
              disabled: slideIdx === TOTAL_SLIDES - 1,
              onClick: () => setSlideIdx((i) => Math.min(TOTAL_SLIDES - 1, i + 1)),
              style: { border: "none", background: slideIdx === TOTAL_SLIDES - 1 ? "#E5E7EB" : "#111827", color: "#FFFFFF", padding: "8px 16px", borderRadius: "999px", fontSize: "12px", fontWeight: "600", cursor: slideIdx === TOTAL_SLIDES - 1 ? "default" : "pointer" }
            },
            "下一页 →"
          )
        ),
      /* 历史报告抽屉 */
      showHistory &&
        React.createElement(
          "div",
          {
            onClick: () => setShowHistory(false),
            style: {
              position: "fixed",
              inset: 0,
              zIndex: 1350,
              background: "rgba(17, 24, 39, 0.35)",
              backdropFilter: "blur(3px)",
              display: "flex",
              justifyContent: "flex-end"
            }
          },
          React.createElement(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "86%",
                maxWidth: "340px",
                height: "100%",
                background: "#FFFFFF",
                boxShadow: "-8px 0 30px rgba(0,0,0,0.12)",
                display: "flex",
                flexDirection: "column",
                padding: "16px",
                boxSizing: "border-box"
              }
            },
            React.createElement(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: "1px solid #F1F3F5" } },
              React.createElement("div", { style: { fontSize: "15px", fontWeight: "800", color: "#111827" } }, "历史报告归档"),
              React.createElement("button", { type: "button", onClick: () => setShowHistory(false), style: { border: "none", background: "#F4F5F7", color: "#6B7280", width: "28px", height: "28px", borderRadius: "50%", fontSize: "16px", cursor: "pointer" } }, "×")
            ),
            React.createElement(
              "div",
              { style: { display: "flex", gap: "6px", padding: "10px 0" } },
              [
                { id: "all", label: "全部" },
                { id: "week", label: "周报" },
                { id: "month", label: "月报" },
                { id: "year", label: "年报" }
              ].map((f) =>
                React.createElement(
                  "button",
                  {
                    key: f.id,
                    type: "button",
                    onClick: () => setHistoryFilter(f.id),
                    style: {
                      border: "1px solid #E5E7EB",
                      background: historyFilter === f.id ? "#111827" : "#FFFFFF",
                      color: historyFilter === f.id ? "#FFFFFF" : "#6B7280",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }
                  },
                  f.label
                )
              )
            ),
            React.createElement(
              "div",
              { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingTop: "4px" } },
              (() => {
                const filtered = historyList.filter((r) => historyFilter === "all" || r.periodType === historyFilter);
                if (filtered.length === 0) {
                  return React.createElement("div", { style: { textAlign: "center", color: "#9CA3AF", fontSize: "12.5px", padding: "48px 12px" } }, "暂无历史报告记录");
                }
                return filtered.map((item) =>
                  React.createElement(
                    "div",
                    {
                      key: item.id,
                      onClick: () => handleSelectHistory(item),
                      style: {
                        background: activeReportId === item.id ? "#F3F4F6" : "#F8F9FB",
                        border: activeReportId === item.id ? "1.5px solid #111827" : "1px solid #ECEEF2",
                        borderRadius: "14px",
                        padding: "12px",
                        cursor: "pointer",
                        position: "relative"
                      }
                    },
                    React.createElement(
                      "div",
                      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" } },
                      React.createElement("span", { style: { fontSize: "12.5px", fontWeight: "700", color: "#111827" } }, item.periodLabel || item.periodKey),
                      React.createElement(
                        "button",
                        {
                          type: "button",
                          onClick: (e) => handleDeleteHistory(e, item.id),
                          title: "删除此报告",
                          style: { border: "none", background: "transparent", color: "#9CA3AF", fontSize: "14px", cursor: "pointer", padding: "0 4px" }
                        },
                        "×"
                      )
                    ),
                    React.createElement(
                      "div",
                      { style: { fontSize: "11px", color: "#6B7280", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
                      React.createElement("span", null, `${item.metrics?.totalMessages || 0} 句`),
                      item.metrics?.topFriend && React.createElement("span", null, `最佳好友：${item.metrics.topFriend.name}`),
                      React.createElement(
                        "span",
                        { style: { fontSize: "10px", padding: "1px 6px", borderRadius: "999px", background: item.isAiEnhanced ? "#DCFCE7" : "#E5E7EB", color: item.isAiEnhanced ? "#166534" : "#4B5563", fontWeight: "600" } },
                        item.isAiEnhanced ? "AI 深度版" : "本地版"
                      )
                    ),
                    React.createElement("div", { style: { fontSize: "10px", color: "#9CA3AF", marginTop: "4px" } }, new Date(item.createdAt || Date.now()).toLocaleString())
                  )
                );
              })()
            )
          )
        )
    );
  };

  global.ChatReportEngine = {
    aggregateChatMetrics,
    buildLocalSummary,
    generateAiSummary,
    getPeriodRange,
    extractKeywords,
    getGreeting
  };
  global.ChatReportOverlay = ChatReportOverlay;
})(typeof window !== "undefined" ? window : this);
