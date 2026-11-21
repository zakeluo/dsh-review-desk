# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | ✅ |
| < 0.2.0 | ❌ |

Only the latest 0.2.x line receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

1. Use GitHub's private vulnerability reporting:
   <https://github.com/zakeluo/dsh-review-desk/security/advisories/new>
   (Repository → **Security** → **Advisories** → **Report a vulnerability**.)
2. Include: affected version, DSH version and platform, reproduction steps, impact, and any suggested fix.
3. You can expect an initial response within 7 days. Valid reports are fixed and disclosed in a coordinated way via a GitHub Security Advisory; credit is given unless you prefer to stay anonymous.

## Scope

This plugin runs inside DSH. Its attack surface is:

- **HTTP API** under `/dsh-review-desk/api`, mounted on the **local** DSH web server. The plugin does not open its own listener.
  - Cross-site requests (mismatched `Origin` / `Host`) are rejected with 403.
  - Write endpoints require a JSON body (415 otherwise) and enforce a body-size limit (413).
  - There is **no application-level authentication**: the trust boundary is the local DSH web server. Do not expose that port to the internet; doing so is outside the intended deployment.
- **Outbound requests** — search queries go to Sogou (`sogou.com`) and 360 Search (`so.com`); generation sends the topic and retrieved snippets to the host's configured default model. No other network egress.
- **Local data** — cards and stats live in `~/.dsh/data/review-desk/`. `library.json` / `stats.json` that fail to parse are quarantined as `*.corrupt-<timestamp>` rather than trusted or deleted; an unreadable optional `config.json` is ignored.
- **Model output** — generated content is parsed and normalized before storage, and rendered as text (escaped) in the panel. Malicious instructions embedded in retrieved web pages can still influence card *content* (prompt injection), so treat generated cards as untrusted study material; they cannot execute code in the plugin.

Out of scope: vulnerabilities in DSH itself (report them to the DeepSeek Harness project), third-party search engines, and the security of the model provider you choose.
