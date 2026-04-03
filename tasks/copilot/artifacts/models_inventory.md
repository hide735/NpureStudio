# Models Inventory — NpureStudio

作成日: 2026-04-03

このドキュメントはプロジェクトで使用／参照されるモデルを一覧化したものです。まずは HF（Hugging Face）Hub 直結（GitHub Pages 配置／サーバ無し運用）を第一選択としています。

---

## 主要モデル（アプリ実行に必要）

1. Qwen2-VL 系 (画像→テキスト: 解析器 / ガイダンス生成)
   - 推奨 HF ID: `onnx-community/Qwen2-VL-2B-Instruct`
   - 代替候補: `onnx-community/Qwen2.5-VL`
   - 目的: 画像解析からJSON矩形、自然言語による詳細記述、インペイント用プロンプトや属性抽出を生成する。inpainting ワークフローの“解析器”。
   - 参照箇所: `src/features/inpainting.js`, `docs/詳細設計.md`
   - フォーマット: ONNX / HF Hub 配布を想定。大容量モデルのため、量子化（4/8-bit）やレイヤードロップ等の最適化を検討。
   - 運用注意: HF 側の CORS / 認可に依存する。GH Pagesで直接利用する場合、HF の配布が CORS を許可しているか確認すること。未対応なら CDN へ配置（公開モデルの場合）を検討。

2. SegFormer（セグメンテーション）
   - 推奨 HF ID: `Xenova/segformer-b0-finetuned-ade-512-512`
   - 目的: 人体／服領域のセグメンテーション（マスク生成）。
   - 参照箇所: `src/features/segmentation.js`, `src/app.js`
   - フォーマット: HF Hub 直結（transformers.js pipeline 'image-segmentation'）
   - 運用注意: 高精度が必要なら SAM（Segment Anything）など別モデルを検討（下記オプション参照）。

3. Vision Transformer（画像分類 / テスト用途）
   - 推奨 HF ID: `Xenova/vit-base-patch16-224`
   - 目的: 画像認識（UIの解析・ラベル表示など）。
   - 参照箇所: `src/features/image-recognition.js`, `src/app.js`
   - フォーマット: HF Hub 直結

---

## 推奨オプション / 補助モデル

4. CLIP（特徴抽出・マッチング補助）
   - 例モデル: `clip-vit-base-patch32`（HF上の適切なホスト名を選択）
   - 目的: 衣服特徴の埋め込み抽出、検索・類似度スコアの算出、Qwen に渡す補助特徴量。
   - 参照箇所: `docs/詳細設計.md`（特徴取得の設計）
   - 備考: Qwen が使えない場合のフォールバック手段として記載。

5. SAM（Segment Anything Model） — オプション
   - 目的: より高精度な切り抜き・インタラクティブなマスク作成が必要な場合の代替。
   - 参照箇所: `docs/詳細設計.md`
   - 備考: 実装・サイズに注意。HF上の適切なSAMバリアントを選ぶ（例: SAM-H/ViTなど）。

6. ONNX 小型 UNet（デモ用）
   - ローカル名: `tools/onnx_prototype/models/small_unet.onnx(.data)`
   - 目的: ONNX Runtime デモ / プロトタイプ（ブラウザで ONNX を試す用）。
   - 参照箇所: `src/demo_onnx.html`, `tools/onnx_prototype/`
   - 備考: 現状は external-data 形式で埋め込み .onnx が無い（protobuf parse error の原因）。デモ復旧は任意。

---

## 検証・導入チェックリスト（モデル単位）

- [ ] HF 上の該当モデルが公開されており、ブラウザからの GET に対して CORS を許可しているか確認する。
- [ ] 可能なら軽量版／量子化版（4-bit/8-bit）を用意し、モバイル向けに小型モデルをデフォルトにする UX を設計する。
- [ ] 必要に応じてモデルのシャーディング（分割）や段階的ロードを検討する（初回軽量ローダー→段階的に重いレイヤーを読み込む）。
- [ ] 非公開モデルを使う場合は、署名付きURL等の運用設計（ただし GH Pages のみでは困難）を用意する。

---

## 推奨次ステップ
1. 各モデルについてHFの該当ページを確認し、利用可能なフォーマット（ONNX/transformers）・サイズ・CORS設定を列挙する。
2. モデルごとに「軽量候補（モバイル）」と「高品質候補（デスクトップ）」をそれぞれ決める。
3. `src/features/*` の `pipeline(...)` 呼び出しで使うモデルIDを確定し、`tasks/copilot/artifacts/inits_log.txt` へ初回ロードログを保存して検証する。

---

ファイル出力: `tasks/copilot/artifacts/models_inventory.md`

必要であれば、この内容を元に GitHub Actions + CDN（S3/R2）への自動アップロードワークフローのテンプレートも作成します。
