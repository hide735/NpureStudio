// src/utils/module-loader.js
// Utility to dynamically import modules with optional cache-busting.
// Default behavior: in development use a timestamp cache-buster; in production append project version.
import { NPURE_VERSION } from '../version.js';

export async function importWithCacheBuster(specifier, options = {}) {
    const { cacheBuster = false, useVersion = true } = options || {};
    if (typeof specifier !== 'string') throw new Error('specifier must be a string');

    // If explicit cacheBuster is requested (dev), append timestamp to force reload.
    if (cacheBuster) {
        const final = specifier + (specifier.includes('?') ? '&' : '?') + 'cb=' + Date.now();
        return await import(final);
    }

    // Otherwise, if versioning is enabled and a project version exists, append `v=` param.
    if (useVersion && typeof NPURE_VERSION === 'string' && NPURE_VERSION) {
        const final = specifier + (specifier.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(NPURE_VERSION);
        return await import(final);
    }

    // Fallback: plain import
    return await import(specifier);
}
