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
        this.segmentationPoints = [];

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
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
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
                    this.segmentationPoints = []; // 新しい画像でポイントをリセット
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

        // セグメンテーションポイントを再描画
        this.drawSegmentationPoints();
    }

    handleCanvasClick(event) {
        if (!this.currentImage) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        this.segmentationPoints.push({ x, y, label: 1 });
        this.drawSegmentationPoints();
        this.updateStatus(`ポイントを追加しました (${this.segmentationPoints.length}点)`);
    }

    drawSegmentationPoints() {
        this.ctx.fillStyle = 'red';
        this.segmentationPoints.forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
            this.ctx.fill();
        });
    }

    async performSegmentation() {
        if (!this.currentImage || this.segmentationPoints.length === 0) {
            this.updateStatus('画像とポイントを選択してください', 'error');
            return;
        }

        try {
            this.updateStatus('セグメンテーションを実行中...');
            const result = await generateMask(this.currentImage, this.segmentationPoints, transformers);
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

        const mask = result[0]; // 最初のマスクを使用
        const maskData = mask.mask; // image-segmentation の場合 mask.mask

        // マスクデータをリサイズしてキャンバスにフィット
        const maskCanvas = document.createElement('canvas');
        const maskCtx = maskCanvas.getContext('2d');
        maskCanvas.width = maskData.width;
        maskCanvas.height = maskData.height;

        // マスクデータをImageDataに変換
        const imageData = maskCtx.createImageData(maskData.width, maskData.height);
        for (let i = 0; i < maskData.data.length; i++) {
            const value = maskData.data[i] * 255;
            imageData.data[i * 4] = value;     // R
            imageData.data[i * 4 + 1] = value; // G
            imageData.data[i * 4 + 2] = value; // B
            imageData.data[i * 4 + 3] = 128;   // A (半透明)
        }

        maskCtx.putImageData(imageData, 0, 0);

        // マスクをメインキャンバスにスケーリングして描画
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        this.maskCtx.drawImage(maskCanvas, 0, 0, this.maskCanvas.width, this.maskCanvas.height);
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