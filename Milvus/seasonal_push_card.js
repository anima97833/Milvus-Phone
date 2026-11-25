/**
 * Milvus/seasonal_push_card.js
 * 独立模块（阶段二）：手账便签风「二十四节气 & 重大纪念日」开屏贺卡 UI + 设置管理面板 + 串行托管宿主
 *
 * 视觉构造（1:1 对照参考手账贺卡图）：
 * - 外层柔彩棋盘格桌布圆角海报框（6 套治愈色盘）
 * - 底层微倾 -5deg 奶油鹅黄横线便签纸 + 焦糖橙粉白虚线缝线衬板 + 顶部波浪邮票齿孔米白方格主纸
 * - 左上角手绘立体回形针 + 右上角白边小蜗牛手账角标贴纸
 * - 中央 16 瓣蕾丝花边圆垫 (Doily Lace) + 深棕厚描边软萌手绘 SVG 徽章 + 暖鹅黄折角燕尾丝带横幅
 * - 居中温情寄语区（离线秒开 + 可选 AI 亲笔）
 * - 左下角小兔气球署名勋章 + 暖珊瑚胶囊名牌 + 温暖天数统计
 * - 右下角手绘小铅笔 + 彩色方印 + 翻开的手账本贴纸组
 * - 零 Emoji（全量手绘矢量 SVG），零新增 localStorage
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_SEASONAL_PUSH_CARD_LOADED__) return;
  global.__MILVUS_SEASONAL_PUSH_CARD_LOADED__ = true;

  const h = React.createElement;

  // ===================== 1. 手绘细线功能小图标（设置页与按钮用，零 Emoji） =====================
  const UiSvg = {
    CalendarHeart: () =>
      h(
        "svg",
        { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" },
        h("rect", { x: 3, y: 4, width: 18, height: 18, rx: 3 }),
        h("line", { x1: 16, y1: 2, x2: 16, y2: 6 }),
        h("line", { x1: 8, y1: 2, x2: 8, y2: 6 }),
        h("line", { x1: 3, y1: 10, x2: 21, y2: 10 }),
        h("path", { d: "M12 18.2s-3.4-2.1-3.4-4.2a1.9 1.9 0 0 1 3.4-1.1 1.9 1.9 0 0 1 3.4 1.1c0 2.1-3.4 4.2-3.4 4.2z" })
      ),
    Leaf: () =>
      h(
        "svg",
        { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" }),
        h("path", { d: "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" })
      ),
    Plus: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" },
        h("line", { x1: 12, y1: 5, x2: 12, y2: 19 }),
        h("line", { x1: 5, y1: 12, x2: 19, y2: 12 })
      ),
    Eye: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
        h("circle", { cx: 12, cy: 12, r: 3 })
      ),
    Trash: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("polyline", { points: "3 6 5 6 21 6" }),
        h("path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }),
        h("path", { d: "M10 11v6M14 11v6" })
      ),
    Copy: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("rect", { x: 9, y: 9, width: 13, height: 13, rx: 2 }),
        h("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
      ),
    Feather: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" }),
        h("line", { x1: 16, y1: 8, x2: 2, y2: 22 }),
        h("line", { x1: 17.5, y1: 15, x2: 9, y2: 15 })
      )
  };

  // ===================== 2. 参考图同款手账贴纸与装饰 SVG =====================

  // 左上角立体回形针（穿卡夹纸）
  function PaperClipSvg({ color }) {
    const c = color || "#A492C2";
    return h(
      "svg",
      {
        width: 34,
        height: 46,
        viewBox: "0 0 40 56",
        style: { filter: "drop-shadow(0 2px 3px rgba(74, 48, 40, 0.22))" }
      },
      h("path", {
        d: "M14 14 V38 C14 45 26 45 26 38 V12 C26 4 10 4 10 12 V34 C10 38 18 38 18 34 V16",
        fill: "none",
        stroke: "#5E4548",
        strokeWidth: "6.4",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }),
      h("path", {
        d: "M14 14 V38 C14 45 26 45 26 38 V12 C26 4 10 4 10 12 V34 C10 38 18 38 18 34 V16",
        fill: "none",
        stroke: c,
        strokeWidth: "3.6",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }),
      h("path", {
        d: "M12 13 V32",
        fill: "none",
        stroke: "rgba(255,255,255,0.65)",
        strokeWidth: "1.2",
        strokeLinecap: "round"
      })
    );
  }

  // 右上角软萌小蜗牛 + 贴纸角标（呼应参考图右上角纸箱小蜗牛贴纸）
  function CornerStickerSvg({ label, accent }) {
    const text = (label || "岁时记").slice(0, 5);
    const badgeFill = accent || "#E07E78";
    return h(
      "svg",
      {
        width: 96,
        height: 64,
        viewBox: "0 0 116 78",
        style: { filter: "drop-shadow(0 3px 5px rgba(86, 52, 40, 0.18))" }
      },
      // 白色贴纸外轮廓
      h("rect", { x: 8, y: 20, width: 72, height: 34, rx: 14, fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidth: 6 }),
      // 纸箱小蜗牛轮廓（白边）
      h("circle", { cx: 88, cy: 26, r: 16, fill: "#FFFFFF" }),
      h("rect", { x: 64, y: 28, width: 38, height: 22, rx: 4, fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidth: 5 }),
      // 纸箱本体
      h("rect", { x: 66, y: 31, width: 34, height: 17, rx: 3, fill: "#C99A74", stroke: "#633D2E", strokeWidth: 2 }),
      h("path", { d: "M66 36 L100 36 M83 31 L83 48", stroke: "#633D2E", strokeWidth: 1.5 }),
      // 小蜗牛壳 + 软软身体
      h("path", { d: "M68 31 C68 20 77 18 81 24 C84 28 84 31 84 31 Z", fill: "#FCEBD8", stroke: "#633D2E", strokeWidth: 2 }),
      h("line", { x1: 72, y1: 21, x2: 70, y2: 14, stroke: "#633D2E", strokeWidth: 1.8, strokeLinecap: "round" }),
      h("line", { x1: 77, y1: 20, x2: 77, y2: 13, stroke: "#633D2E", strokeWidth: 1.8, strokeLinecap: "round" }),
      h("circle", { cx: 70, cy: 13.5, r: 1.5, fill: "#633D2E" }),
      h("circle", { cx: 77, cy: 12.5, r: 1.5, fill: "#633D2E" }),
      h("circle", { cx: 73, cy: 25, r: 1.1, fill: "#633D2E" }),
      h("circle", { cx: 89, cy: 25, r: 10.5, fill: "#EBA69B", stroke: "#633D2E", strokeWidth: 2 }),
      h("path", { d: "M89 25 m-5 0 a5 5 0 1 0 10 0 a3.2 3.2 0 1 0 -6.4 0", fill: "none", stroke: "#8A4D43", strokeWidth: 1.7, strokeLinecap: "round" }),
      // 左侧彩色手账文字胶囊
      h("rect", { x: 10, y: 24, width: 66, height: 26, rx: 12, fill: "#FFF7E0", stroke: "#633D2E", strokeWidth: 2 }),
      h("rect", { x: 13, y: 27, width: 60, height: 20, rx: 9, fill: badgeFill }),
      h(
        "text",
        {
          x: 43,
          y: 41,
          textAnchor: "middle",
          fill: "#FFFFFF",
          fontSize: "11.5",
          fontWeight: "700",
          letterSpacing: "0.5"
        },
        text
      )
    );
  }

  // 中央 16 瓣蕾丝花边圆垫纸（Doily Lace SVG）
  function LaceDoilySvg({ color }) {
    const c = color || "#F2C6D2";
    const petals = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i * 360) / 16;
      petals.push(
        h("ellipse", {
          key: `p${i}`,
          cx: 90,
          cy: 18,
          rx: 13,
          ry: 14,
          fill: c,
          opacity: "0.72",
          transform: `rotate(${angle} 90 90)`
        })
      );
      petals.push(
        h("circle", {
          key: `d${i}`,
          cx: 90,
          cy: 22,
          r: 3.2,
          fill: "#FFFDF8",
          opacity: "0.9",
          transform: `rotate(${angle} 90 90)`
        })
      );
    }
    return h(
      "svg",
      {
        width: 156,
        height: 156,
        viewBox: "0 0 180 180",
        style: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none" }
      },
      petals,
      h("circle", { cx: 90, cy: 90, r: 66, fill: c, opacity: "0.58" }),
      h("circle", { cx: 90, cy: 90, r: 58, fill: "none", stroke: "#FFFDF8", strokeWidth: "2", strokeDasharray: "4 4", opacity: "0.9" }),
      h("circle", { cx: 90, cy: 90, r: 46, fill: "#FFFBF5", opacity: "0.78" })
    );
  }

  // ===================== 3. 中央深棕粗描边软萌手绘 SVG 徽章库 =====================
  function CenterIllustrationSvg({ badgeType }) {
    const stroke = "#5E3629";
    const sw = 3;

    switch (badgeType) {
      case "piggy": // 参考图同款圆滚滚粉色小猪存钱罐
        return h(
          "svg",
          { width: 92, height: 84, viewBox: "0 0 120 108", style: { position: "relative", zIndex: 2 } },
          // 小卷尾巴
          h("path", { d: "M28 42 C18 38 18 28 25 27 C30 27 30 34 24 35", fill: "none", stroke, strokeWidth: 3.2, strokeLinecap: "round" }),
          // 四只小蹄子
          h("ellipse", { cx: 46, cy: 84, rx: 8, ry: 9, fill: "#F7C3CC", stroke, strokeWidth: sw }),
          h("ellipse", { cx: 74, cy: 86, rx: 8, ry: 9, fill: "#F7C3CC", stroke, strokeWidth: sw }),
          // 圆滚滚小猪身体
          h("ellipse", { cx: 63, cy: 56, rx: 36, ry: 30, fill: "#FCD7DE", stroke, strokeWidth: 3.4 }),
          // 背部柔和白高光
          h("ellipse", { cx: 52, cy: 42, rx: 14, ry: 6, fill: "rgba(255,255,255,0.65)", transform: "rotate(-12 52 42)" }),
          // 顶部投币口
          h("rect", { x: 54, y: 31, width: 16, height: 4.5, rx: 2.2, fill: "#7A483A", transform: "rotate(10 62 33)" }),
          // 两只折耳朵
          h("path", { d: "M66 31 Q74 22 79 34 Z", fill: "#F5B8C4", stroke, strokeWidth: sw, strokeLinejoin: "round" }),
          h("path", { d: "M53 56 Q62 72 72 64", fill: "#F5B8C4", stroke, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" }),
          // 小猪鼻
          h("ellipse", { cx: 92, cy: 62, rx: 10, ry: 8.5, fill: "#F5B2BF", stroke, strokeWidth: sw }),
          h("circle", { cx: 89.5, cy: 61.5, r: 1.7, fill: stroke }),
          h("circle", { cx: 95, cy: 62.5, r: 1.7, fill: stroke }),
          // 圆溜溜眼睛与粉腮红
          h("circle", { cx: 77, cy: 54, r: 2.6, fill: stroke }),
          h("circle", { cx: 97, cy: 52, r: 2.3, fill: stroke }),
          h("ellipse", { cx: 72, cy: 61, rx: 4.5, ry: 2.8, fill: "#F399AA", opacity: "0.7" })
        );

      case "heart_seal": // 纪念日双心火漆印章
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("circle", { cx: 58, cy: 54, r: 34, fill: "#F6B5BE", stroke, strokeWidth: 3.2 }),
          h("circle", { cx: 58, cy: 54, r: 26, fill: "#FAD2D8", stroke: "#B56A72", strokeWidth: 2, strokeDasharray: "4 3" }),
          h("path", { d: "M58 70 C58 70 38 57 38 45 C38 38 44 34 50 37 C54 39 56 42 58 45 C60 42 62 39 66 37 C72 34 78 38 78 45 C78 57 58 70 58 70 Z", fill: "#E77A89", stroke, strokeWidth: sw, strokeLinejoin: "round" }),
          h("circle", { cx: 47, cy: 43, r: 3, fill: "rgba(255,255,255,0.65)" })
        );

      case "cake": // 生辰草莓奶油小蛋糕
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("rect", { x: 55, y: 18, width: 6, height: 18, rx: 2, fill: "#FCE09B", stroke, strokeWidth: 2.4 }),
          h("path", { d: "M58 8 Q64 15 58 20 Q52 15 58 8 Z", fill: "#F79468", stroke, strokeWidth: 2.2 }),
          h("rect", { x: 26, y: 44, width: 64, height: 40, rx: 10, fill: "#FDE7C8", stroke, strokeWidth: 3.2 }),
          h("path", { d: "M26 52 Q36 62 46 52 Q58 62 70 52 Q80 62 90 52 L90 44 Q90 36 82 36 L34 36 Q26 36 26 44 Z", fill: "#FFFFFF", stroke, strokeWidth: sw, strokeLinejoin: "round" }),
          h("circle", { cx: 42, cy: 36, r: 6.5, fill: "#EF7B88", stroke, strokeWidth: 2.4 }),
          h("circle", { cx: 74, cy: 36, r: 6.5, fill: "#EF7B88", stroke, strokeWidth: 2.4 }),
          h("line", { x1: 20, y1: 86, x2: 96, y2: 86, stroke, strokeWidth: 3.2, strokeLinecap: "round" })
        );

      case "snow": // 冬季小雪人 + 雪花
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("circle", { cx: 58, cy: 70, r: 23, fill: "#FFFFFF", stroke, strokeWidth: 3.2 }),
          h("circle", { cx: 58, cy: 40, r: 17, fill: "#FFFFFF", stroke, strokeWidth: 3.2 }),
          // 暖红围巾
          h("path", { d: "M42 52 Q58 58 74 52", fill: "none", stroke: "#E67873", strokeWidth: 7, strokeLinecap: "round" }),
          h("path", { d: "M42 52 Q58 58 74 52", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" }),
          h("rect", { x: 64, y: 52, width: 7, height: 15, rx: 3, fill: "#E67873", stroke, strokeWidth: 2.2 }),
          // 眼睛与胡萝卜鼻
          h("circle", { cx: 52, cy: 37, r: 2.2, fill: stroke }),
          h("circle", { cx: 64, cy: 37, r: 2.2, fill: stroke }),
          h("path", { d: "M58 41 L66 43 L58 45 Z", fill: "#F2965B", stroke, strokeWidth: 1.8, strokeLinejoin: "round" }),
          h("circle", { cx: 48, cy: 42, r: 3, fill: "#F6B3BD", opacity: "0.7" }),
          h("circle", { cx: 68, cy: 42, r: 3, fill: "#F6B3BD", opacity: "0.7" })
        );

      case "lantern": // 暖橘小灯笼
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("line", { x1: 58, y1: 12, x2: 58, y2: 24, stroke, strokeWidth: 3 }),
          h("rect", { x: 46, y: 22, width: 24, height: 7, rx: 3, fill: "#E7B45E", stroke, strokeWidth: 2.5 }),
          h("ellipse", { cx: 58, cy: 54, rx: 30, ry: 26, fill: "#F38A6C", stroke, strokeWidth: 3.2 }),
          h("ellipse", { cx: 58, cy: 54, rx: 14, ry: 25, fill: "#FAAC88", stroke, strokeWidth: 2.2 }),
          h("rect", { x: 48, y: 78, width: 20, height: 7, rx: 3, fill: "#E7B45E", stroke, strokeWidth: 2.5 }),
          h("path", { d: "M54 85 L52 98 M58 85 L58 100 M62 85 L64 98", stroke: "#D9755A", strokeWidth: 2.6, strokeLinecap: "round" })
        );

      case "lotus": // 盛夏粉莲与荷叶
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("ellipse", { cx: 58, cy: 76, rx: 36, ry: 12, fill: "#9FD2B8", stroke, strokeWidth: sw }),
          h("path", { d: "M58 26 Q74 44 58 72 Q42 44 58 26 Z", fill: "#F9B8C8", stroke, strokeWidth: sw }),
          h("path", { d: "M34 40 Q52 48 56 72 Q32 64 34 40 Z", fill: "#FCD1DC", stroke, strokeWidth: sw }),
          h("path", { d: "M82 40 Q64 48 60 72 Q84 64 82 40 Z", fill: "#FCD1DC", stroke, strokeWidth: sw }),
          h("circle", { cx: 58, cy: 54, r: 5, fill: "#FCE08B", stroke, strokeWidth: 2 })
        );

      case "maple": // 秋日暖红枫叶
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("path", {
            d: "M58 18 L66 38 L86 32 L76 52 L92 64 L70 68 L64 80 L58 74 L52 80 L46 68 L24 64 L40 52 L30 32 L50 38 Z",
            fill: "#EC8C65",
            stroke,
            strokeWidth: 3.2,
            strokeLinejoin: "round"
          }),
          h("path", { d: "M58 36 L58 94 M58 58 L42 48 M58 58 L74 48", stroke, strokeWidth: 2.4, strokeLinecap: "round" })
        );

      case "moon": // 中秋明月玉兔云
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("circle", { cx: 58, cy: 50, r: 30, fill: "#FDE396", stroke, strokeWidth: 3.2 }),
          h("circle", { cx: 48, cy: 40, r: 5, fill: "#F7CC6B" }),
          h("circle", { cx: 70, cy: 56, r: 6.5, fill: "#F7CC6B" }),
          h("path", { d: "M24 76 Q32 64 44 68 Q54 60 66 68 Q78 64 88 74 Q92 84 80 84 L32 84 Q20 84 24 76 Z", fill: "#FFFFFF", stroke, strokeWidth: sw, strokeLinejoin: "round" })
        );

      case "tea": // 谷雨暖茶杯
      case "qingming":
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("path", { d: "M46 28 Q42 20 48 14 M62 26 Q58 18 64 12", fill: "none", stroke: "#A88B7A", strokeWidth: 2.6, strokeLinecap: "round" }),
          h("path", { d: "M82 46 C94 46 94 68 82 68", fill: "none", stroke, strokeWidth: 3.2, strokeLinecap: "round" }),
          h("path", { d: "M30 40 L84 40 L79 74 C78 82 70 86 57 86 C44 86 36 82 35 74 Z", fill: "#E2F0DA", stroke, strokeWidth: 3.2, strokeLinejoin: "round" }),
          h("ellipse", { cx: 57, cy: 40, rx: 27, ry: 6, fill: "#B8D9A8", stroke, strokeWidth: 2.6 }),
          h("circle", { cx: 49, cy: 62, r: 2.2, fill: stroke }),
          h("circle", { cx: 65, cy: 62, r: 2.2, fill: stroke }),
          h("path", { d: "M54 66 Q57 69 60 66", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" })
        );

      default: // 春燕 / 樱花 / 通用治愈花环徽章
        return h(
          "svg",
          { width: 90, height: 84, viewBox: "0 0 116 108", style: { position: "relative", zIndex: 2 } },
          h("circle", { cx: 58, cy: 32, r: 15, fill: "#FCD1DC", stroke, strokeWidth: sw }),
          h("circle", { cx: 78, cy: 46, r: 15, fill: "#FCD1DC", stroke, strokeWidth: sw }),
          h("circle", { cx: 70, cy: 70, r: 15, fill: "#FCD1DC", stroke, strokeWidth: sw }),
          h("circle", { cx: 46, cy: 70, r: 15, fill: "#FCD1DC", stroke, strokeWidth: sw }),
          h("circle", { cx: 38, cy: 46, r: 15, fill: "#FCD1DC", stroke, strokeWidth: sw }),
          h("circle", { cx: 58, cy: 54, r: 14, fill: "#FCE29A", stroke, strokeWidth: sw }),
          h("circle", { cx: 53, cy: 52, r: 2, fill: stroke }),
          h("circle", { cx: 63, cy: 52, r: 2, fill: stroke }),
          h("path", { d: "M55 57 Q58 60 61 57", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" })
        );
    }
  }

  // 中央经典折角燕尾丝带横幅（Ribbon Banner）
  function RibbonBanner({ text, palette }) {
    return h(
      "div",
      {
        style: {
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "6px auto 12px",
          width: "88%",
          maxWidth: "250px"
        }
      },
      // 左燕尾
      h(
        "svg",
        { width: 22, height: 28, viewBox: "0 0 22 28", style: { marginRight: "-6px", marginTop: "6px", flexShrink: 0 } },
        h("path", {
          d: "M22 4 L2 4 L8 14 L2 24 L22 24 Z",
          fill: palette.ribbonBorder,
          opacity: "0.78",
          stroke: "#6A4636",
          strokeWidth: "1.6",
          strokeLinejoin: "round"
        })
      ),
      // 主丝带条
      h(
        "div",
        {
          style: {
            position: "relative",
            zIndex: 2,
            flex: 1,
            padding: "6px 14px",
            borderRadius: "6px",
            background: palette.ribbonBg,
            border: "1.8px solid #7C523B",
            boxShadow: "0 3px 0 rgba(124, 82, 59, 0.16)",
            textAlign: "center",
            fontSize: "13.5px",
            fontWeight: 700,
            color: palette.ribbonText,
            letterSpacing: "0.6px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }
        },
        text
      ),
      // 右燕尾
      h(
        "svg",
        { width: 22, height: 28, viewBox: "0 0 22 28", style: { marginLeft: "-6px", marginTop: "6px", flexShrink: 0 } },
        h("path", {
          d: "M0 4 L20 4 L14 14 L20 24 L0 24 Z",
          fill: palette.ribbonBorder,
          opacity: "0.78",
          stroke: "#6A4636",
          strokeWidth: "1.6",
          strokeLinejoin: "round"
        })
      )
    );
  }

  // 左下角软萌小兔气球署名勋章（1:1 呼应参考图左下角）
  function BunnyBadgeSvg() {
    const stroke = "#5E3629";
    return h(
      "svg",
      {
        width: 54,
        height: 54,
        viewBox: "0 0 72 72",
        style: { flexShrink: 0, filter: "drop-shadow(0 2px 4px rgba(84, 52, 42, 0.18))" }
      },
      // 外圈白色贴纸底
      h("circle", { cx: 36, cy: 38, r: 28, fill: "#FFFFFF" }),
      // 淡彩圆环框
      h("circle", { cx: 36, cy: 38, r: 23, fill: "#FFF4E4", stroke: "#E6A979", strokeWidth: 3 }),
      // 右侧小红气球装饰
      h("ellipse", { cx: 56, cy: 26, rx: 7, ry: 9, fill: "#F1847E", stroke, strokeWidth: 2, transform: "rotate(14 56 26)" }),
      // 小兔耳朵
      h("ellipse", { cx: 29, cy: 23, rx: 5, ry: 11, fill: "#F7E5DF", stroke, strokeWidth: 2.4 }),
      h("ellipse", { cx: 43, cy: 23, rx: 5, ry: 11, fill: "#F7E5DF", stroke, strokeWidth: 2.4 }),
      // 小兔脸蛋
      h("ellipse", { cx: 36, cy: 40, rx: 16, ry: 13, fill: "#FFF5F0", stroke, strokeWidth: 2.5 }),
      h("circle", { cx: 30.5, cy: 39, r: 1.8, fill: stroke }),
      h("circle", { cx: 41.5, cy: 39, r: 1.8, fill: stroke }),
      h("ellipse", { cx: 26.5, cy: 42.5, rx: 3, ry: 1.8, fill: "#F2A5B0" }),
      h("ellipse", { cx: 45.5, cy: 42.5, rx: 3, ry: 1.8, fill: "#F2A5B0" }),
      h("path", { d: "M34 42 Q36 44 38 42", fill: "none", stroke, strokeWidth: 1.8, strokeLinecap: "round" })
    );
  }

  // 右下角手绘小铅笔 + 彩色方印 + 翻开手账本贴纸组（1:1 呼应参考图右下角）
  function StationeryDecoSvg() {
    const stroke = "#633E30";
    return h(
      "svg",
      {
        width: 112,
        height: 62,
        viewBox: "0 0 132 74",
        style: { pointerEvents: "none", filter: "drop-shadow(0 2px 4px rgba(84, 52, 42, 0.16))" }
      },
      // 小铅笔
      h(
        "g",
        { transform: "translate(6, 44) rotate(-26)" },
        h("rect", { x: 8, y: 0, width: 28, height: 8, rx: 2, fill: "#E3B89E", stroke, strokeWidth: 2 }),
        h("rect", { x: 30, y: 0, width: 7, height: 8, rx: 2, fill: "#F29D9B", stroke, strokeWidth: 2 }),
        h("polygon", { points: "8,0 0,4 8,8", fill: "#FCEBD6", stroke, strokeWidth: 2, strokeLinejoin: "round" }),
        h("polygon", { points: "3,2.5 0,4 3,5.5", fill: stroke })
      ),
      // 彩色拼块小方印
      h(
        "g",
        { transform: "translate(52, 34) rotate(-8)" },
        h("rect", { x: 0, y: 0, width: 22, height: 22, rx: 4, fill: "#F2A986", stroke, strokeWidth: 2.2 }),
        h("rect", { x: 3, y: 3, width: 8, height: 8, rx: 1, fill: "#FCE08B" }),
        h("rect", { x: 11, y: 11, width: 8, height: 8, rx: 1, fill: "#A3C8DC" })
      ),
      // 微微翻开的奶油手账本
      h(
        "g",
        { transform: "translate(80, 14) rotate(8)" },
        h("path", { d: "M4 12 L24 4 L40 34 L18 44 Z", fill: "#C9D8E6", stroke, strokeWidth: 2.2, strokeLinejoin: "round" }),
        h("path", { d: "M8 14 L26 6 L42 36 L22 46 Z", fill: "#FFFDF7", stroke, strokeWidth: 2.2, strokeLinejoin: "round" }),
        h("line", { x1: 15, y1: 18, x2: 27, y2: 13, stroke: "#B59C8C", strokeWidth: 1.6, strokeLinecap: "round" }),
        h("line", { x1: 18, y1: 24, x2: 30, y2: 19, stroke: "#B59C8C", strokeWidth: 1.6, strokeLinecap: "round" }),
        h("line", { x1: 21, y1: 30, x2: 33, y2: 25, stroke: "#B59C8C", strokeWidth: 1.6, strokeLinecap: "round" })
      )
    );
  }

  // ===================== 4. 核心手账贺卡主体渲染 =====================
  function ScrapbookGreetingCard({ card, aiLoading, onRequestAiNote }) {
    const eng = global.SeasonalPushEngine;
    const palette = (eng && eng.THEME_PALETTES && eng.THEME_PALETTES[card.theme]) || {
      checkerA: "#E8D9E6",
      checkerB: "#DEC9DC",
      underPaper: "#FBE5AE",
      underLine: "rgba(206, 164, 88, 0.26)",
      cardBg: "#FFFBF3",
      cardBorder: "#D98A6C",
      gridLine: "rgba(208, 152, 132, 0.14)",
      laceColor: "#F2C9CE",
      ribbonBg: "#FCE3A4",
      ribbonBorder: "#D6A15C",
      ribbonText: "#6D4732",
      pillBg: "#E8988A",
      pillText: "#FFFFFF",
      clipColor: "#9D8EC4",
      textMain: "#6A4636",
      textSub: "#99786A",
      accent: "#D97F76"
    };

    const displayGreeting = card.aiNote || card.greeting;

    return h(
      "div",
      {
        style: {
          position: "relative",
          width: "100%",
          maxWidth: "352px",
          borderRadius: "24px",
          padding: "28px 18px 26px",
          boxSizing: "border-box",
          // 棋盘格桌布底纹（1:1 复刻参考图）
          backgroundColor: palette.checkerA,
          backgroundImage: `linear-gradient(45deg, ${palette.checkerB} 25%, transparent 25%), linear-gradient(-45deg, ${palette.checkerB} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${palette.checkerB} 75%), linear-gradient(-45deg, transparent 75%, ${palette.checkerB} 75%)`,
          backgroundSize: "34px 34px",
          backgroundPosition: "0 0, 0 17px, 17px -17px, -17px 0",
          boxShadow: "0 20px 48px rgba(48, 28, 36, 0.34)",
          overflow: "hidden",
          userSelect: "none",
          WebkitUserSelect: "none"
        }
      },
      // 居中手账叠纸区域
      h(
        "div",
        {
          style: {
            position: "relative",
            width: "100%",
            boxSizing: "border-box",
            marginTop: "6px",
            marginBottom: "4px"
          }
        },
        // Layer 1：斜叠 -5deg 奶油鹅黄横线便签纸
        h("div", {
          style: {
            position: "absolute",
            top: "-10px",
            left: "-6px",
            right: "34px",
            bottom: "18px",
            borderRadius: "10px",
            backgroundColor: palette.underPaper,
            backgroundImage: `repeating-linear-gradient(180deg, transparent, transparent 15px, ${palette.underLine} 15px, ${palette.underLine} 16px)`,
            border: "1.6px solid #B98E55",
            transform: "rotate(-5deg)",
            boxShadow: "0 6px 14px rgba(96, 62, 34, 0.16)",
            zIndex: 1
          }
        }),

        // Layer 2：焦糖橙粉缝线底板（微倾 +0.6deg）
        h(
          "div",
          {
            style: {
              position: "relative",
              zIndex: 2,
              borderRadius: "12px",
              padding: "6px",
              background: `linear-gradient(160deg, ${palette.cardBorder} 0%, ${palette.pillBg} 100%)`,
              border: "1.8px solid #8E5641",
              boxShadow: "0 10px 24px rgba(84, 48, 38, 0.22)",
              transform: "rotate(-0.6deg)"
            }
          },
          // 焦糖底板内圈细白虚线缝线
          h("div", {
            style: {
              position: "absolute",
              inset: "2.5px",
              borderRadius: "9px",
              border: "1.2px dashed rgba(255, 250, 240, 0.72)",
              pointerEvents: "none",
              zIndex: 2
            }
          }),

          // Layer 3：顶部波浪邮票齿孔 + 淡暖米方格手账主纸
          h(
            "div",
            {
              style: {
                position: "relative",
                zIndex: 3,
                borderRadius: "2px 2px 7px 7px",
                backgroundColor: palette.cardBg,
                backgroundImage: `linear-gradient(${palette.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${palette.gridLine} 1px, transparent 1px)`,
                backgroundSize: "16px 16px",
                padding: "14px 16px 18px",
                marginTop: "6px",
                boxSizing: "border-box"
              }
            },
            // 顶部圆润波浪邮票齿孔 SVG 边缘
            h(
              "svg",
              {
                viewBox: "0 0 280 12",
                preserveAspectRatio: "none",
                style: {
                  position: "absolute",
                  top: "-8px",
                  left: 0,
                  width: "100%",
                  height: "10px",
                  display: "block",
                  pointerEvents: "none"
                }
              },
              h("path", {
                d: "M0,12 L0,6 Q10,-2 20,6 Q30,-2 40,6 Q50,-2 60,6 Q70,-2 80,6 Q90,-2 100,6 Q110,-2 120,6 Q130,-2 140,6 Q150,-2 160,6 Q170,-2 180,6 Q190,-2 200,6 Q210,-2 220,6 Q230,-2 240,6 Q250,-2 260,6 Q270,-2 280,6 L280,12 Z",
                fill: palette.cardBg
              })
            ),

            // 中央视觉焦点：蕾丝花边圆垫 + 手绘厚描边徽章
            h(
              "div",
              {
                style: {
                  position: "relative",
                  height: "148px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: "8px"
                }
              },
              h(LaceDoilySvg, { color: palette.laceColor }),
              h(CenterIllustrationSvg, { badgeType: card.badgeType })
            ),

            // 燕尾丝带横幅
            h(RibbonBanner, { text: card.title, palette }),

            // 居中温情寄语区
            h(
              "div",
              {
                style: {
                  textAlign: "center",
                  padding: "2px 6px 8px",
                  minHeight: "62px"
                }
              },
              h(
                "div",
                {
                  style: {
                    fontSize: "13px",
                    fontWeight: 600,
                    color: palette.textMain,
                    lineHeight: 1.72,
                    letterSpacing: "0.2px",
                    whiteSpace: "pre-wrap"
                  }
                },
                displayGreeting
              ),
              card.tip &&
                h(
                  "div",
                  {
                    style: {
                      marginTop: "7px",
                      fontSize: "11px",
                      color: palette.textSub,
                      lineHeight: 1.5
                    }
                  },
                  card.tip
                ),
              // 可选「请 TA 亲笔再写一句」轻按钮
              typeof onRequestAiNote === "function" &&
                h(
                  "button",
                  {
                    type: "button",
                    disabled: aiLoading,
                    onClick: onRequestAiNote,
                    style: {
                      marginTop: "8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 10px",
                      borderRadius: "999px",
                      border: `1px dashed ${palette.cardBorder}`,
                      background: "rgba(255, 255, 255, 0.72)",
                      color: palette.textSub,
                      fontSize: "10.5px",
                      cursor: aiLoading ? "wait" : "pointer"
                    }
                  },
                  h(UiSvg.Feather, null),
                  aiLoading ? "正在落笔..." : card.aiNote ? "已落亲笔寄语" : "请 TA 亲笔写一句"
                )
            ),

            // 底部左侧：小兔勋章 + 暖珊瑚胶囊名牌 + 暖心计数行
            h(
              "div",
              {
                style: {
                  marginTop: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  paddingRight: "52px"
                }
              },
              h(BunnyBadgeSvg, null),
              h(
                "div",
                { style: { flex: 1, minWidth: 0 } },
                h(
                  "div",
                  {
                    style: {
                      display: "inline-block",
                      maxWidth: "100%",
                      padding: "5px 16px",
                      borderRadius: "10px",
                      background: palette.pillBg,
                      color: palette.pillText,
                      fontSize: "12.5px",
                      fontWeight: 700,
                      letterSpacing: "0.4px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      boxSizing: "border-box"
                    }
                  },
                  card.signature || "广陵 · 你的小手机"
                ),
                h(
                  "div",
                  {
                    style: {
                      marginTop: "4px",
                      fontSize: "10.5px",
                      fontWeight: 600,
                      color: palette.textSub,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }
                  },
                  card.footerStat || card.subtitle || "岁岁常相见"
                )
              )
            )
          )
        ),

        // Layer 4：左上角立体回形针
        h(
          "div",
          {
            style: {
              position: "absolute",
              top: "-14px",
              left: "24px",
              transform: "rotate(-16deg)",
              zIndex: 8,
              pointerEvents: "none"
            }
          },
          h(PaperClipSvg, { color: palette.clipColor })
        ),

        // Layer 5：右上角软萌纸箱蜗牛角标贴纸
        h(
          "div",
          {
            style: {
              position: "absolute",
              top: "-16px",
              right: "-10px",
              transform: "rotate(3deg)",
              zIndex: 9,
              pointerEvents: "none"
            }
          },
          h(CornerStickerSvg, { label: card.categoryLabel || "岁时记", accent: palette.accent })
        ),

        // Layer 6：右下角手绘小铅笔 + 彩色方印 + 翻开手账本贴纸组
        h(
          "div",
          {
            style: {
              position: "absolute",
              right: "-10px",
              bottom: "-14px",
              zIndex: 9,
              pointerEvents: "none"
            }
          },
          h(StationeryDecoSvg, null)
        )
      )
    );
  }

  // ===================== 5. 全屏手账贺卡弹窗（Portal 渲染防截断） =====================
  function SeasonalGreetingModal({ isOpen, cards, isPreview, onClose }) {
    const [idx, setIdx] = React.useState(0);
    const [dismissToday, setDismissToday] = React.useState(true);
    const [aiNotes, setAiNotes] = React.useState({});
    const [aiLoading, setAiLoading] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
      if (isOpen) {
        setIdx(0);
        setCopied(false);
      }
    }, [isOpen, cards]);

    if (!isOpen || !Array.isArray(cards) || cards.length === 0) return null;

    const rawCard = cards[idx] || cards[0];
    const card = aiNotes[rawCard.eventKey] ? { ...rawCard, aiNote: aiNotes[rawCard.eventKey] } : rawCard;
    const hasNext = idx + 1 < cards.length;

    const handleAccept = async () => {
      if (!isPreview && dismissToday && global.SeasonalPushEngine) {
        await global.SeasonalPushEngine.markEventDismissedToday(card.eventKey);
      }
      if (hasNext) {
        setIdx((n) => n + 1);
        setCopied(false);
      } else {
        onClose && onClose();
      }
    };

    const handleCopy = async () => {
      try {
        const text = `${card.title}\n${card.aiNote || card.greeting}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }
      } catch (_) {}
    };

    const handleAiNote = async () => {
      if (aiLoading || !global.SeasonalPushEngine) return;
      setAiLoading(true);
      try {
        const note = await global.SeasonalPushEngine.generateAiNoteForEvent(card);
        if (note) {
          setAiNotes((prev) => ({ ...prev, [card.eventKey]: note }));
        }
      } finally {
        setAiLoading(false);
      }
    };

    const content = h(
      "div",
      {
        onClick: () => {
          if (isPreview && onClose) onClose();
        },
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 100040,
          background: "rgba(32, 22, 28, 0.56)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 16px calc(24px + env(safe-area-inset-bottom, 12px))",
          boxSizing: "border-box"
        }
      },
      h(
        "div",
        {
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "100%",
            maxWidth: "356px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            margin: "auto 0"
          }
        },
        h(ScrapbookGreetingCard, {
          card,
          aiLoading,
          onRequestAiNote: typeof global.callAI === "function" ? handleAiNote : null
        }),
        // 卡片底部轻量操作栏
        h(
          "div",
          {
            style: {
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "0 4px",
              boxSizing: "border-box"
            }
          },
          !isPreview
            ? h(
                "label",
                {
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "11.5px",
                    color: "rgba(255, 250, 246, 0.9)",
                    cursor: "pointer"
                  }
                },
                h("input", {
                  type: "checkbox",
                  checked: dismissToday,
                  onChange: (e) => setDismissToday(e.target.checked)
                }),
                "今日不再弹出"
              )
            : h("span", { style: { fontSize: "11.5px", color: "rgba(255,250,246,0.85)" } }, "手账贺卡预览"),

          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h(
              "button",
              {
                type: "button",
                onClick: handleCopy,
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "8px 12px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.4)",
                  background: "rgba(255,255,255,0.16)",
                  color: "#FFFFFF",
                  fontSize: "12px",
                  cursor: "pointer"
                }
              },
              h(UiSvg.Copy, null),
              copied ? "已复制" : "复制"
            ),
            h(
              "button",
              {
                type: "button",
                onClick: handleAccept,
                style: {
                  padding: "8px 18px",
                  borderRadius: "999px",
                  border: "none",
                  background: "#FCE3A4",
                  color: "#6A432D",
                  fontSize: "12.5px",
                  fontWeight: 700,
                  boxShadow: "0 6px 16px rgba(48, 28, 20, 0.25)",
                  cursor: "pointer"
                }
              },
              hasNext ? `下一张心意 (${idx + 1}/${cards.length})` : isPreview ? "关闭预览" : "收下这份心意"
            )
          )
        )
      )
    );

    if (typeof ReactDOM !== "undefined" && ReactDOM.createPortal && document.body) {
      return ReactDOM.createPortal(content, document.body);
    }
    return content;
  }

  // ===================== 6. 极简 Toggle 开关 =====================
  function MiniSwitch({ checked, onChange, color }) {
    return h(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": !!checked,
        onClick: (e) => {
          e.stopPropagation();
          onChange && onChange(!checked);
        },
        style: {
          position: "relative",
          width: "42px",
          height: "23px",
          borderRadius: "999px",
          border: "none",
          padding: 0,
          background: checked ? color || "#D98A6C" : "#D4D2CE",
          cursor: "pointer",
          transition: "background 0.2s ease",
          flexShrink: 0
        }
      },
      h("span", {
        style: {
          position: "absolute",
          top: "2.5px",
          left: checked ? "21.5px" : "2.5px",
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: "#FFFFFF",
          boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
          transition: "left 0.2s ease"
        }
      })
    );
  }

  // ===================== 7. 开屏推送设置页扩展面板（替换预留位） =====================
  const BADGE_OPTIONS = [
    { id: "piggy", label: "小猪存钱罐" },
    { id: "heart_seal", label: "双心火漆" },
    { id: "cake", label: "草莓蛋糕" },
    { id: "lantern", label: "暖橘灯笼" },
    { id: "blossom", label: "治愈花朵" },
    { id: "snow", label: "冬日雪人" },
    { id: "moon", label: "中秋明月" },
    { id: "tea", label: "温润茶杯" }
  ];

  function SeasonalPushSettingsSection() {
    const eng = global.SeasonalPushEngine;
    const [prefs, setPrefs] = React.useState(eng ? { ...eng.DEFAULT_PREFS } : {});
    const [milestones, setMilestones] = React.useState([]);
    const [selectedSolarId, setSelectedSolarId] = React.useState("xiaoxue");
    const [previewCards, setPreviewCards] = React.useState(null);
    const [showAddForm, setShowAddForm] = React.useState(false);
    const [formTitle, setFormTitle] = React.useState("");
    const [formDate, setFormDate] = React.useState(eng ? eng.formatDateKey(new Date()) : "");
    const [formRepeat, setFormRepeat] = React.useState(true);
    const [formTheme, setFormTheme] = React.useState("anniversary");
    const [formBadge, setFormBadge] = React.useState("piggy");
    const [formSig, setFormSig] = React.useState("");
    const [formGreeting, setFormGreeting] = React.useState("");
    const [toast, setToast] = React.useState("");

    const flash = (msg) => {
      setToast(msg);
      setTimeout(() => setToast((c) => (c === msg ? "" : c)), 1800);
    };

    React.useEffect(() => {
      if (!eng) return;
      let alive = true;
      Promise.all([eng.loadPrefs(), eng.listCustomMilestones()]).then(([p, list]) => {
        if (!alive) return;
        setPrefs(p);
        setMilestones(list);
      });
      const upcoming = eng.getUpcomingSolarTerm(new Date());
      if (upcoming && upcoming.id) setSelectedSolarId(upcoming.id);
      return () => {
        alive = false;
      };
    }, []);

    if (!eng) return null;

    const updatePref = async (patch) => {
      const next = await eng.savePrefs(patch);
      setPrefs(next);
    };

    const handleAddMilestone = async () => {
      if (!formTitle.trim() || !formDate) {
        flash("请填写纪念日名称与日期");
        return;
      }
      await eng.saveCustomMilestone({
        title: formTitle.trim(),
        date: formDate,
        repeatYearly: formRepeat,
        theme: formTheme,
        badgeType: formBadge,
        signature: formSig.trim() || prefs.signatureName,
        greeting: formGreeting.trim()
      });
      const list = await eng.listCustomMilestones();
      setMilestones(list);
      setFormTitle("");
      setFormGreeting("");
      setShowAddForm(false);
      flash("已保存纪念节点");
    };

    const handleDeleteMilestone = async (id) => {
      const next = await eng.deleteCustomMilestone(id);
      setMilestones(next);
      flash("已移除该纪念日");
    };

    const upcomingTerm = eng.getUpcomingSolarTerm(new Date());

    return h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          width: "100%",
          boxSizing: "border-box"
        }
      },
      // 卡片 1：二十四节气问候配置
      h(
        "div",
        {
          style: {
            background: "#FFFFFF",
            borderRadius: "16px",
            padding: "14px 15px",
            border: "1px solid #EFEAE2",
            boxShadow: "0 4px 14px rgba(56, 42, 34, 0.05)",
            display: "flex",
            flexDirection: "column",
            gap: "11px"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "9px", minWidth: 0 } },
            h(
              "div",
              {
                style: {
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  background: "#F5ECE6",
                  color: "#C7795B",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }
              },
              h(UiSvg.Leaf, null)
            ),
            h(
              "div",
              { style: { minWidth: 0 } },
              h("div", { style: { fontSize: "14px", fontWeight: 700, color: "#362C27" } }, "二十四节气手账问候"),
              h(
                "div",
                { style: { fontSize: "11px", color: "#8B8179", marginTop: "2px" } },
                upcomingTerm
                  ? `下一节气：${upcomingTerm.name}（${upcomingTerm.daysLeft === 0 ? "就是今天" : `${upcomingTerm.daysLeft} 天后`}）`
                  : "岁时流转，按天文节气精准推送"
              )
            )
          ),
          h(MiniSwitch, {
            checked: !!prefs.solarEnabled,
            onChange: (v) => updatePref({ solarEnabled: v }),
            color: "#D98A6C"
          })
        ),

        // 提前一日轻预告开关
        prefs.solarEnabled &&
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: "10px",
                background: "#FAF7F2",
                fontSize: "12px",
                color: "#5E524A"
              }
            },
            h("span", null, "节气前一日轻预告"),
            h(MiniSwitch, {
              checked: !!prefs.solarAdvanceDay,
              onChange: (v) => updatePref({ solarAdvanceDay: v }),
              color: "#D98A6C"
            })
          ),

        // 24 节气任意试看条
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h(
            "select",
            {
              value: selectedSolarId,
              onChange: (e) => setSelectedSolarId(e.target.value),
              style: {
                flex: 1,
                minWidth: 0,
                padding: "8px 10px",
                borderRadius: "10px",
                border: "1px solid #E5DDD2",
                background: "#FCFAF7",
                color: "#4A3E36",
                fontSize: "12px",
                outline: "none"
              }
            },
            eng.SOLAR_TERMS_DATA.map((t) =>
              h("option", { key: t.id, value: t.id }, `${t.name} · ${t.alias}（${t.month}月）`)
            )
          ),
          h(
            "button",
            {
              type: "button",
              onClick: () =>
                setPreviewCards([eng.buildPreviewCardData("solar", selectedSolarId, null, prefs.signatureName)]),
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #E4CFC2",
                background: "#FDF4EE",
                color: "#A45B42",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0
              }
            },
            h(UiSvg.Eye, null),
            "试看贺卡"
          )
        )
      ),

      // 卡片 2：重大纪念日 & 佳节提醒配置
      h(
        "div",
        {
          style: {
            background: "#FFFFFF",
            borderRadius: "16px",
            padding: "14px 15px",
            border: "1px solid #EFEAE2",
            boxShadow: "0 4px 14px rgba(56, 42, 34, 0.05)",
            display: "flex",
            flexDirection: "column",
            gap: "11px"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "9px", minWidth: 0 } },
            h(
              "div",
              {
                style: {
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  background: "#F5EAF2",
                  color: "#B46D9A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }
              },
              h(UiSvg.CalendarHeart, null)
            ),
            h(
              "div",
              { style: { minWidth: 0 } },
              h("div", { style: { fontSize: "14px", fontWeight: 700, color: "#362C27" } }, "重大纪念日与佳节提醒"),
              h("div", { style: { fontSize: "11px", color: "#8B8179", marginTop: "2px" } }, "自动联动情侣空间百天/周年，并支持自建重要日子")
            )
          ),
          h(MiniSwitch, {
            checked: !!prefs.anniversaryEnabled,
            onChange: (v) => updatePref({ anniversaryEnabled: v }),
            color: "#C47EA8"
          })
        ),

        // 传统暖心佳节小开关 + 署名昵称
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: "10px",
              background: "#FAF7F2",
              fontSize: "12px",
              color: "#5E524A"
            }
          },
          h("span", null, "包含传统佳节（元旦/春节/七夕/中秋等）"),
          h(MiniSwitch, {
            checked: !!prefs.festivalEnabled,
            onChange: (v) => updatePref({ festivalEnabled: v }),
            color: "#C47EA8"
          })
        ),

        // 贺卡默认署名胶囊名
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          h("span", { style: { fontSize: "11.5px", color: "#7B7169", flexShrink: 0 } }, "默认署名"),
          h("input", {
            type: "text",
            value: prefs.signatureName || "",
            onChange: (e) => updatePref({ signatureName: e.target.value.slice(0, 20) }),
            placeholder: "如：广陵 · 你的小手机",
            style: {
              flex: 1,
              minWidth: 0,
              padding: "6px 10px",
              borderRadius: "9px",
              border: "1px solid #E5DDD2",
              background: "#FCFAF7",
              fontSize: "12px",
              color: "#443933",
              outline: "none"
            }
          })
        ),

        // 操作行：预览纪念日示例 + 新增重大节点
        h(
          "div",
          { style: { display: "flex", gap: "8px" } },
          h(
            "button",
            {
              type: "button",
              onClick: () =>
                setPreviewCards([eng.buildPreviewCardData("anniversary", "sample", null, prefs.signatureName)]),
              style: {
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                padding: "8px 10px",
                borderRadius: "10px",
                border: "1px solid #E6D2DF",
                background: "#FAF2F7",
                color: "#99537E",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer"
              }
            },
            h(UiSvg.Eye, null),
            "预览纪念贺卡"
          ),
          h(
            "button",
            {
              type: "button",
              onClick: () => setShowAddForm((v) => !v),
              style: {
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                padding: "8px 10px",
                borderRadius: "10px",
                border: "none",
                background: "#D98A6C",
                color: "#FFFFFF",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer"
              }
            },
            h(UiSvg.Plus, null),
            showAddForm ? "收起表单" : "新增纪念日"
          )
        ),

        // 新增纪念日折叠表单
        showAddForm &&
          h(
            "div",
            {
              style: {
                padding: "11px",
                borderRadius: "12px",
                background: "#FAF7F3",
                border: "1px solid #ECE4DA",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }
            },
            h("input", {
              type: "text",
              value: formTitle,
              onChange: (e) => setFormTitle(e.target.value),
              placeholder: "纪念日名称（如：我的生日 / 初遇之日）",
              maxLength: 24,
              style: { padding: "7px 10px", borderRadius: "9px", border: "1px solid #E2D9CE", fontSize: "12px", outline: "none", background: "#FFF" }
            }),
            h(
              "div",
              { style: { display: "flex", gap: "8px", alignItems: "center" } },
              h("input", {
                type: "date",
                value: formDate,
                onChange: (e) => setFormDate(e.target.value),
                style: { flex: 1, padding: "6px 8px", borderRadius: "9px", border: "1px solid #E2D9CE", fontSize: "12px", background: "#FFF" }
              }),
              h(
                "label",
                { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11.5px", color: "#5E524A", flexShrink: 0 } },
                h("input", { type: "checkbox", checked: formRepeat, onChange: (e) => setFormRepeat(e.target.checked) }),
                "每年循环"
              )
            ),
            h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h(
                "select",
                {
                  value: formTheme,
                  onChange: (e) => setFormTheme(e.target.value),
                  style: { flex: 1, padding: "6px 8px", borderRadius: "9px", border: "1px solid #E2D9CE", fontSize: "11.5px", background: "#FFF" }
                },
                Object.keys(eng.THEME_PALETTES).map((k) =>
                  h("option", { key: k, value: k }, `色盘：${eng.THEME_PALETTES[k].label}`)
                )
              ),
              h(
                "select",
                {
                  value: formBadge,
                  onChange: (e) => setFormBadge(e.target.value),
                  style: { flex: 1, padding: "6px 8px", borderRadius: "9px", border: "1px solid #E2D9CE", fontSize: "11.5px", background: "#FFF" }
                },
                BADGE_OPTIONS.map((b) => h("option", { key: b.id, value: b.id }, `徽章：${b.label}`))
              )
            ),
            h("input", {
              type: "text",
              value: formSig,
              onChange: (e) => setFormSig(e.target.value),
              placeholder: "署名名牌（留空则用默认署名）",
              maxLength: 20,
              style: { padding: "7px 10px", borderRadius: "9px", border: "1px solid #E2D9CE", fontSize: "12px", outline: "none", background: "#FFF" }
            }),
            h("textarea", {
              value: formGreeting,
              onChange: (e) => setFormGreeting(e.target.value),
              placeholder: "写一句给那天的温暖寄语（留空则自动配文）...",
              rows: 2,
              style: { padding: "7px 10px", borderRadius: "9px", border: "1px solid #E2D9CE", fontSize: "12px", outline: "none", background: "#FFF", resize: "vertical" }
            }),
            h(
              "button",
              {
                type: "button",
                onClick: handleAddMilestone,
                style: {
                  padding: "8px 0",
                  borderRadius: "10px",
                  border: "none",
                  background: "#7C5A46",
                  color: "#FFFFFF",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  cursor: "pointer"
                }
              },
              "保存这个重要日子"
            )
          ),

        // 已保存的自定义纪念日列表
        milestones.length > 0 &&
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "7px" } },
            milestones.map((item) =>
              h(
                "div",
                {
                  key: item.id,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    padding: "8px 10px",
                    borderRadius: "11px",
                    background: "#FAF8F5",
                    border: "1px solid #EFEAE2"
                  }
                },
                h(
                  "div",
                  { style: { minWidth: 0, flex: 1 } },
                  h("div", { style: { fontSize: "12.5px", fontWeight: 600, color: "#3C322C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, item.title),
                  h("div", { style: { fontSize: "10.5px", color: "#8F857D", marginTop: "2px" } }, `${item.date} · ${item.repeatYearly ? "每年循环" : "里程碑计数"}`)
                ),
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 } },
                  h(
                    "button",
                    {
                      type: "button",
                      title: "预览贺卡",
                      onClick: () =>
                        setPreviewCards([eng.buildPreviewCardData("custom", item.id, item, prefs.signatureName)]),
                      style: {
                        border: "1px solid #E3D7CE",
                        background: "#FFF",
                        color: "#7C5A46",
                        borderRadius: "8px",
                        padding: "5px 7px",
                        display: "flex",
                        cursor: "pointer"
                      }
                    },
                    h(UiSvg.Eye, null)
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      title: "删除纪念日",
                      onClick: () => handleDeleteMilestone(item.id),
                      style: {
                        border: "1px solid #F0DCDC",
                        background: "#FFF8F8",
                        color: "#C45B5B",
                        borderRadius: "8px",
                        padding: "5px 7px",
                        display: "flex",
                        cursor: "pointer"
                      }
                    },
                    h(UiSvg.Trash, null)
                  )
                )
              )
            )
          )
      ),

      toast &&
        h(
          "div",
          {
            style: {
              position: "fixed",
              left: "50%",
              bottom: "26px",
              transform: "translateX(-50%)",
              background: "rgba(38, 28, 24, 0.88)",
              color: "#FFF",
              fontSize: "12px",
              padding: "7px 15px",
              borderRadius: "999px",
              zIndex: 100050
            }
          },
          toast
        ),

      h(SeasonalGreetingModal, {
        isOpen: !!(previewCards && previewCards.length > 0),
        cards: previewCards || [],
        isPreview: true,
        onClose: () => setPreviewCards(null)
      })
    );
  }

  // ===================== 8. 开屏自动串行托管宿主（不与更新海报打架） =====================
  function SeasonalPushQueueHost({ waitForUpdateClosed }) {
    const [cards, setCards] = React.useState([]);
    const [open, setOpen] = React.useState(false);
    const triggeredRef = React.useRef(false);

    React.useEffect(() => {
      if (waitForUpdateClosed || triggeredRef.current) return;
      if (!global.SeasonalPushEngine) return;
      triggeredRef.current = true;

      let alive = true;
      const timer = setTimeout(() => {
        global.SeasonalPushEngine.getTodayPushQueue(new Date()).then((q) => {
          if (!alive || !Array.isArray(q) || q.length === 0) return;
          setCards(q);
          setOpen(true);
        });
      }, 650);

      return () => {
        alive = false;
        clearTimeout(timer);
      };
    }, [waitForUpdateClosed]);

    return h(SeasonalGreetingModal, {
      isOpen: open,
      cards,
      isPreview: false,
      onClose: () => setOpen(false)
    });
  }

  global.SeasonalPushUI = {
    ScrapbookGreetingCard,
    SeasonalGreetingModal,
    SettingsSection: SeasonalPushSettingsSection,
    QueueHost: SeasonalPushQueueHost
  };
})(window);

