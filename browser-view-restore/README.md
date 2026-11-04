# DSH 浏览器插件「DevTools socket closed」自愈补丁

## 这是什么

DSH 的浏览器工具（`browser_navigate` / `browser_screenshot` / `browser_click` 等）在底层通过 CDP
连接一个由 DSH 自己启动的 headless Chrome。只要这个连接断开一次，插件就再也连不回去，
此后每次调用都报 `Page.navigate: the DevTools socket closed`，只能重启 DSH 才能恢复。

本目录保存的是**已修复**的插件文件与说明。

- 插件：`@linxin666/dsh-client-ui-browser-view` 0.4.13
- 现场文件：`C:\Users\xynoo\.dsh\profiles\desktop\node_modules\@linxin666\dsh-client-ui-browser-view\lib\index.js`
- 备份：本目录 `index.patched-0.4.13.js`（424,626 字节，含 2 处 `sessionIsAlive`）

## 根因

`BrowserViewService.requireSession()` 原来只判断缓存是否非空：

```js
if (this.session !== void 0) return this.session;
```

它从不检查这条连接是否还活着。而 `CdpClient` 在 socket 关闭时会把 `closedReason`
设为 `"the DevTools socket closed"`，之后 `send()` 一律直接 reject。于是：

1. Chrome 进程被系统回收 / 被外部杀掉 / 被 OOM 清理；
2. WebSocket 收到 close 事件，`closedReason` 被写入，客户端永久处于死亡状态；
3. `this.session` 仍然非空，`requireSession()` 继续返回这个死连接；
4. 所有调用在 `send()` 处立刻失败，`browser_tabs` 还会继续吐出缓存的旧 tab（`loading: true`）；
5. 唯一会清空 session 的是 `reconfigure()`（即改插件设置），所以用户侧表现为「只能重启 DSH」。

补充证据：`%TEMP%\dsh-browser-view-eGwy7Z` 残留目录（2026-11-02 19:42）里 Crashpad
报告为空、`Last Version` 是 156.0.8078.76、profile 目录完整 —— 说明进程是被正常终止
（而不是崩溃），且没有走 `dispose()` 清理，与「socket 关闭后不自愈」的路径吻合。

## 补丁内容（4 处）

### 1. 新增存活判定函数（插在 `openConfiguredSession` 之后）

```js
function sessionIsAlive(session) {
	const transport = session?.transport;
	if (transport === void 0) return false;
	if (transport.closedReason !== void 0) return false;
	const child = session.chrome?.child;
	if (child !== void 0 && (child.exitCode !== null || child.signalCode !== null)) return false;
	return true;
}
```

### 2. 新增 `BrowserViewService.liveSession()`

发现 session 已死时把它彻底丢弃（清 session / opening / bindings / authTopUpSpent /
displayedTabId / selectionPinned，记一条 `lastError`），并异步 `dispose()` 掉旧浏览器进程，
返回 `undefined` 让调用方走「重新启动」路径。

### 3. 所有读取入口改为走 `liveSession()`

`get running()`、`state()`、`listTabs()`、`closeOwnTabs()`、`scope()`、`startStreaming()`、
`stopStreaming()`、`displayedOrDefault()`、`showTab()`、`followPanelSession()`、`refreshTab()`。

### 4. `requireSession()` 先探活再复用

```js
const live = this.liveSession();
if (live !== void 0) return live;
// 否则 startSession()：重启 headless Chrome 并重建 CDP 连接
```

## 验证情况

- `node --check` 通过。
- 离线端到端已跑通（用 stub cordis + 真实 ws + 真实 headless Chrome）：
  - 第 1 次 `browser_navigate` 正常启动浏览器（2.1s）；
  - 杀掉该 Chrome 主进程后，第 2 次 `browser_navigate` 在 1.05s 内**自动重启**并成功导航；
  - 第 3 次调用继续正常；
  - 结束时确认换成了新的 Chrome 进程。

## 如果补丁被覆盖（重装/升级插件后）

1. 先确认版本：`node -e "console.log(require('C:/Users/xynoo/.dsh/profiles/desktop/node_modules/@linxin666/dsh-client-ui-browser-view/package.json').version)"`
2. 若是 `0.4.13`：把本目录的 `index.patched-0.4.13.js` 覆盖到 `lib/index.js`，
   再 `node --check` 校验。
3. 若版本已变：不要直接覆盖。先看新版本 `requireSession()` 是否还在用
   `if (this.session !== void 0) return this.session;`（截至 2026-11-04，0.4.14 仍是如此，未修复），
   是的话按上面 4 处重新打一遍。

## 卸载/回滚

用 npm 重新拉一份干净包覆盖即可：

```bash
cd /c/Users/xynoo/.dsh/profiles/desktop
npm pack @linxin666/dsh-client-ui-browser-view@0.4.13
tar xzf linxin666-dsh-client-ui-browser-view-0.4.13.tgz
cp package/lib/index.js node_modules/@linxin666/dsh-client-ui-browser-view/lib/index.js
```
