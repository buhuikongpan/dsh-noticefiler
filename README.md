<div align="center">

# 🔔 dsh-noticefiler

**别让 agent 等你。也别让你等 agent。**

DSH Web GUI 通知插件 —— 审批、提问、跑完、报错，右下角一声脆响，点一下直接跳到那张卡。

[![license](https://img.shields.io/badge/license-MIT-3fb950?style=flat-square)](./package.json)
[![platform](https://img.shields.io/badge/platform-dsh%20web-58a6ff?style=flat-square)](#安装)
[![plugin](https://img.shields.io/badge/dsh-plugin-8957e5?style=flat-square)](package.json)
[![version](https://img.shields.io/badge/version-0.1.0-f0883e?style=flat-square)](https://github.com/buhuikongpan/dsh-noticefiler/releases)

</div>

---

## 你是不是也这样

agent 开始跑，你切去刷视频 / 回消息 / 摸鱼。
五分钟过去，你回来一看 —— **它三分钟前就在等你点「批准」了。**

它不敢动，你不敢走。这就是最贵的闲置。

`dsh-noticefiler` 干的事只有一件：**把「agent 卡住等你」这件事，变成你听得到、点得动的一声响。**

---

## 开箱即用

```sh
dsh plugin --profile web add https://github.com/buhuikongpan/dsh-noticefiler
```

重启 `dsh web`，刷新页面。侧边栏底部多一个铃铛 🔔 —— 装完了。

> 本地开发直接 `dsh plugin --profile web add C:\path\to\dsh-noticefiler` 也一样。

---

## 它盯着什么

四类事件，各自独立开关、独立选声：

| 事件 | 什么时候响 | 默认音色 |
|---|---|---|
| 🛑 **需要审批** | 会话里出现审批 / 计划复核卡片 | `Exclamation` |
| ❓ **agent 提问** | 会话里出现待回答的问题卡片 | `Question` |
| ✅ **本轮跑完** | 主会话从 `running` 变 idle | `Asterisk` |
| 💥 **报错** | 收到 `api-session/error` | `Hand` |

> ⚠️ **子 agent 不打扰你。** 只有主会话跑完才响——多 agent 并行的噪音，这里被主动滤掉了。

---

## 浮窗的三个讲究

**右下角堆叠，最多 3 张，10 秒自动消失。**
不会糊满屏幕，也不会在你眨眼的瞬间溜走。

**点一下，直接到现场。**
切到对应会话，**并尝试滚动定位到那张待处理的卡片**——不是粗暴地甩到最新消息。定位失败才退回滚到底。

**六个音色，与 Windows 系统声音一一对应。**

```
Asterisk   Exclamation   Question   Hand   Notice   Beep
```

不想要预设？**自己传。** 上限 12 个，单个 4MB 以内，选好即用。

---

## 设置面板

侧边栏底部（「设置」上方）的铃铛图标。里面是：

- 总开关 · 总音量
- 四类事件 × 各自的 **开 / 关 · 选声 · 试听**
- 自定义音频上传

设置存在浏览器 `localStorage`（键 `dsh.noticefiler.v1`）——**不写进 `settings.yaml`**。同一浏览器多标签页实时同步；换设备不同步。

---

## 说清楚它做不到什么

好插件敢把边界写明白。

**① 全屏看视频时，你看不见也听不见。**
浮窗是画在页面里的，穿不透窗口。要穿透得走 Notification API 或 Windows 原生通知——都还没做。

**② 声音是浏览器合成的，不是 Windows 原生音色。**
`Asterisk` / `Exclamation` / … 报的是 Windows 系统声音的名字，实际由 Web Audio 现场合成（FM 钟声 / 音序），**音色接近，不等于原声**。

想换真·系统声音（`C:\Windows\Media\*.wav`），Host 半得把音频交给浏览器半。而正式插件包里的浏览器半**没有** `host.call`（那是动态 Cordis 包专有）——这条路要么走对 Typert `@Remote` 命名空间，要么自己注册 HTTP 路由 + 处理页面鉴权。**两件事都还没做。**

> 技术选型是「允许降级」：先把通知送到，音量可控，不阻塞主流程。等 `@Remote` 的用法确认了，改 `lib/client.js` 里一处播放函数即可接上原生音。

---

## Roadmap

- [ ] Windows 原生系统声音（走 `@Remote` 或自建路由）
- [ ] 浏览器系统通知，穿透窗口
- [ ] 设置跨设备同步
- [ ] 自定义浮窗位置 / 停留时长

---

## 开发

改 `lib/client.js` → 重启 `dsh web` → 刷新页面。

**没有构建步骤**，这个文件就是浏览器直接吃的 ESM。

```
lib/index.js        Host 半：把插件挂进 web 组合
lib/client.js       浏览器半：设置面板 + 浮窗 + Web Audio
cordis.patch.yml    插件名册注入
```

---

<div align="center">

**MIT** · 觉得有用就给颗 ⭐，比什么都实在

</div>
