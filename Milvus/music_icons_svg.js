/**
 * Milvus/music_icons_svg.js
 * 音乐 APP 与主屏「留声机」小组件共享手绘细线矢量图标库（零 Emoji）
 * - 提供 repeat_all（列表循环）、repeat_one（单曲循环带手绘数字 1）、shuffle（随机播放）等手绘 SVG
 * - 纯展示工具模块，零 localStorage 写入
 */
(function (global) {
  "use strict";

  function renderIcon(h, name, { size = 16, color = "currentColor", strokeWidth = 1.85 } = {}) {
    if (!h) return null;
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
      case "repeat_one": // 手绘单曲循环（细线双箭 + 居中数字 1）
        return h("svg", common,
          h("path", { d: "M17 3.5l3 3-3 3" }),
          h("path", { d: "M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20" }),
          h("path", { d: "M7 20.5l-3-3 3-3" }),
          h("path", { d: "M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4" }),
          h("path", { d: "M11.2 10.4l1.3-1v5.2", strokeWidth: 1.9 })
        );
      case "shuffle": // 手绘随机交错双箭
        return h("svg", common,
          h("path", { d: "M16.5 4.5H20v3.5" }),
          h("path", { d: "M4 18.5L20 4.5" }),
          h("path", { d: "M16.5 19.5H20V16" }),
          h("path", { d: "M14.5 14l5.5 5.5" }),
          h("path", { d: "M4 5.5l5.5 5.5" })
        );
      case "repeat_all": // 手绘列表循环
      default:
        return h("svg", common,
          h("path", { d: "M17 3.5l3 3-3 3" }),
          h("path", { d: "M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20" }),
          h("path", { d: "M7 20.5l-3-3 3-3" }),
          h("path", { d: "M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4" })
        );
    }
  }

  function renderPlayModeIcon(h, playMode, opts = {}) {
    const mode = playMode === "single" ? "repeat_one" : playMode === "shuffle" ? "shuffle" : "repeat_all";
    return renderIcon(h, mode, opts);
  }

  function getPlayModeLabel(playMode) {
    if (playMode === "single") return "单曲循环";
    if (playMode === "shuffle") return "随机播放";
    return "列表循环";
  }

  const api = {
    renderIcon,
    renderPlayModeIcon,
    getPlayModeLabel
  };

  global.MusicIconsSvg = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
