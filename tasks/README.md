# NpureStudio 実装タスク一覧

このフォルダには、NpureStudio の実装ステップを順次実行可能なタスクとしてドキュメント化しています。各タスクは独立しており、依存関係を考慮して順番に実装してください。

## タスク一覧

1. **[Task 01: プロジェクト基本構造のセットアップ](task-01-project-setup.md)**
   - 基本的なプロジェクト構造の構築

2. **[Task 02: Transformers.js の導入](task-02-transformers-setup.md)**
   - Transformers.js v3 のインストールと初期化

3. **[Task 03: 基本画像認識テスト](task-03-basic-image-recognition.md)**
   - 画像分類モデルのテスト

4. **[Task 04: SAM セグメンテーションの実装](task-04-sam-segmentation.md)**
   - Segment Anything Model の実装

5. **[Task 05: Stable Diffusion Inpainting の実装](task-05-sd-inpainting.md)**
   - インペイント機能の実装

6. **[Task 06: 試着機能の統合](task-06-virtual-try-on-integration.md)**
   - 仮想試着機能の完成

7. **[Task 07: マルチキャンバスUIの構築](task-07-multi-canvas-ui.md)**
   - マルチキャンバスUIの実装

8. **[Task 08: UI コンポーネントの実装](task-08-ui-components.md)**
   - 再利用可能なUIコンポーネント

9. **[Task 09: モバイル最適化](task-09-mobile-optimization.md)**
   - iPhone Safari 最適化

10. **[Task 10: テストとデプロイ](task-10-testing-deployment.md)**
    - 最終テストとGitHub Pages デプロイ

## 実装ガイドライン

- 各タスクを順番に実行してください
- 依存関係を確認してから次のタスクに進んでください
- 各タスク完了後にテストを実行し、動作を確認してください
- 問題が発生した場合は、前のタスクに戻って修正してください

## 参考資料

- [概要設計.md](../docs/概要設計.md)
- [詳細設計.md](../docs/詳細設計.md)

## 最近の変更と運用メモ

- `src/demo_onnx.html` の ONNX デモを一時的に無効化しました。
   - 理由: リポジトリ内の ONNX モデルが外部データ形式で欠けており、ブラウザでの読み込み時に protobuf 解析エラーが発生しました。
   - 必要であれば `tools/onnx_prototype/export_onnx.py` でモデルを再生成し、`tools/onnx_prototype/embed_external_data.py` で *_embedded.onnx を作成してください。

- `src/features/inpainting.js` を Stable Diffusion 直接実行から切り替え、
   Qwen2-VL 系モデルによる「解析 → 矩形座標抽出」フローに置き換えました。
   - 解析モデルは `transformers.pipeline('image-to-text', ...)` を想定しています。
   - 抽出した矩形に対しては WebGPU の利用を試み、未対応や失敗時は軽量な Canvas ダウンサンプリング／アップサンプリングで補正します。
   - 戻り値は `HTMLCanvasElement` になっており、既存の `src/app.js` の呼び出し箇所と互換性があります。

### 今後の推奨作業

- すぐに開発を進める場合は ONNX デモを無視して `src` 側の機能（Qwen2-VL フロー、UI）を優先してください。
- ONNX デモを復旧する場合の手順（簡潔）:
   1. Python 仮想環境を作成して依存をインストール (`tools/onnx_prototype/requirements.txt`)。
   2. `python tools/onnx_prototype/export_onnx.py --output tools/onnx_prototype/models/small_unet.onnx`
   3. `python tools/onnx_prototype/embed_external_data.py tools/onnx_prototype/models/small_unet.onnx` を実行し、`small_unet_embedded.onnx` を生成。
   4. `src/demo_onnx.html` を元に戻してデモを有効化。

### ローカル確認コマンド

開発サーバ起動（静的ファイルを提供）:
```powershell
npx http-server . -p 8080
```

問題がなければブラウザで `http://localhost:8080/src/` を開き、NpureStudio UI を操作してください。