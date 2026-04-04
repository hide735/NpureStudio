// src/utils/image-utils.js
// 画像処理ユーティリティ関数

export function imageToTensor(img, width = 224, height = 224) {
    // Canvas を使用して画像をリサイズ
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;

    // アスペクト比を維持してリサイズ
    const aspectRatio = img.width / img.height;
    let drawWidth, drawHeight, offsetX, offsetY;

    if (aspectRatio > 1) {
        drawWidth = width;
        drawHeight = width / aspectRatio;
        offsetX = 0;
        offsetY = (height - drawHeight) / 2;
    } else {
        drawHeight = height;
        drawWidth = height * aspectRatio;
        offsetX = (width - drawWidth) / 2;
        offsetY = 0;
    }

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

    // Canvas から ImageData を取得
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // RGB 値を 0-1 に正規化
    const pixels = [];
    for (let i = 0; i < data.length; i += 4) {
        pixels.push(data[i] / 255.0);     // R
        pixels.push(data[i + 1] / 255.0); // G
        pixels.push(data[i + 2] / 255.0); // B
    }

    // テンソル形式に変換 (1, 3, height, width)
    const tensor = new Float32Array(pixels);
    return { tensor, width, height };
}

export function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function preprocessImage(img) {
    // ViT モデル向けの前処理
    return imageToTensor(img, 224, 224);
}

import { createLogger } from './debug.js';

export async function htmlImageToRawImage(transformers, img) {
    const log = createLogger('image-utils');
    if (!transformers) throw new Error('transformers instance required');
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Try preferred transformers.RawImage.fromCanvas, but fall back to several formats
    try {
        if (transformers.RawImage && typeof transformers.RawImage.fromCanvas === 'function') {
            log.debug('Using transformers.RawImage.fromCanvas');
            return await transformers.RawImage.fromCanvas(canvas);
        }
        if (transformers.RawImage && typeof transformers.RawImage.fromImage === 'function') {
            log.debug('Using transformers.RawImage.fromImage');
            return await transformers.RawImage.fromImage(canvas);
        }
    } catch (err) {
        log.warn('transformers.RawImage.* threw, falling back', err?.message || err);
    }

    // Try ImageBitmap as another common accepted image-like object
    try {
        if (typeof createImageBitmap === 'function') {
            log.debug('Falling back to createImageBitmap(canvas)');
            const bitmap = await createImageBitmap(canvas);
            return bitmap;
        }
    } catch (err) {
        log.warn('createImageBitmap failed:', err?.message || err);
    }

    // Final fallback: data URL string (pipeline may accept this)
    try {
        const dataUrl = canvas.toDataURL('image/png');
        log.debug('Falling back to dataURL (png)');
        return dataUrl;
    } catch (err) {
        log.error('Failed to produce fallback image (dataURL):', err?.message || err);
        throw err;
    }
}