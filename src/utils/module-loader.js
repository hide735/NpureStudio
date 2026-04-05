// src/utils/module-loader.js
// Utility to dynamically import modules with an automatic cache-buster query param
export async function importWithCacheBuster(specifier, options = {}) {
    const { cacheBuster = true } = options || {};
    if (typeof specifier !== 'string') throw new Error('specifier must be a string');

    if (!cacheBuster) {
        return await import(specifier);
    }

    const final = specifier + (specifier.includes('?') ? '&' : '?') + 'cb=' + Date.now();
    return await import(final);
}
