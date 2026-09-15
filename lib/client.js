/**
 * dsh-noticefiler — 浏览器半。
 *
 * 形态：**设置里的一整页**（往 `settings.section` 注册一个 id），而不是侧边栏底部的小按钮。
 * 浮窗与提示音在页面里持续工作，与设置页是否打开无关。
 *
 * 不依赖打包器，但需要 `require('react')` / `require('react-dom/client')`：
 * 槽位注册接受的是 **React 组件**，不是裸 DOM 节点。
 *
 * 四类事件的来源：
 *  - 审批 / 提问：DOM 上稳定的 data-approval-key / data-question-key / data-plan-review-key
 *  - 本轮跑完：`ctx.sessions.list` 里主会话 running 由 true 变 false（子 agent 不打扰）
 *  - 报错：`ctx.remote` 的 api-session/error 转发事件
 *
 * 声音：Web Audio 合成六种音色，名字与 Windows 系统声音对应，音量可控。
 * 为什么不在 Host 播原生声音：正式插件包的浏览器半没有 `host.call` 通道
 * （那是动态 Cordis 包专有），跨端只能走 Typert `@Remote` 或自建 HTTP 路由。
 */

const LOADER_ID = 'dsh-noticefiler'
const TOAST_CSS_ID = 'dsh-noticefiler-toast-css'
const SETTINGS_KEY = 'dsh.noticefiler.v1'
const CHANNEL_NAME = 'dsh-noticefiler'
const SECTION_ID = 'dsh-noticefiler'

const KINDS = ['approval', 'question', 'turn', 'error']

const KIND_META = {
  approval: { label: '需要审批', icon: '⚠', tone: 'warning' },
  question: { label: 'agent 提问', icon: '?', tone: 'info' },
  turn: { label: '本轮完成', icon: '✓', tone: 'ok' },
  error: { label: '出错了', icon: '✕', tone: 'danger' },
}

/** 音色名（对齐 Windows 系统声音的名字，便于以后接原生播放时一一对应）。 */
const SOUND_NAMES = ['Asterisk', 'Exclamation', 'Question', 'Hand', 'Notice', 'Beep']

/**
 * 每段音色的配方。
 *
 * - `bell`：FM 钟声（载波 + 非整数比调制器），接近系统通知的"叮"
 * - `chord` / `buzz`：顺序音符，靠音高与波形区分语义
 */
const RECIPES = {
  Asterisk: { type: 'bell', carrier: 1046.5, ratio: 1.4142, index: 700, decay: 0.55, gain: 0.3 },
  Exclamation: { type: 'bell', carrier: 830.6, ratio: 1.5, index: 520, decay: 0.4, gain: 0.32 },
  Question: { type: 'chord', notes: [659.25, 880, 1174.66], wave: 'sine', step: 0.1, decay: 0.28, gain: 0.24 },
  Hand: { type: 'buzz', notes: [392, 523.25], wave: 'square', step: 0.16, decay: 0.22, gain: 0.16 },
  Notice: { type: 'chord', notes: [1174.66], wave: 'sine', step: 0.1, decay: 0.3, gain: 0.24 },
  Beep: { type: 'buzz', notes: [440], wave: 'square', step: 0.12, decay: 0.18, gain: 0.14 },
}

const DEFAULT_SETTINGS = {
  enabled: true,
  volume: 0.7,
  kinds: { approval: true, question: true, turn: true, error: true },
  sounds: { approval: 'Exclamation', question: 'Question', turn: 'Asterisk', error: 'Hand' },
  uploads: [],
}

/** 只有浮窗需要全局样式；设置页用内联样式，避免影响设置面板自身的排版。 */
const TOAST_CSS = `
.dnf-toasts{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none}
.dnf-card{pointer-events:auto;min-width:250px;max-width:340px;padding:10px 12px;border-radius:10px;background:var(--dsw-specific-menu,#1f2430);color:var(--dsw-alias-label-primary,#e8eaf0);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.35));font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;text-align:left}
.dnf-card[data-tone="warning"]{border-color:rgba(255,176,32,.55)}
.dnf-card[data-tone="danger"]{border-color:rgba(255,86,86,.6)}
.dnf-card[data-tone="ok"]{border-color:rgba(52,199,89,.5)}
.dnf-card-head{display:flex;align-items:center;gap:8px}
.dnf-card-icon{flex:none}
.dnf-card-label{font-weight:600}
.dnf-card-close{margin-left:auto;border:none;background:transparent;color:inherit;opacity:.6;cursor:pointer;font:14px/1 system-ui,sans-serif;padding:2px 5px;border-radius:6px}
.dnf-card-close:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}
.dnf-card-sub{margin-top:4px;opacity:.85;word-break:break-word}
.dnf-card-hint{margin-top:2px;font-size:11px;opacity:.55}
`

/* ────────────────────────── 设置读写 ────────────────────────── */

function readSettings() {
  const merged = {
    ...DEFAULT_SETTINGS,
    kinds: { ...DEFAULT_SETTINGS.kinds },
    sounds: { ...DEFAULT_SETTINGS.sounds },
    uploads: [],
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw === null) return merged
    const saved = JSON.parse(raw)
    if (typeof saved?.enabled === 'boolean') merged.enabled = saved.enabled
    if (typeof saved?.volume === 'number') merged.volume = Math.max(0, Math.min(1, saved.volume))
    for (const kind of KINDS) {
      if (typeof saved?.kinds?.[kind] === 'boolean') merged.kinds[kind] = saved.kinds[kind]
      if (typeof saved?.sounds?.[kind] === 'string') merged.sounds[kind] = saved.sounds[kind]
    }
    if (Array.isArray(saved?.uploads)) {
      merged.uploads = saved.uploads
        .filter(
          (item) =>
            typeof item?.id === 'string' && typeof item?.name === 'string' && typeof item?.dataUrl === 'string',
        )
        .slice(0, 12)
    }
  } catch {
    /* 坏配置按默认值处理，不让一份坏数据把插件卡死 */
  }
  return merged
}

/**
 * 可被 `useSyncExternalStore` 订阅的状态容器。
 *
 * snapshot 必须缓存：每次 `getSnapshot` 返回新对象会让 React 无限重渲染。
 */
function createStore() {
  let snapshot = { settings: readSettings(), cards: [], audioBlocked: false }
  let counter = 0
  const listeners = new Set()
  const channel = (() => {
    try {
      return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME)
    } catch {
      return null
    }
  })()

  const emit = () => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch (error) {
        console.error('[dsh-noticefiler] 订阅者报错', error)
      }
    }
  }
  const set = (patch) => {
    snapshot = { ...snapshot, ...patch }
    emit()
  }
  const dismiss = (key) => set({ cards: snapshot.cards.filter((card) => card.key !== key) })

  if (channel !== null) {
    channel.onmessage = (event) => {
      if (event?.data?.type === 'settings') set({ settings: readSettings() })
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    saveSettings(patch) {
      const settings = { ...snapshot.settings, ...patch }
      set({ settings })
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch (error) {
        console.error('[dsh-noticefiler] 保存设置失败', error)
      }
      channel?.postMessage?.({ type: 'settings' })
    },
    pushCard(event) {
      counter += 1
      const key = String(counter)
      set({ cards: [...snapshot.cards, { key, event }].slice(-3) })
      setTimeout(() => dismiss(key), 10000)
    },
    dismiss,
    markAudioBlocked: () => set({ audioBlocked: true }),
    clearAudioBlocked: () => set({ audioBlocked: false }),
  }
}

/* ────────────────────────── 声音 ────────────────────────── */

/** 六种合成音色 + 自定义上传音频，统一受总音量控制。 */
function createPlayer(store) {
  let ctx = null
  const elements = new Map()

  const audioContext = () => {
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext
      if (Ctor === undefined) return null
      if (ctx === null) ctx = new Ctor()
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      return ctx
    } catch {
      return null
    }
  }

  const playBell = (audio, recipe, volume, at) => {
    const carrier = audio.createOscillator()
    const modulator = audio.createOscillator()
    const modGain = audio.createGain()
    const out = audio.createGain()
    carrier.frequency.value = recipe.carrier
    modulator.frequency.value = recipe.carrier * recipe.ratio
    modGain.gain.value = recipe.index
    out.gain.setValueAtTime(0.0001, at)
    out.gain.exponentialRampToValueAtTime(Math.max(0.001, recipe.gain * volume), at + 0.012)
    out.gain.exponentialRampToValueAtTime(0.0001, at + recipe.decay)
    modulator.connect(modGain)
    modGain.connect(carrier.frequency)
    carrier.connect(out)
    out.connect(audio.destination)
    carrier.start(at)
    modulator.start(at)
    carrier.stop(at + recipe.decay + 0.05)
    modulator.stop(at + recipe.decay + 0.05)
  }

  const playSequence = (audio, recipe, volume, at) => {
    let cursor = at
    for (const frequency of recipe.notes) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = recipe.wave
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, cursor)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, recipe.gain * volume), cursor + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + recipe.decay)
      oscillator.connect(gain)
      gain.connect(audio.destination)
      oscillator.start(cursor)
      oscillator.stop(cursor + recipe.decay + 0.05)
      cursor += recipe.step
    }
  }

  const playById = (soundId, volume) => {
    const upload = store.getSnapshot().settings.uploads.find((item) => item.id === soundId)
    if (upload !== undefined) {
      let element = elements.get(upload.id)
      if (element === undefined) {
        element = new Audio(upload.dataUrl)
        elements.set(upload.id, element)
      }
      element.volume = volume
      try {
        element.currentTime = 0
      } catch {
        /* 忽略 */
      }
      element.play().catch((error) => console.error('[dsh-noticefiler] 自定义音频播放被拒', error))
      return true
    }
    const audio = audioContext()
    if (audio === null) return false
    const recipe = RECIPES[soundId] ?? RECIPES.Asterisk
    const at = audio.currentTime + 0.02
    if (recipe.type === 'bell') playBell(audio, recipe, volume, at)
    else playSequence(audio, recipe, volume, at)
    return true
  }

  return {
    play(kind) {
      const settings = store.getSnapshot().settings
      return playById(settings.sounds[kind], settings.volume)
    },
    preview(soundId, volume) {
      const settings = store.getSnapshot().settings
      return playById(soundId ?? settings.sounds.turn, volume ?? settings.volume)
    },
    prime() {
      audioContext()
    },
  }
}

/* ────────────────────────── 模块加载 ────────────────────────── */

/**
 * 模块加载器注入的 `require`。
 *
 * React 只出现在 factory 的参数里，这里存一份供 {@link apply} 使用。
 */
let moduleRequire = null

/**
 * 取一个模块；拿不到就抛出带名字的错误，便于在页面控制台定位。
 *
 * @param {string} name - 模块名，如 `react`。
 * @returns {any} 模块导出。
 */
function requireModule(name) {
  if (typeof moduleRequire !== 'function') {
    throw new Error(`[dsh-noticefiler] 模块加载器未注入 require，无法加载 ${name}`)
  }
  const loaded = moduleRequire(name)
  if (loaded === undefined || loaded === null) {
    throw new Error(`[dsh-noticefiler] 模块不可用: ${name}`)
  }
  return loaded
}

/* ────────────────────────── 插件主体 ────────────────────────── */

function apply(ctx) {
  // 自带诊断面板：这些状态写进 window，便于在页面里直接读（不依赖 console 通道）
  const status = { steps: [], error: null }
  window.__DNF_STATUS__ = status
  const mark = (step) => {
    status.steps.push(step)
  }
  mark('apply 开始')

  let react
  let reactDom
  try {
    react = requireModule('react')
    mark('react 已加载')
    reactDom = requireModule('react-dom/client')
    mark('react-dom/client 已加载')
  } catch (error) {
    status.error = `模块加载失败: ${error?.message ?? error}`
    console.error('[dsh-noticefiler]', status.error)
    return
  }
  const h = react.createElement
  const store = createStore()
  const player = createPlayer(store)
  const disposers = []

  if (document.getElementById(TOAST_CSS_ID) === null) {
    const style = document.createElement('style')
    style.id = TOAST_CSS_ID
    style.textContent = TOAST_CSS
    document.head.append(style)
  }

  const useSnapshot = () =>
    react.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  /** 切到目标会话，并尽力滚动定位到那张待处理卡片。 */
  const focusSession = (event) => {
    const sessionId = event?.sessionId
    if (typeof sessionId === 'string' && sessionId !== '') {
      try {
        ctx.get('uiWorkspace')?.openSession?.(sessionId)
      } catch (error) {
        console.error('[dsh-noticefiler] 切换会话失败', error)
      }
    }
    const isPending = event.kind === 'approval' || event.kind === 'question'
    let attempts = 0
    const tick = () => {
      attempts += 1
      if (isPending) {
        const target = document.querySelector(
          '[data-approval-key],[data-question-key],[data-plan-review-key]',
        )
        if (target !== null) {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return
        }
      }
      if (attempts >= 8) {
        const scroller = document.querySelector('[data-summary-scroll-region]')
        scroller?.scrollTo?.({ top: scroller.scrollHeight, behavior: 'smooth' })
        return
      }
      setTimeout(tick, 180)
    }
    setTimeout(tick, 220)
  }

  /** 提醒一次：按开关过滤，然后弹卡 + 出声。 */
  const notify = (kind, text, sessionId) => {
    const settings = store.getSnapshot().settings
    if (!settings.enabled) return
    if (settings.kinds[kind] !== true) return
    const snapshot = ctx.get('sessions')?.list?.getSnapshot?.()
    const resolved = String(sessionId ?? snapshot?.current ?? '')
    const title = snapshot?.byId?.[resolved]?.title ?? ''
    store.pushCard({ kind, text: text ?? '', title, sessionId: resolved })
    if (player.play(kind) !== true) store.markAudioBlocked()
  }

  /* ---- 浮窗（始终工作，与设置页开合无关） ---- */

  function ToastLayer(props) {
    const snapshot = useSnapshot()
    const count = snapshot.cards.length
    react.useEffect(() => {
      props?.onRendered?.(count)
    })
    const cards = snapshot.cards.map((card) => {
      const meta = KIND_META[card.event.kind] ?? KIND_META.turn
      return h(
        'div',
        {
          key: card.key,
          className: 'dnf-card',
          'data-tone': meta.tone,
          title: card.event.text === '' ? '点击切到该会话' : card.event.text,
          onClick: () => {
            focusSession(card.event)
            store.dismiss(card.key)
          },
        },
        h(
          'div',
          { className: 'dnf-card-head' },
          h('span', { className: 'dnf-card-icon' }, meta.icon),
          h('span', { className: 'dnf-card-label' }, meta.label),
          h(
            'button',
            {
              className: 'dnf-card-close',
              type: 'button',
              onClick: (domEvent) => {
                domEvent.stopPropagation()
                store.dismiss(card.key)
              },
            },
            '×',
          ),
        ),
        h(
          'div',
          { className: 'dnf-card-sub' },
          card.event.title === '' ? card.event.sessionId : card.event.title,
        ),
        h('div', { className: 'dnf-card-hint' }, '点击切到该会话'),
      )
    })
    return h('div', { className: 'dnf-toasts' }, cards)
  }

  // 浮窗根：失败也要留下可读的痕迹，而不是"页面里什么都没发生"
  let toastRoot
  try {
    const container = document.createElement('div')
    toastRoot = reactDom.createRoot(container)
    document.body.append(container)
    toastRoot.render(
      h(ToastLayer, {
        onRendered: (count) => {
          status.toastRendered = count
          status.toastContainerChildren = container.children.length
          status.toastContainerInDom = document.body.contains(container)
        },
      }),
    )
    mark('浮窗根已挂载')
  } catch (error) {
    status.error = `浮窗挂载失败: ${error?.message ?? error}`
    console.error('[dsh-noticefiler]', status.error)
  }

  /* ---- 设置页：设置 → 通知 ---- */

  const S = {
    wrap: { display: 'flex', flexDirection: 'column', gap: '2px', maxWidth: '540px', paddingTop: '4px' },
    title: { margin: '0 0 2px', fontSize: '16px', fontWeight: 500, lineHeight: '24px' },
    desc: { margin: '0 0 10px', fontSize: '12px', lineHeight: '18px', opacity: 0.66 },
    group: {
      borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18))',
      paddingTop: '10px',
      marginTop: '6px',
    },
    row: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', flexWrap: 'wrap' },
    label: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '150px', fontSize: '14px' },
    button: {
      background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.15))',
      color: 'inherit',
      border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
      borderRadius: '8px',
      padding: '4px 12px',
      fontSize: '12px',
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    select: {
      background: 'transparent',
      color: 'inherit',
      border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35))',
      borderRadius: '8px',
      padding: '4px 8px',
      fontSize: '12px',
      maxWidth: '170px',
      fontFamily: 'inherit',
    },
    note: { fontSize: '12px', lineHeight: '18px', opacity: 0.6 },
    warn: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-warn-label, #ffb020)' },
  }

  /** 设置页内容。owner props 只有 `close`；数据全部来自本插件自己的 store。 */
  function NoticeSection() {
    const snapshot = useSnapshot()
    const settings = snapshot.settings
    const fileRef = react.useRef(null)
    const save = (patch) => store.saveSettings(patch)

    const rows = KINDS.map((kind) => {
      const meta = KIND_META[kind]
      const options = SOUND_NAMES.map((sound) => h('option', { key: sound, value: sound }, sound)).concat(
        settings.uploads.map((upload) =>
          h('option', { key: upload.id, value: upload.id }, `自定义：${upload.name}`),
        ),
      )
      return h(
        'div',
        { key: kind, style: S.row },
        h(
          'label',
          { style: S.label },
          h('input', {
            type: 'checkbox',
            checked: settings.kinds[kind] === true,
            onChange: (event) => save({ kinds: { ...settings.kinds, [kind]: event.target.checked } }),
          }),
          h('span', null, `${meta.icon} ${meta.label}`),
        ),
        h(
          'select',
          {
            style: S.select,
            value: settings.sounds[kind],
            onChange: (event) => save({ sounds: { ...settings.sounds, [kind]: event.target.value } }),
          },
          options,
        ),
        h(
          'button',
          { style: S.button, type: 'button', onClick: () => player.preview(settings.sounds[kind]) },
          '试听',
        ),
      )
    })

    const onFile = (event) => {
      const picked = event.target.files?.[0]
      event.target.value = ''
      if (picked === undefined) return
      if (picked.size > 4_000_000) {
        window.alert('音频文件过大（>4MB），请选短一点的。')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') return
        const id = `up-${Date.now()}`
        save({
          uploads: [...settings.uploads, { id, name: picked.name, dataUrl: reader.result }].slice(-12),
          sounds: { ...settings.sounds, approval: id },
        })
      }
      reader.readAsDataURL(picked)
    }

    return h(
      'div',
      { style: S.wrap },
      h('h3', { style: S.title }, '通知'),
      h(
        'p',
        { style: S.desc },
        'agent 需要审批、向你提问、本轮跑完、或出错时，右下角弹出可点击的浮窗并播放提示音；点浮窗切到对应会话。',
      ),

      h(
        'div',
        { style: S.row },
        h(
          'label',
          { style: S.label },
          h('input', {
            type: 'checkbox',
            checked: settings.enabled === true,
            onChange: (event) => save({ enabled: event.target.checked }),
          }),
          h('span', null, '总开关'),
        ),
        h('input', {
          type: 'range',
          min: '0',
          max: '1',
          step: '0.05',
          value: String(settings.volume),
          title: '音量',
          style: { width: '130px' },
          onChange: (event) => save({ volume: Number(event.target.value) }),
        }),
        h('span', { style: S.note }, `音量 ${Math.round(settings.volume * 100)}%`),
      ),

      h('div', { style: S.group }, h('div', { style: S.note }, '四类事件分别开关与选声'), ...rows),

      h(
        'div',
        { style: S.group },
        h(
          'div',
          { style: S.row },
          h(
            'button',
            { style: S.button, type: 'button', onClick: () => fileRef.current?.click() },
            '上传自定义音频',
          ),
          h('input', {
            ref: fileRef,
            type: 'file',
            accept: 'audio/*',
            style: { display: 'none' },
            onChange: onFile,
          }),
          h('span', { style: S.note }, `已上传 ${settings.uploads.length} 个（上限 12，单个 4MB 以内）`),
        ),
        h('div', { style: S.note }, '上传后自动指派给"需要审批"，可在上面的下拉框里改给别的事件。'),
      ),

      snapshot.audioBlocked
        ? h(
            'div',
            { style: S.group },
            h(
              'button',
              {
                style: S.button,
                type: 'button',
                onClick: () => {
                  player.preview()
                  store.clearAudioBlocked()
                },
              },
              '点此启用音效',
            ),
            h('span', { style: S.warn }, ' 浏览器需要一次点击才允许出声。'),
          )
        : null,

      h(
        'div',
        { style: S.group },
        h(
          'div',
          { style: S.note },
          '声音由浏览器合成，六个音色对应 Windows 系统声音的名字；音量受上面滑杆控制。',
        ),
        h('div', { style: S.note }, '设置存在本机浏览器（localStorage），重启后仍在；换浏览器不同步。'),
      ),
    )
  }

  /* ---- 注册槽位：设置 → 通知 ---- */

  const slots = ctx.get('slots')
  if (slots === undefined) {
    status.error = 'slots 服务不可用，设置页无法注册'
    console.error('[dsh-noticefiler]', status.error)
  } else {
    disposers.push(
      slots.inject('settings.section', () =>
        slots.register({ name: 'settings.section', id: SECTION_ID, order: 60, label: '通知' }, NoticeSection),
      ),
    )
    mark('设置页已注册')
  }

  /* ---- 事件侦测 ---- */

  // 待处理卡片：DOM 出现即提醒，按 key 去重（同一张卡只响一次）
  const seenCards = new Set()
  const CARD_SELECTOR = '[data-approval-key],[data-question-key],[data-plan-review-key]'
  const announce = (element) => {
    const key =
      element.getAttribute('data-approval-key') ??
      element.getAttribute('data-question-key') ??
      element.getAttribute('data-plan-review-key')
    if (key === null || seenCards.has(key)) return
    seenCards.add(key)
    const isApproval =
      element.hasAttribute('data-approval-key') || element.hasAttribute('data-plan-review-key')
    notify(
      isApproval ? 'approval' : 'question',
      (element.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
    )
  }
  const scan = (node) => {
    if (node === null || node === undefined) return
    if (node instanceof Element && node.matches(CARD_SELECTOR)) announce(node)
    if (node instanceof Element || node instanceof Document) {
      for (const element of node.querySelectorAll(CARD_SELECTOR)) announce(element)
    }
  }

  // 主会话 running true → false ⇒ 本轮跑完（子 agent 不打扰）
  const runningById = new Map()
  let sawRunning = false
  const readSessions = () => {
    const snapshot = ctx.get('sessions')?.list?.getSnapshot?.()
    const byId = snapshot?.byId
    if (byId === undefined || byId === null) return
    for (const [id, entry] of Object.entries(byId)) {
      if (entry?.parentSessionId !== undefined && entry?.parentSessionId !== null) continue
      const running = entry?.running === true
      const previous = runningById.get(id)
      runningById.set(id, running)
      if (running) sawRunning = true
      if (previous === true && running === false && sawRunning) notify('turn', entry?.title ?? '', id)
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) scan(node)
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  disposers.push(() => observer.disconnect())
  scan(document)
  mark('DOM 侦测已启动')

  const offSessions = ctx.get('sessions')?.list?.subscribe?.(readSessions)
  if (typeof offSessions === 'function') disposers.push(offSessions)
  readSessions()

  try {
    ctx.remote?.$on?.('api-session/status', () => readSessions())
    ctx.remote?.$on?.('api-session/error', (sessionId, message) => {
      notify('error', String(message ?? ''), String(sessionId ?? ''))
    })
  } catch (error) {
    console.error('[dsh-noticefiler] 订阅远端事件失败', error)
  }

  // 首次用户手势预热音频，规避浏览器自动播放限制
  const prime = () => player.prime()
  window.addEventListener('pointerdown', prime, { capture: true, passive: true })
  window.addEventListener('keydown', prime, { capture: true, passive: true })

  ctx.effect(
    () => () => {
      window.removeEventListener('pointerdown', prime, { capture: true })
      window.removeEventListener('keydown', prime, { capture: true })
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          /* 忽略 */
        }
      }
      toastRoot?.unmount()
      toastRoot?.container.remove()
      document.getElementById(TOAST_CSS_ID)?.remove()
    },
    'dsh-noticefiler: teardown',
  )

  console.log('[dsh-noticefiler] 已就绪：设置 → 通知；浮窗覆盖 审批 / 提问 / 跑完 / 报错')
  mark('初始化完成')
  status.source = 'client.js v-settings-page'
  // 控制台调试入口：__dshNoticefiler.test() 立刻弹一张卡，便于确认浮窗链路
  window.__dshNoticefiler = {
    status,
    store,
    player,
    test: () => notify('turn', '这是一条测试通知', ''),
    snapshot: () => store.getSnapshot(),
  }
}

function inject() {
  return ['slots']
}

window.__ModuleLoader__.load({
  id: LOADER_ID,
  factory: (require) => {
    moduleRequire = require
    return { apply, inject }
  },
})
