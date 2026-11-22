# 小工具 JS API 本地参考

> 本文是 2026-10-30 的本地快照，赞赏与关闭挽留接口于 2026-11-06 补充，按 `docs/index.html` 的 JS API 章节复刻，保留参数表、约束与示例。实现时应优先获取[小工具在线文档](https://miniapp-sandbox.xiaohongshu.com/minitool/doc)；仅当远程文档无法获取时，才以本文作为 API 契约参考。

容器自动注入 `window.xhs`，无需在包内引入 SDK。端能力从 `window.xhs.miniTool` 调用。

## 调用约定

- 传入 `success`、`fail`、`complete` 任一回调时，API 返回 `undefined`；均不传时返回 Promise。
- 成功结果包含 `errMsg: "<api>:ok"` 与对应业务字段；失败结果包含 `errMsg: "<api>:fail ..."` 与可选 `errCode`。
- 调用前检查 `window.xhs`、`window.xhs.miniTool` 和具体方法是否存在，并为低版本或未注入环境提供降级处理。
- 只调用本文列出的 API，不直接调用原生 bridge。

```js
const miniTool = window.xhs && window.xhs.miniTool;

if (miniTool && typeof miniTool.saveImageToPhotosAlbum === "function") {
  try {
    await miniTool.saveImageToPhotosAlbum({ filePath });
  } catch (error) {
    console.log(error.errMsg, error.errCode);
  }
}
```

## API 一览

| API | 用途 | 最低客户端版本 |
| --- | --- | --- |
| `postNote` | 打开笔记发布页并携带内容和媒体 | — |
| `saveImageToPhotosAlbum` | 保存图片至系统相册 | — |
| `writeTempFile` | 将 base64 写入临时文件 | — |
| `getLaunchOptions` / `window.xhs.launchOptions` | 获取启动参数和环境信息 | — |
| `setStorage` / `getStorage` / `getStorageInfo` / `removeStorage` / `clearStorage` | 小工具本地缓存 | 9.46 |
| `saveFile` / `writeFile` / `appendFile` / `readFile` / `readDir` / `statFile` / `unlink` / `mkdir` / `getFileStorageInfo` | 本地文件系统 | 9.49 |
| `interactionOpenApi` | 唤起评论区并携带评论草稿 | 9.49 |
| `rewardAuthor` | 调起当前小工具的赞赏流程 | 9.53.3 |
| `setCloseRetentionEnabled` | 设置当前容器是否允许展示关闭挽留弹窗 | 9.53.3 |
| `addCloudStorage` / `updateCloudStorage` / `queryCloudStorage` / `removeCloudStorage` | 云存储：同账号跨设备个人数据（内测） | 9.51 |
| `submitScore` / `getRankList` / `getMyRank` | 排行榜：公开成绩榜单与本人排名（内测） | 9.51 |

图片、视频与封面等媒体字段只接受 `data:` base64 或本地文件路径；容器不联网，网络地址不可用。体积较大的 base64 建议先用 `writeTempFile` 换成 `filePath` 再传递。

## 启动参数与版本判断

同步读取启动参数：

```js
const launchOptions = window.xhs && window.xhs.launchOptions;
const userDataPath = launchOptions && launchOptions.miniToolEnv && launchOptions.miniToolEnv.userDataPath;
```

同步值不可用时，检查 `getLaunchOptions` 存在后异步读取：

```js
const miniTool = window.xhs && window.xhs.miniTool;
const launchOptions = await miniTool.getLaunchOptions();
const { userDataPath } = launchOptions.miniToolEnv;
```

`miniToolEnv.userDataPath` 是持久文件目录根路径。仅在它之后拼接相对路径；不要硬编码、解析或改写端上返回的文件句柄。

`miniToolEnv.buildVersion` 的末三位为编译序号，判断客户端版本时忽略。例如 `9462004` 代表客户端 `9.46.2`，用于版本比较的值为 `9462`：

```js
function getClientVersion(buildVersion) {
  return Math.floor((Number(buildVersion) || 0) / 1000);
}

function isClientVersionAtLeast(buildVersion, minimumClientVersion) {
  return getClientVersion(buildVersion) >= minimumClientVersion;
}
```

完整的同步优先、异步回退读取方式：

```js
function readBuildVersion(launchOptions) {
  const miniToolEnv = launchOptions && launchOptions.miniToolEnv;
  return Number(miniToolEnv && miniToolEnv.buildVersion) || 0;
}

async function getBuildVersion() {
  const xhs = window.xhs;
  const syncBuildVersion = readBuildVersion(xhs && xhs.launchOptions);
  if (syncBuildVersion) return syncBuildVersion;

  const miniTool = xhs && xhs.miniTool;
  if (!miniTool || typeof miniTool.getLaunchOptions !== "function") return 0;

  try {
    return readBuildVersion(await miniTool.getLaunchOptions());
  } catch (error) {
    return 0;
  }
}
```

## postNote

打开笔记发布页。`mediaInfo` 必传，`image_resources`、`video_resources`、`live_photo_resources` 至少提供一种。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 标题，最长 20 字 |
| `content` | string | 正文，最长 1000 字 |
| `pageType` | string | `video_publish`、`photo_publish` 或 `slides_edit`（9.43+） |
| `mediaInfo.image_resources` | `{ url }[]` | 图片，1–18 张；`url` 为 data URI 或本地路径 |
| `mediaInfo.video_resources` | `{ video_url, cover_url? }` | 单个视频及可选封面 |
| `mediaInfo.live_photo_resources` | `{ url, video_url }[]` | 实况照片，1–18 组（9.43+） |

```js
await window.xhs.miniTool.postNote({
  title: "我的作品",
  content: "用小工具生成的",
  pageType: "photo_publish",
  mediaInfo: {
    image_resources: [{ url: "data:image/png;base64,..." }],
  },
});
```

```js
// 视频笔记
await window.xhs.miniTool.postNote({
  pageType: "video_publish",
  mediaInfo: {
    video_resources: { video_url: videoPath, cover_url: coverPath },
  },
});

// 实况笔记（客户端 9.43+）
await window.xhs.miniTool.postNote({
  pageType: "slides_edit",
  mediaInfo: {
    live_photo_resources: [{ url: coverPath, video_url: videoPath }],
  },
});
```

成功回调只表示发布页已被唤起并由用户点击发布，不代表笔记最终审核通过；不要据此做强一致业务状态。

## saveImageToPhotosAlbum

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `filePath` | string | 是 | 本地图片：`data:` base64 或 `writeTempFile` 返回的路径；不支持 `http(s)://` 网络地址 |

```js
const dataUrl = canvas.toDataURL("image/png");
await window.xhs.miniTool.saveImageToPhotosAlbum({ filePath: dataUrl });
```

应由用户点击等主动操作触发；首次调用可能请求相册权限。大图建议先通过 `writeTempFile` 落成文件，再保存至相册。

## writeTempFile

将 Canvas 或选图结果等 base64 数据写为临时文件：

```js
const { filePath } = await window.xhs.miniTool.writeTempFile({
  data: canvas.toDataURL("image/png"),
});

await window.xhs.miniTool.saveImageToPhotosAlbum({ filePath });
await window.xhs.miniTool.postNote({
  mediaInfo: { image_resources: [{ url: filePath }] },
});
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `data` | string | 必填，base64 数据；支持带 `data:` 前缀的 data URI |
| `filePath` | string | 成功返回的临时文件路径 |

临时文件应即用即弃，不可作为长期持久化路径。支持常见图片与视频类型：png、jpeg、webp、gif、mp4。

## Storage 本地缓存

Storage API 在客户端 9.46+ 可用。`data` 只支持 JSON 字符串；对象或数组需要先序列化，读取后再解析。

| API | 参数 | 结果 / 说明 |
| --- | --- | --- |
| `setStorage` | `key: string`、`data: string`、`encrypt?: boolean` | 写入或覆盖缓存 |
| `getStorage` | `key: string`、`encrypt?: boolean` | 返回 `{ data }`；`encrypt` 与写入时一致 |
| `getStorageInfo` | 无业务参数 | 返回 `{ keys, usedBytes, limitBytes }`；`usedBytes` 为已用容量，`limitBytes` 为容量上限，单位均为字节 |
| `removeStorage` | `key: string` | 删除指定缓存 |
| `clearStorage` | 无业务参数 | 清空当前小工具缓存 |

单个 key 最大 1MB，当前小工具总缓存最大 10MB；`encrypt` 默认 `false`。

以下封装只使用 Storage。版本不足或接口缺失时返回 `false`，不回退到浏览器存储；调用方必须处理 `false`，不能假设数据已成功持久化：

```js
const STORAGE_MIN_CLIENT_VERSION = 9460;

async function setLocalData(key, data) {
  let serializedData;
  try {
    serializedData = JSON.stringify(data);
  } catch (error) {
    return false;
  }
  if (typeof serializedData !== "string") return false;

  const buildVersion = await getBuildVersion();
  const miniTool = window.xhs && window.xhs.miniTool;

  if (
    !isClientVersionAtLeast(buildVersion, STORAGE_MIN_CLIENT_VERSION) ||
    !miniTool ||
    typeof miniTool.setStorage !== "function"
  ) {
    return false;
  }

  try {
    const result = await miniTool.setStorage({ key, data: serializedData });
    return !!result && result.errMsg === "setStorage:ok";
  } catch (error) {
    return false;
  }
}
```

```js
await window.xhs.miniTool.setStorage({
  key: "profile",
  data: JSON.stringify({ nickname: "小红薯" }),
});

const { data } = await window.xhs.miniTool.getStorage({ key: "profile" });
const profile = data === null ? null : JSON.parse(data);
```

如需迁移老版本留下的浏览器存储数据（`localStorage`、`sessionStorage`、`IndexedDB`、Cookie、Cache API），只允许一次性读取旧数据并写入 Storage；迁移完成后不再读写这些浏览器存储。

## 文件系统

文件系统 API 在客户端 9.49+ 可用。文件和二进制数据使用文件系统保存，目录根路径来自 `miniToolEnv.userDataPath`。

| API | 参数 | 结果 / 说明 |
| --- | --- | --- |
| `saveFile` | `tempFilePath: string`、`filePath?: string \| null` | 将临时文件移动至持久目录，返回 `{ savedFilePath }` |
| `writeFile` | `filePath`、`data`、`encoding: "utf8" \| "base64"` | 覆盖写入，返回 `{ writtenBytes }` |
| `appendFile` | `filePath`、`data`、`encoding: "utf8" \| "base64"` | 追加写入，返回 `{ writtenBytes }` |
| `readFile` | `filePath`、`encoding`、`position?`、`length?` | 返回 `{ data, bytesRead, eof }` |
| `readDir` | `dirPath` | 返回 `{ files, truncated }` |
| `statFile` | `filePath` | 返回 `{ size, lastModified, isDir }` |
| `unlink` | `filePath` | 删除持久目录中的文件 |
| `mkdir` | `dirPath`、`recursive?` | 创建持久目录 |
| `getFileStorageInfo` | 无业务参数 | 返回 `{ usedBytes, limitBytes, fileCount, tmpUsedBytes, writeChunkMaxBytes, readChunkMaxBytes }` |

```js
const options = await window.xhs.miniTool.getLaunchOptions();
const filePath = options.miniToolEnv.userDataPath + "/drafts/note.json";

await window.xhs.miniTool.writeFile({
  filePath,
  data: JSON.stringify({ title: "草稿" }),
  encoding: "utf8",
});

const { data } = await window.xhs.miniTool.readFile({
  filePath,
  encoding: "utf8",
});
```

- `writeFile` 为覆盖写，`appendFile` 为追加写。写大文件时，第一片使用 `writeFile`，后续片串行使用 `appendFile`。
- 分片大小以 `getFileStorageInfo` 返回的 `writeChunkMaxBytes` 和 `readChunkMaxBytes` 为准，不要硬编码。
- 渲染图片或视频时直接使用文件句柄作为 `img.src`、`video.src` 或 CSS 资源；需要字节时才使用 `readFile`。
- `usr` 是本地工作区，不是备份空间。卸载、清数据或包清理后可能丢失，重要数据应可重建或由用户导出。

## interactionOpenApi 发布评论

评论区能力在客户端 9.49+ 可用，应由用户点击等主动操作触发。调用后容器会统一关闭小工具，再拉起评论区。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `payload` | object | 必填，评论草稿；字段由评论侧定义 |
| `payload.action` | string | 发布评论时使用 `post_comment` |
| `payload.content` | string | 可选，评论文本 |
| `payload.media_bean` | array | 可选，有序图片列表；媒体路径使用本地文件句柄 |
| `payload.miniToolSnapshotInfo` | string | 可选，小工具附加状态 JSON 字符串；最大 2KB，超限无效 |
| `saveToAlbum` | boolean | 可选，是否将图片同步保存到相册；默认 `true` |

```js
const result = await window.xhs.miniTool.interactionOpenApi({
  payload: {
    action: "post_comment",
    content: "快来和我 PK！",
    media_bean: [{
      media_type: "image",
      cover_image_url: imageFilePath,
    }],
    miniToolSnapshotInfo: JSON.stringify({ page: "result" }),
  },
  saveToAlbum: true,
});

// { routed, savedToAlbum, albumFailReason? }
```

- 评论文本和图片均可不传，仍可唤起评论区。
- 目前仅支持图片：`{ media_type: "image", cover_image_url }`；不支持视频或实况图。
- 媒体路径必须是容器可访问的本地文件句柄；不支持网络 URL、`data:` URI 或绝对路径。
- 用户从评论区重新打开小工具时，可读取有效的 `miniToolSnapshotInfo` 以恢复业务状态；恢复逻辑由开发者实现。
- `routed` 表示评论侧路由是否成功。相册保存失败时，原因通过可选字段 `albumFailReason` 返回。

## 云存储（内测）

云存储为**内测能力，尚未正式开放**：内测阶段能力与限制可能随版本调整，请勿将其作为核心功能的唯一依赖。API 在客户端 9.51+ 可用，调用前先做方法存在性探测，未授权（errCode 1006）时隐藏入口并降级。用户数据按「用户 × 小工具」隔离，同账号跨设备恢复；创作者不可见用户存储内容。

| API | 参数 | 结果 / 说明 |
| --- | --- | --- |
| `addCloudStorage` | `collection`、`items: { content }[]`（非空数组，每项 `content` 必须为对象，传字符串会本地报错） | 批量新增，返回 `{ data: { id, status }[] }`；`id` 为服务端生成的 24 位十六进制，**逐项结果按位置与输入一一对应**（不要用返回 id 做对应）；UNKNOWN 且后端未返回 id 时该项 `id` 为空串 |
| `updateCloudStorage` | `collection`、`items: { id, content }[]` | 批量**整行覆盖**（非字段合并），同批禁重复 id；返回逐项 `{ id, status }`（后端未返回 id 时回退输入 id） |
| `queryCloudStorage` | `collection?`、`ids?`、`limit?`、`cursor?` | 统一查询：传 `ids` 点查（`ids` 非空、不重复，此时 `collection` 必填）、只传 `collection` 分类分页、都不传跨全部分类；返回 `{ items, nextCursor?, hasMore? }` |
| `removeCloudStorage` | `collection`、`ids: string[]`（非空） | 按 id 批量硬删；**重复 id 在 SDK 本地直接拒绝（errCode 10001，请求未发出）**；幂等（目标不存在也成功）；返回逐项 `{ id, status }` |

`collection` 为业务分类（数据表名，如 `todos`）；`content` 为完整业务 JSON 对象，不是字符串。逐项 `status` 三态：`SUCCESS` / `FAILED` / `UNKNOWN`。

```js
const res = await window.xhs.miniTool.addCloudStorage({
  collection: "todos",
  items: [{ content: { text: "买菜", done: false } }],
});
// res.data[0]: { id, status }

const page = await window.xhs.miniTool.queryCloudStorage({ collection: "todos" });
// page: { items: [{ id, collection, content }], nextCursor?, hasMore? }，limit 默认 20

await window.xhs.miniTool.updateCloudStorage({
  collection: "todos",
  items: [{ id, content: { ...old.content, done: true } }], // 整行覆盖，要保留的字段必须一起提交
});

await window.xhs.miniTool.removeCloudStorage({ collection: "todos", ids: [id] });
```

- 批量写非事务：顶层成功（含部分成功）不等于每条成功，必须逐项判 `status`；`FAILED` 可重放，`UNKNOWN` 走 `queryCloudStorage` 对账。
- update 无版本校验：多端并发编辑同一记录时，以后生效的写入为准。
- 分页：以 `nextCursor` 逐页翻取，**末页不返回该字段**；`limit` 须为正整数（默认 20），翻页时查询参数保持一致；翻页不保证跨页快照一致，期间的新增和删除可能影响后续页；游标版本变更后旧游标失效，需从首页重查。点查（传 `ids`）不返回分页字段，只含命中记录（长度可小于输入，保持输入 id 的相对顺序）。
- 读取失败整次 reject，`items: []` 才代表「确实没有」；不得把读失败当无数据渲染。
- 删除不可恢复；删除后如有在途延迟写请求可能重建同 id 记录。
- 配额上限：单批最多 100 条（`items` / `ids`，超限返回 1002）；单条 `content` 经 JSON 序列化（UTF-8）后不超过 **64KB（65536 字节）**，超限返回 1003。存档类数据只存必要字段、剔除静态配置；超大存档自行分条拆分（主记录 + 分段记录）。
- 接口限频：云存储 / 排行榜**全部接口**按「小工具 × 接口」维度限频，默认每个小工具每个接口 **150 QPS**（一次调用消耗一次额度，批量条数不额外拆分），超限返回 2009「该应用调用此接口过于频繁」且发生在鉴权之前。请勿在游戏循环 / 高频定时器里直接调用：写入先在本地节流合并（如分钟级落一次云），榜单结果做本地缓存（30s ~ 60s）后再展示。

## 排行榜（内测）

排行榜为**内测能力，尚未正式开放**：内测阶段能力与限制可能随版本调整，请勿将其作为核心功能的唯一依赖。API 在客户端 9.51+ 可用。昵称由平台填充并仅在返回值中出现，不得自行采集或存储用户小红书资料。`board` 为榜位整数 1–5（默认 1），`period` 为周期枚举 `"all" | "month" | "week" | "day"`（默认 `"all"`），非法值本地抛错（errCode 10001，请求未发出）。

| API | 参数 | 结果 / 说明 |
| --- | --- | --- |
| `submitScore` | `board?`、`score` | 提交成绩（绝对分数，原值不缩放、不取整，须在 -1,000,000 ~ 1,000,000 区间内，超出返回 1004）；返回 `{ score }`：总榜历史最高分（已合并本次提交） |
| `getRankList` | `board?`、`period?` | 返回 `{ data: { rank, score, nickname }[] }`：前 100 名，按分数降序；limit 不开放，SDK 固定传 100（不对外暴露） |
| `getMyRank` | `board?`、`period?` | 返回 `{ status, rank, score }`；先判 `status` 再消费 `rank` / `score` |

```js
const mine = await window.xhs.miniTool.submitScore({ board: 1, score: 96.8 });
// mine: { score } —— 总榜历史最高分

const board = await window.xhs.miniTool.getRankList({ board: 1, period: "day" });
// board.data: [{ rank, score, nickname }]

const my = await window.xhs.miniTool.getMyRank({ board: 1, period: "day" });
// my: { status, rank, score }
```

`getMyRank` 的 `status` 取值（SDK 原样透传后端状态值，均为查询成功的业务状态，不是错误）：

| status | 含义 | rank / score |
| --- | --- | --- |
| `EXACT` | 前 500 名内，精确名次 | `rank` 为 1–500；`score` 为本人最好成绩 |
| `OVER_LIMIT` | 有成绩但在 500 名外 | `rank` 与 `score` 均为 null，建议展示「500+」 |
| `NO_SCORE` | 已参与但本期无成绩 | 均为 null |
| `NOT_PARTICIPATING` | 未参与 | 均为 null |

- 上传授权：使用 `submitScore` 的小工具，上传至创服平台时必须勾选「用户头像昵称授权」，榜单展示的用户昵称依赖该授权；未勾选时按未授权失败处理（errCode 1005，见下方错误码表），应隐藏排行榜入口并降级。
- 各周期只保留最好成绩，更低分提交也算成功（返回历史最高分）；同分先写入者靠前，名次唯一不并列。
- `score` 须为有限数值且在 -1,000,000 ~ 1,000,000 区间内，超出返回 1004。数值量级大的游戏（挂机 / 养成 / 经营类）先换算单位（如以「万」计）再提交，同一榜单内保持单位一致即可比较。
- 接口限频同云存储：默认每个小工具每个接口 150 QPS，超限返回 2009；勿在游戏循环 / 高频定时器里密集调用，榜单结果做本地缓存（30s ~ 60s）后再展示。
- 一次提交在服务端事务内拆总 / 月 / 周 / 日四榜；周期按北京时间 0 点重置（每周一、每月 1 日），新一期不沿用上期成绩，不提供历史榜单查询。
- 榜单缓存未就绪返回 2002，不能当空榜或榜外渲染，应显示加载态并做有限次退避（如 500ms / 1s / 2s / 4s）；`data: []` 才是真实空榜（确实没人上榜）。
- `nickname` 用户资料暂缺时为 null，渲染自行兜底。

## 云存储与排行榜错误码

失败对象为 `{ errMsg, errCode? }`，**判码用 `errCode` 整数**：后端业务失败为后端整数码原值透传；10001 为本地参数错；10003 为容器白名单拒绝；网关层失败不带 errCode。

| errCode | 含义 | 处理 |
| --- | --- | --- |
| 1001 / 10001 | 参数不合法（后端 / 本地） | 修正参数，重试无意义 |
| 1002 | 批量条数超限 | 拆批后重试 |
| 1003 | 单条内容过大（content 超过 64KB） | 精简 content |
| 1004 | 分数超出 ±1,000,000 / 非有限值 | 修计分逻辑 / 换算单位 |
| 1005 / 1006 | 排行榜 / 云存储未授权 | 隐藏入口，降级 |
| 2001 | 存储读写失败 | 常规错误处理，勿伪装成「无数据」 |
| 2002 | 榜单未就绪 | 有限次退避，勿当空榜 |
| 2003 | 批量部分成功 | 走成功路径，逐项判 status |
| 2004 | 写入结果未知 | 标记待确认，query 对账，**禁止重发** |
| 2005 | 存储记录唯一键冲突 | 核对冲突来源后再决定重试策略 |
| 2008 | 授权服务不可用 | 稍后重试一次，仍失败则降级 |
| 2009 | 该应用调用此接口过于频繁（按「小工具 × 接口」限频，默认每个小工具每个接口 150 QPS） | 降低调用频率，勿密集轮询 |
| 2999 | 内部错误 | 可重试一次并控制频率 |
| 10003 | 容器白名单拒绝 | 反馈平台开通 |

## rewardAuthor

需要客户端 **9.53.3+**（iOS / Android），使用上文版本判断方法，以 `9533` 作为最低客户端版本判断值。低于该版本时隐藏赞赏入口。

调起当前小工具的赞赏流程。无业务参数，直接调用 `rewardAuthor()`，也可仅传通用回调。
赞赏对象由客户端根据当前小工具上下文确定，客户端负责开关校验、面板、协议、充值支付与平台频控。

| 成功字段 | 类型 | 说明 |
| --- | --- | --- |
| `errMsg` | string | `rewardAuthor:ok`；无额外业务数据 |

成功结果不包含赞赏金额或是否支付等业务字段，不应据此判断实际支付金额。
客户端异常走 fail / reject，通过 `errCode` 与 `errMsg` 返回。

```js
// 在用户点击赞赏入口时调用
async function rewardAuthor() {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.rewardAuthor !== "function") {
    console.log("当前环境暂不支持赞赏");
    return;
  }
  try {
    const result = await miniTool.rewardAuthor();
    console.log(result.errMsg); // "rewardAuthor:ok"
  } catch (error) {
    console.log(error.errCode, error.errMsg);
  }
}
```

接入方应在展示自定义入口前通过发布配置查询赞赏开关，并仅在客户端 9.53.3+ 展示入口。
SDK 方法存在不代表客户端已支持；旧客户端静默忽略未知事件时，调用可能持续等待。
客户端兼容与失败降级由小工具开发者处理，应保证核心功能可用，并分别验证 Android / iOS 支持与不支持的场景。

## setCloseRetentionEnabled

需要客户端 **9.53.3+**（iOS / Android），使用上文版本判断方法，以 `9533` 作为最低客户端版本判断值。低于该版本时跳过关闭挽留设置，保证核心功能可用。

设置当前容器是否允许展示关闭挽留弹窗。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | 是 | `true` 允许展示；`false` 关闭。必须显式传入布尔值，不接受数字或字符串 |

| 成功字段 | 类型 | 说明 |
| --- | --- | --- |
| `errMsg` | string | `setCloseRetentionEnabled:ok`；无额外业务数据 |

| errCode | 说明 |
| --- | --- |
| `10001` | 缺少 `enabled` 或值不是布尔类型 |
| `10002` | 当前调用上下文没有可用的小工具容器 |

```js
async function setCloseRetentionEnabled(enabled) {
  const miniTool = window.xhs && window.xhs.miniTool;
  if (!miniTool || typeof miniTool.setCloseRetentionEnabled !== "function") {
    console.log("当前环境暂不支持关闭挽留设置");
    return;
  }
  try {
    const result = await miniTool.setCloseRetentionEnabled({ enabled });
    console.log(result.errMsg); // "setCloseRetentionEnabled:ok"
  } catch (error) {
    console.log(error.errCode, error.errMsg);
  }
}

await setCloseRetentionEnabled(true);  // 允许当前容器展示关闭挽留
await setCloseRetentionEnabled(false); // 关闭当前容器的关闭挽留
```

- 开关默认 `false`，重复设置以最后一次为准；状态仅属于当前容器，不跨容器或跨次打开保留，容器关闭后释放，再次打开恢复默认值。
- 成功仅表示开关已更新；实际是否展示弹窗、用户确认及容器关闭由客户端处理。设置 `enabled: true` 不会立即展示弹窗。
- 其他客户端错误通过 `errCode` 与 `errMsg` 返回；小工具 JSAPI 公共拦截规则仍由客户端执行。
- 接入方应在客户端 9.53.3+ 调用并处理失败，方法存在不代表客户端已支持。
