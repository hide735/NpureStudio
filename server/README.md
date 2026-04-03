# NpureStudio Analyzer Server

目的: 開発やオプション機能としてローカル／サーバ側で解析を行うための雛形を提供します。**注意:** 本プロジェクトの本番配備は GitHub Pages（静的ホスト）を想定しており、サーバは本番必須ではありません。サーバ実装はあくまで開発／デバッグ用、あるいは非公開モデルを扱う特殊運用時の補助です。

準備:
1. モデルをローカルにダウンロードする（例: `tools/download_hf_model.ps1` を使用）:

```powershell
$env:HUGGINGFACE_HUB_TOKEN = "hf_xxx"
.\..\tools\download_hf_model.ps1 -Model "onnx-community/Qwen2-VL-2B-Instruct" -OutDir "models/onnx-community/Qwen2-VL-2B-Instruct"
```

2. サーバの依存をインストール:

```bash
cd server
npm install
```

3. サーバを起動:

```bash
npm start
```

使い方:
- 健康チェック: `GET /health`
- 画像解析: `POST /analyze` (multipart form, field `image`, optional `prompt`)
  - レスポンス: JSON でパイプラインの出力を返します。

注意:
- 本 README のサーバは開発用／オプションです。GitHub Pages のみで公開する本番では基本的に使わない設計としてください。
- 本番でサーバを運用する場合は認証、レート制限、キャッシュ、モデル更新、ログ監視を必ず実装してください。
- モデルファイルは公開リポジトリに含めないでください。公開配布は CDN／オブジェクトストレージを使用し、非公開モデルは別途安全な配布手順を用意してください。
