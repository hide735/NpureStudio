# tools/download_hf_model.ps1
# Hugging Face モデルをローカルにダウンロードしてプロジェクト配下に配置する補助スクリプト
# 使い方:
# 1) PowerShell を開く
# 2) 環境変数を設定 (一時的):
#    $env:HUGGINGFACE_HUB_TOKEN = "hf_..."
# 3) このスクリプトを実行:
#    .\download_hf_model.ps1 -Model "onnx-community/Qwen2-VL-2B-Instruct" -OutDir "models/onnx-community/Qwen2-VL-2B-Instruct"

param(
    [Parameter(Mandatory=$true)][string]$Model,
    [Parameter(Mandatory=$true)][string]$OutDir
)

# 簡単な Python ワンライナーで huggingface_hub の snapshot_download を呼ぶ
$python = "python"
$code = @"
from huggingface_hub import snapshot_download
import os
model = os.environ.get('HF_MODEL_PATH') or '$Model'
outdir = '$OutDir'
print('Downloading', model, '->', outdir)
snapshot_download(repo_id=model, cache_dir=outdir, local_files_only=False)
print('Done')
"@

# 実行
$cmd = "$python - <<'PY'`n$code`nPY"
Invoke-Expression $cmd
