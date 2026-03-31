// src/features/segmentation.js
// SAM (Segment Anything Model) を使用した画像セグメンテーション機能

let segmenter = null;

export async function initSegmentation(transformers) {
    if (!segmenter) {
        console.log("Loading SAM model for segmentation...");
        segmenter = await transformers.pipeline('image-segmentation', 'Xenova/sam-vit-base', {
            device: 'cpu'  // CPU backend for stability
        });
    }
    return segmenter;
}

export async function generateMask(imageElement, points, transformers) {
    // 1. セグメンテーションが初期化されていなければ初期化
    if (!segmenter) {
        await initSegmentation(transformers);
    }

    // 2. HTMLImageElement を ImageData に変換
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    ctx.drawImage(imageElement, 0, 0);
    const imageData = ctx.getImageData(0, 0, imageElement.width, imageElement.height);

    // 3. ImageData を RawImage に変換
    const rawImage = new transformers.RawImage(imageData.data, imageData.width, imageData.height, 4);

    // 4. ポイントを正規化 (0-1 の範囲に)
    const normalizedPoints = points.map(point => ({
        x: point.x / imageElement.width,
        y: point.y / imageElement.height,
        label: point.label || 1  // 1: foreground, 0: background
    }));

    // 5. マスク生成
    const result = await segmenter(rawImage, {
        points: normalizedPoints.map(p => [p.x, p.y])
    });

    return result;
}