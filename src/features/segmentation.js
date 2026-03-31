// src/features/segmentation.js
// SAM (Segment Anything Model) を使用した画像セグメンテーション機能

let segmenter = null;

export async function initSegmentation(transformers) {
    if (!segmenter) {
        console.log("Loading segmentation model...");
        // WebGPUが利用可能なら使用、そうでなければCPU
        const device = navigator.gpu ? 'webgpu' : 'cpu';
        console.log(`Using device: ${device}`);
        // SegFormerを使用（軽量semantic segmentation）
        segmenter = await transformers.pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
            device: device
        });
    }
    return segmenter;
}

export async function generateMask(imageElement, transformers) {
    // 1. セグメンテーションが初期化されていなければ初期化
    if (!segmenter) {
        await initSegmentation(transformers);
    }

    // 2. 画像をモデル入力サイズにリサイズ (DETRは通常800x800程度)
    const modelSize = 800;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = modelSize;
    canvas.height = modelSize;

    // アスペクト比を維持してリサイズ
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

    // 3. ImageData を RawImage に変換
    const rawImage = new transformers.RawImage(imageData.data, imageData.width, imageData.height, 4);

    // 4. セグメンテーション実行
    const result = await segmenter(rawImage);

    return result;
}