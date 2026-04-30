#!/usr/bin/env python3
"""
Real-ESRGAN x4 upscale + OpenCV post-process for overall image quality.
No face detection — runs faster than GFPGAN, better background/texture.
"""
import argparse, os, sys

# ── torchvision ≥0.16 removed functional_tensor; patch it back so older
#    realesrgan/basicsr builds that import it directly don't crash. ──────
import types, importlib
try:
    import torchvision.transforms.functional_tensor  # noqa: already present
except ModuleNotFoundError:
    try:
        import torchvision.transforms.functional as _f
        _shim = types.ModuleType("torchvision.transforms.functional_tensor")
        for _attr in dir(_f):
            setattr(_shim, _attr, getattr(_f, _attr))
        import torchvision.transforms as _t
        _t.functional_tensor = _shim
        sys.modules["torchvision.transforms.functional_tensor"] = _shim
    except Exception:
        pass  # best-effort; real import errors will surface later

import cv2, numpy as np
from PIL import Image, ImageEnhance

WEIGHTS = os.path.join(os.path.dirname(__file__), "weights")

def enhance(inp, out):
    model_path = os.path.join(WEIGHTS, "RealESRGAN_x4plus.pth")
    if not os.path.exists(model_path):
        # Fall back to x2 model if x4 not available
        model_path = os.path.join(WEIGHTS, "RealESRGAN_x2plus.pth")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"No Real-ESRGAN model found in {WEIGHTS}\nRun: npm run setup:models")

    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    scale = 4 if "x4" in model_path else 2
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64,
                    num_block=23, num_grow_ch=32, scale=scale)
    upsampler = RealESRGANer(
        scale=scale, model_path=model_path, model=model,
        tile=512, tile_pad=10, pre_pad=0, half=False,
    )

    img = cv2.imread(inp, cv2.IMREAD_COLOR)
    if img is None: raise ValueError(f"Cannot read: {inp}")

    # Upscale
    output, _ = upsampler.enhance(img, outscale=2)  # outscale=2 keeps reasonable file size

    # Post-process: exposure + skin tone + sharpness
    output = recover_highlights(output)
    output = apply_clahe(output, clip=2.0)
    output = correct_skin_tone(output)

    pil = Image.fromarray(cv2.cvtColor(output, cv2.COLOR_BGR2RGB))
    pil = ImageEnhance.Sharpness(pil).enhance(1.3)
    pil = ImageEnhance.Color(pil).enhance(1.1)
    output = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    cv2.imwrite(out, output, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print(f"Saved: {out}", file=sys.stderr)


def recover_highlights(img):
    img_f = img.astype(np.float32) / 255.0
    highlight_mask = np.all(img_f > 0.85, axis=2).astype(np.float32)
    highlight_mask = cv2.GaussianBlur(highlight_mask, (21, 21), 0)[:, :, np.newaxis]
    compressed = 1.0 - (1.0 - img_f) ** 0.7
    img_f = img_f * (1 - highlight_mask * 0.4) + compressed * (highlight_mask * 0.4)
    return np.clip(img_f * 255, 0, 255).astype(np.uint8)


def apply_clahe(img, clip=2.0):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def correct_skin_tone(img):
    img_f = img.astype(np.float32)
    img_f[:, :, 2] = np.clip(img_f[:, :, 2] * 0.96, 0, 255)
    img_f[:, :, 0] = np.clip(img_f[:, :, 0] * 1.03, 0, 255)
    return img_f.astype(np.uint8)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--input",  required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    try:
        enhance(args.input, args.output)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
