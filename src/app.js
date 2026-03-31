// NpureStudio メインアプリ
class NpureStudio {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.statusDiv = document.getElementById('status');
        this.imageUpload = document.getElementById('image-upload');
        this.processBtn = document.getElementById('process-btn');
        this.tryOnBtn = document.getElementById('try-on-btn');
        this.generateBtn = document.getElementById('generate-btn');

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.checkWebGPU();
        this.updateStatus('アプリが初期化されました');
    }

    setupCanvas() {
        // キャンバスサイズをモバイル最適化
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // リサイズ対応
        window.addEventListener('resize', () => {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        });
    }

    setupEventListeners() {
        this.imageUpload.addEventListener('change', (e) => this.handleImageUpload(e));
        this.processBtn.addEventListener('click', () => this.processImage());
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

    handleImageUpload(event) {
        const files = event.target.files;
        if (files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.drawImage(img);
                    this.updateStatus('画像を読み込みました');
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

    processImage() {
        this.updateStatus('画像処理中...');
        // ここにAI処理を追加（次のタスクで）
        setTimeout(() => {
            this.updateStatus('処理完了');
        }, 2000);
    }

    switchToTryOn() {
        this.updateStatus('試着モードに切り替え');
        // UI切り替えロジック（次のタスクで）
    }

    switchToGenerate() {
        this.updateStatus('生成モードに切り替え');
        // UI切り替えロジック（次のタスクで）
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