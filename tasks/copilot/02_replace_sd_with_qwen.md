# 02 Replace Stable Diffusion Inpainting with Qwen2-VL Analyzer

目的: SD のブラウザ直接実行で発生する認証・容量問題を回避し、解析ベースのワークフローへ移行する。

やることリスト:
- `src/features/inpainting.js` の既存コードをバックアップする
- `initInpainting()` を Qwen 系 `image-to-text` pipeline を呼ぶように差し替える
- モデル候補リスト（ローカル→リモート）を実装する
- エラー時のフォールバック（次候補へ試行・わかりやすいエラーメッセージ）を実装する
- 変更は小さなコミット単位で行う

実装メモ:
- `transformers.pipeline('image-to-text', model, { device })` を用いて解析モデルをロードします。
- 本番（GitHub Pages）では **Hugging Face Hub の公開モデルを直接指定**する方式とします（例: `onnx-community/Qwen2-VL-2B-Instruct`）。
- ブラウザが初回に HF からモデルをダウンロードし、IndexedDB 等へキャッシュするため、運用者側でモデルを Git リポジトリに置く必要はありません。
- WebGPU が利用可能なら軽量 GPU パス（縮小→拡大で疑似ブラー）を試し、失敗時は Canvas フォールバックを使います。

検証手順:
1. 依存をインストールしてローカルサーバを起動します:

```powershell
npm install
npx http-server . -p 8080
```
```
別コンソールで
npx local-ssl-proxy --source 9000 --target 8080
```

2. ブラウザでアプリを開き、DevTools のコンソールを確認します。期待ログ例:

- Loaded analyzer model: models/onnx-community/Qwen2-VL-2B-Instruct
- Using device: webgpu

注: 公開 HF モデルを使う場合、モデルホスト側（Hugging Face）が CORS を正しく設定していることが必要です。CORS エラーが出る場合は、ユーザー側のブラウザで直接読み込めないため、代替の公開 CDN（S3/R2）に配置するか、開発者がローカルでの検証手順を使ってください。

3. `initInpainting()` が analyzer オブジェクトを返すことを確認します（デバッガやコンソール出力で確認）。

コミット例:

```bash
git add src/features/inpainting.js
git commit -m "feat(inpainting): switch to Qwen image-to-text analyzer with local/remote fallback"
```

成果物:
- `src/features/inpainting.js` の変更コミット
- `tasks/copilot/artifacts/inits_log.txt` — 実行時にブラウザコンソールからコピーするログを保存するためのプレースホルダ

備考:
- 実行環境によってはモデルのロードに時間がかかります。初回ロードは特に注意してください。
- `transformers` の API 仕様が差異ある場合（RawImage クラス名など）、`src/core/transformers.js` を参照して調整してください。

---

モデルをローカルにダウンロードして CORS/認可問題を回避する手順:

1. Hugging Face トークンを準備する（必要なモデルが非公開または認可が必要な場合）。
2. PowerShell で以下を実行して `huggingface_hub` をインストールします:

```powershell
pip install huggingface_hub
```

3. スクリプトを使ってモデルをダウンロードします（例）:

```powershell
$env:HUGGINGFACE_HUB_TOKEN = "hf_xxx"
.\tools\download_hf_model.ps1 -Model "onnx-community/Qwen2-VL-2B-Instruct" -OutDir "models/onnx-community/Qwen2-VL-2B-Instruct"
```

4. ダウンロードが完了したら、ブラウザで `https://localhost:9000` を開き挙動を確認してください。

備考: トークンを直接ブラウザへ渡すのは危険です。可能ならサーバ側でダウンロードして配布する運用を採用してください。

運用方針（クライアント側でモデルを保持する）:

このプロジェクトの想定運用は「各クライアント（ブラウザ）が必要なモデルをダウンロードしてローカルで保持する」方式です。サーバ常駐は必須ではありません。以下の点をドキュメント化します。

- モデルの取得とキャッシュ:
	- `transformers.js` はブラウザ側でモデルを取得しキャッシュ（IndexedDB など）する機能を持ちます。`from_pretrained`/`pipeline` を使うと、初回取得後はブラウザ内に保存されます。
	- 可能なら CORS が有効な公開ホスト（CDN）から配布してください。Hugging Face のモデルを直接参照する場合、対象モデルが CORS を許可している必要があります。

- セキュリティと認可の注意:
	- 非公開モデルをブラウザで直接使うことは推奨しません。ブラウザにトークンを置くと漏洩リスクがあるためです。
	- 非公開モデルをどうしても使う場合は、運用者が発行する短命な署名付き URL（プリサイン）をクライアントに渡す方法が現実的ですが、これには最小限のサーバ機能が必要です。

- 開発者向けワークフロー:
	- 開発中は `tools/download_hf_model.ps1` を使って手元にモデルをダウンロードし、同一オリジン（`http-server` など）で提供してブラウザからロードすると素早く検証できます。ただし、配布用の公開リポジトリにはモデルを含めないでください。

- 推奨の本番設計パターン:
 1. 公開モデルであれば、CORS 設定されたホスティング（CDN）に置き、クライアントが直接ダウンロードしてキャッシュさせる。
 2. 非公開モデルの場合は、短命の署名付き URL を発行する小さな認証サービスを用意し、それを用いてクライアントが一時的にモデルをダウンロードしてキャッシュする（サーバは最小限に留める）。

注意: ブラウザ側キャッシュの挙動はブラウザと `transformers.js` の実装に依存します。大容量モデルはモバイル環境で問題を起こすため、モデルサイズと分割（sharding）について設計時に検討してください。

---

**本番配備（GitHub Pages のみ / HF Hub 直結優先）**

重要: 本番は GitHub Pages のみで公開する前提です。できる限りサーバを作らず、クライアントが直接 Hugging Face Hub の公開 ONNX モデルをダウンロードしてキャッシュする運用を第一選択とします。

優先戦略（HF Hub 直結）:
- `transformers.js` 側にモデル ID（例: `onnx-community/Qwen2-VL-2B-Instruct`）を指定し、クライアントが直接 HF Hub から取得します。
- HF による公開配布が可能であれば、追加の CDN 配置は不要です。

実装メモ（クイック）:
```js
// 例: HF Hub 直結で pipeline を作る
const analyzer = await transformers.pipeline('image-to-text', 'onnx-community/Qwen2-VL-2B-Instruct', { device: 'webgpu' });
```

注意点:
- Hugging Face 上の該当モデルが CORS を許可している必要があります。CORS エラーが発生する場合は、代替として公開 CDN（S3/R2）に配置するか、ユーザーにローカル検証手順を案内してください。
- 非公開モデルはブラウザにトークンを置かない限り利用できません。非公開モデルを利用する場合は別途運用方針（署名付き URL 等）を設計してください。

まとめ:
- 本番（GitHub Pages）では HF Hub 直結を優先し、CDN 配置は HF 側が CORS 非対応だった場合の代替としてください。

