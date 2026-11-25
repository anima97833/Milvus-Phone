/**
 * Milvus/couple_daily_q_app.js
 * 情侣空间 ·「每日一问（365日跨年问答卡）」复古珊瑚手绘收藏卡 UI
 * - 1:1 复刻参考图视觉：暖杏奶白底(#F5E7D6) + 复古珊瑚粉红卡身(#F1A79B) + 奶白厚框淡鹅黄插画问题窗(#F7E3A4)
 *   + 珊瑚胶囊条与 5 颗手绘星标 + 奶白圆角手写问答区 + 底部左右对称三道手绘放射短线
 * - 零 Emoji：全部为定制复古手绘双色矢量 SVG 插画与图标
 * - 支持切换 366 天任意日期、3 项上下文开关（当天心情日记 / 日历事件 / 传讯行程轨迹）、跨年历年对比与已答档案抽屉
 */
(function (global) {
  "use strict";

  // ==========================================
  // 1. 定制复古手绘双色矢量 SVG（插画 + 图标，零 Emoji）
  // ==========================================
  function RetroIcon(h, name, { size = 16, color = "#B96053", filled = false } = {}) {
    const common = {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block", flexShrink: 0 }
    };
    switch (name) {
      case "back":
        return h("svg", common, h("path", { d: "M15 5l-7 7 7 7M8 12h11" }));
      case "prev":
        return h("svg", common, h("path", { d: "M14.5 6.5L9 12l5.5 5.5" }));
      case "next":
        return h("svg", common, h("path", { d: "M9.5 6.5L15 12l-5.5 5.5" }));
      case "star":
        return h("svg", { ...common, fill: filled ? color : "none", stroke: color, strokeWidth: 1.9 },
          h("path", { d: "M12 3.2l2.6 5.2 5.7.8-4.1 4 1 5.7L12 16.2 6.8 18.9l1-5.7-4.1-4 5.7-.8z" })
        );
      case "archive":
        return h("svg", common,
          h("rect", { x: 4, y: 4.5, width: 16, height: 15, rx: 3 }),
          h("path", { d: "M8 9.5h8M8 13.5h5.5" })
        );
      case "spark":
        return h("svg", common,
          h("path", { d: "M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6-5.6-1.9 5.6-1.9z" })
        );
      case "check":
        return h("svg", common, h("path", { d: "M5.5 12.5l4.2 4.2L18.5 8" }));
      case "close":
        return h("svg", common, h("path", { d: "M6 6l12 12M18 6L6 18" }));
      case "rays_left":
        return h("svg", { width: 22, height: 18, viewBox: "0 0 22 18", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" },
          h("path", { d: "M4 3l8 3M2 9h9M4 15l8-3" })
        );
      case "rays_right":
        return h("svg", { width: 22, height: 18, viewBox: "0 0 22 18", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" },
          h("path", { d: "M18 3l-8 3M20 9h-9M18 15l-8-3" })
        );
      default:
        return h("svg", common, h("circle", { cx: 12, cy: 12, r: 6 }));
    }
  }

  // 淡鹅黄插画窗内的 6 套复古手绘双色矢量贴画（呼应参考图粗描边+柔和马卡龙填色）
  function ThemeIllustration(h, artId) {
    const stroke = "#4B3B38";
    const c = {
      width: 112,
      height: 66,
      viewBox: "0 0 112 66",
      fill: "none",
      stroke,
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: "block", margin: "0 auto" }
    };
    if (artId === "tea") {
      return h("svg", c,
        h("path", { d: "M12 52 Q56 44 100 52", stroke: "#D9B769", strokeWidth: 2 }),
        h("rect", { x: 34, y: 24, width: 34, height: 24, rx: 8, fill: "#FDF7EC" }),
        h("path", { d: "M68 30h6a5 5 0 0 1 0 10h-6", fill: "none" }),
        h("ellipse", { cx: 51, cy: 25, rx: 14, ry: 3.5, fill: "#90C7B5" }),
        h("path", { d: "M44 16c0-4 3-5 3-8M52 15c0-4 3-5 3-8M60 17c0-3 2-4 2-7", stroke: "#D87A6D", strokeWidth: 2 }),
        h("circle", { cx: 86, cy: 43, r: 5.5, fill: "#F08C80" }),
        h("circle", { cx: 23, cy: 44, r: 4.5, fill: "#99CCE0" })
      );
    }
    if (artId === "hourglass") {
      return h("svg", c,
        h("rect", { x: 40, y: 10, width: 32, height: 5, rx: 2, fill: "#F08C80" }),
        h("rect", { x: 40, y: 50, width: 32, height: 5, rx: 2, fill: "#F08C80" }),
        h("path", { d: "M45 15c0 12 11 14 11 17.5S45 38 45 50h22c0-12-11-14-11-17.5S67 27 67 15z", fill: "#FDF7EC" }),
        h("path", { d: "M49 48c2-5 5-7 7-7s5 2 7 7z", fill: "#99CCE0", stroke: "none" }),
        h("circle", { cx: 24, cy: 22, r: 3, fill: "#F08C80", stroke: "none" }),
        h("circle", { cx: 88, cy: 40, r: 3.5, fill: "#99CCE0", stroke: "none" })
      );
    }
    if (artId === "moon") {
      return h("svg", c,
        h("path", { d: "M62 12a21 21 0 1 0 14 36 16 16 0 1 1-14-36z", fill: "#99CCE0" }),
        h("path", { d: "M24 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z", fill: "#FDF7EC" }),
        h("path", { d: "M84 18l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z", fill: "#F08C80" }),
        h("path", { d: "M16 50c14-4 28-4 42 0s28 4 38 0", stroke: "#D9B769", strokeWidth: 2 })
      );
    }
    if (artId === "kite") {
      return h("svg", c,
        h("polygon", { points: "56,10 78,28 56,48 34,28", fill: "#F08C80" }),
        h("polygon", { points: "56,10 78,28 56,28", fill: "#99CCE0" }),
        h("path", { d: "M56 10v38M34 28h44" }),
        h("path", { d: "M56 48c4 5 12 6 18 3s12 2 16 6", stroke: "#4B3B38", strokeDasharray: "4 3" })
      );
    }
    if (artId === "lantern") {
      return h("svg", c,
        h("path", { d: "M56 6v8", strokeWidth: 2.2 }),
        h("rect", { x: 47, y: 14, width: 18, height: 5, rx: 2, fill: "#4B3B38" }),
        h("rect", { x: 37, y: 19, width: 38, height: 28, rx: 14, fill: "#F08C80" }),
        h("path", { d: "M56 19v28M46 20c-3 8-3 18 0 26M66 20c3 8 3 18 0 26", stroke: "#FDF7EC", strokeWidth: 1.6 }),
        h("rect", { x: 47, y: 47, width: 18, height: 4.5, rx: 2, fill: "#4B3B38" }),
        h("path", { d: "M56 51.5v8M52 52v6M60 52v6", stroke: "#D87A6D", strokeWidth: 2 })
      );
    }
    // 默认：letter（复古信笺）
    return h("svg", c,
      h("rect", { x: 26, y: 15, width: 60, height: 38, rx: 7, fill: "#FDF7EC" }),
      h("path", { d: "M28 18l28 20 28-20" }),
      h("circle", { cx: 56, cy: 36, r: 6.5, fill: "#F08C80" }),
      h("rect", { x: 76, y: 11, width: 12, height: 10, rx: 2, fill: "#99CCE0" })
    );
  }

  // ==========================================
  // 2. 主页面组件：CoupleDailyQuestionPage
  // ==========================================
  function CoupleDailyQuestionPage({ taCharacter, onBack }) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { useState, useEffect } = React;
    const Bank = global.CoupleDailyQBank;
    const Engine = global.CoupleDailyQEngine;
    if (!Bank || !Engine) return null;

    const charId = taCharacter ? String(taCharacter.id) : "";
    const charName = taCharacter?.name || "TA";

    const [dateStr, setDateStr] = useState(() => Engine.formatDateYmd(new Date()));
    const [dayRecord, setDayRecord] = useState(null);
    const [userDraft, setUserDraft] = useState("");
    const [editingUser, setEditingUser] = useState(false);
    const [prefs, setPrefs] = useState(() => ({ ...Engine.DEFAULT_PREFS }));
    const [optProbe, setOptProbe] = useState({ hasMoodDiary: false, hasCalendar: false, hasTrajectory: false });
    const [isGenerating, setIsGenerating] = useState(false);
    const [charAvatar, setCharAvatar] = useState("");
    const [showArchive, setShowArchive] = useState(false);
    const [archiveList, setArchiveList] = useState([]);
    const [toast, setToast] = useState("");

    const flash = (msg) => {
      setToast(msg);
      setTimeout(() => setToast(""), 2000);
    };

    const { year, mmdd } = Engine.parseDateParts(dateStr);
    const qObj = Bank.getQuestionByDate(mmdd);

    // 加载角色头像与用户开关偏好
    useEffect(() => {
      let alive = true;
      Engine.loadPrefs().then((p) => { if (alive) setPrefs(p); });
      if (taCharacter && global.ChenweiAiOracle && global.ChenweiAiOracle.resolveCharAvatarUrl) {
        global.ChenweiAiOracle.resolveCharAvatarUrl(taCharacter).then((u) => { if (alive && u) setCharAvatar(u); });
      }
      return () => { alive = false; };
    }, [charId]);

    // 按当前日期加载跨年记录 + 探测 3 项可选上下文
    useEffect(() => {
      if (!charId) return;
      let alive = true;
      Promise.all([
        Engine.loadDayRecord(charId, mmdd),
        Engine.probeOptionalContexts({ charObj: taCharacter, dateStr })
      ]).then(([rec, probe]) => {
        if (!alive) return;
        setDayRecord(rec);
        const curY = (rec && rec.years && rec.years[year]) || {};
        setUserDraft(curY.userAnswer || "");
        setEditingUser(!curY.userAnswer);
        setOptProbe(probe);
      });
      return () => { alive = false; };
    }, [charId, dateStr]);

    const shiftDate = (deltaDays) => {
      const dt = new Date(`${dateStr}T12:00:00`);
      dt.setDate(dt.getDate() + deltaDays);
      setDateStr(Engine.formatDateYmd(dt));
    };

    const handleTogglePref = async (key) => {
      const next = await Engine.savePrefs({ [key]: !prefs[key] });
      setPrefs(next);
    };

    const handleSaveUser = async () => {
      if (!userDraft.trim()) {
        flash("先写下一两句此刻的想法吧");
        return;
      }
      const updated = await Engine.saveUserAnswer({ charId, dateStr, text: userDraft });
      setDayRecord(updated);
      setEditingUser(false);
      flash("已妥帖记入今年纸卡");
    };

    const handleGenerateChar = async () => {
      if (isGenerating || !taCharacter) return;
      setIsGenerating(true);
      try {
        const yearsObj = (dayRecord && dayRecord.years) || {};
        const pastYears = Object.keys(yearsObj)
          .filter((y) => y !== year && yearsObj[y] && yearsObj[y].charAnswer)
          .sort((a, b) => Number(b) - Number(a))
          .map((y) => ({ year: y, charAnswer: yearsObj[y].charAnswer }));

        const curUserAns = (yearsObj[year] && yearsObj[year].userAnswer) || userDraft.trim();
        const res = await Engine.generateCharDailyAnswer({
          charObj: taCharacter,
          dateStr,
          questionObj: qObj,
          userAnswer: curUserAns,
          pastYearsEntries: pastYears,
          options: prefs
        });
        setDayRecord(res.record);
        flash(res.usedSources.length ? `${charName}已作答（参考了${res.usedSources.join("、")}）` : `${charName}已写下此刻回答`);
      } catch (e) {
        flash("生成失败，请稍后重试");
      } finally {
        setIsGenerating(false);
      }
    };

    const handleSetRating = async (r) => {
      const updated = await Engine.saveRating({ charId, mmdd, rating: r });
      setDayRecord(updated);
    };

    const handleOpenArchive = async () => {
      const list = await Engine.loadAllRecordsForChar(charId);
      setArchiveList(list);
      setShowArchive(true);
    };

    const yearsObj = (dayRecord && dayRecord.years) || {};
    const curYearEntry = yearsObj[year] || {};
    const pastYearKeys = Object.keys(yearsObj)
      .filter((y) => y !== year && (yearsObj[y]?.userAnswer || yearsObj[y]?.charAnswer))
      .sort((a, b) => Number(b) - Number(a));
    const rating = Number(dayRecord?.rating || 0);

    const optSwitches = [
      { key: "includeMoodDiary",  label: "心情日记", has: optProbe.hasMoodDiary },
      { key: "includeCalendar",   label: "日历事件", has: optProbe.hasCalendar },
      { key: "includeTrajectory", label: "行程轨迹", has: optProbe.hasTrajectory }
    ];

    return h(
      "div",
      {
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99991,
          background: "radial-gradient(circle at 20% 10%, #FAF0E2 0%, #F2E1CD 100%)",
          color: "#8C473D",
          fontFamily: "'Noto Serif SC', 'Songti SC', -apple-system, sans-serif",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }
      },
      // 顶部导航条
      h(
        "div",
        {
          style: {
            padding: "calc(10px + env(safe-area-inset-top, 0px)) 14px 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0
          }
        },
        h("button", {
          type: "button",
          onClick: onBack,
          style: { border: "1.5px solid #E5A79B", background: "#FDF7EC", borderRadius: "12px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }
        }, RetroIcon(h, "back", { size: 18, color: "#B96053" })),

        // 日期翻阅胶囊
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "4px", background: "#FDF7EC", border: "1.5px solid #E5A79B", borderRadius: "999px", padding: "3px 6px" } },
          h("button", { type: "button", onClick: () => shiftDate(-1), style: { border: "none", background: "transparent", padding: "4px", cursor: "pointer" } }, RetroIcon(h, "prev", { size: 15, color: "#B96053" })),
          h("input", {
            type: "date",
            value: dateStr,
            onChange: (e) => e.target.value && setDateStr(e.target.value),
            style: { border: "none", background: "transparent", color: "#9C4E43", fontSize: "12px", fontWeight: 800, outline: "none", fontFamily: "inherit", width: "106px", textAlign: "center" }
          }),
          h("button", { type: "button", onClick: () => shiftDate(1), style: { border: "none", background: "transparent", padding: "4px", cursor: "pointer" } }, RetroIcon(h, "next", { size: 15, color: "#B96053" }))
        ),

        h("button", {
          type: "button",
          onClick: handleOpenArchive,
          title: "已答档案",
          style: { border: "1.5px solid #E5A79B", background: "#FDF7EC", borderRadius: "12px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }
        }, RetroIcon(h, "archive", { size: 17, color: "#B96053" }))
      ),

      // Toast 提示
      toast &&
        h("div", {
          style: { position: "fixed", top: "calc(58px + env(safe-area-inset-top, 0px))", left: "50%", transform: "translateX(-50%)", zIndex: 99998, pointerEvents: "none", background: "#8C473D", color: "#FDF7EC", padding: "6px 14px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 6px 16px rgba(140,71,61,0.28)" }
        }, toast),

      // 主滚动区：1:1 复古珊瑚手绘收藏卡
      h(
        "div",
        { className: "no-scrollbar", style: { flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 16px calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", alignItems: "center" } },
        h(
          "div",
          {
            style: {
              width: "100%",
              maxWidth: "374px",
              background: "linear-gradient(180deg, #F3ABA0 0%, #EE9D90 100%)",
              borderRadius: "24px",
              padding: "16px 16px 18px",
              boxShadow: "0 14px 32px rgba(168, 92, 78, 0.22), inset 0 2px 0 rgba(255,255,255,0.35)",
              border: "2px solid #E89688",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              boxSizing: "border-box"
            }
          },
          // 卡片顶栏（复刻 DESSERT  +750）
          h(
            "div",
            { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 4px" } },
            h("div", { style: { fontSize: "19px", fontWeight: 900, letterSpacing: "1.6px", color: "#A95246" } }, `DAY ${String(qObj.dayOfYear).padStart(3, "0")}`),
            h("div", { style: { fontSize: "18px", fontWeight: 900, letterSpacing: "0.8px", color: "#A95246" } }, `+${year}`)
          ),

          // 奶白厚框 + 淡鹅黄手绘插画问题窗
          h(
            "div",
            {
              style: {
                background: "#FDF7EC",
                borderRadius: "16px",
                padding: "7px",
                boxShadow: "0 3px 0 rgba(169, 82, 70, 0.14)"
              }
            },
            h(
              "div",
              {
                style: {
                  background: "linear-gradient(180deg, #F9E8B2 0%, #F4DC94 100%)",
                  borderRadius: "11px",
                  border: "1.5px solid #E5C878",
                  padding: "12px 14px 14px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px"
                }
              },
              ThemeIllustration(h, qObj.art),
              h(
                "div",
                { style: { fontSize: "15.5px", fontWeight: 800, lineHeight: 1.6, color: "#5C3A33", textAlign: "center", wordBreak: "break-word" } },
                qObj.question
              )
            )
          ),

          // 珊瑚深色胶囊条 + 5 颗手绘星标（复刻 GAMING IN BED 五星条）
          h(
            "div",
            {
              style: {
                background: "#E48F82",
                borderRadius: "999px",
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px"
              }
            },
            h("span", { style: { fontSize: "11.5px", fontWeight: 800, letterSpacing: "0.8px", color: "#FDF7EC" } }, `${mmdd} · ${qObj.categoryLabel}`),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "3px" } },
              [1, 2, 3, 4, 5].map((n) =>
                h("button", {
                  key: n,
                  type: "button",
                  onClick: () => handleSetRating(n),
                  style: { border: "none", background: "transparent", padding: "1px", cursor: "pointer" }
                }, RetroIcon(h, "star", { size: 15, color: "#FDF7EC", filled: n <= rating }))
              )
            )
          ),

          // 奶白圆角手写纸框：今年双人回答（我 & TA）
          h(
            "div",
            {
              style: {
                background: "#FDF7EC",
                borderRadius: "16px",
                padding: "13px 13px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                boxShadow: "0 3px 0 rgba(169, 82, 70, 0.12)"
              }
            },
            // 我的今年回答区
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "6px" } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                h("span", { style: { fontSize: "12px", fontWeight: 800, color: "#B96053" } }, `我的回答 · ${year}`),
                curYearEntry.userAnswer && !editingUser &&
                  h("button", { type: "button", onClick: () => setEditingUser(true), style: { border: "none", background: "transparent", color: "#C67B6E", fontSize: "11px", fontWeight: 700, cursor: "pointer" } }, "修改")
              ),
              editingUser
                ? h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                    h("textarea", {
                      rows: 3,
                      value: userDraft,
                      onChange: (e) => setUserDraft(e.target.value),
                      placeholder: "写下今年此刻的 1~3 句想法…",
                      style: { width: "100%", boxSizing: "border-box", border: "1.5px solid #EBD5C8", background: "#FFFBF4", borderRadius: "11px", padding: "8px 10px", fontSize: "13px", lineHeight: 1.6, color: "#6E3B33", outline: "none", resize: "vertical", fontFamily: "inherit" }
                    }),
                    h("div", { style: { display: "flex", justifyContent: "flex-end", gap: "6px" } },
                      curYearEntry.userAnswer &&
                        h("button", { type: "button", onClick: () => { setUserDraft(curYearEntry.userAnswer); setEditingUser(false); }, style: { border: "1px solid #E5C7BA", background: "#FFF", color: "#A96B60", borderRadius: "999px", padding: "5px 12px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" } }, "取消"),
                      h("button", { type: "button", onClick: handleSaveUser, style: { border: "none", background: "#DF7F71", color: "#FFFDF8", borderRadius: "999px", padding: "5px 14px", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" } }, "落笔存卡")
                    )
                  )
                : h("div", { style: { fontSize: "13.5px", lineHeight: 1.7, color: "#6E3B33", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#FFFBF4", borderRadius: "10px", padding: "9px 11px", border: "1px dashed #EAD2C5" } }, curYearEntry.userAnswer)
            ),

            h("div", { style: { borderTop: "1.5px dashed #F0D9CD" } }),

            // 角色今年回答区 + 3 项自选注入开关
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "8px" } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" } },
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "6px" } },
                  charAvatar && h("img", { src: charAvatar, alt: charName, style: { width: "22px", height: "22px", borderRadius: "50%", objectFit: "cover", border: "1.5px solid #E89688" } }),
                  h("span", { style: { fontSize: "12px", fontWeight: 800, color: "#B96053" } }, `${charName}的回答 · ${year}`)
                ),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: isGenerating,
                    onClick: handleGenerateChar,
                    style: { border: "none", background: isGenerating ? "#D8B4AC" : "#DF7F71", color: "#FFFDF8", borderRadius: "999px", padding: "4px 11px", fontSize: "11px", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: "4px", cursor: isGenerating ? "wait" : "pointer" }
                  },
                  RetroIcon(h, "spark", { size: 12, color: "#FFFDF8" }),
                  isGenerating ? "思忖中…" : (curYearEntry.charAnswer ? "重新作答" : `请${charName}作答`)
                )
              ),

              // 用户自选 3 项注入开关（心情日记 / 日历事件 / 行程轨迹）
              h(
                "div",
                { style: { display: "flex", flexWrap: "wrap", gap: "5px" } },
                optSwitches.map((sw) => {
                  const on = Boolean(prefs[sw.key]);
                  return h(
                    "button",
                    {
                      key: sw.key,
                      type: "button",
                      onClick: () => handleTogglePref(sw.key),
                      style: {
                        border: on ? "1px solid #DF7F71" : "1px solid #E7D2C6",
                        background: on ? "#FCEAE6" : "#FFFBF4",
                        color: on ? "#A94E41" : "#AA857C",
                        borderRadius: "999px",
                        padding: "3px 8px",
                        fontSize: "10.5px",
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        cursor: "pointer"
                      }
                    },
                    on && RetroIcon(h, "check", { size: 11, color: "#A94E41" }),
                    sw.label,
                    h("span", { style: { fontSize: "9.5px", opacity: 0.78 } }, sw.has ? "·有" : "·无")
                  );
                })
              ),

              curYearEntry.charAnswer
                ? h(
                    "div",
                    { style: { background: "#FFFBF4", borderRadius: "11px", padding: "10px 11px", border: "1px solid #F0D9CD", display: "flex", flexDirection: "column", gap: "5px" } },
                    h("div", { style: { fontSize: "13.5px", lineHeight: 1.72, color: "#6E3B33", whiteSpace: "pre-wrap", wordBreak: "break-word" } }, curYearEntry.charAnswer),
                    Array.isArray(curYearEntry.usedSources) && curYearEntry.usedSources.length > 0 &&
                      h("div", { style: { fontSize: "10px", color: "#B9857B" } }, `已融合：${curYearEntry.usedSources.join(" · ")}`)
                  )
                : h("div", { style: { fontSize: "12px", color: "#B98D84", textAlign: "center", padding: "10px 6px", background: "#FFFBF4", borderRadius: "10px", border: "1px dashed #EAD2C5" } }, `点右上「请${charName}作答」，听听 TA 此年此刻的想法`)
            )
          ),

          // 往年今日时间轴（同日异年对比）
          pastYearKeys.length > 0 &&
            h(
              "div",
              { style: { background: "rgba(253, 247, 236, 0.88)", borderRadius: "14px", padding: "11px 12px", display: "flex", flexDirection: "column", gap: "8px" } },
              h("div", { style: { fontSize: "11.5px", fontWeight: 800, color: "#A95246" } }, `往年今日 · ${mmdd} 留痕`),
              pastYearKeys.map((py) => {
                const ent = yearsObj[py];
                return h(
                  "div",
                  { key: py, style: { borderLeft: "2.5px solid #E48F82", paddingLeft: "9px", display: "flex", flexDirection: "column", gap: "3px" } },
                  h("div", { style: { fontSize: "11px", fontWeight: 800, color: "#B96053" } }, `${py} 年`),
                  ent.userAnswer && h("div", { style: { fontSize: "12px", lineHeight: 1.55, color: "#76463E" } }, `我：${ent.userAnswer}`),
                  ent.charAnswer && h("div", { style: { fontSize: "12px", lineHeight: 1.55, color: "#76463E" } }, `${charName}：${ent.charAnswer}`)
                );
              })
            ),

          // 底边复古放射短线 + 注脚（复刻参考图底部）
          h(
            "div",
            { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", paddingTop: "2px" } },
            RetroIcon(h, "rays_left", { color: "#C67164" }),
            h("span", { style: { fontSize: "11.5px", fontWeight: 700, letterSpacing: "0.8px", color: "#B05B4F" } }, qObj.footer),
            RetroIcon(h, "rays_right", { color: "#C67164" })
          )
        )
      ),

      // 已答档案抽屉
      showArchive &&
        h(
          "div",
          {
            onClick: (e) => { if (e.target === e.currentTarget) setShowArchive(false); },
            style: { position: "fixed", inset: 0, zIndex: 99996, background: "rgba(92,50,42,0.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px" }
          },
          h(
            "div",
            {
              onClick: (e) => e.stopPropagation(),
              style: { width: "100%", maxWidth: "348px", maxHeight: "76vh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: "#FDF7EC", border: "2px solid #EE9D90", borderRadius: "20px", padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }
            },
            h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
              h("span", { style: { fontSize: "14px", fontWeight: 900, color: "#A95246" } }, `${charName} · 已答纸卡 (${archiveList.length})`),
              h("button", { type: "button", onClick: () => setShowArchive(false), style: { border: "none", background: "transparent", cursor: "pointer", padding: "4px" } }, RetroIcon(h, "close", { size: 17, color: "#A95246" }))
            ),
            archiveList.length === 0
              ? h("div", { style: { textAlign: "center", padding: "24px 8px", fontSize: "12.5px", color: "#B9857B" } }, "尚未留下问答纸卡，写下今天的第一张吧")
              : archiveList.map((rec) => {
                  const rq = Bank.getQuestionByDate(rec.mmdd);
                  const yrs = Object.keys(rec.years || {}).sort((a, b) => Number(b) - Number(a));
                  return h(
                    "div",
                    {
                      key: rec.id,
                      onClick: () => {
                        const targetY = yrs[0] || year;
                        setDateStr(`${targetY}-${rec.mmdd}`);
                        setShowArchive(false);
                      },
                      style: { background: "#FFFBF4", border: "1px solid #F0D9CD", borderLeft: "3.5px solid #EE9D90", borderRadius: "12px", padding: "9px 11px", cursor: "pointer", display: "flex", flexDirection: "column", gap: "3px" }
                    },
                    h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 800, color: "#B96053" } },
                      h("span", null, `${rec.mmdd} · ${rq.categoryLabel}`),
                      h("span", null, `${yrs.join(" / ")}年`)
                    ),
                    h("div", { style: { fontSize: "12.5px", fontWeight: 700, color: "#6E3B33", lineHeight: 1.45 } }, rq.question)
                  );
                })
          )
        )
    );
  }

  global.CoupleDailyQuestionPage = CoupleDailyQuestionPage;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { CoupleDailyQuestionPage };
  }
})(typeof window !== "undefined" ? window : globalThis);
