# 🕊️ Ano-phone「鸿雁传书 · 角色主动发消息（私聊/群聊 + 定时/离线）」策划案

> **架构原则**：严格遵循 **「独立模块化引擎 + 轻量埋点接入」** 架构。原创命名 **「鸿雁传书 · 主动传讯」**，新建独立模块 `Milvus/proactive_msg_engine.js` 与专属 IndexedDB (`milvus_proactive_msg_idb`)，**零 `localStorage` 占用**；入口登记在 **「传讯 → 对话偏好设置 → 基础设置」**（支持私聊与群聊、顶部搜索栏可搜），`Milvus/app.min.js` 仅需 **~8 行** 极轻量桥接。

---

## 一、技术真相拆解：SullyOS「主动消息」是怎么做到离线发送的？

### 1. 为什么单靠 WebSocket 或前端定时器无法“关网页离线发消息”？
- **浏览器后台冻结铁律**：无论是手机 Safari/Chrome 还是桌面浏览器，一旦用户**关闭标签页或锁屏超过数十秒**，系统会强制挂起 JS 定时器并**掐断 WebSocket 长连接**。
- **WebSocket 的适用边界**：WebSocket 仅用于“网页正开着时，服务端实时推送数据”；**它无法在关网页后自己把角色唤醒、调用 LLM 并弹系统通知**。

### 2. SullyOS-master「主动消息 2.0 (`amsg2`)」的实际架构
通过审查 `SullyOS-master/utils/activeMsgClient.ts` 与 `SullyOS-master/worker/amsg/src/index.ts`，它采用的不是 WebSocket，而是 **「单用户 Cloudflare Worker + Cron Trigger + 云端持久化 + Web Push / 第三方推送」** 架构：
1. **云端状态包 (`FirePack`)**：前端将角色人设、近期几条对话、LLM API 凭据与定时计划同步给用户自己部署的 Cloudflare Worker（存 D1 数据库）；
2. **云端每分钟巡检 (`Cron Trigger: * * * * *`)**：即使手机关机/关网页，Cloudflare 云端每分钟自动唤醒 Worker 检查到期任务；
3. **云端代调 LLM + 系统级推送**：到点后由 Worker 直接在云端调用 LLM 生成消息，写入云端待收件箱，并通过 **Web Push（VAPID + `sw.js` `push` 事件）** 或 **第三方推送（如 Bark / ntfy）** 弹出手机系统通知；
4. **回页签收落盘**：用户点开通知回到网页后，前端拉取云端待收件箱写入本地聊天记录并签收（ACK）。

---

## 二、前端直接可用性 & 权限 / 后端评估

为了兼顾 **「零门槛小白开箱即用」** 与 **「进阶玩家真·锁屏离线推送」**，我们采用 **「双轨渐进式架构」**：

| 能力轨道 | 功能内容 | 能否纯前端直接用？ | 所需权限 / 外部依赖 |
| :--- | :--- | :---: | :--- |
| **第一轨：本地定时 + 离线补发（Phase 0–1 核心落地）** | ① 私聊/群聊**固定间隔**（如每 30/60/120 分钟）主动发消息；<br>② **每日定点**（如早安 08:30 / 午间 12:30 / 晚安 23:00）；<br>③ **沉默触发**（用户超过 N 分钟未回消息时角色主动关心/催促）；<br>④ **群聊自发唠嗑**（到点随机挑 1~3 位名士互相接茬并可 @主公）；<br>⑤ **离线重连智能补发**（关页数小时后重新打开，3 秒内自动补发 1 条带真实时间差的问候，如“等了殿下半日不见回信”）；<br>⑥ 网页在后台标签页时弹出桌面/系统通知 | ✅ **100% 纯前端** | 零后端、零新服务器！<br>仅后台标签页弹窗需浏览器 `Notification` 通知权限（可选，不授也能直接写入聊天列表红点） |
| **第二轨：真·关网页/锁屏离线云端推送（Phase 2 可选升级）** | 网页彻底关闭、手机锁屏时，依然由云端准点生成消息并把原生通知推到手机锁屏界面，打开网页自动同步入聊天记录 | ❌ **必须借助云端 Worker** | 复用 Ano-phone 现有的 **`luckin_gateway/cf_worker.js`**（Cloudflare 免费版即可）：<br>1. 绑定 1 个免费 **KV (`PROACTIVE_KV`)** + 开启 **Cron Trigger (`*/5 * * * *`)**；<br>2. 推送通道二选一：<br>　• **极简免折腾**：填 **Bark URL**（iOS）或 **ntfy.sh 主题**（安卓/电脑），10 秒配完；<br>　• **原生 PWA Web Push**：需 HTTPS + VAPID 密钥对 + `sw.js` 监听 `push` 事件（**iOS 必须先“添加到主屏幕”**） |

> **为什么比 SullyOS 的 D1 方案更适合 Ano-phone？**
> SullyOS 的 `amsg2` 有 8000+ 行 Worker 代码且强依赖 D1 建表迁移、VAPID 加密套件，部署门槛极高；而 Ano-phone **已经拥有现成的 `luckin_gateway/cf_worker.js`**，Phase 0–1 先用纯前端实现 100% 开箱即用的「定时 + 离线补发 + 私聊/群聊主动发言」，Phase 2 只需在现有 `cf_worker.js` 加 ~120 行轻量 KV + Cron 即可开启真·锁屏离线推送！

---

## 三、核心功能与防骚扰风控设计

### 1. 触发模式（私聊 & 群聊均支持）
- **间隔触发（Interval）**：每间隔 `30 / 60 / 120 / 240` 分钟随机抖动 ±15%（模拟活人不踩死点）主动发来一条消息。
- **每日定点（Daily Slots）**：支持勾设定点时刻（如 `08:30 早安`、`12:30 午膳`、`22:30 晚安`），支持自定义添加 HH:MM。
- **沉默追问（Away Trigger）**：用户最后一条消息过去超过 `N` 分钟（如 20 分钟）未继续聊时，角色主动发一句自然接茬或关心。
- **离线重连补发（Offline Catch-up）**：页面重新打开时，若检测到距离上次活跃已错过定时窗口，自动以真实流逝时长为上下文补发 **至多 1 条**（绝不刷屏堆积）。

### 2. 四重防骚扰 / 防爆费护栏（核心防御）
1. **连续未回熔断（默认上限 2 条）**：用户一直没回消息时，角色最多主动发 2 条即自动暂停，直到用户再次回复才重置计数——**杜绝睡一觉被刷几十条烧光 API 额度**！
2. **每日发送上限（默认 6 条/角色）**：单角色每日主动消息硬上限，按本地自然日零点自动清零。
3. **夜间免打扰时段（默认 23:30 ~ 07:30）**：免打扰区间内静默跳过，不打扰休息（可自定义或关闭）。
4. **正在聊天防撞车锁**：检测到用户刚发过消息（< 2 分钟内）或 AI 正在生成回复时，自动顺延本轮主动触发。

### 3. 群聊专属增强（「群内自发唠嗑」）
- 群聊开启「鸿雁传书」后，到点时引擎自动从群成员中随机抽取 `1~3` 位名士（带权重避开刚发过言的成员），以 `[名士名]: 台词` 格式接力聊 2~4 句日常拌嘴、分享见闻，偶尔顺手 `@主公` 喊你出来冒泡，让群聊真正像活人群！

---

## 四、独立模块化架构与轻量埋点

### 1. 文件规划

| 文件路径 | 操作类型 | 职责与改动量 |
| :--- | :--- | :--- |
| `Milvus/proactive_msg_engine.js` | **新建（核心独立引擎）** | 封装全部逻辑：① `milvus_proactive_msg_idb`（2 表：`chat_configs`、`schedule_state`）；② 定时巡检调度器（每 60s 轻量心跳 + 页面 `visibilitychange` 唤醒离线补发）；③ 四重防骚扰风控（未回熔断、日上限、免打扰、活跃避让）；④ 私聊/群聊主动消息 Prompt 构造器（结合时间段、流逝时长、近期对话与角色人设）；⑤ 浏览器桌面通知封装；⑥ 位于 **基础设置** 的配置卡 `ProactiveMsgSettingsCard`（含「立即试发一条」测试按钮 + 可选云端离线推送配置区） |
| `index.html` | **+1 行引入** | 在 `app.min.js` 之前加载 `<script src="Milvus/proactive_msg_engine.js"></script>` |
| `Milvus/chat_settings_organizer.js` | **+1 行登记** | 在 `COMP_MAP` 中将 `ProactiveMsgSettingsCard` 显式登记为 **`basic`（基础设置）**，支持搜索「主动发消息 / 定时 / 离线 / 鸿雁 / 推送 / 早安」 |
| `Milvus/app.min.js` | **极轻量埋点（~8 行）** | ① `ChatSettingsModal` 挂载 `<ProactiveMsgSettingsCard chatData={chatData} isGroup={...} />`；② 注册全局桥接 `window.__anoProactiveBridge`（暴露只读角色/群列表、写入消息到 `chatHistoryStore` 并触发当前会话列表与未读红点刷新、以及用户发消息时通知重置 `unansweredCount`） |
| `luckin_gateway/cf_worker.js` & `sw.js` | **Phase 2 可选云端离线** | 在现有 Worker 新增 `/proactive/*` 同步/签收接口与 `scheduled()` Cron 处理器（KV 队列 + Bark/ntfy/WebPush），在 `sw.js` 新增 `push` 与 `notificationclick` 监听 |

### 2. IndexedDB 存储结构（`milvus_proactive_msg_idb` v1，零 `localStorage`）

1. **`chat_configs`**（主键 `chatId`）
   ```js
   {
     chatId: "char_xxx",         // 私聊 charId 或群聊 group_chat_xxx
     isGroup: false,
     enabled: false,             // 主动发消息总开关
     mode: "interval",           // "interval" | "daily" | "away" | "hybrid"
     intervalMinutes: 60,        // 间隔分钟（30/60/120/240）
     dailyTimes: ["08:30", "22:30"], // 每日定点列表
     awayMinutes: 25,            // 沉默触发分钟
     catchUpOnReturn: true,      // 离线重连补发开关
     maxUnanswered: 2,           // 连续未回熔断上限
     dailyLimit: 6,              // 每日上限
     quietStart: "23:30",        // 免打扰开始
     quietEnd: "07:30",          // 免打扰结束
     browserNotify: false,       // 浏览器桌面通知
     cloudPushEnabled: false,    // Phase 2 云端离线推送开关
     cloudPushUrl: "",           // Bark / ntfy URL（可选）
     updatedAt: 1732300000000
   }
   ```
2. **`schedule_state`**（主键 `chatId`）
   ```js
   {
     chatId: "char_xxx",
     lastUserMsgAt: 0,
     lastProactiveAt: 0,
     nextFireAt: 0,
     unansweredCount: 0,
     sentTodayDate: "2026-11-23",
     sentTodayCount: 0,
     firedDailySlots: []         // 当日已触发的定点，如 ["08:30"]
   }
   ```

---

## 五、潜在技术问题与防御性解决方案

| 潜在问题 | 风险描述 | 防御性解决方案 |
| :--- | :--- | :--- |
| **1. 后台多角色同时到点引发并发 API 风暴** | 用户给 8 个角色都开了定时，打开网页时 8 个角色同时触发离线补发，瞬间并发 8 次 LLM 请求触发 429 限流 | 内置 **串行任务队列 + 全局最小冷却间隔（15 秒）**：同一时刻最多只执行 1 个主动消息生成任务，其余顺延排队；离线重连时最多只补发 1 个最近到点的角色 |
| **2. 角色主动发消息时忽略了当前现实时间** | 凌晨发“午安”、刚聊完 5 分钟发“好久不见”导致出戏 | Prompt 注入精确的本地时间、星期、时段（清晨/午后/深夜）以及**距离上次对话的真实流逝时长**，并结合最近 6 条对话自然衔接 |
| **3. 主动消息与用户刚发出的消息撞车** | 正在打字或 AI 正在回复时突然插进一条主动消息 | 触发前强校验 `now - lastUserMsgAt >= 120000`（2 分钟活跃避让）与 `isGenerating` 状态锁；若撞车则静默顺延 10 分钟 |
| **4. 刷新或切换会话后，主动消息没显示在聊天窗口或没红点** | 后台写入 IndexedDB 后当前打开的 React 聊天窗口未刷新 | 通过轻量事件 `milvus-proactive-msg-delivered` 通知 `app.min.js`：若当前正打开该会话则直接追加进 `messages` state；若在外部则更新未读徽标并在顶部弹出轻提示 Toast（点击直达该对话） |
| **5. 群聊主动消息格式解析失败** | 群聊需要多角色依次发言，若模型没按 `[名士名]: 内容` 格式输出会变成单条杂乱文本 | 内置严格容错解析器：按 `[名士名]:` 拆分成多条带对应 `sender` 与头像的群气泡；若未带前缀则兜底归属到本次主发言名士 |
| **6. iOS Safari 推送与离线限制** | iOS 不允许普通 Safari 网页收 Web Push | 在设置面板清晰标注：纯前端版支持开页定时 + 离线重连补发；如需锁屏真推送，Phase 2 推荐 iOS 直接填 **Bark 推送链接**（免 PWA 限制）或将网页「添加到主屏幕」 |

---

## 六、分阶段实施计划

### Phase 0：构建独立前端引擎 `Milvus/proactive_msg_engine.js` 与单元测试
1. 新建 `Milvus/proactive_msg_engine.js`：
   - 实现 `milvus_proactive_msg_idb` 2 表存储与 Node 内存测试适配器（零 `localStorage`）；
   - 实现四重风控判断器 `evaluateTriggerEligibility(cfg, state, nowMs)`（免打扰跨午夜区间、连续未回熔断、每日上限、2 分钟活跃避让）；
   - 实现间隔/定点/沉默/离线补发 4 种调度算法 + 串行防风暴队列；
   - 实现私聊与群聊主动消息 Prompt 构造器与群聊多角色 `[名士名]:` 容错拆分器；
   - 实现 `ProactiveMsgSettingsCard`（位于**基础设置**，含「🕊️ 立即试发一条」一键体验按钮、免打扰与上限调节、桌面通知权限申请）。
2. 运行 `node --check` + 全套自动化单元测试，验证：
   - 零 `localStorage` 静态审计；
   - 跨午夜免打扰时段（如 `23:30 ~ 07:30`）精准拦截与放行；
   - 连续未回熔断 + 用户发消息后自动重置计数；
   - 每日定点防重复触发 + 离线重连补发；
   - 群聊多角色台词拆分与串行队列防并发风暴。

### Phase 1：轻量埋点接入与全量联调验证
1. **`index.html`**：+1 行引入 `Milvus/proactive_msg_engine.js`。
2. **`Milvus/chat_settings_organizer.js`**：+1 行将 `ProactiveMsgSettingsCard` 显式登记至 **`basic`（基础设置）**。
3. **`Milvus/app.min.js`**：接入极轻量埋点（~8~10 行：在 `ChatSettingsModal` 挂载配置卡、用户发消息时通知重置未回计数、监听 `milvus-proactive-msg-delivered` 实时刷新聊天窗口与未读提示、提供消息落盘桥接）。
4. **全量验证**：`node --check` 全量通过 + 联调测试验证归属 **基础设置**、搜索命中、以及主动消息落盘链路。

### Phase 2（按需扩展）：云端真·锁屏离线推送（复用 `luckin_gateway/cf_worker.js` + `sw.js`）
- 在用户确认需要锁屏离线推送后，在现有 `luckin_gateway/cf_worker.js` 扩展 `scheduled()` Cron + `PROACTIVE_KV` 队列 + Bark/ntfy/WebPush 推送，并在 `sw.js` 增加 `push` / `notificationclick` 事件监听。
