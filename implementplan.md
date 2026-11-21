# 中转站 AI 调用计数与自定义配额监控系统（API Quota Tracker）策划案

> **目标**：在「设置 → API 配置中心」的 **「API 存储库」上方** 新增 **「API 次数总计与配额监控」** 面板（含总调用计数与总开关）。开启后，用户可为任意中转站及任意模型高度自定义计费/限额规则（日次数、总次数、剩余金额/单次扣费），并在每次调用 AI 时弹出极简全局顶部横幅通知，实时掌握额度消耗。

---

## 一、架构总览与模块划分

为保持代码整洁、不继续膨胀 `Milvus/app.min.js`，采用**独立模块化引擎 + 轻量埋点接入**架构：

| 文件 / 模块 | 职责说明 |
| :--- | :--- |
| **`Milvus/api_quota_app.js`（新建）** | 核心引擎与 UI 组件：<br>1. `window.apiQuotaTracker`（数据存储、跨日重置、扣费计算、额度预警、调用流水）<br>2. `window.ApiQuotaSettingsCard`（挂载在「API 存储库」上方的总计卡片、总开关与高度自定义规则配置弹窗）<br>3. `window.ApiQuotaGlobalBanner`（挂载于全局顶层的轻量化横幅通知组件，支持多并发防重叠队列） |
| **`Milvus/app.min.js`（轻量接入）** | 1. 在 `window.sendToLLM`（L798 起，覆盖通用中转站 + MiniMax + MCP 多轮调用）中接入 `beforeCall` / `recordCall` 埋点；<br>2. 在 `APISettingsPage` 的「API 存储库」（L134820）上方渲染 `window.ApiQuotaSettingsCard`；<br>3. 在应用根节点渲染 `window.ApiQuotaGlobalBanner`。 |
| **`index.html`（引入脚本）** | 在 `app.min.js` 之前加载 `Milvus/api_quota_app.js`。 |

---

## 二、核心数据结构设计（支持「站点 × 模型」精细化自定义）

### 1. 规则匹配键（Rule Key）
中转站常见场景是「同一个站点有多个模型（费率不同）」，或「不同站点有同名模型（如都有 `deepseek-chat`）」。因此规则主键设计为：
- **`ruleKey = normalizeSiteKey(url || name) + "::" + model`**
- 同时支持 **站点级默认兜底规则**（`normalizeSiteKey(url) + "::*"`），当用户切换到该站未单独配置的新模型时，也能按站点默认规则计费或仅做纯计数。

### 2. 存储结构（`localStorage` + IndexedDB 双写防丢失）
主存储键：`t8_api_quota_store_v1`

```json
{
  "enabled": false,
  "showGlobalBanner": true,
  "blockWhenExhausted": false,
  "onlyCountSuccess": true,
  "totalCalls": 128,
  "todayDate": "2026-11-21",
  "todayCalls": 14,
  "rules": {
    "https://api.example.com::deepseek-chat": {
      "id": "rule_1",
      "siteKey": "https://api.example.com",
      "siteName": "某公益中转站",
      "model": "deepseek-chat",
      "mode": "daily_count",          // "daily_count" | "total_count" | "balance" | "count_only"
      "dailyLimit": 50,               // 日限次数
      "dailyUsed": 8,                 // 今日已用
      "lastResetDate": "2026-11-21",  // 自动跨日重置锚点
      "totalLimit": 0,                // 总次数包上限
      "totalRemaining": 0,            // 总次数剩余
      "currency": "¥",                // 货币符号："¥" | "$" | "积分"
      "balance": 0,                   // 当前剩余金额
      "costPerCall": 0.05,            // 每次调用定额扣费
      "enableTokenBilling": false,    // 可选：按接口返回 usage Token 估算扣费
      "inputPricePer1M": 2.0,         // 输入单价（每百万 Token）
      "outputPricePer1M": 8.0,        // 输出单价（每百万 Token）
      "warnThreshold": 15,            // 低于 15% 时横幅变橙色预警
      "ruleTotalCalls": 42            // 该模型历史累计调用次数
    }
  },
  "recentLogs": [
    {
      "id": 1795258000000,
      "time": "2026-11-21 18:50:12",
      "siteName": "某公益中转站",
      "model": "deepseek-chat",
      "deltaText": "-1 次",
      "remainingText": "今日剩 42/50 次",
      "success": true,
      "tokens": 1420
    }
  ]
}
```

> **精度保护**：所有金额计算统一使用 `Math.round(val * 10000) / 10000`（保留 4 位小数内部计算，展示保留 2~4 位），彻底杜绝 JavaScript 浮点精度误差（如 `10 - 0.1 - 0.2 = 9.700000000000001`）。

---

## 三、UI/UX 交互设计

### 1. 「设置 → API 配置中心」顶部新增面板（位于「API 存储库」正上方）
- **未开启状态（简洁单行卡片）**：
  - 左侧：标题 **「API 次数总计」** + 累计调用徽章（如 `累计 128 次 · 今日 14 次`）
  - 右侧：滑动总开关（Switch）
- **开启状态（自动展开配置区）**：
  1. **总览数据条**：累计调用次数、今日调用次数、当前启用站点/模型的实时剩余额度（如 `deepseek-chat · 今日剩 42/50 次` 或 `余额 ¥14.92`）。
  2. **快捷操作栏**：
     - **`+ 配置当前模型额度`**：自动带入当前选中 API 配置的站点 URL、站点名与模型名，一键选择计费模式（**日使用次数 / 总次数包 / 余额扣费 / 仅计数**）并填写额度。
     - **`管理全部模型规则 (N)`**：查看/编辑/充值/删除所有已自定义的站点-模型规则。
     - **`调用流水`**：查看最近 50 条调用记录（时间、模型、扣减、剩余、Token 数），支持一键清零计数。
  3. **偏好微开关**：
     - 全局横幅通知（默认开）
     - 仅成功调用时扣减（默认开，避免 401/429/网络超时误扣）
     - 额度耗尽时拦截请求（默认关，仅红字强提醒；开启后余额/次数 ≤ 0 时弹窗拦截防止超支）

### 2. 全局顶部横幅通知（`ApiQuotaGlobalBanner`）
- **触发时机**：当总开关开启且 `showGlobalBanner === true` 时，全站任何页面（传讯、论坛、沙盘、方天水镜、学习系统、云镜、电台等）调用 AI 后自动触发。
- **视觉样式**：
  - 固定悬浮于屏幕顶部安全区下方（`position: fixed; top: 12px; left: 50%; transform: translateX(-50%); zIndex: 99999`），圆角毛玻璃胶囊风格，**外层 `pointer-events: none` 不阻挡用户操作**。
  - **三色状态语义**：
    - 正常（白/深灰极简风格）：`⚡ [中转站 · deepseek-chat] 本次 -1 次 · 今日剩余 42/50 次`
    - 余额模式：`💰 [中转站 · gemini-2.5-pro] 本次 -¥0.08 · 剩余 ¥14.92`
    - 低额度/耗尽预警（暖橙/警示红）：`⚠️ [某站 · claude-3.7] 剩余额度不足（仅剩 2 次），请及时充值或切换 API`
  - **展示时长**：默认 `3.2 秒` 自动淡出，支持轻点关闭。

---

## 四、技术难点与潜在问题解决方案

| 潜在问题 / 风险 | 根因分析 | 解决方案 |
| :--- | :--- | :--- |
| **1. MCP 工具调用引发单轮多次请求** | `window.sendToLLM` 内部在触发 MCP `tool_calls` 时会连续发起 2 次以上上游 `fetch` 请求。 | 在 `sendToLLM` 的每次真实 HTTP 请求返回处埋点（按真实中转站计费逻辑每次请求都扣钱/扣次），并在横幅中标注 `第 2 轮工具调用`，或在短时间（500ms）内合并横幅提示防止刷屏。 |
| **2. 请求失败（401/429/断网）是否误扣？** | 中转站报错通常不计费，若在发送前扣减会导致本地统计虚高。 | 默认采用 **「响应成功后扣减」**（`onlyCountSuccess = true`）：仅在 `response.ok` 且拿到有效回复时扣减次数/金额；失败时横幅仅提示 `调用失败（未扣减额度）`。 |
| **3. 跨自然日自动重置失效** | 用户网页开着过凌晨 0 点不刷新，`todayCalls` 和 `dailyUsed` 不会自动归零。 | 每次调用 `recordCall()` 或渲染卡片前，均执行 `ensureDailyReset()` 比对当前 `YYYY-MM-DD` 与 `lastResetDate`，一旦跨日立即重置 `todayCalls` 与所有 `daily_count` 规则的 `dailyUsed`。 |
| **4. 同一时刻并发多个 AI 请求横幅互相遮挡** | 如同时触发总结与聊天回复，多个横幅瞬间重叠。 | `ApiQuotaGlobalBanner` 采用 **最新覆盖 + 计数角标（或有序队列）** 机制，顶部永远只显示 1 条清晰胶囊，不叠罗汉。 |
| **5. API 站点 URL 格式不统一导致规则匹配失败** | 用户可能有时填 `https://xxx.com`、有时填 `https://xxx.com/` 或带 `/v1`。 | 编写 `normalizeSiteKey(url)`：统一转小写、去掉末尾 `/v1`、`/api/chat/completions` 与多余斜杠，提取规范化的 `origin + basePath` 作为匹配键。 |
| **6. 金额扣费浮点精度误差** | JS 二进制浮点运算易出现 `9.700000000000001`。 | 封装 `roundMoney(n) = Math.round(n * 10000) / 10000`，所有余额加减都经过该方法规范化。 |
| **7. 流式/非流式响应中 `usage` 字段缺失** | 许多中转站不返回 `data.usage`，若只依赖 Token 计费会失效。 | `balance` 模式默认支持 **定额单次扣费（`costPerCall`）**；当用户开启 Token 计费且响应含 `usage` 时优先按 Token 精确计算，缺失 `usage` 时无缝回退至 `costPerCall`。 |

---

## 五、分阶段实施路线（Implementation Roadmap）

### Phase 0（P0）：核心计数引擎 + 设置页卡片 + `sendToLLM` 埋点 + 全局横幅
1. 新建 `Milvus/api_quota_app.js`：
   - 实现 `window.apiQuotaTracker`（总开关、总计数、今日计数、跨日重置、按站点×模型规则匹配、4 种模式计算、浮点防误差、调用流水记录、自定义事件广播）。
   - 实现 `window.ApiQuotaSettingsCard`（挂载在「API 存储库」上方，含总计数字、开关、快捷配置当前模型额度弹窗）。
   - 实现 `window.ApiQuotaGlobalBanner`（极简顶部悬浮横幅，正常/预警/耗尽三色语义）。
2. 在 `index.html` 引入 `Milvus/api_quota_app.js`。
3. 在 `Milvus/app.min.js` 中：
   - 于 `APISettingsPage` 的「API 存储库」上方插入 `window.ApiQuotaSettingsCard`；
   - 于 `window.sendToLLM`（MiniMax 与通用 API 路径）接入成功/失败回调埋点；
   - 于主应用根节点挂载 `window.ApiQuotaGlobalBanner`。

### Phase 1（P1）：多模型规则管理中心 + 快速充值 + 调用流水明细
1. 新增「全部模型规则管理」弹窗：支持查看所有已配置的中转站与模型、独立修改单价/限额、一键充值（`+10 次` / `+¥10`）、手动校准剩余额度与删除规则。
2. 新增「最近调用流水」面板：展示时间、站点、模型、本次消耗、剩余额度与 Token 数，支持按今日/全部汇总与重置计数。

### Phase 2（P2）：Token 精确估算计费 + 耗尽拦截保护
1. 支持在 `balance` 模式下可选开启「按 `usage` Token 精确估算扣费」（自定义每百万输入/输出单价，无 `usage` 自动回退定额扣费）。
2. 支持可选开启「额度耗尽时拦截请求」：剩余额度 ≤ 0 时在发起请求前弹出明确提示，避免超额扣费。

---

## 六、验证清单（Verification）
1. **开关控制**：总开关关闭时，调用 AI 不弹全局横幅；开启后，每次调用 AI 顶部平滑弹出横幅并准确扣减对应模型的次数或余额。
2. **自定义规则**：分别为同一中转站下的两个不同模型（如 A 设日限 20 次、B 设余额 ¥10 每次扣 ¥0.05）配置规则，切换模型后各自独立扣减互不串台。
3. **跨日重置与持久化**：刷新页面后总计数、余额与流水完整保留；模拟跨日后 `daily_count` 规则自动恢复满额。
4. **失败不误扣**：故意填写错误 Key 触发报错，确认不会误扣余额/次数。
