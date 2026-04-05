import { initTransformers } from './core/transformers.js';
import { initImageRecognition, classifyImage, isInitialized } from './features/image-recognition.js';
import { initSegmentation, generateMask, segmentByPoint } from './features/segmentation.js';
import { initInpainting, performInpainting } from './features/inpainting.js';
import { enableDebug, disableDebug } from './utils/debug.js';
import { importWithCacheBuster } from './utils/module-loader.js';

// Dynamic feature module loader with automatic cache-busting for development / hot reload
const _featureModuleCache = {};
async function _loadFeatureModule(specifier) {
    // Resolve specifier relative to this module (`app.js`) so callers can pass
    // './features/translator.js' and have it resolve to '/src/features/...',
    // not relative to the loader module's location.
    const resolved = (typeof specifier === 'string') ? new URL(specifier, import.meta.url).href : specifier;
    // Determine development mode: prefer explicit debug flag or localhost
    const isDev = (() => {
        try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('npure_debug') === '1') return true;
            if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return true;
        } catch (e) {}
        return false;
    })();

    // In production use cached module; in dev always re-import with cache-buster and update cache.
    if (!isDev && _featureModuleCache[resolved]) return _featureModuleCache[resolved];
    const mod = await importWithCacheBuster(resolved, { cacheBuster: isDev });
    _featureModuleCache[resolved] = mod;
    return mod;
}

// Translator wrappers (preserve original API names used elsewhere in this file)
async function initTranslator(transformers, device) {
    console.log('Initializing translator with device:', device);
    const m = await _loadFeatureModule('./features/translator.js');
    var res = m.initTranslator(transformers, device);
    console.log('Translator initialized:', !!res);
    return res;
}
async function translate(text) {
    console.log('Translating:', text);
    const m = await _loadFeatureModule('./features/translator.js');
    var res = m.translate(text);
    console.log('Translation result:', res);
    return res;
}
async function disposeTranslator() {
    console.log('Disposing translator');
    const key = new URL('./features/translator.js', import.meta.url).href;
    const m = _featureModuleCache[key];
    if (m && typeof m.disposeTranslator === 'function') return m.disposeTranslator();
}
function isTranslatorInitialized() {
    console.log('Checking if translator is initialized');
    const key = new URL('./features/translator.js', import.meta.url).href;
    const m = _featureModuleCache[key];
    return !!(m && typeof m.isTranslatorInitialized === 'function' && m.isTranslatorInitialized());
}

// Generator wrappers
async function initGenerator(transformers, device, options) {
    const m = await _loadFeatureModule('./features/generator.js');
    return m.initGenerator(transformers, device, options);
}
async function generateImage(prompt, options) {
    const m = await _loadFeatureModule('./features/generator.js');
    return m.generateImage(prompt, options);
}
async function disposeGenerator() {
    const key = new URL('./features/generator.js', import.meta.url).href;
    const m = _featureModuleCache[key];
    if (m && typeof m.disposeGenerator === 'function') return m.disposeGenerator();
}
function isGeneratorInitialized() {
    const key = new URL('./features/generator.js', import.meta.url).href;
    const m = _featureModuleCache[key];
    return !!(m && typeof m.isGeneratorInitialized === 'function' && m.isGeneratorInitialized());
}

// NpureStudio メインアプリ
class NpureStudio {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.maskCanvas = document.getElementById('mask-canvas');
        this.maskCtx = this.maskCanvas.getContext('2d');
        this.statusDiv = document.getElementById('status');
        this.personUpload = document.getElementById('person-upload');
        this.clothUpload = document.getElementById('cloth-upload');
        this.segmentBtn = document.getElementById('segment-btn');
        this.tryOnBtn = document.getElementById('try-on-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.inpaintPrompt = document.getElementById('inpaint-prompt');
        this.debugToggle = document.getElementById('debug-toggle');
        this.debugEnabled = false;

        this.personImage = null;
        this.clothImage = null;
        this.personMaskImageData = null;
        this.transformers = null;
        this.device = null;
        this.gpuDevice = null;
        this.init();
    }

    setupCanvas() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        // Ensure integer sizes
        this.canvas.width = Math.round(rect.width);
        this.canvas.height = Math.round(rect.height);
        if (this.maskCanvas) {
            this.maskCanvas.width = Math.round(rect.width);
            this.maskCanvas.height = Math.round(rect.height);
        }

        // Re-draw on resize and keep mask aligned
        window.addEventListener('resize', () => {
            try {
                const r = this.canvas.getBoundingClientRect();
                this.canvas.width = Math.round(r.width);
                this.canvas.height = Math.round(r.height);
                if (this.maskCanvas) {
                    this.maskCanvas.width = Math.round(r.width);
                    this.maskCanvas.height = Math.round(r.height);
                }
                if (this.personImage) this.drawImage(this.personImage);
                if (this.personMaskImageData) {
                    this.clearMask();
                    try { this.maskCtx.putImageData(this.personMaskImageData, 0, 0); } catch (e) {}
                }
            } catch (e) {
                console.warn('resize redraw failed', e);
            }
        });
    }

    async init() {
        // UI and canvas setup
        try { this.setupCanvas(); } catch (e) { console.warn('setupCanvas failed', e); }
        try { this.setupEventListeners(); } catch (e) { console.warn('setupEventListeners failed', e); }

        // Initialize debug state if present
        try { this.initDebugState(); } catch (e) { /* ignore */ }

        // Note: Transformers and model pipelines are loaded lazily on-demand
        // to avoid triggering network/GPU probing and large memory usage at page load.

        this.updateStatus('アプリが初期化されました');
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

    // Ensure transformers environment is initialized. Returns true on success.
    async ensureTransformers() {
        if (this.transformers) return true;
        try {
            this.updateStatus('Transformers 環境を初期化中...', 'info');
            const tf = await initTransformers();
            this.transformers = tf.transformers;
            this.device = tf.device;
            this.gpuDevice = tf.gpuDevice;
            this.updateStatus('Transformers 初期化完了', 'success');
            return true;
        } catch (e) {
            console.warn('ensureTransformers failed:', e?.message || e);
            this.transformers = null;
            this.device = 'wasm';
            this.gpuDevice = null;
            this.updateStatus('Transformers 初期化に失敗しました（ネットワーク/CORS を確認してください）', 'error');
            return false;
        }
    }

    async handlePersonUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image();
            img.onload = async () => {
                this.personImage = img;
                this.drawImage(img);
                this.clearMask();
                this.personMaskImageData = null;
                this.updateStatus('人物画像を読み込みました');

                if (isInitialized()) {
                    try {
                        const ok = await this.ensureTransformers();
                        if (!ok) return;
                        this.updateStatus('人物画像を分析中...');
                        const results = await classifyImage(img, this.transformers, this.device);
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

    async handleClothUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            const img = new Image();
            img.onload = async () => {
                this.clothImage = img;
                this.updateStatus('衣服画像を読み込みました');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
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
        if (!this.personImage) {
            this.updateStatus('人物画像を選択してください', 'error');
            return;
        }

            try {
                const ok = await this.ensureTransformers();
                if (!ok) return;
                this.updateStatus('人物セグメンテーションを実行中...');
                const result = await generateMask(this.personImage, this.transformers, this.device);
                this.drawMask(result);
                this.personMaskImageData = this.buildMaskImageData(result);
                this.updateStatus('セグメンテーション完了', 'success');
            } catch (error) {
                this.updateStatus('セグメンテーション失敗: ' + error.message, 'error');
            }
    }

    async performTryOn() {
        if (!this.personImage) {
            this.updateStatus('人物画像を選択してください', 'error');
            return;
        }
        if (!this.clothImage) {
            this.updateStatus('衣服画像を選択してください', 'error');
            return;
        }
        if (!this.personMaskImageData) {
            this.updateStatus('まずセグメンテーションを実行してください', 'error');
            return;
        }

        const prompt = this.inpaintPrompt.value || `Try on clothing from reference image.`;

            try {
                const ok = await this.ensureTransformers();
                if (!ok) return;
                this.updateStatus('試着（インペイント）を実行中...');

                    // 衣服画像をプロンプトに追加してスタイルを反映（簡易対応）
                    const stylePrompt = `${prompt} Wear clothes matching the reference garment.`;

                    const inpaintResult = await performInpainting(this.personImage, this.personMaskImageData, stylePrompt, this.transformers, this.device, this.gpuDevice);

                if (inpaintResult instanceof HTMLImageElement) {
                this.drawImage(inpaintResult);
            } else if (inpaintResult instanceof ImageData) {
                const outputCanvas = document.createElement('canvas');
                outputCanvas.width = inpaintResult.width;
                outputCanvas.height = inpaintResult.height;
                const outputCtx = outputCanvas.getContext('2d');
                outputCtx.putImageData(inpaintResult, 0, 0);
                this.drawImage(outputCanvas);
            } else if (inpaintResult instanceof HTMLCanvasElement) {
                this.drawImage(inpaintResult);
                } else if (inpaintResult && typeof inpaintResult === 'object' && inpaintResult.dataURL) {
                    // performInpainting may return { dataURL, width, height }
                    const img = new Image();
                    img.onload = () => this.drawImage(img);
                    img.onerror = (e) => this.updateStatus('試着画像の読み込みに失敗しました', 'error');
                    img.src = inpaintResult.dataURL;
            } else {
                this.updateStatus('試着結果が予期しない形式です', 'error');
                return;
            }

            this.updateStatus('試着完了', 'success');
        } catch (error) {
            // HFトークン未設定などで401/403になる環境では、簡易なローカル合成にフォールバック
            console.warn('Inpainting failed, falling back to compositing:', error);

            try {
                const overlayCanvas = this.simpleTryOn(this.personImage, this.clothImage, this.personMaskImageData);
                this.drawImage(overlayCanvas);
                this.updateStatus('試着完了（フォールバック合成）', 'success');
            } catch (composeError) {
                this.updateStatus('試着失敗: ' + (composeError.message || error.message), 'error');
            }
        }
    }

    resetApp() {
        this.personImage = null;
        this.clothImage = null;
        this.personMaskImageData = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        this.updateStatus('リセット完了: 画像とマスクをクリアしました', 'info');
    }

    simpleTryOn(personImage, clothImage, maskImageData) {
        const baseCanvas = document.createElement('canvas');
        baseCanvas.width = personImage.width;
        baseCanvas.height = personImage.height;
        const baseCtx = baseCanvas.getContext('2d');
        baseCtx.drawImage(personImage, 0, 0, baseCanvas.width, baseCanvas.height);

        const clothCanvas = document.createElement('canvas');
        clothCanvas.width = baseCanvas.width;
        clothCanvas.height = baseCanvas.height;
        const clothCtx = clothCanvas.getContext('2d');

        // 衣服画像を人物サイズにフィット（アスペクト比維持）
        const clothRatio = clothImage.width / clothImage.height;
        const targetRatio = clothCanvas.width / clothCanvas.height;
        let cw, ch, cx, cy;
        if (clothRatio > targetRatio) {
            cw = clothCanvas.width;
            ch = cw / clothRatio;
            cx = 0;
            cy = (clothCanvas.height - ch) / 2;
        } else {
            ch = clothCanvas.height;
            cw = ch * clothRatio;
            cx = (clothCanvas.width - cw) / 2;
            cy = 0;
        }
        clothCtx.drawImage(clothImage, cx, cy, cw, ch);

        // マスクを利用して衣服領域を切り抜き
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = maskImageData.width;
        maskCanvas.height = maskImageData.height;
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.putImageData(maskImageData, 0, 0);

        const maskedClothCanvas = document.createElement('canvas');
        maskedClothCanvas.width = baseCanvas.width;
        maskedClothCanvas.height = baseCanvas.height;
        const maskedClothCtx = maskedClothCanvas.getContext('2d');

        maskedClothCtx.drawImage(clothCanvas, 0, 0);
        maskedClothCtx.globalCompositeOperation = 'destination-in';
        maskedClothCtx.drawImage(maskCanvas, 0, 0, baseCanvas.width, baseCanvas.height);

        baseCtx.globalCompositeOperation = 'source-over';
        baseCtx.drawImage(maskedClothCanvas, 0, 0);

        return baseCanvas;
    }

    buildMaskImageData(result) {
        if (!result || !result.length) {
            return null;
        }

        const width = result[0].mask.width;
        const height = result[0].mask.height;
        const combinedMask = new Float32Array(width * height);

        for (const segment of result) {
            const segmentMask = segment.mask;
            if (!segmentMask || !segmentMask.data) continue;
            for (let i = 0; i < segmentMask.data.length; i++) {
                combinedMask[i] = Math.max(combinedMask[i], segmentMask.data[i]);
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        for (let i = 0; i < combinedMask.length; i++) {
            const alphaValue = Math.round(Math.min(1, combinedMask[i]) * 255);
            imageData.data[i * 4] = 255;
            imageData.data[i * 4 + 1] = 255;
            imageData.data[i * 4 + 2] = 255;
            imageData.data[i * 4 + 3] = alphaValue;
        }
        ctx.putImageData(imageData, 0, 0);

        return ctx.getImageData(0, 0, width, height);
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

            // データ長と幅・高さの整合性チェック
            const totalPixels = maskData.data ? maskData.data.length : 0;
            const expected = maskData.width * maskData.height;
            if (totalPixels !== expected) {
                console.warn('Mask length mismatch:', { totalPixels, expected });
                console.log('Mask data length:', totalPixels);
                console.log('Expected length:', expected);
                // 試しに平方根で正方形を推定
                const side = Math.round(Math.sqrt(totalPixels));
                if (side * side === totalPixels) {
                    maskData.width = side;
                    maskData.height = side;
                } else if (maskData.width && Math.ceil(totalPixels / maskData.width) * maskData.width === totalPixels) {
                    maskData.height = Math.ceil(totalPixels / maskData.width);
                } else {
                    // 最終手段で高さを切り上げ
                    maskData.height = Math.ceil(totalPixels / (maskData.width || 1));
                }
            }

            // ロジットか確率かを判定して閾値を決める
            const data = maskData.data;
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                if (v < min) min = v;
                if (v > max) max = v;
            }
            const isLogit = (min < 0) || (max > 1.1);
            // Use a stricter threshold for logits to remove low-confidence noise
            // Increase logit threshold to reduce faint/full-body bleed into part masks
            const threshold = isLogit ? 3.0 : 0.6;

            // 異なる色でマスクを描画（閾値で二値化してノイズを除去）
            const hue = (index * 137.5) % 360; // 黄金角で色を分散
            const rgb = this.hslToRgb(hue / 360, 0.5, 0.5);
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                const isTarget = isLogit ? (v > threshold) : (v >= threshold);
                const alpha = isTarget ? 255 : 0;
                imageData.data[i * 4] = rgb[0];     // R
                imageData.data[i * 4 + 1] = rgb[1]; // G
                imageData.data[i * 4 + 2] = rgb[2]; // B
                imageData.data[i * 4 + 3] = alpha;   // A
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
    handleDebugToggle(event) {
        const checked = event.target.checked;
        try {
            if (checked) {
                enableDebug();
                this.updateStatus('デバッグモードを有効化', 'info');
            } else {
                disableDebug();
                this.updateStatus('デバッグモードを無効化', 'info');
            }
            this.debugEnabled = !!checked;
        } catch (e) {
            console.warn('Failed to toggle debug mode', e);
        }
    }

    initDebugState() {
        try {
            const hasFlag = (typeof window !== 'undefined' && window.NPURE_DEBUG === true) ||
                (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('npure_debug') === '1');
            if (this.debugToggle) this.debugToggle.checked = !!hasFlag;
            if (hasFlag) enableDebug(); else disableDebug();
            this.debugEnabled = !!hasFlag;
        } catch (e) {
            // ignore localStorage errors
        }
    }
    // app.js のクラス内（メソッドとして追加）
    async handleCanvasClick(event) {
        if (!this.personImage) return;

        // 1. キャンバス上のクリック座標を、実際の画像上の座標に変換
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.personImage.width / rect.width;
        const scaleY = this.personImage.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        try {
            console.info('Canvas clicked at', { x, y });
            this.updateStatus('SAMモデルを準備・解析中... (初回は数秒〜数十秒かかります)', 'info');
            const ok = await this.ensureTransformers();
            if (!ok) return;
            // 2. 作成した segmentByPoint を呼び出す（transformers を渡す）
            const result = await segmentByPoint(this.personImage, x, y, this.transformers, this.device);
            console.info('segmentByPoint result received', result);

            // 3. マスクを描画 (既存の drawMask メソッドを利用)
            // API: segmentByPoint は { mask, width, height } を返します
            if (result && result.mask) {
                const mask = result.mask;
                console.info('Drawing mask from segmentByPoint result', { mask, width: result.width, height: result.height });
                this.drawMask([{ mask: { data: mask.data, width: result.width || mask.width, height: result.height || mask.height } }]);
            } else {
                console.warn('マスクが生成されませんでした', result);
                this.updateStatus('マスクが生成されませんでした', 'error');
            }
            
            console.info('セグメンテーション完了');
            this.updateStatus('セグメンテーション完了', 'success');
        } catch (error) {
            this.updateStatus('解析失敗: ' + error.message, 'error');
        }
    }

    setupEventListeners() {
        if (this.personUpload) this.personUpload.addEventListener('change', (e) => this.handlePersonUpload(e));
        if (this.clothUpload) this.clothUpload.addEventListener('change', (e) => this.handleClothUpload(e));
        if (this.segmentBtn) this.segmentBtn.addEventListener('click', () => this.performSegmentation());
        if (this.tryOnBtn) this.tryOnBtn.addEventListener('click', () => this.performTryOn());
        // Generate button (Text-to-Image)
        this.generateBtn = document.getElementById('generate-btn');
        if (this.generateBtn) this.generateBtn.addEventListener('click', () => this.handleGenerateClick());
        if (this.resetBtn) this.resetBtn.addEventListener('click', () => this.resetApp());
        if (this.canvas) this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        if (this.debugToggle) this.debugToggle.addEventListener('change', (e) => this.handleDebugToggle(e));
    }

    async handleGenerateClick() {
        const prompt = (this.inpaintPrompt && this.inpaintPrompt.value) ? this.inpaintPrompt.value : '';
        if (!prompt || !prompt.trim()) {
            this.updateStatus('プロンプトを入力してください', 'error');
            return;
        }

        try {

            // Ensure transformers and translator are initialized lazily.
            const ok = await this.ensureTransformers();
            if (!ok) return;

            if (!isTranslatorInitialized()) {
                console.log('Translator not initialized, initializing now...');
                this.updateStatus('翻訳パイプラインを初期化中（初回は時間がかかります）...', 'info');
                try {
                    console.log('Initializing translator with transformers and device:', this.transformers, this.device);
                    await initTranslator(this.transformers, this.device);
                    console.log('Translator initialized successfully.');
                    this.updateStatus('翻訳パイプライン初期化完了', 'success');
                } catch (e) {
                    console.error('Translator init failed:', e);
                    this.updateStatus('翻訳パイプラインの初期化に失敗しました: ' + (e?.message || e), 'error');
                    return;
                }
            }

            // Lazily initialize generator on first use to avoid heavy memory
            // allocation at startup (helps iPhone NPU/adapter stability).
            if (!isGeneratorInitialized()) {
                this.updateStatus('生成パイプラインを初期化中（初回は時間がかかります）...', 'info');
                try {
                    await initGenerator(this.transformers, this.device);
                    this.updateStatus('生成パイプライン初期化完了', 'success');
                } catch (e) {
                    console.error('Generator init failed:', e);
                    this.updateStatus('生成パイプラインの初期化に失敗しました: ' + (e?.message || e), 'error');
                    return;
                }
            }

            this.updateStatus('翻訳中...', 'info');
            const enPrompt = await translate(prompt);

            this.updateStatus('画像生成中 (WebGPU)...', 'info');
            const resultCanvas = await generateImage(enPrompt);

            if (resultCanvas instanceof HTMLCanvasElement) {
                this.drawImage(resultCanvas);
            } else if (resultCanvas instanceof HTMLImageElement) {
                this.drawImage(resultCanvas);
            } else if (typeof resultCanvas === 'string') {
                const img = new Image();
                img.onload = () => this.drawImage(img);
                img.onerror = () => this.updateStatus('生成画像の読み込みに失敗しました', 'error');
                img.src = resultCanvas;
            } else {
                console.warn('Unknown generation result type:', resultCanvas);
                this.updateStatus('生成結果の形式が不明です', 'error');
            }

            this.updateStatus('生成完了', 'success');
        } catch (err) {
            console.error('Generate failed:', err);
            this.updateStatus('生成失敗: ' + (err?.message || String(err)), 'error');
        }
    }
}

// アプリ起動
document.addEventListener('DOMContentLoaded', () => {
    new NpureStudio();
});