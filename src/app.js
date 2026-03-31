// import { initTransformers } from './core/transformers.js';
import * as transformers from '../assets/transformers.min.js';
import { initImageRecognition, classifyImage, isInitialized } from './features/image-recognition.js';
import { initSegmentation, generateMask } from './features/segmentation.js';

// NpureStudio メインアプリ
class NpureStudio {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.maskCanvas = document.getElementById('mask-canvas');
        this.maskCtx = this.maskCanvas.getContext('2d');
        this.statusDiv = document.getElementById('status');
        this.imageUpload = document.getElementById('image-upload');
        this.processBtn = document.getElementById('process-btn');
        this.segmentBtn = document.getElementById('segment-btn');
        this.tryOnBtn = document.getElementById('try-on-btn');
        this.generateBtn = document.getElementById('generate-btn');

        this.currentImage = null;

        this.init();
    }

    async init() {
        this.setupCanvas();
        this.setupEventListeners();

        if (await this.checkWebGPU()) {
            try {
                await initImageRecognition(transformers);
                await initSegmentation(transformers);
                this.updateStatus('AIモデルが初期化されました', 'success');
            } catch (err) {
                this.updateStatus('初期化失敗: ' + err.message, 'error');
            }
        }

        this.updateStatus('アプリが初期化されました');
    }

    setupCanvas() {
        // キャンバスサイズをモバイル最適化
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.maskCanvas.width = rect.width;
        this.maskCanvas.height = rect.height;

        // リサイズ対応
        window.addEventListener('resize', () => {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.maskCanvas.width = rect.width;
            this.maskCanvas.height = rect.height;
        });
    }

    async waitForTransformers() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.transformers) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    setupEventListeners() {
        this.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
        this.processBtn.addEventListener('click', () => this.processImage());
        this.segmentBtn.addEventListener('click', () => this.performSegmentation());
        this.tryOnBtn.addEventListener('click', () => this.switchToTryOn());
        this.generateBtn.addEventListener('click', () => this.switchToGenerate());
    }

    async checkWebGPU() {
        if (!navigator.gpu) {
            this.updateStatus('❌ WebGPU がサポートされていません', 'error');
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                this.updateStatus('✅ WebGPU 対応 - iPhone NPU 利用可能', 'success');
                return true;
            } else {
                this.updateStatus('❌ WebGPU アダプタが見つかりません', 'error');
                return false;
            }
        } catch (error) {
            this.updateStatus('❌ WebGPU 初期化エラー: ' + error.message, 'error');
            return false;
        }
    }

    async handleImageUpload(event) {
        const files = event.target.files;
        if (files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = async (e) => {
                const img = new Image();
                img.onload = async () => {
                    this.currentImage = img;
                    this.drawImage(img);
                    this.clearMask();
                    this.updateStatus('画像を読み込みました');

                    // 画像認識を実行
                    if (isInitialized()) {
                        try {
                            this.updateStatus('画像を分析中...');
                            const results = await classifyImage(img, transformers);
                            this.displayClassificationResults(results);
                        } catch (error) {
                            this.updateStatus('画像分析に失敗しました: ' + error.message, 'error');
                        }
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    drawImage(img) {
        const canvas = this.canvas;
        const ctx = this.ctx;

        // アスペクト比を維持してフィット
        const canvasRatio = canvas.width / canvas.height;
        const imgRatio = img.width / img.height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgRatio > canvasRatio) {
            drawWidth = canvas.width;
            drawHeight = canvas.width / imgRatio;
            offsetX = 0;
            offsetY = (canvas.height - drawHeight) / 2;
        } else {
            drawHeight = canvas.height;
            drawWidth = canvas.height * imgRatio;
            offsetX = (canvas.width - drawWidth) / 2;
            offsetY = 0;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    }

    async performSegmentation() {
        if (!this.currentImage) {
            this.updateStatus('画像を選択してください', 'error');
            return;
        }

        try {
            this.updateStatus('セグメンテーションを実行中...');
            const result = await generateMask(this.currentImage, transformers);
            this.drawMask(result);
            this.updateStatus('セグメンテーション完了', 'success');
        } catch (error) {
            this.updateStatus('セグメンテーション失敗: ' + error.message, 'error');
        }
    }

    drawMask(result) {
        if (!result || !result.length) {
            this.updateStatus('マスクが生成されませんでした', 'error');
            return;
        }

        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);

        // 各セグメントのマスクを描画
        result.forEach((segment, index) => {
            const maskData = segment.mask;

            // マスクデータをリサイズしてキャンバスにフィット
            const maskCanvas = document.createElement('canvas');
            const maskCtx = maskCanvas.getContext('2d');
            maskCanvas.width = maskData.width;
            maskCanvas.height = maskData.height;

            // マスクデータをImageDataに変換
            const imageData = maskCtx.createImageData(maskData.width, maskData.height);
            for (let i = 0; i < maskData.data.length; i++) {
                const value = maskData.data[i] * 255;
                // 異なる色でマスクを描画
                const hue = (index * 137.5) % 360; // 黄金角で色を分散
                const rgb = this.hslToRgb(hue / 360, 0.5, 0.5);
                imageData.data[i * 4] = rgb[0];     // R
                imageData.data[i * 4 + 1] = rgb[1]; // G
                imageData.data[i * 4 + 2] = rgb[2]; // B
                imageData.data[i * 4 + 3] = value;   // A
            }

            maskCtx.putImageData(imageData, 0, 0);

            // マスクをメインキャンバスにスケーリングして描画
            this.maskCtx.drawImage(maskCanvas, 0, 0, this.maskCanvas.width, this.maskCanvas.height);
        });
    }

    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    clearMask() {
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    }

    switchToTryOn() {
        this.updateStatus('試着モードに切り替え');
        // UI切り替えロジック（次のタスクで）
    }

    switchToGenerate() {
        this.updateStatus('生成モードに切り替え');
        // UI切り替えロジック（次のタスクで）
    }

    displayClassificationResults(results) {
        const topResult = results[0];
        this.updateStatus(`分析結果: ${topResult.label} (${(topResult.score * 100).toFixed(1)}%)`, 'success');

        // コンソールに詳細結果を表示
        console.log('Classification results:', results);
    }

    updateStatus(message, type = 'info') {
        this.statusDiv.textContent = message;
        this.statusDiv.className = type;
    }
}

// アプリ起動
document.addEventListener('DOMContentLoaded', () => {
    new NpureStudio();
});