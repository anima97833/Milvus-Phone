const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const appJsx = fs.readFileSync(path.join(rootDir, 'Milvus', 'app.jsx'), 'utf8');
const appMin = fs.readFileSync(path.join(rootDir, 'Milvus', 'app.min.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(rootDir, 'Milvus', 'style.css'), 'utf8');

// 1. 年份/月份 selector 不再使用 calendar-color-picker
assert.doesNotMatch(appJsx, /showYearSelector\s*&&\s*\/\* @__PURE__ \*\/ React\.createElement\("div",\s*\{\s*className:\s*"calendar-color-picker"/, 'showYearSelector 不得渲染为 calendar-color-picker');
assert.doesNotMatch(appJsx, /showMonthSelector\s*&&\s*\/\* @__PURE__ \*\/ React\.createElement\("div",\s*\{\s*className:\s*"calendar-color-picker"/, 'showMonthSelector 不得渲染为 calendar-color-picker');
assert.match(appJsx, /className:\s*"calendar-date-selector"/, 'app.jsx 必须包含 calendar-date-selector');
assert.match(appMin, /className:\s*"calendar-date-selector"/, 'app.min.js 必须包含 calendar-date-selector');

// 2. 年份 caret 单一固定字符，严禁三元动态换形字符
assert.doesNotMatch(appJsx, /showYearSelector[^?]*\?[^:]*["']\s*[▼▲▾▴]/, 'caret 不得使用三元字符换形');
assert.doesNotMatch(styleCss, /\.year-select::after\s*\{[^}]*content:\s*" ▼"/, 'style.css 中 .year-select::after 不得生成硬编码 ▼');
assert.match(appJsx, /calendar-year-caret/, 'app.jsx 必须包含独立的 calendar-year-caret');
assert.match(styleCss, /\.calendar-year-caret\.expanded\s*\{[^}]*transform:\s*rotate\(90deg\);/, 'caret 展开方向必须由 rotate(90deg) 控制');

// 3. 页面稳定结构：selector 位于 header 与 calendar-card 之间，并具备专用 slot
assert.match(appJsx, /calendar-selector-slot/, 'app.jsx 必须具备专用 calendar-selector-slot');
assert.match(styleCss, /\.calendar-selector-slot:empty\s*\{[^}]*margin:\s*0;/, 'slot 为空时 margin 为 0');
assert.match(styleCss, /\.calendar-header\s*\{[^}]*flex:\s*0 0 auto;/, 'header 必须为固定 flex 尺寸');

// 4. calendar-task-wrapper 与 card 遮罩契约
assert.match(styleCss, /\.calendar-task-wrapper\s*\{[^}]*overflow:\s*hidden;/, 'wrapper 必须包含 overflow: hidden');
assert.match(styleCss, /\.calendar-task-wrapper\s*\{[^}]*margin-bottom:\s*20px;/, 'wrapper 必须包含 margin-bottom: 20px');
assert.doesNotMatch(styleCss, /\.calendar-task-card\s*\{[^}]*margin-bottom:\s*20px;/, 'card 不能声明 margin-bottom: 20px');
assert.match(styleCss, /\.calendar-task-card\s*\{[^}]*margin:\s*0;/, 'card 必须声明 margin: 0');
assert.match(styleCss, /\.calendar-task-card\s*\{[^}]*width:\s*100%;/, 'card 必须声明 width: 100%');

// 5. calendar-task-actions 绝对定位与 100% 高度
assert.match(styleCss, /\.calendar-task-actions\s*\{[^}]*position:\s*absolute;/, 'actions 必须为 absolute 定位');
assert.match(styleCss, /\.calendar-task-actions\s*\{[^}]*height:\s*100%;/, 'actions 高度必须为 100%');

console.log('calendar layout polish contract: ok');
