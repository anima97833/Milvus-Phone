/**
 * Milvus/app_custom_css.js
 * 独立模块：设置 -> 进阶配置 -> 「应用自定义」极简中心 + 传讯页面整体风格自定义 CSS 引擎
 *
 * 架构特性：
 * - 零 localStorage 键：全部配置与预设存入独立 IndexedDB (milvus_app_custom_css_idb)
 * - 零 Emoji：全量手绘细线矢量 SVG
 * - 可扩展注册表 (APP_REGISTRY)：首期上架「传讯页面」，后续扩展其他应用无需改动 app.min.js
 * - 4 套与主屏图标/主屏背景 1:1 同源的质感与动效预设（厚倒角折射玻璃 / 清透水光玻璃 / 软绵绵糖果毛绒 / 暗夜舞台聚光灯）
 * - 自动处理 4 大工程难点：列表左滑菜单防透底、单角色气泡 CSS 优先级协同、伪元素光影不拦截操作、被动触控聚光灯划过桥接
 */
(function () {
  if (window.__MILVUS_APP_CUSTOM_CSS_LOADED__) return;
  window.__MILVUS_APP_CUSTOM_CSS_LOADED__ = true;

  const DB_NAME = "milvus_app_custom_css_idb";
  const DB_VERSION = 1;
  const STORE_NAME = "app_css_state";
  const CHAT_STYLE_TAG_ID = "milvus-app-chat-custom-css";
  const FLUFFY_SVG_ID = "milvus-chat-fluffy-svg-defs";

  // ===================== 默认基准模板（供一键复制） =====================
  const CHAT_DEFAULT_TEMPLATE = `/* 传讯页面全局自定义 CSS 基准模板
 * 支持直观语义选择器（自动作用域隔离，不影响其他应用）：
 *   .chat-app          传讯整体底板（含 ::before / ::after 动态光影层）
 *   .chat-list-header  传讯列表顶部栏（传讯 / 朋友圈）
 *   .chat-list-panel   传讯列表主卡片容器
 *   .chat-list-item    单条会话行（建议保持 >=0.92 不透明度，防止遮挡不住背后左滑按钮）
 *   .chat-room-header  聊天详情页顶栏
 *   .chat-room-body    聊天消息滚动区
 *   .bubble-me         我方消息气泡
 *   .bubble-them       对方消息气泡
 *   .chat-toolbar      聊天快捷工具栏
 *   .chat-input        聊天底部输入栏容器
 *   .chat-input-box    聊天文本输入框本体
 * 也兼容直接粘贴 .chat-header / .msg-bubble.me / .msg-bubble.them 等原生传讯选择器
 */

.chat-app {
  background: linear-gradient(155deg, #f3f6fb 0%, #eef2f7 100%) !important;
}

.chat-list-header,
.chat-room-header {
  background: rgba(255, 255, 255, 0.76) !important;
  backdrop-filter: blur(18px) saturate(145%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(145%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.72) !important;
}

.chat-list-panel {
  background: rgba(252, 253, 255, 0.94) !important;
}

.chat-list-item {
  background: rgba(255, 255, 255, 0.95) !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14) !important;
}

.bubble-me {
  background: linear-gradient(135deg, rgba(226, 238, 255, 0.94), rgba(208, 226, 255, 0.9)) !important;
  color: #1f2937 !important;
  border: 1px solid rgba(255, 255, 255, 0.85) !important;
  border-radius: 18px 18px 6px 18px !important;
  box-shadow: 0 6px 16px rgba(96, 125, 170, 0.14) !important;
}

.bubble-them {
  background: rgba(255, 255, 255, 0.94) !important;
  color: #1f2937 !important;
  border: 1px solid rgba(226, 232, 240, 0.85) !important;
  border-radius: 18px 18px 18px 6px !important;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06) !important;
}

.chat-input {
  background: rgba(255, 255, 255, 0.82) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
}

.chat-input-box {
  background: rgba(255, 255, 255, 0.92) !important;
  border: 1px solid rgba(203, 213, 225, 0.75) !important;
  border-radius: 18px !important;
}`;

  // ===================== 4 套同源内置预设 =====================
  const BUILTIN_CHAT_PRESETS = [
    {
      id: "preset_chat_thick_glass",
      name: "厚倒角折射玻璃",
      tagline: "极光柔雾 · 冰透倒角折射",
      swatch: "linear-gradient(135deg, #dce9ff 0%, #ede3ff 52%, #fff3f8 100%)",
      css: `/* === 内置预设：厚倒角折射玻璃（与主屏厚倒角玻璃图标/极光背景同源） === */
.chat-app {
  background: linear-gradient(155deg, #e5eefc 0%, #ede6fb 48%, #f8eef4 100%) !important;
}

.chat-app::before {
  content: "";
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(48% 42% at 18% 20%, rgba(164, 206, 255, 0.55) 0%, rgba(164, 206, 255, 0) 70%),
    radial-gradient(50% 44% at 84% 26%, rgba(212, 186, 255, 0.5) 0%, rgba(212, 186, 255, 0) 72%),
    radial-gradient(54% 46% at 50% 84%, rgba(255, 216, 234, 0.48) 0%, rgba(255, 216, 234, 0) 72%);
  animation: acAuroraDrift 14s ease-in-out infinite alternate;
}

.chat-app::after {
  content: "";
  position: absolute;
  inset: -40%;
  background: linear-gradient(
    125deg,
    rgba(255, 255, 255, 0) 36%,
    rgba(255, 255, 255, 0.34) 48%,
    rgba(255, 255, 255, 0.08) 54%,
    rgba(255, 255, 255, 0) 64%
  );
  animation: acGlassSweep 11s ease-in-out infinite;
}

.chat-list-header,
.chat-room-header {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(244, 247, 255, 0.56) 100%) !important;
  backdrop-filter: blur(22px) saturate(165%) !important;
  -webkit-backdrop-filter: blur(22px) saturate(165%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.85) !important;
  box-shadow:
    0 8px 24px rgba(105, 122, 168, 0.12),
    inset 0 1.5px 1px rgba(255, 255, 255, 0.92),
    inset 0 -1.5px 2px rgba(138, 154, 198, 0.16) !important;
  color: #2f364b !important;
}

.chat-list-panel {
  background: linear-gradient(180deg, rgba(250, 251, 255, 0.92) 0%, rgba(244, 246, 253, 0.95) 100%) !important;
  border-top: 1.5px solid rgba(255, 255, 255, 0.92) !important;
  box-shadow:
    0 -10px 28px rgba(109, 124, 168, 0.12),
    inset 0 2px 3px rgba(255, 255, 255, 0.9) !important;
}

.chat-list-item {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0%, rgba(246, 248, 255, 0.94) 100%) !important;
  border-bottom: 1px solid rgba(173, 188, 224, 0.22) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92) !important;
  transition: transform 0.24s ease, box-shadow 0.24s ease !important;
}

.chat-list-item:active {
  transform: scale(0.985) !important;
}

.bubble-me {
  position: relative;
  background: linear-gradient(140deg, rgba(215, 232, 255, 0.9) 0%, rgba(227, 214, 255, 0.86) 100%) !important;
  color: #262d42 !important;
  border: 1.5px solid rgba(255, 255, 255, 0.88) !important;
  border-radius: 20px 20px 7px 20px !important;
  backdrop-filter: blur(14px) saturate(160%) !important;
  -webkit-backdrop-filter: blur(14px) saturate(160%) !important;
  box-shadow:
    0 10px 22px rgba(102, 118, 175, 0.18),
    0 2px 6px rgba(102, 118, 175, 0.1),
    inset 0 2px 2px rgba(255, 255, 255, 0.92),
    inset 0 -2px 4px rgba(132, 146, 206, 0.25) !important;
}

.bubble-them {
  position: relative;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.88) 0%, rgba(244, 247, 255, 0.82) 100%) !important;
  color: #2b3245 !important;
  border: 1.5px solid rgba(255, 255, 255, 0.92) !important;
  border-radius: 20px 20px 20px 7px !important;
  backdrop-filter: blur(14px) saturate(155%) !important;
  -webkit-backdrop-filter: blur(14px) saturate(155%) !important;
  box-shadow:
    0 10px 22px rgba(96, 112, 152, 0.12),
    0 2px 5px rgba(96, 112, 152, 0.08),
    inset 0 2px 2px rgba(255, 255, 255, 0.96),
    inset 0 -2px 4px rgba(154, 168, 204, 0.2) !important;
}

.chat-toolbar {
  background: rgba(255, 255, 255, 0.54) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.78) !important;
}

.chat-input {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(243, 246, 255, 0.84) 100%) !important;
  backdrop-filter: blur(22px) saturate(165%) !important;
  -webkit-backdrop-filter: blur(22px) saturate(165%) !important;
  border-top: 1.5px solid rgba(255, 255, 255, 0.9) !important;
  box-shadow: inset 0 1.5px 2px rgba(255, 255, 255, 0.88) !important;
}

.chat-input-box {
  background: rgba(255, 255, 255, 0.86) !important;
  border: 1.5px solid rgba(255, 255, 255, 0.94) !important;
  border-radius: 18px !important;
  box-shadow:
    inset 0 2px 5px rgba(124, 140, 184, 0.16),
    0 2px 8px rgba(124, 140, 184, 0.1) !important;
  color: #262d42 !important;
}

@keyframes acAuroraDrift {
  0% { transform: translate3d(-2%, -2%, 0) scale(1); }
  100% { transform: translate3d(3%, 2.5%, 0) scale(1.06); }
}

@keyframes acGlassSweep {
  0% { transform: translate3d(-28%, -12%, 0); opacity: 0.35; }
  50% { transform: translate3d(18%, 8%, 0); opacity: 0.78; }
  100% { transform: translate3d(42%, 16%, 0); opacity: 0.25; }
}`
    },
    {
      id: "preset_chat_clear_water",
      name: "清透水光玻璃",
      tagline: "澄澈浅空 · 水波微光呼吸",
      swatch: "linear-gradient(135deg, #dff7ff 0%, #f1fbff 55%, #e3f3ff 100%)",
      css: `/* === 内置预设：清透水光玻璃（与主屏清透水光图标/水光波影背景同源） === */
.chat-app {
  background: linear-gradient(165deg, #e7f7ff 0%, #f4fbff 52%, #e4f3fc 100%) !important;
}

.chat-app::before {
  content: "";
  position: absolute;
  inset: -15%;
  background:
    radial-gradient(50% 38% at 24% 18%, rgba(132, 218, 255, 0.38) 0%, rgba(132, 218, 255, 0) 70%),
    radial-gradient(48% 42% at 78% 74%, rgba(164, 236, 245, 0.36) 0%, rgba(164, 236, 245, 0) 72%);
  animation: acWaterBreath 10s ease-in-out infinite alternate;
}

.chat-app::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(65% 32% at 50% 6%, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0) 75%);
  animation: acRippleGlow 7s ease-in-out infinite alternate;
}

.chat-list-header,
.chat-room-header {
  background: rgba(255, 255, 255, 0.52) !important;
  backdrop-filter: blur(18px) saturate(140%) !important;
  -webkit-backdrop-filter: blur(18px) saturate(140%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.85) !important;
  box-shadow: 0 4px 16px rgba(96, 172, 206, 0.1) !important;
  color: #1f4458 !important;
}

.chat-list-panel {
  background: rgba(248, 253, 255, 0.92) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.94) !important;
}

.chat-list-item {
  background: rgba(252, 254, 255, 0.95) !important;
  border-bottom: 1px solid rgba(145, 206, 232, 0.2) !important;
}

.bubble-me {
  background: linear-gradient(145deg, rgba(196, 238, 255, 0.78) 0%, rgba(218, 246, 255, 0.72) 100%) !important;
  color: #163b4e !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  border-radius: 20px 20px 6px 20px !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  box-shadow:
    0 6px 18px rgba(82, 166, 204, 0.14),
    inset 0 1.5px 2px rgba(255, 255, 255, 0.95) !important;
}

.bubble-them {
  background: rgba(255, 255, 255, 0.78) !important;
  color: #1f3c4c !important;
  border: 1px solid rgba(255, 255, 255, 0.94) !important;
  border-radius: 20px 20px 20px 6px !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  box-shadow:
    0 6px 16px rgba(96, 158, 188, 0.1),
    inset 0 1.5px 2px rgba(255, 255, 255, 0.96) !important;
}

.chat-toolbar {
  background: rgba(255, 255, 255, 0.42) !important;
  backdrop-filter: blur(14px) !important;
  -webkit-backdrop-filter: blur(14px) !important;
}

.chat-input {
  background: rgba(248, 253, 255, 0.72) !important;
  backdrop-filter: blur(18px) !important;
  -webkit-backdrop-filter: blur(18px) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.9) !important;
}

.chat-input-box {
  background: rgba(255, 255, 255, 0.88) !important;
  border: 1px solid rgba(164, 218, 240, 0.65) !important;
  border-radius: 20px !important;
  color: #163b4e !important;
}

@keyframes acWaterBreath {
  0% { transform: translate3d(-2%, 1%, 0) scale(1); opacity: 0.78; }
  100% { transform: translate3d(2.5%, -2%, 0) scale(1.07); opacity: 1; }
}

@keyframes acRippleGlow {
  0% { opacity: 0.5; transform: scaleX(0.96); }
  100% { opacity: 0.92; transform: scaleX(1.04); }
}`
    },
    {
      id: "preset_chat_fluffy_candy",
      name: "软绵绵糖果毛绒",
      tagline: "燕麦奶油 · 马卡龙蓬松绒边",
      swatch: "linear-gradient(135deg, #ffd1e0 0%, #ffe8b8 38%, #d7f3e3 72%, #d5e6ff 100%)",
      css: `/* === 内置预设：软绵绵糖果毛绒（与主屏 3D 毛绒绒图标/糖果云朵背景同源） === */
.chat-app {
  background: linear-gradient(160deg, #faf3ea 0%, #f7efe5 55%, #f5ece3 100%) !important;
}

.chat-app::before {
  content: "";
  position: absolute;
  inset: -12%;
  background:
    radial-gradient(36% 30% at 18% 18%, rgba(255, 178, 206, 0.44) 0%, rgba(255, 178, 206, 0) 70%),
    radial-gradient(34% 28% at 82% 24%, rgba(255, 218, 138, 0.42) 0%, rgba(255, 218, 138, 0) 70%),
    radial-gradient(38% 32% at 24% 80%, rgba(162, 228, 202, 0.42) 0%, rgba(162, 228, 202, 0) 72%),
    radial-gradient(36% 30% at 80% 78%, rgba(196, 182, 255, 0.42) 0%, rgba(196, 182, 255, 0) 72%);
  animation: acCandyCloudFloat 13s ease-in-out infinite alternate;
}

.chat-list-header,
.chat-room-header {
  background: rgba(255, 250, 244, 0.88) !important;
  backdrop-filter: blur(14px) !important;
  -webkit-backdrop-filter: blur(14px) !important;
  border-bottom: 1.5px dashed rgba(226, 194, 178, 0.6) !important;
  color: #5b4642 !important;
}

.chat-list-panel {
  background: #fdf9f4 !important;
  border-top: 2px solid rgba(255, 255, 255, 0.95) !important;
  box-shadow: 0 -8px 24px rgba(176, 140, 122, 0.1) !important;
}

.chat-list-item {
  background: #fffcf8 !important;
  border-bottom: 1px dashed rgba(224, 196, 182, 0.45) !important;
}

.bubble-me {
  position: relative;
  background: radial-gradient(circle at 28% 22%, #ffe0ec 0%, #ffb6d0 58%, #f395b8 100%) !important;
  color: #592639 !important;
  border: 2px solid rgba(255, 236, 243, 0.9) !important;
  border-radius: 22px 22px 8px 22px !important;
  box-shadow:
    0 8px 18px rgba(235, 134, 170, 0.28),
    inset 0 3px 6px rgba(255, 255, 255, 0.72),
    inset 0 -4px 8px rgba(206, 94, 136, 0.28) !important;
}

.bubble-me::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  border: 3px solid rgba(255, 192, 216, 0.65);
  filter: url(#milvus-chat-fluffy);
  pointer-events: none;
}

.bubble-them {
  position: relative;
  background: radial-gradient(circle at 28% 22%, #e6f6ff 0%, #c1e5ff 58%, #9fd2fa 100%) !important;
  color: #21425a !important;
  border: 2px solid rgba(238, 249, 255, 0.92) !important;
  border-radius: 22px 22px 22px 8px !important;
  box-shadow:
    0 8px 18px rgba(132, 188, 232, 0.26),
    inset 0 3px 6px rgba(255, 255, 255, 0.78),
    inset 0 -4px 8px rgba(102, 162, 214, 0.24) !important;
}

.bubble-them::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  border: 3px solid rgba(182, 222, 252, 0.68);
  filter: url(#milvus-chat-fluffy);
  pointer-events: none;
}

.chat-toolbar {
  background: rgba(255, 249, 242, 0.86) !important;
  border-top: 1px dashed rgba(226, 194, 178, 0.5) !important;
}

.chat-input {
  background: #fff9f2 !important;
  border-top: 1.5px solid rgba(242, 222, 208, 0.85) !important;
}

.chat-input-box {
  background: #ffffff !important;
  border: 1.5px solid rgba(238, 198, 210, 0.85) !important;
  border-radius: 22px !important;
  color: #5b4642 !important;
  box-shadow: inset 0 2px 5px rgba(214, 176, 162, 0.16) !important;
}

@keyframes acCandyCloudFloat {
  0% { transform: translate3d(-2%, 1.5%, 0) scale(1); }
  100% { transform: translate3d(2.5%, -2%, 0) scale(1.05); }
}`
    },
    {
      id: "preset_chat_dark_spotlight",
      name: "暗夜舞台聚光灯",
      tagline: "剧院暗幕 · 划过点亮丁达尔光束",
      swatch: "linear-gradient(180deg, #3c3d42 0%, #1d1e23 55%, #111216 100%)",
      css: `/* === 内置预设：暗夜舞台聚光灯（支持鼠标悬停与手机手指划过点亮气泡） === */
.chat-app {
  background: linear-gradient(180deg, #212228 0%, #16171c 56%, #101115 100%) !important;
  color: #e4e5ea !important;
}

.chat-app::before {
  content: "";
  position: absolute;
  top: 0;
  left: 16%;
  width: 56%;
  height: 78%;
  transform-origin: top center;
  clip-path: polygon(34% 0%, 66% 0%, 100% 100%, 0% 100%);
  -webkit-clip-path: polygon(34% 0%, 66% 0%, 100% 100%, 0% 100%);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.22) 0%,
    rgba(255, 255, 255, 0.08) 46%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: acSpotSwayLeft 9s ease-in-out infinite alternate;
}

.chat-app::after {
  content: "";
  position: absolute;
  top: 0;
  right: 10%;
  width: 52%;
  height: 74%;
  transform-origin: top center;
  clip-path: polygon(34% 0%, 66% 0%, 100% 100%, 0% 100%);
  -webkit-clip-path: polygon(34% 0%, 66% 0%, 100% 100%, 0% 100%);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0.06) 44%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: acSpotSwayRight 11s ease-in-out infinite alternate;
}

.chat-list-header,
.chat-room-header {
  background: rgba(34, 35, 41, 0.88) !important;
  backdrop-filter: blur(18px) !important;
  -webkit-backdrop-filter: blur(18px) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09) !important;
  color: #f3f4f6 !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.36) !important;
}

.chat-list-panel {
  background: #1a1b20 !important;
  border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: #e5e7eb !important;
}

.chat-list-item {
  background: #202127 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  color: #d4d6dc !important;
  transition: background-color 0.28s ease, box-shadow 0.28s ease !important;
}

.chat-list-item:hover,
.chat-list-item.ac-lit {
  background: #2b2d36 !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 0 18px rgba(255, 255, 255, 0.08) !important;
}

.bubble-me,
.bubble-them {
  position: relative;
  overflow: hidden;
  border-radius: 18px !important;
  transition: transform 0.28s ease, box-shadow 0.28s ease, background-color 0.28s ease, color 0.28s ease !important;
}

.bubble-me {
  background: #34353c !important;
  color: #d6d8df !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 18px 18px 6px 18px !important;
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.32),
    inset 0 1px 1px rgba(255, 255, 255, 0.14) !important;
}

.bubble-them {
  background: #26272d !important;
  color: #c8cad2 !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 18px 18px 18px 6px !important;
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.34),
    inset 0 1px 1px rgba(255, 255, 255, 0.09) !important;
}

.bubble-me::before,
.bubble-them::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  width: 52%;
  height: 3px;
  transform: translateX(-50%) scaleX(0.2);
  opacity: 0;
  border-radius: 0 0 6px 6px;
  background: #ffffff;
  box-shadow: 0 0 10px 2px rgba(255, 255, 255, 0.9), 0 2px 14px 3px rgba(255, 255, 255, 0.55);
  pointer-events: none;
  transition: transform 0.3s ease, opacity 0.24s ease;
}

.bubble-me:hover,
.bubble-me:active,
.bubble-me.ac-lit,
.bubble-them:hover,
.bubble-them:active,
.bubble-them.ac-lit {
  background: #42444d !important;
  color: #ffffff !important;
  transform: translateY(-1.5px) !important;
  box-shadow:
    0 12px 24px rgba(0, 0, 0, 0.42),
    inset 0 2px 8px rgba(255, 255, 255, 0.32) !important;
}

.bubble-me:hover::before,
.bubble-me:active::before,
.bubble-me.ac-lit::before,
.bubble-them:hover::before,
.bubble-them:active::before,
.bubble-them.ac-lit::before {
  transform: translateX(-50%) scaleX(1);
  opacity: 1;
}

.chat-toolbar {
  background: rgba(26, 27, 32, 0.88) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.chat-input {
  background: rgba(24, 25, 30, 0.94) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.chat-input-box {
  background: #2a2b32 !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  border-radius: 18px !important;
  color: #f3f4f6 !important;
}

@keyframes acSpotSwayLeft {
  0% { transform: rotate(-6deg); opacity: 0.72; }
  100% { transform: rotate(5deg); opacity: 1; }
}

@keyframes acSpotSwayRight {
  0% { transform: rotate(6deg); opacity: 0.65; }
  100% { transform: rotate(-4deg); opacity: 0.95; }
}`
    }
  ];

  // ===================== 分模块独立编辑配置与专属模板 =====================
  const CHAT_SECTION_TABS = [
    {
      id: "all",
      label: "整页总览",
      hint: "编写整套传讯 CSS，或直接点击上方内置预设",
      template: CHAT_DEFAULT_TEMPLATE
    },
    {
      id: "list",
      label: "传讯列表",
      hint: "独立美化列表顶栏、列表主卡片与单条会话行（建议保持 >=0.92 不透明度防透底）",
      template: `/* === 传讯列表独立 CSS === */
.chat-list-header {
  background: rgba(255, 255, 255, 0.82) !important;
  backdrop-filter: blur(18px) !important;
  -webkit-backdrop-filter: blur(18px) !important;
  color: #2f364b !important;
}

.chat-list-panel {
  background: rgba(252, 253, 255, 0.96) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.92) !important;
}

.chat-list-item {
  background: rgba(255, 255, 255, 0.96) !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16) !important;
  border-radius: 12px !important;
}`
    },
    {
      id: "header",
      label: "聊天顶栏",
      hint: "独立美化聊天室顶部导航栏、状态栏与操作按钮",
      template: `/* === 聊天顶栏独立 CSS === */
.chat-room-header {
  background: rgba(255, 255, 255, 0.78) !important;
  backdrop-filter: blur(20px) saturate(150%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(150%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.85) !important;
  color: #2c3142 !important;
}`
    },
    {
      id: "bubbles",
      label: "消息气泡",
      hint: "独立美化我方 (.bubble-me) 与对方 (.bubble-them) 消息气泡",
      template: `/* === 消息气泡独立 CSS === */
.bubble-me {
  background: linear-gradient(135deg, #dcebff, #e5dcff) !important;
  color: #262d42 !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  border-radius: 18px 18px 6px 18px !important;
  box-shadow: 0 6px 16px rgba(102, 118, 175, 0.16) !important;
}

.bubble-them {
  background: rgba(255, 255, 255, 0.92) !important;
  color: #2c3142 !important;
  border: 1px solid rgba(226, 232, 240, 0.85) !important;
  border-radius: 18px 18px 18px 6px !important;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08) !important;
}`
    },
    {
      id: "input",
      label: "工具与输入栏",
      hint: "独立美化快捷工具栏 (.chat-toolbar) 与底部输入栏 (.chat-input / .chat-input-box)",
      template: `/* === 工具栏与底部输入栏独立 CSS === */
.chat-toolbar {
  background: rgba(255, 255, 255, 0.65) !important;
  backdrop-filter: blur(14px) !important;
  -webkit-backdrop-filter: blur(14px) !important;
}

.chat-input {
  background: rgba(255, 255, 255, 0.86) !important;
  backdrop-filter: blur(18px) !important;
  -webkit-backdrop-filter: blur(18px) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.9) !important;
}

.chat-input-box {
  background: #ffffff !important;
  border: 1px solid rgba(196, 206, 224, 0.78) !important;
  border-radius: 18px !important;
  color: #2c3142 !important;
}`
    }
  ];

  // ===================== 可扩展应用注册表 =====================
  const APP_REGISTRY = [
    {
      id: "chat",
      name: "传讯页面",
      subtitle: "支持整页美化，或分模块独立编辑列表 / 顶栏 / 气泡 / 输入栏",
      presets: BUILTIN_CHAT_PRESETS,
      defaultTemplate: CHAT_DEFAULT_TEMPLATE
    }
  ];

  const EMPTY_SECTIONS = { list: "", header: "", bubbles: "", input: "" };

  const DEFAULT_APP_STATE = {
    enabled: false,
    activePresetId: "",
    customCss: "",
    sections: { ...EMPTY_SECTIONS },
    overridePerRole: false,
    customPresets: []
  };

  function normalizeSections(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      list: typeof src.list === "string" ? src.list : "",
      header: typeof src.header === "string" ? src.header : "",
      bubbles: typeof src.bubbles === "string" ? src.bubbles : "",
      input: typeof src.input === "string" ? src.input : ""
    };
  }

  function combineChatCss(state) {
    if (!state) return "";
    const parts = [];
    if (state.customCss && state.customCss.trim()) parts.push(state.customCss.trim());
    const sec = normalizeSections(state.sections);
    ["list", "header", "bubbles", "input"].forEach((k) => {
      if (sec[k] && sec[k].trim()) parts.push(sec[k].trim());
    });
    return parts.join("\n\n");
  }

  // ===================== IndexedDB 持久层 =====================
  function openDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadAppState(appId) {
    try {
      const db = await openDB();
      if (!db) return { ...DEFAULT_APP_STATE };
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(appId);
        req.onsuccess = () => {
          const val = req.result;
          if (val && typeof val === "object") {
            resolve({
              enabled: !!val.enabled,
              activePresetId: typeof val.activePresetId === "string" ? val.activePresetId : "",
              customCss: typeof val.customCss === "string" ? val.customCss : "",
              sections: normalizeSections(val.sections),
              overridePerRole: !!val.overridePerRole,
              customPresets: Array.isArray(val.customPresets) ? val.customPresets : []
            });
          } else {
            resolve({ ...DEFAULT_APP_STATE });
          }
        };
        req.onerror = () => resolve({ ...DEFAULT_APP_STATE });
      });
    } catch (_) {
      return { ...DEFAULT_APP_STATE };
    }
  }

  async function saveAppState(appId, state) {
    try {
      const db = await openDB();
      if (!db) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(
          {
            enabled: !!state.enabled,
            activePresetId: state.activePresetId || "",
            customCss: state.customCss || "",
            sections: normalizeSections(state.sections),
            overridePerRole: !!state.overridePerRole,
            customPresets: Array.isArray(state.customPresets) ? state.customPresets : []
          },
          appId
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {}
  }

  // ===================== 独立 SVG 柔绒滤镜注入 =====================
  function ensureFluffySvgFilter() {
    if (typeof document === "undefined" || !document.body) return;
    if (document.getElementById(FLUFFY_SVG_ID)) return;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("id", FLUFFY_SVG_ID);
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.style.width = "0";
    svg.style.height = "0";
    svg.style.pointerEvents = "none";
    svg.innerHTML =
      '<defs>' +
      '<filter id="milvus-chat-fluffy" x="-14%" y="-14%" width="128%" height="128%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.52" numOctaves="3" seed="11" result="noise"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="noise" scale="3.6" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter>' +
      '</defs>';
    document.body.appendChild(svg);
  }

  // ===================== CSS 安全清洗与作用域编译器 =====================
  function sanitizeRawCss(raw) {
    if (!raw || typeof raw !== "string") return "";
    return raw
      .replace(/<\/style/gi, "")
      .replace(/@import\b[^;]*;?/gi, "")
      .replace(/expression\s*\(/gi, "/*blocked*/(")
      .replace(/javascript\s*:/gi, "/*blocked*/:");
  }

  function mapSingleChatSelector(sel, overridePerRole) {
    const trimmed = sel.trim();
    if (!trimmed) return "";
    if (/^(from|to|\d+%)$/.test(trimmed)) return trimmed;

    const roomRoot = overridePerRole ? '.chat-detail-overlay[class*="chat-"]' : ".chat-detail-overlay";

    const semanticRules = [
      {
        re: /^\.chat-app(?=$|[\s:.\[>+~])/,
        targets: [".t8-overlay", "#app-root", roomRoot, ".ac-preview-stage"]
      },
      {
        re: /^\.chat-list-header(?=$|[\s:.\[>+~])/,
        targets: [".t8-overlay .t8-nav", "#app-root > header", ".ac-preview-stage .ac-pv-list-header"]
      },
      {
        re: /^\.chat-list-panel(?=$|[\s:.\[>+~])/,
        targets: ["#app-root > main", ".ac-preview-stage .ac-pv-list-panel"]
      },
      {
        re: /^\.chat-list-item(?=$|[\s:.\[>+~])/,
        targets: ["#app-root .chat-item", ".ac-preview-stage .ac-pv-list-item"]
      },
      {
        re: /^\.chat-room-header(?=$|[\s:.\[>+~])/,
        targets: [`${roomRoot} .chat-header`, ".ac-preview-stage .ac-pv-header"]
      },
      {
        re: /^\.chat-room-body(?=$|[\s:.\[>+~])/,
        targets: [`${roomRoot} .chat-scroll-area`, ".ac-preview-stage .ac-pv-body"]
      },
      {
        re: /^\.bubble-me(?=$|[\s:.\[>+~])/,
        targets: [`${roomRoot} .msg-bubble.me`, ".ac-preview-stage .ac-pv-bubble-me"]
      },
      {
        re: /^\.bubble-them(?=$|[\s:.\[>+~])/,
        targets: [`${roomRoot} .msg-bubble.them`, ".ac-preview-stage .ac-pv-bubble-them"]
      },
      {
        re: /^\.chat-toolbar(?=$|[\s:.\[>+~])/,
        targets: [`${roomRoot} .chat-toolbar`, `${roomRoot} .chat-action-bar`, ".ac-preview-stage .ac-pv-toolbar"]
      },
      {
        re: /^\.chat-input-box(?=$|[\s:.\[>+~])/,
        targets: [`${roomRoot} .chat-input-field`, ".ac-preview-stage .ac-pv-input-box"]
      },
      {
        re: /^\.chat-input(?=$|[\s:.\[>+~])/,
        targets: [`${roomRoot} .chat-input-bar`, `${roomRoot} .chat-input-container`, ".ac-preview-stage .ac-pv-input"]
      }
    ];

    for (let i = 0; i < semanticRules.length; i++) {
      const rule = semanticRules[i];
      if (rule.re.test(trimmed)) {
        const suffix = trimmed.replace(rule.re, "");
        return rule.targets.map((t) => `${t}${suffix}`).join(", ");
      }
    }

    // 兼容原生传讯类名（自动隔离到传讯作用域 + 预览台）
    if (/^\.msg-bubble\.me(?=$|[\s:.\[>+~])/.test(trimmed)) {
      const suffix = trimmed.replace(/^\.msg-bubble\.me/, "");
      return `${roomRoot} .msg-bubble.me${suffix}, .ac-preview-stage .ac-pv-bubble-me${suffix}`;
    }
    if (/^\.msg-bubble\.them(?=$|[\s:.\[>+~])/.test(trimmed)) {
      const suffix = trimmed.replace(/^\.msg-bubble\.them/, "");
      return `${roomRoot} .msg-bubble.them${suffix}, .ac-preview-stage .ac-pv-bubble-them${suffix}`;
    }
    if (/^\.chat-item(?=$|[\s:.\[>+~])/.test(trimmed)) {
      const suffix = trimmed.replace(/^\.chat-item/, "");
      return `#app-root .chat-item${suffix}, .ac-preview-stage .ac-pv-list-item${suffix}`;
    }
    if (/^\.chat-header(?=$|[\s:.\[>+~])/.test(trimmed)) {
      const suffix = trimmed.replace(/^\.chat-header/, "");
      return `${roomRoot} .chat-header${suffix}, .ac-preview-stage .ac-pv-header${suffix}`;
    }
    if (/^\.chat-input-field(?=$|[\s:.\[>+~])/.test(trimmed)) {
      const suffix = trimmed.replace(/^\.chat-input-field/, "");
      return `${roomRoot} .chat-input-field${suffix}, .ac-preview-stage .ac-pv-input-box${suffix}`;
    }
    if (/^\.chat-input-(bar|container)(?=$|[\s:.\[>+~])/.test(trimmed)) {
      const suffix = trimmed.replace(/^\.chat-input-(bar|container)/, "");
      return `${roomRoot} ${trimmed}, .ac-preview-stage .ac-pv-input${suffix}`;
    }
    if (/^(#app-root|\.t8-overlay|\.chat-detail-overlay|\.ac-preview-stage)\b/.test(trimmed)) {
      return trimmed;
    }

    return `${roomRoot} ${trimmed}, #app-root ${trimmed}, .ac-preview-stage ${trimmed}`;
  }

  function compileScopedCss(rawCss, options) {
    const clean = sanitizeRawCss(rawCss);
    if (!clean.trim()) return "";
    const overridePerRole = !!(options && options.overridePerRole);

    const safeBase = [
      ".t8-overlay, #app-root, .chat-detail-overlay, .ac-preview-stage { isolation: isolate; overflow: hidden; }",
      ".t8-overlay::before, .t8-overlay::after, #app-root::before, #app-root::after, .chat-detail-overlay::before, .chat-detail-overlay::after, .ac-preview-stage::before, .ac-preview-stage::after { pointer-events: none !important; z-index: 0 !important; }",
      "#app-root > header, #app-root > main, .chat-detail-overlay .chat-header, .chat-detail-overlay .chat-scroll-area, .chat-detail-overlay .chat-toolbar, .chat-detail-overlay .chat-input-bar, .ac-preview-stage > * { position: relative; z-index: 2; }"
    ].join("\n");

    let out = "";
    let i = 0;
    const len = clean.length;

    function processBlock(str) {
      let res = "";
      let idx = 0;
      const n = str.length;
      while (idx < n) {
        // 跳过注释
        if (str[idx] === "/" && str[idx + 1] === "*") {
          const end = str.indexOf("*/", idx + 2);
          if (end === -1) break;
          idx = end + 2;
          continue;
        }
        // 查找下一个左花括号
        const openIdx = str.indexOf("{", idx);
        if (openIdx === -1) break;
        const header = str.slice(idx, openIdx).trim();
        // 匹配对应右花括号
        let depth = 1;
        let p = openIdx + 1;
        while (p < n && depth > 0) {
          if (str[p] === "{") depth++;
          else if (str[p] === "}") depth--;
          p++;
        }
        const body = str.slice(openIdx + 1, p - 1);
        idx = p;

        if (!header) continue;
        if (/^@(-webkit-)?keyframes\b/i.test(header)) {
          res += `${header} {${body}}\n`;
        } else if (/^@(media|supports|container)\b/i.test(header)) {
          res += `${header} {\n${processBlock(body)}}\n`;
        } else if (header.startsWith("@")) {
          res += `${header} {${body}}\n`;
        } else {
          const mapped = header
            .split(",")
            .map((s) => mapSingleChatSelector(s, overridePerRole))
            .filter(Boolean)
            .join(", ");
          if (mapped) {
            res += `${mapped} {${body}}\n`;
          }
        }
      }
      return res;
    }

    out = processBlock(clean);
    return safeBase + "\n" + out;
  }

  // ===================== 样式热挂载 & 优先级管理 =====================
  function applyChatCssToDom(state) {
    if (typeof document === "undefined" || !document.head) return;
    let tag = document.getElementById(CHAT_STYLE_TAG_ID);
    const mergedRaw = combineChatCss(state);
    const active = !!(state && state.enabled && mergedRaw.trim());

    if (!active) {
      if (tag) tag.textContent = "";
      return;
    }

    ensureFluffySvgFilter();
    const compiled = compileScopedCss(mergedRaw, {
      overridePerRole: !!state.overridePerRole
    });

    if (!tag) {
      tag = document.createElement("style");
      tag.id = CHAT_STYLE_TAG_ID;
    }
    tag.textContent = compiled;

    if (state.overridePerRole) {
      document.head.appendChild(tag);
    } else {
      const firstRoleStyle = document.head.querySelector('[id^="dialog-style-"], [id^="custom-chat-style-"]');
      if (firstRoleStyle) {
        document.head.insertBefore(tag, firstRoleStyle);
      } else {
        document.head.appendChild(tag);
      }
    }
  }

  // ===================== 聚光灯移动端被动划过桥接 =====================
  let lastLitEl = null;
  let clearLitTimer = null;

  function setLitElement(el) {
    if (clearLitTimer) {
      clearTimeout(clearLitTimer);
      clearLitTimer = null;
    }
    if (lastLitEl && lastLitEl !== el) {
      lastLitEl.classList.remove("ac-lit");
    }
    if (el) {
      el.classList.add("ac-lit");
      lastLitEl = el;
    } else {
      lastLitEl = null;
    }
  }

  function scheduleClearLit() {
    if (clearLitTimer) clearTimeout(clearLitTimer);
    clearLitTimer = setTimeout(() => {
      if (lastLitEl) {
        lastLitEl.classList.remove("ac-lit");
        lastLitEl = null;
      }
    }, 420);
  }

  function setupTouchSpotlightBridge() {
    if (typeof document === "undefined" || window.__MILVUS_APP_CHAT_TOUCH_BOUND__) return;
    window.__MILVUS_APP_CHAT_TOUCH_BOUND__ = true;

    const findTarget = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      if (!hit || !hit.closest) return null;
      return hit.closest(
        ".chat-detail-overlay .msg-bubble, #app-root .chat-item, .ac-preview-stage .ac-pv-bubble-me, .ac-preview-stage .ac-pv-bubble-them, .ac-preview-stage .ac-pv-list-item"
      );
    };

    document.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || !e.touches[0]) return;
        const t = e.touches[0];
        const target = findTarget(t.clientX, t.clientY);
        if (target) setLitElement(target);
      },
      { passive: true }
    );

    document.addEventListener(
      "touchmove",
      (e) => {
        if (!e.touches || !e.touches[0]) return;
        const t = e.touches[0];
        const target = findTarget(t.clientX, t.clientY);
        if (target) setLitElement(target);
      },
      { passive: true }
    );

    document.addEventListener("touchend", scheduleClearLit, { passive: true });
    document.addEventListener("touchcancel", scheduleClearLit, { passive: true });
  }

  // ===================== 文件导入解析 =====================
  function parseImportedFile(fileName, content) {
    const cleanName = (fileName || "导入预设").replace(/\.(css|txt|json)$/i, "").trim() || "导入预设";
    const text = (content || "").trim();
    if (!text) return null;
    if (/\.json$/i.test(fileName || "") || (text.startsWith("{") && text.endsWith("}"))) {
      try {
        const obj = JSON.parse(text);
        const css = obj.css || obj.customCss || obj.code || "";
        const name = (obj.name || obj.title || cleanName).toString().trim() || cleanName;
        if (typeof css === "string" && css.trim()) {
          return { name, css: css.trim() };
        }
      } catch (_) {}
    }
    return { name: cleanName, css: text };
  }

  // ===================== 手绘细线矢量图标（零 Emoji） =====================
  const SvgIcons = {
    Back: () =>
      React.createElement(
        "svg",
        { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "M15 18l-6-6 6-6" })
      ),
    ChatBubble: () =>
      React.createElement(
        "svg",
        { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" })
      ),
    Copy: () =>
      React.createElement(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("rect", { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
        React.createElement("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
      ),
    Upload: () =>
      React.createElement(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        React.createElement("polyline", { points: "17 8 12 3 7 8" }),
        React.createElement("line", { x1: 12, y1: 3, x2: 12, y2: 15 })
      ),
    Save: () =>
      React.createElement(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" }),
        React.createElement("polyline", { points: "17 21 17 13 7 13 7 21" }),
        React.createElement("polyline", { points: "7 3 7 8 15 8" })
      ),
    Reset: () =>
      React.createElement(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("polyline", { points: "1 4 1 10 7 10" }),
        React.createElement("path", { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" })
      ),
    Chevron: ({ open }) =>
      React.createElement(
        "svg",
        {
          width: 15,
          height: 15,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: { transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }
        },
        React.createElement("polyline", { points: "6 9 12 15 18 9" })
      ),
    Close: () =>
      React.createElement(
        "svg",
        { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("line", { x1: 18, y1: 6, x2: 6, y2: 18 }),
        React.createElement("line", { x1: 6, y1: 6, x2: 18, y2: 18 })
      ),
    Eye: () =>
      React.createElement(
        "svg",
        { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
        React.createElement("circle", { cx: 12, cy: 12, r: 3 })
      )
  };

  // ===================== 极简 Toggle 开关组件 =====================
  function MinimalToggle({ checked, onChange, accent }) {
    const color = accent || "#7C6FD6";
    return React.createElement(
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
          width: "44px",
          height: "24px",
          borderRadius: "999px",
          border: "none",
          padding: 0,
          background: checked ? color : "#D4D2CE",
          cursor: "pointer",
          transition: "background 0.22s ease",
          flexShrink: 0
        }
      },
      React.createElement("span", {
        style: {
          position: "absolute",
          top: "3px",
          left: checked ? "23px" : "3px",
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: "#FFFFFF",
          boxShadow: "0 2px 5px rgba(0,0,0,0.18)",
          transition: "left 0.22s ease"
        }
      })
    );
  }

  // ===================== 传讯微缩实时预览台 =====================
  function ChatMiniPreview({ enabled }) {
    return React.createElement(
      "div",
      {
        className: "ac-preview-stage",
        style: {
          position: "relative",
          borderRadius: "16px",
          border: "1px solid rgba(124, 111, 214, 0.16)",
          background: "#F4F2EE",
          overflow: "hidden",
          boxShadow: "0 8px 22px rgba(24, 24, 34, 0.08)",
          opacity: enabled ? 1 : 0.62,
          transition: "opacity 0.2s ease"
        }
      },
      // 模拟聊天顶栏
      React.createElement(
        "div",
        {
          className: "ac-pv-header",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "9px 12px",
            background: "rgba(255,255,255,0.88)",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            fontSize: "12px",
            fontWeight: 600,
            color: "#333"
          }
        },
        React.createElement("span", { style: { opacity: 0.7 } }, "返回"),
        React.createElement("span", null, "广陵传讯 · 实时预览"),
        React.createElement("span", { style: { fontSize: "10px", opacity: 0.65 } }, "在线")
      ),
      // 模拟消息区
      React.createElement(
        "div",
        {
          className: "ac-pv-body",
          style: {
            padding: "12px 12px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            minHeight: "106px"
          }
        },
        React.createElement(
          "div",
          { style: { display: "flex", justifyContent: "flex-start" } },
          React.createElement(
            "div",
            {
              className: "ac-pv-bubble-them",
              style: {
                maxWidth: "78%",
                padding: "7px 11px",
                borderRadius: "14px 14px 14px 4px",
                background: "#FFFFFF",
                color: "#333",
                fontSize: "11.5px",
                lineHeight: 1.45
              }
            },
            "今日新换了传讯笺纸，滑过气泡看看光影质感。"
          )
        ),
        React.createElement(
          "div",
          { style: { display: "flex", justifyContent: "flex-end" } },
          React.createElement(
            "div",
            {
              className: "ac-pv-bubble-me",
              style: {
                maxWidth: "74%",
                padding: "7px 11px",
                borderRadius: "14px 14px 4px 14px",
                background: "#E8E3DC",
                color: "#2C2A27",
                fontSize: "11.5px",
                lineHeight: 1.45
              }
            },
            "和主屏图标是一整套风格，很好看。"
          )
        ),
        // 微缩列表项预览条（验证列表与左滑遮挡）
        React.createElement(
          "div",
          {
            className: "ac-pv-list-item",
            style: {
              marginTop: "2px",
              padding: "6px 10px",
              borderRadius: "10px",
              background: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "10.5px",
              color: "#666"
            }
          },
          React.createElement("span", { style: { fontWeight: 600 } }, "列表行预览 · 名士会话"),
          React.createElement("span", { style: { opacity: 0.65 } }, "刚刚")
        )
      ),
      // 模拟底部输入栏
      React.createElement(
        "div",
        {
          className: "ac-pv-input",
          style: {
            padding: "7px 10px",
            background: "rgba(255,255,255,0.88)",
            borderTop: "1px solid rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }
        },
        React.createElement(
          "div",
          {
            className: "ac-pv-input-box",
            style: {
              flex: 1,
              padding: "5px 10px",
              borderRadius: "14px",
              background: "#F5F5F5",
              fontSize: "11px",
              color: "#888"
            }
          },
          "输入传讯内容..."
        )
      )
    );
  }

  // ===================== 「应用自定义」极简全屏子页 =====================
  function AppCustomCenterOverlay({ isOpen, onClose }) {
    const [chatState, setChatState] = React.useState({ ...DEFAULT_APP_STATE, sections: { ...EMPTY_SECTIONS } });
    const [loaded, setLoaded] = React.useState(false);
    const [expandedAppId, setExpandedAppId] = React.useState("chat");
    const [scopeTab, setScopeTab] = React.useState("all");
    const [showPreview, setShowPreview] = React.useState(true);
    const [toast, setToast] = React.useState("");
    const [showSaveModal, setShowSaveModal] = React.useState(false);
    const [newPresetName, setNewPresetName] = React.useState("");
    const [deleteTarget, setDeleteTarget] = React.useState(null);
    const fileInputRef = React.useRef(null);

    const flashToast = (msg) => {
      setToast(msg);
      setTimeout(() => setToast((cur) => (cur === msg ? "" : cur)), 2000);
    };

    React.useEffect(() => {
      if (!isOpen) return;
      let alive = true;
      loadAppState("chat").then((st) => {
        if (!alive) return;
        setChatState(st);
        setLoaded(true);
      });
      return () => {
        alive = false;
      };
    }, [isOpen]);

    if (!isOpen) return null;

    const persistChat = (next) => {
      const normalized = {
        ...next,
        sections: normalizeSections(next.sections)
      };
      setChatState(normalized);
      applyChatCssToDom(normalized);
      saveAppState("chat", normalized);
    };

    const currentTabDef = CHAT_SECTION_TABS.find((t) => t.id === scopeTab) || CHAT_SECTION_TABS[0];
    const currentEditorValue =
      scopeTab === "all"
        ? chatState.customCss || ""
        : (chatState.sections && chatState.sections[scopeTab]) || "";

    const handleToggleEnabled = (nextEnabled) => {
      let next = { ...chatState, enabled: nextEnabled };
      const hasAnyCss = !!combineChatCss(next).trim();
      // 首次开启且尚无任何 CSS 时，默认贴心选中第一套「厚倒角折射玻璃」让用户立即可见效果
      if (nextEnabled && !hasAnyCss) {
        const firstPreset = BUILTIN_CHAT_PRESETS[0];
        next = {
          ...next,
          activePresetId: firstPreset.id,
          customCss: firstPreset.css
        };
        flashToast("已开启传讯自定义并载入「厚倒角折射玻璃」");
      } else {
        flashToast(nextEnabled ? "已开启传讯自定义 CSS" : "已关闭传讯自定义，恢复默认风格");
      }
      if (nextEnabled) setExpandedAppId("chat");
      persistChat(next);
    };

    const handleSelectPreset = (preset) => {
      persistChat({
        ...chatState,
        enabled: true,
        activePresetId: preset.id,
        customCss: preset.css
      });
      setScopeTab("all");
      flashToast(`已应用「${preset.name}」`);
    };

    const handleCssChange = (val) => {
      if (scopeTab === "all") {
        persistChat({
          ...chatState,
          enabled: true,
          activePresetId: "",
          customCss: val
        });
      } else {
        persistChat({
          ...chatState,
          enabled: true,
          sections: {
            ...normalizeSections(chatState.sections),
            [scopeTab]: val
          }
        });
      }
    };

    const handleToggleOverrideRole = (val) => {
      persistChat({ ...chatState, overridePerRole: val });
      flashToast(val ? "已允许全局样式覆盖单角色独立气泡" : "已恢复优先保留单角色独立气泡");
    };

    const handleCopyTemplate = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(currentTabDef.template);
          flashToast(`已复制「${currentTabDef.label}」CSS 模板`);
          return;
        }
      } catch (_) {}
      flashToast("复制失败，请手动在下方编辑区查看");
    };

    const handleImportFile = (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parseImportedFile(file.name, String(reader.result || ""));
        if (!parsed) {
          flashToast("文件内容为空或格式无效");
          return;
        }
        if (scopeTab === "all") {
          const newPreset = {
            id: `custom_chat_${Date.now()}`,
            name: parsed.name.slice(0, 20),
            css: parsed.css
          };
          const nextPresets = [newPreset, ...(chatState.customPresets || [])];
          persistChat({
            ...chatState,
            enabled: true,
            activePresetId: newPreset.id,
            customCss: newPreset.css,
            customPresets: nextPresets
          });
          flashToast(`已导入并应用「${newPreset.name}」`);
        } else {
          persistChat({
            ...chatState,
            enabled: true,
            sections: {
              ...normalizeSections(chatState.sections),
              [scopeTab]: parsed.css
            }
          });
          flashToast(`已导入至「${currentTabDef.label}」独立分区`);
        }
      };
      reader.readAsText(file, "utf-8");
    };

    const handleConfirmSavePreset = () => {
      const name = newPresetName.trim();
      if (!name) {
        flashToast("请输入预设名称");
        return;
      }
      const merged = combineChatCss(chatState);
      if (!merged.trim()) {
        flashToast("当前 CSS 为空，无法保存");
        return;
      }
      const item = {
        id: `custom_chat_${Date.now()}`,
        name: name.slice(0, 20),
        css: merged
      };
      persistChat({
        ...chatState,
        activePresetId: item.id,
        customPresets: [item, ...(chatState.customPresets || [])]
      });
      setNewPresetName("");
      setShowSaveModal(false);
      flashToast(`已保存合并预设「${item.name}」`);
    };

    const handleConfirmDeletePreset = () => {
      if (!deleteTarget) return;
      const filtered = (chatState.customPresets || []).filter((p) => p.id !== deleteTarget.id);
      const next = {
        ...chatState,
        customPresets: filtered,
        activePresetId: chatState.activePresetId === deleteTarget.id ? "" : chatState.activePresetId
      };
      persistChat(next);
      setDeleteTarget(null);
      flashToast("已删除该自建预设");
    };

    const handleClearCurrentOrReset = () => {
      if (scopeTab !== "all") {
        persistChat({
          ...chatState,
          sections: {
            ...normalizeSections(chatState.sections),
            [scopeTab]: ""
          }
        });
        flashToast(`已清空「${currentTabDef.label}」独立 CSS`);
        return;
      }
      persistChat({
        ...chatState,
        enabled: false,
        activePresetId: "",
        customCss: "",
        sections: { ...EMPTY_SECTIONS }
      });
      flashToast("已重置全部传讯自定义 CSS");
    };

    const enabledCount = chatState.enabled ? 1 : 0;

    const modalPortal = (content) => {
      if (typeof ReactDOM !== "undefined" && ReactDOM.createPortal && document.body) {
        return ReactDOM.createPortal(content, document.body);
      }
      return content;
    };

    return React.createElement(
      "div",
      {
        className: "settings-overlay open",
        style: {
          zIndex: 1007,
          background: "#F9F7F5",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          overflow: "hidden",
          boxSizing: "border-box"
        }
      },
      // 极简顶部导航栏
      React.createElement(
        "div",
        {
          className: "settings-nav",
          style: {
            flexShrink: 0,
            background: "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.05)"
          }
        },
        React.createElement(
          "div",
          {
            className: "back-btn",
            onClick: onClose,
            style: { cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }
          },
          React.createElement(SvgIcons.Back, null)
        ),
        React.createElement("div", { className: "title" }, "应用自定义"),
        React.createElement(
          "div",
          {
            style: {
              position: "absolute",
              right: "16px",
              fontSize: "11px",
              color: enabledCount > 0 ? "#7C6FD6" : "#999",
              fontWeight: 600
            }
          },
          enabledCount > 0 ? `已启用 ${enabledCount}` : "极简模式"
        )
      ),
      // 主体滚动容器（修复移动端纵横向截断：minHeight:0 + flexShrink:0 子项 + 充足底部安全区）
      React.createElement(
        "div",
        {
          className: "no-scrollbar",
          style: {
            flex: 1,
            minHeight: 0,
            width: "100%",
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            padding: "16px 14px calc(96px + env(safe-area-inset-bottom, 24px))",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "14px"
          }
        },
        // 顶部极简说明
        React.createElement(
          "div",
          {
            style: {
              flexShrink: 0,
              fontSize: "12px",
              color: "#7E7A74",
              padding: "0 4px",
              lineHeight: 1.6
            }
          },
          "为单个应用注入独立美化 CSS，支持整页套用或分区域独立精修，配置存入本地 IndexedDB。"
        ),

        // 注册表应用卡片：传讯页面
        APP_REGISTRY.map((app) => {
          const isExpanded = expandedAppId === app.id;
          return React.createElement(
            "div",
            {
              key: app.id,
              style: {
                flexShrink: 0,
                width: "100%",
                minWidth: 0,
                boxSizing: "border-box",
                background: "#FFFFFF",
                borderRadius: "18px",
                boxShadow: "0 4px 16px rgba(34, 30, 26, 0.05)",
                border: chatState.enabled ? "1px solid rgba(124, 111, 214, 0.25)" : "1px solid rgba(0, 0, 0, 0.04)",
                overflow: "visible",
                transition: "border-color 0.2s ease"
              }
            },
            // 卡片头部：图标 + 名称 + 开关 + 展开箭头
            React.createElement(
              "div",
              {
                onClick: () => setExpandedAppId(isExpanded ? "" : app.id),
                style: {
                  padding: "14px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  cursor: "pointer",
                  boxSizing: "border-box"
                }
              },
              React.createElement(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 } },
                React.createElement(
                  "div",
                  {
                    style: {
                      width: "36px",
                      height: "36px",
                      borderRadius: "12px",
                      background: chatState.enabled ? "rgba(124, 111, 214, 0.12)" : "#F4F2EE",
                      color: chatState.enabled ? "#7C6FD6" : "#6D6A64",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }
                  },
                  React.createElement(SvgIcons.ChatBubble, null)
                ),
                React.createElement(
                  "div",
                  { style: { minWidth: 0, flex: 1 } },
                  React.createElement(
                    "div",
                    { style: { display: "flex", alignItems: "center", gap: "6px" } },
                    React.createElement("span", { style: { fontSize: "15px", fontWeight: 600, color: "#2C2A27" } }, app.name),
                    React.createElement(
                      "span",
                      {
                        style: {
                          fontSize: "10.5px",
                          padding: "1px 7px",
                          borderRadius: "999px",
                          background: chatState.enabled ? "rgba(124, 111, 214, 0.12)" : "#F3F2EF",
                          color: chatState.enabled ? "#6A5CC4" : "#96928A",
                          fontWeight: 600,
                          flexShrink: 0
                        }
                      },
                      chatState.enabled ? "已开启" : "未开启"
                    )
                  ),
                  React.createElement(
                    "div",
                    {
                      style: {
                        fontSize: "11.5px",
                        color: "#8D8982",
                        marginTop: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }
                    },
                    app.subtitle
                  )
                )
              ),
              React.createElement(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 } },
                React.createElement(MinimalToggle, {
                  checked: chatState.enabled,
                  onChange: handleToggleEnabled,
                  accent: "#7C6FD6"
                }),
                React.createElement(
                  "span",
                  { style: { color: "#A29E96", display: "flex" } },
                  React.createElement(SvgIcons.Chevron, { open: isExpanded })
                )
              )
            ),

            // 展开后的传讯自定义工坊
            isExpanded &&
              loaded &&
              React.createElement(
                "div",
                {
                  style: {
                    padding: "0 14px 16px",
                    borderTop: "1px solid #F3F1ED",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    minWidth: 0,
                    boxSizing: "border-box"
                  }
                },
                // 实时预览折叠头
                React.createElement(
                  "div",
                  {
                    style: {
                      paddingTop: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }
                  },
                  React.createElement(
                    "span",
                    { style: { fontSize: "12px", fontWeight: 600, color: "#57534E" } },
                    "实时微缩预览"
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => setShowPreview((v) => !v),
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        background: "none",
                        border: "none",
                        fontSize: "11.5px",
                        color: "#7C6FD6",
                        cursor: "pointer",
                        padding: "2px 4px"
                      }
                    },
                    React.createElement(SvgIcons.Eye, null),
                    showPreview ? "收起预览" : "展开预览"
                  )
                ),

                showPreview && React.createElement(ChatMiniPreview, { enabled: chatState.enabled }),

                // 内置 4 套同源质感预设（minmax(0, 1fr) 彻底防止手机端右侧裁切）
                React.createElement(
                  "div",
                  { style: { minWidth: 0, width: "100%" } },
                  React.createElement(
                    "div",
                    { style: { fontSize: "12px", fontWeight: 600, color: "#57534E", marginBottom: "8px" } },
                    "内置质感与动效预设（与主屏同源）"
                  ),
                  React.createElement(
                    "div",
                    {
                      style: {
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "8px",
                        width: "100%",
                        boxSizing: "border-box"
                      }
                    },
                    app.presets.map((preset) => {
                      const active = chatState.enabled && chatState.activePresetId === preset.id;
                      return React.createElement(
                        "button",
                        {
                          key: preset.id,
                          type: "button",
                          onClick: () => handleSelectPreset(preset),
                          style: {
                            minWidth: 0,
                            width: "100%",
                            boxSizing: "border-box",
                            overflow: "hidden",
                            textAlign: "left",
                            padding: "9px 9px",
                            borderRadius: "13px",
                            border: active ? "1.5px solid #7C6FD6" : "1px solid #EAE7E1",
                            background: active ? "rgba(124, 111, 214, 0.07)" : "#FAF9F7",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            transition: "all 0.2s ease"
                          }
                        },
                        React.createElement("span", {
                          style: {
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            background: preset.swatch,
                            border: "1.5px solid rgba(255,255,255,0.9)",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                            flexShrink: 0
                          }
                        }),
                        React.createElement(
                          "div",
                          { style: { minWidth: 0, flex: 1, overflow: "hidden" } },
                          React.createElement(
                            "div",
                            {
                              style: {
                                fontSize: "12px",
                                fontWeight: 600,
                                color: active ? "#5B4EC2" : "#333",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis"
                              }
                            },
                            preset.name
                          ),
                          React.createElement(
                            "div",
                            {
                              style: {
                                fontSize: "10px",
                                color: "#8B867F",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                marginTop: "1px"
                              }
                            },
                            preset.tagline
                          )
                        )
                      );
                    })
                  )
                ),

                // 用户自建与导入预设胶囊
                chatState.customPresets &&
                  chatState.customPresets.length > 0 &&
                  React.createElement(
                    "div",
                    { style: { minWidth: 0 } },
                    React.createElement(
                      "div",
                      { style: { fontSize: "12px", fontWeight: 600, color: "#57534E", marginBottom: "6px" } },
                      "我的自建 / 导入预设"
                    ),
                    React.createElement(
                      "div",
                      { style: { display: "flex", flexWrap: "wrap", gap: "7px" } },
                      chatState.customPresets.map((p) => {
                        const active = chatState.enabled && chatState.activePresetId === p.id;
                        return React.createElement(
                          "div",
                          {
                            key: p.id,
                            style: {
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "5px 9px",
                              borderRadius: "999px",
                              border: active ? "1px solid #7C6FD6" : "1px solid #E5E2DC",
                              background: active ? "rgba(124, 111, 214, 0.1)" : "#F8F7F4",
                              fontSize: "11.5px",
                              color: active ? "#5B4EC2" : "#4A4742"
                            }
                          },
                          React.createElement(
                            "span",
                            {
                              onClick: () => handleSelectPreset(p),
                              style: { cursor: "pointer", fontWeight: active ? 600 : 500 }
                            },
                            p.name
                          ),
                          React.createElement(
                            "button",
                            {
                              type: "button",
                              title: "删除预设",
                              onClick: (e) => {
                                e.stopPropagation();
                                setDeleteTarget(p);
                              },
                              style: {
                                border: "none",
                                background: "none",
                                color: "#9C978E",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                padding: "1px"
                              }
                            },
                            React.createElement(SvgIcons.Close, null)
                          )
                        );
                      })
                    )
                  ),

                // 协同开关：是否覆盖单角色独立气泡样式
                React.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "10px 11px",
                      borderRadius: "12px",
                      background: "#FAF8F5",
                      border: "1px solid #EFECE6",
                      boxSizing: "border-box"
                    }
                  },
                  React.createElement(
                    "div",
                    { style: { minWidth: 0, flex: 1 } },
                    React.createElement("div", { style: { fontSize: "12px", fontWeight: 600, color: "#3A3733" } }, "覆盖单角色独立气泡/顶栏样式"),
                    React.createElement("div", { style: { fontSize: "10.5px", color: "#8C8780", marginTop: "2px", lineHeight: 1.4 } }, "默认关闭，优先保留你为某位名士单独配置的气泡 CSS")
                  ),
                  React.createElement(MinimalToggle, {
                    checked: !!chatState.overridePerRole,
                    onChange: handleToggleOverrideRole,
                    accent: "#7C6FD6"
                  })
                ),

                // 分区域独立编辑胶囊栏（整页总览 / 传讯列表 / 聊天顶栏 / 消息气泡 / 工具与输入栏）
                React.createElement(
                  "div",
                  { style: { minWidth: 0 } },
                  React.createElement(
                    "div",
                    { style: { fontSize: "12px", fontWeight: 600, color: "#57534E", marginBottom: "7px" } },
                    "分区域独立编辑（可与整页预设叠加）"
                  ),
                  React.createElement(
                    "div",
                    {
                      className: "no-scrollbar",
                      style: {
                        display: "flex",
                        gap: "6px",
                        overflowX: "auto",
                        paddingBottom: "2px"
                      }
                    },
                    CHAT_SECTION_TABS.map((tab) => {
                      const active = scopeTab === tab.id;
                      const hasCode =
                        tab.id === "all"
                          ? !!(chatState.customCss && chatState.customCss.trim())
                          : !!(chatState.sections && chatState.sections[tab.id] && chatState.sections[tab.id].trim());
                      return React.createElement(
                        "button",
                        {
                          key: tab.id,
                          type: "button",
                          onClick: () => setScopeTab(tab.id),
                          style: {
                            flexShrink: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "5px 10px",
                            borderRadius: "999px",
                            border: active ? "1px solid #7C6FD6" : "1px solid #E5E2DC",
                            background: active ? "#7C6FD6" : "#FAF9F7",
                            color: active ? "#FFFFFF" : "#57534E",
                            fontSize: "11.5px",
                            fontWeight: active ? 600 : 500,
                            cursor: "pointer",
                            transition: "all 0.18s ease"
                          }
                        },
                        tab.label,
                        hasCode &&
                          React.createElement("span", {
                            style: {
                              width: "5px",
                              height: "5px",
                              borderRadius: "50%",
                              background: active ? "#FFFFFF" : "#7C6FD6"
                            }
                          })
                      );
                    })
                  ),
                  React.createElement(
                    "div",
                    {
                      style: {
                        fontSize: "11px",
                        color: "#8C8780",
                        marginTop: "6px",
                        lineHeight: 1.45
                      }
                    },
                    currentTabDef.hint
                  )
                ),

                // 操作工具栏（复制本区模板 / 导入 CSS / 存为预设 / 清空本区或重置）
                React.createElement(
                  "div",
                  { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: handleCopyTemplate,
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 9px",
                        borderRadius: "10px",
                        border: "1px solid #E6E3DD",
                        background: "#FFFFFF",
                        color: "#4A4742",
                        fontSize: "11.5px",
                        fontWeight: 500,
                        cursor: "pointer"
                      }
                    },
                    React.createElement(SvgIcons.Copy, null),
                    scopeTab === "all" ? "复制模板" : "复制本区模板"
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => fileInputRef.current && fileInputRef.current.click(),
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 9px",
                        borderRadius: "10px",
                        border: "1px solid rgba(124, 111, 214, 0.32)",
                        background: "rgba(124, 111, 214, 0.08)",
                        color: "#5F52C4",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }
                    },
                    React.createElement(SvgIcons.Upload, null),
                    "导入 CSS"
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        const content =
                          scopeTab === "all"
                            ? combineChatCss(chatState).trim()
                            : String(currentEditorValue || "").trim();
                        if (!content) {
                          flashToast(`当前「${currentTabDef.label}」CSS 为空`);
                          return;
                        }
                        try {
                          const blob = new Blob([content], { type: "text/css;charset=utf-8" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `传讯页面-${currentTabDef.label}.css`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                          flashToast(`已导出「${currentTabDef.label}」CSS 文件`);
                        } catch (_) {
                          flashToast("导出失败，请手动复制");
                        }
                      },
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 9px",
                        borderRadius: "10px",
                        border: "1px solid rgba(124, 111, 214, 0.32)",
                        background: "rgba(124, 111, 214, 0.08)",
                        color: "#5F52C4",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }
                    },
                    React.createElement(
                      "svg",
                      { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
                      React.createElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
                      React.createElement("polyline", { points: "7 10 12 15 17 10" }),
                      React.createElement("line", { x1: 12, y1: 15, x2: 12, y2: 3 })
                    ),
                    "导出 CSS"
                  ),
                  React.createElement("input", {
                    ref: fileInputRef,
                    type: "file",
                    accept: ".css,.txt,.json",
                    onChange: handleImportFile,
                    style: { display: "none" }
                  }),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: () => setShowSaveModal(true),
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 9px",
                        borderRadius: "10px",
                        border: "1px solid #E6E3DD",
                        background: "#FFFFFF",
                        color: "#4A4742",
                        fontSize: "11.5px",
                        fontWeight: 500,
                        cursor: "pointer"
                      }
                    },
                    React.createElement(SvgIcons.Save, null),
                    "存为预设"
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      onClick: handleClearCurrentOrReset,
                      style: {
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "6px 9px",
                        borderRadius: "10px",
                        border: "1px solid #F1DFDF",
                        background: "#FFF8F8",
                        color: "#C45B5B",
                        fontSize: "11.5px",
                        fontWeight: 500,
                        cursor: "pointer",
                        marginLeft: "auto"
                      }
                    },
                    React.createElement(SvgIcons.Reset, null),
                    scopeTab === "all" ? "重置全部" : "清空本区"
                  )
                ),

                // 自定义 CSS 代码编辑区（按当前选中分区独立编辑）
                React.createElement("textarea", {
                  value: currentEditorValue,
                  onChange: (e) => handleCssChange(e.target.value),
                  placeholder: `在此编写或粘贴「${currentTabDef.label}」自定义 CSS...`,
                  spellCheck: false,
                  style: {
                    width: "100%",
                    minHeight: "156px",
                    padding: "11px 12px",
                    borderRadius: "12px",
                    border: "1px solid #E3DFD8",
                    background: "#FCFBFA",
                    color: "#2C2A27",
                    fontSize: "11.5px",
                    lineHeight: 1.55,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box"
                  }
                })
              )
          );
        }),

        // 极简扩展预告位
        React.createElement(
          "div",
          {
            style: {
              flexShrink: 0,
              padding: "14px 16px",
              borderRadius: "16px",
              border: "1px dashed #DFDCD5",
              textAlign: "center",
              fontSize: "11.5px",
              color: "#A09B92"
            }
          },
          "更多应用（音乐 / 论坛 / 情侣空间等）将按需接入此处"
        )
      ),

      // 轻量 Toast 提示
      toast &&
        React.createElement(
          "div",
          {
            style: {
              position: "fixed",
              left: "50%",
              bottom: "28px",
              transform: "translateX(-50%)",
              background: "rgba(32, 31, 35, 0.88)",
              color: "#FFFFFF",
              fontSize: "12px",
              padding: "8px 16px",
              borderRadius: "999px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
              zIndex: 100020,
              whiteSpace: "nowrap"
            }
          },
          toast
        ),

      // 保存为新预设弹窗（Portal）
      showSaveModal &&
        modalPortal(
          React.createElement(
            "div",
            {
              onClick: () => setShowSaveModal(false),
              style: {
                position: "fixed",
                inset: 0,
                background: "rgba(20, 18, 22, 0.48)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                zIndex: 100030,
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
                  background: "#FFFFFF",
                  borderRadius: "18px",
                  padding: "18px",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }
              },
              React.createElement("div", { style: { fontSize: "15px", fontWeight: 700, color: "#2C2A27" } }, "保存为传讯预设"),
              React.createElement("input", {
                type: "text",
                value: newPresetName,
                onChange: (e) => setNewPresetName(e.target.value),
                placeholder: "输入预设名称（如：雾蓝水墨）",
                maxLength: 20,
                autoFocus: true,
                style: {
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: "1px solid #E2DFD9",
                  fontSize: "13px",
                  outline: "none"
                }
              }),
              React.createElement(
                "div",
                { style: { display: "flex", gap: "8px" } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: () => setShowSaveModal(false),
                    style: {
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: "11px",
                      border: "1px solid #E5E2DC",
                      background: "#F9F8F6",
                      color: "#666",
                      fontSize: "13px",
                      cursor: "pointer"
                    }
                  },
                  "取消"
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: handleConfirmSavePreset,
                    style: {
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: "11px",
                      border: "none",
                      background: "#7C6FD6",
                      color: "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }
                  },
                  "保存"
                )
              )
            )
          )
        ),

      // 删除预设二次确认弹窗（Portal）
      deleteTarget &&
        modalPortal(
          React.createElement(
            "div",
            {
              onClick: () => setDeleteTarget(null),
              style: {
                position: "fixed",
                inset: 0,
                background: "rgba(20, 18, 22, 0.48)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
                zIndex: 100030,
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
                  maxWidth: "300px",
                  background: "#FFFFFF",
                  borderRadius: "18px",
                  padding: "18px",
                  boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }
              },
              React.createElement("div", { style: { fontSize: "15px", fontWeight: 700, color: "#2C2A27" } }, "确认删除预设？"),
              React.createElement(
                "div",
                { style: { fontSize: "12.5px", color: "#6E6A63", lineHeight: 1.5 } },
                `将从本地移除自建预设「${deleteTarget.name}」，此操作不可撤销。`
              ),
              React.createElement(
                "div",
                { style: { display: "flex", gap: "8px" } },
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: () => setDeleteTarget(null),
                    style: {
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: "11px",
                      border: "1px solid #E5E2DC",
                      background: "#F9F8F6",
                      color: "#666",
                      fontSize: "13px",
                      cursor: "pointer"
                    }
                  },
                  "取消"
                ),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    onClick: handleConfirmDeletePreset,
                    style: {
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: "11px",
                      border: "none",
                      background: "#D65A5A",
                      color: "#FFFFFF",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }
                  },
                  "删除"
                )
              )
            )
          )
        )
    );
  }

  // ===================== 启动热挂载 =====================
  function bootAppCustomCss() {
    setupTouchSpotlightBridge();
    loadAppState("chat").then((st) => {
      if (st && st.enabled && combineChatCss(st).trim()) {
        applyChatCssToDom(st);
      }
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootAppCustomCss, { once: true });
    } else {
      bootAppCustomCss();
    }
  }

  // ===================== 全局导出 =====================
  window.AppCustomCenterOverlay = AppCustomCenterOverlay;
  window.AppCustomCssEngine = {
    DB_NAME,
    STORE_NAME,
    APP_REGISTRY,
    CHAT_SECTION_TABS,
    BUILTIN_CHAT_PRESETS,
    CHAT_DEFAULT_TEMPLATE,
    combineChatCss,
    compileScopedCss,
    sanitizeRawCss,
    parseImportedFile,
    loadAppState,
    saveAppState,
    applyChatCssToDom
  };
})();
