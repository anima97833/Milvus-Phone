/**
 * Milvus/home_widget_ui.js
 * 「主屏小组件 2.0」UI 渲染与设置工坊模块
 * - 零 Emoji：全部图标均为手绘细线/实心矢量 SVG
 * - 双层伪元素无裁切容器（.hw-card overflow:visible + .hw-surface 圆角毛玻璃）+ 作用域 CSS 实时注入
 * - 「添加」抽屉每张卡片右上角带手绘倒三角展开自定义 CSS 面板 + 一键复制原本 CSS
 * - 1:1 对齐参考图的柔雾毛玻璃「留声机」播放卡片（专辑封面 + 进度条双时间戳 + 5 键矢量控台 + 真实音频联动）
 */
(function (global) {
  "use strict";

  // ==========================================
  // 1. 定制手绘矢量 SVG 图标库（零 Emoji）
  // ==========================================
  function WidgetSvg(h, name, { size = 18, color = "currentColor", strokeWidth = 1.75, filled = false } = {}) {
    const common = {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block", flexShrink: 0 }
    };
    switch (name) {
      case "clock":
        return h("svg", common,
          h("circle", { cx: 12, cy: 12, r: 9 }),
          h("path", { d: "M12 7v5l3.5 2" })
        );
      case "couple_days":
        return h("svg", common,
          h("path", { d: "M12 20.5s-7.5-4.7-9-9.2C1.9 7.8 4.4 4.5 7.8 4.5c2 0 3.4 1.1 4.2 2.4.8-1.3 2.2-2.4 4.2-2.4 3.4 0 5.9 3.3 4.8 6.8-1.5 4.5-9 9.2-9 9.2z" })
        );
      case "photo":
        return h("svg", common,
          h("rect", { x: 3, y: 4.5, width: 18, height: 15, rx: 2.5 }),
          h("circle", { cx: 8.5, cy: 9.5, r: 1.6 }),
          h("path", { d: "M21 15.5l-5-5-5 5-2.5-2.5L3 18.5" })
        );
      case "char_quote":
        return h("svg", common,
          h("path", { d: "M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4.5 3v-3H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z" }),
          h("path", { d: "M7.5 10h9M7.5 13.5h6" })
        );
      case "music":
        return h("svg", common,
          h("circle", { cx: 12, cy: 12, r: 9 }),
          h("circle", { cx: 12, cy: 12, r: 3 }),
          h("path", { d: "M12 3v3M12 18v3" })
        );
      case "calendar":
        return h("svg", common,
          h("rect", { x: 3.5, y: 5, width: 17, height: 15.5, rx: 2.5 }),
          h("path", { d: "M8 3v4M16 3v4M3.5 10h17" }),
          h("circle", { cx: 8.5, cy: 14.5, r: 0.9, fill: color }),
          h("circle", { cx: 12, cy: 14.5, r: 0.9, fill: color }),
          h("circle", { cx: 15.5, cy: 14.5, r: 0.9, fill: color })
        );
      case "fold_card":
        return h("svg", common,
          h("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          h("path", { d: "M6.5 14Q9.5 8.5 12.5 14T17.5 14" })
        );
      case "chenwei_oracle": // 手绘古风八卦星盘
        return h("svg", common,
          h("polygon", { points: "12,2.5 18.7,5.3 21.5,12 18.7,18.7 12,21.5 5.3,18.7 2.5,12 5.3,5.3" }),
          h("circle", { cx: 12, cy: 12, r: 4.2 }),
          h("path", { d: "M12 7.8a2.1 2.1 0 0 1 0 4.2 2.1 2.1 0 0 0 0 4.2" }),
          h("circle", { cx: 12, cy: 9.9, r: 0.6, fill: color }),
          h("circle", { cx: 12, cy: 14.1, r: 0.6, fill: color })
        );
      case "couple_bills": // 手绘账本卷册
        return h("svg", common,
          h("path", { d: "M5 3.5h14v17l-3.5-2-3.5 2-3.5-2-3.5 2v-17z" }),
          h("path", { d: "M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5" })
        );
      case "couple_wish": // 手绘星愿五芒
        return h("svg", common,
          h("path", { d: "M12 3.2l2.4 5.1 5.6.8-4.1 3.9 1 5.6L12 15.9 7.1 18.6l1-5.6-4.1-3.9 5.6-.8z" })
        );
      case "caret_down": // 倒三角展开符号
        return h("svg", { ...common, stroke: "none", fill: color },
          h("path", { d: "M6.5 9l5.5 6.5L17.5 9z" })
        );
      case "copy":
        return h("svg", common,
          h("rect", { x: 9, y: 9, width: 11, height: 11, rx: 2 }),
          h("path", { d: "M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" })
        );
      case "bookmark":
        return h("svg", common,
          h("path", { d: "M6 4h12a1 1 0 0 1 1 1v16l-7-4.5L5 21V5a1 1 0 0 1 1-1z" })
        );
      case "eye":
        return h("svg", common,
          h("path", { d: "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" }),
          h("circle", { cx: 12, cy: 12, r: 2.8 })
        );
      case "star":
        return h("svg", { ...common, fill: filled ? color : "none", stroke: color, strokeWidth: 1.7 },
          h("path", { d: "M12 3.2l2.6 5.3 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z" })
        );
      case "prev":
        return h("svg", { ...common, stroke: "none", fill: color },
          h("path", { d: "M11.5 6.5L3.5 12l8 5.5v-11zM20.5 6.5L12.5 12l8 5.5v-11z" })
        );
      case "next":
        return h("svg", { ...common, stroke: "none", fill: color },
          h("path", { d: "M3.5 6.5l8 5.5-8 5.5v-11zM12.5 6.5l8 5.5-8 5.5v-11z" })
        );
      case "pause":
        return h("svg", { ...common, stroke: "none", fill: color },
          h("rect", { x: 6, y: 4.5, width: 4.4, height: 15, rx: 1.5 }),
          h("rect", { x: 13.6, y: 4.5, width: 4.4, height: 15, rx: 1.5 })
        );
      case "play":
        return h("svg", { ...common, stroke: "none", fill: color },
          h("path", { d: "M7 4.8l12.2 7.2L7 19.2z" })
        );
      case "airplay": // 参考图右下角同心波纹投屏标
        return h("svg", common,
          h("path", { d: "M6.5 16.5a7.5 7.5 0 1 1 11 0" }),
          h("path", { d: "M9 14a4.2 4.2 0 1 1 6 0" }),
          h("circle", { cx: 12, cy: 11.5, r: 1, fill: color }),
          h("path", { d: "M8.5 20.5h7L12 16l-3.5 4.5z", fill: color, stroke: "none" })
        );
      case "sound_off": // 参考图右上角静音/波纹斜线标
        return h("svg", common,
          h("path", { d: "M5 5l14 14" }),
          h("path", { d: "M10.5 6.5a5.5 5.5 0 0 1 7.2 7.2" }),
          h("path", { d: "M7.8 9.2a5.5 5.5 0 0 0 7.1 7.1" }),
          h("circle", { cx: 12, cy: 12, r: 2 })
        );
      case "sound_on":
        return h("svg", common,
          h("circle", { cx: 12, cy: 12, r: 2.2, fill: color }),
          h("path", { d: "M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" }),
          h("path", { d: "M5.8 5.8a8.8 8.8 0 0 0 0 12.4M18.2 5.8a8.8 8.8 0 0 1 0 12.4" })
        );
      case "plus":
        return h("svg", common, h("path", { d: "M12 5v14M5 12h14" }));
      case "close":
        return h("svg", common, h("path", { d: "M6 6l12 12M18 6L6 18" }));
      case "back":
        return h("svg", common, h("path", { d: "M15 5l-7 7 7 7M8 12h11" }));
      case "trash":
        return h("svg", common,
          h("path", { d: "M4 7h16M9 7V4h6v3M6.5 7l1 12.5A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7" })
        );
      case "upload":
        return h("svg", common,
          h("path", { d: "M12 16V5M7.5 9.5L12 5l4.5 4.5" }),
          h("path", { d: "M4 17.5v1.5A1.5 1.5 0 0 0 5.5 20.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5" })
        );
      default:
        return h("svg", common, h("circle", { cx: 12, cy: 12, r: 6 }));
    }
  }

  function formatMmSs(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  // ==========================================
  // 2. 轻量数据读取工具
  // ==========================================
  async function loadCoupleSummary() {
    let taId = "";
    let taName = "TA";
    let taAvatar = "";
    let days = 1;
    let status = "热恋中";
    try {
      taId = localStorage.getItem("t9_ta_character_id") || "";
      let chars = [];
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        chars = await global.chatCharacterStore.getAll();
      }
      const ta = (chars || []).find((c) => String(c.id) === String(taId)) || (chars || [])[0];
      if (ta) {
        taId = String(ta.id);
        taName = ta.name || "TA";
        if (global.ChenweiAiOracle && typeof global.ChenweiAiOracle.resolveCharAvatarUrl === "function") {
          taAvatar = await global.ChenweiAiOracle.resolveCharAvatarUrl(ta);
        } else if (typeof global.resolveAvatarUrl === "function") {
          taAvatar = await global.resolveAvatarUrl(ta.avatar || ta.avatarId || ta.id, "");
        }
      }
      if (taId && typeof indexedDB !== "undefined") {
        const db = await new Promise((resolve) => {
          const req = indexedDB.open("couple-space-db", 1);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onupgradeneeded = (e) => {
            if (!e.target.result.objectStoreNames.contains("anniversary")) {
              e.target.result.createObjectStore("anniversary", { keyPath: "id" });
            }
          };
        });
        if (db && db.objectStoreNames.contains("anniversary")) {
          const getRec = (k) => new Promise((res) => {
            try {
              const tx = db.transaction("anniversary", "readonly");
              const rq = tx.objectStore("anniversary").get(k);
              rq.onsuccess = () => res(rq.result || null);
              rq.onerror = () => res(null);
            } catch (e) { res(null); }
          });
          const dRec = await getRec(`char_${taId}_days`);
          const sRec = await getRec(`char_${taId}_status`);
          db.close();
          if (dRec && typeof dRec.value === "number") {
            const now = new Date();
            const todayNum = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 864e5);
            const baseDay = typeof dRec.baseDayNum === "number"
              ? dRec.baseDayNum
              : (dRec.updatedAt ? Math.floor(new Date(new Date(dRec.updatedAt).getFullYear(), new Date(dRec.updatedAt).getMonth(), new Date(dRec.updatedAt).getDate()).getTime() / 864e5) : todayNum);
            days = Math.max(1, Math.floor(dRec.value) + Math.max(0, todayNum - baseDay));
          }
          if (sRec && sRec.value) status = sRec.value;
        }
      }
    } catch (e) {}
    return { taId, taName, taAvatar, days, status };
  }

  function loadUnfinishedCalendarTasks(ownerFilter = "__user__") {
    try {
      const raw = localStorage.getItem("cached_calendar_tasks");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed["未竟之事"]) ? parsed["未竟之事"] : [];
      const valid = list.filter((t) => t && t.title);
      if (ownerFilter === "__all__") return valid;
      if (!ownerFilter || ownerFilter === "__user__") {
        return valid.filter((t) => !t.characterId || t.characterId === "me" || t.characterId === "user");
      }
      return valid.filter((t) => String(t.characterId) === String(ownerFilter));
    } catch (e) { return []; }
  }

  async function loadLastCharChatMessage(charId) {
    if (!charId) return "";
    const cid = String(charId);
    let msgs = [];
    try {
      if (global.chatHistoryStore) {
        if (typeof global.chatHistoryStore.getRecentMessages === "function") {
          msgs = await global.chatHistoryStore.getRecentMessages(cid, 30);
        } else if (typeof global.chatHistoryStore.getMessages === "function") {
          const all = await global.chatHistoryStore.getMessages(cid);
          msgs = Array.isArray(all) ? all.slice(-30) : [];
        }
      }
      if (!msgs.length && typeof global.localStorage !== "undefined") {
        const raw = global.localStorage.getItem(`t8_chat_history_${cid}`) || global.localStorage.getItem(`t8_messages_${cid}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) msgs = parsed.slice(-30);
        }
      }
    } catch (e) {}

    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!m) continue;
      if (m.isMe || m.sender === "我" || m.senderId === "me" || m.role === "user") continue;
      const rawTxt = String(m.text || m.content || "")
        .replace(/\[(?:图片|语音|表情|sticker|voice|img)[^\]]*\]/gi, "")
        .trim();
      if (rawTxt) return rawTxt;
    }
    return "";
  }

  // ==========================================
  // 3. 单个多尺寸小组件渲染器（双层伪元素容器 + 作用域 CSS + 重构留声机）
  // ==========================================
  function WidgetCard({ widget, typeCssMap = {}, musicBridge = null, foldCardBridge = null, onQuickAction, onOpenSettings }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const Engine = global.HomeWidgetEngine;
    const Css = global.HomeWidgetCss;
    const skin = Engine.SKIN_PRESETS[widget.skin] || Engine.SKIN_PRESETS.glass;
    const isSquare = widget.size === "2x2";
    const isWide3 = widget.size === "3x1" || widget.size === "4x1";
    const isCompact2x1 = widget.size === "2x1";

    const [now, setNow] = useState(() => new Date());
    const [coupleInfo, setCoupleInfo] = useState(null);
    const [photoUrl, setPhotoUrl] = useState("");
    const [photoUrls, setPhotoUrls] = useState([]);
    const [photoIdx, setPhotoIdx] = useState(0);
    const [charInfo, setCharInfo] = useState({ name: "名士", avatar: "" });
    const [lastChatQuote, setLastChatQuote] = useState("");
    const [calendarTasks, setCalendarTasks] = useState([]);
    const [calendarOwnerName, setCalendarOwnerName] = useState("我的未竟之事");
    const [chenweiData, setChenweiData] = useState(null);
    const [chenweiForm, setChenweiForm] = useState(() => widget.config?.verseForm || "poem");
    const [chenweiExpandedModal, setChenweiExpandedModal] = useState(false);
    const [coupleBillsData, setCoupleBillsData] = useState(null);
    const [coupleBillsMeta, setCoupleBillsMeta] = useState({ charName: "TA", avatar: "" });
    const [billsExpandedModal, setBillsExpandedModal] = useState(false);
    const [billsModalTab, setBillsModalTab] = useState(() => widget.config?.ledgerTab === "user" ? "user" : "ta");
    const [coupleWishData, setCoupleWishData] = useState(null);
    const [coupleWishMeta, setCoupleWishMeta] = useState({ charId: "", charName: "TA", avatar: "" });
    const [wishExpandedModal, setWishExpandedModal] = useState(false);
    const [wishSentTip, setWishSentTip] = useState("");
    const [foldExpandedModal, setFoldExpandedModal] = useState(false);
    const [quoteExpandedModal, setQuoteExpandedModal] = useState(false);
    const photoSwipeRef = React.useRef({ x: 0, moved: false });

    // 将弹窗挂载至 document.body，彻底规避桌面横滑容器 transform 导致的 position:fixed 偏移至锁屏页问题
    const renderInPortal = (node) => {
      if (!node) return null;
      if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && global.document && global.document.body) {
        return global.ReactDOM.createPortal(node, global.document.body);
      }
      return node;
    };

    // 留声机播放态与真实 <audio> 联动状态
    const [musicPlaying, setMusicPlaying] = useState(true);
    const [musicMuted, setMusicMuted] = useState(false);
    const [musicLiked, setMusicLiked] = useState(true);
    const [musicElapsed, setMusicElapsed] = useState(142); // 2:22 默认优雅展示态
    const [musicDuration, setMusicDuration] = useState(308); // 5:08 (-2:46)

    useEffect(() => {
      if (widget.type !== "clock") return;
      const t = setInterval(() => setNow(new Date()), 15000);
      return () => clearInterval(t);
    }, [widget.type]);

    useEffect(() => {
      if (widget.type !== "music") return;
      const syncAudio = () => {
        const audio = global.document ? global.document.querySelector("audio") : null;
        if (audio && audio.src && !isNaN(audio.duration) && audio.duration > 0) {
          setMusicPlaying(!audio.paused);
          setMusicMuted(!!audio.muted);
          setMusicElapsed(audio.currentTime || 0);
          setMusicDuration(audio.duration);
        }
      };
      syncAudio();
      const t = setInterval(syncAudio, 700);
      return () => clearInterval(t);
    }, [widget.type]);

    const photoMediaIdsKey = widget.type === "photo"
      ? JSON.stringify(
          Array.isArray(widget.config?.mediaIds) && widget.config.mediaIds.length
            ? widget.config.mediaIds
            : (widget.config?.mediaId ? [widget.config.mediaId] : [])
        )
      : "";

    useEffect(() => {
      let alive = true;
      if (widget.type === "couple_days") {
        loadCoupleSummary().then((res) => { if (alive) setCoupleInfo(res); });
      } else if (widget.type === "photo") {
        const ids = photoMediaIdsKey ? JSON.parse(photoMediaIdsKey) : [];
        if (!ids.length) {
          setPhotoUrls([]);
          setPhotoUrl("");
        } else {
          Promise.all(ids.map((id) => Engine.loadWidgetMedia(id))).then((urls) => {
            if (!alive) return;
            const valid = urls.filter(Boolean);
            setPhotoUrls(valid);
            setPhotoUrl(valid[0] || "");
            setPhotoIdx((prev) => (valid.length ? prev % valid.length : 0));
          });
        }
      } else if (widget.type === "music" && widget.config?.mediaId) {
        Engine.loadWidgetMedia(widget.config.mediaId).then((url) => { if (alive) setPhotoUrl(url || ""); });
      } else if (widget.type === "char_quote") {
        (async () => {
          try {
            const list = global.chatCharacterStore ? await global.chatCharacterStore.getAll() : [];
            const hit = (list || []).find((c) => String(c.id) === String(widget.config?.charId)) || (list || [])[0];
            if (hit && alive) {
              let av = "";
              if (global.ChenweiAiOracle) av = await global.ChenweiAiOracle.resolveCharAvatarUrl(hit);
              if (alive) setCharInfo({ name: hit.name || "名士", avatar: av });
              if (widget.config?.sourceMode === "last_chat") {
                const lastTxt = await loadLastCharChatMessage(hit.id);
                if (alive) setLastChatQuote(lastTxt);
              }
            }
          } catch (e) {}
        })();
      } else if (widget.type === "calendar") {
        const owner = widget.config?.ownerFilter || "__user__";
        setCalendarTasks(loadUnfinishedCalendarTasks(owner));
        if (owner === "__user__") setCalendarOwnerName("我的未竟之事");
        else if (owner === "__all__") setCalendarOwnerName("全部未竟之事");
        else {
          (async () => {
            try {
              const list = global.chatCharacterStore ? await global.chatCharacterStore.getAll() : [];
              const hit = (list || []).find((c) => String(c.id) === String(owner));
              if (alive) setCalendarOwnerName(hit ? `${hit.name} · 未竟之事` : "未竟之事");
            } catch (e) {}
          })();
        }
      }
      return () => { alive = false; };
    }, [widget.type, widget.config?.mediaId, photoMediaIdsKey, widget.config?.charId, widget.config?.sourceMode, widget.config?.ownerFilter]);

    // 实时监听日历任务更新事件
    useEffect(() => {
      if (widget.type !== "calendar") return;
      const owner = widget.config?.ownerFilter || "__user__";
      const refresh = () => setCalendarTasks(loadUnfinishedCalendarTasks(owner));
      global.addEventListener("calendar_tasks_updated", refresh);
      return () => global.removeEventListener("calendar_tasks_updated", refresh);
    }, [widget.type, widget.config?.ownerFilter]);

    // 谶纬签匣数据加载与实时更新监听（支持我的历史签 & 名士专属签）
    useEffect(() => {
      if (widget.type !== "chenwei_oracle") return;
      setChenweiForm(widget.config?.verseForm || "poem");
      let alive = true;
      const loadChenwei = async () => {
        const Oracle = global.ChenweiAiOracle;
        if (!Oracle) return;
        const mode = widget.config?.sourceMode === "char_prophecy" ? "char_prophecy" : "my_oracle";
        try {
          if (mode === "char_prophecy") {
            const allProps = Oracle.loadAllCharProphecies ? await Oracle.loadAllCharProphecies() : {};
            const targetCid = String(widget.config?.charId || "");
            const hit = (targetCid && allProps[targetCid]) || Object.values(allProps)[0] || null;
            if (!hit) {
              if (alive) setChenweiData(null);
              return;
            }
            let av = "";
            try {
              const chars = Oracle.loadAllCharacters ? await Oracle.loadAllCharacters() : [];
              const cObj = chars.find((c) => String(c.id) === String(hit.charId));
              if (cObj && Oracle.resolveCharAvatarUrl) av = await Oracle.resolveCharAvatarUrl(cObj);
            } catch (e) {}
            const fb = Oracle.buildOfflineTriVerses ? Oracle.buildOfflineTriVerses(hit.analysis || {}, hit.question || "") : {};
            const v = hit.verses && typeof hit.verses === "object" ? hit.verses : {};
            if (alive) {
              setChenweiData({
                mode: "char_prophecy",
                ownerLabel: `${hit.charName || "名士"}的谶纬`,
                avatar: av,
                hexagram: hit.hexagram || "紫微照命",
                buildTitle: hit.buildTitle || "",
                question: hit.question || "",
                verses: {
                  poem: v.poem || hit.oracleVerse || fb.poem || "",
                  ballad: v.ballad || fb.ballad || "",
                  chenyu: v.chenyu || fb.chenyu || ""
                },
                chenyuGloss: hit.chenyuGloss || fb.chenyuGloss || "",
                note: hit.charNote || ""
              });
            }
          } else {
            const recs = Oracle.loadOracleRecords ? await Oracle.loadOracleRecords(30) : [];
            const targetId = String(widget.config?.recordId || "");
            const hit = (targetId && recs.find((r) => String(r.id) === targetId)) || recs[0] || null;
            if (!hit) {
              if (alive) setChenweiData(null);
              return;
            }
            const fb = Oracle.buildOfflineTriVerses ? Oracle.buildOfflineTriVerses(hit.analysis || {}, hit.question || "") : {};
            const v = hit.verses && typeof hit.verses === "object" ? hit.verses : {};
            if (alive) {
              setChenweiData({
                mode: "my_oracle",
                ownerLabel: "我的卦签",
                avatar: "",
                hexagram: hit.hexagram || "谶纬卦签",
                buildTitle: "",
                question: hit.question || "",
                verses: {
                  poem: v.poem || hit.oracleVerse || fb.poem || "",
                  ballad: v.ballad || fb.ballad || "",
                  chenyu: v.chenyu || fb.chenyu || ""
                },
                chenyuGloss: hit.chenyuGloss || fb.chenyuGloss || "",
                note: hit.advice || hit.structureReading || ""
              });
            }
          }
        } catch (e) {}
      };
      loadChenwei();
      global.addEventListener("chenwei_oracle_updated", loadChenwei);
      return () => {
        alive = false;
        global.removeEventListener("chenwei_oracle_updated", loadChenwei);
      };
    }, [widget.type, widget.config?.sourceMode, widget.config?.recordId, widget.config?.charId, widget.config?.verseForm]);

    // 共同账本数据加载与实时刷新监听（桌面严格截取最新 5 条，详览保留全量）
    useEffect(() => {
      if (widget.type !== "couple_bills") return;
      let alive = true;
      const ledgerTab = widget.config?.ledgerTab || "ta";
      setBillsModalTab(ledgerTab === "user" ? "user" : "ta");
      const refreshBills = async () => {
        const Helper = global.CoupleBillDataHelper;
        if (!Helper) return;
        const data = Helper.loadBillsForWidget({
          charId: widget.config?.charId || "",
          ledgerTab,
          limit: 5
        });
        if (!alive) return;
        setCoupleBillsData(data);
        if (data.charId) {
          try {
            const list = global.chatCharacterStore ? await global.chatCharacterStore.getAll() : [];
            const hit = (list || []).find((c) => String(c.id) === String(data.charId));
            if (hit && alive) {
              let av = "";
              if (global.ChenweiAiOracle && global.ChenweiAiOracle.resolveCharAvatarUrl) {
                av = await global.ChenweiAiOracle.resolveCharAvatarUrl(hit);
              }
              if (alive) setCoupleBillsMeta({ charName: hit.name || "TA", avatar: av });
            }
          } catch (e) {}
        }
      };
      refreshBills();
      global.addEventListener("couple_bills_updated", refreshBills);
      return () => {
        alive = false;
        global.removeEventListener("couple_bills_updated", refreshBills);
      };
    }, [widget.type, widget.config?.charId, widget.config?.ledgerTab]);

    // 心愿签数据加载与实时刷新监听（只取最新 1 条愿望，优先未实现）
    useEffect(() => {
      if (widget.type !== "couple_wish") return;
      let alive = true;
      const refreshWish = async () => {
        const Bridge = global.CoupleWishBridge;
        if (!Bridge) return;
        const data = Bridge.loadLatestWishForWidget({
          charId: widget.config?.charId || "",
          creatorFilter: widget.config?.creatorFilter || "all"
        });
        if (!alive) return;
        setCoupleWishData(data);
        if (data.charId) {
          try {
            const list = global.chatCharacterStore ? await global.chatCharacterStore.getAll() : [];
            const hit = (list || []).find((c) => String(c.id) === String(data.charId));
            if (hit && alive) {
              let av = "";
              if (global.ChenweiAiOracle && global.ChenweiAiOracle.resolveCharAvatarUrl) {
                av = await global.ChenweiAiOracle.resolveCharAvatarUrl(hit);
              }
              if (alive) setCoupleWishMeta({ charId: String(hit.id), charName: hit.name || "TA", avatar: av });
            }
          } catch (e) {}
        }
      };
      refreshWish();
      global.addEventListener("couple_wishlist_updated", refreshWish);
      return () => {
        alive = false;
        global.removeEventListener("couple_wishlist_updated", refreshWish);
      };
    }, [widget.type, widget.config?.charId, widget.config?.creatorFilter]);

    // 相册多图自动轮播定时器（页面后台自动暂停）
    useEffect(() => {
      if (widget.type !== "photo" || photoUrls.length <= 1) return;
      const intervalSec = widget.config?.intervalSec !== undefined ? Number(widget.config.intervalSec) : 5;
      if (!intervalSec || intervalSec <= 0) return;
      const timer = setInterval(() => {
        if (global.document && global.document.hidden) return;
        setPhotoIdx((prev) => (prev + 1) % photoUrls.length);
      }, intervalSec * 1000);
      return () => clearInterval(timer);
    }, [widget.type, photoUrls.length, widget.config?.intervalSec]);

    // 合并自定义 CSS（实例级优先，否则回落到「添加」抽屉里保存的类型级 CSS）
    const rawCss = (widget.customCss && widget.customCss.trim())
      ? widget.customCss
      : (typeCssMap[widget.type] || "");
    const scopedCss = Css && rawCss ? Css.scopeWidgetCss(rawCss, widget.id) : "";

    const surfaceBaseStyle = {
      width: "100%",
      height: "100%",
      borderRadius: widget.type === "music" ? "22px" : "20px",
      background: widget.type === "music" && widget.skin === "glass" ? "rgba(248, 248, 250, 0.86)" : skin.bg,
      border: widget.type === "music" && widget.skin === "glass" ? "1px solid rgba(255, 255, 255, 0.82)" : `1px solid ${skin.border}`,
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      boxShadow: "0 8px 22px rgba(32, 36, 42, 0.08)",
      color: widget.type === "music" && widget.skin === "glass" ? "#1F2329" : skin.text,
      padding: widget.type === "photo" && photoUrl && !widget.config?.caption
        ? "0"
        : widget.type === "music"
        ? (isSquare ? "12px 13px 10px" : isWide3 ? "7px 11px 6px" : "8px 10px")
        : (isSquare ? "13px" : "10px 12px"),
      boxSizing: "border-box",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between"
    };

    const handleTap = (e) => {
      e.stopPropagation();
      if (widget.type === "couple_days" && onQuickAction) return onQuickAction("couple");
      if (widget.type === "calendar" && onQuickAction) return onQuickAction("calendar");
      if (onOpenSettings) onOpenSettings(widget.id);
    };

    // 包裹器：外层 .hw-card 保持 overflow: visible，确保 ::before / ::after 贴纸自由探出！
    const wrapCard = (innerChildren, customTap = handleTap) =>
      h(
        "div",
        {
          className: `hw-card hw-type-${widget.type} hw-size-${widget.size}`,
          "data-hw-id": widget.id,
          "data-hw-type": widget.type,
          style: {
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "visible",
            cursor: "pointer",
            userSelect: "none"
          },
          onClick: customTap,
          onPointerDown: (e) => e.stopPropagation()
        },
        scopedCss && h("style", null, scopedCss),
        h("div", { className: "hw-surface", style: surfaceBaseStyle }, innerChildren)
      );

    // 1. 留声机控台（实时同步音乐播放器曲目/进度/上下曲/收藏，支持自定义封面存 IDB）
    if (widget.type === "music") {
      const liveSong = musicBridge && musicBridge.currentSong && musicBridge.hasRealSong ? musicBridge.currentSong : null;
      const titleText = (liveSong && (liveSong.title || liveSong.name))
        || String(widget.config?.title || "").trim()
        || "暂未播放曲目";
      const artistText = (liveSong && (liveSong.artist || liveSong.singer))
        || String(widget.config?.artist || "").trim()
        || (liveSong ? "留声机播放中" : "点击打开音乐播放器");
      const effectivePlaying = musicBridge && musicBridge.hasRealSong ? !!musicBridge.isPlaying : musicPlaying;
      const effectiveLiked = liveSong && typeof liveSong.isFav === "boolean" ? liveSong.isFav : musicLiked;
      const effectiveElapsed = musicBridge && musicBridge.hasRealSong && typeof musicBridge.currentTime === "number"
        ? musicBridge.currentTime
        : musicElapsed;
      const effectiveDuration = musicBridge && musicBridge.hasRealSong && musicBridge.duration > 0
        ? musicBridge.duration
        : musicDuration;
      const pct = Math.max(0, Math.min(100, effectiveDuration > 0 ? (effectiveElapsed / effectiveDuration) * 100 : 0));
      const remaining = Math.max(0, effectiveDuration - effectiveElapsed);
      const isDarkSkin = widget.skin === "ink";
      const primaryCol = isDarkSkin ? "#F6F3EC" : "#1F2329";
      const mutedCol = isDarkSkin ? "#A6ADB6" : "#8E929B";
      const trackCol = isDarkSkin ? "rgba(255,255,255,0.2)" : "rgba(140, 145, 155, 0.24)";
      const fillCol = isDarkSkin ? "#E3B86A" : "#7A7E86";

      const togglePlay = (e) => {
        e.stopPropagation();
        if (musicBridge && typeof musicBridge.onTogglePlay === "function") {
          musicBridge.onTogglePlay();
          return;
        }
        const audio = global.document ? global.document.querySelector("audio") : null;
        if (audio && audio.src) {
          if (audio.paused) audio.play().catch(() => {});
          else audio.pause();
          setMusicPlaying(!audio.paused);
        } else {
          setMusicPlaying((v) => !v);
        }
      };

      const handlePrev = (e) => {
        e.stopPropagation();
        if (musicBridge && typeof musicBridge.onPrev === "function") musicBridge.onPrev();
        else if (onQuickAction) onQuickAction("music");
      };

      const handleNext = (e) => {
        e.stopPropagation();
        if (musicBridge && typeof musicBridge.onNext === "function") musicBridge.onNext();
        else if (onQuickAction) onQuickAction("music");
      };

      const handleFav = (e) => {
        e.stopPropagation();
        if (musicBridge && typeof musicBridge.onToggleFav === "function" && liveSong) {
          musicBridge.onToggleFav();
        } else {
          setMusicLiked((v) => !v);
        }
      };

      const toggleMute = (e) => {
        e.stopPropagation();
        if (musicBridge && typeof musicBridge.onToggleMute === "function") {
          const nextMuted = musicBridge.onToggleMute();
          setMusicMuted(!!nextMuted);
          return;
        }
        const audio = global.document ? global.document.querySelector("audio") : null;
        if (audio && audio.src) {
          audio.muted = !audio.muted;
          setMusicMuted(audio.muted);
        } else {
          setMusicMuted((v) => !v);
        }
      };

      const openMusicApp = (e) => {
        e.stopPropagation();
        if (onQuickAction) onQuickAction("music");
      };

      const effectivePlayMode = (musicBridge && musicBridge.playMode) || "loop";
      const handleCycleMode = (e) => {
        e.stopPropagation();
        if (musicBridge && typeof musicBridge.onCyclePlayMode === "function") {
          musicBridge.onCyclePlayMode();
        } else if (onQuickAction) {
          onQuickAction("music");
        }
      };
      const modeColor = effectivePlayMode === "single" ? "#C84B31" : (effectivePlayMode === "shuffle" ? primaryCol : mutedCol);
      const modeLabel = global.MusicIconsSvg ? global.MusicIconsSvg.getPlayModeLabel(effectivePlayMode) : "循环模式";
      const renderModeSvg = (sz) => (
        global.MusicIconsSvg
          ? global.MusicIconsSvg.renderPlayModeIcon(h, effectivePlayMode, { size: sz, color: modeColor })
          : WidgetSvg(h, "airplay", { size: sz, color: modeColor })
      );

      // 封面优先级：用户在 IndexedDB 自定义上传的封面 > 歌曲自带封面 > 浅灰水墨山影极简矢量封面
      const effectiveCoverUrl = photoUrl || (liveSong && (liveSong.cover || liveSong.pic || liveSong.albumCover)) || "";
      const coverBox = effectiveCoverUrl
        ? h("img", {
            className: "hw-music-cover",
            src: effectiveCoverUrl,
            alt: titleText,
            style: {
              width: isSquare ? "44px" : "34px",
              height: isSquare ? "44px" : "34px",
              borderRadius: "10px",
              objectFit: "cover",
              flexShrink: 0,
              boxShadow: "0 3px 8px rgba(0,0,0,0.08)"
            }
          })
        : h(
            "div",
            {
              className: "hw-music-cover",
              style: {
                width: isSquare ? "44px" : "34px",
                height: isSquare ? "44px" : "34px",
                borderRadius: "10px",
                background: isDarkSkin ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #ECEEF2 0%, #DFE3E8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "inset 0 1px 2px rgba(255,255,255,0.8)"
              }
            },
            h("svg", { width: isSquare ? 28 : 22, height: isSquare ? 28 : 22, viewBox: "0 0 32 32", fill: "none" },
              h("path", { d: "M4 24l8-11 5.5 6.5L22 14l6 10H4z", fill: isDarkSkin ? "rgba(255,255,255,0.28)" : "rgba(155,162,172,0.45)" }),
              h("circle", { cx: 21, cy: 9, r: 2.5, fill: isDarkSkin ? "rgba(255,255,255,0.35)" : "rgba(155,162,172,0.38)" })
            )
          );

      // 2×1 紧凑横双格版
      if (isCompact2x1) {
        return wrapCard(
          h(React.Fragment, null,
            h("div", { className: "hw-music-top", style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 } },
              coverBox,
              h("div", { style: { flex: 1, minWidth: 0 } },
                h("div", { className: "hw-music-title", style: { fontSize: "12.5px", fontWeight: 800, color: primaryCol, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, titleText),
                h("div", { className: "hw-music-artist", style: { fontSize: "10.5px", color: mutedCol, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, artistText)
              ),
              h("button", { type: "button", title: modeLabel, onClick: handleCycleMode, style: { border: "none", background: "transparent", padding: "3px", cursor: "pointer" } },
                renderModeSvg(14)
              ),
              h("button", { type: "button", onClick: togglePlay, style: { border: "none", background: "transparent", padding: "3px", cursor: "pointer", color: primaryCol } },
                WidgetSvg(h, effectivePlaying ? "pause" : "play", { size: 17, color: primaryCol })
              )
            ),
            h("div", { className: "hw-music-bar-track", style: { width: "100%", height: "3.5px", borderRadius: "999px", background: trackCol, overflow: "hidden" } },
              h("div", { className: "hw-music-bar-fill", style: { width: `${pct}%`, height: "100%", borderRadius: "999px", background: fillCol } })
            )
          ),
          openMusicApp
        );
      }

      // 3×1 / 4×1 / 2×2：完整 1:1 三段式参考图排版
      return wrapCard(
        h(React.Fragment, null,
          h("div", { className: "hw-music-top", style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "9px", minWidth: 0 } },
            h("div", { style: { display: "flex", alignItems: "center", gap: "9px", minWidth: 0, flex: 1 }, onClick: openMusicApp },
              coverBox,
              h("div", { style: { minWidth: 0, flex: 1 } },
                h("div", { className: "hw-music-title", style: { fontSize: isSquare ? "14.5px" : "12.5px", fontWeight: 800, color: primaryCol, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, titleText),
                h("div", { className: "hw-music-artist", style: { fontSize: isSquare ? "12px" : "10.5px", color: mutedCol, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, artistText)
              )
            ),
            h("button", { type: "button", className: "hw-music-mute", onClick: toggleMute, style: { border: "none", background: "transparent", padding: "2px", cursor: "pointer", opacity: 0.72 } },
              WidgetSvg(h, musicMuted ? "sound_off" : "sound_on", { size: isSquare ? 19 : 16, color: mutedCol })
            )
          ),

          h("div", { className: "hw-music-progress", style: { display: "flex", alignItems: "center", gap: "7px", margin: isSquare ? "6px 0" : "2px 0" } },
            h("span", { style: { fontSize: isSquare ? "10px" : "9px", color: mutedCol, fontVariantNumeric: "tabular-nums", flexShrink: 0 } }, formatMmSs(effectiveElapsed)),
            h("div", { className: "hw-music-bar-track", style: { flex: 1, height: isSquare ? "5px" : "4px", borderRadius: "999px", background: trackCol, overflow: "hidden" } },
              h("div", { className: "hw-music-bar-fill", style: { width: `${pct}%`, height: "100%", borderRadius: "999px", background: fillCol } })
            ),
            h("span", { style: { fontSize: isSquare ? "10px" : "9px", color: mutedCol, fontVariantNumeric: "tabular-nums", flexShrink: 0 } }, `-${formatMmSs(remaining)}`)
          ),

          h("div", { className: "hw-music-controls", style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: isSquare ? "2px 2px 0" : "0 2px" } },
            h("button", { type: "button", onClick: handleFav, style: { border: "none", background: "transparent", padding: "2px", cursor: "pointer" } },
              WidgetSvg(h, "star", { size: isSquare ? 18 : 14, color: effectiveLiked ? fillCol : mutedCol, filled: effectiveLiked })
            ),
            h("button", { type: "button", onClick: handlePrev, style: { border: "none", background: "transparent", padding: "2px", cursor: "pointer" } },
              WidgetSvg(h, "prev", { size: isSquare ? 20 : 15, color: primaryCol })
            ),
            h("button", { type: "button", onClick: togglePlay, style: { border: "none", background: "transparent", padding: "2px", cursor: "pointer" } },
              WidgetSvg(h, effectivePlaying ? "pause" : "play", { size: isSquare ? 24 : 18, color: primaryCol })
            ),
            h("button", { type: "button", onClick: handleNext, style: { border: "none", background: "transparent", padding: "2px", cursor: "pointer" } },
              WidgetSvg(h, "next", { size: isSquare ? 20 : 15, color: primaryCol })
            ),
            h("button", {
              type: "button",
              title: modeLabel,
              onClick: handleCycleMode,
              style: {
                border: "none",
                background: effectivePlayMode === "single" ? "rgba(200, 75, 49, 0.12)" : "transparent",
                borderRadius: "999px",
                padding: "3px",
                cursor: "pointer"
              }
            },
              renderModeSvg(isSquare ? 18 : 14)
            )
          )
        ),
        openMusicApp
      );
    }

    // 1.5 折叠式卡片小组件（支持点击展开天气叮嘱浮窗 & 自定义装扮设置）
    if (widget.type === "fold_card") {
      const wa = foldCardBridge && foldCardBridge.weatherAdvice;
      const cfg = (foldCardBridge && foldCardBridge.foldCardConfig) || {};
      const tNow = (foldCardBridge && foldCardBridge.time) || now;
      const subStr = wa && wa.characterName
        ? `${wa.characterName}的天气提醒 · ${wa.temp !== undefined ? `${wa.temp}°C` : `${tNow.getMonth() + 1}月${tNow.getDate()}日`}`
        : `天气提醒 · ${tNow.getMonth() + 1}月${tNow.getDate()}日`;
      const suggestions = wa && Array.isArray(wa.suggestions) ? wa.suggestions : [];

      return h(
        React.Fragment,
        null,
        wrapCard(
          h("div", { style: { display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", gap: "4px" } },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" } },
              h("div", { style: { minWidth: 0, flex: 1 } },
                h("div", { className: "hw-fold-title", style: { fontSize: isSquare ? "15px" : "13.5px", fontWeight: 800, color: cfg.titleColor || skin.text } }, "折叠式卡片"),
                h("div", { className: "hw-fold-sub", style: { fontSize: "11px", color: cfg.subtitleColor || skin.subText, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, subStr)
              ),
              h("svg", { width: "42", height: "24", viewBox: "0 0 100 60", style: { flexShrink: 0 } },
                h("path", { d: "M15,40 Q38,10 60,40 T90,40", fill: "none", stroke: cfg.iconColor || skin.accent, strokeWidth: "3.5", strokeLinecap: "round" }),
                h("circle", { cx: "42", cy: "35", r: "2.5", fill: cfg.iconColor || skin.accent }),
                h("circle", { cx: "65", cy: "35", r: "2.5", fill: cfg.iconColor || skin.accent })
              )
            ),
            isSquare && (suggestions.length > 0
              ? h("div", { style: { fontSize: "11px", lineHeight: 1.5, color: skin.text, borderTop: `1px dashed ${skin.border}`, paddingTop: "6px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } }, suggestions[0])
              : h("div", { style: { fontSize: "11px", color: skin.subText, borderTop: `1px dashed ${skin.border}`, paddingTop: "6px" } }, "点击展开名士天气叮嘱"))
          ),
          (e) => { e.stopPropagation(); setFoldExpandedModal(true); }
        ),
        foldExpandedModal &&
          renderInPortal(
            h(
              "div",
              {
                onClick: (e) => { e.stopPropagation(); if (e.target === e.currentTarget) setFoldExpandedModal(false); },
                onPointerDown: (e) => e.stopPropagation(),
                style: { position: "fixed", inset: 0, zIndex: 99994, background: "rgba(30,34,28,0.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }
              },
              h(
                "div",
                { style: { width: "100%", maxWidth: "320px", background: "#FAF8F3", borderRadius: "20px", padding: "16px", border: "1px solid #E2DDD0", boxShadow: "0 14px 36px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", gap: "10px", color: "#3A4233" } },
                h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                  h("div", null,
                    h("div", { style: { fontSize: "15px", fontWeight: 800 } }, "折叠式卡片"),
                    h("div", { style: { fontSize: "11.5px", color: "#7A826E", marginTop: "2px" } }, subStr)
                  ),
                  h("button", { type: "button", onClick: () => setFoldExpandedModal(false), style: { border: "none", background: "#EFECE4", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } }, WidgetSvg(h, "close", { size: 15, color: "#5A6252" }))
                ),
                suggestions.length > 0
                  ? h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px", lineHeight: 1.6, background: "#FFFFFF", padding: "10px 12px", borderRadius: "12px" } },
                      suggestions.map((s, idx) => h("div", { key: idx }, `• ${s}`)),
                      wa.characterName && h("div", { style: { textAlign: "right", fontSize: "11px", color: "#8A927A", marginTop: "4px" } }, `—— 来自 ${wa.characterName} 的关照`)
                    )
                  : h("div", { style: { fontSize: "12px", color: "#8A927A", textAlign: "center", padding: "12px 0", background: "#FFFFFF", borderRadius: "12px" } }, "暂无角色天气叮嘱，可进入「天气」选择名士获取"),
                foldCardBridge && foldCardBridge.onOpenFoldSettings &&
                  h("button", {
                    type: "button",
                    onClick: () => { setFoldExpandedModal(false); foldCardBridge.onOpenFoldSettings(); },
                    style: { border: "none", borderRadius: "10px", background: "#6D735B", color: "#FFF", padding: "9px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }
                  }, "卡片装扮设置")
              )
            )
          )
      );
    }

    // 2. 时辰节气钟
    if (widget.type === "clock") {
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const sc = Engine.getChineseShichen(now);
      const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
      const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 周${week}`;
      return wrapCard(
        h(React.Fragment, null,
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", { className: "hw-clock-shichen", style: { fontSize: "10.5px", fontWeight: 700, color: skin.accent, letterSpacing: "0.5px" } }, `${sc.name} · ${sc.alias}`),
            WidgetSvg(h, "clock", { size: 14, color: skin.accent })
          ),
          h("div", { className: "hw-clock-time", style: { fontSize: isSquare ? "34px" : isWide3 ? "28px" : "24px", fontWeight: 800, letterSpacing: "1px", lineHeight: 1.05 } }, `${hh}:${mm}`),
          h("div", { style: { fontSize: "11px", color: skin.subText, display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h("span", null, dateStr),
            isSquare && h("span", { style: { fontSize: "10px", opacity: 0.75 } }, "安时顺意")
          )
        )
      );
    }

    // 3. 情侣纪念日
    if (widget.type === "couple_days") {
      const info = coupleInfo || { taName: "TA", taAvatar: "", days: 1, status: "热恋中" };
      return wrapCard(
        h(React.Fragment, null,
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" } },
            h("div", { style: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 } },
              info.taAvatar
                ? h("img", { src: info.taAvatar, alt: info.taName, style: { width: isSquare ? "30px" : "22px", height: isSquare ? "30px" : "22px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                : h("div", { style: { width: isSquare ? "30px" : "22px", height: isSquare ? "30px" : "22px", borderRadius: "50%", background: skin.accent, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 800, flexShrink: 0 } }, info.taName.slice(0, 1)),
              h("span", { style: { fontSize: "11.5px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, info.taName)
            ),
            WidgetSvg(h, "couple_days", { size: 14, color: "#D6724B" })
          ),
          h("div", { style: { display: "flex", alignItems: "baseline", gap: "4px", marginTop: isSquare ? "6px" : "0" } },
            h("span", { style: { fontSize: "11px", color: skin.subText } }, "相伴第"),
            h("span", { className: "hw-couple-days-num", style: { fontSize: isSquare ? "34px" : "24px", fontWeight: 900, color: "#D6724B", lineHeight: 1 } }, String(info.days)),
            h("span", { style: { fontSize: "11px", color: skin.subText } }, "天")
          ),
          isSquare && h("div", { style: { fontSize: "11px", color: skin.subText, borderTop: `1px dashed ${skin.border}`, paddingTop: "6px" } }, `状态 · ${info.status}`)
        )
      );
    }

    // 4. 自由相册（支持多图平滑横移 Slide / 柔焦淡入 Fade + 卡片内左右轻滑切图）
    if (widget.type === "photo") {
      const cap = String(widget.config?.caption || "").trim();
      const transitionMode = widget.config?.transition === "fade" ? "fade" : "slide";
      const safeIdx = photoUrls.length ? photoIdx % photoUrls.length : 0;

      const onPhotoPointerDown = (e) => {
        e.stopPropagation();
        photoSwipeRef.current = { x: e.clientX, moved: false };
      };
      const onPhotoPointerUp = (e) => {
        e.stopPropagation();
        if (photoUrls.length <= 1) return;
        const dx = e.clientX - photoSwipeRef.current.x;
        if (Math.abs(dx) > 22) {
          photoSwipeRef.current.moved = true;
          if (dx < 0) setPhotoIdx((prev) => (prev + 1) % photoUrls.length);
          else setPhotoIdx((prev) => (prev - 1 + photoUrls.length) % photoUrls.length);
        }
      };
      const onPhotoClick = (e) => {
        e.stopPropagation();
        if (photoSwipeRef.current.moved) {
          photoSwipeRef.current.moved = false;
          return;
        }
        if (photoUrls.length > 1) {
          setPhotoIdx((prev) => (prev + 1) % photoUrls.length);
          return;
        }
        if (onOpenSettings) onOpenSettings(widget.id);
      };

      return wrapCard(
        photoUrls.length > 0
          ? h(
              "div",
              {
                onPointerDown: onPhotoPointerDown,
                onPointerUp: onPhotoPointerUp,
                style: { position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }
              },
              h(
                "div",
                {
                  style: {
                    position: "relative",
                    width: "100%",
                    height: cap ? "calc(100% - 22px)" : "100%",
                    overflow: "hidden",
                    borderRadius: cap ? "12px" : "0"
                  }
                },
                transitionMode === "fade"
                  ? photoUrls.map((u, i) =>
                      h("img", {
                        key: i,
                        className: "hw-photo-img",
                        src: u,
                        alt: cap || "相框",
                        style: {
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          opacity: i === safeIdx ? 1 : 0,
                          transition: "opacity 0.65s ease",
                          pointerEvents: "none"
                        }
                      })
                    )
                  : h(
                      "div",
                      {
                        className: "hw-photo-track",
                        style: {
                          display: "flex",
                          width: "100%",
                          height: "100%",
                          transform: `translate3d(-${safeIdx * 100}%, 0, 0)`,
                          transition: "transform 0.58s cubic-bezier(0.22, 1, 0.36, 1)"
                        }
                      },
                      photoUrls.map((u, i) =>
                        h("img", {
                          key: i,
                          className: "hw-photo-img",
                          src: u,
                          alt: cap || "相框",
                          style: { width: "100%", height: "100%", flexShrink: 0, objectFit: "cover", display: "block", pointerEvents: "none" }
                        })
                      )
                    ),
                // 多图微距圆点指示器
                photoUrls.length > 1 &&
                  h(
                    "div",
                    {
                      className: "hw-photo-dots",
                      style: {
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: "6px",
                        display: "flex",
                        justifyContent: "center",
                        gap: "4px",
                        pointerEvents: "none"
                      }
                    },
                    photoUrls.map((_, i) =>
                      h("span", {
                        key: i,
                        style: {
                          width: i === safeIdx ? "12px" : "4.5px",
                          height: "4.5px",
                          borderRadius: "999px",
                          background: i === safeIdx ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.48)",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                          transition: "width 0.25s ease"
                        }
                      })
                    )
                  )
              ),
              cap && h("div", { className: "hw-photo-caption", style: { fontSize: "10.5px", color: skin.subText, textAlign: "center", paddingTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, cap)
            )
          : h("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", color: skin.subText } },
              WidgetSvg(h, "photo", { size: isSquare ? 28 : 20, color: skin.accent }),
              h("span", { style: { fontSize: "11px", fontWeight: 600 } }, "点此上传照片")
            ),
        onPhotoClick
      );
    }

    // 5. 名士语录签（支持手写语录 / 自动同步传讯末句；2×2 自动居中 / 2×1 长句防遮挡 / 支持 • 黑点）
    if (widget.type === "char_quote") {
      const isLastChatMode = widget.config?.sourceMode === "last_chat";
      const rawQuote = isLastChatMode
        ? (lastChatQuote || "（传讯中尚无最新话语）")
        : (String(widget.config?.quote || "").trim() || "山河远阔，今日也要记得按时歇息。");
      const lines = rawQuote.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const parsedLines = lines.map((line) => {
        const m = line.match(/^(?:[•·●\u25AA]|[-*])\s*(.+)$/);
        return m ? { bullet: true, text: m[1] } : { bullet: false, text: line };
      });
      const hasBullets = parsedLines.some((l) => l.bullet);
      const isSingleShort = parsedLines.length === 1 && !hasBullets;
      const alignPref = widget.config?.align || "auto";
      const shouldCenter = alignPref === "center" || (alignPref === "auto" && isSingleShort);
      const isLongFor2x1 = isCompact2x1 && (rawQuote.length > 16 || parsedLines.length > 1);

      return h(
        React.Fragment,
        null,
        wrapCard(
          h("div", { style: { display: "flex", flexDirection: "column", height: "100%", gap: isCompact2x1 ? "3px" : "6px", minHeight: 0 } },
            h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexShrink: 0 } },
              h("div", { style: { display: "flex", alignItems: "center", gap: "5px", minWidth: 0 } },
                charInfo.avatar
                  ? h("img", { src: charInfo.avatar, alt: charInfo.name, style: { width: isCompact2x1 ? "18px" : "22px", height: isCompact2x1 ? "18px" : "22px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                  : h("div", { style: { width: isCompact2x1 ? "18px" : "22px", height: isCompact2x1 ? "18px" : "22px", borderRadius: "50%", background: skin.accent, color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9.5px", fontWeight: 800, flexShrink: 0 } }, charInfo.name.slice(0, 1)),
                h("span", { style: { fontSize: isCompact2x1 ? "10.5px" : "11.5px", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, charInfo.name)
              ),
              WidgetSvg(h, "char_quote", { size: isCompact2x1 ? 12 : 14, color: skin.accent })
            ),
            h(
              "div",
              {
                className: "hw-quote-body no-scrollbar",
                style: {
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: isLongFor2x1 ? "flex-start" : "center",
                  alignItems: shouldCenter ? "center" : "stretch",
                  overflowY: "auto",
                  padding: isSquare ? "4px 4px" : "0 1px"
                }
              },
              isSingleShort
                ? h("div", {
                    className: "hw-quote-text",
                    style: {
                      fontSize: isSquare ? "13.5px" : isCompact2x1 ? "10.5px" : "11.5px",
                      lineHeight: isSquare ? 1.65 : 1.38,
                      color: skin.text,
                      textAlign: shouldCenter ? "center" : "left",
                      wordBreak: "break-word",
                      width: "100%"
                    }
                  }, parsedLines[0].text)
                : h(
                    "div",
                    {
                      className: "hw-quote-list",
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: isSquare ? "5px" : "2px",
                        width: "100%",
                        textAlign: shouldCenter ? "center" : "left"
                      }
                    },
                    parsedLines.map((ln, idx) =>
                      ln.bullet
                        ? h("div", { key: idx, className: "hw-quote-text", style: { display: "flex", alignItems: "flex-start", gap: "5px", fontSize: isSquare ? "12px" : "10.5px", lineHeight: 1.4, color: skin.text, textAlign: "left" } },
                            h("span", { className: "hw-quote-bullet", style: { width: "4.5px", height: "4.5px", borderRadius: "50%", backgroundColor: "currentColor", marginTop: "5px", flexShrink: 0, opacity: 0.85 } }),
                            h("span", { style: { flex: 1, wordBreak: "break-word" } }, ln.text)
                          )
                        : h("div", { key: idx, className: "hw-quote-text", style: { fontSize: isSquare ? "12.5px" : "10.5px", lineHeight: 1.45, color: skin.text, wordBreak: "break-word" } }, ln.text)
                    )
                  )
            )
          ),
          (e) => {
            e.stopPropagation();
            if (isLongFor2x1 || parsedLines.length > 3) setQuoteExpandedModal(true);
            else if (onOpenSettings) onOpenSettings(widget.id);
          }
        ),
        quoteExpandedModal &&
          renderInPortal(
            h(
              "div",
              {
                onClick: (e) => { e.stopPropagation(); if (e.target === e.currentTarget) setQuoteExpandedModal(false); },
                onPointerDown: (e) => e.stopPropagation(),
                style: { position: "fixed", inset: 0, zIndex: 99994, background: "rgba(30,34,28,0.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }
              },
              h(
                "div",
                { style: { width: "100%", maxWidth: "310px", background: "#FAF8F3", borderRadius: "20px", padding: "16px", border: "1px solid #E2DDD0", boxShadow: "0 14px 36px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", gap: "10px", color: "#3A4233" } },
                h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                    charInfo.avatar && h("img", { src: charInfo.avatar, alt: charInfo.name, style: { width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover" } }),
                    h("span", { style: { fontSize: "14px", fontWeight: 800 } }, `${charInfo.name} · 语录签`)
                  ),
                  h("button", { type: "button", onClick: () => setQuoteExpandedModal(false), style: { border: "none", background: "#EFECE4", borderRadius: "50%", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } }, WidgetSvg(h, "close", { size: 14, color: "#5A6252" }))
                ),
                h("div", { style: { background: "#FFFFFF", borderRadius: "12px", padding: "12px", fontSize: "13px", lineHeight: 1.7, display: "flex", flexDirection: "column", gap: "5px" } },
                  parsedLines.map((ln, idx) =>
                    ln.bullet
                      ? h("div", { key: idx, style: { display: "flex", alignItems: "flex-start", gap: "6px" } },
                          h("span", { style: { width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#6D735B", marginTop: "8px", flexShrink: 0 } }),
                          h("span", null, ln.text)
                        )
                      : h("div", { key: idx }, ln.text)
                  )
                ),
                onOpenSettings &&
                  h("button", { type: "button", onClick: () => { setQuoteExpandedModal(false); onOpenSettings(widget.id); }, style: { border: "none", borderRadius: "10px", background: "#6D735B", color: "#FFF", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" } }, "编辑语录与样式")
              )
            )
          )
      );
    }

    // 6. 谶纬签匣（展示我的历史卦签或名士专属签，桌面原地可切诗签/童谣/图谶）
    if (widget.type === "chenwei_oracle") {
      const formOrder = ["poem", "ballad", "chenyu"];
      const formLabels = { poem: "诗签", ballad: "童谣", chenyu: "图谶" };
      const activeVerse = chenweiData
        ? String((chenweiData.verses && chenweiData.verses[chenweiForm]) || (chenweiData.verses && chenweiData.verses.poem) || "").trim()
        : "";
      const cycleForm = (e) => {
        e.stopPropagation();
        const idx = formOrder.indexOf(chenweiForm);
        setChenweiForm(formOrder[(idx + 1) % formOrder.length]);
      };
      const handleCardTap = (e) => {
        if (chenweiData) {
          e.stopPropagation();
          setChenweiExpandedModal(true);
        } else if (onQuickAction) {
          onQuickAction("chenwei");
        }
      };

      return h(
        React.Fragment,
        null,
        wrapCard(
          chenweiData
            ? h(
                "div",
                {
                  onClick: handleCardTap,
                  style: { display: "flex", flexDirection: "column", height: "100%", gap: isCompact2x1 ? "3px" : "6px", minHeight: 0 }
                },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "5px", flexShrink: 0 } },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "5px", minWidth: 0 } },
                    chenweiData.avatar
                      ? h("img", { src: chenweiData.avatar, alt: chenweiData.ownerLabel, style: { width: isSquare ? "22px" : "18px", height: isSquare ? "22px" : "18px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                      : WidgetSvg(h, "chenwei_oracle", { size: isSquare ? 15 : 13, color: skin.accent }),
                    h(
                      "span",
                      {
                        className: "hw-chenwei-hex",
                        style: { fontSize: isCompact2x1 ? "10.5px" : "11.5px", fontWeight: 800, color: skin.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
                      },
                      chenweiData.hexagram
                    )
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: cycleForm,
                      title: "点击切换 诗签 / 童谣 / 图谶",
                      style: {
                        border: `1px solid ${skin.accent}`,
                        background: "transparent",
                        color: skin.accent,
                        borderRadius: "5px",
                        padding: "1px 5px",
                        fontSize: "9.5px",
                        fontWeight: 800,
                        cursor: "pointer",
                        flexShrink: 0
                      }
                    },
                    formLabels[chenweiForm] || "诗签"
                  )
                ),
                h(
                  "div",
                  {
                    className: "hw-chenwei-verse no-scrollbar",
                    style: {
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: isSquare ? "center" : "flex-start",
                      textAlign: isSquare || chenweiForm === "ballad" ? "center" : "left",
                      fontSize: isSquare ? "12.5px" : isCompact2x1 ? "10.5px" : "11.5px",
                      fontWeight: 600,
                      lineHeight: isCompact2x1 ? 1.42 : 1.6,
                      whiteSpace: "pre-line",
                      wordBreak: "break-word"
                    }
                  },
                  activeVerse
                ),
                (isSquare || isWide3) &&
                  h(
                    "div",
                    { style: { fontSize: "10px", color: skin.subText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0, borderTop: isSquare ? `1px dashed ${skin.border}` : "none", paddingTop: isSquare ? "4px" : "0" } },
                    `${chenweiData.ownerLabel}${chenweiData.question ? ` · ${chenweiData.question}` : ""}`
                  )
              )
            : h(
                "div",
                {
                  onClick: () => onQuickAction && onQuickAction("chenwei"),
                  style: { height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", textAlign: "center" }
                },
                WidgetSvg(h, "chenwei_oracle", { size: isSquare ? 24 : 18, color: skin.accent }),
                h("div", { style: { fontSize: "11.5px", fontWeight: 700, color: skin.text } }, "谶纬签匣"),
                h("div", { style: { fontSize: "10px", color: skin.subText } }, "点此前往小摊起卦")
              )
        ),
        chenweiExpandedModal && chenweiData &&
          renderInPortal(
            h(
              "div",
              {
                onClick: (e) => { e.stopPropagation(); if (e.target === e.currentTarget) setChenweiExpandedModal(false); },
                onPointerDown: (e) => e.stopPropagation(),
                style: { position: "fixed", inset: 0, zIndex: 99995, background: "rgba(38,30,22,0.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }
              },
              h(
                "div",
                {
                  onClick: (e) => e.stopPropagation(),
                  style: { width: "100%", maxWidth: "340px", maxHeight: "80vh", overflowY: "auto", background: "#FAF6EE", border: "1.5px solid #D4A03C", borderRadius: "18px", padding: "15px", boxShadow: "0 16px 40px rgba(38,30,22,0.28)", display: "flex", flexDirection: "column", gap: "10px", color: "#3E342B" }
                },
                h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", fontWeight: 900, color: "#C84B31" } },
                    WidgetSvg(h, "chenwei_oracle", { size: 17, color: "#C84B31" }),
                    h("span", null, chenweiData.hexagram)
                  ),
                  h("button", { type: "button", onClick: () => setChenweiExpandedModal(false), style: { border: "none", background: "transparent", cursor: "pointer", padding: "4px" } }, WidgetSvg(h, "close", { size: 17, color: "#6B5A49" }))
                ),
                h("div", { style: { fontSize: "11.5px", color: "#7D6B59" } }, `${chenweiData.ownerLabel}${chenweiData.question ? ` · 所问：${chenweiData.question}` : ""}`),
                h("div", { style: { display: "flex", gap: "5px", background: "#EFE7D8", padding: "4px", borderRadius: "10px" } },
                  [
                    { id: "poem", label: "古诗签" },
                    { id: "ballad", label: "东汉童谣" },
                    { id: "chenyu", label: "图谶秘语" }
                  ].map((fm) =>
                    h("button", {
                      key: fm.id,
                      type: "button",
                      onClick: () => setChenweiForm(fm.id),
                      style: { flex: 1, border: "none", borderRadius: "7px", padding: "5px 4px", fontSize: "11px", fontWeight: 800, background: chenweiForm === fm.id ? "#C84B31" : "transparent", color: chenweiForm === fm.id ? "#FFFDF7" : "#5C4738", cursor: "pointer" }
                    }, fm.label)
                  )
                ),
                h("div", { style: { background: "#FFFDF8", borderLeft: "3.5px solid #C84B31", borderRadius: "9px", padding: "10px 12px", whiteSpace: "pre-line", fontSize: "13px", fontWeight: 700, lineHeight: 1.8, textAlign: chenweiForm === "ballad" ? "center" : "left" } }, activeVerse),
                chenweiForm === "chenyu" && chenweiData.chenyuGloss &&
                  h("div", { style: { fontSize: "11.5px", color: "#7B5630", background: "#F8EEDB", borderRadius: "8px", padding: "6px 8px", border: "1px dashed #D8B884" } }, chenweiData.chenyuGloss),
                chenweiData.note &&
                  h("div", { style: { fontSize: "12px", lineHeight: 1.6, color: "#5C4738", background: "#F2EAE0", borderRadius: "9px", padding: "8px 10px" } }, chenweiData.note),
                h("div", { style: { display: "flex", gap: "8px" } },
                  h("button", {
                    type: "button",
                    onClick: () => { setChenweiExpandedModal(false); if (onQuickAction) onQuickAction("chenwei"); },
                    style: { flex: 1, border: "none", borderRadius: "10px", background: "#C84B31", color: "#FFFDF7", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }
                  }, "进入谶纬小摊"),
                  onOpenSettings &&
                    h("button", {
                      type: "button",
                      onClick: () => { setChenweiExpandedModal(false); onOpenSettings(widget.id); },
                      style: { flex: 1, border: "1px solid #D5C5B0", borderRadius: "10px", background: "#FFF", color: "#4A3C31", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }
                    }, "更换签卷/样式")
                )
              )
            )
          )
      );
    }

    // 7. 共同账本（桌面严格展示最新 5 笔收支，点击 Portal 弹层查看全量与名士 note 批注）
    if (widget.type === "couple_bills") {
      const data = coupleBillsData || { displayItems: [], allItems: [], taBills: [], userBills: [], expense: 0, income: 0 };
      const ledgerTab = widget.config?.ledgerTab || "ta";
      const titleLabel = ledgerTab === "user"
        ? "我的账本"
        : ledgerTab === "both"
          ? `${coupleBillsMeta.charName} · 共同账本`
          : `${coupleBillsMeta.charName}的账本`;
      const items = data.displayItems || [];
      const modalList = billsModalTab === "user" ? (data.userBills || []) : (data.taBills || []);
      const BillRowComp = global.CoupleBillItemRow;

      return h(
        React.Fragment,
        null,
        wrapCard(
          h(
            "div",
            {
              onClick: (e) => { e.stopPropagation(); setBillsExpandedModal(true); },
              style: { display: "flex", flexDirection: "column", height: "100%", gap: isCompact2x1 ? "3px" : "5px", minHeight: 0 }
            },
            // 顶栏：名士头像/账本标题 + 收支小胶囊
            h(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "5px", flexShrink: 0 } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "5px", minWidth: 0 } },
                coupleBillsMeta.avatar && ledgerTab !== "user"
                  ? h("img", { src: coupleBillsMeta.avatar, alt: coupleBillsMeta.charName, style: { width: isSquare ? "20px" : "16px", height: isSquare ? "20px" : "16px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                  : WidgetSvg(h, "couple_bills", { size: 13, color: skin.accent }),
                h("span", { style: { fontSize: isCompact2x1 ? "10.5px" : "11.5px", fontWeight: 800, color: skin.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, titleLabel)
              ),
              h(
                "div",
                { className: "hw-bill-summary", style: { display: "flex", alignItems: "center", gap: "4px", fontSize: "9.5px", fontWeight: 800, flexShrink: 0 } },
                h("span", { style: { color: "#D6724B" } }, `-¥${data.expense}`),
                !isCompact2x1 && h("span", { style: { color: "#5A8F6D" } }, `+¥${data.income}`)
              )
            ),

            // 流水区：严格仅展示最新 5 条，智能换行防截断
            items.length > 0
              ? h(
                  "div",
                  { className: "no-scrollbar", style: { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: isSquare ? "4px" : "2.5px" } },
                  items.map((b, i) => {
                    const isExp = b.type !== "income";
                    const hasNote = Boolean(String(b.note || "").trim());
                    return h(
                      "div",
                      {
                        key: b.id || i,
                        className: "hw-bill-row",
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          gap: "1px",
                          paddingBottom: isSquare ? "3px" : "1px",
                          borderBottom: isSquare && i < items.length - 1 ? `1px dashed ${skin.border}` : "none"
                        }
                      },
                      h(
                        "div",
                        { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "6px", fontSize: isSquare ? "11px" : "10px", lineHeight: 1.38 } },
                        h("span", { style: { flex: 1, minWidth: 0, whiteSpace: "normal", wordBreak: "break-word" } },
                          ledgerTab === "both" ? `[${b._owner === "user" ? "我" : "TA"}] ` : "",
                          b.category,
                          hasNote && h("span", { style: { display: "inline-block", width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "#C84B31", marginLeft: "4px", verticalAlign: "middle" } })
                        ),
                        h("span", { className: "hw-bill-amount", style: { color: isExp ? "#D6724B" : "#5A8F6D", fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap" } },
                          `${isExp ? "-" : "+"}¥${b.amount}`
                        )
                      ),
                      isSquare && hasNote &&
                        h("div", { style: { fontSize: "9.5px", color: skin.subText, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" } }, b.note)
                    );
                  })
                )
              : h(
                  "div",
                  { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", fontSize: "10.5px", color: skin.subText } },
                  h("span", null, "暂无记账记录"),
                  h("span", { style: { fontSize: "9.5px", opacity: 0.8 } }, "点击前往情侣空间记一笔")
                )
          )
        ),
        billsExpandedModal &&
          renderInPortal(
            h(
              "div",
              {
                onClick: (e) => { e.stopPropagation(); if (e.target === e.currentTarget) setBillsExpandedModal(false); },
                onPointerDown: (e) => e.stopPropagation(),
                style: { position: "fixed", inset: 0, zIndex: 99995, background: "rgba(38,30,22,0.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }
              },
              h(
                "div",
                {
                  onClick: (e) => e.stopPropagation(),
                  style: { width: "100%", maxWidth: "352px", maxHeight: "82vh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: "#FAF6EE", border: "1.5px solid #D4A03C", borderRadius: "18px", padding: "15px", boxShadow: "0 16px 40px rgba(38,30,22,0.28)", display: "flex", flexDirection: "column", gap: "10px", color: "#3E342B" }
                },
                h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", fontWeight: 900, color: "#3E342B" } },
                    WidgetSvg(h, "couple_bills", { size: 17, color: "#C84B31" }),
                    h("span", null, `${coupleBillsMeta.charName} · 共同账本`)
                  ),
                  h("button", { type: "button", onClick: () => setBillsExpandedModal(false), style: { border: "none", background: "transparent", cursor: "pointer", padding: "4px" } }, WidgetSvg(h, "close", { size: 17, color: "#6B5A49" }))
                ),
                h("div", { style: { display: "flex", gap: "6px", background: "#EFE7D8", padding: "4px", borderRadius: "10px" } },
                  [
                    { id: "ta", label: `${coupleBillsMeta.charName}的账本 (${(data.taBills || []).length})` },
                    { id: "user", label: `我的账本 (${(data.userBills || []).length})` }
                  ].map((tb) =>
                    h("button", {
                      key: tb.id,
                      type: "button",
                      onClick: () => setBillsModalTab(tb.id),
                      style: { flex: 1, border: "none", borderRadius: "7px", padding: "5px 4px", fontSize: "11px", fontWeight: 800, background: billsModalTab === tb.id ? "#C84B31" : "transparent", color: billsModalTab === tb.id ? "#FFFDF7" : "#5C4738", cursor: "pointer" }
                    }, tb.label)
                  )
                ),
                h("div", { style: { fontSize: "10.5px", color: "#8C7A68" } }, "桌面仅展示最新 5 笔；此处可展开全部历史账目与批注"),
                h(
                  "div",
                  { style: { maxHeight: "42vh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: "#FFFDF8", borderRadius: "12px", padding: "4px 10px", border: "1px solid #EAE0CE" } },
                  modalList.length > 0
                    ? modalList.map((b, idx) =>
                        BillRowComp
                          ? h(BillRowComp, { key: b.id || idx, bill: b, charName: coupleBillsMeta.charName, isTa: billsModalTab === "ta" })
                          : h("div", { key: b.id || idx, style: { padding: "8px 0", borderBottom: "1px solid #F2ECE0", fontSize: "12px" } }, `${b.category} (${b.type === "income" ? "+" : "-"}¥${b.amount})`)
                      )
                    : h("div", { style: { padding: "22px 0", textAlign: "center", fontSize: "12px", color: "#8C7A68" } }, "暂无账目记录")
                ),
                h("div", { style: { display: "flex", gap: "8px" } },
                  h("button", {
                    type: "button",
                    onClick: () => { setBillsExpandedModal(false); if (onQuickAction) onQuickAction("couple"); },
                    style: { flex: 1, border: "none", borderRadius: "10px", background: "#C84B31", color: "#FFFDF7", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }
                  }, "前往情侣空间"),
                  onOpenSettings &&
                    h("button", {
                      type: "button",
                      onClick: () => { setBillsExpandedModal(false); onOpenSettings(widget.id); },
                      style: { flex: 1, border: "1px solid #D5C5B0", borderRadius: "10px", background: "#FFF", color: "#4A3C31", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }
                    }, "更换账本/样式")
                )
              )
            )
          )
      );
    }

    // 8. 心愿签（只展示用户或角色最新 1 条愿望，复刻名士语录签智能居中与智能换行排版）
    if (widget.type === "couple_wish") {
      const wish = coupleWishData && coupleWishData.wish ? coupleWishData.wish : null;
      const creatorFilter = widget.config?.creatorFilter || "all";
      const isUserWish = wish ? wish.creator === "user" : creatorFilter === "user";
      const headerLabel = isUserWish ? "我的心愿" : `${coupleWishMeta.charName}的心愿`;
      const wishTitle = wish ? String(wish.title || "").trim() : "";
      const isShortWish = wishTitle.length <= 18;

      const handleSendWishToChat = async () => {
        const Bridge = global.CoupleWishBridge;
        if (!Bridge || !wish || !coupleWishMeta.charId) return;
        const res = await Bridge.sendWishCardToChat({
          targetChar: { id: coupleWishMeta.charId, name: coupleWishMeta.charName },
          wish
        });
        if (res && res.ok) {
          setWishSentTip(`已静默送入「${coupleWishMeta.charName}」传讯主线`);
          setTimeout(() => setWishSentTip(""), 2200);
        }
      };

      return h(
        React.Fragment,
        null,
        wrapCard(
          wish
            ? h(
                "div",
                {
                  onClick: (e) => { e.stopPropagation(); setWishSentTip(""); setWishExpandedModal(true); },
                  style: { display: "flex", flexDirection: "column", height: "100%", gap: isCompact2x1 ? "3px" : "6px", minHeight: 0 }
                },
                // 顶栏：头像/星愿标 + 归属 + 状态/分类角标
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "5px", flexShrink: 0 } },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "5px", minWidth: 0 } },
                    !isUserWish && coupleWishMeta.avatar
                      ? h("img", { src: coupleWishMeta.avatar, alt: coupleWishMeta.charName, style: { width: isSquare ? "22px" : "18px", height: isSquare ? "22px" : "18px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 } })
                      : WidgetSvg(h, "couple_wish", { size: isSquare ? 15 : 13, color: skin.accent }),
                    h("span", { style: { fontSize: isCompact2x1 ? "10.5px" : "11.5px", fontWeight: 800, color: skin.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, headerLabel)
                  ),
                  h(
                    "span",
                    {
                      className: "hw-wish-tag",
                      style: {
                        fontSize: "9.5px",
                        fontWeight: 700,
                        color: wish.done ? "#5A8F6D" : skin.accent,
                        opacity: 0.9,
                        flexShrink: 0
                      }
                    },
                    wish.done ? "已兑现" : (wish.category || "心愿")
                  )
                ),

                // 中央正文区：100% 复刻名士语录签智能居中 + 智能换行防截断
                h(
                  "div",
                  {
                    className: "hw-wish-title no-scrollbar",
                    style: {
                      flex: 1,
                      minHeight: 0,
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      textAlign: "center",
                      padding: isSquare ? "4px 4px" : "1px 2px",
                      fontSize: isSquare
                        ? (isShortWish ? "14px" : "12.5px")
                        : (isCompact2x1 ? (isShortWish ? "11.5px" : "10.5px") : "12px"),
                      fontWeight: 700,
                      lineHeight: isCompact2x1 ? 1.42 : 1.6,
                      whiteSpace: "normal",
                      wordBreak: "break-word"
                    }
                  },
                  wishTitle
                ),

                // 2x2 底部日期与状态轻注
                isSquare &&
                  h(
                    "div",
                    { style: { fontSize: "10px", color: skin.subText, textAlign: "center", flexShrink: 0, borderTop: `1px dashed ${skin.border}`, paddingTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } },
                    `${wish.date || "近日许下"} · ${wish.done ? "已实现" : "待与君共赴"}`
                  )
              )
            : h(
                "div",
                {
                  onClick: () => onQuickAction && onQuickAction("couple"),
                  style: { height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", textAlign: "center" }
                },
                WidgetSvg(h, "couple_wish", { size: isSquare ? 22 : 16, color: skin.accent }),
                h("div", { style: { fontSize: "11.5px", fontWeight: 700, color: skin.text } }, "心愿签"),
                h("div", { style: { fontSize: "10px", color: skin.subText } }, "点击前往情侣空间许愿")
              )
        ),
        wishExpandedModal && wish &&
          renderInPortal(
            h(
              "div",
              {
                onClick: (e) => { e.stopPropagation(); if (e.target === e.currentTarget) setWishExpandedModal(false); },
                onPointerDown: (e) => e.stopPropagation(),
                style: { position: "fixed", inset: 0, zIndex: 99995, background: "rgba(38,30,22,0.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }
              },
              h(
                "div",
                {
                  onClick: (e) => e.stopPropagation(),
                  style: { width: "100%", maxWidth: "332px", background: "#FAF6EE", border: "1.5px solid #D8B48A", borderRadius: "18px", padding: "16px", boxShadow: "0 16px 40px rgba(38,30,22,0.28)", display: "flex", flexDirection: "column", gap: "10px", color: "#3E342B" }
                },
                h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", fontWeight: 900, color: "#B85D3B" } },
                    WidgetSvg(h, "couple_wish", { size: 16, color: "#B85D3B" }),
                    h("span", null, headerLabel)
                  ),
                  h("button", { type: "button", onClick: () => setWishExpandedModal(false), style: { border: "none", background: "transparent", cursor: "pointer", padding: "4px" } }, WidgetSvg(h, "close", { size: 17, color: "#6B5A49" }))
                ),
                h(
                  "div",
                  { style: { background: "#FFFDF8", borderRadius: "12px", border: "1px solid #EAE0CE", padding: "14px 12px", textAlign: "center", fontSize: "14px", fontWeight: 700, lineHeight: 1.7, color: "#3E342B", wordBreak: "break-word" } },
                  wishTitle
                ),
                h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "#8C7A68" } },
                  h("span", null, `${wish.category || "心之所向"} · ${wish.date || ""}`),
                  h("span", { style: { color: wish.done ? "#5A8F6D" : "#B85D3B", fontWeight: 700 } }, wish.done ? "已兑现" : "待兑现")
                ),
                wishSentTip &&
                  h("div", { style: { fontSize: "11.5px", color: "#4E7D5B", background: "#EEF6F0", borderRadius: "8px", padding: "6px 9px", textAlign: "center", fontWeight: 700 } }, wishSentTip),
                coupleWishMeta.charId &&
                  h("button", {
                    type: "button",
                    onClick: handleSendWishToChat,
                    style: { border: "none", borderRadius: "10px", background: "#4A3C31", color: "#FFFDF7", padding: "8.5px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }
                  }, `递送心愿信笺给${coupleWishMeta.charName}（传讯）`),
                h("div", { style: { display: "flex", gap: "8px" } },
                  h("button", {
                    type: "button",
                    onClick: () => { setWishExpandedModal(false); if (onQuickAction) onQuickAction("couple"); },
                    style: { flex: 1, border: "none", borderRadius: "10px", background: "#C84B31", color: "#FFFDF7", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }
                  }, "前往情侣空间"),
                  onOpenSettings &&
                    h("button", {
                      type: "button",
                      onClick: () => { setWishExpandedModal(false); onOpenSettings(widget.id); },
                      style: { flex: 1, border: "1px solid #D5C5B0", borderRadius: "10px", background: "#FFF", color: "#4A3C31", padding: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }
                    }, "更换来源/样式")
                )
              )
            )
          )
      );
    }

    // 9. 日程便签（读取日历-未竟之事，支持筛选用户/指定角色，智能换行防截断，点击跳转日历页）
    const tasks = calendarTasks;
    return wrapCard(
      h("div", { style: { display: "flex", flexDirection: "column", height: "100%", gap: "5px", minHeight: 0 } },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 } },
          h("span", { style: { fontSize: "11.5px", fontWeight: 800, color: skin.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, calendarOwnerName),
          WidgetSvg(h, "calendar", { size: 14, color: skin.accent })
        ),
        tasks.length > 0
          ? h("div", { className: "no-scrollbar", style: { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: isSquare ? "5px" : "3px" } },
              tasks.map((t, i) =>
                h("div", {
                  key: t.id || i,
                  className: "hw-calendar-item",
                  style: {
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "5px",
                    fontSize: isSquare ? "11.5px" : "10.5px",
                    lineHeight: 1.42,
                    wordBreak: "break-word",
                    whiteSpace: "normal"
                  }
                },
                  h("span", { style: { width: "4.5px", height: "4.5px", borderRadius: "50%", backgroundColor: "currentColor", marginTop: "5px", flexShrink: 0, opacity: 0.78 } }),
                  h("span", { style: { flex: 1 } }, `${t.month && t.day ? `${t.month}/${t.day} ` : ""}${t.title}`)
                )
              )
            )
          : h("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: skin.subText } }, "暂无未竟之事")
      )
    );
  }

  // ==========================================
  // 4. 主屏幕 4 列混排矩阵组件（HomeDesktopMatrix）
  // ==========================================
  function HomeDesktopMatrix({
    pageIndex,
    appIcons,
    storeItem,
    widgets,
    musicBridge = null,
    foldCardBridge = null,
    renderIconItem,
    onQuickAction,
    onOpenWidgetSettings
  }) {
    const React = global.React;
    if (!React || !global.HomeWidgetEngine) return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const Engine = global.HomeWidgetEngine;

    const [typeCssMap, setTypeCssMap] = useState({});
    useEffect(() => {
      let alive = true;
      if (Engine.loadTypeCssMap) {
        Engine.loadTypeCssMap().then((m) => { if (alive) setTypeCssMap(m || {}); });
      }
      const unsub = Engine.subscribeTypeCss ? Engine.subscribeTypeCss((m) => { if (alive) setTypeCssMap(m || {}); }) : () => {};
      return () => { alive = false; unsub(); };
    }, []);

    const layout = Engine.computeAllPagesLayout(appIcons, widgets, { storeItem, minPages: 3 });
    const page = layout.pages[pageIndex] || { pageIndex, rows: Engine.getRowsForPage(pageIndex), cols: 4, items: [] };

    return h(
      "div",
      {
        className: "icon-matrix home-widget-matrix",
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gridAutoRows: pageIndex === 0 ? "78px" : "76px",
          gap: "10px 8px",
          alignItems: "stretch",
          justifyItems: "stretch",
          width: "100%",
          boxSizing: "border-box",
          overflow: "visible"
        }
      },
      page.items.map((it) => {
        const cellStyle = {
          gridColumn: `${it.col + 1} / span ${it.w}`,
          gridRow: `${it.row + 1} / span ${it.h}`,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible"
        };
        if (it.kind === "widget") {
          return h(
            "div",
            {
              key: it.id,
              style: {
                ...cellStyle,
                padding: "3px 6px 6px 6px",
                boxSizing: "border-box"
              }
            },
            h(WidgetCard, {
              widget: it.widget,
              typeCssMap,
              musicBridge,
              foldCardBridge,
              onQuickAction,
              onOpenSettings: onOpenWidgetSettings
            })
          );
        }
        const itemKey = it.app ? (it.app.actionId || it.app.id || it.app.label || `app-${it.slotIndex}`) : `empty-${it.slotIndex}`;
        return h(
          "div",
          { key: itemKey, style: cellStyle },
          renderIconItem(it.app, itemKey, false, it.slotIndex)
        );
      })
    );
  }

  // ==========================================
  // 4.5 每页顶部横幅小组件槽位（可替换任意页顶部折叠卡片 / 页眉）
  // ==========================================
  function HomeTopSlotBanner({
    pageIndex,
    topSlots = {},
    musicBridge = null,
    foldCardBridge = null,
    onQuickAction,
    onOpenWidgetSettings,
    renderDefault
  }) {
    const React = global.React;
    if (!React || !global.HomeWidgetEngine) return renderDefault ? renderDefault() : null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const Engine = global.HomeWidgetEngine;

    const [typeCssMap, setTypeCssMap] = useState({});
    useEffect(() => {
      let alive = true;
      if (Engine.loadTypeCssMap) Engine.loadTypeCssMap().then((m) => { if (alive) setTypeCssMap(m || {}); });
      const unsub = Engine.subscribeTypeCss ? Engine.subscribeTypeCss((m) => { if (alive) setTypeCssMap(m || {}); }) : () => {};
      return () => { alive = false; unsub(); };
    }, []);

    const slot = topSlots && topSlots[String(pageIndex)];
    if (!slot) return renderDefault ? renderDefault() : null;
    if (slot.hidden) return null;

    return h(
      "div",
      {
        className: "hw-top-slot-wrap",
        style: {
          width: "100%",
          height: "92px",
          marginBottom: "14px",
          position: "relative",
          overflow: "visible",
          boxSizing: "border-box"
        }
      },
      h(WidgetCard, {
        widget: { ...slot, size: "4x1" },
        typeCssMap,
        musicBridge,
        foldCardBridge,
        onQuickAction,
        onOpenSettings: () => onOpenWidgetSettings && onOpenWidgetSettings(`__top_${pageIndex}`)
      })
    );
  }

  // ==========================================
  // 5. 设置中心「小组件工坊」弹窗（含倒三角展开自定义 CSS + 一键复制默认 CSS）
  // ==========================================
  function HomeWidgetSettingsModal({ isOpen, onClose, initialSelectedId = "" }) {
    const React = global.React;
    if (!React || !global.HomeWidgetEngine) return null;
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;
    const Engine = global.HomeWidgetEngine;
    const Css = global.HomeWidgetCss;

    const [widgets, setWidgets] = useState([]);
    const [topSlots, setTopSlots] = useState({});
    const [typeCssMap, setTypeCssMap] = useState({});
    const [cssPresets, setCssPresets] = useState([]);
    const [pendingDeletePreset, setPendingDeletePreset] = useState(null);
    const [presetNameInput, setPresetNameInput] = useState("");
    const [albumThumbUrls, setAlbumThumbUrls] = useState({});
    const [previewVisibleMap, setPreviewVisibleMap] = useState({});
    const [previewSizeMap, setPreviewSizeMap] = useState({});
    const [activePage, setActivePage] = useState(0);
    const [selectedId, setSelectedId] = useState(initialSelectedId || "");
    const [showAddDrawer, setShowAddDrawer] = useState(false);
    const [expandedAddCssType, setExpandedAddCssType] = useState("");
    const [expandedSelectedCss, setExpandedSelectedCss] = useState(false);
    const [characters, setCharacters] = useState([]);
    const [chenweiRecords, setChenweiRecords] = useState([]);
    const [chenweiCharProps, setChenweiCharProps] = useState({});
    const [toast, setToast] = useState("");
    const photoInputRef = useRef(null);
    const cssImportInputRef = useRef(null);
    const cssImportTargetRef = useRef(null);

    const flash = (m) => {
      setToast(m);
      setTimeout(() => setToast(""), 2000);
    };

    useEffect(() => {
      if (!isOpen) return;
      let alive = true;
      Promise.all([
        Engine.loadWidgets(),
        Engine.loadTypeCssMap ? Engine.loadTypeCssMap() : Promise.resolve({}),
        Engine.loadCssPresets ? Engine.loadCssPresets() : Promise.resolve([]),
        Engine.loadTopSlots ? Engine.loadTopSlots() : Promise.resolve({})
      ]).then(([list, cssMap, presets, tSlots]) => {
        if (!alive) return;
        setWidgets(list);
        setTypeCssMap(cssMap || {});
        setCssPresets(Array.isArray(presets) ? presets : []);
        setTopSlots(tSlots || {});
        if (initialSelectedId && String(initialSelectedId).startsWith("__top_")) {
          const pNum = Number(String(initialSelectedId).replace("__top_", "")) || 0;
          setActivePage(pNum);
          setSelectedId(initialSelectedId);
        } else if (initialSelectedId) {
          const hit = list.find((w) => w.id === initialSelectedId);
          if (hit) {
            setSelectedId(hit.id);
            setActivePage(hit.pageIndex || 0);
          }
        }
      });
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        global.chatCharacterStore.getAll().then((list) => {
          if (alive) setCharacters((list || []).filter((c) => c && c.id && c.name && !String(c.id).startsWith("group") && c.type !== "group" && c.type !== "decor"));
        }).catch(() => {});
      }
      if (global.ChenweiAiOracle) {
        Promise.all([
          global.ChenweiAiOracle.loadOracleRecords ? global.ChenweiAiOracle.loadOracleRecords(30) : Promise.resolve([]),
          global.ChenweiAiOracle.loadAllCharProphecies ? global.ChenweiAiOracle.loadAllCharProphecies() : Promise.resolve({})
        ]).then(([recs, cProps]) => {
          if (!alive) return;
          setChenweiRecords(Array.isArray(recs) ? recs : []);
          setChenweiCharProps(cProps && typeof cProps === "object" ? cProps : {});
        }).catch(() => {});
      }
      return () => { alive = false; };
    }, [isOpen, initialSelectedId]);

    // 当选中 photo 组件时预加载缩略图（必须在条件 return 之前调用 Hook）
    const _selForThumb = (selectedId && String(selectedId).startsWith("__top_"))
      ? topSlots[String(selectedId).replace("__top_", "")]
      : widgets.find((w) => w.id === selectedId);
    const _selThumbIdsKey = (_selForThumb && _selForThumb.type === "photo")
      ? JSON.stringify(
          Array.isArray(_selForThumb.config?.mediaIds) && _selForThumb.config.mediaIds.length
            ? _selForThumb.config.mediaIds
            : (_selForThumb.config?.mediaId ? [_selForThumb.config.mediaId] : [])
        )
      : "";
    useEffect(() => {
      if (!isOpen || !_selThumbIdsKey) return;
      const ids = JSON.parse(_selThumbIdsKey);
      const missing = ids.filter((id) => !albumThumbUrls[id]);
      if (!missing.length) return;
      let alive = true;
      Promise.all(missing.map((id) => Engine.loadWidgetMedia(id).then((u) => [id, u]))).then((pairs) => {
        if (!alive) return;
        const patch = {};
        pairs.forEach(([k, v]) => { if (v) patch[k] = v; });
        if (Object.keys(patch).length) setAlbumThumbUrls((prev) => ({ ...prev, ...patch }));
      });
      return () => { alive = false; };
    }, [isOpen, _selThumbIdsKey]);

    if (!isOpen) return null;

    const persist = async (nextList) => {
      setWidgets(nextList);
      await Engine.saveWidgets(nextList);
    };

    const maxPageCount = Math.max(3, ...widgets.map((w) => (w.pageIndex || 0) + 1));
    const pageRows = Engine.getRowsForPage(activePage, widgets, topSlots);
    const pageWidgets = widgets.filter((w) => w.enabled !== false && (w.pageIndex || 0) === activePage);
    const topSlotKey = `__top_${activePage}`;
    const activeTopSlot = topSlots[String(activePage)] || null;
    const isEditingTopSlot = selectedId === topSlotKey && activeTopSlot && !activeTopSlot.hidden;
    const selectedWidget = isEditingTopSlot
      ? activeTopSlot
      : (widgets.find((w) => w.id === selectedId) || null);

    const handleSetTopSlotType = async (typeOrMode) => {
      if (typeOrMode === "__default__") {
        const next = await Engine.saveTopSlot(activePage, null);
        setTopSlots(next);
        if (selectedId === topSlotKey) setSelectedId("");
        flash(`第 ${activePage + 1} 页顶部已恢复默认`);
        return;
      }
      if (typeOrMode === "__hidden__") {
        const next = await Engine.saveTopSlot(activePage, { hidden: true });
        setTopSlots(next);
        if (selectedId === topSlotKey) setSelectedId("");
        flash(`已隐藏第 ${activePage + 1} 页顶部横幅`);
        return;
      }
      const next = await Engine.saveTopSlot(activePage, {
        type: typeOrMode,
        customCss: typeCssMap[typeOrMode] || ""
      });
      setTopSlots(next);
      setSelectedId(topSlotKey);
      flash(`第 ${activePage + 1} 页顶部已替换为小组件`);
    };

    const handleAddWidget = async (type, size) => {
      const inheritedCss = typeCssMap[type] || "";
      const res = Engine.addWidgetInstance(widgets, { type, size, pageIndex: activePage, customCss: inheritedCss });
      await persist(res.widgets);
      setSelectedId(res.widget.id);
      setActivePage(res.widget.pageIndex);
      setShowAddDrawer(false);
      flash(res.movedToPage !== null ? `本页空间不足，已自动放至第 ${res.movedToPage + 1} 页` : "已添加到主屏幕");
    };

    const handlePatchSelected = async (patch) => {
      if (!selectedWidget) return;
      if (isEditingTopSlot) {
        const merged = {
          ...activeTopSlot,
          ...patch,
          size: "4x1",
          config: patch.config ? { ...(activeTopSlot.config || {}), ...patch.config } : (activeTopSlot.config || {})
        };
        const next = await Engine.saveTopSlot(activePage, merged);
        setTopSlots(next);
        return;
      }
      const res = Engine.updateWidgetInstance(widgets, selectedWidget.id, patch);
      if (res.ok) {
        await persist(res.widgets);
        if (res.widget.pageIndex !== activePage) setActivePage(res.widget.pageIndex);
      }
    };

    const handleDeleteSelected = async () => {
      if (!selectedWidget) return;
      if (isEditingTopSlot) {
        await handleSetTopSlotType("__default__");
        return;
      }
      const next = Engine.removeWidgetInstance(widgets, selectedWidget.id);
      setSelectedId("");
      await persist(next);
      flash("已移除该小组件");
    };

    const handleCopyDefaultCss = async (type) => {
      if (!Css) return;
      const ok = await Css.copyTextWithFallback(Css.getDefaultCss(type));
      flash(ok ? "已复制原本 CSS（含伪元素挂点）" : "复制失败，请手动选中");
    };

    const handleTypeCssChange = async (type, val) => {
      setTypeCssMap((prev) => ({ ...prev, [type]: val }));
      if (Engine.saveTypeCss) await Engine.saveTypeCss(type, val);
    };

    const handleSavePreset = async (type, cssText) => {
      if (!String(cssText || "").trim()) {
        flash("请先输入自定义 CSS 再保存预设");
        return;
      }
      const res = await Engine.saveCssPreset({ name: presetNameInput, type, css: cssText });
      if (res.ok) {
        setCssPresets(res.presets);
        setPresetNameInput("");
        flash(`已保存预设「${res.preset.name}」`);
      }
    };

    const handleDeletePreset = async (presetId) => {
      const next = await Engine.deleteCssPreset(presetId);
      setCssPresets(next);
      setPendingDeletePreset(null);
      flash("已删除该样式预设");
    };

    const handleTriggerCssImport = (widgetType, onChangeCss) => {
      cssImportTargetRef.current = { widgetType, onChangeCss };
      if (cssImportInputRef.current) cssImportInputRef.current.click();
    };

    const handleCssFileImport = async (e) => {
      const file = e.target?.files?.[0];
      e.target.value = "";
      const target = cssImportTargetRef.current;
      if (!file || !target) return;
      try {
        const rawText = typeof file.text === "function"
          ? await file.text()
          : await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result || ""));
              r.onerror = reject;
              r.readAsText(file, "utf-8");
            });
        const trimmed = String(rawText || "").replace(/^\uFEFF/, "").trim();
        if (!trimmed) {
          flash("导入失败：文件内容为空");
          return;
        }
        const baseName = String(file.name || "导入样式").replace(/\.(css|txt|json)$/i, "").trim() || "导入样式";
        if (/\.json$/i.test(file.name || "")) {
          const parsed = JSON.parse(trimmed);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          let lastPresets = cssPresets;
          let firstCss = "";
          let count = 0;
          for (const it of items) {
            if (!it || typeof it.css !== "string" || !it.css.trim()) continue;
            const res = await Engine.saveCssPreset({
              name: String(it.name || baseName).trim() || baseName,
              type: target.widgetType,
              css: it.css.trim()
            });
            if (res && res.ok) {
              lastPresets = res.presets;
              if (!firstCss) firstCss = it.css.trim();
              count += 1;
            }
          }
          if (count > 0) {
            setCssPresets(lastPresets);
            if (typeof target.onChangeCss === "function") target.onChangeCss(firstCss);
            flash(`已导入 ${count} 个 CSS 预设至本地 IndexedDB`);
          } else {
            flash("JSON 中未找到有效的 css 字段");
          }
          return;
        }
        const res = await Engine.saveCssPreset({
          name: baseName,
          type: target.widgetType,
          css: trimmed
        });
        if (res && res.ok) {
          setCssPresets(res.presets);
          if (typeof target.onChangeCss === "function") target.onChangeCss(trimmed);
          flash(`已导入「${res.preset.name}」并存入本地 IndexedDB`);
        }
      } catch (err) {
        flash("导入失败，请确认文件为 UTF-8 编码的 .css / .txt 文件");
      }
    };

    // 复用型：自定义 CSS 编辑器（含一键复制原本 CSS + 保存为预设 + 预设库 + 实时预览舞台）
    const renderCssStudio = ({ scopeKey, widgetType, cssValue, onChangeCss, sampleWidget = null }) => {
      const meta = Engine.CATALOG_MAP[widgetType] || Engine.WIDGET_CATALOG[0];
      const showPrev = !!previewVisibleMap[scopeKey];
      const prevSize = previewSizeMap[scopeKey] || (sampleWidget ? sampleWidget.size : meta.defaultSize);
      const sp = Engine.getSizeSpec(prevSize);
      const prevW = sp.w === 4 ? "100%" : sp.w === 3 ? "86%" : "178px";
      const prevH = sp.h === 2 ? "166px" : "80px";
      const builtins = (Css && Array.isArray(Css.BUILTIN_CSS_PRESETS) ? Css.BUILTIN_CSS_PRESETS : [])
        .filter((p) => p.type === widgetType || p.type === "all");
      const userPresets = cssPresets.filter((p) => p.type === widgetType || p.type === "all");
      const relevantPresets = [...builtins, ...userPresets];

      const mockWidget = {
        id: `preview_${scopeKey}`,
        type: widgetType,
        size: prevSize,
        skin: sampleWidget ? sampleWidget.skin : meta.defaultSkin,
        customCss: cssValue || "",
        config: sampleWidget ? (sampleWidget.config || {}) : {}
      };

      return h(
        "div",
        { style: { background: "#FFFFFF", border: "1px solid #E5E0D5", borderRadius: "10px", padding: "9px", display: "flex", flexDirection: "column", gap: "8px" } },
        // 顶部工具条：复制原本 CSS / 导入 CSS 文件 / 预览开关 / 重置
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "5px", flexWrap: "wrap" } },
          h("div", { style: { display: "flex", gap: "5px", flexWrap: "wrap" } },
            h("button", {
              type: "button",
              onClick: () => handleCopyDefaultCss(widgetType),
              style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "7px", padding: "4px 8px", fontSize: "10.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }
            }, WidgetSvg(h, "copy", { size: 12, color: "#5A6252" }), "复制原本 CSS"),
            h("button", {
              type: "button",
              onClick: () => handleTriggerCssImport(widgetType, onChangeCss),
              style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "7px", padding: "4px 8px", fontSize: "10.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }
            }, WidgetSvg(h, "upload", { size: 12, color: "#5A6252" }), "导入 CSS"),
            h("button", {
              type: "button",
              onClick: () => {
                const content = String(cssValue || "").trim();
                if (!content) {
                  showToast("当前 CSS 为空，可先套用预设或填写样式");
                  return;
                }
                try {
                  const blob = new Blob([content], { type: "text/css;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `小组件-${(meta && meta.label) || widgetType}.css`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  showToast("已导出小组件 CSS 文件");
                } catch (_) {
                  showToast("导出失败，请尝试手动复制");
                }
              },
              style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "7px", padding: "4px 8px", fontSize: "10.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }
            }, h("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "#5A6252", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }, h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), h("polyline", { points: "7 10 12 15 17 10" }), h("line", { x1: 12, y1: 15, x2: 12, y2: 3 })), "导出 CSS")
          ),
          h("div", { style: { display: "flex", gap: "5px" } },
            h("button", {
              type: "button",
              onClick: () => setPreviewVisibleMap((prev) => ({ ...prev, [scopeKey]: !prev[scopeKey] })),
              style: { border: showPrev ? "1px solid #6D735B" : "1px solid #C5CEB8", background: showPrev ? "#6D735B" : "#FAF9F5", color: showPrev ? "#FFFFFF" : "#3A4233", borderRadius: "7px", padding: "4px 8px", fontSize: "10.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "3px", cursor: "pointer" }
            }, WidgetSvg(h, "eye", { size: 12, color: showPrev ? "#FFFFFF" : "#5A6252" }), showPrev ? "收起预览" : "实时预览"),
            h("button", {
              type: "button",
              onClick: () => onChangeCss(""),
              style: { border: "1px solid #E2DFD5", background: "#FAF9F5", color: "#7A826E", borderRadius: "7px", padding: "4px 7px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }
            }, "重置")
          )
        ),

        // 实时预览舞台（支持切换预览尺寸，留足上下边距展示 ::before/::after 探出挂件）
        showPrev &&
          h(
            "div",
            {
              style: {
                background: "radial-gradient(circle at 20% 20%, #ECECE7 0%, #DFDFD7 100%)",
                borderRadius: "12px",
                padding: "16px 12px 18px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
                overflow: "visible"
              }
            },
            h("div", { style: { display: "flex", gap: "5px", alignSelf: "flex-end" } },
              meta.sizes.map((sz) => {
                const szSp = Engine.getSizeSpec(sz);
                const act = prevSize === sz;
                return h("button", {
                  key: sz,
                  type: "button",
                  onClick: () => setPreviewSizeMap((prev) => ({ ...prev, [scopeKey]: sz })),
                  style: { border: "none", borderRadius: "999px", padding: "2px 7px", fontSize: "9.5px", fontWeight: 700, background: act ? "#3A4233" : "rgba(255,255,255,0.75)", color: act ? "#FFF" : "#5A6252", cursor: "pointer" }
                }, szSp.short);
              })
            ),
            h(
              "div",
              { style: { width: prevW, height: prevH, maxWidth: "100%", overflow: "visible" } },
              h(WidgetCard, { widget: mockWidget, typeCssMap: {} })
            )
          ),

        // CSS 编辑框
        h("textarea", {
          value: cssValue || "",
          onChange: (e) => onChangeCss(e.target.value),
          placeholder: "粘贴或编写 CSS（支持 ::before / ::after 伪元素贴纸与 @keyframes）…",
          rows: 5,
          style: { width: "100%", boxSizing: "border-box", border: "1px solid #E2DFD5", borderRadius: "8px", padding: "7px", fontSize: "11px", fontFamily: "ui-monospace, Consolas, monospace", background: "#FAF9F5", color: "#2D3328", outline: "none", resize: "vertical" }
        }),

        // 保存为预设行
        h("div", { style: { display: "flex", gap: "6px" } },
          h("input", {
            type: "text",
            value: presetNameInput,
            onChange: (e) => setPresetNameInput(e.target.value),
            placeholder: "给当前 CSS 预设起个名字…",
            style: { flex: 1, minWidth: 0, border: "1px solid #E2DFD5", borderRadius: "8px", padding: "5px 8px", fontSize: "11px", outline: "none" }
          }),
          h("button", {
            type: "button",
            onClick: () => handleSavePreset(widgetType, cssValue),
            style: { border: "none", background: "#6D735B", color: "#FFFFFF", borderRadius: "8px", padding: "5px 10px", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", flexShrink: 0 }
          }, WidgetSvg(h, "bookmark", { size: 12, color: "#FFFFFF" }), "存为预设")
        ),

        // 已保存预设胶囊列表
        relevantPresets.length > 0 &&
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "5px", paddingTop: "2px" } },
            relevantPresets.map((pr) =>
              h("div", {
                key: pr.id,
                style: { display: "inline-flex", alignItems: "center", gap: "4px", background: "#F2F4EC", border: "1px solid #CFD6C4", borderRadius: "999px", padding: "3px 6px 3px 9px", fontSize: "10.5px", color: "#3A4233" }
              },
                h("span", { onClick: () => { onChangeCss(pr.css); flash(`已套用预设「${pr.name}」`); }, style: { cursor: "pointer", fontWeight: 700 } }, pr.name),
                !pr.builtin && h("button", { type: "button", onClick: () => setPendingDeletePreset(pr), style: { border: "none", background: "transparent", padding: "1px", cursor: "pointer", display: "flex" } },
                  WidgetSvg(h, "close", { size: 11, color: "#7A826E" })
                )
              )
            )
          )
      );
    };

    const compressFileToDataUrl = (file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const raw = ev.target?.result;
        if (typeof raw !== "string") return resolve("");
        const img = new Image();
        img.onload = () => {
          try {
            const maxSide = 960;
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL("image/jpeg", 0.85));
          } catch (err) { resolve(raw); }
        };
        img.onerror = () => resolve(raw);
        img.src = raw;
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });

    const handlePhotoUpload = async (e) => {
      const files = Array.from(e.target?.files || []);
      e.target.value = "";
      if (!files.length || !selectedWidget) return;

      if (selectedWidget.type === "photo") {
        const curIds = Array.isArray(selectedWidget.config?.mediaIds) && selectedWidget.config.mediaIds.length
          ? selectedWidget.config.mediaIds.slice()
          : (selectedWidget.config?.mediaId ? [selectedWidget.config.mediaId] : []);
        const remain = Math.max(0, 12 - curIds.length);
        if (remain <= 0) {
          flash("单个相册最多保存 12 张照片");
          return;
        }
        const toProcess = files.slice(0, remain);
        const addedIds = [];
        const thumbPatch = {};
        for (let i = 0; i < toProcess.length; i++) {
          const dataUrl = await compressFileToDataUrl(toProcess[i]);
          if (!dataUrl) continue;
          const mid = `photo_${selectedWidget.id}_${Date.now()}_${i}`;
          await Engine.saveWidgetMedia(mid, dataUrl);
          addedIds.push(mid);
          thumbPatch[mid] = dataUrl;
        }
        if (addedIds.length) {
          const nextIds = [...curIds, ...addedIds];
          setAlbumThumbUrls((prev) => ({ ...prev, ...thumbPatch }));
          await handlePatchSelected({ config: { mediaIds: nextIds, mediaId: nextIds[0] } });
          flash(`已上传 ${addedIds.length} 张照片至本地 IndexedDB（共 ${nextIds.length} 张）`);
        }
        return;
      }

      const dataUrl = await compressFileToDataUrl(files[0]);
      if (!dataUrl) return;
      const mediaId = `photo_${selectedWidget.id}_${Date.now()}`;
      await Engine.saveWidgetMedia(mediaId, dataUrl);
      await handlePatchSelected({ config: { mediaId } });
      flash("封面已存入本地 IndexedDB");
    };

    const handleRemoveAlbumPhoto = async (mid) => {
      if (!selectedWidget || selectedWidget.type !== "photo") return;
      const curIds = Array.isArray(selectedWidget.config?.mediaIds) && selectedWidget.config.mediaIds.length
        ? selectedWidget.config.mediaIds.slice()
        : (selectedWidget.config?.mediaId ? [selectedWidget.config.mediaId] : []);
      const nextIds = curIds.filter((id) => id !== mid);
      await Engine.saveWidgetMedia(mid, "");
      await handlePatchSelected({ config: { mediaIds: nextIds, mediaId: nextIds[0] || "" } });
      flash("已移除该照片");
    };

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99992,
          background: "#F6F5F0",
          color: "#3A4233",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }
      },
      h("input", { ref: photoInputRef, type: "file", accept: "image/*", multiple: selectedWidget?.type === "photo", style: { display: "none" }, onChange: handlePhotoUpload }),
      h("input", { ref: cssImportInputRef, type: "file", accept: ".css,.txt,.json,text/css,text/plain,application/json", style: { display: "none" }, onChange: handleCssFileImport }),

      // 顶栏
      h(
        "div",
        {
          style: {
            padding: "calc(10px + env(safe-area-inset-top, 0px)) 14px 10px",
            background: "#FFFFFF",
            borderBottom: "1px solid #EAE6DC",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }
        },
        h("button", { type: "button", onClick: onClose, style: { border: "none", background: "#F2EFE8", borderRadius: "10px", width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } }, WidgetSvg(h, "back", { size: 18, color: "#3A4233" })),
        h("span", { style: { fontSize: "15px", fontWeight: 800 } }, "主屏小组件"),
        h(
          "button",
          {
            type: "button",
            onClick: () => setShowAddDrawer(true),
            style: { border: "none", background: "#6D735B", color: "#FFFFFF", borderRadius: "999px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }
          },
          WidgetSvg(h, "plus", { size: 14, color: "#FFFFFF" }),
          "添加"
        )
      ),

      toast &&
        h("div", { style: { position: "fixed", top: "62px", left: "50%", transform: "translateX(-50%)", zIndex: 99999, background: "#3A4233", color: "#FFF", padding: "6px 14px", borderRadius: "999px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" } }, toast),

      // 主体滚动区
      h(
        "div",
        { style: { flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "14px" } },
        // 页码切换
        h(
          "div",
          { style: { display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" } },
          Array.from({ length: maxPageCount }, (_, p) =>
            h(
              "button",
              {
                key: p,
                type: "button",
                onClick: () => { setActivePage(p); setSelectedId(""); setExpandedSelectedCss(false); },
                style: {
                  border: "none",
                  borderRadius: "999px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: activePage === p ? "#6D735B" : "#FFFFFF",
                  color: activePage === p ? "#FFF" : "#5A6252",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                  cursor: "pointer"
                }
              },
              `第 ${p + 1} 页`
            )
          ),
          h(
            "button",
            {
              type: "button",
              onClick: () => { setActivePage(maxPageCount); setSelectedId(""); setShowAddDrawer(true); },
              style: { border: "1px dashed #B5BCA9", borderRadius: "999px", padding: "5px 10px", fontSize: "11.5px", fontWeight: 700, background: "transparent", color: "#6D735B", cursor: "pointer" }
            },
            "+ 扩展页"
          )
        ),

        // 第 N 页顶部横幅槽位替换区（支持将每页顶部替换为任意小组件 / 恢复默认 / 隐藏）
        h(
          "div",
          { style: { background: "#FFFFFF", borderRadius: "18px", padding: "12px", border: isEditingTopSlot ? "1.5px solid #6D735B" : "1px solid #EAE6DC", display: "flex", flexDirection: "column", gap: "8px" } },
          h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
            h("span", { style: { fontSize: "12px", fontWeight: 800, color: "#3A4233" } }, `第 ${activePage + 1} 页 · 顶部横幅槽位`),
            h("div", { style: { display: "flex", gap: "5px" } },
              activeTopSlot && !activeTopSlot.hidden &&
                h("button", {
                  type: "button",
                  onClick: () => setSelectedId(topSlotKey),
                  style: { border: "none", background: isEditingTopSlot ? "#6D735B" : "#EEF2E6", color: isEditingTopSlot ? "#FFF" : "#3A4233", borderRadius: "999px", padding: "3px 9px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }
                }, isEditingTopSlot ? "编辑中" : "调样式/CSS"),
              activeTopSlot &&
                h("button", {
                  type: "button",
                  onClick: () => handleSetTopSlotType("__default__"),
                  style: { border: "1px solid #E2DFD5", background: "#FAF9F5", color: "#7A826E", borderRadius: "999px", padding: "3px 8px", fontSize: "10.5px", fontWeight: 700, cursor: "pointer" }
                }, "恢复默认")
            )
          ),
          h("div", { style: { display: "flex", gap: "5px", flexWrap: "wrap" } },
            Engine.WIDGET_CATALOG.map((meta) => {
              const isCur = activeTopSlot && !activeTopSlot.hidden && activeTopSlot.type === meta.type;
              return h("button", {
                key: meta.type,
                type: "button",
                onClick: () => handleSetTopSlotType(meta.type),
                style: {
                  border: isCur ? "1.5px solid #6D735B" : "1px solid #E2DFD5",
                  background: isCur ? "#EEF2E6" : "#FAF9F5",
                  color: isCur ? "#3A4233" : "#6A7262",
                  borderRadius: "999px",
                  padding: "4px 9px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer"
                }
              }, meta.name);
            }),
            h("button", {
              type: "button",
              onClick: () => handleSetTopSlotType("__hidden__"),
              style: {
                border: activeTopSlot?.hidden ? "1.5px solid #B91C1C" : "1px dashed #D5D0C3",
                background: activeTopSlot?.hidden ? "#FEE2E2" : "transparent",
                color: activeTopSlot?.hidden ? "#B91C1C" : "#8A927A",
                borderRadius: "999px",
                padding: "4px 9px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer"
              }
            }, "隐藏顶部")
          )
        ),

        // 可视化 4×3 / 4×4 网格槽位编辑器
        h(
          "div",
          { style: { background: "#FFFFFF", borderRadius: "18px", padding: "12px", border: "1px solid #EAE6DC", boxShadow: "0 4px 14px rgba(0,0,0,0.03)" } },
          h("div", { style: { fontSize: "11.5px", color: "#7A826E", marginBottom: "8px", display: "flex", justifyContent: "space-between" } },
            h("span", null, `第 ${activePage + 1} 页排布预览（4 列 × ${pageRows} 行）`),
            h("span", null, selectedWidget ? "点空白格移动位置" : "点组件编辑属性")
          ),
          h(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gridTemplateRows: `repeat(${pageRows}, 50px)`,
                gap: "6px",
                position: "relative"
              }
            },
            Array.from({ length: pageRows * 4 }, (_, idx) => {
              const r = Math.floor(idx / 4);
              const c = idx % 4;
              return h("div", {
                key: `slot_${r}_${c}`,
                onClick: () => selectedWidget && handlePatchSelected({ pageIndex: activePage, row: r, col: c }),
                style: {
                  gridColumn: `${c + 1} / span 1`,
                  gridRow: `${r + 1} / span 1`,
                  borderRadius: "10px",
                  border: "1px dashed #D8D4C8",
                  background: "#FAF9F5",
                  cursor: selectedWidget ? "pointer" : "default"
                }
              });
            }),
            pageWidgets.map((w) => {
              const sp = Engine.getSizeSpec(w.size);
              const meta = Engine.CATALOG_MAP[w.type] || { name: w.type };
              const isSel = selectedId === w.id;
              return h(
                "div",
                {
                  key: w.id,
                  onClick: (e) => { e.stopPropagation(); setSelectedId(w.id); },
                  style: {
                    gridColumn: `${(w.col || 0) + 1} / span ${sp.w}`,
                    gridRow: `${(w.row || 0) + 1} / span ${sp.h}`,
                    zIndex: 5,
                    borderRadius: "12px",
                    background: isSel ? "#6D735B" : "#E8EDE0",
                    color: isSel ? "#FFFFFF" : "#3A4233",
                    border: isSel ? "2px solid #3A4233" : "1px solid #C5CEB8",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "2px",
                    cursor: "pointer",
                    padding: "4px",
                    boxSizing: "border-box"
                  }
                },
                WidgetSvg(h, w.type, { size: 15, color: isSel ? "#FFF" : "#5A6252" }),
                h("span", { style: { fontSize: "10.5px", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" } }, meta.name),
                h("span", { style: { fontSize: "9.5px", opacity: 0.78 } }, sp.short)
              );
            })
          )
        ),

        // 选中组件属性编辑区（含自定义 CSS 倒三角折叠栏）
        selectedWidget &&
          (() => {
            const meta = Engine.CATALOG_MAP[selectedWidget.type] || Engine.WIDGET_CATALOG[0];
            return h(
              "div",
              { style: { background: "#FFFFFF", borderRadius: "18px", padding: "14px", border: "1px solid #EAE6DC", display: "flex", flexDirection: "column", gap: "12px" } },
              h(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
                h("div", { style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", fontWeight: 800 } },
                  WidgetSvg(h, selectedWidget.type, { size: 17, color: "#6D735B" }),
                  meta.name
                ),
                h("button", { type: "button", onClick: handleDeleteSelected, style: { border: "none", background: "#FEE2E2", color: "#B91C1C", borderRadius: "8px", padding: "5px 9px", fontSize: "11.5px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" } },
                  WidgetSvg(h, "trash", { size: 13, color: "#B91C1C" }),
                  "移除"
                )
              ),
              // 尺寸切换（顶部横幅固定整行 4×1，网格组件支持自由切换）
              !isEditingTopSlot && h(
                "div",
                null,
                h("div", { style: { fontSize: "11.5px", color: "#7A826E", marginBottom: "6px" } }, "占位尺寸（1 格 = 1 个应用图标）"),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px" } },
                  meta.sizes.map((sz) => {
                    const sp = Engine.getSizeSpec(sz);
                    const act = selectedWidget.size === sz;
                    return h("button", {
                      key: sz,
                      type: "button",
                      onClick: () => handlePatchSelected({ size: sz }),
                      style: { flex: 1, border: act ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: act ? "#EEF2E6" : "#FAF9F5", color: act ? "#3A4233" : "#7A826E", borderRadius: "10px", padding: "7px 4px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }
                    }, `${sp.label} ${sp.short}`);
                  })
                )
              ),
              // 卡片质感
              h(
                "div",
                null,
                h("div", { style: { fontSize: "11.5px", color: "#7A826E", marginBottom: "6px" } }, "卡片质感"),
                h(
                  "div",
                  { style: { display: "flex", gap: "6px" } },
                  Object.values(Engine.SKIN_PRESETS).map((sk) => {
                    const act = selectedWidget.skin === sk.id;
                    return h("button", {
                      key: sk.id,
                      type: "button",
                      onClick: () => handlePatchSelected({ skin: sk.id }),
                      style: { flex: 1, border: act ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: act ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "10px", padding: "7px 4px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }
                    }, sk.name);
                  })
                )
              ),
              // 留声机专属设置：歌名 / 歌手 / 自定义封面
              selectedWidget.type === "music" &&
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  h("div", { style: { display: "flex", gap: "6px" } },
                    h("input", {
                      type: "text",
                      value: selectedWidget.config?.title || "",
                      onChange: (e) => handlePatchSelected({ config: { title: e.target.value } }),
                      placeholder: "歌名（默认 love.）",
                      style: { flex: 1, minWidth: 0, border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", outline: "none" }
                    }),
                    h("input", {
                      type: "text",
                      value: selectedWidget.config?.artist || "",
                      onChange: (e) => handlePatchSelected({ config: { artist: e.target.value } }),
                      placeholder: "歌手（默认 wave to earth）",
                      style: { flex: 1, minWidth: 0, border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", outline: "none" }
                    })
                  ),
                  h("button", {
                    type: "button",
                    onClick: () => photoInputRef.current && photoInputRef.current.click(),
                    style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "10px", padding: "8px", fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer" }
                  }, WidgetSvg(h, "upload", { size: 14, color: "#6D735B" }), "上传专辑封面（存至 IndexedDB）")
                ),
              // 相册专属设置（多图批量上传 + 缩略图管理 + 平滑横移/淡入 + 轮播速度）
              selectedWidget.type === "photo" &&
                (() => {
                  const ids = Array.isArray(selectedWidget.config?.mediaIds) && selectedWidget.config.mediaIds.length
                    ? selectedWidget.config.mediaIds
                    : (selectedWidget.config?.mediaId ? [selectedWidget.config.mediaId] : []);
                  const curTrans = selectedWidget.config?.transition === "fade" ? "fade" : "slide";
                  const curInt = selectedWidget.config?.intervalSec !== undefined ? Number(selectedWidget.config.intervalSec) : 5;
                  return h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                    h("button", {
                      type: "button",
                      onClick: () => photoInputRef.current && photoInputRef.current.click(),
                      style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "10px", padding: "9px", fontSize: "12.5px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", cursor: "pointer" }
                    }, WidgetSvg(h, "upload", { size: 15, color: "#6D735B" }), `批量上传照片（已存 ${ids.length}/12 张）`),
                    ids.length > 0 &&
                      h("div", { style: { display: "flex", gap: "6px", overflowX: "auto", padding: "2px 0" } },
                        ids.map((mid, idx) =>
                          h("div", { key: mid, style: { position: "relative", width: "48px", height: "48px", borderRadius: "9px", overflow: "hidden", flexShrink: 0, border: "1px solid #DCD7CA", background: "#F2EFE8" } },
                            albumThumbUrls[mid] && h("img", { src: albumThumbUrls[mid], alt: `图${idx + 1}`, style: { width: "100%", height: "100%", objectFit: "cover" } }),
                            h("button", {
                              type: "button",
                              onClick: () => handleRemoveAlbumPhoto(mid),
                              style: { position: "absolute", top: "2px", right: "2px", width: "16px", height: "16px", borderRadius: "50%", border: "none", background: "rgba(30,34,28,0.68)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }
                            }, WidgetSvg(h, "close", { size: 10, color: "#FFFFFF" }))
                          )
                        )
                      ),
                    ids.length > 1 &&
                      h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                        h("div", { style: { display: "flex", gap: "6px" } },
                          [{ id: "slide", lbl: "平滑横移" }, { id: "fade", lbl: "柔焦淡入" }].map((m) =>
                            h("button", {
                              key: m.id,
                              type: "button",
                              onClick: () => handlePatchSelected({ config: { transition: m.id } }),
                              style: { flex: 1, border: curTrans === m.id ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: curTrans === m.id ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "9px", padding: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
                            }, m.lbl)
                          )
                        ),
                        h("div", { style: { display: "flex", gap: "5px" } },
                          [{ v: 0, lbl: "手动切图" }, { v: 4, lbl: "4秒" }, { v: 6, lbl: "6秒" }, { v: 10, lbl: "10秒" }].map((opt) =>
                            h("button", {
                              key: opt.v,
                              type: "button",
                              onClick: () => handlePatchSelected({ config: { intervalSec: opt.v } }),
                              style: { flex: 1, border: curInt === opt.v ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: curInt === opt.v ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "9px", padding: "5px 2px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
                            }, opt.lbl)
                          )
                        )
                      ),
                    h("input", {
                      type: "text",
                      value: selectedWidget.config?.caption || "",
                      onChange: (e) => handlePatchSelected({ config: { caption: e.target.value } }),
                      placeholder: "可选：填写底部手写小字…",
                      style: { border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", outline: "none" }
                    })
                  );
                })(),
              // 谶纬签匣专属设置（切换我的历史卦签 / 名士专属签 + 默认体裁）
              selectedWidget.type === "chenwei_oracle" &&
                (() => {
                  const curMode = selectedWidget.config?.sourceMode === "char_prophecy" ? "char_prophecy" : "my_oracle";
                  const curForm = selectedWidget.config?.verseForm || "poem";
                  const savedCharPropList = Object.values(chenweiCharProps || {});
                  return h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                    h("div", { style: { fontSize: "11.5px", color: "#7A826E" } }, "卦签展示来源"),
                    h("div", { style: { display: "flex", gap: "6px" } },
                      [
                        { id: "my_oracle", lbl: "我的历史卦签" },
                        { id: "char_prophecy", lbl: "名士的专属签" }
                      ].map((m) =>
                        h("button", {
                          key: m.id,
                          type: "button",
                          onClick: () => handlePatchSelected({ config: { sourceMode: m.id } }),
                          style: { flex: 1, border: curMode === m.id ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: curMode === m.id ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "9px", padding: "7px 4px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }
                        }, m.lbl)
                      )
                    ),
                    curMode === "my_oracle"
                      ? h(
                          "select",
                          {
                            value: selectedWidget.config?.recordId || "",
                            onChange: (e) => handlePatchSelected({ config: { recordId: e.target.value } }),
                            style: { border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", background: "#FAF9F5" }
                          },
                          h("option", { value: "" }, "自动展示最新解过的一签"),
                          chenweiRecords.map((r) =>
                            h("option", { key: r.id, value: String(r.id) }, `${r.hexagram || "卦签"} · ${String(r.question || "").slice(0, 16)}`)
                          )
                        )
                      : h(
                          "select",
                          {
                            value: selectedWidget.config?.charId || "",
                            onChange: (e) => handlePatchSelected({ config: { charId: e.target.value } }),
                            style: { border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", background: "#FAF9F5" }
                          },
                          savedCharPropList.length === 0
                            ? h("option", { value: "" }, "暂未探查名士谶纬（请先去小摊查看名士）")
                            : savedCharPropList.map((p) =>
                                h("option", { key: p.charId, value: String(p.charId) }, `${p.charName} · ${p.buildTitle || p.hexagram}`)
                              )
                        ),
                    h("div", { style: { fontSize: "11.5px", color: "#7A826E" } }, "桌面默认展示体裁（桌面卡片上也可随时轻点切换）"),
                    h("div", { style: { display: "flex", gap: "6px" } },
                      [
                        { id: "poem", lbl: "古诗签" },
                        { id: "ballad", lbl: "东汉童谣" },
                        { id: "chenyu", lbl: "图谶秘语" }
                      ].map((fm) =>
                        h("button", {
                          key: fm.id,
                          type: "button",
                          onClick: () => handlePatchSelected({ config: { verseForm: fm.id } }),
                          style: { flex: 1, border: curForm === fm.id ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: curForm === fm.id ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "9px", padding: "6px 4px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
                        }, fm.lbl)
                      )
                    )
                  );
                })(),
              // 共同账本专属设置（绑定名士 + 账本视角；桌面固定展示最新 5 条）
              selectedWidget.type === "couple_bills" &&
                (() => {
                  const curTab = selectedWidget.config?.ledgerTab || "ta";
                  return h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                    h("div", { style: { fontSize: "11.5px", color: "#7A826E" } }, "绑定账本名士（桌面自动展示最新 5 笔收支）"),
                    h(
                      "select",
                      {
                        value: selectedWidget.config?.charId || "",
                        onChange: (e) => handlePatchSelected({ config: { charId: e.target.value } }),
                        style: { border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", background: "#FAF9F5" }
                      },
                      h("option", { value: "" }, "自动跟随当前情侣空间伴侣"),
                      characters.map((c) => h("option", { key: c.id, value: String(c.id) }, `${c.name} 的账本`))
                    ),
                    h("div", { style: { fontSize: "11.5px", color: "#7A826E" } }, "展示账本视角"),
                    h("div", { style: { display: "flex", gap: "6px" } },
                      [
                        { id: "ta", lbl: "TA 的账本" },
                        { id: "user", lbl: "我的账本" },
                        { id: "both", lbl: "双方合并" }
                      ].map((tb) =>
                        h("button", {
                          key: tb.id,
                          type: "button",
                          onClick: () => handlePatchSelected({ config: { ledgerTab: tb.id } }),
                          style: { flex: 1, border: curTab === tb.id ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: curTab === tb.id ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "9px", padding: "6px 4px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
                        }, tb.lbl)
                      )
                    )
                  );
                })(),
              // 心愿签专属设置（绑定名士 + 许愿人筛选，只展示最新 1 条）
              selectedWidget.type === "couple_wish" &&
                (() => {
                  const curFilter = selectedWidget.config?.creatorFilter || "all";
                  return h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                    h("div", { style: { fontSize: "11.5px", color: "#7A826E" } }, "绑定愿望清单名士（桌面只展示最新 1 条）"),
                    h(
                      "select",
                      {
                        value: selectedWidget.config?.charId || "",
                        onChange: (e) => handlePatchSelected({ config: { charId: e.target.value } }),
                        style: { border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", background: "#FAF9F5" }
                      },
                      h("option", { value: "" }, "自动跟随当前情侣空间伴侣"),
                      characters.map((c) => h("option", { key: c.id, value: String(c.id) }, `${c.name} 的愿望清单`))
                    ),
                    h("div", { style: { fontSize: "11.5px", color: "#7A826E" } }, "展示许愿人（优先展示未实现心愿）"),
                    h("div", { style: { display: "flex", gap: "6px" } },
                      [
                        { id: "user", lbl: "我的最新一条" },
                        { id: "ta", lbl: "TA 的最新一条" },
                        { id: "all", lbl: "不限最新" }
                      ].map((f) =>
                        h("button", {
                          key: f.id,
                          type: "button",
                          onClick: () => handlePatchSelected({ config: { creatorFilter: f.id } }),
                          style: { flex: 1, border: curFilter === f.id ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: curFilter === f.id ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "9px", padding: "6px 4px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
                        }, f.lbl)
                      )
                    )
                  );
                })(),
              // 日程便签专属设置（筛选用户或指定角色的日历-未竟之事）
              selectedWidget.type === "calendar" &&
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                  h("div", { style: { fontSize: "11.5px", color: "#7A826E" } }, "显示「日历 → 未竟之事」所属对象"),
                  h(
                    "select",
                    {
                      value: selectedWidget.config?.ownerFilter || "__user__",
                      onChange: (e) => handlePatchSelected({ config: { ownerFilter: e.target.value } }),
                      style: { border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", background: "#FAF9F5" }
                    },
                    h("option", { value: "__user__" }, "我的未竟之事（用户本人）"),
                    h("option", { value: "__all__" }, "全部未竟之事（不限对象）"),
                    characters.map((c) => h("option", { key: c.id, value: String(c.id) }, `${c.name} 的未竟之事`))
                  )
                ),
              // 名士语录签专属设置（支持手写语录 / 传讯末句自动同步、多行换行、一键插入 • 黑点）
              selectedWidget.type === "char_quote" &&
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                  h(
                    "select",
                    {
                      value: selectedWidget.config?.charId || "",
                      onChange: (e) => handlePatchSelected({ config: { charId: e.target.value } }),
                      style: { border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", background: "#FAF9F5" }
                    },
                    h("option", { value: "" }, "默认传讯名士"),
                    characters.map((c) => h("option", { key: c.id, value: String(c.id) }, c.name))
                  ),
                  h("div", { style: { display: "flex", gap: "6px" } },
                    [{ id: "custom", lbl: "手写语录" }, { id: "last_chat", lbl: "传讯末句（自动同步）" }].map((sm) => {
                      const act = (selectedWidget.config?.sourceMode || "custom") === sm.id;
                      return h("button", {
                        key: sm.id,
                        type: "button",
                        onClick: () => handlePatchSelected({ config: { sourceMode: sm.id } }),
                        style: { flex: 1, border: act ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: act ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "9px", padding: "6px 4px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
                      }, sm.lbl);
                    })
                  ),
                  h("div", { style: { display: "flex", gap: "6px" } },
                    (selectedWidget.config?.sourceMode || "custom") === "custom" &&
                      h("button", {
                        type: "button",
                        onClick: () => {
                          const cur = String(selectedWidget.config?.quote || "");
                          const next = cur ? `${cur}\n• ` : "• ";
                          handlePatchSelected({ config: { quote: next } });
                        },
                        style: { border: "1px solid #C5CEB8", background: "#F4F7EE", color: "#3A4233", borderRadius: "8px", padding: "5px 10px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
                      }, "+ 插入黑点 (•)"),
                    [{ id: "auto", lbl: "智能居中" }, { id: "left", lbl: "左对齐" }].map((al) => {
                      const act = (selectedWidget.config?.align || "auto") === al.id;
                      return h("button", {
                        key: al.id,
                        type: "button",
                        onClick: () => handlePatchSelected({ config: { align: al.id } }),
                        style: { flex: 1, border: act ? "1.5px solid #6D735B" : "1px solid #E2DFD5", background: act ? "#EEF2E6" : "#FAF9F5", color: "#3A4233", borderRadius: "8px", padding: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }
                      }, al.lbl);
                    })
                  ),
                  (selectedWidget.config?.sourceMode || "custom") === "custom"
                    ? h("textarea", {
                        rows: 4,
                        value: selectedWidget.config?.quote || "",
                        onChange: (e) => handlePatchSelected({ config: { quote: e.target.value } }),
                        placeholder: "支持多行输入，行首加「• 」或「- 」自动排成黑点清单…",
                        style: { width: "100%", boxSizing: "border-box", border: "1px solid #E2DFD5", borderRadius: "10px", padding: "8px 10px", fontSize: "12.5px", lineHeight: 1.5, outline: "none", resize: "vertical" }
                      })
                    : h("div", { style: { fontSize: "11.5px", color: "#7A826E", background: "#FAF9F5", borderRadius: "9px", padding: "8px 10px", lineHeight: 1.5 } },
                        "已开启自动同步：桌面将实时展示该名士在传讯中发给你的最后一句文本消息。"
                      )
                ),
              // 实例级自定义 CSS 折叠面板
              h(
                "div",
                { style: { borderTop: "1px dashed #E5E0D5", paddingTop: "10px" } },
                h(
                  "div",
                  {
                    onClick: () => setExpandedSelectedCss((v) => !v),
                    style: { display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }
                  },
                  h("span", { style: { fontSize: "12px", fontWeight: 800, color: "#5A6252" } }, "自定义 CSS（支持 ::before / ::after 伪元素）"),
                  h("span", { style: { transform: expandedSelectedCss ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s ease" } },
                    WidgetSvg(h, "caret_down", { size: 16, color: "#6D735B" })
                  )
                ),
                expandedSelectedCss &&
                  h(
                    "div",
                    { style: { marginTop: "8px" } },
                    renderCssStudio({
                      scopeKey: `sel_${selectedWidget.id}`,
                      widgetType: selectedWidget.type,
                      cssValue: selectedWidget.customCss || "",
                      onChangeCss: (val) => handlePatchSelected({ customCss: val }),
                      sampleWidget: selectedWidget
                    })
                  )
              )
            );
          })()
      ),

      // 添加小组件底部抽屉（每张卡片右上角带倒三角展开自定义 CSS + 一键复制原本 CSS）
      showAddDrawer &&
        h(
          "div",
          {
            onClick: (e) => { if (e.target === e.currentTarget) setShowAddDrawer(false); },
            style: { position: "fixed", inset: 0, zIndex: 99995, background: "rgba(30,34,28,0.4)", display: "flex", alignItems: "flex-end" }
          },
          h(
            "div",
            { style: { width: "100%", maxHeight: "82%", overflowY: "auto", background: "#FFFFFF", borderRadius: "22px 22px 0 0", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" } },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 800, fontSize: "14.5px" } },
              h("span", null, `添加小组件到第 ${activePage + 1} 页`),
              h("button", { type: "button", onClick: () => setShowAddDrawer(false), style: { border: "none", background: "#F2EFE8", borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" } }, WidgetSvg(h, "close", { size: 15, color: "#5A6252" }))
            ),
            Engine.WIDGET_CATALOG.map((meta) => {
              const isCssOpen = expandedAddCssType === meta.type;
              return h(
                "div",
                { key: meta.type, style: { background: "#FAF9F5", border: "1px solid #EAE6DC", borderRadius: "14px", padding: "11px 12px", display: "flex", flexDirection: "column", gap: "8px" } },
                // 头部行：图标 + 名称描述 + 右上角手绘倒三角按钮
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 } },
                    h("div", { style: { width: "32px", height: "32px", borderRadius: "10px", background: "#E8EDE0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } }, WidgetSvg(h, meta.type, { size: 17, color: "#5A6252" })),
                    h("div", { style: { minWidth: 0 } },
                      h("div", { style: { fontSize: "13px", fontWeight: 800 } }, meta.name),
                      h("div", { style: { fontSize: "11px", color: "#7A826E" } }, meta.desc)
                    )
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      title: "展开自定义 CSS",
                      onClick: () => setExpandedAddCssType(isCssOpen ? "" : meta.type),
                      style: {
                        border: "1px solid #DCD7CA",
                        background: isCssOpen ? "#6D735B" : "#FFFFFF",
                        borderRadius: "8px",
                        width: "28px",
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        flexShrink: 0
                      }
                    },
                    h("span", { style: { transform: isCssOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s ease", display: "flex" } },
                      WidgetSvg(h, "caret_down", { size: 16, color: isCssOpen ? "#FFFFFF" : "#5A6252" })
                    )
                  )
                ),

                // 倒三角展开的自定义 CSS 面板（一键复制 + 实时预览 + 存为预设）
                isCssOpen &&
                  renderCssStudio({
                    scopeKey: `add_${meta.type}`,
                    widgetType: meta.type,
                    cssValue: typeCssMap[meta.type] || "",
                    onChangeCss: (val) => handleTypeCssChange(meta.type, val)
                  }),

                // 尺寸添加按钮条
                h(
                  "div",
                  { style: { display: "flex", gap: "6px" } },
                  meta.sizes.map((sz) => {
                    const sp = Engine.getSizeSpec(sz);
                    return h(
                      "button",
                      {
                        key: sz,
                        type: "button",
                        onClick: () => handleAddWidget(meta.type, sz),
                        style: { flex: 1, border: "1px solid #C5CEB8", background: "#FFFFFF", color: "#3A4233", borderRadius: "9px", padding: "6px 4px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }
                      },
                      `+ ${sp.label} (${sp.short})`
                    );
                  })
                )
              );
            })
          )
        ),

      // 删除自定义 CSS 预设防手滑确认弹窗
      pendingDeletePreset &&
        h(
          "div",
          {
            onClick: (e) => { if (e.target === e.currentTarget) setPendingDeletePreset(null); },
            style: { position: "fixed", inset: 0, zIndex: 99998, background: "rgba(30,34,28,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }
          },
          h(
            "div",
            { style: { width: "100%", maxWidth: "290px", background: "#FFFFFF", borderRadius: "18px", padding: "18px 16px", boxShadow: "0 14px 36px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column", gap: "12px", textAlign: "center" } },
            h("div", { style: { fontSize: "14.5px", fontWeight: 800, color: "#3A4233" } }, "确认删除预设？"),
            h("div", { style: { fontSize: "12px", color: "#7A826E", lineHeight: 1.55 } }, `将永久删除自定义样式预设「${pendingDeletePreset.name}」，此操作不可撤销。`),
            h("div", { style: { display: "flex", gap: "8px", marginTop: "4px" } },
              h("button", { type: "button", onClick: () => setPendingDeletePreset(null), style: { flex: 1, padding: "9px", borderRadius: "10px", border: "1px solid #E2DFD5", background: "#FAF9F5", color: "#5A6252", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" } }, "取消"),
              h("button", { type: "button", onClick: () => handleDeletePreset(pendingDeletePreset.id), style: { flex: 1, padding: "9px", borderRadius: "10px", border: "none", background: "#C84B31", color: "#FFFFFF", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" } }, "确认删除")
            )
          )
        )
    );
  }

  const api = {
    WidgetSvg,
    WidgetCard,
    HomeDesktopMatrix,
    HomeTopSlotBanner,
    HomeWidgetSettingsModal
  };

  global.HomeWidgetUI = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
