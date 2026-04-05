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

    // Try multiple CDN sources (pin to a xenova build known to include image pipelines)
    const candidates = [
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@3.0.0-alpha.20/dist/transformers.min.js'
    ];

    let transformers = null;
    let lastError = null;
    for (const src of candidates) {
        try {
            log.info('Attempting to import transformers from', src);
            const mod = await import(src);

            transformers = mod.default || mod; // support both default and named exports
            if (transformers) {
                transformers.env.allowLocalModels = false;
                transformers.env.allowRemoteModels = true;
                transformers.env.fetch_options = {
                    credentials: 'omit',
                    mode: 'cors'
                };
                log.info('Transformers environment configured with omit-credentials');
                log.info('Transformers module imported successfully from', src);
                break;
            }
        } catch (e) {
            lastError = e;
            log.warn(`Import failed from ${src}: ${e?.message || e}`);
        }
    }

    if (!transformers) {
        log.error('Failed to import transformers module from CDN', lastError);
        throw lastError || new Error('Failed to import transformers module');
    }

    // Diagnostic: expose some useful info to console for debugging pipeline availability
    try {
        try { console.log('transformers exports:', Object.keys(transformers)); } catch (e) {}
        try { console.log('transformers.AutoPipelineForTextToImage:', transformers.AutoPipelineForTextToImage); } catch (e) {}
    } catch (e) {}

    // Configure environment defaults once (do this immediately so any subsequent model fetch
    // performed by the transformers runtime will use these fetch options)
    try {
        transformers.env = transformers.env || {};
    } catch (e) {
        log.warn('Failed to configure transformers.env:', e?.message || e);
    }

    // Configure ONNX backend preferences and set backend to either 'webgpu' or 'wasm'
    try {
        transformers.env.backends = transformers.env.backends || {};
        transformers.env.backends.onnx = transformers.env.backends.onnx || {};
        // disable wasm proxy fetch if present
        transformers.env.backends.onnx.wasm = transformers.env.backends.onnx.wasm || {};
        transformers.env.backends.onnx.wasm.proxy = false;
        // if WebGPU is available, hint transformers to prefer the onnx webgpu backend
        if (device === 'webgpu') {
            transformers.env.backends.onnx.webgpu = transformers.env.backends.onnx.webgpu || {};
            transformers.env.backends.onnx.webgpu.enabled = true;
        }
        // Instruct transformers to select the backend if the helper exists
        if (typeof transformers.env.setBackend === 'function') {
            await transformers.env.setBackend(device);
        }
        log.info('Transformers backend configured', device);
    } catch (e) {
        log.warn('Failed to set Transformers backend:', e?.message || e);
    }

    log.info('Transformers initialized successfully');
    return { transformers, device, gpuDevice };
}
