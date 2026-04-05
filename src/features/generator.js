// src/features/generator.js
// Text-to-Image generator module with optional transformers pipeline or ONNX fallback.

import { createLogger } from '../utils/debug.js';

let generator = null;
const log = createLogger('generator');

export async function initGenerator(transformers, device = null, options = {}) {
    if (!transformers && !options.useONNX) throw new Error('transformers instance required or set options.useONNX:true');
    if (generator) return generator;

    const dev = device ?? 'wasm';

    // 1) Try transformers pipeline if available
    if (transformers) {
        try {
            const modelId = options.modelId || 'onnx-community/sd-turbo-onnx';
            const progressCallback = (p) => {
                try { log.info(`Generator progress: ${Math.round((p || 0) * 100)}%`); } catch (e) {}
            };
            const pipelineOpts = Object.assign({ device: dev, dtype: 'fp16' }, options.pipelineOptions || {});
            const pipeline = await transformers.pipeline('text-to-image', modelId, Object.assign({}, pipelineOpts, { progress_callback: progressCallback }));
            generator = { type: 'pipeline', impl: pipeline };
            log.info('Generator pipeline loaded');
            return generator;
        } catch (err) {
            log.warn('Pipeline text-to-image unavailable, falling back to ONNX if requested:', err?.message || err);
        }
    }

    // 2) Fallback to ONNX runtime if requested
    if (!options.onnxModelUrl) options.onnxModelUrl = 'tools/onnx_prototype/models/small_unet.onnx';
    const onnxUrl = options.onnxModelUrl;
    try {
        const ort = await loadOrtRuntime();
        log.info('onnxruntime-web loaded', !!ort);
        const session = await createOnnxSession(ort, onnxUrl);
        generator = { type: 'onnx', impl: { ort, session } };
        log.info('ONNX generator initialized using ' + onnxUrl);
        return generator;
    } catch (e) {
        log.error('Failed to initialize ONNX generator:', e?.message || e);
        throw e;
    }
}

export async function generateImage(prompt, options = {}) {
    if (!generator) throw new Error('generator not initialized');
    log.info('Generating image for prompt:', prompt && prompt.slice ? prompt.slice(0, 120) : String(prompt));

    if (generator.type === 'pipeline') {
        try {
            const out = await generator.impl(prompt, options);
            return await pipelineOutputToCanvas(out);
        } catch (e) {
            log.error('Pipeline generation failed:', e?.message || e);
            throw e;
        }
    }

    if (generator.type === 'onnx') {
        const { ort, session } = generator.impl;
        const inputName = (session.inputNames && session.inputNames[0]) || (session.inputMetadata && Object.keys(session.inputMetadata)[0]);
        const outputName = (session.outputNames && session.outputNames[0]) || (session.outputMetadata && Object.keys(session.outputMetadata)[0]);
        if (!inputName) throw new Error('ONNX session input name not found');

        const H = options.height || 128;
        const W = options.width || 128;
        const C = 4;
        const N = 1;
        const len = N * C * H * W;
        const data = new Float32Array(len);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2.0) - 1.0;

        const tensor = new ort.Tensor('float32', data, [N, C, H, W]);
        const feeds = {};
        feeds[inputName] = tensor;

        const results = await session.run(feeds);
        const outTensor = results[outputName] || results[Object.keys(results)[0]];
        if (!outTensor) throw new Error('ONNX session returned no outputs');

        const dims = outTensor.dims || outTensor.shape || [];
        let outData = outTensor.data || outTensor;
        let outH = H, outW = W, outC = 3;
        if (dims && dims.length >= 3) {
            if (dims.length === 4) {
                outC = dims[1]; outH = dims[2]; outW = dims[3];
            } else if (dims.length === 3) {
                outC = dims[0]; outH = dims[1]; outW = dims[2];
            }
        }

        const pixels = new Uint8ClampedArray(outW * outH * 4);
        for (let y = 0; y < outH; y++) {
            for (let x = 0; x < outW; x++) {
                const idx = y * outW + x;
                const r = getOutValue(outData, 0, outC, outH, outW, idx);
                const g = getOutValue(outData, 1, outC, outH, outW, idx);
                const b = getOutValue(outData, 2, outC, outH, outW, idx);
                const base = idx * 4;
                pixels[base] = clampTo255((r + 1) * 0.5 * 255);
                pixels[base + 1] = clampTo255((g + 1) * 0.5 * 255);
                pixels[base + 2] = clampTo255((b + 1) * 0.5 * 255);
                pixels[base + 3] = 255;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d');
        const imageData = new ImageData(pixels, outW, outH);
        ctx.putImageData(imageData, 0, 0);
        return canvas;
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

async function loadOrtRuntime() {
    if (typeof window === 'undefined') throw new Error('ONNX runtime requires browser environment');
    if (window.ort) return window.ort;

            const CDN_WEBGL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.webgl.min.js';
            const CDN_WASM = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.wasm.min.js';

    return new Promise((resolve, reject) => {
        const tryLoad = (url, fallbackUrl) => {
            const s = document.createElement('script');
            s.src = url;
            s.crossOrigin = 'anonymous';
            s.onload = () => {
                if (window.ort) return resolve(window.ort);
                if (fallbackUrl) return tryLoad(fallbackUrl, null);
                return reject(new Error('onnxruntime loaded but window.ort missing'));
            };
            s.onerror = () => {
                if (fallbackUrl) return tryLoad(fallbackUrl, null);
                return reject(new Error('Failed to load onnxruntime-web from CDN'));
            };
            document.head.appendChild(s);
        };
        tryLoad(CDN_WEBGL, CDN_WASM);
    });
}

async function createOnnxSession(ort, url) {
    if (!ort || !ort.InferenceSession) throw new Error('Invalid ONNX runtime');
    try {
        const session = await ort.InferenceSession.create(url);
        return session;
    } catch (e) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch ONNX model: ' + res.status);
        const ab = await res.arrayBuffer();
        const session = await ort.InferenceSession.create(ab);
        return session;
    }
}

function getOutValue(data, channel, C, H, W, pixelIndex) {
    if (!data) return 0;
    const planeSize = H * W;
    const index = channel * planeSize + pixelIndex;
    return data[index] ?? 0;
}

function clampTo255(v) {
    const n = Math.round(Math.max(0, Math.min(255, v)));
    return n;
}

export async function disposeGenerator() {
    try {
        if (generator) {
            if (generator.type === 'pipeline' && typeof generator.impl.dispose === 'function') {
                await generator.impl.dispose();
            }
            if (generator.type === 'onnx' && generator.impl && generator.impl.session && typeof generator.impl.session.dispose === 'function') {
                try { generator.impl.session.dispose(); } catch (e) {}
            }
        }
    } catch (e) {
        console.warn('[Npure][generator] dispose failed:', e?.message || e);
    }
    generator = null;
}

export function isGeneratorInitialized() { return generator !== null; }
