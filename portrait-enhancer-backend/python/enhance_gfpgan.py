#!/usr/bin/env python3
"""
GFPGAN + Real-ESRGAN portrait enhancer — v4
Pre-processes with calibrated face-aware tone mapping BEFORE GFPGAN
so the model receives a correctly exposed image instead of a blown-out one.

Tone map calibrated against Gemini reference:
  - bg_top L: -116  (ceiling lights crushed with gamma=4.5)
  - face L:    -56  (gamma=1.2, mild)
  - full L:    -73

Usage: python enhance_gfpgan.py --input /tmp/in.jpg --output /tmp/out.jpg
"""

import argparse
import os
import sys
import types as _types

# ── torchvision compatibility shim ────────────────────────────────────────────
def _patch_torchvision():
    try:
        import torchvision.transforms.functional as _F  # noqa: F401
    except ImportError:
        return
    _mod_name = "torchvision.transforms.functional_tensor"
    if _mod_name not in sys.modules:
        _ft = _types.ModuleType(_mod_name)
        for _attr in dir(_F):
            setattr(_ft, _attr, getattr(_F, _attr))
        sys.modules[_mod_name] = _ft

_patch_torchvision()
# ─────────────────────────────────────────────────────────────────────────────

import cv2
import numpy as np

WEIGHTS_DIR  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")
GFPGAN_MODEL = os.path.join(WEIGHTS_DIR, "GFPGANv1.4.pth")


def check_models():
    if not os.path.exists(GFPGAN_MODEL):
        raise FileNotFoundError(
            f"GFPGAN model not found at {GFPGAN_MODEL}\n"
            "Run: python download_models.py"
        )


def _preload_facexlib():
    detection_model = os.path.join(WEIGHTS_DIR, "detection_Resnet50_Final.pth")
    parsing_model   = os.path.join(WEIGHTS_DIR, "parsing_parsenet.pth")

    if not os.path.exists(detection_model) or not os.path.exists(parsing_model):
        print(
            "  [warn] facexlib weights not found — first run will download them.\n"
            "  Run `python download_models.py` to pre-fetch.",
            file=sys.stderr,
        )
        return

    try:
        from facexlib.detection import init_detection_model
        from facexlib.parsing  import init_parsing_model

        print("  -> pre-loading facexlib detection model...", file=sys.stderr)
        init_detection_model("retinaface_resnet50", half=False, device="cpu",
                             model_rootpath=WEIGHTS_DIR)
        print("  -> pre-loading facexlib parsing model...", file=sys.stderr)
        init_parsing_model(model_name="parsenet", device="cpu",
                           model_rootpath=WEIGHTS_DIR)
    except Exception as e:
        print(f"  [warn] facexlib pre-load skipped: {e}", file=sys.stderr)


def recover_highlights(img_f):
    """Tone-compress blown-out regions. threshold=0.70 catches office ceiling lights."""
    hmask = np.all(img_f > 0.70, axis=2).astype(np.float32)
    hmask = cv2.GaussianBlur(hmask, (31, 31), 0)[:, :, np.newaxis]
    compressed = 1.0 - (1.0 - img_f) ** 0.45
    return img_f * (1 - hmask * 0.75) + compressed * (hmask * 0.75)


def face_aware_tone_map(img_f, shape):
    """
    3-zone spatial gamma blending (same calibration as enhance_opencv.py).
    Applied BEFORE GFPGAN so the face restoration model gets a
    properly exposed input instead of a glare-blown webcam frame.
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
    face_c = np.power(img_c, 1.2)
    bg_c   = np.power(img_c, 2.0)
    top_c  = np.power(img_c, 4.5)

    bg_blend = top_weight * top_c + (1 - top_weight) * bg_c
    return face_mask * face_c + (1 - face_mask) * bg_blend


def post_process(img_bgr):
    """Mild sharpening only — NO CLAHE (avoids re-brightening background)."""
    kernel = np.array([[0, -0.3, 0], [-0.3, 2.2, -0.3], [0, -0.3, 0]])
    img = cv2.filter2D(img_bgr, -1, kernel)
    return np.clip(img, 0, 255).astype(np.uint8)


def enhance(input_path, output_path):
    check_models()
    _preload_facexlib()

    from gfpgan import GFPGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    # Set up background upsampler
    realesrgan_model_path = os.path.join(WEIGHTS_DIR, "RealESRGAN_x2plus.pth")
    bg_upsampler = None
    if os.path.exists(realesrgan_model_path):
        model = RRDBNet(
            num_in_ch=3, num_out_ch=3,
            num_feat=64, num_block=23, num_grow_ch=32, scale=2,
        )
        bg_upsampler = RealESRGANer(
            scale=2,
            model_path=realesrgan_model_path,
            model=model,
            tile=400, tile_pad=10, pre_pad=0, half=False,
        )

    restorer = GFPGANer(
        model_path=GFPGAN_MODEL,
        upscale=2,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=bg_upsampler,
    )

    img = cv2.imread(input_path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot read image: {input_path}")

    # ── Pre-process: fix exposure BEFORE GFPGAN ──────────────────────────────
    img_f = img.astype(np.float32) / 255.0
    img_f = recover_highlights(img_f)
    img_f = face_aware_tone_map(img_f, img.shape)
    img = np.clip(img_f * 255, 0, 255).astype(np.uint8)
    # ─────────────────────────────────────────────────────────────────────────

    _, _, output = restorer.enhance(
        img,
        has_aligned=False,
        only_center_face=False,
        paste_back=True,
        weight=0.5,
    )

    output = post_process(output)

    cv2.imwrite(output_path, output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved enhanced image to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",  required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
        enhance(args.input, args.output)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
