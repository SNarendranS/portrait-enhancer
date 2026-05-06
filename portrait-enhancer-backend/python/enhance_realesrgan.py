#!/usr/bin/env python3
"""
Real-ESRGAN x4/x2 upscale + face-aware tone mapping — v4

Changes from v3:
  - Same calibrated 3-zone tone map as GFPGAN/OpenCV (bg_top gamma=4.5)
  - Applied BEFORE upscaling so ESRGAN upscales a correctly-exposed frame
  - CLAHE clip reduced to 1.2 (was 2.0) to avoid re-brightening bg
  - Saturation boost increased to 1.8x to compensate for darkening
"""
import argparse, os, sys

# ── torchvision ≥0.16 shim ───────────────────────────────────────────────────
import types, importlib
try:
    import torchvision.transforms.functional_tensor  # noqa
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
        pass
# ─────────────────────────────────────────────────────────────────────────────

import cv2, numpy as np
from PIL import Image, ImageEnhance

WEIGHTS = os.path.join(os.path.dirname(__file__), "weights")


def recover_highlights(img_f):
    """Tone-compress blown-out regions. threshold=0.70 catches office ceiling lights."""
    hmask = np.all(img_f > 0.70, axis=2).astype(np.float32)
    hmask = cv2.GaussianBlur(hmask, (31, 31), 0)[:, :, np.newaxis]
    compressed = 1.0 - (1.0 - img_f) ** 0.45
    return img_f * (1 - hmask * 0.75) + compressed * (hmask * 0.75)


def face_aware_tone_map(img_f, shape):
    """
    3-zone spatial gamma blending — calibrated against Gemini reference output.
    bg_top L ≈ 69, face_L ≈ 109 after processing raw office webcam shot.
    """
    h, w = shape[:2]

    cx, cy = w / 2, h * 0.45
    Y, X = np.mgrid[0:h, 0:w]
    dist = np.sqrt(((X - cx) / (w * 0.28)) ** 2 + ((Y - cy) / (h * 0.35)) ** 2)
    face_mask = cv2.GaussianBlur(
        np.clip(1.0 - dist, 0, 1).astype(np.float32), (61, 61), 0
    )[:, :, np.newaxis]

    top_weight = np.zeros((h, w), np.float32)
    top_weight[: int(h * 0.4), :] = 1.0
    top_weight = cv2.GaussianBlur(top_weight, (61, 61), 0)[:, :, np.newaxis]

    img_c = np.clip(img_f, 1e-6, 1.0)
    face_c = np.power(img_c, 1.2)   # mild darkening for face
    bg_c   = np.power(img_c, 2.0)   # moderate for mid-background
    top_c  = np.power(img_c, 4.5)   # aggressive for ceiling/lights

    bg_blend = top_weight * top_c + (1 - top_weight) * bg_c
    return face_mask * face_c + (1 - face_mask) * bg_blend


def apply_clahe(img, clip=1.2):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def correct_skin_tone(img):
    img_f = img.astype(np.float32)
    img_f[:, :, 2] = np.clip(img_f[:, :, 2] * 0.93, 0, 255)
    img_f[:, :, 0] = np.clip(img_f[:, :, 0] * 1.05, 0, 255)
    return img_f.astype(np.uint8)


def enhance(inp, out):
    model_path = os.path.join(WEIGHTS, "RealESRGAN_x4plus.pth")
    if not os.path.exists(model_path):
        model_path = os.path.join(WEIGHTS, "RealESRGAN_x2plus.pth")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"No Real-ESRGAN model found in {WEIGHTS}\nRun: npm run setup:models"
        )

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
    if img is None:
        raise ValueError(f"Cannot read: {inp}")

    # ── Pre-process: tone map BEFORE upscaling ───────────────────────────────
    img_f = img.astype(np.float32) / 255.0
    img_f = recover_highlights(img_f)
    img_f = face_aware_tone_map(img_f, img.shape)
    img = np.clip(img_f * 255, 0, 255).astype(np.uint8)
    # ─────────────────────────────────────────────────────────────────────────

    # Upscale
    output, _ = upsampler.enhance(img, outscale=2)

    # Post-process
    output = apply_clahe(output, clip=1.2)       # mild — don't re-brighten bg
    output = correct_skin_tone(output)

    pil = Image.fromarray(cv2.cvtColor(output, cv2.COLOR_BGR2RGB))
    pil = ImageEnhance.Color(pil).enhance(1.8)   # boost sat to compensate darkening
    pil = ImageEnhance.Sharpness(pil).enhance(1.3)
    output = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    cv2.imwrite(out, output, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print(f"Saved: {out}", file=sys.stderr)


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
