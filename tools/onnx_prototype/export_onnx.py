import argparse
import os
import torch
from model import SmallUNet

def export(output_path: str):
    model = SmallUNet()
    model.eval()
    dummy = torch.randn(1,4,128,128)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        output_path,
        opset_version=14,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch'}, 'output': {0: 'batch'}}
    )
    print('Exported ONNX to', output_path)

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--output', '-o', default='models/small_unet.onnx')
    args = p.parse_args()
    export(args.output)
