// src/features/generator.js
// Text-to-Image generator module with optional transformers pipeline or ONNX fallback.

import { createLogger } from '../utils/debug.js';

let generator = null;
const log = createLogger('generator');

// Helper: set Authorization header on transformers env for HF private models
async function _setTransformersAuth(transformers, token) {
 //   try {
 //       if (!transformers) return;
 //       transformers.env = transformers.env || {};
 //       transformers.env.fetch_options = transformers.env.fetch_options || { credentials: 'omit', mode: 'cors' };
 //       transformers.env.fetch_options.headers = Object.assign({}, transformers.env.fetch_options.headers || {}, { Authorization: 'Bearer ' + token });
 //       console.log('Transformers fetch_options Authorization header set');
 //   } catch (e) {
 //       console.warn('Failed to set transformers auth header:', e?.message || e);
 //   }
    return;
}

// Helper: fallback to Hugging Face Inference API (returns Blob)
async function _hfInferenceImage(modelId, prompt, token, endpoint) {
    const url = endpoint || `https://api-inference.huggingface.co/models/${modelId}`;
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const body = JSON.stringify({ inputs: prompt });
    const resp = await fetch(url, { method: 'POST', headers, body });
    if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`HF Inference API failed: ${resp.status} ${txt}`);
    }
    const blob = await resp.blob();
    return blob;
}

/**
 * 初期化: transformers のインスタンスを受け取り、device とオプションを扱える互換的な実装
 * 呼び出し形式を2つサポートします:
 *  - initGenerator(transformers, options)
 *  - initGenerator(transformers, device, options)
 */
export async function initGenerator(transformers, deviceOrOptions = {}, maybeOptions = {}) {
    if (!transformers) return;
    if (generator) return generator;

    // Normalize parameters
    let device = 'webgpu';
    let options = {};
    if (typeof deviceOrOptions === 'string') {
        device = deviceOrOptions;
        options = maybeOptions || {};
    } else if (deviceOrOptions && typeof deviceOrOptions === 'object') {
        options = deviceOrOptions || {};
        device = options.device || 'webgpu';
    }

    const dtype = device === 'webgpu' ? (options.dtype || 'fp16') : (options.dtype || 'fp32');
    const pipelineOpts = Object.assign({ device, dtype }, options.pipelineOptions || {});
    const modelId = options.modelId || 'onnx-community/stable-diffusion-v1-5-ONNX';
    const progress_callback = options.progress_callback || ((p) => { try { log.info(`Generator progress: ${Math.round((p || 0) * 100)}%`); } catch (e) {} });

    log.info(`Initializing generator: ${modelId} on ${device}`);

    try {
        log.info('Stable Diffusion 用の特殊パイプラインを起動します...');

        // Attempts to initialize a text->image pipeline using available APIs.
        async function attemptPipeline(devToTry) {
            const tried = [];
            const dtypeToUse = devToTry === 'webgpu' ? 'fp16' : 'fp32';
            const opts = Object.assign({}, pipelineOpts, { device: devToTry, dtype: dtypeToUse });

            // Try authoritative AutoPipeline/StableDiffusion classes first
            const autoCandidates = [
                transformers.StableDiffusionPipeline,
                transformers.AutoPipelineForText2Image,
                transformers.AutoPipelineForTextToImage,
                transformers.AutoPipelineForImageToImage,
            ];

            for (const C of autoCandidates) {
                if (C && typeof C.from_pretrained === 'function') {
                    try {
                        const inst = await C.from_pretrained(modelId, Object.assign({}, opts, { progress_callback }));
                        if (inst) return inst;
                    } catch (e) {
                        tried.push(`auto(${C.name}): ${e?.message || String(e)}`);
                    }
                }
            }

            // If pipeline() function exists, try several likely task names
            if (typeof transformers.pipeline === 'function') {
                const pipelineTasks = ['text-to-image', 'image-to-image', 'stable-diffusion', 'image-generation'];
                for (const task of pipelineTasks) {
                    try {
                        const p = await transformers.pipeline(task, modelId, Object.assign({}, opts, { progress_callback }));
                        if (p) return p;
                    } catch (e) {
                        tried.push(`${task}: ${e?.message || String(e)}`);
                    }
                }
            }

            const e = new Error('Failed to initialize pipeline: ' + tried.join(' | '));
            e.details = tried;
            throw e;
        }

        // Try requested device first; if it fails due to adapter/unavailable, we'll retry with wasm below.
        const pipelineInstance = await attemptPipeline(device);
        generator = { type: 'pipeline', impl: pipelineInstance };
        return generator;
    } catch (err) {
        log.error('Generator init failed:', err?.message || err);

        const msg = (err && err.message) ? err.message : String(err || '');

        // If model files are missing on Hugging Face (404 / resolve/main), optionally fall back to HF Inference API
        if (/Could not locate file|resolve\/main|404|Not Found/i.test(msg)) {
            if (options && options.hf_token) {
                log.warn('Model files appear missing on HF; falling back to Hugging Face Inference API');
                generator = { type: 'inference_api', impl: { modelId, token: options.hf_token, endpoint: options.hf_endpoint } };
                return generator;
            } else {
                log.warn('Model files missing and no HF token provided; cannot fallback to Inference API');
            }
        }

        // If the failure was due to WebGPU adapter/backend availability, retry once with wasm
        if (device !== 'wasm' && /adapter|no available|webgpu adapter not found|no adapter|no available adapters/i.test(msg)) {
            log.warn('WebGPU adapter/backend error detected, retrying generator init with wasm', msg);
            try {
                const retryDevice = 'wasm';
                const pipelineInstance2 = await (async () => {
                    try {
                        return await (async function () {
                            // reuse attemptPipeline but for wasm
                            const dtypeToUse = 'fp32';
                            const opts = Object.assign({}, pipelineOpts, { device: retryDevice, dtype: dtypeToUse });

                            const autoCandidates = [
                                transformers.StableDiffusionPipeline,
                                transformers.AutoPipelineForText2Image,
                                transformers.AutoPipelineForTextToImage,
                                transformers.AutoPipelineForImageToImage,
                            ];
                            for (const C of autoCandidates) {
                                if (C && typeof C.from_pretrained === 'function') {
                                    try {
                                        const inst = await C.from_pretrained(modelId, Object.assign({}, opts, { progress_callback }));
                                        if (inst) return inst;
                                    } catch (e) {}
                                }
                            }
                            if (typeof transformers.pipeline === 'function') {
                                const pipelineTasks = ['text-to-image', 'image-to-image', 'stable-diffusion', 'image-generation'];
                                for (const task of pipelineTasks) {
                                    try {
                                        const p = await transformers.pipeline(task, modelId, Object.assign({}, opts, { progress_callback }));
                                        if (p) return p;
                                    } catch (e) {}
                                }
                            }
                            return null;
                        })();
                    } catch (e) { return null; }
                })();

                if (!pipelineInstance2) throw new Error('Failed to initialize pipeline on wasm retry');

                generator = { type: 'pipeline', impl: pipelineInstance2 };
                return generator;
            } catch (err2) {
                log.error('Generator init retry with wasm failed:', err2?.message || err2);
                throw err2;
            }
        }

        throw err;
    }
}

export async function generateImage(prompt, options = {}) {
    if (!generator) throw new Error('generator not initialized');
    log.info('Generating image for prompt:', prompt && prompt.slice ? prompt.slice(0, 120) : String(prompt));

    if (generator.type === 'pipeline') {
        try {
            const opts = Object.assign({ num_inference_steps: 4, guidance_scale: 7.5 }, options);
            if (options && options.progress_callback) opts.progress_callback = options.progress_callback;

            let out = null;
            if (typeof generator.impl === 'function') {
                out = await generator.impl(prompt, opts);
            } else if (generator.impl && typeof generator.impl.generate === 'function') {
                out = await generator.impl.generate(prompt, opts);
            } else if (generator.impl && typeof generator.impl.call === 'function') {
                out = await generator.impl.call(prompt, opts);
            } else {
                throw new Error('Unsupported pipeline implementation');
            }

            return await pipelineOutputToCanvas(out);
        } catch (e) {
            log.error('Pipeline generation failed:', e?.message || e);
            throw e;
        }
    }

    if (generator.type === 'inference_api') {
        try {
            const impl = generator.impl || {};
            const modelId = impl.modelId;
            const token = impl.token;
            const endpoint = impl.endpoint;
            if (!token) throw new Error('HF inference token missing for inference_api backend');
            const blob = await _hfInferenceImage(modelId, prompt, token, endpoint);
            return await pipelineOutputToCanvas(blob);
        } catch (e) {
            log.error('Inference API generation failed:', e?.message || e);
            throw e;
        }
    }

    throw new Error('Unknown generator backend');
}

async function pipelineOutputToCanvas(output) {
    const res = Array.isArray(output) ? output[0] : output;
    const drawToCanvas = (imgLike) => {
        const canvas = document.createElement('canvas');
        canvas.width = imgLike.width || imgLike.naturalWidth || imgLike.bitmapWidth || 512;
        canvas.height = imgLike.height || imgLike.naturalHeight || imgLike.bitmapHeight || 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgLike, 0, 0, canvas.width, canvas.height);
        return canvas;
    };

    if (typeof res === 'string' && res.startsWith('data:')) {
        const img = new Image();
        img.src = res;
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
        return drawToCanvas(img);
    }

    if (res && typeof res === 'object') {
        if (res.dataURL || res.data_url || res.base64) {
            const dataUrl = res.dataURL || res.data_url || ("data:image/png;base64," + res.base64);
            const img = new Image();
            img.src = dataUrl;
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
            return drawToCanvas(img);
        }
        if (res.image) return await pipelineOutputToCanvas(res.image);
        if (res.images && Array.isArray(res.images) && res.images.length) return await pipelineOutputToCanvas(res.images[0]);
        if (res instanceof HTMLCanvasElement) return res;
        if (typeof ImageBitmap !== 'undefined' && res instanceof ImageBitmap) return drawToCanvas(res);
        if (res instanceof Blob) {
            const bitmap = await createImageBitmap(res);
            return drawToCanvas(bitmap);
        }
    }

    if (typeof HTMLImageElement !== 'undefined' && res instanceof HTMLImageElement) {
        return drawToCanvas(res);
    }

    throw new Error('Unsupported generator output type: ' + (res && res.constructor ? res.constructor.name : typeof res));
}

// Note: ONNX runtime is provided by transformers.js internals now; manual CDN loader removed.

export async function disposeGenerator() {
    try {
        if (generator) {
            if (generator.type === 'pipeline' && typeof generator.impl.dispose === 'function') {
                await generator.impl.dispose();
            }
        }
    } catch (e) {
        console.warn('[Npure][generator] dispose failed:', e?.message || e);
    }
    generator = null;
}

export function isGeneratorInitialized() { return generator !== null; }
