# portrait-enhancer-backend

Node.js + Express API with a Python sub-layer for local AI enhancement.

## Structure

```
portrait-enhancer-backend/
├── src/
│   ├── index.js              ← Express entry point
│   ├── routes/enhance.js     ← POST /api/enhance
│   ├── middleware/error.js
│   └── services/
│       ├── pipeline.js       ← tries each service in order
│       ├── gemini.js         ← Gemini 2.0 Flash (free tier)
│       ├── stability.js      ← Stability AI
│       ├── cloudinary.js     ← Cloudinary AI
│       ├── gfpgan.js         ← calls python/enhance_gfpgan.py
│       └── opencv.js         ← calls python/enhance_opencv.py
└── python/
    ├── enhance_gfpgan.py     ← GFPGAN + Real-ESRGAN (local AI)
    ├── enhance_opencv.py     ← OpenCV fallback (always works)
    ├── download_models.py    ← one-time model downloader
    └── requirements.txt
```

## Quick start

```bash
cp .env.example .env          # fill in API keys (all optional)
npm install
npm run setup:python          # install Python deps
npm run setup:models          # download GFPGAN weights (~340 MB, once)
npm run dev                   # starts on http://localhost:4000
```

## Pipeline order

Gemini → Stability AI → Cloudinary → GFPGAN (local) → OpenCV (local)

The first service that succeeds wins. The last two always work offline.

## GFPGAN fix

`basicsr` imports `torchvision.transforms.functional_tensor` which was removed
in torchvision ≥ 0.16. `enhance_gfpgan.py` patches this at runtime with a shim
before importing gfpgan/basicsr. `requirements.txt` also pins a compatible range.
