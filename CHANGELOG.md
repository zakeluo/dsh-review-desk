# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-21

First public-release preparation. No user-facing feature removal.

### Added

- `locale/en.json` and `locale/zh.json` display metadata (`meta.title` / `meta.description` / `panel.title`), exported via `"./locale/*.json"`.
- `"./icon"` export and top-level `icon` field pointing at the bundled `assets/icon.svg`.
- Request guards for the HTTP API: cross-site requests are rejected with 403, non-JSON bodies with 415, oversized bodies with 413.
- Corrupt data-file quarantine: unparsable `library.json` / `stats.json` are renamed to `<name>.corrupt-<timestamp>` instead of failing the plugin boot; a corrupt optional `config.json` is simply ignored (falls back to the host default model).
- Serialized write queue with temp file + atomic `rename`, preventing concurrent-request lost updates.
- Explicit 200-second timeout for `/generate` (search + model call).
- `node:test` suites under `tests/` with CI workflow (`.github/workflows/ci.yml`, Node 20/22).
- LaTeX formulas in generated cards: the generation prompt now mandates standard LaTeX (inline `$…$`, core formulas as `$$…$$` on their own centered line, integrals with limits, Greek letters, complex exponentials, fractions, operators), and the panel ships a dependency-free LaTeX→MathML converter rendered with the browser's native MathML Core — no KaTeX/MathJax, no web fonts, no CDN.
- English README (`README.en.md`), `SECURITY.md`, `CONTRIBUTING.md`, `docs/PUBLISHING.md`.

### Changed

- `package.json` is now a valid public manifest:
  - removed the misleading `dsh.compatibility.dshReleases` field (DSH does not read it);
  - removed the non-existent unscoped `peerDependencies` (`dsh-llm`, `dsh-host-webserver`, …);
  - declared `engines.dsh` (`>=0.2.1-rc.3 <0.3.0`) and `engines.node` (`>=20`);
  - added `exports`, `files`, `repository`, `homepage`, `bugs`, keywords and npm scripts.
- README rewritten for GitHub (Chinese, with an English counterpart): install via plugin manager or CLI, usage, API table, data/privacy, development, limitations.
- Panel restyled with a cyan/teal theme driven by CSS custom properties: cyan gradient header glow, cyan accents on buttons, chips, cards and score bar, custom scrollbar, and a `prefers-color-scheme: dark` palette (`#22d3ee` / `#67e8f9`). Correct/incorrect answer colors stay green/red. README screenshot regenerated.
- Panel layout rebuilt (not just recolored): sticky translucent toolbar, hero-style search card with chips, section cards with numbered eyebrow labels, A/B/C/D option badges, question number badges, a structured score card (big number + progress bar), responsive card grid for the recent/wrong lists, sticky-free full-width submit button, and a 560 px breakpoint. Typography now uses a system font stack with a 1.7–1.9 line-height scale.

### Fixed

- Registering the `main` slot through `ctx.slots.inject('main', …)` so the web client boots instead of failing on a missing keyed child slot.
- Sidebar icon row now follows the 16/18 px `aria-hidden` glyph contract instead of rendering a label inside the icon slot.
- Style injection claims a plugin-owned `<style>` element, avoiding duplicated CSS across panel mounts.
- Client API calls now surface timeout and HTTP errors as visible messages instead of silently failing.
- Accessibility and error visibility improvements in the panel (labelled controls, readable error banners).

## [0.1.0] - 2026-10-30

Initial version.

### Added

- DSH sidebar plugin "复习台": input a topic, generate a review card with the host default model and web search (Sogou / 360).
- Card content: core concept, rigorous definition, 1–3 confusions, 3–5 self-test questions.
- Answer scoring with explanations, per-topic stats and a wrong-answer book.
- Local storage under `~/.dsh/data/review-desk/` (`library.json`, `stats.json`, optional `config.json`).
- 7 HTTP endpoints under `/dsh-review-desk/api`: `/health`, `/generate`, `/library`, `/card`, `/attempt`, `/wrong`, `/delete`.
- `cordis.patch.yml` bundle patch for inserting the plugin into the DSH profile stack.

[0.2.0]: https://github.com/zakeluo/dsh-review-desk/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/zakeluo/dsh-review-desk/releases/tag/v0.1.0
