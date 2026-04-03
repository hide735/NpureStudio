# 06 Mask Handling & Compositing Fallback

目的: マスク適用とフォールバック合成の品質を向上させる。

やることリスト:
- マスク生成 → `ImageData` の座標系を再確認する
- マスク領域のみ補正する実装を堅牢化する（アルファ合成ルール）
- 必要なら OpenCV.js の Telea を利用する流れを整理する（ビルド制限に注意）
- 簡易 Poisson 合成またはエッジブレンドの実装検討／試作
- マスク縮小/拡大時のアーチファクト低減を実装する

検証:
- マスク適用後の境界が自然に見えること（目視）
- フォールバック合成で色味・輪郭が大きく崩れないこと

成果物:
- `tasks/copilot/artifacts/mask_test_before.png` / `mask_test_after.png`
