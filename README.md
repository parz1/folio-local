# Folio Local

用喜欢的编辑器写 Markdown，在浏览器里随写随看。示例是一篇关于墨水分色的笔记，中文、英文和日文各有一份原文，共用一张原创示意图。

## 第一次打开

需要 Node.js 22 或 24，以及 pnpm 9。克隆仓库后进入含有 `package.json` 的目录，运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开终端显示的本地地址（通常是 http://127.0.0.1:5173）。首次安装需要网络下载依赖；安装完成后，写作与预览都在本机完成。启动无需账号、数据库或环境变量。

## 改一段，看看结果

用 Obsidian 打开 `content/`，或用任意文本编辑器打开下面的文件。保持浏览器预览页开着，在对应 Markdown 的第一段末尾加一句话并保存。页面会自动显示新文字。右上角的语言菜单可以切换同一篇笔记的译本。

| 译本 | 编辑文件 | 本地路由 |
| --- | --- | --- |
| 简体中文 | `content/index.md` | `/` |
| English | `content/en/index.md` | `/en/` |
| 日本語 | `content/ja/index.md` | `/ja/` |

图片位于 `content/assets/ink-study.png`，三个译本都通过相对路径引用它。复制整个 `content/` 目录，就能带走三份原文与原图。

## 静态预览

```sh
pnpm build
pnpm preview
```

产物位于 `.vitepress/dist/`。这一版用 VitePress 提供本地预览。静态构建会包含目录里的全部译本，请只把打算分享的内容放入待分发的构建。这里的命令只操作本机文件。

代码、示例文章和示意图采用 [MIT 许可证](LICENSE)。
