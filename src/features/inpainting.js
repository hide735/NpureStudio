// src/features/inpainting.js
// Qwen 系の image-to-text を解析器として使う軽量 inpainting ワークフロー

import { initWebGPU } from '../core/webgpu.js';

let analyzer = null;

export async function initInpainting(transformers) {
    if (analyzer) return analyzer;

    console.log('Initializing Qwen analyzer (image-to-text) for inpainting...');
    const device = navigator.gpu ? 'webgpu' : 'cpu';
    console.log(`Using device: ${device}`);

    // For GitHub Pages public deployment we prefer Hugging Face Hub direct models
    const remoteModelCandidates = [
        'onnx-community/Qwen2-VL-2B-Instruct',
        'onnx-community/Qwen2.5-VL'
    ];
    const localModelCandidates = [
        'models/onnx-community/Qwen2-VL-2B-Instruct',
        'models/onnx-community/Qwen2.5-VL'
    ];

    let lastError = null;

    const tryModel = async (model) => {
        try {
            console.log(`Trying analyzer model: ${model}`);
            // transformers.pipeline('image-to-text', model, { device })
            analyzer = await transformers.pipeline('image-to-text', model, { device });
            console.log(`Loaded analyzer model: ${model}`);
            return true;
        } catch (err) {
            console.warn(`Failed to load analyzer ${model}:`, err?.message || err);
            lastError = err;
            analyzer = null;
            return false;
        }
    };

    for (const model of localModelCandidates) {
        if (await tryModel(model)) break;
    }
    if (!analyzer) {
        for (const model of remoteModelCandidates) {
            if (await tryModel(model)) break;
        }
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

export async function performInpainting(imageElement, maskImageData, prompt, transformers) {
    if (!analyzer) {
        await initInpainting(transformers);
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    ctx.drawImage(imageElement, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rawImage = new transformers.RawImage(imageData.data, imageData.width, imageData.height, 4);

    const analysisPrompt = `Detect unnatural regions, defects or areas to correct in this image. Respond ONLY in JSON array form like [{"x":10,"y":20,"w":30,"h":40}, ...].`;

    let analysisText = null;
    try {
        const out = await analyzer(analysisPrompt, { image: rawImage, max_new_tokens: 256 });
        analysisText = (typeof out === 'string') ? out : (out?.generated_text || JSON.stringify(out));
    } catch (err) {
        console.warn('Analyzer failed:', err?.message || err);
        analysisText = null;
    }

    let rects = [];
    if (analysisText) {
        try {
            rects = JSON.parse(analysisText);
            if (!Array.isArray(rects)) rects = [];
        } catch (e) {
            console.warn('Failed to parse analyzer JSON:', e?.message || e, analysisText);
            rects = [];
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