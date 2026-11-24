# 「主屏小组件 2.1」名士语录排版升级 & 多图平滑轮播相册技术策划案

> **架构铁律**：严格遵循 **独立模块化引擎 + 轻量埋点接入** 原则。
> - `Milvus/app.min.js` **0 行新增改动**；
> - 全部多图媒体数据继续存储在独立 IndexedDB（`milvus_home_widgets_idb` → `widget_media` 表），**零 `localStorage` 新增写入**；
> - 全部操作图标维持 **手绘矢量 SVG（零 Emoji）**。

---

## 一、 整体改动文件规划

| 文件路径 | 职责定位 | 改动方式 |
| :--- | :--- | :--- |
| `Milvus/app.min.js` | 主屏与设置中心入口 | **零改动**（0 行） |
| `Milvus/home_widget_css.js` | 补充 `.hw-quote-body`、`.hw-quote-list`、`.hw-photo-track`、`.hw-photo-dots` 等语义类名至默认 CSS 模板，确保自定义 CSS / 5 套通用预设完美兼容 | 轻量增量 |
| `Milvus/home_widget_ui.js` | ① 重构 `char_quote` 名士语录组件（`2×2` 智能正居中、`2×1` 长句无遮挡自动平滑滚动、多行与 `•` 项目符号黑点清单支持）；② 重构 `photo` 相册组件（多图上传存 IDB、缩略图管理、平滑横移 Slide / 淡入淡出 Fade 自动轮播 + 卡片内手势切图） | 核心升级 |
| `index.html` | 刷新 `home_widget_css.js` 与 `home_widget_ui.js` 的 `?v=` 版本戳 | 仅更新版本号 |

---

## 二、 升级模块 A：名士语录签（`char_quote`）精细排版方案

### 1. 解决 3 大现存痛点
| 痛点 | 根因 | 精准解决方案 |
| :--- | :--- | :--- |
| **`2×2` 四格时单句话沉底左偏，不能居中** | 外层 `.hw-surface` 默认 `justify-content: space-between`，文案区没有 `flex: 1` 独立居中容器 | 将正文区包裹在独立的 `.hw-quote-body`（`flex: 1; display: flex; align-items: center; justify-content: center;`）中：**单句/无黑点诗句**在 `2×2` 自动**水平 + 垂直正居中**，如诗签般雅致 |
| **`2×1` 二格时长句被直接截断遮挡** | 之前写死了 `-webkit-line-clamp: 2; overflow: hidden;`，超出两行直接消失 | 在 `2×1`（及任意内容超出容器高度时）移除硬截断，改为 **双模式无遮挡阅读**：① 若文字超长自动启用**温和慢速纵向/横向平滑滚动**（或可触摸上下轻滑阅读完整句）；② 轻点语录正文可弹出极简「名士完整语录赏析」轻浮窗，一字不漏 |
| **不支持换行与项目符号黑点（`•`）** | 设置页此前是单行 `<input type="text">` 且未解析行首符号 | 设置页升级为 **多行 `<textarea>`** + 工具栏一键插入 **`• ` 黑点** 按钮 + 对齐切换（`智能居中` / `左对齐`）；渲染层自动解析换行与行首 `- ` / `* ` / `• `，输出规范悬挂缩进的黑点清单（`.hw-quote-list` + `.hw-quote-bullet`） |

### 2. 智能排版规则（开箱即美观）
- **单行/短诗句（无换行且无 `•`）**：在 `2×2` 下自动 `text-align: center` + 垂直居中，字号适当放大至 `14px`、`line-height: 1.65`。
- **多行 / 带黑点清单（含 `\n` 或行首 `•` / `- ` / `* `）**：渲染为每行独立 `flex` 条目（左侧 4.5px 实心圆点 + 右侧正文自动换行对齐，绝不出现第二行顶到黑点下面的丑陋错位），整体在卡片中垂直居中。
- **`2×1` 紧凑格适配**：头部头像名栏压缩至单行 `20px` 高度，正文区占满剩余 `~46px` 空间；若正文字符数 `> 18` 或多行，自动开启平滑慢滚（`scroll` / 可选柔缓动画），完整呈现不遮挡。

---

## 三、 升级模块 B：自由相册小组件（`photo`）多图平滑轮播方案

### 1. 数据模型（100% 向下兼容旧单图存档）
- 新增 `config.mediaIds: string[]`（保存多张图片的 IndexedDB `mediaId` 数组，单相册上限 12 张，防止内存膨胀）；
- 兼容读取：`const ids = Array.isArray(cfg.mediaIds) && cfg.mediaIds.length ? cfg.mediaIds : (cfg.mediaId ? [cfg.mediaId] : []);`，老用户之前上传的单张团子相框无缝保留、零丢失；
- 新增可选配置：
  - `config.intervalSec`: 自动轮播间隔（`0` = 仅手动切换，默认 `5` 秒，可选 `4s` / `6s` / `10s`）；
  - `config.transition`: 切换动效（`"slide"` 平滑横移推拉（默认） / `"fade"` 柔焦淡入淡出）。

### 2. 平滑移动切换引擎（零闪烁、不与主屏翻页打架）
- **平滑横移轨道（Slide）**：
  - 所有已加载图片横向排列在同一条 `flex` 轨道 `.hw-photo-track` 中，每张图宽 `100%`、`flex-shrink: 0`；
  - 通过 `transform: translate3d(-${activeIdx * 100}%, 0, 0)` + `transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)` 实现 GPU 硬件加速的丝滑移动切换，绝不白屏闪烁！
- **多图手势防冲突**：
  - 在相册卡片内左右轻滑（位移 `> 24px`）直接平滑切换上一张 / 下一张，且在 `onPointerDown` / `onPointerMove` 严格 `stopPropagation()`，避免误触发主屏幕左右翻页；
  - 底部浮现极简微距指示点（`.hw-photo-dots`，当前页拉长为小胶囊白点，其余为半透明小圆点；仅 1 张图时自动隐藏）；
  - 页面切到后台（`document.hidden`）自动暂停轮播定时器，省电防发热。

### 3. 设置页「多图相册管理器」
在「小组件」设置页选中某个自由相框后：
- **「+ 批量上传照片（存 IndexedDB）」**：`<input type="file" accept="image/*" multiple />`，支持一次多选或继续追加，每张自动经 Canvas 温和压缩至长边 `≤ 960px` 后存入 `milvus_home_widgets_idb`；
- **缩略图管理条**：横向展示已上传的所有照片缩略图，支持点击左右微调顺序、点右上小 `×` 删除单张（同步清理 IDB 对应媒体记录释放空间）；
- **轮播控制胶囊**：`切换动效：平滑横移 / 柔焦淡入` + `轮播速度：手动 / 4秒 / 6秒 / 10秒`。

---

## 四、 潜在技术难题与针对性解决方案

| 潜在问题 | 根因分析 | 解决方案 |
| :--- | :--- | :--- |
| **1. 多图相册同时加载 10 张大图导致主屏卡顿** | 一次性解码过多未压缩原图会占用手机内存 | 上传时统一压缩至 `≤960px`（每张 ~70KB），并在组件卸载时清理定时器；单相册限制上限 12 张 |
| **2. 在相册卡片上左右滑切图，结果把整个主屏幕翻到了第 2 页** | 主屏外层 `page-r2` 监听了 `onPointerDown` / `onPointerUp` 做翻页 | 相册内层触摸/指针事件在 `pointerdown` / `pointerup` 严格 `stopPropagation()`，并独立计算卡片内水平滑动距离 |
| **3. 5 套内置 CSS 预设里的 `.hw-surface *` 影响黑点或轮播圆点颜色** | 通用预设写了 `.hw-surface * { color: ... !important; }` | 黑点采用 `background-color: currentColor`（自动跟随每套预设的文字色，融为一体！），相册指示点显式设置高对比半透明白点与轻微投影，在任意深浅照片上都清晰精致 |
| **4. `2×1` 语录自动滚动时用户想停下来看某一句** | 持续动画无法暂停阅读 | 触摸/悬停自动 `animation-play-state: paused`，且轻点语录即可弹出完整赏析卡片 |

---

## 五、 实施与验收计划（单阶段高效落地）

由于本次全部聚焦在 `Milvus/home_widget_ui.js` 与 `Milvus/home_widget_css.js` 两个独立模块（`app.min.js` 零改动），可直接分为清晰的 **Phase 0（样式类名与排版升级）→ Phase 1（多图平滑相册与验收）** 或一步到位实施：

1. **升级 `Milvus/home_widget_css.js`**：为 `char_quote` 与 `photo` 模板补充 `.hw-quote-body` / `.hw-quote-bullet` / `.hw-photo-track` / `.hw-photo-dots` 类名注释。
2. **升级 `Milvus/home_widget_ui.js`**：
   - 完成 `char_quote` 的 `2×2` 智能居中、`2×1` 长句防遮挡平滑滚动/点击赏析、多行 `<textarea>` + 一键插入 `•` 黑点与规范清单渲染；
   - 完成 `photo` 的多图批量上传（存 IDB）、缩略图排序/删除、平滑横移 Slide / 柔焦 Fade 自动轮播与卡片内左右轻滑切图。
3. **验收**：`node --check` 零报错 + 零 Emoji 校验 + 兼容旧单图 `mediaId` 断言测试通过。

---

> **请审阅**：如认可上述方案，回复 **「开始实施」** 即可立刻落地这两项升级！
