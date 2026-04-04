import { initWebGPU } from './webgpu.js';
import { createLogger } from '../utils/debug.js';

// Initialize Transformers.js and choose appropriate backend (webgpu|wasm)
export async function initTransformers() {
    let device = 'wasm';
    let gpuDevice = null;

    const log = createLogger('transformers');
    if ('gpu' in navigator) {
        try {
            const gpu = await initWebGPU(); // may throw
            gpuDevice = gpu.device;
            device = 'webgpu';
            log.debug('WebGPU initialized', gpuDevice);
        } catch (e) {
            log.warn('WebGPU init failed, falling back to WASM:', e?.message || e);
            device = 'wasm';
        }
    }

    try {
        log.info('Importing transformers.js from CDN');
        const transformers = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3');
        if (!transformers) {
            throw new Error('Failed to import transformers module');
        }

        // Configure environment defaults once
        transformers.env.allowLocalModels = false;
        transformers.env.allowRemoteModels = true;
        transformers.env.fetch_options = { credentials: 'omit', mode: 'cors' };

        // Set backend to either 'webgpu' or 'wasm'
        try {
            transformers.env.backends.onnx.wasm.proxy = false;
            // await transformers.env.setBackend(device);
            log.info('Transformers backend set', device);
        } catch (e) {
            log.warn('Failed to set Transformers backend:', e?.message || e);
        }

        log.info('Transformers initialized successfully');
        return { transformers, device, gpuDevice };
    } catch (err) {
        console.error('Transformers.js initialization failed', err);
        throw err;
    }
}
