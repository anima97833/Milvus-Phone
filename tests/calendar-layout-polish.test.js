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

// 2. year-select 不得包含双箭头（CSS ::after 不得输出 ▼，JSX 不得自带硬编码 \u25BC）
assert.doesNotMatch(styleCss, /\.year-select::after\s*\{[^}]*content:\s*" ▼"/, 'style.css 中 .year-select::after 不得生成硬编码 ▼');
assert.match(appJsx, /year-caret/, 'app.jsx 必须包含独立的 year-caret');

// 3. calendar-task-wrapper 拥有正确的边界与间距
assert.match(styleCss, /\.calendar-task-wrapper\s*\{[^}]*overflow:\s*hidden;/, 'wrapper 必须包含 overflow: hidden');
assert.match(styleCss, /\.calendar-task-wrapper\s*\{[^}]*margin-bottom:\s*20px;/, 'wrapper 必须包含 margin-bottom: 20px');

// 4. calendar-task-card 不能有 margin-bottom: 20px（避免操作层底部泄露）
assert.doesNotMatch(styleCss, /\.calendar-task-card\s*\{[^}]*margin-bottom:\s*20px;/, 'card 不能声明 margin-bottom: 20px');
assert.match(styleCss, /\.calendar-task-card\s*\{[^}]*margin:\s*0;/, 'card 必须声明 margin: 0');
assert.match(styleCss, /\.calendar-task-card\s*\{[^}]*width:\s*100%;/, 'card 必须声明 width: 100%');

// 5. calendar-task-actions 具备绝对定位与 100% 高度
assert.match(styleCss, /\.calendar-task-actions\s*\{[^}]*position:\s*absolute;/, 'actions 必须为 absolute 定位');
assert.match(styleCss, /\.calendar-task-actions\s*\{[^}]*height:\s*100%;/, 'actions 高度必须为 100%');

console.log('calendar layout polish contract: ok');
