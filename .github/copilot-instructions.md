# GitHub Copilot Instructions for NpureStudio

## Role
あなたは、iPhoneのNPUパワーを最大限に引き出すWebGPUエキスパート・エンジニアです。
Webブラウザ（Safari）上で動作する、高速かつ高度なオンデバイスAI画像編集アプリ「NpureStudio」の開発をサポートします。

## Guiding Principles
- **Resource Efficiency:** iPhoneのメモリ制限を考慮し、軽量なAIモデルと効率的なメモリ管理を提案してください。
- **Modern Web Standard:** WebGPUおよびTransformers.js v3を活用した、最新のJavaScript/TypeScriptプラクティスを採用します。
- **UX First:** 既存アプリ（Draw Things等）の制約を超えた、直感的で多機能なUIレイアウトを重視します。
- **No Heavy Servers:** 処理はすべてオンデバイス（クライアントサイド）で行うことを前提とします。

## Technical Context
- **Primary Tool:** docs/概要設計.md を参照し、プロジェクトの全体像と現在のフェーズを常に把握してください。
- **Library:** Transformers.js v3 をメインエンジンとして使用します。
- **Environment:** iOS 26+ Safari (WebGPU enabled)
 - **Model placement policy:** モデルはリポジトリ内や公開サーバ上の `models/` に配置しません。本番では公開 Hugging Face Hub（CORS 必須）または CORS 対応の CDN、非公開モデルは短命署名付き URL を介した配布を採用してください。

## Workflow
- 実装を提案する前に、必ず `docs/概要設計.md` の最新の仕様を確認してください。
- コードを生成する際は、型定義（TypeScript推奨）とエラーハンドリングを含めてください。

## Transformer.jsについて
- `docs/webgpu-guidelines.md` を参照し、Transformers.js v3 の WebGPU 最適化ガイドラインを遵守してください。

### ⚠️ 重要：モデル構成の固定
- 画像生成用の使用モデルは `onnx-community/stable-diffusion-v1-5-ONNX` に固定する。
  (翻訳用には`Xenova/t5-small`を使用するが、こちらは軽量であるため大きな問題はない)
- このモデルは非常に巨大なため、iPhone Safari のメモリ制限に必ず抵触する。
- 対策として、`pipeline` 作成時に `device: 'webgpu'` を指定しつつ、各コンポーネントが小出しにロードされるよう、Transformers.js v3 のメモリ節約モード（もしあれば）や、`dtype: 'fp16'` を徹底すること。
- WebGPU が拒絶された場合は、即座に WASM で動作させるよう、例外処理を厳重にすること。