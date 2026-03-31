// src/features/inpainting.js
// Stable Diffusion Inpainting を使用した画像編集機能

let inpainter = null;

export async function initInpainting(transformers) {
    if (!inpainter) {
        console.log("Loading Stable Diffusion Inpainting model...");
        const device = navigator.gpu ? 'webgpu' : 'cpu';
        console.log(`Using device: ${device}`);

        const modelCandidates = [
            'Xenova/stable-diffusion-inpainting',
            'Xenova/stable-diffusion-1.5-inpainting',
            'Xenova/stable-diffusion-2-inpainting',
            'Xenova/stable-diffusion-v1-5' // 後段フォールバック
        ];

        let lastError = null;
        for (const model of modelCandidates) {
            try {
                console.log(`Trying model: ${model}`);
                inpainter = await transformers.pipeline('image-to-image', model, {
                    device: device
                });
                console.log(`Loaded inpainting model: ${model}`);
                break;
            } catch (err) {
                console.warn(`Failed to load model ${model}:`, err.message || err);
                lastError = err;
            }
        }

        if (!inpainter) {
            const message = lastError?.message || 'モデルのロードに失敗しました';
            throw new Error(`Inpaintingモデルの初期化に失敗しました: ${message}`);
        }
    }
    return inpainter;
}

export async function performInpainting(imageElement, maskImageData, prompt, transformers) {
    // 1. Inpaintingが初期化されていなければ初期化
    if (!inpainter) {
        await initInpainting(transformers);
    }

    // 2. 画像を RawImage に変換
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    ctx.drawImage(imageElement, 0, 0);
    const imageData = ctx.getImageData(0, 0, imageElement.width, imageElement.height);
    const rawImage = new transformers.RawImage(imageData.data, imageData.width, imageData.height, 4);

    // 3. マスクを RawImage に変換
    const maskRawImage = new transformers.RawImage(maskImageData.data, maskImageData.width, maskImageData.height, 4);

    // 4. Inpainting 実行
    const result = await inpainter(prompt, {
        image: rawImage,
        mask_image: maskRawImage,
        num_inference_steps: 20,  // ステップ数を少なくして高速化
        guidance_scale: 7.5
    });

    return result;
}