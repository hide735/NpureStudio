// src/features/image-recognition.js
// 基本画像認識機能（ViT モデルを使用）

import { createLogger } from '../utils/debug.js';
import { htmlImageToRawImage } from '../utils/image-utils.js';

let classifier = null;
const log = createLogger('image-recognition');

export async function initImageRecognition(transformers, device = null) {
    if (!transformers) throw new Error('transformers instance required');
    try {
        transformers.env.allowLocalModels = false;
        transformers.env.allowRemoteModels = true;

        const dev = device || (navigator.gpu ? 'webgpu' : 'wasm');
        log.info(`Using device: ${dev}`);

        classifier = await transformers.pipeline('image-classification', 'Xenova/vit-base-patch16-224', {
            device: dev
        });
        log.info('Image recognition model loaded successfully');
        return true;
    } catch (error) {
        log.error('Failed to load image recognition model:', error);
        throw error;
    }
}

export async function classifyImage(imageElement, transformers, device = null) {
    if (!transformers) throw new Error('transformers instance required');

    if (!classifier) {
        log.info('Loading AI model for the first time...');
        const dev = device || (navigator.gpu ? 'webgpu' : 'wasm');
        classifier = await transformers.pipeline('image-classification', 'Xenova/vit-base-patch16-224', { device: dev });
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    ctx.drawImage(imageElement, 0, 0);

    const rawImage = await htmlImageToRawImage(transformers, canvas);
    log.debug('Classify image input prepared', { type: rawImage && (rawImage.constructor ? rawImage.constructor.name : typeof rawImage) });

    return await classifier(rawImage);
}

export function isInitialized() {
    return classifier !== null;
}