# 04 Implement Correction Pipeline (WebGPU + Canvas fallback)

目的: 抽出した矩形に対して高速かつ軽量に補正を施す。

やることリスト:
- 補正抽象関数 `applyRectCorrection(ctx, rect)` を定義する
- `applyWebGPUBlurToRect()` を試作（最初は簡易ダウンサンプル→アップサンプル）
- `applyCanvasBlurToRect()` を実装して確実にフォールバックできるようにする
- 補正の種類を定義（ぼかし、色混合、パッチ補完の簡易アルゴリズム）
- 非同期処理中の UI 表示（ローディング、進捗）を実装する

検証:
- WebGPU 対応環境で GPU パスが動作すること（ログ出力）
- 非対応環境で Canvas フォールバックが結果を返すこと
- 視覚品質の受け入れ基準（目視でエッジが目立たない等）を満たすこと

成果物:
- `src/features/inpainting.js` に補正関数群を追加したコミット
- `tasks/copilot/artifacts/correction_bench.txt`
