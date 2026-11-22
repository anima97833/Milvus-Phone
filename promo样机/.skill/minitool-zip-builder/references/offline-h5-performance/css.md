# CSS 标准与渲染

按 [CSS 兼容性](../css-compatibility.md) 建立 Chrome 61 基础样式，现代属性使用 `@supports` 或 `CSS.supports()` 按具体能力增强。构建时前缀工具能补前缀，缺失的布局语义需要显式回退。

- **布局。** 使用已验证的 Flex 或常规文档流实现基础布局。图片、Canvas 和骨架屏提前预留宽高。非首屏长内容优先按需挂载，支持时可用 `content-visibility: auto` 配占位尺寸减少渲染开销，检查滚动位置、焦点及查找行为。
- **动画。** 位移和淡入优先用 `transform`、`opacity`，避免每帧改 `top`、`width`。大面积模糊、阴影、透明叠加和全屏渐变要在真机检查绘制与合成成本。只有性能记录支持时才短期使用 `will-change`，动画结束后清理。
- **样式体积。** 精简全量组件库和主题，按需引入 CSS。关键样式随主包，延后视图样式可在激活前加载并等待加载结果。删除未使用的样式时保留运行时动态类名和降级样式。
- **可访问性。** 动画缺省维持可读可操作，支持时响应 `prefers-reduced-motion`。禁用动画后仍完成状态切换，业务完成逻辑不依赖 `transitionend`。

```css
.detail-card { min-height: 180px; }
.card-enter { transition: transform 160ms ease-out, opacity 160ms ease-out; }
.card-enter.is-pending { transform: translateY(8px); opacity: 0; }

@supports (content-visibility: auto) and (contain-intrinsic-size: auto 180px) {
  .below-fold .detail-card {
    content-visibility: auto;
    contain-intrinsic-size: auto 180px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-enter { transition: none; }
}
```

参考 [W3C · CSS Containment Level 2](https://www.w3.org/TR/css-contain-2/) 和 [Chrome 团队 · High-performance CSS animations](https://web.dev/articles/animations-guide)。
