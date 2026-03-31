# Task 05: Stable Diffusion Inpainting の実装

## 概要
Stable Diffusion を使用したインペイント機能を実装する。

## 目標
- Inpainting モデルのロードと実行
- マスク領域の画像生成

## 必要なファイル/コンポーネント
- `src/features/inpainting.js`: Inpainting 機能
- `src/utils/diffusion-utils.js`: Diffusion 処理ユーティリティ

## 実装手順
1. Stable Diffusion Inpainting モデルをロード
2. `src/features/inpainting.js` を作成し、インペイント処理を実装
3. `src/utils/diffusion-utils.js` を作成し、プロンプト処理関数を実装
4. UI にインペイント結果の表示を追加

## テスト方法
- マスク付き画像でインペイントが正しく動作することを確認
- 生成品質と時間をテスト

## 依存関係
- Task 04: SAM セグメンテーションの実装

## 次のステップ
Task 06: 試着機能の統合