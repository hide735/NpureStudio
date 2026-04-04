// src/features/segmentation.js
// SAM (Segment Anything Model) を使用した画像セグメンテーション機能

import { createLogger } from '../utils/debug.js';
import { htmlImageToRawImage, resizeForAI } from '../utils/image-utils.js';

let model = null;
let processor = null;
let segmenter = null;

const log = createLogger('segmentation');

// iPhone/iPad（iOS）かどうかを判定する関数
const isiOS = () => {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export async function initSAM(transformers, forceDevice = null) {
    if (model && processor && !forceDevice) return;

    const modelId = 'Xenova/slimsam-77-uniform';
    // 安定性優先でデフォルトを WASM にする（必要なら forceDevice='webgpu' を渡す）
    var dev = forceDevice || 'wasm';
    dev = `wasm`; // 一時的な検証用
    var dtype = isiOS() ? 'fp16' : (dev === 'webgpu' ? 'q8' : 'fp32');
    dtype = `fp32`; // 一時的な検証用

    log.info(`Initializing SAM: ${modelId} on ${dev} (${dtype})`);
    try {
        model = await transformers.SamModel.from_pretrained(modelId, { device: dev, dtype });
        processor = await transformers.AutoProcessor.from_pretrained(modelId);
        log.info('SAM initialized successfully.');
    } catch (e) {
        log.error('SAM initialization failed:', e?.message || e);
        if (dev === 'webgpu') {
            log.warn('WebGPU failed, retrying with WASM...');
            return await initSAM(transformers, 'wasm');
        }
        throw e;
    }
}

export async function initSegmentation(transformers, device = null) {
    if (!segmenter) {
        if (!transformers) throw new Error('transformers instance required');
        log.info('Loading segmentation model...');
        const dev = device || (navigator.gpu ? 'webgpu' : 'wasm');
        log.info(`Using device: ${dev}`);
        segmenter = await transformers.pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
            device: dev
        });
    }
    return segmenter;
}

/**
 * Dispose loaded segmentation pipeline (free VRAM/resources).
 */
export async function disposeSegmentation() {
    try {
        if (segmenter && typeof segmenter.dispose === 'function') {
            await segmenter.dispose();
        }
    } catch (e) {
        console.warn('disposeSegmentation failed:', e?.message || e);
    }
    segmenter = null;
}

/**
 * Dispose SAM (model + processor) resources.
 */
export async function disposeSAM() {
    try {
        if (model && typeof model.dispose === 'function') {
            await model.dispose();
        }
    } catch (e) {
        console.warn('disposeSAM (model) failed:', e?.message || e);
    }
    model = null;

    try {
        if (processor && typeof processor.dispose === 'function') {
            await processor.dispose();
        }
    } catch (e) {
        console.warn('disposeSAM (processor) failed:', e?.message || e);
    }
    processor = null;
}

export async function generateMask(imageElement, transformers, device = null) {
    if (!transformers) throw new Error('transformers instance required');
    if (!segmenter) {
        await initSegmentation(transformers, device);
    }

    const maxDimension = 512; // keep long edge at or below this for WebGPU stability
    const resized = await resizeForAI(imageElement, maxDimension);

    const modelSize = maxDimension;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = modelSize;
    canvas.height = modelSize;

    const aspectRatio = resized.width / resized.height;
    let drawWidth, drawHeight, offsetX, offsetY;

    if (aspectRatio > 1) {
        drawWidth = modelSize;
        drawHeight = modelSize / aspectRatio;
        offsetX = 0;
        offsetY = (modelSize - drawHeight) / 2;
    } else {
        drawHeight = modelSize;
        drawWidth = modelSize * aspectRatio;
        offsetX = (modelSize - drawWidth) / 2;
        offsetY = 0;
    }

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, modelSize, modelSize);
    ctx.drawImage(resized, offsetX, offsetY, drawWidth, drawHeight);

    const imageData = ctx.getImageData(0, 0, modelSize, modelSize);

    const rawImage = await htmlImageToRawImage(transformers, canvas);

    try {
        log.debug('Running segmentation on image', { width: canvas.width, height: canvas.height });
        const result = await segmenter(rawImage);
        log.info('Segmentation completed', { segments: Array.isArray(result) ? result.length : 'unknown' });

        // Deep-copy mask data to plain typed arrays so they remain usable
        // after we dispose the pipeline to free VRAM.
        const safeResult = [];
        if (Array.isArray(result)) {
            for (const seg of result) {
                try {
                    const mask = seg && seg.mask ? seg.mask : seg;
                    let dataCopy = null;
                    if (mask && mask.data) {
                        dataCopy = new Float32Array(mask.data);
                    } else if (Array.isArray(mask)) {
                        dataCopy = Float32Array.from(mask);
                    }
                    const width = (mask && (mask.width || mask.dims && mask.dims[mask.dims.length - 1])) || canvas.width;
                    const height = (mask && (mask.height || mask.dims && mask.dims[mask.dims.length - 2])) || canvas.height;
                    safeResult.push({ ...seg, mask: { data: dataCopy, width, height } });
                } catch (e) {
                    // If something fails copying one segment, still include original
                    safeResult.push(seg);
                }
            }
        } else {
            // If pipeline returned a single object, try to copy it similarly
            try {
                const mask = result && result.mask ? result.mask : result;
                const dataCopy = mask && mask.data ? new Float32Array(mask.data) : null;
                const width = (mask && (mask.width || mask.dims && mask.dims[mask.dims.length - 1])) || canvas.width;
                const height = (mask && (mask.height || mask.dims && mask.dims[mask.dims.length - 2])) || canvas.height;
                safeResult.push({ ...result, mask: { data: dataCopy, width, height } });
            } catch (e) {
                safeResult.push(result);
            }
        }

        // Dispose segmentation pipeline to free VRAM (per "use-when-needed" policy)
        await disposeSegmentation();

        return safeResult;
    } catch (err) {
        const msg = err?.message || String(err);
        log.warn('Segmentation failed:', msg);
        const isGpuError = /device|mapAsync|Device is lost|GPUBuffer|DXGI|AbortError/i.test(msg);
        if (isGpuError) {
            log.warn('Detected GPU error during segmentation — falling back to WASM backend');
            try {
                if (transformers && transformers.env && typeof transformers.env.setBackend === 'function') {
                    await transformers.env.setBackend('wasm');
                }
            } catch (e) {
                log.warn('Failed to switch backend to wasm:', e?.message || e);
            }
            // Reset segmenter and retry on WASM
            segmenter = null;
            await initSegmentation(transformers, 'wasm');
            return await segmenter(rawImage);
        }
        throw err;
    }
}

/**
 * 指定された座標(x, y)を元にセグメンテーションを実行
 */
export async function segmentByPoint(imageElement, x, y, transformers, device = null) {
    if (!transformers) throw new Error('transformers instance required');
    if (!model || !processor) {
        await initSAM(transformers, device);
    }

    // Resize input aggressively to avoid GPU/OOM; scale point coordinates accordingly
    const maxDimension = 512;
    const originalWidth = (imageElement.naturalWidth ?? imageElement.width) || imageElement.clientWidth || maxDimension;
    const originalHeight = (imageElement.naturalHeight ?? imageElement.height) || imageElement.clientHeight || maxDimension;

    const resized = await resizeForAI(imageElement, maxDimension);
    const scaleX = resized.width / originalWidth;
    const scaleY = resized.height / originalHeight;
    const adjX = Math.round(x * scaleX);
    const adjY = Math.round(y * scaleY);
    // Prefer transformers.RawImage.fromCanvas if available
    let rawImage = null;
    if (transformers && transformers.RawImage && typeof transformers.RawImage.fromCanvas === 'function') {
        rawImage = await transformers.RawImage.fromCanvas(resized);
    } else {
        rawImage = await htmlImageToRawImage(transformers, resized);
    }

    log.info(`Running SAM inference at (scaled): ${adjX}, ${adjY} (orig: ${x}, ${y})`);

    try {
        // SAM expects input_points as [[[y, x]]] and input_labels as [[label]]
        const inputs = await processor(rawImage, {
            input_points: [[[adjY, adjX]]],
            input_labels: [[1]]
        });
        const outputs = await model(inputs);

        log.info('SAM inference "await model" completed');

        // Copy mask data to plain typed array so it remains valid after disposing model
        let maskObj = null;
        try {
            const pm = outputs && outputs.pred_masks ? outputs.pred_masks : null;
            if (pm) {
                if (pm.data) {
                    const dataCopy = new Float32Array(pm.data);
                    const dims = pm.dims || [];
                    const height = dims.length >= 2 ? dims[dims.length - 2] : rawImage.height;
                    const width = dims.length >= 1 ? dims[dims.length - 1] : rawImage.width;
                    maskObj = { data: dataCopy, width, height };
                } else if (Array.isArray(pm)) {
                    // hit: an array of masks
                    const first = pm[0];
                    if (first && first.data) {
                        maskObj = { data: new Float32Array(first.data), width: first.width || rawImage.width, height: first.height || rawImage.height };
                    } else {
                        maskObj = { data: Float32Array.from(pm), width: rawImage.width, height: rawImage.height };
                    }
                } else if (typeof pm.array === 'function') {
                    const arr = await pm.array();
                    const flat = Array.isArray(arr) && Array.isArray(arr[0]) ? arr.flat() : arr;
                    maskObj = { data: new Float32Array(flat), width: rawImage.width, height: rawImage.height };
                } else {
                    try { maskObj = { data: new Float32Array(pm), width: rawImage.width, height: rawImage.height }; } catch (e) { maskObj = null; }
                }
            }
        } catch (e) {
            console.warn('Failed to copy pred_masks:', e?.message || e);
        }

        // Explicitly dispose heavy tensors if API exposes dispose()
        try { if (outputs && outputs.pred_masks && typeof outputs.pred_masks.dispose === 'function') outputs.pred_masks.dispose(); } catch (e) {}
        try { if (inputs && inputs.pixel_values && typeof inputs.pixel_values.dispose === 'function') inputs.pixel_values.dispose(); } catch (e) {}

        // Dispose SAM models to free resources after use
        try { await disposeSAM(); } catch (e) { console.warn('disposeSAM failed:', e?.message || e); }

        return {
            mask: maskObj,
            width: rawImage.width,
            height: rawImage.height
        };
    } catch (error) {
        const msg = error?.message || String(error);
        log.error('Inference failed:', msg);
        const isGpuError = /device|mapAsync|Device is lost|GPUBuffer|DXGI|AbortError/i.test(msg);
        if (isGpuError) {
            log.warn('Detected GPU error during SAM inference — retrying on WASM backend');
            try {
                if (transformers && transformers.env && typeof transformers.env.setBackend === 'function') {
                    await transformers.env.setBackend('wasm');
                }
            } catch (e) {
                log.warn('Failed to switch backend to wasm:', e?.message || e);
            }
            // Reinitialize SAM on wasm and retry with correct input keys
            model = null;
            processor = null;
            await initSAM(transformers, 'wasm');
            const inputs2 = await processor(rawImage, {
                input_points: [[[adjY, adjX]]],
                input_labels: [[1]]
            });
            const outputs2 = await model(inputs2);
            return {
                mask: outputs2.pred_masks,
                width: rawImage.width,
                height: rawImage.height
            };
        }
        throw error;
    }
}