# 06 — 最終チェックリストと自動化（CI）案

目的:
- 各タスク実行後に最低限確認すべき項目を自動/手動チェックできるようにする。

チェックリスト:
- [ ] `npm install` が成功すること。
- [ ] `npx http-server . -p 8080` で静的サーバが起動すること（または別ポートでOK）。
- [ ] `src/features/inpainting.js` の変更がビルドエラーを出さないこと（ESLint/構文チェック）。
- [ ] ブラウザで `src/` のUIが開き、セグメンテーション→試着の流れが動くこと（最低1回）。
- [ ] `tasks/copilot/artifacts/` にスクリーンショットが残されていること（テスト記録）。

簡易CI案:
- GitHub Actions ワークフローを追加し、以下を行う:
  - `node` のインストール、`npm ci`、静的チェック（`eslint`）
  - シンプルな `http-server` 起動とヘルスチェック（curlで `/src/` が200を返すか）

備考:
- 本リポジトリはブラウザでの実行が主なので、完全な E2E は手動確認を前提とします。

---

自動化向けワークフロー（GitHub Actions の雛形）:

1) `.github/workflows/ci.yml`（簡易）を追加する例:
```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with: { node-version: '18' }
      - name: Install
        run: npm ci
      - name: Lint
        run: npx eslint "src/**/*.js" || true
      - name: Start http-server
        run: npx http-server . -p 8080 & sleep 2
      - name: Health check
        run: curl -f http://localhost:8080/src/ || (cat /tmp/http-server.log && exit 1)
```

2) CI が成功したらアーティファクトとして `tasks/copilot/artifacts/` を保持する（スクリーンショットは手動追加）。

運用メモ:
 - CI は自動E2Eを行わない前提。UI確認・スクリーンショット取得は手動、または Puppeteer を導入して任意に自動化してください。