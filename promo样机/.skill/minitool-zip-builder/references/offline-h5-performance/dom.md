# DOM 与布局

| 记录中看到的瓶颈 | 处理方式 | 验收 |
| --- | --- | --- |
| 首屏创建大量行和隐藏面板 | 首次只挂载当前视图和可见内容。优先用分页，连续滚动确有需要时再用虚拟列表和小范围预渲染 | 首屏节点数、首次挂载耗时、滚动是否白块，焦点和滚动位置是否保留 |
| 每次输入都全量渲染 | 输入筛选使用适量防抖和稳定的列表键，构建期预计算可复用索引，保留最后一次输入和提交结果 | 连续输入时的长任务、最终结果正确性 |
| 循环里反复读写尺寸 | 合并 `getBoundingClientRect()` / `offsetHeight` 等布局读取，再批量写样式或挂载片段 | Performance trace 中强制布局的次数及耗时 |
| 滚动或拖动事件频繁更新 | 每帧只提交一次视觉更新，先记录最新输入；无需取消滚动的监听用 passive，拖拽和手势处理另核对容器规则 | 连续拖动响应、默认滚动、掉帧和后台清理 |

示例仅渲染当前页。用 `textContent` 写数据，异步返回前用当前请求代次判断是否仍属于当前视图。

```js
function renderPage(list, items, page, pageSize) {
  const start = page * pageSize;
  const fragment = document.createDocumentFragment();
  items.slice(start, start + pageSize).forEach(function (item) {
    const row = document.createElement('li');
    row.textContent = item.title;
    fragment.appendChild(row);
  });
  list.textContent = '';
  list.appendChild(fragment);
}
```

对于需要保留焦点的列表，更新可见差异，或者显式恢复焦点。Fragment 仍有节点创建成本，批量很大时继续分页或按时间预算分批。视图退出后解绑全局监听并释放 DOM、定时器和对象 URL。

参考 [Chrome 团队 · Avoid large, complex layouts and layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) 和 [多端交互适配](../cross-platform-h5.md)。
