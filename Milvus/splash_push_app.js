/**
 * Milvus/splash_push_app.js
 * 设置 ·「开屏推送」与「更新·开屏展示」纸艺风海报独立引擎
 * - 复刻手账纸艺外轮廓（米黄虚线框 / 斜置青海波衬纸 / 象牙白主卡 / 微倾拍立得画框 / 双木纹胶带 / 燕尾小旗 / 燕尾亮点条 / 井字出头寄语框 / 五铢钱贴纸）
 * - 支持左右平滑拖动/滑动翻阅历次更新简报（读取 window.NUO_OBSERVATION_LOGS 全部卷目）
 * - 支持右下角「今日不再展示」与手机端紧凑安全区适配
 */
(function (global) {
  "use strict";

  const PREFS_KEY = "milvus_splash_push_prefs_v1";

  const DEFAULT_PREFS = {
    updatePosterEnabled: false,
    frequency: "once_per_version", // "once_per_version" | "every_visit"
    lastShownVersion: "",
    dismissedDate: "" // YYYY-MM-DD，勾选「今日不再展示」后当天不再自动弹出
  };

  function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return { ...DEFAULT_PREFS, ...(saved && typeof saved === "object" ? saved : {}) };
    } catch (e) {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs(patch) {
    const next = { ...getPrefs(), ...(patch || {}) };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      global.dispatchEvent(new CustomEvent("milvus-splash-push-prefs-changed", { detail: next }));
    } catch (e) {}
    return next;
  }

  function getFallbackLog() {
    return {
      id: "v7.0",
      version: "v7.0",
      date: "2026-11-22",
      title: "卷七 · 绣衣、杏林、商肆与丝竹新律",
      opening: "妹妹，今日诸处更迭皆已落定，各归其位。",
      sections: [],
      posterHighlights: [
        { tag: "杏林", icon: "♥", text: "五位名医AI坐诊、煎药V2与名士开药日常" },
        { tag: "丝竹", icon: "★", text: "十大民乐实时音色，支持简谱导入成谱" },
        { tag: "绣衣", icon: "✦", text: "审批扩库转传讯、太疾驰同游与傩观测" }
      ],
      posterQuote: "各处杂项皆已理顺，妹妹自取一观。\n若想细看全卷，点下方展卷便是。—— 公瑾"
    };
  }

  function getAllLogs() {
    const logs = Array.isArray(global.NUO_OBSERVATION_LOGS) ? global.NUO_OBSERVATION_LOGS : [];
    return logs.length > 0 ? logs : [getFallbackLog()];
  }

  function getLatestLog() {
    return getAllLogs()[0];
  }

  function shouldAutoShowOnBoot() {
    const prefs = getPrefs();
    if (!prefs.updatePosterEnabled) return false;
    if (prefs.dismissedDate === getTodayKey()) return false;
    const latest = getLatestLog();
    const ver = String(latest.id || latest.version || "v7.0");
    if (prefs.frequency === "every_visit") return true;
    return prefs.lastShownVersion !== ver;
  }

  function markVersionShown(ver) {
    savePrefs({ lastShownVersion: String(ver || "") });
  }

  // 古铜五铢钱贴纸 SVG（带白边贴纸轮廓）
  function CoinSticker({ size = 44, style = {} }) {
    const h = React.createElement;
    return h(
      "svg",
      {
        width: size,
        height: size,
        viewBox: "0 0 64 64",
        style: { filter: "drop-shadow(0 2px 4px rgba(80,55,25,0.22))", ...style }
      },
      h("circle", { cx: 32, cy: 32, r: 29, fill: "#FFFFFF" }),
      h("circle", { cx: 32, cy: 32, r: 25, fill: "#A78252", stroke: "#7C5A32", strokeWidth: "2" }),
      h("circle", { cx: 32, cy: 32, r: 19, fill: "#C5A16D", stroke: "#8A653A", strokeWidth: "1.5" }),
      h("path", {
        d: "M17 24 Q24 14 34 14 M47 40 Q40 50 30 50 M16 40 Q14 30 22 20 M48 24 Q50 34 42 44",
        stroke: "#8A653A",
        strokeWidth: "2",
        fill: "none",
        strokeLinecap: "round"
      }),
      h("rect", {
        x: 24,
        y: 24,
        width: 16,
        height: 16,
        rx: 1.5,
        fill: "#FAF7EE",
        stroke: "#7C5A32",
        strokeWidth: "2",
        transform: "rotate(12 32 32)"
      })
    );
  }

  // ==========================================
  // 单张纸艺简报卡片（紧凑适配手机端，无左侧竖排遮挡）
  // ==========================================
  function SinglePosterCard({ log }) {
    const h = React.createElement;
    const verClean = String(log.version || "7.0").replace(/^v/i, "");
    const highlights =
      Array.isArray(log.posterHighlights) && log.posterHighlights.length > 0
        ? log.posterHighlights.slice(0, 3)
        : (log.sections || []).slice(0, 3).map((s, idx) => ({
            tag: String(s.module || "更新").slice(0, 2),
            icon: idx === 0 ? "♥" : idx === 1 ? "★" : "✦",
            text: (s.items || []).map((i) => i.label).slice(0, 2).join("、") || s.module
          }));

    const quoteText =
      log.posterQuote ||
      String(log.opening || "新卷已成，各处细目皆录于「傩·观测」。").slice(0, 56);

    const subTags = highlights.map((item) => item.tag).slice(0, 3);

    return h(
      "div",
      {
        style: {
          position: "relative",
          width: "100%",
          background: "radial-gradient(circle at 30% 20%, #FAF4D8 0%, #F5ECC4 100%)",
          borderRadius: "15px",
          padding: "18px 15px 19px",
          boxSizing: "border-box",
          boxShadow: "0 16px 40px rgba(20, 14, 6, 0.4)",
          overflow: "hidden",
          userSelect: "none",
          WebkitUserSelect: "none"
        }
      },
      // 外框内细线
      h("div", {
        style: {
          position: "absolute",
          inset: "7px",
          border: "1.5px solid #D3C192",
          borderRadius: "10px",
          pointerEvents: "none",
          zIndex: 1
        }
      }),
      // 青绿手绘曲线虚线
      h(
        "svg",
        {
          viewBox: "0 0 360 520",
          preserveAspectRatio: "none",
          style: {
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 2
          }
        },
        h("path", {
          d: "M -10 175 Q 12 36 148 22 Q 268 12 332 -8",
          fill: "none",
          stroke: "#5B9B90",
          strokeWidth: "2.2",
          strokeDasharray: "6 5",
          strokeLinecap: "round",
          opacity: "0.85"
        }),
        h("path", {
          d: "M 42 528 Q 10 475 95 472 M 260 526 Q 345 465 372 350",
          fill: "none",
          stroke: "#5B9B90",
          strokeWidth: "2.2",
          strokeDasharray: "6 5",
          strokeLinecap: "round",
          opacity: "0.85"
        })
      ),

      // Layer 1：斜置 -3.5° 深棕青海波纹衬纸
      h("div", {
        style: {
          position: "absolute",
          top: "20px",
          left: "13px",
          right: "13px",
          bottom: "18px",
          backgroundColor: "#9A744F",
          backgroundImage:
            "radial-gradient(circle at 100% 150%, #9A744F 24%, #AD8760 25%, #AD8760 28%, #9A744F 29%, #9A744F 36%, #AD8760 36%, #AD8760 40%, transparent 40%, transparent), radial-gradient(circle at 0 150%, #9A744F 24%, #AD8760 25%, #AD8760 28%, #9A744F 29%, #9A744F 36%, #AD8760 36%, #AD8760 40%, transparent 40%, transparent), radial-gradient(circle at 50% 100%, #AD8760 10%, #9A744F 11%, #9A744F 23%, #AD8760 24%, #AD8760 30%, #9A744F 31%, #9A744F 43%, #AD8760 44%, #AD8760 50%, #9A744F 51%, #9A744F 63%, #AD8760 64%, #AD8760 71%, transparent 71%, transparent)",
          backgroundSize: "24px 12px",
          transform: "rotate(-3.4deg)",
          borderRadius: "4px",
          boxShadow: "0 4px 12px rgba(72, 48, 22, 0.26)",
          zIndex: 3
        }
      }),

      // Layer 2：正放象牙白主卡片
      h(
        "div",
        {
          style: {
            position: "relative",
            zIndex: 5,
            background: "#FAF8F1",
            border: "1.5px solid #A48665",
            borderRadius: "3px",
            padding: "8px 9px 14px",
            boxShadow: "0 6px 16px rgba(72, 50, 24, 0.2)",
            color: "#4F3B29"
          }
        },
        // Layer 3：上方微倾 +3° 拍立得主画框（顶部略缩小，留出安全边角）
        h(
          "div",
          {
            style: {
              position: "relative",
              margin: "0 2px 8px",
              padding: "6px",
              background: "#FFFFFF",
              boxShadow: "0 4px 12px rgba(82, 58, 30, 0.2)",
              transform: "rotate(2.8deg)",
              borderRadius: "2px",
              zIndex: 6
            }
          },
          // 右上角两枚斜贴木纹胶带（尺寸收敛，不超顶部边缘）
          h("div", {
            style: {
              position: "absolute",
              top: "-10px",
              right: "28px",
              width: "18px",
              height: "32px",
              background: "linear-gradient(180deg, #B58555 0%, #9E6E40 100%)",
              border: "1px solid #845A32",
              transform: "rotate(8deg)",
              boxShadow: "1px 2px 3px rgba(0,0,0,0.2)",
              borderRadius: "1px",
              zIndex: 12
            }
          }),
          h("div", {
            style: {
              position: "absolute",
              top: "-6px",
              right: "2px",
              width: "18px",
              height: "34px",
              background: "linear-gradient(180deg, #BE8F5E 0%, #A67545 100%)",
              border: "1px solid #845A32",
              transform: "rotate(20deg)",
              boxShadow: "1px 2px 3px rgba(0,0,0,0.2)",
              borderRadius: "1px",
              zIndex: 12
            }
          }),

          // 左上角两枚燕尾小旗标（玫红 + 鹅黄）
          h(
            "div",
            {
              style: {
                position: "absolute",
                top: "10px",
                left: "-10px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                transform: "rotate(-2.8deg)",
                zIndex: 12
              }
            },
            h(
              "div",
              {
                style: {
                  width: "24px",
                  height: "13px",
                  background: "#C97272",
                  clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 22% 50%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: "4px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.16)"
                }
              },
              h("span", { style: { width: "3.5px", height: "3.5px", borderRadius: "50%", background: "#FFF4E0" } })
            ),
            h(
              "div",
              {
                style: {
                  width: "24px",
                  height: "13px",
                  background: "#E1B055",
                  clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 22% 50%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  paddingRight: "4px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.16)"
                }
              },
              h("span", { style: { width: "3.5px", height: "3.5px", borderRadius: "50%", background: "#5B432C" } })
            )
          ),

          // 拍立得内部暖金麻叶纹视觉主画布（居中对称，尺寸更精致）
          h(
            "div",
            {
              style: {
                position: "relative",
                height: "142px",
                background: "linear-gradient(155deg, #DFCCA6 0%, #F1E5C9 48%, #D7BE92 100%)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 14px",
                boxSizing: "border-box",
                textAlign: "center"
              }
            },
            h("div", {
              style: {
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "repeating-linear-gradient(60deg, rgba(145,112,72,0.08) 0 1px, transparent 1px 15px), repeating-linear-gradient(-60deg, rgba(145,112,72,0.08) 0 1px, transparent 1px 15px)",
                pointerEvents: "none"
              }
            }),
            h(
              "div",
              {
                style: {
                  position: "relative",
                  zIndex: 2,
                  fontSize: "10px",
                  letterSpacing: "1.6px",
                  color: "#7F5E39",
                  background: "rgba(255,252,243,0.75)",
                  padding: "2px 9px",
                  borderRadius: "999px",
                  border: "1px solid rgba(154,116,79,0.28)",
                  marginBottom: "6px",
                  fontWeight: "600"
                }
              },
              `傩·观测简章  ${log.date || ""}`
            ),
            h(
              "div",
              {
                style: {
                  position: "relative",
                  zIndex: 2,
                  fontSize: "29px",
                  fontWeight: "900",
                  letterSpacing: "2.5px",
                  color: "#523A24",
                  lineHeight: 1.1,
                  textShadow: "0 2px 0 rgba(255,250,235,0.85)"
                }
              },
              `鸢 · ${verClean}`
            ),
            h(
              "div",
              {
                style: {
                  position: "relative",
                  zIndex: 2,
                  marginTop: "6px",
                  fontSize: "11.5px",
                  fontWeight: "700",
                  color: "#6B4E31",
                  letterSpacing: "0.8px",
                  lineHeight: 1.38
                }
              },
              log.title || "新卷落定 · 诸事焕新"
            ),
            subTags.length > 0 &&
              h(
                "div",
                {
                  style: {
                    position: "relative",
                    zIndex: 2,
                    marginTop: "7px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "10px",
                    color: "#8B6943"
                  }
                },
                subTags.map((t, i) =>
                  h(
                    React.Fragment,
                    { key: i },
                    i > 0 && h("span", null, "·"),
                    h("span", null, `✦ ${t}`)
                  )
                )
              )
          )
        ),

        // 珊瑚粉手绘小卷箭头
        h(
          "svg",
          {
            width: "22",
            height: "17",
            viewBox: "0 0 32 24",
            style: { display: "block", margin: "-1px 0 2px 26px" }
          },
          h("path", {
            d: "M24 3 C18 2, 14 10, 18 11 C21 12, 22 7, 17 7 C11 7, 7 13, 6 19 M2 15 L6 20 L11 16",
            fill: "none",
            stroke: "#D88982",
            strokeWidth: "1.9",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          })
        ),

        // Layer 4：暖杏色燕尾亮点条（完整露出，无左侧遮挡）
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px", padding: "0 2px 9px" } },
          highlights.map((item, idx) =>
            h(
              "div",
              {
                key: idx,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  fontSize: "11px",
                  color: "#524130"
                }
              },
              h(
                "div",
                {
                  style: {
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3.5px",
                    padding: "2.5px 9px 2.5px 6px",
                    borderRadius: "3px 999px 999px 3px",
                    background: "linear-gradient(90deg, #E8C991 0%, #F3DDA8 100%)",
                    color: "#5B3E21",
                    fontWeight: "800",
                    fontSize: "10.5px",
                    boxShadow: "0 1px 2px rgba(130,95,45,0.18)"
                  }
                },
                h("span", { style: { fontSize: "8.5px", color: "#FFFDF6" } }, item.icon || "✦"),
                item.tag
              ),
              h(
                "div",
                {
                  style: {
                    flex: 1,
                    fontSize: "11px",
                    fontWeight: "600",
                    color: "#4E4133",
                    lineHeight: 1.35
                  }
                },
                item.text
              )
            )
          )
        ),

        // 竖条纹夹心棕色标题条（||||| 更新简章 |||||）
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              margin: "1px 0 8px"
            }
          },
          h(
            "div",
            { style: { display: "flex", gap: "2.5px" } },
            [0, 1, 2, 3, 4].map((i) =>
              h("span", {
                key: i,
                style: { width: "2px", height: "11px", background: "#9A7555", borderRadius: "1px", opacity: 0.78 }
              })
            )
          ),
          h(
            "div",
            {
              style: {
                background: "#8D6849",
                color: "#FFFDF7",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "1.8px",
                padding: "1.5px 12px",
                borderRadius: "3px"
              }
            },
            "更新简章"
          ),
          h(
            "div",
            { style: { display: "flex", gap: "2.5px" } },
            [0, 1, 2, 3, 4].map((i) =>
              h("span", {
                key: i,
                style: { width: "2px", height: "11px", background: "#9A7555", borderRadius: "1px", opacity: 0.78 }
              })
            )
          )
        ),

        // 井字出头细框寄语盒
        h(
          "div",
          {
            style: {
              position: "relative",
              margin: "0 8px",
              padding: "9px 10px",
              background: "#EFE6D5",
              textAlign: "center",
              fontSize: "11px",
              lineHeight: 1.58,
              color: "#55422F",
              whiteSpace: "pre-line",
              fontWeight: "600"
            }
          },
          h("div", { style: { position: "absolute", top: 0, left: "-5px", right: "-5px", height: "1.5px", background: "#906947" } }),
          h("div", { style: { position: "absolute", bottom: 0, left: "-5px", right: "-5px", height: "1.5px", background: "#906947" } }),
          h("div", { style: { position: "absolute", left: 0, top: "-5px", bottom: "-5px", width: "1.5px", background: "#906947" } }),
          h("div", { style: { position: "absolute", right: 0, top: "-5px", bottom: "-5px", width: "1.5px", background: "#906947" } }),
          h(CoinSticker, { size: 22, style: { position: "absolute", top: "-11px", right: "-8px", zIndex: 4 } }),
          quoteText
        )
      ),

      // Layer 5：右下角两枚重叠五铢钱贴纸
      h(CoinSticker, {
        size: 40,
        style: { position: "absolute", right: "2px", bottom: "20px", zIndex: 8, transform: "rotate(18deg)" }
      }),
      h(CoinSticker, {
        size: 46,
        style: { position: "absolute", right: "18px", bottom: "4px", zIndex: 9, transform: "rotate(-10deg)" }
      })
    );
  }

  // ==========================================
  // 1. 支持左右平滑滑动翻阅的开屏海报弹窗
  // ==========================================
  function UpdateSplashPosterModal({ isOpen, onClose, onOpenObservation }) {
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    const logs = getAllLogs();
    const total = logs.length;

    const [activeIdx, setActiveIdx] = useState(0);
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [hideToday, setHideToday] = useState(() => getPrefs().dismissedDate === getTodayKey());

    const startXRef = useRef(0);
    const startYRef = useRef(0);
    const axisLockRef = useRef(null); // "x" | "y" | null
    const mouseDownRef = useRef(false);

    useEffect(() => {
      if (isOpen) {
        setActiveIdx(0);
        setDragOffset(0);
        setIsDragging(false);
        setHideToday(getPrefs().dismissedDate === getTodayKey());
      }
    }, [isOpen]);

    if (!isOpen) return null;

    const goTo = (nextIdx) => {
      const clamped = Math.max(0, Math.min(total - 1, nextIdx));
      setActiveIdx(clamped);
      setDragOffset(0);
    };

    const handleDragStart = (clientX, clientY) => {
      startXRef.current = clientX;
      startYRef.current = clientY;
      axisLockRef.current = null;
      setIsDragging(true);
    };

    const handleDragMove = (clientX, clientY) => {
      const dx = clientX - startXRef.current;
      const dy = clientY - startYRef.current;
      if (!axisLockRef.current) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        axisLockRef.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }
      if (axisLockRef.current !== "x") return;
      // 边缘阻尼效果
      let adjusted = dx;
      if ((activeIdx === 0 && dx > 0) || (activeIdx === total - 1 && dx < 0)) {
        adjusted = dx * 0.28;
      }
      setDragOffset(adjusted);
    };

    const handleDragEnd = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (axisLockRef.current === "x") {
        if (dragOffset < -46 && activeIdx < total - 1) {
          goTo(activeIdx + 1);
          return;
        }
        if (dragOffset > 46 && activeIdx > 0) {
          goTo(activeIdx - 1);
          return;
        }
      }
      setDragOffset(0);
    };

    const toggleHideToday = () => {
      const next = !hideToday;
      setHideToday(next);
      savePrefs({ dismissedDate: next ? getTodayKey() : "" });
    };

    const modalContent = h(
      "div",
      {
        onClick: onClose,
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 99998,
          background: "rgba(28, 24, 18, 0.64)",
          backdropFilter: "blur(5px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "calc(env(safe-area-inset-top, 0px) + 22px) 12px calc(env(safe-area-inset-bottom, 0px) + 18px)",
          boxSizing: "border-box",
          overflowY: "auto",
          overflowX: "hidden"
        }
      },
      // 简报轮播舞台容器（略缩小宽度，确保手机端四周留白不挡边角）
      h(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            position: "relative",
            width: "min(84vw, 316px)",
            flexShrink: 0
          }
        },
        // 左侧快速翻页小箭（有上一页时显示）
        total > 1 &&
          activeIdx > 0 &&
          h(
            "button",
            {
              type: "button",
              onClick: () => goTo(activeIdx - 1),
              title: "上一份简报",
              style: {
                position: "absolute",
                left: "-18px",
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 20,
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "1px solid rgba(255,248,230,0.5)",
                background: "rgba(42, 33, 24, 0.58)",
                color: "#FFF8E7",
                fontSize: "16px",
                lineHeight: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(3px)"
              }
            },
            "‹"
          ),

        // 右侧快速翻页小箭（有下一页时显示）
        total > 1 &&
          activeIdx < total - 1 &&
          h(
            "button",
            {
              type: "button",
              onClick: () => goTo(activeIdx + 1),
              title: "往期简报",
              style: {
                position: "absolute",
                right: "-18px",
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 20,
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                border: "1px solid rgba(255,248,230,0.5)",
                background: "rgba(42, 33, 24, 0.58)",
                color: "#FFF8E7",
                fontSize: "16px",
                lineHeight: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(3px)"
              }
            },
            "›"
          ),

        // 水平平滑滑动视口
        h(
          "div",
          {
            onTouchStart: (e) => {
              if (e.touches && e.touches[0]) {
                handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
              }
            },
            onTouchMove: (e) => {
              if (e.touches && e.touches[0]) {
                handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
              }
            },
            onTouchEnd: handleDragEnd,
            onTouchCancel: handleDragEnd,
            onMouseDown: (e) => {
              mouseDownRef.current = true;
              handleDragStart(e.clientX, e.clientY);
            },
            onMouseMove: (e) => {
              if (!mouseDownRef.current) return;
              handleDragMove(e.clientX, e.clientY);
            },
            onMouseUp: () => {
              if (!mouseDownRef.current) return;
              mouseDownRef.current = false;
              handleDragEnd();
            },
            onMouseLeave: () => {
              if (!mouseDownRef.current) return;
              mouseDownRef.current = false;
              handleDragEnd();
            },
            style: {
              width: "100%",
              overflow: "hidden",
              borderRadius: "15px",
              cursor: total > 1 ? (isDragging ? "grabbing" : "grab") : "default",
              touchAction: "pan-y"
            }
          },
          // 平滑滑动轨道
          h(
            "div",
            {
              style: {
                display: "flex",
                width: "100%",
                transform: `translate3d(calc(${-activeIdx * 100}% + ${dragOffset}px), 0, 0)`,
                transition: isDragging ? "none" : "transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)",
                willChange: "transform"
              }
            },
            logs.map((item, idx) =>
              h(
                "div",
                {
                  key: item.id || item.version || idx,
                  style: {
                    width: "100%",
                    flexShrink: 0,
                    boxSizing: "border-box"
                  }
                },
                h(SinglePosterCard, { log: item })
              )
            )
          )
        ),

        // 轮播指示点 + 左右滑动提示
        total > 1 &&
          h(
            "div",
            {
              style: {
                marginTop: "9px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px"
              }
            },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "5px" } },
              logs.map((item, idx) =>
                h("button", {
                  key: item.id || idx,
                  type: "button",
                  onClick: () => goTo(idx),
                  title: item.version || `第 ${idx + 1} 卷`,
                  style: {
                    width: activeIdx === idx ? "16px" : "6px",
                    height: "6px",
                    borderRadius: "999px",
                    border: "none",
                    padding: 0,
                    background: activeIdx === idx ? "#F3DDA8" : "rgba(255,248,230,0.4)",
                    transition: "all 0.25s ease",
                    cursor: "pointer"
                  }
                })
              )
            ),
            h(
              "span",
              { style: { fontSize: "10.5px", color: "rgba(255,248,230,0.75)", letterSpacing: "0.4px" } },
              `左右滑动翻阅往期 (${activeIdx + 1}/${total})`
            )
          ),

        // 海报底部操作栏：左侧展卷查看、中间关闭、右下角「今日不再展示」
        h(
          "div",
          {
            style: {
              marginTop: "10px",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "6px"
            }
          },
          // 左侧：展卷查看完整《傩·观测》
          typeof onOpenObservation === "function"
            ? h(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    onClose();
                    onOpenObservation();
                  },
                  style: {
                    border: "1px solid rgba(255,248,230,0.42)",
                    background: "rgba(255, 250, 238, 0.14)",
                    color: "#FFF9EA",
                    borderRadius: "999px",
                    padding: "6px 11px",
                    fontSize: "11px",
                    fontWeight: "600",
                    cursor: "pointer",
                    backdropFilter: "blur(4px)",
                    whiteSpace: "nowrap"
                  }
                },
                "展卷详阅 ›"
              )
            : h("div", null),

          // 中间：圆形关闭按钮
          h(
            "button",
            {
              type: "button",
              onClick: onClose,
              title: "关闭海报",
              style: {
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "1.5px solid rgba(255,248,230,0.65)",
                background: "rgba(38, 30, 22, 0.58)",
                color: "#FFF9EA",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }
            },
            "✕"
          ),

          // 右下角：「今日不再展示」勾选胶囊
          h(
            "button",
            {
              type: "button",
              onClick: toggleHideToday,
              style: {
                border: hideToday ? "1px solid #F3DDA8" : "1px solid rgba(255,248,230,0.38)",
                background: hideToday ? "rgba(243, 221, 168, 0.24)" : "rgba(38, 30, 22, 0.42)",
                color: hideToday ? "#FCEAC0" : "rgba(255,248,230,0.88)",
                borderRadius: "999px",
                padding: "6px 10px",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                backdropFilter: "blur(4px)",
                whiteSpace: "nowrap"
              }
            },
            h(
              "span",
              {
                style: {
                  width: "12px",
                  height: "12px",
                  borderRadius: "3px",
                  border: hideToday ? "1px solid #F3DDA8" : "1px solid rgba(255,248,230,0.65)",
                  background: hideToday ? "#E8C991" : "transparent",
                  color: "#4F3722",
                  fontSize: "9px",
                  fontWeight: "900",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1
                }
              },
              hideToday ? "✓" : ""
            ),
            "今日不再展示"
          )
        )
      )
    );

    if (
      global.ReactDOM &&
      typeof global.ReactDOM.createPortal === "function" &&
      typeof document !== "undefined" &&
      document.body
    ) {
      return global.ReactDOM.createPortal(modalContent, document.body);
    }
    return modalContent;
  }

  // ==========================================
  // 2. 设置 ·「开屏推送」简洁配置页
  // ==========================================
  function SplashPushSettingsOverlay({ isOpen, onClose, onOpenObservation }) {
    const h = React.createElement;
    const { useState, useEffect } = React;
    const [prefs, setPrefs] = useState(() => getPrefs());
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
      const onChange = (e) => setPrefs(e?.detail || getPrefs());
      global.addEventListener("milvus-splash-push-prefs-changed", onChange);
      return () => global.removeEventListener("milvus-splash-push-prefs-changed", onChange);
    }, []);

    if (!isOpen) return null;

    const latest = getLatestLog();
    const updatePref = (patch) => {
      const next = savePrefs(patch);
      setPrefs(next);
    };

    const isMutedToday = prefs.dismissedDate === getTodayKey();

    return h(
      "div",
      {
        className: "settings-overlay open",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 1006,
          background: "#FAF9F5",
          display: "flex",
          flexDirection: "column",
          color: "#333A3C"
        }
      },
      // 极简顶栏
      h(
        "div",
        {
          className: "settings-nav",
          style: {
            background: "rgba(250, 249, 245, 0.96)",
            borderBottom: "1px solid #E5EAE8",
            flexShrink: 0
          }
        },
        h(
          "div",
          { className: "back-btn", onClick: onClose },
          h(
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
            h("path", { d: "m15 18-6-6 6-6" })
          )
        ),
        h("div", { className: "title", style: { color: "#2F3E42", letterSpacing: "0.5px" } }, "开屏推送")
      ),

      // 干净简洁的内容区
      h(
        "div",
        {
          style: {
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }
        },
        // 核心卡片：更新·开屏展示
        h(
          "div",
          {
            style: {
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E6EAE8",
              padding: "16px",
              boxShadow: "0 2px 10px rgba(45, 65, 70, 0.03)",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }
          },
          h(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" } },
            h(
              "div",
              { style: { flex: 1 } },
              h("div", { style: { fontSize: "15px", fontWeight: "700", color: "#2D3B3F", marginBottom: "4px" } }, "更新 · 开屏展示"),
              h(
                "div",
                { style: { fontSize: "12px", color: "#6F7F84", lineHeight: 1.55 } },
                `开启后，打开小手机网页将自动弹出最新更新简章海报（当前：${latest.version} · ${latest.date}，支持左右滑动翻阅往期）。`
              )
            ),
            // 开关胶囊
            h(
              "div",
              {
                onClick: () => updatePref({ updatePosterEnabled: !prefs.updatePosterEnabled }),
                style: {
                  width: "46px",
                  height: "26px",
                  borderRadius: "999px",
                  background: prefs.updatePosterEnabled ? "#5B7880" : "#D6DCDA",
                  position: "relative",
                  cursor: "pointer",
                  transition: "background 0.2s ease",
                  flexShrink: 0
                }
              },
              h("div", {
                style: {
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "#FFFFFF",
                  position: "absolute",
                  top: "2px",
                  left: prefs.updatePosterEnabled ? "22px" : "2px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.22)",
                  transition: "left 0.2s ease"
                }
              })
            )
          ),

          // 开启后的弹出频率细项
          prefs.updatePosterEnabled &&
            h(
              "div",
              {
                style: {
                  paddingTop: "10px",
                  borderTop: "1px solid #EEF2F1",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }
              },
              h("div", { style: { fontSize: "12px", color: "#6A7B80", fontWeight: "600" } }, "弹出频率"),
              h(
                "div",
                { style: { display: "flex", gap: "8px" } },
                [
                  { id: "once_per_version", label: "每新版本首次弹出" },
                  { id: "every_visit", label: "每次打开网页弹出" }
                ].map((opt) => {
                  const active = prefs.frequency === opt.id;
                  return h(
                    "button",
                    {
                      key: opt.id,
                      type: "button",
                      onClick: () => updatePref({ frequency: opt.id }),
                      style: {
                        flex: 1,
                        padding: "8px 6px",
                        borderRadius: "10px",
                        border: active ? "1.5px solid #5B7880" : "1px solid #E2E8E6",
                        background: active ? "#EEF4F3" : "#FAFBF9",
                        color: active ? "#344E55" : "#6B7B80",
                        fontSize: "12px",
                        fontWeight: active ? "700" : "500",
                        cursor: "pointer"
                      }
                    },
                    opt.label
                  );
                })
              ),
              isMutedToday &&
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "11.5px",
                      color: "#8B6943",
                      background: "#FBF6EA",
                      padding: "6px 10px",
                      borderRadius: "8px"
                    }
                  },
                  h("span", null, "已勾选「今日不再展示」，明日恢复自动弹出"),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => updatePref({ dismissedDate: "" }),
                      style: {
                        border: "none",
                        background: "transparent",
                        color: "#5B7880",
                        fontWeight: "700",
                        fontSize: "11.5px",
                        cursor: "pointer"
                      }
                    },
                    "立即恢复"
                  )
                )
            ),

          // 立即预览按钮
          h(
            "button",
            {
              type: "button",
              onClick: () => setPreviewOpen(true),
              style: {
                width: "100%",
                padding: "10px",
                borderRadius: "10px",
                border: "1px solid #E2D4BA",
                background: "#FBF6EA",
                color: "#7A552E",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer"
              }
            },
            "🎴 立即预览当前更新开屏海报"
          )
        ),

        // 二十四节气 & 重大纪念日手账贺卡设置区（独立模块挂载）
        global.SeasonalPushUI && global.SeasonalPushUI.SettingsSection
          ? h(global.SeasonalPushUI.SettingsSection, null)
          : h(
              "div",
              {
                style: {
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px dashed #DDE4E2",
                  background: "#F6F8F7",
                  fontSize: "12px",
                  color: "#88979B",
                  textAlign: "center",
                  lineHeight: 1.6
                }
              },
              "更多开屏推送（节气问候 / 名士生辰 / 纪念日海报）预留位已就绪"
            )
      ),

      h(UpdateSplashPosterModal, {
        isOpen: previewOpen,
        onClose: () => setPreviewOpen(false),
        onOpenObservation: () => {
          setPreviewOpen(false);
          onClose();
          if (typeof onOpenObservation === "function") onOpenObservation();
        }
      })
    );
  }

  // ==========================================
  // 3. 启动自动弹出宿主组件（挂载于 App 顶层）
  // ==========================================
  function SplashPushAutoHost({ onOpenObservation }) {
    const h = React.createElement;
    const { useState, useEffect } = React;
    const [open, setOpen] = useState(false);
    const [gateReady, setGateReady] = useState(() => !global.__MILVUS_ENTRY_GATE_ACTIVE__);
    const [updatePending, setUpdatePending] = useState(() => shouldAutoShowOnBoot());

    useEffect(() => {
      if (gateReady) return;
      const onEntered = () => setGateReady(true);
      global.addEventListener("milvus-entry-gate-entered", onEntered, { once: true });
      return () => global.removeEventListener("milvus-entry-gate-entered", onEntered);
    }, [gateReady]);

    useEffect(() => {
      if (!gateReady) return;
      if (!shouldAutoShowOnBoot()) {
        setUpdatePending(false);
        return;
      }
      const timer = setTimeout(() => {
        setOpen(true);
        const latest = getLatestLog();
        markVersionShown(latest.id || latest.version);
      }, 450);
      return () => clearTimeout(timer);
    }, [gateReady]);

    return h(
      React.Fragment,
      null,
      h(UpdateSplashPosterModal, {
        isOpen: open,
        onClose: () => {
          setOpen(false);
          setUpdatePending(false);
        },
        onOpenObservation
      }),
      global.SeasonalPushUI &&
        global.SeasonalPushUI.QueueHost &&
        h(global.SeasonalPushUI.QueueHost, {
          waitForUpdateClosed: !gateReady || open || updatePending
        }),
      global.GuanglingNewsStudio &&
        global.GuanglingNewsStudio.AutoBroadcastHost &&
        h(global.GuanglingNewsStudio.AutoBroadcastHost, null)
    );
  }

  global.SplashPushEngine = {
    getPrefs,
    savePrefs,
    getAllLogs,
    getLatestLog,
    shouldAutoShowOnBoot,
    markVersionShown,
    UpdateSplashPosterModal,
    SplashPushSettingsOverlay,
    SplashPushAutoHost
  };
})(window);
