/**
 * Milvus/xinglin_clinic_app.js
 * 杏林济生（T10）独立模块化增强引擎 · Phase 0 (P0)
 * 职责：
 *  1. 传讯角色动态缓存与候诊排表高亮联动（兼容自定义 OC + 保护全部原版彩蛋）
 *  2. 煎药台 V2（单主炉 + 0~100° 绿区温控仪表 + 三阶段煎煮 + 耐焦完整度 + 药囊记录 + 弹幕高亮）
 *  3. 杏林济生顶栏三页签导航（挂号问诊 / 名士病历 / 煎药台）与五位坐诊医生图鉴预览
 */
(function (global) {
  "use strict";

  const DECOCTION_RECORDS_KEY = "xinglin_decoction_records_v1";
  const ACTIVE_PRESCRIPTION_KEY = "xinglin_active_prescription_v1";

  // 保护原版 T10 候诊冲突彩蛋涉及的关键人物，替换路人时绝不覆盖他们
  const PROTECTED_EASTER_EGG_NAMES = new Set([
    "刘辩", "孙策", "张绣", "张飞", "甘宁", "郭嘉", "贾诩", "张邈",
    "袁基", "左慈", "安期", "士燮", "张燕", "戏学", "郭女王",
    "庞羲", "刘璋", "虞翻", "飞云", "陈登", "蔡琰", "马超",
    "张郃", "孔融", "张辽", "小乔"
  ]);

  // ==========================================
  // 1. 传讯角色缓存与候诊高亮引擎
  // ==========================================
  let _chatCharCache = [];
  let _chatCharMap = new Map();
  let _chatCharLoaded = false;

  function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, "");
  }

  function isValidSoloChatCharacter(c) {
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
  }

  function rebuildChatCharMap(list) {
    const arr = (Array.isArray(list) ? list : []).filter(isValidSoloChatCharacter);
    _chatCharCache = arr;
    const map = new Map();
    arr.forEach((c) => {
      if (!c) return;
      const n = normalizeName(c.name);
      if (n) map.set(n, c);
      if (c.nickname) {
        const nick = normalizeName(c.nickname);
        if (nick && !map.has(nick)) map.set(nick, c);
      }
      if (c.remark) {
        const rm = normalizeName(c.remark);
        if (rm && !map.has(rm)) map.set(rm, c);
      }
    });
    _chatCharMap = map;
    _chatCharLoaded = true;
  }

  async function refreshChatCharacters() {
    let list = [];
    try {
      if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
        const res = await global.chatCharacterStore.getAll();
        if (Array.isArray(res) && res.length > 0) list = res;
      }
    } catch (e) {}
    if (list.length === 0) {
      try {
        const ls = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
        if (Array.isArray(ls) && ls.length > 0) list = ls;
      } catch (e) {}
    }
    rebuildChatCharMap(list);
    try {
      global.dispatchEvent(new CustomEvent("xinglin-chat-chars-updated", { detail: list }));
    } catch (e) {}
    return list;
  }

  function getCachedChatCharacters() {
    if (!_chatCharLoaded) {
      try {
        const ls = JSON.parse(localStorage.getItem("t8_chat_list") || "[]");
        if (Array.isArray(ls) && ls.length > 0) rebuildChatCharMap(ls);
      } catch (e) {}
      refreshChatCharacters();
    }
    return _chatCharCache;
  }

  function matchChatCharacter(name) {
    if (!_chatCharLoaded) getCachedChatCharacters();
    const key = normalizeName(name);
    if (!key) return null;
    if (_chatCharMap.has(key)) return _chatCharMap.get(key);
    // 兼容“带后缀或称呼”的弱匹配（仅当长度 >= 2 时）
    if (key.length >= 2) {
      for (const [k, charObj] of _chatCharMap.entries()) {
        if (k.length >= 2 && (k === key || key.includes(k))) {
          return charObj;
        }
      }
    }
    return null;
  }

  /**
   * 候诊列表温和增强：保留全部原版 17 种彩蛋，若当前排表中恰好无传讯熟人，
   * 以 65% 概率将 1~2 位非彩蛋路人替换为传讯中的角色，提升偶遇惊喜感。
   */
  function enhanceWaitList(waitList, assignedDoctor) {
    if (!Array.isArray(waitList) || waitList.length === 0) return waitList;
    const chatChars = getCachedChatCharacters().filter(
      (c) => c && c.name && normalizeName(c.name) !== normalizeName(assignedDoctor)
    );
    if (chatChars.length === 0) return waitList;

    const alreadyHas = waitList.some((p) => Boolean(matchChatCharacter(p.name)));
    if (alreadyHas || Math.random() > 0.65) return waitList;

    const next = waitList.map((p) => ({ ...p }));
    const replaceableIndices = [];
    next.forEach((p, idx) => {
      if (!PROTECTED_EASTER_EGG_NAMES.has(p.name)) replaceableIndices.push(idx);
    });
    if (replaceableIndices.length === 0) return next;

    const existingNames = new Set(next.map((p) => normalizeName(p.name)));
    const pool = chatChars.filter((c) => !existingNames.has(normalizeName(c.name)));
    if (pool.length === 0) return next;

    const replaceCount = Math.min(pool.length, replaceableIndices.length, Math.random() < 0.4 ? 2 : 1);
    for (let i = 0; i < replaceCount; i++) {
      const idxPick = replaceableIndices.splice(Math.floor(Math.random() * replaceableIndices.length), 1)[0];
      const charPick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      next[idxPick] = {
        ...next[idxPick],
        name: charPick.name
      };
    }
    return next;
  }

  // ==========================================
  // 1.5 通用头像异步解析与安全渲染组件（对齐 傩·观影 NuoAvatar / resolveAvatarUrl / avatarStore 机制）
  // ==========================================
  function XinglinAvatar({ avatar, name = "名", size = 20, fallbackColor = "#d4943a", style = {} }) {
    const React = global.React;
    const { useState, useEffect } = React;
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
      let isMounted = true;
      setHasError(false);

      if (!avatar) {
        setAvatarUrl(null);
        return;
      }

      if (
        typeof avatar === "string" &&
        (avatar.startsWith("data:image") ||
          avatar.startsWith("http://") ||
          avatar.startsWith("https://") ||
          avatar.startsWith("blob:") ||
          avatar.startsWith("/") ||
          avatar.startsWith("./") ||
          /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(avatar))
      ) {
        setAvatarUrl(avatar);
        return;
      }

      const resolve = async () => {
        try {
          if (typeof global.resolveAvatarUrl === "function") {
            const res = await global.resolveAvatarUrl(avatar, "");
            if (isMounted && res) {
              setAvatarUrl(res);
              return;
            }
          }
          const store = global.avatarStore || (typeof avatarStore !== "undefined" ? avatarStore : null);
          if (store && typeof store.get === "function") {
            const item = await store.get(avatar);
            const data = item && (item.avatarData || item.data || item.url);
            if (isMounted && data) {
              setAvatarUrl(data);
              return;
            }
          }
        } catch (e) {
          console.warn("[XinglinAvatar] 头像解析失败:", e);
        }
        if (isMounted) setAvatarUrl(null);
      };

      resolve();
      return () => {
        isMounted = false;
      };
    }, [avatar]);

    const boxStyle = {
      width: size + "px",
      height: size + "px",
      borderRadius: "50%",
      overflow: "hidden",
      flexShrink: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      ...style
    };

    if (avatarUrl && !hasError) {
      return React.createElement(
        "span",
        { style: boxStyle },
        React.createElement("img", {
          src: avatarUrl,
          alt: name,
          onError: () => setHasError(true),
          style: {
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            objectFit: "cover",
            display: "block"
          }
        })
      );
    }

    return React.createElement(
      "span",
      {
        style: {
          ...boxStyle,
          background: fallbackColor,
          color: "#fff",
          fontSize: Math.max(9, Math.round(size * 0.52)) + "px",
          fontWeight: "700",
          lineHeight: 1
        }
      },
      String(name || "名").slice(0, 1)
    );
  }

  /**
   * 渲染候诊排表行：自动识别传讯角色并高亮（严格保持与原行完全一致的高度，绝不挤压下方排表）
   */
  function renderQueueRow(p, idx, onPeekCharacter) {
    const React = global.React;
    const matched = matchChatCharacter(p && p.name);
    if (!matched) {
      return React.createElement(
        "div",
        { className: "t10-row", key: idx },
        React.createElement("div", { style: { color: "#999", fontFamily: "Fredoka" } }, "#", p.no),
        React.createElement(
          "div",
          { style: { fontWeight: "500", color: idx === 0 ? "#d6724b" : "inherit" } },
          p.name
        ),
        React.createElement("div", { style: { color: "#8c917b" } }, p.symptom)
      );
    }

    const avatarKey = matched.avatar || matched.avatarId || matched.avatarUrl || "";
    return React.createElement(
      "div",
      {
        className: "t10-row",
        key: idx,
        onClick: () => {
          if (typeof onPeekCharacter === "function") {
            onPeekCharacter(matched, p);
          } else {
            global.dispatchEvent(
              new CustomEvent("xinglin-peek-char", { detail: { character: matched, patient: p } })
            );
          }
        },
        style: {
          background: "linear-gradient(90deg, #fff6df 0%, #eef7f0 100%)",
          boxShadow: "inset 3px 0 0 #d4943a",
          cursor: "pointer"
        },
        title: "点击查看传讯熟人偶遇信息"
      },
      React.createElement(
        "div",
        { style: { color: "#c47d24", fontFamily: "Fredoka", fontWeight: "700" } },
        "#",
        p.no
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontWeight: "700",
            color: "#5b3b12",
            minWidth: 0
          }
        },
        React.createElement(XinglinAvatar, {
          avatar: avatarKey,
          name: matched.name,
          size: 18,
          fallbackColor: "#d4943a",
          style: { border: "1px solid #e3b265" }
        }),
        React.createElement(
          "span",
          { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
          p.name
        ),
        React.createElement(
          "span",
          {
            style: {
              fontSize: "10px",
              lineHeight: 1.1,
              fontWeight: "600",
              padding: "1px 5px",
              borderRadius: "999px",
              background: "#f6dfaa",
              color: "#8a5310",
              border: "1px solid #e7c070",
              flexShrink: 0
            }
          },
          "传讯熟人"
        )
      ),
      React.createElement(
        "div",
        {
          style: {
            color: "#6b7d65",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "4px"
          }
        },
        p.symptom,
        React.createElement("span", { style: { fontSize: "11px", color: "#c47d24" } }, "›")
      )
    );
  }

  // ==========================================
  // 2. 煎药记录与当前方剂存取
  // ==========================================
  function getDecoctionRecords() {
    try {
      const arr = JSON.parse(localStorage.getItem(DECOCTION_RECORDS_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveDecoctionRecord(rec) {
    const list = getDecoctionRecords();
    const entry = { id: `dec_${Date.now()}`, createdAt: Date.now(), ...rec };
    const next = [entry, ...list].slice(0, 40);
    try {
      localStorage.setItem(DECOCTION_RECORDS_KEY, JSON.stringify(next));
    } catch (e) {}
    return entry;
  }

  function setActivePrescription(presc) {
    try {
      if (presc) localStorage.setItem(ACTIVE_PRESCRIPTION_KEY, JSON.stringify(presc));
      else localStorage.removeItem(ACTIVE_PRESCRIPTION_KEY);
    } catch (e) {}
  }

  function getActivePrescription() {
    try {
      const raw = JSON.parse(localStorage.getItem(ACTIVE_PRESCRIPTION_KEY) || "null");
      if (raw && raw.name) return raw;
    } catch (e) {}
    return null;
  }

  function pickDefaultPrescription(doctorName) {
    const docs = global.XINGLIN_DOCTORS || {};
    const names = global.XINGLIN_DOCTOR_NAMES || Object.keys(docs);
    const chosenDocName = doctorName && docs[doctorName]
      ? doctorName
      : names[Math.floor(Math.random() * names.length)] || "董奉";
    const doc = docs[chosenDocName];
    if (doc && Array.isArray(doc.defaultPrescriptions) && doc.defaultPrescriptions.length > 0) {
      const p = doc.defaultPrescriptions[Math.floor(Math.random() * doc.defaultPrescriptions.length)];
      return { doctorName: doc.name, themeColor: doc.themeColor, ...p };
    }
    return {
      doctorName: "董奉",
      themeColor: "#7FA68A",
      name: "杏林清心安神饮",
      herbs: ["甜杏仁 三钱", "茯神 三钱", "荷叶 二钱", "炙甘草 一钱"],
      note: "文火慢煎，温服为宜。"
    };
  }

  // ==========================================
  // 3. 煎药台 V2（单主炉 + 实时绿区温控 + 三阶段 + 药囊）
  // ==========================================
  const DANMAKU_POOL = [
    "因插队问题，{角色} 与 {角色} 在药堂门口吵了起来。",
    "{角色} 在一号诊室遗失了一卷帛书，归还者重金酬谢。",
    "{角色} 的药糊了一锅，正黑着脸重新排队抓药。",
    "取药窗口：{角色} 的银翘散已装好，薄荷后下煎服。",
    "取药窗口：{角色} 的龙胆泻肝汤已备好，大夫嘱咐少动怒。",
    "史子眇长老试图用炼丹炉顺手烤桂花糕，被徐庶当场拦下。",
    "华佗先生路过煎药台，热心询问 {角色} 要不要干脆做个开颅。",
    "张仲景首座路过皱眉：『药炉边上的药渣扫干净。』",
    "左慈阁主站在檐下避酒气，顺手替 {角色} 稳了稳炭火。",
    "董奉大夫在廊边微笑递给 {角色} 两颗酸杏脯压苦。"
  ];

  const FALLBACK_NPC_NAMES = [
    "刘辩", "袁基", "傅融", "孙策", "郭嘉", "贾诩", "荀彧", "陈登", "张邈", "吕布", "陆逊", "周瑜", "张辽", "杨修"
  ];

  function renderHighlightedDanmaku(text) {
    const React = global.React;
    const chatChars = getCachedChatCharacters();
    if (!text || chatChars.length === 0) return text;
    const names = chatChars
      .map((c) => normalizeName(c.name))
      .filter((n) => n.length >= 2)
      .sort((a, b) => b.length - a.length);
    if (names.length === 0) return text;
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(`(${escaped.join("|")})`, "g");
    const parts = String(text).split(regex);
    return parts.map((part, i) =>
      names.includes(part)
        ? React.createElement(
            "span",
            {
              key: i,
              style: {
                background: "#fae4b4",
                color: "#7a4408",
                padding: "0 5px",
                borderRadius: "6px",
                fontWeight: "700",
                margin: "0 2px"
              }
            },
            part
          )
        : part
    );
  }

  function DecoctionStationV2({ isActive, onOpenDaily, onFallbackClassic }) {
    const React = global.React;
    const { useState, useEffect, useRef, useCallback } = React;

    const [subView, setSubView] = useState("stove"); // "stove" | "pouch"
    const [prescription, setPrescription] = useState(() => getActivePrescription() || pickDefaultPrescription());
    const [status, setStatus] = useState("ready"); // "ready" | "playing" | "paused" | "success" | "failed"
    const [temp, setTemp] = useState(48); // 0 ~ 100
    const [progress, setProgress] = useState(0); // 0 ~ 100
    const [integrity, setIntegrity] = useState(100); // 0 ~ 100 (3耐焦心)
    const [perfectTicks, setPerfectTicks] = useState(0);
    const [totalTicks, setTotalTicks] = useState(0);
    const [eventNotice, setEventNotice] = useState(null); // { text, dir: "up"|"down", ttl }
    const [danmaku, setDanmaku] = useState("");
    const [records, setRecords] = useState(() => getDecoctionRecords());
    const [resultSummary, setResultSummary] = useState(null);

    const stateRef = useRef({
      temp: 48,
      progress: 0,
      integrity: 100,
      drift: -0.45,
      eventCd: 45,
      perfectTicks: 0,
      totalTicks: 0
    });

    // 获取当前三阶段配置
    const getStageInfo = (prog) => {
      if (prog < 30) {
        return { step: 1, name: "一煎 · 武火煮沸", min: 40, max: 74, tip: "点「扇风加火」将指针推入绿色最佳火候区" };
      }
      if (prog < 75) {
        return { step: 2, name: "二煎 · 文火慢熬", min: 36, max: 68, tip: "留意炉风波动提示，及时加火或撤薪稳住绿区" };
      }
      return { step: 3, name: "三煎 · 收汁滤渣", min: 40, max: 66, tip: "绿区收窄，最后冲刺稳住火候即可出锅！" };
    };

    const generateDanmaku = useCallback(() => {
      const chatChars = getCachedChatCharacters();
      const pool = chatChars.length > 0
        ? [...chatChars.map((c) => c.name), ...FALLBACK_NPC_NAMES]
        : FALLBACK_NPC_NAMES;
      const tpl = DANMAKU_POOL[Math.floor(Math.random() * DANMAKU_POOL.length)];
      return tpl.replace(/\{角色\}/g, () => pool[Math.floor(Math.random() * pool.length)]);
    }, []);

    const startNewGame = useCallback((customPresc) => {
      const targetPresc = customPresc || getActivePrescription() || prescription || pickDefaultPrescription();
      setPrescription(targetPresc);
      stateRef.current = {
        temp: 42,
        progress: 0,
        integrity: 100,
        drift: -0.55,
        eventCd: 40,
        perfectTicks: 0,
        totalTicks: 0
      };
      setTemp(42);
      setProgress(0);
      setIntegrity(100);
      setPerfectTicks(0);
      setTotalTicks(0);
      setEventNotice({ text: "炭火初燃，快点「扇风加火」煮沸药汤！", dir: "up" });
      setResultSummary(null);
      setDanmaku(generateDanmaku());
      setStatus("playing");
    }, [prescription, generateDanmaku]);

    // 每次重新打开煎药台时同步最新处方并刷新角色缓存
    useEffect(() => {
      if (isActive) {
        refreshChatCharacters();
        const latest = getActivePrescription();
        if (latest && latest.name !== prescription?.name) {
          setPrescription(latest);
        }
        setRecords(getDecoctionRecords());
        setDanmaku(generateDanmaku());
      } else {
        setStatus((prev) => (prev === "playing" ? "paused" : prev));
      }
    }, [isActive]);

    // 弹幕轮播（每 7 秒换一条）
    useEffect(() => {
      if (!isActive || subView !== "stove") return;
      const t = setInterval(() => {
        setDanmaku(generateDanmaku());
      }, 7000);
      return () => clearInterval(t);
    }, [isActive, subView, generateDanmaku]);

    // 单一 100ms 步进主循环，杜绝多定时器泄漏
    useEffect(() => {
      if (!isActive || status !== "playing") return;
      const timer = setInterval(() => {
        const st = stateRef.current;
        const stage = getStageInfo(st.progress);

        // 随机风向/沸腾事件（每 5.5 ~ 8 秒触发一次）
        st.eventCd -= 1;
        if (st.eventCd <= 0) {
          const isSurge = Math.random() < 0.52;
          if (isSurge) {
            st.drift = stage.step === 3 ? 1.15 : 0.9;
            setEventNotice({ text: "药汤翻滚，火势骤升 ↑ 快点「撤薪降温」", dir: "down" });
          } else {
            st.drift = stage.step === 1 ? -0.95 : -0.85;
            setEventNotice({ text: "穿堂风过，炭火转弱 ↓ 快点「扇风加火」", dir: "up" });
          }
          st.eventCd = Math.floor(Math.random() * 25) + 52;
        }

        // 自然温度演化
        const nextTemp = Math.max(0, Math.min(100, st.temp + st.drift));
        st.temp = nextTemp;
        st.totalTicks += 1;

        const inSweetSpot = nextTemp >= stage.min && nextTemp <= stage.max;
        const isOverheat = nextTemp > stage.max;

        // 45秒左右完成 100%：绿区每 100ms +0.24%，偏低 +0.06%，过热 +0.10% 但掉耐焦完整度
        let deltaProg = 0.06;
        if (inSweetSpot) {
          deltaProg = 0.24;
          st.perfectTicks += 1;
        } else if (isOverheat) {
          deltaProg = 0.10;
          const overAmt = (nextTemp - stage.max) / 25;
          st.integrity = Math.max(0, st.integrity - (0.55 + overAmt * 0.9));
        }

        st.progress = Math.min(100, st.progress + deltaProg);

        setTemp(Math.round(st.temp));
        setProgress(Number(st.progress.toFixed(1)));
        setIntegrity(Math.round(st.integrity));
        setPerfectTicks(st.perfectTicks);
        setTotalTicks(st.totalTicks);

        if (st.integrity <= 0) {
          clearInterval(timer);
          setStatus("failed");
          setResultSummary({
            grade: "糊锅",
            comment: "火势太猛药汁熬干了！下次指针冲过红线记得及时「撤薪降温」。"
          });
        } else if (st.progress >= 100) {
          clearInterval(timer);
          const ratio = st.totalTicks > 0 ? st.perfectTicks / st.totalTicks : 0.8;
          const grade = ratio >= 0.72 && st.integrity >= 80 ? "上品良药" : ratio >= 0.45 ? "中品汤剂" : "微苦可饮";
          const comment =
            grade === "上品良药"
              ? `${prescription.doctorName}颔首称赞：「火候恰如其分，药香醇厚，趁温服下吧。」`
              : grade === "中品汤剂"
              ? `${prescription.doctorName}轻嗅药汤：「成色尚可，药效留存八成，下次火候可再稳些。」`
              : `${prescription.doctorName}抿了口眉：「略带焦苦，好在药性未失，配两颗蜜饯压压苦味。」`;
          const rec = saveDecoctionRecord({
            formulaName: prescription.name,
            doctorName: prescription.doctorName,
            herbs: prescription.herbs || [],
            grade,
            accuracy: Math.round(ratio * 100),
            comment
          });
          setRecords(getDecoctionRecords());
          setResultSummary(rec);
          setStatus("success");
        }
      }, 100);
      return () => clearInterval(timer);
    }, [isActive, status, prescription]);

    const handleHeatAction = (delta) => {
      if (status !== "playing") return;
      const st = stateRef.current;
      st.temp = Math.max(0, Math.min(100, st.temp + delta));
      // 玩家顺应方向操作后，略微缓和极端漂移，让手感可控
      if ((delta > 0 && st.drift < -0.5) || (delta < 0 && st.drift > 0.5)) {
        st.drift = st.drift * 0.55;
      }
      setTemp(Math.round(st.temp));
    };

    const stage = getStageInfo(progress);
    const zoneState = temp < stage.min ? "cold" : temp > stage.max ? "hot" : "good";
    const hearts = Math.ceil(integrity / 33.4);
    const doctorList = global.XINGLIN_DOCTOR_NAMES || ["董奉", "华佗", "张仲景", "史子眇", "左慈"];

    return React.createElement(
      "div",
      {
        style: {
          flex: 1,
          height: "100%",
          overflowY: "auto",
          background: "linear-gradient(180deg, #faf7f0 0%, #f3efe4 100%)",
          color: "#43483b",
          display: "flex",
          flexDirection: "column",
          padding: "12px 14px 16px",
          boxSizing: "border-box",
          gap: "10px"
        }
      },
      // 顶部医馆弹幕条（传讯角色名自动高亮）
      React.createElement(
        "div",
        {
          style: {
            background: "rgba(255, 255, 255, 0.82)",
            border: "1px solid #e5dec9",
            borderRadius: "12px",
            padding: "8px 12px",
            fontSize: "12px",
            color: "#6b6e5e",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            minHeight: "34px"
          }
        },
        React.createElement("span", { style: { fontSize: "14px", flexShrink: 0 } }, "📢"),
        React.createElement("div", { style: { lineHeight: 1.4 } }, renderHighlightedDanmaku(danmaku || "药堂炉火正旺，诸位病友请看护好自家药罐。"))
      ),

      // 子页切换：我的煎药台 / 我的药囊 / 其他病友
      React.createElement(
        "div",
        { style: { display: "flex", gap: "8px" } },
        React.createElement(
          "button",
          {
            onClick: () => setSubView("stove"),
            style: {
              flex: 1,
              padding: "8px 10px",
              borderRadius: "10px",
              border: "none",
              background: subView === "stove" ? "#6d947c" : "#e9e4d5",
              color: subView === "stove" ? "#fff" : "#5e6253",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer"
            }
          },
          "🔥 控火煎药"
        ),
        React.createElement(
          "button",
          {
            onClick: () => {
              setRecords(getDecoctionRecords());
              setSubView("pouch");
            },
            style: {
              flex: 1,
              padding: "8px 10px",
              borderRadius: "10px",
              border: "none",
              background: subView === "pouch" ? "#6d947c" : "#e9e4d5",
              color: subView === "pouch" ? "#fff" : "#5e6253",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer"
            }
          },
          `🍵 我的药囊 (${records.length})`
        ),
        React.createElement(
          "button",
          {
            onClick: () => {
              if (typeof onOpenDaily === "function") onOpenDaily();
              else global.dispatchEvent(new CustomEvent("xinglin-switch-tab", { detail: "daily" }));
            },
            style: {
              flex: 1,
              padding: "8px 10px",
              borderRadius: "10px",
              border: "1px solid #d7ccb4",
              background: "#fffaf0",
              color: "#8a5f28",
              fontSize: "12px",
              fontWeight: "700",
              cursor: "pointer"
            }
          },
          "📜 其他病友"
        )
      ),

      subView === "stove"
        ? React.createElement(
            React.Fragment,
            null,
            // 当前方剂卡片
            React.createElement(
              "div",
              {
                style: {
                  background: "#fff",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  border: "1px solid #e7e0ce",
                  boxShadow: "0 2px 8px rgba(80, 72, 52, 0.05)"
                }
              },
              React.createElement(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
                React.createElement(
                  "div",
                  { style: { fontWeight: "700", fontSize: "15px", color: "#3d4637" } },
                  "《",
                  prescription.name,
                  "》"
                ),
                React.createElement(
                  "span",
                  {
                    style: {
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "#eef5f0",
                      color: prescription.themeColor || "#6d947c",
                      fontWeight: "700"
                    }
                  },
                  prescription.doctorName,
                  " 开方"
                )
              ),
              React.createElement(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "6px" } },
                (prescription.herbs || []).map((h, i) =>
                  React.createElement(
                    "span",
                    {
                      key: i,
                      style: {
                        fontSize: "11px",
                        background: "#f7f4ec",
                        color: "#6b6e5e",
                        padding: "2px 7px",
                        borderRadius: "6px"
                      }
                    },
                    h
                  )
                )
              ),
              status === "ready" &&
                React.createElement(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "6px" } },
                  React.createElement("span", { style: { fontSize: "11px", color: "#8c917b" } }, "换一张名医经方："),
                  doctorList.map((dn) =>
                    React.createElement(
                      "button",
                      {
                        key: dn,
                        onClick: () => setPrescription(pickDefaultPrescription(dn)),
                        style: {
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border: prescription.doctorName === dn ? "1px solid #6d947c" : "1px solid #ded7c5",
                          background: prescription.doctorName === dn ? "#e8f3ec" : "#faf7f0",
                          color: "#4a5343",
                          cursor: "pointer"
                        }
                      },
                      dn
                    )
                  )
                )
            ),

            // 核心单主炉 + 实时状态卡片
            React.createElement(
              "div",
              {
                style: {
                  background: "#fff",
                  borderRadius: "16px",
                  padding: "14px",
                  border: "1px solid #e7e0ce",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                  position: "relative"
                }
              },
              // 顶部阶段 & 耐焦心
              React.createElement(
                "div",
                {
                  style: {
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px"
                  }
                },
                React.createElement(
                  "span",
                  {
                    style: {
                      fontWeight: "700",
                      color: "#4a6b57",
                      background: "#ebf4ee",
                      padding: "3px 9px",
                      borderRadius: "999px"
                    }
                  },
                  stage.name
                ),
                React.createElement(
                  "span",
                  { style: { color: integrity <= 35 ? "#c84b31" : "#7b7f6e", fontWeight: "600" } },
                  "耐焦完整度：",
                  [0, 1, 2].map((i) => (i < hearts ? "❤️" : "🤍")).join(""),
                  ` (${integrity}%)`
                )
              ),

              // 醒目风向/火候事件提示条
              React.createElement(
                "div",
                {
                  style: {
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    fontWeight: "600",
                    textAlign: "center",
                    background:
                      zoneState === "hot"
                        ? "#fdece8"
                        : zoneState === "cold"
                        ? "#ebf3fa"
                        : "#edf7f0",
                    color:
                      zoneState === "hot"
                        ? "#b63b22"
                        : zoneState === "cold"
                        ? "#2d608a"
                        : "#2f6e49",
                    border:
                      zoneState === "hot"
                        ? "1px solid #f2b7a8"
                        : zoneState === "cold"
                        ? "1px solid #bdd7ee"
                        : "1px solid #b8dec5"
                  }
                },
                status === "ready"
                  ? "规则：点击下方「扇风加火 / 撤薪降温」，让火候指针保持在绿色区间即可成药"
                  : zoneState === "hot"
                  ? "⚠️ 火过旺即将溢锅！快连点「💧 撤薪降温」"
                  : zoneState === "cold"
                  ? "❄️ 炉温偏低药汁停滞！快点「🔥 扇风加火」"
                  : eventNotice?.text || stage.tip
              ),

              // 单一青陶药炉插画（动态火焰 + 药雾）
              React.createElement(
                "div",
                {
                  style: {
                    width: "136px",
                    height: "126px",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center"
                  }
                },
                // 药雾
                React.createElement(
                  "div",
                  {
                    style: {
                      fontSize: zoneState === "hot" ? "22px" : "18px",
                      opacity: status === "playing" ? 0.9 : 0.4,
                      transform: zoneState === "hot" ? "translateY(-4px) scale(1.15)" : "translateY(0)",
                      transition: "all 0.25s ease",
                      marginBottom: "-4px"
                    }
                  },
                  zoneState === "hot" ? "💨💢💨" : zoneState === "good" ? "✨♨️✨" : "☁️"
                ),
                // 青陶药罐
                React.createElement(
                  "div",
                  {
                    style: {
                      width: "84px",
                      height: "58px",
                      borderRadius: "24px 24px 32px 32px",
                      background: "linear-gradient(135deg, #83a38f 0%, #5c7d6a 100%)",
                      border: "3px solid #496655",
                      position: "relative",
                      boxShadow: "inset -8px -6px 0 rgba(0,0,0,0.12), 0 6px 14px rgba(73,102,85,0.22)",
                      transform:
                        zoneState === "hot" && status === "playing"
                          ? "rotate(-2deg) scale(1.03)"
                          : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#f6f3e8",
                      fontSize: "12px",
                      fontWeight: "700",
                      letterSpacing: "1px"
                    }
                  },
                  React.createElement("div", {
                    style: {
                      position: "absolute",
                      top: "-10px",
                      left: "18px",
                      right: "18px",
                      height: "10px",
                      borderRadius: "8px 8px 2px 2px",
                      background: "#6b8b77",
                      border: "2px solid #496655"
                    }
                  }),
                  `${Math.round(progress)}%`
                ),
                // 底部炭火动效
                React.createElement(
                  "div",
                  {
                    style: {
                      marginTop: "4px",
                      fontSize: zoneState === "hot" ? "26px" : zoneState === "good" ? "20px" : "14px",
                      transition: "all 0.2s ease",
                      filter: zoneState === "hot" ? "drop-shadow(0 0 8px #e85d3a)" : "none"
                    }
                  },
                  zoneState === "hot" ? "🔥🔥🔥" : zoneState === "good" ? "🔥🔥" : "🔸"
                )
              ),

              // 0~100° 横向火候仪表盘
              React.createElement(
                "div",
                { style: { width: "100%" } },
                React.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      color: "#7c8171",
                      marginBottom: "4px"
                    }
                  },
                  React.createElement("span", null, "🔵 偏弱"),
                  React.createElement(
                    "span",
                    { style: { color: "#2f7d4f", fontWeight: "700" } },
                    `🟢 最佳火候 (${stage.min}°–${stage.max}°) · 当前 ${temp}°`
                  ),
                  React.createElement("span", null, "🔴 过旺")
                ),
                React.createElement(
                  "div",
                  {
                    style: {
                      position: "relative",
                      width: "100%",
                      height: "20px",
                      borderRadius: "999px",
                      background: "#ece7d9",
                      overflow: "visible",
                      border: "1px solid #dbd3be"
                    }
                  },
                  // 偏冷区
                  React.createElement("div", {
                    style: {
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${stage.min}%`,
                      background: "rgba(130, 178, 214, 0.38)",
                      borderRadius: "999px 0 0 999px"
                    }
                  }),
                  // 绿色最佳区
                  React.createElement("div", {
                    style: {
                      position: "absolute",
                      left: `${stage.min}%`,
                      top: 0,
                      bottom: 0,
                      width: `${stage.max - stage.min}%`,
                      background: "linear-gradient(90deg, #86c79c, #5fb37e)",
                      boxShadow: "inset 0 0 0 1.5px #3f8f5c"
                    }
                  }),
                  // 过热区
                  React.createElement("div", {
                    style: {
                      position: "absolute",
                      left: `${stage.max}%`,
                      top: 0,
                      bottom: 0,
                      right: 0,
                      background: "rgba(226, 109, 82, 0.42)",
                      borderRadius: "0 999px 999px 0"
                    }
                  }),
                  // 实时温度指针
                  React.createElement("div", {
                    style: {
                      position: "absolute",
                      left: `calc(${temp}% - 7px)`,
                      top: "-4px",
                      width: "14px",
                      height: "28px",
                      borderRadius: "7px",
                      background: zoneState === "hot" ? "#d94b2b" : zoneState === "cold" ? "#3b82b6" : "#245c3a",
                      border: "2.5px solid #fff",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.28)",
                      transition: "left 0.09s linear"
                    }
                  })
                )
              ),

              // 煎煮总进度条
              React.createElement(
                "div",
                { style: { width: "100%", marginTop: "4px" } },
                React.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      color: "#7c8171",
                      marginBottom: "3px"
                    }
                  },
                  React.createElement("span", null, "煎煮进度（一煎 → 二煎 → 收汁）"),
                  React.createElement("span", { style: { fontWeight: "700", color: "#4d6e58" } }, `${Math.round(progress)}%`)
                ),
                React.createElement(
                  "div",
                  {
                    style: {
                      width: "100%",
                      height: "10px",
                      borderRadius: "999px",
                      background: "#ebe6d8",
                      overflow: "hidden"
                    }
                  },
                  React.createElement("div", {
                    style: {
                      width: `${progress}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #8bbf9f, #5d9b76)",
                      borderRadius: "999px",
                      transition: "width 0.1s linear"
                    }
                  })
                )
              ),

              // 控制按钮区
              status === "ready"
                ? React.createElement(
                    "button",
                    {
                      onClick: () => startNewGame(prescription),
                      style: {
                        width: "100%",
                        padding: "13px",
                        borderRadius: "12px",
                        border: "none",
                        background: "linear-gradient(135deg, #74a587, #59896c)",
                        color: "#fff",
                        fontSize: "15px",
                        fontWeight: "700",
                        cursor: "pointer",
                        boxShadow: "0 4px 12px rgba(89, 137, 108, 0.28)"
                      }
                    },
                    "🔥 点火开煎"
                  )
                : status === "playing" || status === "paused"
                ? React.createElement(
                    "div",
                    { style: { width: "100%", display: "flex", flexDirection: "column", gap: "8px" } },
                    React.createElement(
                      "div",
                      { style: { display: "flex", gap: "10px" } },
                      React.createElement(
                        "button",
                        {
                          onClick: () => handleHeatAction(12),
                          disabled: status !== "playing",
                          style: {
                            flex: 1,
                            padding: "14px 10px",
                            borderRadius: "12px",
                            border: "none",
                            background: "linear-gradient(135deg, #e58258, #d4623b)",
                            color: "#fff",
                            fontSize: "14px",
                            fontWeight: "700",
                            cursor: "pointer",
                            boxShadow: "0 3px 10px rgba(212, 98, 59, 0.25)"
                          }
                        },
                        "🔥 扇风加火 (+)"
                      ),
                      React.createElement(
                        "button",
                        {
                          onClick: () => handleHeatAction(-12),
                          disabled: status !== "playing",
                          style: {
                            flex: 1,
                            padding: "14px 10px",
                            borderRadius: "12px",
                            border: "none",
                            background: "linear-gradient(135deg, #6fa3c7, #4f84a8)",
                            color: "#fff",
                            fontSize: "14px",
                            fontWeight: "700",
                            cursor: "pointer",
                            boxShadow: "0 3px 10px rgba(79, 132, 168, 0.25)"
                          }
                        },
                        "💧 撤薪降温 (-)"
                      )
                    ),
                    React.createElement(
                      "div",
                      { style: { display: "flex", gap: "8px" } },
                      React.createElement(
                        "button",
                        {
                          onClick: () => setStatus((s) => (s === "playing" ? "paused" : "playing")),
                          style: {
                            flex: 1,
                            padding: "8px",
                            borderRadius: "9px",
                            border: "1px solid #dad2be",
                            background: "#faf7f0",
                            color: "#636858",
                            fontSize: "12px",
                            cursor: "pointer"
                          }
                        },
                        status === "playing" ? "⏸ 暂歇片刻" : "▶ 继续煎药"
                      ),
                      React.createElement(
                        "button",
                        {
                          onClick: () => startNewGame(prescription),
                          style: {
                            flex: 1,
                            padding: "8px",
                            borderRadius: "9px",
                            border: "1px solid #dad2be",
                            background: "#faf7f0",
                            color: "#636858",
                            fontSize: "12px",
                            cursor: "pointer"
                          }
                        },
                        "🔄 重新开炉"
                      )
                    )
                  )
                : React.createElement(
                    "div",
                    {
                      style: {
                        width: "100%",
                        padding: "12px",
                        borderRadius: "12px",
                        background: status === "success" ? "#eef8f1" : "#fdf0ec",
                        border: status === "success" ? "1px solid #b5dcbf" : "1px solid #efc0b3",
                        textAlign: "center"
                      }
                    },
                    React.createElement(
                      "div",
                      {
                        style: {
                          fontSize: "16px",
                          fontWeight: "800",
                          color: status === "success" ? "#2d6f49" : "#b83d22",
                          marginBottom: "6px"
                        }
                      },
                      status === "success"
                        ? `✨ 成药出锅 · ${resultSummary?.grade || "良药"}`
                        : "💨 药材煎糊了"
                    ),
                    React.createElement(
                      "div",
                      { style: { fontSize: "12px", color: "#575c4d", lineHeight: 1.5, marginBottom: "10px" } },
                      resultSummary?.comment || ""
                    ),
                    React.createElement(
                      "div",
                      { style: { display: "flex", gap: "8px" } },
                      React.createElement(
                        "button",
                        {
                          onClick: () => startNewGame(prescription),
                          style: {
                            flex: 1,
                            padding: "10px",
                            borderRadius: "10px",
                            border: "none",
                            background: "#6d947c",
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: "13px",
                            cursor: "pointer"
                          }
                        },
                        "再煎一帖"
                      ),
                      React.createElement(
                        "button",
                        {
                          onClick: () => setSubView("pouch"),
                          style: {
                            flex: 1,
                            padding: "10px",
                            borderRadius: "10px",
                            border: "1px solid #c9d9ce",
                            background: "#fff",
                            color: "#4a6b57",
                            fontWeight: "700",
                            fontSize: "13px",
                            cursor: "pointer"
                          }
                        },
                        "查看药囊"
                      )
                    )
                  )
            ),

            typeof onFallbackClassic === "function" &&
              React.createElement(
                "div",
                { style: { textAlign: "center", marginTop: "2px" } },
                React.createElement(
                  "button",
                  {
                    onClick: onFallbackClassic,
                    style: {
                      background: "transparent",
                      border: "none",
                      color: "#9aa08c",
                      fontSize: "11px",
                      textDecoration: "underline",
                      cursor: "pointer"
                    }
                  },
                  "切换原版极简煎药炉"
                )
              )
          )
        : // 我的药囊记录
          React.createElement(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            records.length === 0
              ? React.createElement(
                  "div",
                  {
                    style: {
                      background: "#fff",
                      borderRadius: "14px",
                      padding: "28px 16px",
                      textAlign: "center",
                      color: "#8c917b",
                      fontSize: "13px",
                      border: "1px dashed #d8d0bc"
                    }
                  },
                  "药囊空空如也，快去控火煎一帖汤药吧。"
                )
              : records.map((rec) =>
                  React.createElement(
                    "div",
                    {
                      key: rec.id,
                      style: {
                        background: "#fff",
                        borderRadius: "12px",
                        padding: "11px 13px",
                        border: "1px solid #e7e0ce"
                      }
                    },
                    React.createElement(
                      "div",
                      { style: { display: "flex", justifyContent: "space-between", marginBottom: "4px" } },
                      React.createElement("strong", { style: { fontSize: "13px", color: "#3d4637" } }, rec.formulaName),
                      React.createElement(
                        "span",
                        {
                          style: {
                            fontSize: "11px",
                            padding: "1px 7px",
                            borderRadius: "999px",
                            background: "#edf7f0",
                            color: "#2f6e49",
                            fontWeight: "700"
                          }
                        },
                        rec.grade
                      )
                    ),
                    React.createElement(
                      "div",
                      { style: { fontSize: "11px", color: "#8c917b", marginBottom: "4px" } },
                      `主治：${rec.doctorName} · 绿区稳火率 ${rec.accuracy || 0}%`
                    ),
                    React.createElement(
                      "div",
                      { style: { fontSize: "12px", color: "#5c6152", lineHeight: 1.45 } },
                      rec.comment
                    )
                  )
                )
          )
    );
  }

  // ==========================================
  // 4. 名士病历 / 五位坐诊名医图鉴（P0 骨架，P1 将直接挂载 AI 开药日常与传讯回流）
  // ==========================================
  function CelebrityClinicPreview({ preselectedChar, onBackToConsult, onGoDecoction }) {
    const React = global.React;
    const { useState } = React;
    const docs = global.XINGLIN_DOCTORS || {};
    const docNames = global.XINGLIN_DOCTOR_NAMES || Object.keys(docs);
    const [selectedDoc, setSelectedDoc] = useState(docNames[0] || "董奉");
    const activeDoc = docs[selectedDoc] || docs["董奉"];

    return React.createElement(
      "div",
      {
        style: {
          flex: 1,
          height: "100%",
          overflowY: "auto",
          background: "linear-gradient(180deg, #faf7f0 0%, #f3efe4 100%)",
          padding: "14px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          color: "#43483b"
        }
      },
      preselectedChar &&
        React.createElement(
          "div",
          {
            style: {
              background: "linear-gradient(90deg, #fff8e7, #eef7f1)",
              border: "1px solid #e6c67c",
              borderRadius: "12px",
              padding: "10px 12px",
              fontSize: "12px",
              color: "#6e4612"
            }
          },
          `✨ 已锁定候诊偶遇的传讯熟人：`,
          React.createElement("strong", null, preselectedChar.name),
          `（Phase 1 接入后可一键生成 TA 与大夫的开药日常并转发回传讯）`
        ),

      // 坐诊五位名医图鉴
      React.createElement(
        "div",
        {
          style: {
            background: "#fff",
            borderRadius: "16px",
            padding: "14px",
            border: "1px solid #e7e0ce"
          }
        },
        React.createElement(
          "div",
          { style: { fontSize: "14px", fontWeight: "800", color: "#3d4637", marginBottom: "8px" } },
          "🌿 杏林济生 · 现役五位坐诊名医人设卡（已就绪）"
        ),
        React.createElement(
          "div",
          { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" } },
          docNames.map((dn) => {
            const d = docs[dn];
            const isSel = dn === selectedDoc;
            return React.createElement(
              "button",
              {
                key: dn,
                onClick: () => setSelectedDoc(dn),
                style: {
                  padding: "6px 11px",
                  borderRadius: "999px",
                  border: isSel ? `1.5px solid ${d.themeColor}` : "1px solid #e0d8c6",
                  background: isSel ? d.bgTint : "#faf7f0",
                  color: isSel ? d.themeColor : "#636858",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer"
                }
              },
              dn
            );
          })
        ),
        activeDoc &&
          React.createElement(
            "div",
            {
              style: {
                background: activeDoc.bgTint || "#f7f5ee",
                borderRadius: "12px",
                padding: "12px",
                border: `1px solid ${activeDoc.themeColor}44`,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontSize: "12px",
                lineHeight: 1.55
              }
            },
            React.createElement(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              React.createElement(
                "strong",
                { style: { fontSize: "15px", color: activeDoc.themeColor } },
                `${activeDoc.name} · ${activeDoc.title}`
              ),
              React.createElement(
                "span",
                {
                  style: {
                    fontSize: "10px",
                    padding: "2px 7px",
                    borderRadius: "999px",
                    background: "#fff",
                    color: activeDoc.themeColor,
                    fontWeight: "700"
                  }
                },
                activeDoc.badgeText
              )
            ),
            React.createElement("div", null, React.createElement("strong", null, "擅长："), activeDoc.specialty),
            React.createElement("div", null, React.createElement("strong", null, "性格底色："), activeDoc.corePersonality),
            React.createElement("div", null, React.createElement("strong", null, "诊病习惯："), activeDoc.medicalHabit),
            React.createElement(
              "div",
              {
                style: {
                  marginTop: "4px",
                  padding: "8px 10px",
                  borderRadius: "9px",
                  background: "rgba(255,255,255,0.78)",
                  fontStyle: "italic",
                  color: "#4a4e42"
                }
              },
              `「${activeDoc.greeting}」`
            ),
            React.createElement(
              "div",
              { style: { display: "flex", gap: "8px", marginTop: "6px" } },
              React.createElement(
                "button",
                {
                  onClick: () => {
                    const p = pickDefaultPrescription(activeDoc.name);
                    setActivePrescription(p);
                    if (typeof onGoDecoction === "function") onGoDecoction();
                  },
                  style: {
                    flex: 1,
                    padding: "8px",
                    borderRadius: "9px",
                    border: "none",
                    background: activeDoc.themeColor,
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer"
                  }
                },
                `🫖 去煎药台试煎${activeDoc.name}经方`
              )
            )
          )
      ),

      // Phase 1 预告提示
      React.createElement(
        "div",
        {
          style: {
            background: "#fff",
            borderRadius: "14px",
            padding: "14px",
            border: "1px dashed #cfc6b0",
            fontSize: "12px",
            color: "#6b7060",
            lineHeight: 1.6
          }
        },
        React.createElement("div", { style: { fontWeight: "700", color: "#4a5343", marginBottom: "4px" } }, "📋 名士开药日常生成器（Phase 1 即将启用）"),
        "五位坐诊医生的完整人设卡已全部入库。进入 Phase 1 后，这里将开放「传讯名士 × 内置医生」五维上下文 AI 生成（含诊室对话、四诊诊断、抓药方剂与大夫私批），并支持以古风药方卡转发回传讯聊天主线。"
      )
    );
  }

  // ==========================================
  // 5. 杏林济生顶栏三页签外壳（无侵入包裹原版 T10Page）
  // ==========================================
  function XinglinShell({ isOpen, onClose, onPrescribe, renderOriginalT10 }) {
    const React = global.React;
    const { useState, useEffect } = React;
    const [activeTab, setActiveTab] = useState("consult"); // "consult" | "daily" | "decoction"
    const [peekModal, setPeekModal] = useState(null);
    const [preselectedChar, setPreselectedChar] = useState(null);

    useEffect(() => {
      if (isOpen) refreshChatCharacters();
    }, [isOpen]);

    useEffect(() => {
      const onSwitch = (e) => {
        const tab = e?.detail;
        if (tab === "consult" || tab === "daily" || tab === "decoction") {
          setActiveTab(tab);
        }
      };
      const onPeek = (e) => {
        if (e?.detail?.character) setPeekModal(e.detail);
      };
      global.addEventListener("xinglin-switch-tab", onSwitch);
      global.addEventListener("xinglin-peek-char", onPeek);
      return () => {
        global.removeEventListener("xinglin-switch-tab", onSwitch);
        global.removeEventListener("xinglin-peek-char", onPeek);
      };
    }, []);

    const tabs = [
      { id: "consult", label: "挂号问诊" },
      { id: "daily", label: "名士病历" },
      { id: "decoction", label: "煎药台" }
    ];

    return React.createElement(
      React.Fragment,
      null,
      // 顶栏（保留原版 t10-nav 结构，右侧嵌入三页签胶囊）
      React.createElement(
        "div",
        {
          className: "t10-nav",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            paddingRight: "12px"
          }
        },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "4px" } },
          React.createElement(
            "div",
            { className: "back-btn", onClick: onClose },
            React.createElement(
              "svg",
              {
                xmlns: "http://www.w3.org/2000/svg",
                width: "24",
                height: "24",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round"
              },
              React.createElement("path", { d: "m15 18-6-6 6-6" })
            )
          ),
          React.createElement(
            "div",
            { className: "title", style: { position: "static", transform: "none", fontSize: "15px" } },
            "杏林济生"
          )
        ),
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              background: "rgba(140, 145, 123, 0.14)",
              borderRadius: "999px",
              padding: "3px",
              gap: "2px"
            }
          },
          tabs.map((t) =>
            React.createElement(
              "button",
              {
                key: t.id,
                onClick: () => setActiveTab(t.id),
                style: {
                  border: "none",
                  borderRadius: "999px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: activeTab === t.id ? "700" : "500",
                  background: activeTab === t.id ? "#6d947c" : "transparent",
                  color: activeTab === t.id ? "#fff" : "#5a5f4d",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }
              },
              t.label
            )
          )
        )
      ),

      // 主体内容区（挂号问诊常驻挂载以保留挂号/问诊状态）
      React.createElement(
        "div",
        {
          style: {
            display: activeTab === "consult" ? "block" : "none",
            flex: 1,
            minHeight: 0,
            height: "calc(100% - 56px)",
            overflowY: "auto"
          }
        },
        typeof renderOriginalT10 === "function" ? renderOriginalT10() : null
      ),

      activeTab === "daily" &&
        React.createElement(
          "div",
          { style: { flex: 1, minHeight: 0, height: "calc(100% - 56px)", display: "flex", flexDirection: "column" } },
          React.createElement(
            (global.XinglinClinicEngine && global.XinglinClinicEngine.CelebrityClinicDailyView) || CelebrityClinicPreview,
            {
              preselectedChar,
              onBackToConsult: () => setActiveTab("consult"),
              onGoDecoction: () => setActiveTab("decoction")
            }
          )
        ),

      activeTab === "decoction" &&
        React.createElement(
          "div",
          { style: { flex: 1, minHeight: 0, height: "calc(100% - 56px)", display: "flex", flexDirection: "column" } },
          React.createElement(DecoctionStationV2, {
            isActive: isOpen && activeTab === "decoction",
            onOpenDaily: () => setActiveTab("daily")
          })
        ),

      // 候诊偶遇传讯熟人轻量气泡弹窗
      peekModal &&
        React.createElement(
          "div",
          {
            onClick: () => setPeekModal(null),
            style: {
              position: "fixed",
              inset: 0,
              background: "rgba(30, 34, 28, 0.42)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px"
            }
          },
          React.createElement(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: {
                width: "100%",
                maxWidth: "310px",
                background: "#fffdf8",
                borderRadius: "16px",
                padding: "18px",
                border: "1px solid #e7d4a6",
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                textAlign: "center"
              }
            },
            React.createElement(
              "div",
              { style: { fontSize: "15px", fontWeight: "800", color: "#5b3b12", marginBottom: "6px" } },
              `✨ 候诊偶遇 · ${peekModal.character.name}`
            ),
            React.createElement(
              "div",
              { style: { fontSize: "12px", color: "#6b6e5e", lineHeight: 1.6, marginBottom: "14px" } },
              `你在杏林济生候诊长椅上撞见了传讯里的熟人 `,
              React.createElement("strong", null, peekModal.character.name),
              `，号牌 #${peekModal.patient?.no || ""}，挂的病症似乎是「${peekModal.patient?.symptom || "调理"}」。`
            ),
            React.createElement(
              "div",
              { style: { display: "flex", gap: "8px" } },
              React.createElement(
                "button",
                {
                  onClick: () => {
                    setPreselectedChar(peekModal.character);
                    setPeekModal(null);
                    setActiveTab("daily");
                  },
                  style: {
                    flex: 1,
                    padding: "9px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#6d947c",
                    color: "#fff",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer"
                  }
                },
                "去看TA的病历 →"
              ),
              React.createElement(
                "button",
                {
                  onClick: () => setPeekModal(null),
                  style: {
                    padding: "9px 14px",
                    borderRadius: "10px",
                    border: "1px solid #ddd6c5",
                    background: "#f7f4ec",
                    color: "#6b6e5e",
                    fontSize: "12px",
                    cursor: "pointer"
                  }
                },
                "先继续排队"
              )
            )
          )
        )
    );
  }

  // 启动时预热一次传讯角色缓存
  if (typeof document !== "undefined") {
    setTimeout(() => {
      refreshChatCharacters();
    }, 600);
  }

  global.XinglinClinicEngine = {
    refreshChatCharacters,
    getCachedChatCharacters,
    matchChatCharacter,
    enhanceWaitList,
    renderQueueRow,
    XinglinAvatar,
    setActivePrescription,
    getActivePrescription,
    pickDefaultPrescription,
    DecoctionStationV2,
    CelebrityClinicPreview,
    XinglinShell
  };
})(window);
