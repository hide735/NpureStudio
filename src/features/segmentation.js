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
    dev = 'wasm'; // 一時的に WebGPU 版は不安定なので強制的に WASM に切り替え（2024-06 現在）
    var dtype = isiOS() ? 'fp16' : (dev === 'webgpu' ? 'q8' : 'fp32');
    dtype = 'fp32'; // 一時的に WebGPU 版は不安定なので iOS 以外も強制的に fp16 に切り替え（2024-06 現在）

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
                    const width = (mask && (mask.width || (mask.dims && mask.dims[mask.dims.length - 1]))) || canvas.width;
                    const height = (mask && (mask.height || (mask.dims && mask.dims[mask.dims.length - 2]))) || canvas.height;
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
                const width = (mask && (mask.width || (mask.dims && mask.dims[mask.dims.length - 1]))) || canvas.width;
                const height = (mask && (mask.height || (mask.dims && mask.dims[mask.dims.length - 2]))) || canvas.height;
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

    // Resize input while preserving aspect ratio (do NOT force square resize).
    // Forcing a square (e.g. 512x512) caused X/Y mapping errors when the
    // displayed image is letterboxed within the canvas. Keep aspect ratio,
    // then map the original click coords to the resized image pixels.
    const maxDimension = 512;
    const resized = await resizeForAI(imageElement, maxDimension);

    const originalWidth = (imageElement.naturalWidth ?? imageElement.width) || imageElement.clientWidth || maxDimension;
    const originalHeight = (imageElement.naturalHeight ?? imageElement.height) || imageElement.clientHeight || maxDimension;

    const scaleX = resized.width / originalWidth;
    const scaleY = resized.height / originalHeight;
    const adjX = Math.round(x * scaleX);
    const adjY = Math.round(y * scaleY);

    // Prefer transformers.RawImage.fromCanvas if available (use the resized canvas)
    let rawImage = null;
    if (transformers && transformers.RawImage && typeof transformers.RawImage.fromCanvas === 'function') {
        rawImage = await transformers.RawImage.fromCanvas(resized);
    } else {
        rawImage = await htmlImageToRawImage(transformers, resized);
    }

    log.info(`Running SAM inference at (scaled): ${adjX}, ${adjY} (orig: ${x}, ${y})`);

    try {
        // SAM expects input_points as [[[y, x]]] and input_labels as [[label]].
        // We pass coordinates mapped to the resized image (adjY, adjX) so
        // processor/model see the correct location without forcing a square resize.
        const inputs = await processor(rawImage, {
            input_points: [[[adjY, adjX]]],
            input_labels: [[1]]
        });
        const outputs = await model(inputs);

        log.info('SAM inference completed');

        // Extract a single mask from outputs.pred_masks (SAM often returns multiple masks)
        let maskObj = null;
        try {
            const pm = outputs && outputs.pred_masks ? outputs.pred_masks : null;
            if (pm) {
                const dims = pm.dims || pm.shape || [];
                let numMasks = 1;
                let height = null;
                let width = null;

                if (Array.isArray(dims) && dims.length >= 3) {
                    if (dims.length === 4 && dims[0] === 1) {
                        numMasks = dims[1];
                        height = dims[2];
                        width = dims[3];
                    } else if (dims.length === 3) {
                        numMasks = dims[0];
                        height = dims[1];
                        width = dims[2];
                    } else if (dims.length === 2) {
                        numMasks = 1;
                        height = dims[0];
                        width = dims[1];
                    }
                }

                // pick best mask by iou_scores if available, otherwise prefer middle (Index 1)
                // (SAM returns several scales; index 1 tends to correspond to part-level masks like clothing)
                let chosenIndex = (numMasks > 1 ? Math.min(1, numMasks - 1) : 0);
                try {
                    const scoresRaw = outputs && outputs.iou_scores ? outputs.iou_scores : null;
                    if (scoresRaw) {
                        let scores = null;
                        if (scoresRaw.data) scores = Array.from(scoresRaw.data);
                        else if (Array.isArray(scoresRaw)) scores = scoresRaw.slice();
                        else if (typeof scoresRaw.array === 'function') {
                            const sarr = await scoresRaw.array();
                            scores = Array.isArray(sarr[0]) ? sarr[0] : sarr;
                        }
                        if (Array.isArray(scores) && scores.length) {
                            if (Array.isArray(scores[0])) scores = scores[0];
                            let maxIdx = 0; let maxVal = -Infinity;
                            for (let i = 0; i < scores.length; i++) {
                                const v = Number(scores[i]);
                                if (v > maxVal) { maxVal = v; maxIdx = i; }
                            }
                            chosenIndex = maxIdx;
                            if (!numMasks || numMasks <= chosenIndex) numMasks = Math.max(numMasks, chosenIndex + 1);
                        }
                    }
                } catch (e) {
                    // ignore scoring errors
                }

                // If dims unknown, try inferring from data length
                if ((!height || !width) && pm && pm.data && pm.data.length) {
                    const total = pm.data.length;
                    if (total % 3 === 0) {
                        const per = total / 3;
                        const side = Math.round(Math.sqrt(per));
                        if (side * side === per) {
                            numMasks = 3;
                            height = height || side;
                            width = width || side;
                        }
                    }
                    if (!height || !width) {
                        const side = Math.round(Math.sqrt(total));
                        if (side * side === total) {
                            numMasks = 1;
                            height = height || side;
                            width = width || side;
                        }
                    }
                }

                // Extract chosen mask
                if (pm.data && pm.data.length) {
                    const total = pm.data.length;
                    const pixelsPerMask = (height && width) ? (height * width) : Math.floor(total / Math.max(1, numMasks));
                    const start = Math.min(total - pixelsPerMask, Math.max(0, chosenIndex * pixelsPerMask));
                    const slice = pm.data.subarray ? pm.data.subarray(start, start + pixelsPerMask) : pm.data.slice(start, start + pixelsPerMask);
                    const dataCopy = new Float32Array(slice);
                    maskObj = { data: dataCopy, width: width || pixelsPerMask, height: height || 1 };
                } else if (typeof pm.array === 'function') {
                    const arr = await pm.array();
                    let chosenMask = null;
                    if (Array.isArray(arr)) {
                        if (Array.isArray(arr[0]) && Array.isArray(arr[0][chosenIndex])) {
                            chosenMask = arr[0][chosenIndex];
                        } else if (Array.isArray(arr[chosenIndex])) {
                            chosenMask = arr[chosenIndex];
                        } else if (Array.isArray(arr[0]) && Array.isArray(arr[0][0])) {
                            chosenMask = arr.flat(2)[chosenIndex];
                        }
                    }
                    if (chosenMask) {
                        const flat = (Array.isArray(chosenMask[0]) ? chosenMask.flat() : chosenMask);
                        const dataCopy = new Float32Array(flat);
                        const h = chosenMask.length;
                        const w = Array.isArray(chosenMask[0]) ? chosenMask[0].length : Math.floor(flat.length / h);
                        maskObj = { data: dataCopy, width: w, height: h };
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to copy/select pred_masks:', e?.message || e);
        }

        // Explicitly dispose heavy tensors if API exposes dispose()
        try { if (outputs && outputs.pred_masks && typeof outputs.pred_masks.dispose === 'function') outputs.pred_masks.dispose(); } catch (e) {}
        try { if (inputs && inputs.pixel_values && typeof inputs.pixel_values.dispose === 'function') inputs.pixel_values.dispose(); } catch (e) {}

        // Dispose SAM models to free resources after use
        try { await disposeSAM(); } catch (e) { console.warn('disposeSAM failed:', e?.message || e); }

        return {
            mask: maskObj,
            width: (maskObj && maskObj.width) || rawImage.width,
            height: (maskObj && maskObj.height) || rawImage.height
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
            // Try to extract same as above
            const pm2 = outputs2 && outputs2.pred_masks ? outputs2.pred_masks : null;
            if (pm2 && pm2.data) {
                const dims = pm2.dims || pm2.shape || [];
                const h = dims.length >= 2 ? dims[dims.length - 2] : rawImage.height;
                const w = dims.length >= 1 ? dims[dims.length - 1] : rawImage.width;
                const total2 = pm2.data.length;
                const pixelsPerMask2 = h * w;
                // If multiple masks are present, prefer index 1 (part-level) when available
                let start2 = 0;
                if (total2 >= pixelsPerMask2 * 2) start2 = pixelsPerMask2;
                const slice2 = pm2.data.subarray ? pm2.data.subarray(start2, start2 + pixelsPerMask2) : pm2.data.slice(start2, start2 + pixelsPerMask2);
                const dataCopy2 = new Float32Array(slice2);
                return { mask: { data: dataCopy2, width: w, height: h }, width: w, height: h };
            }
            return {
                mask: outputs2.pred_masks,
                width: rawImage.width,
                height: rawImage.height
            };
        }
        throw error;
    }
}
