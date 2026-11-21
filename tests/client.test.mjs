// 浏览器半侧冒烟测试：零依赖，node:test + node:assert + node:vm。
// 在 vm 沙箱里执行 lib/client.js（它顶层只依赖 window.__ModuleLoader__、document、fetch），
// 覆盖：模块加载器契约 / apply 注册两槽 / 侧栏图标 / api 错误与超时 / 卡片数据守卫。
// 限制：不运行真实 React 渲染（未实现调停器），组件内的交互行为用源码契约断言兜底。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const SOURCE_URL = new URL('../lib/client.js', import.meta.url)
const SOURCE = fs.readFileSync(SOURCE_URL, 'utf8')
const API = '/dsh-review-desk/api'
const INCOMPLETE = '这张卡片数据不完整，可删除后重新生成'

function createDocument() {
  const styles = []
  const document = {
    head: {
      appendChild(el) {
        styles.push(el)
      }
    },
    _styles: styles,
    querySelector(selector) {
      if (selector !== 'style[data-plugin-css="dsh-review-desk/ui"]') return null
      return (
        styles.find((el) => el && el.dataset && el.dataset.pluginCss === 'dsh-review-desk/ui') || null
      )
    },
    createElement(tag) {
      return {
        tagName: tag,
        dataset: {},
        style: {},
        textContent: '',
        setAttribute(name, value) {
          this[name] = value
        },
        appendChild() {}
      }
    }
  }
  return document
}

/** 最小 React 假实现：工厂只在组件渲染时才调用 hooks，测试不渲染真实 DOM，只需调用不报错。 */
function createReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useRef(initial) {
      return { current: initial }
    },
    useCallback(fn) {
      return fn
    },
    useEffect() {},
    useMemo(fn) {
      return fn()
    }
  }
}

function loadClient(options = {}) {
  const document = createDocument()
  const required = []
  let captured = null
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(def) {
          captured = def
        }
      }
    },
    document,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    fetch:
      options.fetch ||
      (async () => {
        throw new Error('fetch 未打桩')
      })
  }
  if (options.testFlag !== false) sandbox.__DSH_TEST__ = true
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox, { filename: 'lib/client.js' })

  assert.ok(captured, 'window.__ModuleLoader__.load 应被调用')
  assert.equal(captured.id, 'dsh-review-desk')
  assert.equal(typeof captured.factory, 'function')

  const mod = captured.factory((id) => {
    required.push(id)
    if (id === 'react') return createReact()
    throw new Error('未预期的 require: ' + id)
  })
  return { captured, mod, document, required }
}

/** 假 ctx：slots.inject 记录插槽名并立即执行回调；slots.register 记录注册项并返回 disposer。 */
function createFakeCtx() {
  const injected = []
  const registered = []
  const disposers = []
  // Cordis 的 inject 支持普通函数与 generator 两种 effect：generator 要跑到 done 才执行完注册。
  const runEffect = (fn) => {
    const ret = fn()
    if (ret && typeof ret.next === 'function') {
      let step = ret.next()
      while (!step.done) step = ret.next(step.value)
      return step.value
    }
    return ret
  }
  const ctx = {
    slots: {
      inject(name, fn) {
        injected.push(name)
        return runEffect(fn)
      },
      register(config, component) {
        registered.push({ config, component })
        const disposer = () => {}
        disposers.push(disposer)
        return disposer
      }
    }
  }
  return { ctx, injected, registered, disposers }
}

/** vm 沙箱里创建的数组/对象与宿主 realm 原型不同，深比较前转成宿主普通对象。 */
function host(value) {
  return JSON.parse(JSON.stringify(value))
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  }
}

function abortableFetch() {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const signal = init && init.signal
      if (!signal) return // 永不 settle，交给用例自身超时
      const onAbort = () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      }
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort)
    })
}

const VALID_CARD = {
  topic: '牛顿环',
  title: '牛顿环（等厚干涉）',
  model: 'deepseek-flash',
  concept: '等厚干涉条纹',
  definition: '曲率半径与条纹半径的关系',
  confusions: [{ name: '牛顿环 vs 劈尖', difference: '一个等厚圆形，一个楔形', example: '测曲率半径' }],
  questions: [
    {
      type: 'single',
      stem: '牛顿环属于哪种干涉？',
      options: ['等厚干涉', '等倾干涉', '双缝干涉'],
      answer: 0,
      explanation: '空气层厚度相同处形成同一级条纹'
    },
    {
      type: 'judge',
      stem: '牛顿环中心是暗斑。',
      options: ['正确', '错误'],
      answer: true,
      explanation: '中心空气层厚度趋近 0，半波损失导致暗纹'
    }
  ],
  sources: [
    { title: '牛顿环实验', url: 'https://example.com/newton' },
    { title: '', url: 'https://example.com/ignored' }
  ],
  grounded: true
}

test('模块加载器：id、react 依赖与生产导出形状', () => {
  const { captured, mod, required } = loadClient({ testFlag: false })
  assert.equal(captured.id, 'dsh-review-desk')
  assert.deepEqual(required, ['react'])
  assert.deepEqual(Object.keys(mod).sort(), ['apply', 'inject', 'name'])
  assert.equal(mod.name, 'review-desk-client')
  assert.deepEqual(host(mod.inject), ['slots'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(mod.__test, undefined, '生产环境不得挂 __test')
})

test('apply：先 inject(main/sidebar.panellist) 再注册两个槽，并返回 disposer', () => {
  const { mod, document } = loadClient()
  const { ctx, injected, registered, disposers } = createFakeCtx()

  assert.doesNotThrow(() => mod.apply(ctx))
  assert.deepEqual(injected, ['main', 'sidebar.panellist'])
  assert.equal(registered.length, 2)
  assert.equal(registered[0].config.name, 'main')
  assert.equal(registered[0].config.key, 'review-desk')
  assert.equal(registered[0].config.name, injected[0])
  assert.equal(registered[1].config.name, 'sidebar.panellist')
  assert.equal(registered[1].config.name, injected[1])
  assert.equal(registered[1].config.id, 'review-desk')
  assert.equal(registered[1].config.order, 2)
  assert.equal(registered[1].config.label(), '复习台')
  assert.equal(typeof registered[0].component, 'function')
  assert.equal(typeof registered[1].component, 'function')
  assert.equal(disposers.length, 2)
  assert.ok(disposers.every((d) => typeof d === 'function'))

  // ensureStyle：样式挂到 head，带 data-plugin 标记，重复 apply 不重复插入
  assert.equal(document._styles.length, 1)
  const style = document._styles[0]
  assert.equal(style.dataset.plugin, 'dsh-review-desk')
  assert.equal(style.dataset.pluginCss, 'dsh-review-desk/ui')
  assert.match(style.textContent, /\.rd-panel/)
  mod.apply(ctx)
  assert.equal(document._styles.length, 1, 'ensureStyle 必须按 data-plugin-css 去重')
})

test('侧栏 Row：只画 GlyphIcon(ownerProps.size)，不含文本（D1）', () => {
  const { mod } = loadClient()
  const { ctx, registered } = createFakeCtx()
  mod.apply(ctx)

  const main = registered.find((r) => r.config.name === 'main')
  const sidebar = registered.find((r) => r.config.name === 'sidebar.panellist')
  const mainEl = main.component()
  assert.equal(typeof mainEl.type, 'function')

  const rowEl = sidebar.component()
  assert.equal(typeof rowEl.type, 'function', 'register 的组件应返回 h(Row, null)')
  assert.notEqual(rowEl.type, mainEl.type, '侧栏与主面板必须是不同组件')

  const icon = rowEl.type({ size: 20 })
  assert.equal(icon.type, 'svg')
  assert.equal(icon.props.width, 20)
  assert.equal(icon.props.height, 20)
  assert.equal(icon.props['aria-hidden'], 'true')
  assert.equal(icon.props.fill, 'none')
  assert.equal(
    icon.children.filter((c) => typeof c === 'string' || typeof c === 'number').length,
    0,
    '图标位里不得出现文本节点'
  )
  assert.ok(icon.children.every((c) => c && c.type === 'path'), '只允许 path 子节点')

  const fallback = rowEl.type(undefined)
  assert.equal(fallback.props.width, 16, 'ownerProps 缺失时回退 16px')
  assert.equal(fallback.props.height, 16)
})

test('api：成功请求的 URL/cache/headers，timeoutMs 与外部 signal 不透传', async () => {
  const calls = []
  const { mod } = loadClient({
    fetch: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ ok: true, cards: [], total: 0 })
    }
  })
  const r = await mod.__test.api('/library')
  assert.deepEqual(host(r), { ok: true, cards: [], total: 0 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, API + '/library')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
  assert.equal(calls[0].init.timeoutMs, undefined)
  assert.equal(calls[0].init.method, undefined)
  assert.ok(calls[0].init.signal instanceof AbortSignal, '内部超时 signal 应生效')
})

test('api：POST body 透传，业务错误 {ok:false,error} 转可读文案', async () => {
  const calls = []
  const { mod } = loadClient({
    fetch: async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ ok: false, error: '缺少知识点' }, 400)
    }
  })
  await assert.rejects(
    mod.__test.api('/generate', { method: 'POST', body: JSON.stringify({ topic: '' }) }),
    (e) => e.message === '缺少知识点'
  )
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.body, '{"topic":""}')
})

test('api：非 JSON 错误体回退为 HTTP 状态文案', async () => {
  const { mod } = loadClient({
    fetch: async () => ({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('not json')
      }
    })
  })
  await assert.rejects(mod.__test.api('/card?topic=x'), /HTTP 404/)
})

test('api：403/413/415/504 无 error 文案时回退为可读中文状态文案', async () => {
  const cases = [
    [403, /没有权限执行该操作（403）/],
    [413, /请求内容过大（413）/],
    [415, /请求格式不支持（415）/],
    [504, /服务响应超时（504）/]
  ]
  for (const [status, pattern] of cases) {
    const { mod } = loadClient({
      fetch: async () => ({ ok: false, status, json: async () => ({ ok: false }) })
    })
    await assert.rejects(mod.__test.api('/health'), pattern)
  }
})

test('api：超过 timeoutMs 转成「请求超时」（D3）', async () => {
  const { mod } = loadClient({ fetch: abortableFetch() })
  await assert.rejects(
    mod.__test.api('/generate', { method: 'POST', body: '{}', timeoutMs: 25 }),
    /请求超时，请稍后重试/
  )
})

test('api：外部 AbortController 取消抛 AbortError，供界面静默处理（D3）', async () => {
  const { mod } = loadClient({ fetch: abortableFetch() })
  const ctl = new AbortController()
  const pending = mod.__test.api('/card?topic=x', { signal: ctl.signal, timeoutMs: 5000 })
  setTimeout(() => ctl.abort(), 10)
  await assert.rejects(pending, (e) => e.name === 'AbortError' && e.message === '请求已取消')
})

test('normalizeCard：合法卡片被规范化（含 sanitize）', () => {
  const { mod } = loadClient()
  const res = mod.__test.normalizeCard(VALID_CARD)
  assert.equal(res.ok, true)
  assert.equal(res.card.topic, '牛顿环')
  assert.equal(res.card.title, '牛顿环（等厚干涉）')
  assert.equal(res.card.questions.length, 2)
  assert.equal(res.card.questions[0].type, 'single')
  assert.equal(res.card.questions[0].answer, 0)
  assert.equal(res.card.questions[1].type, 'judge')
  assert.equal(res.card.questions[1].answer, true)
  assert.deepEqual(host(res.card.questions[1].options), ['正确', '错误'])
  assert.equal(res.card.confusions.length, 1)
  assert.equal(res.card.confusions[0].name, '牛顿环 vs 劈尖')
  assert.equal(res.card.sources.length, 1, '无标题的来源应被丢弃')
  assert.equal(res.card.sources[0].url, 'https://example.com/newton')
  assert.equal(res.card.grounded, true)
})

test('normalizeCard：缺卡片/缺题/空题/坏题/无 topic 均返回数据不完整文案（D5）', () => {
  const { mod } = loadClient()
  const badCards = [
    null,
    undefined,
    {},
    { topic: 'x' },
    { topic: 'x', questions: [] },
    { topic: 'x', questions: [{ stem: '题干' }] },
    { topic: 'x', questions: [{ stem: '题干', options: ['A'] }] },
    { topic: 'x', questions: [{ stem: '', options: ['A', 'B'] }] },
    { topic: 'x', questions: [{ stem: '题干', options: ['A', 1] }] },
    { topic: '', questions: VALID_CARD.questions }
  ]
  for (const bad of badCards) {
    const r = mod.__test.normalizeCard(bad)
    assert.equal(r.ok, false)
    assert.equal(r.reason, INCOMPLETE)
    assert.equal(r.card, null)
  }
})

test('normalizeCard：judge 缺 options 时补默认选项，布尔答案保留（D5）', () => {
  const { mod } = loadClient()
  const res = mod.__test.normalizeCard({
    topic: '二分查找',
    questions: [{ type: 'judge', stem: '二分查找要求有序。', answer: false }]
  })
  assert.equal(res.ok, true)
  assert.deepEqual(host(res.card.questions[0].options), ['正确', '错误'])
  assert.equal(res.card.questions[0].answer, false)
  assert.equal(res.card.questions[0].type, 'judge')
})

test('safeHref：只放行 http(s)，拦截 javascript:/data:（来源链接安全）', () => {
  const { mod } = loadClient()
  assert.equal(mod.__test.safeHref('https://example.com/a'), 'https://example.com/a')
  assert.equal(mod.__test.safeHref('http://example.com/a'), 'http://example.com/a')
  assert.equal(mod.__test.safeHref('javascript:alert(1)'), '')
  assert.equal(mod.__test.safeHref('data:text/html,<b>x</b>'), '')
  assert.equal(mod.__test.safeHref(''), '')
  assert.equal(mod.__test.safeHref(null), '')
})

test('源码契约：D2/D4/D6 及无障碍/来源链接的加固标记仍在', () => {
  // 未做真实 React 渲染，这里按源码契约守住不可在冒烟层触发、但已实现的行为。
  assert.match(SOURCE, /Promise\.allSettled/, 'D6：并发请求不得用 Promise.all 连坐')
  assert.match(SOURCE, /role: 'alert'/, '错误条必须可被读屏播报')
  assert.match(SOURCE, /'aria-live': 'polite'/, 'loading 区域应有 aria-live')
  assert.match(SOURCE, /rel: 'noopener noreferrer'/, '来源链接必须 noopener noreferrer')
  assert.match(SOURCE, /target: '_blank'/, '来源链接新窗口打开')
  assert.match(SOURCE, /'aria-pressed': chosenIndex === oi/, '选项按钮应有 aria-pressed')
  assert.match(SOURCE, /type: 'button'/, '可点元素必须是 button[type=button]')
  assert.match(SOURCE, /setSubmitted\(true\)[\s\S]{0,200}setScore\(r\)|setScore\(r\)[\s\S]{0,200}setSubmitted\(true\)/, 'D4：交卷态在 /attempt 成功后才置位')
  assert.doesNotMatch(SOURCE, /const \[submitted, setSubmitted\] = useState\(false\)[\s\S]{0,80}setSubmitted\(true\)\s*$/, 'D4：不得提交前先置 submitted')
  assert.match(SOURCE, /确认删除？/, '删除需二次确认')
  assert.match(SOURCE, /这张卡片数据不完整，可删除后重新生成/, 'D5：异常卡片提示文案')
  assert.match(SOURCE, /本次未检索到网页资料/, '无来源时的文案')
  assert.match(SOURCE, /提交中…/, '提交中禁止重复点击')
  assert.match(SOURCE, /reqRef/, 'D3：请求控制器挂在 ref 上以便取消')
  assert.equal(SOURCE.includes('scoreText'), false, 'D7：死代码 scoreText 应删除')
})

// ---------- LaTeX → MathML（零依赖、原生 MathML Core） ----------

test('texToMathML：行内上下标/加法生成 msup 与 mn', () => {
  const { mod } = loadClient()
  const out = mod.__test.texToMathML('a^2+b^2', false)
  assert.match(out, /^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML" display="inline">/)
  assert.match(out, /<msup><mi>a<\/mi><mn>2<\/mn><\/msup>/)
  assert.match(out, /<mo>\+<\/mo>/)
  assert.match(out, /<\/math>$/)
  assert.match(mod.__test.texToMathML('x', true), /display="block"/)
})

test('texToMathML：分式、带上下限积分、求和、极限、根式', () => {
  const { mod } = loadClient()
  const frac = mod.__test.texToMathML('\\frac{\\sin x}{x}', false)
  assert.match(frac, /<mfrac>/)
  assert.match(frac, /<mi mathvariant="normal">sin<\/mi>/, '函数名应为正体')

  const integral = mod.__test.texToMathML('\\int_{a}^{b} f(x)\\,\\mathrm{d}x', false)
  assert.match(integral, /<msubsup><mo largeop="true">∫<\/mo><mi>a<\/mi><mi>b<\/mi><\/msubsup>/)
  assert.match(integral, /<mspace width="0.167em"\/>/, '\\, 应生成细空格')
  assert.match(integral, /<mstyle mathvariant="normal"><mi>d<\/mi><\/mstyle>/, '\\mathrm{d} 应为正体 d')

  const sum = mod.__test.texToMathML('\\sum_{k=1}^{n} k', false)
  assert.match(sum, /<munderover><mo largeop="true" movablelimits="true">∑<\/mo>/)

  const lim = mod.__test.texToMathML('\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1', false)
  assert.match(lim, /<munder><mi mathvariant="normal">lim<\/mi>/)
  assert.match(lim, /<mo>→<\/mo>/)

  const root = mod.__test.texToMathML('\\sqrt[n]{x}', false)
  assert.match(root, /<mroot><mi>x<\/mi><mi>n<\/mi><\/mroot>/)
})

test('texToMathML：希腊字母、复指数、算符、矩阵与分段函数', () => {
  const { mod } = loadClient()
  const greek = mod.__test.texToMathML('\\alpha\\beta\\Gamma', false)
  assert.match(greek, /<mi>α<\/mi><mi>β<\/mi><mi>Γ<\/mi>/)

  const exp = mod.__test.texToMathML('e^{i\\omega t}', false)
  assert.match(exp, /<msup><mi>e<\/mi><mrow><mi>i<\/mi><mi>ω<\/mi><mi>t<\/mi><\/mrow><\/msup>/)

  const hat = mod.__test.texToMathML('\\hat{H}\\psi = E\\psi', false)
  assert.match(hat, /<mover accent="true"><mi>H<\/mi><mo>ˆ<\/mo><\/mover>/)

  const nabla = mod.__test.texToMathML('\\nabla^2 \\varphi = 0', false)
  assert.match(nabla, /<msup><mo>∇<\/mo><mn>2<\/mn><\/msup>/)

  const matrix = mod.__test.texToMathML('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', false)
  assert.match(matrix, /<mtable>/)
  assert.equal((matrix.match(/<mtr>/g) || []).length, 2, '矩阵应保留两行')
  assert.equal((matrix.match(/<mtd>/g) || []).length, 4, '矩阵应有四格')

  const cases = mod.__test.texToMathML('\\begin{cases} 1 & x>0 \\\\ 0 & x\\le 0 \\end{cases}', false)
  assert.match(cases, /<mo fence="true" stretchy="true">\{<\/mo>/)
  assert.match(cases, /<mo>≤<\/mo>/)
})

test('texToMathML：非法/空输入不抛异常且降级为空串或普通 mtext', () => {
  const { mod } = loadClient()
  assert.equal(mod.__test.texToMathML('', true), '')
  assert.equal(mod.__test.texToMathML(null, false), '')
  assert.doesNotThrow(() => mod.__test.texToMathML('\\frac{a}{', false))
  const unknown = mod.__test.texToMathML('\\unknowncmd', false)
  assert.match(unknown, /<mtext>\\unknowncmd<\/mtext>/, '未知命令降级为文本而不是抛错')
})

test('splitMathText：识别 $…$、$$…$$、\\(…\\)、\\[…\\] 并保留普通文本', () => {
  const { mod } = loadClient()
  const parts = host(mod.__test.splitMathText('定义：$$\\int_{a}^{b} f(x)\\,\\mathrm{d}x$$ 其中 $\\alpha>0$ 且 $\\beta$ 是常数'))
  assert.deepEqual(parts.map((p) => p.type), ['text', 'block', 'text', 'inline', 'text', 'inline', 'text'])
  assert.equal(parts[1].value, '\\int_{a}^{b} f(x)\\,\\mathrm{d}x')
  assert.equal(parts[3].value, '\\alpha>0')

  const paren = host(mod.__test.splitMathText('a \\(x^2\\) b \\[y^2\\] c'))
  assert.deepEqual(paren.map((p) => p.type), ['text', 'inline', 'text', 'block', 'text'])

  assert.deepEqual(host(mod.__test.splitMathText('没有公式')), [{ type: 'text', value: '没有公式' }])
  assert.deepEqual(host(mod.__test.splitMathText('')), [], '空文本不产生片段')
})

test('richText：无公式返回纯字符串，有公式返回 MathML 节点', () => {
  const { mod } = loadClient()
  assert.equal(mod.__test.richText('纯文本', 'k'), '纯文本')
  assert.deepEqual(host(mod.__test.richText('', 'k')), [], '空文本不产生节点')

  const nodes = mod.__test.richText('设 $x=1$ 成立', 'k')
  assert.ok(Array.isArray(nodes), '含公式时应返回子节点数组')
  assert.equal(nodes.length, 3, '文本/公式/文本 三段')
  assert.equal(nodes[0], '设 ')
  assert.equal(nodes[2], ' 成立')
  assert.match(nodes[1].props.className, /rd-math-inline/)
  assert.match(nodes[1].props.dangerouslySetInnerHTML.__html, /<mi>x<\/mi><mo>=<\/mo><mn>1<\/mn>/)

  const block = mod.__test.richText('$$\\int_0^1 x\\,\\mathrm{d}x$$', 'k')
  assert.ok(Array.isArray(block))
  assert.match(block[0].props.className, /rd-math-block/)
})

test('源码契约：公式渲染接入题干/选项/解析/概念/定义/易混淆与样式居中', () => {
  assert.match(SOURCE, /\.rd-math-block\{[\s\S]{0,160}justify-content:center/, '独立公式必须居中成行')
  assert.match(SOURCE, /prefers-color-scheme: dark[\s\S]{0,4000}\.rd-math-block/, '暗色主题需适配公式块')
  assert.match(SOURCE, /richText\(q\.stem/, '题干需渲染公式')
  assert.match(SOURCE, /richText\(opt/, '选项需渲染公式')
  assert.match(SOURCE, /richText\([\s\S]{0,400}explanation/, '解析需渲染公式')
  assert.match(SOURCE, /richText\(card\.concept/, '核心概念需渲染公式')
  assert.match(SOURCE, /richText\(card\.definition/, '定义需渲染公式')
  assert.match(SOURCE, /richText\(c\.name/, '易混淆名称需渲染公式')
  assert.match(SOURCE, /richText\(c\.difference/, '易混淆差异需渲染公式')
  assert.match(SOURCE, /richText\('例：' \+ c\.example/, '易混淆示例需渲染公式')
})

