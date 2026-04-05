// src/features/translator.js
// 日本語→英語翻訳モジュール（軽量 T5 を利用）

import { createLogger } from '../utils/debug.js';

let translator = null;
const log = createLogger('translator');

/**
 * 初期化: transformers のインスタンスとデバイスを渡す
 * @param {{}} transformers - import した transformers.js オブジェクト
 * @param {string|null} device - 'webgpu' | 'wasm' など
 */
export async function initTranslator(transformers, device = null) {
    if (!transformers) throw new Error('transformers instance required');
    if (translator) return translator;
    // Use the device explicitly passed from initTransformers; do not
    // probe for adapters or call navigator.gpu.requestAdapter() here.
    const modelId = 'Xenova/t5-small';

    // attemptInit: try to initialize translator for a specific device
    const tasks = ['translation', 'text2text-generation', 'text-generation'];
    async function attemptInit(devToTry) {
        const tried = [];
        const dtype = devToTry === 'webgpu' ? 'fp16' : 'fp32';
        log.info(`Initializing translator (${modelId}) on ${devToTry} (dtype=${dtype})`);

        for (const task of tasks) {
            try {
                translator = await transformers.pipeline(task, modelId, { device: devToTry, dtype });
                console.log('Translator pipeline loaded with task:', task);
                log.info(`Translator pipeline loaded (task=${task})`);
                return translator;
            } catch (err) {
                tried.push(`${task}: ${err?.message || String(err)}`);
            }
        }

        // Fallback: try available AutoModel classes
        try {
            const AutoClass = transformers.AutoModelForSeq2SeqLM || transformers.AutoModelForSeq2Seq || transformers.AutoModel || null;
            if (AutoClass && typeof AutoClass.from_pretrained === 'function') {
                try {
                    const modelObj = await AutoClass.from_pretrained(modelId, { device: devToTry, dtype });
                    translator = modelObj;
                    console.log('Translator loaded via AutoClass.from_pretrained (object returned; may not be pipeline-callable)');
                    log.info('Translator loaded via AutoClass.from_pretrained (object returned; may not be pipeline-callable)');
                    return translator;
                } catch (err) {
                    tried.push(`auto-class.from_pretrained: ${err?.message || String(err)}`);
                }
            } else {
                tried.push('auto-class: unavailable');
            }
        } catch (err) {
            tried.push(`auto-class-check: ${err?.message || String(err)}`);
        }

        const errMsg = 'Failed to initialize translator pipeline: ' + tried.join(' | ');
        const e = new Error(errMsg);
        e.details = tried;
        throw e;
    }

    // Normalize requested device and attempt initialization with fallback to wasm
    const requestedDevice = device ?? 'wasm';
    try {
        return await attemptInit(requestedDevice);
    } catch (err) {
        const msg = (err && err.message) ? err.message : String(err || '');
        if (requestedDevice !== 'wasm' && /adapter|no available|webgpu adapter not found|no adapter|no available adapters/i.test(msg)) {
            log.warn('WebGPU adapter/backend error detected for translator, retrying with wasm:', msg);
            return await attemptInit('wasm');
        }
        log.error('Failed to initialize translator:', msg);
        throw err;
    }
}

/**
 * 日本語テキストを英語に翻訳する
 * @param {string} text - 日本語の入力テキスト
 * @returns {Promise<string>} 英訳テキスト
 */
export async function translate(text) {
    if (!translator) throw new Error('translator not initialized');
    if (typeof text !== 'string' || text.trim() === '') return '';

    try {
        console.debug('Translating text', text.slice(0, 120));
        log.debug('Translating text', text.slice(0, 120));
        const out = await translator(text, { max_new_tokens: 256 });
        // 出力は配列または単一オブジェクトの可能性がある
        const first = Array.isArray(out) ? out[0] : out;
        if (!first) return '';
        // translation pipeline は通常 `translation_text` キーを返す
        if (first.translation_text) return first.translation_text;
        // 他のキー名の可能性に備える
        const val = first.translation_text || first.generated_text || Object.values(first)[0];
        console.debug('Translation output', val);
        return typeof val === 'string' ? val : String(val);
    } catch (err) {
        log.error('Translation failed:', err?.message || err);
        throw err;
    }
}

export async function disposeTranslator() {
    try {
        if (translator && typeof translator.dispose === 'function') {
            await translator.dispose();
        }
    } catch (e) {
        console.warn('[Npure][translator] dispose failed:', e?.message || e);
    }
    translator = null;
}

export function isTranslatorInitialized() {
    return translator !== null;
}
