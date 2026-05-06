#!/usr/bin/env python3
"""
Real-ESRGAN x4/x2 upscale + face-aware tone mapping — v5

Root-cause fix for neon yellow/orange artifacts in v4:
  ALL luminance changes in LAB L-channel only (cv2 LAB: L is 0-255).
  v4 used BGR power() curves which rotated hue → neon yellow/green lights.
"""
import argparse, os, sys, types

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tone_utils import recover_highlights_L, face_aware_tone_map_L

import cv2, numpy as np
from PIL import Image, ImageEnhance

WEIGHTS = os.path.join(os.path.dirname(__file__), "weights")


def apply_clahe_L(bgr_u8, clip=1.0):
    lab = cv2.cvtColor(bgr_u8, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def enhance(inp, out):
    model_path = os.path.join(WEIGHTS, "RealESRGAN_x4plus.pth")
    if not os.path.exists(model_path):
        model_path = os.path.join(WEIGHTS, "RealESRGAN_x2plus.pth")
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"No Real-ESRGAN model found in {WEIGHTS}\nRun: npm run setup:models")

    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    scale = 4 if "x4" in model_path else 2
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=scale)
    upsampler = RealESRGANer(scale=scale, model_path=model_path, model=model,
                              tile=512, tile_pad=10, pre_pad=0, half=False)

    img = cv2.imread(inp, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot read: {inp}")

    # ── Pre-process: ALL darkening in LAB L-channel only ─────────────────────
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[:, :, 0]  # 0-255 range
    L = recover_highlights_L(L)
    L = face_aware_tone_map_L(L, img.shape)
    lab[:, :, 0] = np.clip(L, 0, 255)
    img = cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR)
    # ─────────────────────────────────────────────────────────────────────────

    output, _ = upsampler.enhance(img, outscale=2)

    output = apply_clahe_L(output, clip=1.0)

    pil = Image.fromarray(cv2.cvtColor(output, cv2.COLOR_BGR2RGB))
    pil = ImageEnhance.Color(pil).enhance(1.25)      # gentle boost (was 1.8x)
    pil = ImageEnhance.Sharpness(pil).enhance(1.2)
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
