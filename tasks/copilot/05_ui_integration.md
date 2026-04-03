# 05 Integrate Try-On UI and App Flow

目的: `src/app.js` の試着フローを新しい inpainting 実装と確実に連携させる。

やることリスト:
- `performInpainting()` の返り値仕様（Canvas）を `src/app.js` に反映する
- UI の状態遷移を整理（loading, success, error）
- 例外発生時のフォールバックパス（既存の `simpleTryOn`）を強化する
- ボタンや入力欄の無効化／再有効化のハンドリングを確実にする
- ユーザーテスト用のチェックリストを作成する

検証:
- 画像を使った「試着」操作が正常に完了すること
- エラー発生時にフォールバック合成が動作すること

成果物:
- UI 統合コミット
- `tasks/copilot/artifacts/ui_test_results.txt`
