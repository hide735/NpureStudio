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