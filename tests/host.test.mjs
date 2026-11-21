// 宿主半侧（lib/index.js）契约测试。
// 零依赖：node:test + node:assert + node:http；所有数据只写 os.tmpdir() 下的临时 DSH_HOME。
// 运行：node --test tests/host.test.mjs

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TMP_HOME = await mkdtemp(join(tmpdir(), 'dsh-review-desk-test-'))
const DATA_DIR = join(TMP_HOME, 'data', 'review-desk')
const LIB_FILE = join(DATA_DIR, 'library.json')
const STATS_FILE = join(DATA_DIR, 'stats.json')

// 进程内把 DSH_HOME 指向临时目录：绝不允许写真实用户数据目录。
process.env.DSH_HOME = TMP_HOME
// 测试不联网：跳过 sogou/360 检索，保证快且可重复。
process.env.DSH_REVIEW_DESK_SEARCH = '0'
delete process.env.DSH_REVIEW_DESK_TIMEOUT_MS

const BASE = '/dsh-review-desk/api'
const plugin = await import(new URL('../lib/index.js', import.meta.url))

const CARD_PAYLOAD = {
  title: '牛顿环',
  concept: '牛顿环是平凸透镜与平板玻璃间空气薄膜产生的等厚干涉条纹，用于检测光学表面平整度。',
  definition:
    '当平凸透镜凸面与平面玻璃接触时，两者之间的空气层厚度由中心向外递增，单色光垂直入射后上下表面反射光发生干涉，形成以接触点为中心的同心圆环。',
  confusions: [
    { name: '等倾干涉', difference: '等倾干涉由厚度均匀的薄膜在不同入射角下形成，条纹为同心圆但级次向内递增。', example: '迈克尔逊干涉仪的圆环属于等倾干涉，牛顿环属于等厚干涉。' }
  ],
  questions: [
    { type: 'single', stem: '牛顿环属于哪种干涉？', options: ['等厚干涉', '等倾干涉', '衍射', '偏振'], answer: 0, explanation: '空气膜厚度变化形成等厚干涉条纹。' },
    { type: 'single', stem: '牛顿环中心处的干涉情况是？', options: ['暗纹', '亮纹', '半亮半暗', '无法确定'], answer: 0, explanation: '接触点处空气层厚度为零，反射光存在半波损失，故中心为暗纹。' },
    { type: 'judge', stem: '牛顿环条纹间距由中心向外逐渐变密。', options: ['正确', '错误'], answer: true, explanation: '厚度随半径平方增长，条纹半径与根号级次成正比，故外密内疏。' }
  ]
}

const logLines = { warn: [], error: [], info: [] }
let llmMode = 'fast'
let llmCalls = 0
let payloadOverride = {}
let handler = null

const fakeCtx = {
  webServer: {
    port: 0,
    register(route) {
      handler = route.handler
      return () => {}
    }
  },
  llm: {
    async *stream(options) {
      llmCalls += 1
      const signal = options && options.signal
      if (signal && signal.aborted) {
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      }
      if (llmMode === 'hang') {
        await new Promise(() => {}) // 永不 settle：用于超时/断连测试
      }
      if (llmMode === 'error') throw new Error('fake llm failure')
      // 让假模型回显请求的知识点作为 title，避免不同 topic 的卡片标题互相串味。
      const userText = options?.messages?.[0]?.content?.[0]?.text || ''
      const matched = /知识点：(.+)/.exec(userText)
      const topic = matched ? matched[1].trim() : '未知知识点'
      yield { type: 'text', text: JSON.stringify({ ...CARD_PAYLOAD, ...payloadOverride, title: topic }) }
    }
  },
  logger: {
    warn: (m) => logLines.warn.push(String(m)),
    error: (m) => logLines.error.push(String(m)),
    info: (m) => logLines.info.push(String(m))
  },
  effect(fn) {
    return fn()
  },
  get(key) {
    if (key === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'fake-model' }) }
    return null
  }
}

const dispose = plugin.apply(fakeCtx)

let server = null
let port = 0

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function api(path, opts = {}) {
  const { method = 'GET', headers = {}, body, rawBody, timeoutMs = 10000 } = opts
  const payload = rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined
  const h = { ...headers }
  if (payload !== undefined) {
    if (h['content-type'] === undefined) h['content-type'] = 'application/json'
    h['content-length'] = Buffer.byteLength(payload)
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: BASE + path, method, headers: h, agent: false },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let json = null
          try {
            json = JSON.parse(raw)
          } catch {
            json = null
          }
          resolve({ status: res.statusCode, headers: res.headers, raw, json })
        })
      }
    )
    req.setTimeout(timeoutMs, () => req.destroy(new Error('client timeout')))
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

function corruptFiles(prefix) {
  return readdir(DATA_DIR).then(
    (files) => files.filter((f) => f.startsWith(prefix + '.corrupt-')).length,
    () => 0
  )
}

before(async () => {
  assert.equal(typeof handler, 'function', 'apply() 必须通过 webServer.register 注册 handler')
  server = http.createServer((req, res) => handler(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
  assert.ok(port > 0)
})

after(async () => {
  if (typeof dispose === 'function') dispose()
  if (server) {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  }
  await rm(TMP_HOME, { recursive: true, force: true })
})

/* ------------------------------------------------------------ /health */

test('GET /health：形状正确，dataDir 是 ~ 相对路径且不泄露绝对路径', async () => {
  const r = await api('/health')
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.equal(typeof r.json.version, 'string')
  assert.ok(r.json.version.length > 0)
  assert.equal(r.json.model, 'fake/fake-model')
  assert.equal(typeof r.json.dataDir, 'string')
  assert.ok(r.json.dataDir.startsWith('~'), 'dataDir 必须以 ~ 开头，实际：' + r.json.dataDir)
  assert.ok(!r.json.dataDir.includes(TMP_HOME), 'dataDir 不得包含绝对路径')
  assert.ok(!/[A-Za-z]:[\\/]/.test(r.json.dataDir), 'dataDir 不得包含盘符')
  assert.equal(typeof r.json.cards, 'number')
  assert.equal(r.json.cards, 0)
})

test('尾部斜杠会被归一化（/health/ 等价 /health）', async () => {
  const r = await api('/health/')
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
})

/* --------------------------------------------------------------- 守卫 */

test('Origin 跨站 → 403 cross-site request rejected', async () => {
  const r = await api('/health', { headers: { origin: 'http://evil.example' } })
  assert.equal(r.status, 403)
  assert.equal(r.json.ok, false)
  assert.equal(r.json.error, 'cross-site request rejected')
})

test('Origin=null / 非法 Origin / host 不匹配 → 403', async () => {
  for (const origin of ['null', 'not a url', 'file://', 'http://127.0.0.1:1']) {
    const r = await api('/health', { headers: { origin } })
    assert.equal(r.status, 403, 'origin=' + origin)
    assert.equal(r.json.error, 'cross-site request rejected')
  }
})

test('同源 Origin + same-origin 放行', async () => {
  const r = await api('/health', {
    headers: { origin: 'http://127.0.0.1:' + port, 'sec-fetch-site': 'same-origin' }
  })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
})

test('sec-fetch-site: cross-site → 403', async () => {
  const r = await api('/health', { headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(r.status, 403)
  assert.equal(r.json.error, 'cross-site request rejected')
})

test('POST 非 application/json → 415', async () => {
  const r = await api('/delete', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    rawBody: 'topic=x'
  })
  assert.equal(r.status, 415)
  assert.equal(r.json.ok, false)
  assert.equal(r.json.error, 'content-type must be application/json')
})

test('application/json; charset=utf-8 视为合法 JSON content-type', async () => {
  const r = await api('/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    rawBody: JSON.stringify({ topic: '不存在的知识点' })
  })
  assert.equal(r.status, 200)
  assert.equal(r.json.removed, 0)
})

test('请求体 > 256KB → 413 请求体过大', async () => {
  const big = 'x'.repeat(300 * 1024)
  const r = await api('/generate', { method: 'POST', rawBody: big, timeoutMs: 20000 })
  assert.equal(r.status, 413)
  assert.equal(r.json.ok, false)
  assert.equal(r.json.error, '请求体过大')
})

/* --------------------------------------------------------------- 路由 */

test('未知路由 → 404', async () => {
  const r = await api('/nope')
  assert.equal(r.status, 404)
  assert.equal(r.json.ok, false)
  assert.ok(r.json.error.includes('unknown route'))
})

test('方法不匹配 → 405 且带 Allow 头', async () => {
  const getGenerate = await api('/generate')
  assert.equal(getGenerate.status, 405)
  assert.equal(getGenerate.json.error, 'method not allowed')
  assert.equal(getGenerate.headers.allow, 'POST')

  const postLibrary = await api('/library', { method: 'POST', body: {} })
  assert.equal(postLibrary.status, 405)
  assert.equal(postLibrary.headers.allow, 'GET')

  const getAttempt = await api('/attempt')
  assert.equal(getAttempt.status, 405)
  assert.equal(getAttempt.headers.allow, 'POST')
})

test('非法 JSON → 400 请求体不是合法 JSON', async () => {
  const r = await api('/delete', { method: 'POST', rawBody: '{"topic":' })
  assert.equal(r.status, 400)
  assert.equal(r.json.error, '请求体不是合法 JSON')
})

test('JSON 顶层不是对象 → 400 请求体必须是 JSON 对象', async () => {
  for (const raw of ['[1,2]', 'null', '"str"', '42']) {
    const r = await api('/delete', { method: 'POST', rawBody: raw })
    assert.equal(r.status, 400, 'body=' + raw)
    assert.equal(r.json.error, '请求体必须是 JSON 对象')
  }
})

/* ------------------------------------------------------------- /attempt */

test('/attempt 参数非法 → 400 参数不完整（不 500）', async () => {
  const cases = [
    { body: { items: [{ i: 0, correct: true }] } },
    { body: { topic: 'x' } },
    { body: { topic: 'x', items: [] } },
    { body: { topic: 'x', items: Array.from({ length: 21 }, (_, k) => ({ i: k % 10, correct: true })) } },
    { body: { topic: 'x', items: [{ i: 99 }, { i: -1 }, { i: 'abc' }, null, 'str'] } }
  ]
  for (const c of cases) {
    const r = await api('/attempt', { method: 'POST', body: c.body })
    assert.equal(r.status, 400, JSON.stringify(c.body).slice(0, 80))
    assert.equal(r.json.error, '参数不完整')
  }
})

test('/attempt NaN / 缺 i 不 500', async () => {
  const r = await api('/attempt', {
    method: 'POST',
    rawBody: JSON.stringify({ topic: '测试-NaN', items: [{ i: null, correct: 1 }, { i: '2' }] })
  })
  assert.ok(r.status < 500, 'status=' + r.status)
})

test('/attempt 合法更新 stats，并出现在 /wrong', async () => {
  const r = await api('/attempt', {
    method: 'POST',
    body: { topic: '测试-合法', items: [{ i: 0, correct: true }, { i: 1, correct: false }] }
  })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.total, 2)
  assert.equal(r.json.correct, 1)
  assert.equal(r.json.score, 50)

  const stats = JSON.parse(await readFile(STATS_FILE, 'utf8'))
  assert.equal(stats.topics['测试-合法'].attempts, 1)
  assert.deepEqual(stats.topics['测试-合法'].lastWrong, [1])
  assert.equal(stats.topics['测试-合法'].total, 2)

  const wrong = await api('/wrong')
  assert.equal(wrong.status, 200)
  const row = wrong.json.rows.find((w) => w.topic === '测试-合法')
  assert.ok(row, '/wrong 应包含刚记录的错题 topic')
  assert.equal(row.lastCorrect, 1)
  assert.equal(row.total, 2)
  assert.equal(row.title, '测试-合法')
})

test('20 个并发 /attempt 全部计入（不丢写）', async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      api('/attempt', { method: 'POST', body: { topic: '测试-并发', items: [{ i: 0, correct: true }] } })
    )
  )
  for (const r of results) {
    assert.equal(r.status, 200)
    assert.equal(r.json.ok, true)
  }
  const stats = JSON.parse(await readFile(STATS_FILE, 'utf8'))
  assert.equal(stats.topics['测试-并发'].attempts, 20, '20 次并发必须全部计入，实际 ' + stats.topics['测试-并发'].attempts)
  assert.equal(stats.topics['测试-并发'].total, 1)
  assert.equal(stats.topics['测试-并发'].lastCorrect, 1)
})

/* ------------------------------------------------------------ /generate */

test('POST /generate 正常生成 → 200 且 card 结构完整', async () => {
  llmMode = 'fast'
  const r = await api('/generate', { method: 'POST', body: { topic: '牛顿环' } })
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.cached, false)
  assert.equal(typeof r.json.tookMs, 'number')
  assert.ok(r.json.tookMs >= 0)
  assert.equal(r.json.pruned, 0)

  const card = r.json.card
  assert.equal(card.topic, '牛顿环')
  assert.equal(typeof card.title, 'string')
  assert.equal(card.model, 'fake/fake-model')
  assert.equal(card.grounded, false)
  assert.equal(card.regenerated, false)
  assert.ok(Array.isArray(card.questions))
  assert.ok(card.questions.length >= 3)

  const cached = await api('/generate', { method: 'POST', body: { topic: '牛顿环' } })
  assert.equal(cached.status, 200)
  assert.equal(cached.json.cached, true)
  assert.equal(cached.json.card.topic, '牛顿环')
  assert.equal(cached.json.tookMs, 0)

  const forced = await api('/generate', { method: 'POST', body: { topic: '牛顿环', force: true } })
  assert.equal(forced.status, 200)
  assert.equal(forced.json.cached, false)
  assert.equal(forced.json.card.regenerated, true)
})

test('/generate 参数校验：缺 topic / topic 超过 60 字 → 400', async () => {
  const missing = await api('/generate', { method: 'POST', body: {} })
  assert.equal(missing.status, 400)
  assert.equal(missing.json.error, '缺少知识点')

  const tooLong = await api('/generate', { method: 'POST', body: { topic: '知'.repeat(61) } })
  assert.equal(tooLong.status, 400)
  assert.ok(tooLong.json.error.includes('60'))
})

test('LLM 失败 → 502（不是 500/504）', async () => {
  llmMode = 'error'
  try {
    const r = await api('/generate', { method: 'POST', body: { topic: '模型失败测试' } })
    assert.equal(r.status, 502)
    assert.equal(r.json.ok, false)
    assert.equal(typeof r.json.error, 'string')
    assert.ok(r.json.error.includes('调用模型失败'))
  } finally {
    llmMode = 'fast'
  }
})

test('生成超时 → 504 生成超时，且 inflight 已清理可重试', async () => {
  llmMode = 'hang'
  process.env.DSH_REVIEW_DESK_TIMEOUT_MS = '300'
  try {
    const t0 = Date.now()
    const r = await api('/generate', { method: 'POST', body: { topic: '超时测试' } })
    assert.equal(r.status, 504)
    assert.equal(r.json.ok, false)
    assert.equal(r.json.error, '生成超时')
    assert.ok(Date.now() - t0 < 3000, '超时必须及时返回，实际 ' + (Date.now() - t0) + 'ms')

    llmMode = 'fast'
    const retry = await api('/generate', { method: 'POST', body: { topic: '超时测试' } })
    assert.equal(retry.status, 200, 'inflight 必须清理，同 topic 可再次请求')
    assert.equal(retry.json.card.topic, '超时测试')
  } finally {
    delete process.env.DSH_REVIEW_DESK_TIMEOUT_MS
    llmMode = 'fast'
  }
})

test('客户端断开后 inflight 清理，同 topic 可重试', async () => {
  llmMode = 'hang'
  process.env.DSH_REVIEW_DESK_TIMEOUT_MS = '5000'
  try {
    await new Promise((resolve) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: BASE + '/generate',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          agent: false
        },
        (res) => {
          res.resume()
          resolve()
        }
      )
      req.on('error', () => resolve())
      req.write(JSON.stringify({ topic: '断连测试' }))
      setTimeout(() => {
        try {
          req.destroy()
        } catch {
          /* ignore */
        }
        resolve()
      }, 120)
    })
    await delay(250)
    llmMode = 'fast'
    const retry = await api('/generate', { method: 'POST', body: { topic: '断连测试' } })
    assert.equal(retry.status, 200, '客户端断开后 inflight 必须清理')
    assert.equal(retry.json.card.topic, '断连测试')
  } finally {
    delete process.env.DSH_REVIEW_DESK_TIMEOUT_MS
    llmMode = 'fast'
  }
})

/* ------------------------------------------------------ /library /card */

test('GET /library：形状、total、questionCount 与统计字段', async () => {
  const r = await api('/library')
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.ok(Array.isArray(r.json.cards))
  assert.equal(r.json.total, r.json.cards.length)

  const item = r.json.cards.find((c) => c.topic === '牛顿环')
  assert.ok(item, '/library 应包含已生成的卡片')
  assert.equal(typeof item.title, 'string')
  assert.equal(item.questionCount, 3)
  assert.equal(item.questions, 3)
  assert.equal(item.best, null)
  assert.equal(item.total, null)
  assert.equal(typeof item.at, 'string')

  const health = await api('/health')
  assert.equal(health.json.cards, r.json.total, '/health cards 必须等于卡片总数')
  assert.ok(health.json.dataDir.startsWith('~'))
  assert.ok(!/[A-Za-z]:[\\/]/.test(health.json.dataDir))
})

test('GET /card：命中 200 / 未命中 404 / 缺参 400', async () => {
  const hit = await api('/card?topic=' + encodeURIComponent('牛顿环'))
  assert.equal(hit.status, 200)
  assert.equal(hit.json.card.topic, '牛顿环')

  const miss = await api('/card?topic=' + encodeURIComponent('不存在的知识点'))
  assert.equal(miss.status, 404)
  assert.equal(miss.json.error, '还没有这个知识点的卡片')

  const missing = await api('/card')
  assert.equal(missing.status, 400)
  assert.equal(missing.json.ok, false)
})

/* ------------------------------------------------------------- /delete */

test('POST /delete：级联删除 stats，/wrong 不留幽灵行', async () => {
  llmMode = 'fast'
  const topic = '删除测试'
  const gen = await api('/generate', { method: 'POST', body: { topic } })
  assert.equal(gen.status, 200)

  const attempt = await api('/attempt', {
    method: 'POST',
    body: { topic, items: [{ i: 0, correct: false }, { i: 1, correct: true }] }
  })
  assert.equal(attempt.status, 200)

  const before = await api('/wrong')
  assert.ok(before.json.rows.some((w) => w.topic === topic))

  const del = await api('/delete', { method: 'POST', body: { topic } })
  assert.equal(del.status, 200)
  assert.equal(del.json.ok, true)
  assert.equal(del.json.removed, 1)
  assert.equal(del.json.statsRemoved, 1)

  const afterWrong = await api('/wrong')
  assert.ok(!afterWrong.json.rows.some((w) => w.topic === topic), '/wrong 不得残留已删 topic')

  const stats = JSON.parse(await readFile(STATS_FILE, 'utf8'))
  assert.equal(stats.topics[topic], undefined)

  const again = await api('/delete', { method: 'POST', body: { topic } })
  assert.equal(again.status, 200)
  assert.equal(again.json.removed, 0)
})

/* ---------------------------------------------------------- 卡片数量上限 */

test('library 超过 120 张：丢弃最旧并返回 pruned 计数', async () => {
  llmMode = 'fast'
  const cards = Array.from({ length: 120 }, (_, k) => ({
    topic: 'prune-' + k,
    title: 'T' + k,
    concept: 'c',
    definition: 'd',
    confusions: [],
    questions: [],
    createdAt: new Date(2020, 0, 1, 0, 0, k).toISOString()
  }))
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(LIB_FILE, JSON.stringify({ cards }), 'utf8')

  const r = await api('/generate', { method: 'POST', body: { topic: '新增卡片' } })
  assert.equal(r.status, 200)
  assert.equal(r.json.pruned, 1, '121 张时应淘汰 1 张')

  const lib = await api('/library')
  assert.equal(lib.json.total, 120)
  assert.ok(lib.json.cards.some((c) => c.topic === '新增卡片'))
  assert.ok(!lib.json.cards.some((c) => c.topic === 'prune-119'), '最旧（数组尾部）应被丢弃')
  assert.ok(lib.json.cards.some((c) => c.topic === 'prune-0'))
})

/* -------------------------------------------------------------- 损坏隔离 */

test('损坏的 library.json：隔离为 .corrupt-*，/library 仍 200 且 cards:[]', async () => {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(LIB_FILE, 'this is not json {{{', 'utf8')
  const beforeCount = await corruptFiles('library.json')
  logLines.warn.length = 0

  const r = await api('/library')
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.cards, [])
  assert.equal(r.json.total, 0)

  const files = await readdir(DATA_DIR)
  assert.equal(await corruptFiles('library.json'), beforeCount + 1, '必须产生一个 .corrupt-* 备份')
  assert.ok(!files.includes('library.json'), '坏文件应被改名而不是留在原位')
  assert.ok(logLines.warn.some((m) => m.includes('library.json')), '隔离必须 logger.warn，不得静默')
})

test('结构不对的 library.json（cards 非数组）同样被隔离', async () => {
  await writeFile(LIB_FILE, JSON.stringify({ cards: 'nope' }), 'utf8')
  const beforeCount = await corruptFiles('library.json')
  const r = await api('/library')
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.cards, [])
  assert.equal(await corruptFiles('library.json'), beforeCount + 1)

  const health = await api('/health')
  assert.equal(health.status, 200)
  assert.equal(health.json.cards, 0)
})

test('损坏的 stats.json：隔离为 .corrupt-*，/wrong 仍 200 且 rows:[]', async () => {
  await writeFile(STATS_FILE, '{"topics":', 'utf8')
  const beforeCount = await corruptFiles('stats.json')
  logLines.warn.length = 0

  const r = await api('/wrong')
  assert.equal(r.status, 200)
  assert.equal(r.json.ok, true)
  assert.deepEqual(r.json.rows, [])

  const files = await readdir(DATA_DIR)
  assert.equal(await corruptFiles('stats.json'), beforeCount + 1)
  assert.ok(!files.includes('stats.json'))
  assert.ok(logLines.warn.some((m) => m.includes('stats.json')))
})

test("生成提示词强制 LaTeX：覆盖行内/独立公式、希腊字母、积分上下限、复指数与转义要求", async () => {
  const source = await readFile(new URL("../lib/index.js", import.meta.url), "utf8")
  const rules = [
    /数学公式必须全部写成标准 LaTeX/,
    /行内公式必须写成 \$\.\.\.\$|行内.*\$\.\.\.\$/,
    /\$\$\.\.\.\$\$/,
    /\\\\frac\{/,
    /\\\\int_\{/,
    /\\\\sum_\{/,
    /\\\\lim_/,
    /\\\\alpha/,
    /\\\\omega/,
    /\\\\nabla/,
    /\\\\partial/,
    /\\\\mathrm\{d\}/,
    /JSON 字符串规则转义/,
    /题干、选项、解析/
  ]
  for (const re of rules) assert.match(source, re, "提示词缺少规则：" + re)
})

test("生成提示词强制 mhchem：化学反应式/机理必须用 \\ce 语法并配平", async () => {
  const source = await readFile(new URL("../lib/index.js", import.meta.url), "utf8")
  const rules = [
    /mhchem/,
    /\\\\ce\{/,
    /<=>/,
    /\\\\uparrow/,
    /\\\\downarrow/,
    /原子守恒与电荷守恒/,
    /元素符号大小写/,
    /\(aq\)/,
    /机理类知识点必须写 mechanism/,
    /至少 1 道题要考反应式\/机理/,
    /"reactions"/,
    /"mechanism"/
  ]
  for (const re of rules) assert.match(source, re, "提示词缺少化学规则：" + re)
})

test("卡片透传 reactions / mechanism：过滤空式、限制条数与长度", async () => {
  llmMode = "fast"
  payloadOverride = {
    reactions: [
      { label: "总反应", equation: "$$\\ce{2H2 + O2 ->[点燃] 2H2O}$$" },
      { label: "可逆反应", equation: "$$\\ce{N2 + 3H2 <=> 2NH3}$$" },
      { label: "沉淀", equation: "$$\\ce{Ba^2+ + SO4^2- -> BaSO4\\downarrow}$$" },
      { label: "气体", equation: "$$\\ce{Zn + 2H+ -> Zn^2+ + H2\\uparrow}$$" },
      { label: "多余的第五条", equation: "$$\\ce{H2O}$$" },
      { label: "空式子", equation: "   " },
      { label: "无式子" }
    ],
    mechanism: "1. 亲电试剂加成到双键，形成碳正离子。\n2. 亲核试剂进攻碳正离子。"
  }
  try {
    const r = await api("/generate", { method: "POST", body: { topic: "周环反应" } })
    assert.equal(r.status, 200)
    const card = r.json.card
    assert.equal(card.reactions.length, 4, "超过 4 条应被截断，空式子应被过滤")
    for (const item of card.reactions) {
      assert.equal(typeof item.label, "string")
      assert.ok(item.equation.includes("\\ce{"), "反应式应保留 mhchem 语法")
    }
    assert.match(card.mechanism, /碳正离子/)
  } finally {
    payloadOverride = {}
  }
})

test("卡片未给 reactions / mechanism 时回落为空数组与空字符串", async () => {
  llmMode = "fast"
  const r = await api("/generate", { method: "POST", body: { topic: "无化学知识点" } })
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.card.reactions, [])
  assert.equal(r.json.card.mechanism, "")
})
