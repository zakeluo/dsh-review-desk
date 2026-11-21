import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'review-desk'
export const inject = ['webServer', 'llm']

const PREFIX = '/dsh-review-desk/api'
const MAX_CARDS = 120
const MAX_BODY_BYTES = 256 * 1024
const DEFAULT_GENERATE_TIMEOUT_MS = 200_000
const DEFAULT_LLM_TIMEOUT_MS = 180_000
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

function dshHome() {
  const env = process.env.DSH_HOME
  return env && env.trim() ? env.trim() : join(homedir(), '.dsh')
}

const DATA_DIR = join(dshHome(), 'data', 'review-desk')
const LIB_FILE = join(DATA_DIR, 'library.json')
const STATS_FILE = join(DATA_DIR, 'stats.json')
const CONFIG_FILE = join(DATA_DIR, 'config.json')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/* ------------------------------------------------------------------ 工具 */

function msgOf(e) {
  return e instanceof Error ? e.message : String(e)
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function loggerOf(ctx) {
  return ctx && ctx.logger ? ctx.logger : null
}

function warnLog(ctx, message) {
  try {
    loggerOf(ctx)?.warn?.(String(message))
  } catch {
    /* logger 自身出错不影响请求 */
  }
}

function errorLog(ctx, message) {
  try {
    loggerOf(ctx)?.error?.(String(message))
  } catch {
    /* ignore */
  }
}

function infoLog(ctx, message) {
  try {
    loggerOf(ctx)?.info?.(String(message))
  } catch {
    /* ignore */
  }
}

/** 展示用数据目录：必须是 ~ 相对形式，绝不把绝对路径返回给前端。 */
function displayDataDir() {
  const norm = (p) => String(p).split(/[\\/]+/).filter(Boolean).join('/')
  const dir = norm(DATA_DIR)
  const home = norm(homedir())
  if (home) {
    const dl = dir.toLowerCase()
    const hl = home.toLowerCase()
    if (dl === hl) return '~'
    if (dl.startsWith(hl + '/')) return '~/' + dir.slice(home.length + 1)
  }
  // DSH_HOME 指向用户目录之外时也不泄露绝对路径，回落到所文档化的默认目录。
  return '~/.dsh/data/review-desk'
}

/* ------------------------------------------------------------------ 存储 */

let writeChain = Promise.resolve()
let tmpSeq = 0

/** 原子写：先写唯一临时文件再 rename；全局串行避免同一文件互相覆盖。 */
function saveJson(file, data) {
  const run = async () => {
    await mkdir(dirname(file), { recursive: true })
    const tmp = file + '.' + process.pid + '.' + (++tmpSeq) + '.tmp'
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await rename(tmp, file)
  }
  const next = writeChain.then(run, run)
  writeChain = next.then(
    () => {},
    () => {}
  )
  return next
}

const locks = new Map()

/** 按键串行化「读-改-写」，避免并发请求互相丢写。 */
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.then(
    () => {},
    () => {}
  )
  locks.set(key, tail)
  tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key)
  })
  return run
}

const emptyLibrary = () => ({ cards: [] })
const emptyStats = () => ({ topics: {} })
const validLibrary = (data) => isPlainObject(data) && Array.isArray(data.cards)
const validStats = (data) => isPlainObject(data) && isPlainObject(data.topics)

function corruptStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** 坏文件不静默丢弃：改名为 <name>.corrupt-<时间戳> 保留现场，再用空结构继续。 */
async function quarantine(ctx, file, label) {
  const dest = file + '.corrupt-' + corruptStamp()
  try {
    await rename(file, dest)
    warnLog(ctx, 'review-desk: ' + label + ' 已损坏，已隔离为 ' + dest)
  } catch (e) {
    warnLog(ctx, 'review-desk: ' + label + ' 已损坏且无法隔离（' + msgOf(e) + '），本次使用空数据')
  }
}

async function readStore(ctx, file, label, makeFallback, validate) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (e) {
    if (e && e.code !== 'ENOENT') warnLog(ctx, 'review-desk: 读取 ' + label + ' 失败：' + msgOf(e))
    return makeFallback()
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    data = undefined
  }
  if (data === undefined || !validate(data)) {
    await quarantine(ctx, file, label)
    return makeFallback()
  }
  return data
}

const readLibrary = (ctx) => readStore(ctx, LIB_FILE, 'library.json', emptyLibrary, validLibrary)
const readStats = (ctx) => readStore(ctx, STATS_FILE, 'stats.json', emptyStats, validStats)

/** config.json 是可选配置，坏了就当没有，不隔离不抛错。 */
async function readConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8')
    const data = JSON.parse(raw)
    return isPlainObject(data) ? data : null
  } catch {
    return null
  }
}

async function readModelConfig() {
  const conf = await readConfig()
  if (conf && typeof conf.provider === 'string' && typeof conf.model === 'string' && conf.provider && conf.model) {
    return { provider: conf.provider, model: conf.model }
  }
  return null
}

/* ------------------------------------------------------------- 生成超时 */

async function generateTimeoutMs() {
  const env = Number(process.env.DSH_REVIEW_DESK_TIMEOUT_MS)
  if (Number.isFinite(env) && env > 0) return env
  const conf = await readConfig()
  const n = Number(conf && conf.generateTimeoutMs)
  if (Number.isFinite(n) && n > 0) return n
  return DEFAULT_GENERATE_TIMEOUT_MS
}

/** 离线/测试环境可用 DSH_REVIEW_DESK_SEARCH=0 跳过联网检索。 */
function searchDisabled() {
  const v = String(process.env.DSH_REVIEW_DESK_SEARCH || '')
    .trim()
    .toLowerCase()
  return v === '0' || v === 'false' || v === 'off' || v === 'no'
}

/* ------------------------------------------------------------------ 检索 */

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
}

function clean(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

const BAD = ['广告', '采购', '招标', '认证', '培训班', '下载', '优惠', '报名', '题库购买', '代写']
const GOOD = ['edu.cn', 'baike', 'zhihu', 'wikipedia', 'scienc', 'cnki', 'xueshu', 'book']

function scoreOf(item, topic) {
  let s = 0
  const t = topic.replace(/\s+/g, '')
  const title = item.title || ''
  if (t && title.replace(/\s+/g, '').includes(t)) s += 4
  else if (t && t.length > 2 && title.includes(t.slice(0, 2))) s += 1
  const url = item.url || ''
  if (GOOD.some((g) => url.toLowerCase().includes(g))) s += 3
  if (BAD.some((b) => title.includes(b) || url.includes(b))) s -= 6
  s += Math.min(item.content.length, 400) / 200
  return s
}

async function sogou(query) {
  const res = await fetch('https://www.sogou.com/web?query=' + encodeURIComponent(query), {
    headers: {
      'user-agent': UA,
      'accept-language': 'zh-CN,zh;q=0.9',
      accept: 'text/html,application/xhtml+xml'
    },
    signal: AbortSignal.timeout(12000)
  })
  if (!res.ok) return []
  const html = await res.text()
  const out = []
  const re = /<script id="data-[^"]*" type="application\/json">([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(html))) {
    try {
      const o = JSON.parse(m[1])
      const title = clean(o.title || '')
      const content = clean(o.content || '')
      if (!title || content.length < 24) continue
      out.push({ title, content, url: o.url || '', engine: 'sogou' })
    } catch {
      /* ignore */
    }
  }
  return out
}

async function so360(query) {
  const res = await fetch('https://www.so.com/s?q=' + encodeURIComponent(query), {
    headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9' },
    signal: AbortSignal.timeout(12000)
  })
  if (!res.ok) return []
  const html = await res.text()
  const out = []
  const blocks = html.split('<li class="res-list"').slice(1, 12)
  for (const b of blocks) {
    const tm = b.match(/<h3[^>]*class="[^"]*res-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/)
    const sm = b.match(/<span[^>]*class="[^"]*res-list-summary[^"]*"[^>]*>([\s\S]*?)<\/span>/)
    const um = b.match(/href="(https?:\/\/[^"]+)"/)
    const title = tm ? clean(tm[1]) : ''
    const content = sm ? clean(sm[1]) : ''
    if (!title || content.length < 24) continue
    out.push({ title, content, url: um ? um[1] : '', engine: 'so360' })
  }
  return out
}

async function searchTopic(topic) {
  if (searchDisabled()) return []
  const queries = [topic, topic + ' 定义 原理']
  const pool = []
  for (const q of queries) {
    for (const fn of [sogou, so360]) {
      try {
        pool.push(...(await fn(q)))
      } catch {
        /* 单个引擎失败不影响整体 */
      }
      if (pool.length >= 8) break
    }
    if (pool.length >= 8) break
  }
  const seen = new Set()
  const uniq = []
  for (const item of pool) {
    const key = item.title.slice(0, 24)
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(item)
  }
  uniq.sort((a, b) => scoreOf(b, topic) - scoreOf(a, topic))
  return uniq.slice(0, 6).map((i) => ({
    title: i.title.slice(0, 80),
    content: i.content.slice(0, 420),
    url: i.url,
    engine: i.engine
  }))
}

/* ------------------------------------------------------------------ 模型 */

function resolveModel(ctx) {
  try {
    const svc = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : ctx.agentDefaultModel
    const sel = svc?.currentSelection?.()
    if (sel?.provider && sel?.model) return { provider: sel.provider, model: sel.model }
  } catch {
    /* ignore */
  }
  return null
}

function parseJsonBlock(text) {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(t)
  } catch {
    /* fallthrough */
  }
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(t.slice(s, e + 1))
    } catch {
      /* fallthrough */
    }
  }
  return null
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * 截断但绝不切在公式或 \ce{…} 中间。
 * 卡片文本里公式与化学式都是 `$…$` / `$$…$$` / `\ce{…}`，硬切会把花括号或 $ 切坏，
 * 面板上就会露出半截 "\ce{C6" 或渲染失败。这里只在「公式外且花括号配平」的位置落刀。
 */
function safeSlice(text, max) {
  const s = String(text == null ? '' : text).trim()
  if (s.length <= max) return s
  let depth = 0
  let math = 0
  let lastSafe = -1
  for (let i = 0; i < s.length && i < max; i++) {
    const c = s[i]
    if (c === '\\') {
      i++
      continue
    }
    if (math === 0) {
      if (c === '$') {
        math = s[i + 1] === '$' ? 2 : 1
        if (math === 2) i++
        continue
      }
    } else {
      if (c === '$' && (math === 1 || s[i + 1] === '$')) {
        if (math === 2) i++
        math = 0
        lastSafe = i + 1
        continue
      }
      continue
    }
    if (c === '{') depth++
    else if (c === '}' && depth > 0) depth--
    if (depth === 0) lastSafe = i + 1
  }
  let cut = lastSafe > 0 ? lastSafe : max
  const out = s.slice(0, cut).trimEnd().replace(/[\\,，、;；:：]$/, '')
  return out || s.slice(0, max)
}

/** 可能含公式的文本字段：用 safeSlice，避免截断破坏 LaTeX / \ce{}。 */
const strMath = (v, max) => (typeof v === 'string' ? safeSlice(v, max) : '')

function normalizeCard(raw, topic) {
  if (!raw || typeof raw !== 'object') throw new Error('模型没有返回可解析的 JSON')
  const title = strMath(raw.title, 32) || topic
  const concept = strMath(raw.concept, 200)
  const definition = strMath(raw.definition, 600)
  if (!concept) throw new Error('模型返回缺少「核心概念」')
  if (!definition) throw new Error('模型返回缺少「定义」')

  const confusions = Array.isArray(raw.confusions) ? raw.confusions : []
  const confusionList = confusions
    .map((c) => ({
      name: strMath(c?.name, 40),
      difference: strMath(c?.difference, 220),
      example: strMath(c?.example, 160)
    }))
    .filter((c) => c.name && c.difference)
    .slice(0, 3)

  const rawReactions = Array.isArray(raw.reactions) ? raw.reactions : []
  const reactionList = rawReactions
    .map((r) => ({
      label: strMath(r?.label, 60),
      equation: strMath(r?.equation, 500)
    }))
    .filter((r) => r.equation)
    .slice(0, 4)
  // 模型偶尔把换行写成字面量 "\n"（JSON 里二次转义），不还原的话机理步骤会挤成一整段。
  const mechanism = strMath(String(raw.mechanism == null ? '' : raw.mechanism).replace(/\\n/g, '\n'), 1200)

  const questions = []
  const rawQ = Array.isArray(raw.questions) ? raw.questions : []
  for (const q of rawQ) {
    const stem = strMath(q?.stem, 300)
    if (!stem) continue
    const type = q?.type === 'judge' ? 'judge' : 'single'
    if (type === 'judge') {
      const answer = q?.answer === true || q?.answer === 'true' || q?.answer === '对' || q?.answer === 1
      questions.push({
        type,
        stem,
        options: ['正确', '错误'],
        answer,
        explanation: strMath(q?.explanation, 240)
      })
    } else {
      const options = (Array.isArray(q?.options) ? q.options : []).map((o) => strMath(o, 140)).filter(Boolean).slice(0, 5)
      if (options.length < 3) continue
      let answer = Number(q?.answer)
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) answer = 0
      questions.push({
        type,
        stem,
        options,
        answer,
        explanation: strMath(q?.explanation, 240)
      })
    }
    if (questions.length >= 5) break
  }
  if (questions.length < 3) throw new Error('模型只给出 ' + questions.length + ' 道题，至少需要 3 道')

  return {
    topic,
    title,
    concept,
    definition,
    confusions: confusionList.length ? confusionList : [],
    reactions: reactionList,
    mechanism: mechanism || '',
    questions,
    createdAt: new Date().toISOString()
  }
}

let llmModPromise = null

async function loadLlm() {
  if (!llmModPromise) {
    llmModPromise = import('@deepseek-ai/dsh-llm').catch((e) => {
      llmModPromise = null
      throw new Error('无法加载 @deepseek-ai/dsh-llm：' + (e && e.message ? e.message : String(e)))
    })
  }
  return llmModPromise
}

function userMessage(text) {
  return { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }
}

function collectText(chunk, buf) {
  if (!chunk || typeof chunk !== 'object') return buf
  if (typeof chunk.text === 'string' && (chunk.type === 'text' || chunk.type === 'text-delta' || chunk.type === 'text_delta')) {
    return buf + chunk.text
  }
  if (chunk.type === 'text' && chunk.text) return buf
  if (chunk.delta && typeof chunk.delta === 'string') return buf + chunk.delta
  return buf
}

const SYSTEM = `你是一名严谨的大学课程复习助教，熟悉中国高校教材（高等数学、大学物理、有机化学、材料科学、计算机等）。把用户给的一个知识点整理成一张自测复习卡。

只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码块、不要前后缀。结构：
{
  "title": "知识点名称，不超过 18 字",
  "concept": "一句话核心概念，40-70 字，说清它是什么、解决什么问题",
  "definition": "严谨定义，100-200 字，包含关键条件、公式或适用前提",
  "confusions": [
    {"name": "最容易混淆的知识点名称", "difference": "与它的关键区别，60-90 字", "example": "一句典型区分例子，30-50 字"}
  ],
  "reactions": [
    {"label": "该式的用途（如 总反应 / 阳极反应 / 特征反应）", "equation": "$$\\ce{2H2 + O2 ->[点燃] 2H2O}$$（mhchem 语法，必须配平）"}
  ],
  "mechanism": "涉及反应机理时必填：至少 2 步，每步独占一行并以「1. 」「2. 」编号（编号写在 \\ce 外面），步内用 $$\\ce{...}$$ 写该步物种变化，再用文字说明电子转移方向；不涉及机理时填空字符串 \\"\\"",
  "questions": [
    {"type": "single", "stem": "题干", "options": ["选项A", "选项B", "选项C", "选项D"], "answer": 0, "explanation": "解析，60-90 字"}
  ]
}

数学公式必须全部写成标准 LaTeX，这是硬性格式要求：
1. 行内公式一律包在 $...$ 里，例如 $r_k^2=kR\\lambda$、$\\Delta x\\,\\Delta p\\ge\\hbar/2$。
2. 独立公式一律包在 $$...$$ 里，且**核心定义公式必须单独成行、居中显示**：concept、definition 中的关键公式以及每道题的解析里只要出现核心关系式，就用 $$...$$ 单独一行，不要塞在句子中间，也不要用纯文本近似（禁止写 r_k^2=kRλ、sqrt(x)、x^2/2、1/2 这种）。
3. 希腊字母只用命令：$\\alpha$ $\\beta$ $\\gamma$ $\\delta$ $\\varepsilon$ $\\theta$ $\\lambda$ $\\mu$ $\\nu$ $\\pi$ $\\rho$ $\\sigma$ $\\tau$ $\\varphi$ $\\omega$ $\\Delta$ $\\Omega$ $\\Sigma$ $\\Phi$ $\\Psi$ $\\Gamma$；不要写 unicode 希腊字母或英文拼写。
4. 分式用 $\\frac{a}{b}$（复杂分式用 $\\dfrac{}{}$），根式用 $\\sqrt{x}$、$\\sqrt[n]{x}$，不要用斜杠或 ^(1/2)。
5. 积分写上下限：$\\int_{a}^{b} f(x)\\,\\mathrm{d}x$、$\\oint_{C}\\vec{F}\\cdot\\mathrm{d}\\vec{l}$、$\\iint_{D}$、$\\iiint_{\\Omega}$；重积分要带区域/区间下标。
6. 求和、连乘、极限、上下确界写清楚：$\\sum_{k=1}^{n} a_k$、$\\prod_{i=1}^{n} x_i$、$\\lim_{x\\to 0}\\frac{\\sin x}{x}=1$、$\\lim_{n\\to\\infty}$、$\\max_{x\\in[a,b]}$、$\\sup_{n\\ge 1}$。
7. 复指数与算子：$e^{i\\omega t}$、$e^{-iEt/\\hbar}$、$\\frac{\\partial u}{\\partial t}=a^2\\frac{\\partial^2 u}{\\partial x^2}$、$\\nabla^2\\varphi=0$、$\\hat{H}\\psi=E\\psi$、$\\frac{\\mathrm{d}y}{\\mathrm{d}x}$（微分算子 d 用 \\mathrm{d}，偏导用 \\partial，Laplace 用 \\nabla^2）。
8. 其他规范：向量 $\\vec{v}$、矩阵 $\\begin{pmatrix}a & b\\\\ c & d\\end{pmatrix}$、范数 $\\lVert\\vec{x}\\rVert_2$、绝对值 $\\lvert x\\rvert$、集合 $\\{x\\in\\mathbb{R}\\mid x>0\\}$、比较 $\\le$ $\\ge$ $\\ne$ $\\approx$ $\\equiv$、点乘 $\\cdot$、叉乘 $\\times$、无穷 $\\infty$、埃 $\\mathrm{e}$、虚数单位 $\\mathrm{i}$、自然对数 $\\ln$、三角函数 $\\sin\\cos\\tan$ 等用命令。
9. LaTeX 里的花括号、反斜杠必须按 JSON 字符串规则转义（写作 \\\\ 与 \\{），确保 JSON 合法可解析。

化学式、反应式、机理一律用 mhchem 的 \\ce{...} 语法书写（再按上面的规则包进 $...$ 或 $$...$$），这是硬性格式要求：
1. 凡涉及化学反应的知识点（反应类型、反应机理、合成路线、电极过程、检验与制备、有机物性质等），**必须给出至少一个具体、配平的示例反应式**：写进 definition 的居中公式，或写进 reactions 数组（1-4 条，label 说明用途，如「总反应」「阳极」「特征反应」）。纯概念型知识点（不涉及任何反应）可省略 reactions。
2. 元素符号大小写严格正确：Na、Cl、Fe、Mn、Cu、Zn、Al、Si、P、S（禁止 NA、na、CL、H2O 写成 H2o）。
3. 原子个数用下标：\\ce{H2O}、\\ce{Ca(OH)2}、\\ce{Al2(SO4)3}；不确定的晶体/水合物按标准写法。
4. 离子电荷用上标，数字在前、正负号在后，电荷为 1 时省略 1：\\ce{Fe^3+}、\\ce{SO4^2-}、\\ce{OH-}、\\ce{NH4+}（不要写 Fe+3、SO4--）。
5. 物质状态 (g) (l) (s) (aq) 紧跟化学式之后：\\ce{Zn(s) + Cu^2+(aq) -> Zn^2+(aq) + Cu(s)}；状态只在该反应确有必要时标注，但标注了就必须每个物种都标或按惯例标全。
6. 方程式必须配平：同时满足原子守恒与电荷守恒，系数用最小整数比。普通反应用 ->，可逆反应用 <=>；反应条件（点燃、加热、催化剂、光照、通电、浓/稀、温度、溶剂）写在箭头上方或上下两侧：\\ce{2H2 + O2 ->[点燃] 2H2O}、\\ce{CH3CH2OH ->[浓H2SO4][170{ }^\\circ C] CH2=CH2 + H2O}。
7. 沉淀与气体在生成物后标注：气体 \\ce{H2\\uparrow}、沉淀 \\ce{BaSO4\\downarrow}（本面板渲染 \\uparrow 为 ↑、\\downarrow 为 ↓）。
8. 专项规则：弱电解质电离、盐类水解一律用 <=>（\\ce{CH3COOH <=> CH3COO- + H+}、\\ce{CO3^2- + H2O <=> HCO3- + OH-}）；强电解质电离用等号 =（\\ce{NaCl = Na+ + Cl-}）；电极反应式必须标出电子得失（\\ce{2H2O -> O2\\uparrow + 4H+ + 4e-}、\\ce{Cu^2+ + 2e- -> Cu}）；有机反应要写准官能团、条件与反应类型（如「溴水加成，褪色」）。
9. **机理类知识点必须写 mechanism**（周环反应、亲电/亲核加成、SN1/SN2、消除、重排、缩合、催化循环、电环化/环加成等）：分步给出，每步单独一行 \\ce{...} 并编号，箭头标条件/试剂/中间体，并用文字说明电子转移方向（如「C=C 的 π 电子 → H+ 的 1s 空轨道」）。本面板不支持弯曲箭头，所以机理图用「分步 \\ce 序列 + 每步说明」表达，不要只写文字结论。每一步必须是反应的真实阶段（形成中间体、质子转移、环闭合、离去基团离去等），不能把总反应式抄一遍冒充机理；**至少 2 步**，每步独占一行并以「1. 」「2. 」开头（编号写在 \\ce 外面，例如先写「1. 质子化生成氧鎓离子」，换行后再写 $$\\ce{...}$$），协同反应也按「反应物接近 → 环状过渡态 → 成键/断键与电子转移」写出关键阶段。
10. 有机反应的反应物与产物优先写**结构简式**（如 \\ce{CH2=CH-CH=CH2}、\\ce{CH3CH2OH}、\\ce{CH3COCl}），不要只丢一个分子式；确实难以用简式表达的环状产物可写分子式，但必须在 label 或同句文字里点明具体物质（如「\\ce{C6H10}（环己烯）」），且分子式要与结构简式、配平一致。
11. 化学内容必须准确：元素符号、下标、电荷、配平、反应条件、产物都要核对；识别到原文有误时直接按规范改正，不要编造教材里不存在的反应；题目、选项、解析里出现的反应式同样按上述规范书写。

硬性要求：
1. confusions 只给 1-3 个真正最容易混淆的，不要凑数；没有就少给。
2. questions 给 3-5 道，以 single 为主，最多 1 道 judge（judge 的 options 固定为 ["正确","错误"]，answer 用 true/false）；涉及反应的知识点至少 1 道题要考反应式/机理（配平、条件、产物、电子转移）。
3. 题目考理解与辨析，不考死记；干扰项要像真的；answer 是正确选项下标，从 0 开始。
4. 题干、选项、解析里出现的公式同样按上述 LaTeX 规范书写（行内 $...$，核心公式 $$...$$）。
5. 只写本知识点相关内容，不编造文献、作者、页码。
6. 如果给了检索资料，以资料为准；资料不足时用教材通识补齐，但不要写出资料里没有的争议结论。`


async function generateCard(ctx, topic, opts = {}) {
  const llm = ctx.llm
  if (!llm || typeof llm.stream !== 'function') throw new Error('DSH 的 LLM 服务不可用')
  const model = (await readModelConfig()) || resolveModel(ctx)
  if (!model) throw new Error('没有可用的默认模型，请先在 DSH 里选择一个模型')

  const sources = await searchTopic(topic)
  const material = sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}`).join('\n\n')
    : '（本次没有检索到可用网页资料，请基于教材通识作答）'

  const userText = `知识点：${topic}\n\n检索资料：\n${material}`

  const options = {
    provider: model.provider,
    model: model.model,
    sessionId: 'review-desk-generate',
    messages: [userMessage(userText)],
    system: SYSTEM,
    temperature: 0.3,
    signal: opts.signal || AbortSignal.timeout(DEFAULT_LLM_TIMEOUT_MS)
  }

  let text = ''
  let mod = null
  try {
    mod = await loadLlm()
  } catch (e) {
    warnLog(ctx, 'review-desk: ' + msgOf(e))
  }
  try {
    if (mod && typeof mod.createUserMessage === 'function') {
      options.messages = [mod.createUserMessage({ content: [{ type: 'text', text: userText }], source: { kind: 'user' } })]
    }
    if (mod && mod.BlockAssembler) {
      const assembler = new mod.BlockAssembler()
      for await (const chunk of llm.stream(options)) assembler.push(chunk)
      text = assembler
        .blocks()
        .filter((b) => b.type === 'text')
        .map((b) => ('text' in b ? b.text : ''))
        .join('')
        .trim()
    } else {
      for await (const chunk of llm.stream(options)) text = collectText(chunk, text)
      text = text.trim()
    }
  } catch (e) {
    if (opts.signal && opts.signal.aborted) {
      const err = new Error('生成超时')
      err.code = 'ETIMEDOUT'
      throw err
    }
    throw new Error('调用模型失败：' + (e && e.message ? e.message : String(e)))
  }

  if (!text) throw new Error('模型没有返回文本')

  const raw = parseJsonBlock(text)
  const card = normalizeCard(raw, topic)
  card.model = model.provider + '/' + model.model
  card.sources = sources.map((s) => ({ title: s.title, url: s.url }))
  card.grounded = sources.length > 0
  card.regenerated = !!opts.force
  return card
}

/* --------------------------------------------------------------- inflight */

const inflight = new Map()

function timeoutError() {
  const err = new Error('生成超时')
  err.code = 'ETIMEDOUT'
  return err
}

function disconnectError() {
  const err = new Error('客户端已断开')
  err.code = 'EDISCONNECT'
  return err
}

/**
 * 同一 topic 的并发生成去重。无论成功、失败、超时还是客户端断开，
 * inflight 都在 finally 里清理，避免卡住后续请求。
 */
async function generateOnce(ctx, topic, force, timeoutMs, clientSignal) {
  const key = topic + (force ? '#r' : '')
  const existing = inflight.get(key)
  if (existing) return existing

  const ac = new AbortController()
  let timer = null

  const work = (async () => {
    try {
      return await generateCard(ctx, topic, { force, signal: ac.signal })
    } catch (e) {
      if (e && e.code === 'ETIMEDOUT') throw e
      if (ac.signal.aborted) throw timeoutError()
      throw e
    }
  })()

  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        ac.abort()
      } catch {
        /* ignore */
      }
      reject(timeoutError())
    }, Math.max(1, Number(timeoutMs) || DEFAULT_GENERATE_TIMEOUT_MS))
  })

  const disconnected = new Promise((_, reject) => {
    if (!clientSignal) return
    if (clientSignal.aborted) {
      reject(disconnectError())
      return
    }
    clientSignal.addEventListener('abort', () => reject(disconnectError()), { once: true })
  })

  const promise = Promise.race([work, timedOut, disconnected]).finally(() => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

/* ------------------------------------------------------------------ 卡片库 */

async function upsertCard(ctx, card) {
  return withLock('library', async () => {
    const lib = await readLibrary(ctx)
    const idx = lib.cards.findIndex((c) => c && c.topic === card.topic)
    if (idx >= 0) lib.cards[idx] = card
    else lib.cards.unshift(card)
    let pruned = 0
    if (lib.cards.length > MAX_CARDS) {
      pruned = lib.cards.length - MAX_CARDS
      lib.cards = lib.cards.slice(0, MAX_CARDS)
    }
    await saveJson(LIB_FILE, lib)
    return { pruned }
  })
}

async function recordAttempt(ctx, topic, items) {
  return withLock('stats', async () => {
    const store = await readStats(ctx)
    const prev = isPlainObject(store.topics[topic]) ? store.topics[topic] : { attempts: 0, best: 0 }
    const total = items.length
    const correct = items.filter((i) => i.correct).length
    const attempts = (Number.isFinite(prev.attempts) ? prev.attempts : 0) + 1
    const best = Math.max(Number.isFinite(prev.best) ? prev.best : 0, correct)
    const score = total ? Math.round((correct / total) * 100) : 0
    store.topics[topic] = {
      attempts,
      best,
      total,
      lastCorrect: correct,
      lastScore: score,
      lastAt: new Date().toISOString(),
      lastWrong: items.filter((i) => !i.correct).map((i) => i.i)
    }
    await saveJson(STATS_FILE, store)
    return { total, correct, score, attempts, best }
  })
}

async function deleteTopic(ctx, topic) {
  const removed = await withLock('library', async () => {
    const lib = await readLibrary(ctx)
    const before = lib.cards.length
    lib.cards = lib.cards.filter((c) => !(c && c.topic === topic))
    const count = before - lib.cards.length
    if (count > 0) await saveJson(LIB_FILE, lib)
    return count
  })
  const statsRemoved = await withLock('stats', async () => {
    const store = await readStats(ctx)
    if (!Object.prototype.hasOwnProperty.call(store.topics, topic)) return 0
    delete store.topics[topic]
    await saveJson(STATS_FILE, store)
    return 1
  })
  return { removed, statsRemoved }
}

/* ------------------------------------------------------------------ HTTP */

function sendJson(res, status, obj, extraHeaders) {
  if (!res || res.writableEnded || res.destroyed) return
  const body = JSON.stringify(obj)
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(body)
  }
  if (extraHeaders) Object.assign(headers, extraHeaders)
  try {
    res.writeHead(status, headers)
    res.end(body)
  } catch {
    try {
      res.destroy()
    } catch {
      /* ignore */
    }
  }
}

const CROSS_SITE_ERROR = 'cross-site request rejected'

function originAllowed(req) {
  const origin = req.headers.origin
  if (origin === undefined) return true
  const raw = String(origin).trim()
  if (!raw || raw.toLowerCase() === 'null') return false
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = String(req.headers.host || '')
  return !!parsed.host && parsed.host === host
}

function guardHeaders(req, res) {
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase()
  if (site === 'cross-site') {
    sendJson(res, 403, { ok: false, error: CROSS_SITE_ERROR })
    return false
  }
  if (!originAllowed(req)) {
    sendJson(res, 403, { ok: false, error: CROSS_SITE_ERROR })
    return false
  }
  return true
}

function isJsonContentType(value) {
  if (typeof value !== 'string' || !value) return false
  const mime = value.split(';')[0].trim().toLowerCase()
  return mime === 'application/json'
}

/** 读请求体：超过 limit 后停止缓存、继续排空，最后统一返回 tooLarge。 */
function readBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(c)
    })
    req.on('end', () => done(tooLarge ? { tooLarge: true } : { text: Buffer.concat(chunks).toString('utf8') }))
    req.on('error', () => done({ aborted: true }))
    req.on('close', () => done({ aborted: true }))
  })
}

function parseJsonObject(text) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (!raw) return { ok: true, value: {} }
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    return { ok: false, error: '请求体不是合法 JSON' }
  }
  if (!isPlainObject(value)) return { ok: false, error: '请求体必须是 JSON 对象' }
  return { ok: true, value }
}

/* --------------------------------------------------------------- 各端点 */

async function healthModel(ctx) {
  return (await readModelConfig()) || resolveModel(ctx)
}

let versionCache = null

async function pluginVersion() {
  if (versionCache) return versionCache
  try {
    const raw = await readFile(join(MODULE_DIR, '..', 'package.json'), 'utf8')
    const pkg = JSON.parse(raw)
    const v = pkg && typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.0.0'
    versionCache = v
    return v
  } catch {
    return '0.0.0'
  }
}

async function handleHealth(ctx, req, res) {
  const [model, version, lib] = await Promise.all([healthModel(ctx), pluginVersion(), readLibrary(ctx)])
  sendJson(res, 200, {
    ok: true,
    version,
    model: model ? model.provider + '/' + model.model : null,
    dataDir: displayDataDir(),
    cards: lib.cards.length
  })
}

async function handleLibrary(ctx, req, res) {
  const [lib, store] = await Promise.all([readLibrary(ctx), readStats(ctx)])
  const cards = lib.cards.filter(isPlainObject).map((c) => {
    const stat = isPlainObject(store.topics[c.topic]) ? store.topics[c.topic] : null
    const questionCount = Array.isArray(c.questions) ? c.questions.length : 0
    const at = typeof c.createdAt === 'string' ? c.createdAt : null
    return {
      topic: c.topic,
      title: c.title,
      questionCount,
      questions: questionCount,
      best: stat && Number.isFinite(stat.best) ? stat.best : null,
      total: stat && Number.isFinite(stat.total) ? stat.total : null,
      at,
      createdAt: at
    }
  })
  sendJson(res, 200, { ok: true, cards, total: cards.length })
}

async function handleCard(ctx, req, res, url) {
  const topic = String(url.searchParams.get('topic') || '').trim()
  if (!topic) return sendJson(res, 400, { ok: false, error: '缺少知识点' })
  const lib = await readLibrary(ctx)
  const card = lib.cards.find((c) => c && (c.topic === topic || c.title === topic))
  if (!card) return sendJson(res, 404, { ok: false, error: '还没有这个知识点的卡片' })
  sendJson(res, 200, { ok: true, card })
}

async function handleGenerate(ctx, req, res, url, body) {
  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  if (!topic) return sendJson(res, 400, { ok: false, error: '缺少知识点' })
  if (topic.length > 60) return sendJson(res, 400, { ok: false, error: '知识点太长，请精简到 60 字以内' })
  const force = Boolean(body.force)

  if (!force) {
    const lib = await readLibrary(ctx)
    const hit = lib.cards.find((c) => c && (c.topic === topic || c.title === topic))
    if (hit) return sendJson(res, 200, { ok: true, card: hit, cached: true, tookMs: 0, pruned: 0 })
  }

  const t0 = Date.now()
  const timeoutMs = await generateTimeoutMs()
  const ac = new AbortController()
  const onClose = () => {
    if (!res.writableEnded) {
      try {
        ac.abort()
      } catch {
        /* ignore */
      }
    }
  }
  res.on?.('close', onClose)
  try {
    const card = await generateOnce(ctx, topic, force, timeoutMs, ac.signal)
    const { pruned } = await upsertCard(ctx, card)
    sendJson(res, 200, { ok: true, card, cached: false, tookMs: Date.now() - t0, pruned })
  } catch (e) {
    const code = e && e.code
    if (code === 'EDISCONNECT') return
    if (code === 'ETIMEDOUT') return sendJson(res, 504, { ok: false, error: '生成超时' })
    const message = msgOf(e)
    warnLog(ctx, 'review-desk: 生成失败：' + message)
    sendJson(res, 502, { ok: false, error: message })
  } finally {
    res.off?.('close', onClose)
  }
}

function normalizeAttemptItems(rawItems) {
  const seen = new Set()
  const items = []
  for (let k = 0; k < rawItems.length; k++) {
    const it = rawItems[k]
    if (!isPlainObject(it)) continue
    const rawI = it.i
    const n = rawI === undefined || rawI === null ? k : Number(rawI)
    if (!Number.isInteger(n) || n < 0 || n > 9) continue
    if (seen.has(n)) continue
    seen.add(n)
    items.push({ i: n, correct: Boolean(it.correct) })
  }
  return items
}

async function handleAttempt(ctx, req, res, url, body) {
  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  if (!topic) return sendJson(res, 400, { ok: false, error: '参数不完整' })
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    return sendJson(res, 400, { ok: false, error: '参数不完整' })
  }
  const items = normalizeAttemptItems(body.items)
  if (!items.length) return sendJson(res, 400, { ok: false, error: '参数不完整' })
  const result = await recordAttempt(ctx, topic, items)
  sendJson(res, 200, { ok: true, ...result })
}

async function handleWrong(ctx, req, res) {
  const [lib, store] = await Promise.all([readLibrary(ctx), readStats(ctx)])
  const rows = []
  for (const [topic, v] of Object.entries(store.topics)) {
    if (!isPlainObject(v)) continue
    if (!Number.isFinite(v.lastCorrect) || !Number.isFinite(v.total) || v.lastCorrect >= v.total) continue
    const card = lib.cards.find((c) => c && c.topic === topic)
    rows.push({
      topic,
      title: card && typeof card.title === 'string' ? card.title : topic,
      lastCorrect: v.lastCorrect,
      total: v.total,
      attempts: Number.isFinite(v.attempts) ? v.attempts : 0,
      best: Number.isFinite(v.best) ? v.best : 0,
      lastWrong: Array.isArray(v.lastWrong) ? v.lastWrong : [],
      at: typeof v.lastAt === 'string' ? v.lastAt : null
    })
  }
  rows.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  sendJson(res, 200, { ok: true, rows })
}

async function handleDelete(ctx, req, res, url, body) {
  const topic = typeof body.topic === 'string' ? body.topic.trim() : ''
  if (!topic) return sendJson(res, 400, { ok: false, error: '缺少知识点' })
  const { removed, statsRemoved } = await deleteTopic(ctx, topic)
  sendJson(res, 200, { ok: true, removed, statsRemoved })
}

/* ------------------------------------------------------------------ 路由 */

const ROUTES = {
  '/health': { GET: handleHealth },
  '/library': { GET: handleLibrary },
  '/card': { GET: handleCard },
  '/generate': { POST: handleGenerate },
  '/attempt': { POST: handleAttempt },
  '/wrong': { GET: handleWrong },
  '/delete': { POST: handleDelete }
}

function normalizePath(pathname) {
  let path = String(pathname || '/')
  if (path.startsWith(PREFIX)) path = path.slice(PREFIX.length)
  path = path.replace(/\/+$/, '')
  return path || '/'
}

async function dispatch(ctx, req, res) {
  let url
  try {
    url = new URL(req.url || '/', 'http://127.0.0.1')
  } catch {
    return sendJson(res, 400, { ok: false, error: '请求地址不合法' })
  }
  const path = normalizePath(url.pathname)
  const method = String(req.method || 'GET').toUpperCase()

  if (!guardHeaders(req, res)) return

  // Route/method resolution comes before payload checks: an unsupported method on a
  // known path is 405 (with Allow), not 415 — the request body was never relevant.
  const route = ROUTES[path]
  if (!route) {
    req.resume?.()
    return sendJson(res, 404, { ok: false, error: 'unknown route: ' + path })
  }
  const handler = route[method]
  if (!handler) {
    req.resume?.()
    return sendJson(res, 405, { ok: false, error: 'method not allowed' }, { allow: Object.keys(route).join(', ') })
  }

  let bodyText = ''
  if (method === 'POST') {
    if (!isJsonContentType(req.headers['content-type'])) {
      req.resume?.()
      return sendJson(res, 415, { ok: false, error: 'content-type must be application/json' })
    }
    const read = await readBody(req, MAX_BODY_BYTES)
    if (read && read.aborted) return
    if (read && read.tooLarge) return sendJson(res, 413, { ok: false, error: '请求体过大' })
    bodyText = read && typeof read.text === 'string' ? read.text : ''
  } else {
    req.resume?.()
  }

  let body = {}
  if (method === 'POST') {
    const parsed = parseJsonObject(bodyText)
    if (!parsed.ok) return sendJson(res, 400, { ok: false, error: parsed.error })
    body = parsed.value
  }
  await handler(ctx, req, res, url, body)
}

async function handleRequest(ctx, req, res) {
  try {
    await dispatch(ctx, req, res)
  } catch (e) {
    errorLog(ctx, 'review-desk: 处理请求失败：' + msgOf(e) + (e instanceof Error && e.stack ? '\n' + e.stack : ''))
    sendJson(res, 500, { ok: false, error: '服务器内部错误' })
  }
}

/* ---------------------------------------------------------------- 插件入口 */

function mark(name, payload) {
  try {
    const file = join(DATA_DIR, name)
    mkdir(dirname(file), { recursive: true })
      .then(() => writeFile(file, JSON.stringify(payload, null, 2), 'utf8'))
      .catch(() => {})
  } catch {
    /* ignore */
  }
}

export function apply(ctx) {
  try {
    mark('loaded.json', {
      at: new Date().toISOString(),
      pid: process.pid,
      port: typeof ctx?.webServer?.port === 'number' ? ctx.webServer.port : null,
      hasEffect: typeof ctx?.effect === 'function',
      hasRegister: typeof ctx?.webServer?.register === 'function'
    })
    infoLog(ctx, 'review-desk: 复习台已加载，数据目录 ' + DATA_DIR)
    const register = () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: (req, res) => handleRequest(ctx, req, res)
      })
    const off = typeof ctx.effect === 'function' ? ctx.effect(register, 'review-desk: http api') : register()
    mark('route-ok.json', { at: new Date().toISOString(), path: PREFIX })
    return off
  } catch (e) {
    mark('error.json', {
      at: new Date().toISOString(),
      message: msgOf(e),
      stack: e instanceof Error ? e.stack : '',
      keys: Object.keys(ctx || {})
    })
    throw e
  }
}
