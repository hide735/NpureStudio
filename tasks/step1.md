## 🤖 Copilot への実装指示：NpureStudio AI パイプライン

### ステップ 1：軽量翻訳モジュールの作成
**依頼内容：**
> `src/features/translator.js` を新規作成してください。
> - `transformers.js` v3 を使用し、モデル `Xenova/t5-small` をロードする `initTranslator` を実装して。
> - `translate(text)` 関数を作成し、日本語を英語に翻訳する処理を記述して（Task: `translation_ja_to_en`）。
> - iPhone のメモリ節約のため、使用後にパイプラインを破棄する `disposeTranslator` も含めてください。
> - `src/utils/debug.js` の `createLogger` を使ってログを出力してください。
