# 点心网站 · 项目约定

> 语言等通用约定继承 `~/.dsh/AGENTS.md`，这里只写项目特有规则。

## 1. 改动流程（用户定，必须遵守）

1. 所有网站改动先在本地完成：编辑文件、`npm run dev` 预览、截图验证。
2. 改完通知用户：「已改好，本地预览可看」。
3. **等用户明确说「确认 / 上线 / 发布」之后**，才 `git add` + `git commit` + `git push`。
4. push 后 Cloudflare 自动构建（约 55 秒），构建完再验证线上。

例外：无。文案、样式、页面、面板，一律走这个流程。

## 2. 面板同步（用户定）

改网站内容或结构时，同步更新编辑面板 `studio/studio.html`：

- 页面结构、区块类型、字段变化 → 面板里都要能编辑到。
- 面板的渲染（`render` / `blockCard`）和保存逻辑（`save`）两处同步维护。

## 3. 技术栈与路径

- Astro 7，输出静态站，部署在 Cloudflare Workers（非 Pages）
- 部署：`git push` → Cloudflare 自动构建（约 55 秒）
- 内容源：
  - `src/content/pages/*.json`：一个页面一个文件，文件名就是路由（home.json → `/`，lab.json → `/lab`）
  - 页面结构 = 元信息（title/tagline/description/back）+ 区块列表（blocks）
  - `src/content/site.json`：站点级（品牌名、英文名、邮箱）
  - `src/content/theme.json`：全站字号比例
- 渲染：
  - `src/components/Page.astro`：页面壳（左栏身份 + 右栏导航 + 中栏内容）
  - `src/components/Blocks.astro`：区块渲染器（text / cards / timeline / contact）
  - `src/pages/index.astro`：首页，直接用 `pages/home.json`
  - `src/pages/[slug].astro`：其余页面，自动读取 `pages/*.json`
- 编辑面板：`studio/studio.html`（前端）+ `studio/studio.mjs`（读写 API，4322 端口）
- 本地预览：`npm run dev`（4321）
- 新建分站：面板里「＋ 新建页面」+ 加区块，不需要改代码

## 4. 线上验证

- 首页 `https://diandianxin.cn/`
- 实验目录 `https://diandianxin.cn/lab/`（`/lab` 会 307 到 `/lab/`，正常）

## 5. 回复里贴直达链接（用户定）

每次对网站有改动（文案、样式、页面、面板）后，在回复里贴出**可直接打开的链接**，方便用户立刻查看。按改动范围给最小集：

- 本地站点：`http://127.0.0.1:4321/<路由>`（首页 `/`、`/notes`、`/cards`、`/lab`、`/lab/stroop`、`/assess`）
- 本地面板：`http://127.0.0.1:4322/studio`
- 线上：`https://diandianxin.cn/<路由>`

只改一页就只贴那一页；改全站结构才贴首页。
