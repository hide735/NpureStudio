# 07 Performance Tuning & Mobile Optimization

目的: iPhone / Safari での実行性能を高め、実用的なレスポンスを実現する。

やることリスト:
- 実機（可能なら iPhone）でのプロファイル手順を準備する
- 重要パラメータを明確化（画像縮小率、分析トークン数、GPU/CPU 切替基準）
- Transformers.js の runtime オプション（webgpu）を確認し最適化する
- メモリ消費の上限を設け、失敗時の安全なフォールバックを実装する
- 低負荷モード（低解像度 + 少ない処理）を追加する

検証:
- 実機での処理時間を測定し目標（例: 2秒以内）を設定する
- メモリ/クラッシュの再現手順をまとめる

成果物:
- `tasks/copilot/artifacts/perf_report.txt`
