// src/features/segmentation.js
// SAM (Segment Anything Model) を使用した画像セグメンテーション機能

import { createLogger } from '../utils/debug.js';
import { htmlImageToRawImage } from '../utils/image-utils.js';

let model = null;
let processor = null;
let segmenter = null;

const log = createLogger('segmentation');

export async function initSAM(transformers, device = null) {
    if (model && processor) return;
    if (!transformers) throw new Error('transformers instance required');

    const modelId = 'Xenova/slimsam-77-uniform';
    const dev = device || (navigator.gpu ? 'webgpu' : 'wasm');
    const dtype = dev === 'webgpu' ? 'q8' : 'fp32';

    log.info(`Initializing SAM: ${modelId} on ${dev} (${dtype})`);
    model = await transformers.SamModel.from_pretrained(modelId, { device: dev, dtype });
    processor = await transformers.AutoProcessor.from_pretrained(modelId);
    log.info('SAM initialized.');
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

export async function generateMask(imageElement, transformers, device = null) {
    if (!transformers) throw new Error('transformers instance required');
    if (!segmenter) {
        await initSegmentation(transformers, device);
    }

    const modelSize = 800;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = modelSize;
    canvas.height = modelSize;

    const aspectRatio = imageElement.width / imageElement.height;
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
    ctx.drawImage(imageElement, offsetX, offsetY, drawWidth, drawHeight);

    const imageData = ctx.getImageData(0, 0, modelSize, modelSize);

    const rawImage = await htmlImageToRawImage(transformers, canvas);

    try {
        log.debug('Running segmentation on image', { width: canvas.width, height: canvas.height });
        const result = await segmenter(rawImage);
        log.info('Segmentation completed', { segments: Array.isArray(result) ? result.length : 'unknown' });
        return result;
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

    const rawImage = await htmlImageToRawImage(transformers, imageElement);

    const points = [[y, x]];
    const labels = [1];

    log.info(`Running SAM inference at: ${x}, ${y}`);

    try {
        const inputs = await processor(rawImage, points, { labels });
        const outputs = await model(inputs);
        const maskData = outputs.pred_masks;

        return {
            mask: maskData,
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
            // Reinitialize SAM on wasm
            model = null;
            processor = null;
            await initSAM(transformers, 'wasm');
            // retry
            const inputs2 = await processor(rawImage, points, { labels });
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