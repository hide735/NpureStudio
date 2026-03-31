# Task 03: 基本画像認識テスト

## 概要
Transformers.js を使用して基本的な画像認識機能をテストする。

## 目標
- 画像分類モデルのロードと実行
- 基本的な画像処理パイプラインの確立

## 必要なファイル/コンポーネント
- `src/features/image-recognition.js`: 画像認識機能
- `src/utils/image-utils.js`: 画像処理ユーティリティ

## 実装手順
1. `src/utils/image-utils.js` を作成し、画像読み込み/変換関数を実装
2. `src/features/image-recognition.js` を作成し、ViT モデルで画像分類を実装
3. UI に画像アップロードと結果表示を追加

## テスト方法
- サンプル画像をアップロードし、正しい分類結果が表示されることを確認
- パフォーマンス（処理時間）を測定

## 依存関係
- Task 02: Transformers.js の導入

## 次のステップ
Task 04: SAM セグメンテーションの実装