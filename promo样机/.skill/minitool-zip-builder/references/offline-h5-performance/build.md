# 生产构建与压缩

保留项目已有工具链和锁文件。简单 HTML / CSS / JS 项目可以直接整理合规目录，按实际体积决定是否引入压缩步骤。框架项目先做生产构建，交付的入口与懒加载脚本都必须是 Chrome 61 可执行的经典外置 JS。

> **以下配置仅供参考。** 先读项目锁文件、现有构建和目标容器规范，再选择需要的配置。已有构建能输出合规且达标的 ZIP 时，保留现有工具链。示例目录、体积阈值、分包和压缩选项均按项目调整，最终以产物检查和目标端运行结果为准。

| 场景 | 优先评估 | 用什么验证 |
| --- | --- | --- |
| 原生页面、依赖很少 | 直接整理经典脚本与静态目录 | 入口、脚本顺序和包体 |
| 已用 webpack，有明确的重功能边界 | 生产模式与经典异步 chunk | 首屏依赖数、首用等待、chunk 路径与失败重试 |
| 已用 Vite，入口依赖少 | 小型单入口 IIFE 与独立 HTML | 经典脚本、首屏内容和实际资源布局 |
| 已用 Vite，启动 JS 很重 | 先测解析与执行，再考虑独立经典入口或现有经典分片方案 | 首屏与功能首用分别对照，避免仅依据分片数量决策 |

若素材由 OSS 管理，先在构建环境下载锁定版本并校验，再生成、复制和审计最终资源。目录布局与分发边界见 [大型资源的 OSS 管理与分发](./oss.md)。

## 通用构建顺序

1. 从锁文件恢复依赖，核对脚本、样式和浏览器 API 目标。构建期允许使用模块组织源码，最终检查所有 JS，包括第三方依赖、构建运行时、延迟 chunk 和 Worker。语法转译与 API 兼容分别核对。
2. 用生产模式消除开发代码，按需导入并删除死代码。保留实际副作用，例如样式导入和注册模块。检查重复依赖、大型语言包和生成资源。
3. 对核心功能尽量少分片，对重功能按用户操作或场景拆分。对比首屏 JS 执行和首次使用额外等待，再决定合并或继续拆分。所有分片均随 ZIP 提交。
4. 先启用常规 minify 和局部变量改名。稳定公共属性、桥接方法名、序列化字段、DOM 选择器以及跨 chunk 的接口。更强的混淆仅在确有需求且实测允许时启用，逐项对照启动和包体。关闭属性混淆、控制流平坦化、字符串数组解码及动态代码生成等高风险选项。混淆无法保护随包交付的密钥。调试映射可按包版本留在开发侧，ZIP 排除 `.map` 和引用。
5. 清理产物目录后完成构建和复制，再审计最终目录。生成新 ZIP，解压检查入口、文件名、资源位置与加载顺序，最后用同一包测量及交付。源码改动后重复这一步。

## webpack 5

下面是单页面 webpack 5 配置片段，使用 `babel-loader`、`@babel/core`、`@babel/preset-env` 和 `terser-webpack-plugin`。将 HTML、静态资源和独立 CSS 随现有构建流程复制到最终目录，HTML 用 `<script defer src="./app.js"></script>`。CSS loader 若按异步 chunk 加载样式，也要核查最终链接路径。

```js
// webpack.config.cjs
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  target: ['web', 'es2017'],
  entry: './src/app.js',
  devtool: false,
  output: {
    filename: 'app.js',
    chunkFilename: 'chunks/[name].[contenthash].js',
    publicPath: './',
    chunkLoading: 'jsonp',
    iife: true,
    clean: true // 仅在 output.path 是专用生成目录时启用
  },
  module: {
    rules: [{
      test: /\.(?:mjs|cjs|js)$/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: [['@babel/preset-env', { targets: { chrome: '61' }, modules: false }]]
        }
      }
    }]
  },
  performance: {
    hints: 'warning',
    maxEntrypointSize: 300 * 1024, // 示例入口预算，按项目基线调整
    maxAssetSize: 500 * 1024
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
      extractComments: false,
      terserOptions: { ecma: 2017, mangle: { properties: false } }
    })]
  }
};
```

源码可通过 `import('./editor.js')` 表达异步边界，webpack 会将其编译成包内经典脚本加载。检查运行时没有残留原生 import，失败可重试，异步 JS 位于 `chunks/`，并实测 CSP 和 WebView 加载。转译依赖范围根据产物核查收紧，不能简单排除所有依赖后假定兼容。若额外开启独立 runtime 或入口 vendor chunk，HTML 必须按生成顺序引入全部入口文件。

`target` 约束 webpack 运行时，源码语法由 Babel 等转译，浏览器 API 能力单独核查。示例的体积告警按 webpack 产物计字节，手工复制的资源与最终 ZIP 另行审计。确认构建输出目录可清理后再启用 `output.clean`，静态文件在构建后复制或交由当前构建产出。

参考 [webpack · Target](https://webpack.js.org/configuration/target/)、[Performance](https://webpack.js.org/configuration/performance/)、[Output](https://webpack.js.org/configuration/output/)、[Code Splitting](https://webpack.js.org/guides/code-splitting/) 和 [Terser · Options](https://terser.org/docs/options/)。

## Vite

默认应用构建通常输出模块脚本。单入口小工具可选择 IIFE 构建，并使用单独的 ZIP 入口模板。以下是 **Vite 6** 语法的片段，适用于将 JS 合成单文件的小工具。现有 Vite 项目按锁定版本核对选项，避免把不同版本的构建配置混用。

```js
// vite.config.mjs
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'chrome61',
    cssTarget: 'chrome61',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 300, // 示例警告阈值，单位 kB，按实测调整
    lib: {
      entry: 'src/app.js',
      formats: ['iife'],
      name: 'MiniToolApp',
      fileName: () => 'app.js',
      cssFileName: 'style'
    }
  }
});
```

构建后复制独立 HTML 模板到 ZIP 根，引用实际生成的 `./app.js`，有 CSS 时链接 `./style.css`。Vite 6 库模式会内联通过 import 进入构建的静态资源，`assetsInlineLimit: 0` 在库模式中也无法关闭。若现有项目已用 `public/` 管理这些文件，核对实际复制位置和最终包内引用。将需要保持独立的资源作为静态文件复制，使用包内路径引用，避免把大图和字体编进 JS／CSS。大型业务需要延迟 JS 时，可将独立功能分开构建成经典入口并按需加载，或使用能输出经典分片的现有构建流程。单个 IIFE 会把代码合在一起，无法省掉入口的读取与解析成本。需要 Terser 时按该版本安装对应依赖并比较产物，保留常规压缩和局部改名即可。

`cssTarget` 约束 CSS 压缩目标，现代布局仍要按 [CSS 兼容性](../css-compatibility.md) 补回退。更换 Vite 主版本时核对对应版本的构建后端、压缩器选项和输出格式；先验证最小入口再迁移。

参考 [Vite 6 · Build Options](https://v6.vite.dev/config/build-options) 和 [ZIP 规范](../zip-artifact-spec.md)。

## 交付物检查

在项目根目录执行。先清理或使用新的目标 ZIP 路径，避免 `zip` 更新旧文件时保留已经从目录删除的条目。将示例中的 skill 路径改成实际路径。

```sh
set -e
node /path/to/skill/scripts/audit_artifact.mjs ./dist
(cd dist && zip -r ../tool-candidate.zip . -x '*.DS_Store')
node /path/to/skill/scripts/audit_artifact.mjs ./tool-candidate.zip
unzip -l ./tool-candidate.zip
```

审计与压缩前确认没有源码、开发配置、调试映射或其他非白名单文件。没有 Node 时按 [性能预算](../performance-budget.md) 走 Python 或人工门禁。运行检查至少包括首屏、第一次进入延迟功能、重试与返回、断网核心路径、Android 及 iOS。记录构建命令、目标、ZIP 哈希、体积和未测项。
