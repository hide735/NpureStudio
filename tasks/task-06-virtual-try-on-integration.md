# Task 06: 試着機能の統合

## 概要
セグメンテーションとインペイントを統合して仮想試着機能を実装する。

## 目標
- 人物写真と衣服写真の統合処理
- 自動着せ替えの完成

## 必要なファイル/コンポーネント
- `src/features/virtual-try-on.js`: 試着機能統合モジュール
- `src/utils/composition-utils.js`: 画像合成ユーティリティ

## 実装手順
1. `src/features/virtual-try-on.js` を作成し、セグメンテーションとインペイントを統合
2. `src/utils/composition-utils.js` を作成し、画像合成関数を実装
3. UI に2カラムレイアウトと試着ボタンを追加

## テスト方法
- 人物写真と衣服写真で試着結果が生成されることを確認
- 結果の品質とリアルさを評価

## 依存関係
- Task 05: Stable Diffusion Inpainting の実装

## 次のステップ
Task 07: マルチキャンバスUIの構築