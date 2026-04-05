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

    const modelId = 'Xenova/t5-small';
    const tasks = ['translation', 'text2text-generation', 'text-generation'];

    async function attemptInit(devToTry) {
        const dtype = devToTry === 'webgpu' ? 'fp16' : 'fp32';
        const opts = { device: devToTry, dtype };
        const tried = [];

        // Try pipeline() first (if available)
        if (typeof transformers.pipeline === 'function') {
            for (const task of tasks) {
                try {
                    const p = await transformers.pipeline(task, modelId, opts);
                    if (p) return p;
                } catch (e) {
                    tried.push(`${task}: ${e?.message || String(e)}`);
                }
            }
        }

        // Try AutoModel classes as fallback
        const autoCandidates = [transformers.AutoModelForSeq2SeqLM, transformers.AutoModelForTranslation];
        for (const C of autoCandidates) {
            if (C && typeof C.from_pretrained === 'function') {
                try {
                    const m = await C.from_pretrained(modelId, opts);
                    if (m) return m;
                } catch (e) {
                    tried.push(`auto(${C.name}): ${e?.message || String(e)}`);
                }
            }
        }

        const err = new Error('Failed to initialize translator: ' + tried.join(' | '));
        err.details = tried;
        throw err;
    }

    try {
        const inst = await attemptInit(device || 'wasm');
        translator = inst;
        log.info('Translator initialized on', device || 'wasm');
        return translator;
    } catch (err) {
        log.error('Translator init failed:', err?.message || err);

        const msg = (err && err.message) ? err.message : String(err || '');
        if (device !== 'wasm' && /adapter|no available|webgpu adapter not found|no adapter/i.test(msg)) {
            log.warn('WebGPU issue detected, retrying translator init with wasm', msg);
            const retry = await attemptInit('wasm');
            translator = retry;
            return translator;
        }

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
        log.debug('Translating text', text.slice(0, 120));
        const out = await translator(text, { max_new_tokens: 256 });
        const first = Array.isArray(out) ? out[0] : out;
        if (!first) return '';
        if (first.translation_text) return first.translation_text;
        const val = first.translation_text || first.generated_text || Object.values(first)[0];
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
