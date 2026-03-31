export async function initWebGPU() {
    if (!navigator.gpu) {
        throw new Error('WebGPU is not supported in this browser.');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error('Failed to get WebGPU adapter.');
    }

    const device = await adapter.requestDevice();
    return { adapter, device };
}

export function checkWebGPUAvailable() {
    return !!navigator.gpu;
}
