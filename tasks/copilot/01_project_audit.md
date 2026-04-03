# 01 Project Audit & Environment Setup

目的: 開発を開始するための現状把握と再現可能な環境を整える。

やることリスト:
- リポジトリ全体をレビューして未解決の問題を列挙する（README, tasks, src, tools）
- Node/npm バージョン確認と `npm install` を実行する
- `npx http-server` で静的サーバを起動し UI を手元で開けることを確認する
- Python（ONNXツール用）が必要ならバージョンと仮想環境手順をドキュメント化する
- 開発用チェックリスト（依存、ポート、ブラウザ要件）を `tasks/copilot/` に保存する

検証:
- `npm install` が成功していること
- `http://localhost:8080/src/` をブラウザで開けること
- 依存不足・404 を tasks/artifacts/log に記録

成果物:
- `tasks/copilot/artifacts/environment_report.txt`
- 小さな issue リスト（復旧タスク）
