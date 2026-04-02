import sys
import numpy as np
import onnx
import onnxruntime as ort

def verify(path: str):
    print('Loading ONNX:', path)
    model = onnx.load(path)
    onnx.checker.check_model(model)
    sess = ort.InferenceSession(path)
    inp_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name
    dummy = np.random.randn(1,4,128,128).astype(np.float32)
    out = sess.run([out_name], {inp_name: dummy})
    print('Inference OK, output shape:', out[0].shape)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: verify_onnx.py <model.onnx>')
        sys.exit(1)
    verify(sys.argv[1])
