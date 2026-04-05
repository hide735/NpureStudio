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
    const dev = device ?? 'wasm';
    log.info(`Initializing translator (Xenova/t5-small) on ${dev}`);
    try {
        // Allow remote models (ensure transformers.env configured by caller)
        translator = await transformers.pipeline('translation', 'Xenova/t5-small', { device: dev });
        log.info('Translator pipeline loaded');
        return translator;
    } catch (err) {
        log.error('Failed to initialize translator:', err?.message || err);
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
        // 出力は配列または単一オブジェクトの可能性がある
        const first = Array.isArray(out) ? out[0] : out;
        if (!first) return '';
        // translation pipeline は通常 `translation_text` キーを返す
        if (first.translation_text) return first.translation_text;
        // 他のキー名の可能性に備える
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
