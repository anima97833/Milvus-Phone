# 广陵联播 5.0 —— 名士人设 AI 精编 & 克隆音色真声播报策划案（`implementplan.md`）

> 架构原则：严格坚持 **独立模块化引擎 + 轻量埋点接入**，`Milvus/app.min.js` **0 行改动**，零新增 `localStorage` 写入（全部配置存于现有 IndexedDB `milvus_guangling_news_idb`），零 Emoji，并最大限度复用项目已有的 `window.sendToLLM`、`window.getWorldBookContext()` 与 `window.VoiceStudioEngine`。

---

## 一、现状诊断与核心目标

### 1. 为什么「AI 精编」目前没有真正生效？
- 在 `Milvus/guangling_news_engine.js` 中，旧版 `generateAiEpisode` 探测的是 `window.callAI`；而小手机主程序真正挂载的全局模型接口是 **`window.sendToLLM(messages, { disableMCP: true }, onSuccess, onError)`**。
- 此外，旧版提示词仅传了主播名字，**尚未注入名士 6 维角色配置与用户开启的世界书条目**，导致无法真正用该名士的性格、语言风格与世界观口吻重述新闻。

### 2. 为什么接入「克隆音色 / `voiceId`」可以零重复造轮子？
- 项目已内置独立全栈语音模块 `Milvus/voice_studio_engine.js`（导出 `window.VoiceStudioEngine`），天然支持 **Fish Audio（鱼声）/ MiniMax 海螺 / ElevenLabs** 三家一线 TTS 克隆音色、按角色 `getCharVoice(charId)` 绑定、iOS 静音预热（`primeVoiceAudio`）以及 **150MB IndexedDB 音频 Blob 缓存**。
- 广陵联播只需通过轻量适配层桥接 `VoiceStudioEngine`，并支持用户在导播台**直接指定或覆盖自定义 `voiceId`**，即可一键升级为「名士本人克隆真声播报新闻」！

---

## 二、功能与技术方案详解

### 模块 A：名士 6 维人设 + 开启世界书 AI 精编引擎

1. **统一 6 维角色上下文采集（与 `couple_daily_q_engine.js` 保持 100% 统一口径）**
   新建只读辅助函数 `collectAnchorPersonaContext(anchorCharId, anchorName)`：
   - 合并读取 `window.chatCharacterStore.getAll()` 与 `localStorage["character_settings"]`，提取选定播报员的完整 6 维人设：
     1. **角色姓名与 ID**（`name` / `id`）
     2. **MBTI 性格类型**（`mbti`）
     3. **星座**（`constellation` / `zodiac`）
     4. **语言风格**（`speakingStyle` / `style`）
     5. **性格特点**（`personality` / `desc`）
     6. **个人背景**（`background` / `bio`）
   - 读取用户在「设置 → 世界书设置」中**当前开启的世界书条目**：调用全站标准接口 `await window.getWorldBookContext()`（截断上限 1200 字，避免挤占上下文窗口）。
   - 同步读取当前用户身份人设（`user_personas` / `active_persona_id`），使主播自然称呼用户（如「殿下 / 广陵王」）。

2. **高质量「名士主播台词」Prompt 与安全解析**
   - **输入素材**：直接使用当前演播厅刚刚采集并展示的真实联播事实（保留名人小报、超话、传讯、绣衣楼公告/问卷、太疾驰、朋友圈、情侣空间等具体人名与事件，不凭空捏造）。
   - **System Prompt**：要求模型完全代入该名士的 6 维人设（MBTI、星座气质、语言风格、性格特点、背景经历）并严格遵循已开启的世界书设定；以《朋友收集》新闻台的轻松灵动节奏，用名士自己的口吻播报本期新闻。
   - **输出格式约束**：输出 6~9 条简短中文播报台词，每条单独一行（20~56 字），严禁序号、Markdown、舞台括号动作说明或任何 Emoji；若输出了带编号/JSON 格式，解析器自动清洗剥离。
   - **调用与容错**：通过 `window.sendToLLM(messages, { disableMCP: true }, onSuccess, onError)` 发起请求，配 **90 秒超时保护**；调用失败或未配置 API 时优雅回退离线稿，并通过 Toast 清晰告知用户原因。

### 模块 B：克隆音色（`voiceId`）真声播报接入

1. **语音模式升级为 5 选 1**
   在 `Milvus/guangling_voice_engine.js` 中新增第 5 种模式 **`"clone"`（克隆音色）**：
   - `animalese`（动森狸语）
   - `clone`（**克隆音色 / `voiceId` 真声播报**）
   - `webspeech`（系统浏览器真人口播）
   - `blip`（复古电子音）
   - `mute`（静音）

2. **双层 `voiceId` 解析优先级（开箱即用 + 自由覆盖）**
   - **优先级 1**：用户在广陵联播导播台手动填写的「自定义克隆 `voiceId`」（支持按当前主播单独记住在 `anchorVoiceMap[charId].cloneVoiceId`）。
   - **优先级 2**：自动读取全站 `window.VoiceStudioEngine.getCharVoice(anchorCharId)` 中该名士已绑定的克隆音色（若用户之前在「语音工坊 / 传讯设置」里给这位角色配过音色，选他当主播时**自动继承，无需重复填写**！）。

3. **克隆音色播报流程与无缝体验优化**
   - **合成与播放**：调用 `VoiceStudioEngine.synthesizeForCharacter`（传入 `overrideVoiceId` 或角色音色配置），返回本地缓存的 Blob URL 后通过 `HTMLAudioElement` 播放；播放期间按文本长度与音频时长平滑推进底部水晶字幕并触发 `onSyllablePulse` 主播立绘律动。
   - **下一句静默预合成（Look-ahead Prefetch）**：当正在播放第 `i` 句时，后台静默预请求第 `i + 1` 句存入 `VoiceStudioEngine` 的 IndexedDB 缓存；用户点击翻页时直接命中缓存 **0 延迟秒出声**！
   - **零卡死自动降级**：若未在语音设置中填写 Fish / MiniMax / ElevenLabs API Key、或余额不足/网络超时，单句自动无缝降级为「动森狸语」继续播报当前句，同时给出轻量提示，绝不卡住字幕或静默报错。

---

## 三、潜在技术问题与工程化对策

| 潜在问题 | 触发场景与根因 | 工程化对策 |
| :--- | :--- | :--- |
| **① 克隆音色首句等待延迟（1.5–4s）** | 云端 TTS 合成需要网络往返，若干等音频回来再出字幕，界面会像卡死。 | 1. 合成期间在字幕栏左上角显示轻量状态徽章 `音色合成中...`；<br>2. 启用**下一句静默预合成**（`prefetchLine(nextText)`），从第 2 句起全部命中本地 Blob 缓存毫秒开播；<br>3. 若合成超过 12 秒无响应，自动熔断降级至动森狸语。 |
| **② 切句 / 关窗导致克隆音频残留串音** | 用户在云端合成尚未返回时连点「下一句」或关闭演播厅，旧请求回调回来后突然开始放音。 | 所有异步合成均绑定 `playSessionId` 递增令牌；请求返回时若 `sessionId !== this.playSessionId` 直接丢弃不播放，且 `stop()` 立即 `pause()` 并释放旧 `HTMLAudioElement` 与 `URL.revokeObjectURL`。 |
| **③ `VoiceStudioEngine` 仅支持已保存角色音色，未暴露临时 `overrideVoiceId`** | 需确认 `VoiceStudioEngine.synthesizeForCharacter` 是否接受临时 `voiceId` 参数；若不接受则无法覆盖。 | 阶段一先核查 `synthesizeForCharacter` 参数签名：若支持直接透传；若仅从 `char_voices` 读取，则通过 `VoiceStudioEngine.getCharVoice` 临时合并配置或在 `guangling_voice_engine.js` 中复用 `VoiceStudioEngine.getConfig()` 轻调对应厂商接口（不侵入修改 `voice_studio_engine.js` 破坏原逻辑）。 |
| **④ AI 精编消耗时间较长（10–30s），期间用户误点多次** | LLM 生成 6–9 条带人设台词耗时较长。 | 按钮保持 `aiLoading` 禁用态并显示「名士撰稿中...」；完成后自动将精编稿写入当日归档并重播入场镜头，同时在导播台标注本次 AI 精编所引用的上下文徽章（如 `已注入：6维人设 · 世界书`）。 |
| **⑤ `customScript` 或选「默认猫嘴主播」时点击 AI 精编** | 未指定具体名士角色时没有 6 维人设。 | 若选的是默认主播，自动以「广陵联播金牌值班主播（机敏风趣、熟悉广陵掌故）」+ 开启的世界书条目进行 AI 精编，同样可用不报错。 |

---

## 四、文件规划与分阶段实施计划

### 文件改动清单（`Milvus/app.min.js` 保持 0 改动）
```text
Milvus/
├── guangling_news_engine.js    [扩展]
│     ├── collectAnchorPersonaContext()  # 6 维角色配置 + getWorldBookContext() + 用户人设采集
│     ├── callGuanglingLLM()             # 真实对接 window.sendToLLM（90s 超时 + 容错）
│     ├── generateAiEpisode()            # 基于当前新闻素材 + 6维人设 + 世界书重写名士口吻台词
│     └── DEFAULT_VOICE_SETTINGS         # 新增 cloneVoiceId、clonePrefetch 字段
├── guangling_voice_engine.js   [扩展]
│     ├── 新增 mode: "clone" 克隆音色播放管线（对接 window.VoiceStudioEngine）
│     ├── 新增 prefetchLine(text) 下一句静默预合成
│     └── 超时/缺 Key 自动无感降级动森狸语 + sessionId 防串音
└── guangling_news_studio.js    [轻量埋点]
      ├── 顶部「AI 精编」按钮对接真实名士人设撰稿并展示注入来源提示
      ├── 翻页时自动调用 voiceEngine.prefetchLine(lines[lineIndex + 1])
      └── 导播台「3. 语音播报与主播声线」新增「克隆音色」模式、自定义 voiceId 输入框与自动继承角色音色状态显示
index.html                      [轻量刷新] 更新模块缓存版本号
```

### 阶段一：真实 AI 精编引擎 & 克隆音色语音引擎开发
1. 核查 `VoiceStudioEngine.synthesizeForCharacter` 的参数接口，确保零侵入无缝对接 `customVoiceId` 与角色已绑定音色。
2. 升级 `Milvus/guangling_news_engine.js`：实现 `collectAnchorPersonaContext()`、`callGuanglingLLM()`（真实调用 `window.sendToLLM`）与 `generateAiEpisode()`，并扩展 `DEFAULT_VOICE_SETTINGS` 的 `cloneVoiceId` / `clonePrefetch` 字段。
3. 升级 `Milvus/guangling_voice_engine.js`：实现 `mode === "clone"` 播放管线、`prefetchLine()` 静默预合成、超时自动降级动森狸语与 `playSessionId` 防串音。
4. 阶段一验收：`node --check` 语法、零 Emoji、零 `localStorage` 写入，以及 `vm` 沙箱单测（模拟 `sendToLLM`、`getWorldBookContext`、6 维角色人设与 `VoiceStudioEngine` 克隆播报/降级流程）。

### 阶段二：导播台克隆音色面板 & 演播厅预合成联动
1. 升级 `Milvus/guangling_news_studio.js`：
   - 导播台语音模式新增 **`克隆音色`** 胶囊；选中后展示当前主播在语音工坊的绑定状态，并提供 **自定义 `voiceId` 输入框**（留空自动沿用角色在语音工坊已绑定的音色）+ 预合成开关 + 「试听一句」。
   - 演播厅播报第 `i` 句时自动静默预合成第 `i + 1` 句，字幕左上角优雅显示合成中状态；AI 精编按钮传入当前已采集的真实新闻稿供名士用自己口吻重述，并提示注入的人设与世界书状态。
2. 更新 `index.html` 缓存版本号。
3. 阶段二验收：全模块语法、零 Emoji、零 `localStorage` 与集成断言验证。
