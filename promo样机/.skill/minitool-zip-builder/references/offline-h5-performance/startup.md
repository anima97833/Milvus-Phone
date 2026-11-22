# 脚本与分阶段启动

## index.html 首屏设计

容器打开离线包后，将入口 `index.html` 交给 WebView。WebView 解析 HTML、处理影响首屏的样式和脚本，再执行布局与绘制。应用随后完成事件绑定、数据或场景初始化。用户在 WebView 中最先能看到的页面内容，取决于入口提供了什么，以及浏览器何时有机会绘制。若入口只有空的 `#app`，有意义的内容就要等框架和业务 JS 执行后才会出现。包内资源也有读取、解析、执行和解码成本，长任务还可能推迟已准备好的画面上屏。

AI 助手在出码前按顺序确定以下三件事。

| 要决定的事 | 出码时怎么做 |
| --- | --- |
| JS 未运行时，用户已经能看到什么？ | 将真实标题、简短用途、可预先确定的内容和稳定布局直接写入 HTML。普通工具有可直接展示的内容时，优先展示内容。复杂业务用贴合真实界面的占位，游戏保留画布区域和明确的准备状态。 |
| 浏览器必须等哪些资源才能画出首屏？ | 首屏使用系统字体和少量关键 CSS，小型必要资源随主包。关键样式可直接写在 `<style>`，只保留首屏所需规则。将非首屏样式、装饰图、字体和大组件移出关键路径，按需加载。避免在入口嵌入大 JSON、大图 Base64 或整套 CSS。 |
| 什么时候能操作？ | 用经典外置 `defer` 脚本绑定事件，真实就绪后再开放依赖 JS 的操作。按需初始化隐藏面板和后续关卡。让启动失败可以被识别，保留可读内容与恢复指引；核心操作足够轻时可直接绑定，无需人为延长 loading。 |

入口示例见下文「启动 Loading 最佳实践」。

框架项目可在构建时预渲染首屏，或由现有框架复用静态入口结构。检查生产产物，避免挂载时清空首屏再重建，也避免占位与真实视图尺寸差异导致跳动。`defer` 允许 HTML 继续解析，仍可能在首帧前执行；入口脚本应保持轻量，重初始化拆批并让出主线程。

验收时先故意延迟或禁用入口 JS，检查最终 ZIP 中的页面是否仍有可辨识的内容、可读样式及稳定布局。再恢复正常加载，分别测容器打开到页面可见、FP / FCP 与核心就绪，游戏另测首关可玩。用性能记录或录屏确认静态内容实际出现，以及它与真实交互之间的时间差。禁用 JS 的检查仅覆盖静态内容可见性，真实首帧以正常运行记录为准。

参考 [Chrome 团队 · Understand the critical path](https://web.dev/learn/performance/understanding-the-critical-path)、[ZIP 入口规范](../zip-artifact-spec.md) 和 [指标与真机验收](./metrics.md)。

## 加载属性和执行时机

| 手段 | 适用情形 | 注意 |
| --- | --- | --- |
| 经典外置 `defer` | 入口和有顺序依赖的初始化脚本 | HTML 解析期间并行读取，解析完按文档顺序执行。依赖放在使用者前；脚本执行本身仍占用主线程 |
| 经典外置 `async` | 确认独立的诊断脚本 | 读取完成即执行，可能打断解析，不保证顺序或 DOM 可用；仍须遵守容器网络约束 |
| 用户触发后加载包内经典脚本 | 关卡、编辑器、详情等大而独立的模块 | 使用已知本地路径，等待加载成功后再初始化。并发点击复用同一加载，失败清理后才允许重试 |
| 函数内 `async/await` | 异步依赖和结果处理 | 依赖链顺序 await；互不依赖的必要任务可用有界并发。可选任务独立失败和降级，避免一个失败拖垮启动 |

```html
<script defer src="./core.js"></script>
<script defer src="./app.js"></script>
```

所有代码输出为经典外置脚本，语法符合 [ES2017 / Chrome 61](../js-compatibility.md)。不在交付物保留顶层 await 或原生 import。 `await Promise.resolve()` 继续执行的是微任务，大量同步计算、DOM 更新和解码仍可能阻塞。拆短任务并在批次间通过计时器让出主线程。单次重操作也要拆分或减少输入；CPU 密集任务可按 [容器 Worker 约束](https://miniapp-sandbox.xiaohongshu.com/minitool/doc#s2-8) 验证 classic Worker 方案与回退。

## 复杂业务和游戏的阶段

| 阶段 | 做什么 | 显示和失败处理 |
| --- | --- | --- |
| 壳可见 | 主包 HTML、关键样式、最小 JS | 入口直接放骨架或文字进度，保留布局和退出能力 |
| 核心可用／首关可玩 | 基础配置、首个场景、输入绑定和首个实际渲染 | 就绪前禁用依赖尚未完成的操作。失败保留用户输入，给重试或基础模式 |
| 后续功能就绪 | 后续关卡、非关键图片、编辑器或高画质资源 | 用户触发或核心就绪后按预算预热，按需加载，失败时保持核心可用 |

使用阶段文案，只有总任务量可计算时才显示真实百分比。按操作粒度限制并发，避免同时解码多张大图。用户离开或切场景后取消可取消的工作，其他异步结果通过代次判断是否仍可提交，清理过期资源。恢复时重建必要的任务或场景，防止重复初始化。

## 启动 Loading 最佳实践

| 场景 | 出码策略 |
| --- | --- |
| 启动很轻的工具 | 直接显示真实标题、默认内容和页面结构，尽早绑定核心交互。避免为了展示动画加最短等待时间。 |
| 核心功能有必需的异步依赖 | 在 HTML 提供轻量初始状态，并给最终内容预留空间。只让尚未就绪的操作等待，保留已经能使用的内容和退出能力。 |
| 总量已知且进度有意义 | 按实际完成的工作量更新 `<progress>` 和文字，避免每帧播报。总量未知时用阶段文案，例如「准备第一关」，避免模拟百分比。 |
| 必需资源慢或失败 | 为可能挂起的读取设项目可接受的等待上限，给出重试或可完成核心任务的降级模式。重试只启动一轮，释放旧资源并忽略迟到结果。 |
| 装饰资源或后续关卡失败 | 在对应区域提示并允许单独重试。核心就绪状态保持可用。 |

状态文案使用 `role="status"`，受影响区域在准备时设 `aria-busy="true"`。如果使用动效，保留可读文字并提供减少动效的样式。静态首屏应尽可能轻，Loading 避免依赖框架、外移图片或网络字体。

### 可运行示例

将以下两个文件同放在 ZIP 根目录。示例用少量数字按钮展示完整状态流，实际项目只在初始化工作量需要时分批。启动时先绑定事件，再创建首关内容。静态说明保留入口脚本缺失时的退出重进指引。脚本运行后若初始化失败，则显示页内重试。

**`index.html`**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>找数字练习</title>
  <style>
    body { margin: 0; background: #f6f7fb; color: #20232a; font-family: system-ui, sans-serif; }
    main { padding: 16px; }
    #board { min-height: 200px; max-width: 320px; background: #e7ebf3; }
    #board button { width: 20%; height: 40px; }
  </style>
</head>
<body>
  <main>
    <h1>找数字练习</h1>
    <p>找出数字 17。</p>
    <div id="board" role="group" aria-label="数字盘" aria-busy="true"></div>
    <p id="startup-status" role="status">正在准备第一关。若长时间未就绪，请退出后重新打开。</p>
    <button id="retry" type="button" hidden>重试</button>
  </main>
  <script defer src="./bootstrap.js"></script>
</body>
</html>
```

**`bootstrap.js`**

```js
(function () {
  'use strict';

  const board = document.getElementById('board');
  const status = document.getElementById('startup-status');
  const retry = document.getElementById('retry');
  let state = 'idle';

  function yieldTask() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  async function prepareBoard() {
    const fragment = document.createDocumentFragment();
    for (let start = 1; start <= 25; start += 5) {
      // 让浏览器有机会绘制；生产中按实测耗时调整批次。
      await yieldTask();
      for (let number = start; number < start + 5; number += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(number);
        fragment.appendChild(button);
      }
    }
    return fragment;
  }

  async function boot() {
    if (state === 'loading' || state === 'ready') return;
    state = 'loading';
    retry.disabled = true;
    retry.hidden = true;
    board.setAttribute('aria-busy', 'true');
    status.textContent = '正在准备第一关…';
    try {
      board.appendChild(await prepareBoard());
      state = 'ready';
      status.textContent = '第一关已就绪。';
    } catch (error) {
      board.textContent = '';
      state = 'error';
      status.textContent = '第一关加载失败，请重试。';
      retry.disabled = false;
      retry.hidden = false;
    } finally {
      board.setAttribute('aria-busy', 'false');
    }
  }

  board.addEventListener('click', function (event) {
    if (state !== 'ready' || event.target.tagName !== 'BUTTON') return;
    status.textContent = event.target.textContent === '17' ? '找到了！' : '再试一次。';
  });
  retry.addEventListener('click', boot);
  boot();
}());
```

示例只有有限的本地 DOM 工作。接入图片解码、桥接调用或图形初始化时，再按各能力约束补超时、取消、页面退出清理和过期任务隔离。遇到不可取消的操作，超时后使该轮结果失效。验收至少覆盖入口脚本缺失、首关准备失败、快速重复重试、成功后可操作和后台恢复。有测量数据时分别记录 FCP、核心就绪与首关可玩时间。

参考 [WHATWG · Scripting](https://html.spec.whatwg.org/multipage/scripting.html) 和 [Chrome 团队 · Optimize long tasks](https://web.dev/articles/optimize-long-tasks)。
