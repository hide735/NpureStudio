# WebGPU / Transformers.js v3 実装ガイドライン

このプロジェクトでは、Transformers.js v3 を使用して iPhone 17 Pro の NPU (WebGPU) を駆動させます。以下の公式ドキュメントに基づく制約を厳守してください。

### 1. WebGPU の初期化ルール
- `pipeline` を作成する際は、必ず `{ device: 'webgpu' }` を指定すること。
- iPhone (Safari) の NPU を最適に活用するため、可能な限り `{ dtype: 'fp16' }` を併用すること。
- ブラウザの制限により `navigator.gpu.requestAdapter()` が `null` を返す（No available adapters）場合があるため、必ず `wasm` へのフォールバック処理を実装すること。

### 2. メモリ管理 (iPhone 17 Pro 対策)
- 巨大なモデル（Stable Diffusion等）をロードする際は、`progress_callback` を使用して進捗をユーザーに通知すること。
- モデルの使用が終わったら、必ず `model.dispose()` を呼び出してメモリを解放すること。
- 初期化（pipelineの作成）はボタンクリックのたびに行わず、アプリケーションのライフサイクル内で一度だけ行う設計にすること。

### 3. リファレンスコード (v3 標準)
```javascript
const pipeline = await transformers.pipeline('task', 'model-id', {
    device: 'webgpu',
    dtype: 'fp16',
    progress_callback: (p) => console.log(`Loading: ${p}%`)
});
```

### 4. バージョン固定ルール
- パッケージ名は必ず `@huggingface/transformers` (v3) を使用すること。
- 旧パッケージ `@xenova/transformers` (v2) のコードは生成しないこと。
- WebGPU を有効にするためのプロパティ名は `device: 'webgpu'` である（v2には存在しない）。