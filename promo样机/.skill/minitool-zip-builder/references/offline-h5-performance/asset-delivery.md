# 资源文件与平台托管

小工具 [平台 §2.7](https://miniapp-sandbox.xiaohongshu.com/minitool/doc#s2-7) 在启用范围内外移合适的静态资源，容器按原包内路径透明取回。最低客户端为 9.53.3，策略适用于新发布，存量作品需要重新发布。上传 ZIP 仍包含所有资源，按 [ZIP 规范](../zip-artifact-spec.md) 校验后缀和体积。开发侧无需自行上传 CDN 或改写 URL。

| 资源 | 放置策略 | 原因 |
| --- | --- | --- |
| 入口 HTML、入口 JS／CSS、小型关键图、核心功能依赖 | 根目录或 `critical/` 等 `assets/` 外目录 | 首屏强依赖随主包下发 |
| 详情图、非首屏装饰字体等可延后的白名单资源 | 作为独立文件放在包根 `assets/` 或其子目录 | 参与平台分发，按功能激活后再加载 |
| 首屏大图、首关素材、断网也需使用的图或字体 | 先裁剪和压缩，再根据首屏实测与离线要求决定是否留主包 | 外移可能将主包时间转为关键资源等待 |
| 外部 CDN、模型和媒体等资源 | 按 ZIP 白名单和能力约束选择可交付形式 | 托管策略不扩大后缀、联网或 CSP 权限 |

官方文档列出的候选包括白名单图片和字体，实际外移范围由平台决定。打包器默认生成的 `assets/` 可能也包含入口 JS／CSS，需显式调整输出。CSS 的相对路径以样式表为基准，HTML 和本例中的 JS 图片路径以当前文档为基准。动态生成的每个路径都要核对最终 ZIP 中的文件。

大型原始素材可以在构建期从团队 OSS 取回，再按上述规则打包。其他容器的运行时分发方案见 [大型资源的 OSS 管理与分发](./oss.md)。

## 按需加载详情图

```html
<button id="detail-load" type="button">加载详情图</button>
<p id="detail-status" role="status"></p>
<img id="detail-image" alt="详情示意图" width="480" height="320" hidden>
<script defer src="./detail.js"></script>
```

```js
// detail.js
const load = document.getElementById('detail-load');
const status = document.getElementById('detail-status');
const image = document.getElementById('detail-image');

image.addEventListener('load', function () {
  image.hidden = false;
  status.textContent = '';
  load.hidden = true;
});
image.addEventListener('error', function () {
  image.removeAttribute('src');
  image.hidden = true;
  status.textContent = '详情图暂不可用，正文仍可查看。';
  load.textContent = '重试加载';
  load.disabled = false;
});
load.addEventListener('click', function () {
  load.disabled = true;
  status.textContent = '正在加载详情图…';
  image.src = './assets/detail.webp';
});
```

关键内容先用文字或随主包的小图展示。装饰字体使用系统字体回退，仅为实际需要该字体的视图应用 `@font-face` 字体族。产品若要求等待上限，可用计时器切换到可重试状态，并用加载代次忽略迟到事件。

## 体验与验收

1. 本地准备 A/B 包。A 将同一张非首屏图片放 `detail/`，B 放根目录 `assets/`。只调整引用和文件位置，两包都保留 `critical/` 小图和完整资源。审计 ZIP 和解压目录，验证正常加载及缺图降级。
2. 获得测试作品上传和发布授权后，使用平台启用范围内的 9.53.3+ 客户端体验。冷启动分别记录主包下载体积或容器耗时（若平台可见）、首屏核心就绪和首次点击详情的等待时间。用同一设备、版本、网络和素材比较。
3. 先启动作品再切弱网或离线，验证正文、详情回退及重试；区分首次加载和缓存命中。另测低版本或策略未启用的兼容行为。平台未提供外移证据时只记录可观察结果，上传 ZIP 大小和浏览器请求都无法单独证明平台实际外移。
