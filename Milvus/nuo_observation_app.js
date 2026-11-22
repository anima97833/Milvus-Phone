/**
 * Milvus/nuo_observation_app.js
 * 设置 ·「傩·观测」周瑜观测日志独立展示引擎
 * - 主页：极简干净的按日期倒序卷宗目录列表（绝不截断、flexShrink: 0）
 * - 详情：点击任意一卷弹出独立可滚动阅读弹窗（ReactDOM.createPortal 挂载顶层，完整展示全貌）
 */
(function (global) {
  "use strict";

  const READ_VER_KEY = "milvus_nuo_obs_read_ver_v1";

  function getLogs() {
    return Array.isArray(global.NUO_OBSERVATION_LOGS) ? global.NUO_OBSERVATION_LOGS : [];
  }

  function hasUnreadUpdate() {
    const logs = getLogs();
    if (logs.length === 0) return false;
    try {
      return localStorage.getItem(READ_VER_KEY) !== String(logs[0].id || logs[0].version);
    } catch (e) {
      return false;
    }
  }

  function markLatestAsRead() {
    const logs = getLogs();
    if (logs.length === 0) return;
    try {
      localStorage.setItem(READ_VER_KEY, String(logs[0].id || logs[0].version));
    } catch (e) {}
  }

  function NuoObservationOverlay({ isOpen, onClose }) {
    const h = React.createElement;
    const { useState, useEffect, useMemo } = React;

    const logs = getLogs();
    const [activeLog, setActiveLog] = useState(null);
    const [modalModule, setModalModule] = useState("全部");

    useEffect(() => {
      if (isOpen) {
        markLatestAsRead();
      } else {
        setActiveLog(null);
      }
    }, [isOpen]);

    const modalModules = useMemo(() => {
      if (!activeLog) return ["全部"];
      const set = new Set(["全部"]);
      (activeLog.sections || []).forEach((s) => {
        if (s && s.module) set.add(s.module);
      });
      return Array.from(set);
    }, [activeLog]);

    if (!isOpen) return null;

    const openLogModal = (log) => {
      setModalModule("全部");
      setActiveLog(log);
    };

    const renderDetailModal = () => {
      if (!activeLog) return null;
      const sections =
        modalModule === "全部"
          ? activeLog.sections || []
          : (activeLog.sections || []).filter((s) => s.module === modalModule);

      const modalNode = h(
        "div",
        {
          onClick: () => setActiveLog(null),
          style: {
            position: "fixed",
            inset: 0,
            zIndex: 99995,
            background: "rgba(25, 34, 38, 0.52)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }
        },
        h(
          "div",
          {
            onClick: (e) => e.stopPropagation(),
            style: {
              width: "100%",
              maxWidth: "400px",
              maxHeight: "86vh",
              background: "#FAF9F5",
              borderRadius: "18px",
              border: "1px solid #DCE4E2",
              boxShadow: "0 18px 46px rgba(24, 38, 42, 0.28)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              color: "#333A3C"
            }
          },
          // 弹窗固定顶栏
          h(
            "div",
            {
              style: {
                padding: "14px 16px 12px",
                background: "#FFFFFF",
                borderBottom: "1px solid #E6ECEA",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "10px",
                flexShrink: 0
              }
            },
            h(
              "div",
              { style: { minWidth: 0 } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" } },
                h(
                  "span",
                  {
                    style: {
                      fontSize: "11px",
                      fontWeight: "700",
                      color: "#FFFFFF",
                      background: "#5B7880",
                      padding: "1px 7px",
                      borderRadius: "6px"
                    }
                  },
                  activeLog.version
                ),
                h(
                  "span",
                  { style: { fontSize: "12px", color: "#7B8C91", fontFamily: "monospace" } },
                  activeLog.date
                )
              ),
              h(
                "div",
                { style: { fontSize: "15.5px", fontWeight: "700", color: "#2A383C", lineHeight: 1.35 } },
                activeLog.title
              )
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => setActiveLog(null),
                style: {
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: "none",
                  background: "#EDF2F1",
                  color: "#55686D",
                  fontSize: "14px",
                  fontWeight: "700",
                  cursor: "pointer",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }
              },
              "✕"
            )
          ),

          // 弹窗内模块快捷筛选条
          modalModules.length > 2 &&
            h(
              "div",
              {
                style: {
                  padding: "9px 16px",
                  background: "#F5F8F7",
                  borderBottom: "1px solid #E6ECEA",
                  display: "flex",
                  gap: "6px",
                  overflowX: "auto",
                  flexShrink: 0
                }
              },
              modalModules.map((mod) => {
                const active = modalModule === mod;
                return h(
                  "button",
                  {
                    key: mod,
                    type: "button",
                    onClick: () => setModalModule(mod),
                    style: {
                      flexShrink: 0,
                      border: active ? "1px solid #5B7880" : "1px solid #DDE5E3",
                      background: active ? "#5B7880" : "#FFFFFF",
                      color: active ? "#FFFFFF" : "#5B6D72",
                      borderRadius: "999px",
                      padding: "3px 10px",
                      fontSize: "11px",
                      fontWeight: active ? "600" : "500",
                      cursor: "pointer"
                    }
                  },
                  mod
                );
              })
            ),

          // 弹窗主体可滚动阅读区
          h(
            "div",
            {
              style: {
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overscrollBehavior: "contain",
                padding: "14px 16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "14px"
              }
            },
            // 周瑜眉批
            activeLog.opening &&
              h(
                "div",
                {
                  style: {
                    fontSize: "12.5px",
                    lineHeight: 1.75,
                    color: "#475A5F",
                    background: "#FFFFFF",
                    padding: "11px 13px",
                    borderRadius: "11px",
                    border: "1px solid #E5ECEA",
                    borderLeft: "3px solid #5B7880",
                    flexShrink: 0
                  }
                },
                activeLog.opening
              ),

            // 全部更新细目
            sections.map((sec, sIdx) =>
              h(
                "div",
                {
                  key: sIdx,
                  style: {
                    background: "#FFFFFF",
                    borderRadius: "12px",
                    border: "1px solid #E6ECEA",
                    padding: "12px 13px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    flexShrink: 0
                  }
                },
                h(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13.5px",
                      fontWeight: "700",
                      color: "#385259",
                      paddingBottom: "6px",
                      borderBottom: "1px solid #EFF3F2"
                    }
                  },
                  h("span", {
                    style: {
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#5B7880",
                      display: "inline-block"
                    }
                  }),
                  sec.module
                ),
                (sec.items || []).map((item, iIdx) =>
                  h(
                    "div",
                    {
                      key: iIdx,
                      style: {
                        paddingLeft: "10px",
                        borderLeft: "2px solid #E4ECEA"
                      }
                    },
                    h(
                      "div",
                      { style: { fontSize: "13px", fontWeight: "700", color: "#2D373A", marginBottom: "3px" } },
                      item.label
                    ),
                    h(
                      "div",
                      { style: { fontSize: "12.5px", color: "#566468", lineHeight: 1.7 } },
                      item.detail
                    )
                  )
                )
              )
            ),

            // 案头附记
            activeLog.postscript &&
              h(
                "div",
                {
                  style: {
                    padding: "11px 13px",
                    background: "#F3F6F5",
                    borderRadius: "10px",
                    border: "1px dashed #D7E0DE",
                    fontSize: "12px",
                    color: "#6B7C81",
                    fontStyle: "italic",
                    lineHeight: 1.7,
                    flexShrink: 0
                  }
                },
                activeLog.postscript
              )
          )
        )
      );

      if (global.ReactDOM && typeof global.ReactDOM.createPortal === "function" && typeof document !== "undefined" && document.body) {
        return global.ReactDOM.createPortal(modalNode, document.body);
      }
      return modalNode;
    };

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
        h("div", { className: "title", style: { color: "#2F3E42", letterSpacing: "1px" } }, "傩·观测"),
        h(
          "div",
          {
            style: {
              position: "absolute",
              right: "16px",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "11px",
              color: "#6B8288",
              background: "#EDF2F1",
              padding: "3px 9px",
              borderRadius: "999px",
              fontWeight: "600"
            }
          },
          `观测日志 · ${logs.length} 卷`
        )
      ),

      // 主滚动目录区（只放干净的卷宗卡片，点击弹出完整阅读窗）
      h(
        "div",
        {
          style: {
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: "16px 16px max(32px, env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }
        },
        // 顶部素雅题记卡
        h(
          "div",
          {
            style: {
              background: "#FFFFFF",
              border: "1px solid #E4EAE8",
              borderLeft: "3px solid #5B7880",
              borderRadius: "12px",
              padding: "13px 15px",
              boxShadow: "0 2px 10px rgba(45, 65, 70, 0.03)",
              flexShrink: 0
            }
          },
          h(
            "div",
            { style: { fontSize: "14px", fontWeight: "700", color: "#2F4247", marginBottom: "4px", letterSpacing: "0.5px" } },
            "观测日志"
          ),
          h(
            "div",
            { style: { fontSize: "12.5px", color: "#65767B", lineHeight: 1.65 } },
            "凡小手机更迭、修补与增设诸事，皆按日期逐卷录于此处。点击任意一卷即可展卷细阅。"
          ),
          h(
            "div",
            { style: { fontSize: "11px", color: "#8D9CA0", textAlign: "right", marginTop: "6px" } },
            "—— 录自江东案头 · 周瑜"
          )
        ),

        // 卷宗目录卡片列表
        logs.map((log, idx) => {
          const itemCount = (log.sections || []).reduce((acc, s) => acc + (s.items ? s.items.length : 0), 0);
          const moduleNames = (log.sections || []).map((s) => s.module).filter(Boolean);

          return h(
            "div",
            {
              key: log.id,
              onClick: () => openLogModal(log),
              style: {
                background: "#FFFFFF",
                borderRadius: "14px",
                border: "1px solid #E4EAE8",
                padding: "14px 15px",
                boxShadow: "0 2px 10px rgba(45, 65, 70, 0.03)",
                cursor: "pointer",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                transition: "transform 0.15s ease"
              }
            },
            h(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" } },
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" } },
                h(
                  "span",
                  {
                    style: {
                      fontSize: "11px",
                      fontWeight: "700",
                      color: "#FFFFFF",
                      background: idx === 0 ? "#5B7880" : "#8FA3A8",
                      padding: "1px 7px",
                      borderRadius: "6px"
                    }
                  },
                  log.version
                ),
                h("span", { style: { fontSize: "12px", color: "#7B8C91", fontFamily: "monospace" } }, log.date),
                idx === 0 &&
                  h(
                    "span",
                    {
                      style: {
                        fontSize: "10px",
                        color: "#4C6E63",
                        background: "#E7F2EE",
                        padding: "1px 6px",
                        borderRadius: "999px",
                        fontWeight: "600"
                      }
                    },
                    "最新"
                  )
              ),
              h(
                "span",
                { style: { fontSize: "11.5px", color: "#5B7880", fontWeight: "600", flexShrink: 0 } },
                `展卷 (${itemCount}项) ›`
              )
            ),
            h(
              "div",
              { style: { fontSize: "15px", fontWeight: "700", color: "#2D3B3F" } },
              log.title
            ),
            log.opening &&
              h(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "#67777C",
                    lineHeight: 1.55,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden"
                  }
                },
                log.opening
              ),
            moduleNames.length > 0 &&
              h(
                "div",
                { style: { display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "2px" } },
                moduleNames.map((m) =>
                  h(
                    "span",
                    {
                      key: m,
                      style: {
                        fontSize: "10.5px",
                        color: "#5D7278",
                        background: "#F1F5F4",
                        padding: "2px 7px",
                        borderRadius: "6px"
                      }
                    },
                    m
                  )
                )
              )
          );
        })
      ),

      renderDetailModal()
    );
  }

  global.NuoObservationEngine = {
    getLogs,
    hasUnreadUpdate,
    markLatestAsRead,
    NuoObservationOverlay
  };
})(window);
