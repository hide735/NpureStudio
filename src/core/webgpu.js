export async function initWebGPU() {
    if (!navigator.gpu) {
        throw new Error('WebGPU not supported');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        // Let callers decide how to fallback; throw so upstream can catch and switch to WASM
        throw new Error('WebGPU adapter not found');
    }

    const device = await adapter.requestDevice();
    return { adapter, device };
}

export function checkWebGPUAvailable() {
    return !!navigator.gpu;
}
