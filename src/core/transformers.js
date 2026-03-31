import { initWebGPU } from './webgpu.js';

// @xenova/transformers is expected to be installed via npm and bundled.
// This module initializes Transformer.js for WebGPU usage.

export async function initTransformers() {
    const { device } = await initWebGPU();

    try {
        // モジュールの読み込みを遅延させておく
        const transformers = await import('@xenova/transformers');

        if (!transformers) {
            throw new Error('Failed to import transformers module');
        }

        // Safari/NPU 向けの候補設定。実際はモデルと runtimeOptions の設定を調整
        await transformers.env.setBackend('webgpu');

        return { transformers, device };
    } catch (err) {
        console.error('Transformers.js initialization failed', err);
        throw err;
    }
}
