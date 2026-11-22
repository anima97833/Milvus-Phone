# 离线 H5 性能优化

适用于在 App 容器内分发的离线 H5 资源包，包括普通表单、内容工具、复杂业务和游戏。先用性能记录找出慢在哪一段，再选择对应章节。小红书小工具以 [ZIP 规范](../zip-artifact-spec.md)、[性能预算](../performance-budget.md) 和 [公开容器文档](https://miniapp-sandbox.xiaohongshu.com/minitool/doc) 为准。其他容器需要重新确认入口、文件类型、CSP、联网和兼容边界。

## 按瓶颈查阅

| 现象或任务 | 章节 | 优先看什么 |
| --- | --- | --- |
| 长列表滚动掉帧、切换视图卡顿 | [DOM 与布局](./dom.md) | 节点数量、同步布局、挂载批次 |
| CSS 动画卡顿或旧内核样式异常 | [CSS 标准与渲染](./css.md) | 布局和绘制成本、兼容回退 |
| 主包大、详情图或字体加载失败 | [资源文件与平台托管](./asset-delivery.md) | 主包强依赖、资源外移、弱网降级 |
| 大型原始素材、游戏关卡或远端资源分发 | [OSS 管理与分发](./oss.md) | 构建期取材、平台托管、版本化分发 |
| ZIP 小但解压后很大、图片加载后内存上涨 | [资源体积与内存](./asset-size.md) | 解压体积、首屏加载字节、解码成本 |
| 迁移 Vite / webpack 或准备发布 | [生产构建与压缩](./build.md) | 经典脚本、分包、minify / mangle、最终 ZIP |
| 复杂业务或游戏启动白屏、加载期间无法操作 | [脚本与分阶段启动](./startup.md) | `index.html` 首屏、defer / async / await、首个可玩关卡 |
| 需要对比首屏、点击、帧率或启动回归 | [指标与真机验收](./metrics.md) | FP / FCP、核心就绪、帧时间、冷暖启动 |
| 3D 场景初始化重、发热或渲染中断 | [Canvas / WebGL 与 3D](./graphics.md) | 分辨率、批处理、GPU 生命周期 |

## AI 助手执行顺序

1. **改前取基线。** 列出 ZIP 体积、解压后最大文件、首屏必需资源、目标端与核心操作。可运行时用同一设备、包版本和场景记录首屏及核心就绪时间。只有源码时记录可静态确认的数据，动态项标为未实测。
2. **按阶段分配预算。** 出码前先明确入口 HTML 能直接显示什么、哪些资源确实要挡在首屏前，以及核心操作何时可用。普通工具先确保主要操作尽快可用。复杂业务和游戏拆为壳可见、核心可用／首关可玩、后续功能就绪。为阶段定义依赖、失败回退、耗时与资源预算，逐项处理主线程、解码与 GPU 瓶颈。涉及必须断网可用的任务时，把核心路径依赖保留在主包。
3. **做一轮可比较的变更。** 优先删无用代码和资源、延迟非必要工作，再调分包和压缩。同一套功能前后对照，记录 ZIP、解压、首屏请求与关键指标的变化。已存在的工具链优先复用。
4. **在正确时机打包。** 开发迭代用调试产物定位问题。用于体验、测量或发布的 ZIP 在本轮功能及资源稳定后由干净的生产构建生成。改源码或资源后重建、审计并重新压 ZIP，性能验收以实际待交付产物为准。
5. **验证并交付。** 按性能预算审计目录和 ZIP，验证资源路径、启动顺序、核心流程、加载失败和后台恢复。记录包哈希、设备、版本、网络、样本和结论。区分静态、本地浏览器、平台模拟器和真机证据。

## 行业资料

| 主题 | 参考来源 |
| --- | --- |
| 脚本加载顺序 | [WHATWG HTML Standard · Scripting](https://html.spec.whatwg.org/multipage/scripting.html) |
| 布局和长任务 | [Chrome 团队 · Layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)、[Optimize long tasks](https://web.dev/articles/optimize-long-tasks) |
| CSS 优化 | [W3C · CSS Containment Level 2](https://www.w3.org/TR/css-contain-2/)、[Chrome 团队 · High-performance CSS animations](https://web.dev/articles/animations-guide) |
| 平台资源分发 | [小红书 · 静态资源优化策略](https://miniapp-sandbox.xiaohongshu.com/minitool/doc#s2-7) |
| 生产构建 | [Vite · Build Options](https://vite.dev/config/build-options.html)、[webpack · Code Splitting](https://webpack.js.org/guides/code-splitting/)、[Terser · Options](https://terser.org/docs/options/) |
| 性能指标 | [W3C · Paint Timing](https://www.w3.org/TR/paint-timing/)、[User Timing](https://www.w3.org/TR/user-timing/)、[Chrome 团队 · Web Vitals](https://web.dev/articles/vitals) |
| 图形渲染 | [MDN · WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) |
