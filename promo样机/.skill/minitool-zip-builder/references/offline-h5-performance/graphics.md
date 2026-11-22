# Canvas / WebGL 与 3D

二维图表和简单动效先评估 DOM、CSS 或 Canvas 2D。使用 WebGL 时按 [性能预算](../performance-budget.md) 设定初始档，按 [容器图形能力](https://miniapp-sandbox.xiaohongshu.com/minitool/doc#s5) 验证完整依赖和实际首次绘制。小工具 ZIP 白名单未开放常见模型和纹理压缩容器后缀，也不开放 WASM。其他平台即使支持 glTF、KTX2 或压缩解码器，仍需单独计算解码、上传和内存成本。

| 瓶颈 | 优化 | 验收 |
| --- | --- | --- |
| 首关资源重 | 先上最小可玩场景，后续场景按需准备；延后非关键材质、粒子和 Shader 变体 | 首关可玩时间、初始化与首次绘制卡顿 |
| CPU 提交慢 | 批处理同材质几何，支持时用实例化，做视锥和距离裁剪，复用每帧对象 | draw call、三角形数、CPU 帧耗时 |
| GPU 填充慢 | 降低绘制缓冲区像素数，减少透明叠加、实时阴影、反射和后处理，必要时切低档 | 帧间隔、质量档、持续运行稳定性 |
| 纹理和渲染目标占用大 | 按实际尺寸导出，复用纹理、材质与 framebuffer；按所有权释放缓存、几何体和纹理 | 纹理估算、渲染目标尺寸、切场景及退出后的资源数量 |
| 恢复或兼容失败 | 隐藏暂停，回前台重置帧时间；context lost 有界恢复，验证失败进入可完成核心任务的降级视图 | 真机返回、异常恢复、状态与输入保留 |

Canvas 2D 可预绘重复图形、按需要局部重绘、合并绘制状态。持续动画用 `requestAnimationFrame`；静态场景只在状态变化时绘制。避免循环内同步回读像素和无上限对象分配。

## 案例一：高 DPR 全屏场景掉帧

固定场景、镜头和 CSS 尺寸，只调整绘制缓冲区。以 400 × 800 CSS 像素为例，DPR 3 对应 288 万像素，DPR 1.5 对应 72 万像素。这个 75% 是缓冲区像素数的计算差异，实际帧耗时仍需测量。对比前台帧间隔 p95、清晰度和点选坐标；若改善有限，再隔离测试透明叠加、阴影和后处理。 [MDN · Consider rendering to a smaller back buffer](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#consider_rendering_to_a_smaller_back_buffer)

下面按显示尺寸、DPR 上限与像素预算估算 WebGL 缓冲区尺寸。调用前保证 CSS 已约束画布显示尺寸，库负责调整画布时使用其 resize API。重新设置缓冲区后同步更新 viewport、相机宽高比和渲染目标。设备上限仍须通过实际能力确认。

```js
// 依据 MDN 的 smaller back buffer 建议，保留 CSS 尺寸，单独限制绘制缓冲区。
function bufferSize(cssWidth, cssHeight, dprCap, maxPixels) {
  const width = Math.max(1, cssWidth);
  const height = Math.max(1, cssHeight);
  const scale = Math.min(
    window.devicePixelRatio || 1,
    dprCap,
    Math.sqrt(maxPixels / (width * height))
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  };
}
```

## 案例二：重复对象导致 CPU 提交时间上涨

例如同材质障碍物随关卡规模增加。用相同对象数量和画质比较逐对象绘制与实例化；先按材质和混合状态分组，保留透明对象需要的排序。WebGL 2 使用核心实例化 API，WebGL 1 检测 `ANGLE_instanced_arrays`，缺失时保留常规绘制或按材质合并静态几何。对比 draw call、CPU 提交耗时和剔除后的三角形数。批次过大可能降低剔除效率，可按场景区域拆批。 [MDN · Batch draw calls](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#batch_draw_calls) · [Khronos · ANGLE_instanced_arrays](https://registry.khronos.org/webgl/extensions/ANGLE_instanced_arrays/)

## 案例三：首次使用新材质时卡顿

先只准备首关必需的程序，把高画质材质和后续关卡变体移出启动路径。支持 `KHR_parallel_shader_compile` 时，调用 `linkProgram` 后在后续帧查询完成状态，完成后再检查链接结果。规范要求 context lost 时完成查询也会返回 true，因此要先判断上下文。 [Khronos · KHR_parallel_shader_compile](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/)

```js
// 扩展在初始化或 context 恢复后获取一次。这里只检查已经发起链接的 program。
function programState(gl, program, parallelCompile) {
  if (gl.isContextLost()) return 'context-lost';
  // Khronos: COMPLETION_STATUS_KHR 可非阻塞查询，完成后仍须检查 LINK_STATUS。
  if (parallelCompile &&
      !gl.getProgramParameter(program, parallelCompile.COMPLETION_STATUS_KHR)) {
    return 'pending';
  }
  // 扩展缺失时，此查询可能阻塞。只在受控的初始化批次调用。
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? 'linked' : 'failed';
}
```

调用方仅在准备阶段按帧检查 pending 项，设等待上限，页面隐藏时暂停，退出时取消并释放拥有的程序。扩展缺失时减少变体并分批链接和检查。对比首次交互的长帧与首关可玩时间，并实际绘制以验证链接成功的程序。单独记录编译等待和首关就绪，非阻塞查询减少的是等待结果时卡住主线程的机会。

## 观测与复现

- 先固定设备、构建版本、画质和操作。每轮只改变一个参数，记录改前改后绘制缓冲区像素数、draw call、帧间隔 p95 和首关可玩时间。上面的案例是复现方案，平台收益以实测为准。
- 避免在生产绘制循环中调用 `readPixels`、`getError` 或频繁查询 `getParameter`。将能力查询移到初始化，资源和诊断查询按需触发。 [MDN · Avoid blocking API calls in production](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_blocking_api_calls_in_production)
- 需要区分 CPU 提交与 GPU 执行时，只在诊断模式下做少量 GPU 计时采样。检测对应 WebGL 版本的扩展，跨帧等查询就绪、丢弃 `GPU_DISJOINT_EXT` 样本并删除查询对象。缺扩展时使用 trace 或帧间隔，GPU 时间记为不可观测。 [Khronos · WebGL 1 Timer Query](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query/) · [WebGL 2 Timer Query](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)

交付记录使用的图形库版本、WebGL 能力、默认档及降级表现。根据 [指标与真机验收](./metrics.md) 区分提交速率、实际呈现和启动数据。常规场景不要为测量长期启用同步 GPU 查询。

参考 [MDN · WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) 和 [Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)。
