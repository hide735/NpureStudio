Small U-Net prototype for lightweight inpainting (ONNX export)

Setup (python 3.8+ recommended):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Export ONNX:

```bash
python export_onnx.py --output models/small_unet.onnx
```

Verify ONNX (CPU):

```bash
python verify_onnx.py models/small_unet.onnx
```

Notes:
- This is a minimal prototype intended for export and basic verification. For production, apply pruning/quantization and validation on target runtimes (ONNX Runtime Web / WebNN).
