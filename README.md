# dsh-noticefiler

DSH Web GUI 通知插件：agent **需要审批 / 向你提问 / 本轮跑完 / 报错**时，在右下角弹出可点击的浮窗并播放提示音。解决"agent 在跑，我去刷视频，不知道它已经卡在等我"的问题。

## 它做什么

| 事件 | 侦测方式 |
|---|---|
| 需要审批 | 会话里出现 `data-approval-key` / `data-plan-review-key` 卡片 |
| agent 提问 | 会话里出现 `data-question-key` 卡片 |
| 本轮跑完 | 主会话 `running` 由 true 变 false（子 agent 不打扰） |
| 报错 | `api-session/error` 转发事件 |

浮窗：右下角堆叠（最多 3 张，各 10 秒自动消失）。**点卡片切到该会话**，并尝试滚动定位到那张待处理卡片；找不到就退回滚到最新消息。

设置面板：侧边栏底部（设置上方）的铃铛图标打开。含总开关、总音量、四类事件各自的开关 / 选声 / 试听、以及自定义音频上传（上限 4MB、12 个）。

## 安装

```sh
dsh plugin --profile web add C:\Users\Administrator\Desktop\dsh-noticefiler
```

然后重启 `dsh web`，刷新浏览器页面。侧边栏底部应出现铃铛图标。

## 已知限制

- **切到别的窗口全屏看视频时看不见也听不见。** 浮窗画在页面里，只能用浏览器系统通知（Notification API）或 Windows 原生通知才能穿透窗口。前者的前提是浏览器在非安全上下文里允许通知权限；后者见下条。
- **声音是浏览器合成的，不是 Windows 原生音色。** 六个音色名（`Asterisk` / `Exclamation` / `Question` / `Hand` / `Notice` / `Beep`）与 Windows 系统声音一一对应，但在浏览器里由 Web Audio 合成（FM 钟声 / 音序），音色接近而非相同。
  要换成真正的 Windows 原生声音，Host 半需要把 `C:\Windows\Media\*.wav` 交给浏览器半。正式插件包里的浏览器半**没有** `host.call`（那是动态 Cordis 包专有），所以这条路要先用对 Typert `@Remote` 命名空间，或者自己注册 HTTP 路由并处理页面鉴权。两件都还没做。
- 设置存在浏览器 `localStorage`（键 `dsh.noticefiler.v1`），不写进 `settings.yaml`；换浏览器/换设备不同步，同一浏览器多标签页之间会同步。

## 开发

改动 `lib/client.js` 后重启 `dsh web` 并刷新页面即可，无需打包步骤（本文件是直接的浏览器 ESM）。
