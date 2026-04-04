## 🤖 Copilot への実装指示：NpureStudio AI パイプライン

### ステップ 2：WebGPU 画像生成モジュールの作成
**依頼内容：**
> `src/features/generator.js` を新規作成してください。
> - `transformers.js` v3 を使い、モデル `onnx-community/sd-turbo-onnx` を WebGPU でロードする `initGenerator` を実装して。
> - **重要設定:** `device: 'webgpu'`, `dtype: 'fp16'` を指定してください。
> - `generateImage(prompt)` 関数を作成。`num_inference_steps: 4`, `guidance_scale: 0.0` で高速生成し、戻り値として `RawImage` を返すようにして。
> - ロード進捗を監視する `progress_callback` を実装し、console に進捗率を出力してください。
> - メモリ解放用の `disposeGenerator` を実装してください。
