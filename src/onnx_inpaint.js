// Minimal browser-side loader example for ONNX Runtime Web
// Requires including ONNX Runtime Web script in the page.

export async function loadModel(url) {
  if (typeof ort === 'undefined') {
    throw new Error('ONNX Runtime Web (ort) not found; include CDN script first');
  }
  // prefer webgpu if available, fallback to wasm
  const providers = (ort.env && ort.env.wasm && ort.env.wasm.wasmSimd) ? ['wasm'] : ['wasm'];
  const session = await ort.InferenceSession.create(url, {executionProviders: providers});
  return session;
}

export async function runInpaint(session, inputTensor) {
  // inputTensor: Float32Array or ort.Tensor shaped [1,4,H,W]
  const inputName = (session.inputNames && session.inputNames.length>0)
    ? session.inputNames[0]
    : Object.keys(session.inputMetadata)[0];
  const outputName = (session.outputNames && session.outputNames.length>0)
    ? session.outputNames[0]
    : Object.keys(session.outputMetadata)[0];
  const feeds = {};
  const tensor = new ort.Tensor('float32', inputTensor.data || inputTensor, inputTensor.dims || [1,4,128,128]);
  // Populate feeds for all declared input names (some runtimes expect specific names)
  const declaredInputs = Object.keys(session.inputMetadata || {});
  declaredInputs.forEach((k) => { feeds[k] = tensor; });
  // Also add resolved name and a common fallback name
  if (inputName) feeds[inputName] = tensor;
  feeds['input'] = tensor;
  console.log('Declared inputs:', declaredInputs);
  console.log('Using feeds keys:', Object.keys(feeds));
  console.log('Session summary:', {inputNames: session.inputNames, outputNames: session.outputNames});
  const out = await session.run(feeds);
  return out[outputName];
}
