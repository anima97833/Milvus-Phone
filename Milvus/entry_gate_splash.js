/**
 * Milvus/entry_gate_splash.js
 * 独立模块：「代號鳶」开屏动效入口页 + 模糊缓动入/退场 + 「进入世界」门禁 + 《使用须知与免责声明》
 *
 * 架构特性：
 * - Milvus/app.min.js 零行改动
 * - 零新增 localStorage 键；零 Emoji（全量手绘矢量 SVG）
 * - 完整修复原动效 6 大隐患：严格模式变量笔误、手机端 650px 溢出等比缩放、移动端触控唤醒、
 *   进入后 cancelAnimationFrame + Canvas 显存释放、SVG ID/CSS 全量命名空间隔离、与开屏推送错峰协同
 */
(function (global) {
  "use strict";

  if (global.__MILVUS_ENTRY_GATE_BOOTED__) return;
  global.__MILVUS_ENTRY_GATE_BOOTED__ = true;

  const GATE_ID = "milvus-entry-gate";
  const STYLE_ID = "milvus-entry-gate-style";

  // 标记开屏门禁处于激活态，供 SplashPushAutoHost 等待进入后再弹出节气/纪念日/更新海报
  global.__MILVUS_ENTRY_GATE_ACTIVE__ = true;

  const DISCLAIMER_SECTIONS = [
    {
      title: "一、非官方同人衍生性质与知识产权归属",
      body: "本网页（「鸢小手机」）为爱好者基于个人兴趣独立制作的纯同人二次创作交互网页，与《代号鸢》/《如鸢》官方研发、发行及运营主体无任何隶属、授权、代理或商业合作关系。原作世界观、角色名称、背景设定及相关知识产权均完整归属于原官方版权方。本页面全部界面结构、交互代码与矢量视觉元素均由同人前端独立编写与绘制，未提取、未反编译、亦未盗用任何官方游戏安装包或商业美术音频素材，不构成对官方权益的侵权或替代。"
    },
    {
      title: "二、完全免费与非商用承诺",
      body: "本网页永久免费开放给同好交流体验，不设任何付费解锁、充值内购、强制打赏、商业广告或引流变现机制。严禁任何个人或组织将本网页源码、配置或衍生文件用于打包售卖、付费代搭或其他商业牟利行为。"
    },
    {
      title: "三、AI 生成内容与同人演绎免责",
      body: "本网页中的传讯对话、书信往来、卜卦推演及各类互动文本，均由用户自行配置并接入的第三方大语言模型（LLM）实时生成，仅作同人娱乐体验，不代表原作官方设定、剧情走向或任何官方立场。请理性看待虚拟演绎内容，切勿与现实生活混淆。"
    },
    {
      title: "四、纯前端本地存储与隐私安全",
      body: "本网页为纯前端静态应用，不设远端业务服务器，不会采集、记录或上传您的聊天记录、角色设定、美化配置及自行填写的 API Key。全部数据仅保存于您当前设备的浏览器本地存储（IndexedDB / LocalStorage）中，建议定期通过「设置 → 隐私与安全 → 备份与恢复」自行备份重要存档。"
    },
    {
      title: "五、版权方联络与响应承诺",
      body: "我们由衷尊重并支持原作官方正版体验。若原官方版权方认为本页面任何内容或表述存在不妥或潜在侵权疑虑，一经正式告知，作者将在第一时间无条件配合修改或下架处理。"
    }
  ];

  const FLARE_CONFIGS = [
    { x: 325, y: 88, scale: 0.85, dur: "2.8s", delay: "0s", depth: 1.2 },
    { x: 306, y: 98, scale: 1.15, dur: "3.4s", delay: "-1.1s", depth: 1.6 },
    { x: 378, y: 245, scale: 0.65, dur: "4.0s", delay: "-2.3s", depth: 1.0 },
    { x: 266, y: 292, scale: 0.85, dur: "3.1s", delay: "-0.7s", depth: 1.5 },
    { x: 374, y: 398, scale: 1.55, dur: "2.6s", delay: "-0.3s", depth: 2.2 },
    { x: 272, y: 432, scale: 0.8, dur: "3.6s", delay: "-1.8s", depth: 1.4 },
    { x: 375, y: 525, scale: 0.9, dur: "3.0s", delay: "-1.4s", depth: 1.8 }
  ];

  function buildStyles() {
    return `
#${GATE_ID} {
  position: fixed;
  inset: 0;
  z-index: 200000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: #cfc8b8;
  perspective: 1200px;
  font-family: 'Noto Serif TC', 'Noto Sans SC', 'Songti TC', 'STSong', serif;
  opacity: 0;
  filter: blur(18px);
  transform: scale(1.04);
  transition:
    opacity 0.82s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.88s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.88s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, filter, transform;
  box-sizing: border-box;
  padding: max(12px, env(safe-area-inset-top, 12px)) 16px max(16px, env(safe-area-inset-bottom, 16px));
}
#${GATE_ID}.mgate-visible {
  opacity: 1;
  filter: blur(0px);
  transform: scale(1);
}
#${GATE_ID}.mgate-leaving {
  opacity: 0;
  filter: blur(22px) brightness(1.08);
  transform: scale(1.07);
  pointer-events: none;
  transition:
    opacity 0.66s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.66s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.68s cubic-bezier(0.22, 1, 0.36, 1);
}
#${GATE_ID} * {
  box-sizing: border-box;
}
#${GATE_ID} .mgate-bg-scene {
  position: absolute;
  inset: -60px;
  background-image:
    linear-gradient(90deg, rgba(35,30,25,0.88) 1.8%, transparent 1.8%, transparent 48.5%, rgba(35,30,25,0.65) 48.5%, rgba(35,30,25,0.65) 50.5%, transparent 50.5%),
    linear-gradient(0deg, rgba(35,30,25,0.5) 2%, transparent 2%, transparent 18%, rgba(255,255,255,0.45) 18%, rgba(255,255,255,0.45) 38%, rgba(35,30,25,0.82) 38%, rgba(35,30,25,0.82) 41.5%, transparent 41.5%),
    radial-gradient(circle at 70% 80%, #e8b878 0%, #c4c2b6 52%, #88928a 100%);
  background-size: 130px 100%, 100% 100%, 100% 100%;
  filter: blur(4px);
  transition: transform 0.15s ease-out;
  z-index: 0;
  pointer-events: none;
}
#${GATE_ID} .mgate-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(25px);
  opacity: 0.65;
  pointer-events: none;
  z-index: 0;
  animation: mgateOrbDrift 14s ease-in-out infinite alternate;
}
#${GATE_ID} .mgate-orb-1 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, #ffdfa3 0%, transparent 70%);
  top: 10%;
  left: 16%;
}
#${GATE_ID} .mgate-orb-2 {
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, #ffc988 0%, transparent 70%);
  bottom: 12%;
  right: 16%;
  animation-delay: -7s;
}
@keyframes mgateOrbDrift {
  0% { transform: translate(-70px, -36px) scale(1); }
  100% { transform: translate(80px, 50px) scale(1.22); }
}
#${GATE_ID} .mgate-shell {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
}
#${GATE_ID} .mgate-stage-wrap {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}
#${GATE_ID} .mgate-logo-stage {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 650px;
  height: 650px;
  margin-left: -325px;
  margin-top: -325px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  transform-style: preserve-3d;
  transform-origin: center center;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: auto;
}
#${GATE_ID} .mgate-bottom-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: max(12px, env(safe-area-inset-bottom, 12px));
  z-index: 12;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 0 12px;
  box-sizing: border-box;
}
#${GATE_ID} .mgate-glass-annulus {
  position: absolute;
  width: 476px;
  height: 476px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    transparent 65%,
    rgba(110, 96, 140, 0.42) 67%,
    rgba(130, 112, 155, 0.62) 85%,
    rgba(105, 90, 135, 0.5) 100%
  );
  backdrop-filter: blur(10px) saturate(140%) brightness(1.05);
  -webkit-backdrop-filter: blur(10px) saturate(140%) brightness(1.05);
  -webkit-mask-image: radial-gradient(circle, transparent 157px, #000 160px, #000 237px, transparent 238px);
  mask-image: radial-gradient(circle, transparent 157px, #000 160px, #000 237px, transparent 238px);
  box-shadow: inset 0 0 30px rgba(255, 230, 175, 0.35);
  z-index: 1;
}
#${GATE_ID} .mgate-svg-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
#${GATE_ID} .mgate-svg-base { z-index: 2; }
#${GATE_ID} .mgate-svg-text { z-index: 4; }
#${GATE_ID} svg text.mgate-calligraphy {
  font-family: 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif !important;
  font-weight: 900 !important;
  text-anchor: middle;
  fill: url(#mgate-text-gold);
  filter: drop-shadow(0px 3px 7px rgba(15, 10, 38, 0.75)) drop-shadow(0px 0px 12px rgba(255, 230, 150, 0.35));
  user-select: none;
}
#${GATE_ID} .mgate-canvas {
  position: absolute;
  inset: 0;
  width: 650px;
  height: 650px;
  z-index: 3;
  pointer-events: none;
  mix-blend-mode: screen;
}
#${GATE_ID} .mgate-flares {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
  pointer-events: none;
  mix-blend-mode: screen;
}
#${GATE_ID} .mgate-flare-node {
  position: absolute;
  width: 90px;
  height: 90px;
  margin-left: -45px;
  margin-top: -45px;
  transform-origin: center center;
  will-change: transform, opacity;
}
#${GATE_ID} .mgate-flare-inner {
  width: 100%;
  height: 100%;
  animation: mgateFlareBreathe var(--dur, 3.2s) ease-in-out infinite alternate;
  animation-delay: var(--delay, 0s);
}
@keyframes mgateFlareBreathe {
  0% { transform: scale(0.78) rotate(-8deg); opacity: 0.65; filter: brightness(0.95); }
  50% { opacity: 1; filter: brightness(1.35); }
  100% { transform: scale(1.22) rotate(8deg); opacity: 0.85; filter: brightness(1.15); }
}

/* 1:1 复刻「代號鳶 · 流金飞鸢」进入世界横幅按钮 */
#${GATE_ID} .mgate-enter-banner {
  position: relative;
  width: min(74vw, 290px);
  aspect-ratio: 680 / 160;
  margin-bottom: -6px;
  padding: 0;
  border: none;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  opacity: 0.72;
  filter: saturate(0.75) brightness(0.92);
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s ease, filter 0.3s ease;
}
#${GATE_ID} .mgate-enter-banner.mgate-ready {
  opacity: 1;
  filter: saturate(1.08) brightness(1.04);
}
#${GATE_ID} .mgate-enter-banner.mgate-ready:hover {
  transform: scale(1.04);
}
#${GATE_ID} .mgate-enter-banner.mgate-ready:active {
  transform: scale(0.97);
}
#${GATE_ID} .mgate-amber-mist {
  position: absolute;
  width: 72%;
  height: 70%;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at 50% 52%,
    rgba(255, 222, 145, 0.62) 0%,
    rgba(225, 178, 88, 0.35) 45%,
    rgba(175, 130, 50, 0.12) 70%,
    transparent 88%
  );
  filter: blur(10px);
  pointer-events: none;
  animation: mgateMistPulse 4s ease-in-out infinite alternate;
}
@keyframes mgateMistPulse {
  0% { opacity: 0.82; transform: scaleX(0.96); }
  100% { opacity: 1; transform: scaleX(1.05); }
}
#${GATE_ID} .mgate-banner-svg {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
#${GATE_ID} svg text.mgate-start-text {
  font-family: 'Noto Serif SC', 'Noto Serif TC', 'Songti SC', serif !important;
  font-size: 64px !important;
  font-weight: 600 !important;
  letter-spacing: 10px !important;
  text-anchor: middle;
  fill: url(#mgate-start-text-grad);
  filter: drop-shadow(0 0 10px rgba(255, 215, 115, 0.78)) drop-shadow(0 2px 4px rgba(45, 28, 5, 0.72));
}
#${GATE_ID} .mgate-golden-kite {
  animation: mgateKiteHover 3.2s ease-in-out infinite alternate;
  transform-origin: 485px 45px;
}
@keyframes mgateKiteHover {
  0% { transform: translate(0px, 0px) rotate(0deg); }
  100% { transform: translate(-2px, -4px) rotate(-3deg); }
}
#${GATE_ID} .mgate-shake {
  animation: mgateShake 0.38s ease-in-out;
}
@keyframes mgateShake {
  0%, 100% { transform: translateX(0); }
  22% { transform: translateX(-7px); }
  48% { transform: translateX(6px); }
  74% { transform: translateX(-4px); }
}

/* 底部极简单行条款勾选条（无多余摘要卡片） */
#${GATE_ID} .mgate-notice-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(28, 22, 34, 0.34);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(235, 200, 120, 0.22);
  color: rgba(250, 240, 216, 0.92);
  transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
}
#${GATE_ID} .mgate-notice-bar.mgate-highlight {
  background: rgba(34, 26, 40, 0.62);
  border-color: rgba(252, 214, 124, 0.95);
  box-shadow: 0 0 0 2px rgba(252, 214, 124, 0.34);
}
#${GATE_ID} .mgate-agree-row {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
  text-shadow: 0 1px 3px rgba(20, 14, 6, 0.72);
}
#${GATE_ID} .mgate-agree-row input[type="checkbox"] {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #e6bf63;
  cursor: pointer;
  flex-shrink: 0;
}
#${GATE_ID} .mgate-link-btn {
  display: inline;
  padding: 0;
  margin: 0;
  border: none;
  background: none;
  color: #ffe7a8;
  text-decoration: underline;
  text-underline-offset: 2px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
#${GATE_ID} .mgate-warn-tip {
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 11px;
  color: #ffe098;
  text-align: center;
  min-height: 15px;
  text-shadow: 0 1px 3px rgba(20, 14, 6, 0.75);
}

/* 完整《使用须知与免责声明》弹窗 */
#${GATE_ID} .mgate-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 200010;
  background: rgba(16, 13, 24, 0.68);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
}
#${GATE_ID} .mgate-modal-mask.mgate-modal-open {
  display: flex;
}
#${GATE_ID} .mgate-modal-box {
  width: 100%;
  max-width: 390px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  background: linear-gradient(180deg, #fbf7ee 0%, #f5efe2 100%);
  border: 1.5px solid #d7be8a;
  box-shadow: 0 22px 54px rgba(10, 8, 18, 0.5);
  color: #3b3026;
  overflow: hidden;
}
#${GATE_ID} .mgate-modal-head {
  padding: 15px 18px 12px;
  border-bottom: 1px solid rgba(184, 152, 98, 0.28);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
#${GATE_ID} .mgate-modal-title {
  font-size: 15px;
  font-weight: 700;
  color: #3d2d1e;
  letter-spacing: 0.6px;
}
#${GATE_ID} .mgate-modal-close {
  border: none;
  background: none;
  color: #7c6752;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
#${GATE_ID} .mgate-modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 18px;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 12px;
  line-height: 1.72;
  color: #4d4136;
}
#${GATE_ID} .mgate-modal-sec {
  margin-bottom: 12px;
}
#${GATE_ID} .mgate-modal-sec:last-child {
  margin-bottom: 0;
}
#${GATE_ID} .mgate-modal-sec-title {
  font-weight: 700;
  color: #3b2b1d;
  margin-bottom: 4px;
  font-size: 12.5px;
}
#${GATE_ID} .mgate-modal-foot {
  padding: 12px 18px 15px;
  border-top: 1px solid rgba(184, 152, 98, 0.25);
  display: flex;
  gap: 10px;
}
#${GATE_ID} .mgate-modal-btn-sub {
  flex: 1;
  padding: 9px 0;
  border-radius: 12px;
  border: 1px solid #d6c5a7;
  background: #fffdf8;
  color: #6b5846;
  font-size: 12.5px;
  cursor: pointer;
}
#${GATE_ID} .mgate-modal-btn-ok {
  flex: 1.4;
  padding: 9px 0;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #4b3d69 0%, #34294c 100%);
  color: #fce8b2;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
`;
  }

  function buildGateHtml() {
    const sectionsHtml = DISCLAIMER_SECTIONS.map(
      (s) =>
        `<div class="mgate-modal-sec"><div class="mgate-modal-sec-title">${s.title}</div><div>${s.body}</div></div>`
    ).join("");

    return `
<div class="mgate-bg-scene" id="mgate-bg-scene"></div>
<div class="mgate-orb mgate-orb-1"></div>
<div class="mgate-orb mgate-orb-2"></div>

<div class="mgate-shell">
  <div class="mgate-stage-wrap" id="mgate-stage-wrap">
    <div class="mgate-logo-stage" id="mgate-logo-stage">
      <div class="mgate-glass-annulus"></div>

      <svg class="mgate-svg-layer mgate-svg-base" viewBox="0 0 650 650" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mgate-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fff3c4"/>
            <stop offset="30%" stop-color="#d8b15a"/>
            <stop offset="50%" stop-color="#fff8db"/>
            <stop offset="70%" stop-color="#c29738"/>
            <stop offset="100%" stop-color="#f5dc8c"/>
          </linearGradient>
          <linearGradient id="mgate-night-sky" x1="15%" y1="15%" x2="85%" y2="85%">
            <stop offset="0%" stop-color="#282f66"/>
            <stop offset="45%" stop-color="#425092"/>
            <stop offset="75%" stop-color="#667eb5"/>
            <stop offset="100%" stop-color="#8da7d4"/>
          </linearGradient>
          <linearGradient id="mgate-bird-grad" x1="0%" y1="0%" x2="90%" y2="100%">
            <stop offset="0%" stop-color="#4e5994" stop-opacity="0.92"/>
            <stop offset="50%" stop-color="#354075" stop-opacity="0.96"/>
            <stop offset="100%" stop-color="#8c7a6b" stop-opacity="0.85"/>
          </linearGradient>
          <filter id="mgate-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.8" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <clipPath id="mgate-inner-clip">
            <circle cx="325" cy="325" r="158"/>
          </clipPath>
        </defs>

        <line x1="0" y1="295" x2="78" y2="295" stroke="url(#mgate-gold-grad)" stroke-width="1" opacity="0.7"/>
        <line x1="572" y1="295" x2="650" y2="295" stroke="url(#mgate-gold-grad)" stroke-width="1" opacity="0.7"/>
        <g transform="translate(86, 295)">
          <rect x="-10" y="-10" width="20" height="20" transform="rotate(45)" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="2"/>
          <circle cx="-22" cy="0" r="3.5" fill="#d8b15a"/>
          <circle cx="2" cy="-24" r="3" fill="#d8b15a"/>
          <circle cx="2" cy="24" r="3" fill="#d8b15a"/>
        </g>
        <g transform="translate(564, 295)">
          <rect x="-10" y="-10" width="20" height="20" transform="rotate(45)" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="2"/>
          <circle cx="22" cy="0" r="3.5" fill="#d8b15a"/>
          <circle cx="-2" cy="-24" r="3" fill="#d8b15a"/>
          <circle cx="-2" cy="24" r="3" fill="#d8b15a"/>
        </g>

        <circle cx="325" cy="325" r="248" fill="none" stroke="#6c5f7d" stroke-width="3.5" stroke-dasharray="1 7.5" stroke-linecap="round" opacity="0.85"/>
        <circle cx="325" cy="325" r="238" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="2.2" filter="url(#mgate-glow)"/>
        <circle cx="325" cy="325" r="232" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="0.8" opacity="0.6"/>

        <g fill="none" stroke="url(#mgate-gold-grad)" stroke-width="1.3" opacity="0.58">
          <path d="M 435 115 C 460 155, 500 175, 540 170"/>
          <path d="M 465 135 C 485 165, 515 180, 550 185"/>
          <path d="M 505 185 C 475 215, 495 265, 560 265"/>
          <path d="M 520 210 C 500 235, 515 265, 562 280"/>
          <path d="M 110 420 C 155 430, 185 465, 195 520"/>
          <path d="M 135 465 C 165 470, 180 495, 180 515"/>
        </g>

        <g stroke="url(#mgate-gold-grad)" fill="none" stroke-width="2">
          <path d="M 245 96 C 285 95, 310 80, 325 65 C 340 80, 365 95, 405 96"/>
          <path d="M 285 92 C 305 92, 318 82, 325 73 C 332 82, 345 92, 365 92" stroke-width="1.2"/>
          <rect x="319" y="54" width="12" height="12" transform="rotate(45 325 60)" fill="none" stroke-width="2"/>
        </g>
        <g stroke="url(#mgate-gold-grad)" fill="none" stroke-width="2">
          <path d="M 235 550 C 285 548, 310 565, 325 582 C 340 565, 365 548, 415 550"/>
          <path d="M 275 555 C 305 552, 318 565, 325 574 C 332 565, 345 552, 375 555" stroke-width="1.2"/>
          <rect x="320" y="576" width="10" height="10" transform="rotate(45 325 581)" fill="#e6c165"/>
          <circle cx="297" cy="574" r="2.5" fill="#e6c165"/>
          <circle cx="353" cy="574" r="2.5" fill="#e6c165"/>
        </g>

        <circle cx="325" cy="325" r="158" fill="url(#mgate-night-sky)"/>
        <g clip-path="url(#mgate-inner-clip)">
          <circle cx="410" cy="380" r="85" fill="#a1bce6" opacity="0.35" filter="url(#mgate-glow)"/>
          <g fill="none" stroke="url(#mgate-gold-grad)" stroke-width="2.2" opacity="0.85">
            <path d="M 165 310 C 170 250, 200 205, 250 170"/>
            <path d="M 175 290 C 185 245, 205 225, 225 180" stroke-width="3"/>
            <path d="M 192 275 C 205 240, 225 220, 265 168" stroke-width="1.5"/>
            <path d="M 172 280 Q 190 250 198 215 Q 178 245 172 280 Z" fill="url(#mgate-gold-grad)"/>
            <path d="M 205 240 Q 225 215 245 180 Q 218 205 205 240 Z" fill="url(#mgate-gold-grad)"/>
          </g>
          <g fill="none" stroke="url(#mgate-gold-grad)" stroke-width="1.2" opacity="0.65">
            <path d="M 415 190 C 465 245, 485 330, 445 425"/>
            <path d="M 435 215 C 475 270, 485 345, 430 445"/>
            <path d="M 455 245 C 485 300, 480 370, 400 465"/>
            <path d="M 380 465 C 425 455, 455 425, 470 385" stroke-width="2.5"/>
          </g>
          <g>
            <path d="M 185 420 C 165 370, 175 315, 202 288 C 214 275, 232 273, 244 282 C 250 287, 254 294, 248 298 C 242 296, 236 297, 232 303 C 226 312, 235 330, 252 350 C 280 382, 325 415, 435 450 L 395 485 C 300 475, 220 450, 185 420 Z" fill="url(#mgate-bird-grad)" stroke="url(#mgate-gold-grad)" stroke-width="2.2"/>
            <path d="M 218 286 C 226 284, 234 286, 239 291" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="1.5"/>
            <circle cx="228" cy="289" r="2" fill="#fff6d1"/>
            <path d="M 202 315 C 218 302, 235 320, 222 345 C 208 370, 188 375, 175 355" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="1.8" opacity="0.85"/>
            <path d="M 195 368 C 225 385, 255 415, 315 445" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="1.8" opacity="0.8"/>
            <path d="M 215 355 C 245 380, 275 405, 345 438" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="1.2" opacity="0.6"/>
          </g>
        </g>

        <circle cx="325" cy="325" r="158" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="4.5" filter="url(#mgate-glow)"/>
        <circle cx="325" cy="325" r="152" fill="none" stroke="url(#mgate-gold-grad)" stroke-width="1" opacity="0.6"/>
      </svg>

      <canvas class="mgate-canvas" id="mgate-stardust-canvas"></canvas>

      <svg class="mgate-svg-layer mgate-svg-text" viewBox="0 0 650 650" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mgate-text-gold" x1="0%" y1="0%" x2="100%" y2="80%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="25%" stop-color="#fef4c9"/>
            <stop offset="55%" stop-color="#edd07b" id="mgate-gold-shimmer-stop"/>
            <stop offset="80%" stop-color="#fffdf0"/>
            <stop offset="100%" stop-color="#cfa33e"/>
          </linearGradient>
        </defs>
        <text x="325" y="198" font-size="138" class="mgate-calligraphy" style="font-family: 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif !important; font-weight: 900 !important;">代</text>
        <text x="325" y="355" font-size="132" class="mgate-calligraphy" style="font-family: 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif !important; font-weight: 900 !important;">號</text>
        <text x="325" y="518" font-size="135" class="mgate-calligraphy" style="font-family: 'Noto Serif TC', 'Songti TC', 'PMingLiU', serif !important; font-weight: 900 !important;">鳶</text>
        <path d="M 382 486 C 398 515, 370 555, 320 635 C 355 570, 382 528, 372 492 Z" fill="url(#mgate-text-gold)" filter="url(#mgate-glow)"/>
        <path d="M 265 568 C 295 572, 345 555, 378 518" fill="none" stroke="url(#mgate-text-gold)" stroke-width="3" stroke-linecap="round" filter="url(#mgate-glow)"/>
      </svg>

      <div class="mgate-flares" id="mgate-flares"></div>
    </div>
  </div>

  <div class="mgate-bottom-dock">
    <button type="button" class="mgate-enter-banner" id="mgate-enter-btn" aria-label="进入世界">
      <div class="mgate-amber-mist"></div>
      <svg class="mgate-banner-svg" viewBox="0 0 680 160" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mgate-start-text-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="25%" stop-color="#faecc4"/>
            <stop offset="65%" stop-color="#e2be6b"/>
            <stop offset="88%" stop-color="#fff6d6"/>
            <stop offset="100%" stop-color="#ffffff"/>
          </linearGradient>
          <linearGradient id="mgate-line-left" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#d8b35c" stop-opacity="0.1"/>
            <stop offset="100%" stop-color="#f5dc96" stop-opacity="0.95"/>
          </linearGradient>
          <linearGradient id="mgate-line-right" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f5dc96" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#d8b35c" stop-opacity="0.1"/>
          </linearGradient>
          <radialGradient id="mgate-white-flare" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
            <stop offset="35%" stop-color="#fff5d6" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#ffe49e" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="mgate-kite-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="40%" stop-color="#fff0b5"/>
            <stop offset="100%" stop-color="#cfa03c"/>
          </linearGradient>
        </defs>

        <path d="M 140 52 Q 340 42 540 54" fill="none" stroke="#fff2c6" stroke-width="0.8" opacity="0.45"/>
        <path d="M 170 48 Q 360 54 510 47" fill="none" stroke="#ffe49c" stroke-width="0.5" opacity="0.35"/>
        <path d="M 130 116 Q 340 122 550 114" fill="none" stroke="#fff2c6" stroke-width="0.9" opacity="0.45"/>
        <path d="M 180 120 Q 330 113 490 121" fill="none" stroke="#ffe49c" stroke-width="0.5" opacity="0.3"/>

        <g transform="translate(0, 82)">
          <line x1="0" y1="0" x2="132" y2="0" stroke="url(#mgate-line-left)" stroke-width="1.5"/>
          <circle cx="135" cy="0" r="2.8" fill="none" stroke="#e8c674" stroke-width="1.2"/>
          <polygon points="149,-11 160,0 149,11 138,0" fill="none" stroke="#f5dc96" stroke-width="1.3"/>
          <polygon points="149,-5 154,0 149,5 144,0" fill="#ffeeb8"/>
          <circle cx="170" cy="0" r="2" fill="#f5dc96"/>
        </g>

        <g transform="translate(0, 82)">
          <circle cx="510" cy="0" r="2" fill="#f5dc96"/>
          <polygon points="531,-11 542,0 531,11 520,0" fill="none" stroke="#f5dc96" stroke-width="1.3"/>
          <polygon points="531,-5 536,0 531,5 526,0" fill="#ffeeb8"/>
          <circle cx="545" cy="0" r="2.8" fill="none" stroke="#e8c674" stroke-width="1.2"/>
          <line x1="548" y1="0" x2="680" y2="0" stroke="url(#mgate-line-right)" stroke-width="1.5"/>
        </g>

        <text x="345" y="104" class="mgate-start-text" style="font-family: 'Noto Serif SC', 'Noto Serif TC', 'Songti SC', serif !important; font-weight: 600 !important;">进入世界</text>

        <circle cx="182" cy="54" r="16" fill="url(#mgate-white-flare)"/>
        <circle cx="182" cy="54" r="3" fill="#ffffff"/>

        <g class="mgate-golden-kite" transform="translate(465, 18) scale(0.9)">
          <path d="M 18 28 C 20 14, 27 5, 31 0 C 31 11, 27 21, 23 27 Z" fill="#e5be62" opacity="0.9"/>
          <path d="M 6 30 C 10 26, 15 26, 20 27 C 30 20, 44 15, 56 14 C 46 22, 35 29, 26 32 C 33 37, 41 41, 49 42 C 37 42, 25 38, 17 33 C 13 32, 9 32, 6 30 Z" fill="url(#mgate-kite-gold)"/>
          <circle cx="10" cy="29" r="2.2" fill="#fffdf0"/>
        </g>

        <circle cx="136" cy="108" r="3" fill="#ffe082" opacity="0.9"/>
        <circle cx="294" cy="116" r="1.8" fill="#ffe89e" opacity="0.85"/>
        <circle cx="408" cy="58" r="2" fill="#fff6d1" opacity="0.9"/>
        <circle cx="500" cy="96" r="2.2" fill="#fff6d1" opacity="0.9"/>
        <circle cx="518" cy="12" r="2.5" fill="#ffd970" opacity="0.85"/>
      </svg>
    </button>

    <div class="mgate-notice-bar" id="mgate-notice-card">
      <label class="mgate-agree-row">
        <input type="checkbox" id="mgate-agree-checkbox" />
        <span>
          我已阅读并同意
          <button type="button" class="mgate-link-btn" id="mgate-open-disclaimer">《鸢小手机使用须知与免责声明》</button>
        </span>
      </label>
    </div>
    <div class="mgate-warn-tip" id="mgate-warn-tip"></div>
  </div>
</div>

<div class="mgate-modal-mask" id="mgate-modal-mask" role="dialog" aria-modal="true">
  <div class="mgate-modal-box">
    <div class="mgate-modal-head">
      <div class="mgate-modal-title">鸢小手机使用须知与免责声明</div>
      <button type="button" class="mgate-modal-close" id="mgate-modal-close" aria-label="关闭">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="mgate-modal-body">${sectionsHtml}</div>
    <div class="mgate-modal-foot">
      <button type="button" class="mgate-modal-btn-sub" id="mgate-modal-cancel">稍后再看</button>
      <button type="button" class="mgate-modal-btn-ok" id="mgate-modal-agree">我已了解并同意</button>
    </div>
  </div>
</div>
`;
  }

  function createGlowSprite(colorHex) {
    const sCanvas = document.createElement("canvas");
    sCanvas.width = 32;
    sCanvas.height = 32;
    const sCtx = sCanvas.getContext("2d");
    const grad = sCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.25, colorHex);
    grad.addColorStop(0.6, colorHex + "66");
    grad.addColorStop(1, "transparent");
    sCtx.fillStyle = grad;
    sCtx.beginPath();
    sCtx.arc(16, 16, 16, 0, Math.PI * 2);
    sCtx.fill();
    return sCanvas;
  }

  function mountEntryGate() {
    if (typeof document === "undefined" || !document.body) return;
    if (document.getElementById(GATE_ID)) return;

    // 注入隔离样式
    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.textContent = buildStyles();
      document.head.appendChild(styleEl);
    }

    const root = document.createElement("div");
    root.id = GATE_ID;
    root.innerHTML = buildGateHtml();
    document.body.appendChild(root);

    // 触发入场模糊缓动（从 blur(18px) 柔和聚焦清透浮现）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.add("mgate-visible");
      });
    });

    const stageWrap = root.querySelector("#mgate-stage-wrap");
    const stage = root.querySelector("#mgate-logo-stage");
    const bgScene = root.querySelector("#mgate-bg-scene");
    const shimmerStop = root.querySelector("#mgate-gold-shimmer-stop");
    const flaresOverlay = root.querySelector("#mgate-flares");
    const canvas = root.querySelector("#mgate-stardust-canvas");
    const enterBtn = root.querySelector("#mgate-enter-btn");
    const agreeCheckbox = root.querySelector("#mgate-agree-checkbox");
    const noticeCard = root.querySelector("#mgate-notice-card");
    const warnTip = root.querySelector("#mgate-warn-tip");
    const openDisclaimerBtn = root.querySelector("#mgate-open-disclaimer");
    const modalMask = root.querySelector("#mgate-modal-mask");
    const modalClose = root.querySelector("#mgate-modal-close");
    const modalCancel = root.querySelector("#mgate-modal-cancel");
    const modalAgree = root.querySelector("#mgate-modal-agree");

    // 响应式等比缩放 650×650 舞台（放大至铺满屏宽的大占比，且内部 SVG/毛玻璃/星尘/耀斑 100% 严丝合缝对齐）
    let currentScale = 0.72;
    function updateStageScale() {
      const vw = global.innerWidth || 390;
      const vh = global.innerHeight || 844;
      // 图标有效直径约为 500px（在 650px 画布内），按视口宽度 116% 与可用高度 76% 取较小值，还原大图大气占比
      const scaleByW = (vw * 1.16) / 650;
      const scaleByH = (vh * 0.76) / 650;
      currentScale = Math.max(0.54, Math.min(0.96, scaleByW, scaleByH));
      stage.style.transform = `scale(${currentScale})`;
    }
    updateStageScale();

    // 挂载 7 枚 mix-blend-mode: screen 星芒耀斑
    const flareElements = FLARE_CONFIGS.map((cfg, idx) => {
      const node = document.createElement("div");
      node.className = "mgate-flare-node";
      node.style.left = `${cfg.x}px`;
      node.style.top = `${cfg.y}px`;
      node.style.setProperty("--dur", cfg.dur);
      node.style.setProperty("--delay", cfg.delay);
      node.innerHTML = `
        <svg class="mgate-flare-inner" viewBox="-45 -45 90 90" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="mgate-f-grad-${idx}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
              <stop offset="18%" stop-color="#fff2d6" stop-opacity="0.95"/>
              <stop offset="45%" stop-color="#ff8833" stop-opacity="0.55"/>
              <stop offset="75%" stop-color="#ff5500" stop-opacity="0.15"/>
              <stop offset="100%" stop-color="#ff5500" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="0" cy="0" r="36" fill="url(#mgate-f-grad-${idx})"/>
          <path d="M -42,0 Q 0,-2.2 42,0 Q 0,2.2 -42,0 Z" fill="#ffffff"/>
          <path d="M 0,-42 Q -2.2,0 0,42 Q 2.2,0 0,-42 Z" fill="#ffffff"/>
          <path d="M -18,-18 Q 0,-1 18,18 Q 0,1 -18,-18 Z" fill="#ffe8c2" opacity="0.8"/>
          <path d="M 18,-18 Q 1,0 -18,18 Q -1,0 18,-18 Z" fill="#ffe8c2" opacity="0.8"/>
          <circle cx="0" cy="0" r="4.5" fill="#ffffff"/>
        </svg>`;
      flaresOverlay.appendChild(node);
      return { el: node, cfg };
    });

    // Canvas 高性能金色星尘粒子系统（手机端自动收敛粒子数防发烫）
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const SIZE = 650;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    const CENTER = { x: 325, y: 325 };
    const sprites = {
      brightGold: createGlowSprite("#fff3c4"),
      richGold: createGlowSprite("#e6b84e"),
      amberGold: createGlowSprite("#d4922a"),
      starBlue: createGlowSprite("#a8c8ff"),
      pureWhite: createGlowSprite("#ffffff")
    };
    const outerSpriteKeys = ["brightGold", "richGold", "amberGold", "pureWhite"];

    const isMobile = (global.innerWidth || 800) < 600;
    const ORBIT_COUNT = isMobile ? 220 : 320;
    const orbitalParticles = [];

    for (let i = 0; i < ORBIT_COUNT; i++) {
      const cluster = Math.random();
      let angleDeg;
      if (cluster < 0.48) angleDeg = 120 + Math.random() * 135;
      else if (cluster < 0.88) angleDeg = -60 + Math.random() * 125;
      else angleDeg = Math.random() * 360;

      const baseRadius = 161 + Math.random() * 74;
      const isBokeh = Math.random() < 0.12;
      orbitalParticles.push({
        angle: (angleDeg * Math.PI) / 180,
        baseR: baseRadius,
        angularSpeed: (0.0008 + Math.random() * 0.0014) * (200 / baseRadius),
        waveAmp: 1.5 + Math.random() * 4.5,
        waveFreq: 1 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.015 + Math.random() * 0.035,
        size: isBokeh ? 5 + Math.random() * 7 : 1.5 + Math.random() * 3.8,
        baseAlpha: isBokeh ? 0.35 + Math.random() * 0.4 : 0.4 + Math.random() * 0.6,
        sprite: sprites[outerSpriteKeys[Math.floor(Math.random() * outerSpriteKeys.length)]],
        offsetX: 0,
        offsetY: 0
      });
    }

    const innerParticles = [];
    const INNER_COUNT = isMobile ? 60 : 85;
    for (let i = 0; i < INNER_COUNT; i++) {
      const isBirdArea = Math.random() < 0.75;
      const angleDeg = isBirdArea ? 125 + Math.random() * 95 : Math.random() * 360;
      const radius = isBirdArea ? 75 + Math.random() * 75 : 30 + Math.random() * 120;
      const keys = ["brightGold", "pureWhite", "starBlue"];
      innerParticles.push({
        angle: (angleDeg * Math.PI) / 180,
        baseR: radius,
        angularSpeed: 0.0004 + Math.random() * 0.0006,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.04,
        size: 1.5 + Math.random() * 3.5,
        baseAlpha: 0.45 + Math.random() * 0.55,
        sprite: sprites[keys[Math.floor(Math.random() * keys.length)]]
      });
    }

    // 修复原文件严格模式笔误：const trailParticles = []
    const trailParticles = [];
    function spawnTrailParticle(x, y) {
      if (trailParticles.length > 64) return;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 1.2;
      trailParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.4,
        size: 2 + Math.random() * 4.5,
        alpha: 0.95,
        decay: 0.012 + Math.random() * 0.015,
        sprite: sprites[Math.random() > 0.3 ? "brightGold" : "pureWhite"]
      });
    }

    const pointer = { x: 325, y: 325, normX: 0, normY: 0, active: false };

    function handlePointer(clientX, clientY) {
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0) return;
      pointer.x = ((clientX - rect.left) / rect.width) * 650;
      pointer.y = ((clientY - rect.top) / rect.height) * 650;
      pointer.active = true;
      pointer.normX = (clientX / (global.innerWidth || 1) - 0.5) * 2;
      pointer.normY = (clientY / (global.innerHeight || 1) - 0.5) * 2;

      bgScene.style.transform = `translate3d(${-pointer.normX * 22}px, ${-pointer.normY * 22}px, 0)`;
      stage.style.transform = `scale(${currentScale}) rotateY(${pointer.normX * 6}deg) rotateX(${-pointer.normY * 6}deg)`;

      const shimmerOffset = 35 + (pointer.normX + pointer.normY) * 20;
      shimmerStop.setAttribute("offset", `${Math.max(15, Math.min(85, shimmerOffset))}%`);

      const distFromCenter = Math.hypot(pointer.x - CENTER.x, pointer.y - CENTER.y);
      if (distFromCenter < 248 && Math.random() > 0.25) {
        spawnTrailParticle(pointer.x, pointer.y);
      }
    }

    const onMouseMove = (e) => handlePointer(e.clientX, e.clientY);
    const onTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        handlePointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    global.addEventListener("mousemove", onMouseMove, { passive: true });
    global.addEventListener("touchstart", onTouchMove, { passive: true });
    global.addEventListener("touchmove", onTouchMove, { passive: true });
    global.addEventListener("resize", updateStageScale, { passive: true });

    let time = 0;
    let rafId = 0;
    let destroyed = false;

    function animate() {
      if (destroyed) return;
      time += 1;
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < orbitalParticles.length; i++) {
        const p = orbitalParticles[i];
        p.angle += p.angularSpeed;
        p.phase += p.twinkleSpeed;
        const currentR = p.baseR + Math.sin(p.angle * p.waveFreq + time * 0.015) * p.waveAmp;
        const targetX = CENTER.x + currentR * Math.cos(p.angle);
        const targetY = CENTER.y + currentR * Math.sin(p.angle);

        if (pointer.active) {
          const dx = targetX - pointer.x;
          const dy = targetY - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 75) {
            const force = (1 - dist / 75) * 14;
            p.offsetX += ((dx / (dist || 1)) * force - p.offsetX) * 0.15;
            p.offsetY += ((dy / (dist || 1)) * force - p.offsetY) * 0.15;
          } else {
            p.offsetX *= 0.92;
            p.offsetY *= 0.92;
          }
        }

        const alpha = p.baseAlpha * (0.55 + 0.45 * Math.sin(p.phase));
        ctx.globalAlpha = alpha;
        ctx.drawImage(p.sprite, targetX + p.offsetX - p.size, targetY + p.offsetY - p.size, p.size * 2, p.size * 2);
      }

      for (let i = 0; i < innerParticles.length; i++) {
        const p = innerParticles[i];
        p.angle -= p.angularSpeed * 0.5;
        p.phase += p.twinkleSpeed;
        const x = CENTER.x + p.baseR * Math.cos(p.angle);
        const y = CENTER.y + p.baseR * Math.sin(p.angle);
        ctx.globalAlpha = p.baseAlpha * (0.4 + 0.6 * Math.sin(p.phase));
        ctx.drawImage(p.sprite, x - p.size, y - p.size, p.size * 2, p.size * 2);
      }

      for (let i = trailParticles.length - 1; i >= 0; i--) {
        const tp = trailParticles[i];
        tp.x += tp.vx;
        tp.y += tp.vy;
        tp.alpha -= tp.decay;
        if (tp.alpha <= 0) {
          trailParticles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = tp.alpha;
        ctx.drawImage(tp.sprite, tp.x - tp.size, tp.y - tp.size, tp.size * 2, tp.size * 2);
      }

      for (let i = 0; i < flareElements.length; i++) {
        const { el, cfg } = flareElements[i];
        const dist = Math.hypot(pointer.x - cfg.x, pointer.y - cfg.y);
        const proximityBoost = Math.max(0, 1 - dist / 180) * 0.55;
        const currentScaleFlare = cfg.scale + proximityBoost;
        const shiftX = pointer.normX * 4 * cfg.depth;
        const shiftY = pointer.normY * 4 * cfg.depth;
        const rot = pointer.normX * 15 * cfg.depth;
        el.style.transform = `translate3d(${shiftX}px, ${shiftY}px, 0) scale(${currentScaleFlare}) rotate(${rot}deg)`;
      }

      rafId = requestAnimationFrame(animate);
    }
    rafId = requestAnimationFrame(animate);

    // 独立 IndexedDB 记忆知情同意状态（零 localStorage 写入，勾选一次后下次默认同意）
    const CONSENT_DB = "milvus_entry_gate_idb";
    const CONSENT_STORE = "consent";
    const CONSENT_KEY = "disclaimer_agreed_v1";

    function openConsentDB() {
      return new Promise((resolve) => {
        if (typeof indexedDB === "undefined" || !indexedDB) return resolve(null);
        try {
          const req = indexedDB.open(CONSENT_DB, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(CONSENT_STORE)) {
              db.createObjectStore(CONSENT_STORE);
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    }

    async function readSavedConsent() {
      const db = await openConsentDB();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(CONSENT_STORE, "readonly");
          const req = tx.objectStore(CONSENT_STORE).get(CONSENT_KEY);
          req.onsuccess = () => {
            try { db.close(); } catch (_) {}
            resolve(!!req.result);
          };
          req.onerror = () => {
            try { db.close(); } catch (_) {}
            resolve(false);
          };
        } catch (_) {
          try { db.close(); } catch (_) {}
          resolve(false);
        }
      });
    }

    async function writeSavedConsent(agreed) {
      const db = await openConsentDB();
      if (!db) return;
      try {
        const tx = db.transaction(CONSENT_STORE, "readwrite");
        tx.objectStore(CONSENT_STORE).put(!!agreed, CONSENT_KEY);
        tx.oncomplete = () => { try { db.close(); } catch (_) {} };
        tx.onerror = () => { try { db.close(); } catch (_) {} };
      } catch (_) {
        try { db.close(); } catch (_) {}
      }
    }

    // 勾选状态同步按钮外观
    function syncAgreeUI() {
      const ok = !!agreeCheckbox.checked;
      enterBtn.classList.toggle("mgate-ready", ok);
      if (ok) {
        warnTip.textContent = "";
        noticeCard.classList.remove("mgate-highlight");
      }
    }
    agreeCheckbox.addEventListener("change", () => {
      syncAgreeUI();
      writeSavedConsent(!!agreeCheckbox.checked);
    });

    // 启动时读取历史同意状态，勾选过一次即默认同意
    readSavedConsent().then((wasAgreed) => {
      if (wasAgreed && !destroyed) {
        agreeCheckbox.checked = true;
        syncAgreeUI();
      }
    });

    // 完整声明弹窗控制
    function openModal() {
      modalMask.classList.add("mgate-modal-open");
    }
    function closeModal() {
      modalMask.classList.remove("mgate-modal-open");
    }
    openDisclaimerBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
    modalClose.addEventListener("click", closeModal);
    modalCancel.addEventListener("click", closeModal);
    modalMask.addEventListener("click", (e) => {
      if (e.target === modalMask) closeModal();
    });
    modalAgree.addEventListener("click", () => {
      agreeCheckbox.checked = true;
      syncAgreeUI();
      writeSavedConsent(true);
      closeModal();
    });

    // 彻底销毁资源并通知主程序已进入世界
    function destroyAndEnter() {
      if (destroyed) return;
      root.classList.add("mgate-leaving");
      setTimeout(() => {
        destroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        global.removeEventListener("mousemove", onMouseMove);
        global.removeEventListener("touchstart", onTouchMove);
        global.removeEventListener("touchmove", onTouchMove);
        global.removeEventListener("resize", updateStageScale);
        try {
          canvas.width = 0;
          canvas.height = 0;
        } catch (_) {}
        if (root.parentNode) root.parentNode.removeChild(root);
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        global.__MILVUS_ENTRY_GATE_ACTIVE__ = false;
        try {
          global.dispatchEvent(new CustomEvent("milvus-entry-gate-entered"));
        } catch (_) {}
      }, 690);
    }

    // 点击「进入世界」门禁校验
    enterBtn.addEventListener("click", () => {
      if (!agreeCheckbox.checked) {
        warnTip.textContent = "请先阅读并勾选同意上方《使用须知与免责声明》";
        noticeCard.classList.add("mgate-highlight");
        enterBtn.classList.remove("mgate-shake");
        void enterBtn.offsetWidth;
        enterBtn.classList.add("mgate-shake");
        return;
      }
      writeSavedConsent(true);
      destroyAndEnter();
    });
  }

  if (typeof document !== "undefined") {
    if (document.body) {
      mountEntryGate();
    } else {
      document.addEventListener("DOMContentLoaded", mountEntryGate, { once: true });
    }
  }

  global.MilvusEntryGate = {
    GATE_ID,
    DISCLAIMER_SECTIONS,
    mountEntryGate
  };
})(window);

