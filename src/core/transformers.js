import { initWebGPU } from './webgpu.js';
import { createLogger } from '../utils/debug.js';
import { importWithCacheBuster } from '../utils/module-loader.js';

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

    // Determine dev mode for cache-busting
    const isDev = (() => {
        try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('npure_debug') === '1') return true;
            if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return true;
        } catch (e) {}
        return false;
    })();

    // Candidate builds: prefer local bundled build, then xenova dist, then upstream CDN builds as last resort
    const candidates = [
        // Prefer xenova dist builds which expose image pipelines useful for SD
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js',
        new URL('../../assets/transformers.min.js', import.meta.url).href,
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@3.0.0-alpha.20/dist/transformers.min.js',
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js'
    ];

    let transformers = null;
    let lastError = null;
    for (const src of candidates) {
        try {
            log.info('Attempting to import transformers from', src);
            let mod = null;
            try {
                mod = await importWithCacheBuster(src, { cacheBuster: isDev, useVersion: true });
            } catch (e) {
                log.warn('importWithCacheBuster failed, trying direct import for', src, e?.message || e);
                mod = await import(src);
            }

                const tm = mod?.default || mod;
            if (tm) {
                // Configure environment defaults without reassigning module namespace
                try {
                    const envObj = tm.env;
                    if (envObj && typeof envObj === 'object') {
                        envObj.allowLocalModels = false;
                        envObj.allowRemoteModels = true;
                        envObj.fetch_options = Object.assign({}, envObj.fetch_options || {}, { credentials: 'omit', mode: 'cors' });
                        envObj.backends = envObj.backends || {};
                        envObj.backends.onnx = envObj.backends.onnx || {};
                        envObj.backends.onnx.wasm = envObj.backends.onnx.wasm || {};
                        envObj.backends.onnx.wasm.proxy = false;
                        if (device === 'webgpu') {
                            envObj.backends.onnx.webgpu = envObj.backends.onnx.webgpu || {};
                            envObj.backends.onnx.webgpu.enabled = true;
                        }
                        if (typeof envObj.setBackend === 'function') {
                            try { await envObj.setBackend(device); } catch (e) { log.warn('env.setBackend failed:', e?.message || e); }
                        }
                    } else if (typeof tm.setEnv === 'function') {
                        try {
                            await tm.setEnv({ allowLocalModels: false, fetch_options: { credentials: 'omit', mode: 'cors' } });
                        } catch (e) {
                            log.warn('tm.setEnv failed:', e?.message || e);
                        }
                    }
                } catch (e) {
                    log.warn('Failed to configure transformers.env after import:', e?.message || e);
                }

                // Expose the loaded module under `transformers`
                transformers = tm;

                log.info('Transformers module imported successfully from', src);
                break;
            }
        } catch (e) {
            lastError = e;
            log.warn(`Import failed from ${src}: ${e?.message || e}`);
        }
    }

    if (!transformers) {
        log.error('Failed to import transformers module from any candidate', lastError);
        throw lastError || new Error('Failed to import transformers module');
    }

    try { console.log('transformers exports:', Object.keys(transformers)); } catch (e) {}

    log.info('Transformers initialized. Device:', device);

    return { transformers, device, gpuDevice };
}