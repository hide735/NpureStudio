// src/features/image-recognition.js
// 基本画像認識機能（ViT モデルを使用）

let classifier = null;

export async function initImageRecognition(transformers) {
    try {
        // CPU backend を設定（WebGPU が不安定な場合）
        if (transformers.env.backends && transformers.env.backends.onnx) {
            transformers.env.backends.onnx.backend = 'cpu'; // 'webgpu' から 'cpu' に変更
            transformers.env.backends.onnx.wasm.numThreads = 1; // モバイル最適化
        }

        // ViT (Vision Transformer) モデルをロード
        classifier = await transformers.pipeline('image-classification', 'Xenova/vit-base-patch16-224');
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
        classifier = await transformers.pipeline('image-classification', 'Xenova/vit-base-patch16-224', {
            device: 'cpu'  // CPU backend for stability
        });
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

    // 4. 推論を実行
    return await classifier(rawImage);
}
export function isInitialized() {
    return classifier !== null;
}