// src/features/image-recognition.js
// 基本画像認識機能（ViT モデルを使用）

let classifier = null;

export async function initImageRecognition(transformers) {
    try {
        // 自動ロード設定: ローカルモデルを許可せず、リモートから自動ダウンロード
        transformers.env.allowLocalModels = false;
        transformers.env.allowRemoteModels = true;

        // WebGPU優先: iPhoneのパワーを活用
        const device = navigator.gpu ? 'webgpu' : 'cpu';
        console.log(`Using device: ${device}`);

        // ViT (Vision Transformer) モデルをロード
        classifier = await transformers.pipeline('image-classification', 'Xenova/vit-base-patch16-224', {
            device: device
        });
        console.log('Image recognition model loaded successfully');
        return true;
    } catch (error) {
        console.error('Failed to load image recognition model:', error);
        throw error;
    }
}

export async function classifyImage(imageElement, transformers) {
    // 1. もしモデルがまだロードされていなければ、ここでロードする
    if (!classifier) {
        console.log("Loading AI model for the first time...");
        const device = navigator.gpu ? 'webgpu' : 'cpu';
        classifier = await transformers.pipeline('image-classification', 'Xenova/vit-base-patch16-224', {
            device: device
        });
    }

    // 2. HTMLImageElement を Canvas に描画
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    ctx.drawImage(imageElement, 0, 0);

    // 3. Canvas から RawImage を作成（堅牢な方法）
    const rawImage = await transformers.RawImage.fromCanvas(canvas);

    // 4. 推論を実行
    return await classifier(rawImage);
}
export function isInitialized() {
    return classifier !== null;
}