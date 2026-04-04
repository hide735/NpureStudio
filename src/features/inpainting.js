// src/features/inpainting.js
// Qwen 系の image-to-text を解析器として使う軽量 inpainting ワークフロー

import { initWebGPU } from '../core/webgpu.js';
import { generateMask } from './segmentation.js';
import { htmlImageToRawImage } from '../utils/image-utils.js';
import { createLogger } from '../utils/debug.js';

let analyzer = null;

// Preflight check: can the browser fetch essential model files from HF Hub?
async function canFetchHFModel(modelId) {
    // Local paths (developer) are assumed accessible
    if (!modelId || modelId.startsWith('models/')) {
        console.log('[inpainting][preflight] model considered local or empty, skipping fetch checks:', modelId);
        return true;
    }

    const files = ['config.json', 'tokenizer.json', 'preprocessor_config.json'];
    let saw200 = false;
    for (const f of files) {
        const url = `https://huggingface.co/${modelId}/resolve/main/${f}?nc=${Date.now()}`;
        try {
            const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
            // Note: when CORS blocks, fetch may throw or return opaque responses; log as much as possible.
            console.log(`[inpainting][preflight] ${modelId}/${f} -> status=${res.status} ok=${res.ok} type=${res.type}`);
            if (res.ok) {
                saw200 = true;
            }
            if (res.status === 401 || res.status === 403) {
                console.warn(`[inpainting][preflight] Unauthorized for ${modelId}/${f} (${res.status})`);
                return false;
            }
            // keep trying other files to collect logs
        } catch (err) {
            console.warn(`[inpainting][preflight] Fetch error for ${modelId}/${f}:`, err?.message || err);
            return false;
        }
    }
    if (!saw200) {
        console.warn(`[inpainting][preflight] No accessible files found for ${modelId} (all non-200)`);
    }
    return saw200;
}

export async function initInpainting(transformers, device = null) {
    if (analyzer) return analyzer;

    console.log('Initializing Qwen analyzer (image-to-text) for inpainting...');
    const dev = device || (navigator.gpu ? 'webgpu' : 'wasm');
    console.log(`Using device: ${dev}`);

    // リモートの公開モデルを優先的に試す。これらは通常、CORS 設定がされていてブラウザからアクセス可能なはず。
    const remoteModelCandidates = [
        'Xenova/vit-gpt2-image-captioning',
        'Xenova/blip-image-captioning-base',
        // Qwen candidates are kept as last-resort (may require auth or not be supported in-browser)
        // 'onnx-community/Qwen2.5-VL',
        // 'onnx-community/Qwen2-VL-2B-Instruct'
    ];

    // NOTE: this project does NOT place models locally under `models/` for production.
    // We rely on public, CORS-enabled HF Hub models or CORS-enabled CDN / signed-URL flows.

    let lastError = null;

    const tryModel = async (model) => {
        try {
            console.log(`[inpainting] Trying analyzer model: ${model}`);
            // If remote, run preflight checks to avoid noisy CORS/401 pipeline attempts
            if (!model.startsWith('models/')) {
                const ok = await canFetchHFModel(model);
                if (!ok) {
                    console.warn(`[inpainting] Preflight check failed for model ${model}, skipping load.`);
                    lastError = new Error('Preflight fetch failed or blocked');
                    return false;
                }
                console.log(`[inpainting] Preflight OK for ${model}`);
            }

            // transformers.pipeline('image-to-text', model, { device })
            analyzer = await transformers.pipeline('image-to-text', model, { device: dev });
            console.log(`[inpainting] Loaded analyzer model: ${model}`);
            return true;
        } catch (err) {
            try {
                console.error(`[inpainting] Failed to load analyzer ${model}:`, err && (err.message || err));
                console.error(err);
            } catch (e) {
                // ignore logging errors
            }
            lastError = err;
            analyzer = null;
            return false;
        }
    };

    // Try remote public models first (Xenova captioners are usually accessible).
    for (const model of remoteModelCandidates) {
        if (await tryModel(model)) break;
    }

    if (!analyzer) {
        const message = lastError?.message || 'Analyzer model load failed';
        throw new Error(`Analyzer initialization failed: ${message}`);
    }

    return analyzer;
}

function applySimpleBlurToRect(ctx, rect) {
    const { x, y, w, h } = rect;
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.floor(w / 8));
    tmp.height = Math.max(1, Math.floor(h / 8));
    const tctx = tmp.getContext('2d');
    tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
}

async function applyWebGPUBlurToRect(ctx, rect) {
    if (!('gpu' in navigator)) {
        applySimpleBlurToRect(ctx, rect);
        return;
    }

    try {
        const { device } = await initWebGPU();
        if (!device) throw new Error('No GPU device');

        const { x, y, w, h } = rect;
        const srcBitmap = await createImageBitmap(ctx.canvas, x, y, w, h);
        const off = document.createElement('canvas');
        off.width = w; off.height = h;
        const offCtx = off.getContext('2d');
        offCtx.drawImage(srcBitmap, 0, 0);

        const tmp = document.createElement('canvas');
        tmp.width = Math.max(1, Math.floor(w / 8));
        tmp.height = Math.max(1, Math.floor(h / 8));
        const tctx = tmp.getContext('2d');
        tctx.drawImage(off, 0, 0, tmp.width, tmp.height);
        offCtx.clearRect(0, 0, w, h);
        offCtx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, w, h);
        ctx.drawImage(off, x, y);
        srcBitmap.close();
        return;
    } catch (err) {
        console.warn('WebGPU blur failed, fallback to canvas blur:', err?.message || err);
        applySimpleBlurToRect(ctx, rect);
    }
}

export async function performInpainting(imageElement, maskImageData, prompt, transformers, device = null) {
    // Try to initialize analyzer but do not fail hard — fall back to segmentation-based flow
    if (!analyzer) {
        try {
            await initInpainting(transformers, device);
        } catch (e) {
            console.warn('Analyzer init failed, will use segmentation-based fallback:', e?.message || e);
            analyzer = null;
        }
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    ctx.drawImage(imageElement, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const log = createLogger('inpainting');
    let rawImage = null;
    try {
        rawImage = await htmlImageToRawImage(transformers, imageElement);
        log.debug('htmlImageToRawImage produced', rawImage && (rawImage.constructor ? rawImage.constructor.name : typeof rawImage));
    } catch (err) {
        log.warn('htmlImageToRawImage failed, falling back to canvas/imageData:', err?.message || err);
        // fallback: pass the canvas itself or imageData — pipelines often accept canvas or data URL
        try {
            rawImage = canvas;
        } catch (e) {
            rawImage = null;
        }
    }

    const analysisPrompt = `Detect unnatural regions, defects or areas to correct in this image. Respond ONLY in JSON array form like [{"x":10,"y":20,"w":30,"h":40}, ...].`;

    let rects = [];
    // If analyzer is available, try to get rects from it
    if (analyzer) {
        let analysisText = null;
        try {
            log.info('Calling analyzer pipeline', { promptSample: analysisPrompt.slice(0, 80), imageType: rawImage && (rawImage.constructor ? rawImage.constructor.name : typeof rawImage) });

            const tryCalls = [
                { name: 'image_then_options', desc: 'analyzer(image, {prompt, ...}) - preferred', fn: async () => analyzer(rawImage, { prompt: analysisPrompt, max_new_tokens: 256 }) },
                { name: 'object_arg', desc: 'analyzer({image, prompt, ...}) - alternate single-object', fn: async () => analyzer({ image: rawImage, prompt: analysisPrompt, max_new_tokens: 256 }) },
                { name: 'image_only', desc: 'analyzer(image) - ask model to caption without explicit prompt', fn: async () => analyzer(rawImage) }
            ];

            let out = null;
            const start = performance.now();
            for (let i = 0; i < tryCalls.length; i++) {
                const { name, desc, fn } = tryCalls[i];
                try {
                    log.info('Analyzer attempt start', { attempt: i + 1, name, desc, rawImageType: rawImage && (rawImage.constructor ? rawImage.constructor.name : typeof rawImage) });
                    const attemptStart = performance.now();
                    out = await fn();
                    const attemptElapsed = (performance.now() - attemptStart).toFixed(1);
                    log.info('Analyzer attempt succeeded', { attempt: i + 1, name, attemptElapsed });
                    break;
                } catch (e) {
                    log.warn('Analyzer attempt failed', { attempt: i + 1, name, message: e?.message || e });
                    // continue to next pattern
                }
            }

            const elapsed = (performance.now() - start).toFixed(1);
            log.info(`Analyzer finished attempts in ${elapsed}ms`);
            if (out) {
                analysisText = (typeof out === 'string') ? out : (out?.generated_text || JSON.stringify(out));
                log.debug('Analyzer raw output', out);
            } else {
                log.warn('All analyzer invocation patterns failed');
            }
        } catch (err) {
            log.warn('Analyzer failed (outer):', err?.message || err);
            analysisText = null;
        }

        if (analysisText) {
            try {
                const parsed = JSON.parse(analysisText);
                if (Array.isArray(parsed)) {
                    rects = parsed;
                    log.info('Analyzer produced rects', { count: rects.length });
                } else {
                    log.warn('Analyzer output parsed but is not an array', parsed);
                }
            } catch (e) {
                log.warn('Failed to parse analyzer JSON:', e?.message || e, analysisText);
            }
        }
    }

    // If analyzer did not provide rects, derive from maskImageData or segmentation
    if (!rects || rects.length === 0) {
        // 1) If maskImageData is provided (from segmentation step), compute bounding rect(s)
        if (maskImageData) {
            const fromMask = computeRectsFromImageData(maskImageData);
            if (fromMask.length) rects = fromMask;
        }

        // 2) If still empty and transformers available, run segmentation pipeline to get segments
        if ((!rects || rects.length === 0) && transformers) {
            try {
                const segResult = await generateMask(imageElement, transformers, device);
                const fromSeg = computeRectsFromSegments(segResult, canvas.width, canvas.height);
                if (fromSeg.length) rects = fromSeg;
            } catch (e) {
                console.warn('Segmentation fallback failed:', e?.message || e);
            }
        }
    }

    for (const r of rects) {
        const rect = {
            x: Math.max(0, Math.floor(r.x || 0)),
            y: Math.max(0, Math.floor(r.y || 0)),
            w: Math.min(canvas.width, Math.floor(r.w || 0)),
            h: Math.min(canvas.height, Math.floor(r.h || 0))
        };
        if (rect.w <= 0 || rect.h <= 0) continue;
        // Try GPU path first, fallback to canvas
        await applyWebGPUBlurToRect(ctx, rect);
    }

    if (maskImageData) {
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskImageData.width;
        maskCanvas.height = maskImageData.height;
        const mctx = maskCanvas.getContext('2d');
        mctx.putImageData(maskImageData, 0, 0);
        const mask = mctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
        const dst = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < dst.data.length; i += 4) {
            const a = mask[i + 3];
            if (a === 0) {
                // TODO: composite logic if needed
            }
        }
    }

    return { dataURL: canvas.toDataURL(), width: canvas.width, height: canvas.height };
}

function computeRectsFromImageData(imageData) {
    if (!imageData || !imageData.data) return [];
    const { width, height, data } = imageData;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    const alphaThreshold = 8; // minimal visible alpha
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const a = data[idx + 3];
            if (a > alphaThreshold) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return [];
    let w = maxX - minX + 1;
    let h = maxY - minY + 1;
    const padX = Math.round(Math.min(50, Math.max(8, w * 0.08)));
    const padY = Math.round(Math.min(50, Math.max(8, h * 0.08)));
    const x = Math.max(0, minX - padX);
    const y = Math.max(0, minY - padY);
    w = Math.min(width - x, w + padX * 2);
    h = Math.min(height - y, h + padY * 2);
    return [{ x, y, w, h }];
}

function computeRectsFromSegments(segments, canvasWidth, canvasHeight, threshold = 0.5) {
    if (!segments || !segments.length) return [];
    const rects = [];
    for (const seg of segments) {
        const mask = seg.mask || seg;
        if (!mask || !mask.data) continue;
        const maskData = mask.data;
        const mw = mask.width || Math.sqrt(maskData.length || 0);
        const mh = mask.height || (maskData.length / mw || 0);
        if (!mw || !mh) continue;

        let minX = mw, minY = mh, maxX = -1, maxY = -1;
        for (let i = 0; i < maskData.length; i++) {
            const v = maskData[i];
            if (v > threshold) {
                const x = i % mw;
                const y = Math.floor(i / mw);
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) continue;

        const scaleX = canvasWidth / mw;
        const scaleY = canvasHeight / mh;
        let x = Math.floor(minX * scaleX);
        let y = Math.floor(minY * scaleY);
        let w = Math.ceil((maxX - minX + 1) * scaleX);
        let h = Math.ceil((maxY - minY + 1) * scaleY);

        const pad = Math.round(Math.min(80, Math.max(8, Math.max(w, h) * 0.06)));
        x = Math.max(0, x - pad);
        y = Math.max(0, y - pad);
        w = Math.min(canvasWidth - x, w + pad * 2);
        h = Math.min(canvasHeight - y, h + pad * 2);

        const area = w * h;
        const minArea = Math.max(256, Math.floor(canvasWidth * canvasHeight * 0.002));
        if (area < minArea) continue;

        rects.push({ x, y, w, h });
    }
    return rects;
}