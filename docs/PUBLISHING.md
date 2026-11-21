# 发布到 GitHub（维护者操作手册）

把本仓库整理成可公开发布的状态。全部命令在**仓库根目录**（含 `package.json` 的那一层）执行；Windows 下用 PowerShell。

前置：安装 Git（本机若没有 `git`，可先用 GitHub Desktop 完成同等操作），可选安装 [GitHub CLI](https://cli.github.com/)。

## 1. 替换占位符

> **本仓库 v0.2.0 已完成**：占位符已全部替换为 `zakeluo`（0 残留）。本节保留给换用户名、fork 后重新发布时参考。

需要替换的占位符位于下列文件；本文件（`docs/PUBLISHING.md`）里的示例命令保留占位符，不参与自动替换（**不要提交占位符**）：

| 文件 | 位置 |
| --- | --- |
| `package.json` | `repository.url`、`homepage`、`bugs.url` |
| `README.md` | 顶部 CI badge 的 2 个链接 |
| `README.en.md` | 顶部 CI badge 的 2 个链接 |
| `CHANGELOG.md` | 底部 compare / release 链接 |
| `SECURITY.md` | Security Advisories 链接 |

用编辑器全局替换即可（把 `YOUR-GITHUB-USER` 换成真实用户名）。推荐用 Node 做替换，它按 UTF-8 读写、不会写入 BOM，也不会改动换行符：

```powershell
$user = 'your-github-name'
node -e "const fs=require('fs');const u=process.argv[1];for(const f of ['package.json','README.md','README.en.md','CHANGELOG.md','SECURITY.md']){fs.writeFileSync(f,fs.readFileSync(f,'utf8').split('YOUR-GITHUB-USER').join(u))};console.log('replaced')" $user
```

没有 Node 时可用 PowerShell 版；注意 PowerShell 5.1 的 `Set-Content -Encoding utf8` 会给文件加 BOM（`package.json` 带 BOM 会让部分工具报错），执行后请确认文件仍可被 `node`/npm 正常解析：

```powershell
$user = 'your-github-name'
foreach ($f in 'package.json','README.md','README.en.md','CHANGELOG.md','SECURITY.md') {
  (Get-Content $f -Raw).Replace('YOUR-GITHUB-USER', $user) | Set-Content $f -NoNewline -Encoding utf8
}
```

替换后检查没有残留（本文件示例除外）：

```powershell
Select-String -Path package.json,README.md,README.en.md,CHANGELOG.md,SECURITY.md -Pattern 'YOUR-GITHUB-USER'
```

## 2. 校验 JSON 与清单

```powershell
node -e "for (const f of ['package.json','locale/en.json','locale/zh.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('JSON ok')"
```

> PowerShell 5.1 的 `ConvertFrom-Json` 会按 ANSI 解码 UTF-8 中文，可能对合法文件误报失败；以 Node 的结果为准：

```powershell
Get-Content package.json -Raw | ConvertFrom-Json | Out-Null
Get-Content locale\en.json -Raw | ConvertFrom-Json | Out-Null
Get-Content locale\zh.json -Raw | ConvertFrom-Json | Out-Null
'JSON ok'
```

同时确认 `package.json` 的 `exports` 指向的文件都存在（`lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`locale/*.json`、`assets/icon.svg`），`icon` ≤ 256 KiB。

## 3. 初始化仓库并首次推送

> **本仓库 v0.2.0 已完成**：`git init -b main`、21 个文件已首次提交（`chore: initial public release v0.2.0`）、本地 `v0.2.0` tag 已打好、`origin` 已指向 `https://github.com/zakeluo/dsh-review-desk.git`。到 GitHub 建好同名空仓库后，只需 `git push -u origin main` 与 `git push origin v0.2.0`。以下步骤保留给全新 checkout 或 fork 时参考。

```powershell
git init -b main
git add -A
git status                     # 确认 .review/、*.jpg 未被加入（已在 .gitignore 中）
git commit -m "chore: initial public release v0.2.0"
git remote add origin https://github.com/zakeluo/dsh-review-desk.git
git tag -a v0.2.0 -m "v0.2.0"
git push -u origin main
git push origin v0.2.0
```

> 本机若没有 `git`，先装：`winget install --id Git.Git -e --source winget`（装完新开终端使 PATH 生效）。

仓库在 GitHub 上创建时**不要**勾选自动生成 README / license / .gitignore，避免首次推送冲突。

## 4. 确认 CI 通过

`.github/workflows/ci.yml` 会在 push 和 PR 时用 Node 20 / 22 跑 `npm run check` 与 `npm test`。

- 打开 `https://github.com/<你的用户名>/dsh-review-desk/actions`，确认 `CI` 全绿。
- README 顶部 CI badge 会自动生效（它引用 `actions/workflows/ci.yml/badge.svg`）。
- 目前 `tests/` 有 `host.test.mjs`（30 项）与 `client.test.mjs`（21 项），共 51 项，`npm test` 会全部运行。脚本显式列出两个文件（`node --test tests/host.test.mjs tests/client.test.mjs`），因为 `node --test tests/` 在部分 Node/Windows 组合下会把目录当模块解析而失败；新增测试文件时请同时把它加进 `package.json` 的 `test` 脚本。

## 5. 打 tag 并发布 Release

```powershell
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

然后 GitHub → **Releases** → **Draft a new release**：

1. 选择 tag `v0.2.0`，标题填 `v0.2.0`；
2. 正文粘贴 `CHANGELOG.md` 里 `[0.2.0]` 一节的内容；
3. 发布后 README 的 version badge 可按需改为 Release badge（当前是静态 `0.2.0`）。

## 6. 仓库设置与发布面

- 仓库 **About**：描述用 `package.json` 的 `description`，Topics 建议：`dsh`、`dsh-plugin`、`deepseek-harness`、`cordis`、`flashcards`、`spaced-repetition`、`study`。
- **Security** → 开启 **Private vulnerability reporting**（`SECURITY.md` 里引用的入口）。
- 确认 GitHub 识别 License 为 MIT（仓库首页右侧显示 MIT license）。
- 可选：在 LICENSE、README 的版权行确认年份与署名意图。

## 7. 发布前自检清单

- [ ] 除本文件示例外，仓库中无占位符残留（步骤 1 的 `Select-String` 无输出）。
- [ ] `package.json` / `locale/*.json` 均可被 `ConvertFrom-Json` 解析。
- [ ] `.review/`、`data/`、`node_modules/` 未被提交。
- [ ] README 的截图 `docs/screenshot.png` 存在且不含个人隐私信息（当前截图为插件面板裁剪，已被 `.review/` 排除在外，不影响发布）。
- [ ] CI 绿色，`npm run lint` 本地可通过（如本机有 Node 20+）。
- [ ] `v0.2.0` tag 已推送，Release 已发布。
- [ ] 用一个干净的 profile 试装一次，确认侧栏「复习台」出现、能生成卡片。
