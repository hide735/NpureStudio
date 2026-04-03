const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: path.join(__dirname, 'tmp') });

const MODEL_DIR = path.join(__dirname, '..', 'models', 'onnx-community', 'Qwen2-VL-2B-Instruct');

async function ensurePipeline() {
  if (global.__analyzer_pipeline) return global.__analyzer_pipeline;
  try {
    const { pipeline } = await import('@xenova/transformers');
    if (!fs.existsSync(MODEL_DIR)) {
      console.warn('Model directory not found:', MODEL_DIR);
      return null;
    }
    console.log('Loading analyzer pipeline from', MODEL_DIR);
    // device='cpu' for server-side by default; adjust if GPU available
    global.__analyzer_pipeline = await pipeline('image-to-text', MODEL_DIR, { device: 'cpu' });
    console.log('Analyzer pipeline loaded');
    return global.__analyzer_pipeline;
  } catch (err) {
    console.error('Failed to initialize analyzer pipeline:', err && err.message ? err.message : err);
    return null;
  }
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// POST /analyze - multipart form: field 'image' for file, optional 'prompt'
app.post('/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'image file required' });

  const pipeline = await ensurePipeline();
  if (!pipeline) {
    fs.unlinkSync(req.file.path);
    return res.status(503).json({ error: 'Analyzer not available on server. Place model in server/models or run download script.' });
  }

  try {
    const imageBuffer = fs.readFileSync(req.file.path);
    const prompt = req.body.prompt || 'Detect unnatural regions, defects or areas to correct in this image. Respond ONLY in JSON array form like [{"x":10,"y":20,"w":30,"h":40}, ...].';

    // Call pipeline with binary image. Transformers.js server-side accepts Buffer for image in many cases.
    const out = await pipeline(prompt, { image: imageBuffer, max_new_tokens: 256 });

    res.json({ result: out });
  } catch (err) {
    console.error('Analyze error:', err && err.message ? err.message : err);
    res.status(500).json({ error: String(err) });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NpureStudio analyzer server listening on http://localhost:${PORT}`));
