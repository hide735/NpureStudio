// src/utils/debug.js
// シンプルなランタイムデバッグヘルパー
export function createLogger(section) {
    const isEnabled = (() => {
        try {
            if (typeof window !== 'undefined' && window.NPURE_DEBUG === true) return true;
            return (typeof localStorage !== 'undefined' && localStorage.getItem && localStorage.getItem('npure_debug') === '1');
        } catch (e) {
            return false;
        }
    })();

    function fmt(...args) {
        const prefix = `[Npure][${section}]`;
        return [prefix, ...args];
    }

    return {
        info: (...args) => { if (isEnabled) console.info(...fmt(...args)); },
        debug: (...args) => { if (isEnabled) console.debug(...fmt(...args)); },
        warn: (...args) => { console.warn(...fmt(...args)); },
        error: (...args) => { console.error(...fmt(...args)); }
    };
}

export function enableDebug() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('npure_debug', '1'); } catch(e){}
}

export function disableDebug() {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('npure_debug'); } catch(e){}
}
