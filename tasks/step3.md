## 🤖 Copilot への実装指示：NpureStudio AI パイプライン

### ステップ 3：`app.js` への統合と UI 接続
**依頼内容：**
> 既存の `src/app.js` を更新して、翻訳と画像生成のフローをつなげてください。
> 1. `translator.js` と `generator.js` から各関数をインポートする。
> 2. `tryOnBtn` のクリックイベント（または新しい生成ボタン）で以下のフローを実行して。
>    - `this.updateStatus('翻訳中...')`
>    - `const enPrompt = await translate(inputField.value)`
>    - `this.updateStatus('画像生成中 (WebGPU)...')`
>    - `const resultImage = await generateImage(enPrompt)`
>    - `resultImage` を `this.canvas` に描画する（`image-utils.js` 等のヘルパーが必要なら提案して）。
> 3. iPhone のメモリ制限に配慮し、一連の処理が終わったら `dispose` を呼ぶか、再利用するかを適切に制御して。
