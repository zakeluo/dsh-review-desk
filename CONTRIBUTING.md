# Contributing

Thanks for improving Review Desk! This is a small, dependency-free DSH plugin; keep changes focused and easy to review.

## Development setup

- **Node.js ≥ 20** (ESM only).
- **DSH ≥ 0.2.1-rc.3** if you want to test the plugin inside the app; the host side needs the injected `webServer` / `llm` services.
- No runtime dependencies and no build step. `npm install` is optional (it only creates a lock file); the source runs directly.

```powershell
npm install --no-audit --no-fund   # optional, zero dependencies
npm run check                      # node --check lib/index.js && node --check lib/client.js
npm test                           # node --test tests/
npm run lint                       # check + test — run this before pushing
```

Manual smoke test: install the package into a test profile, restart DSH, open the sidebar entry, and generate a card for a simple topic. Use a temporary data directory:

```powershell
$env:DSH_HOME = "$env:TEMP\rd-dev-home"
```

Tests must always point `DSH_HOME` at a temp directory — never let a test read or write the real `~/.dsh/data/review-desk/`.

## Pull request checklist

- [ ] `npm run lint` passes.
- [ ] Behaviour changes are reflected in `README.md` / `README.en.md` (both languages) and `CHANGELOG.md` under an `Unreleased` or new version section.
- [ ] New HTTP behaviour or limits are documented in the API section of both READMEs.
- [ ] `package.json` remains valid JSON and its `exports` stay in sync with shipped files.
- [ ] `locale/en.json` and `locale/zh.json` keep **identical key sets**.
- [ ] Tests cover the new behaviour, and they pass with a redirected `DSH_HOME`.

## Code style

- Pure ESM, 2-space indentation, LF newlines, UTF-8, final newline (see `.editorconfig`).
- Follow the existing no-semicolon style of `lib/*.js`.
- **Zero runtime dependencies**: do not add `dependencies`. Use the services injected by DSH (`webServer`, `llm`, slots, etc.). Dev-only tooling is acceptable but should stay minimal.
- Browser half: no bundler assumptions — `lib/client.js` must run through `window.__ModuleLoader__` and only `require('react')`.
- Keep all user-visible strings in the UI consistent with the locale files and README.

## Contracts that must not break

These have caused real regressions before; please preserve them:

1. **Client slots are registered via `ctx.slots.inject`.** `lib/client.js` must register both slots through `inject`, not `register` directly:
   - `ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'review-desk' }, …))` — `main` is a keyed child slot declared by the layout plugin; registering before it appears breaks web boot.
   - `ctx.slots.inject('sidebar.panellist', function* () { yield ctx.slots.register({ name: 'sidebar.panellist', id: 'review-desk', … }, …) })` — the sidebar entry only appears after that slot is available.
2. **Host injection list stays complete.** `lib/index.js` must keep both services:

   ```js
   export const inject = ['webServer', 'llm']
   ```

   Removing `llm` makes `/generate` fail with `cannot get property "llm" without inject`; removing `webServer` makes the HTTP API never register.

Also keep the packaged entry points aligned with `package.json`:

```json
"exports": {
  ".": "./lib/index.js",
  "./client": "./lib/client.js",
  "./cordis.patch.yml": "./cordis.patch.yml",
  "./locale/*.json": "./locale/*.json",
  "./icon": "./assets/icon.svg"
}
```

## Reporting security issues

Do not open a public issue — see [SECURITY.md](SECURITY.md).
