// src/features/generator.js
// Text-to-Image generator module with optional transformers pipeline or ONNX fallback.

import { createLogger } from '../utils/debug.js';

let generator = null;
const log = createLogger('generator');

// Helper: set Authorization header on transformers env for HF private models
async function _setTransformersAuth(transformers, token) {
    try {
        if (!transformers) return;
        transformers.env = transformers.env || {};
        transformers.env.fetch_options = transformers.env.fetch_options || { credentials: 'omit', mode: 'cors' };
        transformers.env.fetch_options.headers = Object.assign({}, transformers.env.fetch_options.headers || {}, { Authorization: 'Bearer ' + token });
        console.log('Transformers fetch_options Authorization header set');
    } catch (e) {
        console.warn('Failed to set transformers auth header:', e?.message || e);
    }
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

export async function initGenerator(transformers, device = null, options = {}) {
    if (!transformers && !options.useONNX) throw new Error('transformers instance required or set options.useONNX:true');
    if (generator) return generator;

    const dev = device ?? 'wasm';

    // 1) Try transformers pipeline if available
    if (transformers) {
        const tried = [];
        try {
            const modelId = options.modelId || 'onnx-community/sd-turbo-onnx';
            const progressCallback = options.progress_callback || ((p) => { try { log.info(`Generator progress: ${Math.round((p || 0) * 100)}%`); } catch (e) {} });
            // prefer fp16 on webgpu devices when possible
            const dtype = (dev === 'webgpu') ? (options.dtype || 'fp16') : (options.dtype || 'fp32');
            const pipelineOpts = Object.assign({ device: dev, dtype }, options.pipelineOptions || {});

            // HF token (can be passed via options.hfToken or read from window/localStorage)
            const hfToken = options.hfToken || (typeof window !== 'undefined' && (window.NPURE_HF_TOKEN || (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('npure_hf_token')))) || null;
            let authApplied = false;

            console.log(`Initializing generator pipeline with model: ${modelId} on device: ${dev} (dtype=${dtype})`);

            // Try several candidate task names — some builds expose `image-to-image` rather than `text-to-image`.
            const candidateTasks = ['image-to-image', 'text-to-image', 'image-to-image'];
            const tasks = Array.from(new Set(candidateTasks));
            let pipeline = null;

            for (const task of tasks) {
                try {
                    console.log(`Attempting to load pipeline with task "${task}"`);
                    pipeline = await transformers.pipeline(task, modelId, Object.assign({}, pipelineOpts, { progress_callback: progressCallback }));
                    if (pipeline) {
                        console.log(`Loaded pipeline for task ${task}`);
                        break;
                    }
                } catch (e) {
                    console.warn(`pipeline(${task}) failed:`, e?.message || e);
                    tried.push(`pipeline(${task}): ${e?.message || String(e)}`);
                    // If the failure looks like unauthorized and we have a token, set auth header and retry once
                    if (!authApplied && hfToken && /unauthori|401|Unauthorized/i.test(e?.message || '')) {
                        console.log('Unauthorized detected; applying HF token and retrying pipeline');
                        await _setTransformersAuth(transformers, hfToken);
                        authApplied = true;
                        try {
                            pipeline = await transformers.pipeline(task, modelId, Object.assign({}, pipelineOpts, { progress_callback: progressCallback }));
                            if (pipeline) {
                                console.log(`Loaded pipeline for task ${task} after applying auth`);
                                break;
                            }
                        } catch (e2) {
                            console.warn(`Retry after auth failed for ${task}:`, e2?.message || e2);
                            tried.push(`pipeline(${task})-auth: ${e2?.message || String(e2)}`);
                        }
                    }
                }
            }

            // Fallback: try the xenova AutoPipelineForTextToImage (single authoritative fallback)
            if (!pipeline) {
                try {
                    console.log('Falling back to AutoPipelineForTextToImage (single-class fallback)');
                    const AutoPipeline = transformers.AutoPipelineForTextToImage || transformers.AutoPipelineForImageToImage || transformers.StableDiffusionPipeline || null;
                    if (AutoPipeline && typeof AutoPipeline.from_pretrained === 'function') {
                        try {
                            pipeline = await AutoPipeline.from_pretrained(modelId, Object.assign({}, pipelineOpts, { progress_callback: progressCallback }));
                            if (pipeline) {
                                console.log('Loaded model via AutoPipeline.from_pretrained');
                            }
                        } catch (e) {
                            console.warn('AutoPipeline.from_pretrained failed:', e?.message || e);
                            tried.push(`AutoPipeline.from_pretrained: ${e?.message || String(e)}`);
                            // retry with auth if unauthorized and token present
                            if (!authApplied && hfToken && /unauthori|401|Unauthorized/i.test(e?.message || '')) {
                                console.log('Unauthorized detected during AutoPipeline.from_pretrained; applying HF token and retrying');
                                await _setTransformersAuth(transformers, hfToken);
                                authApplied = true;
                                try {
                                    pipeline = await AutoPipeline.from_pretrained(modelId, Object.assign({}, pipelineOpts, { progress_callback: progressCallback }));
                                } catch (e2) {
                                    console.warn('AutoPipeline.from_pretrained (auth retry) failed:', e2?.message || e2);
                                    tried.push(`AutoPipeline.from_pretrained-auth: ${e2?.message || String(e2)}`);
                                }
                            }
                        }
                    } else {
                        tried.push('AutoPipelineForTextToImage: unavailable');
                    }
                } catch (e) {
                    console.warn('AutoPipeline fallback failed:', e?.message || e);
                    tried.push(`auto-pipeline-check: ${e?.message || String(e)}`);
                }
            }

            if (pipeline) {
                console.log('Generator pipeline loaded');
                generator = { type: 'pipeline', impl: pipeline };
                log.info('Generator pipeline loaded');
                return generator;
            } else {
                console.log('No text/image pipeline available via transformers. Errors:', tried.join(' | '));
                const summary = tried.join(' | ') || 'unknown error';
                log.warn('Pipeline text-to-image unavailable, errors:', summary);
            }
        } catch (err) {
            console.log('Unexpected error during generator pipeline initialization:', err?.message || err);
            log.warn('Pipeline text-to-image unavailable, unexpected error:', err?.message || err);
        }
    }

    // Optionally fall back to HF Inference API if requested and token provided
    if (options.allowInferenceFallback) {
        const hfToken = options.hfToken || (typeof window !== 'undefined' && (window.NPURE_HF_TOKEN || (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('npure_hf_token')))) || null;
        if (hfToken) {
            console.log('Falling back to Hugging Face Inference API for text-to-image (inference fallback enabled)');
            generator = { type: 'inference_api', impl: { modelId: options.modelId || 'onnx-community/sd-turbo-onnx', token: hfToken, endpoint: options.hfInferenceEndpoint } };
            return generator;
        }
    }

    // No pipeline available via transformers; include diagnostic hint
    console.log('No supported text-to-image pipeline available via transformers. If you expected this to work, check the console for diagnostics about which pipeline/task names were attempted and any errors encountered during initialization.');
    throw new Error('No supported text-to-image pipeline available via transformers (see console for diagnostics)');
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
