# 指标与真机验收

把容器打开到页面执行、页面绘制、业务可用、持续交互分开记。浏览器内计时的原点是导航时间，容器下载、解包、创建 WebView 等若发生在导航前，需要容器或外部测量。

| 阶段 | 指标 | 采集与解释 |
| --- | --- | --- |
| 容器启动 | 打开动作 → 导航开始，主包下载与解包耗时 | 有宿主记录时拆分，否则记为不可观测。可用同一录屏方法测打开到核心可用的端到端时间 |
| 首次绘制 | FP、FCP；普通内容页可选 LCP 和 CLS | FP 是首次 paint，FCP 是首次内容 paint。LCP 与 CLS 分别描述大内容绘制与布局稳定性。骨架出现后继续测核心就绪。API 缺失记未支持，不填 0 |
| 业务启动 | 入口开始、核心就绪、首关可玩、非关键资源就绪 | 用业务 mark 分段，记录失败阶段。首关至少已绑定输入并完成可玩的首个场景绘制 |
| 交互 | 搜索、点击、拖拽的耗时，支持时采 INP、长任务 | INP 反映页面交互响应；应用标记可量业务处理阶段。API 不支持时用 trace 或录屏，保留各自口径 |
| 游戏与图形 | 提交帧数／秒、帧间隔 p50/p95、超预算帧比例、降档次数 | 使用前台稳定运行窗口，排除预热、隐藏及按需渲染空闲；应用提交节奏与实际呈现用不同指标 |
| 资源 | ZIP、解压后字节、关键路径资源、图片解码、内存 | 记录缓存和网络条件；宿主主包与 GPU 内存仅在确有数据时填写 |

以下代码放在外置脚本中，适用于采集环境具备相应 API 时。各标记每轮只打一次，`core-ready` 放在真实就绪处。读取 paint 条目安排在启动后或测试结束时，未出现的条目保留缺失。业务 mark 记录业务时间，不替代实际绘制证据。

```js
function markStartup(name) {
  if (window.performance && typeof performance.mark === 'function') {
    performance.mark('tool:' + name);
  }
}

function readStartup() {
  if (!window.performance || typeof performance.getEntriesByType !== 'function') {
    return { supported: false };
  }
  const result = { supported: true };
  performance.getEntriesByType('paint').forEach(function (entry) {
    result[entry.name] = entry.startTime;
  });
  performance.getEntriesByType('mark').forEach(function (entry) {
    if (entry.name.indexOf('tool:') === 0) result[entry.name] = entry.startTime;
  });
  return result;
}

// 入口运行时调用 markStartup('entry')。
// 核心操作可用后调用 markStartup('core-ready')。
// 游戏首个场景实际可玩后另记 markStartup('first-playable')。
```

持续渲染时仅在实际提交一帧后记录时间戳。在固定前台窗口统计提交次数除以秒数，同时用帧间隔定位抖动。30 FPS 对应约 33.3 ms 一帧，60 FPS 对应约 16.7 ms 一帧。记录目标档位和刷新率，按 [WebGL 预算](../performance-budget.md) 判断是否降档。测实际呈现用可用的设备或浏览器性能工具。采样限制内存和频率，退出后停止采样。

## 对照测试

- 记录同一构建的 ZIP 哈希、设备、系统／客户端／WebView 版本、画质、网络、缓存状态与场景。用固定脚本或步骤分别测冷启动、暖启动、弱网、离线、前后台恢复及连续操作。
- 优化前后使用同样的采样条件，报告样本量和中位数，样本充足时再报尾部百分位。浏览器、模拟器和 Android／iOS 真机分别出结果。FPS 需附测试场景、窗口和统计方式。
- 将诊断数据保留在测试日志或受支持的本地调试面板。小工具页面不能直连埋点服务，采集不依赖外网，也不记录用户内容。

参考 [W3C · Paint Timing](https://www.w3.org/TR/paint-timing/)、[User Timing](https://www.w3.org/TR/user-timing/) 和 [Chrome 团队 · Web Vitals](https://web.dev/articles/vitals)。
