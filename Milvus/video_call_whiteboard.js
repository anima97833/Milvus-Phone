/**
 * Milvus/video_call_whiteboard.js
 * Ano-phone Zoom 视频通话 · 互动触控白板独立子模块
 * - 支持手机手指触摸 (PointerEvents + touch-action: none) 与电脑鼠标绘图
 * - 6 色画笔 + 橡皮擦 + 3 档粗细 + 20 步 Undo 撤销栈 + 清空
 * - 纯白底 640px JPEG 导出，确保多模态视觉模型清晰辨认
 */
(function (global) {
  "use strict";

  const COLORS = [
    { id: "ink", hex: "#1E293B", label: "墨黑" },
    { id: "crimson", hex: "#DC2626", label: "朱砂" },
    { id: "blue", hex: "#2563EB", label: "青蓝" },
    { id: "green", hex: "#16A34A", label: "翠绿" },
    { id: "amber", hex: "#D97706", label: "琥珀" },
    { id: "eraser", hex: "#FFFFFF", label: "橡皮" }
  ];

  const SIZES = [
    { id: "s", px: 3, label: "细" },
    { id: "m", px: 7, label: "中" },
    { id: "l", px: 14, label: "粗" }
  ];

  function exportWhiteboardJpeg(sourceCanvas, maxEdge = 640, quality = 0.82) {
    if (!sourceCanvas || typeof document === "undefined") return null;
    const sw = sourceCanvas.width || 640;
    const sh = sourceCanvas.height || 480;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    const out = document.createElement("canvas");
    out.width = dw;
    out.height = dh;
    const ctx = out.getContext("2d", { alpha: false });
    if (!ctx) return null;
    // 强制纯白底色，避免透明像素在 JPEG 中变黑导致黑线条不可见
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(sourceCanvas, 0, 0, dw, dh);
    return out.toDataURL("image/jpeg", quality);
  }

  function WhiteboardOverlay({ open, busy, onClose, onSubmitDrawing }) {
    if (!open || typeof React === "undefined") return null;
    const h = React.createElement;
    const { useState, useRef, useEffect } = React;

    const [color, setColor] = useState("#1E293B");
    const [brushSize, setBrushSize] = useState(7);
    const [caption, setCaption] = useState("");
    const [undoCount, setUndoCount] = useState(0);

    const canvasRef = useRef(null);
    const drawingRef = useRef(false);
    const lastPtRef = useRef(null);
    const undoStackRef = useRef([]);

    const initCanvas = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      const w = Math.max(280, Math.round(rect.width * dpr));
      const hPx = Math.max(220, Math.round(rect.height * dpr));
      if (cvs.width !== w || cvs.height !== hPx) {
        cvs.width = w;
        cvs.height = hPx;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, hPx);
        undoStackRef.current = [cvs.toDataURL("image/png")];
        setUndoCount(0);
      }
    };

    useEffect(() => {
      if (!open) return;
      const t = setTimeout(initCanvas, 40);
      return () => clearTimeout(t);
    }, [open]);

    const getCanvasPoint = (e) => {
      const cvs = canvasRef.current;
      if (!cvs) return null;
      const rect = cvs.getBoundingClientRect();
      const scaleX = cvs.width / (rect.width || 1);
      const scaleY = cvs.height / (rect.height || 1);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    const pushUndo = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      undoStackRef.current.push(cvs.toDataURL("image/png"));
      if (undoStackRef.current.length > 21) undoStackRef.current.shift();
      setUndoCount(Math.max(0, undoStackRef.current.length - 1));
    };

    const handlePointerDown = (e) => {
      e.preventDefault();
      const cvs = canvasRef.current;
      if (!cvs) return;
      if (cvs.setPointerCapture) {
        try { cvs.setPointerCapture(e.pointerId); } catch (err) {}
      }
      const pt = getCanvasPoint(e);
      if (!pt) return;
      drawingRef.current = true;
      lastPtRef.current = pt;

      const ctx = cvs.getContext("2d");
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(pt.x, pt.y, (brushSize * dpr) / 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const handlePointerMove = (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const cvs = canvasRef.current;
      const pt = getCanvasPoint(e);
      if (!cvs || !pt || !lastPtRef.current) return;
      const ctx = cvs.getContext("2d");
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = (color === "#FFFFFF" ? brushSize * 2 : brushSize) * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      lastPtRef.current = pt;
    };

    const handlePointerUp = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      lastPtRef.current = null;
      pushUndo();
    };

    const handleUndo = () => {
      const cvs = canvasRef.current;
      if (!cvs || undoStackRef.current.length <= 1) return;
      undoStackRef.current.pop();
      const prevUrl = undoStackRef.current[undoStackRef.current.length - 1];
      const img = new Image();
      img.onload = () => {
        const ctx = cvs.getContext("2d");
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
      };
      img.src = prevUrl;
      setUndoCount(Math.max(0, undoStackRef.current.length - 1));
    };

    const handleClear = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      pushUndo();
    };

    const handleSend = () => {
      const cvs = canvasRef.current;
      if (!cvs || busy) return;
      const dataUrl = exportWhiteboardJpeg(cvs, 640, 0.82);
      if (dataUrl && typeof onSubmitDrawing === "function") {
        onSubmitDrawing(dataUrl, caption.trim());
        setCaption("");
      }
    };

    return h(
      "div",
      {
        style: {
          position: "absolute",
          inset: "8px",
          zIndex: 18,
          background: "#1E2028",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 14px 40px rgba(0,0,0,0.6)"
        }
      },
      // 顶栏
      h(
        "div",
        {
          style: {
            padding: "8px 12px",
            background: "#252832",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px"
          }
        },
        h("span", { style: { fontSize: "13px", fontWeight: 700, color: "#F8FAFC" } }, "🖍️ 会议白板（画完发给对面辨认）"),
        h(
          "div",
          { style: { display: "flex", gap: "6px" } },
          h(
            "button",
            {
              type: "button",
              disabled: undoCount === 0,
              onClick: handleUndo,
              style: {
                padding: "4px 9px",
                borderRadius: "7px",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.08)",
                color: "#E2E8F0",
                fontSize: "11.5px",
                opacity: undoCount === 0 ? 0.45 : 1,
                cursor: "pointer"
              }
            },
            "↩ 撤销"
          ),
          h(
            "button",
            {
              type: "button",
              onClick: handleClear,
              style: {
                padding: "4px 9px",
                borderRadius: "7px",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.08)",
                color: "#E2E8F0",
                fontSize: "11.5px",
                cursor: "pointer"
              }
            },
            "🗑 清空"
          ),
          h(
            "button",
            {
              type: "button",
              onClick: onClose,
              style: {
                padding: "4px 9px",
                borderRadius: "7px",
                border: "none",
                background: "rgba(255,255,255,0.16)",
                color: "#FFFFFF",
                fontSize: "12px",
                cursor: "pointer"
              }
            },
            "✕"
          )
        )
      ),

      // 颜色与粗细工具条
      h(
        "div",
        {
          style: {
            padding: "6px 10px",
            background: "#1E2028",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "6px",
            borderBottom: "1px solid rgba(255,255,255,0.06)"
          }
        },
        h(
          "div",
          { style: { display: "flex", gap: "6px", alignItems: "center" } },
          COLORS.map((c) =>
            h(
              "button",
              {
                key: c.id,
                type: "button",
                title: c.label,
                onClick: () => setColor(c.hex),
                style: {
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  background: c.hex,
                  border: color === c.hex ? "2.5px solid #22C55E" : "1.5px solid rgba(255,255,255,0.35)",
                  cursor: "pointer",
                  fontSize: "10px",
                  color: "#334155",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }
              },
              c.id === "eraser" ? "擦" : ""
            )
          )
        ),
        h(
          "div",
          { style: { display: "flex", gap: "5px", alignItems: "center" } },
          SIZES.map((s) =>
            h(
              "button",
              {
                key: s.id,
                type: "button",
                onClick: () => setBrushSize(s.px),
                style: {
                  padding: "3px 8px",
                  borderRadius: "999px",
                  border: brushSize === s.px ? "1px solid #22C55E" : "1px solid rgba(255,255,255,0.16)",
                  background: brushSize === s.px ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.06)",
                  color: "#E2E8F0",
                  fontSize: "11px",
                  cursor: "pointer"
                }
              },
              s.label
            )
          )
        )
      ),

      // 画布主体
      h(
        "div",
        { style: { flex: 1, minHeight: 0, background: "#FFFFFF", position: "relative" } },
        h("canvas", {
          ref: canvasRef,
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerUp,
          style: {
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            cursor: "crosshair"
          }
        })
      ),

      // 底部附言与发给对面辨认
      h(
        "div",
        {
          style: {
            padding: "8px 10px",
            background: "#252832",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            gap: "6px",
            alignItems: "center"
          }
        },
        h("input", {
          type: "text",
          placeholder: "附言（可选，如：猜猜我画的是什么？）",
          value: caption,
          onChange: (e) => setCaption(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && handleSend(),
          style: {
            flex: 1,
            background: "rgba(255,255,255,0.09)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: "999px",
            padding: "6px 11px",
            color: "#FFFFFF",
            fontSize: "12px",
            outline: "none"
          }
        }),
        h(
          "button",
          {
            type: "button",
            disabled: busy,
            onClick: handleSend,
            style: {
              padding: "7px 13px",
              borderRadius: "999px",
              border: "none",
              background: "#22C55E",
              color: "#052E16",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              flexShrink: 0
            }
          },
          busy ? "辨认中…" : "📤 发给对面辨认"
        )
      )
    );
  }

  const api = {
    COLORS,
    SIZES,
    exportWhiteboardJpeg,
    WhiteboardOverlay
  };

  global.VideoCallWhiteboard = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

