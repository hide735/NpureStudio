# Task 04: SAM セグメンテーションの実装

## 概要
Segment Anything Model (SAM) を使用して画像の自動セグメンテーションを実装する。

## 目標
- SAM モデルのロードと実行
- 人物/衣服のマスク生成

## 必要なファイル/コンポーネント
- `src/features/segmentation.js`: SAM セグメンテーション機能
- `src/utils/mask-utils.js`: マスク処理ユーティリティ

## 実装手順
1. SAM モデルを Transformers.js でロード
2. `src/features/segmentation.js` を作成し、セグメンテーション処理を実装
3. `src/utils/mask-utils.js` を作成し、マスク生成/編集関数を実装
4. UI にセグメンテーション結果の表示を追加

## テスト方法
- サンプル画像でマスクが正しく生成されることを確認
- 処理時間が許容範囲内かテスト

## 依存関係
- Task 03: 基本画像認識テスト

## 次のステップ
Task 05: Stable Diffusion Inpainting の実装