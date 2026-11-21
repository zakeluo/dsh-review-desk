window.__ModuleLoader__.load({
  id: 'dsh-review-desk',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback } = React

    const API = '/dsh-review-desk/api'
    const INCOMPLETE = '这张卡片数据不完整，可删除后重新生成'

    const STYLE = `
/* dsh-review-desk · 青色主题 + 版式重构（卡片式布局、sticky 工具栏、字号层级、响应式） */
.rd-panel{
  --rd-cyan:#0e7490;
  --rd-cyan-bright:#06b6d4;
  --rd-cyan-strong:#155e75;
  --rd-cyan-glow:rgba(6,182,212,.22);
  --rd-cyan-tint:rgba(6,182,212,.08);
  --rd-cyan-line:rgba(6,182,212,.28);
  --rd-line:rgba(127,127,127,.16);
  --rd-fill:rgba(127,127,127,.05);
  --rd-ink:rgba(12,28,34,.88);
  --rd-muted:rgba(12,28,34,.50);
  --rd-card:rgba(255,255,255,.74);
  --rd-radius:16px;
  --rd-gap:16px;
  --rd-shadow:0 1px 2px rgba(16,42,52,.05),0 14px 34px -24px rgba(16,42,52,.45);
  position:relative;height:100%;overflow-y:auto;padding:0 0 64px;
  font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  font-size:13.5px;line-height:1.7;color:var(--rd-ink);box-sizing:border-box;
  background:
    radial-gradient(980px 340px at 8% -12%, rgba(34,211,238,.16), transparent 70%),
    radial-gradient(680px 260px at 102% -6%, rgba(6,182,212,.10), transparent 72%),
    linear-gradient(180deg, rgba(6,182,212,.04), transparent 240px);
  scrollbar-width:thin;scrollbar-color:var(--rd-cyan-line) transparent;
}
.rd-panel *{box-sizing:border-box}
.rd-panel > .rd-head{
  position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:14px;
  padding:14px clamp(14px,3.4vw,30px);
  background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(255,255,255,.78));
  backdrop-filter:blur(16px) saturate(1.15);-webkit-backdrop-filter:blur(16px) saturate(1.15);
  border-bottom:1px solid var(--rd-line);
}
.rd-panel > .rd-head::after{
  content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;
  background:linear-gradient(90deg,transparent,var(--rd-cyan-line),transparent);
}
.rd-panel > div:not(.rd-head){max-width:900px;margin:0 auto;padding:clamp(14px,3vw,26px) clamp(14px,3.4vw,30px) 0}

/* ---------- 标题层级 ---------- */
.rd-title{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;letter-spacing:-.01em;line-height:1.35}
.rd-title::before{content:"";flex:0 0 auto;width:4px;height:18px;border-radius:3px;background:linear-gradient(180deg,#67e8f9,#0e7490)}
.rd-sub{font-size:11.5px;color:var(--rd-muted);margin-top:3px;letter-spacing:.01em;font-variant-numeric:tabular-nums}
.rd-note{font-size:11.5px;color:var(--rd-muted);margin-top:18px;padding-top:12px;border-top:1px dashed var(--rd-line)}

/* ---------- 按钮 ---------- */
.rd-btn{
  appearance:none;font:inherit;font-size:12.5px;font-weight:550;cursor:pointer;
  padding:9px 14px;border-radius:10px;border:1px solid var(--rd-line);
  background:var(--rd-card);color:var(--rd-ink);
  transition:border-color .16s,background .16s,box-shadow .16s,transform .12s;
}
.rd-btn:hover{border-color:var(--rd-cyan-line);background:var(--rd-cyan-tint);color:var(--rd-cyan)}
.rd-btn:active{transform:translateY(1px)}
.rd-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.rd-btn.primary{
  border:0;color:#fff;font-weight:600;letter-spacing:.01em;
  background:linear-gradient(135deg,#0891b2,#155e75);
  box-shadow:0 10px 24px -14px rgba(8,145,178,.85);
  padding:12px 22px;font-size:13px;
}
.rd-btn.primary:hover{background:linear-gradient(135deg,#06b6d4,#0e7490);color:#fff;box-shadow:0 12px 26px -12px rgba(8,145,178,.9)}
.rd-btn.ghost{background:transparent;border-color:var(--rd-line);color:var(--rd-muted);padding:8px 12px}
.rd-btn.ghost:hover{color:var(--rd-cyan);border-color:var(--rd-cyan-line);background:var(--rd-cyan-tint)}

/* ---------- 首页 hero ---------- */
.rd-card > .rd-head{
  position:sticky;top:0;z-index:25;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:10px 0 12px;margin-bottom:8px;
  background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.72));
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid var(--rd-line);
}
.rd-search{
  position:relative;display:flex;gap:10px;align-items:stretch;margin-top:var(--rd-gap);
  padding:44px clamp(16px,2.6vw,22px) 20px;border-radius:20px;
  border:1px solid var(--rd-cyan-line);box-shadow:var(--rd-shadow);
  background:linear-gradient(160deg,rgba(255,255,255,.92),rgba(236,254,255,.62) 58%,rgba(255,255,255,.86));
}
.rd-search::before{
  content:"开始一个新的知识点";position:absolute;left:clamp(16px,2.6vw,22px);top:16px;
  font-size:11.5px;font-weight:650;letter-spacing:.12em;color:var(--rd-cyan);
}
.rd-search::after{
  content:"";position:absolute;left:clamp(16px,2.6vw,22px);top:36px;width:16px;height:2px;border-radius:2px;
  background:linear-gradient(90deg,#22d3ee,var(--rd-cyan));
}
.rd-card{display:flex;flex-direction:column;gap:2px}
.rd-card > .rd-sub{margin-bottom:4px}
.rd-input{
  flex:1;min-width:0;font:inherit;font-size:14px;padding:13px 16px;border-radius:12px;
  border:1px solid var(--rd-line);background:rgba(255,255,255,.92);color:var(--rd-ink);
  transition:border-color .16s,box-shadow .16s,background .16s;
}
.rd-input::placeholder{color:var(--rd-muted)}
.rd-input:focus{outline:none;border-color:var(--rd-cyan-bright);background:#fff;box-shadow:0 0 0 4px var(--rd-cyan-glow)}
.rd-quick{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.rd-chip{
  appearance:none;font:inherit;font-size:12.5px;cursor:pointer;
  padding:7px 14px;border-radius:999px;border:1px solid var(--rd-cyan-line);
  background:rgba(255,255,255,.7);color:var(--rd-cyan);
  transition:transform .14s,border-color .16s,background .16s,box-shadow .16s;
}
.rd-chip:hover{border-color:var(--rd-cyan-bright);background:var(--rd-cyan-tint);transform:translateY(-1px);box-shadow:0 6px 16px -12px rgba(8,145,178,.9)}
.rd-chip:active{transform:translateY(0)}
.rd-chip:disabled{opacity:.45;cursor:not-allowed;transform:none}

/* ---------- 区块卡片 ---------- */
.rd-sec{
  margin-top:var(--rd-gap);padding:18px clamp(16px,2.6vw,22px);
  border-radius:var(--rd-radius);border:1px solid var(--rd-line);
  background:var(--rd-card);box-shadow:var(--rd-shadow);
}
.rd-label{
  display:flex;align-items:center;gap:9px;margin-bottom:12px;
  font-size:11.5px;font-weight:650;letter-spacing:.12em;text-transform:uppercase;
  color:var(--rd-cyan);
}
.rd-label::before{content:"";width:16px;height:2px;border-radius:2px;background:linear-gradient(90deg,#22d3ee,var(--rd-cyan))}
.rd-block{
  font-size:13.5px;line-height:1.9;padding:13px 15px;border-radius:12px;
  background:var(--rd-cyan-tint);border-left:2px solid var(--rd-cyan-line);
  white-space:pre-wrap;word-break:break-word;
}

/* ---------- 易混淆 ---------- */
.rd-conf{
  margin-top:10px;padding:13px 15px;border-radius:12px;
  border:1px solid var(--rd-line);background:rgba(255,255,255,.6);
  border-left:3px solid var(--rd-cyan-line);
  transition:border-color .16s,box-shadow .16s;
}
.rd-conf:hover{border-color:var(--rd-cyan-line);box-shadow:0 10px 24px -20px rgba(8,145,178,.9)}
.rd-conf:first-of-type{margin-top:0}
.rd-conf b{font-size:13.5px;color:var(--rd-cyan)}
.rd-conf p{margin:6px 0 0;font-size:13px;line-height:1.8}
.rd-ex{font-size:12px;color:var(--rd-muted);margin-top:6px;padding-left:10px;border-left:2px dotted var(--rd-line)}

/* ---------- 数学公式（原生 MathML Core，无需字体/依赖） ---------- */
.rd-math{font-variant-numeric:normal;letter-spacing:0}
.rd-math-inline{display:inline-block;vertical-align:-.16em;margin:0 .1em;line-height:1.15}
.rd-math-inline > math{font-size:1.03em}
.rd-math-block{
  display:flex;justify-content:center;align-items:center;
  margin:10px 0;padding:12px 14px;border-radius:10px;
  background:rgba(255,255,255,.62);border:1px solid var(--rd-line);
  overflow-x:auto;overflow-y:hidden;
}
.rd-math-block > math{font-size:1.18em;margin:0 auto}
.rd-math math{color:inherit}
.rd-math-block > math[display="block"]{display:block}

/* ---------- 题目 ---------- */
.rd-q{
  margin-bottom:12px;padding:16px clamp(14px,2.4vw,18px);border-radius:14px;
  border:1px solid var(--rd-line);background:rgba(255,255,255,.58);
  transition:border-color .18s,box-shadow .18s,background .18s;
}
.rd-q:hover{border-color:var(--rd-cyan-line);background:rgba(255,255,255,.82);box-shadow:0 12px 30px -26px rgba(8,145,178,.95)}
.rd-stem{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;font-weight:600;line-height:1.7;margin-bottom:12px}
.rd-num{
  flex:0 0 auto;width:22px;height:22px;margin-top:1px;border-radius:7px;
  display:flex;align-items:center;justify-content:center;
  font-size:11.5px;font-weight:650;color:#fff;font-variant-numeric:tabular-nums;
  background:linear-gradient(135deg,#22d3ee,#0e7490);box-shadow:0 4px 10px -6px rgba(8,145,178,.9);
}
.rd-opt{
  display:flex;align-items:center;gap:10px;width:100%;margin-bottom:6px;
  padding:10px 12px;border-radius:11px;border:1px solid transparent;
  background:transparent;color:inherit;font:inherit;font-size:13px;text-align:left;cursor:pointer;
  transition:background .16s,border-color .16s,box-shadow .16s;
}
.rd-opt:last-of-type{margin-bottom:0}
.rd-opt:hover{background:var(--rd-fill);border-color:var(--rd-line)}
.rd-opt:disabled{cursor:default}
.rd-key{
  flex:0 0 auto;width:20px;height:20px;border-radius:6px;
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:600;color:var(--rd-muted);
  border:1px solid var(--rd-line);background:rgba(127,127,127,.05);
  transition:background .16s,color .16s,border-color .16s;
}
.rd-opt-text{flex:1;min-width:0;line-height:1.6}
.rd-dot{
  order:9;margin-left:auto;flex:0 0 auto;width:18px;height:18px;border-radius:50%;
  border:1.5px solid var(--rd-line);display:flex;align-items:center;justify-content:center;
  font-size:10.5px;color:transparent;
  transition:background .16s,border-color .16s,color .16s,box-shadow .16s;
}
.rd-opt.sel{background:var(--rd-cyan-tint);border-color:var(--rd-cyan-bright);box-shadow:0 0 0 3px rgba(6,182,212,.10)}
.rd-opt.sel .rd-key{background:linear-gradient(135deg,#22d3ee,#0891b2);border-color:transparent;color:#fff}
.rd-opt.sel .rd-dot{border-color:var(--rd-cyan-bright);color:var(--rd-cyan-bright);background:rgba(6,182,212,.12);box-shadow:0 0 10px var(--rd-cyan-glow)}
.rd-opt.ok{background:rgba(16,185,129,.09);border-color:rgba(16,185,129,.45)}
.rd-opt.ok .rd-key{background:rgba(16,185,129,.16);border-color:rgba(16,185,129,.45);color:#047857}
.rd-opt.ok .rd-dot{border-color:transparent;background:#10b981;color:#fff}
.rd-opt.bad{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.38)}
.rd-opt.bad .rd-key{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.38);color:#b91c1c}
.rd-opt.bad .rd-dot{border-color:transparent;background:#ef4444;color:#fff}
.rd-exp{
  margin-top:10px;padding:11px 13px;border-radius:11px;font-size:12.5px;line-height:1.8;
  background:rgba(127,127,127,.06);border:1px dashed var(--rd-line);color:var(--rd-ink);
}

/* ---------- 评分 ---------- */
.rd-score{
  display:flex;align-items:center;gap:16px;margin-top:var(--rd-gap);
  padding:16px 18px;border-radius:var(--rd-radius);
  border:1px solid var(--rd-cyan-line);box-shadow:var(--rd-shadow);
  background:linear-gradient(135deg,rgba(6,182,212,.15),rgba(16,185,129,.10));
}
.rd-score.bad{border-color:rgba(239,68,68,.34);background:linear-gradient(135deg,rgba(239,68,68,.10),rgba(245,158,11,.07))}
.rd-score-main{display:flex;align-items:baseline;gap:2px;flex:0 0 auto}
.rd-score-num{font-size:32px;font-weight:750;line-height:1;letter-spacing:-.03em;color:var(--rd-cyan);font-variant-numeric:tabular-nums}
.rd-score.bad .rd-score-num{color:#b45309}
.rd-score-unit{font-size:11.5px;color:var(--rd-muted)}
.rd-score-side{flex:1;min-width:0}
.rd-score-msg{font-size:13px;font-weight:600}
.rd-score-bar{height:6px;border-radius:999px;background:rgba(127,127,127,.18);margin-top:8px;overflow:hidden}
.rd-score-bar > i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#22d3ee,#0891b2)}
.rd-score.bad .rd-score-bar > i{background:linear-gradient(90deg,#fbbf24,#f97316)}

/* ---------- 列表 ---------- */
.rd-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(224px,1fr));gap:10px}
.rd-item{
  display:flex;flex-direction:column;gap:7px;align-items:flex-start;width:100%;
  padding:14px 15px;border-radius:14px;border:1px solid var(--rd-line);
  background:var(--rd-card);color:inherit;font:inherit;text-align:left;cursor:pointer;
  transition:transform .16s,border-color .16s,background .16s,box-shadow .16s;
}
.rd-item:hover{transform:translateY(-2px);border-color:var(--rd-cyan-line);background:var(--rd-cyan-tint);box-shadow:0 16px 30px -24px rgba(8,145,178,.95)}
.rd-item:disabled{opacity:.55;cursor:default;transform:none}
.rd-item-main{display:block;width:100%}
.rd-item-name{display:block;font-size:13.5px;font-weight:600;line-height:1.45;word-break:break-word}
.rd-item-meta{display:block;font-size:11.5px;color:var(--rd-muted);margin-top:3px;font-variant-numeric:tabular-nums}
.rd-tag{
  display:inline-flex;align-items:center;gap:4px;margin-top:2px;
  font-size:11px;padding:2px 9px;border-radius:999px;
  border:1px solid var(--rd-cyan-line);color:var(--rd-cyan);background:rgba(255,255,255,.6);
  font-variant-numeric:tabular-nums;white-space:nowrap;
}

/* ---------- 提示 / 空态 / 加载 ---------- */
.rd-warn{
  display:flex;align-items:flex-start;gap:10px;justify-content:space-between;
  margin-top:var(--rd-gap);padding:12px 14px;border-radius:12px;font-size:12.5px;
  background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.32);
}
.rd-warn-text{flex:1;min-width:0;word-break:break-word}
.rd-warn .rd-btn{flex:0 0 auto}
.rd-empty{
  display:flex;flex-direction:column;align-items:center;gap:8px;
  padding:30px 18px;border:1px dashed var(--rd-line);border-radius:14px;
  color:var(--rd-muted);font-size:12.5px;text-align:center;line-height:1.7;
  background:rgba(127,127,127,.03);
}
.rd-empty::before{
  content:"";width:34px;height:34px;border-radius:50%;
  background:radial-gradient(circle at 50% 45%,var(--rd-cyan-tint),transparent 70%);
  border:1px dashed var(--rd-cyan-line);
}
.rd-loading{padding:34px 10px;text-align:center}
.rd-spin{
  width:30px;height:30px;border-radius:50%;margin:0 auto 14px;
  border:2.5px solid var(--rd-cyan-tint);border-top-color:var(--rd-cyan-bright);border-right-color:var(--rd-cyan);
  animation:rdspin .8s linear infinite;box-shadow:0 0 18px var(--rd-cyan-glow);
}
@keyframes rdspin{to{transform:rotate(360deg)}}
.rd-loading .rd-sub{max-width:420px;margin:8px auto 0}
.rd-row{display:flex;align-items:center;gap:7px;padding:0 4px}
.rd-row svg{width:16px;height:16px;flex:0 0 auto}

/* ---------- 来源 ---------- */
.rd-src{margin-top:var(--rd-gap);padding:14px 16px;border-radius:var(--rd-radius);border:1px solid var(--rd-line);background:var(--rd-fill);font-size:11.5px;color:var(--rd-muted);line-height:1.75}
.rd-src-list{display:flex;flex-direction:column;gap:3px;margin-top:4px}
.rd-src-link{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-src a{color:var(--rd-cyan);text-decoration:none;border-bottom:1px dotted var(--rd-cyan-line)}
.rd-src a:hover{border-bottom-color:var(--rd-cyan-bright)}

/* ---------- 底部操作 ---------- */
.rd-foot{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.rd-submit{width:100%;margin-top:16px;box-shadow:0 14px 30px -18px rgba(8,145,178,.85)}
.rd-panel ::selection{background:rgba(34,211,238,.28)}

@media (max-width:560px){
  .rd-search{flex-direction:column}
  .rd-search .rd-btn{width:100%}
  .rd-title{font-size:16.5px}
  .rd-sec{padding:14px}
}

/* ---------- 暗色 ---------- */
@media (prefers-color-scheme: dark){
  .rd-panel{
    --rd-cyan:#22d3ee;--rd-cyan-bright:#67e8f9;--rd-cyan-strong:#a5f3fc;
    --rd-cyan-glow:rgba(34,211,238,.26);--rd-cyan-tint:rgba(34,211,238,.10);--rd-cyan-line:rgba(34,211,238,.30);
    --rd-line:rgba(160,200,210,.16);--rd-fill:rgba(160,200,210,.06);
    --rd-ink:rgba(232,246,250,.92);--rd-muted:rgba(200,228,235,.58);
    --rd-card:rgba(9,26,32,.62);
    --rd-shadow:0 1px 2px rgba(0,0,0,.35),0 18px 40px -28px rgba(0,0,0,.9);
    background:
      radial-gradient(980px 340px at 8% -12%, rgba(34,211,238,.13), transparent 70%),
      radial-gradient(680px 260px at 102% -6%, rgba(6,182,212,.10), transparent 72%),
      linear-gradient(180deg, rgba(34,211,238,.05), transparent 240px);
  }
  .rd-panel > .rd-head{background:linear-gradient(180deg,rgba(10,22,28,.92),rgba(10,22,28,.72))}
  .rd-search{background:linear-gradient(160deg,rgba(13,34,42,.9),rgba(9,26,32,.78) 58%,rgba(13,34,42,.86))}
  .rd-card > .rd-head{background:linear-gradient(180deg,rgba(10,22,28,.94),rgba(10,22,28,.7))}
  .rd-input{background:rgba(8,20,26,.8);color:var(--rd-ink)}
  .rd-input:focus{background:rgba(8,20,26,.95)}
  .rd-chip{background:rgba(34,211,238,.06)}
  .rd-tag{background:rgba(34,211,238,.08)}
  .rd-block{border-left-color:var(--rd-cyan-line)}
  .rd-conf{background:rgba(160,200,210,.04)}
  .rd-math-block{background:rgba(160,200,210,.05)}
  .rd-q{background:rgba(160,200,210,.04)}
  .rd-q:hover{background:rgba(160,200,210,.07)}
  .rd-opt.ok .rd-key{color:#6ee7b7}
  .rd-opt.bad .rd-key{color:#fca5a5}
  .rd-score-num{color:var(--rd-cyan)}
  .rd-score.bad .rd-score-num{color:#fbbf24}
  .rd-empty{background:rgba(160,200,210,.03)}
}
`

    const CSS_SELECTOR = 'style[data-plugin-css="dsh-review-desk/ui"]'

    function ensureStyle() {
      if (document.querySelector(CSS_SELECTOR)) return
      const el = document.createElement('style')
      el.dataset.plugin = 'dsh-review-desk'
      el.dataset.pluginCss = 'dsh-review-desk/ui'
      el.textContent = STYLE
      document.head.appendChild(el)
    }

    /** 宿主未给出 error 文案时，至少把 403/413/415/504 这类平台错误翻成可读中文。 */
    const STATUS_TEXT = {
      403: '没有权限执行该操作（403）',
      413: '请求内容过大（413）',
      415: '请求格式不支持（415）',
      504: '服务响应超时（504）'
    }

    function errorText(e) {
      if (e && typeof e.message === 'string' && e.message) return e.message
      return '请求失败，请稍后重试'
    }

    /** 主动取消与超时都是 AbortError；据此静默处理用户取消，避免误报错误条。 */
    function isCanceled(e) {
      return !!e && e.name === 'AbortError'
    }

    async function api(path, opts) {
      const options = opts || {}
      const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 15000
      const ctl = typeof AbortController === 'function' ? new AbortController() : null
      const outer = options.signal || null
      let timedOut = false
      const timer = ctl && timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            ctl.abort()
          }, timeoutMs)
        : null
      const onOuterAbort = () => {
        if (ctl) ctl.abort()
      }
      if (ctl && outer) {
        if (outer.aborted) ctl.abort()
        else if (typeof outer.addEventListener === 'function') outer.addEventListener('abort', onOuterAbort)
      }
      const { timeoutMs: _timeoutMs, signal: _signal, ...init } = options
      try {
        const res = await fetch(API + path, {
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          ...(ctl ? { signal: ctl.signal } : {}),
          ...init
        })
        let body = null
        try {
          body = await res.json()
        } catch {
          body = null
        }
        if (!res.ok || (body && body.ok === false)) {
          throw new Error((body && body.error) || STATUS_TEXT[res.status] || 'HTTP ' + res.status)
        }
        return body || {}
      } catch (e) {
        if (e && e.name === 'AbortError') {
          if (timedOut) throw new Error('请求超时，请稍后重试')
          const canceled = new Error('请求已取消')
          canceled.name = 'AbortError'
          throw canceled
        }
        throw e
      } finally {
        if (timer) clearTimeout(timer)
        if (ctl && outer && typeof outer.removeEventListener === 'function') {
          outer.removeEventListener('abort', onOuterAbort)
        }
      }
    }

    const EXAMPLES = ['牛顿环', '亲电加成', '拉格朗日中值定理', '分子轨道理论', '熵增原理', '傅里叶变换']

    function asText(v, max) {
      if (typeof v !== 'string') return ''
      const s = v.trim()
      if (!max || s.length <= max) return s
      return s.slice(0, max) + '…'
    }

    /**
     * 响应字段守卫（D5）：/generate 与 /card 的 card 必须至少含非空 topic 与 1 道结构完整的题，
     * 否则返回 { ok:false, reason } 让界面显示「数据不完整」，而不是渲染期抛错。
     * host 侧约定：judge 的 options 固定为 ['正确','错误']、answer 为布尔；single 的 answer 为下标。
     */
    function normalizeCard(raw) {
      const bad = { ok: false, card: null, reason: INCOMPLETE }
      if (!raw || typeof raw !== 'object') return bad
      const topic = asText(raw.topic, 120)
      if (!topic) return bad
      if (!Array.isArray(raw.questions) || raw.questions.length === 0) return bad

      const questions = []
      for (const q of raw.questions) {
        if (!q || typeof q !== 'object') return bad
        const stem = asText(q.stem, 600)
        if (!stem) return bad
        const type = q.type === 'judge' ? 'judge' : 'single'
        let options
        if (type === 'judge' && (!Array.isArray(q.options) || q.options.length === 0)) {
          options = ['正确', '错误']
        } else {
          if (!Array.isArray(q.options) || q.options.length < 2) return bad
          if (!q.options.every((o) => typeof o === 'string' && o.trim())) return bad
          options = q.options.map((o) => o.trim()).slice(0, 6)
        }
        let answer
        if (type === 'judge') {
          if (typeof q.answer === 'boolean') answer = q.answer
          else if (q.answer === 0 || q.answer === '0') answer = true
          else if (q.answer === '正确') answer = true
          else if (q.answer === '错误') answer = false
          else answer = true
        } else {
          answer = Number.isInteger(q.answer) && q.answer >= 0 && q.answer < options.length ? q.answer : 0
        }
        questions.push({
          type,
          stem,
          options,
          answer,
          explanation: asText(q.explanation, 1200)
        })
      }

      const confusions = Array.isArray(raw.confusions)
        ? raw.confusions
            .filter((c) => c && typeof c.name === 'string' && c.name.trim() && typeof c.difference === 'string')
            .slice(0, 5)
            .map((c) => ({
              name: asText(c.name, 120),
              difference: asText(c.difference, 600),
              example: asText(c.example, 600)
            }))
        : []

      const sources = Array.isArray(raw.sources)
        ? raw.sources
            .filter((s) => s && typeof s.title === 'string' && s.title.trim())
            .slice(0, 8)
            .map((s) => ({ title: asText(s.title, 300), url: typeof s.url === 'string' ? s.url.trim() : '' }))
        : []

      return {
        ok: true,
        card: {
          topic,
          title: asText(raw.title, 300) || topic,
          model: asText(raw.model, 120),
          concept: asText(raw.concept, 4000) || '（暂无核心概念）',
          definition: asText(raw.definition, 4000) || '（暂无定义）',
          confusions,
          questions,
          sources,
          grounded: !!raw.grounded
        }
      }
    }

    /** judge 的答案是布尔值（选项固定为 正确/错误），single 是选项下标；两者都严格相等比较。 */
    function isPickedCorrect(q, picked) {
      return picked === q.answer
    }

    function safeHref(url) {
      const u = asText(url, 2000)
      return /^https?:\/\//i.test(u) ? u : ''
    }

    function Sources({ sources }) {
      const list = Array.isArray(sources) ? sources.filter((s) => s && typeof s.title === 'string' && s.title.trim()).slice(0, 6) : []
      if (!list.length) return h('div', { className: 'rd-src' }, '本次未检索到网页资料')
      return h(
        'div',
        { className: 'rd-src' },
        h('div', null, '检索来源：'),
        h(
          'div',
          { className: 'rd-src-list' },
          list.map((s, i) => {
            const href = safeHref(s.url)
            if (!href) {
              return h('span', { key: i, className: 'rd-src-link', title: s.title }, s.title)
            }
            return h(
              'a',
              { key: i, className: 'rd-src-link', href, target: '_blank', rel: 'noopener noreferrer', title: s.title },
              s.title
            )
          })
        )
      )
    }

    /* --------------------------------------------- LaTeX → MathML 渲染 */

    // 不引入 KaTeX/MathJax 等依赖：把 LaTeX 子集转成浏览器原生 MathML Core（Chromium 109+ 内置渲染，
    // 无需 Web 字体），因此插件仍是零依赖、可离线运行。
    const TEX_GREEK = {
      alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε',
      zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ',
      mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ',
      sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ',
      psi: 'ψ', omega: 'ω',
      Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
      Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
    }

    const TEX_SYMBOL = {
      cdot: '⋅', cdots: '⋯', ldots: '…', dots: '…', times: '×', div: '÷', pm: '±', mp: '∓',
      le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡',
      sim: '∼', simeq: '≃', propto: '∝', infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ',
      ell: 'ℓ', to: '→', rightarrow: '→', leftarrow: '←', uparrow: '↑', downarrow: '↓',
      Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⇔', implies: '⟹',
      mapsto: '↦', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃',
      supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅', varnothing: '∅',
      forall: '∀', exists: '∃', nexists: '∄', neg: '¬', lnot: '¬', land: '∧', wedge: '∧',
      lor: '∨', vee: '∨', oplus: '⊕', otimes: '⊗', circ: '∘', ast: '∗', star: '⋆',
      degree: '°', prime: '′', therefore: '∴', because: '∵', angle: '∠', perp: '⊥',
      parallel: '∥', mid: '∣', square: '□',
      lbrace: '{', rbrace: '}', vert: '|', Vert: '‖', lvert: '|', rvert: '|', lVert: '‖',
      rVert: '‖', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉'
    }

    const TEX_BIGOP = {
      sum: { ch: '∑', movable: true },
      prod: { ch: '∏', movable: true },
      coprod: { ch: '∐', movable: true },
      int: { ch: '∫', movable: false },
      iint: { ch: '∬', movable: false },
      iiint: { ch: '∭', movable: false },
      oint: { ch: '∮', movable: false },
      bigcup: { ch: '⋃', movable: true },
      bigcap: { ch: '⋂', movable: true },
      bigoplus: { ch: '⨁', movable: true }
    }

    const TEX_FUNC = {
      sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
      arcsin: 'arcsin', arccos: 'arccos', arctan: 'arctan',
      sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
      log: 'log', ln: 'ln', lg: 'lg', exp: 'exp', lim: 'lim',
      limsup: 'lim sup', liminf: 'lim inf', max: 'max', min: 'min', sup: 'sup',
      inf: 'inf', det: 'det', dim: 'dim', ker: 'ker', deg: 'deg', gcd: 'gcd',
      mod: 'mod', arg: 'arg', Pr: 'Pr'
    }

    const TEX_LIMIT_FUNC = /^(lim|limsup|liminf|max|min|sup|inf)$/

    const TEX_DELIM = {
      '(': '(', ')': ')', '[': '[', ']': ']', '|': '|', '/': '/', '.': '',
      lvert: '|', rvert: '|', lVert: '‖', rVert: '‖', vert: '|', Vert: '‖',
      lbrace: '{', rbrace: '}', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋',
      lceil: '⌈', rceil: '⌉'
    }

    const TEX_ACCENT = {
      bar: '¯', overline: '¯', vec: '→', hat: 'ˆ', widehat: 'ˆ',
      tilde: '˜', widetilde: '˜', dot: '˙', ddot: '¨', check: 'ˇ', breve: '˘'
    }

    const TEX_ESCAPED = { '{': '{', '}': '}', '%': '%', '&': '&', '$': '$', '#': '#', _: '_', '|': '‖' }

    const TEX_SPACE = {
      ',': '0.167em', ':': '0.222em', ';': '0.278em', ' ': '0.25em', '!': '-0.167em',
      quad: '1em', qquad: '2em', enspace: '0.5em', thinspace: '0.167em'
    }

    const TEX_FENCE = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'] }

    function texEscape(t) {
      return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    /** 解析一段 LaTeX，返回 MathML 片段（不含 <math> 外壳）。未知命令降级为文本，不抛错。 */
    function texToMathMLContent(tex) {
      const src = String(tex == null ? '' : tex)
      let pos = 0

      const skip = () => {
        while (pos < src.length && /\s/.test(src[pos])) pos++
      }

      const readName = () => {
        let name = ''
        if (/[a-zA-Z]/.test(src[pos] || '')) {
          while (pos < src.length && /[a-zA-Z]/.test(src[pos])) name += src[pos++]
        } else if (pos < src.length) {
          name = src[pos++]
        }
        return name
      }

      const mrow = (parts) => (parts.length === 0 ? '<mrow></mrow>' : parts.length === 1 ? parts[0] : '<mrow>' + parts.join('') + '</mrow>')

      const readNumber = () => {
        let n = ''
        while (pos < src.length && /[0-9.]/.test(src[pos])) n += src[pos++]
        return '<mn>' + texEscape(n) + '</mn>'
      }

      const readRawGroup = () => {
        skip()
        if (src[pos] !== '{') {
          const ch = src[pos] || ''
          pos++
          return ch
        }
        pos++
        let depth = 1
        let out = ''
        while (pos < src.length) {
          const ch = src[pos]
          if (ch === '\\') {
            out += ch
            pos++
            if (pos < src.length) {
              out += src[pos]
              pos++
            }
            continue
          }
          if (ch === '{') {
            depth++
            out += ch
            pos++
            continue
          }
          if (ch === '}') {
            depth--
            pos++
            if (depth === 0) break
            out += ch
            continue
          }
          out += ch
          pos++
        }
        return out
      }

      const readDelim = () => {
        skip()
        if (src[pos] === '\\') {
          pos++
          return readName()
        }
        if (pos >= src.length) return '.'
        return src[pos++]
      }

      const operatorNode = (ch) => {
        const special = { '-': '−', '*': '∗', "'": '′' }
        return '<mo>' + texEscape(special[ch] != null ? special[ch] : ch) + '</mo>'
      }

      function parseSeq(isStop) {
        const out = []
        for (;;) {
          skip()
          if (pos >= src.length) break
          if (isStop && isStop()) break
          const ch = src[pos]
          if (ch === '}' || ch === '&') break
          if (ch === '\\' && src[pos + 1] === '\\') {
            pos += 2
            out.push('<mspace linebreak="newline"/>')
            continue
          }
          out.push(parseScripted())
        }
        return out
      }

      function parseArg() {
        skip()
        if (pos >= src.length) return '<mrow></mrow>'
        if (src[pos] === '{') {
          pos++
          const parts = parseSeq(() => false)
          if (src[pos] === '}') pos++
          return mrow(parts)
        }
        return parseAtom().mml
      }

      function parseScripted() {
        const base = parseAtom()
        let sub = null
        let sup = null
        for (;;) {
          skip()
          if (src[pos] === '^') {
            pos++
            sup = parseArg()
          } else if (src[pos] === '_') {
            pos++
            sub = parseArg()
          } else break
        }
        if (sub == null && sup == null) return base.mml
        const limits = !!base.limits
        if (sub != null && sup != null) {
          return limits
            ? '<munderover>' + base.mml + sub + sup + '</munderover>'
            : '<msubsup>' + base.mml + sub + sup + '</msubsup>'
        }
        if (sub != null) return limits ? '<munder>' + base.mml + sub + '</munder>' : '<msub>' + base.mml + sub + '</msub>'
        return limits ? '<mover>' + base.mml + sup + '</mover>' : '<msup>' + base.mml + sup + '</msup>'
      }

      function parseCommand() {
        pos++ // 反斜杠
        const name = readName()

        if (TEX_GREEK[name]) return { mml: '<mi>' + texEscape(TEX_GREEK[name]) + '</mi>' }
        if (TEX_SYMBOL[name]) {
          const ch = TEX_SYMBOL[name]
          const isLetter = /[\p{L}]/u.test(ch)
          return { mml: (isLetter ? '<mi>' : '<mo>') + texEscape(ch) + (isLetter ? '</mi>' : '</mo>') }
        }
        if (TEX_BIGOP[name]) {
          const b = TEX_BIGOP[name]
          return {
            mml: '<mo largeop="true"' + (b.movable ? ' movablelimits="true"' : '') + '>' + texEscape(b.ch) + '</mo>',
            limits: b.movable
          }
        }
        if (TEX_FUNC[name]) {
          return { mml: '<mi mathvariant="normal">' + texEscape(TEX_FUNC[name]) + '</mi>', limits: TEX_LIMIT_FUNC.test(name) }
        }
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          const a = parseArg()
          const b = parseArg()
          return { mml: '<mfrac>' + a + b + '</mfrac>' }
        }
        if (name === 'sqrt') {
          skip()
          let index = null
          if (src[pos] === '[') {
            pos++
            const parts = parseSeq(() => src[pos] === ']')
            if (src[pos] === ']') pos++
            index = mrow(parts)
          }
          const body = parseArg()
          return { mml: index ? '<mroot>' + body + index + '</mroot>' : '<msqrt>' + body + '</msqrt>' }
        }
        if (name === 'text' || name === 'textrm' || name === 'mbox') return { mml: '<mtext>' + texEscape(readRawGroup()) + '</mtext>' }
        if (name === 'mathrm' || name === 'operatorname' || name === 'mathsf' || name === 'mathtt') {
          return { mml: '<mstyle mathvariant="normal">' + parseArg() + '</mstyle>' }
        }
        if (name === 'mathbf' || name === 'boldsymbol') return { mml: '<mstyle mathvariant="bold">' + parseArg() + '</mstyle>' }
        if (name === 'mathit') return { mml: '<mstyle mathvariant="italic">' + parseArg() + '</mstyle>' }
        if (name === 'mathcal') return { mml: '<mstyle mathvariant="script">' + parseArg() + '</mstyle>' }
        if (name === 'mathbb') {
          const DOUBLE = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ' }
          const raw = readRawGroup()
          return { mml: '<mi>' + texEscape(raw.replace(/[A-Za-z]/g, (c) => DOUBLE[c] || c)) + '</mi>' }
        }
        if (TEX_ACCENT[name]) {
          return { mml: '<mover accent="true">' + parseArg() + '<mo>' + texEscape(TEX_ACCENT[name]) + '</mo></mover>' }
        }
        if (TEX_SPACE[name] != null) return { mml: '<mspace width="' + TEX_SPACE[name] + '"/>' }
        if (TEX_ESCAPED[name] != null) return { mml: '<mo>' + texEscape(TEX_ESCAPED[name]) + '</mo>' }
        if (name === 'left') {
          const openCh = TEX_DELIM[readDelim()]
          const start = pos
          let depth = 0
          while (pos < src.length) {
            if (src.startsWith('\\left', pos)) {
              depth++
              pos += 5
              continue
            }
            if (src.startsWith('\\right', pos)) {
              if (depth === 0) break
              depth--
              pos += 6
              continue
            }
            pos++
          }
          const innerTex = src.slice(start, pos)
          if (src.startsWith('\\right', pos)) pos += 6
          const closeCh = TEX_DELIM[readDelim()]
          const parts = []
          if (openCh) parts.push('<mo fence="true" stretchy="true">' + texEscape(openCh) + '</mo>')
          parts.push(texToMathMLContent(innerTex).mml)
          if (closeCh) parts.push('<mo fence="true" stretchy="true">' + texEscape(closeCh) + '</mo>')
          return { mml: mrow(parts) }
        }
        if (name === 'right' || name === 'middle') {
          const ch = TEX_DELIM[readDelim()]
          return { mml: ch ? '<mo fence="true">' + texEscape(ch) + '</mo>' : '<mrow></mrow>' }
        }
        if (name === 'big' || name === 'Big' || name === 'bigg' || name === 'Bigg') {
          const ch = TEX_DELIM[readDelim()]
          return { mml: ch ? '<mo fence="true" stretchy="true">' + texEscape(ch) + '</mo>' : '<mrow></mrow>' }
        }
        if (name === 'begin') {
          const env = readRawGroup()
          const endTag = '\\end{' + env + '}'
          const end = src.indexOf(endTag, pos)
          const bodyTex = end >= 0 ? src.slice(pos, end) : src.slice(pos)
          pos = end >= 0 ? end + endTag.length : src.length
          const rows = bodyTex.split(/\\\\/)
          const tableRows = rows
            .map((row) => '<mtr>' + row.split('&').map((cell) => '<mtd>' + texToMathMLContent(cell).mml + '</mtd>').join('') + '</mtr>')
            .join('')
          const table = '<mtable>' + tableRows + '</mtable>'
          if (env === 'cases') return { mml: '<mrow><mo fence="true" stretchy="true">{</mo>' + table + '</mrow>' }
          const fence = TEX_FENCE[env]
          if (!fence) return { mml: table }
          return {
            mml:
              '<mrow><mo fence="true" stretchy="true">' + texEscape(fence[0]) + '</mo>' +
              table +
              '<mo fence="true" stretchy="true">' + texEscape(fence[1]) + '</mo></mrow>'
          }
        }
        if (name === 'end') {
          readRawGroup()
          return { mml: '' }
        }
        if (name === 'not') {
          const inner = parseAtom()
          return { mml: '<menclose notation="updiagonalstrike">' + inner.mml + '</menclose>' }
        }
        if (/^(limits|nolimits|displaystyle|textstyle|scriptstyle|scriptscriptstyle)$/.test(name)) return { mml: '' }
        return { mml: '<mtext>' + texEscape('\\' + name) + '</mtext>' }
      }

      function parseAtom() {
        skip()
        if (pos >= src.length) return { mml: '<mrow></mrow>' }
        const ch = src[pos]
        if (ch === '{') {
          pos++
          const parts = parseSeq(() => false)
          if (src[pos] === '}') pos++
          return { mml: mrow(parts) }
        }
        if (ch === '\\') return parseCommand()
        if (/[0-9]/.test(ch)) return { mml: readNumber() }
        if (/[a-zA-Z]/.test(ch)) {
          const start = pos
          let run = ''
          while (pos < src.length && /[a-zA-Z]/.test(src[pos])) run += src[pos++]
          if (TEX_FUNC[run]) return { mml: '<mi mathvariant="normal">' + texEscape(TEX_FUNC[run]) + '</mi>', limits: TEX_LIMIT_FUNC.test(run) }
          pos = start + 1
          return { mml: '<mi>' + texEscape(src[start]) + '</mi>' }
        }
        pos++
        return { mml: operatorNode(ch) }
      }

      const parts = parseSeq(() => false)
      return { mml: mrow(parts), rest: src.slice(pos) }
    }

    function texToMathML(tex, display) {
      if (typeof tex !== 'string' || tex.trim() === '') return ''
      try {
        const out = texToMathMLContent(tex)
        return (
          '<math xmlns="http://www.w3.org/1998/Math/MathML" display="' + (display ? 'block' : 'inline') + '">' + out.mml + '</math>'
        )
      } catch (e) {
        return ''
      }
    }

    /** 把文本切成 文本 / 行内公式 / 独立公式；支持 $…$、$$…$$、\(…\)、\[…\]。 */
    function splitMathText(text) {
      const s = String(text == null ? '' : text)
      const out = []
      let buf = ''
      let i = 0
      const flush = () => {
        if (buf) {
          out.push({ type: 'text', value: buf })
          buf = ''
        }
      }
      while (i < s.length) {
        if (s[i] === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
          const closeTok = s[i + 1] === '(' ? '\\)' : '\\]'
          const close = s.indexOf(closeTok, i + 2)
          if (close > i) {
            flush()
            out.push({ type: s[i + 1] === '(' ? 'inline' : 'block', value: s.slice(i + 2, close) })
            i = close + 2
            continue
          }
        }
        if (s[i] === '$') {
          const display = s[i + 1] === '$'
          const tok = display ? '$$' : '$'
          const close = s.indexOf(tok, i + tok.length)
          if (close > i) {
            const tex = s.slice(i + tok.length, close)
            if (tex.trim()) {
              flush()
              out.push({ type: display ? 'block' : 'inline', value: tex })
              i = close + tok.length
              continue
            }
          }
        }
        buf += s[i++]
      }
      flush()
      return out
    }

    function mathNode(tex, display, key) {
      const html = texToMathML(tex, display)
      if (!html) return h('code', { key, className: 'rd-math-error' }, tex)
      return h('span', {
        key,
        className: 'rd-math ' + (display ? 'rd-math-block' : 'rd-math-inline'),
        dangerouslySetInnerHTML: { __html: html }
      })
    }

    /** 把一段可能含 LaTeX 的文本渲染成 React 子节点；纯文本原样返回。 */
    function richText(text, keyPrefix) {
      const parts = splitMathText(text)
      if (parts.length === 1 && parts[0].type === 'text') return parts[0].value
      return parts.map((p, i) => (p.type === 'text' ? p.value : mathNode(p.value, p.type === 'block', (keyPrefix || 'm') + i)))
    }

    function QuestionBlock({ q, index, value, submitted, onChange }) {
      const isJudge = q.type === 'judge'
      const options = Array.isArray(q.options) ? q.options : []
      const chosenIndex = isJudge
        ? value === true
          ? 0
          : value === false
            ? 1
            : -1
        : typeof value === 'number'
          ? value
          : -1
      const correctIndex = isJudge ? (q.answer === true ? 0 : 1) : q.answer
      const correctText = isJudge ? (q.answer ? '正确' : '错误') : asText(options[correctIndex], 300)
      return h(
        'div',
        { className: 'rd-q' },
        h(
          'div',
          { className: 'rd-stem' },
          h('span', { className: 'rd-num', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
          h('span', { className: 'rd-stem-text' }, richText(q.stem, 'q' + index + '-'))
        ),
        options.map((opt, oi) =>
          h(
            'button',
            {
              key: oi,
              type: 'button',
              className:
                'rd-opt' +
                (!submitted && chosenIndex === oi ? ' sel' : '') +
                (submitted && correctIndex === oi ? ' ok' : '') +
                (submitted && chosenIndex === oi && correctIndex !== oi ? ' bad' : ''),
              'aria-pressed': chosenIndex === oi,
              disabled: submitted,
              onClick: () => {
                if (submitted) return
                onChange(isJudge ? oi === 0 : oi)
              }
            },
            h('span', { className: 'rd-key', 'aria-hidden': 'true' }, String.fromCharCode(65 + oi)),
            h(
              'span',
              { className: 'rd-dot' + (chosenIndex === oi || (submitted && correctIndex === oi) ? ' on' : ''), 'aria-hidden': 'true' },
              submitted && correctIndex === oi ? '✓' : chosenIndex === oi ? '●' : ''
            ),
            h('span', { className: 'rd-opt-text' }, richText(opt, 'o' + index + '-' + oi))
          )
        ),
        submitted
          ? h(
              'div',
              { className: 'rd-exp' },
              richText(
                (isPickedCorrect(q, value) ? '✅ 答对了。' : '❌ 答错了，正确答案：' + correctText + '。') +
                  (q.explanation ? ' ' + q.explanation : ''),
                'e' + index + '-'
              )
            )
          : null
      )
    }

    function CardView({ card, onBack, onRegenerate, onDeleted, busy, setBusy }) {
      const [answers, setAnswers] = useState({})
      const [submitted, setSubmitted] = useState(false)
      const [submitting, setSubmitting] = useState(false)
      const [score, setScore] = useState(null)
      const [error, setError] = useState('')
      const [confirmDelete, setConfirmDelete] = useState(false)
      const [deleting, setDeleting] = useState(false)
      const alive = useRef(true)

      useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
        }
      }, [])

      useEffect(() => {
        setAnswers({})
        setSubmitted(false)
        setSubmitting(false)
        setScore(null)
        setError('')
        setConfirmDelete(false)
      }, [card && card.topic])

      const questions = Array.isArray(card && card.questions) ? card.questions : []
      const total = questions.length
      const answered = Object.keys(answers).length

      const submit = async () => {
        if (submitting || submitted) return
        if (answered < total) {
          setError('还有 ' + (total - answered) + ' 题没答')
          return
        }
        setError('')
        const items = questions.map((q, i) => ({
          i,
          correct: isPickedCorrect(q, answers[i])
        }))
        setSubmitting(true)
        if (setBusy) setBusy(true)
        try {
          const r = await api('/attempt', {
            method: 'POST',
            timeoutMs: 15000,
            body: JSON.stringify({ topic: card.topic, items })
          })
          if (!alive.current) return
          setScore(r)
          setSubmitted(true)
        } catch (e) {
          if (!alive.current) return
          setError(errorText(e))
        } finally {
          if (alive.current) {
            setSubmitting(false)
            if (setBusy) setBusy(false)
          }
        }
      }

      const reset = () => {
        setAnswers({})
        setSubmitted(false)
        setSubmitting(false)
        setScore(null)
        setError('')
      }

      const removeCard = async () => {
        if (deleting) return
        if (!confirmDelete) {
          setConfirmDelete(true)
          return
        }
        setDeleting(true)
        setError('')
        try {
          await api('/delete', {
            method: 'POST',
            timeoutMs: 15000,
            body: JSON.stringify({ topic: card.topic })
          })
          if (alive.current && onDeleted) onDeleted()
        } catch (e) {
          if (alive.current) setError(errorText(e))
        } finally {
          if (alive.current) {
            setDeleting(false)
            setConfirmDelete(false)
          }
        }
      }

      const warn = error
        ? h(
            'div',
            { className: 'rd-warn', role: 'alert' },
            h('span', { className: 'rd-warn-text' }, error)
          )
        : null

      if (!total) {
        return h(
          'div',
          null,
          h(
            'div',
            { className: 'rd-head' },
            h('button', { type: 'button', className: 'rd-btn ghost', onClick: onBack }, '← 返回')
          ),
          h('div', { className: 'rd-title', style: { marginBottom: 2 } }, asText(card && card.title, 300) || '复习卡片'),
          h('div', { className: 'rd-sub', style: { marginBottom: 12 } }, '知识点：' + asText(card && card.topic, 120)),
          h('div', { className: 'rd-warn', role: 'alert' }, h('span', { className: 'rd-warn-text' }, INCOMPLETE)),
          h(
            'button',
            { type: 'button', className: 'rd-btn primary', disabled: deleting, onClick: removeCard },
            deleting ? '删除中…' : confirmDelete ? '确认删除？' : '删除这张卡片'
          )
        )
      }

      return h(
        'div',
        { className: 'rd-card' },
        h(
          'div',
          { className: 'rd-head' },
          h('button', { type: 'button', className: 'rd-btn ghost', onClick: onBack }, '← 返回'),
          h(
            'div',
            { style: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' } },
            h('button', { type: 'button', className: 'rd-btn ghost', disabled: busy || submitting || deleting, onClick: onRegenerate }, '重新生成'),
            h('button', { type: 'button', className: 'rd-btn ghost', disabled: submitting, onClick: reset }, '重新作答'),
            h(
              'button',
              { type: 'button', className: 'rd-btn ghost', disabled: deleting, onClick: removeCard },
              deleting ? '删除中…' : confirmDelete ? '确认删除？' : '删除'
            )
          )
        ),
        h('div', { className: 'rd-title', style: { marginBottom: 2 } }, asText(card.title, 300) || card.topic),
        h(
          'div',
          { className: 'rd-sub', style: { marginBottom: 12 } },
          '知识点：' + card.topic + (card.model ? ' · ' + card.model : '')
        ),

        submitted && score
          ? h(
              'div',
              { className: 'rd-score ' + (score.correct === score.total ? 'good' : 'bad'), role: 'status' },
              h(
                'div',
                { className: 'rd-score-main' },
                h('span', { className: 'rd-score-num' }, String(score.score)),
                h('span', { className: 'rd-score-unit' }, '分')
              ),
              h(
                'div',
                { className: 'rd-score-side' },
                h(
                  'div',
                  { className: 'rd-score-msg' },
                  score.correct + '/' + score.total + ' 正确' +
                    (score.correct === score.total ? ' · 全对' : ' · 错题已记录')
                ),
                h(
                  'div',
                  { className: 'rd-score-bar', 'aria-hidden': 'true' },
                  h('i', { style: { width: Math.max(0, Math.min(100, Number(score.score) || 0)) + '%' } })
                )
              )
            )
          : null,
        warn,

        h(
          'div',
          { className: 'rd-sec' },
          h('div', { className: 'rd-label' }, '核心概念'),
          h('div', { className: 'rd-block' }, richText(card.concept, 'c-'))
        ),

        h(
          'div',
          { className: 'rd-sec' },
          h('div', { className: 'rd-label' }, '定义'),
          h('div', { className: 'rd-block' }, richText(card.definition, 'd-'))
        ),

        card.confusions && card.confusions.length
          ? h(
              'div',
              { className: 'rd-sec' },
              h('div', { className: 'rd-label' }, '最容易混淆'),
              card.confusions.map((c, i) =>
                h(
                  'div',
                  { className: 'rd-conf', key: i },
                  h('b', null, richText(c.name, 'cn' + i + '-')),
                  h('p', null, richText(c.difference, 'cd' + i + '-')),
                  c.example
                    ? h('div', { className: 'rd-ex' }, richText('例：' + c.example, 'ce' + i + '-'))
                    : null
                )
              )
            )
          : null,

        h(
          'div',
          { className: 'rd-sec' },
          h('div', { className: 'rd-label' }, '自测 · ' + total + ' 题'),
          questions.map((q, i) =>
            h(QuestionBlock, {
              key: i,
              q,
              index: i,
              value: answers[i],
              submitted,
              onChange: (v) => setAnswers((prev) => ({ ...prev, [i]: v }))
            })
          ),
          submitted
            ? h(
                'div',
                { className: 'rd-foot' },
                h('button', { type: 'button', className: 'rd-btn primary', style: { flex: '1 1 100%' }, onClick: reset }, '重新作答')
              )
            : h(
                'button',
                {
                  type: 'button',
                  className: 'rd-btn primary rd-submit',
                  onClick: submit,
                  disabled: submitting
                },
                submitting ? '提交中…' : '提交判分（' + answered + '/' + total + '）'
              )
        ),

        h(Sources, { sources: card.sources })
      )
    }

    function Panel() {
      const [view, setView] = useState('home')
      const [text, setText] = useState('')
      const [card, setCard] = useState(null)
      const [recent, setRecent] = useState([])
      const [wrong, setWrong] = useState([])
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [listError, setListError] = useState('')
      const [step, setStep] = useState(0)
      const [health, setHealth] = useState(null)
      const timer = useRef(null)
      const alive = useRef(true)
      const reqRef = useRef(null)
      const retryRef = useRef(null)

      const fail = useCallback((msg, retry) => {
        retryRef.current = typeof retry === 'function' ? retry : null
        setError(msg || '')
      }, [])

      const clearError = useCallback(() => {
        retryRef.current = null
        setError('')
      }, [])

      const retryAction = useCallback(() => {
        const fn = retryRef.current
        clearError()
        if (fn) fn()
      }, [clearError])

      /** 同一时刻只保留一个列表请求；新请求/卸载都 abort 旧请求（D3）。 */
      const newRequest = useCallback(() => {
        if (reqRef.current) {
          try {
            reqRef.current.abort()
          } catch {
            /* ignore */
          }
        }
        const ctl = typeof AbortController === 'function' ? new AbortController() : null
        reqRef.current = ctl
        return ctl
      }, [])

      useEffect(() => {
        alive.current = true
        return () => {
          alive.current = false
          if (reqRef.current) {
            try {
              reqRef.current.abort()
            } catch {
              /* ignore */
            }
          }
          if (timer.current) clearInterval(timer.current)
        }
      }, [])

      const loadLists = useCallback(async () => {
        const [lib, wr] = await Promise.allSettled([
          api('/library', { timeoutMs: 15000 }),
          api('/wrong', { timeoutMs: 15000 })
        ])
        if (!alive.current) return
        const errs = []
        if (lib.status === 'fulfilled' && lib.value && Array.isArray(lib.value.cards)) {
          setRecent(lib.value.cards)
        } else if (lib.status === 'rejected') {
          errs.push('最近复习列表：' + errorText(lib.reason))
        }
        if (wr.status === 'fulfilled' && wr.value && Array.isArray(wr.value.rows)) {
          setWrong(wr.value.rows)
        } else if (wr.status === 'rejected') {
          errs.push('错题本：' + errorText(wr.reason))
        }
        setListError(errs.join('；'))
      }, [])

      useEffect(() => {
        ensureStyle()
        loadLists()
        api('/health', { timeoutMs: 15000 })
          .then((r) => {
            if (alive.current) setHealth(r)
          })
          .catch(() => {
            if (alive.current) setHealth(null)
          })
      }, [loadLists])

      useEffect(() => {
        if (view !== 'loading') {
          if (timer.current) clearInterval(timer.current)
          timer.current = null
          return
        }
        setStep(0)
        timer.current = setInterval(() => setStep((s) => (s + 1) % 4), 4500)
        return () => {
          if (timer.current) clearInterval(timer.current)
        }
      }, [view])

      const STEPS = ['正在联网检索资料…', '正在提取核心概念…', '正在整理最易混的考点…', '正在出 3-5 道自测题…']

      const generate = async (topic, force) => {
        const t = (topic || '').trim()
        if (!t) {
          fail('先输入一个知识点')
          return
        }
        clearError()
        setListError('')
        const ctl = newRequest()
        setBusy(true)
        setView('loading')
        try {
          const r = await api('/generate', {
            method: 'POST',
            timeoutMs: 210000,
            signal: ctl ? ctl.signal : undefined,
            body: JSON.stringify({ topic: t, force: !!force })
          })
          if (!alive.current) return
          const normalized = normalizeCard(r && r.card)
          if (!normalized.ok) {
            setCard(null)
            setView('home')
            fail(normalized.reason, () => generate(t, force))
            return
          }
          setCard(normalized.card)
          setView('card')
          loadLists()
        } catch (e) {
          if (!alive.current || isCanceled(e)) return
          setView('home')
          fail(errorText(e), () => generate(t, force))
        } finally {
          if (alive.current) setBusy(false)
          if (reqRef.current === ctl) reqRef.current = null
        }
      }

      const cancelGenerate = () => {
        if (reqRef.current) {
          try {
            reqRef.current.abort()
          } catch {
            /* ignore */
          }
        }
        setBusy(false)
        setView('home')
      }

      const openCard = async (topic) => {
        if (busy) return
        clearError()
        const ctl = newRequest()
        setBusy(true)
        try {
          const r = await api('/card?topic=' + encodeURIComponent(topic), {
            timeoutMs: 15000,
            signal: ctl ? ctl.signal : undefined
          })
          if (!alive.current) return
          const normalized = normalizeCard(r && r.card)
          if (!normalized.ok) {
            fail(normalized.reason, () => openCard(topic))
            return
          }
          setCard(normalized.card)
          setView('card')
        } catch (e) {
          if (!alive.current || isCanceled(e)) return
          fail(errorText(e), () => openCard(topic))
        } finally {
          if (alive.current) setBusy(false)
          if (reqRef.current === ctl) reqRef.current = null
        }
      }

      const warn = (msg, onRetry, key) =>
        h(
          'div',
          { className: 'rd-warn', role: 'alert', key: key || 'warn' },
          h('span', { className: 'rd-warn-text' }, msg),
          typeof onRetry === 'function'
            ? h('button', { type: 'button', className: 'rd-btn ghost', onClick: onRetry }, '重试')
            : null
        )

      const actionError = error ? warn(error, retryAction, 'action-error') : null
      const listWarn = listError ? warn(listError, () => loadLists(), 'list-error') : null

      const header = h(
        'div',
        { className: 'rd-head' },
        h(
          'div',
          null,
          h('div', { className: 'rd-title' }, '复习台'),
          h(
            'div',
            { className: 'rd-sub' },
            health && health.model ? '模型：' + health.model : '模型未就绪'
          )
        ),
        h(
          'div',
          { style: { display: 'flex', gap: 6 } },
          h(
            'button',
            {
              type: 'button',
              className: 'rd-btn',
              disabled: busy,
              'aria-pressed': view === 'wrong',
              onClick: () => setView(view === 'wrong' ? 'home' : 'wrong')
            },
            '错题' + (wrong.length ? ' ' + wrong.length : '')
          )
        )
      )

      if (view === 'loading') {
        return h(
          'div',
          { className: 'rd-panel' },
          header,
          h(
            'div',
            { className: 'rd-loading', role: 'status', 'aria-live': 'polite' },
            h('div', { className: 'rd-spin', 'aria-hidden': 'true' }),
            h('div', { style: { fontWeight: 600 } }, STEPS[step]),
            h(
              'div',
              { className: 'rd-sub', style: { marginTop: 8 } },
              '模型正在检索并出题，通常 20-60 秒。完成后会自动显示卡片。'
            ),
            h(
              'button',
              { type: 'button', className: 'rd-btn', style: { marginTop: 12 }, onClick: cancelGenerate },
              '取消'
            )
          )
        )
      }

      if (view === 'card' && card) {
        return h(
          'div',
          { className: 'rd-panel' },
          h(CardView, {
            card,
            busy,
            setBusy,
            onBack: () => {
              setCard(null)
              setView('home')
              loadLists()
            },
            onRegenerate: () => generate(card.topic, true),
            onDeleted: () => {
              setCard(null)
              setView('home')
              loadLists()
            }
          })
        )
      }

      if (view === 'wrong') {
        return h(
          'div',
          { className: 'rd-panel' },
          header,
          actionError,
          listWarn,
          h('div', { className: 'rd-label' }, '错题本'),
          wrong.length === 0
            ? h('div', { className: 'rd-empty' }, '还没有错题。做完自测后，错的题会自动记在这里。')
            : h(
                'div',
                { className: 'rd-list' },
                wrong.map((w) =>
                  h(
                    'button',
                    { type: 'button', className: 'rd-item', key: w.topic, disabled: busy, onClick: () => openCard(w.topic) },
                    h(
                      'span',
                      { className: 'rd-item-main' },
                      h('span', { className: 'rd-item-name' }, asText(w.title, 190) || asText(w.topic, 190)),
                      h(
                        'span',
                        { className: 'rd-item-meta' },
                        '上次 ' + w.lastCorrect + '/' + w.total + ' · 共练 ' + w.attempts + ' 次'
                      )
                    ),
                    h('span', { className: 'rd-tag' }, '重做')
                  )
                )
              ),
          h(
            'button',
            {
              type: 'button',
              className: 'rd-btn ghost',
              style: { marginTop: 8 },
              onClick: () => setView('home')
            },
            '← 返回搜索'
          )
        )
      }

      return h(
        'div',
        { className: 'rd-panel' },
        header,
        actionError,
        listWarn,
        h(
          'div',
          { className: 'rd-search' },
          h('input', {
            className: 'rd-input',
            placeholder: '输入知识点，如 牛顿环',
            'aria-label': '知识点',
            value: text,
            onChange: (e) => setText(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter' && !busy) generate(text, false)
            }
          }),
          h(
            'button',
            { type: 'button', className: 'rd-btn primary', disabled: busy || !text.trim(), onClick: () => generate(text, false) },
            '生成'
          )
        ),
        h(
          'div',
          { className: 'rd-quick' },
          EXAMPLES.map((x, i) =>
            h(
              'button',
              {
                key: i,
                type: 'button',
                className: 'rd-chip',
                disabled: busy,
                onClick: () => {
                  setText(x)
                  generate(x, false)
                }
              },
              x
            )
          )
        ),
        health && !health.model
          ? h(
              'div',
              { className: 'rd-warn', role: 'status' },
              h('span', { className: 'rd-warn-text' }, '当前没有选中的模型。先在 DSH 里选一个模型，再回来生成卡片。')
            )
          : null,
        h(
          'div',
          { className: 'rd-sec' },
          h('div', { className: 'rd-label' }, '最近复习'),
          recent.length === 0
            ? h('div', { className: 'rd-empty' }, '还没有卡片。上面输入一个知识点试试。')
            : h(
                'div',
                { className: 'rd-list' },
                recent.map((c) =>
                  h(
                    'button',
                    { type: 'button', className: 'rd-item', key: c.topic, disabled: busy, onClick: () => openCard(c.topic) },
                    h(
                      'span',
                      { className: 'rd-item-main' },
                      h('span', { className: 'rd-item-name' }, asText(c.title, 190) || asText(c.topic, 190)),
                      h(
                        'span',
                        { className: 'rd-item-meta' },
                        c.questions + ' 题' + (c.best !== null && c.total ? ' · 最好 ' + c.best + '/' + c.total : '')
                      )
                    ),
                    h('span', { className: 'rd-tag' }, '复习')
                  )
                )
              )
        ),
        h(
          'div',
          { className: 'rd-note' },
          '卡片会存到本地，错题按知识点累计。数据目录：~/.dsh/data/review-desk'
        )
      )
    }

    function GlyphIcon(size) {
      const s = typeof size === 'number' && size > 0 ? size : 16
      return h(
        'svg',
        {
          width: s,
          height: s,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true'
        },
        h('path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15.5H6.5A2.5 2.5 0 0 0 4 21z' }),
        h('path', { d: 'M4 18.5A2.5 2.5 0 0 1 6.5 16H19' }),
        h('path', { d: 'M9 7.5h6M9 10.5h4' })
      )
    }

    /** 侧栏条目渲染位是 16/18px 的 aria-hidden 图标插槽，只能画图标（label 由 sidebar 渲染）。 */
    function Row(ownerProps) {
      const owner = ownerProps || {}
      return GlyphIcon(owner.size)
    }

    const name = 'review-desk-client'
    const inject = ['slots']

    function apply(ctx) {
      ensureStyle()
      // 'main' 由 ui-layout 插件声明为 root 下的 keyed 子槽，必须用 slots.inject 等它出现后再注册。
      ctx.slots.inject('main', () =>
        ctx.slots.register({ name: 'main', key: 'review-desk' }, () => h(Panel, null))
      )
      ctx.slots.inject('sidebar.panellist', function* () {
        yield ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: 'review-desk',
            order: 2,
            label: () => '复习台'
          },
          () => h(Row, null)
        )
      })
    }

    module.exports = { name, inject, apply }
    // 仅供 tests/client.test.mjs（vm 沙箱里预置 __DSH_TEST__）读取内部函数做单元测试；
    // 浏览器里没有该全局，生产导出仍严格是 {name, inject, apply}。
    if (typeof __DSH_TEST__ !== 'undefined' && __DSH_TEST__) {
      module.exports.__test = { api, normalizeCard, safeHref, ensureStyle, errorText, CSS_SELECTOR, API, INCOMPLETE, texToMathML, texToMathMLContent, splitMathText, richText }
    }
    return module.exports
  }
})
