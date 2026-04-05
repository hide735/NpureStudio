import { initWebGPU } from './webgpu.js';
import { createLogger } from '../utils/debug.js';
import { importWithCacheBuster } from '../utils/module-loader.js';
import { 
    pipeline, 
    AutoPipelineForText2Image, 
    env 
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

export async function initTransformers() {
    let device = 'wasm';
    let gpuDevice = null;
    const log = createLogger('transformers');

    // 1. WebGPU の初期化チェック
    if ('gpu' in navigator) {
        try {
            const gpu = await initWebGPU();
            gpuDevice = gpu.device;
            device = 'webgpu';
        } catch (e) {
            log.warn('WebGPU init failed, falling back to WASM:', e?.message || e);
            device = 'wasm';
        }
    }

    // 2. 401エラー対策 & ログ抑制の設定
    if (transformers.env) {
        transformers.env.allowLocalModels = false;
        // 認証情報を送らない設定をグローバルに適用
        transformers.env.fetch_options = { 
            credentials: 'omit', 
            mode: 'cors' 
        };
        // ONNX Runtime のワーニングを消す
        if (transformers.env.backends?.onnx) {
            transformers.env.backends.onnx.logLevel = 'error';
        }
    }

    log.info('Transformers initialized. Version:', transformers.version, 'Device:', device);

    // 3. app.js が期待している「4つのプロパティ」を持つオブジェクトを返却
    return { 
        transformers: { 
            pipeline, 
            AutoPipelineForText2Image, // これを入れないと generator.js で undefined になる
            RawImage,
            env 
        }, 
        device: device, 
        gpuDevice: gpuDevice
    };
}