"""
Embed external data files into a single ONNX file.

Usage:
  python embed_external_data.py models/small_unet.onnx

This loads external data referenced by the ONNX model (e.g. .onnx.data files),
inlines the tensor data into the model, and writes a new file with suffix
"_embedded.onnx".
"""
import sys
import os
import onnx
from onnx import external_data_helper

def embed(path: str):
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    dirname = os.path.dirname(path) or '.'
    print('Loading ONNX model:', path)
    model = onnx.load(path)
    print('Loading external data (if any) from', dirname)
    external_data_helper.load_external_data_for_model(model, dirname)
    out = path.replace('.onnx', '_embedded.onnx')
    print('Saving embedded model to', out)
    onnx.save(model, out)
    print('Done')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: embed_external_data.py <model.onnx>')
        sys.exit(1)
    embed(sys.argv[1])
