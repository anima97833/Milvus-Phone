# 广陵联播 6.0 —— 行程轨迹、团建密档与驿路风物联动策划案（`implementplan.md`）

> 架构原则：严格坚持 **独立模块化引擎 + 轻量埋点接入**，`Milvus/app.min.js` **0 行改动**；全部新增采集逻辑收敛在独立采集插件 `Milvus/guangling_news_collectors.js` 中，100% 只读、零新增 `localStorage` 写入、零 Emoji。

---

## 一、三大新血液栏目全景（全部源码核验真实存储路径）

| 栏目 ID | 导播台分组 | 播报栏目名 | 真实数据源与存储路径（只读） | 播报编排与《朋友收集》风格 |
| :--- | :--- | :--- | :--- | :--- |
| `charTrajectory` | 私密互动圈 | **传讯 · 角色行程轨迹** | 零侵入只读 `milvus_couple_daily_q_idb` → `trajectories` 表（`CoupleDailyQEngine.cacheTrajectory` 写入，结构 `{ id, charId, dateStr, events: [{ time, title, description, category }] }`） | **【广陵行踪速递】**：随机抽选一位已有行程轨迹的角色，精选其中 2~3 个时辰节点播报今日/近期动向（如「上午辰时核对账册，下午申时赴城南茶肆」），画面感极强 |
| `teamBuildingArchive` | 私密互动圈 | **游戏 · 团建档案（真心话/赠礼）** | 只读 `localStorage["t8_teambuilding_character_truth_qa"]`（`{ [charId]: [{ q/question, a/answer }] }`）与 `localStorage["t8_teambuilding_character_given_gifts"]`（`{ [charId]: [{ name, reason/desc }] }`） | **【团建密档爆料】**：随机抽取一位有档案记录的名士，交替播报他/她的「真心话招供回顾」（先抛问题再揭晓回答）或「赠送给你的好礼与赠礼缘由」 |
| `yilutongRoute` | 广陵公共新闻 | **游戏 · 驿路通历史路线** | 只读 `window.yilutongStore.get("yilutong_route_history")`（数组，每条含 `startPoint.{region,county}`、`endPoint.{region,county}`、`transport`、`routeData.{days, feasible, customs, situations}`） | **【东汉驿路通 · 交通与风物】**：播报历史规划的「起点 → 终点」、乘坐工具、预计耗时与沿途风土人情/特产（`routeData.customs`），还原新闻台「交通旅游播报」环节 |

---

## 二、潜在技术问题与工程化解决方案

| 潜在问题 | 根因分析 | 本方案的工程化对策 |
| :--- | :--- | :--- |
| **① `trajectories` 表存在 `latest_<charId>` 与 `<charId>_<date>` 双份重复记录** | `CoupleDailyQEngine.cacheTrajectory` 每次会同时写入精确日期键和 `latest_<charId>` 键，直接 `getAll()` 会导致同一份轨迹被翻倍抽取。 | 采集器按 `charId + dateStr` 去重（优先保留非 `latest_` 的日期记录，若只有 `latest_` 则保留 `latest_`），确保每个角色每天轨迹权重均等。 |
| **② 角色从未生成过行程轨迹 / 团建档案为空 / 驿路通无历史** | 新存档或尚未游玩对应模块时，数据源为空数组或对象。 | 1. 沿用 `safeReadForeignIDB`（绝不误建空库、绝不抛 `VersionError`）；<br>2. 三个采集器在无真实数据时安静返回 `null`，由 `composeOfflineEpisode` 自动跳过并让位给其他有内容的栏目，**绝不编造假数据、绝不阻断播报**。 |
| **③ 团建档案中 `t8_teambuilding_character_truth_qa` 字段名兼容** | 不同版本或用户自定义条目中，问题字段可能是 `q` / `question` / `title`，回答可能是 `a` / `answer` / `reply`；礼物可能是 `name` / `title` 与 `reason` / `desc` / `description`。 | 编写宽容解包逻辑并通过 `cleanText()` 防 `[object Object]` 过滤，同时用 `buildCharNameMap()` 将 `charId` 准确还原为名士中文名。 |
| **④ 驿路通「风土人情（`customs`）」字数较长导致字幕溢出** | `routeData.customs` 往往有 80~150 字，塞进单条字幕会影响阅读节奏。 | 第一屏简明播报「起终点 + 乘坐工具 + 耗时 + 路况评级」，第二屏起调用 `splitIntoBroadcastChunks(customs, 54).slice(0, 2)` 分屏播报风土人情与特产，紧凑不拖沓。 |
| **⑤ 栏目总数增至 14 项后，导播台与单期节奏管理** | 勾选栏目越多，单期联播越容易变长。 | 1. 现有「每期精选容量（精简 3 栏 / 标准 4 栏 / 全量播报）」与 `lastServedSectionIds` 轮播避重机制天然兼容 14 项栏目；<br>2. 导播台「广陵公共新闻 / 私密互动圈」双列网格自动承接新条目，无需额外弹窗或复杂交互。 |

---

## 三、文件规划与分阶段实施计划

### 文件改动清单（`Milvus/app.min.js` 保持 **0 改动**）
```text
Milvus/
├── guangling_news_collectors.js  [扩展]
│     ├── collectCharTrajectoryItem()     # 传讯 · 随机角色行程轨迹（milvus_couple_daily_q_idb -> trajectories）
│     ├── collectTeamBuildingArchiveItem()# 游戏 · 团建档案（真心话回顾 + 赠送礼物）
│     ├── collectYilutongRouteItem()      # 游戏 · 高德驿路通（地点、工具、耗时、风土人情）
│     └── collectAllExtra() & composeExtraSectionEntries() 挂载上述 3 项（含防连续重复记忆）
├── guangling_news_engine.js      [轻量扩展]
│     └── DEFAULT_SOURCES & SOURCE_META 新增 3 个栏目元数据（区分 public / private）
└── index.html                    [轻量刷新] 更新模块缓存版本号
```
> 注：`Milvus/guangling_news_studio.js` 的导播台第 1 区已动态遍历 `eng.SOURCE_META` 按 `group` 分组渲染，因此只需在 `guangling_news_engine.js` 注册这 3 项元数据，导播台即可**零改动自动呈现**！

### 阶段一：三大新采集器与编稿实现 + 单元测试
1. 在 `Milvus/guangling_news_collectors.js` 中新增：
   - `collectCharTrajectoryItem(opts)`（支持去重、精选 2~3 个时辰节点、角色名还原）
   - `collectTeamBuildingArchiveItem(opts)`（合并真心话与赠礼双池、角色名还原、防 `[object Object]`）
   - `collectYilutongRouteItem(opts)`（读取 `window.yilutongStore.get("yilutong_route_history")`、提取起终点/工具/耗时/风土人情）
   - 在 `collectAllExtra` 与 `composeExtraSectionEntries` 中编排分屏台词并加入 `lastPickedExtra` 防连续重复记忆。
2. 在 `Milvus/guangling_news_engine.js` 的 `DEFAULT_SOURCES` 与 `SOURCE_META` 中注册：
   - `yilutongRoute`（`group: "public"`）
   - `charTrajectory`（`group: "private"`）
   - `teamBuildingArchive`（`group: "private"`）
3. 刷新 `index.html` 中 `guangling_news_collectors.js` 与 `guangling_news_engine.js` 的缓存版本号。
4. 验收测试：`node --check` 语法、零 Emoji、零 `localStorage` 写入，以及 Node `vm` 沙箱模拟全部 3 个真实数据结构（含空数据安全跳过与防重复轮换）全量断言通过。
