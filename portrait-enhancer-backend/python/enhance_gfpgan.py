#!/usr/bin/env python3
"""
GFPGAN + Real-ESRGAN portrait enhancer
Called by Node.js via spawnSync.

Usage: python enhance_gfpgan.py --input /tmp/in.jpg --output /tmp/out.jpg
"""

import argparse
import os
import sys

# ── torchvision compatibility shim ────────────────────────────────────────────
# torchvision >= 0.16 removed `torchvision.transforms.functional_tensor`.
# basicsr / gfpgan still import it, so we stub it out before they load.
import types as _types

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
    """
    Pre-initialise facexlib detection + parsing models from our local
    weights/ folder. Without this, facexlib re-downloads them to its own
    cache on every cold start — causing the timeout to blow.
    """
    detection_model = os.path.join(WEIGHTS_DIR, "detection_Resnet50_Final.pth")
    parsing_model   = os.path.join(WEIGHTS_DIR, "parsing_parsenet.pth")

    if not os.path.exists(detection_model) or not os.path.exists(parsing_model):
        print(
            "  [warn] facexlib weights not found in weights/ — first run will download them.\n"
            "  Run `python download_models.py` to pre-fetch and avoid this delay.",
            file=sys.stderr,
        )
        return

    try:
        from facexlib.detection import init_detection_model
        from facexlib.parsing  import init_parsing_model

        print("  -> pre-loading facexlib detection model...", file=sys.stderr)
        init_detection_model(
            "retinaface_resnet50",
            half=False,
            device="cpu",
            model_rootpath=WEIGHTS_DIR,
        )

        print("  -> pre-loading facexlib parsing model...", file=sys.stderr)
        init_parsing_model(
            model_name="parsenet",
            device="cpu",
            model_rootpath=WEIGHTS_DIR,
        )
    except Exception as e:
        # Non-fatal — GFPGANer will still work, just may take longer
        print(f"  [warn] facexlib pre-load skipped: {e}", file=sys.stderr)


def enhance(input_path, output_path):
    check_models()

    # Pre-load facexlib from local weights to skip runtime downloads
    _preload_facexlib()

    # ── Import GFPGAN (deferred so the shim above runs first) ─────────────
    from gfpgan import GFPGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    # ── Load Real-ESRGAN for background upscaling ───────────────────────────
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
            tile=400,
            tile_pad=10,
            pre_pad=0,
            half=False,
        )

    # ── Load GFPGAN ─────────────────────────────────────────────────────────
    restorer = GFPGANer(
        model_path=GFPGAN_MODEL,
        upscale=2,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=bg_upsampler,
    )

    # ── Read image ──────────────────────────────────────────────────────────
    img = cv2.imread(input_path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot read image: {input_path}")

    # ── Enhance ─────────────────────────────────────────────────────────────
    _, _, output = restorer.enhance(
        img,
        has_aligned=False,
        only_center_face=False,
        paste_back=True,
        weight=0.5,
    )

    # ── Post-process ─────────────────────────────────────────────────────────
    output = post_process(output)

    # ── Save ────────────────────────────────────────────────────────────────
    cv2.imwrite(output_path, output, [cv2.IMWRITE_JPEG_QUALITY, 95])
    print(f"Saved enhanced image to {output_path}", file=sys.stderr)


def post_process(img_bgr):
    """Subtle CLAHE + sharpening on top of GFPGAN output."""
    img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(img)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
    l = clahe.apply(l)
    img = cv2.merge((l, a, b))
    img = cv2.cvtColor(img, cv2.COLOR_LAB2BGR)
    kernel = np.array([[0, -0.5, 0], [-0.5, 3, -0.5], [0, -0.5, 0]])
    img = cv2.filter2D(img, -1, kernel)
    img = np.clip(img, 0, 255).astype(np.uint8)
    return img


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
