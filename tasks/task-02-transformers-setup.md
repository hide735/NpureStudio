# Task 02: Transformers.js の導入

## 概要
Transformers.js v3 をプロジェクトに導入し、基本的なセットアップを行う。

## 目標
- Transformers.js のインストールと初期化
- WebGPU との統合確認

## 必要なファイル/コンポーネント
- `src/core/transformers.js`: Transformers.js の初期化モジュール
- `src/core/webgpu.js`: WebGPU 初期化モジュール

## 実装手順
1. npm install @xenova/transformers を実行
2. `src/core/webgpu.js` を作成し、WebGPU デバイス取得を実装
3. `src/core/transformers.js` を作成し、Transformers.js を WebGPU で初期化
4. index.html にスクリプトを追加

## テスト方法
- ブラウザコンソールで WebGPU が利用可能か確認
- Transformers.js のロードが成功することを確認

## 依存関係
- Task 01: プロジェクト基本構造のセットアップ

## 次のステップ
Task 03: 基本画像認識テスト