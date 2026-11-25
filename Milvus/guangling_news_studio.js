/**
 * Milvus/guangling_news_studio.js (v2.0)
 * 独立模块（阶段二）：
 * - 手机端到点播报「全屏纯净画面模式」（隐藏全部控制栏，竖屏相机焦距自适应，播完点击退出 / 右上角极淡热区呼出控制）
 * - 导播台 2.0：5 大真实栏目勾选 + 换一批重抽 + 指定角色主播 + 心纸居多形态立绘点选 + 自定义透明立绘 + 定时档期与纯净模式开关
 * - 到点自动切入宿主 AutoBroadcastHost（避让开屏门禁，零改动 app.min.js）
 * - 1024×512 @ 15fps 节流背景墙 + 关闭彻底 dispose 显存回收
 * - 零新增 localStorage，零 Emoji
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_GUANGLING_NEWS_STUDIO_V2_LOADED__) return;
  global.__MILVUS_GUANGLING_NEWS_STUDIO_V2_LOADED__ = true;

  const h = React.createElement;

  // ===================== 1. 手绘细线矢量 SVG（零 Emoji） =====================
  const StudioSvg = {
    Tv: ({ size = 16, color = "currentColor" } = {}) =>
      h(
        "svg",
        { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" },
        h("rect", { x: 2, y: 7, width: 20, height: 14, rx: 3 }),
        h("polyline", { points: "17 2 12 7 7 2" }),
        h("line", { x1: 6, y1: 12, x2: 12, y2: 12 }),
        h("line", { x1: 6, y1: 16, x2: 10, y2: 16 }),
        h("circle", { cx: 17, cy: 14, r: 1.6 })
      ),
    Close: () =>
      h(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" },
        h("line", { x1: 18, y1: 6, x2: 6, y2: 18 }),
        h("line", { x1: 6, y1: 6, x2: 18, y2: 18 })
      ),
    Camera: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("polygon", { points: "23 7 16 12 23 17 23 7" }),
        h("rect", { x: 1, y: 5, width: 15, height: 14, rx: 2 })
      ),
    Sound: ({ muted }) =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }),
        muted ? h("line", { x1: 23, y1: 9, x2: 17, y2: 15 }) : h("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" })
      ),
    Sliders: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("line", { x1: 4, y1: 21, x2: 4, y2: 14 }),
        h("line", { x1: 4, y1: 10, x2: 4, y2: 3 }),
        h("line", { x1: 12, y1: 21, x2: 12, y2: 12 }),
        h("line", { x1: 12, y1: 8, x2: 12, y2: 3 }),
        h("line", { x1: 20, y1: 21, x2: 20, y2: 16 }),
        h("line", { x1: 20, y1: 12, x2: 20, y2: 3 }),
        h("line", { x1: 1, y1: 14, x2: 7, y2: 14 }),
        h("line", { x1: 9, y1: 8, x2: 15, y2: 8 }),
        h("line", { x1: 17, y1: 16, x2: 23, y2: 16 })
      ),
    Maximize: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("polyline", { points: "15 3 21 3 21 9" }),
        h("polyline", { points: "9 21 3 21 3 15" }),
        h("line", { x1: 21, y1: 3, x2: 14, y2: 10 }),
        h("line", { x1: 3, y1: 21, x2: 10, y2: 14 })
      ),
    Spark: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" })
      ),
    Refresh: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("polyline", { points: "23 4 23 10 17 10" }),
        h("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
      ),
    Upload: () =>
      h(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        h("polyline", { points: "17 8 12 3 7 8" }),
        h("line", { x1: 12, y1: 3, x2: 12, y2: 15 })
      ),
    MoreDots: () =>
      h(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 24 24", fill: "currentColor" },
        h("circle", { cx: 6, cy: 12, r: 1.8 }),
        h("circle", { cx: 12, cy: 12, r: 1.8 }),
        h("circle", { cx: 18, cy: 12, r: 1.8 })
      )
  };

  // ===================== 2. Web Audio Mii 拟声合成器 =====================
  class NewsSoundEngine {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.userUnlocked = false;
    }
    unlock() {
      this.userUnlocked = true;
      this.ensure();
    }
    ensure() {
      if (!this.ctx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (AudioCtx) {
          try {
            this.ctx = new AudioCtx();
          } catch (_) {}
        }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
    }
    playBlip(charCode) {
      if (!this.enabled || !this.userUnlocked) return;
      this.ensure();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const baseFreq = 340 + ((charCode || 65) % 11) * 18;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.12, now + 0.045);
        gain.gain.setValueAtTime(0.075, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.052);
      } catch (_) {}
    }
    playClick() {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.085);
      } catch (_) {}
    }
    dispose() {
      if (this.ctx) {
        try {
          this.ctx.close();
        } catch (_) {}
        this.ctx = null;
      }
    }
  }

  // ===================== 3. 程序化纹理生成器 =====================
  function drawWallCanvas(ctx, w, hPx, time, logoMain, logoSub) {
    const cx = w * 0.5;
    const cy = hPx * 0.44;
    const bgGrad = ctx.createLinearGradient(0, 0, 0, hPx);
    bgGrad.addColorStop(0, "#002c8a");
    bgGrad.addColorStop(0.5, "#0051d5");
    bgGrad.addColorStop(1, "#002470");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, hPx);

    const radGrad = ctx.createRadialGradient(cx, cy, 15, cx, cy, 225);
    radGrad.addColorStop(0, "#2ea4ff");
    radGrad.addColorStop(0.55, "#0b68e8");
    radGrad.addColorStop(1, "rgba(0, 55, 165, 0)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, w, hPx);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.18, 1.0);
    const rings = [
      { r: 138, width: 18, color: "rgba(0, 32, 115, 0.65)", start: 0.2, end: 2.9 },
      { r: 138, width: 18, color: "rgba(0, 32, 115, 0.65)", start: 3.35, end: 6.05 },
      { r: 172, width: 32, color: "rgba(0, 26, 102, 0.72)", start: -0.9, end: 1.05 },
      { r: 172, width: 32, color: "rgba(0, 26, 102, 0.72)", start: 2.1, end: 4.05 },
      { r: 215, width: 42, color: "rgba(0, 22, 95, 0.8)", start: -1.2, end: 1.25 },
      { r: 215, width: 42, color: "rgba(0, 22, 95, 0.8)", start: 1.9, end: 4.35 },
      { r: 119, width: 5, color: "rgba(110, 205, 255, 0.45)", start: 0, end: Math.PI * 2 }
    ];
    rings.forEach((ring, idx) => {
      ctx.beginPath();
      const drift = Math.sin(time * 0.4 + idx) * 0.04;
      ctx.arc(0, 0, ring.r, ring.start + drift, ring.end + drift);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width;
      ctx.stroke();
    });
    ctx.restore();

    const bars = [
      { x: 0.14, y: 0.18, w: 0.16, h: 0.055, alpha: 0.22 },
      { x: 0.1, y: 0.49, w: 0.21, h: 0.065, alpha: 0.35 },
      { x: 0.12, y: 0.72, w: 0.22, h: 0.075, alpha: 0.28 },
      { x: 0.68, y: 0.17, w: 0.19, h: 0.06, alpha: 0.25 },
      { x: 0.71, y: 0.46, w: 0.18, h: 0.055, alpha: 0.28 },
      { x: 0.66, y: 0.68, w: 0.22, h: 0.08, alpha: 0.22 }
    ];
    bars.forEach((b, i) => {
      const shift = Math.sin(time * 0.7 + i * 1.3) * 7;
      ctx.fillStyle = `rgba(90, 195, 255, ${b.alpha})`;
      ctx.fillRect(w * b.x + shift, hPx * b.y, w * b.w, hPx * b.h);
    });

    ctx.save();
    ctx.font = '900 54px "PingFang SC", "Noto Sans SC", "Arial Black", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 45, 130, 0.75)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#d8f0ff";
    ctx.fillText(logoMain || "广陵联播", cx, cy - 14);

    const subChars = (logoSub || "GLN").padEnd(3, " ").slice(0, 3).split("");
    const boxSize = 20;
    const boxGap = 4;
    const startX = cx + 36;
    const startY = cy - 62;
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    subChars.forEach((ch, i) => {
      const bx = startX + i * (boxSize + boxGap);
      ctx.fillStyle = "#d8f0ff";
      ctx.fillRect(bx, startY, boxSize, boxSize * 0.88);
      ctx.fillStyle = "#0755c9";
      ctx.font = '900 13px "Arial Black", sans-serif';
      ctx.fillText(ch, bx + boxSize / 2, startY + (boxSize * 0.88) / 2 + 0.5);
    });
    ctx.restore();

    ctx.strokeStyle = "rgba(0, 18, 65, 0.72)";
    ctx.lineWidth = 2.5;
    [0.295, 0.705].forEach((px) => {
      ctx.beginPath();
      ctx.moveTo(w * px, 0);
      ctx.lineTo(w * px, hPx);
      ctx.stroke();
    });
    [0.14, 0.62].forEach((py) => {
      ctx.beginPath();
      ctx.moveTo(0, hPx * py);
      ctx.lineTo(w, hPx * py);
      ctx.stroke();
    });
  }

  function createDeskTopTexture(THREE) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
    grad.addColorStop(0, "#c8e9ff");
    grad.addColorStop(0.45, "#e8f7ff");
    grad.addColorStop(0.68, "#8ecfff");
    grad.addColorStop(0.76, "#ffffff");
    grad.addColorStop(0.86, "#6ab9f7");
    grad.addColorStop(0.95, "#ffffff");
    grad.addColorStop(1, "#3b95e6");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    return new THREE.CanvasTexture(c);
  }

  function createPaperTexture(THREE) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 160;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f4f8fc";
    ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = "#9fb2c9";
    ctx.fillRect(14, 14, 55, 5);
    ctx.fillStyle = "#bac9db";
    for (let y = 29; y < 142; y += 8) {
      ctx.fillRect(14, y, y % 24 === 0 ? 70 : 98, 3);
    }
    return new THREE.CanvasTexture(c);
  }

  function createDefaultAnchorTexture(THREE) {
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 600;
    const ctx = c.getContext("2d");
    ctx.scale(0.8, 0.8);
    const cx = 300;
    ctx.fillStyle = "#1e1e22";
    ctx.beginPath();
    ctx.moveTo(cx - 82, 460);
    ctx.quadraticCurveTo(cx - 102, 540, cx - 95, 675);
    ctx.lineTo(cx + 95, 675);
    ctx.quadraticCurveTo(cx + 102, 540, cx + 82, 460);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f3f5f8";
    ctx.beginPath();
    ctx.moveTo(cx - 34, 455);
    ctx.lineTo(cx + 34, 455);
    ctx.lineTo(cx, 558);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a81c24";
    ctx.beginPath();
    ctx.moveTo(cx - 11, 472);
    ctx.lineTo(cx + 11, 472);
    ctx.lineTo(cx + 14, 542);
    ctx.lineTo(cx, 562);
    ctx.lineTo(cx - 14, 542);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f5dec9";
    ctx.beginPath();
    ctx.arc(cx - 38, 668, 22, 0, Math.PI * 2);
    ctx.arc(cx + 38, 668, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e5c8ae";
    ctx.fillRect(cx - 24, 425, 48, 42);
    ctx.fillStyle = "#472614";
    ctx.beginPath();
    ctx.arc(cx, 275, 168, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4dbc4";
    ctx.beginPath();
    ctx.ellipse(cx - 142, 345, 22, 28, -0.15, 0, Math.PI * 2);
    ctx.ellipse(cx + 142, 345, 22, 28, 0.15, 0, Math.PI * 2);
    ctx.fill();
    const faceGrad = ctx.createRadialGradient(cx, 325, 30, cx, 335, 145);
    faceGrad.addColorStop(0, "#fae5d2");
    faceGrad.addColorStop(0.85, "#f0d2b8");
    faceGrad.addColorStop(1, "#dfb899");
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.ellipse(cx, 330, 142, 128, 0, 0, Math.PI * 2);
    ctx.fill();
    [-62, 62].forEach((offsetX) => {
      const ex = cx + offsetX;
      const ey = 342;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(ex, ey, 36, 27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#33383e";
      ctx.beginPath();
      ctx.arc(ex, ey - 1, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#181a1d";
      ctx.beginPath();
      ctx.arc(ex, ey, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex - 8, ey - 8, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = "#22252a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(cx - 64, 342, 46, 31, -0.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + 64, 342, 46, 31, 0.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 18, 338);
    ctx.quadraticCurveTo(cx, 330, cx + 18, 338);
    ctx.stroke();
    ctx.strokeStyle = "#523428";
    ctx.lineWidth = 4.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 22, 405);
    ctx.quadraticCurveTo(cx - 11, 415, cx, 403);
    ctx.quadraticCurveTo(cx + 11, 415, cx + 22, 405);
    ctx.stroke();
    ctx.fillStyle = "#4e2a16";
    ctx.beginPath();
    ctx.moveTo(cx - 165, 295);
    ctx.quadraticCurveTo(cx - 185, 145, cx - 40, 105);
    ctx.quadraticCurveTo(cx + 15, 80, cx + 35, 65);
    ctx.quadraticCurveTo(cx + 45, 95, cx + 80, 110);
    ctx.quadraticCurveTo(cx + 195, 155, cx + 165, 295);
    ctx.lineTo(cx + 145, 345);
    ctx.quadraticCurveTo(cx + 125, 275, cx + 108, 318);
    ctx.quadraticCurveTo(cx + 75, 260, cx + 38, 325);
    ctx.quadraticCurveTo(cx + 5, 270, cx - 18, 328);
    ctx.quadraticCurveTo(cx - 58, 265, cx - 98, 320);
    ctx.quadraticCurveTo(cx - 125, 275, cx - 148, 345);
    ctx.closePath();
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // ===================== 4. 全屏 3D 广陵联播演播室弹窗（支持纯净模式 + 导播台 2.0） =====================
  function StudioModal({ isOpen, initialPureMode = false, autoTriggered = false, onClose }) {
    const eng = global.GuanglingNewsEngine;
    const voiceMod = global.GuanglingVoiceEngine;
    const mountRef = React.useRef(null);
    const soundRef = React.useRef(null);
    const voiceRef = React.useRef(null);
    const sceneApiRef = React.useRef(null);
    const fileInputRef = React.useRef(null);

    const [settings, setSettings] = React.useState(eng ? { ...eng.DEFAULT_SETTINGS } : {});
    const [status, setStatus] = React.useState(null);
    const [episode, setEpisode] = React.useState(null);
    const [lineIndex, setLineIndex] = React.useState(0);
    const [typedText, setTypedText] = React.useState("");
    const [isTyping, setIsTyping] = React.useState(false);
    const [pureMode, setPureMode] = React.useState(!!initialPureMode);
    const [pureHudOpen, setPureHudOpen] = React.useState(false);
    const [showDirector, setShowDirector] = React.useState(false);
    const [aiLoading, setAiLoading] = React.useState(false);
    const [newTimeInput, setNewTimeInput] = React.useState("18:30");
    const [characters, setCharacters] = React.useState([]);
    const [mansionSprites, setMansionSprites] = React.useState([]);
    const [anchorSourceLabel, setAnchorSourceLabel] = React.useState("默认猫嘴主播");
    const [autoplayBlocked, setAutoplayBlocked] = React.useState(false);
    const [isSynthesizing, setIsSynthesizing] = React.useState(false);
    const [voiceBankStatus, setVoiceBankStatus] = React.useState("idle");
    const [chineseVoices, setChineseVoices] = React.useState([]);
    const [toast, setToast] = React.useState("");
    const typingTimerRef = React.useRef(null);

    const flash = (msg) => {
      setToast(msg);
      setTimeout(() => setToast((c) => (c === msg ? "" : c)), 2200);
    };

    const getEffectiveVoiceConfig = (st) => {
      const base =
        eng && typeof eng.resolveAnchorVoiceConfig === "function"
          ? eng.resolveAnchorVoiceConfig(st)
          : (st && st.voice) || (voiceMod && voiceMod.DEFAULT_VOICE_CONFIG) || {};
      const withAnchor = {
        ...base,
        anchorCharId: String((st && st.anchorCharId) || "")
      };
      if (st && st.soundEnabled === false) {
        return { ...withAnchor, mode: "mute" };
      }
      return withAnchor;
    };

    React.useEffect(() => {
      if (isOpen) {
        setPureMode(!!initialPureMode);
        setPureHudOpen(false);
      }
    }, [isOpen, initialPureMode]);

    // 同步加载配置、角色列表、心纸居立绘与今日新闻稿
    const syncAnchorToScene = async (st) => {
      if (!eng) return;
      const resolved = await eng.resolveAnchorDisplay(st);
      setMansionSprites(resolved.sprites || []);
      setAnchorSourceLabel(resolved.sourceLabel || "默认猫嘴主播");
      if (sceneApiRef.current) {
        sceneApiRef.current.setAnchorImage(resolved.imageUrl || "");
      }
    };

    React.useEffect(() => {
      if (!isOpen || !eng) return;
      let alive = true;
      const vCtrl = voiceMod && typeof voiceMod.getSharedController === "function" ? voiceMod.getSharedController() : null;
      voiceRef.current = vCtrl;
      if (!vCtrl) {
        soundRef.current = new NewsSoundEngine();
        if (!autoTriggered) soundRef.current.unlock();
      } else {
        if (!autoTriggered) {
          vCtrl.unlock().then(() => {
            if (alive) setAutoplayBlocked(vCtrl.isAutoplayBlocked());
          });
        } else {
          setAutoplayBlocked(vCtrl.isAutoplayBlocked());
        }
        vCtrl.loadAssets("./Milvus/assets/animalese").then((stInfo) => {
          if (alive && stInfo) setVoiceBankStatus(stInfo.bankStatus || "fallback");
        });
        const refreshVoices = () => {
          if (alive && vCtrl) setChineseVoices(vCtrl.getAvailableChineseVoices());
        };
        refreshVoices();
        if (typeof global.speechSynthesis !== "undefined") {
          try {
            global.speechSynthesis.onvoiceschanged = refreshVoices;
          } catch (_) {}
        }
      }

      (async () => {
        const [st, watched] = await Promise.all([eng.loadSettings(), eng.loadWatchedMap()]);
        if (!alive) return;
        setSettings(st);
        if (vCtrl) {
          vCtrl.configure(getEffectiveVoiceConfig(st));
          setAutoplayBlocked(vCtrl.isAutoplayBlocked());
        } else if (soundRef.current) {
          soundRef.current.enabled = st.soundEnabled !== false;
        }

        if (global.chatCharacterStore && typeof global.chatCharacterStore.getAll === "function") {
          try {
            const allChars = await global.chatCharacterStore.getAll();
            if (alive && Array.isArray(allChars)) setCharacters(allChars);
          } catch (_) {}
        }

        const bcStatus = eng.evaluateBroadcastStatus(st, watched, new Date());
        setStatus(bcStatus);
        const ep = await eng.getOrCreateEpisode(bcStatus.activeSlot, { settings: st });
        if (!alive) return;
        setEpisode(ep);
        setLineIndex(0);
        if (bcStatus.pendingSlot) {
          eng.markSlotWatched(bcStatus.pendingSlot, new Date());
        }
        await syncAnchorToScene(st);
      })();

      return () => {
        alive = false;
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        if (voiceRef.current) {
          voiceRef.current.stop();
        }
        if (soundRef.current) {
          soundRef.current.dispose();
          soundRef.current = null;
        }
      };
    }, [isOpen]);

    // 语音 + 双时钟打字机音画同步播报
    React.useEffect(() => {
      if (!isOpen || !episode || !Array.isArray(episode.lines)) return;
      const fullText = episode.lines[lineIndex] || "";
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);
      if (voiceRef.current) voiceRef.current.stop();

      setTypedText("");
      setIsTyping(true);
      if (sceneApiRef.current) sceneApiRef.current.setTalking(true);

      const vCtrl = voiceRef.current;
      if (vCtrl) {
        const effCfg = getEffectiveVoiceConfig(settings);
        vCtrl.configure(effCfg);
        setAutoplayBlocked(vCtrl.isAutoplayBlocked());
        setIsSynthesizing(false);
        vCtrl.playLine(fullText, {
          onRevealChar: (_count, slice) => {
            setTypedText(slice);
          },
          onSyllablePulse: () => {
            if (sceneApiRef.current && sceneApiRef.current.pulseSyllable) {
              sceneApiRef.current.pulseSyllable();
            }
          },
          onSynthesizingChange: (loading) => {
            setIsSynthesizing(!!loading);
          },
          onFallback: (reason) => {
            if (reason) flash(reason);
          },
          onComplete: () => {
            setIsTyping(false);
            setIsSynthesizing(false);
            if (sceneApiRef.current) sceneApiRef.current.setTalking(false);
          }
        });
        // 克隆音色模式下后台静默预合成下一句，翻页零等待
        const nextLine = episode.lines[lineIndex + 1];
        if (nextLine && typeof vCtrl.prefetchLine === "function") {
          vCtrl.prefetchLine(nextLine);
        }
        return () => {
          setIsSynthesizing(false);
          vCtrl.stop();
        };
      }

      // 兜底：无语音引擎时的基础打字机
      let i = 0;
      typingTimerRef.current = setInterval(() => {
        if (i < fullText.length) {
          const ch = fullText[i];
          setTypedText(fullText.slice(0, i + 1));
          if (ch.trim() !== "" && i % 2 === 0 && soundRef.current) {
            soundRef.current.playBlip(ch.charCodeAt(0));
          }
          i++;
        } else {
          clearInterval(typingTimerRef.current);
          setIsTyping(false);
          if (sceneApiRef.current) sceneApiRef.current.setTalking(false);
        }
      }, 34);

      return () => {
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
      };
    }, [isOpen, episode, lineIndex]);

    // Three.js 3D 演播室（支持纯净模式竖屏焦距自适应 + 彻底显存回收）
    React.useEffect(() => {
      if (!isOpen || !mountRef.current || !global.THREE) return;
      const THREE = global.THREE;
      const container = mountRef.current;

      const calcCamSpec = (w, hPx) => {
        const aspect = w / Math.max(1, hPx);
        // 竖屏纯净全屏时自动后拉镜头，让主播、主播台、背景大屏完整同框
        if (aspect < 0.85) {
          return { fov: 44, y: 2.25, z: 7.55 };
        }
        return { fov: 36, y: 2.32, z: 5.75 };
      };

      const initW = container.clientWidth || 360;
      const initH = container.clientHeight || 270;
      let camSpec = calcCamSpec(initW, initH);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#002b80");
      const camera = new THREE.PerspectiveCamera(camSpec.fov, initW / initH, 0.1, 100);
      const camTarget = new THREE.Vector3(0, 1.32, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.setSize(initW, initH);
      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xdaf0ff, 0.85));
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.65);
      keyLight.position.set(2, 6, 5);
      scene.add(keyLight);
      const rimLight = new THREE.PointLight(0x4db8ff, 0.8, 15);
      rimLight.position.set(0, 1.5, -2.5);
      scene.add(rimLight);

      const wallCanvas = document.createElement("canvas");
      wallCanvas.width = 1024;
      wallCanvas.height = 512;
      const wallCtx = wallCanvas.getContext("2d");
      const wallTexture = new THREE.CanvasTexture(wallCanvas);
      let liveLogoMain = settings.logoMain || "广陵联播";
      let liveLogoSub = settings.logoSub || "GLN";
      drawWallCanvas(wallCtx, 1024, 512, 0, liveLogoMain, liveLogoSub);
      wallTexture.needsUpdate = true;

      const wallGeo = new THREE.CylinderGeometry(8.4, 8.4, 6.5, 48, 1, true, Math.PI - (Math.PI * 0.56) / 2, Math.PI * 0.56);
      const uvAttr = wallGeo.attributes.uv;
      for (let i = 0; i < uvAttr.count; i++) uvAttr.setX(i, 1 - uvAttr.getX(i));
      const wallMesh = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ map: wallTexture, side: THREE.BackSide }));
      wallMesh.position.set(0, 2.35, 2.8);
      scene.add(wallMesh);

      const deskGroup = new THREE.Group();
      deskGroup.position.set(0, 0.92, 0.15);
      deskGroup.scale.set(2.35, 1.0, 1.15);
      scene.add(deskGroup);

      const deskTopMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.52, 1.52, 0.04, 56),
        new THREE.MeshBasicMaterial({ map: createDeskTopTexture(THREE) })
      );
      deskTopMesh.position.y = 0.02;
      deskGroup.add(deskTopMesh);

      const rimMat = new THREE.MeshPhongMaterial({ color: 0x0b58b8, emissive: 0x04265c, specular: 0x99d6ff, shininess: 90 });
      const rimGeo = new THREE.TorusGeometry(1.54, 0.075, 16, 72);
      rimGeo.rotateX(Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.scale.set(1, 0.65, 1);
      rimMesh.position.y = 0.03;
      deskGroup.add(rimMesh);

      const innerGlowGeo = new THREE.TorusGeometry(1.46, 0.022, 12, 72);
      innerGlowGeo.rotateX(Math.PI / 2);
      const innerGlowMesh = new THREE.Mesh(innerGlowGeo, new THREE.MeshBasicMaterial({ color: 0xe6f7ff }));
      innerGlowMesh.position.y = 0.045;
      deskGroup.add(innerGlowMesh);

      const apronMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.53, 1.38, 0.36, 56),
        new THREE.MeshLambertMaterial({ color: 0xd8ecff, emissive: 0x2d598a })
      );
      apronMesh.position.y = -0.18;
      deskGroup.add(apronMesh);

      const chairGroup = new THREE.Group();
      chairGroup.position.set(0, 0.95, -0.58);
      scene.add(chairGroup);
      const chairOuterMat = new THREE.MeshLambertMaterial({ color: 0x3b4a5e });
      const chairInnerMat = new THREE.MeshLambertMaterial({ color: 0x627d9c });
      const backOuter = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.05, 0.12), chairOuterMat);
      backOuter.position.set(0, 0.48, 0);
      backOuter.rotation.x = -0.08;
      chairGroup.add(backOuter);
      const backCushion = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.92, 0.11), chairInnerMat);
      backCushion.position.set(0, 0.46, 0.04);
      backCushion.rotation.x = -0.08;
      chairGroup.add(backCushion);

      const charBaseY = 1.66;
      const defaultTex = createDefaultAnchorTexture(THREE);
      const charMat = new THREE.MeshBasicMaterial({ map: defaultTex, transparent: true, alphaTest: 0.03 });
      const charMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 1.9), charMat);
      charMesh.position.set(0, charBaseY, -0.15);
      scene.add(charMesh);

      const laptopGroup = new THREE.Group();
      laptopGroup.position.set(-1.12, 0.97, 0.42);
      laptopGroup.rotation.y = 0.24;
      scene.add(laptopGroup);
      const laptopMat = new THREE.MeshPhongMaterial({ color: 0x3b536e, emissive: 0x101c2b, specular: 0x7ea6d1, shininess: 40 });
      const lapBase = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.025, 0.56), laptopMat);
      lapBase.position.set(0, 0.012, -0.22);
      laptopGroup.add(lapBase);
      const lapScreen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.56, 0.024), laptopMat);
      lapScreen.position.set(0, 0.27, 0.04);
      lapScreen.rotation.x = 0.24;
      laptopGroup.add(lapScreen);

      const paperMat = new THREE.MeshBasicMaterial({ map: createPaperTexture(THREE), side: THREE.DoubleSide });
      const paperGeo = new THREE.PlaneGeometry(0.55, 0.42);
      paperGeo.rotateX(-Math.PI / 2);
      [
        { x: 0.02, y: 0.972, z: 0.46, rotY: -0.18 },
        { x: 0.1, y: 0.976, z: 0.52, rotY: 0.06 },
        { x: 0.88, y: 0.972, z: 0.42, rotY: 0.34 }
      ].forEach((p) => {
        const pm = new THREE.Mesh(paperGeo, paperMat);
        pm.position.set(p.x, p.y, p.z);
        pm.rotation.y = p.rotY;
        scene.add(pm);
      });

      const stateRef = {
        scale: settings.anchorScale || 1.0,
        offsetX: settings.anchorOffsetX || 0,
        offsetY: settings.anchorOffsetY || 0,
        isTalking: false,
        introProgress: 0.0
      };

      const resizeNow = () => {
        if (!container || disposed) return;
        const nw = container.clientWidth || 360;
        const nh = container.clientHeight || 270;
        camSpec = calcCamSpec(nw, nh);
        camera.fov = camSpec.fov;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };

      sceneApiRef.current = {
        setTalking: (v) => { stateRef.isTalking = !!v; },
        pulseSyllable: () => { stateRef.pulseBoost = 0.042; },
        playIntro: () => { stateRef.introProgress = 0.0; },
        resizeNow,
        setLogo: (main, sub) => {
          liveLogoMain = main || "广陵联播";
          liveLogoSub = sub || "GLN";
        },
        setTransform: (sc, ox, oy) => {
          stateRef.scale = sc;
          stateRef.offsetX = ox;
          stateRef.offsetY = oy;
        },
        setAnchorImage: (dataUrl) => {
          if (!dataUrl) {
            charMesh.geometry.dispose();
            charMesh.geometry = new THREE.PlaneGeometry(1.52, 1.9);
            charMat.map = defaultTex;
            charMat.needsUpdate = true;
            return;
          }
          const loader = new THREE.TextureLoader();
          loader.setCrossOrigin("anonymous");
          loader.load(
            dataUrl,
            (tex) => {
              const aspect = tex.image && tex.image.height ? tex.image.width / tex.image.height : 0.8;
              const baseH = 1.9;
              charMesh.geometry.dispose();
              charMesh.geometry = new THREE.PlaneGeometry(baseH * aspect, baseH);
              if (charMat.map && charMat.map !== defaultTex) charMat.map.dispose();
              charMat.map = tex;
              charMat.needsUpdate = true;
            },
            undefined,
            () => {
              charMat.map = defaultTex;
              charMat.needsUpdate = true;
            }
          );
        }
      };

      // 初始化贴图
      if (eng) {
        eng.loadSettings().then((st) => syncAnchorToScene(st));
      }

      const clock = new THREE.Clock();
      let lastWallDraw = 0;
      let rafId = 0;
      let disposed = false;

      function animate() {
        if (disposed) return;
        rafId = requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();

        if (elapsed - lastWallDraw > 0.066) {
          lastWallDraw = elapsed;
          drawWallCanvas(wallCtx, 1024, 512, elapsed, liveLogoMain, liveLogoSub);
          wallTexture.needsUpdate = true;
        }

        stateRef.pulseBoost = Math.max(0, (stateRef.pulseBoost || 0) * 0.82);
        const bounce = stateRef.isTalking
          ? Math.abs(Math.sin(elapsed * 16)) * 0.022 + stateRef.pulseBoost
          : Math.sin(elapsed * 2.2) * 0.008;
        charMesh.scale.set(stateRef.scale, stateRef.scale, 1);
        charMesh.position.x = stateRef.offsetX;
        charMesh.position.y = charBaseY + stateRef.offsetY + bounce;

        if (stateRef.introProgress < 1.0) {
          stateRef.introProgress = Math.min(1.0, stateRef.introProgress + 0.016);
          const t = 1 - Math.pow(1 - stateRef.introProgress, 3);
          camera.position.x = (1 - t) * 2.6;
          camera.position.y = (1 - t) * (camSpec.y + 0.7) + t * camSpec.y;
          camera.position.z = (1 - t) * (camSpec.z + 1.6) + t * camSpec.z;
        } else {
          camera.position.x = Math.sin(elapsed * 0.6) * 0.025;
          camera.position.y = camSpec.y + Math.cos(elapsed * 0.8) * 0.015;
          camera.position.z = camSpec.z;
        }
        camera.lookAt(camTarget);
        renderer.render(scene, camera);
      }
      rafId = requestAnimationFrame(animate);

      global.addEventListener("resize", resizeNow);

      return () => {
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        global.removeEventListener("resize", resizeNow);
        sceneApiRef.current = null;
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => {
                if (m.map) m.map.dispose();
                m.dispose();
              });
            } else {
              if (obj.material.map) obj.material.map.dispose();
              obj.material.dispose();
            }
          }
        });
        wallTexture.dispose();
        renderer.dispose();
        container.innerHTML = "";
      };
    }, [isOpen]);

    // 纯净模式与常规模式切换时同步重置画布尺寸
    React.useEffect(() => {
      if (!isOpen) return;
      const t = setTimeout(() => {
        if (sceneApiRef.current) sceneApiRef.current.resizeNow();
      }, 60);
      return () => clearTimeout(t);
    }, [pureMode, isOpen]);

    if (!isOpen || !eng) return null;

    const lines = (episode && episode.lines) || ["欢迎收看今日《广陵联播》！"];
    const isLastLineFinished = !isTyping && lineIndex === lines.length - 1;

    const handleDialogueTap = async () => {
      const vCtrl = voiceRef.current;
      if (vCtrl) {
        const wasBlocked = vCtrl.isAutoplayBlocked();
        await vCtrl.unlock();
        setAutoplayBlocked(vCtrl.isAutoplayBlocked());
        if (wasBlocked && !vCtrl.isAutoplayBlocked()) {
          vCtrl.playClick();
          // 若定时弹出时刚解锁，从当前句重新发声，避免跳过本句
          if (isTyping) {
            const fullText = lines[lineIndex] || "";
            vCtrl.configure(getEffectiveVoiceConfig(settings));
            vCtrl.playLine(fullText, {
              onRevealChar: (_c, slice) => setTypedText(slice),
              onSyllablePulse: () => {
                if (sceneApiRef.current && sceneApiRef.current.pulseSyllable) sceneApiRef.current.pulseSyllable();
              },
              onComplete: () => {
                setIsTyping(false);
                if (sceneApiRef.current) sceneApiRef.current.setTalking(false);
              }
            });
            return;
          }
        } else {
          vCtrl.playClick();
        }
      } else if (soundRef.current) {
        soundRef.current.playClick();
      }

      if (isTyping) {
        if (typingTimerRef.current) clearInterval(typingTimerRef.current);
        if (vCtrl) vCtrl.stop();
        setTypedText(lines[lineIndex] || "");
        setIsTyping(false);
        if (sceneApiRef.current) sceneApiRef.current.setTalking(false);
      } else if (pureMode && isLastLineFinished) {
        // 纯净模式下播完最后一条再次点击，优雅离台返回桌面
        if (vCtrl) vCtrl.stop();
        onClose && onClose();
      } else {
        setLineIndex((idx) => (idx + 1) % lines.length);
      }
    };

    const updateSetting = async (patch, syncAnchor) => {
      const next = await eng.saveSettings(patch);
      setSettings(next);
      if (sceneApiRef.current) {
        sceneApiRef.current.setLogo(next.logoMain, next.logoSub);
        sceneApiRef.current.setTransform(next.anchorScale, next.anchorOffsetX, next.anchorOffsetY);
      }
      if (voiceRef.current) {
        voiceRef.current.configure(getEffectiveVoiceConfig(next));
        setAutoplayBlocked(voiceRef.current.isAutoplayBlocked());
      } else if (soundRef.current) {
        soundRef.current.enabled = next.soundEnabled !== false;
      }
      if (syncAnchor) await syncAnchorToScene(next);
      return next;
    };

    const activeVoiceCfg = getEffectiveVoiceConfig(settings);

    const updateVoicePatch = async (voicePatch) => {
      const curVoice = eng.normalizeVoiceSettings(settings.voice);
      const nextVoice = eng.normalizeVoiceSettings({ ...curVoice, ...voicePatch });
      const next = await updateSetting({ voice: nextVoice, soundEnabled: nextVoice.mode !== "mute" }, false);
      return next;
    };

    const handleSelectVoicePreset = async (presetId) => {
      if (!voiceMod) return;
      const curVoice = eng.normalizeVoiceSettings(settings.voice);
      const nextVoice = voiceMod.applyPresetToVoiceConfig(curVoice, presetId);
      await updateSetting({ voice: nextVoice, soundEnabled: nextVoice.mode !== "mute" }, false);
    };

    const handlePreviewVoice = async () => {
      const vCtrl = voiceRef.current;
      if (!vCtrl) return;
      await vCtrl.unlock();
      setAutoplayBlocked(vCtrl.isAutoplayBlocked());
      const cfg = getEffectiveVoiceConfig(settings);
      if (cfg.mode === "mute") {
        flash("当前为静音模式，请先选择播报声线");
        return;
      }
      vCtrl.configure(cfg);
      const sample = `各位广陵观众好，我是${settings.anchorName || "值班主播"}，现在为您播报今日最新联播快讯！`;
      if (sceneApiRef.current) sceneApiRef.current.setTalking(true);
      vCtrl.playLine(sample, {
        onSyllablePulse: () => {
          if (sceneApiRef.current && sceneApiRef.current.pulseSyllable) sceneApiRef.current.pulseSyllable();
        },
        onSynthesizingChange: (loading) => setIsSynthesizing(!!loading),
        onFallback: (reason) => {
          if (reason) flash(reason);
        },
        onComplete: () => {
          setIsSynthesizing(false);
          if (sceneApiRef.current) sceneApiRef.current.setTalking(false);
        }
      });
    };

    const handleBindVoiceToAnchor = async () => {
      const cid = String(settings.anchorCharId || "").trim();
      if (!cid) {
        flash("请先在上方指定一位角色主播");
        return;
      }
      const curVoice = eng.normalizeVoiceSettings(settings.voice);
      const map = { ...(curVoice.anchorVoiceMap || {}) };
      map[cid] = {
        mode: curVoice.mode,
        preset: curVoice.preset,
        basePitchHz: curVoice.basePitchHz,
        unitsPerSecond: curVoice.unitsPerSecond,
        toneAmount: curVoice.toneAmount,
        mixRatio: curVoice.mixRatio,
        warmthHz: curVoice.warmthHz,
        volume: curVoice.volume,
        webSpeechRate: curVoice.webSpeechRate,
        webSpeechPitch: curVoice.webSpeechPitch,
        webSpeechVoiceURI: curVoice.webSpeechVoiceURI,
        cloneVoiceId: curVoice.cloneVoiceId || "",
        clonePrefetch: curVoice.clonePrefetch !== false
      };
      await updateVoicePatch({ anchorVoiceMap: map });
      flash(`已为「${settings.anchorName}」记住专属声线`);
    };

    const handleRegenerateRandom = async (overrideSettings) => {
      const st = overrideSettings || settings;
      const slot = (status && status.activeSlot) || "20:00";
      const ep = await eng.getOrCreateEpisode(slot, { forceRegenerate: true, settings: st });
      setEpisode(ep);
      setLineIndex(0);
      if (sceneApiRef.current) sceneApiRef.current.playIntro();
      flash("已按勾选栏目重新抽选播报内容");
    };

    const handleSelectCharAnchor = async (charId) => {
      if (!charId) {
        await updateSetting({ anchorCharId: "", anchorName: "广陵值班主播", anchorMode: "default", anchorSpriteIndex: 0 }, true);
        return;
      }
      const ch = characters.find((c) => String(c.id) === String(charId));
      const next = await updateSetting(
        {
          anchorCharId: String(charId),
          anchorName: (ch && ch.name) || "广陵主播",
          anchorMode: "mansion",
          anchorSpriteIndex: 0
        },
        true
      );
      flash(`已指定「${next.anchorName}」担任主播`);
    };

    const handleToggleSource = async (sourceId) => {
      const curSources = eng.normalizeSources(settings.sources);
      const nextSources = { ...curSources, [sourceId]: !curSources[sourceId] };
      const next = await updateSetting({ sources: nextSources }, false);
      await handleRegenerateRandom(next);
    };

    const handleApplySourcePreset = async (mode) => {
      const nextSources = {};
      eng.SOURCE_META.forEach((item) => {
        if (mode === "public") {
          nextSources[item.id] = item.group !== "private";
        } else {
          nextSources[item.id] = true;
        }
      });
      const next = await updateSetting({ sources: nextSources }, false);
      await handleRegenerateRandom(next);
      flash(mode === "public" ? "已切换为「仅广陵公共新闻」" : "已开启全部 11 项联动栏目");
    };

    const handleSetEpisodeMaxSections = async (val) => {
      const next = await updateSetting({ episodeMaxSections: val }, false);
      await handleRegenerateRandom(next);
    };

    const handleUploadAnchor = (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || "");
        await eng.saveAnchorMedia(dataUrl);
        await updateSetting({ anchorMode: "custom" }, true);
        flash("已更换并永久保存自定义透明立绘");
      };
      reader.readAsDataURL(file);
    };

    const handleAiRewrite = async () => {
      if (aiLoading) return;
      setAiLoading(true);
      try {
        const slot = (status && status.activeSlot) || "20:00";
        const ep = await eng.generateAiEpisode(slot, {
          now: new Date(),
          settings,
          baseEpisode: episode
        });
        setEpisode(ep);
        setLineIndex(0);
        if (sceneApiRef.current) sceneApiRef.current.playIntro();
        if (ep.source === "ai") {
          const tags = [];
          if (ep.aiMeta && ep.aiMeta.hasPersona) tags.push("6维人设");
          if (ep.aiMeta && ep.aiMeta.hasWorldBook) tags.push("世界书");
          const suffix = tags.length > 0 ? `（已注入${tags.join(" + ")}）` : "";
          flash(`已由「${ep.anchorName || settings.anchorName}」亲自精编本期联播${suffix}`);
        } else {
          flash((ep.aiMeta && ep.aiMeta.error) || "未配置模型 API，已保留离线今日联播稿");
        }
      } finally {
        setAiLoading(false);
      }
    };

    const handleAddScheduleTime = async () => {
      const nextTimes = eng.normalizeScheduleTimes([...(settings.scheduleTimes || []), newTimeInput]);
      await updateSetting({ scheduleTimes: nextTimes });
      flash(`已添加 ${newTimeInput} 播报档期`);
    };

    const handleRemoveScheduleTime = async (t) => {
      const filtered = (settings.scheduleTimes || []).filter((x) => x !== t);
      if (filtered.length === 0) {
        flash("至少保留一个每日播报时段");
        return;
      }
      await updateSetting({ scheduleTimes: filtered });
    };

    const curSources = eng.normalizeSources(settings.sources);

    const modalContent = h(
      "div",
      {
        style: pureMode
          ? {
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100dvh",
              zIndex: 100045,
              background: "#002b80",
              overflow: "hidden",
              color: "#FFFFFF"
            }
          : {
              position: "fixed",
              inset: 0,
              zIndex: 100045,
              background: "radial-gradient(circle at center, #142238 0%, #090e16 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              padding: "max(14px, env(safe-area-inset-top, 14px)) 12px max(24px, env(safe-area-inset-bottom, 20px))",
              boxSizing: "border-box",
              color: "#FFFFFF"
            }
      },
      // 常规模式顶栏（纯净模式完全隐藏）
      !pureMode &&
        h(
          "div",
          {
            style: {
              width: "100%",
              maxWidth: "720px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "6px",
              marginBottom: "10px",
              flexShrink: 0,
              flexWrap: "wrap"
            }
          },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "7px" } },
            h("span", { style: { padding: "2px 7px", borderRadius: "999px", background: "#D9383A", color: "#FFF", fontSize: "10px", fontWeight: 800 } }, "LIVE"),
            h("span", { style: { fontSize: "13.5px", fontWeight: 700, color: "#E8F3FF" } }, `${settings.logoMain || "广陵联播"} · ${settings.anchorName || "值班主播"}`)
          ),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "5px" } },
            h(
              "button",
              {
                type: "button",
                onClick: () => setPureMode(true),
                title: "切换纯净画面模式",
                style: { display: "inline-flex", alignItems: "center", gap: "3px", padding: "5px 8px", borderRadius: "999px", border: "1px solid rgba(120, 190, 255, 0.4)", background: "rgba(16, 36, 72, 0.8)", color: "#E8F3FF", fontSize: "11px", cursor: "pointer" }
              },
              h(StudioSvg.Maximize, null),
              "纯净"
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => updateSetting({ soundEnabled: !settings.soundEnabled }),
                style: { display: "inline-flex", alignItems: "center", gap: "3px", padding: "5px 8px", borderRadius: "999px", border: "1px solid rgba(120, 190, 255, 0.4)", background: "rgba(16, 36, 72, 0.8)", color: "#E8F3FF", fontSize: "11px", cursor: "pointer" }
              },
              h(StudioSvg.Sound, { muted: !settings.soundEnabled }),
              settings.soundEnabled ? "音效" : "静音"
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => setShowDirector((v) => !v),
                style: { display: "inline-flex", alignItems: "center", gap: "3px", padding: "5px 8px", borderRadius: "999px", border: showDirector ? "1px solid #60A5FA" : "1px solid rgba(120, 190, 255, 0.4)", background: showDirector ? "rgba(37, 99, 235, 0.88)" : "rgba(16, 36, 72, 0.8)", color: "#FFF", fontSize: "11px", cursor: "pointer" }
              },
              h(StudioSvg.Sliders, null),
              "导播台"
            ),
            h(
              "button",
              {
                type: "button",
                onClick: onClose,
                style: { width: "28px", height: "28px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.12)", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }
              },
              h(StudioSvg.Close, null)
            )
          )
        ),

      // 3D 演播室主舞台（纯净模式铺满 100vw×100dvh，常规模式 4:3 卡片）
      h(
        "div",
        {
          style: pureMode
            ? { position: "relative", width: "100%", height: "100%", background: "#003894" }
            : {
                position: "relative",
                width: "100%",
                maxWidth: "720px",
                aspectRatio: "4 / 3",
                borderRadius: "20px",
                overflow: "hidden",
                background: "#003894",
                border: "2px solid rgba(140, 200, 255, 0.28)",
                boxShadow: "0 18px 46px rgba(0, 0, 0, 0.55)",
                flexShrink: 0
              }
        },
        h("div", { ref: mountRef, style: { width: "100%", height: "100%" } }),

        // 纯净模式右上角极淡呼出浮标（不遮挡画面，防困死）
        pureMode &&
          h(
            "div",
            {
              style: {
                position: "absolute",
                top: "max(12px, env(safe-area-inset-top, 12px))",
                right: "12px",
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }
            },
            pureHudOpen &&
              h(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    setPureMode(false);
                    setShowDirector(true);
                    setPureHudOpen(false);
                  },
                  style: { padding: "5px 10px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.35)", background: "rgba(10, 24, 52, 0.72)", backdropFilter: "blur(8px)", color: "#FFF", fontSize: "11px", cursor: "pointer" }
                },
                "导播台"
              ),
            pureHudOpen &&
              h(
                "button",
                {
                  type: "button",
                  onClick: onClose,
                  style: { padding: "5px 10px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.35)", background: "rgba(180, 42, 48, 0.8)", color: "#FFF", fontSize: "11px", cursor: "pointer" }
                },
                "退出"
              ),
            h(
              "button",
              {
                type: "button",
                onClick: () => setPureHudOpen((v) => !v),
                title: "呼出/隐藏控制",
                style: {
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.22)",
                  background: pureHudOpen ? "rgba(15, 28, 56, 0.75)" : "rgba(15, 28, 56, 0.22)",
                  color: "rgba(255,255,255,0.85)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }
              },
              h(StudioSvg.MoreDots, null)
            )
          ),

        // 底部原版 Mii News 冰晶字幕对话框
        h(
          "div",
          {
            onClick: handleDialogueTap,
            style: {
              position: "absolute",
              left: "3%",
              right: "3%",
              bottom: pureMode ? "max(18px, env(safe-area-inset-bottom, 18px))" : "3%",
              minHeight: pureMode ? "16%" : "24%",
              borderRadius: "8px",
              background: "linear-gradient(180deg, rgba(238, 243, 249, 0.96) 0%, rgba(216, 226, 238, 0.95) 100%)",
              boxShadow: "0 -2px 14px rgba(0, 40, 100, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.92)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px 36px 12px 16px",
              cursor: "pointer",
              boxSizing: "border-box"
            }
          },
          h(
            "div",
            {
              style: {
                position: "relative",
                zIndex: 2,
                color: "#252930",
                fontSize: "clamp(13px, 3.4vw, 17.5px)",
                fontWeight: 700,
                lineHeight: 1.52,
                textAlign: "center"
              }
            },
            typedText || "点击播报下一条广陵快讯..."
          ),
          pureMode &&
            isLastLineFinished &&
            h(
              "div",
              { style: { marginTop: "6px", fontSize: "10.5px", color: "#556880", fontWeight: 600 } },
              "本期联播结束 · 轻点此处返回主屏"
            ),
          h(
            "div",
            {
              style: {
                position: "absolute",
                right: "9px",
                bottom: "9px",
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#161B24",
                color: "#E8F0FA",
                fontSize: "11px",
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }
            },
            "A"
          ),
          h(
            "div",
            { style: { position: "absolute", left: "10px", top: "5px", fontSize: "9.5px", color: "#6A7A90", fontWeight: 700 } },
            `${lineIndex + 1} / ${lines.length}${isSynthesizing ? " · 音色合成中..." : ""}`
          ),
          autoplayBlocked &&
            settings.soundEnabled !== false &&
            h(
              "div",
              {
                style: {
                  position: "absolute",
                  right: "10px",
                  top: "5px",
                  fontSize: "9.5px",
                  color: "#1D4ED8",
                  background: "rgba(59, 130, 246, 0.14)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  padding: "1px 7px",
                  borderRadius: "999px",
                  fontWeight: 700
                }
              },
              "轻触开声"
            )
        )
      ),

      // 常规模式下方快捷操作条（纯净模式完全隐藏）
      !pureMode &&
        h(
          "div",
          {
            style: {
              width: "100%",
              maxWidth: "720px",
              marginTop: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              flexWrap: "wrap",
              flexShrink: 0
            }
          },
          h(
            "span",
            { style: { fontSize: "11.5px", color: "#9CB4D4" } },
            status ? `下一档：${status.nextSlot}（${status.countdownText}）` : "点击字幕框翻页"
          ),
          h(
            "div",
            { style: { display: "flex", gap: "6px" } },
            h(
              "button",
              {
                type: "button",
                onClick: () => handleRegenerateRandom(),
                style: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 11px", borderRadius: "999px", border: "1px solid rgba(147, 197, 253, 0.4)", background: "rgba(30, 58, 138, 0.55)", color: "#E0F2FE", fontSize: "11.5px", fontWeight: 600, cursor: "pointer" }
              },
              h(StudioSvg.Refresh, null),
              "换一批新闻"
            ),
            h(
              "button",
              {
                type: "button",
                disabled: aiLoading,
                onClick: handleAiRewrite,
                style: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 11px", borderRadius: "999px", border: "1px solid rgba(147, 197, 253, 0.55)", background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#FFF", fontSize: "11.5px", fontWeight: 600, cursor: aiLoading ? "wait" : "pointer" }
              },
              h(StudioSvg.Spark, null),
              aiLoading ? "撰稿中..." : "AI 精编"
            )
          )
        ),

      // 导播台 2.0（纯净模式隐藏）
      !pureMode &&
        showDirector &&
        h(
          "div",
          {
            style: {
              width: "100%",
              maxWidth: "720px",
              marginTop: "12px",
              padding: "14px",
              borderRadius: "16px",
              background: "rgba(18, 28, 46, 0.94)",
              border: "1px solid rgba(100, 160, 255, 0.28)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              flexShrink: 0,
              boxSizing: "border-box"
            }
          },
          // 区块 1：全站联动播报栏目（公共新闻 / 私密互动分组 + 每期容量配额）
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexWrap: "wrap" } },
              h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#93C5FD" } }, "1. 指定播报栏目（点击即重新抽选）"),
              h(
                "div",
                { style: { display: "flex", gap: "5px", flexWrap: "wrap" } },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleApplySourcePreset("public"),
                    style: { padding: "3px 8px", borderRadius: "999px", border: "1px solid rgba(147,197,253,0.35)", background: "rgba(30, 58, 138, 0.45)", color: "#E0F2FE", fontSize: "10.5px", cursor: "pointer" }
                  },
                  "仅公共新闻"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleApplySourcePreset("all"),
                    style: { padding: "3px 8px", borderRadius: "999px", border: "1px solid rgba(147,197,253,0.35)", background: "rgba(37, 99, 235, 0.45)", color: "#FFF", fontSize: "10.5px", cursor: "pointer" }
                  },
                  "全部开启"
                )
              )
            ),
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "10.5px", color: "#CBD5E1" } },
              h("span", null, "每期精选容量："),
              [
                { val: 3, label: "精简 3 栏" },
                { val: 4, label: "标准 4 栏" },
                { val: 0, label: "全量播报" }
              ].map((opt) => {
                const curVal = typeof settings.episodeMaxSections === "number" ? settings.episodeMaxSections : 4;
                const active = curVal === opt.val;
                return h(
                  "button",
                  {
                    key: opt.val,
                    type: "button",
                    onClick: () => handleSetEpisodeMaxSections(opt.val),
                    style: {
                      padding: "3px 8px",
                      borderRadius: "999px",
                      border: active ? "1px solid #60A5FA" : "1px solid rgba(148,163,184,0.25)",
                      background: active ? "rgba(37, 99, 235, 0.42)" : "rgba(15, 23, 42, 0.6)",
                      color: active ? "#FFF" : "#94A3B8",
                      fontSize: "10.5px",
                      cursor: "pointer"
                    }
                  },
                  opt.label
                );
              })
            ),
            [
              { key: "public", title: "广陵公共新闻（论坛 / 绣衣楼 / 太疾驰 / 趣闻）", items: eng.SOURCE_META.filter((x) => x.group !== "private") },
              { key: "private", title: "私密互动圈（传讯 / 朋友圈 / 情侣空间）", items: eng.SOURCE_META.filter((x) => x.group === "private") }
            ].map((grp) =>
              h(
                "div",
                { key: grp.key, style: { display: "flex", flexDirection: "column", gap: "6px" } },
                h("div", { style: { fontSize: "10.5px", fontWeight: 700, color: grp.key === "private" ? "#F9A8D4" : "#7DD3FC", letterSpacing: "0.02em" } }, grp.title),
                h(
                  "div",
                  { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "7px" } },
                  grp.items.map((srcItem) => {
                    const checked = !!curSources[srcItem.id];
                    return h(
                      "button",
                      {
                        key: srcItem.id,
                        type: "button",
                        onClick: () => handleToggleSource(srcItem.id),
                        style: {
                          textAlign: "left",
                          padding: "8px 9px",
                          borderRadius: "10px",
                          border: checked
                            ? grp.key === "private"
                              ? "1px solid #F472B6"
                              : "1px solid #60A5FA"
                            : "1px solid rgba(148, 163, 184, 0.25)",
                          background: checked
                            ? grp.key === "private"
                              ? "rgba(190, 24, 93, 0.24)"
                              : "rgba(37, 99, 235, 0.28)"
                            : "rgba(15, 23, 42, 0.65)",
                          color: checked ? "#F0F9FF" : "#94A3B8",
                          cursor: "pointer"
                        }
                      },
                      h("div", { style: { fontSize: "11.5px", fontWeight: 700 } }, `${checked ? "[已选] " : ""}${srcItem.label}`),
                      h("div", { style: { fontSize: "10px", opacity: 0.78, marginTop: "2px", lineHeight: 1.35 } }, srcItem.desc)
                    );
                  })
                )
              )
            )
          ),

          // 区块 2：指定主播角色 & 心纸居（心纸君）形象联动
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#93C5FD" } }, `2. 指定播报角色与形象（当前：${anchorSourceLabel}）`),
            h(
              "div",
              { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
              h(
                "select",
                {
                  value: settings.anchorCharId || "",
                  onChange: (e) => handleSelectCharAnchor(e.target.value),
                  style: { flex: 1, minWidth: "150px", background: "#0F172A", color: "#FFF", border: "1px solid rgba(147,197,253,0.35)", borderRadius: "9px", padding: "7px 9px", fontSize: "12px" }
                },
                h("option", { value: "" }, "默认广陵值班主播（猫嘴西装）"),
                characters.map((c) => h("option", { key: c.id, value: String(c.id) }, `指定角色：${c.name}`))
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => updateSetting({ anchorMode: "mansion" }, true),
                  style: {
                    padding: "6px 10px",
                    borderRadius: "9px",
                    border: settings.anchorMode === "mansion" ? "1px solid #60A5FA" : "1px solid rgba(147,197,253,0.28)",
                    background: settings.anchorMode === "mansion" ? "rgba(37, 99, 235, 0.35)" : "rgba(255,255,255,0.06)",
                    color: "#E0F2FE",
                    fontSize: "11.5px",
                    cursor: "pointer"
                  }
                },
                "用心纸居形象"
              ),
              h(
                "button",
                {
                  type: "button",
                  onClick: () => fileInputRef.current && fileInputRef.current.click(),
                  style: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 10px", borderRadius: "9px", border: "none", background: "#2563EB", color: "#FFF", fontSize: "11.5px", cursor: "pointer" }
                },
                h(StudioSvg.Upload, null),
                "上传立绘"
              ),
              h("input", { ref: fileInputRef, type: "file", accept: "image/*", onChange: handleUploadAnchor, style: { display: "none" } })
            ),

            // 若该角色在心纸居有多套形态立绘，直接展示缩略图切换条
            settings.anchorMode === "mansion" &&
              mansionSprites.length > 0 &&
              h(
                "div",
                { style: { display: "flex", gap: "7px", overflowX: "auto", paddingBottom: "2px" } },
                mansionSprites.map((srcUrl, idx) => {
                  const active = (Number(settings.anchorSpriteIndex) || 0) === idx;
                  return h(
                    "button",
                    {
                      key: idx,
                      type: "button",
                      onClick: () => updateSetting({ anchorSpriteIndex: idx }, true),
                      style: {
                        width: "46px",
                        height: "54px",
                        padding: "2px",
                        borderRadius: "8px",
                        border: active ? "2px solid #60A5FA" : "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(15, 23, 42, 0.7)",
                        cursor: "pointer",
                        flexShrink: 0,
                        overflow: "hidden"
                      }
                    },
                    h("img", { src: srcUrl, alt: `形态${idx + 1}`, style: { width: "100%", height: "100%", objectFit: "contain" } })
                  );
                })
              ),

            h(
              "div",
              { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px", color: "#CBD5E1" } },
              h(
                "label",
                { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                `缩放 (${Number(settings.anchorScale || 1).toFixed(2)})`,
                h("input", { type: "range", min: 0.6, max: 1.8, step: 0.02, value: settings.anchorScale || 1, onChange: (e) => updateSetting({ anchorScale: parseFloat(e.target.value) }) })
              ),
              h(
                "label",
                { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                `上下偏移 (${Number(settings.anchorOffsetY || 0).toFixed(2)})`,
                h("input", { type: "range", min: -0.5, max: 0.6, step: 0.02, value: settings.anchorOffsetY || 0, onChange: (e) => updateSetting({ anchorOffsetY: parseFloat(e.target.value) }) })
              )
            )
          ),

          // 区块 3：语音播报与主播声线（动森狸语 / 克隆音色 / 真人口播 / 复古电子音）
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "8px" } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" } },
              h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#93C5FD" } }, "3. 语音播报与主播声线"),
              h(
                "span",
                { style: { fontSize: "10px", color: "#94A3B8" } },
                activeVoiceCfg.mode === "animalese"
                  ? voiceBankStatus === "ready"
                    ? "双核：中文采样 + 共振峰"
                    : "离线核：纯数学共振峰"
                  : activeVoiceCfg.mode === "clone"
                    ? "克隆音色（语音工作台）"
                    : activeVoiceCfg.mode === "webspeech"
                      ? "浏览器中文真人口播"
                      : activeVoiceCfg.mode === "blip"
                        ? "复古电子音"
                        : "已静音"
              )
            ),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
              [
                { id: "animalese", label: "动森狸语" },
                { id: "clone", label: "克隆音色" },
                { id: "webspeech", label: "真人口播" },
                { id: "blip", label: "复古电子音" },
                { id: "mute", label: "静音" }
              ].map((m) => {
                const active = activeVoiceCfg.mode === m.id;
                return h(
                  "button",
                  {
                    key: m.id,
                    type: "button",
                    onClick: () => updateVoicePatch({ mode: m.id }),
                    style: {
                      padding: "5px 10px",
                      borderRadius: "999px",
                      border: active ? "1px solid #60A5FA" : "1px solid rgba(148, 163, 184, 0.28)",
                      background: active ? "rgba(37, 99, 235, 0.42)" : "rgba(15, 23, 42, 0.65)",
                      color: active ? "#FFF" : "#CBD5E1",
                      fontSize: "11.5px",
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer"
                    }
                  },
                  m.label
                );
              }),
              h(
                "button",
                {
                  type: "button",
                  onClick: handlePreviewVoice,
                  style: {
                    marginLeft: "auto",
                    padding: "5px 11px",
                    borderRadius: "999px",
                    border: "1px solid rgba(96, 165, 250, 0.55)",
                    background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
                    color: "#FFF",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }
                },
                "试听一句"
              )
            ),

            // 克隆音色（voiceId）配置区
            activeVoiceCfg.mode === "clone" &&
              (() => {
                const cloneSt =
                  voiceRef.current && typeof voiceRef.current.getCloneVoiceStatus === "function"
                    ? voiceRef.current.getCloneVoiceStatus(settings.anchorCharId, activeVoiceCfg.cloneVoiceId)
                    : { available: false, label: "请先在「设置 → 语音工作台」配置接口密钥" };
                return h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: "7px", padding: "9px 10px", borderRadius: "10px", background: "rgba(15, 23, 42, 0.65)", border: "1px solid rgba(147, 197, 253, 0.22)" } },
                  h(
                    "div",
                    { style: { fontSize: "11px", color: cloneSt.available ? "#86EFAC" : "#FCD34D", fontWeight: 600 } },
                    `状态：${cloneSt.label}`
                  ),
                  h("input", {
                    type: "text",
                    value: activeVoiceCfg.cloneVoiceId || "",
                    onChange: (e) => updateVoicePatch({ cloneVoiceId: e.target.value }),
                    placeholder: "可选：粘贴自定义克隆 voiceId（留空自动沿用该名士在语音工作台的音色）",
                    style: { width: "100%", background: "#0B1220", color: "#FFF", border: "1px solid rgba(147,197,253,0.32)", borderRadius: "8px", padding: "6px 9px", fontSize: "11.5px", boxSizing: "border-box" }
                  }),
                  h(
                    "div",
                    { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", fontSize: "11px", color: "#CBD5E1" } },
                    h(
                      "label",
                      { style: { display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" } },
                      h("input", {
                        type: "checkbox",
                        checked: activeVoiceCfg.clonePrefetch !== false,
                        onChange: (e) => updateVoicePatch({ clonePrefetch: e.target.checked })
                      }),
                      "预合成下一句（翻页零等待）"
                    ),
                    h(
                      "label",
                      { style: { display: "inline-flex", alignItems: "center", gap: "6px" } },
                      `音量 ${Math.round(activeVoiceCfg.volume * 100)}%`,
                      h("input", { type: "range", min: 0.1, max: 1, step: 0.05, value: activeVoiceCfg.volume, onChange: (e) => updateVoicePatch({ volume: parseFloat(e.target.value) }), style: { width: "90px" } })
                    )
                  ),
                  h(
                    "div",
                    { style: { fontSize: "10px", color: "#94A3B8", lineHeight: 1.4 } },
                    "复用「设置 → 语音工作台」的 Fish Audio / MiniMax / ElevenLabs 密钥与缓存；若未配置或超时将自动降级为动森狸语。"
                  )
                );
              })(),

            // 动森狸语预设与调参
            activeVoiceCfg.mode === "animalese" &&
              voiceMod &&
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "8px" } },
                h(
                  "div",
                  { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                  voiceMod.VOICE_PRESETS.map((p) => {
                    const active = activeVoiceCfg.preset === p.id;
                    return h(
                      "button",
                      {
                        key: p.id,
                        type: "button",
                        title: p.desc,
                        onClick: () => handleSelectVoicePreset(p.id),
                        style: {
                          padding: "4px 9px",
                          borderRadius: "8px",
                          border: active ? "1px solid #60A5FA" : "1px solid rgba(147, 197, 253, 0.22)",
                          background: active ? "rgba(59, 130, 246, 0.3)" : "rgba(15, 23, 42, 0.55)",
                          color: active ? "#F0F9FF" : "#CBD5E1",
                          fontSize: "11px",
                          cursor: "pointer"
                        }
                      },
                      p.name
                    );
                  })
                ),
                h(
                  "div",
                  { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px", color: "#CBD5E1" } },
                  h(
                    "label",
                    { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                    `基准音高 (${Math.round(activeVoiceCfg.basePitchHz)} Hz)`,
                    h("input", { type: "range", min: 180, max: 620, step: 5, value: activeVoiceCfg.basePitchHz, onChange: (e) => updateVoicePatch({ preset: "custom", basePitchHz: parseFloat(e.target.value) }) })
                  ),
                  h(
                    "label",
                    { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                    `语速 (${Number(activeVoiceCfg.unitsPerSecond).toFixed(1)} 音节/秒)`,
                    h("input", { type: "range", min: 6, max: 16, step: 0.5, value: activeVoiceCfg.unitsPerSecond, onChange: (e) => updateVoicePatch({ preset: "custom", unitsPerSecond: parseFloat(e.target.value) }) })
                  ),
                  h(
                    "label",
                    { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                    `四声起伏 (${Math.round(activeVoiceCfg.toneAmount * 100)}%)`,
                    h("input", { type: "range", min: 0, max: 1.2, step: 0.05, value: activeVoiceCfg.toneAmount, onChange: (e) => updateVoicePatch({ preset: "custom", toneAmount: parseFloat(e.target.value) }) })
                  ),
                  h(
                    "label",
                    { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                    `采样/电子混音 (${Math.round(activeVoiceCfg.mixRatio * 100)}%)`,
                    h("input", { type: "range", min: 0, max: 1, step: 0.05, value: activeVoiceCfg.mixRatio, onChange: (e) => updateVoicePatch({ preset: "custom", mixRatio: parseFloat(e.target.value) }) })
                  ),
                  h(
                    "label",
                    { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                    `音色暖度 (${Math.round(activeVoiceCfg.warmthHz)} Hz)`,
                    h("input", { type: "range", min: 1800, max: 12000, step: 200, value: activeVoiceCfg.warmthHz, onChange: (e) => updateVoicePatch({ preset: "custom", warmthHz: parseFloat(e.target.value) }) })
                  ),
                  h(
                    "label",
                    { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                    `音量 (${Math.round(activeVoiceCfg.volume * 100)}%)`,
                    h("input", { type: "range", min: 0.1, max: 1, step: 0.05, value: activeVoiceCfg.volume, onChange: (e) => updateVoicePatch({ volume: parseFloat(e.target.value) }) })
                  )
                )
              ),

            // 真人口播调参
            activeVoiceCfg.mode === "webspeech" &&
              h(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: "7px" } },
                h(
                  "select",
                  {
                    value: activeVoiceCfg.webSpeechVoiceURI || "",
                    onChange: (e) => updateVoicePatch({ webSpeechVoiceURI: e.target.value }),
                    style: { background: "#0F172A", color: "#FFF", border: "1px solid rgba(147,197,253,0.35)", borderRadius: "9px", padding: "6px 9px", fontSize: "11.5px" }
                  },
                  h("option", { value: "" }, "自动优选系统中文播音员"),
                  chineseVoices.map((v) => h("option", { key: v.voiceURI, value: v.voiceURI }, `${v.name} (${v.lang})`))
                ),
                h(
                  "div",
                  { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "11px", color: "#CBD5E1" } },
                  h(
                    "label",
                    { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                    `语速 (${Number(activeVoiceCfg.webSpeechRate).toFixed(2)}x)`,
                    h("input", { type: "range", min: 0.7, max: 1.5, step: 0.05, value: activeVoiceCfg.webSpeechRate, onChange: (e) => updateVoicePatch({ webSpeechRate: parseFloat(e.target.value) }) })
                  ),
                  h(
                    "label",
                    { style: { display: "flex", flexDirection: "column", gap: "2px" } },
                    `音调 (${Number(activeVoiceCfg.webSpeechPitch).toFixed(2)})`,
                    h("input", { type: "range", min: 0.6, max: 1.5, step: 0.05, value: activeVoiceCfg.webSpeechPitch, onChange: (e) => updateVoicePatch({ webSpeechPitch: parseFloat(e.target.value) }) })
                  )
                )
              ),

            settings.anchorCharId &&
              h(
                "div",
                { style: { display: "flex", justifyContent: "flex-end" } },
                h(
                  "button",
                  {
                    type: "button",
                    onClick: handleBindVoiceToAnchor,
                    style: { padding: "4px 10px", borderRadius: "8px", border: "1px solid rgba(147, 197, 253, 0.35)", background: "rgba(30, 58, 138, 0.5)", color: "#E0F2FE", fontSize: "11px", cursor: "pointer" }
                  },
                  `为「${settings.anchorName}」记住这套声线`
                )
              )
          ),

          // 区块 4：定时档期 & 手机端到点纯净画面模式
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "7px" } },
            h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#93C5FD" } }, "4. 定时播报档期 & 到点纯净画面模式"),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "11.5px", color: "#E2E8F0" } },
              h(
                "label",
                { style: { display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" } },
                h("input", {
                  type: "checkbox",
                  checked: settings.autoPopupOnSchedule !== false,
                  onChange: (e) => updateSetting({ autoPopupOnSchedule: e.target.checked })
                }),
                "到点自动切入演播室"
              ),
              h(
                "label",
                { style: { display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" } },
                h("input", {
                  type: "checkbox",
                  checked: settings.pureModeOnSchedule !== false,
                  onChange: (e) => updateSetting({ pureModeOnSchedule: e.target.checked })
                }),
                "到点仅显示纯净画面"
              )
            ),
            h(
              "div",
              { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" } },
              (settings.scheduleTimes || []).map((t) =>
                h(
                  "span",
                  { key: t, style: { display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "999px", background: "rgba(59, 130, 246, 0.22)", border: "1px solid rgba(147, 197, 253, 0.35)", fontSize: "12px" } },
                  t,
                  h("button", { type: "button", onClick: () => handleRemoveScheduleTime(t), style: { border: "none", background: "none", color: "#BFDBFE", cursor: "pointer", padding: 0, fontSize: "12px" } }, "×")
                )
              ),
              h("input", { type: "time", value: newTimeInput, onChange: (e) => setNewTimeInput(e.target.value), style: { background: "#0F172A", color: "#FFF", border: "1px solid rgba(147,197,253,0.35)", borderRadius: "8px", padding: "3px 6px", fontSize: "12px" } }),
              h("button", { type: "button", onClick: handleAddScheduleTime, style: { padding: "4px 10px", borderRadius: "8px", border: "none", background: "#3B82F6", color: "#FFF", fontSize: "11.5px", cursor: "pointer" } }, "添加时段")
            )
          ),

          // 区块 5：台标与手动稿
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            h("div", { style: { fontSize: "12px", fontWeight: 700, color: "#93C5FD" } }, "5. 台标与手动播报稿（留空即自动播报上述勾选栏目）"),
            h(
              "div",
              { style: { display: "flex", gap: "8px" } },
              h("input", { type: "text", value: settings.logoMain || "", onChange: (e) => updateSetting({ logoMain: e.target.value }), placeholder: "主台标（如 广陵联播）", style: { flex: 1, background: "#0F172A", color: "#FFF", border: "1px solid rgba(147,197,253,0.3)", borderRadius: "8px", padding: "6px 9px", fontSize: "12px" } }),
              h("input", { type: "text", maxLength: 3, value: settings.logoSub || "", onChange: (e) => updateSetting({ logoSub: e.target.value }), placeholder: "GLN", style: { width: "74px", background: "#0F172A", color: "#FFF", border: "1px solid rgba(147,197,253,0.3)", borderRadius: "8px", padding: "6px 9px", fontSize: "12px", textAlign: "center" } })
            ),
            h("textarea", {
              rows: 2,
              value: settings.customScript || "",
              onChange: (e) => updateSetting({ customScript: e.target.value }),
              placeholder: "可选：手动输入自定义新闻稿（每行一条）...",
              style: { width: "100%", background: "#0F172A", color: "#FFF", border: "1px solid rgba(147,197,253,0.3)", borderRadius: "8px", padding: "7px 9px", fontSize: "12px", resize: "vertical", boxSizing: "border-box" }
            })
          )
        ),

      toast &&
        h(
          "div",
          {
            style: {
              position: "fixed",
              left: "50%",
              bottom: "24px",
              transform: "translateX(-50%)",
              background: "rgba(15, 23, 42, 0.92)",
              color: "#E0F2FE",
              fontSize: "12px",
              padding: "7px 14px",
              borderRadius: "999px",
              border: "1px solid rgba(147,197,253,0.35)",
              zIndex: 100060
            }
          },
          toast
        )
    );

    if (typeof ReactDOM !== "undefined" && ReactDOM.createPortal && document.body) {
      return ReactDOM.createPortal(modalContent, document.body);
    }
    return modalContent;
  }

  // ===================== 5. 前台到点自动切入纯净演播室宿主 =====================
  function AutoBroadcastHost() {
    const [open, setOpen] = React.useState(false);
    const [pureOnBoot, setPureOnBoot] = React.useState(true);

    React.useEffect(() => {
      const onNewsEvent = (e) => {
        const d = e && e.detail;
        if (!d || d.kind !== "live_start") return;
        if (global.__MILVUS_ENTRY_GATE_ACTIVE__) return;
        const st = d.detail && d.detail.settings;
        if (st && st.autoPopupOnSchedule === false) return;
        setPureOnBoot(!st || st.pureModeOnSchedule !== false);
        setOpen(true);
      };
      global.addEventListener("milvus-guangling-news-updated", onNewsEvent);
      return () => global.removeEventListener("milvus-guangling-news-updated", onNewsEvent);
    }, []);

    if (!open) return null;
    return h(StudioModal, {
      isOpen: open,
      initialPureMode: pureOnBoot,
      autoTriggered: true,
      onClose: () => setOpen(false)
    });
  }

  // ===================== 6. 轻量桌面电视机小组件视图（0 WebGL 占用） =====================
  function WidgetView({ widget, skin, isSquare, isCompact }) {
    const eng = global.GuanglingNewsEngine;
    const [studioOpen, setStudioOpen] = React.useState(false);
    const [summary, setSummary] = React.useState({
      logoMain: "广陵联播",
      hasUnread: false,
      isLiveNow: false,
      activeSlot: "20:00",
      nextSlot: "20:00",
      countdownText: "点击入台",
      headline: "点击开启今日 3D 广陵联播演播室"
    });

    React.useEffect(() => {
      if (!eng) return;
      let alive = true;
      const refresh = async () => {
        const [st, watched] = await Promise.all([eng.loadSettings(), eng.loadWatchedMap()]);
        if (!alive) return;
        const bc = eng.evaluateBroadcastStatus(st, watched, new Date());
        const ep = await eng.getOrCreateEpisode(bc.activeSlot, { settings: st });
        if (!alive) return;
        setSummary({
          logoMain: st.logoMain || "广陵联播",
          hasUnread: bc.hasUnread,
          isLiveNow: bc.isLiveNow,
          activeSlot: bc.activeSlot,
          nextSlot: bc.nextSlot,
          countdownText: bc.countdownText,
          headline: (ep && ep.headline) || "今日广陵头条已就绪，点击入台收看"
        });
      };
      refresh();
      const onUpd = () => refresh();
      global.addEventListener("milvus-guangling-news-updated", onUpd);
      const timer = setInterval(refresh, 60000);
      return () => {
        alive = false;
        global.removeEventListener("milvus-guangling-news-updated", onUpd);
        clearInterval(timer);
      };
    }, []);

    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          className: "hw-news-body",
          onClick: (e) => {
            e.stopPropagation();
            setStudioOpen(true);
          },
          style: {
            width: "100%",
            height: "100%",
            padding: isSquare ? "11px 12px" : "8px 11px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            cursor: "pointer",
            boxSizing: "border-box",
            overflow: "hidden"
          }
        },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "5px", minWidth: 0 } },
            h(StudioSvg.Tv, { size: isSquare ? 15 : 13, color: skin ? skin.accent : "#3B82F6" }),
            h("span", { className: "hw-news-brand", style: { fontSize: isSquare ? "12px" : "11px", fontWeight: 800, color: skin ? skin.text : "#1F2329", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, summary.logoMain)
          ),
          h(
            "span",
            {
              className: "hw-news-badge",
              style: {
                padding: "1.5px 6px",
                borderRadius: "999px",
                fontSize: "9.5px",
                fontWeight: 800,
                background: summary.isLiveNow || summary.hasUnread ? "#D9383A" : "rgba(59, 130, 246, 0.16)",
                color: summary.isLiveNow || summary.hasUnread ? "#FFFFFF" : skin ? skin.accent : "#2563EB",
                flexShrink: 0
              }
            },
            summary.isLiveNow ? "LIVE" : summary.hasUnread ? "待播" : summary.activeSlot
          )
        ),
        h(
          "div",
          {
            className: "hw-news-headline",
            style: {
              fontSize: isSquare ? "12.5px" : "11.5px",
              fontWeight: 700,
              color: skin ? skin.text : "#252930",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: isSquare ? 3 : 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              margin: "3px 0"
            }
          },
          summary.headline
        ),
        !isCompact &&
          h(
            "div",
            { className: "hw-news-meta", style: { fontSize: "10px", color: skin ? skin.subText : "#6E7786", display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", null, summary.hasUnread ? `${summary.activeSlot}档未看` : `下档 ${summary.nextSlot}`),
            h("span", null, "点击入台")
          )
      ),
      h(StudioModal, {
        isOpen: studioOpen,
        initialPureMode: false,
        onClose: () => setStudioOpen(false)
      })
    );
  }

  global.GuanglingNewsStudio = {
    StudioModal,
    AutoBroadcastHost,
    WidgetView
  };
})(window);
