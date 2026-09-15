/**
 * dsh-noticefiler — Host 半。
 *
 * 当前只做一件事：把插件行挂进 web 组合，让浏览器半（lib/client.js）被加载。
 *
 * 为什么这里暂时不播 Windows 原生声音：
 * 正式插件包里的浏览器半拿不到 Package-private 的 `host.call`（那是动态 Cordis 包专有），
 * 要在 Host 与 Client 之间传话只能走 Typert `@Remote` 生成的命名空间，或者自己注册
 * HTTP 路由 + 处理页面鉴权 —— 这两条都是 DSH 内部件，没有面向插件作者的文档。
 * 所以先按"允许降级"落地：声音由浏览器半用 Web Audio 合成，音量可控。
 * 待确认 Remote 的正确用法后，再把原生系统声音接上（改 lib/client.js 一处播放函数即可）。
 */

/**
 * Host 插件主体。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host 上下文。
 */
export function apply(ctx) {
  ctx.logger?.info?.('dsh-noticefiler: host half loaded (声音由浏览器半负责)')
}
